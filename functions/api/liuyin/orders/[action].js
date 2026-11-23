/* ============================================================
 * POST /api/liuyin/orders/:action
 *   claim / confirm / pick / deliver / complete / cancel / return
 *
 * 状态机：pending → claimed → confirmed → picked → delivered → done
 *         异常分支 cancelled / returned（return 表示「接单超时回池」，回到 pending）
 *
 * 并发/幂等保证：
 *   - 每次跃迁都用「UPDATE ... WHERE id=? AND status=<前置状态>」做原子守卫，
 *     看 meta.changes 判定是否真的改动，没改动就是被别人抢先/状态不对 → 409
 *   - 双确认用 ly_confirmations(order_id,user_id) 主键的 INSERT OR IGNORE 去重
 *   - 人情点 ly_ledger.order_id UNIQUE + INSERT OR IGNORE，一单只记一笔
 * ============================================================ */
import {
  handle, json, ApiError, nowIso, getOrderById, orderJson, isParticipant,
  statusText, changesOf, optStr,
} from "../_lib.js";
import { cleanKey } from "./index.js";

export async function onRequestPost(context) {
  const action = String((context.params && context.params.action) || "");
  return handle(context, { auth: "required" }, async (ctx) => {
    const fn = ACTIONS[action];
    if (!fn) throw new ApiError(404, "接口不存在");
    return fn(ctx);
  });
}

const ACTIONS = { claim, confirm, pick, deliver, complete, cancel, return: returnAction };

/* ---------------- 公共 ---------------- */
async function requireOrder(env, body) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) throw new ApiError(400, "缺少订单 id");
  const row = await getOrderById(env.DB, id);
  if (!row) throw new ApiError(404, "订单不存在");
  return row;
}

async function respond(db, id, extra) {
  const row = await getOrderById(db, id);
  if (!row) throw new ApiError(404, "订单不存在");
  return json({ ok: true, data: Object.assign({ order: orderJson(row) }, extra || {}) });
}

function conflict(row) {
  return new ApiError(409, "这张单现在是「" + statusText(row.status) + "」，不能这么操作");
}

async function moveTo(env, id, fromStatuses, toStatus, sets, extraParams) {
  const now = nowIso();
  const sql =
    "UPDATE ly_orders SET status = ?, updated_at = ?" +
    (sets ? ", " + sets : "") +
    " WHERE id = ? AND status IN (" + fromStatuses.map(() => "?").join(", ") + ")";
  const res = await env.DB.prepare(sql)
    .bind(toStatus, now, ...(extraParams || []), id, ...fromStatuses)
    .run();
  return changesOf(res) > 0;
}

/* ---------------- pending → claimed ---------------- */
async function claim({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (order.creator_id === user.id) throw new ApiError(403, "不能接自己发的单");
  if (order.status === "claimed" && order.claimer_id === user.id) {
    return respond(env.DB, order.id); // 重复点，幂等返回
  }
  if (order.status !== "pending") throw conflict(order);

  const okMove = await moveTo(env, order.id, ["pending"], "claimed", "claimer_id = ?", [user.id]);
  if (!okMove) {
    const cur = await getOrderById(env.DB, order.id);
    if (cur && cur.claimer_id === user.id && cur.status === "claimed") return respond(env.DB, order.id);
    throw new ApiError(409, "这张单已经被别人接走了");
  }
  return respond(env.DB, order.id);
}

/* ---------------- claimed → confirmed（双方各一次） ---------------- */
async function confirm({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单");
  if (!order.claimer_id) throw new ApiError(409, "还没有人接单，先等等");
  if (order.status !== "claimed" && order.status !== "confirmed") throw conflict(order);

  await env.DB.prepare(
    "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
  )
    .bind(order.id, user.id, nowIso())
    .run();

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ly_confirmations WHERE order_id = ?"
  )
    .bind(order.id)
    .first();
  const count = Number((countRow && countRow.n) || 0);

  if (count >= 2 && order.status === "claimed") {
    await moveTo(env, order.id, ["claimed"], "confirmed");
  }
  return respond(env.DB, order.id, { confirmed: count });
}

/* ---------------- confirmed → picked ---------------- */
async function pick({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单");
  if (order.claimer_id !== user.id) throw new ApiError(403, "只有接单的人才能去取件");
  if (order.status !== "confirmed") throw conflict(order);
  if (!(await moveTo(env, order.id, ["confirmed"], "picked"))) throw conflict(order);
  return respond(env.DB, order.id);
}

/* ---------------- picked → delivered ---------------- */
async function deliver({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (order.claimer_id !== user.id) throw new ApiError(403, "只有接单的人才能点送达");
  if (order.status !== "picked") throw conflict(order);
  const proofKey = cleanKey(optStr(body, "proof_key", 120, "送达照片"));
  const okMove = proofKey
    ? await moveTo(env, order.id, ["picked"], "delivered", "proof_key = ?", [proofKey])
    : await moveTo(env, order.id, ["picked"], "delivered");
  if (!okMove) throw conflict(order);
  return respond(env.DB, order.id);
}

/* ---------------- delivered → done（写人情点，幂等） ---------------- */
async function complete({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单");
  if (order.status !== "delivered") throw conflict(order);
  if (!order.claimer_id) throw new ApiError(409, "这张单没有接单人，不能完成");

  if (!(await moveTo(env, order.id, ["delivered"], "done"))) throw conflict(order);

  /* order_id 唯一 + INSERT OR IGNORE：无论重复调用几次都只有一笔 */
  await env.DB.prepare(
    "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, 1, ?, ?)"
  )
    .bind(order.id, order.creator_id, order.claimer_id, "「" + order.title + "」的人情", nowIso())
    .run();

  const ledger = await env.DB.prepare("SELECT * FROM ly_ledger WHERE order_id = ?")
    .bind(order.id)
    .first();
  return respond(env.DB, order.id, {
    ledger: ledger
      ? {
          id: ledger.id,
          order_id: ledger.order_id,
          from_id: ledger.from_id,
          to_id: ledger.to_id,
          delta: Number(ledger.delta) || 1,
          note: ledger.note || "",
          created_at: ledger.created_at,
        }
      : null,
  });
}

/* ---------------- pending/claimed → cancelled ---------------- */
async function cancel({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单");
  if (order.status !== "pending" && order.status !== "claimed") throw conflict(order);
  if (!(await moveTo(env, order.id, ["pending", "claimed"], "cancelled"))) throw conflict(order);
  await clearConfirmations(env, order.id);
  return respond(env.DB, order.id);
}

/* ---------------- claimed/confirmed → pending（超时回池） ---------------- */
async function returnAction({ env, user, body }) {
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单");
  if (order.status !== "claimed" && order.status !== "confirmed") throw conflict(order);
  const okMove = await moveTo(
    env, order.id, ["claimed", "confirmed"], "pending", "claimer_id = NULL"
  );
  if (!okMove) throw conflict(order);
  await clearConfirmations(env, order.id);
  return respond(env.DB, order.id, { returned: true });
}

async function clearConfirmations(env, orderId) {
  await env.DB.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(orderId).run();
}

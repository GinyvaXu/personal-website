/* ============================================================
 * POST /api/liuyin/orders/:action
 *   claim / confirm / extend / release / cancel / step / deliver / complete
 *
 * 状态机：
 *   pending ──claim──> claimed ──双方 confirm──> connected ──helper 步骤全完成/送达──> delivered
 *     │                  │  │                          │
 *     │cancel            │  │10 分钟内未双确认 → released（回池）
 *     │                  └cancel → released（回池）
 *     │
 *   connected ──creator cancel──> cancelled（不回池）
 *   delivered ──creator complete / 24h ──> done + ly_ledger（order_id 唯一，幂等）
 *   released 与 pending 一样可被接单（「回到楼里，还在等人接」）
 *
 * 并发/幂等保证：每次跃迁都用「UPDATE ... WHERE id=? AND status=<前置状态>」做原子守卫，
 * 看 meta.changes 判定是否真的改动；双确认用 (order_id,user_id) 主键 INSERT OR IGNORE；
 * 步骤读改写用 steps 原文做乐观锁。
 * ============================================================ */
import {
  handle, json, ApiError, nowIso, getOrderById, orderJson, isParticipant,
  statusText, changesOf, optStr, reqStr, cleanKey, parseSteps, nextStepIndex,
  helperStepsDone, confirmationState, systemMessage,
} from "../_lib.js";
import { bumpMissed, finishOrder, settle } from "../_lifecycle.js";
import { maybeRun } from "../_robot.js";

export async function onRequestPost(context) {
  const action = String((context.params && context.params.action) || "");
  return handle(context, { auth: "required" }, async (ctx) => {
    const fn = ACTIONS[action];
    if (!fn) throw new ApiError(404, "接口不存在");
    const extra = (await fn(ctx)) || {};
    const id = extra.__id || String(ctx.body.id || "").trim();

    /* 动作之后跑一轮机器人（节流在 _robot 内部） */
    try {
      await maybeRun(ctx.env);
    } catch (e) {
      console.error("[orders] robot", (e && e.stack) || e);
    }

    const fresh = await getOrderById(ctx.env.DB, id);
    if (!fresh) throw new ApiError(404, "订单不存在");
    const data = Object.assign({ order: orderJson(fresh, ctx.user) }, extra);
    delete data.__id;
    return json({ ok: true, data });
  });
}

const ACTIONS = {
  claim,
  confirm,
  extend,
  release,
  cancel,
  step,
  deliver,
  complete,
};

/* ---------------- 公共 ---------------- */
async function requireOrder(env, body) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) throw new ApiError(400, "缺少订单 id");
  const row = await getOrderById(env.DB, id);
  if (!row) throw new ApiError(404, "订单不存在");
  return row;
}

function conflict(row) {
  return new ApiError(409, "这张单现在是「" + statusText(row.status) + "」，不能这么操作");
}

function notParticipant() {
  return new ApiError(403, "这不是你的单");
}

/* ---------------- pending / released → claimed ---------------- */
async function claim({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (order.creator_id === user.id) throw new ApiError(403, "不能接自己发的单");
  if (order.claimer_id === user.id && order.status === "claimed") {
    return { __id: order.id }; // 重复点，幂等返回
  }
  if (order.status === "claimed" && order.claimer_id) {
    throw new ApiError(409, "这张单已经被别人接走了");
  }
  if (["pending", "released"].indexOf(order.status) < 0) throw conflict(order);

  const now = nowIso();
  const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const upd = await db
    .prepare(
      "UPDATE ly_orders SET status = 'claimed', claimer_id = ?, conn_deadline = ?, conn_extended = 0, " +
        "released_reason = NULL, updated_at = ? " +
        "WHERE id = ? AND status IN ('pending', 'released') AND claimer_id IS NULL AND creator_id <> ?"
    )
    .bind(user.id, deadline, now, order.id, user.id)
    .run();
  if (changesOf(upd) < 1) {
    const cur = await getOrderById(db, order.id);
    if (cur && cur.claimer_id === user.id && cur.status === "claimed") return { __id: order.id };
    throw new ApiError(409, "这张单已经被别人接走了");
  }
  return { __id: order.id };
}

/* ---------------- claimed → connected（双方各一次） ---------------- */
async function confirm({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  if (!order.claimer_id) throw new ApiError(409, "还没有人接单，先等等");
  if (["claimed", "connected"].indexOf(order.status) < 0) throw conflict(order);

  const now = nowIso();
  await db
    .prepare("INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)")
    .bind(order.id, user.id, now)
    .run();

  if (order.status === "claimed") {
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM ly_confirmations WHERE order_id = ?")
      .bind(order.id)
      .first();
    if (Number((countRow && countRow.n) || 0) >= 2) {
      await db
        .prepare("UPDATE ly_orders SET status = 'connected', conn_deadline = NULL, updated_at = ? WHERE id = ? AND status = 'claimed'")
        .bind(now, order.id)
        .run();
    }
  }

  const otherId = order.creator_id === user.id ? order.claimer_id : order.creator_id;
  const confirm = await confirmationState(db, order.id, user.id, otherId);
  return { __id: order.id, confirmed: Math.min(2, confirm.count) };
}

/* ---------------- 延长 10 分钟（一次） ---------------- */
async function extend({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  if (order.status !== "claimed") throw conflict(order);
  if (Number(order.conn_extended) === 1) throw new ApiError(409, "已经延长过一次了");
  const deadlineMs = order.conn_deadline ? Date.parse(order.conn_deadline) : 0;
  if (!deadlineMs || deadlineMs < Date.now()) throw new ApiError(409, "已经超时了，不能再延长");

  const nextDeadline = new Date(deadlineMs + 10 * 60 * 1000).toISOString();
  const now = nowIso();
  const upd = await db
    .prepare(
      "UPDATE ly_orders SET conn_deadline = ?, conn_extended = 1, updated_at = ? " +
        "WHERE id = ? AND status = 'claimed' AND conn_extended = 0"
    )
    .bind(nextDeadline, now, order.id)
    .run();
  if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");
  return { __id: order.id, conn_deadline: nextDeadline };
}

/* ---------------- claimed → released（联系不上 / 回池） ---------------- */
async function release({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  if (order.status === "connected") {
    throw new ApiError(409, "已经建联了，如需结束请直接取消这单");
  }
  if (order.status !== "claimed") throw conflict(order);

  const deadlineMs = order.conn_deadline ? Date.parse(order.conn_deadline) : 0;
  if (!deadlineMs || deadlineMs > Date.now()) {
    throw new ApiError(409, "还没到 10 分钟窗口，先联系一下对方吧");
  }

  const now = nowIso();
  const upd = await db
    .prepare(
      "UPDATE ly_orders SET status = 'released', claimer_id = NULL, conn_extended = 0, " +
        "released_reason = 'unreachable', updated_at = ? WHERE id = ? AND status = 'claimed'"
    )
    .bind(now, order.id)
    .run();
  if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");

  await db.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(order.id).run();
  const otherId = order.creator_id === user.id ? order.claimer_id : order.creator_id;
  if (otherId) await bumpMissed(env, otherId, "被对方标记为联系不上");
  await systemMessage(db, order.id, "联系不上对方，这单释放回池了，没有记人情点。");
  return { __id: order.id, released: true, back_to_pool: true };
}

/* ---------------- 取消 / 撤回 ---------------- */
async function cancel({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  const isCreator = order.creator_id === user.id;
  const now = nowIso();

  if (["pending", "released"].indexOf(order.status) >= 0) {
    if (!isCreator) throw new ApiError(403, "只有发单的人能撤回");
    const upd = await db
      .prepare(
        "UPDATE ly_orders SET status = 'cancelled', released_reason = 'creator_cancel', updated_at = ? " +
          "WHERE id = ? AND status IN ('pending', 'released')"
      )
      .bind(now, order.id)
      .run();
    if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");
    await db.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(order.id).run();
    await systemMessage(db, order.id, "这单已取消，没有记人情点。");
    return { __id: order.id, cancelled: true };
  }

  if (order.status === "claimed") {
    const upd = await db
      .prepare(
        "UPDATE ly_orders SET status = 'released', claimer_id = NULL, conn_extended = 0, " +
          "released_reason = 'cancel', updated_at = ? WHERE id = ? AND status = 'claimed'"
      )
      .bind(now, order.id)
      .run();
    if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");
    await db.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(order.id).run();
    await systemMessage(db, order.id, "这单取消回池了，没有记人情点。");
    return { __id: order.id, released: true, back_to_pool: true };
  }

  if (order.status === "connected") {
    if (!isCreator) throw new ApiError(403, "已经建联了，只有发单的人能取消这单");
    const upd = await db
      .prepare(
        "UPDATE ly_orders SET status = 'cancelled', released_reason = 'creator_cancel', updated_at = ? " +
          "WHERE id = ? AND status = 'connected'"
      )
      .bind(now, order.id)
      .run();
    if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");
    await systemMessage(db, order.id, "这单已取消，没有记人情点。");
    return { __id: order.id, cancelled: true };
  }

  throw conflict(order);
}

/* ---------------- 推进步骤（provider 必填文本；helper 全完成自动送达） ---------------- */
async function step({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  if (order.status !== "connected") throw conflict(order);

  const stepId = String((body.step_id || "").trim());
  if (!stepId) throw new ApiError(400, "缺少步骤 id");

  const steps = parseSteps(order.steps);
  const index = steps.findIndex((s) => s.id === stepId);
  if (index < 0) throw new ApiError(404, "没有这一步");
  const target = steps[index];

  if (target.type === "confirm") throw new ApiError(409, "确认收到请点「确认收货」");
  if (target.status === "done") return { __id: order.id }; // 幂等

  const isCreator = order.creator_id === user.id;
  const myRole = isCreator ? "requester" : "helper";
  if (target.owner !== myRole) throw new ApiError(403, "这一步不是你来完成");
  if (steps.slice(0, index).some((s) => s.status !== "done")) {
    throw new ApiError(409, "先完成前面的步骤");
  }

  let code = String(order.code || "");
  if (target.type === "provide_code") {
    const text = reqStr(body, "text", 40, "取件码 / 订单号");
    target.text_value = text;
    code = text;
  }
  const photoKey = cleanKey(optStr(body, "photo_key", 120, "照片"));
  if (photoKey) target.photo_key = photoKey;

  target.status = "done";
  target.completed_at = Date.now();
  const nextIndex = nextStepIndex(steps);
  const delivered = helperStepsDone(steps);
  const now = nowIso();

  const upd = await db
    .prepare(
      "UPDATE ly_orders SET steps = ?, current_step = ?, code = ?, status = ?, " +
        "delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END, updated_at = ? " +
        "WHERE id = ? AND status = 'connected' AND steps = ?"
    )
    .bind(
      JSON.stringify(steps),
      nextIndex,
      code,
      delivered ? "delivered" : "connected",
      delivered ? "delivered" : "connected",
      now,
      now,
      order.id,
      order.steps
    )
    .run();
  if (changesOf(upd) < 1) throw new ApiError(409, "有人刚改过这单，刷新一下再试");

  if (delivered) {
    await systemMessage(db, order.id, "已送达，等发单的人确认收到。");
  }
  return { __id: order.id, delivered };
}

/* ---------------- 送达（保留给无步骤的异常单） ---------------- */
async function deliver({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (order.claimer_id !== user.id) throw new ApiError(403, "只有接单的人才能点送达");
  if (order.status !== "connected") throw conflict(order);

  const steps = parseSteps(order.steps);
  if (steps.length && !helperStepsDone(steps)) throw new ApiError(409, "还有步骤没完成");

  const proofKey = cleanKey(optStr(body, "proof_key", 120, "送达照片"));
  const now = nowIso();
  const upd = proofKey
    ? await db
        .prepare(
          "UPDATE ly_orders SET status = 'delivered', delivered_at = ?, updated_at = ?, proof_key = ? " +
            "WHERE id = ? AND status = 'connected'"
        )
        .bind(now, now, proofKey, order.id)
        .run()
    : await db
        .prepare(
          "UPDATE ly_orders SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ? AND status = 'connected'"
        )
        .bind(now, now, order.id)
        .run();
  if (changesOf(upd) < 1) throw new ApiError(409, "这单状态刚变了，刷新一下再试");
  return { __id: order.id };
}

/* ---------------- delivered → done（仅发单方；写人情账，幂等） ---------------- */
async function complete({ env, user, body }) {
  const db = env.DB;
  const order = await requireOrder(env, body);
  if (!isParticipant(order, user.id)) throw notParticipant();
  if (order.creator_id !== user.id) throw new ApiError(403, "只有发单的人能确认收货");
  if (order.status !== "delivered") throw conflict(order);
  if (!order.claimer_id) throw new ApiError(409, "这张单没有接单人，不能完成");

  const finished = await finishOrder(env, order);
  if (!finished) {
    const cur = await getOrderById(db, order.id);
    throw new ApiError(409, "这张单现在是「" + statusText(cur ? cur.status : "") + "」，不能这么操作");
  }
  return {
    __id: order.id,
    reward: { points: finished.delta, positive: false },
    ledger: finished.ledger,
  };
}

/* ============================================================
 * GET /api/liuyin/orders/get?id=o_xxx   (需 token)
 *   → { order, messages, confirm:{mine,other,count}, server_time }
 * 非当事人也能看到订单本身（邻里弱隐私），但看不到对话；
 * 待接池对非双方脱敏 code / 真名 / 取件码文本。
 * ============================================================ */
import {
  handle, ok, ApiError, nowIso, getOrderById, orderJson, isParticipant,
  confirmationState, messageJson,
} from "../_lib.js";
import { settle } from "../_lifecycle.js";
import { maybeRun } from "../_robot.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, url, user }) => {
    const db = env.DB;
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) throw new ApiError(400, "缺少订单 id");

    try {
      await settle(env);
    } catch (e) {
      console.error("[order/get] settle", (e && e.stack) || e);
    }
    try {
      await maybeRun(env);
    } catch (e) {
      console.error("[order/get] robot", (e && e.stack) || e);
    }

    const row = await getOrderById(db, id);
    if (!row) throw new ApiError(404, "订单不存在");

    const participant = isParticipant(row, user.id);
    const otherId = row.creator_id === user.id ? row.claimer_id : row.creator_id;
    const confirm = await confirmationState(db, id, user.id, otherId);

    let messages = [];
    if (participant) {
      const res = await db
        .prepare(
          "SELECT m.id, m.order_id, m.from_id, m.body, m.created_at, u.name AS from_name, u.nickname AS from_nickname " +
            "FROM ly_messages m LEFT JOIN ly_users u ON u.id = m.from_id " +
            "WHERE m.order_id = ? ORDER BY m.id ASC LIMIT 200"
        )
        .bind(id)
        .all();
      messages = ((res && res.results) || []).map(messageJson);
    }

    return ok({
      order: orderJson(row, user),
      messages,
      confirm,
      server_time: nowIso(),
    });
  });
}

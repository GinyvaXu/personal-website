/* ============================================================
 * GET /api/liuyin/orders/get?id=o_xxx   (需 token)
 *   → { order, messages: [] }
 * 非当事人也能看到订单本身（邻里弱隐私），但看不到对话。
 * ============================================================ */
import { handle, ok, ApiError, getOrderById, orderJson, isParticipant } from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, url, user }) => {
    const id = (url.searchParams.get("id") || "").trim();
    if (!id) throw new ApiError(400, "缺少订单 id");
    const row = await getOrderById(env.DB, id);
    if (!row) throw new ApiError(404, "订单不存在");

    const messages = [];
    if (isParticipant(row, user.id)) {
      const res = await env.DB.prepare(
        "SELECT m.id, m.order_id, m.from_id, m.body, m.created_at, u.name AS from_name " +
          "FROM ly_messages m LEFT JOIN ly_users u ON u.id = m.from_id " +
          "WHERE m.order_id = ? ORDER BY m.id ASC LIMIT 200"
      )
        .bind(id)
        .all();
      for (const m of (res && res.results) || []) {
        messages.push({
          id: m.id,
          order_id: m.order_id,
          from_id: m.from_id,
          from_name: m.from_name || "邻居",
          body: m.body,
          created_at: m.created_at,
        });
      }
    }

    return ok({ order: orderJson(row), messages });
  });
}

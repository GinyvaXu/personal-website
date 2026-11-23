/* ============================================================
 * POST /api/liuyin/messages/send   { order_id, body(≤100) }
 * GET  /api/liuyin/messages?order_id=&since=<id>   → { messages: [] }
 * 只有订单双方能收发。
 * ============================================================ */
import {
  handle, json, ok, ApiError, reqStr, nowIso, getOrderById, isParticipant,
} from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    if (!orderId) throw new ApiError(400, "缺少订单 id");
    const text = reqStr(body, "body", 100, "消息");

    const order = await getOrderById(env.DB, orderId);
    if (!order) throw new ApiError(404, "订单不存在");
    if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单，不能发消息");
    if (order.status === "cancelled") throw new ApiError(409, "这张单已取消，不能再发消息");

    const now = nowIso();
    const res = await env.DB.prepare(
      "INSERT INTO ly_messages (order_id, from_id, body, created_at) VALUES (?, ?, ?, ?)"
    )
      .bind(orderId, user.id, text, now)
      .run();

    let id = res && res.meta && res.meta.last_row_id;
    if (!id) {
      const last = await env.DB.prepare("SELECT MAX(id) AS id FROM ly_messages").first();
      id = last && last.id;
    }
    return json({
      ok: true,
      data: {
        message: {
          id,
          order_id: orderId,
          from_id: user.id,
          from_name: user.name,
          body: text,
          created_at: now,
        },
      },
    });
  });
}

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, url, user }) => {
    const orderId = (url.searchParams.get("order_id") || "").trim();
    if (!orderId) throw new ApiError(400, "缺少订单 id");
    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;

    const order = await getOrderById(env.DB, orderId);
    if (!order) throw new ApiError(404, "订单不存在");
    if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单，看不到对话");

    const res = await env.DB.prepare(
      "SELECT m.id, m.order_id, m.from_id, m.body, m.created_at, u.name AS from_name " +
        "FROM ly_messages m LEFT JOIN ly_users u ON u.id = m.from_id " +
        "WHERE m.order_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200"
    )
      .bind(orderId, since)
      .all();

    const messages = ((res && res.results) || []).map((m) => ({
      id: m.id,
      order_id: m.order_id,
      from_id: m.from_id,
      from_name: m.from_name || "邻居",
      body: m.body,
      created_at: m.created_at,
    }));
    return ok({ messages });
  });
}

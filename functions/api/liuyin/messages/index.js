/* ============================================================
 * GET  /api/liuyin/messages?order_id=&since=<id>   → { messages: [] }
 * POST /api/liuyin/messages/send  { order_id, body(≤100) } → { message }
 * 只有订单双方能收发；临时会话仅在 claimed / connected / delivered 时开启。
 * ============================================================ */
import {
  handle, json, ok, ApiError, reqStr, nowIso, getOrderById, isParticipant,
  insertMessage, messageJson,
} from "../_lib.js";

const CHAT_STATUSES = ["claimed", "connected", "delivered"];

export async function onRequestPost(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
    if (!orderId) throw new ApiError(400, "缺少订单 id");
    const text = reqStr(body, "body", 100, "消息");

    const order = await getOrderById(env.DB, orderId);
    if (!order) throw new ApiError(404, "订单不存在");
    if (!isParticipant(order, user.id)) throw new ApiError(403, "这不是你的单，不能发消息");
    if (CHAT_STATUSES.indexOf(order.status) < 0) {
      throw new ApiError(409, order.status === "pending" ? "还没人接单，先等等" : "这单已经结束，会话关闭了");
    }

    const now = nowIso();
    const saved = await insertMessage(env.DB, orderId, user.id, text, now);
    return json({
      ok: true,
      data: {
        message: {
          id: saved.id,
          order_id: orderId,
          from_id: user.id,
          from_name: String(user.nickname || user.name),
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
      "SELECT m.id, m.order_id, m.from_id, m.body, m.created_at, u.name AS from_name, " +
        "u.nickname AS from_nickname, u.real_name AS from_real_name, u.show_real_name AS from_show_real " +
        "FROM ly_messages m LEFT JOIN ly_users u ON u.id = m.from_id " +
        "WHERE m.order_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200"
    )
      .bind(orderId, since)
      .all();

    const reveal = ["connected", "delivered", "done"].indexOf(order.status) >= 0;
    const messages = ((res && res.results) || []).map((m) => {
      const json = messageJson(m);
      if (m.from_id !== "system") {
        const nickname = String(m.from_nickname || m.from_name || "邻居");
        const real = String(m.from_real_name || "");
        if (reveal && real && Number(m.from_show_real) !== 0) json.from_name = real;
        else json.from_name = nickname;
      }
      return json;
    });
    return ok({ messages });
  });
}

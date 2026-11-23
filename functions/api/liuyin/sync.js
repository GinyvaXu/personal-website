/* ============================================================
 * GET /api/liuyin/sync?since=<ISO/时间戳>&floor=3   (需 token)
 * 一次返回：me / floor_users / open_orders / my_orders / notifications
 * 前端每 2 秒调一次。
 * ============================================================ */
import {
  handle, ok, nowIso, parseSince, parseFloorValue, userMeta, floorUsers,
  queryOrders, ORDER_SELECT, orderJson, statusText, BUILDING,
} from "./_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, url, user }) => {
    const db = env.DB;
    const since = parseSince(url.searchParams.get("since"));
    const floor = parseFloorValue(url.searchParams.get("floor")) || Number(user.floor);

    const meta = await userMeta(db, user);
    const floorList = await floorUsers(db, floor, user.id);
    const openOrders = await queryOrders(db, "o.status = 'pending'", [], "o.created_at DESC", 50);
    const myOrders = await queryOrders(
      db,
      "(o.creator_id = ? OR o.claimer_id = ?)",
      [user.id, user.id],
      "COALESCE(o.updated_at, o.created_at) DESC",
      50
    );

    return ok({
      server_time: nowIso(),
      building: BUILDING,
      me: { points: meta.points, owed: meta.owed },
      floor_users: floorList,
      open_orders: openOrders,
      my_orders: myOrders,
      notifications: await buildNotifications(db, user, since),
    });
  });
}

/* 通知不单独建表：按 since 之后我相关订单的 updated_at + 新消息推导 */
async function buildNotifications(db, user, since) {
  if (!since) return [];
  const out = [];

  const res = await db
    .prepare(
      ORDER_SELECT +
        " WHERE (o.creator_id = ? OR o.claimer_id = ?) " +
        "AND COALESCE(o.updated_at, o.created_at) > ? " +
        "ORDER BY COALESCE(o.updated_at, o.created_at) ASC LIMIT 20"
    )
    .bind(user.id, user.id, since)
    .all();
  for (const row of (res && res.results) || []) {
    const order = orderJson(row);
    out.push({
      type: order.status,
      order_id: order.id,
      text: notifyText(order, user),
      at: order.updated_at || order.created_at,
    });
  }

  const msgs = await db
    .prepare(
      "SELECT m.id, m.order_id, m.body, m.created_at, u.name AS from_name, o.title AS order_title " +
        "FROM ly_messages m JOIN ly_orders o ON o.id = m.order_id " +
        "LEFT JOIN ly_users u ON u.id = m.from_id " +
        "WHERE (o.creator_id = ? OR o.claimer_id = ?) AND m.from_id <> ? AND m.created_at > ? " +
        "ORDER BY m.id ASC LIMIT 20"
    )
    .bind(user.id, user.id, user.id, since)
    .all();
  for (const m of (msgs && msgs.results) || []) {
    out.push({
      type: "message",
      order_id: m.order_id,
      text: (m.from_name || "邻居") + "：" + clip(m.body, 60),
      at: m.created_at,
    });
  }

  out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return out.slice(-30);
}

function clip(text, max) {
  const s = String(text == null ? "" : text);
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join("") + "…" : s;
}

function notifyText(order, user) {
  const meId = user.id;
  const who = order.claimer ? (order.claimer.id === meId ? "你" : order.claimer.name) : "有人";
  const title = order.title;
  switch (order.status) {
    case "claimed":
      return order.creator.id === meId ? who + " 接了你的「" + title + "」" : "你接了「" + title + "」，去双确认吧";
    case "confirmed":
      return "「" + title + "」双方都确认了，可以取件";
    case "picked":
      return "「" + title + "」已取件";
    case "delivered":
      return "「" + title + "」已送达，记得点完成";
    case "done":
      return "「" + title + "」已完成" + (order.creator.id === meId ? "，欠下 1 点人情" : "，人情点 +1");
    case "cancelled":
      return "「" + title + "」已取消";
    case "returned":
      return "「" + title + "」已退回池子，谁都能接";
    default:
      return "「" + title + "」现在" + statusText(order.status);
  }
}

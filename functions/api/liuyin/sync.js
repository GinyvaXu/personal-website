/* ============================================================
 * GET /api/liuyin/sync?since=<ISO/时间戳>&floor=3   (需 token)
 * 一次返回：server_time / me / building / floor_users / open_orders / my_orders /
 *           active_routes / waiting_routes / my_active_route / notifications / ledger / guide
 * 前端每 2 秒调一次。
 *
 * 读时兜底：建联超时回池、24h 自动完成、顺路卡过期，随后跑一轮机器人。
 * ============================================================ */
import {
  handle, ok, nowIso, parseSince, parseFloorValue, userStats, floorUsers,
  queryOrders, ORDER_SELECT, orderJson, statusText, getBuilding, ledgerRecent,
  routesFor, avatarOrDefault,
} from "./_lib.js";
import { settle } from "./_lifecycle.js";
import { maybeRun } from "./_robot.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, url, user }) => {
    const db = env.DB;
    const since = parseSince(url.searchParams.get("since"));
    const floor = parseFloorValue(url.searchParams.get("floor")) || Number(user.floor);

    /* 惰性兜底 + 机器人：都不能影响 sync 主流程 */
    try {
      await settle(env);
    } catch (e) {
      console.error("[sync] settle", (e && e.stack) || e);
    }
    try {
      await maybeRun(env);
    } catch (e) {
      console.error("[sync] robot", (e && e.stack) || e);
    }

    /* 机器人可能刚改了订单/人情账，这里重新读一遍 */
    const stats = await userStats(db, user.id);
    const floorList = await floorUsers(db, floor, user.id);
    const openOrders = await queryOrders(
      db,
      "o.kind = 'errand' AND o.status IN ('pending', 'released') AND o.creator_id <> ?",
      [user.id],
      "o.created_at DESC",
      50,
      user
    );
    const myOrders = await queryOrders(
      db,
      "o.kind = 'errand' AND (o.creator_id = ? OR o.claimer_id = ?)",
      [user.id, user.id],
      "COALESCE(o.updated_at, o.created_at) DESC",
      50,
      user
    );
    const routes = await routesFor(db, user);
    const building = await getBuilding(db, user.floor);
    const ledger = await ledgerRecent(db, user.id, 10);

    return ok({
      server_time: nowIso(),
      me: {
        id: user.id,
        name: String(user.nickname || user.name),
        nickname: String(user.nickname || user.name),
        avatar: avatarOrDefault(user.avatar),
        floor: Number(user.floor),
        points: stats.points,
        owed: stats.owed,
        helped: stats.helped,
        received: stats.received,
        onboarded: Number(user.onboarded) === 1,
      },
      building,
      floor_users: floorList,
      open_orders: openOrders,
      my_orders: myOrders,
      active_routes: routes.active,
      waiting_routes: routes.waiting,
      my_active_route: routes.my_active,
      notifications: await buildNotifications(db, user, since),
      ledger,
      guide: { first_visit: Number(user.onboarded) === 0 },
    });
  });
}

/* 通知不单独建表：按 since 之后我相关订单的 updated_at + 新消息推导 */
async function buildNotifications(db, user, since) {
  if (!since) return [];
  const out = [];
  const meId = user.id;

  const res = await db
    .prepare(
      ORDER_SELECT +
        " WHERE (o.creator_id = ? OR o.claimer_id = ?) " +
        "AND COALESCE(o.updated_at, o.created_at) > ? " +
        "ORDER BY COALESCE(o.updated_at, o.created_at) ASC LIMIT 20"
    )
    .bind(meId, meId, since)
    .all();
  for (const row of (res && res.results) || []) {
    const order = orderJson(row, user);
    out.push({
      type: notifyType(row),
      order_id: order.id,
      text: notifyText(order, user, row),
      at: order.updated_at || order.created_at,
    });
  }

  const msgs = await db
    .prepare(
      "SELECT m.id, m.order_id, m.from_id, m.body, m.created_at, u.name AS from_name, u.nickname AS from_nickname " +
        "FROM ly_messages m JOIN ly_orders o ON o.id = m.order_id " +
        "LEFT JOIN ly_users u ON u.id = m.from_id " +
        "WHERE (o.creator_id = ? OR o.claimer_id = ?) AND m.from_id <> ? AND m.created_at > ? " +
        "ORDER BY m.id ASC LIMIT 20"
    )
    .bind(meId, meId, meId, since)
    .all();
  for (const m of (msgs && msgs.results) || []) {
    const isSystem = m.from_id === "system";
    out.push({
      type: isSystem ? "system" : "message",
      order_id: m.order_id,
      text: isSystem
        ? String(m.body || "")
        : (m.from_nickname || m.from_name || "邻居") + "：" + clip(m.body, 60),
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

function notifyType(row) {
  if (row.status === "done" && row.delivered_at && row.done_at) {
    const gap = Date.parse(row.done_at) - Date.parse(row.delivered_at);
    if (gap >= 24 * 60 * 60 * 1000 - 5 * 60 * 1000) return "auto_done";
    return "done";
  }
  if (row.status === "pending" && row.released_reason) return "released";
  return row.status;
}

function notifyText(order, user, row) {
  const meId = user.id;
  const isCreator = order.creator_id === meId;
  const cat = order.category || "这条";
  const who = order.claimer ? order.claimer.name : "有人";
  switch (order.status) {
    case "pending":
      return row.released_reason
        ? "「" + cat + "」回到楼里了，还在等人接。"
        : "「" + cat + "」已发到楼里，等一个顺路的人。";
    case "claimed":
      return isCreator
        ? who + " 接了你的「" + cat + "」，去确认一下"
        : "你接了「" + cat + "」，去双确认吧";
    case "connected":
      return "「" + cat + "」双方都确认了，可以开始了";
    case "delivered":
      return isCreator
        ? "「" + cat + "」送到了，确认收到就记一笔"
        : "「" + cat + "」已送达，等对方确认";
    case "done":
      return isCreator
        ? "「" + cat + "」完成了，账上记了一次人情"
        : "「" + cat + "」完成了，人情 +" + (order.points || 1);
    case "cancelled":
      return "「" + cat + "」已取消";
    case "released":
      return "「" + cat + "」释放回池了，不扣点";
    default:
      return "「" + cat + "」现在" + statusText(order.status);
  }
}

/* ============================================================
 * POST /api/liuyin/admin/clear   { what: 'orders' | 'users' | 'all' | 'routes' | 'robot' }
 *   orders：清订单（连带 confirmations / messages / ledger）
 *   routes：清顺路卡
 *   robot ：清机器人日志
 *   users ：清用户（连带封禁记录；订单保留，显示为「邻居」）
 *   all   ：全部清空（含提醒 / 顺路卡 / 机器人日志），用于重置演示
 * ============================================================ */
import { handle, ok, ApiError } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const what = typeof body.what === "string" ? body.what.trim() : "";
    if (["orders", "users", "all", "routes", "robot"].indexOf(what) === -1) {
      throw new ApiError(400, "what 只能是 orders / users / routes / robot / all");
    }
    const db = env.DB;
    const counts = { orders: 0, users: 0, routes: 0, ledger: 0, messages: 0, alerts: 0, robot_log: 0 };

    if (what === "orders" || what === "all") {
      counts.orders = await scalar(db, "SELECT COUNT(*) AS n FROM ly_orders");
      counts.ledger = await scalar(db, "SELECT COUNT(*) AS n FROM ly_ledger");
      counts.messages = await scalar(db, "SELECT COUNT(*) AS n FROM ly_messages");
      await db.prepare("DELETE FROM ly_confirmations").run();
      await db.prepare("DELETE FROM ly_messages").run();
      await db.prepare("DELETE FROM ly_ledger").run();
      await db.prepare("DELETE FROM ly_orders").run();
    }

    if (what === "routes" || what === "all") {
      counts.routes = await scalar(db, "SELECT COUNT(*) AS n FROM ly_route_cards");
      await db.prepare("DELETE FROM ly_route_cards").run();
    }

    if (what === "robot" || what === "all") {
      counts.robot_log = await scalar(db, "SELECT COUNT(*) AS n FROM ly_robot_log");
      await db.prepare("DELETE FROM ly_robot_log").run();
    }

    if (what === "users" || what === "all") {
      counts.users = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users");
      await db.prepare("DELETE FROM ly_bans").run();
      await db.prepare("DELETE FROM ly_users").run();
    }

    if (what === "all") {
      counts.alerts = await scalar(db, "SELECT COUNT(*) AS n FROM ly_alerts");
      await db.prepare("DELETE FROM ly_alerts").run();
      try {
        await db.prepare("UPDATE ly_settings SET value = '' WHERE key = 'robot_last_tick'").run();
      } catch (e) {
        /* 忽略 */
      }
    }

    const deleted =
      counts.orders + counts.users + counts.routes + counts.ledger + counts.messages + counts.alerts + counts.robot_log;
    return ok({ what, deleted, counts });
  });
}

async function scalar(db, sql) {
  const row = await db.prepare(sql).first();
  return row ? Number(row.n) || 0 : 0;
}

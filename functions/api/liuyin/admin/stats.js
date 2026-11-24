/* ============================================================
 * GET /api/liuyin/admin/stats   (需 x-ly-admin)
 *   → { users, online, banned, orders, orders_by_status, floors, ledger_count,
 *       messages, pending_alerts, active_orders, recent, server_time }
 * ============================================================ */
import { handle, ok, nowIso, queryOrders, getBuilding } from "../_lib.js";
import { getRobotConfig } from "../_robot.js";

const STATUSES = ["pending", "claimed", "connected", "delivered", "done", "cancelled", "released"];

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    const db = env.DB;
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();

    const users = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users");
    const demoUsers = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users WHERE is_demo = 1");
    const online = await scalar(
      db,
      "SELECT COUNT(*) AS n FROM ly_users WHERE last_seen >= ? AND is_demo = 0",
      [cutoff]
    );
    const banned = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users WHERE banned = 1");
    const orders = await scalar(db, "SELECT COUNT(*) AS n FROM ly_orders");
    const ledgerCount = await scalar(db, "SELECT COUNT(*) AS n FROM ly_ledger");
    const messages = await scalar(db, "SELECT COUNT(*) AS n FROM ly_messages");
    const pendingAlerts = await scalar(db, "SELECT COUNT(*) AS n FROM ly_alerts WHERE handled = 0");
    const activeOrders = await scalar(
      db,
      "SELECT COUNT(*) AS n FROM ly_orders WHERE status IN ('claimed', 'connected', 'delivered')"
    );
    const activeRoutes = await scalar(
      db,
      "SELECT COUNT(*) AS n FROM ly_route_cards WHERE status = 'active' AND (active_until IS NULL OR active_until > ?)",
      [nowIso()]
    );

    const byStatus = {};
    for (const s of STATUSES) byStatus[s] = 0;
    const res = await db.prepare("SELECT status, COUNT(*) AS n FROM ly_orders GROUP BY status").all();
    for (const row of (res && res.results) || []) byStatus[row.status] = Number(row.n) || 0;

    const floorRows = await db
      .prepare("SELECT floor, COUNT(*) AS n FROM ly_users WHERE banned = 0 GROUP BY floor")
      .all();
    const counts = new Map();
    for (const row of (floorRows && floorRows.results) || []) counts.set(Number(row.floor), Number(row.n) || 0);
    const floors = [];
    for (let f = 1; f <= 6; f++) floors.push({ floor: f, count: counts.get(f) || 0 });

    const recent = await queryOrders(db, "1 = 1", [], "o.created_at DESC", 10, null);
    let robot = { enabled: false };
    try {
      robot = await getRobotConfig(env);
    } catch (e) {
      /* 忽略 */
    }

    const alerts = await db
      .prepare("SELECT COUNT(*) AS n FROM ly_alerts")
      .first();

    return ok({
      server_time: nowIso(),
      users,
      total_users: users,
      demo_users: demoUsers,
      online,
      banned,
      blocked_users: banned,
      orders,
      orders_by_status: byStatus,
      floors,
      ledger_count: ledgerCount,
      messages,
      pending_alerts: pendingAlerts,
      alerts_total: Number((alerts && alerts.n) || 0),
      active_orders: activeOrders,
      active_routes: activeRoutes,
      recent,
      robot,
      building: await getBuilding(db),
    });
  });
}

async function scalar(db, sql, params) {
  const row = await db.prepare(sql).bind(...(params || [])).first();
  return row ? Number(row.n) || 0 : 0;
}

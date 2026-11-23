/* ============================================================
 * GET /api/liuyin/admin/stats   (需 x-ly-admin)
 *   → { users, online, orders_by_status, floors, ledger_count, recent }
 * ============================================================ */
import { handle, ok, nowIso, queryOrders, FLOOR_TOTAL } from "../_lib.js";

const STATUSES = ["pending", "claimed", "confirmed", "picked", "delivered", "done", "cancelled", "returned"];

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    const db = env.DB;
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();

    const users = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users");
    const online = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users WHERE last_seen >= ?", [cutoff]);
    const banned = await scalar(db, "SELECT COUNT(*) AS n FROM ly_users WHERE banned = 1");
    const orders = await scalar(db, "SELECT COUNT(*) AS n FROM ly_orders");
    const ledgerCount = await scalar(db, "SELECT COUNT(*) AS n FROM ly_ledger");
    const messages = await scalar(db, "SELECT COUNT(*) AS n FROM ly_messages");

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
    for (let f = 1; f <= FLOOR_TOTAL; f++) floors.push({ floor: f, count: counts.get(f) || 0 });

    const recent = await queryOrders(db, "1 = 1", [], "o.created_at DESC", 10);

    return ok({
      server_time: nowIso(),
      users,
      online,
      banned,
      orders,
      orders_by_status: byStatus,
      floors,
      ledger_count: ledgerCount,
      messages,
      recent,
    });
  });
}

async function scalar(db, sql, params) {
  const row = await db.prepare(sql).bind(...(params || [])).first();
  return row ? Number(row.n) || 0 : 0;
}

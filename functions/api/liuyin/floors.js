/* ============================================================
 * GET /api/liuyin/floors   → { floors: [{ floor, count }] }（1–6 层都返回）
 * ============================================================ */
import { handle, ok, BUILDING, FLOOR_TOTAL } from "./_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", body: false }, async ({ env }) => {
    const res = await env.DB.prepare(
      "SELECT floor, COUNT(*) AS n FROM ly_users WHERE banned = 0 GROUP BY floor"
    ).all();
    const counts = new Map();
    for (const row of (res && res.results) || []) counts.set(Number(row.floor), Number(row.n) || 0);
    const floors = [];
    for (let f = 1; f <= FLOOR_TOTAL; f++) floors.push({ floor: f, count: counts.get(f) || 0 });
    return ok({ floors, building: BUILDING });
  });
}

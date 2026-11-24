/* ============================================================
 * GET /api/liuyin/admin/alerts   (需 x-ly-admin)
 *   → { alerts: [{id,type,user_id,user_name,title,detail,handled,created_at}], pending }
 * 提醒来源：连续 3 次未响应（建联超时 / 联系不上）。
 * ============================================================ */
import { handle, ok } from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    const res = await env.DB.prepare(
      "SELECT a.*, u.name AS user_name, u.nickname AS user_nickname, u.floor AS user_floor " +
        "FROM ly_alerts a LEFT JOIN ly_users u ON u.id = a.user_id " +
        "ORDER BY a.handled ASC, a.id DESC LIMIT 100"
    ).all();
    const alerts = ((res && res.results) || []).map((r) => ({
      id: r.id,
      type: r.type,
      user_id: r.user_id,
      user_name: String(r.user_nickname || r.user_name || "邻居"),
      floor: r.user_floor == null ? null : Number(r.user_floor),
      title: r.title || "失联提醒",
      detail: r.detail || "",
      handled: Number(r.handled) === 1,
      created_at: r.created_at,
    }));
    return ok({
      alerts,
      pending: alerts.filter((a) => !a.handled).length,
      total: alerts.length,
    });
  });
}

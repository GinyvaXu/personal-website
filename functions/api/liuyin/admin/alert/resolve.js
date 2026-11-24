/* ============================================================
 * POST /api/liuyin/admin/alert/resolve   { id }   (需 x-ly-admin)
 * ============================================================ */
import { handle, ok, ApiError, changesOf } from "../../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "缺少提醒 id");
    const upd = await env.DB.prepare("UPDATE ly_alerts SET handled = 1 WHERE id = ?").bind(id).run();
    if (changesOf(upd) < 1) throw new ApiError(404, "提醒不存在");
    const row = await env.DB.prepare("SELECT id, handled FROM ly_alerts WHERE id = ?").bind(id).first();
    return ok({ alert: { id: row.id, handled: Number(row.handled) === 1 } });
  });
}

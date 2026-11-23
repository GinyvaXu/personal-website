/* ============================================================
 * POST /api/liuyin/admin/unban   { user_id }
 * ============================================================ */
import { handle, ok, ApiError } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) throw new ApiError(400, "缺少 user_id");
    const row = await env.DB.prepare("SELECT * FROM ly_users WHERE id = ?").bind(userId).first();
    if (!row) throw new ApiError(404, "这个人不存在");

    await env.DB.prepare("UPDATE ly_users SET banned = 0 WHERE id = ?").bind(userId).run();
    await env.DB.prepare("DELETE FROM ly_bans WHERE user_id = ?").bind(userId).run();
    return ok({ user: { id: row.id, name: row.name, floor: Number(row.floor), banned: false } });
  });
}

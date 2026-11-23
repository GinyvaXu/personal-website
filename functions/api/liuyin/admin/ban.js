/* ============================================================
 * POST /api/liuyin/admin/ban     { user_id, reason }
 * POST /api/liuyin/admin/unban   { user_id }
 * 规则：ly_users.banned = 1 且 ly_bans 有记录 → 该 token 全部 401
 * ============================================================ */
import { handle, ok, ApiError, optStr } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, url, body }) => {
    const user = await requireUser(env, body);
    const reason = optStr(body, "reason", 100, "封禁原因") || "";

    await env.DB.prepare("UPDATE ly_users SET banned = 1 WHERE id = ?").bind(user.id).run();
    const exist = await env.DB.prepare("SELECT id FROM ly_bans WHERE user_id = ? LIMIT 1").bind(user.id).first();
    if (!exist) {
      await env.DB.prepare("INSERT INTO ly_bans (user_id, ip_hash, reason) VALUES (?, NULL, ?)")
        .bind(user.id, reason)
        .run();
    }
    return ok({ user: { id: user.id, name: user.name, floor: Number(user.floor), banned: true }, reason });
  });
}

async function requireUser(env, body) {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) throw new ApiError(400, "缺少 user_id");
  const row = await env.DB.prepare("SELECT * FROM ly_users WHERE id = ?").bind(userId).first();
  if (!row) throw new ApiError(404, "这个人不存在");
  return row;
}

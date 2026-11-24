/* ============================================================
 * POST /api/liuyin/admin/user   { id, banned, reason }   (需 x-ly-admin)
 *   banned=true → 冻结（并写 ly_bans 理由）；false → 解封。
 * ============================================================ */
import { handle, ok, ApiError, optBool, optStr, nowIso, changesOf } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const userId = typeof body.id === "string" ? body.id.trim() : typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) throw new ApiError(400, "缺少 user id");
    const row = await env.DB.prepare("SELECT * FROM ly_users WHERE id = ?").bind(userId).first();
    if (!row) throw new ApiError(404, "这个人不存在");

    const banned = optBool(body, "banned", true);
    const reason = optStr(body, "reason", 100, "原因", false) || "";
    const db = env.DB;

    if (banned) {
      await db.prepare("UPDATE ly_users SET banned = 1 WHERE id = ?").bind(userId).run();
      const exist = await db.prepare("SELECT id FROM ly_bans WHERE user_id = ? LIMIT 1").bind(userId).first();
      if (!exist) {
        await db
          .prepare("INSERT INTO ly_bans (user_id, ip_hash, reason, created_at) VALUES (?, NULL, ?, ?)")
          .bind(userId, reason, nowIso())
          .run();
      } else {
        await db.prepare("UPDATE ly_bans SET reason = ? WHERE user_id = ?").bind(reason, userId).run();
      }
    } else {
      await db.prepare("UPDATE ly_users SET banned = 0 WHERE id = ?").bind(userId).run();
      await db.prepare("DELETE FROM ly_bans WHERE user_id = ?").bind(userId).run();
    }

    return ok({
      user: {
        id: row.id,
        name: String(row.nickname || row.name),
        floor: Number(row.floor),
        banned,
        reason,
      },
    });
  });
}

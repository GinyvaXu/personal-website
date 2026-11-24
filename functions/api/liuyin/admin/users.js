/* ============================================================
 * GET /api/liuyin/admin/users   (需 x-ly-admin)
 *   → { users: [...] }  含真名 / missed / 封禁 / 机器人标记（管理视角）
 * ============================================================ */
import { handle, ok, userStats, avatarOrDefault } from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    const res = await env.DB.prepare(
      "SELECT id, name, name_key, nickname, real_name, show_real_name, avatar, floor, room_no, building_id, " +
        "banned, is_demo, onboarded, missed, last_seen, created_at FROM ly_users ORDER BY is_demo ASC, created_at ASC LIMIT 500"
    ).all();
    const rows = (res && res.results) || [];
    const out = [];
    for (const row of rows) {
      const stats = await userStats(env.DB, row.id);
      out.push({
        id: row.id,
        name: String(row.nickname || row.name),
        nickname: String(row.nickname || row.name),
        real_name: row.real_name || "",
        show_real_name: Number(row.show_real_name) === 1,
        avatar: avatarOrDefault(row.avatar),
        floor: Number(row.floor),
        room_no: row.room_no || "",
        building_id: row.building_id || "b_6",
        banned: Number(row.banned) === 1,
        is_demo: Number(row.is_demo) === 1,
        onboarded: Number(row.onboarded) === 1,
        missed: Number(row.missed) || 0,
        online: Number(row.is_demo) === 1 ? false : isRecent(row.last_seen),
        last_seen: row.last_seen || null,
        created_at: row.created_at,
        points: stats.points,
        owed: stats.owed,
        helped: stats.helped,
        received: stats.received,
      });
    }
    return ok({ users: out, total: out.length });
  });
}

function isRecent(lastSeen) {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  return !!t && Date.now() - t <= 60 * 1000;
}

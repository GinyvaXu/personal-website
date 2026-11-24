/* ============================================================
 * POST /api/liuyin/login   { name, floor }    (可带 x-ly-token：直接返回本人)
 * 弱账户：无密码、无手机号；同层同名自动变 小柳(2)
 * 返回 { token, user, building }
 * ============================================================ */
import {
  handle, ok, json, ApiError, reqStr, optFloor, uniqueName, makeId, nowIso,
  userStats, getBuilding, avatarOrDefault, AVATAR_PRESETS, BUILDING, NAME_MAX,
} from "./_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "optional" }, async ({ env, user, body }) => {
    /* 1) 已带有效 token：直接返回本人，不再新建 */
    if (user) return loginPayload(env, user);

    /* 2) 兼容把 token 放在 body 里（前端从 localStorage 取） */
    const bodyToken = typeof body.token === "string" ? body.token.trim() : "";
    if (bodyToken) {
      const row = await env.DB.prepare("SELECT * FROM ly_users WHERE token = ?").bind(bodyToken).first();
      if (row && Number(row.banned) !== 1) return loginPayload(env, row);
    }

    /* 3) 新建弱账户 */
    const name = reqStr(body, "name", NAME_MAX, "名字");
    const floor = optFloor(body);
    if (floor == null) throw new ApiError(400, "请选择楼层（1–6）");

    const { name: finalName, key } = await uniqueName(env.DB, floor, name);
    const id = makeId("u_");
    const token = crypto.randomUUID();
    const now = nowIso();
    const avatar = "preset:" + AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
    await env.DB.prepare(
      "INSERT INTO ly_users (id, name, name_key, nickname, real_name, show_real_name, avatar, floor, room_no, " +
        "building_id, token, banned, is_demo, onboarded, missed, last_seen, created_at) " +
        "VALUES (?, ?, ?, ?, '', 1, ?, ?, '', 'b_6', ?, 0, 0, 0, 0, ?, ?)"
    )
      .bind(id, finalName, key, finalName, avatar, floor, token, now, now)
      .run();

    const row = await env.DB.prepare("SELECT * FROM ly_users WHERE id = ?").bind(id).first();
    return loginPayload(env, row);
  });
}

async function loginPayload(env, row) {
  const stats = await userStats(env.DB, row.id);
  const avatar = avatarOrDefault(row.avatar);
  const user = {
    id: row.id,
    name: String(row.nickname || row.name),
    nickname: String(row.nickname || row.name),
    real_name: row.real_name || "",
    show_real_name: Number(row.show_real_name) === 1,
    avatar,
    floor: Number(row.floor),
    room_no: row.room_no || "",
    building_id: row.building_id || "b_6",
    onboarded: Number(row.onboarded) === 1,
    is_demo: Number(row.is_demo) === 1,
    points: stats.points,
    owed: stats.owed,
    helped: stats.helped,
    received: stats.received,
    online: true,
  };
  const building = await getBuilding(env.DB, user.floor);
  return json({
    ok: true,
    data: { token: row.token, user, building },
    /* 兼容老前端顶层字段 */
    token: row.token,
    user,
  });
}

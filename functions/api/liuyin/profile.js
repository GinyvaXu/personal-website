/* ============================================================
 * POST /api/liuyin/profile
 *   { nickname, real_name, avatar, floor, room_no, show_real_name }
 *   → { user }
 * 弱账户档案：真名可选、默认只在本楼内可见；昵称重名自动编号。
 * ============================================================ */
import {
  handle, ok, ApiError, optStr, optFloor, optBool, uniqueName, nowIso,
  userStats, getBuilding, cleanAvatar, avatarOrDefault, parseFloorValue,
} from "./_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const db = env.DB;

    /* 昵称：显式传才改（空串不允许，避免把显示名清空） */
    let nickname = null;
    if (body.nickname !== undefined && String(body.nickname || "").trim() !== "") {
      nickname = optStr(body, "nickname", 12, "昵称");
      if (!nickname) throw new ApiError(400, "请填写昵称");
    }

    /* 楼层：不传保持原样；传了必须合法 */
    const floorRaw = body.floor;
    let floor = Number(user.floor);
    if (floorRaw !== undefined && floorRaw !== null && floorRaw !== "") {
      const parsed = optFloor(body, "floor", "楼层");
      if (parsed == null) throw new ApiError(400, "楼层只能是 1–6");
      floor = parsed;
    }

    const realNameProvided = body.real_name !== undefined;
    const realName = realNameProvided ? optStr(body, "real_name", 12, "真名", false) || "" : String(user.real_name || "");
    const roomProvided = body.room_no !== undefined;
    const roomNo = roomProvided ? optStr(body, "room_no", 10, "门牌号", false) || "" : String(user.room_no || "");
    const showReal = body.show_real_name === undefined ? Number(user.show_real_name) === 1 : optBool(body, "show_real_name", true);
    const avatarProvided = body.avatar !== undefined;
    const avatar = avatarProvided ? cleanAvatar(body.avatar) || avatarOrDefault(user.avatar) : avatarOrDefault(user.avatar);

    let finalName = String(user.name || "");
    let finalKey = String(user.name_key || "");
    let finalNickname = String(user.nickname || user.name || "");
    let finalFloor = floor;

    const wantRename = nickname !== null;
    const wantMove = floor !== Number(user.floor);
    if (wantRename || wantMove) {
      const targetNickname = nickname !== null ? nickname : finalNickname;
      const resolved = await uniqueName(db, floor, targetNickname, user.id);
      finalNickname = resolved.name;
      finalName = resolved.name;
      finalKey = resolved.key;
      finalFloor = floor;
    }

    const now = nowIso();
    await db.prepare(
      "UPDATE ly_users SET name = ?, name_key = ?, nickname = ?, real_name = ?, show_real_name = ?, " +
        "avatar = ?, floor = ?, room_no = ?, onboarded = 1, last_seen = ? WHERE id = ?"
    )
      .bind(finalName, finalKey, finalNickname, realName, showReal ? 1 : 0, avatar, finalFloor, roomNo, now, user.id)
      .run();

    const row = await db.prepare("SELECT * FROM ly_users WHERE id = ?").bind(user.id).first();
    const stats = await userStats(db, row.id);
    const building = await getBuilding(db, row.floor);
    return ok({
      user: {
        id: row.id,
        name: String(row.nickname || row.name),
        nickname: String(row.nickname || row.name),
        real_name: row.real_name || "",
        show_real_name: Number(row.show_real_name) === 1,
        avatar: avatarOrDefault(row.avatar),
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
      },
      building,
    });
  });
}

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, user }) => {
    const stats = await userStats(env.DB, user.id);
    return ok({
      user: {
        id: user.id,
        name: String(user.nickname || user.name),
        nickname: String(user.nickname || user.name),
        real_name: user.real_name || "",
        show_real_name: Number(user.show_real_name) === 1,
        avatar: avatarOrDefault(user.avatar),
        floor: Number(user.floor),
        room_no: user.room_no || "",
        points: stats.points,
        owed: stats.owed,
        helped: stats.helped,
        received: stats.received,
      },
    });
  });
}

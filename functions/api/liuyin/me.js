/* ============================================================
 * GET /api/liuyin/me   (需 x-ly-token)
 *   → { user, building, stats, ledger, notice }
 *   points = 帮人累计（to_id=me 的 delta 和）
 *   owed   = 欠下累计（from_id=me 的 delta 和）
 *   helped = 帮过次数；received = 被帮次数
 * ============================================================ */
import { handle, ok, userStats, ledgerRecent, getBuilding, avatarOrDefault, getSetting } from "./_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, user }) => {
    const db = env.DB;
    const stats = await userStats(db, user.id);
    const building = await getBuilding(db, user.floor);
    const ledger = await ledgerRecent(db, user.id, 10);
    const notice = await getSetting(db, "notice", "");
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
        building_id: user.building_id || "b_6",
        onboarded: Number(user.onboarded) === 1,
        is_demo: Number(user.is_demo) === 1,
        missed: Number(user.missed) || 0,
        points: stats.points,
        owed: stats.owed,
        helped: stats.helped,
        received: stats.received,
        online: true,
        admin: false,
      },
      stats,
      building,
      ledger,
      notice,
    });
  });
}

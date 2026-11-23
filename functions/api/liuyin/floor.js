/* ============================================================
 * GET /api/liuyin/floor?floor=3
 *   → { users: [{ id, name, floor, points, online }], building }
 * 公开接口（契约未标需 token）；带 token 时排除自己。
 * ============================================================ */
import { handle, ok, parseFloorValue, floorUsers, BUILDING, ApiError } from "./_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "optional", body: false }, async ({ env, url, user }) => {
    const raw = url.searchParams.get("floor");
    let floor = parseFloorValue(raw);
    if (floor == null && user) floor = Number(user.floor);
    if (floor == null) throw new ApiError(400, "请指定楼层（1–6）");

    const users = await floorUsers(env.DB, floor, user ? user.id : null);
    return ok({ users, floor, building: BUILDING });
  });
}

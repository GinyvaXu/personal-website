/* ============================================================
 * POST /api/liuyin/routes/create   { time_label, from_place, capacity }
 *   → { card }
 * 一个人同时只有一张 active：新卡把旧 active 置 waiting；active_until = 2 小时后。
 * ============================================================ */
import { handle, json, ApiError, optStr, optIntRange, makeId, nowIso, BUILDING } from "../_lib.js";
import { settleRouteCards } from "../_lifecycle.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const db = env.DB;
    try {
      await settleRouteCards(env);
    } catch (e) {
      /* 忽略 */
    }

    const timeLabel = optStr(body, "time_label", 20, "时间段") || "18:00–18:30";
    const fromPlace = optStr(body, "from_place", 20, "从哪走") || "驿站";
    const capacity = optIntRange(body, "capacity", 1, 5, 2, "能带几件");

    const id = makeId("r_");
    const now = nowIso();
    const activeUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    /* 先把自己的其它 active 卡降级为 waiting */
    await db
      .prepare(
        "UPDATE ly_route_cards SET status = 'waiting', updated_at = ? WHERE user_id = ? AND status = 'active'"
      )
      .bind(now, user.id)
      .run();

    await db
      .prepare(
        "INSERT INTO ly_route_cards (id, user_id, floor, time_label, from_place, to_place, capacity, status, active_until, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)"
      )
      .bind(id, user.id, Number(user.floor), timeLabel, fromPlace, BUILDING, capacity, activeUntil, now, now)
      .run();

    const row = await db
      .prepare(
        "SELECT c.*, u.name AS user_name, u.nickname AS user_nickname, u.avatar AS user_avatar, u.floor AS user_floor " +
          "FROM ly_route_cards c LEFT JOIN ly_users u ON u.id = c.user_id WHERE c.id = ?"
      )
      .bind(id)
      .first();
    return json({
      ok: true,
      data: {
        card: {
          id: row.id,
          user_id: row.user_id,
          floor: Number(row.floor),
          time_label: row.time_label,
          from_place: row.from_place,
          to_place: row.to_place || BUILDING,
          capacity: Number(row.capacity),
          status: row.status,
          active_until: row.active_until,
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_mine: true,
          user: {
            id: row.user_id,
            name: String(row.user_nickname || row.user_name || "邻居"),
            avatar: row.user_avatar || "preset:sage",
            floor: Number(row.floor),
          },
        },
      },
    });
  });
}

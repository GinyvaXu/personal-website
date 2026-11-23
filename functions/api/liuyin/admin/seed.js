/* ============================================================
 * POST /api/liuyin/admin/seed   (需 x-ly-admin)
 * 写入预置演示数据（幂等：INSERT OR IGNORE，可反复点）：
 *   - 6 号楼 / 1–6 层（写 ly_settings）
 *   - 3 个邻居：小柳 3 层、小周 4 层、阿 May 2 层
 *   - 2 条历史已完成订单（带人情点流水）
 *   - 2 条待接订单（1 委托 + 1 顺路卡）
 * ============================================================ */
import { handle, ok, nowIso } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env }) => {
    const db = env.DB;
    const now = Date.now();

    /* ---- 配置 ---- */
    for (const [key, value] of [
      ["building", "6 号楼"],
      ["floors", "6"],
      ["demo_open", "1"],
    ]) {
      await db.prepare("INSERT OR REPLACE INTO ly_settings (key, value) VALUES (?, ?)")
        .bind(key, value)
        .run();
    }

    /* ---- 3 个邻居 ---- */
    const users = [
      { id: "u_seed_liu", name: "小柳", key: "小柳", floor: 3, token: "seed-token-xiaoliu" },
      { id: "u_seed_zhou", name: "小周", key: "小周", floor: 4, token: "seed-token-xiaozhou" },
      { id: "u_seed_may", name: "阿May", key: "amay", floor: 2, token: "seed-token-amay" },
    ];
    for (const u of users) {
      await db.prepare(
        "INSERT OR IGNORE INTO ly_users (id, name, name_key, floor, token, banned, last_seen, created_at) " +
          "VALUES (?, ?, ?, ?, ?, 0, NULL, ?)"
      )
        .bind(u.id, u.name, u.key, u.floor, u.token, new Date(now - 7 * 86400000).toISOString())
        .run();
    }

    /* ---- 2 条历史已完成订单 + 人情点 ---- */
    const done = [
      {
        id: "o_seed_done1",
        creator: "u_seed_liu",
        claimer: "u_seed_zhou",
        title: "取快递",
        note: "两个大箱子，谢谢 4 楼的邻居",
        from_place: "驿站",
        to_floor: 3,
        code: "A·1236",
        at: new Date(now - 2 * 86400000).toISOString(),
        from: "u_seed_liu",
        to: "u_seed_zhou",
      },
      {
        id: "o_seed_done2",
        creator: "u_seed_zhou",
        claimer: "u_seed_may",
        title: "带份饭",
        note: "食堂二楼的番茄牛腩饭",
        from_place: "食堂",
        to_floor: 4,
        code: "B·0912",
        at: new Date(now - 1 * 86400000).toISOString(),
        from: "u_seed_zhou",
        to: "u_seed_may",
      },
    ];
    for (const o of done) {
      await db.prepare(
        "INSERT OR IGNORE INTO ly_orders (id, kind, creator_id, claimer_id, title, note, from_place, to_floor, " +
          "start_at, end_at, capacity, code, status, photo_key, proof_key, created_at, updated_at) " +
          "VALUES (?, 'errand', ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, 'done', NULL, NULL, ?, ?)"
      )
        .bind(o.id, o.creator, o.claimer, o.title, o.note, o.from_place, o.to_floor, o.code, o.at, o.at)
        .run();
      await db.prepare(
        "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
      )
        .bind(o.id, o.creator, o.at)
        .run();
      await db.prepare(
        "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
      )
        .bind(o.id, o.claimer, o.at)
        .run();
      await db.prepare(
        "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) " +
          "VALUES (?, ?, ?, 1, ?, ?)"
      )
        .bind(o.id, o.from, o.to, "「" + o.title + "」的人情", o.at)
        .run();
    }

    /* ---- 2 条待接订单 ---- */
    const open = [
      {
        id: "o_seed_open1",
        kind: "errand",
        creator: "u_seed_liu",
        title: "驿站取快递",
        note: "六个件，有点重，我在 3 层等",
        from_place: "驿站",
        to_floor: 3,
        code: "B·7781",
        start_at: null,
        end_at: null,
        capacity: 1,
        at: new Date(now - 20 * 60000).toISOString(),
      },
      {
        id: "o_seed_open2",
        kind: "route",
        creator: "u_seed_may",
        title: "顺路带奶茶",
        note: "从食堂回 4 层，能带两份",
        from_place: "食堂",
        to_floor: 4,
        code: null,
        start_at: "18:30",
        end_at: "19:00",
        capacity: 2,
        at: new Date(now - 10 * 60000).toISOString(),
      },
    ];
    for (const o of open) {
      await db.prepare(
        "INSERT OR IGNORE INTO ly_orders (id, kind, creator_id, claimer_id, title, note, from_place, to_floor, " +
          "start_at, end_at, capacity, code, status, photo_key, proof_key, created_at, updated_at) " +
          "VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)"
      )
        .bind(
          o.id, o.kind, o.creator, o.title, o.note, o.from_place, o.to_floor,
          o.start_at, o.end_at, o.capacity, o.code, o.at, o.at
        )
        .run();
    }

    const stat = (sql) => db.prepare(sql).first().then((r) => Number((r && r.n) || 0));
    return ok({
      seeded_at: nowIso(),
      users: await stat("SELECT COUNT(*) AS n FROM ly_users"),
      orders: await stat("SELECT COUNT(*) AS n FROM ly_orders"),
      open_orders: await stat("SELECT COUNT(*) AS n FROM ly_orders WHERE status = 'pending'"),
      ledger: await stat("SELECT COUNT(*) AS n FROM ly_ledger"),
      hint: "演示账号 token：seed-token-xiaoliu / seed-token-xiaozhou / seed-token-amay",
    });
  });
}

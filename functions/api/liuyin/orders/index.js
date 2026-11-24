/* ============================================================
 * GET  /api/liuyin/orders?scope=open|mine|done|floor&floor=3
 * POST /api/liuyin/orders/create   （也接受 POST /api/liuyin/orders）
 *
 * 发单：品类 / 模板 / 大小件 / 从哪拿 / 时间档 / 人情点 / 备注 / 送到几层 / 是否要取件码
 * 步骤由模板生成；取件码在「提供取件码」步骤里写入（code 列）。
 * ============================================================ */
import {
  handle, ok, json, ApiError, reqStr, optStr, optFloor, optBool, optIntRange,
  parseFloorValue, makeId, nowIso, getOrderById, orderJson, queryOrders,
  buildSteps, templateOf, categoryOf, cleanKey, CATEGORY_NAMES, SIZE_NAMES, NOTE_MAX,
} from "../_lib.js";
import { settle } from "../_lifecycle.js";
import { maybeRun } from "../_robot.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "optional", body: false }, async ({ env, url, user }) => {
    const db = env.DB;
    try {
      await settle(env);
    } catch (e) {
      console.error("[orders] settle", (e && e.stack) || e);
    }
    const scope = (url.searchParams.get("scope") || "open").trim();
    const floorParam = url.searchParams.get("floor");

    if (scope === "open") {
      const where = user
        ? "o.kind = 'errand' AND o.status IN ('pending', 'released') AND o.creator_id <> ?"
        : "o.kind = 'errand' AND o.status IN ('pending', 'released')";
      const params = user ? [user.id] : [];
      return ok({ orders: await queryOrders(db, where, params, "o.created_at DESC", 50, user) });
    }

    if (scope === "floor") {
      const floor = parseFloorValue(floorParam) || (user ? Number(user.floor) : null);
      if (floor == null) throw new ApiError(400, "请指定楼层（1–6）");
      return ok({
        orders: await queryOrders(
          db,
          "o.kind = 'errand' AND (o.to_floor = ? OR o.creator_id IN (SELECT id FROM ly_users WHERE floor = ?))",
          [floor, floor],
          "o.created_at DESC",
          50,
          user
        ),
      });
    }

    if (scope === "mine") {
      if (!user) throw new ApiError(401, "请先进楼");
      return ok({
        orders: await queryOrders(
          db,
          "o.kind = 'errand' AND (o.creator_id = ? OR o.claimer_id = ?)",
          [user.id, user.id],
          "COALESCE(o.updated_at, o.created_at) DESC",
          50,
          user
        ),
      });
    }

    if (scope === "done") {
      if (!user) throw new ApiError(401, "请先进楼");
      return ok({
        orders: await queryOrders(
          db,
          "o.kind = 'errand' AND o.status = 'done' AND (o.creator_id = ? OR o.claimer_id = ?)",
          [user.id, user.id],
          "COALESCE(o.done_at, o.updated_at, o.created_at) DESC",
          50,
          user
        ),
      });
    }

    throw new ApiError(400, "scope 只能是 open / floor / mine / done");
  });
}

export async function onRequestPost(context) {
  return createOrder(context);
}

export async function createOrder(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const db = env.DB;

    /* ---- 品类 / 模板 ---- */
    const rawCategory = optStr(body, "category", 8, "分类");
    const rawTemplate = optStr(body, "template_id", 12, "模板");
    const category = rawCategory || (rawTemplate ? categoryOf(rawTemplate) : "");
    if (!category) throw new ApiError(400, "请先选一个分类");
    const template = templateOf(category, rawTemplate || "");
    if (CATEGORY_NAMES.indexOf(category) < 0 && [...category].length > 8) {
      throw new ApiError(400, "分类最多 8 个字");
    }

    /* ---- 大小件（只有取快递有意义） ---- */
    let size = optStr(body, "size", 4, "大小件") || "";
    if (size && SIZE_NAMES.indexOf(size) < 0) throw new ApiError(400, "大小件只能是 小件 / 中件 / 大件");
    if (template !== "pickup") size = "";

    /* ---- 从哪拿 ---- */
    const defaultPickup = template === "pickup" ? "驿站" : template === "food" ? "食堂" : "";
    const pickup = optStr(body, "pickup", 20, "取货地点") || defaultPickup;

    /* ---- 时间档 / 人情点 / 备注 / 送到几层 ---- */
    const timeLabel = optStr(body, "time_label", 20, "时间") || "现在";
    const points = optIntRange(body, "points", 1, 3, 2, "人情点");
    const note = optStr(body, "note", NOTE_MAX, "备注") || "";
    const toFloor = optFloor(body, "to_floor", "送到楼层");
    const targetFloor = toFloor == null ? Number(user.floor) : toFloor;
    const needCode = body.need_code === undefined ? template === "pickup" : optBool(body, "need_code", false);
    const photoKey = cleanKey(optStr(body, "photo_key", 120, "照片"));

    /* ---- 步骤 ---- */
    const steps = buildSteps(template, { needCode });

    const id = makeId("o_");
    const now = nowIso();
    await db
      .prepare(
        "INSERT INTO ly_orders (id, kind, creator_id, claimer_id, title, category, template_id, size, pickup, " +
          "time_label, points, note, to_floor, need_code, code, steps, current_step, status, from_place, capacity, " +
          "conn_deadline, conn_extended, photo_key, proof_key, created_at, updated_at) " +
          "VALUES (?, 'errand', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0, 'pending', ?, 1, NULL, 0, ?, NULL, ?, ?)"
      )
      .bind(
        id,
        user.id,
        category + (size ? " · " + size : ""),
        category,
        template,
        size,
        pickup,
        timeLabel,
        points,
        note,
        targetFloor,
        needCode ? 1 : 0,
        JSON.stringify(steps),
        pickup,
        photoKey,
        now,
        now
      )
      .run();

    /* 发单后跑一轮机器人（可能立刻被邻居接走，demo 更顺） */
    try {
      await maybeRun(env);
    } catch (e) {
      console.error("[orders] robot", (e && e.stack) || e);
    }

    const row = await getOrderById(db, id);
    return json({ ok: true, data: { order: orderJson(row, user) } });
  });
}

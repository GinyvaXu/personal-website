/* ============================================================
 * GET  /api/liuyin/orders?scope=open|mine|floor|done&floor=3
 * POST /api/liuyin/orders/create   （也接受 POST /api/liuyin/orders）
 * ============================================================ */
import {
  handle, ok, json, ApiError, reqStr, optStr, optFloor, optTime, optIntRange,
  parseFloorValue, makeId, nowIso, getOrderById, orderJson, queryOrders,
} from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "optional", body: false }, async ({ env, url, user }) => {
    const scope = (url.searchParams.get("scope") || "open").trim();
    const floorParam = url.searchParams.get("floor");

    if (scope === "open") {
      return ok({ orders: await queryOrders(env.DB, "o.status = 'pending'", [], "o.created_at DESC", 50) });
    }

    if (scope === "floor") {
      const floor = parseFloorValue(floorParam) || (user ? Number(user.floor) : null);
      if (floor == null) throw new ApiError(400, "请指定楼层（1–6）");
      return ok({
        orders: await queryOrders(
          env.DB,
          "(o.to_floor = ? OR o.creator_id IN (SELECT id FROM ly_users WHERE floor = ?))",
          [floor, floor],
          "o.created_at DESC",
          50
        ),
      });
    }

    if (scope === "mine") {
      if (!user) throw new ApiError(401, "请先进楼");
      return ok({
        orders: await queryOrders(
          env.DB,
          "(o.creator_id = ? OR o.claimer_id = ?)",
          [user.id, user.id],
          "COALESCE(o.updated_at, o.created_at) DESC",
          50
        ),
      });
    }

    if (scope === "done") {
      return ok({
        orders: await queryOrders(
          env.DB,
          "o.status = 'done'",
          [],
          "COALESCE(o.updated_at, o.created_at) DESC",
          50
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
    const kind = body.kind === "route" ? "route" : "errand";
    const title = reqStr(body, "title", 20, "标题");
    const note = optStr(body, "note", 80, "备注");
    const fromPlace = optStr(body, "from_place", 20, "取货地点") || "";
    const toFloor = optFloor(body, "to_floor", "送到楼层");
    if (toFloor == null) throw new ApiError(400, "请选择送到几层（1–6）");
    const code = optStr(body, "code", 12, "取件码");
    const startAt = optTime(body, "start_at", "出发时间");
    const endAt = optTime(body, "end_at", "有效时间");
    const capacity = optIntRange(body, "capacity", 1, 5, 1, "能带几件");
    const photoKey = cleanKey(optStr(body, "photo_key", 120, "照片"));

    if (kind === "errand" && !code) throw new ApiError(400, "委托单要填取件码，方便邻居核对");

    const id = makeId("o_");
    const now = nowIso();
    await env.DB.prepare(
      "INSERT INTO ly_orders (id, kind, creator_id, claimer_id, title, note, from_place, to_floor, " +
        "start_at, end_at, capacity, code, status, photo_key, proof_key, created_at, updated_at) " +
        "VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)"
    )
      .bind(
        id, kind, user.id, title, note, fromPlace, toFloor,
        startAt, endAt, kind === "route" ? capacity : 1, code || "",
        photoKey, now, now
      )
      .run();

    const row = await getOrderById(env.DB, id);
    return json({ ok: true, data: { order: orderJson(row) } });
  });
}

/* 只接受 upload 返回的 key 形状：u_xxx/o_xxx.jpg */
export function cleanKey(key) {
  if (!key) return null;
  const k = String(key).trim();
  if (!/^[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_.-]{1,80}$/.test(k) || k.indexOf("..") !== -1) {
    throw new ApiError(400, "照片 key 不合法，请重新上传");
  }
  return k;
}

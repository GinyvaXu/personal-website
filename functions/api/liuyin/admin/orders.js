/* ============================================================
 * GET /api/liuyin/admin/orders?status=   (需 x-ly-admin)
 *   → { orders: [Order], total }
 * status 省略 = 全部；非法 status → 400。
 * 为管理台兼容，额外平铺 creator_name / claimer_name / requester_id / helper_id。
 * ============================================================ */
import { handle, ok, ApiError, queryOrders, ORDER_STATUSES } from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env, url }) => {
    const status = (url.searchParams.get("status") || "").trim();
    let where = "o.kind = 'errand'";
    const params = [];
    if (status && status !== "all" && status !== "全部") {
      if (ORDER_STATUSES.indexOf(status) < 0) throw new ApiError(400, "status 不合法");
      where = "o.kind = 'errand' AND o.status = ?";
      params.push(status);
    }
    const rows = await queryOrders(env.DB, where, params, "COALESCE(o.updated_at, o.created_at) DESC", 100, null);
    const orders = rows.map((o) =>
      Object.assign({}, o, {
        creator_name: o.creator ? o.creator.name : "",
        claimer_name: o.claimer ? o.claimer.name : "",
        requester_id: o.creator_id,
        helper_id: o.claimer_id,
      })
    );
    return ok({ orders, total: orders.length, status: status || "all" });
  });
}

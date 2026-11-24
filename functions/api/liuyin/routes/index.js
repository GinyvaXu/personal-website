/* ============================================================
 * GET /api/liuyin/routes
 *   → { active: [Card], waiting: [Card], mine: [Card], my_active: Card|null }
 * 规则：一个人同时只有一张 active；楼里只展示 active（候场列表只给本人）；
 *       active 2 小时过期；不接单、不派单、不承诺。
 * ============================================================ */
import { handle, ok, routesFor } from "../_lib.js";
import { settleRouteCards } from "../_lifecycle.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, user }) => {
    try {
      await settleRouteCards(env);
    } catch (e) {
      console.error("[routes] settle", (e && e.stack) || e);
    }
    const routes = await routesFor(env.DB, user);
    return ok({
      active: routes.active,
      waiting: routes.waiting,
      mine: routes.mine,
      my_active: routes.my_active,
      building: "6 号楼",
      rules: "不接单、不派单、不承诺；一张卡 1–5 件，2 小时过期。",
    });
  });
}

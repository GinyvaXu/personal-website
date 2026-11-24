/* ============================================================
 * POST /api/liuyin/admin/robot/seed   { user_id? }   (需 x-ly-admin)
 * 给最近一个真人用户生成 6 种状态测试场景（pending / claimed / connected /
 * delivered / done / released），机器人可以接着处理。
 * 返回 { user, orders:[id], ids:[id], count:6 }
 * ============================================================ */
import { handle, ok } from "../../_lib.js";
import { seedRobotScenarios } from "../../_robot.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const result = await seedRobotScenarios(env, userId || "");
    return ok(Object.assign({ ids: result.orders, count: result.orders.length }, result));
  });
}

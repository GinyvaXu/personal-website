/* ============================================================
 * POST /api/liuyin/admin/robot/run   { n }   (需 x-ly-admin)
 * 立即连跑 n 个机器人动作（绕过节流，管理页调试用）。
 * ============================================================ */
import { handle, ok, optIntRange } from "../../_lib.js";
import { runRobot, getRobotLog } from "../../_robot.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const n = optIntRange(body, "n", 1, 30, 5, "连跑次数");
    const actions = await runRobot(env, n);
    return ok({
      requested: n,
      count: actions.length,
      actions,
      log: await getRobotLog(env, 30),
    });
  });
}

/* ============================================================
 * GET  /api/liuyin/admin/robot/log   → { log: [{id,text,at}], logs: [{text,created_at}] }
 * POST /api/liuyin/admin/robot/log {clear:true} → 清空机器人日志
 * 日志最多保留 30 条（_robot.pushRobotLog 里裁剪）。
 * ============================================================ */
import { handle, ok, optBool } from "../../_lib.js";
import { getRobotLog } from "../../_robot.js";

function withAlias(log) {
  return {
    log,
    logs: log.map((l) => ({ id: l.id, text: l.text, at: l.at, created_at: l.at })),
    total: log.length,
  };
}

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    return ok(withAlias(await getRobotLog(env, 30)));
  });
}

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const clear = optBool(body, "clear", true);
    if (clear) {
      await env.DB.prepare("DELETE FROM ly_robot_log").run();
      return ok(Object.assign({ cleared: true }, withAlias([])));
    }
    return ok(Object.assign({ cleared: false }, withAlias(await getRobotLog(env, 30))));
  });
}

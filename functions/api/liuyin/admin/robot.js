/* ============================================================
 * GET  /api/liuyin/admin/robot          → { config, log, neighbors }
 * POST /api/liuyin/admin/robot {config} → { config, log }
 *   config 可整体放在 body.config，也可平铺在 body 上。
 * ============================================================ */
import { handle, ok, optBool, optIntRange, ApiError } from "../_lib.js";
import { getRobotConfig, setRobotConfig, getRobotLog, listDemoNeighbors } from "../_robot.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    return ok({
      config: await getRobotConfig(env),
      log: await getRobotLog(env, 30),
      neighbors: (await listDemoNeighbors(env)).map((n) => ({
        id: n.id,
        name: String(n.nickname || n.name),
        avatar: n.avatar,
        floor: Number(n.floor),
      })),
    });
  });
}

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const raw = body && typeof body.config === "object" && body.config ? body.config : body || {};
    const patch = {};
    if (raw.enabled !== undefined) patch.enabled = optBool(raw, "enabled", true);
    if (raw.interval_sec !== undefined) patch.interval_sec = optIntRange(raw, "interval_sec", 2, 600, 5, "轮询间隔");
    if (raw.max_actions !== undefined) patch.max_actions = optIntRange(raw, "max_actions", 1, 20, 1, "单轮动作数");
    for (const key of ["auto_accept", "auto_connect", "auto_steps", "auto_confirm", "random_chat"]) {
      if (raw[key] !== undefined) patch[key] = optBool(raw, key, true);
    }
    if (raw.chat_chance !== undefined) patch.chat_chance = optIntRange(raw, "chat_chance", 0, 100, 30, "聊天概率");
    if (raw.pool_min !== undefined) patch.pool_min = optIntRange(raw, "pool_min", 0, 20, 2, "池底数量");

    if (!Object.keys(patch).length) throw new ApiError(400, "没有可更新的机器人配置");
    const config = await setRobotConfig(env, patch);
    return ok({ config, log: await getRobotLog(env, 30) });
  });
}

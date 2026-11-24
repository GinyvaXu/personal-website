/* ============================================================
 * POST /api/liuyin/admin/seed   (需 x-ly-admin)
 * 铺演示楼栋（幂等）：6 个机器人邻居 + 3 条待接单 + 1 张顺路卡 +
 * 点灯 18/30 + 口令 7241 + 机器人配置默认开启。
 * ============================================================ */
import { handle, ok } from "../_lib.js";
import { seedDemoBuilding } from "../_robot.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env }) => {
    const result = await seedDemoBuilding(env);
    return ok(Object.assign({ hint: "现在进楼就能看到邻居的待接单，机器人会在 /sync 时配合你。" }, result));
  });
}

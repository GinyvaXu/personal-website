/* ============================================================
 * POST /api/liuyin/logout
 * 服务端不强制失效（弱账户，token 就是身份）；前端删掉 localStorage 即可。
 * 顺手把 last_seen 清空，让本层名单立刻显示「离线」。
 * ============================================================ */
import { handle, json } from "./_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "optional" }, async ({ env, user }) => {
    if (user) {
      try {
        await env.DB.prepare("UPDATE ly_users SET last_seen = NULL WHERE id = ?").bind(user.id).run();
      } catch (e) {
        /* 忽略 */
      }
    }
    return json({ ok: true, data: { loggedOut: true } });
  });
}

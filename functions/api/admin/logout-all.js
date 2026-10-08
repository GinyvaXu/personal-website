/* ============================================================
 * POST /api/admin/logout-all（需登录）
 *   - 会话 epoch +1：所有已签发的登录会话（含其他设备/被窃 token）全部立即失效
 *   - 同时清除当前设备的 Cookie
 * ============================================================ */
import { json, bumpSessionEpoch, sessionClearCookie } from "../../_lib/utils.js";

export async function onRequestPost(context) {
  const { env } = context;
  if (!env.SITE_KV && !env.FILES_KV) {
    return json({ ok: false, error: "缺少 KV 绑定" }, 503);
  }
  const epoch = await bumpSessionEpoch(env);
  return json({ ok: true, epoch }, 200, { "Set-Cookie": sessionClearCookie() });
}

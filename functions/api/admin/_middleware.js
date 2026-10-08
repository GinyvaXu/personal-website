/* ============================================================
 * /api/admin/* 鉴权中间件
 *   - 放行 /api/admin/login
 *   - 其余接口必须持有有效的签名 Cookie
 * ============================================================ */
import { json, verifySession } from "../../_lib/utils.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/api/admin/login") return next();

  if (!env.SESSION_SECRET) {
    return json({ ok: false, error: "服务尚未配置（缺少 SESSION_SECRET）" }, 503);
  }
  const ok = await verifySession(request, env);
  if (!ok) return json({ ok: false, error: "未登录或登录已过期" }, 401);

  return next();
}

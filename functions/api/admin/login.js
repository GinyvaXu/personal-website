/* ============================================================
 * POST /api/admin/login  { password }
 *   - 15 分钟内失败 5 次即限流
 *   - 成功写入 HttpOnly 签名 Cookie（7 天）
 * ============================================================ */
import {
  json, sha256hex, constantTimeEqual, createSession, sessionSetCookie, keyedIpHash,
} from "../../_lib/utils.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ ok: false, error: "管理员密码尚未配置" }, 503);
  }

  const ipHash = await keyedIpHash(request, env.SESSION_SECRET);
  try {
    if (env.DB) {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND created_at > datetime('now','-15 minutes')"
      ).bind(ipHash).first();
      if (row && row.n >= 5) return json({ ok: false, error: "尝试次数过多，请 15 分钟后再试" }, 429);
    }
  } catch (e) { /* 表不存在等情况直接放行到密码校验 */ }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const pass = typeof body.password === "string" ? body.password : "";

  const [ha, hb] = await Promise.all([sha256hex(pass), sha256hex(env.ADMIN_PASSWORD)]);
  const ok = constantTimeEqual(ha, hb);

  if (!ok) {
    try {
      if (env.DB) {
        await env.DB.prepare("INSERT INTO login_attempts (ip_hash, created_at) VALUES (?, datetime('now'))").bind(ipHash).run();
      }
    } catch (e) { /* 忽略 */ }
    return json({ ok: false, error: "密码不正确" }, 401);
  }

  const token = await createSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, { "Set-Cookie": sessionSetCookie(token) });
}

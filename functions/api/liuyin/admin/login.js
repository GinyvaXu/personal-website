/* ============================================================
 * POST /api/liuyin/admin/login   { password }
 *   → { token }  （HMAC 签名，12 小时，放请求头 x-ly-admin）
 * ============================================================ */
import { handle, json, ApiError, sha256hex, constantTimeEqual, adminToken } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none" }, async ({ env, body }) => {
    if (!env.ADMIN_PASSWORD) throw new ApiError(503, "管理员密码还没配置");
    const pass = typeof body.password === "string" ? body.password : "";
    if (!pass) throw new ApiError(400, "请填写管理密码");

    const [a, b] = await Promise.all([sha256hex(pass), sha256hex(env.ADMIN_PASSWORD)]);
    if (!constantTimeEqual(a, b)) throw new ApiError(401, "密码不正确");

    const token = await adminToken(env);
    return json({ ok: true, data: { token }, token });
  });
}

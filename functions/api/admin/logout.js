/* ============================================================
 * POST /api/admin/logout → 清除会话 Cookie
 * ============================================================ */
import { json, sessionClearCookie } from "../../_lib/utils.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "Set-Cookie": sessionClearCookie() });
}

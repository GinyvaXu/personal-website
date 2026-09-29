/* ============================================================
 * GET /api/admin/session → 会话有效性检查（中间件已鉴权）
 * ============================================================ */
import { json } from "../../_lib/utils.js";

export async function onRequestGet() {
  return json({ ok: true, loggedIn: true });
}

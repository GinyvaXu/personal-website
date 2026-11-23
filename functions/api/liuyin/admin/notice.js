/* ============================================================
 * POST /api/liuyin/admin/notice   { text }   全站公告（存 ly_settings）
 * ============================================================ */
import { handle, ok, optStr } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const text = optStr(body, "text", 200, "公告", false) || "";
    await env.DB.prepare("INSERT OR REPLACE INTO ly_settings (key, value) VALUES ('notice', ?)")
      .bind(text)
      .run();
    return ok({ notice: text });
  });
}

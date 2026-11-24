/* ============================================================
 * GET  /api/liuyin/admin/notice   → { notice }
 * POST /api/liuyin/admin/notice   { text }   全站公告（存 ly_settings）
 * ============================================================ */
import { handle, ok, optStr, getSetting, setSetting } from "../_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "none", admin: true, body: false }, async ({ env }) => {
    return ok({ notice: await getSetting(env.DB, "notice", "") });
  });
}

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    /* 兼容前端同时发 {text, notice} 两种字段名 */
    const raw = body.text !== undefined ? body.text : body.notice;
    const text = optStr({ text: raw }, "text", 200, "公告", false) || "";
    await setSetting(env.DB, "notice", text);
    return ok({ notice: text, text });
  });
}

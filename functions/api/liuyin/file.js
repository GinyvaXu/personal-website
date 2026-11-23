/* ============================================================
 * GET /api/liuyin/file?key=u_xxx/o_xxx.jpg
 *   从 R2 读回图片；Cache-Control: private, max-age=600
 * ============================================================ */
import { handle, ApiError } from "./_lib.js";

const KEY_RE = /^[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_.-]{1,80}$/;

export async function onRequestGet(context) {
  return handle(context, { auth: "none", body: false }, async ({ env, url }) => {
    if (!env.FILES) throw new ApiError(503, "图片存储还没接上");
    const key = (url.searchParams.get("key") || "").trim();
    if (!key || !KEY_RE.test(key) || key.indexOf("..") !== -1) {
      throw new ApiError(400, "图片 key 不合法");
    }

    const obj = await env.FILES.get("ly/" + key);
    if (!obj) throw new ApiError(404, "图片不存在");

    const contentType =
      (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream";
    return new Response(obj.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

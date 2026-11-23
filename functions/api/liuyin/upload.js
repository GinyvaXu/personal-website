/* ============================================================
 * POST /api/liuyin/upload   (multipart: file|photo|image)
 *   ≤2MB，只收 jpg / png / webp（按文件头判断，不信 MIME）
 *   → { key, url }   存 R2：ly/<key>
 * ============================================================ */
import { handle, json, ApiError, makeId } from "./_lib.js";

const MAX_BYTES = 2 * 1024 * 1024;

export async function onRequestPost(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, request, user }) => {
    if (!env.FILES) throw new ApiError(503, "图片存储还没接上，稍后再试");

    let form = null;
    try {
      form = await request.formData();
    } catch (e) {
      throw new ApiError(400, "请用 multipart/form-data 上传图片");
    }
    const file = form.get("file") || form.get("photo") || form.get("image");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
      throw new ApiError(400, "没有收到图片文件");
    }
    if (Number(file.size) > MAX_BYTES) throw new ApiError(400, "图片不能超过 2MB");

    const buf = await file.arrayBuffer();
    if (!buf.byteLength) throw new ApiError(400, "图片是空的");
    if (buf.byteLength > MAX_BYTES) throw new ApiError(400, "图片不能超过 2MB");

    const type = sniffType(buf);
    if (!type) throw new ApiError(400, "只支持 jpg / png / webp 图片");

    const prefix = String(user.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "u_anon";
    const key = prefix + "/o_" + makeId("") + "." + type.ext;
    await env.FILES.put("ly/" + key, buf, { httpMetadata: { contentType: type.mime } });

    return json({ ok: true, data: { key, url: "/api/liuyin/file?key=" + encodeURIComponent(key) } });
  });
}

function sniffType(buf) {
  const b = new Uint8Array(buf);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ext: "png", mime: "image/png" };
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

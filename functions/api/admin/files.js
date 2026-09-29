/* ============================================================
 * /api/admin/files（需登录）
 *   GET    ?key=xxx   下载指定文件；不带 key 则列出全部
 *   POST   multipart  上传（单文件 ≤ 25MB，存到 R2 的 files/ 前缀）
 *   DELETE ?key=xxx   删除
 * ============================================================ */
import { json } from "../../_lib/utils.js";

const MAX_SIZE = 25 * 1024 * 1024;

function requireBucket(env) {
  if (!env.FILES) return json({ ok: false, error: "缺少 R2 绑定（FILES）" }, 503);
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const missing = requireBucket(env);
  if (missing) return missing;

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (key) {
    if (!key.startsWith("files/")) return json({ ok: false, error: "非法路径" }, 400);
    const obj = await env.FILES.get(key);
    if (!obj) return json({ ok: false, error: "文件不存在" }, 404);
    const name = key.split("/").pop() || "download";
    return new Response(obj.body, {
      headers: {
        "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name),
        "Cache-Control": "no-store",
      },
    });
  }

  const list = await env.FILES.list({ limit: 500 });
  const files = (list.objects || []).map((o) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
  }));
  files.sort((a, b) => (b.uploaded || "").localeCompare(a.uploaded || ""));
  return json({ ok: true, files });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const missing = requireBucket(env);
  if (missing) return missing;

  let form;
  try { form = await request.formData(); } catch (e) {
    return json({ ok: false, error: "请求格式错误" }, 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "没有收到文件" }, 400);
  if (file.size > MAX_SIZE) return json({ ok: false, error: "文件太大（上限 25MB）" }, 413);

  const safe = String(file.name || "file")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .slice(0, 120) || "file";
  const key = "files/" + Date.now() + "-" + safe;

  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  return json({ ok: true, key, name: safe, size: file.size });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const missing = requireBucket(env);
  if (missing) return missing;

  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("files/")) return json({ ok: false, error: "非法路径" }, 400);
  await env.FILES.delete(key);
  return json({ ok: true });
}

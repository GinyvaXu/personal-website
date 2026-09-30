/* ============================================================
 * /api/admin/files（需登录）
 *   GET    ?key=xxx   下载指定文件；不带 key 则列出全部
 *   POST   multipart  上传（单文件 ≤ 24MB）
 *   DELETE ?key=xxx   删除
 *
 * 存储后端双支持：
 *   - 优先使用 R2（绑定名 FILES）
 *   - 未开通 R2 时自动回退到 KV（绑定名 FILES_KV）
 * ============================================================ */
import { json } from "../../_lib/utils.js";

const MAX_SIZE = 24 * 1024 * 1024; // 24MB（KV 单值上限 25MiB，留安全余量）

function pickStore(env) {
  if (env.FILES) return { kind: "r2", r2: env.FILES };
  if (env.FILES_KV) return { kind: "kv", kv: env.FILES_KV };
  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const store = pickStore(env);
  if (!store) return json({ ok: false, error: "缺少存储绑定（FILES 或 FILES_KV）" }, 503);

  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  /* ---------- 下载单个文件 ---------- */
  if (key) {
    if (!key.startsWith("files/")) return json({ ok: false, error: "非法路径" }, 400);
    const name = key.split("/").pop() || "download";

    if (store.kind === "r2") {
      const obj = await store.r2.get(key);
      if (!obj) return json({ ok: false, error: "文件不存在" }, 404);
      return new Response(obj.body, {
        headers: {
          "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
          "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name),
          "Cache-Control": "no-store",
        },
      });
    }

    const got = await store.kv.getWithMetadata(key, "arrayBuffer");
    if (!got || got.value == null) return json({ ok: false, error: "文件不存在" }, 404);
    const meta = got.metadata || {};
    return new Response(got.value, {
      headers: {
        "Content-Type": meta.contentType || "application/octet-stream",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(name),
        "Cache-Control": "no-store",
      },
    });
  }

  /* ---------- 列表 ---------- */
  let files = [];
  if (store.kind === "r2") {
    const list = await store.r2.list({ limit: 500 });
    files = (list.objects || []).map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
    }));
  } else {
    const list = await store.kv.list({ limit: 500 });
    files = (list.keys || []).map((k) => {
      const meta = k.metadata || {};
      return { key: k.name, size: meta.size || null, uploaded: meta.uploaded || null };
    });
  }
  files.sort((a, b) => String(b.uploaded || "").localeCompare(String(a.uploaded || "")));
  return json({ ok: true, files, backend: store.kind });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const store = pickStore(env);
  if (!store) return json({ ok: false, error: "缺少存储绑定（FILES 或 FILES_KV）" }, 503);

  let form;
  try { form = await request.formData(); } catch (e) {
    return json({ ok: false, error: "请求格式错误" }, 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ ok: false, error: "没有收到文件" }, 400);
  if (file.size > MAX_SIZE) return json({ ok: false, error: "文件太大（上限 24MB）" }, 413);

  const safe = String(file.name || "file")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .slice(0, 120) || "file";
  const key = "files/" + Date.now() + "-" + safe;
  const contentType = file.type || "application/octet-stream";

  if (store.kind === "r2") {
    await store.r2.put(key, file.stream(), { httpMetadata: { contentType } });
  } else {
    const buf = await file.arrayBuffer();
    await store.kv.put(key, buf, {
      metadata: { size: file.size, uploaded: new Date().toISOString(), contentType, name: safe },
    });
  }
  return json({ ok: true, key, name: safe, size: file.size, backend: store.kind });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const store = pickStore(env);
  if (!store) return json({ ok: false, error: "缺少存储绑定（FILES 或 FILES_KV）" }, 503);

  const key = new URL(request.url).searchParams.get("key") || "";
  if (!key.startsWith("files/")) return json({ ok: false, error: "非法路径" }, 400);
  if (store.kind === "r2") await store.r2.delete(key);
  else await store.kv.delete(key);
  return json({ ok: true });
}

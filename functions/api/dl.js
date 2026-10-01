/* ============================================================
 * /api/dl（公开）
 *   GET ?p=<项目>&f=<文件名> → 记一次下载（D1）后 302 跳到 R2 镜像
 * 仅允许镜像管线内的 7 个项目，文件名禁止路径符号（防开放跳转）
 * ============================================================ */
import { json, sha256hex, clientIp } from "../_lib/utils.js";
import { ensureTables } from "../_lib/db.js";

const PROJECTS = ["projectdock", "agentfloat", "cloudbox", "ginyscreen", "nottingham", "claudefloat", "hexwar"];

async function record(env, p, f, request) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = await sha256hex(clientIp(request) + "|dl-v1");
  const run = () =>
    env.DB.prepare("INSERT INTO downloads (project, file, ip_hash, day) VALUES (?, ?, ?, ?)")
      .bind(p, f, ip, day)
      .run();
  try {
    await run();
  } catch (e) {
    try { await ensureTables(env.DB); await run(); } catch (e2) {}
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const p = (url.searchParams.get("p") || "").toLowerCase();
  const f = url.searchParams.get("f") || "";

  if (PROJECTS.indexOf(p) < 0) return json({ ok: false, error: "未知项目" }, 400);
  if (!f || f.length > 200 || /[\\/]|\.\./.test(f)) return json({ ok: false, error: "非法文件名" }, 400);

  if (env.DB && context.waitUntil) {
    context.waitUntil(record(env, p, f, request));
  }

  return Response.redirect(
    "https://dl.ginyva.site/releases/" + p + "/latest/" + encodeURIComponent(f),
    302
  );
}

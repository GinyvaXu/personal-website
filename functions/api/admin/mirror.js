/* ============================================================
 * /api/admin/mirror（需登录）
 *   GET  → 最近 5 次镜像 workflow 运行状态
 *   POST → 触发 mirror-releases.yml（workflow_dispatch）
 *   PUT  → 保存 / 清除 GitHub Token（存 KV：site/gh_token）
 * Token 优先取环境变量 GITHUB_TOKEN，其次 KV
 * ============================================================ */
import { json } from "../../_lib/utils.js";

const REPO = "GinyvaXu/personal-website";
const WF = "mirror-releases.yml";

async function getToken(env) {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const kv = env.SITE_KV || env.FILES_KV;
  if (kv) {
    try {
      const t = await kv.get("site/gh_token");
      if (t) return t;
    } catch (e) {}
  }
  return null;
}

function ghHeaders(t) {
  return {
    Authorization: "Bearer " + t,
    Accept: "application/vnd.github+json",
    "User-Agent": "ginyva-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function onRequestGet(context) {
  const { env } = context;
  const t = await getToken(env);
  if (!t) return json({ ok: true, hasToken: false, runs: [] });

  const r = await fetch(
    "https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/runs?per_page=5",
    { headers: ghHeaders(t) }
  );
  if (!r.ok) {
    let msg = "GitHub API " + r.status;
    try { const e = await r.json(); if (e && e.message) msg = e.message; } catch (e2) {}
    return json({ ok: false, hasToken: true, error: msg, runs: [] });
  }
  const d = await r.json();
  const runs = (d.workflow_runs || []).map(function (x) {
    return { id: x.id, status: x.status, conclusion: x.conclusion, created: x.created_at, event: x.event, url: x.html_url };
  });
  return json({ ok: true, hasToken: true, runs });
}

export async function onRequestPost(context) {
  const { env } = context;
  const t = await getToken(env);
  if (!t) return json({ ok: false, needToken: true, error: "还没有配置 GitHub Token：在下方粘贴一次即可（需要 actions:write 权限）" }, 400);

  const r = await fetch(
    "https://api.github.com/repos/" + REPO + "/actions/workflows/" + WF + "/dispatches",
    {
      method: "POST",
      headers: Object.assign(ghHeaders(t), { "Content-Type": "application/json" }),
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (r.status === 204) return json({ ok: true });
  let msg = "GitHub API " + r.status;
  try { const e = await r.json(); if (e && e.message) msg = e.message; } catch (e2) {}
  return json({ ok: false, error: msg }, 502);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const kv = env.SITE_KV || env.FILES_KV;
  if (!kv) return json({ ok: false, error: "缺少 KV 绑定" }, 503);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const t = String(body.token || "").trim();
  if (!t) {
    await kv.delete("site/gh_token");
    return json({ ok: true, cleared: true });
  }
  if (!/^(gh[po]_|github_pat_)/.test(t)) {
    return json({ ok: false, error: "看起来不像是 GitHub Token（应以 ghp_ / gho_ / github_pat_ 开头）" }, 400);
  }
  await kv.put("site/gh_token", t);
  return json({ ok: true });
}

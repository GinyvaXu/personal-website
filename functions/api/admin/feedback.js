/* ============================================================
 * /api/admin/feedback（需登录）
 *   GET    ?limit=200        全部反馈（含隐藏）
 *   PATCH  {id,status,reply} 更新状态 / 回复
 *   DELETE ?id=              删除一条
 * ============================================================ */
import { json } from "../../_lib/utils.js";

const STATUSES = new Set(["new", "planned", "doing", "done", "hidden"]);

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "缺少 D1 绑定" }, 503);
  const limit = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("limit") || "200", 10) || 200, 1), 500);
  try {
    const res = await env.DB.prepare(
      "SELECT id, project, name, contact, message, status, reply, created_at, updated_at FROM feedback ORDER BY id DESC LIMIT ?"
    ).bind(limit).all();
    return json({ ok: true, items: res.results || [] });
  } catch (e) {
    return json({ ok: false, error: "查询失败：" + e.message }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "缺少 D1 绑定" }, 503);
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const id = parseInt(body.id, 10);
  const status = String(body.status || "");
  const reply = String(body.reply || "").slice(0, 600);
  if (!id || !STATUSES.has(status)) return json({ ok: false, error: "参数不合法" }, 400);
  try {
    await env.DB.prepare(
      "UPDATE feedback SET status = ?, reply = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(status, reply, id).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "更新失败：" + e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "缺少 D1 绑定" }, 503);
  const id = parseInt(new URL(request.url).searchParams.get("id") || "", 10);
  if (!id) return json({ ok: false, error: "缺少 id" }, 400);
  try {
    await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "删除失败：" + e.message }, 500);
  }
}

/* ============================================================
 * /api/feedback
 *   GET  ?limit=50  公开反馈列表（不含 hidden，不返回联系方式）
 *   POST            提交反馈（限流 + 蜜罐 + 长度校验）
 * ============================================================ */
import { json, keyedIpHash } from "../_lib/utils.js";

const MAX_MESSAGE = 800;
const MIN_MESSAGE = 4;
const MAX_NAME = 24;
const MAX_CONTACT = 100;
const RATE_LIMIT_PER_HOUR = 8;

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "服务尚未配置（缺少 D1 绑定）" }, 503);
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
  try {
    const res = await env.DB.prepare(
      "SELECT id, project, name, message, status, reply, created_at FROM feedback " +
      "WHERE status != 'hidden' ORDER BY id DESC LIMIT ?"
    ).bind(limit).all();
    return json({ ok: true, items: res.results || [] });
  } catch (e) {
    return json({ ok: false, error: "数据库查询失败：" + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ ok: false, error: "服务尚未配置（缺少 D1 绑定）" }, 503);

  let body = {};
  try {
    const text = await request.text();
    if (text.length > 8192) return json({ ok: false, error: "请求过大" }, 413);
    body = JSON.parse(text || "{}");
  } catch (e) {
    return json({ ok: false, error: "请求格式错误" }, 400);
  }

  // 蜜罐：机器人填了就假装成功，不写库
  if (body._hp) return json({ ok: true, item: null });

  const message = String(body.message || "").trim();
  const name = String(body.name || "").trim().slice(0, MAX_NAME);
  const contact = String(body.contact || "").trim().slice(0, MAX_CONTACT);
  const project = /^[a-z0-9-]{1,40}$/.test(String(body.project || "")) ? String(body.project) : "general";

  if (message.length < MIN_MESSAGE || message.length > MAX_MESSAGE) {
    return json({ ok: false, error: "反馈内容请控制在 " + MIN_MESSAGE + "–" + MAX_MESSAGE + " 字之间" }, 400);
  }

  const ipHash = await keyedIpHash(request, env.SESSION_SECRET || "fallback");
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > datetime('now','-1 hour')"
    ).bind(ipHash).first();
    if (row && row.n >= RATE_LIMIT_PER_HOUR) {
      return json({ ok: false, error: "提交太频繁了，请稍后再试" }, 429);
    }

    const ins = await env.DB.prepare(
      "INSERT INTO feedback (project, name, contact, message, status, ip_hash, created_at) " +
      "VALUES (?, ?, ?, ?, 'new', ?, datetime('now'))"
    ).bind(project, name, contact, message, ipHash).run();

    const id = ins.meta && ins.meta.last_row_id ? ins.meta.last_row_id : null;
    let item = null;
    if (id) {
      item = await env.DB.prepare(
        "SELECT id, project, name, message, status, reply, created_at FROM feedback WHERE id = ?"
      ).bind(id).first();
    }
    return json({ ok: true, item: item });
  } catch (e) {
    return json({ ok: false, error: "写入失败：" + e.message }, 500);
  }
}

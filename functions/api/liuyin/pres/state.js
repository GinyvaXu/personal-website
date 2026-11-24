/* ============================================================
 * POST /api/liuyin/pres/state  { room, page, started }  —— 演示页上报当前页
 * GET  /api/liuyin/pres/state?room=finals              —— 手机端读当前页
 * 入口补惰性迁移，保证 ly_pres_* 表存在。
 * ============================================================ */
import { ensureSchema } from "../_migrate.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: '请求格式不正确，需要 JSON' }), { status: 400, headers: cors });
  }
  const room = String(body.room || 'finals').slice(0, 32);
  const page = Math.max(0, Math.min(40, parseInt(body.page, 10) || 0));
  const started = body.started ? 1 : 0;
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ ok: false, error: '数据库未绑定' }), { status: 500, headers: cors });
  try { await ensureSchema(env); } catch (e) { /* 忽略 */ }

  await db.prepare(`INSERT INTO ly_pres_state(room, page, started, updated_at) VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(room) DO UPDATE SET page = excluded.page, started = excluded.started, updated_at = excluded.updated_at`)
    .bind(room, page, started).run();

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = {
    'access-control-allow-origin': '*',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  const room = (new URL(request.url).searchParams.get('room') || 'finals').slice(0, 32);
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ ok: false, error: '数据库未绑定' }), { status: 500, headers: cors });
  try { await ensureSchema(env); } catch (e) { /* 忽略 */ }

  const row = await db.prepare('SELECT page, started, updated_at FROM ly_pres_state WHERE room = ?').bind(room).first();
  return new Response(JSON.stringify({
    ok: true,
    data: {
      page: row ? row.page : 0,
      started: row ? !!row.started : false,
      updated_at: row ? row.updated_at : null,
      stale: row ? (Date.now() - new Date(row.updated_at + 'Z').getTime() > 8000) : true,
    },
  }), { headers: cors });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' },
  });
}

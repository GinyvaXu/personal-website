/* ============================================================
 * GET /api/liuyin/pres/poll?room=finals&after=12
 * 演示页每 0.7 秒调一次，取走 after 之后的命令。入口补惰性迁移。
 * ============================================================ */
import { ensureSchema } from "../_migrate.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const cors = {
    'access-control-allow-origin': '*',
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  const url = new URL(request.url);
  const room = (url.searchParams.get('room') || 'finals').slice(0, 32);
  const after = parseInt(url.searchParams.get('after') || '0', 10) || 0;

  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ ok: false, error: '数据库未绑定' }), { status: 500, headers: cors });
  try { await ensureSchema(env); } catch (e) { /* 忽略 */ }

  const cmds = await db
    .prepare('SELECT id, cmd, arg, created_at FROM ly_pres_cmd WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 20')
    .bind(room, after)
    .all();

  const results = cmds.results || [];
  return new Response(JSON.stringify({
    ok: true,
    data: {
      cmds: results.map((c) => ({ id: c.id, cmd: c.cmd, arg: c.arg, ts: c.created_at })),
      latest: results.length ? results[results.length - 1].id : after,
      server_time: new Date().toISOString(),
    },
  }), { headers: cors });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,OPTIONS' } });
}

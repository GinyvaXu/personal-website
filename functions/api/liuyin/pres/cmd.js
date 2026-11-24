/* ============================================================
 * 路演提词台 · 兼容旧路径
 * POST /api/liuyin/pres/cmd  { room, cmd, arg }
 * 说明：保留原有逻辑，仅在入口补一次惰性迁移，保证 ly_pres_* 表存在。
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
  const fail = (code, msg) => new Response(JSON.stringify({ ok: false, error: msg }), { status: code, headers: cors });

  let body;
  try { body = await request.json(); } catch { return fail(400, '请求格式不正确，需要 JSON'); }

  const room = String(body.room || 'finals').slice(0, 32);
  const cmd = String(body.cmd || '').slice(0, 16);
  const arg = body.arg == null ? null : String(body.arg).slice(0, 32);

  const ALLOWED = ['next', 'prev', 'go', 'reset', 'start', 'act'];
  if (!ALLOWED.includes(cmd)) return fail(400, '不认识的命令：' + cmd);
  if (cmd === 'go') {
    const n = parseInt(arg, 10);
    if (!Number.isFinite(n) || n < 0 || n > 40) return fail(400, '页码不合法');
  }

  const db = env.DB;
  if (!db) return fail(500, '数据库未绑定');
  try { await ensureSchema(env); } catch (e) { /* 迁移失败时仍尝试执行 */ }

  // 顺手清理 2 小时前的旧命令，队列不会无限长
  await db.prepare("DELETE FROM ly_pres_cmd WHERE created_at < datetime('now','-2 hours')").run();

  const r = await db.prepare('INSERT INTO ly_pres_cmd(room, cmd, arg) VALUES (?, ?, ?)').bind(room, cmd, arg).run();
  return new Response(JSON.stringify({ ok: true, data: { id: r.meta && r.meta.last_row_id, cmd, arg } }), { headers: cors });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
  });
}

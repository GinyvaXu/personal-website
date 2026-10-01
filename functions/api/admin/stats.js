/* ============================================================
 * /api/admin/stats（需登录）
 * 访问统计 + 下载统计聚合（D1）
 * ============================================================ */
import { json } from "../../_lib/utils.js";
import { ensureTables } from "../../_lib/db.js";

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ ok: false, error: "缺少 D1 绑定" }, 503);

  try { await ensureTables(env.DB); } catch (e) {}

  const q = async (sql, ...args) => {
    try {
      const r = await env.DB.prepare(sql).bind(...args).all();
      return r.results || [];
    } catch (e) {
      return [];
    }
  };
  const one = (rows) => (rows && rows[0] && rows[0].c != null ? rows[0].c : 0);
  const today = new Date().toISOString().slice(0, 10);

  const pvToday = one(await q("SELECT COUNT(*) c FROM pageviews WHERE day = ?", today));
  const pv7 = one(await q("SELECT COUNT(*) c FROM pageviews WHERE day >= date('now','-6 days')"));
  const uv7 = one(await q("SELECT COUNT(DISTINCT visitor) c FROM pageviews WHERE day >= date('now','-6 days')"));
  const pvAll = one(await q("SELECT COUNT(*) c FROM pageviews"));
  const dlToday = one(await q("SELECT COUNT(*) c FROM downloads WHERE day = ?", today));
  const dlAll = one(await q("SELECT COUNT(*) c FROM downloads"));

  return json({
    ok: true,
    today,
    pv: { today: pvToday, d7: pv7, uv7, total: pvAll },
    dl: { today: dlToday, total: dlAll },
    trend: await q("SELECT day, COUNT(*) pv, COUNT(DISTINCT visitor) uv FROM pageviews WHERE day >= date('now','-13 days') GROUP BY day ORDER BY day"),
    topPaths: await q("SELECT path, COUNT(*) c FROM pageviews WHERE day >= date('now','-29 days') GROUP BY path ORDER BY c DESC LIMIT 12"),
    topHosts: await q("SELECT host, COUNT(*) c FROM pageviews WHERE day >= date('now','-29 days') GROUP BY host ORDER BY c DESC LIMIT 8"),
    dlByProject: await q("SELECT project, COUNT(*) c FROM downloads GROUP BY project ORDER BY c DESC LIMIT 12"),
  });
}

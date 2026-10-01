/* ============================================================
 * /api/site-config（公开 · 只读）
 * 返回全站运营配置：公告 / 项目排序 / 隐藏列表
 * 数据存 KV（FILES_KV）：site/announce、site/order
 * ============================================================ */
import { json } from "../_lib/utils.js";

const TYPES = ["info", "promo", "warn"];

export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.SITE_KV || env.FILES_KV;

  let announce = null;
  let order = null;
  let hidden = [];

  if (kv) {
    try {
      const a = await kv.get("site/announce", "json");
      if (a && a.enabled && a.text) {
        announce = {
          text: String(a.text).slice(0, 300),
          link: String(a.link || "").slice(0, 400),
          type: TYPES.indexOf(a.type) > -1 ? a.type : "info",
        };
      }
    } catch (e) {}
    try {
      const o = await kv.get("site/order", "json");
      if (o) {
        if (Array.isArray(o.order)) order = o.order.slice(0, 50).map(String);
        if (Array.isArray(o.hidden)) hidden = o.hidden.slice(0, 50).map(String);
      }
    } catch (e) {}
  }

  return json({ ok: true, announce, order, hidden }, 200, { "Cache-Control": "public, max-age=60" });
}

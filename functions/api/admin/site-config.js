/* ============================================================
 * /api/admin/site-config（需登录）
 *   GET → 当前公告与排序原始配置
 *   PUT → 保存公告 { announce } 与排序 { order, hidden }
 * ============================================================ */
import { json } from "../../_lib/utils.js";

const TYPES = ["info", "promo", "warn"];

function kvOf(env) {
  return env.SITE_KV || env.FILES_KV || null;
}

export async function onRequestGet(context) {
  const { env } = context;
  const kv = kvOf(env);
  if (!kv) return json({ ok: false, error: "缺少 KV 绑定" }, 503);

  let announce = { enabled: false, text: "", link: "", type: "info" };
  let order = { order: [], hidden: [] };
  try {
    const a = await kv.get("site/announce", "json");
    if (a) announce = Object.assign(announce, a);
  } catch (e) {}
  try {
    const o = await kv.get("site/order", "json");
    if (o) {
      order = {
        order: Array.isArray(o.order) ? o.order : [],
        hidden: Array.isArray(o.hidden) ? o.hidden : [],
      };
    }
  } catch (e) {}
  return json({ ok: true, announce, order });
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const kv = kvOf(env);
  if (!kv) return json({ ok: false, error: "缺少 KV 绑定" }, 503);

  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "请求格式错误" }, 400); }

  if (body.announce && typeof body.announce === "object") {
    const a = body.announce;
    await kv.put("site/announce", JSON.stringify({
      enabled: !!a.enabled,
      text: String(a.text || "").slice(0, 300),
      link: String(a.link || "").slice(0, 400),
      type: TYPES.indexOf(a.type) > -1 ? a.type : "info",
      updatedAt: new Date().toISOString(),
    }));
  }

  if (Array.isArray(body.order) || Array.isArray(body.hidden)) {
    await kv.put("site/order", JSON.stringify({
      order: (Array.isArray(body.order) ? body.order : []).slice(0, 50).map(String),
      hidden: (Array.isArray(body.hidden) ? body.hidden : []).slice(0, 50).map(String),
      updatedAt: new Date().toISOString(),
    }));
  }

  return json({ ok: true });
}

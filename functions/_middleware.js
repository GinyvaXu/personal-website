/* ============================================================
 * Cloudflare Pages Function（中间件）
 * 作用：
 *   1. 裸域 ginyva.site 301 跳转到 www.ginyva.site；
 *   2. 按访问的子域名，把项目本地路径（/、landing.css、landing.js、guide/）
 *      重写到 /projects/<id>/；
 *   3. HTML 页面：非阻塞记录访问统计（D1），并注入全站公告条脚本。
 * 页面实体只有一份：/projects/<id>/index.html
 * 以后新增软件：在 HOST_ROUTES 里加一行映射即可。
 * ============================================================ */
import { ensureTables } from "./_lib/db.js";
import { sha256hex, clientIp } from "./_lib/utils.js";

const HOST_ROUTES = {
  "projectdock.ginyva.site": "/projects/projectdock/",
  "agentfloat.ginyva.site":  "/projects/agentfloat/",
  "cloudbox.ginyva.site":    "/projects/cloudbox/",
  "ginyscreen.ginyva.site":  "/projects/ginyscreen/",
  "nottingham.ginyva.site":  "/projects/nottingham/",
  "claudefloat.ginyva.site": "/projects/claudefloat/",
  "hexwar.ginyva.site":      "/projects/hexwar/",
  "gallery.ginyva.site":     "/projects/gallery/",
};

const APEX = "ginyva.site";
const WWW = "www.ginyva.site";
const ANNOUNCE_SNIPPET = '<script src="/js/site-banner.js" defer></script>';
const BOT = /bot|spider|crawl|slurp|preview|headless|monitor|facebookexternalhit|curl|wget|python-requests/i;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // 裸域统一跳转到 www，避免重复内容
  if (host === APEX) {
    return Response.redirect("https://" + WWW + url.pathname + url.search, 301);
  }

  // 子域名：项目本地路径重写到项目目录；其余路径（/assets、/data、/js、/css 等）原样透传。
  let response = null;
  const target = HOST_ROUTES[host];
  if (target) {
    let sub = url.pathname.replace(/^\//, "");
    if (sub === "guide") sub = "guide/";
    const isLocal = sub === "" || sub === "landing.css" || sub === "landing.js" || sub.startsWith("guide/");
    if (isLocal) {
      const rewritten = new URL(url);
      rewritten.pathname = target + sub;
      response = await context.env.ASSETS.fetch(new Request(rewritten.toString(), context.request));
    }
  }
  if (!response) response = await context.next();

  // HTML 页面：访问打点（不阻塞响应）+ 注入公告条脚本；控制台与 API 除外
  const ct = response.headers.get("Content-Type") || "";
  if (
    context.request.method === "GET" &&
    ct.indexOf("text/html") > -1 &&
    url.pathname.indexOf("/admin") !== 0 &&
    url.pathname.indexOf("/api/") !== 0
  ) {
    if (context.waitUntil) context.waitUntil(trackPageview(context, url, host));
    try {
      response = new HTMLRewriter()
        .on("body", {
          element(el) {
            el.append(ANNOUNCE_SNIPPET, { html: true });
          },
        })
        .transform(response);
    } catch (e) {}
  }
  return response;
}

/* ---------- 访问统计（无 Cookie：日级 IP+UA 哈希做去重） ---------- */
async function trackPageview(context, url, host) {
  try {
    const db = context.env.DB;
    if (!db) return;
    const req = context.request;
    const ua = req.headers.get("User-Agent") || "";
    if (BOT.test(ua)) return;

    let ref = "";
    try {
      const r = req.headers.get("Referer") || "";
      if (r) {
        const ru = new URL(r);
        if (ru.hostname.toLowerCase() !== host) ref = ru.hostname.slice(0, 120);
      }
    } catch (e) {}

    const day = new Date().toISOString().slice(0, 10);
    const visitor = await sha256hex(clientIp(req) + "|" + ua + "|" + day + "|gv1");
    const path = url.pathname.slice(0, 200);

    const insert = () =>
      db
        .prepare("INSERT INTO pageviews (path, host, ref, visitor, day) VALUES (?, ?, ?, ?, ?)")
        .bind(path, host, ref, visitor, day)
        .run();
    try {
      await insert();
    } catch (e) {
      await ensureTables(db);
      await insert();
    }
  } catch (e) {
    /* 统计失败绝不影响页面 */
  }
}

/* ============================================================
 * Cloudflare Pages Function（中间件）
 * 作用：
 *   1. 把裸域 ginyva.site 301 跳转到 www.ginyva.site；
 *   2. 按访问的子域名，把根路径重写到对应的软件独立页
 *      （如 projectdock.ginyva.site/ → /projects/projectdock/）。
 * 页面实体只有一份：/projects/<id>/index.html
 * 以后新增软件：在 HOST_ROUTES 里加一行映射即可。
 * ============================================================ */

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

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // 裸域统一跳转到 www，避免重复内容
  if (host === APEX) {
    return Response.redirect("https://" + WWW + url.pathname + url.search, 301);
  }

  // 子域名根路径 → 对应的软件独立页；/guide/ → 该软件的完整说明页
  const target = HOST_ROUTES[host];
  if (target && (url.pathname === "/" || url.pathname === "/guide" || url.pathname.startsWith("/guide/"))) {
    let sub = url.pathname === "/" ? "" : url.pathname.replace(/^\//, "");
    if (sub === "guide") sub = "guide/";
    const rewritten = new URL(url);
    rewritten.pathname = target + sub;
    return context.env.ASSETS.fetch(new Request(rewritten.toString(), context.request));
  }

  return context.next();
}

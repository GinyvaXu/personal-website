/* ============================================================
 * /api/liuyin/* 目录级中间件
 * 作用：CORS 预检（预览域 *.pages.dev 调生产域时需要）
 * 说明：正常响应头由 _lib.js 的 withCors 统一补，这里只拦住 OPTIONS。
 * ============================================================ */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ly-token, x-ly-admin",
  "Access-Control-Max-Age": "86400",
};

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: Object.assign({}, CORS_HEADERS) });
  }
  return context.next();
}

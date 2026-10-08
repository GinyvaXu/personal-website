/* ============================================================
 * 共用工具：JSON 响应 / 哈希 / HMAC / 会话 Cookie / IP 哈希
 * ============================================================ */

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      headers
    ),
  });
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ---------- 会话 ---------- */

export const SESSION_COOKIE = "gy_admin";
export const SESSION_DAYS = 7;
export const SESSION_EPOCH_KEY = "session/epoch";

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* v2 token：exp.nonce.epoch.sig（随机 nonce + 支持"登出全部设备"） */
export async function createSession(secret, epoch = 0) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const nonce = randomHex(16);
  const ep = String(epoch || 0);
  const sig = await hmacHex(secret, "v2|" + exp + "|" + nonce + "|" + ep);
  return exp + "." + nonce + "." + ep + "." + sig;
}

/* 会话 epoch（KV 存储；登出全部设备时 +1，旧 token 立即失效）——30 秒内存缓存 */
let _epochCache = { value: 0, at: 0, kv: null };
function kvOf(env) {
  return (env && (env.SITE_KV || env.FILES_KV)) || null;
}
export async function getSessionEpoch(env) {
  const kv = kvOf(env);
  if (!kv) return 0;
  const now = Date.now();
  if (_epochCache.kv === kv && now - _epochCache.at < 30000) return _epochCache.value;
  let value = 0;
  try { value = parseInt(await kv.get(SESSION_EPOCH_KEY), 10) || 0; } catch (e) {}
  _epochCache = { value, at: now, kv };
  return value;
}
export async function bumpSessionEpoch(env) {
  const kv = kvOf(env);
  if (!kv) return 0;
  const cur = parseInt(await kv.get(SESSION_EPOCH_KEY), 10) || 0;
  const next = cur + 1;
  await kv.put(SESSION_EPOCH_KEY, String(next));
  _epochCache = { value: next, at: Date.now(), kv };
  return next;
}

export async function verifySession(request, env) {
  const secret = env && env.SESSION_SECRET;
  if (!secret) return false;
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return false;
  const parts = raw.split(".");

  /* 旧版 v1 token（exp.sig）：过渡期兼容，重新登录后自动升级为 v2 */
  if (parts.length === 2) {
    const payload = parts[0];
    const sig = parts[1];
    const exp = parseInt(payload, 10);
    if (!exp || exp < Date.now()) return false;
    const expect = await hmacHex(secret, "v1|" + payload);
    return constantTimeEqual(expect, sig);
  }

  /* v2 token：exp.nonce.epoch.sig */
  if (parts.length === 4) {
    const exp = parseInt(parts[0], 10);
    const nonce = parts[1];
    const ep = parts[2];
    const sig = parts[3];
    if (!exp || exp < Date.now()) return false;
    if (!/^[0-9a-f]{8,64}$/.test(nonce) || !/^\d{1,10}$/.test(ep)) return false;
    const current = await getSessionEpoch(env);
    if (String(current) !== ep) return false; // 已被"登出全部设备"失效
    const expect = await hmacHex(secret, "v2|" + exp + "|" + nonce + "|" + ep);
    return constantTimeEqual(expect, sig);
  }

  return false;
}

export function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const re = new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)");
  const m = cookie.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

export function sessionSetCookie(token) {
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + SESSION_DAYS * 86400;
}

export function sessionClearCookie() {
  return SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

/* ---------- 请求信息 ---------- */

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export async function keyedIpHash(request, salt) {
  return sha256hex(clientIp(request) + "|" + (salt || "v1"));
}

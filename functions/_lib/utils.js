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

export async function createSession(secret) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = String(exp);
  const sig = await hmacHex(secret, "v1|" + payload);
  return payload + "." + sig;
}

export async function verifySession(request, secret) {
  if (!secret) return false;
  const raw = getCookie(request, SESSION_COOKIE);
  if (!raw) return false;
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const exp = parseInt(payload, 10);
  if (!exp || exp < Date.now()) return false;
  const expect = await hmacHex(secret, "v1|" + payload);
  return constantTimeEqual(expect, sig);
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

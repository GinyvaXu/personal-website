/* ============================================================
 * 柳荫册 Web 版 · 公共库
 * 位置：functions/api/liuyin/_lib.js（以下划线开头，不是路由）
 * 内容：JSON 响应 / CORS / 统一错误 / 限流 / 鉴权 / 名字编号 / chip 拼装 / 订单序列化
 * 约束：只用 Web API，不引 npm 依赖；所有 SQL 走 prepare().bind()
 * ============================================================ */
import { ensureSchema } from "./_migrate.js";

export const BUILDING = "6 号楼";
export const FLOOR_TOTAL = 6;
export const NAME_MAX = 12;
export const ONLINE_MS = 60 * 1000;          // 最近 60 秒有请求算在线
export const SEEN_TOUCH_MS = 20 * 1000;      // last_seen 写入节流，减少 D1 写
export const RATE_MAX = 60;                  // 同一 IP 每分钟上限
export const RATE_WINDOW_MS = 60 * 1000;
export const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

export const STATUS_TEXT = {
  pending: "待接",
  claimed: "已接单",
  confirmed: "已双确认",
  picked: "已取件",
  delivered: "已送达",
  done: "已完成",
  cancelled: "已取消",
  returned: "已回池",
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function statusText(status) {
  return STATUS_TEXT[status] || status || "未知";
}

/* ============================================================
 * 响应 / CORS
 * ============================================================ */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-ly-token, x-ly-admin",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({}, JSON_HEADERS, headers),
  });
}

export function ok(data, headers = {}) {
  return json({ ok: true, data }, 200, headers);
}

function withCors(res) {
  try {
    const h = new Headers(res.headers);
    for (const k of Object.keys(CORS_HEADERS)) if (!h.has(k)) h.set(k, CORS_HEADERS[k]);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) {
    return res;
  }
}

/* ============================================================
 * 限流：同 IP 每分钟 ≤ 60 次
 * Pages 是无状态的，多实例下这是「每实例」上限（最坏放大到实例数倍），
 * 只为了挡住脚本刷接口；不为此新增 D1 表。
 * ============================================================ */
const _rate = new Map();

export function clientIp(request) {
  const h = request.headers;
  return (
    h.get("CF-Connecting-IP") ||
    (h.get("X-Forwarded-For") || "").split(",")[0].trim() ||
    "unknown"
  );
}

function allowRate(ip) {
  const now = Date.now();
  const item = _rate.get(ip);
  if (!item || now >= item.resetAt) {
    _rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (_rate.size > 5000) {
      for (const [k, v] of _rate) if (now >= v.resetAt) _rate.delete(k);
    }
    return true;
  }
  item.count += 1;
  return item.count <= RATE_MAX;
}

/* ============================================================
 * 基础工具
 * ============================================================ */
export function nowIso() {
  return new Date().toISOString();
}

export function randHex(bytes = 4) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function makeId(prefix = "") {
  return prefix + randHex(4);
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(message)));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a, b) {
  const x = String(a == null ? "" : a);
  const y = String(b == null ? "" : b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function changesOf(res) {
  if (!res) return 0;
  if (res.meta && typeof res.meta.changes === "number") return res.meta.changes;
  if (typeof res.changes === "number") return res.changes;
  return 0;
}

/* ============================================================
 * 入参读取与校验（错误信息统一中文）
 * ============================================================ */
export async function readJson(request) {
  let text = "";
  try {
    text = await request.text();
  } catch (e) {
    throw new ApiError(400, "请求内容读取失败");
  }
  if (!text || !text.trim()) return {};
  let value = null;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new ApiError(400, "请求格式不正确，需要 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function asPlain(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/* 可选字符串：不传 → null（按 emptyAsNull 处理空串）；超长 → 400 */
export function optStr(body, key, max, label, emptyAsNull = true) {
  const raw = asPlain(body ? body[key] : "");
  if (!raw) return emptyAsNull ? null : "";
  if ([...raw].length > max) throw new ApiError(400, label + "最多 " + max + " 个字");
  return raw;
}

/* 必填字符串 */
export function reqStr(body, key, max, label) {
  const raw = asPlain(body ? body[key] : "");
  if (!raw) throw new ApiError(400, "请填写" + label);
  if ([...raw].length > max) throw new ApiError(400, label + "最多 " + max + " 个字");
  return raw;
}

export function parseFloorValue(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > FLOOR_TOTAL) return null;
  return n;
}

export function optFloor(body, key = "floor", label = "楼层") {
  const raw = body ? body[key] : null;
  if (raw == null || raw === "") return null;
  const n = parseFloorValue(raw);
  if (n == null) throw new ApiError(400, label + "只能是 1–" + FLOOR_TOTAL);
  return n;
}

export function optIntRange(body, key, min, max, fallback, label) {
  const raw = body ? body[key] : null;
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, label + "只能是 " + min + "–" + max);
  }
  return n;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function optTime(body, key, label) {
  const raw = asPlain(body ? body[key] : "");
  if (!raw) return null;
  if (!HHMM.test(raw)) throw new ApiError(400, label + "格式应为 HH:mm");
  return raw;
}

export function parseSince(raw) {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : Date.now();
    return new Date(ms).toISOString();
  }
  const t = Date.parse(s);
  return t ? new Date(t).toISOString() : null;
}

/* ============================================================
 * 名字归一化 + 重名编号
 *   归一化：去所有空白、转小写、去掉已有 (n) 编号
 * ============================================================ */
export function normalizeName(raw) {
  let s = String(raw == null ? "" : raw).normalize("NFKC");
  s = s.replace(/\s+/g, "").toLowerCase();
  return s;
}

export function stripNameNumber(raw) {
  return String(raw == null ? "" : raw)
    .replace(/\s*[(（]\s*\d{1,2}\s*[)）]\s*$/u, "")
    .trim();
}

export function nameKey(raw) {
  return normalizeName(stripNameNumber(raw));
}

/* 同层同名 → 小柳(2)；返回 { name, key }（key 永远是去编号后的归一化名） */
export async function uniqueName(db, floor, raw) {
  const baseName = stripNameNumber(raw).replace(/\s+/g, "") || String(raw || "").trim();
  const key = normalizeName(baseName);
  const res = await db
    .prepare("SELECT name FROM ly_users WHERE floor = ? AND name_key = ?")
    .bind(floor, key)
    .all();
  const used = new Set(((res && res.results) || []).map((r) => normalizeName(r.name)));
  if (!used.has(key)) return { name: baseName, key };
  for (let n = 2; n < 100; n++) {
    const candidate = baseName + "(" + n + ")";
    if (!used.has(normalizeName(candidate))) return { name: candidate, key };
  }
  throw new ApiError(409, "这一层同名的人太多了，换个名字吧");
}

/* ============================================================
 * 鉴权
 * ============================================================ */
export function isOnline(lastSeen) {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  return !!t && Date.now() - t <= ONLINE_MS;
}

async function banned(db, userId) {
  const row = await db
    .prepare("SELECT id FROM ly_bans WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first();
  return !!row;
}

async function touch(db, userId) {
  try {
    const now = nowIso();
    const cutoff = new Date(Date.now() - SEEN_TOUCH_MS).toISOString();
    await db
      .prepare("UPDATE ly_users SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)")
      .bind(now, userId, cutoff)
      .run();
  } catch (e) {
    /* 心跳失败不影响业务 */
  }
}

export async function authUser(request, env) {
  const token = (request.headers.get("x-ly-token") || "").trim();
  if (!token) return null;
  const row = await env.DB.prepare("SELECT * FROM ly_users WHERE token = ?").bind(token).first();
  if (!row) return null;
  if (Number(row.banned) === 1) throw new ApiError(401, "你已被封禁，联系管理员吧");
  if (await banned(env.DB, row.id)) throw new ApiError(401, "你已被封禁，联系管理员吧");
  await touch(env.DB, row.id);
  return row;
}

export async function adminToken(env) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new ApiError(503, "服务器还没配置管理密钥");
  const exp = Date.now() + ADMIN_TTL_MS;
  const sig = await hmacHex(secret, "lyadmin|" + exp);
  return exp + "." + sig;
}

export async function requireAdmin(request, env) {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new ApiError(503, "服务器还没配置管理密钥");
  const raw = (request.headers.get("x-ly-admin") || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2) throw new ApiError(401, "管理登录已失效，请重新登录");
  const exp = parseInt(parts[0], 10);
  if (!exp || exp < Date.now()) throw new ApiError(401, "管理登录已过期，请重新登录");
  const expect = await hmacHex(secret, "lyadmin|" + exp);
  if (!constantTimeEqual(expect, parts[1])) throw new ApiError(401, "管理登录无效，请重新登录");
}

/* ============================================================
 * 用户展示
 * ============================================================ */
export async function userMeta(db, user) {
  const helped = await db
    .prepare("SELECT COUNT(*) AS n FROM ly_ledger WHERE to_id = ?")
    .bind(user.id)
    .first();
  const owed = await db
    .prepare("SELECT COUNT(*) AS n FROM ly_ledger WHERE from_id = ?")
    .bind(user.id)
    .first();
  return { points: Number((helped && helped.n) || 0), owed: Number((owed && owed.n) || 0) };
}

export async function pointsMap(db) {
  const res = await db
    .prepare("SELECT to_id, COUNT(*) AS n FROM ly_ledger GROUP BY to_id")
    .all();
  const map = new Map();
  for (const row of (res && res.results) || []) map.set(row.to_id, Number(row.n) || 0);
  return map;
}

export async function owedTo(db, userId) {
  const res = await db
    .prepare(
      "SELECT u.id AS id, u.name AS name, u.floor AS floor, COUNT(*) AS n " +
        "FROM ly_ledger l JOIN ly_users u ON u.id = l.to_id " +
        "WHERE l.from_id = ? GROUP BY l.to_id ORDER BY n DESC"
    )
    .bind(userId)
    .all();
  return ((res && res.results) || []).map((r) => ({
    id: r.id,
    name: r.name || "邻居",
    floor: r.floor,
    count: Number(r.n) || 0,
  }));
}

export function publicUser(row, points, extra) {
  return Object.assign(
    {
      id: row.id,
      name: row.name,
      floor: row.floor,
      points: Number(points == null ? 0 : points),
      online: isOnline(row.last_seen),
    },
    extra || {}
  );
}

export async function floorUsers(db, floor, excludeId) {
  const rows = await db
    .prepare(
      "SELECT id, name, floor, last_seen FROM ly_users " +
        "WHERE floor = ? AND banned = 0 ORDER BY created_at ASC LIMIT 100"
    )
    .bind(floor)
    .all();
  const pm = await pointsMap(db);
  return ((rows && rows.results) || [])
    .filter((r) => r.id !== excludeId)
    .map((r) => publicUser(r, pm.get(r.id) || 0));
}

/* ============================================================
 * 订单
 * ============================================================ */
export const ORDER_SELECT =
  "SELECT o.*, " +
  "cu.name AS creator_name, cu.floor AS creator_floor, " +
  "cl.name AS claimer_name, cl.floor AS claimer_floor, " +
  "(SELECT COUNT(*) FROM ly_confirmations c WHERE c.order_id = o.id) AS confirmed_count " +
  "FROM ly_orders o " +
  "LEFT JOIN ly_users cu ON cu.id = o.creator_id " +
  "LEFT JOIN ly_users cl ON cl.id = o.claimer_id";

export function orderJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind || "errand",
    title: row.title || "",
    note: row.note || "",
    from_place: row.from_place || "",
    to_floor: row.to_floor == null ? null : Number(row.to_floor),
    start_at: row.start_at || null,
    end_at: row.end_at || null,
    capacity: row.capacity == null ? 1 : Number(row.capacity),
    code: row.code || "",
    status: row.status,
    creator: {
      id: row.creator_id,
      name: row.creator_name || "邻居",
      floor: row.creator_floor == null ? null : Number(row.creator_floor),
    },
    claimer: row.claimer_id
      ? {
          id: row.claimer_id,
          name: row.claimer_name || "邻居",
          floor: row.claimer_floor == null ? null : Number(row.claimer_floor),
        }
      : null,
    confirmed_count: Number(row.confirmed_count || 0),
    photo_key: row.photo_key || null,
    proof_key: row.proof_key || null,
    created_at: row.created_at,
    updated_at: row.updated_at || null,
  };
}

export function capLimit(limit, max = 100) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n <= 0) return 50;
  return Math.min(n, max);
}

/* where / orderBy 由调用方传入固定常量，不拼接任何用户输入 */
export async function queryOrders(db, where, params, orderBy, limit) {
  const sql =
    ORDER_SELECT +
    " WHERE " +
    where +
    " ORDER BY " +
    (orderBy || "o.created_at DESC") +
    " LIMIT ?";
  const res = await db
    .prepare(sql)
    .bind(...(params || []), capLimit(limit))
    .all();
  return ((res && res.results) || []).map(orderJson);
}

export async function getOrderById(db, id) {
  return db.prepare(ORDER_SELECT + " WHERE o.id = ?").bind(id).first();
}

export function isParticipant(row, userId) {
  return !!row && (row.creator_id === userId || row.claimer_id === userId);
}

/* ============================================================
 * 统一入口：CORS / 迁移 / 限流 / 鉴权 / 异常兜底
 *   opts.auth: "required" | "optional"(默认) | "none"
 *   opts.admin: true 时额外校验 x-ly-admin
 *   opts.body: false 时不解析 JSON body
 * ============================================================ */
export async function handle(context, opts, fn) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: Object.assign({}, CORS_HEADERS) });
  }
  try {
    await ensureSchema(env);
    if (!allowRate(clientIp(request))) throw new ApiError(429, "太快了，歇一会儿再来");

    const url = new URL(request.url);
    let user = null;
    if (opts.auth !== "none") {
      user = await authUser(request, env);
      if (!user && opts.auth === "required") throw new ApiError(401, "请先进楼");
    }
    if (opts.admin) await requireAdmin(request, env);

    const body = opts.body === false ? {} : await readJson(request);
    const res = await fn({ context, request, env, url, user, body, ip: clientIp(request) });
    if (!(res instanceof Response)) throw new Error("处理函数没有返回 Response");
    return withCors(res);
  } catch (e) {
    const status = Number(e && e.status);
    if (!(status >= 400 && status < 600)) {
      console.error("[liuyin]", (e && e.stack) || e);
      return withCors(json({ ok: false, error: "服务器开小差了，稍后再试" }, 500));
    }
    return withCors(json({ ok: false, error: e.message || "出错了" }, status));
  }
}

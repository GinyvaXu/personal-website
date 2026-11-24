/* ============================================================
 * 柳荫册 Web 版 · 公共库
 * 位置：functions/api/liuyin/_lib.js（下划线开头，不是路由）
 *
 * 内容：
 *   - JSON 响应 / CORS / 统一错误 / 分级限流 / 弱账户鉴权 / 管理鉴权
 *   - 名字归一化与重名编号
 *   - 人情点聚合 / 流水 / 楼栋配置
 *   - 订单序列化（含待接池脱敏：code / 真名 / 步骤文本）
 *   - 统一入口 handle()：迁移 → 限流 → 鉴权 → body → 异常兜底
 *
 * 约束：只用 Web API，不引 npm 依赖；所有 SQL 走 prepare().bind()
 * ============================================================ */
import { ensureSchema } from "./_migrate.js";
import {
  SCHEMA_VERSION,
  BUILDING_NAME,
  BUILDING_ID,
  FLOOR_TOTAL,
  STEP_TEMPLATES,
  TEMPLATE_IDS,
  TEMPLATE_BY_CATEGORY,
  CATEGORY_NAMES,
  SIZE_NAMES,
  AVATAR_PRESETS,
  ORDER_STATUSES,
  buildSteps,
  parseSteps,
  nextStepIndex,
  helperStepsDone,
  templateOf,
  categoryOf,
} from "./_schema.js";

export {
  SCHEMA_VERSION,
  BUILDING_ID,
  FLOOR_TOTAL,
  STEP_TEMPLATES,
  TEMPLATE_IDS,
  TEMPLATE_BY_CATEGORY,
  CATEGORY_NAMES,
  SIZE_NAMES,
  AVATAR_PRESETS,
  ORDER_STATUSES,
  buildSteps,
  parseSteps,
  nextStepIndex,
  helperStepsDone,
  templateOf,
  categoryOf,
};

export const BUILDING = BUILDING_NAME;
export const NAME_MAX = 12;
export const NOTE_MAX = 60;
export const ONLINE_MS = 60 * 1000;          // 最近 60 秒有请求算在线
export const SEEN_TOUCH_MS = 20 * 1000;      // last_seen 写入节流，减少 D1 写
export const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

/* 分级限流：轮询接口放宽，写接口收紧 */
export const RATE_POLL = 300;   // /sync /orders/get /messages（前端 2s 轮询）
export const RATE_READ = 120;   // 其它 GET
export const RATE_WRITE = 60;   // POST 等写操作

export const RATE_WINDOW_MS = 60 * 1000;

export const STATUS_TEXT = {
  pending: "待接",
  claimed: "待确认",
  connected: "进行中",
  delivered: "已送达",
  done: "已完成",
  cancelled: "已取消",
  released: "已回池",
};

export const STATUS_TITLE = {
  pending: "已发到楼里，等一个顺路的人。",
  claimed: "有人接了。两边各点一次确认，这单才算数。",
  connected: "确认好了，按步骤来。",
  delivered: "送到了。",
  done: "这一单走完了，账上记了一次人情点。",
  cancelled: "这一单撤掉了，没有记人情点。",
  released: "这单回到楼里了，还在等人接。",
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

export function statusTitle(status) {
  return STATUS_TITLE[status] || "";
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
 * 限流：按「IP + 通道」计数
 *   - 轮询通道（sync / orders/get / messages）：300 次/分钟
 *   - 写通道（非 GET）：60 次/分钟
 *   - 其它读通道：120 次/分钟
 * Pages 是无状态的，多实例下这是「每实例」上限，只为了挡住脚本刷接口。
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

export function rateBucketFor(request, url) {
  const method = String(request.method || "GET").toUpperCase();
  const path = (url && url.pathname) || "";
  if (method === "GET" || method === "HEAD") {
    if (/\/(sync|orders\/get|messages)$/.test(path)) return { key: "poll", max: RATE_POLL };
    return { key: "read", max: RATE_READ };
  }
  return { key: "write", max: RATE_WRITE };
}

function allowRate(ip, bucket) {
  const now = Date.now();
  const key = ip + "|" + bucket.key;
  const item = _rate.get(key);
  if (!item || now >= item.resetAt) {
    _rate.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (_rate.size > 5000) {
      for (const [k, v] of _rate) if (now >= v.resetAt) _rate.delete(k);
    }
    return true;
  }
  item.count += 1;
  return item.count <= bucket.max;
}

/** 测试用：清空本地限流计数 */
export function resetRateLimit() {
  _rate.clear();
}

/* ============================================================
 * 基础工具
 * ============================================================ */
export function nowIso() {
  return new Date().toISOString();
}

export function isoFrom(ms) {
  return new Date(Number(ms) || Date.now()).toISOString();
}

export function addMinutesIso(minutes) {
  return new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
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

export function capLimit(limit, max = 100) {
  const n = Number(limit);
  if (!Number.isInteger(n) || n <= 0) return 50;
  return Math.min(n, max);
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

export function optBool(body, key, fallback = false) {
  const raw = body ? body[key] : undefined;
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return fallback;
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

/* 只接受 upload 返回的 key 形状：u_xxx/o_xxx.jpg */
const KEY_RE = /^[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_.-]{1,80}$/;

export function cleanKey(key) {
  if (!key) return null;
  const k = String(key).trim();
  if (!KEY_RE.test(k) || k.indexOf("..") !== -1) {
    throw new ApiError(400, "照片 key 不合法，请重新上传");
  }
  return k;
}

/* 头像：preset:xxx 或上传 key；空 → 默认 */
export function cleanAvatar(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return null;
  if (/^preset:[a-z]{2,12}$/.test(value)) return value;
  if (KEY_RE.test(value) && value.indexOf("..") === -1) return value;
  throw new ApiError(400, "头像格式不对，请重新选择");
}

export function avatarOrDefault(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value) return "preset:sage";
  return value;
}

/* ============================================================
 * 名字归一化 + 重名编号
 *   归一化：NFKC、去所有空白、转小写、去掉已有 (n) 编号
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
export async function uniqueName(db, floor, raw, excludeId) {
  const baseName = stripNameNumber(raw).replace(/\s+/g, "") || String(raw || "").trim();
  const key = normalizeName(baseName);
  const res = await db
    .prepare("SELECT id, name FROM ly_users WHERE floor = ? AND name_key = ?")
    .bind(floor, key)
    .all();
  const used = new Set(
    ((res && res.results) || [])
      .filter((r) => r.id !== excludeId)
      .map((r) => normalizeName(r.name))
  );
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
  const row = await db.prepare("SELECT id FROM ly_bans WHERE user_id = ? LIMIT 1").bind(userId).first();
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
 * 用户展示 / 人情点
 * ============================================================ */
export function displayNameOf(row, reveal) {
  if (!row) return "邻居";
  const nickname = String(row.nickname || row.name || "邻居");
  if (reveal) {
    const real = String(row.real_name || "");
    if (real && Number(row.show_real_name) !== 0) return real;
  }
  return nickname;
}

export function publicUser(row, points, extra) {
  if (!row) return null;
  const nickname = String(row.nickname || row.name || "邻居");
  return Object.assign(
    {
      id: row.id,
      name: nickname,
      nickname,
      avatar: avatarOrDefault(row.avatar),
      floor: row.floor == null ? null : Number(row.floor),
      points: Number(points == null ? 0 : points),
      online: Number(row.is_demo) === 1 ? false : isOnline(row.last_seen),
      is_demo: Number(row.is_demo) === 1,
    },
    extra || {}
  );
}

export async function userStats(db, userId) {
  const row = await db
    .prepare(
      "SELECT " +
        "COALESCE(SUM(CASE WHEN to_id = ? THEN delta ELSE 0 END), 0) AS points, " +
        "COALESCE(SUM(CASE WHEN from_id = ? THEN delta ELSE 0 END), 0) AS owed, " +
        "COALESCE(SUM(CASE WHEN to_id = ? THEN 1 ELSE 0 END), 0) AS helped, " +
        "COALESCE(SUM(CASE WHEN from_id = ? THEN 1 ELSE 0 END), 0) AS received " +
        "FROM ly_ledger"
    )
    .bind(userId, userId, userId, userId)
    .first();
  return {
    points: Number((row && row.points) || 0),
    owed: Number((row && row.owed) || 0),
    helped: Number((row && row.helped) || 0),
    received: Number((row && row.received) || 0),
  };
}

/* 批量取「帮人累计」点数，用在本层名单 */
export async function pointsMap(db) {
  const res = await db.prepare("SELECT to_id, SUM(delta) AS n FROM ly_ledger GROUP BY to_id").all();
  const map = new Map();
  for (const row of (res && res.results) || []) map.set(row.to_id, Number(row.n) || 0);
  return map;
}

export async function floorUsers(db, floor, excludeId) {
  const rows = await db
    .prepare(
      "SELECT id, name, nickname, avatar, floor, last_seen, is_demo FROM ly_users " +
        "WHERE floor = ? AND banned = 0 ORDER BY is_demo ASC, created_at ASC LIMIT 100"
    )
    .bind(floor)
    .all();
  const pm = await pointsMap(db);
  return ((rows && rows.results) || [])
    .filter((r) => r.id !== excludeId)
    .map((r) => publicUser(r, pm.get(r.id) || 0));
}

/* 最近人情流水（展示 + 推导 helper/received 用） */
export async function ledgerRecent(db, userId, limit = 10) {
  const res = await db
    .prepare(
      "SELECT l.id, l.order_id, l.from_id, l.to_id, l.delta, l.note, l.created_at, " +
        "o.category, o.template_id, o.pickup, o.size, o.points AS order_points " +
        "FROM ly_ledger l LEFT JOIN ly_orders o ON o.id = l.order_id " +
        "WHERE l.from_id = ? OR l.to_id = ? ORDER BY l.id DESC LIMIT ?"
    )
    .bind(userId, userId, capLimit(limit, 50))
    .all();
  const rows = (res && res.results) || [];
  if (!rows.length) return [];
  const others = new Set();
  for (const r of rows) others.add(r.from_id === userId ? r.to_id : r.from_id);
  const users = new Map();
  if (others.size) {
    const list = Array.from(others);
    const placeholders = list.map(() => "?").join(",");
    const uRes = await db
      .prepare("SELECT id, name, nickname, avatar, floor FROM ly_users WHERE id IN (" + placeholders + ")")
      .bind(...list)
      .all();
    for (const u of (uRes && uRes.results) || []) users.set(u.id, u);
  }
  return rows.map((r) => {
    const direction = r.to_id === userId ? "in" : "out";
    const other = users.get(direction === "in" ? r.from_id : r.to_id);
    return {
      id: r.id,
      order_id: r.order_id,
      delta: Number(r.delta) || 0,
      direction,
      note: r.note || "",
      category: r.category || "",
      pickup: r.pickup || "",
      size: r.size || "",
      created_at: r.created_at,
      who: other
        ? {
            id: other.id,
            name: String(other.nickname || other.name || "邻居"),
            avatar: avatarOrDefault(other.avatar),
            floor: other.floor == null ? null : Number(other.floor),
          }
        : { id: direction === "in" ? r.from_id : r.to_id, name: "邻居", avatar: "preset:sage", floor: null },
    };
  });
}

/* ============================================================
 * 楼栋配置
 * ============================================================ */
export async function settingsMap(db) {
  const res = await db.prepare("SELECT key, value FROM ly_settings").all();
  const map = {};
  for (const row of (res && res.results) || []) map[row.key] = row.value;
  return map;
}

export async function getSetting(db, key, fallback = "") {
  try {
    const row = await db.prepare("SELECT value FROM ly_settings WHERE key = ?").bind(key).first();
    return row && row.value != null ? row.value : fallback;
  } catch (e) {
    return fallback;
  }
}

export async function setSetting(db, key, value) {
  await db
    .prepare("INSERT OR REPLACE INTO ly_settings (key, value) VALUES (?, ?)")
    .bind(key, String(value))
    .run();
}

export async function getBuilding(db, floor) {
  const map = await settingsMap(db);
  return {
    name: map.building || BUILDING,
    lit: Number(map.lit || 18),
    target: Number(map.target || 30),
    code: String(map.code || "7241"),
    floor: floor == null ? null : Number(floor),
  };
}

/* ============================================================
 * 订单
 * ============================================================ */
export const ORDER_SELECT =
  "SELECT o.*, " +
  "cu.name AS creator_name, cu.nickname AS creator_nickname, cu.real_name AS creator_real_name, " +
  "cu.show_real_name AS creator_show_real, cu.avatar AS creator_avatar, cu.floor AS creator_floor, cu.is_demo AS creator_demo, " +
  "cl.name AS claimer_name, cl.nickname AS claimer_nickname, cl.real_name AS claimer_real_name, " +
  "cl.show_real_name AS claimer_show_real, cl.avatar AS claimer_avatar, cl.floor AS claimer_floor, cl.is_demo AS claimer_demo, " +
  "(SELECT COUNT(*) FROM ly_confirmations c WHERE c.order_id = o.id) AS confirmed_count " +
  "FROM ly_orders o " +
  "LEFT JOIN ly_users cu ON cu.id = o.creator_id " +
  "LEFT JOIN ly_users cl ON cl.id = o.claimer_id";

const REVEAL_STATUSES = ["connected", "delivered", "done"];

function joinedUser(row, prefix, reveal) {
  const id = row[prefix + "_id"];
  if (!id) return null;
  const nickname = String(row[prefix + "_nickname"] || row[prefix + "_name"] || "邻居");
  const real = String(row[prefix + "_real_name"] || "");
  const showReal = Number(row[prefix + "_show_real"]) !== 0;
  const canShowReal = reveal && showReal && !!real;
  return {
    id,
    name: canShowReal ? real : nickname,
    nickname,
    avatar: avatarOrDefault(row[prefix + "_avatar"]),
    floor: row[prefix + "_floor"] == null ? null : Number(row[prefix + "_floor"]),
    is_demo: Number(row[prefix + "_demo"]) === 1,
    real_name: canShowReal ? real : null,
  };
}

/**
 * 订单序列化（前端直接用）
 * viewer：当前登录用户行（可空）。
 *
 * 脱敏规则：
 *   - code 只有订单双方可见；其他人（含待接池）拿到空串
 *   - provide_code 步骤的 text_value 同步脱敏
 *   - 真名只在「本人」或「已建联（connected 及以后）的双方」之间可见；
 *     待接池/路人只看到昵称
 */
export function orderJson(row, viewer) {
  if (!row) return null;
  const viewerId = viewer ? viewer.id : null;
  const isCreator = !!viewerId && row.creator_id === viewerId;
  const isClaimer = !!viewerId && row.claimer_id === viewerId;
  const participant = isCreator || isClaimer;
  const reveal = REVEAL_STATUSES.indexOf(String(row.status)) >= 0;

  const steps = parseSteps(row.steps).map((s) => {
    const out = Object.assign({}, s);
    if (s.type === "provide_code" && !participant) out.text_value = "";
    return out;
  });

  const creatorReveal = isCreator || (participant && reveal);
  const claimerReveal = isClaimer || (participant && reveal);

  return {
    id: row.id,
    category: row.category || "",
    template_id: row.template_id || "deliver",
    size: row.size || "",
    pickup: row.pickup || "",
    time_label: row.time_label || "",
    points: Number(row.points) || 1,
    to_floor: row.to_floor == null ? null : Number(row.to_floor),
    note: row.note || "",
    need_code: Number(row.need_code) === 1,
    code: participant ? String(row.code || "") : "",
    steps,
    current_step: Number(row.current_step) || 0,
    status: row.status,
    creator: joinedUser(row, "creator", creatorReveal),
    claimer: row.claimer_id ? joinedUser(row, "claimer", claimerReveal) : null,
    creator_id: row.creator_id,
    claimer_id: row.claimer_id || null,
    conn_deadline: row.conn_deadline || null,
    conn_extended: Number(row.conn_extended) || 0,
    confirmed_count: Number(row.confirmed_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at || null,
    delivered_at: row.delivered_at || null,
    done_at: row.done_at || null,
    photo_key: row.photo_key || null,
    proof_key: row.proof_key || null,
    released_reason: row.released_reason || null,
    is_mine: participant,
    role: isCreator ? "requester" : isClaimer ? "helper" : "guest",
    /* 兼容老前端字段 */
    kind: row.kind || "errand",
    title: row.title || row.category || "",
    from_place: row.pickup || row.from_place || "",
  };
}

/* where / orderBy 由调用方传入固定常量，不拼接任何用户输入 */
export async function queryOrders(db, where, params, orderBy, limit, viewer) {
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
  return ((res && res.results) || []).map((row) => orderJson(row, viewer));
}

export async function getOrderById(db, id) {
  return db.prepare(ORDER_SELECT + " WHERE o.id = ?").bind(id).first();
}

export async function getOrderJson(db, id, viewer) {
  return orderJson(await getOrderById(db, id), viewer);
}

export function isParticipant(row, userId) {
  return !!row && (row.creator_id === userId || row.claimer_id === userId);
}

export function isDemoUser(row) {
  return !!row && Number(row.is_demo) === 1;
}

/* 确认状态（详情页两枚小状态） */
export async function confirmationState(db, orderId, userId, otherId) {
  const res = await db
    .prepare("SELECT user_id FROM ly_confirmations WHERE order_id = ?")
    .bind(orderId)
    .all();
  const ids = new Set(((res && res.results) || []).map((r) => r.user_id));
  return {
    mine: ids.has(userId),
    other: otherId ? ids.has(otherId) : ids.size > 1,
    count: ids.size,
  };
}

/* ============================================================
 * 消息
 * ============================================================ */
export function messageJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    order_id: row.order_id,
    from_id: row.from_id,
    from_name: row.from_id === "system" ? "系统" : String(row.from_nickname || row.from_name || "邻居"),
    body: row.body || "",
    created_at: row.created_at,
    system: row.from_id === "system",
  };
}

export async function insertMessage(db, orderId, fromId, body, createdAt) {
  const res = await db
    .prepare("INSERT INTO ly_messages (order_id, from_id, body, created_at) VALUES (?, ?, ?, ?)")
    .bind(orderId, fromId, body, createdAt || nowIso())
    .run();
  let id = res && res.meta && res.meta.last_row_id;
  if (!id) {
    const last = await db.prepare("SELECT MAX(id) AS id FROM ly_messages").first();
    id = last && last.id;
  }
  return { id, order_id: orderId, from_id: fromId, body, created_at: createdAt || nowIso() };
}

export async function systemMessage(db, orderId, body) {
  try {
    await insertMessage(db, orderId, "system", String(body).slice(0, 100));
  } catch (e) {
    /* 系统消息失败不影响主流程 */
  }
}

/* ============================================================
 * 顺路卡
 * ============================================================ */
export function routeCardJson(row, viewerId) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    floor: row.floor == null ? null : Number(row.floor),
    time_label: row.time_label || "",
    from_place: row.from_place || "",
    to_place: row.to_place || BUILDING,
    capacity: Number(row.capacity) || 1,
    status: row.status,
    active_until: row.active_until || null,
    created_at: row.created_at,
    updated_at: row.updated_at || null,
    is_mine: !!viewerId && row.user_id === viewerId,
    user: {
      id: row.user_id,
      name: String(row.user_nickname || row.user_name || "邻居"),
      avatar: avatarOrDefault(row.user_avatar),
      floor: row.user_floor == null ? (row.floor == null ? null : Number(row.floor)) : Number(row.user_floor),
    },
  };
}

const ROUTE_SELECT =
  "SELECT c.*, u.name AS user_name, u.nickname AS user_nickname, u.avatar AS user_avatar, u.floor AS user_floor " +
  "FROM ly_route_cards c LEFT JOIN ly_users u ON u.id = c.user_id";

export async function routesFor(db, user) {
  const now = nowIso();
  const activeRes = await db
    .prepare(
      ROUTE_SELECT +
        " WHERE c.status = 'active' AND (c.active_until IS NULL OR c.active_until > ?) " +
        "ORDER BY c.created_at DESC LIMIT 20"
    )
    .bind(now)
    .all();
  const active = ((activeRes && activeRes.results) || []).map((r) => routeCardJson(r, user.id));

  const myRes = await db
    .prepare(ROUTE_SELECT + " WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 20")
    .bind(user.id)
    .all();
  const mine = ((myRes && myRes.results) || []).map((r) => routeCardJson(r, user.id));
  const waiting = mine.filter((c) => c.status === "waiting");
  const myActive = active.find((c) => c.user_id === user.id) || null;

  return { active, waiting, mine, my_active: myActive };
}

/* ============================================================
 * 统一入口：CORS / 迁移 / 分级限流 / 鉴权 / 异常兜底
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
    const url = new URL(request.url);
    await ensureSchema(env);
    if (!allowRate(clientIp(request), rateBucketFor(request, url))) {
      throw new ApiError(429, "太快了，歇一会儿再试");
    }

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

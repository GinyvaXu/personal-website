/* ============================================================
 * 柳荫册 Web 版 · 表结构与订单模板
 * 位置：functions/api/liuyin/_schema.js（下划线开头，不是路由）
 *
 * 内容：
 *   1. SCHEMA_VERSION        —— 迁移目标版本（_migrate.js 用）
 *   2. SCHEMA_SQL            —— 新装即完整的建表 DDL（幂等 CREATE IF NOT EXISTS）
 *   3. SETTINGS_DEFAULTS     —— ly_settings 默认项
 *   4. STEP_TEMPLATES        —— 与小程序 store.js TEMPLATE_STEPS 完全一致
 *   5. buildSteps / parseSteps / templateOf / categoryOf —— 步骤引擎
 *
 * 说明：DDL 里保留旧列（kind/title/from_place/start_at/end_at/capacity），
 *       老库数据可继续读；新代码写新列，同时补旧列以兼容老 SELECT。
 * ============================================================ */

export const SCHEMA_VERSION = 3;

export const FLOOR_TOTAL = 6;
export const BUILDING_NAME = "6 号楼";
export const BUILDING_ID = "b_6";

/* ---------------- 订单模板（与小程序一致） ---------------- */
/* owner：requester = 发单方；helper = 接单方 */
export const STEP_TEMPLATES = {
  pickup: [
    { type: "provide_code", owner: "requester", label: "提供取件码 / 订单号" },
    { type: "pickup", owner: "helper", label: "取到" },
    { type: "deliver", owner: "helper", label: "交付" },
    { type: "confirm", owner: "requester", label: "确认收到" },
  ],
  food: [
    { type: "pickup", owner: "helper", label: "取到餐" },
    { type: "deliver", owner: "helper", label: "交付" },
    { type: "confirm", owner: "requester", label: "确认收到" },
  ],
  deliver: [
    { type: "pickup", owner: "helper", label: "取到东西" },
    { type: "deliver", owner: "helper", label: "交付" },
    { type: "confirm", owner: "requester", label: "确认收到" },
  ],
  trash: [
    { type: "pickup", owner: "helper", label: "已带走" },
    { type: "confirm", owner: "requester", label: "确认收到" },
  ],
  custom: [
    { type: "provide_code", owner: "requester", label: "提供凭证（可选）" },
    { type: "pickup", owner: "helper", label: "取到 / 完成" },
    { type: "deliver", owner: "helper", label: "交付" },
    { type: "confirm", owner: "requester", label: "确认收到" },
  ],
};

export const TEMPLATE_BY_CATEGORY = {
  取快递: "pickup",
  带饭: "food",
  送东西: "deliver",
  倒垃圾: "trash",
  自定义: "custom",
};

export const TEMPLATE_IDS = ["pickup", "food", "deliver", "trash", "custom"];
export const CATEGORY_NAMES = ["取快递", "带饭", "送东西", "倒垃圾", "自定义"];
export const SIZE_NAMES = ["小件", "中件", "大件"];

/** 品类 → 模板（尊重调用方显式 template_id，但只接受白名单） */
export function templateOf(category, templateId) {
  const wanted = String(templateId || "").trim();
  if (TEMPLATE_IDS.indexOf(wanted) >= 0) return wanted;
  return TEMPLATE_BY_CATEGORY[category] || "deliver";
}

/** 模板 → 默认品类（迁移老数据用） */
export function categoryOf(template) {
  for (const [name, id] of Object.entries(TEMPLATE_BY_CATEGORY)) {
    if (id === template) return name;
  }
  return "自定义";
}

/**
 * 按模板生成步骤数组。
 * needCode：取快递固定要码；自定义按用户开关；其它模板不要码。
 * 元素形状与契约一致：{id,type,owner,label,status,text_value,photo_key,completed_at}
 */
export function buildSteps(templateId, opts) {
  const tid = TEMPLATE_IDS.indexOf(templateId) >= 0 ? templateId : "deliver";
  const needCode = tid === "pickup" || (tid === "custom" && !!(opts && opts.needCode));
  const defs = STEP_TEMPLATES[tid] || STEP_TEMPLATES.deliver;
  return defs
    .filter((def) => def.type !== "provide_code" || needCode)
    .map((def, index) => ({
      id: "s" + (index + 1),
      type: def.type,
      owner: def.owner,
      label: def.label,
      status: "pending",
      text_value: "",
      photo_key: "",
      completed_at: 0,
    }));
}

/** 容错解析 steps（老数据 / 异常 JSON 都返回数组） */
export function parseSteps(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch (e) {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => ({
    id: String((s && s.id) || "s" + (i + 1)),
    type: String((s && s.type) || "pickup"),
    owner: (s && s.owner) === "requester" ? "requester" : "helper",
    label: String((s && s.label) || ""),
    status: (s && s.status) === "done" ? "done" : "pending",
    text_value: String((s && s.text_value) || ""),
    photo_key: String((s && (s.photo_key || s.photo)) || ""),
    completed_at: Number((s && s.completed_at) || 0) || 0,
  }));
}

/** 下一个未完成步骤的下标（全完成 → 步骤数） */
export function nextStepIndex(steps) {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].status !== "done") return i;
  }
  return steps.length;
}

/** helper 负责的步骤是否全部完成（没有 helper 步骤时也算完成） */
export function helperStepsDone(steps) {
  const helperSteps = steps.filter((s) => s.owner === "helper");
  return helperSteps.every((s) => s.status === "done");
}

/* ---------------- 建表 DDL（幂等；新装即完整） ---------------- */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ly_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  nickname TEXT,
  real_name TEXT,
  show_real_name INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
  floor INTEGER NOT NULL,
  room_no TEXT,
  building_id TEXT NOT NULL DEFAULT 'b_6',
  token TEXT NOT NULL UNIQUE,
  banned INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  onboarded INTEGER NOT NULL DEFAULT 0,
  missed INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_users_token ON ly_users(token);
CREATE INDEX IF NOT EXISTS idx_ly_users_floor ON ly_users(floor, banned);

CREATE TABLE IF NOT EXISTS ly_orders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'errand',
  creator_id TEXT NOT NULL,
  claimer_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL DEFAULT 'deliver',
  size TEXT NOT NULL DEFAULT '',
  pickup TEXT NOT NULL DEFAULT '',
  time_label TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 2,
  note TEXT NOT NULL DEFAULT '',
  to_floor INTEGER,
  need_code INTEGER NOT NULL DEFAULT 0,
  code TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  from_place TEXT,
  start_at TEXT,
  end_at TEXT,
  capacity INTEGER DEFAULT 1,
  conn_deadline TEXT,
  conn_extended INTEGER NOT NULL DEFAULT 0,
  photo_key TEXT,
  proof_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  delivered_at TEXT,
  done_at TEXT,
  released_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_ly_orders_status ON ly_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ly_orders_creator ON ly_orders(creator_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_claimer ON ly_orders(claimer_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_floor ON ly_orders(to_floor, status);

CREATE TABLE IF NOT EXISTS ly_confirmations (
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (order_id, user_id)
);

CREATE TABLE IF NOT EXISTS ly_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL UNIQUE,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  delta INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_to ON ly_ledger(to_id);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_from ON ly_ledger(from_id);

CREATE TABLE IF NOT EXISTS ly_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_messages_order ON ly_messages(order_id, id);

CREATE TABLE IF NOT EXISTS ly_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  ip_hash TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ly_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS ly_route_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  floor INTEGER NOT NULL,
  time_label TEXT NOT NULL DEFAULT '',
  from_place TEXT NOT NULL DEFAULT '',
  to_place TEXT NOT NULL DEFAULT '6 号楼',
  capacity INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  active_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ly_routes_status ON ly_route_cards(status, active_until);
CREATE INDEX IF NOT EXISTS idx_ly_routes_user ON ly_route_cards(user_id);

CREATE TABLE IF NOT EXISTS ly_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'missed_connections',
  user_id TEXT,
  title TEXT,
  detail TEXT,
  handled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_alerts_handled ON ly_alerts(handled, id);

CREATE TABLE IF NOT EXISTS ly_robot_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_sec INTEGER NOT NULL DEFAULT 5,
  max_actions INTEGER NOT NULL DEFAULT 1,
  auto_accept INTEGER NOT NULL DEFAULT 1,
  auto_connect INTEGER NOT NULL DEFAULT 1,
  auto_steps INTEGER NOT NULL DEFAULT 1,
  auto_confirm INTEGER NOT NULL DEFAULT 1,
  random_chat INTEGER NOT NULL DEFAULT 1,
  chat_chance INTEGER NOT NULL DEFAULT 30,
  pool_min INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ly_robot_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_robot_log_id ON ly_robot_log(id);

CREATE TABLE IF NOT EXISTS ly_pres_cmd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room TEXT NOT NULL,
  cmd TEXT NOT NULL,
  arg TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_pres_cmd_room ON ly_pres_cmd(room, id);

CREATE TABLE IF NOT EXISTS ly_pres_state (
  room TEXT PRIMARY KEY,
  page INTEGER NOT NULL DEFAULT 0,
  started INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('building', '6 号楼');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('floors', '6');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('notice', '');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('demo_open', '1');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('lit', '18');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('target', '30');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('code', '7241');

INSERT OR IGNORE INTO ly_robot_config(id, enabled, interval_sec, max_actions, auto_accept, auto_connect, auto_steps, auto_confirm, random_chat, chat_chance, pool_min)
  VALUES (1, 1, 5, 1, 1, 1, 1, 1, 1, 30, 2);
`;

export const SETTINGS_DEFAULTS = {
  building: BUILDING_NAME,
  floors: "6",
  notice: "",
  demo_open: "1",
  lit: "18",
  target: "30",
  code: "7241",
};

/* ---------------- 常用展示/校验枚举 ---------------- */
export const ORDER_STATUSES = [
  "pending",
  "claimed",
  "connected",
  "delivered",
  "done",
  "cancelled",
  "released",
];

export const AVATAR_PRESETS = ["sage", "peach", "clay", "mist", "sky", "leaf", "sand", "rose"];

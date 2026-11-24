-- ============================================================
-- 柳荫册 · Web 版数据库（Cloudflare D1）
-- 与工具站共用 ginyva-feedback 库，表统一 ly_ 前缀
-- 执行：wrangler d1 execute ginyva-feedback --remote --file=schema-liuyin.sql
--
-- 说明：本文件是「新装即完整」的全量结构；老库不用手动执行，
--       functions/api/liuyin/_migrate.js 会在任意 API 请求入口幂等升级
--       （CREATE IF NOT EXISTS + 容错 ALTER + 老数据状态映射）。
-- ============================================================

-- 用户（弱账户：名字 + 楼层，无密码；is_demo=1 为机器人邻居）
CREATE TABLE IF NOT EXISTS ly_users (
  id             TEXT PRIMARY KEY,              -- u_xxx
  name           TEXT NOT NULL,                 -- 楼里显示名（昵称；重名自动 名字(2)）
  name_key       TEXT NOT NULL,                 -- 归一化名，重名检测用
  nickname       TEXT,                          -- 昵称（=name 主来源）
  real_name      TEXT,                          -- 真名，可空
  show_real_name INTEGER NOT NULL DEFAULT 1,    -- 1/0：楼里是否显示真名
  avatar         TEXT,                          -- preset:sage / R2 key（上传）
  floor          INTEGER NOT NULL,              -- 1..6
  room_no        TEXT,                          -- 门牌号，如 302
  building_id    TEXT NOT NULL DEFAULT 'b_6',   -- 楼栋锁死
  token          TEXT NOT NULL UNIQUE,          -- localStorage 持有的凭证
  banned         INTEGER NOT NULL DEFAULT 0,
  is_demo        INTEGER NOT NULL DEFAULT 0,    -- 1 = 机器人邻居
  onboarded      INTEGER NOT NULL DEFAULT 0,    -- 1 = 填过昵称
  missed         INTEGER NOT NULL DEFAULT 0,    -- 连续未响应次数
  last_seen      TEXT,                          -- 最近请求时间（在线判断）
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_users_token ON ly_users(token);
CREATE INDEX IF NOT EXISTS idx_ly_users_floor ON ly_users(floor, banned);
CREATE INDEX IF NOT EXISTS idx_ly_users_demo  ON ly_users(is_demo);

-- 委托订单（状态机 pending → claimed → connected → delivered → done，另有 cancelled/released）
CREATE TABLE IF NOT EXISTS ly_orders (
  id             TEXT PRIMARY KEY,              -- o_xxx
  kind           TEXT NOT NULL DEFAULT 'errand',-- 老字段：errand / route（新代码只用 errand）
  creator_id     TEXT NOT NULL,
  claimer_id     TEXT,
  title          TEXT NOT NULL DEFAULT '',      -- 老字段：展示标题
  category       TEXT NOT NULL DEFAULT '',      -- 取快递 / 带饭 / 送东西 / 倒垃圾 / 自定义
  template_id    TEXT NOT NULL DEFAULT 'deliver', -- pickup / food / deliver / trash / custom
  size           TEXT NOT NULL DEFAULT '',      -- 小件 / 中件 / 大件（仅取快递）
  pickup         TEXT NOT NULL DEFAULT '',      -- 从哪拿
  time_label     TEXT NOT NULL DEFAULT '',      -- 现在 / 30 分钟内 / 18:10 前 ...
  points         INTEGER NOT NULL DEFAULT 2,    -- 人情点 1–3
  note           TEXT NOT NULL DEFAULT '',      -- 加一句话 ≤60
  to_floor       INTEGER,                       -- 送到几层
  need_code      INTEGER NOT NULL DEFAULT 0,    -- 需要取件码 / 订单号
  code           TEXT NOT NULL DEFAULT '',      -- 取件码（首个步骤写入）
  steps          TEXT NOT NULL DEFAULT '[]',    -- JSON 步骤数组
  current_step   INTEGER NOT NULL DEFAULT 0,    -- 当前步下标
  status         TEXT NOT NULL DEFAULT 'pending',
  from_place     TEXT,                          -- 老字段（= pickup）
  start_at       TEXT,                          -- 老字段
  end_at         TEXT,                          -- 老字段
  capacity       INTEGER DEFAULT 1,             -- 老字段
  conn_deadline  TEXT,                          -- 双确认截止（claimed 时 = now+10min）
  conn_extended  INTEGER NOT NULL DEFAULT 0,    -- 是否已延长过一次
  photo_key      TEXT,                          -- 发单照片 R2 key
  proof_key      TEXT,                          -- 送达照片 R2 key
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT,
  delivered_at   TEXT,
  done_at        TEXT,
  released_reason TEXT                          -- timeout / unreachable / cancel / creator_cancel
);
CREATE INDEX IF NOT EXISTS idx_ly_orders_status  ON ly_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ly_orders_creator ON ly_orders(creator_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_claimer ON ly_orders(claimer_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_floor   ON ly_orders(to_floor, status);

-- 双确认记录（每一方一次；两行 → connected）
CREATE TABLE IF NOT EXISTS ly_confirmations (
  order_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (order_id, user_id)
);

-- 人情点流水（order_id 唯一 = 一单只记一笔；delta = order.points）
--   me.points = SUM(delta WHERE to_id=me)（帮人累计）
--   me.owed   = SUM(delta WHERE from_id=me)（欠下累计）
CREATE TABLE IF NOT EXISTS ly_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL UNIQUE,
  from_id    TEXT NOT NULL,                     -- 受益方（发单方）
  to_id      TEXT NOT NULL,                     -- 帮忙方（接单方）
  delta      INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_to   ON ly_ledger(to_id);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_from ON ly_ledger(from_id);

-- 站内消息（订单内临时会话；from_id='system' 为系统消息）
CREATE TABLE IF NOT EXISTS ly_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_messages_order ON ly_messages(order_id, id);

-- 封禁（按 user + 理由）
CREATE TABLE IF NOT EXISTS ly_bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  ip_hash    TEXT,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 配置（building/floors/notice/demo_open/lit/target/code/schema_version/robot_last_tick）
CREATE TABLE IF NOT EXISTS ly_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('building', '6 号楼');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('floors', '6');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('notice', '');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('demo_open', '1');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('lit', '18');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('target', '30');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('code', '7241');

-- 顺路卡（不接单、不派单、不承诺；一张卡 1–5 件，2 小时过期）
CREATE TABLE IF NOT EXISTS ly_route_cards (
  id           TEXT PRIMARY KEY,                -- r_xxx
  user_id      TEXT NOT NULL,
  floor        INTEGER NOT NULL,
  time_label   TEXT NOT NULL DEFAULT '',        -- 12:00–12:30 / 18:00–18:30 / 自定义
  from_place   TEXT NOT NULL DEFAULT '',        -- 驿站 / 食堂 / 教学楼 / 东门 / 自定义
  to_place     TEXT NOT NULL DEFAULT '6 号楼',
  capacity     INTEGER NOT NULL DEFAULT 2,      -- 1–5
  status       TEXT NOT NULL DEFAULT 'active',  -- active / waiting / withdrawn / expired
  active_until TEXT,                            -- 挂出后 +2h
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_ly_routes_status ON ly_route_cards(status, active_until);
CREATE INDEX IF NOT EXISTS idx_ly_routes_user   ON ly_route_cards(user_id);

-- 管理提醒（连续 3 次未响应）
CREATE TABLE IF NOT EXISTS ly_alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL DEFAULT 'missed_connections',
  user_id    TEXT,
  title      TEXT,
  detail     TEXT,
  handled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_alerts_handled ON ly_alerts(handled, id);

-- 机器人邻居配置（单行 id=1）
CREATE TABLE IF NOT EXISTS ly_robot_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  enabled     INTEGER NOT NULL DEFAULT 1,
  interval_sec INTEGER NOT NULL DEFAULT 5,
  max_actions INTEGER NOT NULL DEFAULT 1,
  auto_accept INTEGER NOT NULL DEFAULT 1,
  auto_connect INTEGER NOT NULL DEFAULT 1,
  auto_steps  INTEGER NOT NULL DEFAULT 1,
  auto_confirm INTEGER NOT NULL DEFAULT 1,
  random_chat INTEGER NOT NULL DEFAULT 1,
  chat_chance INTEGER NOT NULL DEFAULT 30,
  pool_min    INTEGER NOT NULL DEFAULT 2,
  updated_at  TEXT
);
INSERT OR IGNORE INTO ly_robot_config(id, enabled, interval_sec, max_actions, auto_accept, auto_connect, auto_steps, auto_confirm, random_chat, chat_chance, pool_min)
  VALUES (1, 1, 5, 1, 1, 1, 1, 1, 1, 30, 2);

-- 机器人动作日志（保留最近 30 条）
CREATE TABLE IF NOT EXISTS ly_robot_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_robot_log_id ON ly_robot_log(id);

-- ============================================================
-- 路演提词台（schema-pres.sql 并入；避免提词台 500）
-- ============================================================
CREATE TABLE IF NOT EXISTS ly_pres_cmd (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room       TEXT NOT NULL,
  cmd        TEXT NOT NULL,          -- next / prev / go / reset / start
  arg        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_pres_cmd_room ON ly_pres_cmd(room, id);

CREATE TABLE IF NOT EXISTS ly_pres_state (
  room       TEXT PRIMARY KEY,
  page       INTEGER NOT NULL DEFAULT 0,
  started    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

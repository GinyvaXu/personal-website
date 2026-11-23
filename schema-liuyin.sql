-- ============================================================
-- 柳荫册 · Web 版数据库（Cloudflare D1）
-- 与工具站共用 ginyva-feedback 库，表统一 ly_ 前缀
-- 执行：wrangler d1 execute ginyva-feedback --remote --file=schema-liuyin.sql
-- ============================================================

-- 用户（弱账户：名字 + 楼层，无密码）
CREATE TABLE IF NOT EXISTS ly_users (
  id         TEXT PRIMARY KEY,              -- u_xxx
  name       TEXT NOT NULL,
  name_key   TEXT NOT NULL,                 -- 归一化名字，用于重名检测
  floor      INTEGER NOT NULL,              -- 1..6
  token      TEXT NOT NULL UNIQUE,          -- 本地 localStorage 持有的凭证
  banned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_users_token ON ly_users(token);
CREATE INDEX IF NOT EXISTS idx_ly_users_floor ON ly_users(floor, banned);

-- 订单 / 顺路卡（同一张表，用 kind 区分）
CREATE TABLE IF NOT EXISTS ly_orders (
  id          TEXT PRIMARY KEY,             -- o_xxx
  kind        TEXT NOT NULL DEFAULT 'errand', -- errand 委托 | route 顺路卡
  creator_id  TEXT NOT NULL,
  claimer_id  TEXT,
  title       TEXT NOT NULL,                -- 取快递 / 带饭 / 顺路捎带
  note        TEXT,
  from_place  TEXT,                         -- 从哪（驿站 / 食堂 / 教学楼）
  to_floor    INTEGER,                      -- 送到几层
  start_at    TEXT,                         -- 顺路卡：几点出发
  end_at      TEXT,                         -- 顺路卡：几点前有效
  capacity    INTEGER DEFAULT 1,            -- 顺路卡：能带几件
  code        TEXT,                         -- 取件码（发单方填）
  status      TEXT NOT NULL DEFAULT 'pending',
              -- pending 待接 | claimed 已接 | confirmed 已双确认
              -- picked 已取件 | delivered 已送达 | done 已完成
              -- cancelled 已取消 | returned 已回池
  photo_key   TEXT,                         -- R2 键：发单照片
  proof_key   TEXT,                         -- R2 键：送达照片
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ly_orders_status  ON ly_orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ly_orders_creator ON ly_orders(creator_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_claimer ON ly_orders(claimer_id);
CREATE INDEX IF NOT EXISTS idx_ly_orders_floor   ON ly_orders(to_floor, status);

-- 双确认记录（每一方一次）
CREATE TABLE IF NOT EXISTS ly_confirmations (
  order_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (order_id, user_id)
);

-- 人情点流水（只记「欠一次」；允许展示具体次数）
CREATE TABLE IF NOT EXISTS ly_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL UNIQUE,          -- 一单只记一笔（幂等）
  from_id    TEXT NOT NULL,                 -- 欠人情的人（受益方）
  to_id      TEXT NOT NULL,                 -- 被欠的人（帮忙方）
  delta      INTEGER NOT NULL DEFAULT 1,    -- 固定 1，不累计成钱
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_to   ON ly_ledger(to_id);
CREATE INDEX IF NOT EXISTS idx_ly_ledger_from ON ly_ledger(from_id);

-- 站内消息（订单内对话）
CREATE TABLE IF NOT EXISTS ly_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL,
  from_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ly_messages_order ON ly_messages(order_id, id);

-- 封禁（按设备指纹 + IP 哈希）
CREATE TABLE IF NOT EXISTS ly_bans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  ip_hash    TEXT,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 配置
CREATE TABLE IF NOT EXISTS ly_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('building', '6 号楼');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('floors', '6');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('notice', '');
INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('demo_open', '1');

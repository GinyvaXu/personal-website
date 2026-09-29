-- ============================================================
-- Ginyva 工具站 · Cloudflare D1 初始化脚本
-- 使用方法（二选一）：
--   A. Cloudflare 控制台 → D1 → 选择数据库 → Console → 粘贴执行
--   B. npx wrangler d1 execute ginyva-feedback --remote --file=schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project    TEXT    NOT NULL DEFAULT 'general',
  name       TEXT,
  contact    TEXT,
  message    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'new',   -- new / planned / doing / done / hidden
  reply      TEXT,
  ip_hash    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status, id DESC);
CREATE INDEX IF NOT EXISTS idx_login_ip        ON login_attempts (ip_hash, created_at);

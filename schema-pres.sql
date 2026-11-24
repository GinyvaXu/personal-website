-- 演示遥控：命令队列 + 当前状态
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

/* ============================================================
 * D1 数据表工具：访问统计（pageviews）与下载统计（downloads）
 * 首次写入时惰性建表（CREATE IF NOT EXISTS，幂等）
 * ============================================================ */

let ensured = false;

export async function ensureTables(db) {
  if (ensured) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS downloads (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "project TEXT NOT NULL," +
    "file TEXT," +
    "ip_hash TEXT," +
    "day TEXT," +
    "created_at TEXT DEFAULT (datetime('now'))" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_dl_day ON downloads(day);" +
    "CREATE INDEX IF NOT EXISTS idx_dl_proj ON downloads(project);" +
    "CREATE TABLE IF NOT EXISTS pageviews (" +
    "id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "path TEXT," +
    "host TEXT," +
    "ref TEXT," +
    "visitor TEXT," +
    "day TEXT," +
    "created_at TEXT DEFAULT (datetime('now'))" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_pv_day ON pageviews(day);"
  );
  ensured = true;
}

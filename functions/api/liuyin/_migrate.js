/* ============================================================
 * 柳荫册 Web 版 · 惰性迁移
 * 作用：
 *   1. 兜底建表（CREATE IF NOT EXISTS，与 schema-liuyin.sql 一致，幂等）
 *   2. 给 ly_users 补 last_seen 列（在线判断用）——老库 ALTER TABLE
 * 说明：每个 isolate 只跑一次；并发 ALTER 撞车时忽略 duplicate column 错误。
 * ============================================================ */

const SCHEMA_SQL =
  "CREATE TABLE IF NOT EXISTS ly_users (" +
  "id TEXT PRIMARY KEY," +
  "name TEXT NOT NULL," +
  "name_key TEXT NOT NULL," +
  "floor INTEGER NOT NULL," +
  "token TEXT NOT NULL UNIQUE," +
  "banned INTEGER NOT NULL DEFAULT 0," +
  "last_seen TEXT," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_ly_users_token ON ly_users(token);" +
  "CREATE INDEX IF NOT EXISTS idx_ly_users_floor ON ly_users(floor, banned);" +
  "CREATE TABLE IF NOT EXISTS ly_orders (" +
  "id TEXT PRIMARY KEY," +
  "kind TEXT NOT NULL DEFAULT 'errand'," +
  "creator_id TEXT NOT NULL," +
  "claimer_id TEXT," +
  "title TEXT NOT NULL," +
  "note TEXT," +
  "from_place TEXT," +
  "to_floor INTEGER," +
  "start_at TEXT," +
  "end_at TEXT," +
  "capacity INTEGER DEFAULT 1," +
  "code TEXT," +
  "status TEXT NOT NULL DEFAULT 'pending'," +
  "photo_key TEXT," +
  "proof_key TEXT," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))," +
  "updated_at TEXT" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_ly_orders_status ON ly_orders(status, created_at);" +
  "CREATE INDEX IF NOT EXISTS idx_ly_orders_creator ON ly_orders(creator_id);" +
  "CREATE INDEX IF NOT EXISTS idx_ly_orders_claimer ON ly_orders(claimer_id);" +
  "CREATE INDEX IF NOT EXISTS idx_ly_orders_floor ON ly_orders(to_floor, status);" +
  "CREATE TABLE IF NOT EXISTS ly_confirmations (" +
  "order_id TEXT NOT NULL," +
  "user_id TEXT NOT NULL," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))," +
  "PRIMARY KEY (order_id, user_id)" +
  ");" +
  "CREATE TABLE IF NOT EXISTS ly_ledger (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "order_id TEXT NOT NULL UNIQUE," +
  "from_id TEXT NOT NULL," +
  "to_id TEXT NOT NULL," +
  "delta INTEGER NOT NULL DEFAULT 1," +
  "note TEXT," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_ly_ledger_to ON ly_ledger(to_id);" +
  "CREATE INDEX IF NOT EXISTS idx_ly_ledger_from ON ly_ledger(from_id);" +
  "CREATE TABLE IF NOT EXISTS ly_messages (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "order_id TEXT NOT NULL," +
  "from_id TEXT NOT NULL," +
  "body TEXT NOT NULL," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  ");" +
  "CREATE INDEX IF NOT EXISTS idx_ly_messages_order ON ly_messages(order_id, id);" +
  "CREATE TABLE IF NOT EXISTS ly_bans (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "user_id TEXT," +
  "ip_hash TEXT," +
  "reason TEXT," +
  "created_at TEXT NOT NULL DEFAULT (datetime('now'))" +
  ");" +
  "CREATE TABLE IF NOT EXISTS ly_settings (" +
  "key TEXT PRIMARY KEY," +
  "value TEXT" +
  ");" +
  "INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('building', '6 号楼');" +
  "INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('floors', '6');" +
  "INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('notice', '');" +
  "INSERT OR IGNORE INTO ly_settings(key, value) VALUES ('demo_open', '1');";

/* 按 env.DB 缓存（生产里 env.DB 是稳定对象；测试里可以换库） */
const cache = new WeakMap();

export function ensureSchema(env) {
  const db = env && env.DB;
  if (!db || typeof db.prepare !== "function") {
    const err = new Error("数据库还没接上，稍后再试");
    err.status = 503;
    return Promise.reject(err);
  }
  let p = cache.get(db);
  if (!p) {
    p = init(env);
    cache.set(db, p);
    p.catch(() => {
      if (cache.get(db) === p) cache.delete(db); // 失败不缓存，下次重试
    });
  }
  return p;
}

async function init(env) {
  const db = env && env.DB;
  if (!db) {
    const err = new Error("数据库还没接上，稍后再试");
    err.status = 503;
    throw err;
  }
  await db.exec(SCHEMA_SQL);
  await ensureColumn(db, "ly_users", "last_seen", "TEXT");
  try {
    await db.exec("CREATE INDEX IF NOT EXISTS idx_ly_users_seen ON ly_users(last_seen)");
  } catch (e) {
    /* 索引失败不影响功能 */
  }
  return true;
}

async function ensureColumn(db, table, column, type) {
  /* 先直接尝试加列：新库会在建表时带上 last_seen，这里的 ALTER 报 duplicate column 就忽略；
     老库则一次成功。比「先查 pragma 再加列」少一次查询，也不依赖 pragma 表函数。 */
  try {
    await db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + type);
    return;
  } catch (e) {
    const msg = String((e && e.message) || e).toLowerCase();
    if (msg.indexOf("duplicate column") > -1 || msg.indexOf("already exists") > -1) return;
  }
  /* ALTER 因别的原因失败（并发/方言差异）：再确认列是否已存在 */
  let names = [];
  try {
    const res = await db.prepare("SELECT name FROM pragma_table_info('" + table + "')").all();
    names = ((res && res.results) || []).map((r) => r.name);
  } catch (e2) {
    return;
  }
  if (names.includes(column)) return;
  const err = new Error("数据库升级失败，稍后再试");
  err.status = 500;
  throw err;
}

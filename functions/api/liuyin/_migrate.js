/* ============================================================
 * 柳荫册 Web 版 · 惰性迁移
 *
 * 策略（幂等、可重复、不阻塞）：
 *   1. 任何 API 入口先 ensureSchema(env)：建表（CREATE IF NOT EXISTS，新装即完整）
 *   2. 读 ly_settings.schema_version；低于 SCHEMA_VERSION 时：
 *      - 逐列 ALTER TABLE ADD COLUMN（重复列错误吞掉）
 *      - 老数据映射：confirmed→connected、picked→connected、returned→released
 *      - 按品类补 steps / current_step / points / need_code
 *      - claimed 单补 conn_deadline
 *      - 写 schema_version
 *   3. 每个 isolate 只跑一次（WeakMap 按 env.DB 缓存）；失败不缓存，下次重试
 *
 * 迁移里同时创建 ly_pres_cmd / ly_pres_state（路演提词台依赖），
 * 避免提词台在没人打开主站前 500。
 * ============================================================ */
import {
  SCHEMA_SQL,
  SCHEMA_VERSION,
  TEMPLATE_IDS,
  TEMPLATE_BY_CATEGORY,
  buildSteps,
  parseSteps,
  nextStepIndex,
  templateOf,
  categoryOf,
} from "./_schema.js";

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
  const db = env.DB;
  /* 注意：D1 的 exec() 以换行分隔语句，多行 CREATE TABLE 会被拆坏；
     这里把 DDL 压成一行再执行（语句之间用分号分隔，sqlite 一次执行多语句）。 */
  await db.exec(String(SCHEMA_SQL).replace(/\s*\n\s*/g, " "));
  const current = await readVersion(db);
  if (current < SCHEMA_VERSION) {
    await migrate(db, current);
    await writeSetting(db, "schema_version", String(SCHEMA_VERSION));
  }
  return true;
}

async function readVersion(db) {
  try {
    const row = await db.prepare("SELECT value FROM ly_settings WHERE key = 'schema_version'").first();
    const n = row ? parseInt(row.value, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (e) {
    return 0;
  }
}

async function writeSetting(db, key, value) {
  await db
    .prepare("INSERT OR REPLACE INTO ly_settings (key, value) VALUES (?, ?)")
    .bind(key, String(value))
    .run();
}

/* 先尝试加列；duplicate column / already exists 视为成功 */
async function ensureColumn(db, table, column, type) {
  try {
    await db.exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + type);
    return true;
  } catch (e) {
    const msg = String((e && e.message) || e).toLowerCase();
    if (msg.indexOf("duplicate column") > -1 || msg.indexOf("already exists") > -1) return true;
  }
  let names = [];
  try {
    const res = await db.prepare("SELECT name FROM pragma_table_info('" + table + "')").all();
    names = ((res && res.results) || []).map((r) => r.name);
  } catch (e2) {
    return true;
  }
  if (names.includes(column)) return true;
  const err = new Error("数据库升级失败，稍后再试");
  err.status = 500;
  throw err;
}

const USER_COLUMNS = [
  ["nickname", "TEXT"],
  ["real_name", "TEXT"],
  ["show_real_name", "INTEGER DEFAULT 1"],
  ["avatar", "TEXT"],
  ["room_no", "TEXT"],
  ["building_id", "TEXT DEFAULT 'b_6'"],
  ["is_demo", "INTEGER DEFAULT 0"],
  ["onboarded", "INTEGER DEFAULT 0"],
  ["missed", "INTEGER DEFAULT 0"],
  ["last_seen", "TEXT"],
];

const ORDER_COLUMNS = [
  ["category", "TEXT"],
  ["template_id", "TEXT"],
  ["size", "TEXT"],
  ["pickup", "TEXT"],
  ["time_label", "TEXT"],
  ["points", "INTEGER"],
  ["need_code", "INTEGER DEFAULT 0"],
  ["steps", "TEXT"],
  ["current_step", "INTEGER DEFAULT 0"],
  ["conn_deadline", "TEXT"],
  ["conn_extended", "INTEGER DEFAULT 0"],
  ["delivered_at", "TEXT"],
  ["done_at", "TEXT"],
  ["released_reason", "TEXT"],
];

function legacyTemplate(row) {
  if (row.template_id && TEMPLATE_IDS.indexOf(row.template_id) >= 0) return row.template_id;
  const title = String(row.title || "");
  const category = String(row.category || "");
  if (category && TEMPLATE_BY_CATEGORY[category]) return TEMPLATE_BY_CATEGORY[category];
  if (row.kind === "route") return "deliver";
  if (title.indexOf("快递") > -1 || title.indexOf("取件") > -1 || title.indexOf("包裹") > -1) return "pickup";
  if (title.indexOf("饭") > -1 || title.indexOf("餐") > -1 || title.indexOf("奶茶") > -1 || title.indexOf("咖啡") > -1) return "food";
  if (title.indexOf("垃圾") > -1) return "trash";
  if (title.indexOf("东西") > -1 || title.indexOf("送") > -1 || title.indexOf("伞") > -1) return "deliver";
  return "custom";
}

async function migrate(db, fromVersion) {
  /* ---- 1. 补列 ---- */
  for (const [col, type] of USER_COLUMNS) await ensureColumn(db, "ly_users", col, type);
  for (const [col, type] of ORDER_COLUMNS) await ensureColumn(db, "ly_orders", col, type);

  /* 新列索引必须等 ALTER 之后建（老库建表时没有这些列） */
  try {
    await db.exec("CREATE INDEX IF NOT EXISTS idx_ly_users_demo ON ly_users(is_demo)");
  } catch (e) {
    /* 索引失败不影响功能 */
  }

  /* ---- 2. 用户默认值 ---- */
  await db.exec(
    "UPDATE ly_users SET " +
      "nickname = COALESCE(NULLIF(nickname, ''), name), " +
      "real_name = COALESCE(real_name, ''), " +
      "show_real_name = COALESCE(show_real_name, 1), " +
      "avatar = COALESCE(NULLIF(avatar, ''), 'preset:sage'), " +
      "room_no = COALESCE(room_no, ''), " +
      "building_id = COALESCE(NULLIF(building_id, ''), 'b_6'), " +
      "is_demo = COALESCE(is_demo, 0), " +
      "onboarded = COALESCE(onboarded, 1), " +
      "missed = COALESCE(missed, 0)"
  );

  /* ---- 3. 订单：状态映射 + 模板补 steps ---- */
  const now = Date.now();
  let rows = [];
  try {
    const res = await db
      .prepare(
        "SELECT id, status, kind, title, category, template_id, size, pickup, time_label, " +
          "points, note, to_floor, need_code, code, steps, conn_deadline, conn_extended, " +
          "created_at, updated_at FROM ly_orders ORDER BY created_at ASC LIMIT 2000"
      )
      .all();
    rows = (res && res.results) || [];
  } catch (e) {
    rows = [];
  }

  for (const row of rows) {
    const legacyStatus = String(row.status || "pending");
    const template = legacyTemplate(row);
    const category = String(row.category || "") || categoryOf(template);
    let steps = parseSteps(row.steps);
    if (!steps.length) {
      const needCode = template === "pickup" || (template === "custom" && !!(row.need_code || row.code));
      steps = buildSteps(template, { needCode });
    }

    const markDone = (pred, text) => {
      for (const step of steps) {
        if (step.status === "done") continue;
        if (!pred(step)) continue;
        step.status = "done";
        step.completed_at = step.completed_at || now - 60000;
        if (text && step.type === "provide_code") step.text_value = text;
      }
    };
    if (legacyStatus === "confirmed") {
      markDone((s) => s.type === "provide_code", String(row.code || ""));
    } else if (legacyStatus === "picked") {
      markDone((s) => s.type === "provide_code", String(row.code || ""));
      markDone((s) => s.type === "pickup");
    } else if (legacyStatus === "delivered" || legacyStatus === "done") {
      markDone(() => true);
    }

    let status = legacyStatus;
    if (legacyStatus === "confirmed" || legacyStatus === "picked") status = "connected";
    if (legacyStatus === "returned") status = "released";
    if (["pending", "claimed", "connected", "delivered", "done", "cancelled", "released"].indexOf(status) < 0) {
      status = "pending";
    }

    let deadline = row.conn_deadline || null;
    if (status === "claimed" && !deadline) deadline = new Date(now + 10 * 60 * 1000).toISOString();

    const points = Number(row.points) > 0 ? Number(row.points) : 2;
    const needCode = template === "pickup" || (template === "custom" && !!(row.need_code || row.code)) ? 1 : 0;
    const current = nextStepIndex(steps);
    const releasedReason =
      status === "released" && !row.released_reason ? (legacyStatus === "returned" ? "timeout" : "cancel") : row.released_reason || null;

    await db
      .prepare(
        "UPDATE ly_orders SET status = ?, category = ?, template_id = ?, size = COALESCE(size, ''), " +
          "pickup = COALESCE(NULLIF(pickup, ''), from_place, ''), time_label = COALESCE(NULLIF(time_label, ''), end_at, '现在'), " +
          "points = ?, need_code = ?, steps = ?, current_step = ?, conn_deadline = ?, " +
          "conn_extended = COALESCE(conn_extended, 0), delivered_at = COALESCE(delivered_at, CASE WHEN ? = 'delivered' OR ? = 'done' THEN updated_at ELSE NULL END), " +
          "done_at = COALESCE(done_at, CASE WHEN ? = 'done' THEN updated_at ELSE NULL END), " +
          "released_reason = ?, updated_at = COALESCE(updated_at, created_at) WHERE id = ?"
      )
      .bind(
        status,
        category,
        template,
        points,
        needCode,
        JSON.stringify(steps),
        current,
        deadline,
        status,
        status,
        status,
        releasedReason,
        row.id
      )
      .run();
  }

  /* ---- 4. 机器人配置兜底（老库可能没有默认行） ---- */
  try {
    await db.exec(
      "INSERT OR IGNORE INTO ly_robot_config(id, enabled, interval_sec, max_actions, auto_accept, auto_connect, auto_steps, auto_confirm, random_chat, chat_chance, pool_min) " +
        "VALUES (1, 1, 5, 1, 1, 1, 1, 1, 1, 30, 2)"
    );
    await db.exec(
      "UPDATE ly_robot_config SET " +
        "enabled = COALESCE(enabled, 1), interval_sec = COALESCE(interval_sec, 5), max_actions = COALESCE(max_actions, 1), " +
        "auto_accept = COALESCE(auto_accept, 1), auto_connect = COALESCE(auto_connect, 1), " +
        "auto_steps = COALESCE(auto_steps, 1), auto_confirm = COALESCE(auto_confirm, 1), " +
        "random_chat = COALESCE(random_chat, 1), chat_chance = COALESCE(chat_chance, 30), pool_min = COALESCE(pool_min, 2) " +
        "WHERE id = 1"
    );
  } catch (e) {
    /* 机器人配置失败不影响主流程 */
  }

  /* ---- 5. 清掉过期的 pending 状态缓存（无状态，无需处理） ---- */
  return fromVersion;
}

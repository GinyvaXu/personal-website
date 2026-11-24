/* ============================================================
 * 柳荫册 Web 版 · 机器人邻居（demo 核心）
 * 位置：functions/api/liuyin/_robot.js（下划线开头，不是路由）
 *
 * 定位：服务端扮演楼里的邻居（is_demo=1），让「一个人 + 一栋楼」也能完整体验
 *       发单 → 接单 → 双确认 → 履约 → 送达 → 人情点。
 *
 * 触发：/sync 与 /orders/* 动作之后调用 maybeRun(env)（全局节流 + 单轮动作上限）。
 * 动作优先级（全部条件 UPDATE 防并发）：
 *   1. 维持池子：待接委托 < pool_min 时机器人发一条
 *   2. 接真人单：真人 pending 的单，随机机器人 claim
 *   3. 补双确认：对方已确认、机器人未确认 → 补 confirm
 *   4. 推进步骤：当前步属于机器人角色 → 完成（provide_code 由机器人填码）
 *   5. 送达：helper 步骤全完成时自动 delivered（在步骤动作里一起做）
 *   6. 确认收货：机器人是发单方且 delivered → complete（写 ledger，真人 +points）
 *   7. 随机消息：claimed/connected/delivered 中按 chat_chance 发一句
 *   8. 顺路卡：楼里 active 卡 < 1 时机器人挂一张
 *
 * 管理：POST /admin/robot/run {n} 立即连跑 n 个动作；/admin/robot/seed 生成 6 种状态场景；
 *       /admin/seed 铺演示楼栋。动作写 ly_robot_log（保留 30 条）。
 * ============================================================ */
import {
  ApiError,
  nowIso,
  addMinutesIso,
  makeId,
  changesOf,
  insertMessage,
  getSetting,
  setSetting,
  parseSteps,
  buildSteps,
  nextStepIndex,
  helperStepsDone,
  categoryOf,
  templateOf,
  AVATAR_PRESETS,
  normalizeName,
  BUILDING,
} from "./_lib.js";

/* ---------------- 邻居种子（与方案一致） ---------------- */
export const DEMO_NEIGHBORS = [
  { id: "u_demo_zhou", name: "小周", floor: 3, avatar: "preset:sage", real_name: "周予" },
  { id: "u_demo_he", name: "阿禾", floor: 5, avatar: "preset:peach", real_name: "何禾" },
  { id: "u_demo_linyi", name: "林一", floor: 2, avatar: "preset:clay", real_name: "林一" },
  { id: "u_demo_xiaoman", name: "小满", floor: 4, avatar: "preset:mist", real_name: "满艺" },
  { id: "u_demo_awu", name: "阿梧", floor: 6, avatar: "preset:sky", real_name: "吴桐" },
  { id: "u_demo_yezi", name: "叶子", floor: 3, avatar: "preset:leaf", real_name: "叶知秋" },
];

export const ROBOT_DEFAULTS = {
  enabled: true,
  interval_sec: 5,
  max_actions: 1,
  auto_accept: true,
  auto_connect: true,
  auto_steps: true,
  auto_confirm: true,
  random_chat: true,
  chat_chance: 30,
  pool_min: 2,
};

const CHAT_TEXTS = ["我 18:10 从驿站回", "放门口可以吗", "我到楼下了", "稍等两分钟", "马上到"];
const NOTE_TEXTS = ["不着急，顺路就好", "有点重，辛苦啦", "谢谢邻居", "到了放门口就行", "雨天，慢慢来"];
const PICKUP_BY_TEMPLATE = {
  pickup: ["驿站", "菜鸟驿站", "快递柜"],
  food: ["食堂一楼", "食堂二楼", "东门小吃"],
  deliver: ["超市", "教学楼", "快递站"],
  trash: ["宿舍门口", "楼道口"],
};
const TIME_LABELS = ["现在", "30 分钟内", "18:10 前", "18:30 前"];

/* ---------------- 小工具 ---------------- */
function pick(list) {
  if (!list || !list.length) return "";
  return list[Math.floor(Math.random() * list.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function asBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return Number(value) === 1 || value === true || value === "true";
}

function asInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/* ---------------- 配置 ---------------- */
export async function getRobotConfig(env) {
  let row = null;
  try {
    row = await env.DB.prepare("SELECT * FROM ly_robot_config WHERE id = 1").first();
  } catch (e) {
    row = null;
  }
  const r = row || {};
  return {
    enabled: asBool(r.enabled, ROBOT_DEFAULTS.enabled),
    interval_sec: asInt(r.interval_sec, ROBOT_DEFAULTS.interval_sec, 2, 600),
    max_actions: asInt(r.max_actions, ROBOT_DEFAULTS.max_actions, 1, 20),
    auto_accept: asBool(r.auto_accept, ROBOT_DEFAULTS.auto_accept),
    auto_connect: asBool(r.auto_connect, ROBOT_DEFAULTS.auto_connect),
    auto_steps: asBool(r.auto_steps, ROBOT_DEFAULTS.auto_steps),
    auto_confirm: asBool(r.auto_confirm, ROBOT_DEFAULTS.auto_confirm),
    random_chat: asBool(r.random_chat, ROBOT_DEFAULTS.random_chat),
    chat_chance: asInt(r.chat_chance, ROBOT_DEFAULTS.chat_chance, 0, 100),
    pool_min: asInt(r.pool_min, ROBOT_DEFAULTS.pool_min, 0, 20),
  };
}

export async function setRobotConfig(env, patch) {
  const cur = await getRobotConfig(env);
  const next = Object.assign({}, cur, patch || {});
  await env.DB.prepare(
    "INSERT INTO ly_robot_config (id, enabled, interval_sec, max_actions, auto_accept, auto_connect, " +
      "auto_steps, auto_confirm, random_chat, chat_chance, pool_min, updated_at) " +
      "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, interval_sec=excluded.interval_sec, " +
      "max_actions=excluded.max_actions, auto_accept=excluded.auto_accept, auto_connect=excluded.auto_connect, " +
      "auto_steps=excluded.auto_steps, auto_confirm=excluded.auto_confirm, random_chat=excluded.random_chat, " +
      "chat_chance=excluded.chat_chance, pool_min=excluded.pool_min, updated_at=excluded.updated_at"
  )
    .bind(
      next.enabled ? 1 : 0,
      next.interval_sec,
      next.max_actions,
      next.auto_accept ? 1 : 0,
      next.auto_connect ? 1 : 0,
      next.auto_steps ? 1 : 0,
      next.auto_confirm ? 1 : 0,
      next.random_chat ? 1 : 0,
      next.chat_chance,
      next.pool_min,
      nowIso()
    )
    .run();
  return getRobotConfig(env);
}

/* ---------------- 日志（保留最近 30 条） ---------------- */
export async function pushRobotLog(env, text) {
  const body = String(text == null ? "" : text).slice(0, 120);
  if (!body) return;
  await env.DB.prepare("INSERT INTO ly_robot_log (text, created_at) VALUES (?, ?)")
    .bind(body, nowIso())
    .run();
  try {
    await env.DB.prepare(
      "DELETE FROM ly_robot_log WHERE id NOT IN (SELECT id FROM ly_robot_log ORDER BY id DESC LIMIT 30)"
    ).run();
  } catch (e) {
    /* 清理失败不影响 */
  }
}

export async function getRobotLog(env, limit = 30) {
  const res = await env.DB.prepare("SELECT id, text, created_at FROM ly_robot_log ORDER BY id DESC LIMIT ?")
    .bind(asInt(limit, 30, 1, 100))
    .all();
  return ((res && res.results) || []).map((r) => ({
    id: r.id,
    text: r.text,
    at: r.created_at,
  }));
}

/* ---------------- 邻居种子（幂等；先用一次 COUNT 判定，避免每轮 16 次无谓写入） ---------------- */
export async function ensureDemoNeighbors(env) {
  const db = env.DB;
  let existing = 0;
  try {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM ly_users WHERE is_demo = 1").first();
    existing = Number((row && row.n) || 0);
  } catch (e) {
    existing = 0;
  }
  if (existing >= DEMO_NEIGHBORS.length) return true;

  for (const n of DEMO_NEIGHBORS) {
    await db.prepare(
      "INSERT OR IGNORE INTO ly_users (id, name, name_key, nickname, real_name, show_real_name, avatar, floor, " +
        "room_no, building_id, token, banned, is_demo, onboarded, missed, last_seen, created_at) " +
        "VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'b_6', ?, 0, 1, 1, 0, NULL, ?)"
    )
      .bind(
        n.id,
        n.name,
        normalizeName(n.name),
        n.name,
        n.real_name,
        n.avatar,
        n.floor,
        n.floor + "0" + randInt(1, 8),
        "demo-token-" + crypto.randomUUID(),
        new Date(Date.now() - 30 * 86400000).toISOString()
      )
      .run();
  }
  await seedDemoHistory(env);
  return true;
}

export async function listDemoNeighbors(env) {
  const res = await env.DB.prepare(
    "SELECT id, name, nickname, avatar, floor FROM ly_users WHERE is_demo = 1 ORDER BY floor ASC, id ASC"
  ).all();
  return (res && res.results) || [];
}

/* 两条历史完成单，让邻居的「人情分」不为 0（纯展示，不影响真人） */
async function seedDemoHistory(env) {
  const db = env.DB;
  const at = new Date(Date.now() - 5 * 86400000).toISOString();
  const histories = [
    {
      id: "o_demo_hist_1",
      creator: "u_demo_zhou",
      claimer: "u_demo_he",
      category: "带饭",
      template: "food",
      pickup: "食堂二楼",
      points: 1,
    },
    {
      id: "o_demo_hist_2",
      creator: "u_demo_linyi",
      claimer: "u_demo_zhou",
      category: "取快递",
      template: "pickup",
      pickup: "驿站",
      points: 2,
    },
  ];
  for (const h of histories) {
    const steps = buildSteps(h.template, { needCode: h.template === "pickup" }).map((s) => ({
      ...s,
      status: "done",
      completed_at: Date.parse(at),
      text_value: s.type === "provide_code" ? "A1234" : "",
    }));
    await db.prepare(
      "INSERT OR IGNORE INTO ly_orders (id, kind, creator_id, claimer_id, title, category, template_id, size, pickup, " +
        "time_label, points, note, to_floor, need_code, code, steps, current_step, status, conn_deadline, conn_extended, " +
        "created_at, updated_at, delivered_at, done_at) " +
        "VALUES (?, 'errand', ?, ?, ?, ?, ?, '', ?, '18:30 前', ?, '', 3, ?, ?, ?, ?, 'done', NULL, 0, ?, ?, ?, ?)"
    )
      .bind(
        h.id,
        h.creator,
        h.claimer,
        h.category,
        h.category,
        h.template,
        h.pickup,
        h.points,
        h.template === "pickup" ? 1 : 0,
        h.template === "pickup" ? "A1234" : "",
        JSON.stringify(steps),
        steps.length,
        at,
        at,
        at,
        at
      )
      .run();
    for (const uid of [h.creator, h.claimer]) {
      await db.prepare(
        "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
      )
        .bind(h.id, uid, at)
        .run();
    }
    await db.prepare(
      "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(h.id, h.creator, h.claimer, h.points, "「" + h.category + "」的人情", at)
      .run();
  }
}

/* ============================================================
 * 主入口
 * ============================================================ */
export async function maybeRun(env, opts) {
  const options = opts || {};
  let cfg;
  try {
    cfg = await getRobotConfig(env);
  } catch (e) {
    return [];
  }
  if (!cfg.enabled && !options.force) return [];

  try {
    await ensureDemoNeighbors(env);
  } catch (e) {
    /* 邻居种子失败也继续，池子动作会兜底 */
  }

  if (!options.force) {    const last = await getSetting(env.DB, "robot_last_tick", "");
    const lastMs = last ? Date.parse(last) : 0;
    if (lastMs && Date.now() - lastMs < cfg.interval_sec * 1000) return [];
  }
  try {
    await setSetting(env.DB, "robot_last_tick", nowIso());
  } catch (e) {
    /* 节流写失败不致命 */
  }

  const budget = asInt(options.actions, cfg.max_actions, 1, 30);
  const done = [];
  for (let i = 0; i < budget; i += 1) {
    let action = null;
    try {
      action = await planNextAction(env, cfg);
    } catch (e) {
      console.error("[robot] plan", (e && e.stack) || e);
      break;
    }
    if (!action) break;
    let text = "";
    try {
      text = await action();
    } catch (e) {
      console.error("[robot] run", (e && e.stack) || e);
    }
    if (text) {
      done.push(text);
      try {
        await pushRobotLog(env, text);
      } catch (e) {
        /* 日志失败不影响 */
      }
    }
  }
  return done;
}

/* 管理端「立即连跑 n 个动作」 */
export async function runRobot(env, n) {
  return maybeRun(env, { force: true, actions: asInt(n, 5, 1, 30) });
}

/* ---------------- 按优先级挑一个动作 ---------------- */
async function planNextAction(env, cfg) {
  const demos = await listDemoNeighbors(env);
  if (!demos.length) return null;

  /* 优先级说明：计划书里「维持池子」排第 1，但 demo 单人闭环里如果池子先补货，
     会一直抢不到「补确认 / 推进步骤」的时机。这里把池子维护放到「在途单处理之后、
     闲聊之前」：在途单一出现就优先推进，楼里空闲时再保持池底。 */
  const checks = [
    () => planClaimHumanOrder(env, cfg, demos),
    () => planCompleteConfirm(env, cfg, demos),
    () => planAdvanceStep(env, cfg, demos),
    () => planConfirmReceipt(env, cfg, demos),
    () => planMaintainPool(env, cfg, demos),
    () => planRandomChat(env, cfg, demos),
    () => planRouteCard(env, cfg, demos),
  ];
  for (const check of checks) {
    const action = await check();
    if (action) return action;
  }
  return null;
}

function demoIdMap(demos) {
  const map = new Map();
  for (const d of demos) map.set(d.id, d);
  return map;
}

/* ---------- 1. 维持池子 ---------- */
async function planMaintainPool(env, cfg, demos) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ly_orders WHERE kind = 'errand' AND status IN ('pending', 'released')"
  ).first();
  const count = Number((row && row.n) || 0);
  if (count >= cfg.pool_min) return null;

  const creator = pick(demos);
  const template = pick(["pickup", "food", "deliver", "trash"]);
  const category = categoryOf(template);
  const pickup = pick(PICKUP_BY_TEMPLATE[template] || ["驿站"]);
  const toFloor = randInt(2, 6);
  const points = pick([1, 2, 2, 3]);
  const timeLabel = pick(TIME_LABELS);
  const note = pick(NOTE_TEXTS);
  const needCode = template === "pickup" ? 1 : 0;
  const steps = buildSteps(template, { needCode: template === "pickup" });
  const id = makeId("o_");
  const now = nowIso();

  return async () => {
    await env.DB.prepare(
      "INSERT INTO ly_orders (id, kind, creator_id, claimer_id, title, category, template_id, size, pickup, " +
        "time_label, points, note, to_floor, need_code, code, steps, current_step, status, from_place, capacity, " +
        "conn_deadline, conn_extended, created_at, updated_at) " +
        "VALUES (?, 'errand', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0, 'pending', ?, 1, NULL, 0, ?, ?)"
    )
      .bind(
        id,
        creator.id,
        category,
        category,
        template,
        template === "pickup" ? pick(["小件", "中件", "大件"]) : "",
        pickup,
        timeLabel,
        points,
        note,
        toFloor,
        needCode,
        JSON.stringify(steps),
        pickup,
        now,
        now
      )
      .run();
    return creator.name + " 发了一条「" + category + " · " + pickup + "」";
  };
}

/* ---------- 2. 接真人单 ---------- */
async function planClaimHumanOrder(env, cfg, demos) {
  if (!cfg.auto_accept) return null;
  const res = await env.DB.prepare(
    "SELECT o.id, o.category, o.pickup, o.creator_id, o.status FROM ly_orders o " +
      "WHERE o.kind = 'errand' AND o.status IN ('pending', 'released') " +
      "AND o.creator_id NOT IN (SELECT id FROM ly_users WHERE is_demo = 1) " +
      "ORDER BY o.created_at ASC LIMIT 10"
  ).all();
  const rows = (res && res.results) || [];
  if (!rows.length) return null;
  const target = rows[0];
  const robot = pick(demos);
  if (target.creator_id === robot.id) return null;

  return async () => {
    const now = nowIso();
    const deadline = addMinutesIso(10);
    const upd = await env.DB.prepare(
      "UPDATE ly_orders SET status = 'claimed', claimer_id = ?, conn_deadline = ?, conn_extended = 0, " +
        "released_reason = NULL, updated_at = ? " +
        "WHERE id = ? AND status IN ('pending', 'released') AND creator_id <> ?"
    )
      .bind(robot.id, deadline, now, target.id, robot.id)
      .run();
    if (changesOf(upd) < 1) return "";
    const text = pick(["我 18:10 从驿站回，顺路。", "看到了，我来吧。", "我在楼下，顺手带。"]);
    await insertMessage(env.DB, target.id, robot.id, text);
    return robot.name + " 接了「" + target.category + "」";
  };
}

/* ---------- 3. 补双确认 ---------- */
async function planCompleteConfirm(env, cfg) {
  if (!cfg.auto_connect) return null;
  const demos = await listDemoNeighbors(env);
  const map = demoIdMap(demos);
  const res = await env.DB.prepare(
    "SELECT o.id, o.creator_id, o.claimer_id, o.status FROM ly_orders o " +
      "WHERE o.status = 'claimed' AND (o.creator_id IN (SELECT id FROM ly_users WHERE is_demo = 1) " +
      "OR o.claimer_id IN (SELECT id FROM ly_users WHERE is_demo = 1)) ORDER BY o.updated_at ASC LIMIT 20"
  ).all();
  for (const row of (res && res.results) || []) {
    const robotId = map.has(row.creator_id) ? row.creator_id : map.has(row.claimer_id) ? row.claimer_id : null;
    const otherId = robotId === row.creator_id ? row.claimer_id : row.creator_id;
    if (!robotId || !otherId) continue;
    const conf = await env.DB.prepare(
      "SELECT user_id FROM ly_confirmations WHERE order_id = ?"
    )
      .bind(row.id)
      .all();
    const ids = new Set(((conf && conf.results) || []).map((r) => r.user_id));
    if (!ids.has(otherId) || ids.has(robotId)) continue;
    const robot = map.get(robotId);
    return async () => {
      const t = nowIso();
      await env.DB.prepare(
        "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
      )
        .bind(row.id, robotId, t)
        .run();
      const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM ly_confirmations WHERE order_id = ?")
        .bind(row.id)
        .first();
      if (Number((cnt && cnt.n) || 0) >= 2) {
        const upd = await env.DB.prepare(
          "UPDATE ly_orders SET status = 'connected', conn_deadline = NULL, updated_at = ? " +
            "WHERE id = ? AND status = 'claimed'"
        )
          .bind(t, row.id)
          .run();
        if (changesOf(upd) > 0) {
          await insertMessage(env.DB, row.id, robotId, pick(["好，按步骤来吧。", "确认好了，我这就去。", "收到，马上。"]));
          return robot.name + " 也确认了，订单成立";
        }
      }
      return "";
    };
  }
  return null;
}

/* ---------- 4/5. 推进步骤（helper 步骤全完成即自动送达） ---------- */
async function planAdvanceStep(env, cfg) {
  if (!cfg.auto_steps) return null;
  const demos = await listDemoNeighbors(env);
  const map = demoIdMap(demos);
  const res = await env.DB.prepare(
    "SELECT o.* FROM ly_orders o WHERE o.status = 'connected' " +
      "AND (o.creator_id IN (SELECT id FROM ly_users WHERE is_demo = 1) " +
      "OR o.claimer_id IN (SELECT id FROM ly_users WHERE is_demo = 1)) " +
      "ORDER BY COALESCE(o.updated_at, o.created_at) ASC LIMIT 20"
  ).all();
  for (const row of (res && res.results) || []) {
    const steps = parseSteps(row.steps);
    const index = nextStepIndex(steps);
    if (index >= steps.length) continue;
    const step = steps[index];
    if (step.type === "confirm") continue;
    /* 双方都可能是机器人：挑「当前步骤归属」的那一个 */
    let robotRole = null;
    if (step.owner === "requester" && map.has(row.creator_id)) robotRole = "requester";
    else if (step.owner === "helper" && map.has(row.claimer_id)) robotRole = "helper";
    if (!robotRole) continue;
    const robotId = robotRole === "requester" ? row.creator_id : row.claimer_id;
    const robot = map.get(robotId);
    return async () => {
      const fresh = await env.DB.prepare("SELECT * FROM ly_orders WHERE id = ?").bind(row.id).first();
      if (!fresh || fresh.status !== "connected") return "";
      const steps2 = parseSteps(fresh.steps);
      const idx = nextStepIndex(steps2);
      if (idx >= steps2.length) return "";
      const st = steps2[idx];
      if (st.owner !== robotRole || st.type === "confirm") return "";
      let code = "";
      if (st.type === "provide_code") {
        code = String(fresh.code || "").trim() || "A" + randInt(1000, 9999);
        st.text_value = code;
        st.status = "done";
        st.completed_at = Date.now();
      } else {
        st.status = "done";
        st.completed_at = Date.now();
      }
      const nextIdx = nextStepIndex(steps2);
      const delivered = helperStepsDone(steps2);
      const t = nowIso();
      const upd = await env.DB.prepare(
        "UPDATE ly_orders SET steps = ?, current_step = ?, status = ?, code = ?, " +
          "delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END, updated_at = ? " +
          "WHERE id = ? AND status = 'connected' AND steps = ?"
      )
        .bind(
          JSON.stringify(steps2),
          nextIdx,
          delivered ? "delivered" : "connected",
          code || fresh.code || "",
          delivered ? "delivered" : "connected",
          t,
          t,
          row.id,
          fresh.steps
        )
        .run();
      if (changesOf(upd) < 1) return "";
      try {
        await insertMessage(
          env.DB,
          row.id,
          robotId,
          delivered ? pick(["到楼下了，放门口。", "放门口了，你看一下。", "交付好了。"]) : pick(["取到了，这就上去。", "拿到了。", "马上送到。"])
        );
      } catch (e) {
        /* 消息失败不影响 */
      }
      return robot.name + " 完成了「" + st.label + "」";
    };
  }
  return null;
}

/* ---------- 6. 确认收货（机器人是发单方） ---------- */
async function planConfirmReceipt(env, cfg) {
  if (!cfg.auto_confirm) return null;
  const demos = await listDemoNeighbors(env);
  const map = demoIdMap(demos);
  const res = await env.DB.prepare(
    "SELECT o.* FROM ly_orders o WHERE o.status = 'delivered' " +
      "AND o.creator_id IN (SELECT id FROM ly_users WHERE is_demo = 1) " +
      "ORDER BY o.delivered_at ASC LIMIT 10"
  ).all();
  for (const row of (res && res.results) || []) {
    const robotId = row.creator_id;
    const robot = map.get(robotId);
    if (!robot) continue;
    return async () => {
      const t = nowIso();
      const upd = await env.DB.prepare(
        "UPDATE ly_orders SET status = 'done', done_at = ?, updated_at = ? WHERE id = ? AND status = 'delivered'"
      )
        .bind(t, t, row.id)
        .run();
      if (changesOf(upd) < 1) return "";
      const delta = Number(row.points) || 1;
      await env.DB.prepare(
        "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(row.id, row.creator_id, row.claimer_id, delta, "「" + (row.category || "顺手") + "」的人情", t)
        .run();
      try {
        const steps = parseSteps(row.steps);
        const confirmStep = steps.find((s) => s.type === "confirm");
        if (confirmStep && confirmStep.status !== "done") {
          confirmStep.status = "done";
          confirmStep.completed_at = Date.now();
          await env.DB.prepare(
            "UPDATE ly_orders SET steps = ?, current_step = ? WHERE id = ? AND status = 'done'"
          )
            .bind(JSON.stringify(steps), steps.length, row.id)
            .run();
        }
      } catch (e) {
        /* 步骤标记失败不影响 */
      }
      await insertMessage(env.DB, row.id, robotId, "收到了，谢谢邻居。");
      return robot.name + " 确认收货，你 +" + delta + " 点人情";
    };
  }
  return null;
}

/* ---------- 7. 随机消息 ---------- */
async function planRandomChat(env, cfg, demos) {
  if (!cfg.random_chat) return null;
  if (Math.random() * 100 >= cfg.chat_chance) return null;
  const map = demoIdMap(demos);
  const res = await env.DB.prepare(
    "SELECT o.id, o.creator_id, o.claimer_id, o.status FROM ly_orders o " +
      "WHERE o.status IN ('claimed', 'connected', 'delivered') " +
      "AND (o.creator_id IN (SELECT id FROM ly_users WHERE is_demo = 1) " +
      "OR o.claimer_id IN (SELECT id FROM ly_users WHERE is_demo = 1)) " +
      "ORDER BY o.updated_at DESC LIMIT 20"
  ).all();
  const rows = (res && res.results) || [];
  if (!rows.length) return null;
  const target = pick(rows);
  const robotId = map.has(target.creator_id) ? target.creator_id : target.claimer_id;
  const robot = map.get(robotId);
  if (!robot) return null;

  const recent = await env.DB.prepare(
    "SELECT created_at FROM ly_messages WHERE order_id = ? AND from_id = ? ORDER BY id DESC LIMIT 1"
  )
    .bind(target.id, robotId)
    .first();
  if (recent && Date.now() - (Date.parse(recent.created_at) || 0) < 45 * 1000) return null;

  return async () => {
    const text = pick(CHAT_TEXTS);
    await insertMessage(env.DB, target.id, robotId, text);
    return robot.name + " 说：" + text;
  };
}

/* ---------- 8. 维持一张 active 顺路卡 ---------- */
async function planRouteCard(env, cfg, demos) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ly_route_cards WHERE status = 'active' AND (active_until IS NULL OR active_until > ?)"
  )
    .bind(nowIso())
    .first();
  if (Number((row && row.n) || 0) >= 1) return null;

  const robot = pick(demos);
  const id = makeId("r_");
  const now = nowIso();
  const card = {
    time_label: pick(["18:00–18:30", "12:00–12:30"]),
    from_place: pick(["驿站", "食堂", "教学楼"]),
    capacity: pick([1, 2, 2, 3]),
  };
  return async () => {
    await env.DB.prepare(
      "INSERT INTO ly_route_cards (id, user_id, floor, time_label, from_place, to_place, capacity, status, active_until, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)"
    )
      .bind(
        id,
        robot.id,
        robot.floor,
        card.time_label,
        card.from_place,
        BUILDING,
        card.capacity,
        addMinutesIso(120),
        now,
        now
      )
      .run();
    return robot.name + " 挂了一张顺路卡（" + card.time_label + " · " + card.from_place + "）";
  };
}

/* ============================================================
 * 管理端：铺演示楼栋 / 生成 6 种状态测试场景
 * ============================================================ */
export async function seedDemoBuilding(env) {
  const db = env.DB;
  await ensureDemoNeighbors(env);
  for (const [key, value] of [
    ["building", BUILDING],
    ["floors", "6"],
    ["demo_open", "1"],
    ["lit", "18"],
    ["target", "30"],
    ["code", "7241"],
  ]) {
    await setSetting(db, key, value);
  }
  const demos = await listDemoNeighbors(env);
  const now = nowIso();
  const pendingSeeds = [
    {
      id: "o_seed_open_1",
      creator: "u_demo_zhou",
      template: "pickup",
      category: "取快递",
      pickup: "菜鸟驿站",
      size: "中件",
      toFloor: 3,
      points: 2,
      time: "18:10 前",
      note: "六个件，有点重，我在 3 层等",
      age: 20,
    },
    {
      id: "o_seed_open_2",
      creator: "u_demo_he",
      template: "food",
      category: "带饭",
      pickup: "食堂二楼",
      size: "",
      toFloor: 5,
      points: 1,
      time: "18:30 前",
      note: "番茄牛腩饭，汤别洒，谢谢",
      age: 10,
    },
    {
      id: "o_seed_open_3",
      creator: "u_demo_linyi",
      template: "trash",
      category: "倒垃圾",
      pickup: "宿舍门口",
      size: "",
      toFloor: 2,
      points: 1,
      time: "现在",
      note: "顺手带下去就行",
      age: 5,
    },
  ];
  for (const s of pendingSeeds) {
    const at = new Date(Date.now() - s.age * 60000).toISOString();
    const steps = buildSteps(s.template, { needCode: s.template === "pickup" });
    await db.prepare(
      "INSERT OR IGNORE INTO ly_orders (id, kind, creator_id, claimer_id, title, category, template_id, size, pickup, " +
        "time_label, points, note, to_floor, need_code, code, steps, current_step, status, from_place, capacity, " +
        "conn_deadline, conn_extended, created_at, updated_at) " +
        "VALUES (?, 'errand', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0, 'pending', ?, 1, NULL, 0, ?, ?)"
    )
      .bind(
        s.id,
        s.creator,
        s.category,
        s.category,
        s.template,
        s.size,
        s.pickup,
        s.time,
        s.points,
        s.note,
        s.toFloor,
        s.template === "pickup" ? 1 : 0,
        JSON.stringify(steps),
        s.pickup,
        at,
        at
      )
      .run();
  }

  /* 一张演示顺路卡（若有 active 卡就跳过） */
  const active = await db.prepare(
    "SELECT COUNT(*) AS n FROM ly_route_cards WHERE status = 'active' AND (active_until IS NULL OR active_until > ?)"
  )
    .bind(now)
    .first();
  if (Number((active && active.n) || 0) < 1) {
    const host = demos[0] || { id: "u_demo_zhou", floor: 3 };
    await db.prepare(
      "INSERT OR IGNORE INTO ly_route_cards (id, user_id, floor, time_label, from_place, to_place, capacity, status, active_until, created_at, updated_at) " +
        "VALUES ('r_seed_route_1', ?, ?, '18:00–18:30', '驿站', ?, 2, 'active', ?, ?, ?)"
    )
      .bind(host.id, host.floor, BUILDING, addMinutesIso(120), now, now)
      .run();
  }

  const scalar = async (sql) => {
    const row = await db.prepare(sql).first();
    return Number((row && row.n) || 0);
  };
  return {
    seeded_at: now,
    users: await scalar("SELECT COUNT(*) AS n FROM ly_users"),
    neighbors: demos.length,
    orders: await scalar("SELECT COUNT(*) AS n FROM ly_orders"),
    open_orders: await scalar("SELECT COUNT(*) AS n FROM ly_orders WHERE status IN ('pending', 'released')"),
    active_routes: await scalar("SELECT COUNT(*) AS n FROM ly_route_cards WHERE status = 'active'"),
    ledger: await scalar("SELECT COUNT(*) AS n FROM ly_ledger"),
    building: { name: BUILDING, lit: 18, target: 30, code: "7241" },
  };
}

/** 给最近一个真人用户生成 6 种状态测试场景（管理页调试用） */
export async function seedRobotScenarios(env, userId) {
  const db = env.DB;
  await ensureDemoNeighbors(env);
  const demos = await listDemoNeighbors(env);
  if (!demos.length) throw new ApiError(500, "机器人邻居还没准备好");
  const human = userId
    ? await db.prepare("SELECT * FROM ly_users WHERE id = ? AND is_demo = 0").bind(userId).first()
    : await db
        .prepare("SELECT * FROM ly_users WHERE is_demo = 0 ORDER BY created_at DESC LIMIT 1")
        .first();
  if (!human) throw new ApiError(400, "还没有真人用户，先进楼再试");

  const helper = demos[0];
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  /* 清掉上一次的场景单（只清 o_scene_ 前缀，不碰真实数据） */
  await db.prepare("DELETE FROM ly_confirmations WHERE order_id LIKE 'o_scene_%'").run();
  await db.prepare("DELETE FROM ly_messages WHERE order_id LIKE 'o_scene_%'").run();
  await db.prepare("DELETE FROM ly_ledger WHERE order_id LIKE 'o_scene_%'").run();
  await db.prepare("DELETE FROM ly_orders WHERE id LIKE 'o_scene_%'").run();

  const base = {
    creator: human.id,
    claimer: null,
    template: "pickup",
    category: "取快递",
    size: "中件",
    pickup: "菜鸟驿站",
    time: "18:10 前",
    points: 2,
    toFloor: Number(human.floor) || 3,
    note: "演示场景",
  };

  const makeSteps = (doneCount, withCode) =>
    buildSteps("pickup", { needCode: true }).map((s, i) => ({
      ...s,
      status: i < doneCount ? "done" : "pending",
      completed_at: i < doneCount ? now - 60000 : 0,
      text_value: withCode && s.type === "provide_code" ? withCode : "",
    }));

  const insert = async (spec) => {
    const steps = spec.steps || makeSteps(0);
    const at = iso(now - (spec.age || 10) * 60000);
    await db.prepare(
      "INSERT OR REPLACE INTO ly_orders (id, kind, creator_id, claimer_id, title, category, template_id, size, pickup, " +
        "time_label, points, note, to_floor, need_code, code, steps, current_step, status, from_place, capacity, " +
        "conn_deadline, conn_extended, created_at, updated_at, delivered_at, done_at, released_reason) " +
        "VALUES (?, 'errand', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        spec.id,
        spec.creator || base.creator,
        spec.claimer || null,
        base.category,
        base.category,
        base.template,
        base.size,
        base.pickup,
        base.time,
        base.points,
        base.note,
        base.toFloor,
        spec.code || "",
        JSON.stringify(steps),
        steps.filter((s) => s.status === "done").length,
        spec.status,
        base.pickup,
        spec.deadline || null,
        spec.extended ? 1 : 0,
        at,
        spec.updatedAt || at,
        spec.deliveredAt || null,
        spec.doneAt || null,
        spec.releasedReason || null
      )
      .run();
    for (const uid of [spec.creator || base.creator, spec.claimer]) {
      if (!uid) continue;
      if (spec.confirmed && spec.confirmed.indexOf(uid) >= 0) {
        await db.prepare(
          "INSERT OR IGNORE INTO ly_confirmations (order_id, user_id, created_at) VALUES (?, ?, ?)"
        )
          .bind(spec.id, uid, at)
          .run();
      }
    }
    if (spec.ledger) {
      await db.prepare(
        "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(spec.id, spec.creator || base.creator, spec.claimer, spec.ledger, "「" + base.category + "」的人情", spec.doneAt || iso(now))
        .run();
    }
  };

  await insert({ id: "o_scene_pending", status: "pending", steps: makeSteps(0), age: 3 });
  await insert({
    id: "o_scene_claimed",
    status: "claimed",
    claimer: helper.id,
    steps: makeSteps(0),
    confirmed: [human.id],
    deadline: iso(now + 10 * 60000),
    age: 5,
  });
  await insert({
    id: "o_scene_connected",
    status: "connected",
    claimer: helper.id,
    steps: makeSteps(0),
    confirmed: [human.id, helper.id],
    age: 8,
  });
  await insert({
    id: "o_scene_delivered",
    status: "delivered",
    claimer: helper.id,
    steps: makeSteps(3, "A1234"),
    confirmed: [human.id, helper.id],
    code: "A1234",
    age: 10,
    updatedAt: iso(now - 5 * 60000),
    deliveredAt: iso(now - 5 * 60000),
  });
  await insert({
    id: "o_scene_done",
    status: "done",
    claimer: helper.id,
    steps: makeSteps(4, "B2345"),
    confirmed: [human.id, helper.id],
    code: "B2345",
    age: 30,
    deliveredAt: iso(now - 25 * 60000),
    doneAt: iso(now - 20 * 60000),
    updatedAt: iso(now - 20 * 60000),
    ledger: 2,
  });
  await insert({
    id: "o_scene_released",
    status: "released",
    steps: makeSteps(0),
    age: 15,
    releasedReason: "timeout",
  });

  return {
    user: { id: human.id, name: String(human.nickname || human.name) },
    orders: ["o_scene_pending", "o_scene_claimed", "o_scene_connected", "o_scene_delivered", "o_scene_done", "o_scene_released"],
  };
}

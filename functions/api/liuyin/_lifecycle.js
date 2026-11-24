/* ============================================================
 * 柳荫册 Web 版 · 惰性生命周期（读时兜底，不依赖定时器）
 *   - 建联超时：claimed 且 conn_deadline 过期 → released 回池 + 通知发起人
 *   - 连续未响应：missed+1，满 3 次写 ly_alerts 并清零
 *   - 24h 自动完成：delivered 超 24h → done + 写 ledger（幂等）
 *   - 顺路卡过期：active 且 active_until 过期 → expired
 * 被 /sync、/orders/get、/orders 列表调用；全部条件 UPDATE 防并发。
 * ============================================================ */
import {
  nowIso,
  changesOf,
  parseSteps,
  systemMessage,
  userStats,
} from "./_lib.js";

/* ---------- missed 计数 + 管理员提醒 ---------- */
export async function bumpMissed(env, userId, reason) {
  if (!userId) return { missed: 0, alerted: false };
  const db = env.DB;
  await db
    .prepare("UPDATE ly_users SET missed = COALESCE(missed, 0) + 1 WHERE id = ?")
    .bind(userId)
    .run();
  const row = await db.prepare("SELECT id, name, nickname, missed FROM ly_users WHERE id = ?").bind(userId).first();
  const missed = Number((row && row.missed) || 0);
  if (!row || missed < 3) return { missed, alerted: false };
  const display = String(row.nickname || row.name || "邻居");
  const title = display + " · 连续 3 次未响应";
  const detail = String(reason || "建联 / 确认超时 3 次") + "，建议提醒一下";
  try {
    await db
      .prepare(
        "INSERT INTO ly_alerts (type, user_id, title, detail, handled, created_at) " +
          "VALUES ('missed_connections', ?, ?, ?, 0, ?)"
      )
      .bind(userId, title, detail, nowIso())
      .run();
    await db.prepare("UPDATE ly_users SET missed = 0 WHERE id = ?").bind(userId).run();
  } catch (e) {
    /* 提醒写失败不影响主流程 */
  }
  return { missed: 0, alerted: true };
}

/* ---------- 建联超时回池 ---------- */
export async function settleClaimedTimeouts(env) {
  const db = env.DB;
  const now = nowIso();
  let rows = [];
  try {
    const res = await db
      .prepare(
        "SELECT id, creator_id, claimer_id, category, conn_deadline FROM ly_orders " +
          "WHERE status = 'claimed' AND conn_deadline IS NOT NULL AND conn_deadline < ? LIMIT 50"
      )
      .bind(now)
      .all();
    rows = (res && res.results) || [];
  } catch (e) {
    return [];
  }
  const released = [];
  for (const row of rows) {
    const upd = await db
      .prepare(
        "UPDATE ly_orders SET status = 'released', claimer_id = NULL, conn_extended = 0, " +
          "released_reason = 'timeout', updated_at = ? " +
          "WHERE id = ? AND status = 'claimed' AND conn_deadline IS NOT NULL AND conn_deadline < ?"
      )
      .bind(now, row.id, now)
      .run();
    if (changesOf(upd) < 1) continue;
    await db.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(row.id).run();
    /* 超时算接单方一次未响应 */
    if (row.claimer_id) {
      try {
        await bumpMissed(env, row.claimer_id, "接单后 10 分钟没有完成双确认");
      } catch (e) {
        /* 忽略 */
      }
    }
    await systemMessage(db, row.id, "10 分钟没有确认，这单释放回池了，没有记人情点。");
    released.push(row.id);
  }
  return released;
}

/* ---------- 24h 自动完成 ---------- */
export async function settleAutoDone(env) {
  const db = env.DB;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let rows = [];
  try {
    const res = await db
      .prepare(
        "SELECT * FROM ly_orders WHERE status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at < ? LIMIT 20"
      )
      .bind(cutoff)
      .all();
    rows = (res && res.results) || [];
  } catch (e) {
    return [];
  }
  const done = [];
  for (const row of rows) {
    const now = nowIso();
    const upd = await db
      .prepare(
        "UPDATE ly_orders SET status = 'done', done_at = ?, updated_at = ? " +
          "WHERE id = ? AND status = 'delivered' AND delivered_at IS NOT NULL AND delivered_at < ?"
      )
      .bind(now, now, row.id, cutoff)
      .run();
    if (changesOf(upd) < 1) continue;
    const delta = Number(row.points) || 1;
    try {
      await db
        .prepare(
          "INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(row.id, row.creator_id, row.claimer_id, delta, "「" + (row.category || "顺手") + "」的人情（自动完成）", now)
        .run();
    } catch (e) {
      /* 记账失败不回滚状态；order_id 唯一保证重复调用不会多记 */
    }
    await markConfirmStepDone(env, row.id);
    await systemMessage(db, row.id, "24 小时没有人确认收货，这单自动完成了，人情点照常记。");
    done.push(row.id);
  }
  return done;
}

/* ---------- 把 confirm 步骤标完成（幂等） ---------- */
export async function markConfirmStepDone(env, orderId) {
  const db = env.DB;
  try {
    const row = await db.prepare("SELECT steps FROM ly_orders WHERE id = ?").bind(orderId).first();
    if (!row) return false;
    const steps = parseSteps(row.steps);
    let changed = false;
    for (const step of steps) {
      if (step.type === "confirm" && step.status !== "done") {
        step.status = "done";
        step.completed_at = Date.now();
        changed = true;
      }
    }
    if (!changed) return false;
    const next = steps.findIndex((s) => s.status !== "done");
    await db
      .prepare("UPDATE ly_orders SET steps = ?, current_step = ? WHERE id = ?")
      .bind(JSON.stringify(steps), next < 0 ? steps.length : next, orderId)
      .run();
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- 完成订单并写人情账（幂等；creator 确认 / 自动完成共用） ---------- */
export async function finishOrder(env, order, opts) {
  const db = env.DB;
  const now = nowIso();
  const conditional = opts && opts.auto
    ? "UPDATE ly_orders SET status = 'done', done_at = ?, updated_at = ? WHERE id = ? AND status = 'delivered'"
    : "UPDATE ly_orders SET status = 'done', done_at = ?, updated_at = ? WHERE id = ? AND status = 'delivered'";
  const upd = await db.prepare(conditional).bind(now, now, order.id).run();
  if (changesOf(upd) < 1) return null;

  const delta = Number(order.points) || 1;
  const note = "「" + (order.category || "顺手") + "」的人情" + (opts && opts.auto ? "（自动完成）" : "");
  await db
    .prepare("INSERT OR IGNORE INTO ly_ledger (order_id, from_id, to_id, delta, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(order.id, order.creator_id, order.claimer_id, delta, note, now)
    .run();
  const ledger = await db.prepare("SELECT * FROM ly_ledger WHERE order_id = ?").bind(order.id).first();
  await markConfirmStepDone(env, order.id);
  await systemMessage(
    db,
    order.id,
    opts && opts.auto ? "24 小时没有人确认收货，这单自动完成了，人情点照常记。" : "这单走完了，账上记了一次人情点。"
  );
  return {
    ledger: ledger
      ? {
          id: ledger.id,
          order_id: ledger.order_id,
          from_id: ledger.from_id,
          to_id: ledger.to_id,
          delta: Number(ledger.delta) || delta,
          note: ledger.note || "",
          created_at: ledger.created_at,
        }
      : null,
    delta,
  };
}

/* ---------- 顺路卡过期 ---------- */
export async function settleRouteCards(env) {
  const db = env.DB;
  const now = nowIso();
  try {
    await db
      .prepare(
        "UPDATE ly_route_cards SET status = 'expired', updated_at = ? " +
          "WHERE status IN ('active', 'waiting') AND active_until IS NOT NULL AND active_until < ?"
      )
      .bind(now, now)
      .run();
  } catch (e) {
    /* 忽略 */
  }
}

/* 供 /sync 与 /orders/* 调用：一次做完所有惰性兜底 */
export async function settle(env) {
  const out = {};
  try {
    out.released = await settleClaimedTimeouts(env);
  } catch (e) {
    out.released = [];
  }
  try {
    out.auto_done = await settleAutoDone(env);
  } catch (e) {
    out.auto_done = [];
  }
  try {
    await settleRouteCards(env);
  } catch (e) {
    /* 忽略 */
  }
  return out;
}

/* 统计口径（帮助函数，供管理端/详情复用） */
export async function statsOf(env, userId) {
  return userStats(env.DB, userId);
}

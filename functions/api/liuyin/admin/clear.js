/* ============================================================
 * POST /api/liuyin/admin/clear   { what: 'orders' | 'users' | 'all' }
 *   orders：清订单（连带 confirmations / messages / ledger）
 *   users ：清用户（连带封禁记录；订单保留，显示为「邻居」）
 *   all   ：两者都清
 * ============================================================ */
import { handle, ok, ApiError, changesOf } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const what = typeof body.what === "string" ? body.what.trim() : "";
    if (["orders", "users", "all"].indexOf(what) === -1) {
      throw new ApiError(400, "what 只能是 orders / users / all");
    }
    const db = env.DB;
    let deleted = 0;

    if (what === "orders" || what === "all") {
      deleted += await scalar(db, "SELECT COUNT(*) AS n FROM ly_orders");
      await db.prepare("DELETE FROM ly_confirmations").run();
      await db.prepare("DELETE FROM ly_messages").run();
      await db.prepare("DELETE FROM ly_ledger").run();
      await db.prepare("DELETE FROM ly_orders").run();
    }

    if (what === "users" || what === "all") {
      deleted += await scalar(db, "SELECT COUNT(*) AS n FROM ly_users");
      await db.prepare("DELETE FROM ly_bans").run();
      await db.prepare("DELETE FROM ly_users").run();
    }

    return ok({ what, deleted });
  });
}

async function scalar(db, sql) {
  const row = await db.prepare(sql).first();
  return row ? Number(row.n) || 0 : 0;
}

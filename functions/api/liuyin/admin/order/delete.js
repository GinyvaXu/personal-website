/* ============================================================
 * POST /api/liuyin/admin/order/delete   { id }   (需 x-ly-admin)
 * 删单：连带 confirmations / messages / ledger（避免孤儿流水）。
 * ============================================================ */
import { handle, ok, ApiError, changesOf } from "../../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "none", admin: true }, async ({ env, body }) => {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new ApiError(400, "缺少订单 id");

    const row = await env.DB.prepare("SELECT id FROM ly_orders WHERE id = ?").bind(id).first();
    if (!row) throw new ApiError(404, "订单不存在");

    await env.DB.prepare("DELETE FROM ly_confirmations WHERE order_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM ly_messages WHERE order_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM ly_ledger WHERE order_id = ?").bind(id).run();
    const res = await env.DB.prepare("DELETE FROM ly_orders WHERE id = ?").bind(id).run();
    return ok({ id, deleted: changesOf(res) > 0 ? 1 : 0 });
  });
}

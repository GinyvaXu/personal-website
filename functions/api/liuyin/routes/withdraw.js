/* ============================================================
 * POST /api/liuyin/routes/withdraw   { id }   → { ok, card }
 * 只能撤回自己的卡；active → withdrawn；waiting → withdrawn。
 * ============================================================ */
import { handle, ok, ApiError, nowIso, changesOf } from "../_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "required" }, async ({ env, user, body }) => {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) throw new ApiError(400, "缺少顺路卡 id");

    const row = await env.DB.prepare("SELECT * FROM ly_route_cards WHERE id = ?").bind(id).first();
    if (!row) throw new ApiError(404, "这张顺路卡不存在");
    if (row.user_id !== user.id) throw new ApiError(403, "只能撤回自己的顺路卡");
    if (["active", "waiting"].indexOf(row.status) < 0) {
      throw new ApiError(409, "这张卡现在是「" + row.status + "」，不用撤回了");
    }

    const upd = await env.DB.prepare(
      "UPDATE ly_route_cards SET status = 'withdrawn', updated_at = ? WHERE id = ? AND user_id = ? AND status IN ('active','waiting')"
    )
      .bind(nowIso(), id, user.id)
      .run();
    if (changesOf(upd) < 1) throw new ApiError(409, "这张卡刚变了，刷新一下再试");
    return ok({ ok: true, id, withdrawn: true });
  });
}

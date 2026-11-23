/* ============================================================
 * GET /api/liuyin/me   (需 x-ly-token)
 *   → { user: { id, name, floor, points, owed, owedTo }, building }
 *   points = 我帮过别人几次；owed = 别人帮过我几次；owedTo = 我欠谁
 * ============================================================ */
import { handle, ok, userMeta, owedTo, BUILDING } from "./_lib.js";

export async function onRequestGet(context) {
  return handle(context, { auth: "required", body: false }, async ({ env, user }) => {
    const meta = await userMeta(env.DB, user);
    const list = await owedTo(env.DB, user.id);
    return ok({
      user: {
        id: user.id,
        name: user.name,
        floor: Number(user.floor),
        points: meta.points,
        owed: meta.owed,
        owedTo: list,
        online: true,
      },
      building: BUILDING,
      notice: await getNotice(env),
    });
  });
}

async function getNotice(env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM ly_settings WHERE key = 'notice'").first();
    return (row && row.value) || "";
  } catch (e) {
    return "";
  }
}

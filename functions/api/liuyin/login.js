/* ============================================================
 * POST /api/liuyin/login   { name, floor }    (可带 x-ly-token：直接返回本人)
 * 弱账户：同层同名自动变 小柳(2)
 * ============================================================ */
import {
  handle, json, ApiError, reqStr, optFloor, uniqueName, makeId, nowIso,
  userMeta, BUILDING, NAME_MAX,
} from "./_lib.js";

export async function onRequestPost(context) {
  return handle(context, { auth: "optional" }, async ({ env, user, body }) => {
    /* 1) 已带有效 token：直接返回本人，不再新建 */
    if (user) return loginPayload(env, user);

    /* 2) 兼容把 token 放在 body 里（前端从 localStorage 取） */
    const bodyToken = typeof body.token === "string" ? body.token.trim() : "";
    if (bodyToken) {
      const row = await env.DB.prepare("SELECT * FROM ly_users WHERE token = ?").bind(bodyToken).first();
      if (row && Number(row.banned) !== 1) return loginPayload(env, row);
    }

    /* 3) 新建弱账户 */
    const name = reqStr(body, "name", NAME_MAX, "名字");
    const floor = optFloor(body);
    if (floor == null) throw new ApiError(400, "请选择楼层（1–" + 6 + "）");

    const { name: finalName, key } = await uniqueName(env.DB, floor, name);
    const id = makeId("u_");
    const token = crypto.randomUUID();
    const now = nowIso();
    await env.DB.prepare(
      "INSERT INTO ly_users (id, name, name_key, floor, token, banned, last_seen, created_at) " +
        "VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
    )
      .bind(id, finalName, key, floor, token, now, now)
      .run();

    return json({
      ok: true,
      data: {
        token,
        user: { id, name: finalName, floor, points: 0 },
        building: BUILDING,
      },
      // 兼容：老前端可能直接读顶层
      token,
      user: { id, name: finalName, floor, points: 0 },
    });
  });
}

async function loginPayload(env, row) {
  const meta = await userMeta(env.DB, row);
  const user = { id: row.id, name: row.name, floor: Number(row.floor), points: meta.points };
  return json({
    ok: true,
    data: { token: row.token, user, building: BUILDING },
    token: row.token,
    user,
  });
}

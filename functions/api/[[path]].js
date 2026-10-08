/* ============================================================
 * /api/* 兜底路由：未命中的 API 路径返回 JSON 404
 * （更具体的接口文件优先，本文件只兜底）
 * ============================================================ */
import { json } from "../_lib/utils.js";

export async function onRequest() {
  return json({ ok: false, error: "not_found" }, 404);
}

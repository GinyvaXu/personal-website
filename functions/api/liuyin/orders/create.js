/* ============================================================
 * POST /api/liuyin/orders/create
 * 路径上独立成文件，方便前端严格按契约调用；逻辑复用 ../orders/index.js
 * ============================================================ */
import { createOrder } from "./index.js";

export async function onRequestPost(context) {
  return createOrder(context);
}

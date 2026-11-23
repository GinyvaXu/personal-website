/* ============================================================
 * POST /api/liuyin/messages/send   { order_id, body }
 * ============================================================ */
import { onRequestPost as send } from "./index.js";

export const onRequestPost = send;

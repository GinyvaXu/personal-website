/* ============================================================
 * 柳荫册 Web 版 · 后端自测（不联网、不部署）
 *
 * 做法：
 *   1. 把 functions/api/liuyin/ 下的 .js 复制到临时目录并改名 .mjs
 *      （仓库没有 package.json，Node 默认把 .js 当 CJS，Cloudflare 侧则是 ESM）
 *   2. 用 node:sqlite 的 DatabaseSync 实现一个 D1 兼容 mock（prepare/bind/first/run/all/exec）
 *   3. 用 Map 实现 R2 mock（put/get）
 *   4. 直接调各文件的 onRequestXxx({ request, env }) 跑完整业务链路
 *
 * 运行：node functions/api/liuyin/_selftest.mjs
 *
 * 注意：为了不让 Cloudflare Pages 打包 functions/ 时被 node: 内置模块卡住，
 *       这里不用静态 import，全部改成「仅 Node 下、运行时变量拼接」加载；
 *       线上这个文件即使被当成路由也不会执行任何 Node 逻辑。
 * ============================================================ */
const IS_NODE = typeof process !== "undefined" && !!(process.versions && process.versions.node);

if (IS_NODE) {
  main().catch((e) => {
    console.error("[selftest] 崩溃：", e);
    process.exit(1);
  });
}

export async function onRequest() {
  return new Response(
    JSON.stringify({ ok: false, error: "这是本地自测脚本，不在线上运行" }),
    { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}

async function main() {
  const { DatabaseSync } = await import("node:" + "sqlite");
  const { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } = await import("node:" + "fs");
  const { tmpdir } = await import("node:" + "os");
  const path = await import("node:" + "path");
  const { fileURLToPath, pathToFileURL } = await import("node:" + "url");

  const HERE = path.dirname(fileURLToPath(import.meta.url));

/* ---------------- 1. 复制成 .mjs ---------------- */
function copyAsMjs() {
  const dest = mkdtempSync(path.join(tmpdir(), "ly-selftest-"));
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]
    );
  for (const abs of walk(HERE)) {
    if (!abs.endsWith(".js")) continue;
    const rel = path.relative(HERE, abs);
    const out = path.join(dest, rel.replace(/\.js$/, ".mjs"));
    mkdirSync(path.dirname(out), { recursive: true });
    let code = readFileSync(abs, "utf8");
    code = code.replace(/(\bfrom\s*["'])(\.[^"']*?)\.js(["'])/g, "$1$2.mjs$3");
    writeFileSync(out, code);
  }
  return dest;
}

/* ---------------- 2. D1 mock ---------------- */
class D1Statement {
  constructor(db, sql, params) {
    this.db = db;
    this.sql = sql;
    this.params = params || [];
  }
  bind(...params) {
    return new D1Statement(this.db, this.sql, params.map((v) => (v === undefined ? null : v)));
  }
  _stmt() {
    return this.db.sqlite.prepare(this.sql);
  }
  async first(column) {
    const row = this._stmt().get(...this.params);
    if (!row) return null;
    if (column) return row[column];
    return row;
  }
  async all() {
    const rows = this._stmt().all(...this.params);
    return { results: rows, success: true, meta: { changes: 0 } };
  }
  async run() {
    const info = this._stmt().run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(info.changes) || 0,
        last_row_id: Number(info.lastInsertRowid) || 0,
      },
    };
  }
}

class D1Mock {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
  }
  prepare(sql) {
    return new D1Statement(this, sql);
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }
  async batch(stmts) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

/* ---------------- 3. R2 mock ---------------- */
class R2Mock {
  constructor() {
    this.map = new Map();
  }
  async put(key, value, opts) {
    const u8 =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : new Uint8Array(await new Response(value).arrayBuffer());
    this.map.set(key, { body: u8, httpMetadata: (opts && opts.httpMetadata) || {} });
    return { key };
  }
  async get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    return {
      key,
      body: item.body,
      httpMetadata: item.httpMetadata,
      arrayBuffer: async () => item.body.slice().buffer,
      text: async () => new TextDecoder().decode(item.body),
    };
  }
  async delete(key) {
    this.map.delete(key);
  }
}

/* ---------------- 4. 载入被测模块 ---------------- */
const dest = copyAsMjs();
const load = (p) => import(pathToFileURL(path.join(dest, p)).href);

const FILES = {
  middleware: "_middleware.mjs",
  login: "login.mjs",
  me: "me.mjs",
  logout: "logout.mjs",
  floor: "floor.mjs",
  floors: "floors.mjs",
  sync: "sync.mjs",
  orders: "orders/index.mjs",
  orderCreate: "orders/create.mjs",
  orderAction: "orders/[action].mjs",
  orderGet: "orders/get.mjs",
  messages: "messages/index.mjs",
  messageSend: "messages/send.mjs",
  upload: "upload.mjs",
  file: "file.mjs",
  adminLogin: "admin/login.mjs",
  adminStats: "admin/stats.mjs",
  adminClear: "admin/clear.mjs",
  adminDeleteOrder: "admin/delete-order.mjs",
  adminBan: "admin/ban.mjs",
  adminUnban: "admin/unban.mjs",
  adminNotice: "admin/notice.mjs",
  adminSeed: "admin/seed.mjs",
};

const M = {};
for (const [name, file] of Object.entries(FILES)) M[name] = await load(file);

/* ---------------- 5. 测试工具 ---------------- */
const env = {
  DB: new D1Mock(),
  FILES: new R2Mock(),
  ADMIN_PASSWORD: "test-admin-pass",
  SESSION_SECRET: "test-secret-0123456789abcdef",
};

let ipSeq = 0;
function nextIp() {
  ipSeq += 1;
  return "10." + ((ipSeq >> 16) & 255) + "." + ((ipSeq >> 8) & 255) + "." + (ipSeq & 255);
}

function makeRequest(method, urlPath, opts = {}) {
  const headers = new Headers();
  headers.set("CF-Connecting-IP", opts.ip || nextIp());
  if (opts.token) headers.set("x-ly-token", opts.token);
  if (opts.admin) headers.set("x-ly-admin", opts.admin);
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) headers.set(k, v);
  }
  let body;
  if (opts.form) {
    body = opts.form; // 让 undici 自己带 multipart boundary
  } else if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  return new Request("https://ginyva.site" + urlPath, { method, headers, body });
}

async function call(mod, method, urlPath, opts = {}) {
  const request = opts.request || makeRequest(method, urlPath, opts);
  const context = {
    request,
    env: opts.env || env,
    params: opts.params || {},
    next: async () => new Response("not found", { status: 404 }),
    waitUntil: () => {},
  };
  const handler = mod["onRequest" + method.charAt(0) + method.slice(1).toLowerCase()];
  if (typeof handler !== "function") throw new Error("模块缺少 " + method + " handler");
  const res = await handler(context);
  const buf = Buffer.from(await res.arrayBuffer());
  let data = null;
  try {
    data = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    data = null;
  }
  return { status: res.status, headers: res.headers, data, buf };
}

const post = (mod, urlPath, body, opts = {}) => call(mod, "POST", urlPath, { body, ...opts });
const get = (mod, urlPath, opts = {}) => call(mod, "GET", urlPath, { ...opts });
const act = (action, body, opts = {}) =>
  call(M.orderAction, "POST", "/api/liuyin/orders/" + action, {
    body,
    params: { action },
    ...opts,
  });

let pass = 0;
let fail = 0;
const failures = [];
let group = "";

function section(name) {
  group = name;
  console.log("\n■ " + name);
}
function check(name, cond, detail) {
  if (cond) {
    pass += 1;
    console.log("  ✓ " + name);
  } else {
    fail += 1;
    failures.push(group + " / " + name);
    console.log("  ✗ " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail)));
  }
}
function isOk(r) {
  return r && r.status === 200 && r.data && r.data.ok === true;
}

/* ---------------- 6. 测试 ---------------- */
const t0 = Date.now();

/* ========== 0. 老库迁移 ========== */
section("0. 老库迁移（ly_users 缺 last_seen 时自动 ALTER TABLE）");
const legacyDb = new D1Mock();
legacyDb.sqlite.exec(
  "CREATE TABLE ly_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL, " +
    "floor INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, banned INTEGER NOT NULL DEFAULT 0, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')))"
);
const legacyEnv = {
  DB: legacyDb,
  FILES: env.FILES,
  ADMIN_PASSWORD: env.ADMIN_PASSWORD,
  SESSION_SECRET: env.SESSION_SECRET,
};
const legacyLogin = await post(M.login, "/api/liuyin/login", { name: "老邻居", floor: 2 }, { env: legacyEnv });
check("老库首次请求自动建表 + 迁移，登录成功", isOk(legacyLogin) && legacyLogin.data.data.user.name === "老邻居", legacyLogin.data);
const legacyCols = await legacyDb.prepare("SELECT name FROM pragma_table_info('ly_users')").all();
check("last_seen 列已补上", legacyCols.results.some((c) => c.name === "last_seen"), legacyCols.results.map((c) => c.name));

/* ========== A. 登录 / 弱账户 ========== */
section("A. 登录（弱账户 + 重名编号）");
const loginA = await post(M.login, "/api/liuyin/login", { name: "小柳", floor: 3 });
check("首次登录 200 且拿到 token", isOk(loginA) && typeof loginA.data.data.token === "string", loginA.data);
const tokenA = loginA.data && loginA.data.data && loginA.data.data.token;
const userA = loginA.data && loginA.data.data && loginA.data.data.user;
check("首次登录名字 = 小柳", userA && userA.name === "小柳", userA);
check("token 是 UUID 形状", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tokenA || ""), tokenA);

const loginB = await post(M.login, "/api/liuyin/login", { name: "小柳", floor: 3 });
const tokenB = loginB.data && loginB.data.data && loginB.data.data.token;
check("同层同名 → 小柳(2)", loginB.data.data.user.name === "小柳(2)", loginB.data.data.user);

const loginB2 = await post(M.login, "/api/liuyin/login", { name: " 小 柳 ", floor: 3 });
check("归一化（空格）仍算重名 → 小柳(3)", loginB2.data.data.user.name === "小柳(3)", loginB2.data.data.user);

const loginB3 = await post(M.login, "/api/liuyin/login", { name: "小柳(2)", floor: 3 });
check("输入自带编号会去重后重新编号 → 小柳(4)", loginB3.data.data.user.name === "小柳(4)", loginB3.data.data.user);

const relogin = await post(M.login, "/api/liuyin/login", { name: "随便", floor: 1 }, { token: tokenA });
check("带已有 token 登录 → 直接返回本人", relogin.data.data.user.id === userA.id && relogin.data.data.token === tokenA, relogin.data.data.user);

const loginC = await post(M.login, "/api/liuyin/login", { name: "老王", floor: 5 });
const tokenC = loginC.data.data.token;
const userC = loginC.data.data.user;
check("不同楼层同名可共存（老王 5 层）", userC.floor === 5, userC);

const bad1 = await post(M.login, "/api/liuyin/login", { name: "", floor: 3 });
check("空名字 → 400 中文错误", bad1.status === 400 && /名字/.test(bad1.data.error), bad1.data);
const bad2 = await post(M.login, "/api/liuyin/login", { name: "小柳", floor: 9 });
check("楼层 9 → 400", bad2.status === 400, bad2.data);
const bad3 = await post(M.login, "/api/liuyin/login", { name: "一二三四五六七八九十十一十二", floor: 1 });
check("名字超 12 字 → 400", bad3.status === 400, bad3.data);

/* ========== B. 身份 / 名单 ========== */
section("B. 身份与名单");
const meA = await get(M.me, "/api/liuyin/me", { token: tokenA });
check("me 200 且带 building", isOk(meA) && meA.data.data.building === "6 号楼", meA.data);
check("me.points / owed 初始为 0", meA.data.data.user.points === 0 && meA.data.data.user.owed === 0, meA.data.data.user);
check("me 带 owedTo 数组", Array.isArray(meA.data.data.user.owedTo), meA.data.data.user.owedTo);

const floor3 = await get(M.floor, "/api/liuyin/floor?floor=3", { token: tokenA });
check("floor 返回本层名单且排除自己", isOk(floor3) && floor3.data.data.users.every((u) => u.id !== userA.id), floor3.data.data);
check("floor 名单带 online 字段", floor3.data.data.users.every((u) => typeof u.online === "boolean"), floor3.data.data.users);
check("本层有在线的人（刚登录过）", floor3.data.data.users.some((u) => u.online === true), floor3.data.data.users);

const floors = await get(M.floors, "/api/liuyin/floors");
check("floors 返回 1–6 层", isOk(floors) && floors.data.data.floors.length === 6, floors.data.data);
check("floors[2].floor = 3", floors.data.data.floors[2].floor === 3, floors.data.data.floors[2]);

/* ========== C. 未登录 / 鉴权 ========== */
section("C. 未登录与 token 失效");
const noAuthMe = await get(M.me, "/api/liuyin/me");
check("未登录 me → 401", noAuthMe.status === 401, noAuthMe.data);
const noAuthCreate = await post(M.orderCreate, "/api/liuyin/orders/create", { title: "x", to_floor: 3 });
check("未登录发单 → 401", noAuthCreate.status === 401, noAuthCreate.data);
const noAuthSync = await get(M.sync, "/api/liuyin/sync");
check("未登录 sync → 401", noAuthSync.status === 401, noAuthSync.data);
const noAuthMine = await get(M.orders, "/api/liuyin/orders?scope=mine");
check("未登录 scope=mine → 401", noAuthMine.status === 401, noAuthMine.data);
const fakeToken = await get(M.me, "/api/liuyin/me", { token: "not-a-real-token" });
check("假 token → 401", fakeToken.status === 401, fakeToken.data);

/* ========== D. 订单状态机主链路 ========== */
section("D. 订单主链路：发单→接单→双确认→取件→送达→完成");
const sinceBefore = new Date(Date.now() - 1000).toISOString();

const created = await post(M.orderCreate, "/api/liuyin/orders/create", {
  kind: "errand",
  title: "取快递",
  note: "六个件，有点重",
  from_place: "驿站",
  to_floor: 3,
  code: "A·1236",
}, { token: tokenA });
check("发单 200", isOk(created), created.data);
const order1 = created.data.data.order;
check("新单 status = pending", order1.status === "pending", order1.status);
check("新单 creator = 小柳", order1.creator.id === userA.id, order1.creator);
check("新单 claimer = null", order1.claimer === null, order1.claimer);
check("新单 code 保留", order1.code === "A·1236", order1.code);

const openList = await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenB });
check("scope=open 能看到新单", openList.data.data.orders.some((o) => o.id === order1.id), openList.data.data.orders.length);

const myList = await get(M.orders, "/api/liuyin/orders?scope=mine", { token: tokenA });
check("scope=mine 能看到自己发的单", myList.data.data.orders.some((o) => o.id === order1.id), myList.data.data.orders.length);

const claimOwn = await act("claim", { id: order1.id }, { token: tokenA });
check("接自己的单 → 403", claimOwn.status === 403, claimOwn.data);

const claimed = await act("claim", { id: order1.id }, { token: tokenB });
check("B 接单 → claimed", isOk(claimed) && claimed.data.data.order.status === "claimed", claimed.data);
check("接单人 = 小柳(2)", claimed.data.data.order.claimer.id === loginB.data.data.user.id, claimed.data.data.order.claimer);

const claimAgain = await act("claim", { id: order1.id }, { token: tokenC });
check("别人再抢同一单 → 409", claimAgain.status === 409, claimAgain.data);

const c1 = await act("confirm", { id: order1.id }, { token: tokenB });
check("第 1 次确认 → confirmed=1 且仍 claimed", isOk(c1) && c1.data.data.confirmed === 1 && c1.data.data.order.status === "claimed", c1.data);
const c1again = await act("confirm", { id: order1.id }, { token: tokenB });
check("同一人重复确认 → 幂等 confirmed=1", c1again.data.data.confirmed === 1 && c1again.data.data.order.status === "claimed", c1again.data);
const c2 = await act("confirm", { id: order1.id }, { token: tokenA });
check("第 2 次确认 → confirmed=2 且进 confirmed", c2.data.data.confirmed === 2 && c2.data.data.order.status === "confirmed", c2.data);
const c3 = await act("confirm", { id: order1.id }, { token: tokenA });
check("confirmed 后重复确认 → 幂等 confirmed=2", c3.status === 200 && c3.data.data.confirmed === 2, c3.data);

const pickEarly = await act("pick", { id: order1.id }, { token: tokenB });
check("确认后 pick → picked", isOk(pickEarly) && pickEarly.data.data.order.status === "picked", pickEarly.data);

const proof = await post(M.upload, "/api/liuyin/upload", undefined, {
  token: tokenB,
  request: (() => {
    const fd = new FormData();
    fd.set("file", new File([pngBytes()], "proof.png", { type: "image/png" }));
    return new Request("https://ginyva.site/api/liuyin/upload", {
      method: "POST",
      headers: new Headers({ "CF-Connecting-IP": nextIp(), "x-ly-token": tokenB }),
      body: fd,
    });
  })(),
});
check("送达照片上传 200", isOk(proof), proof.data);
const proofKey = proof.data && proof.data.data && proof.data.data.key;

const delivered = await act("deliver", { id: order1.id, proof_key: proofKey }, { token: tokenB });
check("送达 → delivered", isOk(delivered) && delivered.data.data.order.status === "delivered", delivered.data);
check("送达照片写进 proof_key", delivered.data.data.order.proof_key === proofKey, delivered.data.data.order.proof_key);

const complete1 = await act("complete", { id: order1.id }, { token: tokenA });
check("完成 → done", isOk(complete1) && complete1.data.data.order.status === "done", complete1.data);
check("complete 返回 ledger", !!complete1.data.data.ledger, complete1.data.data.ledger);
check(
  "ledger 方向：from=发单方 to=接单方 delta=1",
  complete1.data.data.ledger &&
    complete1.data.data.ledger.from_id === userA.id &&
    complete1.data.data.ledger.to_id === loginB.data.data.user.id &&
    complete1.data.data.ledger.delta === 1,
  complete1.data.data.ledger
);

const ledgerRows = await env.DB.prepare("SELECT * FROM ly_ledger WHERE order_id = ?").bind(order1.id).all();
check("ledger 有且只有 1 条", ledgerRows.results.length === 1, ledgerRows.results.length);

const completeAgain = await act("complete", { id: order1.id }, { token: tokenA });
check("重复 complete → 409（状态已 done）", completeAgain.status === 409, completeAgain.data);
const ledgerRows2 = await env.DB.prepare("SELECT * FROM ly_ledger WHERE order_id = ?").bind(order1.id).all();
check("重复 complete 后 ledger 仍是 1 条", ledgerRows2.results.length === 1, ledgerRows2.results.length);

const meB = await get(M.me, "/api/liuyin/me", { token: tokenB });
check("接单方 points +1", meB.data.data.user.points === 1, meB.data.data.user);
const meA2 = await get(M.me, "/api/liuyin/me", { token: tokenA });
check("发单方 owed +1", meA2.data.data.user.owed === 1, meA2.data.data.user);
check("发单方 owedTo 指向接单方", meA2.data.data.user.owedTo.some((x) => x.id === loginB.data.data.user.id), meA2.data.data.user.owedTo);

/* ========== E. 非法跃迁 / 权限 ========== */
section("E. 非法跃迁与权限（409 / 403）");
const o2 = (await post(M.orderCreate, "/api/liuyin/orders/create", {
  kind: "route",
  title: "顺路带奶茶",
  from_place: "食堂",
  to_floor: 4,
  start_at: "18:30",
  end_at: "19:00",
  capacity: 2,
}, { token: tokenA })).data.data.order;
check("顺路卡 kind=route / capacity=2", o2.kind === "route" && o2.capacity === 2, o2);

const pickPending = await act("pick", { id: o2.id }, { token: tokenA });
check("pending 时取件 → 403（还没人接单）", pickPending.status === 403, pickPending.data);
const completePending = await act("complete", { id: o2.id }, { token: tokenA });
check("pending 直接 complete → 409", completePending.status === 409, completePending.data);
const confirmPending = await act("confirm", { id: o2.id }, { token: tokenA });
check("pending 直接 confirm → 409", confirmPending.status === 409, confirmPending.data);

const claim2 = await act("claim", { id: o2.id }, { token: tokenC });
check("C 接顺路卡 → claimed", claim2.data.data.order.status === "claimed", claim2.data);
const pickClaimed = await act("pick", { id: o2.id }, { token: tokenC });
check("claimed 直接 pick → 409", pickClaimed.status === 409, pickClaimed.data);
const deliverEarly = await act("deliver", { id: o2.id }, { token: tokenC });
check("claimed 直接 deliver → 409", deliverEarly.status === 409, deliverEarly.data);
const returnUnauth = await act("return", { id: o2.id }, { token: tokenB });
check("非当事人 return → 403", returnUnauth.status === 403, returnUnauth.data);

const returned = await act("return", { id: o2.id }, { token: tokenA });
check("return → 回池 pending 且清掉接单人", returned.data.data.order.status === "pending" && returned.data.data.order.claimer === null, returned.data.data);

const cancelled = await act("cancel", { id: o2.id }, { token: tokenA });
check("pending cancel → cancelled", cancelled.data.data.order.status === "cancelled", cancelled.data);
const claimCancelled = await act("claim", { id: o2.id }, { token: tokenC });
check("取消后再接 → 409", claimCancelled.status === 409, claimCancelled.data);
const cancelAgain = await act("cancel", { id: o2.id }, { token: tokenA });
check("重复 cancel → 409", cancelAgain.status === 409, cancelAgain.data);

const notFound = await act("claim", { id: "o_nope" }, { token: tokenC });
check("不存在的单 → 404", notFound.status === 404, notFound.data);
const noId = await act("claim", {}, { token: tokenC });
check("缺 id → 400", noId.status === 400, noId.data);
const unknownAction = await call(M.orderAction, "POST", "/api/liuyin/orders/nope", {
  body: { id: o2.id },
  params: { action: "nope" },
  token: tokenA,
});
check("未知 action → 404", unknownAction.status === 404, unknownAction.data);

/* ========== F. 消息 / sync ========== */
section("F. 订单消息与 sync 轮询");
const sinceMsg = new Date(Date.now() - 1000).toISOString();
const sent = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: order1.id, body: "谢谢啦，改天请你吃冰粉" }, { token: tokenB });
check("当事人发消息 200", isOk(sent), sent.data);
check("消息 body 正确", sent.data.data.message.body.indexOf("冰粉") > -1, sent.data.data.message);

const msgs = await get(M.messages, "/api/liuyin/messages?order_id=" + encodeURIComponent(order1.id), { token: tokenA });
check("对方能收到消息", isOk(msgs) && msgs.data.data.messages.length === 1, msgs.data.data);
const msgsSince = await get(M.messages, "/api/liuyin/messages?order_id=" + encodeURIComponent(order1.id) + "&since=" + sent.data.data.message.id, { token: tokenA });
check("since 过滤后为空", msgsSince.data.data.messages.length === 0, msgsSince.data.data);
const sendByC = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: order1.id, body: "插话" }, { token: tokenC });
check("非当事人发消息 → 403", sendByC.status === 403, sendByC.data);
const emptyMsg = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: order1.id, body: "" }, { token: tokenA });
check("空消息 → 400", emptyMsg.status === 400, emptyMsg.data);

const detail = await get(M.orderGet, "/api/liuyin/orders/get?id=" + encodeURIComponent(order1.id), { token: tokenA });
check("订单详情带 messages", isOk(detail) && detail.data.data.messages.length === 1, detail.data.data);

const sync1 = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(sinceBefore) + "&floor=3", { token: tokenA });
check("sync 200", isOk(sync1), sync1.data);
check("sync 带 me / floor_users / open_orders / my_orders", 
  !!sync1.data.data.me && Array.isArray(sync1.data.data.floor_users) &&
  Array.isArray(sync1.data.data.open_orders) && Array.isArray(sync1.data.data.my_orders),
  Object.keys(sync1.data.data || {})
);
const syncClaimSince = new Date(Date.now() + 5).toISOString();
const o3 = (await post(M.orderCreate, "/api/liuyin/orders/create", {
  kind: "errand",
  title: "拿一下雨伞",
  from_place: "驿站",
  to_floor: 3,
  code: "C·0001",
}, { token: tokenA })).data.data.order;
await new Promise((r) => setTimeout(r, 20));
await act("claim", { id: o3.id }, { token: tokenC });
const syncClaim = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(syncClaimSince), { token: tokenA });
check(
  "sync 通知里能看到 claimed",
  syncClaim.data.data.notifications.some((n) => n.type === "claimed" && n.order_id === o3.id),
  syncClaim.data.data.notifications
);
check("sync 通知里能看到 done", sync1.data.data.notifications.some((n) => n.type === "done" && n.order_id === order1.id), sync1.data.data.notifications);

const sync2 = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(sinceMsg), { token: tokenA });
check("sync 通知里能看到 message", sync2.data.data.notifications.some((n) => n.type === "message" && n.order_id === order1.id), sync2.data.data.notifications);
const sync3 = await get(M.sync, "/api/liuyin/sync", { token: tokenA });
check("sync 不传 since → notifications 为空", sync3.data.data.notifications.length === 0, sync3.data.data.notifications);

/* ========== G. 照片上传 / 读取 ========== */
section("G. 照片上传与读取");
function pngBytes() {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return new Uint8Array(sig.concat([0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]));
}
async function uploadWith(token, bytes, filename, type) {
  const fd = new FormData();
  fd.set("file", new File([bytes], filename, { type }));
  return call(M.upload, "POST", "/api/liuyin/upload", {
    token,
    request: new Request("https://ginyva.site/api/liuyin/upload", {
      method: "POST",
      headers: new Headers({ "CF-Connecting-IP": nextIp(), "x-ly-token": token }),
      body: fd,
    }),
  });
}

const upPng = await uploadWith(tokenA, pngBytes(), "a.png", "image/png");
check("png 上传成功且 key 形如 u_xxx/o_xxx.png", isOk(upPng) && /^[A-Za-z0-9_-]+\/o_[0-9a-f]+\.png$/.test(upPng.data.data.key), upPng.data);
const upJpg = await uploadWith(tokenA, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "b.jpg", "image/jpeg");
check("jpg 上传成功（按文件头识别）", isOk(upJpg) && upJpg.data.data.key.endsWith(".jpg"), upJpg.data);
const upWebp = await uploadWith(tokenA, new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1]), "c.webp", "image/webp");
check("webp 上传成功", isOk(upWebp) && upWebp.data.data.key.endsWith(".webp"), upWebp.data);

const upTxt = await uploadWith(tokenA, new Uint8Array([1, 2, 3, 4]), "a.txt", "text/plain");
check("非图片 → 400", upTxt.status === 400 && /jpg/.test(upTxt.data.error), upTxt.data);

const big = new Uint8Array(2 * 1024 * 1024 + 1);
big.set(pngBytes());
const upBig = await uploadWith(tokenA, big, "big.png", "image/png");
check("超过 2MB → 400", upBig.status === 400 && /2MB/.test(upBig.data.error), upBig.data);

const upNoAuth = await uploadWith("bad-token", pngBytes(), "a.png", "image/png");
check("未登录上传 → 401", upNoAuth.status === 401, upNoAuth.data);

const fileRes = await get(M.file, "/api/liuyin/file?key=" + encodeURIComponent(upPng.data.data.key));
check("读取图片 200 + image/png", fileRes.status === 200 && fileRes.headers.get("content-type") === "image/png", fileRes.headers.get("content-type"));
check("图片 Cache-Control: private, max-age=600", (fileRes.headers.get("cache-control") || "").indexOf("private, max-age=600") > -1, fileRes.headers.get("cache-control"));
check("读回的字节与上传一致", fileRes.buf.equals(Buffer.from(pngBytes())), fileRes.buf.length);

const file404 = await get(M.file, "/api/liuyin/file?key=u_nope%2Fo_deadbeef.png");
check("不存在的图片 → 404", file404.status === 404, file404.data);
const fileBad = await get(M.file, "/api/liuyin/file?key=" + encodeURIComponent("../../etc/passwd"));
check("非法 key → 400", fileBad.status === 400, fileBad.data);

/* ========== H. 管理接口 ========== */
section("H. 管理接口（登录 / 统计 / seed / 封禁 / 清理）");
const adminBad = await post(M.adminLogin, "/api/liuyin/admin/login", { password: "wrong-pass" });
check("admin 错密码 → 401", adminBad.status === 401 && /密码/.test(adminBad.data.error), adminBad.data);
const adminNoPass = await post(M.adminLogin, "/api/liuyin/admin/login", { password: "" });
check("admin 空密码 → 400", adminNoPass.status === 400, adminNoPass.data);

const adminOk = await post(M.adminLogin, "/api/liuyin/admin/login", { password: env.ADMIN_PASSWORD });
check("admin 正确密码 → 200 且发 token", isOk(adminOk) && typeof adminOk.data.data.token === "string", adminOk.data);
const adminToken = adminOk.data.data.token;

const statsNoAuth = await get(M.adminStats, "/api/liuyin/admin/stats");
check("stats 未带管理 token → 401", statsNoAuth.status === 401, statsNoAuth.data);
const statsBadToken = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: "123.deadbeef" });
check("stats 伪造管理 token → 401", statsBadToken.status === 401, statsBadToken.data);

const seed1 = await post(M.adminSeed, "/api/liuyin/admin/seed", {}, { admin: adminToken });
check("seed 200", isOk(seed1), seed1.data);
check("seed 后 3 个邻居都在", seed1.data.data.users >= 6, seed1.data.data.users);
check("seed 写入 2 条待接订单", seed1.data.data.open_orders >= 2, seed1.data.data.open_orders);
check("seed 写入 2 条人情点", seed1.data.data.ledger >= 2, seed1.data.data.ledger);

const seed2 = await post(M.adminSeed, "/api/liuyin/admin/seed", {}, { admin: adminToken });
check("seed 幂等（再点一次不重复写）", seed2.data.data.users === seed1.data.data.users && seed2.data.data.ledger === seed1.data.data.ledger, {
  before: seed1.data.data,
  after: seed2.data.data,
});

const stats = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: adminToken });
check("stats 200", isOk(stats), stats.data);
check("stats 有 users / online / orders_by_status / floors / ledger_count / recent",
  typeof stats.data.data.users === "number" && typeof stats.data.data.online === "number" &&
  !!stats.data.data.orders_by_status && Array.isArray(stats.data.data.floors) &&
  typeof stats.data.data.ledger_count === "number" && Array.isArray(stats.data.data.recent),
  Object.keys(stats.data.data || {})
);
check("stats floors 覆盖 6 层", stats.data.data.floors.length === 6, stats.data.data.floors);
check("stats recent 有数据", stats.data.data.recent.length > 0, stats.data.data.recent.length);

const seedOpen = await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenA });
check("seed 的待接单能在 open 列表看到", seedOpen.data.data.orders.some((o) => o.id === "o_seed_open1"), seedOpen.data.data.orders.map((o) => o.id));
check("seed 的顺路卡 kind=route", seedOpen.data.data.orders.some((o) => o.id === "o_seed_open2" && o.kind === "route"), seedOpen.data.data.orders.map((o) => [o.id, o.kind]));
const doneList = await get(M.orders, "/api/liuyin/orders?scope=done", { token: tokenA });
check("scope=done 能看到历史完成单", doneList.data.data.orders.some((o) => o.id === "o_seed_done1"), doneList.data.data.orders.map((o) => o.id));

const ban = await post(M.adminBan, "/api/liuyin/admin/ban", { user_id: userC.id, reason: "测试封禁" }, { admin: adminToken });
check("封禁 200", isOk(ban), ban.data);
const bannedMe = await get(M.me, "/api/liuyin/me", { token: tokenC });
check("被封禁的 token → 401", bannedMe.status === 401 && /封禁/.test(bannedMe.data.error), bannedMe.data);
const unban = await post(M.adminUnban, "/api/liuyin/admin/unban", { user_id: userC.id }, { admin: adminToken });
check("解封 200", isOk(unban), unban.data);
const unbannedMe = await get(M.me, "/api/liuyin/me", { token: tokenC });
check("解封后可正常访问", unbannedMe.status === 200, unbannedMe.data);

const notice = await post(M.adminNotice, "/api/liuyin/admin/notice", { text: "今晚 10 点停水，别忘了接水" }, { admin: adminToken });
check("公告写入 200", isOk(notice), notice.data);
const meNotice = await get(M.me, "/api/liuyin/me", { token: tokenA });
check("me 能读到公告", meNotice.data.data.notice === "今晚 10 点停水，别忘了接水", meNotice.data.data.notice);

const del = await post(M.adminDeleteOrder, "/api/liuyin/admin/delete-order", { id: "o_seed_open1" }, { admin: adminToken });
check("删单 200", isOk(del) && del.data.data.deleted === 1, del.data);
const openAfterDel = await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenA });
check("删掉的单不再出现在 open", !openAfterDel.data.data.orders.some((o) => o.id === "o_seed_open1"), openAfterDel.data.data.orders.map((o) => o.id));

const clearOrders = await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });
check("清空订单 → deleted > 0", isOk(clearOrders) && clearOrders.data.data.deleted > 0, clearOrders.data);
const statsAfterClear = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: adminToken });
check("清空后订单数为 0", statsAfterClear.data.data.orders === 0, statsAfterClear.data.data.orders);
check("清空订单后用户还在", statsAfterClear.data.data.users > 0, statsAfterClear.data.data.users);

const clearBad = await post(M.adminClear, "/api/liuyin/admin/clear", { what: "everything" }, { admin: adminToken });
check("非法 what → 400", clearBad.status === 400, clearBad.data);

const clearAll = await post(M.adminClear, "/api/liuyin/admin/clear", { what: "all" }, { admin: adminToken });
check("清空全部 → 200", isOk(clearAll), clearAll.data);
const floorAfterClear = await get(M.floor, "/api/liuyin/floor?floor=3");
check("清空全部后本层名单为空", floorAfterClear.data.data.users.length === 0, floorAfterClear.data.data.users);
const statsZero = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: adminToken });
check("清空全部后 stats 全 0", statsZero.data.data.users === 0 && statsZero.data.data.orders === 0 && statsZero.data.data.ledger_count === 0, statsZero.data.data);

/* ========== I. 收尾 ========== */
section("I. CORS / OPTIONS / 限流");
const optRes = await M.middleware.onRequest({
  request: makeRequest("OPTIONS", "/api/liuyin/orders"),
  env,
  params: {},
  next: async () => new Response("next", { status: 200 }),
});
check("OPTIONS 预检 → 204", optRes.status === 204, optRes.status);
check("OPTIONS 带 Allow-Origin *", optRes.headers.get("access-control-allow-origin") === "*", optRes.headers.get("access-control-allow-origin"));
check("OPTIONS 带 Allow-Headers", (optRes.headers.get("access-control-allow-headers") || "").indexOf("x-ly-token") > -1, optRes.headers.get("access-control-allow-headers"));
const corsGet = await get(M.floors, "/api/liuyin/floors");
check("普通响应也带 Allow-Origin *", corsGet.headers.get("access-control-allow-origin") === "*", corsGet.headers.get("access-control-allow-origin"));

const rateIp = "203.0.113.7";
let first60Ok = true;
for (let i = 0; i < 60; i++) {
  const r = await get(M.floors, "/api/liuyin/floors", { ip: rateIp });
  if (r.status !== 200) first60Ok = false;
}
check("同一 IP 前 60 次都放行", first60Ok, "有请求被拦截");
const rate61 = await get(M.floors, "/api/liuyin/floors", { ip: rateIp });
check("第 61 次 → 429 中文错误", rate61.status === 429 && /太快了/.test(rate61.data.error), rate61.data);
const otherIp = await get(M.floors, "/api/liuyin/floors", { ip: "203.0.113.8" });
check("换 IP 不受影响 → 200", otherIp.status === 200, otherIp.status);

const logout = await post(M.logout, "/api/liuyin/logout", {}, { token: tokenA });
check("logout → ok", isOk(logout), logout.data);

/* ---------------- 汇总 ---------------- */
rmSync(dest, { recursive: true, force: true });
const ms = Date.now() - t0;
console.log("\n" + "=".repeat(56));
console.log("通过 " + pass + " 条 / 失败 " + fail + " 条，用时 " + ms + "ms");
if (fail > 0) {
  console.log("失败项：");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
console.log("全部通过 ✅");
}


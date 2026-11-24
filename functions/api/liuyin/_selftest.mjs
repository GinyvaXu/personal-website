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
const IS_NODE =
  typeof process !== "undefined" &&
  !!process.release &&
  process.release.name === "node" &&
  typeof process.cwd === "function" &&
  typeof process.argv !== "undefined" &&
  /* workerd 会提供 process 垫片，但 navigator 会标记 Cloudflare-Workers；本地 wrangler dev 与生产冷启动都要跳过 */
  !(typeof navigator !== "undefined" && /Cloudflare-Workers/i.test(String(navigator.userAgent || "")));

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
    /* 模拟 D1：exec 以换行分隔语句（这也是生产上的坑，迁移已把 DDL 压成一行） */
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
    lib: "_lib.mjs",
    middleware: "_middleware.mjs",
    login: "login.mjs",
    me: "me.mjs",
    logout: "logout.mjs",
    profile: "profile.mjs",
    floor: "floor.mjs",
    floors: "floors.mjs",
    sync: "sync.mjs",
    orders: "orders/index.mjs",
    orderCreate: "orders/create.mjs",
    orderAction: "orders/[action].mjs",
    orderGet: "orders/get.mjs",
    routes: "routes/index.mjs",
    routeCreate: "routes/create.mjs",
    routeWithdraw: "routes/withdraw.mjs",
    messages: "messages/index.mjs",
    messageSend: "messages/send.mjs",
    upload: "upload.mjs",
    file: "file.mjs",
    adminLogin: "admin/login.mjs",
    adminStats: "admin/stats.mjs",
    adminOrders: "admin/orders.mjs",
    adminUsers: "admin/users.mjs",
    adminAlerts: "admin/alerts.mjs",
    adminAlertResolve: "admin/alert/resolve.mjs",
    adminUser: "admin/user.mjs",
    adminOrderDelete: "admin/order/delete.mjs",
    adminClear: "admin/clear.mjs",
    adminSeed: "admin/seed.mjs",
    adminNotice: "admin/notice.mjs",
    adminRobot: "admin/robot.mjs",
    adminRobotRun: "admin/robot/run.mjs",
    adminRobotSeed: "admin/robot/seed.mjs",
    adminRobotLog: "admin/robot/log.mjs",
    adminBan: "admin/ban.mjs",
    adminUnban: "admin/unban.mjs",
    adminDeleteOrder: "admin/delete-order.mjs",
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
    } else if (opts.rawBody !== undefined) {
      headers.set("content-type", "application/json");
      body = opts.rawBody;
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

  const dbRun = (sql, ...params) => env.DB.prepare(sql).bind(...params).run();
  const dbFirst = (sql, ...params) => env.DB.prepare(sql).bind(...params).first();
  const dbAll = (sql, ...params) => env.DB.prepare(sql).bind(...params).all();
  const isoAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();

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
      console.log("  ✗ " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400)));
    }
  }
  function isOk(r) {
    return r && r.status === 200 && r.data && r.data.ok === true;
  }
  function orderOf(r) {
    return r && r.data && r.data.data && r.data.data.order;
  }
  function tokenOf(r) {
    return r && r.data && r.data.data && r.data.data.token;
  }
  function userOf(r) {
    return r && r.data && r.data.data && r.data.data.user;
  }

  const t0 = Date.now();

  /* ================================================================
   * 0. 老库自动迁移
   * ================================================================ */
  section("0. 老库自动迁移（缺列 ALTER + 老状态映射 + pres 表 + 版本号）");
  const OLD_USERS =
    "CREATE TABLE ly_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL, " +
    "floor INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, banned INTEGER NOT NULL DEFAULT 0, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')))";
  const OLD_ORDERS =
    "CREATE TABLE ly_orders (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'errand', creator_id TEXT NOT NULL, " +
    "claimer_id TEXT, title TEXT NOT NULL, note TEXT, from_place TEXT, to_floor INTEGER, start_at TEXT, end_at TEXT, " +
    "capacity INTEGER DEFAULT 1, code TEXT, status TEXT NOT NULL DEFAULT 'pending', photo_key TEXT, proof_key TEXT, " +
    "created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT)";
  const OLD_REST =
    "CREATE TABLE ly_confirmations (order_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT, PRIMARY KEY (order_id,user_id));" +
    "CREATE TABLE ly_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL UNIQUE, from_id TEXT NOT NULL, " +
    "to_id TEXT NOT NULL, delta INTEGER NOT NULL DEFAULT 1, note TEXT, created_at TEXT);" +
    "CREATE TABLE ly_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, from_id TEXT NOT NULL, " +
    "body TEXT NOT NULL, created_at TEXT);" +
    "CREATE TABLE ly_bans (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, ip_hash TEXT, reason TEXT, created_at TEXT);" +
    "CREATE TABLE ly_settings (key TEXT PRIMARY KEY, value TEXT)";

  function makeLegacyDb() {
    const db = new D1Mock();
    db.sqlite.exec(OLD_USERS);
    db.sqlite.exec(OLD_ORDERS);
    db.sqlite.exec(OLD_REST);
    db.sqlite.exec(
      "INSERT INTO ly_users (id,name,name_key,floor,token,banned) VALUES ('u_old1','老邻居','老邻居',2,'old-token-1',0)"
    );
    db.sqlite.exec(
      "INSERT INTO ly_users (id,name,name_key,floor,token,banned) VALUES ('u_old2','老周','老周',2,'old-token-2',0)"
    );
    const at = isoAgo(120);
    const insert = (id, status, title, code) =>
      db.sqlite.exec(
        "INSERT INTO ly_orders (id,kind,creator_id,claimer_id,title,code,status,created_at,updated_at) VALUES ('" +
          id +
          "','errand','u_old1','" +
          (status === "pending" ? "" : "u_old2") +
          "','" +
          title +
          "','" +
          code +
          "','" +
          status +
          "','" +
          at +
          "','" +
          at +
          "')"
      );
    insert("o_old_conf", "confirmed", "取快递", "A·1111");
    insert("o_old_pick", "picked", "带份饭", "");
    insert("o_old_ret", "returned", "帮忙带个东西", "");
    insert("o_old_pend", "pending", "取快递", "");
    db.sqlite.exec(
      "INSERT INTO ly_orders (id,kind,creator_id,claimer_id,title,code,status,created_at,updated_at) VALUES " +
        "('o_old_done','errand','u_old1','u_old2','取快递','B·2222','done','" + at + "','" + at + "')"
    );
    return db;
  }

  const legacyDb = makeLegacyDb();
  const legacyEnv = {
    DB: legacyDb,
    FILES: env.FILES,
    ADMIN_PASSWORD: env.ADMIN_PASSWORD,
    SESSION_SECRET: env.SESSION_SECRET,
  };
  const legacyFloors = await get(M.floors, "/api/liuyin/floors", { env: legacyEnv });
  check("老库首次请求自动迁移成功", isOk(legacyFloors), legacyFloors.data);

  const userCols = ((await legacyDb.prepare("SELECT name FROM pragma_table_info('ly_users')").all()).results || []).map(
    (c) => c.name
  );
  const orderCols = ((await legacyDb.prepare("SELECT name FROM pragma_table_info('ly_orders')").all()).results || []).map(
    (c) => c.name
  );
  check(
    "ly_users 新列齐（nickname/real_name/show_real_name/avatar/room_no/is_demo/onboarded/missed/last_seen）",
    ["nickname", "real_name", "show_real_name", "avatar", "room_no", "building_id", "is_demo", "onboarded", "missed", "last_seen"].every(
      (c) => userCols.indexOf(c) > -1
    ),
    userCols
  );
  check(
    "ly_orders 新列齐（category/template_id/size/pickup/time_label/points/need_code/steps/current_step/conn_deadline/conn_extended/delivered_at/done_at/released_reason）",
    ["category", "template_id", "size", "pickup", "time_label", "points", "need_code", "steps", "current_step", "conn_deadline", "conn_extended", "delivered_at", "done_at", "released_reason"].every(
      (c) => orderCols.indexOf(c) > -1
    ),
    orderCols
  );
  check("老用户 name 保留且补 nickname", (await legacyDb.prepare("SELECT nickname FROM ly_users WHERE id='u_old1'").first()).nickname === "老邻居", null);
  check("老用户补 avaTar/onboarded/building_id 默认值",
    (await legacyDb.prepare("SELECT avatar, onboarded, building_id, is_demo, show_real_name FROM ly_users WHERE id='u_old1'").first()).is_demo === 0,
    await legacyDb.prepare("SELECT * FROM ly_users WHERE id='u_old1'").first()
  );
  const oldConf = await legacyDb.prepare("SELECT * FROM ly_orders WHERE id='o_old_conf'").first();
  check("confirmed → connected", oldConf.status === "connected", oldConf.status);
  check("confirmed 单补出 4 步 pickup 模板", JSON.parse(oldConf.steps).length === 4, oldConf.steps);
  check("confirmed 单的 provide_code 步骤标完成并回填 text_value",
    JSON.parse(oldConf.steps)[0].status === "done" && JSON.parse(oldConf.steps)[0].text_value === "A·1111",
    JSON.parse(oldConf.steps)[0]
  );
  const oldPick = await legacyDb.prepare("SELECT * FROM ly_orders WHERE id='o_old_pick'").first();
  check("picked → connected 且取到步骤完成",
    oldPick.status === "connected" && JSON.parse(oldPick.steps).some((s) => s.type === "pickup" && s.status === "done"),
    { status: oldPick.status, steps: JSON.parse(oldPick.steps) }
  );
  const oldRet = await legacyDb.prepare("SELECT * FROM ly_orders WHERE id='o_old_ret'").first();
  check("returned → released", oldRet.status === "released" && oldRet.released_reason !== null, oldRet.status);
  const oldPend = await legacyDb.prepare("SELECT * FROM ly_orders WHERE id='o_old_pend'").first();
  check("pending 老单也补 steps / points / need_code",
    JSON.parse(oldPend.steps).length === 4 && oldPend.points === 2 && oldPend.need_code === 1,
    { steps: JSON.parse(oldPend.steps).length, points: oldPend.points, need_code: oldPend.need_code }
  );
  const oldDone = await legacyDb.prepare("SELECT * FROM ly_orders WHERE id='o_old_done'").first();
  check("done 老单 steps 全部 done 且 current_step=4",
    JSON.parse(oldDone.steps).every((s) => s.status === "done") && oldDone.current_step === 4,
    { current_step: oldDone.current_step }
  );
  const versionRow = await legacyDb.prepare("SELECT value FROM ly_settings WHERE key='schema_version'").first();
  check("写 schema_version = " + M.lib.SCHEMA_VERSION, versionRow && Number(versionRow.value) === M.lib.SCHEMA_VERSION, versionRow);
  const settingsRows = await legacyDb.prepare("SELECT key FROM ly_settings").all();
  const settingKeys = (settingsRows.results || []).map((r) => r.key);
  check("补全 lit/target/code 设置", settingKeys.indexOf("lit") > -1 && settingKeys.indexOf("target") > -1 && settingKeys.indexOf("code") > -1, settingKeys);
  const presTables = await legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ly_pres_%'").all();
  check("迁移创建 ly_pres_cmd / ly_pres_state（路演提词台不 500）",
    (presTables.results || []).length === 2,
    (presTables.results || []).map((r) => r.name)
  );
  const robotCfgRow = await legacyDb.prepare("SELECT enabled FROM ly_robot_config WHERE id=1").first();
  check("迁移写入机器人默认配置", robotCfgRow && Number(robotCfgRow.enabled) === 1, robotCfgRow);
  const legacyLogin = await post(M.login, "/api/liuyin/login", { name: "老邻居", floor: 2 }, { env: legacyEnv });
  check("迁移后老库可正常登录（同层同名 → 老邻居(2)）", isOk(legacyLogin) && userOf(legacyLogin).name === "老邻居(2)", legacyLogin.data);

  const legacyDb2 = makeLegacyDb();
  const legacyEnv2 = Object.assign({}, legacyEnv, { DB: legacyDb2 });
  const legacyFloors2 = await get(M.floors, "/api/liuyin/floors", { env: legacyEnv2 });
  check("同一套迁移可重复执行（第二个老库也成功）", isOk(legacyFloors2), legacyFloors2.data);
  check("第二个老库订单数不变（幂等）", (await legacyDb2.prepare("SELECT COUNT(*) AS n FROM ly_orders").first()).n === 5, null);

  /* ================================================================
   * 1. 登录 / 弱账户 / 重名
   * ================================================================ */
  section("1. 进楼与重名编号");
  const loginA = await post(M.login, "/api/liuyin/login", { name: "小柳", floor: 3 });
  const tokenA = tokenOf(loginA);
  const userA = userOf(loginA);
  check("首次登录 200 且拿到 token", isOk(loginA) && typeof tokenA === "string", loginA.data);
  check("token 是 UUID 形状", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tokenA || ""), tokenA);
  check("名字 = 小柳，楼层 = 3", userA && userA.name === "小柳" && userA.floor === 3, userA);
  check("新用户 onboarded=false 且头像为 preset:*", userA.onboarded === false && /^preset:[a-z]+$/.test(userA.avatar), userA);
  check("登录返回 building（name/lit/target/code/floor）",
    isOk(loginA) && loginA.data.data.building.name === "6 号楼" && loginA.data.data.building.lit === 18 &&
    loginA.data.data.building.target === 30 && loginA.data.data.building.code === "7241" && loginA.data.data.building.floor === 3,
    loginA.data.data.building
  );

  const loginB = await post(M.login, "/api/liuyin/login", { name: "小柳", floor: 3 });
  const tokenB = tokenOf(loginB);
  const userB = userOf(loginB);
  check("同层同名 → 小柳(2)", isOk(loginB) && userB.name === "小柳(2)", userB);

  const loginB2 = await post(M.login, "/api/liuyin/login", { name: " 小 柳 ", floor: 3 });
  check("归一化（空格）仍算重名 → 小柳(3)", userOf(loginB2).name === "小柳(3)", userOf(loginB2));

  const loginB3 = await post(M.login, "/api/liuyin/login", { name: "小柳(2)", floor: 3 });
  check("输入自带编号会去重后重新编号 → 小柳(4)", userOf(loginB3).name === "小柳(4)", userOf(loginB3));

  const loginC = await post(M.login, "/api/liuyin/login", { name: "老王", floor: 5 });
  const tokenC = tokenOf(loginC);
  const userC = userOf(loginC);
  check("不同楼层同名可共存（老王 5 层）", isOk(loginC) && userC.floor === 5 && userC.name === "老王", userC);

  const loginD = await post(M.login, "/api/liuyin/login", { name: "阿强", floor: 2 });
  const tokenD = tokenOf(loginD);
  const userD = userOf(loginD);
  check("第四个用户登录成功", isOk(loginD), loginD.data);

  const loginE = await post(M.login, "/api/liuyin/login", { name: "小新人", floor: 4 });
  const tokenE = tokenOf(loginE);
  const userE = userOf(loginE);
  check("第五个用户登录成功", isOk(loginE), loginE.data);

  const relogin = await post(M.login, "/api/liuyin/login", { name: "随便", floor: 1 }, { token: tokenA });
  check("带已有 token 登录 → 直接返回本人", userOf(relogin).id === userA.id && tokenOf(relogin) === tokenA, userOf(relogin));
  const reloginBody = await post(M.login, "/api/liuyin/login", { token: tokenA });
  check("token 放 body 也能回本人（老前端兼容）", userOf(reloginBody).id === userA.id, reloginBody.data);

  const badName = await post(M.login, "/api/liuyin/login", { name: "", floor: 3 });
  check("空名字 → 400 中文错误", badName.status === 400 && /名字/.test(badName.data.error), badName.data);
  const badFloor0 = await post(M.login, "/api/liuyin/login", { name: "楼层怪", floor: 0 });
  check("楼层 0 → 400", badFloor0.status === 400, badFloor0.data);
  const badFloor9 = await post(M.login, "/api/liuyin/login", { name: "楼层怪", floor: 9 });
  check("楼层 9 → 400", badFloor9.status === 400, badFloor9.data);
  const badFloorStr = await post(M.login, "/api/liuyin/login", { name: "楼层怪", floor: "abc" });
  check("楼层 abc → 400", badFloorStr.status === 400, badFloorStr.data);
  const badLong = await post(M.login, "/api/liuyin/login", { name: "一二三四五六七八九十十一十二", floor: 1 });
  check("名字超 12 字 → 400", badLong.status === 400, badLong.data);
  const badJson = await post(M.login, "/api/liuyin/login", undefined, { rawBody: "{not-json" });
  check("非法 JSON → 400「请求格式不正确」", badJson.status === 400 && /JSON/.test(badJson.data.error), badJson.data);

  /* 管理登录（后面所有 admin 断言用），并关掉机器人保证主链路确定性 */
  const adminOk = await post(M.adminLogin, "/api/liuyin/admin/login", { password: env.ADMIN_PASSWORD });
  const adminToken = adminOk && adminOk.data && adminOk.data.data && adminOk.data.data.token;
  check("管理登录成功拿到 token", isOk(adminOk) && typeof adminToken === "string", adminOk.data);
  const robotOff = await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { enabled: false } }, { admin: adminToken });
  check("测试开始前关闭机器人（保证主链路确定性）", isOk(robotOff) && robotOff.data.data.config.enabled === false, robotOff.data);

  /* ================================================================
   * 2. 个人档案
   * ================================================================ */
  section("2. 个人档案（昵称/真名/头像/楼层/门牌）");
  const profA = await post(M.profile, "/api/liuyin/profile", { real_name: "柳小青", show_real_name: true }, { token: tokenA });
  check("A 写真名 200", isOk(profA) && userOf(profA).real_name === "柳小青", profA.data);
  check("A 保存档案后 onboarded=true", userOf(profA).onboarded === true, userOf(profA));
  const profB = await post(M.profile, "/api/liuyin/profile", { real_name: "柳小乙", show_real_name: true }, { token: tokenB });
  check("B 写真名 200", isOk(profB) && userOf(profB).real_name === "柳小乙", profB.data);

  const profD1 = await post(M.profile, "/api/liuyin/profile", { nickname: "阿强强", avatar: "preset:sky", room_no: "208", real_name: "张强" }, { token: tokenD });
  check("D 改昵称/头像/门牌 200", isOk(profD1) && userOf(profD1).name === "阿强强" && userOf(profD1).room_no === "208", profD1.data);
  check("D 头像 = preset:sky", userOf(profD1).avatar === "preset:sky", userOf(profD1).avatar);
  check("D 真名 = 张强", userOf(profD1).real_name === "张强", userOf(profD1).real_name);

  const loginD2 = await post(M.login, "/api/liuyin/login", { name: "另一个人", floor: 2 });
  const tokenD2 = tokenOf(loginD2);
  const profD2 = await post(M.profile, "/api/liuyin/profile", { nickname: "阿强强" }, { token: tokenD2 });
  check("同层改同名 → 自动编号 阿强强(2)", isOk(profD2) && userOf(profD2).name === "阿强强(2)", profD2.data);

  const profD3 = await post(M.profile, "/api/liuyin/profile", { floor: 5, nickname: "阿强强" }, { token: tokenD });
  check("换楼层（2 → 5）成功", isOk(profD3) && userOf(profD3).floor === 5, profD3.data);

  const profShowOff = await post(M.profile, "/api/liuyin/profile", { show_real_name: false }, { token: tokenD });
  check("关闭「显示真名」保存成功", isOk(profShowOff) && userOf(profShowOff).show_real_name === false, profShowOff.data);
  const meD = await get(M.me, "/api/liuyin/me", { token: tokenD });
  check("me 里 show_real_name=false 生效", meD.data.data.user.show_real_name === false, meD.data.data.user);

  const profBadAvatar = await post(M.profile, "/api/liuyin/profile", { avatar: "http://evil.example/x.png" }, { token: tokenD });
  check("非法头像 → 400", profBadAvatar.status === 400, profBadAvatar.data);
  const profBadNick = await post(M.profile, "/api/liuyin/profile", { nickname: "一二三四五六七八九十十一十二" }, { token: tokenD });
  check("昵称超 12 字 → 400", profBadNick.status === 400, profBadNick.data);
  const profBadFloor = await post(M.profile, "/api/liuyin/profile", { floor: 9 }, { token: tokenD });
  check("档案楼层 9 → 400", profBadFloor.status === 400, profBadFloor.data);
  const profNoAuth = await post(M.profile, "/api/liuyin/profile", { nickname: "无名" });
  check("未登录改档案 → 401", profNoAuth.status === 401, profNoAuth.data);
  const profGet = await get(M.profile, "/api/liuyin/profile", { token: tokenD });
  check("GET /profile 返回本人档案", isOk(profGet) && userOf(profGet).id === userD.id, profGet.data);

  /* ================================================================
   * 3. me / floor / floors
   * ================================================================ */
  section("3. 身份与名单");
  const meA = await get(M.me, "/api/liuyin/me", { token: tokenA });
  check("me 200 且带 building", isOk(meA) && meA.data.data.building.name === "6 号楼", meA.data);
  check("me.user 有 points/owed/helped/received=0", meA.data.data.user.points === 0 && meA.data.data.user.owed === 0 &&
    meA.data.data.user.helped === 0 && meA.data.data.user.received === 0, meA.data.data.user);
  check("me.stats 与 me.user 口径一致", meA.data.data.stats.points === 0 && meA.data.data.stats.helped === 0, meA.data.data.stats);
  check("me 带 ledger 数组", Array.isArray(meA.data.data.ledger), meA.data.data.ledger);
  check("me 带 notice 字段", typeof meA.data.data.notice === "string", meA.data.data.notice);
  check("me.building 带 lit/target/code", meA.data.data.building.lit === 18 && meA.data.data.building.target === 30 && meA.data.data.building.code === "7241", meA.data.data.building);

  const meNoAuth = await get(M.me, "/api/liuyin/me");
  check("未登录 me → 401", meNoAuth.status === 401 && /进楼/.test(meNoAuth.data.error), meNoAuth.data);
  const meFake = await get(M.me, "/api/liuyin/me", { token: "not-a-real-token" });
  check("假 token → 401", meFake.status === 401, meFake.data);

  const floor3 = await get(M.floor, "/api/liuyin/floor?floor=3", { token: tokenA });
  check("floor 返回本层名单且排除自己", isOk(floor3) && floor3.data.data.users.every((u) => u.id !== userA.id), floor3.data.data);
  check("floor 名单带 avatar/floor/points/online", floor3.data.data.users.every((u) =>
    typeof u.avatar === "string" && typeof u.floor === "number" && typeof u.points === "number" && typeof u.online === "boolean"), floor3.data.data.users);
  check("floor 名单只露昵称（不返回 real_name 字段）", floor3.data.data.users.every((u) => u.real_name === undefined), floor3.data.data.users[0]);
  check("本层有在线的人（刚登录过）", floor3.data.data.users.some((u) => u.online === true), floor3.data.data.users);

  const floorsRes = await get(M.floors, "/api/liuyin/floors");
  check("floors 返回 1–6 层", isOk(floorsRes) && floorsRes.data.data.floors.length === 6, floorsRes.data.data);
  check("floors[2].floor = 3 且本层 count ≥ 4", floorsRes.data.data.floors[2].floor === 3 && floorsRes.data.data.floors[2].count >= 4, floorsRes.data.data.floors[2]);
  const floorNoToken = await get(M.floor, "/api/liuyin/floor");
  check("未登录又没给 floor → 400", floorNoToken.status === 400, floorNoToken.data);

  /* ================================================================
   * 4. 发单校验
   * ================================================================ */
  section("4. 发单校验与步骤模板");
  const created = await post(M.orderCreate, "/api/liuyin/orders/create", {
    category: "取快递",
    size: "中件",
    pickup: "菜鸟驿站",
    time_label: "18:10 前",
    points: 2,
    note: "六个件，有点重",
    to_floor: 3,
  }, { token: tokenA });
  const order1 = orderOf(created);
  check("发单 200", isOk(created), created.data);
  check("新单 status=pending / role=requester / is_mine", order1.status === "pending" && order1.role === "requester" && order1.is_mine === true, {
    status: order1.status, role: order1.role, is_mine: order1.is_mine,
  });
  check("取快递模板 4 步（provide_code 在首位）", order1.steps.length === 4 && order1.steps[0].type === "provide_code", order1.steps.map((s) => s.type));
  check("取快递 need_code=true、code 初始为空串", order1.need_code === true && order1.code === "", { need_code: order1.need_code, code: order1.code });
  check("品类/大小件/取货点/时间档/点数落库", order1.category === "取快递" && order1.size === "中件" && order1.pickup === "菜鸟驿站" && order1.time_label === "18:10 前" && order1.points === 2, order1);
  check("to_floor 默认/显式生效", order1.to_floor === 3, order1.to_floor);
  check("creator 是 A 且 claimer=null", order1.creator.id === userA.id && order1.claimer === null, { creator: order1.creator, claimer: order1.claimer });
  check("current_step 初始 0", order1.current_step === 0, order1.current_step);
  check("creator 自己看 code 也是空（还没填）", order1.code === "", order1.code);

  const createdFood = await post(M.orderCreate, "/api/liuyin/orders/create", {
    category: "带饭", pickup: "食堂二楼", points: 1,
  }, { token: tokenA });
  const foodOrder = orderOf(createdFood);
  check("带饭模板 3 步且无 provide_code", foodOrder.steps.length === 3 && !foodOrder.steps.some((s) => s.type === "provide_code"), foodOrder.steps.map((s) => s.type));
  check("带饭 need_code=false", foodOrder.need_code === false, foodOrder.need_code);

  const createdTrash = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "倒垃圾" }, { token: tokenA });
  check("倒垃圾模板 2 步", orderOf(createdTrash).steps.length === 2, orderOf(createdTrash).steps.map((s) => s.type));

  const createdCustom = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "自定义", template_id: "custom" }, { token: tokenA });
  check("自定义无取件码 → 3 步", orderOf(createdCustom).steps.length === 3, orderOf(createdCustom).steps.map((s) => s.type));
  const createdCustomCode = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "自定义", template_id: "custom", need_code: true }, { token: tokenA });
  check("自定义要取件码 → 4 步", orderOf(createdCustomCode).steps.length === 4, orderOf(createdCustomCode).steps.map((s) => s.type));

  const badCategory = await post(M.orderCreate, "/api/liuyin/orders/create", { points: 2 }, { token: tokenA });
  check("缺分类 → 400", badCategory.status === 400 && /分类/.test(badCategory.data.error), badCategory.data);
  const badPoints = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", points: 9 }, { token: tokenA });
  check("点数 9 → 400", badPoints.status === 400, badPoints.data);
  const badNote = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", note: "字".repeat(61) }, { token: tokenA });
  check("备注 61 字 → 400", badNote.status === 400, badNote.data);
  const badSize = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", size: "巨大件" }, { token: tokenA });
  check("非法大小件 → 400", badSize.status === 400, badSize.data);
  const badToFloor = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", to_floor: 7 }, { token: tokenA });
  check("送到 7 层 → 400", badToFloor.status === 400, badToFloor.data);
  const badPickup = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", pickup: "地".repeat(21) }, { token: tokenA });
  check("取货点 21 字 → 400", badPickup.status === 400, badPickup.data);
  const badPhoto = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递", photo_key: "../../etc/passwd" }, { token: tokenA });
  check("非法照片 key → 400", badPhoto.status === 400, badPhoto.data);
  const createNoAuth = await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递" });
  check("未登录发单 → 401", createNoAuth.status === 401, createNoAuth.data);
  const createPostAlias = await post(M.orders, "/api/liuyin/orders", { category: "送东西", pickup: "超市" }, { token: tokenA });
  check("POST /orders（别名）也能发单", isOk(createPostAlias) && orderOf(createPostAlias).category === "送东西", createPostAlias.data);
  const createWithPhoto = await post(M.orderCreate, "/api/liuyin/orders/create", {
    category: "取快递", photo_key: userA.id + "/o_deadbeef.png",
  }, { token: tokenA });
  check("合法照片 key 落库", isOk(createWithPhoto) && orderOf(createWithPhoto).photo_key === userA.id + "/o_deadbeef.png", orderOf(createWithPhoto));

  /* ================================================================
   * 5. 待接池脱敏（code / 真名 / 步骤文本）
   * ================================================================ */
  section("5. 待接池脱敏（code / 真名 / 提供取件码文本）");
  const guestView1 = await get(M.orderGet, "/api/liuyin/orders/get?id=" + order1.id, { token: tokenC });
  const guestOrder1 = guestView1.data.data.order;
  check("非双方也能看到订单本体（邻里弱隐私）", isOk(guestView1) && guestOrder1.id === order1.id, guestView1.data);
  check("路人看 pending 单 code 为空串", guestOrder1.code === "", guestOrder1.code);
  check("路人看 provide_code 步骤 text_value 为空", guestOrder1.steps[0].text_value === "", guestOrder1.steps[0]);
  check("路人看不到真名（real_name=null）", guestOrder1.creator.real_name === null, guestOrder1.creator);
  check("路人只见昵称（小柳）", guestOrder1.creator.name === "小柳", guestOrder1.creator.name);
  check("路人角色 role=guest / is_mine=false", guestOrder1.role === "guest" && guestOrder1.is_mine === false, { role: guestOrder1.role, is_mine: guestOrder1.is_mine });
  check("路人拿不到 messages", Array.isArray(guestView1.data.data.messages) && guestView1.data.data.messages.length === 0, guestView1.data.data.messages);
  check("详情返回 confirm:{mine,other,count}", !!guestView1.data.data.confirm && guestView1.data.data.confirm.mine === false && guestView1.data.data.confirm.count === 0, guestView1.data.data.confirm);
  check("详情返回 server_time", typeof guestView1.data.data.server_time === "string", guestView1.data.data.server_time);

  const openForC = await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenC });
  const openOrder1 = openForC.data.data.orders.find((o) => o.id === order1.id);
  check("待接池能看到这条单", !!openOrder1, openForC.data.data.orders.map((o) => o.id));
  check("待接池里 code 被脱敏", openOrder1 && openOrder1.code === "", openOrder1 && openOrder1.code);
  check("待接池里看不到真名", openOrder1 && openOrder1.creator.real_name === null, openOrder1 && openOrder1.creator);
  const openForA = await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenA });
  check("待接池排除自己发的单", !openForA.data.data.orders.some((o) => o.id === order1.id), openForA.data.data.orders.map((o) => o.id));

  const mineA = await get(M.orders, "/api/liuyin/orders?scope=mine", { token: tokenA });
  check("scope=mine 含自己发的单", mineA.data.data.orders.some((o) => o.id === order1.id), mineA.data.data.orders.length);
  check("scope=mine 里自己看得到 real_name（本人）", mineA.data.data.orders.find((o) => o.id === order1.id).creator.real_name === "柳小青", null);
  const mineNoAuth = await get(M.orders, "/api/liuyin/orders?scope=mine");
  check("未登录 scope=mine → 401", mineNoAuth.status === 401, mineNoAuth.data);
  const badScope = await get(M.orders, "/api/liuyin/orders?scope=nope", { token: tokenA });
  check("非法 scope → 400", badScope.status === 400, badScope.data);

  /* ================================================================
   * 6. 接单 / 并发防抢
   * ================================================================ */
  section("6. 接单与并发防抢");
  const claimOwn = await act("claim", { id: order1.id }, { token: tokenA });
  check("接自己的单 → 403", claimOwn.status === 403 && /自己/.test(claimOwn.data.error), claimOwn.data);

  const claimed = await act("claim", { id: order1.id }, { token: tokenB });
  const claimedOrder = orderOf(claimed);
  check("B 接单 → claimed", isOk(claimed) && claimedOrder.status === "claimed", claimed.data);
  check("接单人 = B", claimedOrder.claimer && claimedOrder.claimer.id === userB.id, claimedOrder.claimer);
  check("claimed 时 conn_deadline ≈ 10 分钟后",
    claimedOrder.conn_deadline && Math.abs(Date.parse(claimedOrder.conn_deadline) - Date.now() - 10 * 60000) < 60000,
    claimedOrder.conn_deadline
  );
  check("conn_extended 初始 0", claimedOrder.conn_extended === 0, claimedOrder.conn_extended);
  const claimAgainC = await act("claim", { id: order1.id }, { token: tokenC });
  check("别人再抢 → 409「已经被别人接走」", claimAgainC.status === 409 && /接走/.test(claimAgainC.data.error), claimAgainC.data);
  const claimAgainB = await act("claim", { id: order1.id }, { token: tokenB });
  check("接单人重复点 → 幂等 200 claimed", isOk(claimAgainB) && orderOf(claimAgainB).status === "claimed", claimAgainB.data);
  const claimMissing = await act("claim", { id: "o_nope" }, { token: tokenC });
  check("不存在的单 → 404", claimMissing.status === 404, claimMissing.data);
  const claimNoId = await act("claim", {}, { token: tokenC });
  check("缺订单 id → 400", claimNoId.status === 400, claimNoId.data);
  const unknownAction = await call(M.orderAction, "POST", "/api/liuyin/orders/nope", {
    body: { id: order1.id }, params: { action: "nope" }, token: tokenA,
  });
  check("未知 action → 404", unknownAction.status === 404, unknownAction.data);

  /* 接单方看 claimed 单：真名仍未露出（建联后才露出），code 仍空 */
  const bViewClaimed = await get(M.orderGet, "/api/liuyin/orders/get?id=" + order1.id, { token: tokenB });
  check("claimed 时对接单方也不露真名（建联后才露）", bViewClaimed.data.data.order.creator.real_name === null, bViewClaimed.data.data.order.creator);
  check("claimed 时接单方角色 role=helper", bViewClaimed.data.data.order.role === "helper" && bViewClaimed.data.data.order.is_mine === true, bViewClaimed.data.data.order.role);

  /* ================================================================
   * 7. 双确认 / 延长
   * ================================================================ */
  section("7. 双确认与延长");
  const confirmGuest = await act("confirm", { id: order1.id }, { token: tokenC });
  check("非当事人 confirm → 403", confirmGuest.status === 403, confirmGuest.data);
  const confirmB1 = await act("confirm", { id: order1.id }, { token: tokenB });
  check("B 第一次确认 → confirmed=1 且仍 claimed", isOk(confirmB1) && confirmB1.data.data.confirmed === 1 && orderOf(confirmB1).status === "claimed", confirmB1.data);
  const confirmBagain = await act("confirm", { id: order1.id }, { token: tokenB });
  check("同一人重复确认幂等 → confirmed=1", confirmBagain.data.data.confirmed === 1, confirmBagain.data);
  const extB = await act("extend", { id: order1.id }, { token: tokenB });
  check("B 延长 10 分钟成功", isOk(extB) && orderOf(extB).conn_extended === 1, extB.data);
  check("延长后 conn_deadline 再 +10 分钟",
    Math.abs(Date.parse(orderOf(extB).conn_deadline) - Date.now() - 20 * 60000) < 70000,
    orderOf(extB).conn_deadline
  );
  const extAgain = await act("extend", { id: order1.id }, { token: tokenB });
  check("第二次延长 → 409", extAgain.status === 409, extAgain.data);
  const confirmA = await act("confirm", { id: order1.id }, { token: tokenA });
  check("A 也确认 → confirmed=2 且 connected", confirmA.data.data.confirmed === 2 && orderOf(confirmA).status === "connected", confirmA.data);
  check("connected 后 conn_deadline 清空", orderOf(confirmA).conn_deadline === null, orderOf(confirmA).conn_deadline);
  const confirmAgainA = await act("confirm", { id: order1.id }, { token: tokenA });
  check("connected 后重复确认 → 200 + confirmed=2", isOk(confirmAgainA) && confirmAgainA.data.data.confirmed === 2, confirmAgainA.data);
  check("详情 confirm.mine/other 都 true",
    (await get(M.orderGet, "/api/liuyin/orders/get?id=" + order1.id, { token: tokenA })).data.data.confirm.mine === true,
    null
  );

  const pendingOrderFood = orderOf(createdFood);
  const confirmPending = await act("confirm", { id: pendingOrderFood.id }, { token: tokenA });
  check("pending 直接 confirm → 409", confirmPending.status === 409, confirmPending.data);
  const extPending = await act("extend", { id: pendingOrderFood.id }, { token: tokenA });
  check("pending extend → 409", extPending.status === 409, extPending.data);

  /* 建联后：B 能看到 A 的真名（show_real_name=true） */
  const bViewConnected = await get(M.orderGet, "/api/liuyin/orders/get?id=" + order1.id, { token: tokenB });
  check("建联后接单方能看到发单方真名（柳小青）", bViewConnected.data.data.order.creator.name === "柳小青" && bViewConnected.data.data.order.creator.real_name === "柳小青", bViewConnected.data.data.order.creator);
  const cViewConnected = await get(M.orderGet, "/api/liuyin/orders/get?id=" + order1.id, { token: tokenC });
  check("建联后路人仍看不到真名", cViewConnected.data.data.order.creator.real_name === null, cViewConnected.data.data.order.creator);

  /* ================================================================
   * 8. 建联超时回池 / missed / alerts / 取消与联系不上
   * ================================================================ */
  section("8. 建联超时回池 / missed / 管理员提醒 / 取消与释放");

  async function makeClaimedOrder(creatorToken, claimerToken, category) {
    const r = await post(M.orderCreate, "/api/liuyin/orders/create", { category: category || "取快递", pickup: "驿站" }, { token: creatorToken });
    const o = orderOf(r);
    await act("claim", { id: o.id }, { token: claimerToken });
    return o;
  }

  const o2 = await makeClaimedOrder(tokenA, tokenB);
  await dbRun("UPDATE ly_orders SET conn_deadline = ? WHERE id = ?", isoAgo(1), o2.id);
  const syncAfterTimeout = await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  check("sync 触发惰性超时回池", isOk(syncAfterTimeout), syncAfterTimeout.data);
  const o2Row = await dbFirst("SELECT * FROM ly_orders WHERE id = ?", o2.id);
  check("超时后 status=released", o2Row.status === "released", o2Row.status);
  check("超时后 claimer 清空", o2Row.claimer_id === null, o2Row.claimer_id);
  check("超时 released_reason=timeout", o2Row.released_reason === "timeout", o2Row.released_reason);
  check("超时后确认记录清空", (await dbFirst("SELECT COUNT(*) AS n FROM ly_confirmations WHERE order_id = ?", o2.id)).n === 0, null);
  check("超时写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", o2.id)).n >= 1, null);
  check("超时给接单方 missed +1", Number((await dbFirst("SELECT missed FROM ly_users WHERE id = ?", userB.id)).missed) === 1, null);

  const o2b = await makeClaimedOrder(tokenA, tokenB);
  await dbRun("UPDATE ly_orders SET conn_deadline = ? WHERE id = ?", isoAgo(1), o2b.id);
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  check("第二次超时 missed=2", Number((await dbFirst("SELECT missed FROM ly_users WHERE id = ?", userB.id)).missed) === 2, null);
  const o2c = await makeClaimedOrder(tokenA, tokenB);
  await dbRun("UPDATE ly_orders SET conn_deadline = ? WHERE id = ?", isoAgo(1), o2c.id);
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  const alertRow = await dbFirst("SELECT * FROM ly_alerts WHERE user_id = ? ORDER BY id DESC LIMIT 1", userB.id);
  check("连续 3 次未响应写 ly_alert", !!alertRow && alertRow.type === "missed_connections", alertRow);
  check("写提醒后 missed 清零", Number((await dbFirst("SELECT missed FROM ly_users WHERE id = ?", userB.id)).missed) === 0, null);
  check("提醒标题带邻居昵称", alertRow && String(alertRow.title).indexOf("小柳(2)") > -1, alertRow && alertRow.title);

  /* released 回池后可再被接 */
  const o2Row2 = await dbFirst("SELECT * FROM ly_orders WHERE id = ?", o2.id);
  check("released 单仍在待接池（非 own 视角）", (await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenC })).data.data.orders.some((o) => o.id === o2.id), null);
  const reclaim = await act("claim", { id: o2.id }, { token: tokenC });
  check("released 单可以重新被接 → claimed", isOk(reclaim) && orderOf(reclaim).status === "claimed", reclaim.data);
  check("released_reason 被清空", orderOf(reclaim).released_reason === null, orderOf(reclaim).released_reason);

  /* 联系不上（release） */
  const o3 = await makeClaimedOrder(tokenA, tokenB);
  const releaseEarly = await act("release", { id: o3.id }, { token: tokenB });
  check("未到 10 分钟窗口 release → 409", releaseEarly.status === 409 && /窗口/.test(releaseEarly.data.error), releaseEarly.data);
  await dbRun("UPDATE ly_orders SET conn_deadline = ? WHERE id = ?", isoAgo(1), o3.id);
  await dbRun("UPDATE ly_users SET missed = 0 WHERE id = ?", userA.id);
  const releaseOk = await act("release", { id: o3.id }, { token: tokenB });
  check("到窗口后 release → 200 回池", isOk(releaseOk) && orderOf(releaseOk).status === "released", releaseOk.data);
  check("release 把责任记给对方（发单方 missed+1）", Number((await dbFirst("SELECT missed FROM ly_users WHERE id = ?", userA.id)).missed) === 1, null);
  check("release 写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", o3.id)).n >= 1, null);
  const releaseAgain = await act("release", { id: o3.id }, { token: tokenB });
  check("released 再 release → 409（或已非当事人 403）", [403, 409].indexOf(releaseAgain.status) > -1, releaseAgain.data);

  /* 取消：pending 撤回 → cancelled */
  const oCancel = orderOf(await post(M.orderCreate, "/api/liuyin/orders/create", { category: "带饭" }, { token: tokenA }));
  const cancelPending = await act("cancel", { id: oCancel.id }, { token: tokenA });
  check("pending 撤回 → cancelled", isOk(cancelPending) && orderOf(cancelPending).status === "cancelled", cancelPending.data);
  check("撤回写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", oCancel.id)).n >= 1, null);
  const cancelAgain = await act("cancel", { id: oCancel.id }, { token: tokenA });
  check("重复撤回 → 409", cancelAgain.status === 409, cancelAgain.data);
  const claimCancelled = await act("claim", { id: oCancel.id }, { token: tokenC });
  check("取消后不能再接 → 409", claimCancelled.status === 409, claimCancelled.data);

  /* 取消：claimed 任一方取消 → released 回池 */
  const oCancel2 = await makeClaimedOrder(tokenA, tokenB);
  const cancelClaimed = await act("cancel", { id: oCancel2.id }, { token: tokenB });
  check("claimed 时接单方取消 → released 回池", isOk(cancelClaimed) && orderOf(cancelClaimed).status === "released" && orderOf(cancelClaimed).released_reason === "cancel", cancelClaimed.data);

  /* 取消：connected 后只有发单方能取消，且不回池 */
  const oConnected = await makeClaimedOrder(tokenA, tokenB);
  await act("confirm", { id: oConnected.id }, { token: tokenA });
  const connOrder = orderOf(await act("confirm", { id: oConnected.id }, { token: tokenB }));
  check("准备一张 connected 单", connOrder.status === "connected", connOrder.status);
  const cancelConnByHelper = await act("cancel", { id: oConnected.id }, { token: tokenB });
  check("connected 后接单方取消 → 403", cancelConnByHelper.status === 403, cancelConnByHelper.data);
  const cancelConn = await act("cancel", { id: oConnected.id }, { token: tokenA });
  check("connected 后发单方取消 → cancelled 不回池", isOk(cancelConn) && orderOf(cancelConn).status === "cancelled", cancelConn.data);
  check("connected 取消写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", oConnected.id)).n >= 1, null);

  /* ================================================================
   * 9. 步骤引擎：顺序 / owner / 取件码 / 自动送达
   * ================================================================ */
  section("9. 步骤顺序、权限、取件码与自动送达");
  const o4 = await makeClaimedOrder(tokenA, tokenB, "取快递");
  await act("confirm", { id: o4.id }, { token: tokenA });
  const o4Connected = orderOf(await act("confirm", { id: o4.id }, { token: tokenB }));
  check("准备一张 connected 取快递单（4 步）", o4Connected.status === "connected" && o4Connected.steps.length === 4, o4Connected.status);

  const stepByGuest = await act("step", { id: o4.id, step_id: "s1", text: "A1234" }, { token: tokenC });
  check("非当事人推进步骤 → 403", stepByGuest.status === 403, stepByGuest.data);
  const stepWrongOwner = await act("step", { id: o4.id, step_id: "s1", text: "A1234" }, { token: tokenB });
  check("接单方做发单方的步骤 → 403", stepWrongOwner.status === 403 && /不是你来完成/.test(stepWrongOwner.data.error), stepWrongOwner.data);
  const stepJump = await act("step", { id: o4.id, step_id: "s2" }, { token: tokenB });
  check("跳过前置步骤 → 409", stepJump.status === 409 && /前面/.test(stepJump.data.error), stepJump.data);
  const stepNoText = await act("step", { id: o4.id, step_id: "s1" }, { token: tokenA });
  check("provide_code 不填文本 → 400", stepNoText.status === 400 && /取件码/.test(stepNoText.data.error), stepNoText.data);
  const stepUnknown = await act("step", { id: o4.id, step_id: "s99" }, { token: tokenA });
  check("不存在的步骤 → 404", stepUnknown.status === 404, stepUnknown.data);
  const stepS1 = await act("step", { id: o4.id, step_id: "s1", text: "A1234" }, { token: tokenA });
  const afterS1 = orderOf(stepS1);
  check("发单方填取件码 → s1 done", isOk(stepS1) && afterS1.steps[0].status === "done", stepS1.data);
  check("取件码写入 order.code", afterS1.code === "A1234", afterS1.code);
  check("取件码写入步骤 text_value", afterS1.steps[0].text_value === "A1234", afterS1.steps[0]);
  check("current_step 前进到 1", afterS1.current_step === 1, afterS1.current_step);
  check("填码后仍 connected（未送达）", afterS1.status === "connected", afterS1.status);
  const stepS1Again = await act("step", { id: o4.id, step_id: "s1", text: "A1234" }, { token: tokenA });
  check("重复完成同一步幂等 200", isOk(stepS1Again) && stepS1Again.status === 200, stepS1Again.data);

  /* 填码后：路人仍看不到 code / text_value */
  const guestAfterCode = (await get(M.orderGet, "/api/liuyin/orders/get?id=" + o4.id, { token: tokenC })).data.data.order;
  check("路人看 connected 单 code 仍为空", guestAfterCode.code === "", guestAfterCode.code);
  check("路人看 provide_code 步骤 text_value 仍为空", guestAfterCode.steps[0].text_value === "", guestAfterCode.steps[0]);
  const helperAfterCode = (await get(M.orderGet, "/api/liuyin/orders/get?id=" + o4.id, { token: tokenB })).data.data.order;
  check("接单方能看 code", helperAfterCode.code === "A1234", helperAfterCode.code);

  const stepS2 = await act("step", { id: o4.id, step_id: "s2" }, { token: tokenB });
  check("接单方完成「取到」→ current=2 仍 connected", isOk(stepS2) && orderOf(stepS2).current_step === 2 && orderOf(stepS2).status === "connected", stepS2.data);
  const stepS3 = await act("step", { id: o4.id, step_id: "s3" }, { token: tokenB });
  const afterS3 = orderOf(stepS3);
  check("接单方完成「交付」→ helper 步骤全完成，自动 delivered", afterS3.status === "delivered", afterS3.status);
  check("自动送达记录 delivered_at", typeof afterS3.delivered_at === "string", afterS3.delivered_at);
  check("自动送达写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", o4.id)).n >= 1, null);
  const stepConfirm = await act("step", { id: o4.id, step_id: "s4" }, { token: tokenA });
  check("delivered 后点 confirm 步骤 → 409", stepConfirm.status === 409, stepConfirm.data);
  const stepAfterDelivered = await act("step", { id: o4.id, step_id: "s2" }, { token: tokenB });
  check("delivered 后推进步骤 → 409", stepAfterDelivered.status === 409, stepAfterDelivered.data);

  /* 送达接口：无步骤异常单 */
  const oDeliver = await makeClaimedOrder(tokenA, tokenB, "倒垃圾");
  await act("confirm", { id: oDeliver.id }, { token: tokenA });
  await act("confirm", { id: oDeliver.id }, { token: tokenB });
  const deliverByCreator = await act("deliver", { id: oDeliver.id }, { token: tokenA });
  check("发单方调送达 → 403", deliverByCreator.status === 403, deliverByCreator.data);
  const deliverBeforeSteps = await act("deliver", { id: oDeliver.id }, { token: tokenB });
  check("有未完成步骤时送达 → 409", deliverBeforeSteps.status === 409 && /步骤/.test(deliverBeforeSteps.data.error), deliverBeforeSteps.data);
  await dbRun(
    "UPDATE ly_orders SET steps = ? WHERE id = ?",
    JSON.stringify(JSON.parse((await dbFirst("SELECT steps FROM ly_orders WHERE id=?", oDeliver.id)).steps).map((s) => Object.assign({}, s, s.type === "confirm" ? {} : { status: "done", completed_at: Date.now() }))),
    oDeliver.id
  );
  const deliverOk = await act("deliver", { id: oDeliver.id }, { token: tokenB });
  check("步骤完成后走 /deliver 也能 delivered", isOk(deliverOk) && orderOf(deliverOk).status === "delivered", deliverOk.data);

  /* ================================================================
   * 10. 确认收货 / 人情账 / 幂等 / 24h 自动完成
   * ================================================================ */
  section("10. 确认收货、人情账与 24h 自动完成");
  const completeByHelper = await act("complete", { id: o4.id }, { token: tokenB });
  check("接单方点确认收货 → 403（仅发单方）", completeByHelper.status === 403, completeByHelper.data);
  const meABefore = (await get(M.me, "/api/liuyin/me", { token: tokenA })).data.data;
  check("完成前 A 的 owed=0", meABefore.user.owed === 0, meABefore.user);
  const completeOk = await act("complete", { id: o4.id }, { token: tokenA });
  check("发单方确认收货 → done", isOk(completeOk) && orderOf(completeOk).status === "done", completeOk.data);
  check("complete 返回 reward {points:2, positive:false}",
    completeOk.data.data.reward && completeOk.data.data.reward.points === 2 && completeOk.data.data.reward.positive === false,
    completeOk.data.data.reward
  );
  check("complete 返回 ledger（from=A to=B delta=2）",
    completeOk.data.data.ledger && completeOk.data.data.ledger.from_id === userA.id &&
    completeOk.data.data.ledger.to_id === userB.id && completeOk.data.data.ledger.delta === 2,
    completeOk.data.data.ledger
  );
  check("ledger 表有且只有 1 条", (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger WHERE order_id = ?", o4.id)).n === 1, null);
  const doneAt = await dbFirst("SELECT done_at FROM ly_orders WHERE id = ?", o4.id);
  check("done 记录 done_at", !!doneAt.done_at, doneAt);
  check("confirm 步骤被标完成", JSON.parse((await dbFirst("SELECT steps FROM ly_orders WHERE id=?", o4.id)).steps).find((s) => s.type === "confirm").status === "done", null);
  check("完成写系统消息", (await dbFirst("SELECT COUNT(*) AS n FROM ly_messages WHERE order_id = ? AND from_id='system'", o4.id)).n >= 1, null);

  const completeAgain = await act("complete", { id: o4.id }, { token: tokenA });
  check("重复 complete → 409", completeAgain.status === 409, completeAgain.data);
  check("重复 complete 后 ledger 仍 1 条", (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger WHERE order_id = ?", o4.id)).n === 1, null);

  const meBAfter = (await get(M.me, "/api/liuyin/me", { token: tokenB })).data.data;
  check("B（帮忙方）points +2", meBAfter.user.points === 2, meBAfter.user);
  check("B helped=1 / received=0", meBAfter.user.helped === 1 && meBAfter.user.received === 0, meBAfter.user);
  check("B 的 ledger 最近一条 direction=in / delta=2", meBAfter.ledger[0] && meBAfter.ledger[0].direction === "in" && meBAfter.ledger[0].delta === 2, meBAfter.ledger);
  check("B 的 ledger 里 who 指向发单方小柳", meBAfter.ledger[0] && meBAfter.ledger[0].who.name === "小柳", meBAfter.ledger[0] && meBAfter.ledger[0].who);
  const meAAfter = (await get(M.me, "/api/liuyin/me", { token: tokenA })).data.data;
  check("A（发单方）owed +2", meAAfter.user.owed === 2, meAAfter.user);
  check("A received=1 / helped=0", meAAfter.user.received === 1 && meAAfter.user.helped === 0, meAAfter.user);
  check("A 的 ledger 最近一条 direction=out / delta=2", meAAfter.ledger[0] && meAAfter.ledger[0].direction === "out" && meAAfter.ledger[0].delta === 2, meAAfter.ledger);

  const completePending = await act("complete", { id: pendingOrderFood.id }, { token: tokenA });
  check("pending 直接 complete → 409", completePending.status === 409, completePending.data);

  /* 24h 自动完成 */
  const oAuto = await makeClaimedOrder(tokenA, tokenB, "带饭");
  await act("confirm", { id: oAuto.id }, { token: tokenA });
  await act("confirm", { id: oAuto.id }, { token: tokenB });
  const autoSteps = JSON.parse((await dbFirst("SELECT steps FROM ly_orders WHERE id=?", oAuto.id)).steps);
  let autoJson = autoSteps;
  for (const s of autoJson) {
    if (s.type === "confirm") continue;
    s.status = "done";
    s.completed_at = Date.now();
    if (s.type === "provide_code") s.text_value = "B0001";
  }
  await dbRun("UPDATE ly_orders SET steps = ?, code = 'B0001', status='delivered', delivered_at = ?, updated_at = ? WHERE id = ?",
    JSON.stringify(autoJson), isoAgo(25 * 60), isoAgo(25 * 60), oAuto.id);
  const syncAuto = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(isoAgo(30)), { token: tokenA });
  const autoRow = await dbFirst("SELECT * FROM ly_orders WHERE id = ?", oAuto.id);
  check("delivered 超 24h → sync 惰性 done", autoRow.status === "done", autoRow.status);
  check("自动完成写 ledger", (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger WHERE order_id = ?", oAuto.id)).n === 1, null);
  check("自动完成记 done_at", !!autoRow.done_at, autoRow.done_at);
  check("自动完成通知 type=auto_done", isOk(syncAuto) && syncAuto.data.data.notifications.some((n) => n.type === "auto_done" && n.order_id === oAuto.id), syncAuto.data.data.notifications);
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  check("自动完成不重复记账", (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger WHERE order_id = ?", oAuto.id)).n === 1, null);

  /* ================================================================
   * 11. 顺路卡
   * ================================================================ */
  section("11. 顺路卡（一张 active / 候场 / 撤回 / 2 小时过期）");
  const routes0 = await get(M.routes, "/api/liuyin/routes", { token: tokenC });
  check("routes 200 且带 active/waiting/mine/my_active 字段",
    isOk(routes0) && Array.isArray(routes0.data.data.active) && Array.isArray(routes0.data.data.waiting) &&
    Array.isArray(routes0.data.data.mine) && routes0.data.data.my_active === null,
    routes0.data.data
  );
  const routeCreate = await post(M.routeCreate, "/api/liuyin/routes/create", {
    time_label: "18:00–18:30", from_place: "驿站", capacity: 2,
  }, { token: tokenC });
  const card1 = routeCreate.data.data.card;
  check("挂顺路卡 200", isOk(routeCreate), routeCreate.data);
  check("卡 status=active，to_place=6 号楼，capacity=2", card1.status === "active" && card1.to_place === "6 号楼" && card1.capacity === 2, card1);
  check("active_until ≈ 2 小时后", Math.abs(Date.parse(card1.active_until) - Date.now() - 2 * 3600 * 1000) < 120000, card1.active_until);
  check("卡带 user 信息且 is_mine=true", card1.user && card1.user.id === userC.id && card1.is_mine === true, card1.user);

  const routes1 = await get(M.routes, "/api/liuyin/routes", { token: tokenC });
  check("楼里 active 列表包含这张卡", routes1.data.data.active.some((c) => c.id === card1.id), routes1.data.data.active);
  check("my_active 指向自己的卡", routes1.data.data.my_active && routes1.data.data.my_active.id === card1.id, routes1.data.data.my_active);

  const routeCreate2 = await post(M.routeCreate, "/api/liuyin/routes/create", {
    time_label: "12:00–12:30", from_place: "食堂", capacity: 1,
  }, { token: tokenC });
  const card2 = routeCreate2.data.data.card;
  const routes2 = await get(M.routes, "/api/liuyin/routes", { token: tokenC });
  check("新建第二张卡 → 旧卡降级 waiting", routes2.data.data.waiting.some((c) => c.id === card1.id), routes2.data.data.waiting);
  check("同一时刻只有一张 active（本人）", routes2.data.data.mine.filter((c) => c.status === "active").length === 1, routes2.data.data.mine.map((c) => c.status));
  check("my_active 变成新卡", routes2.data.data.my_active.id === card2.id, routes2.data.data.my_active);

  const withdrawOther = await post(M.routeWithdraw, "/api/liuyin/routes/withdraw", { id: card2.id }, { token: tokenB });
  check("撤别人的卡 → 403", withdrawOther.status === 403, withdrawOther.data);
  const withdrawMissing = await post(M.routeWithdraw, "/api/liuyin/routes/withdraw", { id: "r_nope" }, { token: tokenC });
  check("撤不存在的卡 → 404", withdrawMissing.status === 404, withdrawMissing.data);
  const withdrawOk = await post(M.routeWithdraw, "/api/liuyin/routes/withdraw", { id: card1.id }, { token: tokenC });
  check("撤回候场卡 → withdrawn", isOk(withdrawOk), withdrawOk.data);
  check("候场列表里不再有它", !(await get(M.routes, "/api/liuyin/routes", { token: tokenC })).data.data.waiting.some((c) => c.id === card1.id), null);
  const withdrawActive = await post(M.routeWithdraw, "/api/liuyin/routes/withdraw", { id: card2.id }, { token: tokenC });
  check("撤回 active 卡成功", isOk(withdrawActive), withdrawActive.data);

  const routeBadCap = await post(M.routeCreate, "/api/liuyin/routes/create", { capacity: 6 }, { token: tokenC });
  check("能带 6 件 → 400", routeBadCap.status === 400, routeBadCap.data);
  const routeBadTime = await post(M.routeCreate, "/api/liuyin/routes/create", { time_label: "时".repeat(21) }, { token: tokenC });
  check("时间段 21 字 → 400", routeBadTime.status === 400, routeBadTime.data);
  const routeNoAuth = await post(M.routeCreate, "/api/liuyin/routes/create", {});
  check("未登录挂卡 → 401", routeNoAuth.status === 401, routeNoAuth.data);

  const cardExpire = (await post(M.routeCreate, "/api/liuyin/routes/create", { capacity: 2 }, { token: tokenC })).data.data.card;
  await dbRun("UPDATE ly_route_cards SET active_until = ? WHERE id = ?", isoAgo(1), cardExpire.id);
  const routesExpired = await get(M.routes, "/api/liuyin/routes", { token: tokenC });
  check("active 过期后不再出现在 active 列表", !routesExpired.data.data.active.some((c) => c.id === cardExpire.id), routesExpired.data.data.active);
  check("过期卡状态写成 expired", (await dbFirst("SELECT status FROM ly_route_cards WHERE id = ?", cardExpire.id)).status === "expired", null);

  /* ================================================================
   * 12. 订单内消息
   * ================================================================ */
  section("12. 订单内临时会话");
  const oMsg = await makeClaimedOrder(tokenA, tokenB, "带饭");
  const sendA = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: oMsg.id, body: "我到了，放门口就行" }, { token: tokenA });
  check("当事人发消息 200", isOk(sendA) && sendA.data.data.message.body.indexOf("门口") > -1, sendA.data);
  const msgId = sendA.data.data.message.id;
  const msgsB = await get(M.messages, "/api/liuyin/messages?order_id=" + oMsg.id, { token: tokenB });
  check("对方能收到消息", isOk(msgsB) && msgsB.data.data.messages.length === 1, msgsB.data.data);
  check("消息带 from_id / from_name / created_at",
    msgsB.data.data.messages[0].from_id === userA.id && typeof msgsB.data.data.messages[0].from_name === "string" &&
    !!msgsB.data.data.messages[0].created_at,
    msgsB.data.data.messages[0]
  );
  const msgsSince = await get(M.messages, "/api/liuyin/messages?order_id=" + oMsg.id + "&since=" + msgId, { token: tokenB });
  check("since 过滤后为空", msgsSince.data.data.messages.length === 0, msgsSince.data.data.messages);
  const sendGuest = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: oMsg.id, body: "插话" }, { token: tokenC });
  check("非当事人发消息 → 403", sendGuest.status === 403, sendGuest.data);
  const readGuest = await get(M.messages, "/api/liuyin/messages?order_id=" + oMsg.id, { token: tokenC });
  check("非当事人看对话 → 403", readGuest.status === 403, readGuest.data);
  const sendEmpty = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: oMsg.id, body: "" }, { token: tokenA });
  check("空消息 → 400", sendEmpty.status === 400, sendEmpty.data);
  const sendLong = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: oMsg.id, body: "字".repeat(101) }, { token: tokenA });
  check("消息超 100 字 → 400", sendLong.status === 400, sendLong.data);
  const sendPending = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: pendingOrderFood.id, body: "在吗" }, { token: tokenA });
  check("pending 单不能发消息 → 409", sendPending.status === 409, sendPending.data);
  const sendClosed = await post(M.messageSend, "/api/liuyin/messages/send", { order_id: o4.id, body: "还在吗" }, { token: tokenA });
  check("done 单会话已关闭 → 409", sendClosed.status === 409, sendClosed.data);
  const sysRead = await get(M.messages, "/api/liuyin/messages?order_id=" + o4.id, { token: tokenA });
  check("系统消息 from_name=系统 / system=true",
    sysRead.data.data.messages.some((m) => m.system === true && m.from_name === "系统"),
    sysRead.data.data.messages
  );

  /* ================================================================
   * 13. sync 轮询
   * ================================================================ */
  section("13. /sync 轮询返回结构");
  const syncResult = await get(M.sync, "/api/liuyin/sync?floor=3", { token: tokenA });
  const syncData = syncResult.data.data;
  check("sync 200", isOk(syncResult), syncResult.data);
  check("sync 带全部契约字段",
    !!syncData.me && !!syncData.building && Array.isArray(syncData.floor_users) &&
    Array.isArray(syncData.open_orders) && Array.isArray(syncData.my_orders) &&
    Array.isArray(syncData.active_routes) && Array.isArray(syncData.waiting_routes) &&
    Array.isArray(syncData.notifications) && Array.isArray(syncData.ledger) && !!syncData.guide,
    Object.keys(syncData || {})
  );
  const meFreshForSync = (await get(M.me, "/api/liuyin/me", { token: tokenA })).data.data;
  check("sync.me 带 points/owed/helped/received/floor/avatar",
    syncData.me.points === meFreshForSync.user.points && syncData.me.owed === meFreshForSync.user.owed &&
    typeof syncData.me.helped === "number" && typeof syncData.me.received === "number" &&
    typeof syncData.me.floor === "number" && typeof syncData.me.avatar === "string",
    syncData.me
  );
  check("sync.building 带 name/lit/target/code/floor",
    syncData.building.name === "6 号楼" && syncData.building.lit === 18 && syncData.building.target === 30 &&
    syncData.building.code === "7241" && syncData.building.floor === 3,
    syncData.building
  );
  check("sync.open_orders 不含自己的单", syncData.open_orders.every((o) => o.creator_id !== userA.id), syncData.open_orders.map((o) => o.creator_id));
  check("sync.my_orders 含自己的完成单", syncData.my_orders.some((o) => o.id === o4.id), syncData.my_orders.map((o) => o.id));
  check("sync 不传 since → notifications 为空", (await get(M.sync, "/api/liuyin/sync", { token: tokenA })).data.data.notifications.length === 0, null);

  const sinceClaim = isoAgo(0);
  const oNotify = orderOf(await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递" }, { token: tokenA }));
  await new Promise((r) => setTimeout(r, 20));
  await act("claim", { id: oNotify.id }, { token: tokenB });
  const syncNotify = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(sinceClaim), { token: tokenA });
  check("接单后 sync 通知 type=claimed", syncNotify.data.data.notifications.some((n) => n.type === "claimed" && n.order_id === oNotify.id), syncNotify.data.data.notifications);
  await post(M.messageSend, "/api/liuyin/messages/send", { order_id: oNotify.id, body: "我五分钟到" }, { token: tokenB });
  const syncMsgNotify = await get(M.sync, "/api/liuyin/sync?since=" + encodeURIComponent(sinceClaim), { token: tokenA });
  check("新消息出现在 sync 通知里", syncMsgNotify.data.data.notifications.some((n) => n.type === "message" && n.order_id === oNotify.id), syncMsgNotify.data.data.notifications);
  check("sync 未登录 → 401", (await get(M.sync, "/api/liuyin/sync")).status === 401, null);
  check("sync 带 ledger 最近 10 条", syncData.ledger.length <= 10, syncData.ledger.length);
  check("sync 带 guide.first_visit 布尔", typeof syncData.guide.first_visit === "boolean", syncData.guide);

  /* ================================================================
   * 14. 管理接口
   * ================================================================ */
  section("14. 管理接口（鉴权 / 统计 / 订单 / 用户 / 提醒 / 机器人 / seed / 清空）");
  const adminBad = await post(M.adminLogin, "/api/liuyin/admin/login", { password: "wrong-pass" });
  check("管理错密码 → 401", adminBad.status === 401 && /密码/.test(adminBad.data.error), adminBad.data);
  const adminEmpty = await post(M.adminLogin, "/api/liuyin/admin/login", { password: "" });
  check("管理空密码 → 400", adminEmpty.status === 400, adminEmpty.data);

  const statsNoAuth = await get(M.adminStats, "/api/liuyin/admin/stats");
  check("stats 未带管理 token → 401", statsNoAuth.status === 401, statsNoAuth.data);
  const statsForged = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: "123.deadbeef" });
  check("stats 伪造管理 token → 401", statsForged.status === 401, statsForged.data);

  const stats = await get(M.adminStats, "/api/liuyin/admin/stats", { admin: adminToken });
  check("stats 200", isOk(stats), stats.data);
  check("stats 返回 pending_alerts/active_orders/blocked_users/total_users",
    typeof stats.data.data.pending_alerts === "number" && typeof stats.data.data.active_orders === "number" &&
    typeof stats.data.data.blocked_users === "number" && typeof stats.data.data.total_users === "number",
    stats.data.data
  );
  check("stats.orders_by_status 覆盖 7 种状态", Object.keys(stats.data.data.orders_by_status).length === 7, stats.data.data.orders_by_status);
  check("stats.floors 覆盖 6 层", stats.data.data.floors.length === 6, stats.data.data.floors);
  check("stats.recent 是数组且有数据", Array.isArray(stats.data.data.recent) && stats.data.data.recent.length > 0, stats.data.data.recent.length);

  const adminOrders = await get(M.adminOrders, "/api/liuyin/admin/orders?status=done", { admin: adminToken });
  check("admin/orders?status=done 200 且全是 done", isOk(adminOrders) && adminOrders.data.data.orders.every((o) => o.status === "done"), adminOrders.data.data);
  const adminOrdersBad = await get(M.adminOrders, "/api/liuyin/admin/orders?status=nope", { admin: adminToken });
  check("admin/orders 非法 status → 400", adminOrdersBad.status === 400, adminOrdersBad.data);
  const adminUsers = await get(M.adminUsers, "/api/liuyin/admin/users", { admin: adminToken });
  check("admin/users 200 且包含 A", isOk(adminUsers) && adminUsers.data.data.users.some((u) => u.id === userA.id), adminUsers.data.data.total);
  const adminUserA = adminUsers.data.data.users.find((u) => u.id === userA.id);
  check("admin/users 含 real_name / missed / points 字段",
    adminUserA.real_name === "柳小青" && typeof adminUserA.missed === "number" && typeof adminUserA.points === "number",
    adminUserA
  );

  const alertsList = await get(M.adminAlerts, "/api/liuyin/admin/alerts", { admin: adminToken });
  check("admin/alerts 200 且含未处理提醒", isOk(alertsList) && alertsList.data.data.alerts.some((a) => !a.handled), alertsList.data.data);
  const alertId = alertsList.data.data.alerts.find((a) => !a.handled).id;
  const resolved = await post(M.adminAlertResolve, "/api/liuyin/admin/alert/resolve", { id: alertId }, { admin: adminToken });
  check("处理提醒 → handled=true", isOk(resolved) && resolved.data.data.alert.handled === true, resolved.data);
  const resolveMissing = await post(M.adminAlertResolve, "/api/liuyin/admin/alert/resolve", { id: 999999 }, { admin: adminToken });
  check("处理不存在的提醒 → 404", resolveMissing.status === 404, resolveMissing.data);

  const banC = await post(M.adminUser, "/api/liuyin/admin/user", { id: userC.id, banned: true, reason: "测试封禁" }, { admin: adminToken });
  check("冻结用户 200", isOk(banC) && banC.data.data.user.banned === true, banC.data);
  const bannedMe = await get(M.me, "/api/liuyin/me", { token: tokenC });
  check("被冻结的 token → 401 中文提示", bannedMe.status === 401 && /封禁/.test(bannedMe.data.error), bannedMe.data);
  const unbanC = await post(M.adminUser, "/api/liuyin/admin/user", { id: userC.id, banned: false }, { admin: adminToken });
  check("解封 200", isOk(unbanC) && unbanC.data.data.user.banned === false, unbanC.data);
  check("解封后恢复访问", (await get(M.me, "/api/liuyin/me", { token: tokenC })).status === 200, null);
  const banMissing = await post(M.adminUser, "/api/liuyin/admin/user", { id: "u_nope", banned: true }, { admin: adminToken });
  check("冻结不存在的人 → 404", banMissing.status === 404, banMissing.data);
  const banCompat = await post(M.adminBan, "/api/liuyin/admin/ban", { user_id: userC.id, reason: "兼容接口" }, { admin: adminToken });
  check("旧 /admin/ban 兼容可用", isOk(banCompat), banCompat.data);
  await post(M.adminUnban, "/api/liuyin/admin/unban", { user_id: userC.id }, { admin: adminToken });

  const oTmp = orderOf(await post(M.orderCreate, "/api/liuyin/orders/create", { category: "取快递" }, { token: tokenA }));
  const delOrder = await post(M.adminOrderDelete, "/api/liuyin/admin/order/delete", { id: oTmp.id }, { admin: adminToken });
  check("删单 200 deleted=1", isOk(delOrder) && delOrder.data.data.deleted === 1, delOrder.data);
  check("删掉的单查不到 → 404", (await get(M.orderGet, "/api/liuyin/orders/get?id=" + oTmp.id, { token: tokenA })).status === 404, null);
  const delOrderAgain = await post(M.adminOrderDelete, "/api/liuyin/admin/order/delete", { id: oTmp.id }, { admin: adminToken });
  check("重复删单 → 404", delOrderAgain.status === 404, delOrderAgain.data);
  const delOrderCompat = await post(M.adminDeleteOrder, "/api/liuyin/admin/delete-order", { id: o2.id }, { admin: adminToken });
  check("旧 /admin/delete-order 兼容可用", isOk(delOrderCompat), delOrderCompat.data);

  const noticePost = await post(M.adminNotice, "/api/liuyin/admin/notice", { text: "今晚 10 点停水", notice: "今晚 10 点停水" }, { admin: adminToken });
  check("公告保存（兼容 text/notice）", isOk(noticePost) && noticePost.data.data.notice === "今晚 10 点停水", noticePost.data);
  const noticeGet = await get(M.adminNotice, "/api/liuyin/admin/notice", { admin: adminToken });
  check("GET 公告能读回", noticeGet.data.data.notice === "今晚 10 点停水", noticeGet.data);

  const robotGet = await get(M.adminRobot, "/api/liuyin/admin/robot", { admin: adminToken });
  check("admin/robot GET 返回 config/log/neighbors", isOk(robotGet) && !!robotGet.data.data.config && Array.isArray(robotGet.data.data.log), robotGet.data.data);
  const robotPatch = await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { interval_sec: 7, chat_chance: 55 } }, { admin: adminToken });
  check("admin/robot POST 改配置生效", isOk(robotPatch) && robotPatch.data.data.config.interval_sec === 7 && robotPatch.data.data.config.chat_chance === 55, robotPatch.data.data.config);
  const robotBadPatch = await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { interval_sec: 1 } }, { admin: adminToken });
  check("机器人间隔 1 秒 → 400", robotBadPatch.status === 400, robotBadPatch.data);
  const robotEmptyPatch = await post(M.adminRobot, "/api/liuyin/admin/robot", { config: {} }, { admin: adminToken });
  check("机器人空配置 → 400", robotEmptyPatch.status === 400, robotEmptyPatch.data);

  const seed1 = await post(M.adminSeed, "/api/liuyin/admin/seed", {}, { admin: adminToken });
  check("seed 铺演示楼栋 200", isOk(seed1), seed1.data);
  check("seed 后有 6 个机器人邻居", seed1.data.data.neighbors === 6 && seed1.data.data.users >= 6, seed1.data.data);
  check("seed 后有 3 条待接单", seed1.data.data.open_orders >= 3, seed1.data.data);
  check("seed 后有 1 张 active 顺路卡", seed1.data.data.active_routes >= 1, seed1.data.data);
  check("seed 设置点灯 18/30 + 口令 7241",
    seed1.data.data.building.lit === 18 && seed1.data.data.building.target === 30 && seed1.data.data.building.code === "7241",
    seed1.data.data.building
  );
  const seed2 = await post(M.adminSeed, "/api/liuyin/admin/seed", {}, { admin: adminToken });
  check("seed 幂等（再点一次数量不涨）",
    seed2.data.data.orders === seed1.data.data.orders && seed2.data.data.users === seed1.data.data.users,
    { before: seed1.data.data, after: seed2.data.data }
  );

  /* 机器人日志 / 清空日志 */
  const robotLogGet = await get(M.adminRobotLog, "/api/liuyin/admin/robot/log", { admin: adminToken });
  check("admin/robot/log GET 200", isOk(robotLogGet) && Array.isArray(robotLogGet.data.data.log), robotLogGet.data.data);
  const robotLogClear = await post(M.adminRobotLog, "/api/liuyin/admin/robot/log", { clear: true }, { admin: adminToken });
  check("admin/robot/log POST clear → 清空", isOk(robotLogClear) && robotLogClear.data.data.log.length === 0, robotLogClear.data.data);

  /* 6 种状态测试场景 */
  const scene = await post(M.adminRobotSeed, "/api/liuyin/admin/robot/seed", { user_id: userE.id }, { admin: adminToken });
  check("机器人测试场景生成 6 张单", isOk(scene) && scene.data.data.orders.length === 6, scene.data);
  const sceneStatuses = [];
  for (const id of scene.data.data.orders) {
    const r = await get(M.orderGet, "/api/liuyin/orders/get?id=" + id, { token: tokenE });
    sceneStatuses.push(r.status === 200 ? r.data.data.order.status : "MISSING");
  }
  check("6 种状态分别是 pending/claimed/connected/delivered/done/released",
    JSON.stringify(sceneStatuses) === JSON.stringify(["pending", "claimed", "connected", "delivered", "done", "released"]),
    sceneStatuses
  );
  check("released 场景单会出现在别人待接池",
    (await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenC })).data.data.orders.some((o) => o.id === "o_scene_released"),
    null
  );
  const scene2 = await post(M.adminRobotSeed, "/api/liuyin/admin/robot/seed", { user_id: userE.id }, { admin: adminToken });
  check("测试场景可重复生成（幂等前缀清理）", isOk(scene2) && scene2.data.data.orders.length === 6, scene2.data);

  /* 清空 */
  const clearOrders = await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });
  check("清空订单 → deleted > 0", isOk(clearOrders) && clearOrders.data.data.deleted > 0, clearOrders.data.data);
  check("清空后订单数 0", (await dbFirst("SELECT COUNT(*) AS n FROM ly_orders")).n === 0, null);
  check("清空订单后用户还在", (await dbFirst("SELECT COUNT(*) AS n FROM ly_users")).n > 0, null);
  check("清空订单连带清 ledger", (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger")).n === 0, null);
  const clearBad = await post(M.adminClear, "/api/liuyin/admin/clear", { what: "everything" }, { admin: adminToken });
  check("非法 what → 400", clearBad.status === 400, clearBad.data);

  /* ================================================================
   * 15. 分级限流
   * ================================================================ */
  section("15. 分级限流（轮询 300 / 写 60 / 其它读 120）");
  M.lib.resetRateLimit();
  const pollReq = makeRequest("GET", "/api/liuyin/sync");
  const readReq = makeRequest("GET", "/api/liuyin/floors");
  const writeReq = makeRequest("POST", "/api/liuyin/logout");
  check("sync 走 300 轮询通道", M.lib.rateBucketFor(pollReq, new URL("https://x/api/liuyin/sync")).max === 300, null);
  check("orders/get 走 300 轮询通道", M.lib.rateBucketFor(new Request("https://x/api/liuyin/orders/get"), new URL("https://x/api/liuyin/orders/get")).max === 300, null);
  check("messages 走 300 轮询通道", M.lib.rateBucketFor(new Request("https://x/api/liuyin/messages"), new URL("https://x/api/liuyin/messages")).max === 300, null);
  check("普通读走 120 通道", M.lib.rateBucketFor(readReq, new URL("https://x/api/liuyin/floors")).max === 120, null);
  check("写操作走 60 通道", M.lib.rateBucketFor(writeReq, new URL("https://x/api/liuyin/logout")).max === 60, null);

  const rateIp = "203.0.113.7";
  let readAllOk = true;
  for (let i = 0; i < 120; i++) {
    const r = await get(M.floors, "/api/liuyin/floors", { ip: rateIp });
    if (r.status !== 200) readAllOk = false;
  }
  check("同一 IP 前 120 次读都放行", readAllOk, "有请求被拦截");
  const read121 = await get(M.floors, "/api/liuyin/floors", { ip: rateIp });
  check("第 121 次读 → 429（文案「太快了，歇一会儿再试」）",
    read121.status === 429 && /太快了/.test(read121.data.error) && /歇一会儿再试/.test(read121.data.error),
    read121.data
  );
  check("换 IP 不受影响 → 200", (await get(M.floors, "/api/liuyin/floors", { ip: "203.0.113.8" })).status === 200, null);

  M.lib.resetRateLimit();
  const writeIp = "203.0.113.9";
  let writeAllOk = true;
  for (let i = 0; i < 60; i++) {
    const r = await post(M.logout, "/api/liuyin/logout", {}, { token: tokenA, ip: writeIp });
    if (r.status !== 200) writeAllOk = false;
  }
  check("同一 IP 前 60 次写都放行", writeAllOk, null);
  const write61 = await post(M.logout, "/api/liuyin/logout", {}, { token: tokenA, ip: writeIp });
  check("第 61 次写 → 429", write61.status === 429, write61.data);

  M.lib.resetRateLimit();
  const pollIp = "203.0.113.10";
  let pollAllOk = true;
  for (let i = 0; i < 300; i++) {
    const r = await get(M.sync, "/api/liuyin/sync", { token: tokenA, ip: pollIp });
    if (r.status === 429) pollAllOk = false;
  }
  check("同一 IP 前 300 次 sync 轮询不被 429（详情页轮询不被打挂）", pollAllOk, null);
  const poll301 = await get(M.sync, "/api/liuyin/sync", { token: tokenA, ip: pollIp });
  check("第 301 次 sync → 429", poll301.status === 429, poll301.data);

  /* ================================================================
   * 16. 照片上传 / 读取
   * ================================================================ */
  section("16. 照片上传与读取");
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
  M.lib.resetRateLimit();
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
  check("读回字节与上传一致", fileRes.buf.equals(Buffer.from(pngBytes())), fileRes.buf.length);
  check("不存在的图片 → 404", (await get(M.file, "/api/liuyin/file?key=u_nope%2Fo_deadbeef.png")).status === 404, null);
  check("非法 key → 400", (await get(M.file, "/api/liuyin/file?key=" + encodeURIComponent("../../etc/passwd"))).status === 400, null);

  /* ================================================================
   * 17. 机器人（单人闭环 / 反向闭环 / 场景 / 池子 / 日志）
   * ================================================================ */
  section("17. 机器人邻居（单人闭环 / 反向闭环 / 测试场景 / 日志）");
  M.lib.resetRateLimit();
  /* 清空订单（保留用户），确保机器人测试从干净状态开始 */
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "routes" }, { admin: adminToken });
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "robot" }, { admin: adminToken });
  await post(M.adminSeed, "/api/liuyin/admin/seed", {}, { admin: adminToken });
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });

  const robotOn = await post(M.adminRobot, "/api/liuyin/admin/robot", {
    config: {
      enabled: true, interval_sec: 2, max_actions: 1, auto_accept: true, auto_connect: true,
      auto_steps: true, auto_confirm: true, random_chat: false, chat_chance: 0, pool_min: 0,
    },
  }, { admin: adminToken });
  check("开启机器人并设置 pool_min=0（不干扰闭环）", isOk(robotOn) && robotOn.data.data.config.enabled === true, robotOn.data.data.config);
  check("机器人 pool_min / random_chat 配置生效",
    robotOn.data.data.config.pool_min === 0 && robotOn.data.data.config.random_chat === false,
    robotOn.data.data.config
  );

  const demoNeighbors = (await get(M.adminRobot, "/api/liuyin/admin/robot", { admin: adminToken })).data.data.neighbors;
  check("机器人邻居 6 人（小周/阿禾/林一/小满/阿梧/叶子）",
    demoNeighbors.length === 6 && ["小周", "阿禾", "林一", "小满", "阿梧", "叶子"].every((n) => demoNeighbors.some((d) => d.name === n)),
    demoNeighbors
  );
  const floorListWithDemo = await get(M.floor, "/api/liuyin/floor?floor=3", { token: tokenA });
  check("机器人邻居出现在本层名单（标记 is_demo）",
    floorListWithDemo.data.data.users.some((u) => u.is_demo === true),
    floorListWithDemo.data.data.users.map((u) => [u.name, u.is_demo])
  );
  check("机器人不进在线数（online=false）",
    floorListWithDemo.data.data.users.filter((u) => u.is_demo).every((u) => u.online === false),
    null
  );

  /* ---- 单人闭环：真人发单 → 机器人接 → 双方确认 → 真人填码 → 机器人推进 → 送达 → 真人确认收货 ---- */
  await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { enabled: false } }, { admin: adminToken });
  const loopOrder = orderOf(await post(M.orderCreate, "/api/liuyin/orders/create", {
    category: "取快递", size: "中件", pickup: "菜鸟驿站", time_label: "18:10 前", points: 2,
  }, { token: tokenA }));
  check("机器人关闭时发单保持 pending", loopOrder.status === "pending", loopOrder.status);
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  check("机器人关闭时 sync 不会改动订单", (await dbFirst("SELECT status FROM ly_orders WHERE id=?", loopOrder.id)).status === "pending", null);

  await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { enabled: true } }, { admin: adminToken });
  const run1 = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
  check("机器人连跑 1 个动作（接真人单）", isOk(run1) && run1.data.data.count === 1, run1.data.data);
  const loopClaimed = await get(M.orderGet, "/api/liuyin/orders/get?id=" + loopOrder.id, { token: tokenA });
  check("机器人接单 → claimed", loopClaimed.data.data.order.status === "claimed", loopClaimed.data.data.order.status);
  check("接单人是机器人（is_demo=true）", loopClaimed.data.data.order.claimer && loopClaimed.data.data.order.claimer.is_demo === true, loopClaimed.data.data.order.claimer);
  const robotClaimerId = loopClaimed.data.data.order.claimer.id;
  const loopMsgs = await get(M.messages, "/api/liuyin/messages?order_id=" + loopOrder.id, { token: tokenA });
  check("机器人接单后发了一句招呼", loopMsgs.data.data.messages.some((m) => m.from_id === robotClaimerId), loopMsgs.data.data.messages);
  check("机器人动作写日志", (await get(M.adminRobotLog, "/api/liuyin/admin/robot/log", { admin: adminToken })).data.data.log.length >= 1, null);

  await act("confirm", { id: loopOrder.id }, { token: tokenA });
  const run2 = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
  check("真人确认后机器人补确认（1 个动作）", isOk(run2), run2.data.data);
  const loopConnected = await get(M.orderGet, "/api/liuyin/orders/get?id=" + loopOrder.id, { token: tokenA });
  check("双确认后 connected", loopConnected.data.data.order.status === "connected", loopConnected.data.data.order.status);
  check("confirm.mine/other 都 true", loopConnected.data.data.confirm.mine === true && loopConnected.data.data.confirm.other === true, loopConnected.data.data.confirm);

  /* 取快递单第一步「提供取件码」是发单方的活，真人自己填 */
  const stepCode = await act("step", { id: loopOrder.id, step_id: "s1", text: "A9999" }, { token: tokenA });
  const afterHumanCode = orderOf(stepCode);
  check("真人填写取件码 → s1 done / code 落库",
    isOk(stepCode) && afterHumanCode.code === "A9999" && afterHumanCode.steps[0].status === "done",
    stepCode.data
  );
  const wrongStepByRequester = await act("step", { id: loopOrder.id, step_id: "s2" }, { token: tokenA });
  check("发单方做接单方的步骤 → 403", wrongStepByRequester.status === 403, wrongStepByRequester.data);

  /* 机器人是接单方（helper），连跑 2 个动作完成「取到」+「交付」→ 自动送达 */
  const run3 = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 2 }, { admin: adminToken });
  check("机器人连跑 2 个动作推进到送达", isOk(run3) && run3.data.data.count >= 1, run3.data.data);
  const loopDelivered = await get(M.orderGet, "/api/liuyin/orders/get?id=" + loopOrder.id, { token: tokenA });
  check("helper 步骤全部完成 → 自动 delivered", loopDelivered.data.data.order.status === "delivered", loopDelivered.data.data.order.status);
  check("送达后 delivered_at 有值", typeof loopDelivered.data.data.order.delivered_at === "string", loopDelivered.data.data.order.delivered_at);

  const completeLoop = await act("complete", { id: loopOrder.id }, { token: tokenA });
  check("真人确认收货 → done", isOk(completeLoop) && orderOf(completeLoop).status === "done", completeLoop.data);
  check("单人闭环记一笔人情账（A → 机器人 +2）",
    (await dbFirst("SELECT COUNT(*) AS n FROM ly_ledger WHERE order_id = ?", loopOrder.id)).n === 1,
    null
  );
  const robotAfterLoop = (await get(M.adminUsers, "/api/liuyin/admin/users", { admin: adminToken })).data.data.users.find((u) => u.id === robotClaimerId);
  check("机器人帮忙后 points 增加", robotAfterLoop && robotAfterLoop.points >= 2, robotAfterLoop && robotAfterLoop.points);
  const meLoop = (await get(M.me, "/api/liuyin/me", { token: tokenA })).data.data;
  check("真人 owed 增加（欠人情）", meLoop.user.owed >= 2, meLoop.user);

  /* ---- 反向闭环：机器人发单 → 真人接 → 机器人确认/填码 → 真人履约 → 机器人确认收货 ---- */
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });
  await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { pool_min: 1 } }, { admin: adminToken });
  const runPool = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
  check("池子不满时机器人发一条新委托", isOk(runPool) && runPool.data.data.count === 1, runPool.data.data);
  const poolOrders = (await get(M.orders, "/api/liuyin/orders?scope=open", { token: tokenA })).data.data.orders;
  const robotOrder = poolOrders.find((o) => o.creator && o.creator.is_demo === true);
  check("待接池出现机器人发的单（creator.is_demo）", !!robotOrder, poolOrders.map((o) => o.creator && o.creator.is_demo));
  check("机器人发的单在待接池脱敏（code 空、昵称可见）", robotOrder && robotOrder.code === "" && robotOrder.creator.real_name === null, robotOrder && robotOrder.creator);

  const claimRobot = await act("claim", { id: robotOrder.id }, { token: tokenA });
  check("真人接机器人的单 → claimed", isOk(claimRobot) && orderOf(claimRobot).status === "claimed", claimRobot.data);
  await act("confirm", { id: robotOrder.id }, { token: tokenA });
  const runReverseConfirm = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
  check("机器人发单方补确认 → connected", isOk(runReverseConfirm) &&
    (await dbFirst("SELECT status FROM ly_orders WHERE id=?", robotOrder.id)).status === "connected", runReverseConfirm.data.data);
  /* 机器人发单方还有自己负责的步骤（取快递模板是 provide_code）就自动做掉 */
  let reverseDetail = (await get(M.orderGet, "/api/liuyin/orders/get?id=" + robotOrder.id, { token: tokenA })).data.data.order;
  const robotOwnStep = reverseDetail.steps.find(
    (s) => s.status !== "done" && s.owner === "requester" && s.type !== "confirm"
  );
  if (robotOwnStep) {
    const runReverseCode = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
    reverseDetail = (await get(M.orderGet, "/api/liuyin/orders/get?id=" + robotOrder.id, { token: tokenA })).data.data.order;
    check("机器人（发单方）自动完成自己负责的步骤",
      isOk(runReverseCode) && reverseDetail.steps.find((s) => s.id === robotOwnStep.id).status === "done",
      runReverseCode.data.data
    );
    if (robotOwnStep.type === "provide_code") {
      check("机器人（发单方）自动提供取件码", reverseDetail.code !== "", reverseDetail.code);
    }
  } else {
    check("机器人发单方的步骤已由真人先完成（本模板无 requester 步骤）", true, null);
  }
  const helperSteps = reverseDetail.steps.filter((s) => s.owner === "helper" && s.status !== "done");
  for (const s of helperSteps) {
    await act("step", { id: robotOrder.id, step_id: s.id }, { token: tokenA });
  }
  const reverseAfterSteps = (await get(M.orderGet, "/api/liuyin/orders/get?id=" + robotOrder.id, { token: tokenA })).data.data.order;
  check("真人完成 helper 步骤 → 自动 delivered", reverseAfterSteps.status === "delivered", reverseAfterSteps.status);
  const runReverseFinish = await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 1 }, { admin: adminToken });
  check("机器人发单方确认收货 → done", isOk(runReverseFinish) &&
    (await dbFirst("SELECT status FROM ly_orders WHERE id=?", robotOrder.id)).status === "done", runReverseFinish.data.data);
  const reverseLedger = await dbFirst("SELECT * FROM ly_ledger WHERE order_id = ?", robotOrder.id);
  check("反向闭环 ledger：from=机器人 to=真人",
    !!reverseLedger && reverseLedger.from_id === robotOrder.creator_id && reverseLedger.to_id === userA.id,
    reverseLedger
  );
  const meReverse = (await get(M.me, "/api/liuyin/me", { token: tokenA })).data.data;
  check("反向闭环真人 points 增加", meReverse.user.points >= 1, meReverse.user);

  /* 池底维持：pool_min=2，连跑几次后待接池不少于 2 */
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "orders" }, { admin: adminToken });
  await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { pool_min: 2 } }, { admin: adminToken });
  await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 4 }, { admin: adminToken });
  const poolCount = (await dbFirst("SELECT COUNT(*) AS n FROM ly_orders WHERE status IN ('pending','released')")).n;
  check("池底维持：连跑后待接池 ≥ pool_min", poolCount >= 2, poolCount);

  /* 机器人日志上限 30 */
  await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 25 }, { admin: adminToken });
  const logAfter = await get(M.adminRobotLog, "/api/liuyin/admin/robot/log", { admin: adminToken });
  check("机器人日志最多保留 30 条", logAfter.data.data.log.length <= 30, logAfter.data.data.log.length);

  /* 顺路卡维持：清空顺路卡后机器人会挂一张 */
  await post(M.adminClear, "/api/liuyin/admin/clear", { what: "routes" }, { admin: adminToken });
  await post(M.adminRobotRun, "/api/liuyin/admin/robot/run", { n: 3 }, { admin: adminToken });
  check("机器人维持至少一张 active 顺路卡",
    (await dbFirst("SELECT COUNT(*) AS n FROM ly_route_cards WHERE status='active'")).n >= 1, null
  );

  /* 关闭机器人后 /sync 不再产生动作 */
  await post(M.adminRobot, "/api/liuyin/admin/robot", { config: { enabled: false } }, { admin: adminToken });
  const beforeDisabled = (await dbFirst("SELECT COUNT(*) AS n FROM ly_robot_log")).n;
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  await get(M.sync, "/api/liuyin/sync", { token: tokenA });
  check("关闭机器人后 sync 不产生机器人日志", (await dbFirst("SELECT COUNT(*) AS n FROM ly_robot_log")).n === beforeDisabled, null);

  /* ================================================================
   * 18. CORS / 中间件 / 错误形状
   * ================================================================ */
  section("18. CORS / OPTIONS / 统一错误形状");
  const optRes = await M.middleware.onRequest({
    request: makeRequest("OPTIONS", "/api/liuyin/orders"), env, params: {},
    next: async () => new Response("next", { status: 200 }),
  });
  check("OPTIONS 预检 → 204", optRes.status === 204, optRes.status);
  check("OPTIONS 带 Allow-Origin *", optRes.headers.get("access-control-allow-origin") === "*", optRes.headers.get("access-control-allow-origin"));
  check("OPTIONS 带 Allow-Headers x-ly-token/x-ly-admin", (optRes.headers.get("access-control-allow-headers") || "").indexOf("x-ly-token") > -1, optRes.headers.get("access-control-allow-headers"));
  const corsGet = await get(M.floors, "/api/liuyin/floors");
  check("普通响应也带 Allow-Origin *", corsGet.headers.get("access-control-allow-origin") === "*", corsGet.headers.get("access-control-allow-origin"));
  check("错误响应形状 {ok:false,error}", meNoAuth.data && meNoAuth.data.ok === false && typeof meNoAuth.data.error === "string", meNoAuth.data);
  const notFoundGet = await get(M.orderGet, "/api/liuyin/orders/get?id=o_nope", { token: tokenA });
  check("查不存在的订单 → 404 中文", notFoundGet.status === 404 && /不存在/.test(notFoundGet.data.error), notFoundGet.data);
  const logout = await post(M.logout, "/api/liuyin/logout", {}, { token: tokenA });
  check("logout → ok", isOk(logout), logout.data);
  check("logout 后 last_seen 清空（本层名单显示离线）",
    (await dbFirst("SELECT last_seen FROM ly_users WHERE id = ?", userA.id)).last_seen === null, null
  );

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
  if (pass < 250) {
    console.log("断言数不足 250（当前 " + pass + "），请补充覆盖。");
    process.exit(1);
  }
  console.log("全部通过 ✅（" + pass + " 条断言）");
}

# 柳荫册后端 · 自测记录

> 位置：`functions/api/liuyin/_selftest.md`
> 脚本：`functions/api/liuyin/_selftest.mjs`
> 执行：在仓库根目录 `node functions/api/liuyin/_selftest.mjs`
> 结论：**133 条断言全部通过（0 失败）**，单次运行约 0.2–0.3 秒。

## 一、怎么测的（没有部署权限）

- Cloudflare Pages 的 `env.DB` 用 **Node 24 自带 `node:sqlite`（真实 SQLite）** 做了 D1 兼容 mock：
  `prepare(sql).bind(...)` → `first()/run()/all()`，`exec()` 支持多语句；`run()` 返回 `meta.changes`。
- `env.FILES` 用 `Map` 做了 R2 mock（`put/get` + `httpMetadata`）。
- `env.ADMIN_PASSWORD` / `env.SESSION_SECRET` 用测试值。
- 被测模块是**真实源码**：脚本把 `functions/api/liuyin/` 复制到临时目录、`.js → .mjs`（仓库无 `package.json`，Node 默认按 CJS 解析），再直接调 `onRequestGet/onRequestPost({ request, env, params })`。
- 为了不影响线上打包，`_selftest.mjs` 里**没有静态 `node:` import**，只在 Node 下用变量拼接动态加载；即使 Pages 把它当路由也不会执行 Node 逻辑。

最近一次运行结果：

```
■ I. CORS / OPTIONS / 限流
  ✓ OPTIONS 预检 → 204
  ✓ 同一 IP 前 60 次都放行
  ✓ 第 61 次 → 429 中文错误
  ✓ 换 IP 不受影响 → 200
  ✓ logout → ok

========================================================
通过 133 条 / 失败 0 条，用时 220ms
全部通过 ✅
```

## 二、必测五项（逐条）

| # | 要求 | 结果 | 证据（断言） |
|---|---|---|---|
| 1 | 登录两次同名 → 第二个变 `(2)` | ✅ | `同层同名 → 小柳(2)`；再登一次 `小柳(3)`；输入 `小柳(2)` 会归属到重名族 → `小柳(4)`；`" 小 柳 "`（带空格）归一化后同样算重名 |
| 2 | 发单→列表→接单→双确认→取件→送达→完成→ledger 有且只有 1 条 | ✅ | `scope=open 能看到新单` → `B 接单 → claimed` → `第 1 次确认 confirmed=1 仍 claimed` → `第 2 次确认 confirmed=2 且进 confirmed` → `pick → picked` → `deliver → delivered` → `complete → done` → `ledger 有且只有 1 条`；方向 `from=发单方 to=接单方 delta=1` |
| 3 | 非法跃迁返回 409 | ✅ | `pending 直接 complete → 409`、`pending 直接 confirm → 409`、`claimed 直接 pick → 409`、`claimed 直接 deliver → 409`、`重复 complete → 409`、`取消后再接 → 409`、`重复 cancel → 409`、`别人再抢同一单 → 409` |
| 4 | 未登录返回 401 | ✅ | `未登录 me → 401`、`未登录发单 → 401`、`未登录 sync → 401`、`未登录 scope=mine → 401`、`假 token → 401`、`未登录上传 → 401` |
| 5 | admin 错密码返回 401 | ✅ | `admin 错密码 → 401（密码不正确）`；`stats 未带管理 token → 401`；`stats 伪造管理 token → 401` |

## 三、接口覆盖清单

| 接口 | 文件 | 自测覆盖 |
|---|---|---|
| `POST /api/liuyin/login` | `login.js` | 新建、重名编号、归一化、带 token 复用、空名字/楼层/超长 400 |
| `GET /api/liuyin/me` | `me.js` | user/points/owed/owedTo/building、未登录 401、公告可读 |
| `POST /api/liuyin/logout` | `logout.js` | 200（并清 last_seen） |
| `GET /api/liuyin/floor` | `floor.js` | 本层名单、排除自己、online 字段 |
| `GET /api/liuyin/floors` | `floors.js` | 1–6 层都有返回 |
| `GET /api/liuyin/sync` | `sync.js` | me / floor_users / open_orders / my_orders / notifications（claimed、done、message）；不传 since 时通知为空 |
| `POST /api/liuyin/orders/create`（及 `POST /orders`） | `orders/index.js`、`orders/create.js` | 委托单/顺路卡、kind/capacity/start_at 校验、code 必填 |
| `GET /api/liuyin/orders?scope=open\|mine\|floor\|done` | `orders/index.js` | open/mine/done 已验证；floor 走同一查询构造 |
| `POST …/orders/claim\|confirm\|pick\|deliver\|complete\|cancel\|return` | `orders/[action].js` | 全链路 + 权限 403 + 幂等 + 409 + 未知 action 404 + 缺 id 400 |
| `GET /api/liuyin/orders/get` | `orders/get.js` | 详情 + messages；非当事人看不到对话 |
| `POST /api/liuyin/messages/send` | `messages/send.js` | 当事人可发、非当事人 403、空消息 400、已取消 409 |
| `GET /api/liuyin/messages` | `messages/index.js` | 收发、`since` 过滤 |
| `POST /api/liuyin/upload` | `upload.js` | png/jpg/webp（按文件头）、>2MB 400、非图片 400、未登录 401 |
| `GET /api/liuyin/file` | `file.js` | `Content-Type`、`Cache-Control: private, max-age=600`、字节一致、404、非法 key 400 |
| `POST /api/liuyin/admin/login` | `admin/login.js` | 错误 401、空密码 400、正确发 HMAC token |
| `GET /api/liuyin/admin/stats` | `admin/stats.js` | users/online/orders_by_status/floors(6 层)/ledger_count/recent；鉴权 401 |
| `POST /api/liuyin/admin/seed` | `admin/seed.js` | 3 邻居 + 2 历史完成单（人情点）+ 2 待接单；**重复点幂等** |
| `POST /api/liuyin/admin/clear` | `admin/clear.js` | orders / all 生效、非法 what 400 |
| `POST /api/liuyin/admin/delete-order` | `admin/delete-order.js` | 删单后从 open 列表消失 |
| `POST /api/liuyin/admin/ban` / `unban` | `admin/ban.js`、`admin/unban.js` | 封禁后该 token 一律 401，解封恢复 |
| `POST /api/liuyin/admin/notice` | `admin/notice.js` | 写入后 `me` 能读到 |
| `OPTIONS /api/liuyin/*` | `_middleware.js` | 204 + `Access-Control-Allow-Origin: *` + 允许 `x-ly-token` |
| 限流 | `_lib.js` | 同 IP 第 61 次/分钟 → 429「太快了，歇一会儿再来」 |
| 老库迁移 | `_migrate.js` | 预置一张**没有 `last_seen`** 的 `ly_users`，首次请求自动 `ALTER TABLE` 并成功登录 |

## 四、关键实现与决策

1. **状态机**：`pending → claimed → confirmed → picked → delivered → done`；异常 `cancelled`。
   每次跃迁都用 `UPDATE ly_orders SET status=? … WHERE id=? AND status IN (前置状态)` 做**原子守卫**，看 `meta.changes` 判断是否真的改动；抢单/重复完成等冲突一律 409。
2. **幂等**：
   - 双确认：`ly_confirmations(order_id,user_id)` 主键 + `INSERT OR IGNORE`，同人重复点仍返回 `confirmed:1/2`；
   - 人情点：`ly_ledger.order_id UNIQUE` + `INSERT OR IGNORE`，一单只有一笔（已测「重复 complete 后 ledger 仍是 1 条」）；
   - seed：全部 `INSERT OR IGNORE`，重复点不重复写（已测）。
3. **`return` 语义**：契约里「claimed 超时回池」+ 状态 `returned`（已回池）两者结合，实现为**回到 `pending` 且清空 `claimer_id` / 确认记录**（这样单子真的重新出现在 open 列表里），响应额外带 `{ returned: true }`。若前端需要展示「曾回池」，请看 `notifications` 里不会产生该历史（见限制 3）。
4. **`last_seen`**：`_migrate.js` 模块内按 `env.DB` 缓存，首次请求 `CREATE TABLE IF NOT EXISTS`（兜底）+ `ALTER TABLE ly_users ADD COLUMN last_seen TEXT`（老库）；并发撞车忽略 duplicate column。**不需要人工跑 SQL**。在线判定 = 最近 60 秒内 `last_seen`；写入做了 20 秒节流，避免 2 秒轮询把 D1 写爆。
5. **限流**：内存 `Map`（每 IP 每分钟 60 次），**没有新增 D1 表**。Pages 是多实例的，所以这是「每 isolate 上限」，最坏按实例数放大；按需求「加表要先问」，故采用无表方案。
6. **通知不建表**：`sync` 的 `notifications` 由「我相关订单的 `COALESCE(updated_at, created_at) > since`」+「我订单里别人发的、`created_at > since` 的消息」推导。前端 2 秒轮询能逐一看到每个状态；错过中间态的客户端只会看到最终态。
7. **权限**：接单不能接自己的（403）；只有接单方能 pick/deliver；双方都能 confirm/cancel/return；complete 发单方与接单方都可（发单方通常负责确认收货）。ledger 方向固定 `from=发单方 to=接单方`。
8. **照片**：按**文件头签名**判定 jpg/png/webp（不信 MIME），≤2MB，存 `ly/<key>`，key 形如 `u_xxx/o_xxxxxxxx.jpg`；`file` 接口白名单校验 key 并禁止 `..`。契约回退方案中的 KV 不涉及。
9. **CORS**：所有响应带 `Access-Control-Allow-Origin: *`（弱账户用请求头 token，不用 Cookie，`*` 安全）；`OPTIONS` 由 `functions/api/liuyin/_middleware.js` 返回 204。
10. **返回体**：统一 `{ ok, data }`；`login` / `admin/login` 额外把 `token` 也放在顶层，兼容老前端直接读 `r.token`。
11. **`seed` 演示账号**：`seed-token-xiaoliu`（小柳 3 层）、`seed-token-xiaozhou`（小周 4 层）、`seed-token-amay`（阿 May 2 层）；页面也能直接显式登录同名（会自动编号）。

## 五、没做到 / 已知限制

1. **没做真实部署验证**（无权限）：以上全部是本地内存 SQLite + mock R2 跑通，真实 D1/R2/Pages 行为（如 D1 `exec` 多语句、R2 流式响应）未在线上冒烟。部署后建议按下面第六节跑一遍。
2. **限流只在 isolate 内存**：多实例会放大上限；要严格全局限流必须加 `ly_rate` 表（需先经你同意，目前未加）。
3. **通知是状态推导而非事件流水**：不记录 claimed→done 的历史轨迹；若前端轮询间隔 > 一次完整状态变化，会漏掉中间态通知（最终态仍在）。
4. **`return` 不产生 `returned` 终态**（见决策 3）：状态直接回 `pending`；契约里 `returned` 目前只作为字符串常量保留。
5. **未做订单列表分页**：各列表固定 `LIMIT 50`（messages 200），demo 量级够用。
6. **`scope=floor` 未过滤 `cancelled`**：按契约「本层相关」返回全部状态，前端如需可自行过滤。
7. **`orders/get` 对非当事人仍返回订单本体**（看不到对话）：弱账户演示的取舍，介意可收紧为仅当事人。
8. 照片接口 GET 是公开读（key 不可猜），未做签名 URL。

## 六、部署后线上冒烟（建议由主控执行）

```bash
# 1) 管理登录拿 token（ADMIN_PASSWORD 走 Pages 环境变量）
curl -s -X POST https://www.ginyva.site/api/liuyin/admin/login \
  -H 'content-type: application/json' -d '{"password":"<ADMIN_PASSWORD>"}'

# 2) 写演示数据（幂等，可重复点）
curl -s -X POST https://www.ginyva.site/api/liuyin/admin/seed -H 'x-ly-admin: <token>'

# 3) 登录 + 看本层名单
curl -s -X POST https://www.ginyva.site/api/liuyin/login \
  -H 'content-type: application/json' -d '{"name":"小柳","floor":3}'
curl -s 'https://www.ginyva.site/api/liuyin/floor?floor=3'

# 4) 轮询
curl -s https://www.ginyva.site/api/liuyin/sync -H 'x-ly-token: <token>'

# 5) 管理统计
curl -s https://www.ginyva.site/api/liuyin/admin/stats -H 'x-ly-admin: <token>'
```

线上重点核对 3 件事：`last_seen` 列是否自动补上（登录后 `floor` 返回 `online`）、`seed` 后 `orders?scope=open` 有 2 条、`upload` 一张真实照片后 `file?key=` 能读回。

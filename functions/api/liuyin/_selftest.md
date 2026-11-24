# 柳荫册后端 · 自测记录

> 位置：`functions/api/liuyin/_selftest.md`
> 脚本：`functions/api/liuyin/_selftest.mjs`
> 执行：在仓库根目录 `node functions/api/liuyin/_selftest.mjs`
> 结论：**374 条断言全部通过（0 失败）**，单次运行约 1–2 秒（含 300 次轮询限流测试）。

## 一、怎么测的（没有部署权限）

- Cloudflare Pages 的 `env.DB` 用 **Node 24 自带 `node:sqlite`（真实 SQLite）** 做了 D1 兼容 mock：
  `prepare(sql).bind(...)` → `first()/run()/all()`，`exec()` 支持多语句；`run()` 返回 `meta.changes`。
- `env.FILES` 用 `Map` 做了 R2 mock（`put/get` + `httpMetadata`）。
- `env.ADMIN_PASSWORD` / `env.SESSION_SECRET` 用测试值。
- 被测模块是**真实源码**：脚本把 `functions/api/liuyin/` 复制到临时目录、`.js → .mjs`（仓库无 `package.json`，Node 默认按 CJS 解析），再直接调 `onRequestGet/onRequestPost({ request, env, params })`。
- 为了不影响线上打包，`_selftest.mjs` 里**没有静态 `node:` import**，只在 Node 下用变量拼接动态加载；线上把它当路由会返回 404、不执行 Node 逻辑（`process.release.name === "node"` 双重守卫）。

最近一次运行结果：

```
■ 17. 机器人邻居（单人闭环 / 反向闭环 / 测试场景 / 日志）
  ✓ 机器人接真人单 → claimed
  ✓ 真人确认后机器人补确认
  ✓ 双确认后 connected
  ✓ 真人填写取件码 → s1 done / code 落库
  ✓ 机器人连跑 2 个动作推进到送达
  ✓ helper 步骤全部完成 → 自动 delivered
  ✓ 真人确认收货 → done
  ✓ 单人闭环记一笔人情账（A → 机器人 +2）

========================================================
通过 374 条 / 失败 0 条，用时 1128ms
全部通过 ✅（374 条断言）
```

## 二、覆盖章节（18 段）

| # | 章节 | 覆盖要点 |
|---|---|---|
| 0 | 老库自动迁移 | 缺列 ALTER、`confirmed/picked → connected`、`returned → released`、按品类补 steps / current_step、pres 表、schema_version、机器人默认配置、幂等 |
| 1 | 进楼与重名 | 弱账户、UUID token、同层同名 `小柳(2)`、归一化、带 token 复用、各类 400 |
| 2 | 个人档案 | 昵称/真名/显示开关/头像/楼层/门牌、重名编号、非法值 400 |
| 3 | 身份与名单 | me/floor/floors、points/owed/helped/received、在线判定、昵称脱敏 |
| 4 | 发单校验 | 5 个模板步骤、need_code、size、points/note/floor/pickup 校验、照片 key |
| 5 | 待接池脱敏 | 非双方 code 为空串、provide_code 文本为空、真名不露面、本人/当事人可见性 |
| 6 | 接单并发 | 条件 UPDATE、抢单 409、重复接幂等、404/400 |
| 7 | 双确认与延长 | 各确认一次 → connected、重复确认幂等、延长一次 +10 分钟、重复延长 409 |
| 8 | 超时回池 | 惰性释放、reason=timeout、系统消息、missed+1、连续 3 次写 ly_alerts、released 可再被接、联系不上 release（窗口校验）、取消/回池矩阵 |
| 9 | 步骤引擎 | owner 权限、顺序锁、provide_code 必填、code 落库、重复步骤幂等、helper 步骤全完成自动 delivered、/deliver 兜底 |
| 10 | 人情账 | 仅 creator 可确认收货、reward、ledger 方向与幂等、points/owed/helped/received、24h 自动完成 + auto_done 通知 |
| 11 | 顺路卡 | 一张 active、新卡降级旧卡、候场、撤回权限、2 小时过期 |
| 12 | 订单消息 | claimed 起可发、非当事人 403、since 过滤、pending/done 会话状态、系统消息 |
| 13 | /sync | 契约字段齐全、个人账、building、open 排除自己、notifications（claimed/message）、无 since 空通知 |
| 14 | 管理接口 | 登录/伪造 token、stats 四格、orders/users/alerts/resolve/user 冻结/删单/公告/robot 配置/seed/robot log/清空/6 种场景 |
| 15 | 分级限流 | sync/orders.get/messages=300、普通读=120、写=60，429 文案「太快了，歇一会儿再试」 |
| 16 | 照片 | png/jpg/webp 文件头识别、2MB、读回字节/Cache-Control、非法 key |
| 17 | 机器人 | 邻居种子、单人闭环、反向闭环（机器人发单→真人接）、池底维持、顺路卡维持、日志 30 条上限、关闭后不动单 |
| 18 | CORS / 错误 | OPTIONS 204、错误形状 `{ok:false,error}`、404、logout 清 last_seen |

## 三、关键实现与决策

1. **状态机**：`pending → claimed → connected → delivered → done`，异常 `cancelled` / `released`。
   每次跃迁都用 `UPDATE … WHERE id=? AND status=<前置状态>` 做**原子守卫**，看 `meta.changes` 判断是否真的改成功。
2. **回池语义**：`claimed` 时取消 / 联系不上 / 建联超时 → `released`（清 claimer、清确认、不扣点），
   `released` 与 `pending` 一样出现在待接池并可再次被接；`connected` 后取消 → `cancelled` 不回池。
3. **幂等**：
   - 双确认：`ly_confirmations(order_id,user_id)` 主键 + `INSERT OR IGNORE`；
   - 人情点：`ly_ledger.order_id UNIQUE` + `INSERT OR IGNORE`，一单只有一笔；
   - 步骤：用 steps 原文做乐观锁（`… AND steps = ?`），重复完成同一步返回 200 幂等。
4. **脱敏**：`orderJson(row, viewer)` 统一处理——
   `code` 与 `provide_code` 步骤文本只给双方；真名只在「本人」或「connected 及以后的双方」露出，路人/待接池只有昵称。
5. **机器人**：`_robot.js` 的 `maybeRun(env)` 在 `/sync` 与 `/orders/*` 后调用，全局节流
   `robot_last_tick + interval_sec`，单轮动作数受 `max_actions` 限制；动作全部条件 UPDATE。
   动作优先级：接真人单 → 补双确认 → 推进步骤 → 确认收货 → 维持池底 → 随机消息 → 顺路卡
   （池底维护放在在途单之后，避免 demo 单人闭环被"补货"抢占）。
6. **限流**：`/sync`、`/orders/get`、`/messages` 允许 300 次/分/IP；写接口 60 次/分/IP；其它读 120 次/分/IP。
   429 文案固定「太快了，歇一会儿再试」——详情页 2s 轮询不会再被打挂。
7. **老库迁移**：`_migrate.js` 任意 API 入口惰性执行，按 `ly_settings.schema_version` 判定；
   `CREATE TABLE IF NOT EXISTS` + 容错 `ALTER TABLE ADD COLUMN`（重复列错误吞掉）+ 老状态映射；
   **不需要人工跑 SQL**。同时创建 `ly_pres_cmd` / `ly_pres_state`（路演提词台不 500）。
8. **D1 exec 坑**：D1 的 `exec()` 以换行分隔语句，多行 `CREATE TABLE` 会被拆坏；
   `_migrate.js` 先把 DDL 压成一行再 `exec`。

## 四、本地真机验证（wrangler pages dev 8790）

```powershell
# 迁移 + 管理登录 + 铺演示楼栋
GET  /api/liuyin/floors             -> 200
POST /api/liuyin/admin/login        -> 200 (x-ly-admin)
POST /api/liuyin/admin/clear {all}  -> 200
POST /api/liuyin/admin/seed         -> 200  users=6 orders=5 open=3 routes=1 lit=18/30 code=7241

# 真人 + 机器人完整闭环
POST /api/liuyin/login              -> 200
POST /api/liuyin/profile            -> 200
POST /api/liuyin/orders/create      -> 200  （机器人随即接单：status=claimed）
POST /api/liuyin/orders/confirm     -> 200  confirmed=1
POST /api/liuyin/admin/robot/run {n:1} -> actions: 机器人也确认了，订单成立
GET  /api/liuyin/orders/get         -> status=connected
POST /api/liuyin/orders/step        -> 200  code=A1234
POST /api/liuyin/admin/robot/run {n:2} -> 取到 / 交付
GET  /api/liuyin/orders/get         -> status=delivered
POST /api/liuyin/orders/complete    -> 200  reward={points:2,positive:false}
GET  /api/liuyin/me                 -> owed=2, ledger[0].delta=2
GET  /api/liuyin/sync               -> 200  open=3 my=1 routes=1
GET  /api/liuyin/admin/robot/log    -> 200
GET  /api/liuyin/admin/stats        -> 200  users=7 orders=6 done=3 ledger=3
```

# 柳荫册 Web 版 · 接口契约（v1，历史）

> ⚠️ 2026-11-24 已升级为 v2（模板/步骤/双确认/顺路卡/机器人/管理台）。最新契约见 `dev/liuyin-parity/PARITY-PLAN.md` §3；小程序侧规格见 `dev/liuyin-parity/MINIPROGRAM-SPEC.md`；本文件仅作 v1 历史参考。


> 后端：Cloudflare Pages Functions（`functions/api/liuyin/`）
> 数据库：D1（表 `ly_*`，绑定名 `env.DB`）
> 存储：R2（绑定名 `env.FILES`，存照片）
> 前端：`liuyin/` 静态应用
> 所有接口返回 JSON：`{ ok: true, data: ... }` 或 `{ ok: false, error: "中文说明" }`
> 认证：请求头 `x-ly-token`（登录后拿到）；管理接口用 `x-ly-admin` + 密码

---

## 一、行为约定

- **楼栋固定「6 号楼」**，用户注册只选楼层（1–6）
- **一个浏览器一个身份**：token 存 localStorage，换人需清缓存
- **重名自动加编号**：同层同名 → `小柳(2)`（`name_key` 归一化后计数）
- **轮询 2 秒**：前端每 2s 调一次 `GET /api/liuyin/sync`
- **状态机**：`pending → claimed → confirmed → picked → delivered → done`，异常分支 `cancelled`、`returned`
- **双确认**：`claimed` 之后，双方各调一次 `confirm`，两边都确认才进 `confirmed`
- **人情点**：订单到 `done` 时写一条 `ly_ledger`（`order_id` 唯一，幂等）；**允许展示具体次数**
- **照片**：可选。上传走 `POST /api/liuyin/upload`（multipart），返回 R2 key；读取走 `GET /api/liuyin/file?key=`
- **封禁**：被 `ly_bans` 命中的 user 一律 401

---

## 二、接口清单

### 登录 / 身份
```
POST /api/liuyin/login
  body: { name: string(1-12字), floor: 1-6 }
  → { token, user: { id, name, floor, points } }
  说明：同名同层自动变 name(2)；已存在 token 则直接返回

GET  /api/liuyin/me        (需 token)
  → { user: { id, name, floor, points, owed, owedTo }, building: "6 号楼" }
  points = 我帮过别人几次；owed = 别人帮过我几次（都允许显示数字）

POST /api/liuyin/logout
  → { ok: true }（仅前端删 token，服务端不强制）
```

### 楼栋 / 名单
```
GET  /api/liuyin/floor?floor=3
  → { users: [{ id, name, floor, points, online }], building: "6 号楼" }
  说明：显示本层还有谁；online 由最近 60 秒有无请求判断

GET  /api/liuyin/floors
  → { floors: [{ floor: 1, count: 3 }, ...] }   // 每层多少人
```

### 订单（委托 + 顺路卡共用）
```
POST /api/liuyin/orders/create   (需 token)
  body: {
    kind: 'errand' | 'route',
    title: string(≤20),
    note: string(≤80),
    from_place: string(≤20),      // 驿站 / 食堂 / 教学楼
    to_floor: 1-6,
    code: string(≤12),            // 取件码，errand 必填
    start_at?: 'HH:mm',           // route 用
    end_at?: 'HH:mm',
    capacity?: 1-5,
    photo_key?: string
  }
  → { order }

GET  /api/liuyin/orders?scope=open|mine|floor|done&floor=3
  → { orders: [Order] }
  scope=open  待接的（pending，全楼）
  scope=floor 本层相关的（to_floor=该层 或 creator 在该层）
  scope=mine  我发的 + 我接的
  scope=done  已完成（用于人情点流水展示）

POST /api/liuyin/orders/claim      { id }   → { order }   pending→claimed，记录 claimer
POST /api/liuyin/orders/confirm    { id }   → { order, confirmed: 1|2 }
POST /api/liuyin/orders/pick       { id }   → { order }   confirmed→picked（需 code 校验由前端展示）
POST /api/liuyin/orders/deliver    { id, proof_key? } → { order }  picked→delivered
POST /api/liuyin/orders/complete   { id }   → { order, ledger }    delivered→done，写人情点
POST /api/liuyin/orders/cancel     { id }   → { order }   仅 pending/claimed 可取消
POST /api/liuyin/orders/return     { id }   → { order }   claimed 超时回池
GET  /api/liuyin/orders/get?id=   → { order, messages: [] }
```

### 消息（订单内）
```
POST /api/liuyin/messages/send  { order_id, body(≤100) } → { message }
GET  /api/liuyin/messages?order_id=&since=id → { messages: [] }
```

### 照片
```
POST /api/liuyin/upload   (multipart: file)
  → { key, url }        // key 形如 u_xxx/o_xxx.jpg，存 R2
GET  /api/liuyin/file?key=xxx
  → 图片二进制（Cache-Control: private, max-age=600）
```

### 轮询（前端每 2 秒一次，替代多个列表接口）
```
GET /api/liuyin/sync?since=<timestamp>&floor=3   (需 token)
  → {
      server_time,
      me: { points, owed },
      floor_users: [{ id, name, floor, online, points }],
      open_orders: [Order],
      my_orders: [Order],
      notifications: [{ type: 'claimed'|'confirmed'|'picked'|'delivered'|'done'|'message',
                        order_id, text, at }]
    }
```

### 管理（路径 /liuyin/admin）
```
POST /api/liuyin/admin/login  { password }  → { ok, token }   // 复用 env.ADMIN_PASSWORD
GET  /api/liuyin/admin/stats  (需 x-ly-admin)
  → { users, online, orders_by_status: {...}, floors: [...], ledger_count, recent: [] }
POST /api/liuyin/admin/clear  { what: 'orders'|'users'|'all' }  → { ok, deleted }
POST /api/liuyin/admin/delete-order { id }
POST /api/liuyin/admin/ban   { user_id, reason }
POST /api/liuyin/admin/unban { user_id }
POST /api/liuyin/admin/notice { text }   // 全站公告（存 ly_settings）
```

---

## 三、Order 对象

```json
{
  "id": "o_ab12",
  "kind": "errand",
  "title": "取快递",
  "note": "六个件，有点重",
  "from_place": "驿站",
  "to_floor": 3,
  "code": "A·1236",
  "status": "pending",
  "creator": { "id": "u_1", "name": "小柳", "floor": 3 },
  "claimer": null,
  "confirmed_count": 0,
  "photo_key": null,
  "proof_key": null,
  "created_at": "2026-11-23T08:00:00Z",
  "updated_at": null
}
```

---

## 四、前端页面（`liuyin/`）

| 文件 | 内容 |
|---|---|
| `index.html` | 入口：未登录显示「进楼」页（填名字 + 选楼层）；已登录进主界面 |
| `app.js` | 单页应用：路由（首页/发单/订单/详情/我的）、2s 轮询、状态渲染 |
| `app.css` | 沿用现有米白纸底 + 墨绿，手机上单列，桌面上居中 390×844 手机框 |
| `admin.html` | `/liuyin/admin` 后台：密码进入 → 统计 / 清空 / 删单 / 封人 |

页面清单（对应小程序 9 页，砍掉纯微信能力的）：
1. **进楼**（登录）
2. **首页**：本楼今日顺路（open_orders）+ 本层还有谁 + 发单入口
3. **发单**：选委托 / 挂顺路卡，两个表单
4. **订单列表**：我发的 / 我接的
5. **订单详情**：状态时间线 + 双确认按钮 + 取件码 + 送达（拍照）+ 完成
6. **我的**：名字 / 楼层 / 人情点（帮过几次、被帮几次）/ 退出

---

## 五、错误码约定

| HTTP | 含义 |
|---|---|
| 400 | 参数不合法（`error` 给中文原因） |
| 401 | 未登录 / token 失效 / 被封禁 |
| 403 | 无权限（不是你的单） |
| 404 | 对象不存在 |
| 409 | 状态冲突（如已被别人接走） |
| 429 | 太快了（同 IP 每分钟 > 60 次） |

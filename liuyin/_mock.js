/* 柳荫册 · 本地假接口
   只在地址带 ?mock=1 时生效，拦截 fetch 返回演示数据。
   数据存在 localStorage（键 ly_mock_db_v2），刷新后还在；
   ?mock=1&mock_reset=1 可以重置；?mock=1&mock_login=1 直接以小柳身份进楼。 */
(function () {
  'use strict';
  var search = location.search || '';
  if (!/[?&]mock=1(?:&|$)/.test(search)) return;

  window.__LY_MOCK__ = true;
  var DB_KEY = 'ly_mock_db_v2';
  var params = new URLSearchParams(search);
  var realFetch = window.fetch ? window.fetch.bind(window) : null;

  function now() { return Date.now(); }
  function iso(agoMs) { return new Date(Date.now() - (agoMs || 0)).toISOString(); }
  function rid(prefix) { return prefix + Math.random().toString(36).slice(2, 7); }

  if (params.get('mock_reset') === '1') {
    try { localStorage.removeItem(DB_KEY); } catch (e) {}
  }

  function seedDB() {
    var users = [
      { id: 'u_me', name: '小柳', floor: 3, points: 3, owed: 1, online: true, banned: false, last_seen: now() },
      { id: 'u_at', name: '阿棠', floor: 3, points: 5, owed: 0, online: true, banned: false, last_seen: now() - 20000 },
      { id: 'u_zhou', name: '老周', floor: 3, points: 2, owed: 4, online: false, banned: false, last_seen: now() - 7200000 },
      { id: 'u_man', name: '小满', floor: 4, points: 1, owed: 0, online: true, banned: false, last_seen: now() - 30000 },
      { id: 'u_liu', name: '刘姨', floor: 1, points: 7, owed: 2, online: false, banned: false, last_seen: now() - 86400000 },
      { id: 'u_chen', name: '陈叔', floor: 1, points: 4, owed: 3, online: false, banned: false, last_seen: now() - 86400000 },
      { id: 'u_he', name: '何姐', floor: 2, points: 3, owed: 1, online: true, banned: false, last_seen: now() - 40000 },
      { id: 'u_qi', name: '齐师傅', floor: 5, points: 6, owed: 0, online: false, banned: false, last_seen: now() - 86400000 },
      { id: 'u_bei', name: '小北', floor: 6, points: 1, owed: 5, online: false, banned: false, last_seen: now() - 86400000 }
    ];
    var orders = [
      { id: 'o_open1', kind: 'errand', title: '取快递', note: '六个件，有点重', from_place: '驿站', to_floor: 3, code: 'B\u00b72048', status: 'pending', creator_id: 'u_at', claimer_id: null, confirmed_count: 0, created_at: iso(12 * 60000), updated_at: iso(12 * 60000) },
      { id: 'o_open2', kind: 'route', title: '顺路带一份', note: '食堂二楼，顺手', from_place: '食堂', to_floor: 3, code: '', status: 'pending', creator_id: 'u_zhou', claimer_id: null, confirmed_count: 0, start_at: '18:10', end_at: '19:30', capacity: 2, created_at: iso(40 * 60000), updated_at: iso(40 * 60000) },
      { id: 'o_open3', kind: 'errand', title: '带瓶酱油', note: '顺路的话帮带一瓶', from_place: '食堂', to_floor: 2, code: 'C\u00b73301', status: 'pending', creator_id: 'u_man', claimer_id: null, confirmed_count: 0, created_at: iso(65 * 60000), updated_at: iso(65 * 60000) },
      { id: 'o_claimed', kind: 'errand', title: '取快递', note: '两件，不急', from_place: '驿站', to_floor: 3, code: 'A\u00b71236', status: 'claimed', creator_id: 'u_me', claimer_id: 'u_at', confirmed_count: 0, confirmed_by: [], created_at: iso(30 * 60000), updated_at: iso(10 * 60000) },
      { id: 'o_confirmed', kind: 'route', title: '顺路买菜', note: '菜市场带点青菜', from_place: '食堂', to_floor: 3, code: '', status: 'confirmed', creator_id: 'u_me', claimer_id: 'u_zhou', confirmed_count: 2, confirmed_by: ['u_me', 'u_zhou'], start_at: '17:30', end_at: '19:00', capacity: 3, created_at: iso(60 * 60000), updated_at: iso(20 * 60000) },
      { id: 'o_picked', kind: 'errand', title: '带饭', note: '一荤一素，谢谢', from_place: '食堂', to_floor: 3, code: 'D\u00b75521', status: 'picked', creator_id: 'u_at', claimer_id: 'u_me', confirmed_count: 2, confirmed_by: ['u_at', 'u_me'], created_at: iso(25 * 60000), updated_at: iso(8 * 60000) },
      { id: 'o_delivered', kind: 'errand', title: '取快递', note: '', from_place: '驿站', to_floor: 3, code: 'E\u00b77788', status: 'delivered', creator_id: 'u_me', claimer_id: 'u_at', confirmed_count: 2, confirmed_by: ['u_me', 'u_at'], created_at: iso(50 * 60000), updated_at: iso(5 * 60000) },
      { id: 'o_done', kind: 'errand', title: '取快递', note: '一箱牛奶', from_place: '驿站', to_floor: 3, code: 'F\u00b71024', status: 'done', creator_id: 'u_me', claimer_id: 'u_zhou', confirmed_count: 2, confirmed_by: ['u_me', 'u_zhou'], created_at: iso(26 * 3600000), updated_at: iso(25 * 3600000) },
      { id: 'o_done2', kind: 'route', title: '顺路带一份', note: '', from_place: '食堂', to_floor: 3, code: '', status: 'done', creator_id: 'u_at', claimer_id: 'u_me', confirmed_count: 2, confirmed_by: ['u_at', 'u_me'], start_at: '12:00', end_at: '13:00', capacity: 1, created_at: iso(3 * 86400000), updated_at: iso(3 * 86400000) },
      { id: 'o_done3', kind: 'errand', title: '带把葱', note: '做饭缺一把', from_place: '食堂', to_floor: 3, code: 'G\u00b79012', status: 'done', creator_id: 'u_me', claimer_id: 'u_at', confirmed_count: 2, confirmed_by: ['u_me', 'u_at'], created_at: iso(6 * 86400000), updated_at: iso(6 * 86400000) }
    ];
    /* 字段与真实后端一致：from_id / from_name / created_at */
    var messages = [
      { id: 1, order_id: 'o_claimed', from_id: 'u_me', from_name: '小柳', body: '两件，不急，你几点方便？', created_at: iso(20 * 60000) },
      { id: 2, order_id: 'o_claimed', from_id: 'u_at', from_name: '阿棠', body: '我六点下楼，顺手就带回来了', created_at: iso(18 * 60000) },
      { id: 3, order_id: 'o_picked', from_id: 'u_at', from_name: '阿棠', body: '饭在食堂二号窗口，报我名字就行', created_at: iso(15 * 60000) }
    ];
    return {
      users: users,
      orders: orders,
      messages: messages,
      ledger: [
        { id: 'l_1', order_id: 'o_done', user_id: 'u_zhou', for_user: 'u_me', at: iso(25 * 3600000) },
        { id: 'l_2', order_id: 'o_done2', user_id: 'u_me', for_user: 'u_at', at: iso(3 * 86400000) },
        { id: 'l_3', order_id: 'o_done3', user_id: 'u_at', for_user: 'u_me', at: iso(6 * 86400000) }
      ],
      sessions: {},
      notifications: [],
      msgSeq: 4,
      notifSeq: 1,
      notice: ''
    };
  }

  function loadDB() {
    var db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch (e) { db = null; }
    if (!db || !db.users) db = seedDB();
    if (!db.sessions) db.sessions = {};
    if (!db.notifications) db.notifications = [];
    if (!db.msgSeq) db.msgSeq = 100;
    if (!db.notifSeq) db.notifSeq = 1;
    return db;
  }
  var db = loadDB();

  if (params.get('longname') === '1' && !db.users.some(function (u) { return u.id === 'u_long'; })) {
    db.users.push({ id: 'u_long', name: '一二三四五六七八九十十一', floor: 3, points: 2, owed: 0, online: true, banned: false, last_seen: now() });
  }

  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {}
  }
  save();

  if (params.get('mock_login') === '1') {
    try { localStorage.setItem('ly_token', 'mock-token-me'); } catch (e) {}
  }

  /* ---------- 基础工具 ---------- */
  function findUser(id) {
    for (var i = 0; i < db.users.length; i++) if (db.users[i].id === id) return db.users[i];
    return null;
  }
  function pubUser(u) {
    return u ? { id: u.id, name: u.name, floor: u.floor, points: u.points || 0, owed: u.owed || 0 } : null;
  }
  function brief(id) {
    var u = findUser(id);
    return u ? { id: u.id, name: u.name, floor: u.floor } : null;
  }
  function orderOut(o) {
    var c = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k];
    c.creator = brief(o.creator_id);
    c.claimer = brief(o.claimer_id);
    delete c.creator_id;
    delete c.claimer_id;
    delete c.confirmed_by;
    return c;
  }
  function findOrder(id) {
    for (var i = 0; i < db.orders.length; i++) if (db.orders[i].id === id) return db.orders[i];
    return null;
  }
  function involved(o, uid) {
    return !!o && (o.creator_id === uid || o.claimer_id === uid);
  }
  function headerGet(init, name) {
    var h = (init && init.headers) || {};
    if (h && typeof h.get === 'function') return h.get(name);
    for (var k in h) if (k.toLowerCase() === String(name).toLowerCase()) return h[k];
    return null;
  }
  function bodyOf(init) {
    try { if (init && typeof init.body === 'string') return JSON.parse(init.body) || {}; } catch (e) {}
    return {};
  }
  function meOf(init) {
    var t = headerGet(init, 'x-ly-token');
    if (!t) return null;
    var uid = t === 'mock-token-me' ? 'u_me' : db.sessions[t];
    var u = uid ? findUser(uid) : null;
    if (!u || u.banned) return null;
    return u;
  }
  function isAdmin(init) { return headerGet(init, 'x-ly-admin') === 'mock-admin-token'; }
  function notify(o, type, text) {
    db.notifications.push({ id: db.notifSeq++, type: type, order_id: o.id, text: text, at: iso(0) });
    if (db.notifications.length > 60) db.notifications = db.notifications.slice(-60);
  }

  function resp(status, obj) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(new Response(JSON.stringify(obj), {
          status: status,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        }));
      }, 20);
    });
  }
  function ok(data) { return resp(200, { ok: true, data: data }); }
  function bad(msg, status) { return resp(status || 400, { ok: false, error: msg || '请求不合法' }); }

  /* ---------- 接口 ---------- */
  function handleRequest(rawUrl, init) {
    var u = new URL(rawUrl, location.origin);
    var p = u.pathname;
    var i = p.indexOf('/api/liuyin/');
    var path = i >= 0 ? p.slice(i + '/api/liuyin/'.length).replace(/\/+$/, '') : '';
    var method = String((init && init.method) || 'GET').toUpperCase();
    var q = u.searchParams;
    var b = bodyOf(init);

    /* --- 登录 / 身份 --- */
    if (path === 'login' && method === 'POST') {
      var name = String(b.name || '').trim();
      var floor = Number(b.floor);
      if (!name) return bad('先写个名字');
      if (Array.from(name).length > 12) return bad('名字最多 12 个字');
      if (!(floor >= 1 && floor <= 6)) return bad('楼层要在 1 到 6 之间');
      var existed = meOf(init);
      if (existed) return ok({ token: headerGet(init, 'x-ly-token'), user: pubUser(existed) });
      var finalName = name, n = 1;
      while (db.users.some(function (x) { return x.floor === floor && x.name === finalName; })) {
        n++;
        finalName = name + '(' + n + ')';
      }
      var newUser = { id: rid('u_'), name: finalName, floor: floor, points: 0, owed: 0, online: true, banned: false, last_seen: now() };
      db.users.push(newUser);
      var token = 'mock-token-' + newUser.id;
      db.sessions[token] = newUser.id;
      save();
      return ok({ token: token, user: pubUser(newUser) });
    }
    if (path === 'logout' && method === 'POST') return ok({ ok: true });
    if (path === 'me') {
      var me = meOf(init);
      if (!me) return bad('先写个名字进楼', 401);
      me.last_seen = now();
      save();
      return ok({ user: pubUser(me), building: '6 号楼' });
    }

    /* --- 楼栋 / 名单 --- */
    if (path === 'floors') {
      var floors = [1, 2, 3, 4, 5, 6].map(function (f) {
        return { floor: f, count: db.users.filter(function (x) { return x.floor === f && !x.banned; }).length };
      });
      return ok({ floors: floors, building: '6 号楼' });
    }
    if (path === 'floor') {
      var f = Number(q.get('floor') || 1);
      var list = db.users.filter(function (x) { return x.floor === f && !x.banned; }).map(function (x) {
        return { id: x.id, name: x.name, floor: x.floor, points: x.points || 0, online: now() - (x.last_seen || 0) < 60000, banned: !!x.banned };
      });
      return ok({ users: list, building: '6 号楼' });
    }

    /* --- 需要登录的接口 --- */
    var me = meOf(init);

    if (path === 'orders' && method === 'GET') {
      if (!me) return bad('先写个名字进楼', 401);
      var scope = q.get('scope') || 'mine';
      var floorQ = Number(q.get('floor') || 0);
      var arr;
      if (scope === 'open') arr = db.orders.filter(function (o) { return o.status === 'pending'; });
      else if (scope === 'mine') arr = db.orders.filter(function (o) { return involved(o, me.id); });
      else if (scope === 'floor') arr = db.orders.filter(function (o) {
        var cu = findUser(o.creator_id);
        return o.to_floor === floorQ || (cu && cu.floor === floorQ);
      });
      else if (scope === 'done') arr = db.orders.filter(function (o) { return o.status === 'done'; });
      else arr = db.orders.slice();
      return ok({ orders: arr.map(orderOut) });
    }
    if (path === 'orders/create' && method === 'POST') {
      if (!me) return bad('先写个名字进楼', 401);
      var kind = b.kind === 'route' ? 'route' : 'errand';
      var title = String(b.title || '').trim();
      if (!title) return bad('标题不能空');
      if (Array.from(title).length > 20) return bad('标题最多 20 个字');
      if (!(Number(b.to_floor) >= 1 && Number(b.to_floor) <= 6)) return bad('送到几层要选一下');
      if (kind === 'errand' && !String(b.code || '').trim()) return bad('取件码要填');
      var order = {
        id: rid('o_'), kind: kind, title: title, note: String(b.note || '').slice(0, 80),
        from_place: String(b.from_place || '').slice(0, 20),
        to_floor: Number(b.to_floor), code: String(b.code || '').slice(0, 12),
        status: 'pending', creator_id: me.id, claimer_id: null,
        confirmed_count: 0, confirmed_by: [],
        photo_key: b.photo_key || null,
        created_at: iso(0), updated_at: iso(0)
      };
      if (kind === 'route') {
        order.start_at = b.start_at || '';
        order.end_at = b.end_at || '';
        order.capacity = Math.min(5, Math.max(1, Number(b.capacity) || 1));
        order.code = '';
      }
      db.orders.unshift(order);
      save();
      return ok({ order: orderOut(order) });
    }
    if (path === 'orders/get' && method === 'GET') {
      if (!me) return bad('先写个名字进楼', 401);
      var o0 = findOrder(q.get('id'));
      if (!o0) return bad('这一单找不到了', 404);
      if (!involved(o0, me.id)) return bad('这不是你的单', 403);
      var msgs = db.messages.filter(function (m) { return m.order_id === o0.id; });
      return ok({ order: orderOut(o0), messages: msgs });
    }
    if (/^orders\/(claim|confirm|pick|deliver|complete|cancel|return)$/.test(path)) {
      if (!me) return bad('先写个名字进楼', 401);
      var act = path.split('/')[1];
      var o = findOrder(b.id);
      if (!o) return bad('这一单找不到了', 404);
      var isCreator = o.creator_id === me.id;
      var isClaimer = o.claimer_id === me.id;
      /* 接单本来就不是自己的单，其余动作必须和这单有关系 */
      if (act !== 'claim' && !involved(o, me.id)) return bad('这不是你的单', 403);
      if (act === 'claim') {
        if (o.status !== 'pending') return bad('这单已经被别人接走了', 409);
        if (isCreator) return bad('不能接自己发的单', 409);
        o.status = 'claimed';
        o.claimer_id = me.id;
        o.confirmed_count = 0;
        o.confirmed_by = [];
        o.updated_at = iso(0);
        notify(o, 'claimed', '有人接了你的单');
        save();
        return ok({ order: orderOut(o) });
      }
      if (act === 'confirm') {
        if (o.status !== 'claimed') return bad('现在不用确认', 409);
        if (!o.confirmed_by) o.confirmed_by = [];
        if (o.confirmed_by.indexOf(me.id) >= 0) return bad('你已经确认过了', 409);
        o.confirmed_by.push(me.id);
        o.confirmed_count = o.confirmed_by.length;
        o.updated_at = iso(0);
        if (o.confirmed_count >= 2) {
          o.status = 'confirmed';
          notify(o, 'confirmed', '两边都确认了');
        } else {
          notify(o, 'confirmed', '对方确认了，等你也点一下');
        }
        save();
        return ok({ order: orderOut(o), confirmed: o.confirmed_count });
      }
      if (act === 'pick') {
        if (!isClaimer) return bad('只有接单的人能取件', 403);
        if (o.status !== 'confirmed') return bad('还没到取件这一步', 409);
        o.status = 'picked';
        o.updated_at = iso(0);
        notify(o, 'picked', '件已经取到');
        save();
        return ok({ order: orderOut(o) });
      }
      if (act === 'deliver') {
        if (!isClaimer) return bad('只有接单的人能标记送达', 403);
        if (o.status !== 'picked') return bad('还没到送达这一步', 409);
        o.status = 'delivered';
        if (b.proof_key) o.proof_key = b.proof_key;
        o.updated_at = iso(0);
        notify(o, 'delivered', '已经送到门口');
        save();
        return ok({ order: orderOut(o) });
      }
      if (act === 'complete') {
        if (!isCreator) return bad('只有发单的人能记这一笔', 403);
        if (o.status !== 'delivered') return bad('还没送到，先别记', 409);
        o.status = 'done';
        o.updated_at = iso(0);
        var claimerUser = findUser(o.claimer_id);
        var creatorUser = findUser(o.creator_id);
        if (claimerUser) claimerUser.points = (claimerUser.points || 0) + 1;
        if (creatorUser) creatorUser.owed = (creatorUser.owed || 0) + 1;
        var ledger = { id: rid('l_'), order_id: o.id, user_id: o.claimer_id, for_user: o.creator_id, at: iso(0) };
        db.ledger.push(ledger);
        notify(o, 'done', '这一单完成了');
        save();
        return ok({ order: orderOut(o), ledger: ledger });
      }
      if (act === 'cancel') {
        if (!isCreator) return bad('只有发单的人能撤单', 403);
        if (o.status !== 'pending' && o.status !== 'claimed') return bad('现在不能撤单了', 409);
        o.status = 'cancelled';
        o.updated_at = iso(0);
        save();
        return ok({ order: orderOut(o) });
      }
      if (act === 'return') {
        if (!isClaimer) return bad('只有接单的人能退回', 403);
        if (o.status !== 'claimed') return bad('现在不能退回', 409);
        o.status = 'pending';
        o.claimer_id = null;
        o.confirmed_count = 0;
        o.confirmed_by = [];
        o.updated_at = iso(0);
        save();
        return ok({ order: orderOut(o) });
      }
    }

    if (path === 'messages' && method === 'GET') {
      if (!me) return bad('先写个名字进楼', 401);
      var orderId = q.get('order_id');
      var since = Number(q.get('since') || 0);
      var orderM = findOrder(orderId);
      if (!orderM) return bad('这一单找不到了', 404);
      if (!involved(orderM, me.id)) return bad('这不是你的单', 403);
      var msgs2 = db.messages.filter(function (m) { return m.order_id === orderId && Number(m.id) > since; });
      return ok({ messages: msgs2 });
    }
    if (path === 'messages/send' && method === 'POST') {
      if (!me) return bad('先写个名字进楼', 401);
      var om = findOrder(b.order_id);
      if (!om) return bad('这一单找不到了', 404);
      if (!involved(om, me.id)) return bad('这不是你的单', 403);
      var text = String(b.body || '').trim();
      if (!text) return bad('消息不能空');
      if (Array.from(text).length > 100) return bad('一句话最多 100 个字');
      var msg = { id: db.msgSeq++, order_id: om.id, from_id: me.id, from_name: me.name, body: text, created_at: iso(0) };
      db.messages.push(msg);
      var otherId = om.creator_id === me.id ? om.claimer_id : om.creator_id;
      if (otherId) notify(om, 'message', '有新消息');
      save();
      return ok({ message: msg });
    }

    if (path === 'upload' && method === 'POST') {
      if (!me) return bad('先写个名字进楼', 401);
      var key = 'u_' + me.id.replace(/^u_/, '') + '/mock-' + now() + '.jpg';
      return ok({ key: key, url: '/api/liuyin/file?key=' + encodeURIComponent(key) });
    }

    if (path === 'sync') {
      if (!me) return bad('先写个名字进楼', 401);
      me.last_seen = now();
      var sinceQ = Number(q.get('since') || 0);
      var fq = Number(q.get('floor') || me.floor);
      var floorUsers = db.users.filter(function (x) { return x.floor === fq && !x.banned; }).map(function (x) {
        return { id: x.id, name: x.name, floor: x.floor, points: x.points || 0, online: now() - (x.last_seen || 0) < 60000 };
      });
      var openOrders = db.orders.filter(function (o) { return o.status === 'pending'; });
      var myOrders = db.orders.filter(function (o) { return involved(o, me.id); });
      var notes = db.notifications.filter(function (n) {
        return new Date(n.at).getTime() > sinceQ;
      }).slice(-20);
      save();
      return ok({
        server_time: now(),
        me: { points: me.points || 0, owed: me.owed || 0 },
        floor_users: floorUsers,
        open_orders: openOrders.map(orderOut),
        my_orders: myOrders.map(orderOut),
        notifications: notes
      });
    }

    /* --- 管理 --- */
    if (path === 'admin/login' && method === 'POST') {
      if (!String(b.password || '').trim()) return bad('先填密码');
      return ok({ token: 'mock-admin-token' });
    }
    if (path.indexOf('admin/') === 0) {
      if (!isAdmin(init)) return bad('管理身份失效，请重新输入密码', 401);
      if (path === 'admin/stats') {
        var byStatus = {};
        db.orders.forEach(function (o) { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
        var fl = [1, 2, 3, 4, 5, 6].map(function (fx) {
          return { floor: fx, count: db.users.filter(function (x) { return x.floor === fx && !x.banned; }).length };
        });
        var recent = db.orders.slice().sort(function (a, bb) {
          return new Date(bb.updated_at || bb.created_at) - new Date(a.updated_at || a.created_at);
        }).slice(0, 12).map(orderOut);
        var onlineCount = db.users.filter(function (x) { return !x.banned && now() - (x.last_seen || 0) < 60000; }).length;
        return ok({
          users: db.users.filter(function (x) { return !x.banned; }).length,
          online: onlineCount,
          orders_by_status: byStatus,
          floors: fl,
          ledger_count: db.ledger.length,
          recent: recent,
          users_list: db.users.map(function (x) {
            return { id: x.id, name: x.name, floor: x.floor, points: x.points || 0, online: now() - (x.last_seen || 0) < 60000, banned: !!x.banned };
          })
        });
      }
      if (path === 'admin/clear' && method === 'POST') {
        var what = b.what;
        if (what === 'orders') {
          db.orders = [];
          db.messages = [];
          db.notifications = [];
        } else if (what === 'users' || what === 'all') {
          db.users = db.users.filter(function (x) { return x.id === 'u_me'; });
          db.orders = [];
          db.messages = [];
          db.notifications = [];
          db.ledger = [];
        } else {
          return bad('不知道要清什么');
        }
        save();
        return ok({ ok: true });
      }
      if (path === 'admin/delete-order' && method === 'POST') {
        var before = db.orders.length;
        db.orders = db.orders.filter(function (o) { return o.id !== b.id; });
        db.messages = db.messages.filter(function (m) { return m.order_id !== b.id; });
        save();
        return ok({ deleted: before - db.orders.length });
      }
      if (path === 'admin/ban' && method === 'POST') {
        var bu = findUser(b.user_id);
        if (!bu) return bad('没有这个用户', 404);
        bu.banned = true;
        save();
        return ok({ ok: true });
      }
      if (path === 'admin/unban' && method === 'POST') {
        var uu = findUser(b.user_id);
        if (!uu) return bad('没有这个用户', 404);
        uu.banned = false;
        save();
        return ok({ ok: true });
      }
      if (path === 'admin/notice' && method === 'POST') {
        db.notice = String(b.text || '');
        save();
        return ok({ ok: true });
      }
      if (path === 'admin/seed' && method === 'POST') {
        var fresh = seedDB();
        var added = 0;
        fresh.users.forEach(function (x) {
          if (!db.users.some(function (y) { return y.id === x.id; })) { db.users.push(x); added++; }
        });
        fresh.orders.forEach(function (x) {
          if (!db.orders.some(function (y) { return y.id === x.id; })) { db.orders.push(x); added++; }
        });
        fresh.messages.forEach(function (x) {
          if (!db.messages.some(function (y) { return y.id === x.id; })) db.messages.push(x);
        });
        db.msgSeq = Math.max(db.msgSeq, 100);
        save();
        return ok({ ok: true, added: added });
      }
      return bad('没有这个管理接口', 404);
    }

    return bad('没有这个接口：' + path, 404);
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/liuyin/') >= 0) return handleRequest(url, init);
    if (realFetch) return realFetch(input, init);
    return Promise.reject(new Error('fetch 不可用'));
  };

  window.__lyMock = {
    db: function () { return db; },
    reset: function () {
      db = seedDB();
      save();
    }
  };
})();

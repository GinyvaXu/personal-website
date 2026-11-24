/* 柳荫册 Web · 本地联调用的内存后端（只在 index.html 里 ?devmock=1 时加载）
   作用：后端 /api/liuyin 尚未就绪时，按 PARITY-PLAN §3 契约在浏览器内存里模拟
   login / me / sync / orders/* / routes/* / messages / upload，并跑一个简化机器人邻居，
   让「发单 → 接单 → 双确认 → 步骤 → 送达 → 确认收货」的闭环可以在本地走完。
   生产默认不加载本文件，也不参与真实数据。 */
(function () {
  'use strict';

  var BOT_NAMES = ['小周', '阿禾', '林一', '小满', '阿梧', '叶子'];
  var BOT_FLOORS = [3, 5, 2, 4, 6, 3];
  var PRESETS = ['sage', 'peach', 'ochre', 'clay', 'blue', 'plum'];
  var BUILDING = { name: '6 号楼', lit: 18, target: 30, code: '7241', floor: 6 };
  var TPL = {
    pickup: [
      { type: 'provide_code', owner: 'requester', label: '提供取件码 / 订单号' },
      { type: 'pickup', owner: 'helper', label: '取到' },
      { type: 'deliver', owner: 'helper', label: '交付' },
      { type: 'confirm', owner: 'requester', label: '确认收到' }
    ],
    food: [
      { type: 'pickup', owner: 'helper', label: '取到餐' },
      { type: 'deliver', owner: 'helper', label: '交付' },
      { type: 'confirm', owner: 'requester', label: '确认收到' }
    ],
    deliver: [
      { type: 'pickup', owner: 'helper', label: '取到东西' },
      { type: 'deliver', owner: 'helper', label: '交付' },
      { type: 'confirm', owner: 'requester', label: '确认收到' }
    ],
    trash: [
      { type: 'pickup', owner: 'helper', label: '已带走' },
      { type: 'confirm', owner: 'requester', label: '确认收到' }
    ],
    custom: [
      { type: 'pickup', owner: 'helper', label: '取到 / 完成' },
      { type: 'deliver', owner: 'helper', label: '交付' },
      { type: 'confirm', owner: 'requester', label: '确认收到' }
    ]
  };
  var PICKUPS = {
    '取快递': ['菜鸟驿站', '快递柜', '顺丰点', '校门口'],
    '带饭': ['食堂一楼', '食堂二楼', '外卖柜', '校外商家'],
    '送东西': ['宿舍楼', '教学楼', '图书馆', '校门口'],
    '倒垃圾': ['本层垃圾房', '楼下垃圾站'],
    '自定义': ['楼里', '教学楼', '校门口']
  };
  var CAT_TPL = { '取快递': 'pickup', '带饭': 'food', '送东西': 'deliver', '倒垃圾': 'trash', '自定义': 'custom' };

  var db;
  function reset() {
    db = {
      seq: 0,
      tick: 0,
      me: null,
      tokens: {},
      users: {},
      orders: {},
      messages: [],
      routes: [],
      ledger: [],
      notifs: []
    };
    BOT_NAMES.forEach(function (n, i) {
      var id = 'b_' + (i + 1);
      db.users[id] = {
        id: id, name: n, nickname: n, real_name: '', avatar: 'preset:' + PRESETS[i % PRESETS.length],
        floor: BOT_FLOORS[i], room_no: '', building_id: 'b_6', show_real_name: 1,
        points: 8 + i, is_demo: 1, created_at: nowISO()
      };
    });
    seed();
  }

  /* ---------------- 基础工具 ---------------- */
  function now() { return Date.now(); }
  function nowISO() { return new Date(now()).toISOString(); }
  function uid(p) { db.seq++; return p + '_' + db.seq.toString(36) + Math.floor(Math.random() * 900 + 100).toString(36); }
  function json(status, obj) {
    return new Response(JSON.stringify(obj), {
      status: status,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }
  function ok(data) { return json(200, { ok: true, data: data }); }
  function bad(status, error) { return json(status, { ok: false, error: error }); }
  function me() { return db.me ? db.users[db.me.id] : null; }
  function isBot(id) { return !!(id && db.users[id] && db.users[id].is_demo); }
  function botList() { return Object.keys(db.users).map(function (k) { return db.users[k]; }).filter(function (u) { return u.is_demo; }); }
  function pickBot(seed) {
    var list = botList();
    return list[(seed || db.tick) % list.length];
  }

  function buildSteps(tpl, needCode) {
    var defs = (TPL[tpl] || TPL.custom).slice();
    if (tpl === 'custom' && needCode) {
      defs = [{ type: 'provide_code', owner: 'requester', label: '提供凭证（可选）' }].concat(defs);
    }
    return defs.map(function (d, i) {
      return {
        id: 's' + (i + 1), type: d.type, owner: d.owner, label: d.label,
        status: 'pending', text_value: '', photo_key: '', completed_at: 0
      };
    });
  }

  function pushNotif(o, type, text) {
    db.notifs.push({ type: type, order_id: o.id, text: text, at: nowISO() });
    if (db.notifs.length > 30) db.notifs = db.notifs.slice(-30);
  }
  function botSay(o, text) {
    if (!o) return;
    var sender = o.claimer_id && isBot(o.claimer_id) ? o.claimer_id : (isBot(o.creator_id) ? o.creator_id : null);
    if (!sender) return;
    addMessage(o.id, sender, text);
  }
  function addMessage(orderId, fromId, body) {
    db.messages.push({
      id: 'm_' + (++db.seq),
      order_id: orderId,
      from_id: fromId,
      from_name: (db.users[fromId] && db.users[fromId].name) || '楼里',
      body: String(body || '').slice(0, 100),
      created_at: nowISO()
    });
  }

  function pubUser(u) {
    if (!u) return null;
    return {
      id: u.id, name: u.name, nickname: u.nickname, avatar: u.avatar,
      floor: u.floor, room_no: u.room_no, points: u.points, is_demo: u.is_demo || 0
    };
  }
  function pubMe() {
    var u = me();
    if (!u) return null;
    var done = myOrders().filter(function (o) { return o.status === 'done'; });
    var helped = done.filter(function (o) { return o.claimer_id === u.id; }).length;
    var received = done.filter(function (o) { return o.creator_id === u.id; }).length;
    var owed = db.ledger.filter(function (l) { return l.from_id === u.id; }).reduce(function (s, l) { return s + Math.abs(l.delta); }, 0);
    var got = db.ledger.filter(function (l) { return l.to_id === u.id; }).reduce(function (s, l) { return s + Math.abs(l.delta); }, 0);
    return {
      id: u.id, name: u.name, nickname: u.nickname, real_name: u.real_name, avatar: u.avatar,
      floor: u.floor, room_no: u.room_no, building_id: 'b_6', show_real_name: u.show_real_name,
      points: u.points, owed: owed, helped: helped, received: received,
      helped_count: helped, is_admin: 1
    };
  }
  function ledgerFor() {
    var u = me();
    if (!u) return [];
    return db.ledger.filter(function (l) { return l.from_id === u.id || l.to_id === u.id; })
      .slice(-20).reverse().map(function (l) {
        var positive = l.to_id === u.id;
        var otherId = positive ? l.from_id : l.to_id;
        var other = db.users[otherId] || {};
        return {
          id: l.id, order_id: l.order_id, delta: positive ? Math.abs(l.delta) : -Math.abs(l.delta),
          what: l.note, who: other.name || '', created_at: l.created_at
        };
      });
  }

  function orderList() { return Object.keys(db.orders).map(function (k) { return db.orders[k]; }); }
  function myOrders() {
    var u = me();
    if (!u) return [];
    return orderList().filter(function (o) { return o.creator_id === u.id || o.claimer_id === u.id; });
  }
  function openOrders() {
    var u = me();
    /* released 与 pending 一样回到楼里，可以被接 */
    return orderList().filter(function (o) {
      return (o.status === 'pending' || o.status === 'released') && (!u || o.creator_id !== u.id);
    });
  }
  function pubOrder(o) {
    var u = me();
    var creator = db.users[o.creator_id] || null;
    var claimer = o.claimer_id ? db.users[o.claimer_id] : null;
    var mine = !!(u && (o.creator_id === u.id || o.claimer_id === u.id));
    var role = !u ? 'guest' : (o.creator_id === u.id ? 'requester' : (o.claimer_id === u.id ? 'helper' : 'guest'));
    var seeCode = mine && ['claimed', 'connected', 'delivered', 'done'].indexOf(o.status) >= 0;
    var c = pubUser(creator);
    if (c && o.status === 'pending') c.name = c.nickname || c.name;
    return {
      id: o.id, category: o.category, template_id: o.template_id, size: o.size || '',
      pickup: o.pickup, time_label: o.time_label, points: o.points, to_floor: o.to_floor || 3,
      note: o.note || '', need_code: o.need_code ? 1 : 0,
      code: seeCode ? (o.code || '') : '',
      steps: (o.steps || []).map(function (s) {
        var copy = {
          id: s.id, type: s.type, owner: s.owner, label: s.label, status: s.status,
          text_value: mine ? (s.text_value || '') : '', photo_key: mine ? (s.photo_key || '') : '',
          completed_at: s.completed_at || 0
        };
        return copy;
      }),
      current_step: o.current_step || '',
      status: o.status,
      creator: c, claimer: pubUser(claimer),
      creator_id: o.creator_id, claimer_id: o.claimer_id || null,
      conn_deadline: o.conn_deadline || null, conn_extended: o.conn_extended ? 1 : 0,
      created_at: o.created_at, updated_at: o.updated_at,
      delivered_at: o.delivered_at || null, done_at: o.done_at || null,
      photo_key: o.photo_key || '', proof_key: o.proof_key || '',
      is_mine: mine, role: role
    };
  }
  function confirmOf(o) {
    var u = me();
    if (!u) return { mine: false, other: false };
    var creatorIsMe = o.creator_id === u.id;
    var mine = creatorIsMe ? !!o.confirm.requester : (o.claimer_id === u.id ? !!o.confirm.helper : false);
    var other = creatorIsMe ? !!o.confirm.helper : (o.claimer_id === u.id ? !!o.confirm.requester : false);
    return { mine: mine, other: other };
  }

  function createOrder(creatorId, data) {
    var tpl = data.template_id || CAT_TPL[data.category] || 'custom';
    var needCode = tpl === 'pickup' || (tpl === 'custom' && !!data.need_code);
    var steps = buildSteps(tpl, needCode);
    var o = {
      id: uid('o'),
      creator_id: creatorId,
      claimer_id: null,
      category: data.category,
      template_id: tpl,
      size: data.size || '',
      pickup: data.pickup || '',
      time_label: data.time_label || '',
      points: Math.min(3, Math.max(1, Number(data.points) || 2)),
      to_floor: Number(data.to_floor) || 3,
      note: String(data.note || '').slice(0, 60),
      need_code: needCode ? 1 : 0,
      code: '',
      steps: steps,
      current_step: steps.length ? steps[0].id : '',
      status: 'pending',
      confirm: { requester: false, helper: false },
      conn_deadline: null,
      conn_extended: 0,
      created_at: nowISO(),
      updated_at: nowISO(),
      delivered_at: null,
      done_at: null,
      released_reason: ''
    };
    db.orders[o.id] = o;
    return o;
  }

  function nextPendingStep(o) {
    for (var i = 0; i < o.steps.length; i++) {
      var s = o.steps[i];
      if (s.status === 'done') continue;
      var prevDone = true;
      for (var j = 0; j < i; j++) if (o.steps[j].status !== 'done') prevDone = false;
      if (prevDone) return s;
    }
    return null;
  }
  function actableStep(o, owner) {
    var s = nextPendingStep(o);
    if (s && (!owner || s.owner === owner)) return s;
    return null;
  }
  function markStep(o, step, text, photo) {
    if (!o || !step) return;
    step.status = 'done';
    if (text !== undefined && text !== '') step.text_value = String(text).slice(0, 30);
    if (photo) step.photo_key = photo;
    step.completed_at = now();
    o.updated_at = nowISO();
    var next = nextPendingStep(o);
    o.current_step = next ? next.id : '';
    var helperLeft = o.steps.some(function (s) { return s.owner === 'helper' && s.status !== 'done'; });
    if (!helperLeft && o.status === 'connected') {
      o.status = 'delivered';
      o.delivered_at = nowISO();
      pushNotif(o, 'delivered', '已经送到楼里');
      botSay(o, '放门口了，你方便的时候确认一下。');
    }
  }
  function setConnected(o) {
    if (o.status !== 'connected') {
      o.status = 'connected';
      o.updated_at = nowISO();
      o._nextStepAt = now() + 2500;
      pushNotif(o, 'connected', '两边确认好了');
    }
  }
  function releaseToPool(o, reason) {
    o.status = 'pending';
    o.claimer_id = null;
    o.confirm = { requester: false, helper: false };
    o.conn_deadline = null;
    o.conn_extended = 0;
    o.released_reason = reason || 'timeout';
    o.updated_at = nowISO();
    delete o._botConfirmAt;
    delete o._nextStepAt;
    addMessage(o.id, o.creator_id, '（系统）这单回到楼里了，还在等人接。');
  }
  function completeOrder(o) {
    if (!o || o.status !== 'delivered') return false;
    var u = me();
    o.status = 'done';
    o.done_at = nowISO();
    o.updated_at = nowISO();
    var cStep = o.steps.filter(function (s) { return s.type === 'confirm'; })[0];
    if (cStep) { cStep.status = 'done'; cStep.completed_at = now(); }
    var creator = db.users[o.creator_id];
    var claimer = db.users[o.claimer_id];
    if (creator && claimer) {
      var charge = Math.min(o.points, Math.max(0, creator.points || 0));
      creator.points = Math.max(0, (creator.points || 0) - charge);
      claimer.points = (claimer.points || 0) + o.points;
      db.ledger.push({
        id: 'l_' + (++db.seq), order_id: o.id, from_id: creator.id, to_id: claimer.id,
        delta: o.points, note: '请人' + o.category, created_at: nowISO()
      });
      db.ledger.push({
        id: 'l_' + (++db.seq), order_id: o.id, from_id: creator.id, to_id: claimer.id,
        delta: -o.points, note: '帮' + creator.name + o.category, created_at: nowISO()
      });
    }
    pushNotif(o, 'done', '这一单完成了');
    if (u && o.creator_id === u.id) botSay(o, '谢谢，改天顺手还你。');
    return true;
  }

  /* ---------------- 种子数据 ---------------- */
  function seed() {
    var bots = botList();
    var o1 = createOrder(bots[0].id, {
      category: '取快递', template_id: 'pickup', size: '中件', pickup: '菜鸟驿站',
      time_label: '18:10 前', points: 2, note: '两个件，麻烦顺手'
    });
    var o2 = createOrder(bots[1].id, {
      category: '带饭', template_id: 'food', pickup: '食堂一楼',
      time_label: '30 分钟内', points: 1, note: '汤别洒，谢谢'
    });
    var o3 = createOrder(bots[2].id, {
      category: '倒垃圾', template_id: 'trash', pickup: '本层垃圾房',
      time_label: '现在', points: 1, note: ''
    });
    o2.created_at = new Date(now() - 120000).toISOString();
    o3.created_at = new Date(now() - 300000).toISOString();
    var o4 = createOrder(bots[3].id, {
      category: '送东西', template_id: 'deliver', pickup: '教学楼',
      time_label: '18:30 前', points: 2, note: '帮忙带到楼下'
    });
    o4.status = 'released';
    o4.released_reason = 'timeout';
    db.routes.push({
      id: 'r_' + (++db.seq), user_id: bots[0].id, floor: bots[0].floor,
      time_label: '18:00–18:30', from_place: '驿站', to_place: '6 号楼',
      capacity: 2, status: 'active',
      active_until: new Date(now() + 7200000).toISOString(), created_at: nowISO()
    });
    pushNotif(o1, 'claimed', '有人接了你的单');
  }

  /* ---------------- 简化机器人邻居 ---------------- */
  function isMineOrder(o) {
    var u = me();
    return !!(u && (o.creator_id === u.id || o.claimer_id === u.id));
  }
  function botTick() {
    db.tick++;
    var t = now();
    orderList().forEach(function (o) {
      if (!o || !isMineOrder(o)) return;
      if (o.status === 'pending' && o.creator_id === (me() && me().id) && !o.claimer_id) {
        /* 我的单被人接：机器人接单 */
        if (t - Date.parse(o.created_at) > 3000) {
          var bot = pickBot(o.points);
          o.claimer_id = bot.id;
          o.status = 'claimed';
          o.confirm = { requester: false, helper: false };
          o.conn_deadline = new Date(t + 10 * 60000).toISOString();
          o.conn_extended = 0;
          o._botConfirmAt = t + 2600;
          o.updated_at = nowISO();
          botSay(o, '我 18:10 从驿站回，顺路。');
          pushNotif(o, 'claimed', '有人接了你的单');
        }
        return;
      }
      if (o.status === 'claimed') {
        var dl = Date.parse(o.conn_deadline || '') || 0;
        if (dl && t > dl) { releaseToPool(o, 'timeout'); return; }
        if (o._botConfirmAt && t > o._botConfirmAt) {
          if (isBot(o.claimer_id) && o.confirm.requester && !o.confirm.helper) {
            o.confirm.helper = true;
            setConnected(o);
          } else if (isBot(o.creator_id) && o.confirm.helper && !o.confirm.requester) {
            o.confirm.requester = true;
            setConnected(o);
          }
        }
        return;
      }
      if (o.status === 'connected') {
        if (!o._nextStepAt) o._nextStepAt = t + 2600;
        if (t < o._nextStepAt) return;
        o._nextStepAt = t + 2600;
        if (isBot(o.creator_id)) {
          var rStep = actableStep(o, 'requester');
          if (rStep) {
            markStep(o, rStep, rStep.type === 'provide_code' ? '3321' : '', '');
            if (rStep.type === 'provide_code') o.code = '3321';
          }
        }
        if (isBot(o.claimer_id)) {
          var hStep = actableStep(o, 'helper');
          if (hStep) markStep(o, hStep, '', '');
        }
        return;
      }
      if (o.status === 'delivered' && isBot(o.creator_id)) {
        if (!o._doneAt) o._doneAt = t + 4200;
        if (t > o._doneAt) completeOrder(o);
      }
    });

    /* 待接池不空：机器人发新单 */
    var pool = orderList().filter(function (o) { return o.status === 'pending'; });
    if (pool.length < 2 && db.tick % 4 === 0) {      var bot = pickBot(db.tick);
      var cats = Object.keys(PICKUPS);
      var cat = cats[db.tick % cats.length];
      var pick = PICKUPS[cat][db.tick % PICKUPS[cat].length];
      var times = ['现在', '30 分钟内', '18:10 前', '18:30 前'];
      createOrder(bot.id, {
        category: cat,
        template_id: CAT_TPL[cat],
        size: cat === '取快递' ? ['小件', '中件', '大件'][db.tick % 3] : '',
        pickup: pick,
        time_label: times[db.tick % times.length],
        points: 1 + (db.tick % 3),
        note: ['顺手就行', '', '有点急，麻烦'][db.tick % 3]
      });
    }

    /* 楼里至少有一张亮着的顺路卡 */
    var active = db.routes.filter(function (c) { return c.status === 'active'; });
    if (!active.length && db.tick % 5 === 0) {
      var bot2 = pickBot(db.tick + 2);
      db.routes.push({
        id: 'r_' + (++db.seq), user_id: bot2.id, floor: bot2.floor,
        time_label: ['12:00–12:30', '18:00–18:30'][db.tick % 2],
        from_place: ['驿站', '食堂', '东门'][db.tick % 3],
        to_place: '6 号楼', capacity: 2, status: 'active',
        active_until: new Date(now() + 7200000).toISOString(), created_at: nowISO()
      });
    }

    /* 随机说一句 */
    if (db.tick % 3 === 0) {
      var activeOrders = myOrders().filter(function (o) {
        return ['claimed', 'connected', 'delivered'].indexOf(o.status) >= 0 && isBot(o.creator_id === (me() && me().id) ? o.claimer_id : o.creator_id);
      });
      if (activeOrders.length) {
        var oo = activeOrders[db.tick % activeOrders.length];
        var botId = isBot(oo.claimer_id) ? oo.claimer_id : oo.creator_id;
        var lines = ['我到楼下了', '稍等两分钟', '放门口可以吗', '马上到', '在电梯里了'];
        addMessage(oo.id, botId, lines[db.tick % lines.length]);
      }
    }
  }

  /* ---------------- 路由分发 ---------------- */
  function parseBody(init) {
    var b = init && init.body;
    if (!b) return {};
    if (typeof b === 'string') {
      try { return JSON.parse(b); } catch (e) { return {}; }
    }
    if (typeof FormData !== 'undefined' && b instanceof FormData) return b;
    return {};
  }
  function tokenOf(init) {
    var h = (init && init.headers) || {};
    return h['x-ly-token'] || h['X-LY-Token'] || '';
  }
  function auth(skip) {
    var tok = db.__token;
    if (!tok) return null;
    var uidv = db.tokens[tok];
    if (!uidv || !db.users[uidv] || db.users[uidv].is_demo) return null;
    return db.users[uidv];
  }
  function fileToDataURL(file) {
    return new Promise(function (resolve) {
      try {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = function () { resolve(''); };
        fr.readAsDataURL(file);
      } catch (e) { resolve(''); }
    });
  }

  function routeUrl(url) {
    var s = String(url || '');
    var i = s.indexOf('/api/liuyin');
    var rest = i >= 0 ? s.slice(i + '/api/liuyin'.length) : s;
    var q = '';
    var qi = rest.indexOf('?');
    if (qi >= 0) { q = rest.slice(qi + 1); rest = rest.slice(0, qi); }
    var query = {};
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return { path: rest.replace(/\/$/, '') || '/', query: query };
  }

  function fetch(url, init) {
    init = init || {};
    var method = String(init.method || 'GET').toUpperCase();
    var r = routeUrl(url);
    var path = r.path;
    var q = r.query;
    db.__token = tokenOf(init);
    var user = auth();
    var body = parseBody(init);

    /* 不需要登录 */
    if (path === '/login' && method === 'POST') {
      var name = String(body.name || '').trim() || '路过的邻居';
      var floor = Math.min(6, Math.max(1, Number(body.floor) || 3));
      var finalName = name;
      var taken = Object.keys(db.users).map(function (k) { return db.users[k]; }).filter(function (u) { return u.name === name; });
      if (taken.length) {
        var n = taken.length + 1;
        while (Object.keys(db.users).some(function (k) { return db.users[k].name === name + '(' + n + ')'; })) n++;
        finalName = name + '(' + n + ')';
      }
      var u = {
        id: uid('u'), name: finalName, nickname: finalName, real_name: '', avatar: 'preset:' + PRESETS[floor % PRESETS.length],
        floor: floor, room_no: '', building_id: 'b_6', show_real_name: 1,
        points: 12, is_demo: 0, created_at: nowISO()
      };
      db.users[u.id] = u;
      db.me = u;
      var tok = 'devtok_' + u.id + '_' + (++db.seq);
      db.tokens[tok] = u.id;
      db.__token = tok;
      saveSession(tok, u);
      return ok({ token: tok, user: pubMe(), building: BUILDING });
    }
    if (path === '/file') {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#dfe8df"/><text x="60" y="70" font-size="40" text-anchor="middle" fill="#4F7359">柳</text></svg>';
      return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
    }

    if (!user) return bad(401, '登录已失效');

    if (path === '/logout' && method === 'POST') {
      if (db.__token) delete db.tokens[db.__token];
      clearSession();
      db.me = null;
      return ok({ ok: true });
    }
    if (path === '/me') {
      return ok({ user: pubMe(), building: BUILDING, stats: publicStats() });
    }
    if (path === '/profile' && method === 'POST') {
      var meU = db.users[db.me.id];
      meU.nickname = String(body.nickname || meU.nickname).slice(0, 20);
      meU.real_name = String(body.real_name || '').slice(0, 20);
      meU.show_real_name = body.show_real_name === false || body.show_real_name === 0 ? 0 : 1;
      meU.name = meU.show_real_name ? (meU.real_name || meU.nickname) : meU.nickname;
      if (body.avatar !== undefined) meU.avatar = String(body.avatar || '');
      if (body.floor !== undefined) meU.floor = Math.min(6, Math.max(1, Number(body.floor) || 3));
      if (body.room_no !== undefined) meU.room_no = String(body.room_no || '').slice(0, 6);
      return ok({ user: pubMe() });
    }
    if (path === '/floor') {
      var fl = Number(q.floor) || 3;
      return ok({
        users: Object.keys(db.users).map(function (k) { return db.users[k]; })
          .filter(function (u2) { return u2.floor === fl && !u2.is_demo; })
          .map(pubUser)
      });
    }
    if (path === '/floors') {
      var counts = {};
      Object.keys(db.users).forEach(function (k) {
        var u3 = db.users[k];
        counts[u3.floor] = (counts[u3.floor] || 0) + 1;
      });
      return ok({
        floors: Object.keys(counts).map(function (f) { return { floor: Number(f), count: counts[f] }; })
      });
    }
    if (path === '/sync') {
      botTick();
      return ok(syncPayload());
    }
    if (path === '/orders' || path === '/orders/') {
      var scope = q.scope || 'open';
      var list = scope === 'mine' ? myOrders().filter(function (o) { return o.creator_id === db.me.id; })
        : scope === 'done' ? myOrders().filter(function (o) { return o.status === 'done'; })
          : openOrders();
      return ok({ orders: list.map(pubOrder) });
    }
    if (path === '/orders/get') {
      botTick();
      var oo2 = db.orders[q.id];
      if (!oo2) return bad(404, '订单不在了');
      var isParty = oo2.creator_id === db.me.id || oo2.claimer_id === db.me.id;
      var msgs = isParty ? db.messages.filter(function (m) { return m.order_id === oo2.id; }) : [];
      return ok({
        order: pubOrder(oo2), messages: msgs, confirm: confirmOf(oo2), server_time: nowISO()
      });
    }
    if (path === '/orders/create' && method === 'POST') {
      var cat = body.category;
      if (!PICKUPS[cat]) return bad(400, '品类不在允许范围');
      var oNew = createOrder(db.me.id, body);
      if (body.need_code && oNew.template_id === 'pickup') oNew.need_code = 1;
      return ok({ order: pubOrder(oNew) });
    }
    if (path === '/orders/claim' && method === 'POST') {
      var oc = db.orders[body.id];
      if (!oc) return bad(404, '订单不在了');
      if (oc.creator_id === db.me.id) return bad(400, '不能接自己发的单');
      if (oc.status !== 'pending') return bad(409, '手慢了一点，这单已被接走');
      oc.claimer_id = db.me.id;
      oc.status = 'claimed';
      oc.confirm = { requester: false, helper: false };
      oc.conn_deadline = new Date(now() + 10 * 60000).toISOString();
      oc.conn_extended = 0;
      oc.updated_at = nowISO();
      oc._botConfirmAt = now() + 2600;
      oc._nextStepAt = now() + 5200;
      pushNotif(oc, 'claimed', '有人接了单');
      return ok({ order: pubOrder(oc) });
    }
    if (path === '/orders/confirm' && method === 'POST') {
      var oCf = db.orders[body.id];
      if (!oCf) return bad(404, '订单不在了');
      if (oCf.status !== 'claimed') return bad(400, '订单不在待建联状态');
      var mineC = oCf.creator_id === db.me.id;
      if (!mineC && oCf.claimer_id !== db.me.id) return bad(403, '只有委托方和接单方可以确认建联');
      if (mineC) oCf.confirm.requester = true; else oCf.confirm.helper = true;
      if (oCf.confirm.requester && oCf.confirm.helper) setConnected(oCf);
      oCf.updated_at = nowISO();
      return ok({ order: pubOrder(oCf), confirmed: (oCf.confirm.requester ? 1 : 0) + (oCf.confirm.helper ? 1 : 0) });
    }
    if (path === '/orders/extend' && method === 'POST') {
      var oE = db.orders[body.id];
      if (!oE) return bad(404, '订单不在了');
      if (oE.creator_id !== db.me.id) return bad(403, '只有委托方可以延长');
      if (oE.status !== 'claimed') return bad(400, '订单不在待建联状态');
      if (oE.conn_extended) return bad(400, '已经延长过一次了');
      oE.conn_deadline = new Date((Date.parse(oE.conn_deadline) || now()) + 10 * 60000).toISOString();
      oE.conn_extended = 1;
      oE._botConfirmAt = now() + 2600;
      oE.updated_at = nowISO();
      return ok({ order: pubOrder(oE) });
    }
    if (path === '/orders/release' && method === 'POST') {
      var oR = db.orders[body.id];
      if (!oR) return bad(404, '订单不在了');
      if (oR.claimer_id !== db.me.id) return bad(403, '只有接单方可以释放');
      if (oR.status !== 'claimed') return bad(400, '已经建联了，如需结束请直接取消这单');
      releaseToPool(oR, 'unreachable');
      return ok({ order: pubOrder(oR) });
    }
    if (path === '/orders/cancel' && method === 'POST') {
      var oX = db.orders[body.id];
      if (!oX) return bad(404, '订单不在了');
      if (oX.creator_id !== db.me.id && oX.claimer_id !== db.me.id) return bad(403, '只有订单双方可以取消');
      if (oX.status === 'pending' || oX.status === 'claimed') {
        if (oX.status === 'claimed') { releaseToPool(oX, 'creator_cancel'); }
        else { oX.status = 'cancelled'; oX.updated_at = nowISO(); }
      } else {
        oX.status = 'cancelled';
        oX.updated_at = nowISO();
      }
      return ok({ order: pubOrder(oX) });
    }
    if (path === '/orders/step' && method === 'POST') {
      var oS = db.orders[body.id];
      if (!oS) return bad(404, '订单不在了');
      if (oS.status !== 'connected') return bad(400, '订单还没建联，不能推进步骤');
      var st = null;
      oS.steps.forEach(function (s) { if (s.id === body.step_id) st = s; });
      if (!st) return bad(400, '没有这个步骤');
      var myOwner = oS.creator_id === db.me.id ? 'requester' : (oS.claimer_id === db.me.id ? 'helper' : '');
      if (!myOwner) return bad(403, '只有订单双方可以推进步骤');
      if (st.owner !== myOwner) return bad(403, '这一步不归你操作');
      if (nextPendingStep(oS) !== st) return bad(400, '还没轮到这个步骤');
      if (st.type === 'provide_code') {
        var txt = String(body.text || '').trim();
        if (!txt || txt.length > 30) return bad(400, '取件码 / 订单号需要 1–30 个字');
        oS.code = txt;
        markStep(oS, st, txt, body.photo_key || '');
      } else {
        markStep(oS, st, body.text || '', body.photo_key || '');
      }
      return ok({ order: pubOrder(oS) });
    }
    if (path === '/orders/deliver' && method === 'POST') {
      var oD = db.orders[body.id];
      if (!oD) return bad(404, '订单不在了');
      if (oD.claimer_id !== db.me.id) return bad(403, '只有接单的人可以标记送达');
      if (oD.status !== 'connected') return bad(400, '这单还没建联，不能送达');
      oD.status = 'delivered';
      oD.delivered_at = nowISO();
      oD.proof_key = body.proof_key || '';
      oD.updated_at = nowISO();
      pushNotif(oD, 'delivered', '已经送到楼里');
      return ok({ order: pubOrder(oD) });
    }
    if (path === '/orders/complete' && method === 'POST') {
      var oC = db.orders[body.id];
      if (!oC) return bad(404, '订单不在了');
      if (oC.creator_id !== db.me.id) return bad(403, '只有发布的人可以确认收到');
      if (oC.status !== 'delivered') return bad(400, '对方还没标记送达');
      var before = db.ledger.length;
      completeOrder(oC);
      return ok({
        order: pubOrder(oC),
        reward: { points: oC.points, positive: false },
        ledger: ledgerFor()
      });
    }
    if (path === '/routes') {
      var actives = db.routes.filter(function (c) { return c.status === 'active'; });
      var waiting = db.routes.filter(function (c) { return c.status === 'waiting' && c.user_id === db.me.id; });
      var mineCard = db.routes.filter(function (c) { return c.user_id === db.me.id && c.status === 'active'; })[0] || null;
      return ok({ active: actives, waiting: waiting, mine: mineCard, my_active: mineCard });
    }
    if (path === '/routes/create' && method === 'POST') {
      db.routes.forEach(function (c) { if (c.status === 'active') c.status = 'waiting'; });
      var card = {
        id: 'r_' + (++db.seq), user_id: db.me.id, floor: db.users[db.me.id].floor,
        time_label: String(body.time_label || '18:00–18:30').slice(0, 20),
        from_place: String(body.from_place || '驿站').slice(0, 20),
        to_place: '6 号楼',
        capacity: Math.min(5, Math.max(1, Number(body.capacity) || 2)),
        status: 'active',
        active_until: new Date(now() + 7200000).toISOString(),
        created_at: nowISO()
      };
      db.routes.push(card);
      return ok({ card: card });
    }
    if (path === '/routes/withdraw' && method === 'POST') {
      var cw = null;
      db.routes.forEach(function (c) { if (c.id === body.id && c.user_id === db.me.id) cw = c; });
      if (!cw) return bad(404, '这张卡不在了');
      cw.status = 'withdrawn';
      return ok({ ok: true });
    }
    if (path === '/messages' && method === 'GET') {
      var ms = db.messages.filter(function (m) { return m.order_id === q.order_id; });
      var ord = db.orders[q.order_id];
      if (!ord || (ord.creator_id !== db.me.id && ord.claimer_id !== db.me.id)) return bad(403, '只有订单双方可以看消息');
      return ok({ messages: ms });
    }
    if (path === '/messages/send' && method === 'POST') {
      var oMsg = db.orders[body.order_id];
      if (!oMsg) return bad(404, '订单不在了');
      if (oMsg.creator_id !== db.me.id && oMsg.claimer_id !== db.me.id) return bad(403, '只有订单双方可以发消息');
      if (['claimed', 'connected', 'delivered'].indexOf(oMsg.status) < 0) return bad(400, '订单已结束，临时会话已关闭');
      var text = String(body.body || '').trim();
      if (!text) return bad(400, '消息不能为空');
      addMessage(oMsg.id, db.me.id, text.slice(0, 40));
      var last = db.messages[db.messages.length - 1];
      return ok({ message: last });
    }
    if (path === '/upload' && method === 'POST') {
      var fd = body;
      var file = null;
      try { file = fd && fd.get ? fd.get('file') : null; } catch (e) { file = null; }
      if (!file) return bad(400, '没有收到文件');
      return fileToDataURL(file).then(function (url) {
        return ok({ key: url || '', url: url || '' });
      });
    }
    return bad(404, '没有这个接口：' + path);
  }

  function publicStats() {
    var m = pubMe();
    return {
      helped: m ? m.helped_count : 0,
      received: m ? m.received : 0,
      points: m ? m.points : 0,
      owed: m ? m.owed : 0
    };
  }
  function syncPayload() {
    var u = db.me ? db.users[db.me.id] : null;
    var active = db.routes.filter(function (c) { return c.status === 'active'; });
    var waiting = db.routes.filter(function (c) { return c.status === 'waiting' && c.user_id === (u && u.id); });
    var mineCard = db.routes.filter(function (c) { return c.user_id === (u && u.id) && c.status === 'active'; })[0] || null;
    var floorUsers = Object.keys(db.users).map(function (k) { return db.users[k]; }).map(pubUser);
    return {
      server_time: nowISO(),
      me: u ? {
        id: u.id, name: u.name, points: u.points,
        owed: db.ledger.filter(function (l) { return l.from_id === u.id; }).reduce(function (s, l) { return s + Math.abs(l.delta); }, 0),
        helped: myOrders().filter(function (o) { return o.status === 'done' && o.claimer_id === u.id; }).length,
        received: myOrders().filter(function (o) { return o.status === 'done' && o.creator_id === u.id; }).length,
        floor: u.floor, avatar: u.avatar, room_no: u.room_no, show_real_name: u.show_real_name
      } : null,
      building: BUILDING,
      floor_users: floorUsers,
      open_orders: openOrders().map(pubOrder),
      my_orders: myOrders().map(pubOrder),
      active_routes: active,
      waiting_routes: waiting,
      my_active_route: mineCard,
      notifications: db.notifs.slice(-8),
      ledger: ledgerFor(),
      guide: { first_visit: true }
    };
  }

  var SESSION_KEY = 'ly_devmock_session_v1';
  function saveSession(token, u) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        token: token,
        user: {
          id: u.id, name: u.name, nickname: u.nickname, real_name: u.real_name, avatar: u.avatar,
          floor: u.floor, room_no: u.room_no, show_real_name: u.show_real_name, points: u.points,
          building_id: 'b_6', is_demo: 0
        }
      }));
    } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function restoreSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || !s.token || !s.user || !s.user.id) return;
      var u = s.user;
      u.is_demo = 0;
      db.users[u.id] = u;
      db.me = u;
      db.tokens[s.token] = u.id;
      db.__token = s.token;
    } catch (e) {}
  }

  reset();
  restoreSession();
  window.__LY_DEVMOCK = {
    fetch: fetch,
    reset: function () { reset(); clearSession(); db.me = null; db.__token = ''; },
    state: function () { return db; }
  };
  try { console.info('[柳荫册] devmock 已启用：数据只在浏览器内存里，刷新即重置。'); } catch (e) {}
})();

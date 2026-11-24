/* 柳荫册 · 6 号楼 · 单页应用（对齐小程序）
   原生 JS，无框架。hash 路由 + 2 秒轮询 + 手写渲染。
   路由：#/login #/home #/route #/route-form #/post #/orders #/order/:id #/me #/profile */
(function () {
  'use strict';

  var API = '/api/liuyin';
  var TOKEN_KEY = 'ly_token';
  var GUIDE_KEY = 'ly_guide_seen';
  var POLL_MS = 2000;
  var BUILDING_FIXED = '6 号楼';
  var PRESETS = ['sage', 'peach', 'ochre', 'clay', 'blue', 'plum'];

  var CATS = [
    { name: '取快递', sub: '取件码 / 快递柜', from: ['菜鸟驿站', '快递柜', '顺丰点', '校门口'] },
    { name: '带饭', sub: '食堂 / 外卖柜', from: ['食堂一楼', '食堂二楼', '外卖柜', '校外商家'] },
    { name: '送东西', sub: '楼里 / 教学楼', from: ['宿舍楼', '教学楼', '图书馆', '校门口'] },
    { name: '倒垃圾', sub: '本层 / 楼下', from: ['本层垃圾房', '楼下垃圾站'] },
    { name: '自定义', sub: '从步骤库选', from: ['楼里', '教学楼', '校门口'] }
  ];
  var CAT2TPL = { '取快递': 'pickup', '带饭': 'food', '送东西': 'deliver', '倒垃圾': 'trash', '自定义': 'custom' };
  var TIME_CHIPS = ['现在', '30 分钟内', '18:10 前', '18:30 前'];
  var QUICK_WORDS = ['我到了', '放门口', '稍等', '联系不上'];
  var RT_TIMES = ['12:00–12:30', '18:00–18:30'];
  var RT_FROMS = ['驿站', '食堂', '教学楼', '东门'];
  var NICK_POOL = ['路过的小柳', '三楼的阿念', '傍晚的阿青', '楼下的小满', '刚回来的阿禾', '顺路的阿梧'];

  var ERRORS = [];
  var noop = function () {};

  var S = {
    token: null,
    me: null,
    building: { name: BUILDING_FIXED, lit: 18, target: 30, code: '' },
    stats: { helped: 0, received: 0 },
    ledger: [],
    floorUsers: [],
    openOrders: [],
    myOrders: [],
    routes: { active: [], waiting: [], my_active: null },
    route: 'login',
    orderId: null,
    detail: null,
    detailSig: '',
    notFound: false,
    messages: [],
    confirm: { mine: false, other: false },
    ordersTab: 'posted',
    homeFilter: 'all',
    post: { category: '', pickup: '', pickupCustomOn: false, pickupCustom: '', time: '', points: 2, note: '', size: '', need_code: false },
    routeForm: { time: '18:00–18:30', timeCustomOn: false, timeCustom: '', from: '驿站', fromCustomOn: false, fromCustom: '', cap: 2, capCustomOn: false, capCustom: '' },
    profile: null,
    loginName: '',
    loginFloor: 3,
    loginBusy: false,
    posting: false,
    savingProfile: false,
    serverOffset: 0,
    lastSyncAt: '',
    firstSync: true,
    notifSeen: {},
    guideHidden: false,
    chatDraft: '',
    codeDraft: {},
    stepPhoto: {},
    rewardSeen: {},
    modal: null,
    busy: false,
    pollTimer: null,
    cdTimer: null,
    rewardTimer: null
  };

  var phone = document.getElementById('phone');
  var topbar = document.getElementById('topbar');
  var stage = document.getElementById('stage');
  var bottombar = document.getElementById('bottombar');
  var tabbar = document.getElementById('tabbar');
  var fab = document.getElementById('fab');
  var fabScrim = document.getElementById('fab-scrim');
  var toastEl = document.getElementById('toast');
  var netbar = document.getElementById('netbar');
  var overlay = document.getElementById('overlay');

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function firstChar(s) { var a = Array.from(String(s || '')); return a.length ? a[0] : '·'; }
  function charLen(s) { return Array.from(String(s || '')).length; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function toMs(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    var t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  function nowServer() { return Date.now() + num(S.serverOffset); }
  function mmss(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function clock(iso) {
    var t = toMs(iso); if (!t) return '';
    var d = new Date(t);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function dayText(iso) {
    var t = toMs(iso); if (!t) return '';
    var d = new Date(t), n = new Date();
    if (d.toDateString() === n.toDateString()) return '今天';
    var y = new Date(n.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) return '昨天';
    return (d.getMonth() + 1) + '-' + d.getDate();
  }
  function timeAgo(iso) {
    if (!iso) return '';
    var t = toMs(iso); if (!t) return '';
    var diff = (Date.now() - t) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    return dayText(iso) + ' ' + clock(iso);
  }
  function fileURL(key) {
    if (!key) return '';
    var s = String(key);
    if (/^(https?:|data:)/.test(s)) return s;
    return API + '/file?key=' + encodeURIComponent(s);
  }
  function buildingName() { return (S.building && S.building.name) || BUILDING_FIXED; }
  function presetFor(name) {
    var s = String(name || '邻'), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PRESETS[h % PRESETS.length];
  }
  function avatarHTML(u, cls) {
    u = u || {};
    var name = u.name || u.nickname || '邻';
    var av = String(u.avatar || '');
    var c = 'ava' + (cls ? ' ' + cls : '');
    if (av.indexOf('preset:') === 0) {
      var p = av.slice(7);
      if (PRESETS.indexOf(p) < 0) p = presetFor(name);
      return '<span class="' + c + ' p-' + p + '" aria-hidden="true">' + esc(firstChar(name)) + '</span>';
    }
    if (av) return '<span class="' + c + ' has-img"><img src="' + esc(fileURL(av)) + '" alt="" loading="lazy"></span>';
    return '<span class="' + c + ' p-' + presetFor(name) + '" aria-hidden="true">' + esc(firstChar(name)) + '</span>';
  }
  function meName() { return (S.me && (S.me.name || S.me.nickname)) || '楼里的邻居'; }
  function myRoom() {
    var r = buildingName() + ' · ' + num(S.me && S.me.floor) + ' 层';
    if (S.me && S.me.room_no) r += ' · ' + S.me.room_no;
    return r;
  }

  /* ---------------- 请求层 ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    var body = opts.body;
    var isForm = (typeof FormData !== 'undefined') && (body instanceof FormData);
    if (body !== undefined && body !== null && !isForm) headers['content-type'] = 'application/json';
    if (S.token) headers['x-ly-token'] = S.token;
    var doFetch = (window.__LY_DEVMOCK && typeof window.__LY_DEVMOCK.fetch === 'function')
      ? window.__LY_DEVMOCK.fetch
      : function (u, o) { return window.fetch(u, o); };
    return Promise.resolve(doFetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      cache: 'no-store'
    })).catch(function () {
      var e = new Error('网络不太好，重试中…');
      e.network = true;
      throw e;
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (err) { j = null; }
        if (res.status === 401) {
          var e401 = new Error((j && (j.error || j.message)) || '登录已失效');
          e401.status = 401;
          throw e401;
        }
        if (!res.ok || (j && j.ok === false)) {
          var e2 = new Error((j && (j.error || j.message)) || ('请求没成功（' + res.status + '）'));
          e2.status = res.status;
          throw e2;
        }
        if (j && j.ok === true && Object.prototype.hasOwnProperty.call(j, 'data')) return j.data;
        return j;
      });
    });
  }
  function post(path, payload) {
    return api(path, { method: 'POST', body: JSON.stringify(payload || {}) });
  }
  function errText(e) {
    if (!e) return '出了点问题，再试一次';
    if (e.network) return '网络不太好，重试中…';
    if (e.status === 401) return '登录已失效，重新进楼';
    if (e.status === 404) return '没找到这一单';
    if (e.status === 429) return '操作太快了，歇一会儿再试';
    return e.message || '出了点问题，再试一次';
  }
  function fail(e) {
    if (e && e.status === 401) { handle401(); return; }
    if (e && e.network) netOn();
    toast(errText(e));
  }

  /* ---------------- 提示 / 弹层 ---------------- */
  var toastTimer = null;
  function toast(msg, ms) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.hidden = true; }, 240);
    }, ms || 2400);
  }
  var netToastAt = 0;
  function netOn() {
    if (netbar) netbar.hidden = false;
    if (Date.now() - netToastAt > 15000) { netToastAt = Date.now(); toast('网络不太好，重试中…'); }
  }
  function netOff() { if (netbar) netbar.hidden = true; }

  function closeOverlay() {
    if (!overlay) return;
    clearTimeout(S.rewardTimer);
    overlay.hidden = true;
    overlay.innerHTML = '';
    overlay.classList.remove('rewarding');
    S.modal = null;
  }
  function showModal(o) {
    if (!overlay) return;
    o = o || {};
    S.modal = o;
    overlay.hidden = false;
    overlay.classList.remove('rewarding');
    overlay.innerHTML = '<div class="modal-mask" data-action="a-modal-cancel"></div>'
      + '<div class="modal-card" role="dialog" aria-modal="true" aria-label="' + esc(o.title || '确认') + '">'
      + '<div class="modal-title">' + esc(o.title || '') + '</div>'
      + '<div class="modal-body">' + esc(o.body || '') + '</div>'
      + '<div class="modal-acts">'
      + (o.noCancel ? '' : '<button type="button" class="btn ghost" data-action="a-modal-cancel">取消</button>')
      + '<button type="button" class="btn' + (o.danger ? ' solid-danger' : '') + '" data-action="a-modal-ok">' + esc(o.okText || '确定') + '</button>'
      + '</div></div>';
  }
  function showReward(points, positive) {
    if (!overlay) return;
    S.modal = null;
    overlay.hidden = false;
    overlay.classList.add('rewarding');
    overlay.innerHTML = '<div class="reward">'
      + '<div class="reward-ring ' + (positive ? 'plus' : 'minus') + '"><span class="rw-sign">' + (positive ? '+' : '-') + '</span>'
      + '<span class="rw-num">' + num(points) + '</span></div>'
      + '<div class="rw-title">人情点 ' + (positive ? '+' : '-') + num(points) + '</div>'
      + '<div class="rw-sub">' + (positive ? '这次你帮了别人' : '这次有人帮了你') + '</div></div>';
    clearTimeout(S.rewardTimer);
    S.rewardTimer = setTimeout(closeOverlay, 2600);
  }

  /* ---------------- 状态 / 角色 ---------------- */
  var STATUS_LABEL = { pending: '待接', claimed: '待确认', connected: '进行中', delivered: '已送达', done: '已完成', cancelled: '已取消', released: '已释放' };
  function statusLabel(st) { return STATUS_LABEL[st] || '进行中'; }
  function badge(o) {
    var st = (o && o.status) || 'pending';
    return '<span class="badge st-' + esc(st) + '">' + esc(statusLabel(st)) + '</span>';
  }
  function roleOf(o) {
    if (!o) return 'guest';
    if (o.role === 'requester' || o.role === 'helper') return o.role;
    var mid = S.me && S.me.id;
    if (mid && o.creator_id && o.creator_id === mid) return 'requester';
    if (mid && o.claimer_id && o.claimer_id === mid) return 'helper';
    return 'guest';
  }
  function isReq(o) { return roleOf(o) === 'requester'; }
  function isHelper(o) { return roleOf(o) === 'helper'; }
  function isMine(o) { var r = roleOf(o); return r === 'requester' || r === 'helper'; }
  function otherUser(o) { return isReq(o) ? o.claimer : (isHelper(o) ? o.creator : null); }
  function personName(u, pendingMode) {
    if (!u) return '';
    return (pendingMode && u.nickname) ? u.nickname : (u.name || u.nickname || '楼里');
  }
  function statusTitle(o) {
    var role = roleOf(o), st = (o && o.status) || 'pending';
    if (st === 'pending') return role === 'requester' ? '已发到楼里，等一个顺路的人。' : '这单还在等人接。';
    if (st === 'claimed') return '有人接了。两边各点一次确认，这单才算数。';
    if (st === 'connected') return role === 'requester' ? '确认好了，等对方一件件办。' : '确认好了，按步骤来，一步步点完成。';
    if (st === 'delivered') return role === 'requester' ? '送到了。确认收到，这一单就记一笔。' : '已送达，等对方确认。';
    if (st === 'done') return '这一单走完了，账上记了一次人情点。';
    if (st === 'cancelled') return '这一单撤掉了，没有记人情点。';
    if (st === 'released') return '这单回到楼里了，还在等人接。';
    return '';
  }
  function orderTitle(o) { return (o.category || '顺路') + (o.size ? ' · ' + o.size : ''); }

  /* ---------------- 订单 / 顺路卡数据 ---------------- */
  function findOrder(id) {
    if (!id) return null;
    if (S.detail && S.detail.id === id) return S.detail;
    var lists = [S.myOrders, S.openOrders];
    for (var i = 0; i < lists.length; i++) {
      var l = lists[i] || [];
      for (var j = 0; j < l.length; j++) if (l[j] && l[j].id === id) return l[j];
    }
    return null;
  }
  function upsertOrder(o) {
    if (!o || !o.id) return;
    S.myOrders = (S.myOrders || []).filter(function (x) { return x.id !== o.id; });
    S.openOrders = (S.openOrders || []).filter(function (x) { return x.id !== o.id; });
    if (o.is_mine === true || isMine(o)) S.myOrders.unshift(o);
    else S.openOrders.unshift(o);
    if (S.detail && S.detail.id === o.id) S.detail = Object.assign({}, S.detail, o);
  }
  function mineOrdersAll() {
    /* released 的单会回到 open_orders，仍属于我；两处合并去重 */
    var map = {};
    arr(S.myOrders).concat(arr(S.openOrders)).forEach(function (o) {
      if (!o || !o.id) return;
      if (o.is_mine === true || isMine(o)) map[o.id] = o;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function pendingOrders() {
    /* released 与 pending 一样会回到楼里、可以被接 */
    return arr(S.openOrders).filter(function (o) {
      return o && (o.status === 'pending' || o.status === 'released') && !isMine(o);
    });
  }
  function doingOrders() {
    return mineOrdersAll().filter(function (o) {
      return ['pending', 'released', 'claimed', 'connected', 'delivered'].indexOf(o.status) >= 0;
    });
  }
  function doneOrders() {
    return mineOrdersAll().filter(function (o) { return o && o.status === 'done'; });
  }
  function cardUser(card) {
    if (!card) return {};
    var u = null;
    var list = arr(S.floorUsers);
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === card.user_id) { u = list[i]; break; }
    var n = card.name || card.user_name || (card.user && card.user.name) || (u && u.name) || '楼里';
    var f = card.floor || (u && u.floor) || 1;
    var a = card.avatar || (card.user && card.user.avatar) || (u && u.avatar) || '';
    return { name: n, nickname: (card.user && card.user.nickname) || (u && u.nickname) || n, floor: f, avatar: a, id: card.user_id || '' };
  }

  /* ---------------- 轮询 / 同步 ---------------- */
  function startPoll() { stopPoll(); S.pollTimer = setInterval(pollTick, POLL_MS); }
  function stopPoll() { if (S.pollTimer) { clearInterval(S.pollTimer); S.pollTimer = null; } }
  function pollTick() {
    if (document.hidden) return;
    if (!S.token || !S.me) return;
    if (S.busy) return;
    S.busy = true;
    var p = (S.route === 'order' && S.orderId) ? refreshDetail() : syncOnce();
    Promise.resolve(p).catch(noop).then(function () { S.busy = false; });
  }

  function applyBuilding(b) {
    if (!b) return;
    if (typeof b === 'string') { S.building.name = b; return; }
    S.building = Object.assign({}, S.building, b);
  }
  function setMe(u, b) {
    if (u && typeof u === 'object') {
      S.me = Object.assign({}, S.me || {}, u);
      S.me.points = num(S.me.points);
      S.me.owed = num(S.me.owed);
      S.me.floor = num(S.me.floor) || S.me.floor || 1;
      if (S.me.helped !== undefined) S.stats.helped = num(S.me.helped);
      if (S.me.received !== undefined) S.stats.received = num(S.me.received);
    }
    applyBuilding(b);
  }
  function isAdmin() {
    var u = S.me || {};
    return !!(u.is_admin || u.isAdmin || u.admin || u.role === 'admin');
  }
  function addLedger(list) {
    var l = arr(list).filter(function (x) { return x && x.delta !== undefined; });
    if (l.length) S.ledger = l;
  }
  function applyMePayload(m) {
    if (!m) return;
    var u = m.user || (m.id ? m : null);
    if (u) setMe(u, m.building);
    addLedger(m.ledger || m.my_ledger || (m.stats && m.stats.ledger));
    if (m.stats) {
      if (m.stats.helped !== undefined) S.stats.helped = num(m.stats.helped);
      if (m.stats.received !== undefined) S.stats.received = num(m.stats.received);
      if (m.stats.points !== undefined && S.me) S.me.points = num(m.stats.points);
    }
  }
  function applySync(d) {
    d = d || {};
    netOff();
    if (d.server_time) { S.serverOffset = toMs(d.server_time) - Date.now(); S.lastSyncAt = d.server_time; }
    if (d.me) setMe(d.me);
    if (d.building) applyBuilding(d.building);
    if (Array.isArray(d.floor_users)) S.floorUsers = d.floor_users;
    if (Array.isArray(d.open_orders)) S.openOrders = d.open_orders;
    if (Array.isArray(d.my_orders)) S.myOrders = d.my_orders;
    if (Array.isArray(d.active_routes) || Array.isArray(d.waiting_routes)) {
      S.routes = {
        active: arr(d.active_routes),
        waiting: arr(d.waiting_routes),
        my_active: d.my_active_route || S.routes.my_active || null
      };
    }
    if (d.ledger || d.my_ledger) addLedger(d.ledger || d.my_ledger);
    if (d.stats) {
      if (d.stats.helped !== undefined) S.stats.helped = num(d.stats.helped);
      if (d.stats.received !== undefined) S.stats.received = num(d.stats.received);
    }
    if (d.me) {
      if (d.me.helped !== undefined) S.stats.helped = num(d.me.helped);
      if (d.me.received !== undefined) S.stats.received = num(d.me.received);
    }
    handleNotifications(arr(d.notifications));
  }
  function syncOnce() {
    if (!S.token || !S.me) return Promise.resolve();
    var q = '/sync';
    if (S.lastSyncAt) q += '?since=' + encodeURIComponent(S.lastSyncAt);
    return api(q).then(function (d) {
      applySync(d);
      S.firstSync = false;
      updateLive();
    }).catch(function (e) {
      if (e && e.status === 401) { handle401(); return; }
      netOn();
      throw e;
    });
  }
  function handleNotifications(list) {
    var last = null;
    list.forEach(function (n) {
      if (!n) return;
      var key = String(n.type) + '|' + String(n.order_id) + '|' + String(n.at || n.created_at || '');
      if (S.notifSeen[key]) return;
      S.notifSeen[key] = true;
      if (n.type === 'message') return;
      var at = toMs(n.at || n.created_at || n.time);
      if (at && Date.now() - at > 90000) return; /* 太旧的提醒不弹，避免动作后冒出隔夜通知 */
      last = n;
    });
    if (!last || S.firstSync) return;
    var text = last.text || {
      pending: '楼里又有新的顺手事',
      claimed: '有人接了你的单',
      connected: '两边确认好了',
      delivered: '已经送到楼里',
      done: '这一单完成了',
      auto_done: '这一单自动完成了',
      cancelled: '有一单取消了',
      released: '这单回到楼里了',
      system: ''
    }[last.type] || '';
    if (text) toast(text);
  }
  function handle401() {
    stopPoll();
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    S.token = null;
    S.me = null;
    S.myOrders = [];
    S.openOrders = [];
    S.floorUsers = [];
    S.detail = null;
    S.orderId = null;
    S.messages = [];
    S.ledger = [];
    S.routes = { active: [], waiting: [], my_active: null };
    S.firstSync = true;
    S.lastSyncAt = '';
    toast('登录已失效，重新进楼');
    showLogin(true);
  }

  /* ---------------- 渲染基座 ---------------- */
  function paint(html, opts) {
    opts = opts || {};
    var a = document.activeElement;
    var aid = (a && a.id) ? a.id : '';
    var sel = null;
    if (aid) { try { sel = [a.selectionStart, a.selectionEnd]; } catch (e) {} }
    var top = opts.reset ? 0 : stage.scrollTop;
    stage.innerHTML = html;
    stage.scrollTop = top;
    if (aid) {
      var el = document.getElementById(aid);
      if (el) {
        try {
          el.focus();
          if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]);
        } catch (e) {}
      }
    }
  }
  function setBottom(html) {
    if (!bottombar) return;
    if (!html) { bottombar.hidden = true; bottombar.innerHTML = ''; return; }
    bottombar.hidden = false;
    bottombar.innerHTML = '<div class="bb-inner">' + html + '</div>';
  }
  function busyBtn(t, label) {
    if (!t) return noop;
    var old = t.innerHTML;
    try {
      t.disabled = true;
      t.classList.add('is-loading');
      if (label) t.textContent = label;
    } catch (e) {}
    return function () {
      try { t.disabled = false; t.classList.remove('is-loading'); t.innerHTML = old; } catch (e) {}
    };
  }

  var TAB_ROUTES = ['home', 'route', 'orders', 'me'];
  function chrome(mode) {
    var login = mode === 'login';
    var hideTab = login || mode === 'order' || mode === 'profile' || mode === 'route-form';
    if (topbar) topbar.hidden = login;
    if (tabbar) tabbar.hidden = hideTab;
    if (fab) fab.hidden = !(mode === 'home' || mode === 'route');
    if (fabScrim) {
      /* FAB 下方的渐隐条：让列表在按钮处自然淡出，同时留出可滚动安全区 */
      fabScrim.hidden = !(mode === 'home' || mode === 'route');
    }
    if (login) {
      if (topbar) topbar.innerHTML = '';
      setBottom('');
    }
    if (tabbar && !hideTab) {
      Array.prototype.forEach.call(tabbar.querySelectorAll('.tab'), function (b) {
        var on = b.getAttribute('data-route') === mode;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
    }
    if (!login) renderTopbar(mode);
  }
  function renderTopbar(mode) {
    mode = mode || S.route;
    var html = '';
    var back = function (to, label) {
      return '<button type="button" class="tb-back" data-action="a-back" data-to="' + to + '" aria-label="' + esc(label) + '">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>';
    };
    var head = function (kicker, title) {
      return '<div class="tb-left"><div class="tb-txt"><div class="tb-kicker">' + esc(kicker) + '</div>'
        + '<div class="tb-title">' + esc(title) + '</div></div></div>';
    };
    if (mode === 'home') {
      html = '<div class="tb-row">' + head('楼里 · 今天', '柳荫册')
        + '<div class="tb-right"><span class="tb-pill">' + esc(buildingName()) + ' · ' + num(S.me && S.me.floor) + ' 层</span>'
        + '<button type="button" class="tb-icon" data-action="go" data-route="orders" aria-label="消息">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v11H9l-3 3z"/><path d="M9 9h6M9 12h4"/></svg>'
        + (needConfirmDot() ? '<i class="dot"></i>' : '') + '</button></div></div>';
    } else if (mode === 'route') {
      html = '<div class="tb-row">' + head('一趟一张卡', '顺路') + '</div>';
    } else if (mode === 'orders') {
      html = '<div class="tb-row">' + head('我发布的、我接的', '订单') + '</div>';
    } else if (mode === 'me') {
      html = '<div class="tb-row">' + head(buildingName(), '我的') + '</div>';
    } else if (mode === 'post') {
      html = '<div class="tb-row"><div class="tb-left">' + back('home', '回到楼里') + '<div class="tb-txt">'
        + '<div class="tb-kicker">楼里 · 发一条</div><div class="tb-title">发一条</div></div></div></div>';
    } else if (mode === 'route-form') {
      html = '<div class="tb-row"><div class="tb-left">' + back('route', '回到顺路') + '<div class="tb-txt">'
        + '<div class="tb-kicker">顺路 · 挂卡</div><div class="tb-title">挂顺路卡</div></div></div></div>';
    } else if (mode === 'profile') {
      html = '<div class="tb-row"><div class="tb-left">' + back('me', '回到我的') + '<div class="tb-txt">'
        + '<div class="tb-kicker">我的 · 档案</div><div class="tb-title">编辑档案</div></div></div></div>';
    } else if (mode === 'order') {
      var st = S.detail ? statusLabel(S.detail.status) : '';
      html = '<div class="tb-row"><div class="tb-left">' + back('home', '回到楼里') + '<div class="tb-txt">'
        + '<div class="tb-kicker">订单 · ' + esc(st) + '</div><div class="tb-title">订单详情</div></div></div></div>';
    }
    if (topbar.innerHTML !== html) topbar.innerHTML = html;
  }
  function needConfirmDot() {
    /* 红点 = 有还在等我确认的建联（/sync 不返回逐单确认态，取保守判断） */
    return arr(S.myOrders).some(function (o) {
      return !!(o && o.status === 'claimed' && isMine(o));
    });
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var id = parts[1] || '';
    try { id = decodeURIComponent(id); } catch (e) {}
    return { name: parts[0] || '', id: id };
  }
  function go(name, id, replace) {
    var h = '#/' + name + (id ? '/' + encodeURIComponent(id) : '');
    if (location.hash === h) { route(); return; }
    if (replace) {
      try {
        history.replaceState(null, '', location.pathname + location.search + h);
        route();
      } catch (e) { location.hash = h; }
    } else {
      location.hash = h;
    }
  }
  function stopCountdown() { if (S.cdTimer) { clearInterval(S.cdTimer); S.cdTimer = null; } }
  function startCountdown() {
    stopCountdown();
    S.cdTimer = setInterval(function () {
      var el = document.getElementById('d-countdown');
      if (!el) return;
      var ms = countdownMs();
      var tail = document.getElementById('d-cd-tail');
      if (ms > 0) {
        el.textContent = mmss(ms);
        if (tail) tail.textContent = '内确认 · 超时释放回池，不扣点';
        el.classList.remove('is-over');
      } else {
        el.textContent = '已超时';
        if (tail) tail.textContent = ' · 超时释放回池，不扣点';
        el.classList.add('is-over');
      }
    }, 1000);
  }
  function countdownMs() {
    var d = S.detail;
    if (!d || !d.conn_deadline) return 0;
    return Math.max(0, toMs(d.conn_deadline) - nowServer());
  }
  function leaveDetail() {
    S.orderId = null;
    S.detail = null;
    S.notFound = false;
    S.messages = [];
    S.confirm = { mine: false, other: false };
    S.chatDraft = '';
    S.codeDraft = {};
    S.stepPhoto = {};
    S.detailSig = '';
    stopCountdown();
    setBottom('');
  }
  function route() {
    if (!S.token || !S.me) { showLogin(); return; }
    var r = parseHash();
    var name = r.name || 'home';
    if (name === 'login') { go('home', null, true); return; }
    if (name === 'order') {
      if (!r.id) { go('orders', null, true); return; }
      if (S.route !== 'order' || S.orderId !== r.id) openOrder(r.id);
      return;
    }
    if (TAB_ROUTES.indexOf(name) < 0 && name !== 'post' && name !== 'route-form' && name !== 'profile') {
      go('home', null, true); return;
    }
    if (S.route === 'order') leaveDetail();
    stopCountdown();
    S.route = name;
    S.orderId = null;
    chrome(name);
    if (name === 'home') { renderHome(true); syncOnce().catch(noop); }
    else if (name === 'route') { renderRoute(true); syncOnce().catch(noop); }
    else if (name === 'orders') { renderOrders(true); syncOnce().catch(noop); }
    else if (name === 'me') { renderMe(true); syncOnce().catch(noop); }
    else if (name === 'post') { renderPost(true); }
    else if (name === 'route-form') { renderRouteForm(true); }
    else if (name === 'profile') {
      S.profile = {
        nickname: (S.me && (S.me.nickname || S.me.name)) || '',
        real_name: (S.me && S.me.real_name) || '',
        avatar: (S.me && S.me.avatar) || '',
        avatarPreview: '',
        floor: num(S.me && S.me.floor) || 3,
        room_no: (S.me && S.me.room_no) || '',
        show_real_name: S.me ? S.me.show_real_name !== 0 : true
      };
      renderProfile(true);
    }
  }
  function updateLive() {
    if (S.route === 'home') renderHome(false);
    else if (S.route === 'route') renderRoute(false);
    else if (S.route === 'orders') renderOrders(false);
    else if (S.route === 'me') renderMe(false);
    renderTopbar(S.route);
  }

  /* ---------------- 进楼 ---------------- */
  function loginHTML() {
    var floors = [1, 2, 3, 4, 5, 6].map(function (n) {
      var on = num(S.loginFloor) === n;
      return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-pick-floor" data-v="' + n + '" aria-pressed="' + on + '">' + n + ' 层</button>';
    }).join('');
    return '<div class="page login">'
      + '<div class="brand"><div class="brand-mark">柳荫册</div>'
      + '<div class="brandsub">' + esc(buildingName()) + ' · 一层楼的人</div>'
      + '<p class="lead">一层楼的人，互相搭把手。<br>写个名字，就能进楼。</p></div>'
      + '<div class="login-form">'
      + '<div class="field"><label class="flabel" for="login-name">名字</label>'
      + '<input class="inp" id="login-name" maxlength="20" placeholder="楼里怎么称呼你" value="' + esc(S.loginName) + '" autocomplete="nickname" enterkeyhint="go">'
      + '<div class="fnote">重名会自动带上编号，比如「小柳(2)」。</div></div>'
      + '<div class="field"><div class="flabel">住几层</div><div class="picks floors6">' + floors + '</div></div>'
      + '<div class="err-bar" id="login-err" hidden role="alert"></div>'
      + '<button type="button" class="btn" id="login-btn" data-action="a-login">进楼</button>'
      + '<button type="button" class="linkbtn look" data-action="a-watch">先随便看看 →</button>'
      + '</div>'
      + '<div class="login-foot">演示版 · 数据只用于本次体验</div>'
      + '</div>';
  }
  function showLogin() {
    stopPoll();
    stopCountdown();
    S.route = 'login';
    S.orderId = null;
    try {
      if (location.hash !== '#/login') history.replaceState(null, '', location.pathname + location.search + '#/login');
    } catch (e) {}
    chrome('login');
    paint(loginHTML(), { reset: true });
  }
  function loginErr(msg) {
    var el = $('login-err');
    if (el) { el.hidden = !msg; el.textContent = msg || ''; }
    if (msg) toast(msg);
  }
  function doLogin() {
    if (S.loginBusy) return;
    var input = $('login-name');
    var name = (input ? input.value : (S.loginName || '')).trim();
    S.loginName = name;
    if (!name) { loginErr('先写个名字吧'); return; }
    if (charLen(name) > 20) { loginErr('名字最多 20 个字'); return; }
    loginErr('');
    S.loginBusy = true;
    var btn = $('login-btn');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = '进楼中…'; }
    var asked = name;
    post('/login', { name: name, floor: num(S.loginFloor) || 3 })
      .then(function (d) {
        if (!d || !d.token) throw new Error('楼里没回应，稍后再试');
        S.token = d.token;
        try { localStorage.setItem(TOKEN_KEY, d.token); } catch (e) {}
        S.me = null;
        setMe(d.user || {}, d.building);
        S.firstSync = true;
        S.loginBusy = false;
        if (S.me && S.me.name && S.me.name !== asked) {
          toast('楼里已经有同名，你叫「' + S.me.name + '」');
        }
        try { if (localStorage.getItem(GUIDE_KEY) === '1') S.guideHidden = true; } catch (e) {}
        startPoll();
        go('home', null, true);
      })
      .catch(function (e) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (err) {}
        S.token = null;
        S.me = null;
        S.loginBusy = false;
        var b = $('login-btn');
        if (b) { b.disabled = false; b.classList.remove('is-loading'); b.textContent = '进楼'; }
        loginErr(errText(e));
      });
  }
  function doWatch() {
    if (S.loginBusy) return;
    var n = NICK_POOL[Math.floor(Math.random() * NICK_POOL.length)];
    S.loginName = n;
    S.loginFloor = 3;
    var input = $('login-name');
    if (input) input.value = n;
    Array.prototype.forEach.call(document.querySelectorAll('[data-action="a-pick-floor"]'), function (b) {
      var on = num(b.getAttribute('data-v')) === 3;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    });
    doLogin();
  }

  /* ---------------- 首页 · 楼里 ---------------- */
  function greetingWord() {
    var h = new Date().getHours();
    return h < 11 ? '早上好' : (h < 18 ? '下午好' : '晚上好');
  }
  function filteredPending() {
    var f = S.homeFilter;
    return pendingOrders().filter(function (o) { return f === 'all' || o.category === f; });
  }
  function filteredDoing() {
    var f = S.homeFilter;
    return doingOrders().filter(function (o) { return f === 'all' || o.category === f; });
  }
  function guideHTML() {
    if (S.guideHidden) return '';
    return '<div class="guide" role="note"><span class="guide-t">点「接」帮人带一次，或发一条试试。楼里的邻居会回应你。</span>'
      + '<button type="button" class="guide-x" data-action="a-close-guide" aria-label="关闭引导">×</button></div>';
  }
  function routeBriefHTML(card) {
    if (!card) return '<div class="empty">这栋楼还没有顺路卡。你可以先挂一张。</div>';
    var u = cardUser(card);
    return '<button type="button" class="card route-brief" data-action="go" data-route="route">'
      + avatarHTML(u)
      + '<span class="rb-main">'
      + '<span class="rb-top"><b>' + esc(personName(u)) + ' · ' + num(u.floor) + ' 层</b><span class="live">亮着</span></span>'
      + '<span class="rb-route">' + esc(card.time_label || '') + ' · ' + esc(card.from_place || '') + ' → ' + esc(card.to_place || buildingName()) + '</span>'
      + '<span class="rb-foot">可带 ' + num(card.capacity) + ' 件 · 不接单、不派单</span>'
      + '</span></button>';
  }
  function pendingCardHTML(o) {
    var u = o.creator || {};
    var released = o.status === 'released';
    return '<article class="card order-card pk-card" data-action="a-open-order" data-id="' + esc(o.id) + '">'
      + avatarHTML(u, 'sm')
      + '<div class="pk-main"><div class="pk-title">' + esc(personName(u, true)) + ' · ' + esc(orderTitle(o))
      + (released ? ' <span class="badge st-released">已释放</span>' : '') + '</div>'
      + '<div class="pk-meta">' + esc(o.pickup || '') + ' → ' + esc(buildingName()) + ' · ' + esc(o.time_label || '') + ' · ' + num(o.points) + ' 点</div></div>'
      + '<button type="button" class="take-btn" data-action="a-claim" data-id="' + esc(o.id) + '">接</button></article>';
  }
  function doingCardHTML(o) {
    var req = isReq(o);
    var u = req ? (S.me || {}) : (o.creator || {});
    return '<button type="button" class="card order-card doing-card" data-action="a-open-order" data-id="' + esc(o.id) + '">'
      + avatarHTML(u, 'sm')
      + '<span class="pk-main"><span class="pk-title">' + (req ? '我发布的 · ' : '我接的 · ') + esc(o.category || '') + '</span>'
      + '<span class="pk-meta">' + esc(o.pickup || '') + ' · ' + esc(o.time_label || '') + ' · ' + num(o.points) + ' 点</span></span>'
      + badge(o) + '</button>';
  }
  function homeHTML() {
    var pend = filteredPending();
    var doing = filteredDoing();
    var actives = arr(S.routes.active);
    var card = actives[0] || null;
    var count = pendingOrders().length + doingOrders().length;
    var chips = ['全部', '取快递', '带饭', '顺路'].map(function (c) {
      var on = S.homeFilter === (c === '全部' ? 'all' : c);
      return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-action="a-home-filter" data-v="' + esc(c) + '" aria-pressed="' + on + '">' + esc(c) + '</button>';
    }).join('');
    var body = '';
    body += '<div class="sec-row"><div class="sec">正在发生</div><span class="sec-n">' + (card ? '1 张顺路' : '0 张') + '</span></div>';
    body += routeBriefHTML(card);
    if (S.homeFilter === '顺路') {
      body += '<div class="card state-card"><div class="sc-title">顺路的，只是一句招呼</div>'
        + '<div class="sc-text">不接单、不派单、不承诺；看顺路页，或者自己也挂一张。</div>'
        + '<button type="button" class="btn ghost" data-action="go" data-route="route">去顺路页看看</button></div>';
    } else {
      body += '<div class="sec-row"><div class="sec">本楼待接</div><span class="sec-n">' + pend.length + ' 个</span></div>';
      body += pend.length ? '<div class="pending-wrap">' + pend.map(pendingCardHTML).join('') + '</div>'
        : '<div class="empty">这栋楼还没有待接的单。你可以先发一条。</div>';
      body += '<div class="sec-row"><div class="sec">进行中</div><span class="sec-n">' + doing.length + '</span></div>';
      body += doing.length ? '<div class="doing-list">' + doing.map(doingCardHTML).join('') + '</div>'
        : '<div class="empty">还没有进行中的单。</div>';
    }
    return '<div class="page fabspace">'
      + guideHTML()
      + '<div class="greet"><div class="greet-main"><div class="greet-hi">' + esc(greetingWord()) + '，' + esc(meName()) + '</div>'
      + '<p class="greet-sub">今天有 ' + count + ' 件顺手的事</p></div>'
      + '<div class="ring"><b>' + count + '</b><span>件</span></div></div>'
      + '<div class="chips" role="group" aria-label="筛选">' + chips + '</div>'
      + body
      + '</div>';
  }
  function renderHome(reset) {
    setBottom('');
    paint(homeHTML(), { reset: !!reset });
  }

  /* ---------------- 顺路 ---------------- */
  function routeCardFullHTML(card, mine) {
    var u = cardUser(card);
    return '<div class="card route-card">'
      + '<div class="rc-top">' + avatarHTML(u) + '<div class="rc-who"><b>' + esc(personName(u)) + ' · ' + num(u.floor) + ' 层</b>'
      + '<div class="rc-route">' + esc(card.time_label || '') + ' · ' + esc(card.from_place || '') + ' → ' + esc(card.to_place || buildingName()) + '</div></div>'
      + '<span class="live">亮着</span></div>'
      + '<div class="rc-foot"><span>可带 ' + num(card.capacity) + ' 件 · 2 小时后过期</span>'
      + (mine ? '<button type="button" class="linkbtn danger" data-action="a-withdraw-route" data-id="' + esc(card.id) + '" data-mine="1">今天不走了</button>' : '')
      + '</div></div>';
  }
  function routeHTML() {
    var actives = arr(S.routes.active);
    var card = actives[0] || null;
    var mine = S.routes.my_active || (card && S.me && cardUser(card).id === S.me.id ? card : null);
    var mineId = mine ? mine.id : '';
    var waiting = arr(S.routes.waiting);
    var rows = waiting.length ? waiting.map(function (c) {
      var u = cardUser(c);
      return '<div class="card wait-row"><div class="rc-top">' + avatarHTML(u, 'sm')
        + '<div class="rc-who"><b>' + esc(personName(u)) + ' · ' + num(u.floor) + ' 层</b>'
        + '<div class="rc-route">' + esc(c.time_label || '') + ' · ' + esc(c.from_place || '') + ' → ' + esc(c.to_place || buildingName()) + ' · 可带 ' + num(c.capacity) + ' 件</div></div>'
        + '<span class="badge st-claimed">候场</span></div>'
        + '<div class="rc-foot"><button type="button" class="linkbtn danger" data-action="a-withdraw-route" data-id="' + esc(c.id) + '">撤回</button></div></div>';
    }).join('') : '<div class="empty">没有候场卡。同一时刻只亮一张，其余会在这里排队。</div>';
    return '<div class="page fabspace">'
      + '<h1 class="h1">今天亮着一张。</h1>'
      + '<p class="sub">一趟一张卡，同一时刻只亮一张。</p>'
      + '<div class="sec-row"><div class="sec">亮着的卡</div><span class="sec-n">' + (card ? '1 张' : '0 张') + '</span></div>'
      + (card ? routeCardFullHTML(card, !!(mineId && card.id === mineId)) : '<div class="empty">今天还没有亮着的顺路卡。挂一张，让同楼的人看见。</div>')
      + '<div class="sec-row"><div class="sec">候场</div><span class="sec-n">' + waiting.length + ' 张</span></div>'
      + rows
      + '<button type="button" class="btn" style="margin-top:18px" data-action="go" data-route="route-form">挂一张顺路卡</button>'
      + '<p class="formnote">不接单、不派单、不承诺；候场不展示，亮起才算数。</p>'
      + '</div>';
  }
  function renderRoute(reset) {
    setBottom('');
    paint(routeHTML(), { reset: !!reset });
  }

  /* ---------------- 挂顺路卡 ---------------- */
  function routeFormHTML() {
    var f = S.routeForm;
    var html = '<div class="page">'
      + '<h1 class="h1">挂一张顺路卡。</h1><p class="sub">只写大概时段和路线，不写承诺。</p>';
    html += '<div class="field"><div class="flabel">什么时候<span class="flabel-r">只今天</span></div><div class="picks">'
      + RT_TIMES.map(function (t) {
        var on = !f.timeCustomOn && f.time === t;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-rt-time" data-v="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + '</button>';
      }).join('')
      + '<button type="button" class="pick' + (f.timeCustomOn ? ' on' : '') + '" data-action="a-rt-time" data-v="__custom" aria-pressed="' + f.timeCustomOn + '">自定义</button>'
      + '</div>'
      + (f.timeCustomOn ? '<input class="inp" id="rt-time" maxlength="20" placeholder="比如 17:40–18:05" value="' + esc(f.timeCustom) + '">' : '')
      + '</div>';
    html += '<div class="field"><div class="flabel">从哪走<span class="flabel-r">大致路线</span></div><div class="picks">'
      + RT_FROMS.map(function (t) {
        var on = !f.fromCustomOn && f.from === t;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-rt-from" data-v="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + '</button>';
      }).join('')
      + '<button type="button" class="pick' + (f.fromCustomOn ? ' on' : '') + '" data-action="a-rt-from" data-v="__custom" aria-pressed="' + f.fromCustomOn + '">自定义</button>'
      + '</div>'
      + (f.fromCustomOn ? '<input class="inp" id="rt-from" maxlength="20" placeholder="比如 西门菜鸟驿站" value="' + esc(f.fromCustom) + '">' : '')
      + '</div>';
    html += '<div class="field"><div class="flabel">可带几件<span class="flabel-r">1–5 件</span></div><div class="picks">'
      + [1, 2, 3].map(function (n) {
        var on = !f.capCustomOn && num(f.cap) === n;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-rt-cap" data-v="' + n + '" aria-pressed="' + on + '">' + n + ' 件</button>';
      }).join('')
      + '<button type="button" class="pick' + (f.capCustomOn ? ' on' : '') + '" data-action="a-rt-cap" data-v="__custom" aria-pressed="' + f.capCustomOn + '">自定义</button>'
      + '</div>'
      + (f.capCustomOn ? '<input class="inp" id="rt-cap" type="number" inputmode="numeric" maxlength="1" placeholder="能带几件？1–5" value="' + esc(f.capCustom) + '">' : '')
      + '</div>';
    html += '<p class="formnote">不接单、不派单、不承诺；一张卡 1–5 件，2 小时过期。</p></div>';
    return html;
  }
  function renderRouteForm(reset) {
    paint(routeFormHTML(), { reset: !!reset });
    setBottom('<button type="button" class="btn bb-btn" data-action="a-route-submit">挂出去</button>');
  }
  function routeFormEff() {
    var f = S.routeForm;
    var time = f.timeCustomOn ? (f.timeCustom || '').trim() : f.time;
    var from = f.fromCustomOn ? (f.fromCustom || '').trim() : f.from;
    var cap = f.capCustomOn ? Math.min(5, Math.max(1, num(f.capCustom) || 1)) : num(f.cap);
    return { time: time, from: from, cap: cap };
  }
  function submitRouteForm(t) {
    var e = routeFormEff();
    if (!e.time || !e.from) { toast('还差一步'); return; }
    var restore = busyBtn(t, '挂出中…');
    post('/routes/create', { time_label: e.time, from_place: e.from, capacity: e.cap })
      .then(function (d) {
        var card = d && d.card;
        if (card) {
          S.routes.active.unshift(card);
          S.routes.my_active = card;
        }
        syncOnce().catch(noop);
        toast('挂出去了');
        go('route', null, true);
      })
      .catch(function (err) { restore(); fail(err); });
  }

  /* ---------------- 发一条 ---------------- */
  function catByName(n) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].name === n) return CATS[i];
    return null;
  }
  function postEffPickup() {
    var p = S.post;
    return p.pickupCustomOn ? (p.pickupCustom || '').trim() : p.pickup;
  }
  function stepsHintHTML() {
    var p = S.post;
    if (!p.category) return '';
    var list;
    if (p.category === '取快递') list = ['取件码', '取到', '交付', '确认收到'];
    else if (p.category === '倒垃圾') list = ['已带走', '确认收到'];
    else if (p.category === '自定义') list = p.need_code ? ['取件码', '取到', '交付', '确认收到'] : ['取到', '交付', '确认收到'];
    else list = ['取到', '交付', '确认收到'];
    return '<div class="formnote">这单 ' + list.length + ' 步：' + list.join(' → ') + '</div>';
  }
  function postHTML() {
    var p = S.post;
    var cat = catByName(p.category);
    var cats = CATS.map(function (c) {
      var on = p.category === c.name;
      return '<button type="button" class="cat' + (on ? ' on' : '') + (c.name === '自定义' ? ' wide' : '') + '" data-action="a-post-cat" data-v="' + esc(c.name) + '" aria-pressed="' + on + '">'
        + '<span class="cat-name">' + esc(c.name) + '</span><span class="cat-sub">' + esc(c.sub) + '</span></button>';
    }).join('');
    var html = '<div class="page post">'
      + '<h1 class="h1">让人顺手带点什么？</h1><p class="sub">选一件事，选个时间，发出去。</p>'
      + '<div class="sec-row"><div class="sec">要带什么</div><span class="sec-n">先选一件</span></div>'
      + '<div class="cat-grid">' + cats + '</div>';

    if (!p.category) {
      html += '<div class="empty" style="margin-top:14px">先选一件事；选完才会出现地点、时间和点数。</div></div>';
      return html;
    }

    if (p.category === '自定义') {
      var on2 = !!p.need_code;
      html += '<div class="field switch-row"><div class="switch-main"><div class="flabel">需要取件码 / 订单号</div>'
        + '<div class="fnote">打开后，接单的人会等你先填。</div></div>'
        + '<button type="button" class="switch' + (on2 ? ' on' : '') + '" data-action="a-post-needcode" aria-pressed="' + on2 + '" aria-label="需要取件码或订单号"><i></i></button></div>';
    }

    html += stepsHintHTML();

    html += '<div class="field"><div class="flabel">从哪拿<span class="flabel-r">可自定义</span></div><div class="picks">'
      + (cat ? cat.from.map(function (t) {
        var on = !p.pickupCustomOn && p.pickup === t;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-post-pickup" data-v="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + '</button>';
      }).join('') : '')
      + '<button type="button" class="pick' + (p.pickupCustomOn ? ' on' : '') + '" data-action="a-post-pickup" data-v="__custom" aria-pressed="' + p.pickupCustomOn + '">自定义</button>'
      + '</div>'
      + (p.pickupCustomOn ? '<input class="inp" id="post-pickup" maxlength="40" placeholder="输入地点，比如东门保安亭" value="' + esc(p.pickupCustom) + '">' : '')
      + '</div>';

    if (p.category === '取快递') {
      html += '<div class="field"><div class="flabel">多大件<span class="flabel-r">方便对方判断</span></div><div class="picks">'
        + ['小件', '中件', '大件'].map(function (s) {
          var on = p.size === s;
          return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-post-size" data-v="' + esc(s) + '" aria-pressed="' + on + '">' + esc(s) + '</button>';
        }).join('') + '</div></div>';
    }

    html += '<div class="field"><div class="flabel">什么时候<span class="flabel-r">大概就行</span></div><div class="picks">'
      + TIME_CHIPS.map(function (t) {
        var on = p.time === t;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-post-time" data-v="' + esc(t) + '" aria-pressed="' + on + '">' + esc(t) + '</button>';
      }).join('') + '</div></div>';

    html += '<div class="field"><div class="flabel">给几点人情<span class="flabel-r">不是价格</span></div><div class="picks">'
      + [1, 2, 3].map(function (n) {
        var on = num(p.points) === n;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-post-points" data-v="' + n + '" aria-pressed="' + on + '">' + n + ' 点</button>';
      }).join('') + '</div>'
      + '<div class="fnote">2 点 ≈ 一次取快递；不用现在欠，之后顺手还。</div></div>';

    html += '<div class="field"><div class="flabel">加一句话<span class="flabel-r">可选</span></div>'
      + '<textarea class="inp textarea" id="post-note" maxlength="60" placeholder="比如“汤别洒，谢谢”">' + esc(p.note) + '</textarea>'
      + '<div class="counter"><span id="note-count">' + charLen(p.note) + '</span> / 60</div></div>';

    html += '</div>';
    return html;
  }
  function postValid() {
    return !!(S.post.category && postEffPickup() && S.post.time);
  }
  function renderPost(reset) {
    paint(postHTML(), { reset: !!reset });
    var p = S.post;
    var label = '发出去 · ' + (num(p.points) || 2) + ' 点人情';
    setBottom('<button type="button" class="btn bb-btn' + (postValid() ? '' : ' is-off') + '" data-action="a-post-submit">' + esc(label) + '</button>');
  }
  function submitPost(t) {
    if (S.posting) return;
    var p = S.post;
    var pickup = postEffPickup();
    if (!p.category || !pickup || !p.time) { toast('还差一步'); return; }
    if (charLen(p.note || '') > 60) { toast('一句话最多 60 个字'); return; }
    S.posting = true;
    var restore = busyBtn(t, '发布中…');
    post('/orders/create', {
      category: p.category,
      template_id: CAT2TPL[p.category] || 'custom',
      size: p.category === '取快递' ? (p.size || '中件') : '',
      pickup: pickup,
      time_label: p.time,
      points: num(p.points) || 2,
      note: (p.note || '').trim(),
      to_floor: num(S.me && S.me.floor) || 1,
      need_code: p.category === '取快递' ? true : (p.category === '自定义' ? !!p.need_code : false)
    }).then(function (d) {
      var o = d && d.order;
      S.posting = false;
      S.post = { category: '', pickup: '', pickupCustomOn: false, pickupCustom: '', time: '', points: 2, note: '', size: '', need_code: false };
      if (o) upsertOrder(o);
      toast('发出去了');
      syncOnce().catch(noop);
      go('order', o ? o.id : '', true);
    }).catch(function (e) {
      S.posting = false;
      restore();
      fail(e);
    });
  }

  /* ---------------- 订单列表 ---------------- */
  function ordersList() {
    var tab = S.ordersTab;
    return mineOrdersAll().filter(function (o) {
      if (!o) return false;
      if (tab === 'done') return o.status === 'done';
      if (tab === 'posted') return isReq(o) && o.status !== 'done';
      return isHelper(o) && o.status !== 'done';
    });
  }
  function orderRowHTML(o) {
    var tab = S.ordersTab;
    var prefix = tab === 'done' ? '' : (isReq(o) ? '我发布的 · ' : '我接的 · ');
    return '<button type="button" class="order-row" data-action="a-open-order" data-id="' + esc(o.id) + '">'
      + avatarHTML(isReq(o) ? (S.me || {}) : (o.creator || {}), 'sm')
      + '<span class="orr-main"><span class="orr-top"><span class="orr-title">' + esc(orderTitle(o)) + '</span>' + badge(o) + '</span>'
      + '<span class="orr-meta">' + esc(prefix) + esc(o.pickup || '') + ' → ' + esc(buildingName()) + ' · ' + esc(o.time_label || '') + ' · ' + num(o.points) + ' 点</span></span>'
      + '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>';
  }
  function ordersHTML() {
    var list = ordersList();
    var emptyText = S.ordersTab === 'posted' ? '还没有发布的单。发一条试试。'
      : (S.ordersTab === 'accepted' ? '还没有接的单。去楼里看看谁需要帮忙。' : '还没有完成的单。');
    var segs = [['posted', '我发布的'], ['accepted', '我接的'], ['done', '已完成']].map(function (s) {
      return '<button type="button" class="' + (S.ordersTab === s[0] ? 'on' : '') + '" data-action="a-orders-tab" data-v="' + s[0] + '" aria-pressed="' + (S.ordersTab === s[0]) + '">' + s[1] + '</button>';
    }).join('');
    return '<div class="page">'
      + '<h1 class="h1">这栋楼的事</h1><p class="sub">我发布的、我接的，分开看。</p>'
      + '<div class="seg" role="tablist">' + segs + '</div>'
      + (list.length ? '<div class="order-list">' + list.map(orderRowHTML).join('') + '</div>'
        : '<div class="empty" style="margin-top:14px">' + emptyText + '</div>'
        + '<button type="button" class="btn ghost" style="margin-top:16px" data-action="go" data-route="post">去发一条</button>')
      + '</div>';
  }
  function renderOrders(reset) {
    setBottom('');
    paint(ordersHTML(), { reset: !!reset });
  }

  /* ---------------- 订单详情 ---------------- */
  function openOrder(id) {
    S.route = 'order';
    S.orderId = id;
    S.detail = findOrder(id) || null;
    S.notFound = false;
    S.messages = [];
    S.confirm = { mine: false, other: false };
    S.chatDraft = '';
    S.codeDraft = {};
    S.stepPhoto = {};
    S.detailSig = '';
    chrome('order');
    renderTopbar('order');
    renderDetail(true, true);
    startCountdown();
    refreshDetail().catch(noop);
  }
  function mergeMessages(cur, incoming) {
    var seen = {};
    var out = [];
    (cur || []).concat(incoming || []).forEach(function (m) {
      if (!m) return;
      var k = String(m.id !== undefined ? m.id : (m.created_at + '|' + (m.body || m.text || '')));
      if (seen[k]) return;
      seen[k] = true;
      out.push(m);
    });
    out.sort(function (a, b) {
      var ta = toMs(a.created_at) || num(a.id), tb = toMs(b.created_at) || num(b.id);
      return ta - tb;
    });
    return out;
  }
  function refreshDetail() {
    var id = S.orderId;
    if (!id) return Promise.resolve();
    return api('/orders/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (S.orderId !== id) return;
      netOff();
      d = d || {};
      var prevStatus = (S.detail && S.detail.status) || '';
      if (d.server_time) S.serverOffset = toMs(d.server_time) - Date.now();
      if (d.order) { S.detail = d.order; upsertOrder(d.order); }
      if (Array.isArray(d.messages)) S.messages = mergeMessages(S.messages, d.messages);
      if (d.confirm) S.confirm = { mine: !!d.confirm.mine, other: !!d.confirm.other };
      /* 对方（或机器人邻居）确认收货时，帮忙方也应该看到一次奖励动画 */
      if (prevStatus && prevStatus !== 'done' && S.detail && S.detail.status === 'done' && !S.rewardSeen[S.detail.id]) {
        S.rewardSeen[S.detail.id] = 1;
        showReward(num(S.detail.points), !isReq(S.detail));
        if (isHelper(S.detail)) S.detailSig = '';
      }
      renderDetail(false);
      renderTopbar('order');
    }).catch(function (e) {
      if (e && e.status === 401) { handle401(); return; }
      if (e && e.status === 404) { S.detail = null; S.notFound = true; renderDetail(true, false); return; }
      if (e && e.network) netOn();
      throw e;
    });
  }
  function hasSteps(o) { return !!(o && Array.isArray(o.steps) && o.steps.length); }
  function visibleSteps(o) {
    var steps = arr(o.steps);
    var first = -1;
    for (var i = 0; i < steps.length; i++) if (steps[i].status !== 'done') { first = i; break; }
    return first < 0 ? steps : steps.slice(0, first + 1);
  }
  function remainingSteps(o) { return arr(o.steps).filter(function (s) { return s.status !== 'done'; }).length; }
  function stepOwnerMine(o, s) {
    return s.owner === (isReq(o) ? 'requester' : 'helper');
  }
  function prevStepsDone(o, idx) {
    var steps = arr(o.steps);
    for (var i = 0; i < idx; i++) if (steps[i].status !== 'done') return false;
    return true;
  }
  function stepCanAct(o, s) {
    if (!o || !s || s.status === 'done') return false;
    var idx = arr(o.steps).indexOf(s);
    if (s.type === 'confirm') return o.status === 'delivered' && isReq(o);
    if (o.status !== 'connected') return false;
    if (!isMine(o)) return false;
    if (!stepOwnerMine(o, s)) return false;
    return prevStepsDone(o, idx);
  }
  function stepStateText(o, s) {
    if (s.status === 'done') return '已完成';
    return stepCanAct(o, s) ? '该你了' : '等对方';
  }
  function heroHTML(o) {
    var pendingPrivacy = !isMine(o) && o.status === 'pending';
    var person = function (u, roleLabel) {
      var name = u ? personName(u, pendingPrivacy) : '';
      var label = !name ? '等接单' : (u && S.me && u.id === S.me.id ? '你' : name);
      return '<span class="person">' + avatarHTML(u || { name: '邻' }, 'sm') + '<span class="person-txt"><b>' + esc(label) + '</b><span>' + esc(roleLabel) + '</span></span></span>';
    };
    return '<div class="hero">'
      + '<div class="hero-top"><span class="badge st-' + esc(o.status) + '">' + esc(statusLabel(o.status)) + '</span>'
      + '<span class="hero-pts">' + num(o.points) + ' 点人情</span></div>'
      + '<h1 class="detail-title">' + esc(statusTitle(o)) + '</h1>'
      + '<p class="detail-lead">' + esc(orderTitle(o)) + ' · ' + esc(o.pickup || '') + ' → ' + esc(buildingName()) + '</p>'
      + '<div class="people">' + person(o.creator, '委托方') + '<span class="pl-line"></span>' + person(o.claimer, '接单方') + '</div>'
      + '<button type="button" class="linkbtn share-btn" data-action="a-share">分享这一单</button>'
      + '</div>';
  }
  function connCardHTML(o) {
    if (o.status !== 'claimed') return '';
    var ms = countdownMs();
    var mine = S.confirm.mine, other = S.confirm.other;
    var role = roleOf(o);
    var canExtend = isReq(o) && !o.conn_extended && ms > 0;
    var acts = '';
    if (!mine) {
      acts += '<button type="button" class="btn" data-action="a-confirm-conn">' + (isReq(o) ? '收到，等你' : '我能按时到 · 已联系上') + '</button>';
    } else if (!other) {
      acts += '<div class="state-note">已通知对方，等 TA 确认。</div>';
    }
    if (canExtend) acts += '<button type="button" class="btn ghost" data-action="a-extend">延长 10 分钟</button>';
    acts += '<div class="conn-acts">'
      + '<button type="button" class="linkbtn danger" data-action="a-cancel">取消这单</button>'
      + (role === 'helper' ? '<button type="button" class="linkbtn danger" data-action="a-release">联系不上对方</button>' : '')
      + '</div>';
    return '<div class="card conn-card">'
      + '<div class="conn-title">接单只是意向，双方确认后才成立</div>'
      + '<div class="conn-meta"><b id="d-countdown" class="cd' + (ms <= 0 ? ' is-over' : '') + '">' + (ms > 0 ? mmss(ms) : '已超时') + '</b>'
      + '<span id="d-cd-tail">' + (ms > 0 ? '内确认' : ' ') + ' · 超时释放回池，不扣点</span></div>'
      + '<div class="cs-row"><div class="cs' + (mine ? ' on' : '') + '">' + (mine ? '我已确认' : '我未确认') + '</div>'
      + '<div class="cs' + (other ? ' on' : '') + '">' + (other ? '对方已确认' : '对方未确认') + '</div></div>'
      + '<div class="conn-btns">' + acts + '</div></div>';
  }
  function stateCardHTML(o) {
    var st = o.status;
    if (st === 'pending') {
      if (isReq(o)) {
        return '<div class="card state-card"><div class="sc-title">已发到本楼</div>'
          + '<div class="sc-text">等一位顺路的人接单；接单后还要双方确认，订单才成立。</div>'
          + '<button type="button" class="linkbtn danger" data-action="a-cancel">撤回这条</button></div>';
      }
      return '<div class="card state-card"><div class="sc-title">这单还在等人接</div>'
        + '<div class="sc-text">接单后还要双方确认，订单才成立。</div>'
        + '<button type="button" class="btn" data-action="a-claim" data-id="' + esc(o.id) + '">接一单</button></div>';
    }
    if (st === 'connected') {
      if (isReq(o)) {
        return '<div class="card state-note-card"><div class="sc-title">已建联，正在等这一单走完</div>'
          + '<div class="sc-text">如果对方一直没到，可以取消这单；已建联之后取消不回待接池。</div>'
          + '<button type="button" class="linkbtn danger" data-action="a-cancel">取消这单</button></div>';
      }
      return '<div class="card state-note-card"><div class="sc-title">确认好了，按步骤来</div>'
        + '<div class="sc-text">一步步点完成；全部做完会自动送达，不用再点送达。</div></div>';
    }
    if (st === 'delivered') {
      if (isHelper(o)) {
        return '<div class="card state-note-card"><div class="sc-title">已送达，等对方确认</div>'
          + '<div class="sc-text">24 小时未确认会自动完成；不用一直等。</div></div>';
      }
      if (!hasSteps(o)) {
        return '<div class="card state-note-card"><div class="sc-title">送到了。确认收到，这一单就记一笔。</div>'
          + '<div class="sc-text">确认后，人情账上会多一笔。</div></div>';
      }
      return '<div class="card state-note-card"><div class="sc-title">送到了。确认收到，这一单就记一笔。</div>'
        + '<div class="sc-text">在下面「确认收到」那一步点一下就好。</div></div>';
    }
    if (st === 'cancelled') {
      return '<div class="card state-card"><div class="sc-title">这一单已取消</div>'
        + '<div class="sc-text">没有记人情点，也不影响别的单。</div>'
        + '<button type="button" class="btn ghost" data-action="a-home">回首页</button></div>';
    }
    if (st === 'released') {
      return '<div class="card state-card"><div class="sc-title">这单已释放</div>'
        + '<div class="sc-text">联系不上或超时，双方不扣点；可以重新接一单。</div>'
        + (isMine(o) ? '' : '<button type="button" class="btn" data-action="a-claim" data-id="' + esc(o.id) + '">接一单</button>')
        + '<button type="button" class="btn ghost" data-action="a-home">回首页</button></div>';
    }
    return '';
  }
  function timelineHTML(o) {
    var st = o.status;
    var nodes = [
      { h: '已发布', d: timeAgo(o.created_at) || '刚刚', done: true, now: false },
      { h: '有人接单', d: '接单只是意向', done: ['claimed', 'connected', 'delivered', 'done'].indexOf(st) >= 0, now: st === 'pending' },
      { h: '双方建联', d: '确认能联系上、愿意守约', done: ['connected', 'delivered', 'done'].indexOf(st) >= 0, now: st === 'claimed' },
      { h: '已送达', d: '放门口 / 交到手上', done: ['delivered', 'done'].indexOf(st) >= 0, now: st === 'connected' },
      { h: '记一笔', d: '记人情，不结算', done: st === 'done', now: st === 'delivered' }
    ];
    return '<div class="timeline" aria-label="订单进度">' + nodes.map(function (n) {
      var cls = n.done ? 'done' : (n.now ? 'now' : 'todo');
      var dot = n.done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : '';
      return '<div class="tl ' + cls + '"><div class="tl-dot">' + dot + '</div>'
        + '<div class="tl-body"><div class="h">' + esc(n.h) + '</div><div class="d">' + esc(n.d) + '</div></div></div>';
    }).join('') + '</div>';
  }
  function stepsHTML(o) {
    if (!hasSteps(o)) return '';
    var steps = arr(o.steps);
    var vis = visibleSteps(o);
    var remain = remainingSteps(o);
    var rows = vis.map(function (s) {
      var done = s.status === 'done';
      var act = stepCanAct(o, s);
      var cls = done ? 'done' : (act ? 'mine' : 'todo');
      var ownerLbl = s.owner === 'requester' ? (isReq(o) ? '你' : '委托方') : (isHelper(o) ? '你' : '接单方');
      var meta = ownerLbl + (s.text_value ? ' · ' + s.text_value : '');
      var extra = '';
      if (done && s.photo_key) {
        extra += '<img class="step-photo" src="' + esc(fileURL(s.photo_key)) + '" alt="步骤照片">';
      }
      if (act) {
        if (s.type === 'provide_code') {
          extra += '<div class="code-row"><input class="inp" id="code-' + esc(s.id) + '" data-step-code="' + esc(s.id) + '" maxlength="30" placeholder="输入取件码 / 订单号" value="' + esc(S.codeDraft[s.id] || '') + '">'
            + '<button type="button" class="btn small" data-action="a-step-code" data-step="' + esc(s.id) + '">保存</button></div>';
        } else if (s.type === 'confirm') {
          extra += '<button type="button" class="btn" data-action="a-complete">确认收到 · 记 ' + num(o.points) + ' 点</button>';
        } else {
          var ph = S.stepPhoto[s.id];
          extra += '<div class="step-acts">'
            + (ph ? '<span class="photo-prev"><img src="' + esc(ph.url) + '" alt="照片"></span>' : '')
            + '<label class="file-btn" for="step-file">' + (ph ? '重拍' : '拍照') + '</label>'
            + '<input type="file" id="step-file" data-step="' + esc(s.id) + '" accept="image/*" hidden>'
            + '<button type="button" class="btn small" data-action="a-step-done" data-step="' + esc(s.id) + '">完成了</button>'
            + '</div>';
        }
      }
      return '<div class="step ' + cls + '"><div class="step-no">' + (done ? '✓' : '') + '</div>'
        + '<div class="step-main"><div class="step-lb">' + esc(s.label || '') + '</div>'
        + '<div class="step-meta">' + esc(meta) + '</div>' + extra + '</div>'
        + '<div class="step-st ' + cls + '">' + esc(stepStateText(o, s)) + '</div></div>';
    }).join('');
    return '<div class="card steps-card">'
      + '<div class="steps-head"><b>这单要做 ' + steps.length + ' 步</b>'
      + (remain ? '<span class="steps-left">还有 ' + remain + ' 步</span>' : '<span class="steps-left">都做完了</span>') + '</div>'
      + rows + '</div>';
  }
  function chatOpen(o) { return ['claimed', 'connected', 'delivered'].indexOf(o.status) >= 0; }
  function chatHTML(o) {
    var open = chatOpen(o);
    var bubbles = S.messages.length ? S.messages.map(function (m) {
      var isSystem = !!m.system || String(m.from_id || '') === 'system';
      var mine = !isSystem && String(m.from_id || m.user_id || '') === String((S.me && S.me.id) || '');
      var who = isSystem ? '系统' : (mine ? '我' : (m.from_name || m.name || '对方'));
      var body = m.body !== undefined ? m.body : (m.text || '');
      return '<div class="bubble' + (mine ? ' mine' : '') + (isSystem ? ' system' : '') + '">'
        + (mine ? '' : '<span class="who">' + esc(who) + '</span>')
        + esc(body)
        + '<span class="t">' + esc(clock(m.created_at) || '') + '</span></div>';
    }).join('') : '<div class="chat-empty">还没说话。先确认能不能联系上。</div>';
    return '<div class="card chat-card">'
      + '<div class="chat-head"><b>临时会话</b><span>仅本单双方可见</span></div>'
      + (open
        ? '<div class="msgs" id="chat-msgs">' + bubbles + '</div>'
        + '<div class="quick">' + QUICK_WORDS.map(function (w) {
          return '<button type="button" class="chip" data-action="a-chat-quick" data-v="' + esc(w) + '">' + esc(w) + '</button>';
        }).join('') + '</div>'
        + '<div class="chat-input-row"><input class="inp" id="chat-input" maxlength="40" placeholder="说点什么…" value="' + esc(S.chatDraft) + '" enterkeyhint="send">'
        + '<button type="button" class="btn small" data-action="a-chat-send">发送</button></div>'
        : '<div class="chat-closed">订单已结束，临时会话关闭。</div>')
      + '</div>';
  }
  function doneCardHTML(o) {
    if (o.status !== 'done') return '';
    var req = isReq(o);
    return '<div class="card done-card"><div class="done-title">这栋楼，多了一次顺手。</div>'
      + '<div class="done-sub">人情账多了一笔：' + (req ? '-' : '+') + num(o.points) + ' 点；下次，你也可以顺手帮别人。</div>'
      + '<div class="done-acts"><button type="button" class="btn" data-action="a-home">回首页</button>'
      + '<button type="button" class="btn ghost" data-action="go" data-route="route-form">我也挂一张顺路卡</button></div></div>';
  }
  function detailCSSig() {
    var o = S.detail;
    if (!o) return 'none';
    return JSON.stringify([
      o.id, o.status, o.conn_extended, o.conn_deadline, o.current_step, o.code || '',
      arr(o.steps).map(function (s) { return [s.id, s.status, s.text_value || '', s.photo_key || '', s.completed_at || 0]; }),
      S.confirm.mine ? 1 : 0, S.confirm.other ? 1 : 0,
      S.messages.map(function (m) { return m.id; }).join(','),
      Object.keys(S.stepPhoto).map(function (k) { return k + ':' + S.stepPhoto[k].key; }).join(',')
    ]);
  }
  function detailBottom(o) {
    if (!o) { setBottom(''); return; }
    if (o.status === 'delivered' && isReq(o) && !hasSteps(o)) {
      setBottom('<button type="button" class="btn bb-btn" data-action="a-complete">确认收到 · 记 ' + num(o.points) + ' 点</button>');
      return;
    }
    if (o.status === 'connected' && isHelper(o) && !hasSteps(o)) {
      setBottom('<button type="button" class="btn bb-btn" data-action="a-deliver">送达了</button>');
      return;
    }
    setBottom('');
  }
  function renderDetail(force, reset) {
    var o = S.detail;
    if (!o) {
      if (S.notFound) {
        paint('<div class="page"><div class="empty">订单不在了，回楼里看看。</div>'
          + '<button type="button" class="btn ghost" style="margin-top:16px" data-action="a-home">回首页</button></div>', { reset: true });
      } else {
        paint('<div class="page"><div class="sk-card"></div><div class="sk-card"></div></div>', { reset: !!reset });
      }
      detailBottom(null);
      return;
    }
    var sig = detailCSSig();
    if (!force && sig === S.detailSig) return;
    S.detailSig = sig;
    var html = '<div class="page detail">'
      + heroHTML(o)
      + connCardHTML(o)
      + stateCardHTML(o)
      + stepsHTML(o)
      + '<div class="sec-row"><div class="sec">这单走到哪了</div><span class="sec-n">' + esc(timeAgo(o.created_at) || '') + '</span></div>'
      + timelineHTML(o)
      + chatHTML(o)
      + doneCardHTML(o)
      + '</div>';
    paint(html, { reset: !!reset });
    detailBottom(o);
  }

  /* ---------------- 我的 ---------------- */
  function derivedLedger() {
    return doneOrders().map(function (o) {
      var req = isReq(o);
      var other = otherUser(o) || {};
      return {
        delta: req ? -num(o.points) : num(o.points),
        what: req ? ('请人' + (o.category || '')) : ('帮' + (personName(other) || '') + (o.category || '')),
        who: personName(other) || '',
        created_at: o.done_at || o.delivered_at || o.updated_at
      };
    });
  }
  function ledgerRows() {
    var list = arr(S.ledger);
    if (!list.length) list = derivedLedger();
    if (!list.length) return '<div class="empty">还没有流水。发一条或接一单，账本才会开始记。</div>';
    return list.slice(0, 8).map(function (it) {
      /* 后端流水：delta 可能是正数 + direction(out/in)；who 可能是用户对象 */
      var d = num(it.delta);
      if (it.direction === 'out') d = -Math.abs(d);
      else if (it.direction === 'in') d = Math.abs(d);
      var what = it.what || it.note || it.reason || '一笔人情';
      var whoRaw = (it.who !== undefined && it.who !== null) ? it.who : (it.counterpart || it.name || '');
      var who = (whoRaw && typeof whoRaw === 'object') ? (whoRaw.name || whoRaw.nickname || '') : String(whoRaw || '');
      var date = dayText(it.created_at || it.at) || '';
      return '<div class="ledger-row"><div class="lr-main"><div class="lr-what">' + esc(what) + '</div>'
        + '<div class="lr-who">' + esc(who) + (who ? ' · ' : '') + esc(date) + '</div></div>'
        + '<span class="lr-delta ' + (d >= 0 ? 'plus' : 'minus') + '">' + (d >= 0 ? '+' : '-') + Math.abs(d) + '</span></div>';
    }).join('');
  }
  function meHTML() {
    var u = S.me || {};
    var lit = num(S.building.lit), target = num(S.building.target) || 30;
    var helped = num(S.stats.helped), received = num(S.stats.received);
    var points = num(u.points);
    var cells = '';
    for (var i = 0; i < target; i++) cells += '<i class="' + (i < lit ? 'on' : '') + '"></i>';
    var adminRow = isAdmin()
      ? '<button type="button" class="card admin-entry" data-action="a-admin"><span class="ae-main"><b>管理通道</b><span>失联提醒 · 订单 · 用户</span></span><span class="set-go">进入 ›</span></button>'
      : '';
    var setRows = [
      ['a-profile', '个人档案', '编辑 ›'],
      ['a-privacy', '隐私与协议', '最小采集'],
      ['a-about', '关于柳荫册', '网页演示版'],
      ['a-logout', '换个身份', '']
    ].map(function (r) {
      return '<button type="button" class="set-r" data-action="' + r[0] + '"><span class="set-l">' + r[1] + '</span><span class="set-cap">' + r[2] + '</span></button>';
    }).join('');
    var ledgerCount = arr(S.ledger).length || derivedLedger().length;
    return '<div class="page">'
      + '<button type="button" class="card me-head" data-action="go" data-route="profile">'
      + avatarHTML(u, 'big')
      + '<span class="me-txt"><span class="me-name">' + esc(u.name || u.nickname || '未设置昵称') + '</span>'
      + '<span class="me-sub">' + esc(myRoom()) + '</span></span>'
      + '<span class="me-pill">网页演示版</span></button>'
      + adminRow
      + '<div class="card me-sum"><div class="me-sum-l"><div class="me-sum-t">你帮过 ' + helped + ' 次，被帮 ' + received + ' 次</div>'
      + '<div class="me-sum-c">人情 ' + points + ' · 点数是参考，不是价格</div></div>'
      + '<div class="me-sum-n">' + points + '</div></div>'
      + '<div class="sec-row"><div class="sec">人情账</div><span class="sec-n">最近 ' + ledgerCount + ' 笔</span></div>'
      + '<div class="card ledger-card">' + ledgerRows() + '</div>'
      + '<div class="sec-row"><div class="sec">这栋楼</div><span class="sec-n">' + lit + '/' + target + ' 盏</span></div>'
      + '<div class="card building-card"><div class="windows" aria-hidden="true">' + cells + '</div>'
      + (S.building.code
        ? '<div class="code-box"><span class="code-lb">宿舍口令</span><b class="code-val">' + esc(S.building.code) + '</b>'
        + '<button type="button" class="linkbtn" data-action="a-copy-code">复制</button></div>'
        : '<div class="fnote">点灯与宿舍口令在试点栋接入后显示。</div>')
      + '</div>'
      + '<div class="sec-row"><div class="sec">设置</div><span class="sec-n">最小采集</span></div>'
      + '<div class="card set-card">' + setRows + '</div>'
      + '<div class="card demo-card"><div class="sc-title">演示</div>'
      + '<div class="sc-text">楼里的小周、阿禾会主动配合你；数据只用于本次体验。</div>'
      + '<button type="button" class="linkbtn danger" data-action="a-reset-demo">重置我的演示数据</button></div>'
      + '</div>';
  }
  function renderMe(reset) {
    setBottom('');
    paint(meHTML(), { reset: !!reset });
  }

  /* ---------------- 档案 ---------------- */
  function profileHTML() {
    var p = S.profile || {};
    var av = p.avatarPreview || p.avatar || '';
    var presets = PRESETS.map(function (k) {
      var on = p.avatar === 'preset:' + k;
      return '<button type="button" class="av-pick p-' + k + (on ? ' on' : '') + '" data-action="a-avatar" data-v="preset:' + k + '" aria-pressed="' + on + '" aria-label="头像颜色 ' + k + '"></button>';
    }).join('');
    var floors = [1, 2, 3, 4, 5, 6].map(function (n) {
      var on = num(p.floor) === n;
      return '<button type="button" class="pick' + (on ? ' on' : '') + '" data-action="a-profile-floor" data-v="' + n + '" aria-pressed="' + on + '">' + n + ' 层</button>';
    }).join('');
    var realOn = p.show_real_name !== 0;
    return '<div class="page profile">'
      + '<h1 class="h1">你是这栋楼的谁</h1>'
      + '<p class="sub">头像和昵称只在本楼展示；不想露真名，关掉下面的开关就行。</p>'
      + '<div class="card avatar-card">' + avatarHTML({ name: p.nickname || '邻', avatar: av }, 'xl')
      + '<div class="av-main"><div class="flabel">头像</div><div class="fnote">选一个颜色，或上传一张照片。</div>'
      + '<div class="av-row">' + presets + '</div>'
      + '<div class="av-acts"><label class="file-btn" for="avatar-file">上传照片</label>'
      + '<input type="file" id="avatar-file" accept="image/*" hidden>'
      + (p.avatar ? '<button type="button" class="linkbtn" data-action="a-avatar" data-v="__clear">取消头像</button>' : '')
      + '</div></div></div>'
      + '<div class="field"><div class="flabel">昵称<span class="flabel-r">楼里看到的名字</span></div>'
      + '<input class="inp" id="pf-nickname" maxlength="20" placeholder="比如 苏禾" value="' + esc(p.nickname || '') + '"></div>'
      + '<div class="field"><div class="flabel">真名<span class="flabel-r">只在双方建联后可见</span></div>'
      + '<input class="inp" id="pf-realname" maxlength="20" placeholder="可选，填了也不公开" value="' + esc(p.real_name || '') + '"></div>'
      + '<div class="field switch-row"><div class="switch-main"><div class="flabel">在楼里显示真名</div>'
      + '<div class="fnote">关掉后，楼里只显示昵称</div></div>'
      + '<button type="button" class="switch' + (realOn ? ' on' : '') + '" data-action="a-toggle-real" aria-pressed="' + realOn + '" aria-label="在楼里显示真名"><i></i></button></div>'
      + '<div class="sec-row"><div class="sec">住哪</div><span class="sec-n">楼栋已锁定</span></div>'
      + '<div class="card live-card">'
      + '<div class="live-row"><span class="live-l">楼栋</span><span class="live-v">' + esc(buildingName()) + '</span><span class="lock-note">已锁定</span></div>'
      + '<div class="live-row"><span class="live-l">楼层</span><div class="picks floors3" style="flex:1">' + floors + '</div></div>'
      + '<div class="live-row"><span class="live-l">门牌号</span><input class="inp" id="pf-room" maxlength="6" inputmode="numeric" placeholder="门牌号，如 302" value="' + esc(p.room_no || '') + '"></div>'
      + '</div>'
      + '<p class="formnote">手机号、学号不采集；档案只用于本楼内的互相识别。</p>'
      + '</div>';
  }
  function renderProfile(reset) {
    paint(profileHTML(), { reset: !!reset });
    setBottom('<button type="button" class="btn bb-btn" data-action="a-profile-save">保存档案</button>');
  }
  function saveProfile(t) {
    if (S.savingProfile) return;
    var p = S.profile || {};
    var nickname = (p.nickname || '').trim();
    if (!nickname) { toast('昵称不能为空'); return; }
    if (charLen(nickname) > 20) { toast('昵称最多 20 个字'); return; }
    var realName = (p.real_name || '').trim();
    if (charLen(realName) > 20) { toast('昵称最多 20 个字'); return; }
    var room = (p.room_no || '').trim();
    if (!room) { toast('请填门牌号，如 302'); return; }
    S.savingProfile = true;
    var restore = busyBtn(t, '保存中…');
    post('/profile', {
      nickname: nickname,
      real_name: realName || nickname,
      avatar: p.avatar || '',
      floor: num(p.floor) || 3,
      room_no: room,
      show_real_name: p.show_real_name !== 0
    }).then(function (d) {
      S.savingProfile = false;
      if (d && d.user) setMe(d.user);
      toast('档案已保存');
      syncOnce().catch(noop);
      go('me', null, true);
    }).catch(function (e) {
      S.savingProfile = false;
      restore();
      fail(e);
    });
  }

  /* ---------------- 动作 ---------------- */
  function claim(id, t) {
    if (!id) return;
    var restore = busyBtn(t, '接单中…');
    post('/orders/claim', { id: id }).then(function (d) {
      var o = d && d.order;
      if (o) { upsertOrder(o); S.detail = o; }
      toast('已接单，等双方确认');
      go('order', id);
    }).catch(function (e) { restore(); fail(e); });
  }
  function orderAct(t, path, payload, opts) {
    opts = opts || {};
    var restore = busyBtn(t, opts.loading || '…');
    return post(path, payload).then(function (d) {
      var o = d && d.order;
      if (o) { S.detail = o; upsertOrder(o); }
      if (opts.after) opts.after(d);
      else if (opts.okMsg) toast(opts.okMsg);
      if (S.route === 'order') {
        S.detailSig = '';
        renderDetail(true);
        renderTopbar('order');
        refreshDetail().catch(noop);
      }
      syncOnce().catch(noop);
    }).catch(function (e) { restore(); fail(e); });
  }
  function confirmConn(t) {
    orderAct(t, '/orders/confirm', { id: S.orderId }, {
      after: function (d) {
        S.confirm.mine = true;
        toast((d && num(d.confirmed) >= 2) ? '两边都确认了，订单成立' : '已确认，等对方');
      }
    });
  }
  function extendConn(t) {
    orderAct(t, '/orders/extend', { id: S.orderId }, { okMsg: '已延长 10 分钟' });
  }
  function cancelOrder(t) {
    var o = S.detail; if (!o) return;
    var connected = o.status === 'connected' || o.status === 'delivered';
    showModal({
      title: '取消这单？',
      body: connected
        ? '已经建联的单取消后直接结束，不会回待接池；双方不扣点。'
        : '订单会回待接池，双方不扣点，也不给对方记未响应。',
      okText: '取消这单',
      danger: true,
      onOk: function () {
        orderAct(t, '/orders/cancel', { id: S.orderId }, {
          after: function () {
            toast('已取消');
            go('home', null, true);
          }
        });
      }
    });
  }
  function releaseOrder(t) {
    showModal({
      title: '联系不上对方？',
      body: '会把订单释放回待接池，并给对方记一次未响应；双方不扣点。',
      okText: '释放回池',
      danger: true,
      onOk: function () {
        orderAct(t, '/orders/release', { id: S.orderId }, {
          after: function () {
            toast('已释放回池');
            go('home', null, true);
          }
        });
      }
    });
  }
  function stepDone(t) {
    var o = S.detail; if (!o) return;
    var sid = t.getAttribute('data-step');
    var step = null;
    arr(o.steps).forEach(function (s) { if (s.id === sid) step = s; });
    if (!step) return;
    var payload = { id: o.id, step_id: sid };
    if (step.type === 'provide_code') payload.text = (S.codeDraft[sid] || '').trim();
    var ph = S.stepPhoto[sid];
    if (ph && ph.key) payload.photo_key = ph.key;
    orderAct(t, '/orders/step', payload, {
      after: function () {
        delete S.stepPhoto[sid];
        S.detailSig = '';
        toast('这一步完成了');
      }
    });
  }
  function saveCode(t) {
    var o = S.detail; if (!o) return;
    var sid = t.getAttribute('data-step');
    var input = $('code-' + sid);
    var val = (input ? input.value : (S.codeDraft[sid] || '')).trim();
    if (!val) { toast('先填取件码/订单号'); return; }
    if (charLen(val) > 30) { toast('取件码 / 订单号需要 1–30 个字'); return; }
    S.codeDraft[sid] = val;
    orderAct(t, '/orders/step', { id: o.id, step_id: sid, text: val }, {
      after: function () {
        delete S.codeDraft[sid];
        S.detailSig = '';
        toast('已保存');
      }
    });
  }
  function deliverOrder(t) {
    orderAct(t, '/orders/deliver', { id: S.orderId }, { okMsg: '已送达' });
  }
  function completeOrder(t) {
    orderAct(t, '/orders/complete', { id: S.orderId }, {
      after: function (d) {
        var reward = (d && d.reward) || {};
        var pts = reward.points !== undefined ? num(reward.points) : num(S.detail && S.detail.points);
        var positive = reward.positive !== undefined ? !!reward.positive : !isReq(S.detail || {});
        if (S.orderId) S.rewardSeen[S.orderId] = 1;
        showReward(pts, positive);
        if (d && d.ledger) S.ledger = arr(d.ledger);
      }
    });
  }
  function sendChat(body, t) {
    var o = S.detail; if (!o) return;
    body = (body || '').trim();
    if (!body) { toast('先输一句话'); return; }
    if (charLen(body) > 40) { toast('一句话最多 40 个字'); return; }
    var restore = busyBtn(t, '…');
    post('/messages/send', { order_id: o.id, body: body }).then(function (d) {
      if (d && d.message) S.messages = mergeMessages(S.messages, [d.message]);
      S.chatDraft = '';
      S.detailSig = '';
      renderDetail(true);
    }).catch(function (e) { restore(); fail(e); });
  }
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || '已复制'); };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { toast('复制不了，手动记一下吧'); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
  }
  function shareOrder() {
    var o = S.detail;
    var title = (o && o.category ? o.category : '柳荫册') + ' · 柳荫册';
    var url = location.origin + location.pathname + (o ? '#/order/' + encodeURIComponent(o.id) : '');
    if (navigator.share) {
      navigator.share({ title: title, text: '这栋楼的顺手事', url: url }).catch(noop);
      return;
    }
    copyText(url, '链接已复制，可以发给同楼的人');
  }
  function doLogout() {
    stopPoll();
    stopCountdown();
    var t = S.token;
    if (t) api('/logout', { method: 'POST' }).catch(noop);
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    S.token = null;
    S.me = null;
    S.myOrders = [];
    S.openOrders = [];
    S.floorUsers = [];
    S.ledger = [];
    S.routes = { active: [], waiting: [], my_active: null };
    S.firstSync = true;
    S.lastSyncAt = '';
    S.notifSeen = {};
    toast('已退出，可以换个名字进楼');
    showLogin(true);
  }

  function handleAction(a, t) {
    switch (a) {
      case 'go': go(t.getAttribute('data-route')); break;
      case 'a-back': go(t.getAttribute('data-to') || 'home'); break;
      case 'a-home': go('home'); break;
      case 'a-pick-floor':
        S.loginFloor = num(t.getAttribute('data-v')) || 3;
        Array.prototype.forEach.call(document.querySelectorAll('[data-action="a-pick-floor"]'), function (b) {
          var on = num(b.getAttribute('data-v')) === num(S.loginFloor);
          b.setAttribute('aria-pressed', String(on));
          b.classList.toggle('on', on);
        });
        break;
      case 'a-login': doLogin(); break;
      case 'a-watch': doWatch(); break;
      case 'a-close-guide':
        S.guideHidden = true;
        try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) {}
        renderHome(false);
        break;
      case 'a-retry': netOff(); (S.route === 'order' ? refreshDetail() : syncOnce()).catch(noop); break;
      case 'a-home-filter': S.homeFilter = (t.getAttribute('data-v') === '全部' ? 'all' : t.getAttribute('data-v')); renderHome(false); break;
      case 'a-open-order': go('order', t.getAttribute('data-id')); break;
      case 'a-claim': claim(t.getAttribute('data-id'), t); break;
      case 'a-orders-tab': S.ordersTab = t.getAttribute('data-v') || 'posted'; renderOrders(false); break;
      case 'a-post-cat': {
        var cat = t.getAttribute('data-v');
        var c = catByName(cat);
        S.post.category = cat;
        S.post.pickup = c ? c.from[0] : '';
        S.post.pickupCustomOn = false;
        S.post.pickupCustom = '';
        S.post.need_code = false;
        S.post.size = cat === '取快递' ? '中件' : '';
        renderPost(false);
        break;
      }
      case 'a-post-needcode': S.post.need_code = !S.post.need_code; renderPost(false); break;
      case 'a-post-pickup': {
        var v = t.getAttribute('data-v');
        if (v === '__custom') { S.post.pickupCustomOn = true; S.post.pickupCustom = ''; }
        else { S.post.pickupCustomOn = false; S.post.pickup = v; }
        renderPost(false);
        break;
      }
      case 'a-post-size': S.post.size = t.getAttribute('data-v') || ''; renderPost(false); break;
      case 'a-post-time': S.post.time = t.getAttribute('data-v') || ''; renderPost(false); break;
      case 'a-post-points': S.post.points = num(t.getAttribute('data-v')) || 2; renderPost(false); break;
      case 'a-post-submit': submitPost(t); break;
      case 'a-rt-time':
      case 'a-rt-from':
      case 'a-rt-cap': {
        var val = t.getAttribute('data-v');
        var f = S.routeForm;
        if (a === 'a-rt-time') {
          if (val === '__custom') { f.timeCustomOn = true; f.timeCustom = ''; }
          else { f.timeCustomOn = false; f.time = val; }
        } else if (a === 'a-rt-from') {
          if (val === '__custom') { f.fromCustomOn = true; f.fromCustom = ''; }
          else { f.fromCustomOn = false; f.from = val; }
        } else {
          if (val === '__custom') { f.capCustomOn = true; f.capCustom = ''; }
          else { f.capCustomOn = false; f.cap = num(val); }
        }
        renderRouteForm(false);
        break;
      }
      case 'a-route-submit': submitRouteForm(t); break;
      case 'a-withdraw-route': {
        var cardId = t.getAttribute('data-id');
        var isMineCard = t.getAttribute('data-mine') === '1';
        var doWithdraw = function () {
          var restore = busyBtn(t, '…');
          post('/routes/withdraw', { id: cardId }).then(function () {
            S.routes.active = arr(S.routes.active).filter(function (c) { return c.id !== cardId; });
            if (S.routes.my_active && S.routes.my_active.id === cardId) S.routes.my_active = null;
            S.routes.waiting = arr(S.routes.waiting).filter(function (c) { return c.id !== cardId; });
            toast('已撤回');
            renderRoute(false);
            syncOnce().catch(noop);
          }).catch(function (e) { restore(); fail(e); });
        };
        if (isMineCard) showModal({ title: '今天不走了？', body: '会把这张顺路卡撤回，不扣点、不记账。', okText: '撤回', onOk: doWithdraw });
        else doWithdraw();
        break;
      }
      case 'a-confirm-conn': confirmConn(t); break;
      case 'a-extend': extendConn(t); break;
      case 'a-cancel': cancelOrder(t); break;
      case 'a-release': releaseOrder(t); break;
      case 'a-step-done': stepDone(t); break;
      case 'a-step-code': saveCode(t); break;
      case 'a-deliver': deliverOrder(t); break;
      case 'a-complete': completeOrder(t); break;
      case 'a-chat-quick': sendChat(t.getAttribute('data-v'), t); break;
      case 'a-chat-send': {
        var inp = $('chat-input');
        sendChat(inp ? inp.value : S.chatDraft, t);
        break;
      }
      case 'a-share': shareOrder(); break;
      case 'a-copy-code': copyText(String(S.building.code || ''), '口令已复制'); break;
      case 'a-logout':
        showModal({ title: '换个身份？', body: '会清掉这台设备上的身份，回到进楼页。', okText: '换个身份', onOk: doLogout });
        break;
      case 'a-reset-demo':
        showModal({ title: '重置我的演示数据？', body: '会回到进楼页，用另一个名字重新开始；楼里的数据不受影响。', okText: '重新开始', onOk: doLogout });
        break;
      case 'a-admin': location.href = '/liuyin/admin/'; break;
      case 'a-profile': go('profile'); break;
      case 'a-privacy':
        showModal({ title: '隐私与协议', body: '最小采集；不采集通讯录、不采集精确位置；订单结束后 24 小时隐藏联系方式。', okText: '知道了', noCancel: true });
        break;
      case 'a-about':
        showModal({ title: '关于柳荫册', body: '柳荫册 · 网页演示版。一层楼的人互相搭把手；人情点只记账，不兑现、不排名。', okText: '知道了', noCancel: true });
        break;
      case 'a-avatar': {
        var av = t.getAttribute('data-v');
        if (!S.profile) break;
        if (av === '__clear') { S.profile.avatar = ''; S.profile.avatarPreview = ''; }
        else { S.profile.avatar = av; S.profile.avatarPreview = ''; }
        renderProfile(false);
        break;
      }
      case 'a-toggle-real':
        if (S.profile) S.profile.show_real_name = S.profile.show_real_name === 0 ? 1 : 0;
        renderProfile(false);
        break;
      case 'a-profile-floor':
        if (S.profile) S.profile.floor = num(t.getAttribute('data-v')) || 1;
        renderProfile(false);
        break;
      case 'a-profile-save': saveProfile(t); break;
      case 'a-modal-ok': {
        var m = S.modal;
        closeOverlay();
        if (m && typeof m.onOk === 'function') m.onOk();
        break;
      }
      case 'a-modal-cancel': closeOverlay(); break;
      default: break;
    }
  }

  /* ---------------- 文件上传 ---------------- */
  function readDataURL(file) {
    return new Promise(function (resolve) {
      try {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = function () { resolve(''); };
        fr.readAsDataURL(file);
      } catch (e) { resolve(''); }
    });
  }
  function uploadFile(file) {
    var fd = new FormData();
    fd.append('file', file);
    return api('/upload', { method: 'POST', body: fd }).then(function (d) {
      if (!d || !d.key) throw new Error('照片没传上去，再试一次');
      return d.key;
    });
  }
  function handleFileInput(el) {
    if (!el || !el.files || !el.files[0]) return;
    var file = el.files[0];
    if (el.id === 'avatar-file') {
      toast('照片上传中…', 1200);
      Promise.all([readDataURL(file), uploadFile(file)]).then(function (r) {
        if (!S.profile) return;
        S.profile.avatarPreview = r[0];
        S.profile.avatar = r[1];
        renderProfile(false);
        toast('头像换好了');
      }).catch(function (e) { fail(e); });
      return;
    }
    if (el.id === 'step-file') {
      var sid = el.getAttribute('data-step');
      toast('照片上传中…', 1200);
      Promise.all([readDataURL(file), uploadFile(file)]).then(function (r) {
        S.stepPhoto[sid] = { url: r[0], key: r[1] };
        S.detailSig = '';
        renderDetail(true);
        toast('照片加上了');
      }).catch(function (e) { fail(e); });
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!t) return;
      handleAction(t.getAttribute('data-action'), t);
    });
    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el) return;
      if (el.id === 'login-name') S.loginName = el.value;
      else if (el.id === 'post-note') {
        S.post.note = el.value;
        var c = $('note-count');
        if (c) c.textContent = String(charLen(el.value));
      } else if (el.id === 'post-pickup') S.post.pickupCustom = el.value;
      else if (el.id === 'rt-time') S.routeForm.timeCustom = el.value;
      else if (el.id === 'rt-from') S.routeForm.fromCustom = el.value;
      else if (el.id === 'rt-cap') {
        if (el.value === '') S.routeForm.capCustom = '';
        else {
          var n = Math.min(5, Math.max(1, num(el.value)));
          S.routeForm.capCustom = String(n);
        }
      } else if (el.id === 'chat-input') S.chatDraft = el.value;
      else if (el.id === 'pf-nickname' && S.profile) S.profile.nickname = el.value;
      else if (el.id === 'pf-realname' && S.profile) S.profile.real_name = el.value;
      else if (el.id === 'pf-room' && S.profile) S.profile.room_no = el.value;
      else if (el.getAttribute && el.getAttribute('data-step-code')) {
        S.codeDraft[el.getAttribute('data-step-code')] = el.value;
      }
    });
    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.id) return;
      if (el.id === 'avatar-file' || el.id === 'step-file') handleFileInput(el);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var t = ev.target;
      if (!t || !t.id) return;
      if (t.id === 'login-name') { ev.preventDefault(); doLogin(); }
      else if (t.id === 'chat-input') { ev.preventDefault(); sendChat(t.value, null); }
      else if (t.getAttribute && t.getAttribute('data-step-code')) {
        ev.preventDefault();
        var sid = t.getAttribute('data-step-code');
        var btn = document.querySelector('[data-action="a-step-code"][data-step="' + sid + '"]');
        if (btn) saveCode(btn);
      }
    });
    window.addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopPoll(); }
      else if (S.token && S.me) { startPoll(); pollTick(); }
    });
    window.addEventListener('online', function () { netOff(); pollTick(); });
    window.addEventListener('offline', netOn);
    window.addEventListener('error', function (e) {
      ERRORS.push(String((e && e.message) || 'error'));
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      ERRORS.push(String((r && r.message) || r || 'rejection'));
    });
  }

  /* ---------------- 自检（?check=1） ---------------- */
  function runCheck() {
    var res = {};
    try {
      res.route = S.route;
      res.hash = location.hash;
      res.vw = window.innerWidth;
      res.vh = window.innerHeight;
      res.docSW = document.documentElement.scrollWidth;
      res.bodySW = document.body.scrollWidth;
      res.phoneW = phone ? phone.offsetWidth : 0;
      res.phoneH = phone ? phone.offsetHeight : 0;
      res.stageCW = stage.clientWidth;
      res.stageSW = stage.scrollWidth;
      res.stageOverflowX = stage.scrollWidth - stage.clientWidth;
      res.tabbarHidden = !tabbar || tabbar.hidden;
      if (tabbar && !tabbar.hidden) {
        res.tabH = tabbar.offsetHeight;
        res.stageBottom = Math.round(stage.getBoundingClientRect().bottom);
        res.tabTop = Math.round(tabbar.getBoundingClientRect().top);
        res.covered = res.tabTop < res.stageBottom - 1;
      }
      if (bottombar && !bottombar.hidden) res.bottomH = bottombar.offsetHeight;
      var small = [];
      var sels = ['button', 'a', 'input', 'textarea', '.file-btn', '.switch', '.pick'];
      sels.forEach(function (sel) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
          var r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          if (r.height < 44 || r.width < 44) small.push(sel + ':' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
      });
      res.smallTargets = small.slice(0, 12);
      var clipped = [];
      Array.prototype.forEach.call(document.querySelectorAll('.pk-title,.orr-title,.me-name,.tb-title,.detail-title,.rc-who b,.lr-what'), function (el) {
        if (el.scrollWidth > el.clientWidth + 1) clipped.push(String(el.textContent).slice(0, 14));
      });
      res.ellipsis = clipped;
      res.errors = ERRORS.slice(0, 10);
      res.ok = res.docSW <= res.vw && res.stageOverflowX <= 0 && !res.covered
        && small.length === 0 && ERRORS.length === 0;
    } catch (err) {
      res.error = String((err && err.message) || err);
    }
    document.title = 'LYCHECK ' + JSON.stringify(res);
    var pre = document.getElementById('lycheck');
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'lycheck';
      pre.style.display = 'none';
      document.body.appendChild(pre);
    }
    pre.textContent = JSON.stringify(res);
    return res;
  }

  /* ---------------- 启动 ---------------- */
  function afterAuth(params) {
    var screen = params.get('screen');
    var target = null;
    var map = { home: '#/home', route: '#/route', orders: '#/orders', me: '#/me', post: '#/post', profile: '#/profile', 'route-form': '#/route-form' };
    if (screen === 'order') target = '#/order/' + encodeURIComponent(params.get('id') || '');
    else if (map[screen]) target = map[screen];
    if (target) {
      if (location.hash === target) route();
      else location.hash = target;
    } else if (location.hash && location.hash !== '#/login') {
      route();
    } else {
      go('home', null, true);
    }
  }
  function boot() {
    bind();
    try { S.token = localStorage.getItem(TOKEN_KEY); } catch (e) { S.token = null; }
    try { if (localStorage.getItem(GUIDE_KEY) === '1') S.guideHidden = true; } catch (e) {}
    var params = new URLSearchParams(location.search);
    if (S.token) {
      api('/me').then(function (m) {
        S.me = null;
        applyMePayload(m);
        if (!S.me || !S.me.id) throw new Error('身份没读出来');
        startPoll();
        afterAuth(params);
      }).catch(function (e) {
        if (e && e.status === 401) {
          S.token = null;
          try { localStorage.removeItem(TOKEN_KEY); } catch (err) {}
          showLogin();
          toast('登录已失效，重新进楼');
        } else {
          showLogin();
          toast(errText(e));
        }
      });
    } else {
      showLogin();
    }
    if (/[?&]check=1/.test(location.search)) setTimeout(runCheck, 2400);
    window.__lyCheck = runCheck;
    window.__lyState = function () { return S; };
  }

  boot();
})();

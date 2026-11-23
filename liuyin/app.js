/* 柳荫册 · 6 号楼 · 单页应用
   路由 + 2 秒轮询 + 渲染。原生 JS，无框架。 */
(function () {
  'use strict';

  var TOKEN_KEY = 'ly_token';
  var API = '/api/liuyin';
  var POLL_MS = 2000;

  var S = {
    token: null,
    me: null,
    building: '6 号楼',
    floorUsers: [],
    openOrders: [],
    myOrders: [],
    detailOrder: null,
    messages: [],
    lastMsgId: 0,
    serverTime: 0,
    route: null,
    prevRoute: null,
    orderId: null,
    ordersTab: 'sent',
    postTab: 'errand',
    loginName: '',
    loginFloor: 3,
    form: null,
    formErr: '',
    highlightId: null,
    myConfirmed: {},
    proofKey: null,
    proofUrl: null,
    busy: false,
    firstSync: true,
    timer: null,
    hlTimer: null,
    msgsDirty: false,
    sigTop: '', sigHome: '', sigOrders: '', sigMe: '', sigDetail: '', sigLogin: '',
    notifSeen: {}
  };

  var phone = document.getElementById('phone');
  var topbar = document.getElementById('topbar');
  var stage = document.getElementById('stage');
  var tabbar = document.getElementById('tabbar');
  var composer = document.getElementById('composer');
  var fab = document.getElementById('fab');
  var toastEl = document.getElementById('toast');
  var netbar = document.getElementById('netbar');
  var stageFade = document.getElementById('stage-fade');

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
  function byTimeDesc(a, b) {
    return num(new Date(b.updated_at || b.created_at || 0).getTime()) -
      num(new Date(a.updated_at || a.created_at || 0).getTime());
  }
  function timeAgo(s) {
    if (!s) return '';
    var t = new Date(s);
    if (isNaN(t.getTime())) return '';
    var now = new Date();
    var diff = (now.getTime() - t.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (t.toDateString() === now.toDateString()) return '今天 ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
    var y = new Date(now.getTime() - 864e5);
    if (t.toDateString() === y.toDateString()) return '昨天 ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
    return (t.getMonth() + 1) + '-' + t.getDate() + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }
  function clock(s) {
    var t = new Date(s);
    if (isNaN(t.getTime())) return '';
    return pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }
  function photoURL(key) { return API + '/file?key=' + encodeURIComponent(key || ''); }

  /* ---------------- 请求层 ---------------- */
  function unwrap(j) {
    if (j && typeof j === 'object' && j.ok === true && Object.prototype.hasOwnProperty.call(j, 'data')) return j.data;
    return j;
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    var body = opts.body;
    var isForm = (typeof FormData !== 'undefined') && (body instanceof FormData);
    if (body !== undefined && body !== null && !isForm) headers['content-type'] = 'application/json';
    if (S.token) headers['x-ly-token'] = S.token;
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      cache: 'no-store'
    }).catch(function () {
      var e = new Error('网络不太好，重试中…');
      e.network = true;
      throw e;
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (err) { j = null; }
        if (res.status === 401) {
          var e401 = new Error((j && j.error) || '登录已失效');
          e401.status = 401;
          throw e401;
        }
        if (!res.ok || (j && j.ok === false)) {
          var e2 = new Error((j && j.error) || ('请求没成功（' + res.status + '）'));
          e2.status = res.status;
          throw e2;
        }
        return unwrap(j);
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
    if (e.status === 429) return '操作太快了，歇一会儿再试';
    return e.message || '出了点问题，再试一次';
  }
  function fail(e) {
    if (e && e.status === 401) { handle401(); return; }
    if (e && e.network) netOn();
    toast(errText(e));
  }

  /* ---------------- 提示 ---------------- */
  var toastTimer = null;
  function toast(msg, ms) {
    if (!msg || !toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    /* 强制 reflow 让过渡生效 */
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.hidden = true; }, 250);
    }, ms || 2800);
  }
  var netToastAt = 0;
  function netOn() {
    if (netbar) netbar.hidden = false;
    if (Date.now() - netToastAt > 15000) { netToastAt = Date.now(); toast('网络不太好，重试中…'); }
  }
  function netOff() { if (netbar) netbar.hidden = true; }

  /* ---------------- 数据 ---------------- */
  function setMe(u, building) {
    S.me = Object.assign({ id: '', name: '', floor: 1, points: 0, owed: 0 }, u || {});
    if (building) S.building = building;
    if (S.form) S.form.toFloor = num(S.me.floor) || 1;
  }
  function applyMeFromServer() {
    return api('/me').then(function (m) {
      var u = (m && m.user) || m;
      if (u && u.id) setMe(u, m && m.building);
    });
  }
  function getOrder(id) {
    if (!id) return null;
    if (S.detailOrder && S.detailOrder.id === id) return S.detailOrder;
    for (var i = 0; i < S.myOrders.length; i++) if (S.myOrders[i].id === id) return S.myOrders[i];
    return null;
  }
  function upsertMyOrder(o) {
    if (!o || !o.id) return;
    var found = false;
    for (var i = 0; i < S.myOrders.length; i++) if (S.myOrders[i].id === o.id) { S.myOrders[i] = o; found = true; break; }
    if (!found) S.myOrders.unshift(o);
    if (S.detailOrder && S.detailOrder.id === o.id) S.detailOrder = o;
  }
  function roleOf(o) {
    if (!o || !S.me) return 'guest';
    if (o.creator && o.creator.id === S.me.id) return 'creator';
    if (o.claimer && o.claimer.id === S.me.id) return 'claimer';
    return 'other';
  }
  function resetForm() {
    S.formErr = '';
    S.form = {
      titleKind: '取快递', titleCustom: '', note: '', from: '驿站',
      toFloor: num(S.me && S.me.floor) || 1, code: '', photoKey: null, photoUrl: null,
      start: '18:00', end: '20:00', capacity: 2
    };
  }
  if (!S.form) resetForm();

  /* ---------------- 状态文案 ---------------- */
  var STATUS_LABEL = {
    pending: '待接', claimed: '已接', confirmed: '待确认', picked: '已取件',
    delivered: '已送达', done: '已完成', cancelled: '已取消', returned: '已退回'
  };
  var STEP_DEFS = [
    { h: '挂卡', d: '发到楼里，等人顺路' },
    { h: '接单', d: '有人接了这单' },
    { h: '双确认', d: '两边各点一次才作数' },
    { h: '取件', d: '凭码把件取走' },
    { h: '送达', d: '送到门口' },
    { h: '记一笔', d: '这一单记一次人情点' }
  ];
  var STEP_IDX = { pending: 1, claimed: 2, confirmed: 3, picked: 4, delivered: 5, done: 6, cancelled: 1, returned: 1 };

  function statusLabel(st) { return STATUS_LABEL[st] || '进行中'; }
  function kindLabel(o) { return o && o.kind === 'route' ? '顺路' : '委托'; }
  function badgeHTML(st) { return '<span class="badge ' + esc(st) + '">' + esc(statusLabel(st)) + '</span>'; }

  function bigStatus(o, role) {
    switch (o.status) {
      case 'pending': return '挂到楼里了，等一个顺路的人。';
      case 'claimed': return '有人接了。两边各点一次确认，这单才算数。';
      case 'confirmed': return role === 'claimer' ? '两边都确认了，凭取件码去取件。' : '他确认了，等他取件。';
      case 'picked': return role === 'claimer' ? '件取到了，送到门口就好。' : '他已经取到件，正往楼上走。';
      case 'delivered': return role === 'creator' ? '送到门口了。确认收到，这一单就记一笔。' : '已经送到，等对方确认收到。';
      case 'done': return '这一单走完了，账上记了一次人情点。';
      case 'cancelled': return '这一单撤掉了，没有记人情点。';
      case 'returned': return '这单退回楼里了，还在等人接。';
      default: return '';
    }
  }

  /* ---------------- 轮询 ---------------- */
  function startPolling() {
    stopPolling();
    S.timer = setInterval(tick, POLL_MS);
  }
  function stopPolling() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }
  function tick() {
    if (!S.token || !S.me) return;
    if (document.hidden) return;
    if (S.busy) return;
    S.busy = true;
    syncOnce().catch(function (e) {
      if (e && e.status === 401) { handle401(); return; }
      netOn();
    }).then(function () { S.busy = false; });
  }
  function syncOnce() {
    if (!S.token || !S.me) return Promise.resolve();
    var since = S.serverTime || 0;
    return api('/sync?since=' + encodeURIComponent(since) + '&floor=' + encodeURIComponent(num(S.me.floor) || 1))
      .then(function (d) {
        d = d || {};
        netOff();
        if (d.me) { S.me.points = num(d.me.points); S.me.owed = num(d.me.owed); }
        if (Array.isArray(d.floor_users)) S.floorUsers = d.floor_users;
        if (Array.isArray(d.open_orders)) S.openOrders = d.open_orders;
        if (Array.isArray(d.my_orders)) S.myOrders = d.my_orders;
        if (d.server_time !== undefined && d.server_time !== null && d.server_time !== '') S.serverTime = d.server_time;
        handleNotifications(d.notifications || []);
        S.firstSync = false;
        updateLive();
        if (S.route === 'order' && S.orderId) {
          loadMessages().catch(function () {});
          if (!getOrder(S.orderId)) refreshDetail(true);
        }
      });
  }
  function handleNotifications(list) {
    var last = null;
    list.forEach(function (n) {
      if (!n) return;
      var key = String(n.type) + '|' + String(n.order_id) + '|' + String(n.at);
      if (S.notifSeen[key]) return;
      S.notifSeen[key] = true;
      if (n.type === 'message') return;
      last = n;
    });
    if (!last || S.firstSync) return;
    var text = last.text;
    if (!text) {
      var map = {
        claimed: '有人接了你的单', confirmed: '两边确认好了', picked: '件已经取到',
        delivered: '已经送到门口', done: '这一单完成了'
      };
      text = map[last.type] || '';
    }
    if (text) toast(text);
  }

  function handle401() {
    stopPolling();
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    S.token = null;
    S.me = null;
    S.myOrders = [];
    S.openOrders = [];
    S.floorUsers = [];
    S.detailOrder = null;
    S.orderId = null;
    S.route = null;
    toast('登录已失效，重新进楼');
    showLogin();
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = String(location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var id = parts[1] || '';
    try { id = decodeURIComponent(id); } catch (e) {}
    return { name: parts[0] || '', id: id };
  }
  function go(name, id) {
    var h = '#/' + name + (id ? '/' + encodeURIComponent(id) : '');
    if (location.hash === h) route();
    else location.hash = h;
  }
  function goBack() {
    var prev = S.prevRoute;
    if (prev && prev !== 'order' && prev !== 'login') go(prev);
    else go('orders');
  }
  function route() {
    if (!S.token || !S.me) { showLogin(); return; }
    var r = parseHash();
    var name = r.name || 'home';
    if (name === 'order') {
      if (!r.id) { go('orders'); return; }
      if (S.orderId !== r.id) { openOrder(r.id); return; }
      chrome('order');
      renderTopbar('order');
      renderDetail(false, false);
      return;
    }
    if (name !== 'home' && name !== 'post' && name !== 'orders' && name !== 'me') { go('home'); return; }
    if (S.route && S.route !== name) S.prevRoute = S.route;
    S.orderId = null;
    S.detailOrder = null;
    S.messages = [];
    S.lastMsgId = 0;
    S.proofKey = null;
    S.proofUrl = null;
    S.route = name;
    chrome(name);
    renderTopbar(name);
    if (name === 'home') renderHome(true, true);
    else if (name === 'post') renderPost(true, true);
    else if (name === 'orders') renderOrders(true, true);
    else renderMe(true, true);
  }

  function chrome(mode) {
    var login = mode === 'login';
    var detail = mode === 'order';
    topbar.hidden = login;
    tabbar.hidden = login || detail;
    composer.hidden = !detail;
    fab.hidden = mode !== 'home';
    if (stageFade) stageFade.hidden = mode !== 'home';
    if (login) topbar.innerHTML = '';
    if (!tabbar.hidden) {
      Array.prototype.forEach.call(tabbar.querySelectorAll('.tab'), function (b) {
        var on = b.getAttribute('data-route') === mode;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'page');
        else b.removeAttribute('aria-current');
      });
    }
  }

  /* ---------------- 进楼页 ---------------- */
  function loginHTML() {
    var floors = [1, 2, 3, 4, 5, 6].map(function (n) {
      return '<button type="button" class="pick" data-action="pick-floor" data-v="' + n + '" aria-pressed="' + (num(S.loginFloor) === n) + '">' + n + ' 层</button>';
    }).join('');
    return '<div class="login">'
      + '<div class="brand"><h1>柳荫册</h1><div class="brandsub">6 号楼 · 邻里互助</div>'
      + '<p class="lead">一层楼的人，互相搭把手。<br>写个名字，就能进楼。</p></div>'
      + '<div class="login-form">'
      + '<div class="field"><label for="login-name">名字</label>'
      + '<input class="inp" id="login-name" data-name="loginName" maxlength="12" placeholder="楼里怎么称呼你" value="' + esc(S.loginName) + '" autocomplete="nickname" enterkeyhint="go"></div>'
      + '<div class="field"><label>住几层</label><div class="pick-grid">' + floors + '</div></div>'
      + '<button type="button" class="btn" id="login-btn" data-action="login" style="margin-top:24px">进楼</button>'
      + '<div class="form-err" id="login-err" hidden></div>'
      + '<p class="hint center" style="margin-top:16px">重名会自动带上编号，比如「小柳(2)」。</p>'
      + '</div>'
      + '<div class="login-foot">演示版 · 数据只用于本次体验</div>'
      + '</div>';
  }
  function showLogin() {
    stopPolling();
    S.route = 'login';
    try {
      if (location.hash !== '#/login') history.replaceState(null, '', location.pathname + location.search + '#/login');
    } catch (e) {}
    chrome('login');
    S.sigLogin = '';
    stage.innerHTML = loginHTML();
    stage.scrollTop = 0;
  }
  function loginErr(msg) {
    var el = $('login-err');
    if (el) { el.hidden = !msg; el.textContent = msg || ''; }
    if (msg) toast(msg);
  }
  function doLogin() {
    var input = $('login-name');
    var name = (input ? input.value : S.loginName || '').trim();
    S.loginName = name;
    if (!name) { loginErr('先写个名字吧'); return; }
    if (Array.from(name).length > 12) { loginErr('名字最多 12 个字'); return; }
    var btn = $('login-btn');
    if (btn) { btn.disabled = true; btn.textContent = '进楼中…'; }
    var asked = name;
    post('/login', { name: name, floor: num(S.loginFloor) || 3 })
      .then(function (d) {
        if (!d || !d.token || !d.user) throw new Error('楼里没回应，稍后再试');
        S.token = d.token;
        try { localStorage.setItem(TOKEN_KEY, d.token); } catch (e) {}
        setMe(d.user, d.building);
        return applyMeFromServer().catch(function (e) {
          if (e && e.status === 401) throw e;
        });
      })
      .then(function () {
        if (S.me && S.me.name !== asked) toast('楼里已经有同名，你叫「' + S.me.name + '」');
        startPolling();
        go('home');
        tick();
      })
      .catch(function (e) {
        try { localStorage.removeItem(TOKEN_KEY); } catch (err) {}
        S.token = null;
        S.me = null;
        var b = $('login-btn');
        if (b) { b.disabled = false; b.textContent = '进楼'; }
        loginErr(errText(e));
      });
  }

  /* ---------------- 首页 ---------------- */
  function homeSig() {
    return JSON.stringify([
      S.building, S.me.floor, S.me.points, S.me.owed, S.highlightId,
      S.openOrders.map(function (o) {
        return [o.id, o.status, o.updated_at || '', o.claimer && o.claimer.id, o.title,
          o.from_place, o.to_floor, o.note, o.created_at, o.kind, o.start_at, o.capacity];
      }),
      S.floorUsers.map(function (u) { return [u.id, u.name, u.online, u.floor]; })
    ]);
  }
  function homeHTML() {
    var open = S.openOrders || [];
    var cards = open.length ? open.map(openCardHTML).join('')
      : '<div class="empty">楼里这会儿没有顺路的卡。<br>你挂一条，第一个路过的人就看见了。</div>';
    var nb = (S.floorUsers || []).filter(function (u) { return u.id !== S.me.id; });
    var nbHTML = nb.length ? nb.map(neighborHTML).join('')
      : '<div class="empty" style="grid-column:1/-1">这层暂时只有你一个人登记。</div>';
    return '<div class="screen fabspace">'
      + '<div class="kick">楼里 · 今天</div>'
      + '<h1 class="t">谁正好经过，<br>就顺手带一件。</h1>'
      + '<p class="sub">挂在楼里的顺路卡，谁路过谁接。不催、不派单。</p>'
      + '<div class="sec-row"><div class="sec">本楼今日顺路</div><span class="sec-n">' + open.length + ' 条</span></div>'
      + '<div class="open-list">' + cards + '</div>'
      + '<div class="sec-row"><div class="sec">本层还有谁</div><span class="sec-n">' + num(S.me.floor) + ' 层 · ' + nb.length + ' 人</span></div>'
      + '<div class="neighbors">' + nbHTML + '</div>'
      + '</div>';
  }
  function openCardHTML(o) {
    var mine = o.creator && o.creator.id === S.me.id;
    var flash = o.id === S.highlightId ? ' flash' : '';
    var route = esc(o.from_place || '') + '<span class="arrow">→</span>' + esc((o.to_floor || '?') + ' 层');
    var extra = '';
    if (o.kind === 'route') {
      if (o.start_at) extra += '<span class="dotsep">·</span>' + esc(o.start_at) + ' 出发';
      if (o.capacity) extra += '<span class="dotsep">·</span>可带 ' + num(o.capacity) + ' 件';
    }
    var btn = mine ? '<span class="tag plain">我发的</span>'
      : '<button type="button" class="take-btn" data-action="claim" data-id="' + esc(o.id) + '">我来</button>';
    var creator = o.creator || {};
    var kindTag = o.kind === 'route'
      ? '<span class="tag">顺路</span>' : '<span class="tag ochre">委托</span>';
    return '<article class="card order-card' + flash + '" data-action="open-order" data-id="' + esc(o.id) + '">'
      + '<div class="oc-top"><div class="oc-title">' + esc(o.title || '') + '</div>' + btn + '</div>'
      + '<div class="oc-route">' + route + extra + '</div>'
      + '<div class="oc-meta"><span class="who">' + esc(creator.name || '楼里') + ' · ' + num(creator.floor) + ' 层</span>'
      + '<span class="dotsep">·</span><span>' + esc(timeAgo(o.created_at)) + '</span>'
      + '<span class="dotsep">·</span>' + kindTag + '</div>'
      + (o.note ? '<div class="oc-note">「' + esc(o.note) + '」</div>' : '')
      + '</article>';
  }
  function neighborHTML(u) {
    return '<div class="nb"><div class="ava' + (u.online ? ' on' : '') + '">' + esc(firstChar(u.name)) + '</div>'
      + '<div class="nb-name" title="' + esc(u.name) + '">' + esc(u.name) + '</div></div>';
  }
  function renderHome(force, reset) {
    var sig = homeSig();
    if (!force && sig === S.sigHome) return;
    S.sigHome = sig;
    var top = reset ? 0 : stage.scrollTop;
    stage.innerHTML = homeHTML();
    stage.scrollTop = top;
  }

  /* ---------------- 发单 ---------------- */
  function pickGrid(cls, items) {
    return '<div class="pick-grid ' + cls + '">' + items.join('') + '</div>';
  }
  function pickHTML(action, attrs, label, pressed) {
    return '<button type="button" class="pick" data-action="' + action + '" ' + attrs + ' aria-pressed="' + (pressed ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  function errandFormHTML() {
    var f = S.form;
    var kinds = ['取快递', '带饭', '其他'].map(function (t) {
      return pickHTML('pick-title', 'data-v="' + esc(t) + '"', t, f.titleKind === t);
    });
    var custom = f.titleKind === '其他'
      ? '<div style="margin-top:9px"><input class="inp" id="title-custom" data-name="form.titleCustom" maxlength="20" placeholder="比如：借把螺丝刀" value="' + esc(f.titleCustom) + '" autocomplete="off">'
      + '<div class="counter"><span id="title-count">' + Array.from(f.titleCustom || '').length + '</span> / 20</div></div>'
      : '';
    var froms = ['驿站', '食堂', '教学楼'].map(function (t) {
      return pickHTML('pick-form', 'data-field="from" data-v="' + esc(t) + '"', t, f.from === t);
    });
    var floors = [1, 2, 3, 4, 5, 6].map(function (n) {
      return pickHTML('pick-form', 'data-field="toFloor" data-v="' + n + '"', n + ' 层', num(f.toFloor) === n);
    });
    var photo = f.photoUrl
      ? '<div class="photo-prev"><img src="' + esc(f.photoUrl) + '" alt="已选照片">'
      + '<label class="file-btn" for="photo-file" style="flex:1">换一张</label>'
      + '<button type="button" class="linkbtn" data-action="clear-photo">去掉</button></div>'
      : '<label class="file-btn" for="photo-file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>拍一张 / 选一张（可选）</label>';
    return '<div class="field"><label>标题</label>' + pickGrid('n3', kinds) + custom + '</div>'
      + '<div class="field"><label for="note">说明</label>'
      + '<textarea class="inp" id="note" data-name="form.note" maxlength="80" placeholder="写两句，比如：六个件，有点重">' + esc(f.note) + '</textarea>'
      + '<div class="counter"><span id="note-count">' + Array.from(f.note || '').length + '</span> / 80</div></div>'
      + '<div class="field"><label>从哪拿</label>' + pickGrid('n3', froms) + '</div>'
      + '<div class="field"><label>送到几层</label>' + pickGrid('', floors) + '</div>'
      + '<div class="field"><label for="code">取件码</label>'
      + '<input class="inp mono" id="code" data-name="form.code" maxlength="12" placeholder="A·1236" value="' + esc(f.code) + '" autocomplete="off">'
      + '<p class="hint">只给接单的人看，凭码取件。</p></div>'
      + '<div class="field"><label>拍张照（可选）</label><div id="photo-zone">' + photo + '</div>'
      + '<input type="file" id="photo-file" accept="image/*" hidden></div>'
      + '<button type="button" class="btn" style="margin-top:24px" data-action="submit-errand">发布这条</button>'
      + '<p class="hint center">挂出去是请人帮忙，接单的人会先确认再来。</p>';
  }
  function routeFormHTML() {
    var f = S.form;
    var froms = ['驿站', '食堂', '教学楼'].map(function (t) {
      return pickHTML('pick-form', 'data-field="from" data-v="' + esc(t) + '"', t, f.from === t);
    });
    var floors = [1, 2, 3, 4, 5, 6].map(function (n) {
      return pickHTML('pick-form', 'data-field="toFloor" data-v="' + n + '"', n + ' 层', num(f.toFloor) === n);
    });
    var caps = [1, 2, 3, 4, 5].map(function (n) {
      return pickHTML('pick-form', 'data-field="capacity" data-v="' + n + '"', n + ' 件', num(f.capacity) === n);
    });
    return '<div class="field"><label>从哪出发</label>' + pickGrid('n3', froms) + '</div>'
      + '<div class="field"><label>到哪层</label>' + pickGrid('', floors) + '</div>'
      + '<div class="field"><label for="start">几点出发</label><input class="inp mono" id="start" type="time" data-name="form.start" value="' + esc(f.start) + '"></div>'
      + '<div class="field"><label for="end">几点前有效</label><input class="inp mono" id="end" type="time" data-name="form.end" value="' + esc(f.end) + '"></div>'
      + '<div class="field"><label>能带几件</label>' + pickGrid('n5', caps) + '</div>'
      + '<div class="field"><label for="note2">留一句（可不写）</label>'
      + '<textarea class="inp" id="note2" data-name="form.note" maxlength="80" placeholder="顺手，不用客气">' + esc(f.note) + '</textarea>'
      + '<div class="counter"><span id="note-count">' + Array.from(f.note || '').length + '</span> / 80</div></div>'
      + '<button type="button" class="btn" style="margin-top:24px" data-action="submit-route">挂上去</button>'
      + '<p class="hint center">挂出去的是路线，不是承诺；谁顺路谁就来接。</p>';
  }
  function postHTML() {
    var tabs = '<div class="seg" role="tablist">'
      + '<button type="button" class="' + (S.postTab === 'errand' ? 'on' : '') + '" data-action="post-tab" data-tab="errand">请人帮忙</button>'
      + '<button type="button" class="' + (S.postTab === 'route' ? 'on' : '') + '" data-action="post-tab" data-tab="route">我正好顺路</button>'
      + '</div>';
    return '<div class="screen">' + tabs
      + (S.postTab === 'route' ? routeFormHTML() : errandFormHTML())
      + '<div class="form-err" id="form-err"' + (S.formErr ? '' : ' hidden') + '>' + esc(S.formErr) + '</div>'
      + '</div>';
  }
  function renderPost(force, reset) {
    var top = reset ? 0 : stage.scrollTop;
    stage.innerHTML = postHTML();
    stage.scrollTop = top;
  }
  function setFormErr(msg) {
    S.formErr = msg || '';
    var el = $('form-err');
    if (el) { el.hidden = !msg; el.textContent = msg || ''; }
  }
  function submitErrand() {
    var f = S.form;
    var title = f.titleKind === '其他' ? (f.titleCustom || '').trim() : f.titleKind;
    if (!title) { setFormErr('先选一个标题，或者自己写一句。'); return; }
    if (Array.from(title).length > 20) { setFormErr('标题最多 20 个字。'); return; }
    if (!(f.code || '').trim()) { setFormErr('取件码要填，接单的人凭它取件。'); return; }
    setFormErr('');
    var body = {
      kind: 'errand',
      title: title,
      note: (f.note || '').trim(),
      from_place: f.from,
      to_floor: num(f.toFloor) || num(S.me.floor),
      code: (f.code || '').trim()
    };
    if (f.photoKey) body.photo_key = f.photoKey;
    var b = document.querySelector('[data-action="submit-errand"]');
    if (b) { b.disabled = true; b.textContent = '发布中…'; }
    post('/orders/create', body).then(function (d) {
      var o = d && d.order;
      toast('挂到楼里了');
      return syncOnce().catch(function () {}).then(function () {
        S.highlightId = o ? o.id : null;
        resetForm();
        go('home');
        if (S.highlightId) {
          clearTimeout(S.hlTimer);
          S.hlTimer = setTimeout(function () {
            S.highlightId = null;
            if (S.route === 'home') renderHome(true, false);
          }, 2000);
        }
      });
    }).catch(function (e) {
      fail(e);
      var b2 = document.querySelector('[data-action="submit-errand"]');
      if (b2) { b2.disabled = false; b2.textContent = '发布这条'; }
    });
  }
  function submitRoute() {
    var f = S.form;
    if (!f.start || !f.end) { setFormErr('几点出发、几点前有效，两个时间都选一下。'); return; }
    if (f.end <= f.start) { setFormErr('结束时间要晚于出发时间。'); return; }
    setFormErr('');
    var body = {
      kind: 'route',
      title: '顺路带一件',
      note: (f.note || '').trim(),
      from_place: f.from,
      to_floor: num(f.toFloor) || num(S.me.floor),
      start_at: f.start,
      end_at: f.end,
      capacity: num(f.capacity) || 1
    };
    var b = document.querySelector('[data-action="submit-route"]');
    if (b) { b.disabled = true; b.textContent = '发布中…'; }
    post('/orders/create', body).then(function (d) {
      var o = d && d.order;
      toast('挂到楼里了');
      return syncOnce().catch(function () {}).then(function () {
        S.highlightId = o ? o.id : null;
        resetForm();
        go('home');
        if (S.highlightId) {
          clearTimeout(S.hlTimer);
          S.hlTimer = setTimeout(function () {
            S.highlightId = null;
            if (S.route === 'home') renderHome(true, false);
          }, 2000);
        }
      });
    }).catch(function (e) {
      fail(e);
      var b2 = document.querySelector('[data-action="submit-route"]');
      if (b2) { b2.disabled = false; b2.textContent = '挂上去'; }
    });
  }

  /* ---------------- 订单列表 ---------------- */
  function filteredOrders() {
    var me = S.me.id;
    var list = (S.myOrders || []).filter(function (o) {
      var sent = o.creator && o.creator.id === me;
      var taken = o.claimer && o.claimer.id === me;
      return S.ordersTab === 'sent' ? sent : taken;
    });
    return list.sort(byTimeDesc);
  }
  function ordersSig() {
    return JSON.stringify([S.ordersTab, filteredOrders().map(function (o) {
      return [o.id, o.status, o.title, o.creator && o.creator.name, o.claimer && o.claimer.name,
        o.updated_at || '', o.created_at || ''];
    })]);
  }
  function ordersHTML() {
    var list = filteredOrders();
    var rows = list.length ? list.map(orderRowHTML).join('') : '';
    var empty = S.ordersTab === 'sent'
      ? '还没发过单。<br>缺人搭把手的时候，发一条试试。'
      : '还没接过别人的单。<br>看到顺路的，点「我来」。';
    return '<div class="screen">'
      + '<div class="seg" role="tablist">'
      + '<button type="button" class="' + (S.ordersTab === 'sent' ? 'on' : '') + '" data-action="orders-tab" data-tab="sent">我发的</button>'
      + '<button type="button" class="' + (S.ordersTab === 'taken' ? 'on' : '') + '" data-action="orders-tab" data-tab="taken">我接的</button>'
      + '</div>'
      + (list.length ? '<div class="order-list">' + rows + '</div>' : '<div class="empty" style="margin-top:14px">' + empty + '</div>'
        + '<button type="button" class="btn ghost" style="margin-top:16px" data-action="go-post">去发一条</button>')
      + '</div>';
  }
  function orderRowHTML(o) {
    var sent = o.creator && o.creator.id === S.me.id;
    var other = sent ? o.claimer : o.creator;
    var otherName = other ? (other.name || '楼里') : '还没人接';
    var meta = sent ? ('给 ' + esc(otherName)) : ('帮 ' + esc(otherName));
    if (!other) meta = '还没人接';
    meta += ' · ' + esc(timeAgo(o.updated_at || o.created_at));
    return '<button type="button" class="order-row" data-action="open-order" data-id="' + esc(o.id) + '">'
      + '<div class="orr-main"><div class="orr-top"><span class="orr-title">' + esc(o.title || '') + '</span>'
      + badgeHTML(o.status) + '</div><div class="orr-meta">' + meta + '</div></div>'
      + '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>';
  }
  function renderOrders(force, reset) {
    var sig = ordersSig();
    if (!force && sig === S.sigOrders) return;
    S.sigOrders = sig;
    var top = reset ? 0 : stage.scrollTop;
    stage.innerHTML = ordersHTML();
    stage.scrollTop = top;
  }

  /* ---------------- 我的 ---------------- */
  function doneOrders() {
    return (S.myOrders || []).filter(function (o) { return o.status === 'done'; }).sort(byTimeDesc);
  }
  function meSig() {
    return JSON.stringify([S.me.name, S.me.floor, S.me.points, S.me.owed, S.building,
      doneOrders().map(function (o) { return [o.id, o.title, o.updated_at || o.created_at]; })]);
  }
  function meHTML() {
    var done = doneOrders();
    var rows = done.length ? done.map(function (o) {
      var sent = o.creator && o.creator.id === S.me.id;
      var other = sent ? o.claimer : o.creator;
      var text = (sent ? '帮你的是 ' : '你帮了 ') + esc((other && other.name) || '楼里的人');
      return '<div class="me-done-row"><span class="t">' + text + ' · ' + esc(o.title || '') + '</span>'
        + '<span class="m">' + esc(timeAgo(o.updated_at || o.created_at)) + '</span></div>';
    }).join('') : '<div class="empty" style="border:0;background:none;padding:14px 0">还没有走完的单。下次顺路带一件，账上就多一句。</div>';
    return '<div class="screen">'
      + '<div class="me-head"><div class="ava big' + (S.me.online ? ' on' : '') + '">' + esc(firstChar(S.me.name)) + '</div>'
      + '<div style="min-width:0"><div class="me-name">' + esc(S.me.name) + '</div>'
      + '<div class="me-sub">' + esc(S.building || '6 号楼') + ' · ' + num(S.me.floor) + ' 层</div></div></div>'
      + '<div class="points-card">'
      + '<div class="pc"><b>' + num(S.me.points) + '</b><span>帮过别人 · 次</span></div>'
      + '<div class="pc"><b>' + num(S.me.owed) + '</b><span>被帮过 · 次</span></div>'
      + '</div>'
      + '<p class="hint">人情点只记在这一栋楼里：不兑钱、不排名、不催收。</p>'
      + '<div class="sec-row"><div class="sec">我参与过的已完成</div><span class="sec-n">' + done.length + ' 单</span></div>'
      + '<div class="card" style="padding:4px 15px">' + rows + '</div>'
      + '<button type="button" class="btn ghost" style="margin-top:24px" data-action="logout">换个身份</button>'
      + '<p class="hint center">会清掉这台设备上的身份，回到进楼页。</p>'
      + '</div>';
  }
  function renderMe(force, reset) {
    var sig = meSig();
    if (!force && sig === S.sigMe) return;
    S.sigMe = sig;
    var top = reset ? 0 : stage.scrollTop;
    stage.innerHTML = meHTML();
    stage.scrollTop = top;
  }

  /* ---------------- 订单详情 ---------------- */
  function openOrder(id) {
    S.orderId = id;
    S.route = 'order';
    S.messages = [];
    S.lastMsgId = 0;
    S.msgsDirty = false;
    S.proofKey = null;
    S.proofUrl = null;
    S.detailOrder = getOrder(id) || null;
    S.sigDetail = '';
    chrome('order');
    renderTopbar('order');
    renderDetail(true, true);
    refreshDetail(true).then(function () { return loadMessages(0, true); }).catch(function () {});
    tick();
  }
  function refreshDetail(silent) {
    var id = S.orderId;
    if (!id) return Promise.resolve();
    return api('/orders/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (S.orderId !== id) return;
      if (!d || !d.order) return;
      S.detailOrder = d.order;
      upsertMyOrder(d.order);
      if (Array.isArray(d.messages) && d.messages.length) ingestMessages(d.messages);
      renderDetail(true, false);
    }).catch(function (e) {
      if (e && e.status === 401) { handle401(); return; }
      if (e && e.status === 404) {
        S.detailOrder = null;
        renderDetail(true, false);
        if (!silent) toast('这一单找不到了');
        return;
      }
      if (!silent) fail(e);
    });
  }
  function detailSig(o, role) {
    return JSON.stringify([o.id, o.status, o.confirmed_count, o.updated_at, o.photo_key,
      o.proof_key, role, S.myConfirmed[o.id] || false, S.proofUrl, S.messages.length]);
  }
  function renderDetail(force, reset) {
    var o = getOrder(S.orderId) || S.detailOrder;
    if (!o) {
      stage.innerHTML = '<div class="screen"><div class="empty">这一单找不到了。<br>可能已经被撤掉了。</div>'
        + '<button type="button" class="btn ghost" style="margin-top:16px" data-action="back-home">回首页</button></div>';
      return;
    }
    var role = roleOf(o);
    var sig = detailSig(o, role);
    if (!force && sig === S.sigDetail) { renderMessages(); return; }
    S.sigDetail = sig;
    var top = reset ? 0 : stage.scrollTop;
    stage.innerHTML = detailHTML(o, role);
    stage.scrollTop = top;
    renderMessages();
  }
  function timelineHTML(o) {
    var st = o.status || 'pending';
    var idx = STEP_IDX[st];
    if (idx === undefined) idx = 1;
    var allDone = st === 'done';
    var html = '<div class="timeline" aria-label="订单进度">';
    STEP_DEFS.forEach(function (s, i) {
      var cls = 'todo';
      if (allDone || i < idx) cls = 'done';
      else if (i === idx) cls = 'current';
      var dot = cls === 'done'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>'
        : String(i + 1);
      html += '<div class="tl ' + cls + '"><div class="tl-dot">' + dot + '</div>'
        + '<div class="tl-body"><div class="h">' + s.h + '</div><div class="d">' + s.d + '</div></div></div>';
    });
    return html + '</div>';
  }
  function codeHTML(code) {
    return esc(code).replace(/\u00b7/g, '<em>·</em>');
  }
  function ticketHTML(o) {
    if (o.kind === 'route' || !o.code) return '';
    return '<div class="ticket"><div class="lb">取件码</div>'
      + '<div class="code">' + codeHTML(o.code) + '</div>'
      + '<div class="cap">只有你和对方看得到 · 凭码取件</div></div>';
  }
  function infoHTML(o) {
    var rows = [];
    var route = esc(o.from_place || '') + ' → ' + (o.to_floor ? num(o.to_floor) + ' 层' : '楼里');
    if (o.kind === 'route' && o.start_at) route += ' · ' + esc(o.start_at) + (o.end_at ? '–' + esc(o.end_at) : '');
    rows.push(['路线', route]);
    rows.push(['发单', o.creator ? esc(o.creator.name) + ' · ' + num(o.creator.floor) + ' 层' : '—']);
    rows.push(['接单', o.claimer ? esc(o.claimer.name) + ' · ' + num(o.claimer.floor) + ' 层' : '还没人接']);
    if (o.kind === 'route') rows.push(['能带', num(o.capacity || 1) + ' 件']);
    if (o.note) rows.push(['说明', esc(o.note)]);
    rows.push(['时间', esc(timeAgo(o.created_at))]);
    var photo = o.photo_key ? '<img class="detail-photo" src="' + photoURL(o.photo_key) + '" alt="发单照片">' : '';
    var proof = o.proof_key ? '<img class="detail-photo" src="' + photoURL(o.proof_key) + '" alt="送达照片">' : '';
    return '<div class="card info-card">'
      + rows.map(function (r) {
        return '<div class="info-row"><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></div>';
      }).join('')
      + photo + proof + '</div>';
  }
  function btnHTML(action, label, id) {
    return '<button type="button" class="btn" data-action="' + action + '" data-id="' + esc(id) + '">' + esc(label) + '</button>';
  }
  function linkHTML(action, label, id) {
    return '<button type="button" class="linkbtn" data-action="' + action + '" data-id="' + esc(id) + '">' + esc(label) + '</button>';
  }
  function proofRowHTML() {
    if (S.proofUrl) {
      return '<div class="upload-row"><div class="photo-prev"><img src="' + esc(S.proofUrl) + '" alt="送达照片"></div>'
        + '<label class="file-btn" for="proof-file" style="flex:1">换一张</label>'
        + '<button type="button" class="linkbtn" data-action="clear-proof">去掉</button>'
        + '<input type="file" id="proof-file" accept="image/*" hidden></div>';
    }
    return '<div class="upload-row"><label class="file-btn" for="proof-file" style="flex:1">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>'
      + '拍张送达照片（可选）</label><input type="file" id="proof-file" accept="image/*" hidden></div>';
  }
  function actionsHTML(o, role) {
    var st = o.status || 'pending';
    var id = o.id;
    var h = '';
    var c = num(o.confirmed_count);
    if (st === 'pending') {
      h += '<div class="state-note">挂出去了，等一个顺路的人。有人接了会出现在这里。</div>';
      if (role === 'creator') h += linkHTML('do-cancel', '撤掉这一单', id);
    } else if (st === 'claimed') {
      if (S.myConfirmed[id]) h += '<div class="state-note">你已经确认过了，等对方也点一下。</div>';
      else if (role === 'creator') h += btnHTML('do-confirm', '确认这笔', id);
      else if (role === 'claimer') h += btnHTML('do-confirm', '确认接单', id);
      else h += '<div class="state-note">等两边各确认一次。</div>';
      h += '<div class="confirm-meter"><span>已确认 ' + c + ' / 2</span>'
        + '<span class="meter-dots"><i class="' + (c > 0 ? 'on' : '') + '"></i><i class="' + (c > 1 ? 'on' : '') + '"></i></span></div>';
      if (role === 'creator') h += linkHTML('do-cancel', '撤掉这一单', id);
      if (role === 'claimer') h += linkHTML('do-return', '退回楼里', id);
    } else if (st === 'confirmed') {
      if (role === 'claimer') h += btnHTML('do-pick', '已取到', id);
      else h += '<div class="state-note">两边都确认了。凭取件码取件，取到后他会点「已取到」。</div>';
    } else if (st === 'picked') {
      if (role === 'claimer') { h += proofRowHTML(); h += btnHTML('do-deliver', '已送达', id); }
      else h += '<div class="state-note">他已经取到件，正往楼上走。</div>';
    } else if (st === 'delivered') {
      if (role === 'creator') h += btnHTML('do-complete', '收到了，记一笔', id);
      else h += '<div class="state-note">已经送到。等他确认收到，这一单就记上了。</div>';
    } else if (st === 'done') {
      h += '<div class="state-note">这一单记了一次人情点。</div>';
      h += '<div class="center" style="margin-top:8px"><span class="seal">已记一笔</span></div>';
    } else if (st === 'cancelled') {
      h += '<div class="state-note">这一单已经撤掉了，没有记人情点。</div>';
    } else if (st === 'returned') {
      h += '<div class="state-note">这单退回楼里了，还在等人接。</div>';
    }
    return h;
  }
  function detailHTML(o, role) {
    return '<div class="screen">'
      + '<div class="detail-head"><div class="kick">' + kindLabel(o) + ' · ' + esc(statusLabel(o.status)) + '</div>'
      + '<h1 class="detail-title">' + esc(o.title || '') + '</h1>'
      + '<p class="detail-status">' + esc(bigStatus(o, role)) + '</p></div>'
      + timelineHTML(o)
      + ticketHTML(o)
      + '<div class="actions">' + actionsHTML(o, role) + '</div>'
      + infoHTML(o)
      + '<div class="sec-row"><div class="sec">消息</div><span class="sec-n">每 2 秒刷新</span></div>'
      + '<div id="messages"></div>'
      + '</div>';
  }

  /* ---------------- 消息 ---------------- */
  function msgId(m) { return m && (m.id !== undefined && m.id !== null) ? m.id : (m && m.at) || ''; }
  function msgBody(m) { return m && (m.body !== undefined ? m.body : (m.text !== undefined ? m.text : m.content)) || ''; }
  function msgAt(m) { return (m && (m.at || m.created_at || m.created)) || ''; }
  function msgSenderId(m) {
    if (!m) return '';
    if (m.user_id !== undefined) return m.user_id;
    if (m.from_id !== undefined) return m.from_id;
    if (m.sender_id !== undefined) return m.sender_id;
    if (m.user && m.user.id !== undefined) return m.user.id;
    return '';
  }
  function msgName(m) {
    if (!m) return '楼里';
    return (m.user && m.user.name) || m.name || m.from_name || '楼里';
  }
  function ingestMessages(list) {
    var seen = {};
    S.messages.forEach(function (m) { seen[String(msgId(m))] = true; });
    var added = 0;
    list.forEach(function (m) {
      if (!m) return;
      var k = String(msgId(m));
      if (seen[k]) return;
      seen[k] = true;
      S.messages.push(m);
      added++;
    });
    if (!added) return;
    S.msgsDirty = true;
    S.messages.sort(function (a, b) {
      var ta = new Date(msgAt(a)).getTime();
      var tb = new Date(msgAt(b)).getTime();
      if (isFinite(ta) && isFinite(tb) && ta !== tb) return ta - tb;
      var ia = Number(msgId(a)), ib = Number(msgId(b));
      if (isFinite(ia) && isFinite(ib) && ia !== ib) return ia - ib;
      return 0;
    });
    var last = S.messages[S.messages.length - 1];
    if (last) S.lastMsgId = msgId(last);
  }
  function loadMessages(since, initial) {
    var id = S.orderId;
    if (!id) return Promise.resolve();
    var s = (since !== undefined && since !== null) ? since : S.lastMsgId;
    return api('/messages?order_id=' + encodeURIComponent(id) + '&since=' + encodeURIComponent(s || 0))
      .then(function (d) {
        if (S.orderId !== id) return;
        var list = (d && d.messages) || [];
        if (list.length) ingestMessages(list);
        if (initial) {
          /* 刚进详情时停在顶部，不要被消息区拽到底 */
          S.msgsDirty = false;
          lastMsgCount = S.messages.length;
        }
        renderMessages();
      }).catch(function (e) {
        if (e && e.status === 401) handle401();
      });
  }
  function bubbleHTML(m) {
    var mine = String(msgSenderId(m)) === String(S.me.id);
    return '<div class="bubble' + (mine ? ' mine' : '') + '">'
      + (mine ? '' : '<span class="who">' + esc(msgName(m)) + '</span>')
      + esc(msgBody(m))
      + '<span class="t">' + esc(clock(msgAt(m))) + '</span></div>';
  }
  var lastMsgCount = 0;
  function renderMessages() {
    var box = $('messages');
    if (!box) return;
    if (!S.messages.length) {
      box.innerHTML = '<div class="msgs-empty">还没有消息。有事说一句，对方两秒内就能看到。</div>';
      lastMsgCount = 0;
      return;
    }
    var st = $('stage');
    var nearBottom = !st || (st.scrollHeight - st.scrollTop - st.clientHeight < 120);
    box.innerHTML = '<div class="msgs">' + S.messages.map(bubbleHTML).join('') + '</div>';
    var grew = S.messages.length > lastMsgCount;
    lastMsgCount = S.messages.length;
    if ((S.msgsDirty || grew) && nearBottom) {
      requestAnimationFrame(function () {
        var s = $('stage');
        if (s) s.scrollTop = s.scrollHeight;
      });
    }
    S.msgsDirty = false;
  }
  function sendMessage() {
    var input = $('msg-input');
    if (!input || !S.orderId) return;
    var text = input.value.trim();
    if (!text) return;
    if (Array.from(text).length > 100) { toast('一句话最多 100 个字'); return; }
    var btn = composer.querySelector('button');
    if (btn) btn.disabled = true;
    input.value = '';
    post('/messages/send', { order_id: S.orderId, body: text }).then(function (d) {
      if (d && d.message) ingestMessages([d.message]);
      renderMessages();
      return loadMessages().catch(function () {});
    }).catch(function (e) {
      fail(e);
      if (input && !input.value) input.value = text;
    }).then(function () { if (btn) btn.disabled = false; });
  }

  /* ---------------- 订单动作 ---------------- */
  var ACT_CONF = {
    confirm: { path: '/orders/confirm', ok: '已确认，等对方也点一下' },
    pick: { path: '/orders/pick', ok: '已取到，记得送到门口' },
    deliver: { path: '/orders/deliver', ok: '已标记送达' },
    complete: { path: '/orders/complete', ok: '' },
    cancel: { path: '/orders/cancel', ok: '这一单撤掉了' },
    return: { path: '/orders/return', ok: '退回楼里了，等人再接' }
  };
  function doOrderAct(kind, btnNode) {
    var id = S.orderId;
    var conf = ACT_CONF[kind];
    if (!id || !conf) return;
    var body = { id: id };
    if (kind === 'deliver' && S.proofKey) body.proof_key = S.proofKey;
    if (btnNode) btnNode.disabled = true;
    post(conf.path, body).then(function (d) {
      if (d && d.order) { S.detailOrder = d.order; upsertMyOrder(d.order); }
      if (kind === 'confirm') S.myConfirmed[id] = true;
      if (kind === 'complete') {
        S.myConfirmed[id] = false;
        toast('这一单记了一次人情点');
      } else {
        toast(conf.ok);
      }
      S.proofKey = null;
      S.proofUrl = null;
      renderDetail(true, false);
      renderTopbar('order');
      syncOnce().catch(function () {});
    }).catch(function (e) {
      fail(e);
      if (btnNode) btnNode.disabled = false;
    });
  }
  function claimOrder(btnNode) {
    var id = btnNode && btnNode.getAttribute('data-id');
    if (!id) return;
    if (btnNode) btnNode.disabled = true;
    post('/orders/claim', { id: id }).then(function (d) {
      toast('接了。两边各确认一下，这单才算数');
      if (d && d.order) upsertMyOrder(d.order);
      go('order', id);
      tick();
    }).catch(function (e) {
      fail(e);
      if (btnNode) btnNode.disabled = false;
    });
  }
  function uploadPhoto(file, which) {
    if (!file) return;
    var fd = new FormData();
    fd.append('file', file);
    var localUrl = '';
    try { localUrl = URL.createObjectURL(file); } catch (e) {}
    toast('照片上传中…', 1200);
    api('/upload', { method: 'POST', body: fd }).then(function (d) {
      var key = d && d.key;
      if (!key) throw new Error('照片没传上去，再试一次');
      if (which === 'photo') {
        S.form.photoKey = key;
        S.form.photoUrl = localUrl;
        renderPost(true);
        toast('照片加上了');
      } else {
        S.proofKey = key;
        S.proofUrl = localUrl;
        renderDetail(true, false);
        toast('照片加上了');
      }
    }).catch(function (e) { fail(e); });
  }
  function doLogout() {
    stopPolling();
    var t = S.token;
    if (t) api('/logout', { method: 'POST' }).catch(function () {});
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    S.token = null;
    S.me = null;
    S.myOrders = [];
    S.openOrders = [];
    S.floorUsers = [];
    S.detailOrder = null;
    S.orderId = null;
    S.route = null;
    S.prevRoute = null;
    S.messages = [];
    S.lastMsgId = 0;
    S.serverTime = 0;
    S.loginName = '';
    S.myConfirmed = {};
    toast('已退出，可以换个名字进楼');
    showLogin();
  }

  /* ---------------- 顶栏 ---------------- */
  function renderTopbar(routeName) {
    routeName = routeName || S.route;
    var o = routeName === 'order' ? (getOrder(S.orderId) || S.detailOrder) : null;
    var key = [routeName, S.me ? S.me.points + '/' + S.me.owed + '/' + S.me.floor : '',
      S.building || '', o ? (o.title || '') + '|' + o.status : ''].join('#');
    if (key === S.sigTop) return;
    S.sigTop = key;
    var html = '';
    if (routeName === 'home') {
      html = '<div class="tb-row"><div><div class="tb-kicker">' + esc(S.building || '6 号楼') + ' · 我住 ' + num(S.me.floor) + ' 层</div>'
        + '<div class="tb-title">柳荫册</div></div>'
        + '<div class="tb-points"><div class="p"><b>' + num(S.me.points) + '</b><span>帮过</span></div>'
        + '<div class="p"><b>' + num(S.me.owed) + '</b><span>被帮</span></div></div></div>';
    } else if (routeName === 'post') {
      html = '<div class="tb-row"><div><div class="tb-kicker">楼里 · 发一条</div>'
        + '<div class="tb-title">发一条</div></div></div>';
    } else if (routeName === 'orders') {
      html = '<div class="tb-row"><div><div class="tb-kicker">订单 · 我发的和我接的</div>'
        + '<div class="tb-title">订单</div></div></div>';
    } else if (routeName === 'me') {
      html = '<div class="tb-row"><div><div class="tb-kicker">' + esc(S.building || '6 号楼') + '</div>'
        + '<div class="tb-title">我的</div></div></div>';
    } else if (routeName === 'order') {
      html = '<div class="tb-row"><div class="tb-left">'
        + '<button type="button" class="tb-back" data-action="back" aria-label="返回">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>'
        + '<div style="min-width:0"><div class="tb-kicker">订单 · ' + esc(o ? statusLabel(o.status) : '') + '</div>'
        + '<div class="tb-title">订单详情</div></div></div></div>';
    }
    topbar.innerHTML = html;
  }

  /* ---------------- 实时更新 ---------------- */
  function updateLive() {
    renderTopbar(S.route);
    if (S.route === 'home') renderHome(false, false);
    else if (S.route === 'orders') renderOrders(false, false);
    else if (S.route === 'me') renderMe(false, false);
    else if (S.route === 'order') renderDetail(false, false);
  }

  /* ---------------- 事件 ---------------- */
  function handleAction(a, t) {
    switch (a) {
      case 'pick-floor': {
        S.loginFloor = num(t.getAttribute('data-v')) || 3;
        Array.prototype.forEach.call(stage.querySelectorAll('[data-action="pick-floor"]'), function (b) {
          b.setAttribute('aria-pressed', String(num(b.getAttribute('data-v')) === num(S.loginFloor)));
        });
        break;
      }
      case 'login': doLogin(); break;
      case 'go': go(t.getAttribute('data-route')); break;
      case 'go-post': go('post'); break;
      case 'back': goBack(); break;
      case 'post-tab':
        S.postTab = t.getAttribute('data-tab') === 'route' ? 'route' : 'errand';
        S.formErr = '';
        renderPost(true, true);
        break;
      case 'pick-title':
        S.form.titleKind = t.getAttribute('data-v') || '取快递';
        renderPost(true);
        break;
      case 'pick-form': {
        var field = t.getAttribute('data-field');
        var val = t.getAttribute('data-v');
        if (!field) break;
        S.form[field] = field === 'toFloor' ? num(val) : (field === 'capacity' ? num(val) : val);
        renderPost(true);
        break;
      }
      case 'clear-photo':
        S.form.photoKey = null; S.form.photoUrl = null; renderPost(true); break;
      case 'clear-proof':
        S.proofKey = null; S.proofUrl = null; renderDetail(true, false); break;
      case 'submit-errand': submitErrand(); break;
      case 'submit-route': submitRoute(); break;
      case 'open-order': go('order', t.getAttribute('data-id')); break;
      case 'claim': claimOrder(t); break;
      case 'do-confirm': doOrderAct('confirm', t); break;
      case 'do-pick': doOrderAct('pick', t); break;
      case 'do-deliver': doOrderAct('deliver', t); break;
      case 'do-complete': doOrderAct('complete', t); break;
      case 'do-cancel': doOrderAct('cancel', t); break;
      case 'do-return': doOrderAct('return', t); break;
      case 'orders-tab':
        S.ordersTab = t.getAttribute('data-tab') === 'taken' ? 'taken' : 'sent';
        renderOrders(true);
        break;
      case 'logout': doLogout(); break;
      case 'back-home': go('home'); break;
      case 'retry': location.reload(); break;
      default: break;
    }
  }
  function bind() {
    document.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!t) return;
      handleAction(t.getAttribute('data-action'), t);
    });
    document.addEventListener('input', function (ev) {
      var el = ev.target;
      if (!el || !el.getAttribute) return;
      var n = el.getAttribute('data-name');
      if (!n) return;
      var v = el.value;
      if (n.indexOf('form.') === 0) S.form[n.slice(5)] = (el.type === 'number' ? Number(v) : v);
      else if (n === 'loginName') S.loginName = v;
      if (n === 'form.note') { var c = $('note-count'); if (c) c.textContent = String(Array.from(v).length); }
      if (n === 'form.titleCustom') { var c2 = $('title-count'); if (c2) c2.textContent = String(Array.from(v).length); }
    });
    document.addEventListener('change', function (ev) {
      var el = ev.target;
      if (!el || !el.id) return;
      if (el.id === 'photo-file') uploadPhoto(el.files && el.files[0], 'photo');
      if (el.id === 'proof-file') uploadPhoto(el.files && el.files[0], 'proof');
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      var t = ev.target;
      if (t && t.id === 'login-name') { ev.preventDefault(); doLogin(); }
    });
    composer.addEventListener('submit', function (ev) { ev.preventDefault(); sendMessage(); });
    window.addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopPolling(); }
      else if (S.token && S.me) { startPolling(); tick(); }
    });
    window.addEventListener('online', function () { netOff(); tick(); });
    window.addEventListener('offline', function () { netOn(); });
  }

  /* ---------------- 自检（?check=1，仅用于本地验证） ---------------- */
  function runCheck() {
    var res = {};
    try {
      res.route = S.route;
      res.vw = window.innerWidth;
      res.vh = window.innerHeight;
      res.docSW = document.documentElement.scrollWidth;
      res.bodySW = document.body.scrollWidth;
      res.phoneW = phone.offsetWidth;
      res.phoneH = phone.offsetHeight;
      res.stageCW = stage.clientWidth;
      res.stageSW = stage.scrollWidth;
      res.stageOverflowX = stage.scrollWidth - stage.clientWidth;
      if (!tabbar.hidden) {
        res.tabH = tabbar.offsetHeight;
        res.stageBottom = Math.round(stage.getBoundingClientRect().bottom);
        res.tabTop = Math.round(tabbar.getBoundingClientRect().top);
        res.covered = res.tabTop < res.stageBottom - 1;
      }
      res.bodyFont = getComputedStyle(document.body).fontSize;
      var small = [];
      ['.btn', '.take-btn', '.pick', '.tab', '.order-row', '.fab', '.composer button', '.file-btn', '.linkbtn', '.tb-back'].forEach(function (sel) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
          var r = el.getBoundingClientRect();
          if (!r.width && !r.height) return;
          if (r.height < 44 || r.width < 44) small.push(sel + ':' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
      });
      res.smallTargets = small.slice(0, 10);
      var names = [];
      Array.prototype.forEach.call(document.querySelectorAll('.nb-name,.me-name,.oc-title,.orr-title,.tb-title,.detail-title'), function (el) {
        if (el.scrollWidth > el.clientWidth + 1) names.push(String(el.textContent).slice(0, 14));
      });
      res.ellipsisNames = names;
      res.ok = res.docSW <= res.vw && res.stageOverflowX <= 0 && !res.covered && small.length === 0;
    } catch (err) {
      res.error = String((err && err.message) || err);
    }
    document.title = 'LYCHECK ' + JSON.stringify(res);
    var pre = document.createElement('pre');
    pre.id = 'lycheck';
    pre.style.display = 'none';
    pre.textContent = JSON.stringify(res);
    document.body.appendChild(pre);
  }

  /* ---------------- 启动 ---------------- */
  function afterAuth(params) {
    var screen = params.get('screen');
    var target = null;
    if (screen === 'order') target = '#/order/' + encodeURIComponent(params.get('id') || 'o_claimed');
    else if (screen === 'home' || screen === 'post' || screen === 'orders' || screen === 'me') target = '#/' + screen;
    if (target) {
      if (location.hash === target) route();
      else location.hash = target;
    } else if (location.hash) {
      route();
    } else {
      location.hash = '#/home';
    }
  }
  function boot() {
    bind();
    try { S.token = localStorage.getItem(TOKEN_KEY); } catch (e) { S.token = null; }
    var params = new URLSearchParams(location.search);
    if (S.token) {
      api('/me').then(function (m) {
        var u = (m && m.user) || m;
        if (!u || !u.id) throw new Error('身份没读出来');
        setMe(u, m && m.building);
        startPolling();
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
  }

  boot();
})();

/* ============================================================
   柳荫册 · 管理后台
   密码进（POST /api/liuyin/admin/login）→ token 存 sessionStorage
   → 统计 4 格 → 段选：提醒 / 订单 / 用户 / 机器人 / 更多
   鉴权：请求头 x-ly-admin；401 一律回登录页。
   接口契约见 dev/liuyin-parity/PARITY-PLAN.md §3–§5。
   ============================================================ */
(function () {
  'use strict';

  var API = '/api/liuyin';
  var TOKEN_KEY = 'ly_admin_token';
  var SEGS = ['alerts', 'orders', 'users', 'robot', 'more'];

  var STATUS_TEXT = {
    pending: '待接',
    claimed: '待确认',
    connected: '进行中',
    delivered: '已送达',
    done: '已完成',
    cancelled: '已取消',
    released: '已回池'
  };

  var state = {
    token: '',
    seg: 'alerts',
    stats: null,
    statsErr: '',
    data: { alerts: null, orders: null, users: null, robot: null },
    loading: {},
    errors: {},
    robotLog: null,
    logErr: '',
    notice: null,
    noticeLoaded: false,
    booted: false
  };

  var el = {};
  var toastTimer = 0;
  var robotSaveTimer = 0;
  var robotSaveChain = Promise.resolve();
  var modalState = { resolve: null, lastFocus: null };

  /* ============================================================
   * 小工具
   * ============================================================ */
  function $(id) { return document.getElementById(id); }

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pad2(n) { n = Number(n); return n < 10 ? '0' + n : '' + n; }
  function charCount(s) {
    if (!s) return 0;
    return typeof Array.from === 'function' ? Array.from(String(s)).length : String(s).length;
  }

  function timeStr(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    var now = new Date();
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + hm;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm;
  }

  function hmStr(s) {
    if (!s) return '';
    var d = new Date(s);
    if (!isNaN(d.getTime())) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s));
    return m ? pad2(Number(m[1])) + ':' + m[2] : '';
  }

  function statusText(st) { return STATUS_TEXT[st] || st || '未知'; }
  function pillClass(st) {
    return ['pending', 'claimed', 'connected', 'delivered', 'done', 'cancelled', 'released'].indexOf(st) >= 0
      ? 'st-' + st : '';
  }
  function errMsg(e) { return (e && e.message) || '操作没成功，再试一次'; }

  /* ============================================================
   * 请求
   * ============================================================ */
  function request(path, opts) {
    opts = opts || {};
    var headers = {};
    if (opts.body !== undefined && opts.body !== null) headers['content-type'] = 'application/json';
    if (state.token) headers['x-ly-admin'] = state.token;
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined || opts.body === null ? undefined : JSON.stringify(opts.body),
      cache: 'no-store'
    }).catch(function () {
      var e = new Error('网络不太好，重试中…');
      e.network = true;
      throw e;
    }).then(function (res) {
      return res.text().then(function (text) {
        var j = null;
        try { j = text ? JSON.parse(text) : null; } catch (err) { j = null; }
        if (res.status === 401) {
          var e401 = new Error((j && j.error) || '管理身份失效');
          e401.status = 401;
          throw e401;
        }
        if (!res.ok || (j && j.ok === false)) {
          var e2 = new Error((j && j.error) || ('请求没成功（' + res.status + '）'));
          e2.status = res.status;
          throw e2;
        }
        if (j && typeof j === 'object' && j.ok === true && Object.prototype.hasOwnProperty.call(j, 'data')) {
          return j.data;
        }
        return j;
      });
    });
  }
  function post(path, payload) {
    return request(path, { method: 'POST', body: payload === undefined ? {} : payload });
  }

  function authLost(message) {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    state.token = '';
    state.booted = false;
    showLogin(message || '登录已过期，重新输入密码');
  }

  /* ============================================================
   * toast / busy / 确认弹层
   * ============================================================ */
  function toast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.hidden = false;
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('show');
      setTimeout(function () { if (!el.toast.classList.contains('show')) el.toast.hidden = true; }, 240);
    }, 2800);
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
      if (btn._label == null) btn._label = btn.textContent;
      btn.disabled = true;
      if (label) btn.textContent = label;
    } else {
      btn.disabled = false;
      if (btn._label != null) { btn.textContent = btn._label; btn._label = null; }
    }
  }

  function confirmModal(opts) {
    return new Promise(function (resolve) {
      if (!el.modal) { resolve(window.confirm(opts.title + '\n' + (opts.body || ''))); return; }
      modalState.resolve = resolve;
      modalState.lastFocus = document.activeElement;
      el.modalTitle.textContent = opts.title || '确认操作';
      el.modalBody.textContent = opts.body || '';
      el.modalOk.textContent = opts.ok || '确认';
      el.modalOk.className = 'btn ' + (opts.danger ? 'danger solid' : 'primary');
      el.modal.hidden = false;
      document.body.classList.add('modal-open');
      setTimeout(function () { try { el.modalCancel.focus(); } catch (e) {} }, 20);
    });
  }

  function closeModal(ok) {
    if (!el.modal || el.modal.hidden) return;
    el.modal.hidden = true;
    document.body.classList.remove('modal-open');
    var resolve = modalState.resolve;
    modalState.resolve = null;
    var last = modalState.lastFocus;
    modalState.lastFocus = null;
    if (last && last.focus && document.contains(last)) { try { last.focus(); } catch (e) {} }
    if (resolve) resolve(!!ok);
  }

  /* ============================================================
   * 数据规范化（后端并行开发：新旧字段名都兜住）
   * ============================================================ */
  function arrayOf(x) { return Array.isArray(x) ? x : null; }

  function listFrom(d, keys) {
    var direct = arrayOf(d);
    if (direct) return direct;
    if (!d || typeof d !== 'object') return [];
    for (var i = 0; i < keys.length; i++) {
      var arr = arrayOf(d[keys[i]]);
      if (arr) return arr;
    }
    return [];
  }

  function pickNum(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (typeof v === 'number' && isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
    }
    return null;
  }
  function numOr(obj, keys, fallback) {
    var n = pickNum(obj, keys);
    return n == null ? fallback : n;
  }
  function pickBool(obj, keys, fallback) {
    if (!obj || typeof obj !== 'object') return fallback;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (v === true || v === 1 || v === '1' || v === 'true') return true;
      if (v === false || v === 0 || v === '0' || v === 'false') return false;
    }
    return fallback;
  }

  function readStats(d) {
    var src = (d && d.stats && typeof d.stats === 'object') ? d.stats : (d || {});
    var ob = src.orders_by_status || src.ordersByStatus || (d && d.orders_by_status) || {};

    var alerts = pickNum(src, ['pending_alerts', 'pendingAlerts', 'alerts_pending', 'alert_pending', 'pending_alert_count']);
    if (alerts == null) {
      var al = arrayOf(src.alerts);
      if (al) alerts = al.filter(function (a) { return !(a && (a.handled === true || a.handled === 1)); }).length;
      else alerts = 0;
    }

    var active = pickNum(src, ['active_orders', 'activeOrders', 'orders_active', 'orders_in_progress']);
    if (active == null) {
      active = num(ob.claimed) + num(ob.connected) + num(ob.delivered);
    }

    var blocked = pickNum(src, ['blocked_users', 'blockedUsers', 'users_blocked', 'banned', 'frozen_users']);
    if (blocked == null) blocked = 0;

    var total = pickNum(src, ['total_users', 'totalUsers', 'user_count', 'users']);
    if (total == null) {
      var us = arrayOf(src.users);
      total = us ? us.length : 0;
    }

    return { alerts: num(alerts), active: num(active), blocked: num(blocked), users: num(total) };
  }

  function normAlerts(d) {
    var raw = listFrom(d, ['alerts', 'list', 'items']);
    var out = [];
    raw.forEach(function (a, i) {
      if (!a || typeof a !== 'object') return;
      var type = a.type || a.alert_type || '';
      var handled = pickBool(a, ['handled', 'is_handled', 'resolved'], false);
      out.push({
        id: a.id || a.alert_id || ('a' + i),
        title: a.title || (type === 'missed_connections' ? '连续未响应' : '提醒'),
        detail: a.detail || a.body || a.message || (a.count ? '累计 ' + a.count + ' 次未响应' : ''),
        handled: handled,
        time: a.created_at || a.createdAt || a.at || ''
      });
    });
    return out;
  }

  function normOrders(d) {
    var raw = listFrom(d, ['orders', 'list', 'items']);
    var out = [];
    raw.forEach(function (x) {
      var o = x && x.order && typeof x.order === 'object' ? x.order : x;
      if (!o || typeof o !== 'object') return;
      var creator = (o.creator && o.creator.name) || o.creator_name || o.requester_name || '';
      var claimer = (o.claimer && o.claimer.name) || o.claimer_name || o.helper_name || '';
      var title = o.title || [o.category, o.size].filter(Boolean).join(' · ') || o.template_id || '委托';
      var steps = arrayOf(o.steps);
      out.push({
        id: o.id || o.order_id || '',
        title: title,
        creatorName: creator,
        claimerName: claimer,
        status: o.status || '',
        points: numOr(o, ['points', 'point'], 0),
        note: o.note || '',
        time: o.created_at || o.createdAt || o.updated_at || o.time || '',
        stepsCount: steps ? steps.length : 0
      });
    });
    return out;
  }

  function normUsers(d) {
    var raw = listFrom(d, ['users', 'list', 'items']);
    var out = [];
    raw.forEach(function (u, i) {
      if (!u || typeof u !== 'object') return;
      var isDemo = pickBool(u, ['is_demo', 'isDemo', 'demo'], false) ||
        u.role === 'demo' || u.role === 'robot';
      var banned = pickBool(u, ['banned', 'is_banned'], false) ||
        u.status === 'blocked' || u.status === 'banned';
      out.push({
        id: u.id || u.user_id || ('u' + i),
        name: u.name || u.nickname || '同学',
        floor: pickNum(u, ['floor']),
        points: numOr(u, ['points', 'helped'], 0),
        missed: numOr(u, ['missed', 'missed_connections', 'missedConnections'], 0),
        isDemo: isDemo,
        banned: banned
      });
    });
    out.sort(function (a, b) {
      if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
      var fa = a.floor == null ? 99 : a.floor;
      var fb = b.floor == null ? 99 : b.floor;
      if (fa !== fb) return fa - fb;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
    return out;
  }

  function normRobot(d) {
    var cfg = null;
    if (d && typeof d === 'object') {
      if (d.config && typeof d.config === 'object') cfg = d.config;
      else if (d.robot && typeof d.robot === 'object') cfg = d.robot;
      else cfg = d;
    }
    cfg = cfg || {};
    return {
      enabled: pickBool(cfg, ['enabled'], false),
      interval_sec: clamp(numOr(cfg, ['interval_sec', 'intervalSec', 'interval'], 5), 2, 300),
      max_actions: clamp(numOr(cfg, ['max_actions', 'maxActions', 'max_actions_per_tick', 'maxActionsPerTick'], 1), 1, 10),
      auto_accept: pickBool(cfg, ['auto_accept', 'autoAccept'], true),
      auto_connect: pickBool(cfg, ['auto_connect', 'autoConnect'], true),
      auto_steps: pickBool(cfg, ['auto_steps', 'autoSteps'], true),
      auto_confirm: pickBool(cfg, ['auto_confirm', 'autoConfirm'], true),
      random_chat: pickBool(cfg, ['random_chat', 'randomChat'], true),
      chat_chance: clamp(numOr(cfg, ['chat_chance', 'chatChance'], 30), 0, 100),
      pool_min: clamp(numOr(cfg, ['pool_min', 'poolMin'], 2), 0, 20)
    };
  }

  function clamp(v, min, max) {
    v = num(v);
    if (v < min) v = min;
    if (v > max) v = max;
    return Math.round(v);
  }

  function normLogs(d) {
    var raw = listFrom(d, ['logs', 'log', 'list', 'items']);
    var times = raw.map(function (x) {
      if (!x || typeof x !== 'object') return NaN;
      var t = x.created_at || x.createdAt || x.at;
      return t ? Date.parse(t) : NaN;
    });
    var out = [];
    raw.forEach(function (x) {
      if (typeof x === 'string') { if (x) out.push({ text: x, time: '' }); return; }
      if (!x || typeof x !== 'object') return;
      var text = x.text || x.message || x.body || '';
      if (!text) return;
      out.push({
        text: String(text),
        time: hmStr(x.created_at || x.createdAt || x.at || (typeof x.time === 'string' ? x.time : ''))
      });
    });
    if (out.length > 1 && isFinite(times[0]) && isFinite(times[times.length - 1]) && times[0] < times[times.length - 1]) {
      out.reverse();
    }
    return out.slice(0, 30);
  }

  /* ============================================================
   * 加载
   * ============================================================ */
  function loadStats() {
    return request('/admin/stats').then(function (d) {
      state.stats = readStats(d);
      state.statsErr = '';
    }).catch(function (e) {
      if (e && e.status === 401) { authLost(); return; }
      state.statsErr = errMsg(e);
    }).then(function () { renderStats(); });
  }

  function loadSeg(seg, force) {
    if (seg === 'more') return loadNotice(force);
    if (seg === 'robot') return loadRobot(force);
    if (state.loading[seg]) return Promise.resolve();
    if (!force && state.data[seg]) { if (state.seg === seg) renderView(); return Promise.resolve(); }

    state.loading[seg] = true;
    state.errors[seg] = '';
    if (state.seg === seg) renderView();

    var path = seg === 'alerts' ? '/admin/alerts' : seg === 'orders' ? '/admin/orders' : '/admin/users';
    return request(path).then(function (d) {
      if (seg === 'alerts') state.data.alerts = normAlerts(d);
      else if (seg === 'orders') state.data.orders = normOrders(d);
      else state.data.users = normUsers(d);
    }).catch(function (e) {
      if (e && e.status === 401) { authLost(); return; }
      state.errors[seg] = errMsg(e);
    }).then(function () {
      state.loading[seg] = false;
      if (state.seg === seg) renderView();
    });
  }

  function loadRobot(force) {
    if (state.loading.robot) return Promise.resolve();
    if (!force && state.data.robot) { if (state.seg === 'robot') renderView(); return Promise.resolve(); }

    state.loading.robot = true;
    state.errors.robot = '';
    state.logErr = '';
    if (state.seg === 'robot') renderView();

    var pCfg = request('/admin/robot').then(function (d) {
      state.data.robot = normRobot(d);
    }).catch(function (e) {
      if (e && e.status === 401) { authLost(); return; }
      state.errors.robot = errMsg(e);
    });

    var pLog = request('/admin/robot/log').then(function (d) {
      state.robotLog = normLogs(d);
    }).catch(function (e) {
      if (e && e.status === 401) { authLost(); return; }
      state.logErr = errMsg(e);
    });

    return Promise.all([pCfg, pLog]).then(function () {
      state.loading.robot = false;
      if (state.seg === 'robot') renderView();
    });
  }

  function loadNotice(force) {
    if (state.loading.more) return Promise.resolve();
    if (!force && state.noticeLoaded) { if (state.seg === 'more') renderView(); return Promise.resolve(); }

    state.loading.more = true;
    state.errors.more = '';
    return request('/admin/notice').then(function (d) {
      var text = d && (d.notice !== undefined && d.notice !== null ? d.notice : d.text);
      state.notice = text == null ? '' : String(text);
      state.noticeLoaded = true;
    }).catch(function (e) {
      if (e && e.status === 401) { authLost(); return; }
      // 读取公告的接口可能还没上线：不阻塞「更多」段，输入框留空，保存仍然可用
      state.noticeLoaded = true;
      state.notice = state.notice == null ? '' : state.notice;
    }).then(function () {
      state.loading.more = false;
      if (state.seg !== 'more') return;
      var ta = $('notice-input');
      if (ta) { ta.value = state.notice || ''; updateNoticeCount(); }
      else renderView();
    });
  }

  function refreshAll(showToast) {
    state.stats = null;
    state.statsErr = '';
    state.data = { alerts: null, orders: null, users: null, robot: null };
    state.robotLog = null;
    state.logErr = '';
    state.errors = {};
    state.noticeLoaded = false;
    var p1 = loadStats();
    var p2 = state.seg === 'more' ? loadNotice(true) : loadSeg(state.seg, true);
    return Promise.all([p1, p2]).then(function () { if (showToast) toast('已刷新'); });
  }

  function refreshAfterAction(seg) {
    state.stats = null;
    state.statsErr = '';
    state.errors[seg] = '';
    if (seg === 'robot') {
      state.data.robot = null;
      state.robotLog = null;
      state.logErr = '';
    } else if (seg === 'more') {
      state.noticeLoaded = false;
    } else {
      state.data[seg] = null;
    }
    var p1 = loadStats();
    var p2 = seg === 'more' ? loadNotice(true) : loadSeg(seg, true);
    return Promise.all([p1, p2]);
  }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function skeletonHTML(n) {
    var out = '';
    for (var i = 0; i < (n || 3); i++) {
      out += '<div class="sk-card" aria-hidden="true">'
        + '<div class="sk-line" style="width:52%"></div>'
        + '<div class="sk-line" style="width:82%"></div>'
        + '<div class="sk-line" style="width:34%"></div>'
        + '</div>';
    }
    return out;
  }

  function errorBarHTML(message, seg) {
    return '<div class="error-bar" role="alert"><span>' + esc(message) + '</span>'
      + '<button type="button" class="btn sm" data-a="retry" data-seg="' + esc(seg) + '">重试</button></div>';
  }

  function renderStats() {
    var s = state.stats;
    function cell(goto, value, label, sub) {
      var text = value == null ? '—' : String(value);
      return '<button type="button" class="stat' + (value === 0 ? ' is-zero' : '') + '" data-goto="' + goto + '">'
        + '<b>' + esc(text) + '</b>'
        + '<span class="lbl">' + esc(label) + '</span>'
        + '<span class="sub">' + esc(sub) + '</span>'
        + '</button>';
    }
    var html = '';
    if (state.statsErr) {
      html += '<div class="error-bar" role="alert"><span>' + esc(state.statsErr) + '</span>'
        + '<button type="button" class="btn sm" data-a="retry" data-seg="stats">重试</button></div>';
    }
    html += cell('alerts', s ? s.alerts : null, '待处理提醒', '需要处理')
      + cell('orders', s ? s.active : null, '进行中订单', '待接之外')
      + cell('users', s ? s.blocked : null, '已冻结', '暂时停用')
      + cell('users', s ? s.users : null, '用户数', '登记过的');
    el.stats.innerHTML = html;
  }

  function renderSeg() {
    var btns = el.seg.querySelectorAll('button[data-seg]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-selected', btns[i].getAttribute('data-seg') === state.seg ? 'true' : 'false');
    }
  }

  function renderView() {
    var seg = state.seg;
    if (seg === 'more') {
      el.view.innerHTML = renderMore();
      updateNoticeCount();
      el.view.setAttribute('aria-busy', 'false');
      return;
    }

    var html = '';
    if (state.errors[seg]) html += errorBarHTML(state.errors[seg], seg);

    var ready = !!state.data[seg];
    if (seg === 'robot') {
      html += renderRobot(ready);
    } else if (!ready && state.loading[seg]) {
      html += skeletonHTML(3);
    } else if (seg === 'alerts') {
      html += renderAlerts();
    } else if (seg === 'orders') {
      html += renderOrders();
    } else if (seg === 'users') {
      html += renderUsers();
    }

    el.view.innerHTML = html;
    el.view.setAttribute('aria-busy', state.loading[seg] ? 'true' : 'false');
  }

  function renderAlerts() {
    var list = state.data.alerts;
    if (!list) return '';
    if (!list.length) return '<div class="empty">没有待处理提醒。<br>连续未响应的邻居会在这里出现。</div>';
    return list.map(function (a) {
      return '<div class="card' + (a.handled ? ' muted' : '') + '">'
        + '<div class="card-top">'
        + '<div class="grow"><div class="card-title">' + esc(a.title) + '</div>'
        + (a.detail ? '<div class="card-meta">' + esc(a.detail) + '</div>' : '')
        + (a.time ? '<div class="card-meta"><span class="time">' + esc(timeStr(a.time)) + '</span></div>' : '')
        + '</div>'
        + (a.handled
          ? '<span class="pill handled">已处理</span>'
          : '<button type="button" class="btn-mini" data-a="resolve-alert" data-id="' + esc(a.id) + '">处理</button>')
        + '</div></div>';
    }).join('');
  }

  function renderOrders() {
    var list = state.data.orders;
    if (!list) return '';
    if (!list.length) return '<div class="empty">还没有订单。<br>前台发一条委托，这里就能看到。</div>';
    return list.map(function (o) {
      var st = String(o.status || '');
      return '<div class="card">'
        + '<div class="card-top">'
        + '<div class="grow"><div class="card-title">' + esc(o.title) + '</div></div>'
        + '<span class="pill ' + pillClass(st) + '">' + esc(statusText(st)) + '</span>'
        + '</div>'
        + '<div class="meta-inline">'
        + '<span><em>双方</em>' + esc(o.creatorName || '—') + ' → ' + esc(o.claimerName || '待接') + '</span>'
        + '<span><em>点数</em>' + num(o.points) + ' 点</span>'
        + (o.stepsCount ? '<span><em>步骤</em>' + num(o.stepsCount) + ' 步</span>' : '')
        + '</div>'
        + (o.note ? '<div class="card-meta">' + esc(o.note) + '</div>' : '')
        + '<div class="card-foot">'
        + '<span class="time">' + esc(timeStr(o.time) || '时间未知') + '</span>'
        + '<button type="button" class="btn-mini danger" data-a="del-order" data-id="' + esc(o.id) + '">删单</button>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  function renderUsers() {
    var list = state.data.users;
    if (!list) return '';
    if (!list.length) return '<div class="empty">还没有用户。<br>楼里有人写下名字，就会出现在这里。</div>';
    return list.map(function (u) {
      var demo = !!u.isDemo;
      var banned = !!u.banned;
      var meta = [];
      if (u.floor != null) meta.push(u.floor + ' 层');
      meta.push('人情 ' + num(u.points));
      meta.push('未响应 ' + num(u.missed) + ' 次');
      var action;
      if (demo) {
        action = '<span class="nofreeze">不可冻结</span>';
      } else if (banned) {
        action = '<button type="button" class="btn-mini" data-a="user-toggle" data-id="' + esc(u.id) + '" data-banned="1">恢复</button>';
      } else {
        action = '<button type="button" class="btn-mini danger" data-a="user-toggle" data-id="' + esc(u.id) + '" data-banned="0">冻结</button>';
      }
      return '<div class="card">'
        + '<div class="card-top">'
        + '<div class="grow"><div class="card-title">' + esc(u.name)
        + (demo ? ' <span class="pill demo">机器人</span>' : '')
        + (banned ? ' <span class="pill st-cancelled">已冻结</span>' : '')
        + '</div>'
        + '<div class="card-meta">' + esc(meta.join(' · ')) + '</div>'
        + '</div>' + action
        + '</div></div>';
    }).join('');
  }

  function switchHTML(key, label, sub) {
    var on = !!(state.data.robot && state.data.robot[key]);
    return '<div class="switch-row"><div class="grow"><b>' + esc(label) + '</b><span>' + esc(sub) + '</span></div>'
      + '<button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"'
      + ' aria-label="' + esc(label) + '" data-a="robot-toggle" data-key="' + esc(key) + '"></button></div>';
  }

  function numFieldHTML(key, label, unit, sub, min, max) {
    var v = state.data.robot ? state.data.robot[key] : '';
    return '<div class="field"><label for="rf-' + key + '">' + esc(label)
      + ' <span class="unit">' + esc(unit) + '</span>'
      + (sub ? '<span class="fs">' + esc(sub) + '</span>' : '')
      + '</label><input class="num-input" id="rf-' + key + '" type="number" inputmode="numeric"'
      + ' min="' + min + '" max="' + max + '" step="1" value="' + esc(String(v)) + '"'
      + ' data-robot-num="' + key + '" data-min="' + min + '" data-max="' + max + '"></div>';
  }

  function rangeFieldHTML(key, label, unit, min, max, step) {
    var v = state.data.robot ? state.data.robot[key] : 0;
    return '<div class="field span-2"><label for="rf-' + key + '">' + esc(label) + '</label>'
      + '<div class="range-row"><input type="range" id="rf-' + key + '" min="' + min + '" max="' + max
      + '" step="' + step + '" value="' + esc(String(v)) + '" data-robot-range="' + key + '">'
      + '<span class="range-val" id="rv-' + key + '">' + esc(String(v)) + esc(unit) + '</span></div></div>';
  }

  function robotNoteText(cfg) {
    if (!cfg) return '';
    return cfg.enabled
      ? '正在运行 · 每 ' + num(cfg.interval_sec) + ' 秒最多动 ' + num(cfg.max_actions) + ' 次'
      : '已暂停';
  }

  function renderRobot(ready) {
    if (!ready) return state.loading.robot ? skeletonHTML(3) : '';
    var cfg = state.data.robot;
    var html = '<section class="panel">'
      + '<div class="panel-head"><h2>机器人邻居</h2>'
      + '<span class="ph-note" id="robot-state">' + esc(robotNoteText(cfg)) + '</span></div>'
      + switchHTML('enabled', '启用机器人', '扮演对方，自动接单 / 建联 / 走步骤')
      + switchHTML('auto_accept', '自动接单', '我发布的待接单')
      + switchHTML('auto_connect', '自动建联', '我已确认后，对方补确认')
      + switchHTML('auto_steps', '自动推进步骤', '对方负责的取到 / 交付')
      + switchHTML('auto_confirm', '自动确认收货', '我是接单方时，对方确认')
      + switchHTML('random_chat', '随机消息', '偶尔发一句，模拟真实沟通')
      + '<div class="field-grid">'
      + numFieldHTML('interval_sec', '动作间隔', '秒', '最少隔这么久', 2, 300)
      + numFieldHTML('max_actions', '每次动作数', '个', '单轮最多几件', 1, 10)
      + rangeFieldHTML('chat_chance', '消息概率', '%', 0, 100, 10)
      + numFieldHTML('pool_min', '池底数量', '条', '低于就补一条', 0, 20)
      + '</div>'
      + '<div class="robot-actions">'
      + '<button type="button" class="btn primary" data-a="robot-run" data-n="1">立即执行一次</button>'
      + '<button type="button" class="btn" data-a="robot-run" data-n="5">连跑一轮</button>'
      + '<button type="button" class="btn" data-a="robot-seed">生成 6 种测试场景</button>'
      + '<button type="button" class="btn" data-a="robot-clear-log">清空日志</button>'
      + '</div>'
      + '<p class="hint">测试场景：待接 / 待建联 / 履约中 / 已送达 / 已完成 / 已释放，机器人会分别处理。'
      + '生成后回前台刷新，就能看到这几种单。</p>'
      + '</section>';

    html += '<div class="sec-row"><h2>机器人日志</h2><span>最近 '
      + (state.robotLog ? state.robotLog.length : 0) + ' 条</span></div>';

    if (state.logErr) html += errorBarHTML(state.logErr, 'robot');
    if (state.robotLog && state.robotLog.length) {
      html += '<div class="log-list">' + state.robotLog.map(function (l) {
        return '<div class="log-row"><span class="log-time">' + esc(l.time || '—') + '</span>'
          + '<span class="log-text">' + esc(l.text) + '</span></div>';
      }).join('') + '</div>';
    } else if (state.loading.robot) {
      html += skeletonHTML(2);
    } else {
      html += '<div class="empty">还没有动作。点「立即执行一次」，或打开「启用机器人」等它自己跑。</div>';
    }
    return html;
  }

  function dangerRowHTML(title, sub, what, btnLabel) {
    return '<div class="danger-row"><div class="grow"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>'
      + '<button type="button" class="btn-mini danger" data-a="clear" data-what="' + esc(what) + '">'
      + esc(btnLabel) + '</button></div>';
  }

  function renderMore() {
    var notice = state.notice == null ? '' : String(state.notice);
    return '<section class="panel">'
      + '<div class="panel-head"><h2>公告</h2><span class="ph-note">显示在楼里首页顶部 · 最多 200 字</span></div>'
      + '<label class="sr" for="notice-input">公告内容</label>'
      + '<textarea class="input" id="notice-input" maxlength="200" rows="3"'
      + ' placeholder="今天楼里要说的，写在这里。留空保存即清除公告。">' + esc(notice) + '</textarea>'
      + '<div class="row-end"><span class="hint" id="notice-count">' + charCount(notice) + '/200</span>'
      + '<button type="button" class="btn primary" data-a="save-notice">保存公告</button></div>'
      + '<p class="hint">公告只在这栋楼里显示，不发推送。</p>'
      + '</section>'
      + '<section class="panel danger-zone">'
      + '<div class="panel-head"><h2>清空</h2><span class="ph-note">不可撤销，操作前会再确认一次</span></div>'
      + dangerRowHTML('清空订单', '订单、消息、人情流水一起清掉', 'orders', '清空订单')
      + dangerRowHTML('清空用户', '用户与冻结记录一起清掉；订单保留', 'users', '清空用户')
      + dangerRowHTML('清空全部', '订单与用户全部清掉，楼里重新开始', 'all', '清空全部')
      + '</section>'
      + '<section class="panel">'
      + '<div class="panel-head"><h2>演示数据</h2><span class="ph-note">重新铺一遍楼里的演示邻居与订单</span></div>'
      + '<p class="hint">会写入演示邻居和示例订单；已有的真人用户和订单不受影响，可反复执行。</p>'
      + '<button type="button" class="btn" data-a="seed-demo">重置演示数据</button>'
      + '</section>';
  }

  function updateNoticeCount() {
    var ta = $('notice-input');
    var out = $('notice-count');
    if (!ta || !out) return;
    out.textContent = charCount(ta.value) + '/200';
  }

  function updateRobotNote() {
    var node = $('robot-state');
    if (!node || !state.data.robot) return;
    node.textContent = robotNoteText(state.data.robot);
  }

  /* ============================================================
   * 段切换
   * ============================================================ */
  function showSeg(seg) {
    if (SEGS.indexOf(seg) === -1 || state.seg === seg) return;
    state.seg = seg;
    renderSeg();
    renderView();
    loadSeg(seg, false);
  }

  /* ============================================================
   * 机器人配置保存
   * ============================================================ */
  function robotPayload(cfg) {
    return {
      enabled: !!cfg.enabled,
      interval_sec: num(cfg.interval_sec),
      max_actions: num(cfg.max_actions),
      auto_accept: !!cfg.auto_accept,
      auto_connect: !!cfg.auto_connect,
      auto_steps: !!cfg.auto_steps,
      auto_confirm: !!cfg.auto_confirm,
      random_chat: !!cfg.random_chat,
      chat_chance: num(cfg.chat_chance),
      pool_min: num(cfg.pool_min)
    };
  }

  function queueRobotSave() {
    if (!state.data.robot) return robotSaveChain;
    var payload = robotPayload(state.data.robot);
    robotSaveChain = robotSaveChain.then(function () {
      return post('/admin/robot', { config: payload }).then(function () {
        updateRobotNote();
        toast('机器人设置已保存');
      }).catch(function (e) {
        if (e && e.status === 401) { authLost(); return; }
        toast(errMsg(e));
        // 保存失败时以服务端配置为准，避免界面和真实配置不一致
        return request('/admin/robot').then(function (d) {
          state.data.robot = normRobot(d);
          if (state.seg === 'robot') renderView();
        }).catch(function () {});
      });
    });
    return robotSaveChain;
  }

  function scheduleRobotSave() {
    clearTimeout(robotSaveTimer);
    robotSaveTimer = setTimeout(function () { queueRobotSave(); }, 380);
  }

  /* ============================================================
   * 动作
   * ============================================================ */
  function actionFail(e, btn) {
    setBusy(btn, false);
    if (e && e.status === 401) { authLost(); return; }
    toast(errMsg(e));
  }

  function runCount(d, fallback) {
    if (Array.isArray(d)) return d.length;
    if (d && typeof d === 'object') {
      var arr = d.actions || d.results || d.done || d.logs;
      if (Array.isArray(arr)) return arr.length;
      var n = pickNum(d, ['count', 'actions_count', 'done_count', 'ran', 'moved']);
      if (n != null) return n;
    }
    return fallback > 1 ? fallback : 0;
  }

  function seedCount(d) {
    if (Array.isArray(d)) return d.length;
    if (d && typeof d === 'object') {
      var arr = d.ids || d.orders || d.scenarios;
      if (Array.isArray(arr)) return arr.length;
      var n = pickNum(d, ['count', 'seeded', 'added']);
      if (n != null) return n;
    }
    return 6;
  }

  function doLogout() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    state.token = '';
    state.booted = false;
    showLogin('');
    toast('已退出管理台');
  }

  function handleAction(t) {
    var a = t.getAttribute('data-a');

    if (a === 'refresh') {
      setBusy(t, true, '刷新中…');
      refreshAll(true).then(function () { setBusy(t, false); });
      return;
    }

    if (a === 'logout') { doLogout(); return; }

    if (a === 'retry') {
      var seg = t.getAttribute('data-seg') || state.seg;
      if (seg === 'stats') {
        state.statsErr = '';
        state.stats = null;
        renderStats();
        loadStats();
        return;
      }
      state.errors[seg] = '';
      if (seg === 'more') { state.noticeLoaded = false; loadNotice(true); return; }
      loadSeg(seg, true);
      return;
    }

    if (a === 'resolve-alert') {
      var alertId = t.getAttribute('data-id');
      if (!alertId) return;
      confirmModal({
        title: '标记已处理？',
        body: '只是把这条提醒从待处理里移除，不会通知用户。',
        ok: '标记已处理'
      }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, '处理中…');
        post('/admin/alert/resolve', { id: alertId }).then(function () {
          toast('已标记处理');
          return refreshAfterAction('alerts');
        }).catch(function (e) { actionFail(e, t); });
      });
      return;
    }

    if (a === 'del-order') {
      var orderId = t.getAttribute('data-id');
      if (!orderId) return;
      confirmModal({
        title: '删除这一单？',
        body: '删掉后不能再恢复，这一单的消息和人情流水也会一起清掉。',
        ok: '删除',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, '删除中…');
        post('/admin/order/delete', { id: orderId }).then(function () {
          toast('订单已删除');
          return refreshAfterAction('orders');
        }).catch(function (e) { actionFail(e, t); });
      });
      return;
    }

    if (a === 'user-toggle') {
      var userId = t.getAttribute('data-id');
      var wasBanned = t.getAttribute('data-banned') === '1';
      if (!userId) return;
      confirmModal({
        title: wasBanned ? '恢复这个账号？' : '冻结这个账号？',
        body: wasBanned ? '恢复后可以正常发单和接单。' : '冻结后不能再发单或接单，可随时恢复。',
        ok: wasBanned ? '恢复' : '冻结',
        danger: !wasBanned
      }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, wasBanned ? '恢复中…' : '冻结中…');
        post('/admin/user', { id: userId, banned: !wasBanned, reason: '管理操作' }).then(function () {
          toast(wasBanned ? '已恢复，可以正常使用了' : '已冻结，不会再发单或接单');
          return refreshAfterAction('users');
        }).catch(function (e) { actionFail(e, t); });
      });
      return;
    }

    if (a === 'robot-toggle') {
      var key = t.getAttribute('data-key');
      if (!key || !state.data.robot) return;
      state.data.robot[key] = !state.data.robot[key];
      t.setAttribute('aria-checked', state.data.robot[key] ? 'true' : 'false');
      updateRobotNote();
      queueRobotSave();
      return;
    }

    if (a === 'robot-run') {
      var n = Number(t.getAttribute('data-n')) || 1;
      setBusy(t, true, n > 1 ? '连跑中…' : '执行中…');
      post('/admin/robot/run', { n: n }).then(function (d) {
        var count = runCount(d, n);
        if (n > 1) toast(count > 0 ? ('连跑完成：' + count + ' 个动作') : '没有可执行动作，先生成测试场景');
        else toast(count > 0 ? ('机器人动了 ' + count + ' 下') : '没有可执行动作：先发一单，或先生成测试场景');
        return refreshAfterAction('robot');
      }).then(function () { setBusy(t, false); })
        .catch(function (e) { actionFail(e, t); });
      return;
    }

    if (a === 'robot-seed') {
      setBusy(t, true, '生成中…');
      post('/admin/robot/seed', {}).then(function (d) {
        toast('已铺 ' + seedCount(d) + ' 种测试场景');
        return refreshAfterAction('robot');
      }).then(function () { setBusy(t, false); })
        .catch(function (e) { actionFail(e, t); });
      return;
    }

    if (a === 'robot-clear-log') {
      confirmModal({
        title: '清空机器人日志？',
        body: '只清空日志，不动配置和订单。',
        ok: '清空日志',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, '清空中…');
        post('/admin/robot/log', { clear: true }).then(function () {
          state.robotLog = [];
          if (state.seg === 'robot') renderView();
          toast('日志已清空');
        }).catch(function (e) {
          setBusy(t, false);
          if (e && e.status === 404) {
            toast('清空日志接口还没接通（POST /admin/robot/log）');
            return;
          }
          actionFail(e, t);
        });
      });
      return;
    }

    if (a === 'save-notice') {
      var ta = $('notice-input');
      var text = ta ? String(ta.value || '').trim() : '';
      if (!text) {
        confirmModal({
          title: '清空公告？',
          body: '楼里首页顶部将不再显示公告。',
          ok: '清空',
          danger: true
        }).then(function (ok) { if (ok) saveNotice(''); });
        return;
      }
      saveNotice(text);
      return;
    }

    if (a === 'clear') {
      var what = t.getAttribute('data-what');
      var map = {
        orders: { title: '清空订单？', body: '订单、消息、人情流水都会清掉，且不能恢复。\n用户和冻结记录保留。' },
        users: { title: '清空用户？', body: '用户和冻结记录都会清掉，且不能恢复。\n订单会保留，但显示为「邻居」。' },
        all: { title: '清空全部？', body: '订单、消息、人情流水、用户和冻结记录全部清掉，且不能恢复。\n楼里会重新开始。' }
      };
      var cfg = map[what];
      if (!cfg) return;
      confirmModal({ title: cfg.title, body: cfg.body, ok: '确认清空', danger: true }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, '清空中…');
        post('/admin/clear', { what: what }).then(function (d) {
          var deleted = d && typeof d.deleted === 'number' ? '（' + d.deleted + ' 条）' : '';
          toast('已清空' + deleted);
          return refreshAll(false);
        }).then(function () { setBusy(t, false); })
          .catch(function (e) { actionFail(e, t); });
      });
      return;
    }

    if (a === 'seed-demo') {
      confirmModal({
        title: '重置演示数据？',
        body: '会重新写入演示邻居和示例订单；已有的真人用户和订单不受影响，可反复执行。',
        ok: '重置演示数据'
      }).then(function (ok) {
        if (!ok) return;
        setBusy(t, true, '写入中…');
        post('/admin/seed', {}).then(function (d) {
          var msg = '演示数据已就绪';
          if (d && d.users != null) {
            msg += '：用户 ' + d.users + ' · 订单 ' + (d.orders != null ? d.orders : '—');
          }
          toast(msg);
          return refreshAll(false);
        }).then(function () { setBusy(t, false); })
          .catch(function (e) { actionFail(e, t); });
      });
      return;
    }
  }

  function saveNotice(text) {
    var btn = document.querySelector('[data-a="save-notice"]');
    setBusy(btn, true, '保存中…');
    /* 契约只写了 POST /admin/notice，未规定字段名：text / notice 同时带上，后端读哪个都行 */
    post('/admin/notice', { text: text, notice: text }).then(function (d) {
      var saved = d && (d.notice !== undefined && d.notice !== null ? d.notice : d.text);
      state.notice = saved !== undefined && saved !== null ? String(saved) : text;
      state.noticeLoaded = true;
      var ta = $('notice-input');
      if (ta) ta.value = state.notice;
      updateNoticeCount();
      setBusy(btn, false);
      toast(text ? '公告已保存' : '公告已清空');
    }).catch(function (e) { actionFail(e, btn); });
  }

  /* ============================================================
   * 登录 / 视图切换
   * ============================================================ */
  function showLogin(message) {
    el.adminView.hidden = true;
    el.loginView.hidden = false;
    el.loginErr.hidden = !message;
    el.loginErr.textContent = message || '';
    var pw = $('admin-pw');
    if (pw) {
      pw.value = '';
      setTimeout(function () { try { pw.focus(); } catch (e) {} }, 60);
    }
  }

  function showAdmin() {
    el.loginView.hidden = true;
    el.adminView.hidden = false;
  }

  function doLogin() {
    var pw = $('admin-pw');
    var value = pw ? pw.value.trim() : '';
    if (!value) {
      el.loginErr.hidden = false;
      el.loginErr.textContent = '先填管理密码。';
      if (pw) { try { pw.focus(); } catch (e) {} }
      return;
    }
    setBusy(el.loginBtn, true, '验证中…');
    post('/admin/login', { password: value }).then(function (d) {
      var token = d && (d.token || d.admin_token);
      if (!token) throw new Error('后台没有返回登录凭证');
      state.token = token;
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) {}
      setBusy(el.loginBtn, false);
      boot();
    }).catch(function (e) {
      setBusy(el.loginBtn, false);
      var msg = (e && e.status === 401) ? '密码不对，再试一次。'
        : (e && e.status === 400) ? (errMsg(e) || '先填管理密码。')
          : errMsg(e);
      el.loginErr.hidden = false;
      el.loginErr.textContent = msg;
      if (pw) { try { pw.focus(); } catch (e2) {} }
    });
  }

  function boot() {
    state.booted = true;
    showAdmin();
    state.stats = null;
    state.statsErr = '';
    state.data = { alerts: null, orders: null, users: null, robot: null };
    state.robotLog = null;
    state.logErr = '';
    state.errors = {};
    state.loading = {};
    state.notice = null;
    state.noticeLoaded = false;
    if (SEGS.indexOf(state.seg) === -1) state.seg = 'alerts';
    renderStats();
    renderSeg();
    renderView();
    loadStats();
    loadSeg(state.seg, true);
  }

  /* ============================================================
   * 事件绑定
   * ============================================================ */
  function initModal() {
    el.modalCancel.addEventListener('click', function () { closeModal(false); });
    el.modalOk.addEventListener('click', function () { closeModal(true); });
    el.modal.addEventListener('click', function (ev) {
      if (ev.target === el.modal) closeModal(false);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && el.modal && !el.modal.hidden) {
        ev.preventDefault();
        closeModal(false);
      }
    });
  }

  function initEvents() {
    el.loginForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doLogin();
    });

    document.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;
      var actionEl = target.closest('[data-a]');
      if (actionEl) {
        ev.preventDefault();
        handleAction(actionEl);
        return;
      }
      var gotoEl = target.closest('[data-goto]');
      if (gotoEl) {
        showSeg(gotoEl.getAttribute('data-goto'));
        return;
      }
      var segEl = target.closest('[data-seg]');
      if (segEl) {
        showSeg(segEl.getAttribute('data-seg'));
      }
    });

    el.view.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.hasAttribute && t.hasAttribute('data-robot-range')) {
        var key = t.getAttribute('data-robot-range');
        var val = clamp(t.value, Number(t.getAttribute('min')), Number(t.getAttribute('max')));
        if (state.data.robot) state.data.robot[key] = val;
        var out = $('rv-' + key);
        if (out) out.textContent = val + '%';
        scheduleRobotSave();
      } else if (t.id === 'notice-input') {
        updateNoticeCount();
      }
    });

    el.view.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.hasAttribute || !t.hasAttribute('data-robot-num')) return;
      var key = t.getAttribute('data-robot-num');
      var v = clamp(t.value, Number(t.getAttribute('data-min')), Number(t.getAttribute('data-max')));
      t.value = String(v);
      if (state.data.robot) state.data.robot[key] = v;
      queueRobotSave();
    });

    el.view.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && ev.target && ev.target.hasAttribute && ev.target.hasAttribute('data-robot-num')) {
        ev.preventDefault();
        ev.target.blur();
      }
    });
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function init() {
    el.loginView = $('login-view');
    el.adminView = $('admin-view');
    el.loginForm = $('login-form');
    el.loginBtn = $('login-btn');
    el.loginErr = $('login-err');
    el.stats = $('stats');
    el.seg = $('seg');
    el.view = $('view');
    el.toast = $('toast');
    el.modal = $('modal');
    el.modalTitle = $('modal-title');
    el.modalBody = $('modal-body');
    el.modalOk = $('modal-ok');
    el.modalCancel = $('modal-cancel');

    if (!el.loginView || !el.adminView || !el.view) return;

    initModal();
    initEvents();

    try { state.token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { state.token = ''; }
    if (state.token) boot();
    else showLogin('');
  }

  init();
})();

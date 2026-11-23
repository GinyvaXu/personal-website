/* 柳荫册 · 管理后台
   密码进 → 数字卡 / 各层人数 / 订单表 / 用户表 / 演示数据 / 清空 */
(function () {
  'use strict';
  var API = '/api/liuyin';
  var KEY = 'ly_admin';
  var params = new URLSearchParams(location.search);
  var isMock = !!window.__LY_MOCK__;

  var BANNED_KEY = 'ly_admin_banned';
  var state = { token: null, stats: null, users: [], banned: [], err: '' };

  /* 后台接口没有「含封禁用户」的名单；封禁后公开楼层接口就查不到这个人了。
     这里把最近封禁过的人记在本机，方便从用户表里解封。 */
  function loadBanned() {
    try { return JSON.parse(localStorage.getItem(BANNED_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function saveBanned(list) {
    try { localStorage.setItem(BANNED_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function rememberBanned(user) {
    if (!user || !user.id) return;
    state.banned = state.banned.filter(function (x) { return x.id !== user.id; });
    state.banned.push({ id: user.id, name: user.name || '', floor: user.floor });
    saveBanned(state.banned);
  }
  function forgetBanned(id) {
    state.banned = state.banned.filter(function (x) { return x.id !== id; });
    saveBanned(state.banned);
  }

  var view = document.getElementById('view');
  var headActions = document.getElementById('head-actions');
  var adminSub = document.getElementById('admin-sub');
  var toastEl = document.getElementById('toast');

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function unwrap(j) {
    if (j && typeof j === 'object' && j.ok === true && Object.prototype.hasOwnProperty.call(j, 'data')) return j.data;
    return j;
  }
  function timeStr(s) {
    if (!s) return '—';
    var t = new Date(s);
    if (isNaN(t.getTime())) return '—';
    return (t.getMonth() + 1) + '-' + t.getDate() + ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
  }
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toastEl.classList.remove('show');
      setTimeout(function () { toastEl.hidden = true; }, 240);
    }, 2800);
  }

  /* ---------------- 请求 ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var headers = {};
    var body = opts.body;
    if (body !== undefined && body !== null) headers['content-type'] = 'application/json';
    if (state.token) headers['x-ly-admin'] = state.token;
    return fetch(API + path, {
      method: opts.method || 'GET', headers: headers, body: body, cache: 'no-store'
    }).catch(function () {
      var e = new Error('网络不太好，重试中…');
      e.network = true;
      throw e;
    }).then(function (res) {
      return res.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (err) { j = null; }
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
        return unwrap(j);
      });
    });
  }
  function post(path, payload) {
    return api(path, { method: 'POST', body: JSON.stringify(payload || {}) });
  }

  /* ---------------- 登录 ---------------- */
  function renderLogin(err) {
    headActions.innerHTML = '';
    adminSub.textContent = '看人数、看订单，也负责把不该留的删掉。';
    view.innerHTML = '<div class="login-card">'
      + '<div class="kick">6 号楼 · 管理后台</div>'
      + '<h1>柳荫册 · 后台</h1>'
      + '<p>输入后台密码，才能看这栋楼里的账。</p>'
      + '<div class="field"><label for="admin-pw">密码</label>'
      + '<input class="inp" id="admin-pw" type="password" placeholder="后台密码" autocomplete="current-password" enterkeyhint="go"></div>'
      + '<button type="button" class="admin-btn primary" id="admin-login" style="width:100%;margin-top:20px">进去</button>'
      + (err ? '<div class="admin-err">' + esc(err) + '</div>' : '')
      + '<div class="admin-foot"><a href="../">回前台</a></div>'
      + '</div>';
    var btn = document.getElementById('admin-login');
    var inp = document.getElementById('admin-pw');
    if (btn) btn.addEventListener('click', doLogin);
    if (inp) {
      inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); doLogin(); }
      });
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
    }
  }
  function doLogin() {
    var inp = document.getElementById('admin-pw');
    var pw = inp ? inp.value.trim() : '';
    if (!pw) { toast('先填密码'); return; }
    var btn = document.getElementById('admin-login');
    if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }
    post('/admin/login', { password: pw }).then(function (d) {
      var token = d && (d.token || d.admin_token);
      if (!token) throw new Error('后台没返回密码凭证');
      state.token = token;
      try { localStorage.setItem(KEY, token); } catch (e) {}
      load();
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '进去'; }
      renderLogin(e && e.status === 401 ? '密码不对，再试一次' : (e && e.message) || '进不去，稍后再试');
    });
  }
  function logoutLocal() {
    state.token = null;
    state.stats = null;
    state.users = [];
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /* ---------------- 数据 ---------------- */
  function load() {
    api('/admin/stats').then(function (d) {
      state.stats = d || {};
      state.err = '';
      return loadUsers();
    }).then(function () {
      render();
    }).catch(function (e) {
      if (e && e.status === 401) {
        logoutLocal();
        renderLogin('管理身份失效，重新输入密码');
        return;
      }
      state.err = (e && e.message) || '后台数据没读出来';
      if (!state.stats) renderLogin(state.err);
      else { render(); toast(state.err); }
    });
  }
  function loadUsers() {
    var st = state.stats || {};
    if (Array.isArray(st.users_list)) {
      state.users = st.users_list;
      return Promise.resolve();
    }
    /* 后台没给用户表时，用公开的楼层接口拼一份 */
    return api('/floors').then(function (d) {
      var fl = (d && d.floors) || [];
      return Promise.all(fl.map(function (f) {
        return api('/floor?floor=' + encodeURIComponent(f.floor)).then(function (x) {
          return (x && x.users) || [];
        }).catch(function () { return []; });
      }));
    }).then(function (lists) {
      var all = [];
      lists.forEach(function (l) { all = all.concat(l); });
      state.users = all;
    }).catch(function () { state.users = []; });
  }

  /* ---------------- 渲染 ---------------- */
  function renderHead() {
    headActions.innerHTML = ''
      + '<button type="button" class="admin-btn" data-a="seed">写入演示数据</button>'
      + '<button type="button" class="admin-btn danger" data-a="clear-orders" data-label="清空订单">清空订单</button>'
      + '<button type="button" class="admin-btn danger" data-a="clear-all" data-label="清空全部">清空全部</button>'
      + '<button type="button" class="admin-btn" data-a="logout">退出</button>';
  }
  function statusBadge(st) {
    var map = {
      pending: ['pending', '待接'], claimed: ['claimed', '已接'], confirmed: ['confirmed', '待确认'],
      picked: ['picked', '已取件'], delivered: ['delivered', '已送达'], done: ['done', '已完成'],
      cancelled: ['cancelled', '已取消'], returned: ['returned', '已退回']
    };
    var m = map[st] || ['', st || '未知'];
    return '<span class="badge ' + m[0] + '">' + esc(m[1]) + '</span>';
  }
  function orderRowsHTML() {
    var st = state.stats || {};
    var recent = Array.isArray(st.recent) ? st.recent : [];
    var orders = recent.map(function (x) { return x && x.order ? x.order : x; }).filter(function (o) { return o && o.id; });
    if (!orders.length) {
      return '<div class="admin-empty">接口没返回订单明细（stats.recent 为空）。<br>订单还可以在前台查看。</div>';
    }
    return '<div class="table-wrap"><table><thead><tr>'
      + '<th>标题</th><th>状态</th><th>发单</th><th>接单</th><th>更新时间</th><th>操作</th>'
      + '</tr></thead><tbody>'
      + orders.map(function (o) {
        return '<tr><td class="wrap">' + esc(o.title || '')
          + (o.kind === 'route' ? ' <span class="tag">顺路</span>' : '') + '</td>'
          + '<td>' + statusBadge(o.status) + '</td>'
          + '<td>' + esc((o.creator && o.creator.name) || '—') + '</td>'
          + '<td>' + esc((o.claimer && o.claimer.name) || '—') + '</td>'
          + '<td>' + timeStr(o.updated_at || o.created_at) + '</td>'
          + '<td><button type="button" class="btn-mini warn" data-a="del-order" data-id="' + esc(o.id) + '">删除</button></td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }
  function allUsers() {
    var list = (state.users || []).slice();
    var known = {};
    list.forEach(function (u) { known[u.id] = true; });
    state.banned.forEach(function (b) {
      if (b && b.id && !known[b.id]) list.push({ id: b.id, name: b.name, floor: b.floor, banned: true, points: 0, online: false });
    });
    return list;
  }
  function userRowsHTML() {
    var list = allUsers().sort(function (a, b) {
      if (num(a.floor) !== num(b.floor)) return num(a.floor) - num(b.floor);
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh');
    });
    if (!list.length) {
      return '<div class="admin-empty">还没读到用户名单。<br>刷新一下，或者确认后台接口是否正常。</div>';
    }
    return '<div class="table-wrap"><table><thead><tr>'
      + '<th>名字</th><th>楼层</th><th>在线</th><th>人情点</th><th>状态</th><th>操作</th>'
      + '</tr></thead><tbody>'
      + list.map(function (u) {
        var online = !!u.online;
        var banned = !!u.banned;
        var id = u.id || '';
        return '<tr><td class="wrap">' + esc(u.name || '—') + '</td>'
          + '<td>' + num(u.floor) + ' 层</td>'
          + '<td><span class="pill-online' + (online ? ' on' : '') + '"><i></i>' + (online ? '在线' : '离线') + '</span></td>'
          + '<td>' + num(u.points) + '</td>'
          + '<td>' + (banned ? '<span class="badge cancelled">已封禁</span>' : '<span class="badge done">正常</span>') + '</td>'
          + '<td>' + (banned
            ? '<button type="button" class="btn-mini" data-a="unban" data-id="' + esc(id) + '">解封</button>'
            : '<button type="button" class="btn-mini warn" data-a="ban" data-id="' + esc(id) + '">封禁</button>')
          + '</td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }
  function render() {
    var st = state.stats || {};
    var ob = st.orders_by_status || {};
    var totalUsers = Array.isArray(st.users) ? st.users.length : num(st.users);
    var online = Array.isArray(st.online) ? st.online.length : num(st.online);
    var pending = num(ob.pending);
    var done = num(ob.done);
    var floors = Array.isArray(st.floors) ? st.floors : [];
    if (!floors.length && state.users.length) {
      floors = [1, 2, 3, 4, 5, 6].map(function (f) {
        return { floor: f, count: state.users.filter(function (u) { return num(u.floor) === f && !u.banned; }).length };
      });
    }
    var max = 1;
    floors.forEach(function (f) { max = Math.max(max, num(f.count)); });
    var bars = floors.map(function (f) {
      var c = num(f.count);
      return '<div class="bar-row"><span class="lab">' + num(f.floor) + ' 层</span>'
        + '<span class="bar-track"><span class="bar-fill" style="width:' + Math.round(c / max * 100) + '%"></span></span>'
        + '<span class="num">' + c + '</span></div>';
    }).join('');

    renderHead();
    view.innerHTML = ''
      + (state.err ? '<div class="admin-err" style="margin-top:16px">' + esc(state.err) + '</div>' : '')
      + '<div class="admin-grid">'
      + '<div class="stat-card"><b>' + totalUsers + '</b><span>总用户</span><small>这栋楼里登记过的人</small></div>'
      + '<div class="stat-card"><b>' + online + '</b><span>在线</span><small>最近 60 秒有动作</small></div>'
      + '<div class="stat-card"><b>' + pending + '</b><span>待接订单</span><small>挂在楼里等人接</small></div>'
      + '<div class="stat-card"><b>' + done + '</b><span>已完成</span><small>已记人情点 ' + num(st.ledger_count) + ' 笔</small></div>'
      + '</div>'
      + '<section class="panel"><div class="panel-head"><h2>各层人数</h2><span class="ph-note">6 号楼 · 1 到 6 层</span></div>'
      + '<div class="panel-body"><div class="bars">' + (bars || '<div class="admin-empty">还没有楼层数据</div>') + '</div></div></section>'
      + '<section class="panel"><div class="panel-head"><h2>订单</h2>'
      + '<span class="ph-note">按更新时间倒序 · 最近 12 条</span></div>'
      + '<div class="panel-body flush">' + orderRowsHTML() + '</div></section>'
      + '<section class="panel"><div class="panel-head"><h2>用户</h2>'
      + '<span class="ph-note">' + allUsers().length + ' 人 · 可封禁 / 解封</span></div>'
      + '<div class="panel-body flush">' + userRowsHTML() + '</div></section>';
  }

  /* ---------------- 动作 ---------------- */
  function arm(btn, label, onConfirm) {
    if (btn.getAttribute('data-armed') === '1') {
      btn.removeAttribute('data-armed');
      onConfirm();
      return;
    }
    btn.setAttribute('data-armed', '1');
    btn.classList.add('confirming');
    btn.textContent = '再点一次确认';
    setTimeout(function () {
      if (btn.getAttribute('data-armed') === '1') {
        btn.removeAttribute('data-armed');
        btn.classList.remove('confirming');
        btn.textContent = label;
      }
    }, 4000);
  }
  function reloadAfter(msg) {
    if (msg) toast(msg);
    load();
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-a]') : null;
    if (!t) return;
    var a = t.getAttribute('data-a');
    if (a === 'seed') {
      t.disabled = true;
      post('/admin/seed', {}).then(function (d) {
        reloadAfter(d && d.added ? ('演示数据写好了，新增 ' + d.added + ' 条') : '演示数据已经在了');
      }).catch(function (e) { t.disabled = false; handleErr(e); });
    } else if (a === 'clear-orders') {
      arm(t, '清空订单', function () {
        post('/admin/clear', { what: 'orders' }).then(function () {
          reloadAfter('订单和消息都清空了');
        }).catch(handleErr);
      });
    } else if (a === 'clear-all') {
      arm(t, '清空全部', function () {
        post('/admin/clear', { what: 'all' }).then(function () {
          state.banned = [];
          saveBanned([]);
          reloadAfter('用户、订单、人情点都清空了');
        }).catch(handleErr);
      });
    } else if (a === 'del-order') {
      arm(t, '删除', function () {
        post('/admin/delete-order', { id: t.getAttribute('data-id') }).then(function () {
          reloadAfter('订单删掉了');
        }).catch(handleErr);
      });
    } else if (a === 'ban' || a === 'unban') {
      var id = t.getAttribute('data-id');
      if (!id) return;
      t.disabled = true;
      var p = a === 'ban' ? post('/admin/ban', { user_id: id, reason: '管理操作' }) : post('/admin/unban', { user_id: id });
      p.then(function (d) {
        if (a === 'ban') rememberBanned((d && d.user) || { id: id });
        else forgetBanned(id);
        reloadAfter(a === 'ban' ? '已封禁，这个人再请求会被挡住' : '已解封');
      }).catch(function (e) { t.disabled = false; handleErr(e); });
    } else if (a === 'logout') {
      logoutLocal();
      renderLogin('');
    }
  });
  function handleErr(e) {
    if (e && e.status === 401) { logoutLocal(); renderLogin('管理身份失效，重新输入密码'); return; }
    toast((e && e.message) || '操作没成功，再试一次');
  }

  /* ---------------- 启动 ---------------- */
  state.banned = loadBanned();
  try { state.token = localStorage.getItem(KEY); } catch (e) { state.token = null; }
  if (isMock && params.get('admin') === '1') state.token = 'mock-admin-token';
  if (state.token) load();
  else renderLogin('');
})();

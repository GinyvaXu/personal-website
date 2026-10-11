/* ============================================================
 * Ginyva 工具站 · 首页逻辑
 * 1. 主题切换 / 移动导航 / 滚动渐现
 * 2. 项目卡片（数据来自 data/projects.js，star 与版本号自动获取）
 * 3. 社区反馈（列表读取 + 提交，接口 /api/feedback）
 * 4. 页脚信息
 * ============================================================ */
(function () {
  "use strict";

  var SITE = window.SITE_DATA || {};
  var PROJECTS = window.PROJECTS || [];

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- 主题切换 ---------- */
  var themeToggle = $("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (dark) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem("site-theme", dark ? "light" : "dark"); } catch (e) {}
      themeToggle.setAttribute("aria-pressed", dark ? "false" : "true");
    });
  }

  /* ---------- 移动导航 ---------- */
  var navToggle = $("#navToggle");
  var navLinks = $("#navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      navToggle.classList.toggle("active", open);
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    $$(".nav-link", navLinks).forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("open");
        navToggle.classList.remove("active");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- 滚动渐现 ---------- */
  function observeReveals(root) {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal", root).forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: .1, rootMargin: "0px 0px -30px 0px" });
    $$(".reveal", root).forEach(function (el) { io.observe(el); });
  }

  /* ---------- 统计 ---------- */
  function renderStats() {
    var box = $("#hubStats");
    if (!box) return;
    var types = {};
    var done = 0, withDl = 0;
    PROJECTS.forEach(function (p) {
      types[p.type] = 1;
      if (p.status === "已完成") done++;
      if (p.downloads && p.downloads.length) withDl++;
    });
    function stat(n, label) {
      return '<div class="hub-stat"><b>' + n + "</b><span>" + label + "</span></div>";
    }
    box.innerHTML =
      stat(PROJECTS.length, "个项目") +
      stat(withDl, "个可下载") +
      stat(Object.keys(types).length, "类内容") +
      stat(done, "个已完成");
  }

  /* ---------- 项目卡片 ---------- */
  function githubLink(p) {
    return (p.links || []).filter(function (l) { return /github\.com\//i.test(l.url); })[0] || null;
  }
  function releaseLink(p) {
    return (p.links || []).filter(function (l) { return /releases/i.test(l.url); })[0] || null;
  }
  function repoFromUrl(url) {
    var m = /github\.com\/([^\/]+)\/([^\/?#]+)/.exec(url || "");
    return m ? m[1] + "/" + m[2].replace(/\.git$/, "") : null;
  }
  /* ---------- 下载信息：优先用镜像管线生成的 RELEASES，回退到 projects.js 手写链接 ---------- */
  function pickSetup(files) {
    if (!files || !files.length) return null;
    for (var i = 0; i < files.length; i++) { if (/setup|install/i.test(files[i].name)) return files[i]; }
    return files[0];
  }
  function fmtMb(bytes) {
    if (!bytes) return "";
    return (bytes / 1048576).toFixed(1).replace(/\.0$/, "") + " MB";
  }
  /* 镜像键 = 页面目录名（projects/<slug>/），与 releases.js 的键一致 */
  function mirrorKey(p) {
    var m = /^projects\/([^/]+)\/?$/.exec(p.page || "");
    return m ? m[1] : p.id;
  }
  function downloadInfo(p) {
    var R = window.RELEASES || {};
    var rel = R[mirrorKey(p)];
    if (rel && rel.files && rel.files.length) {
      var f = pickSetup(rel.files);
      if (f) return { url: rel.base + encodeURIComponent(f.name), size: fmtMb(f.size), mirrored: true };
    }
    if (p.downloads && p.downloads[0]) {
      var d = p.downloads[0];
      return { url: d.url, size: d.size || "", mirrored: false };
    }
    return null;
  }
  /* 最近更新：优先使用镜像管线数据（tag + 时间），回退手工文案 */
  function latestInfo(p) {
    var R = window.RELEASES || {};
    var rel = R[mirrorKey(p)];
    if (rel && rel.tag) {
      var d = rel.updatedAt ? new Date(rel.updatedAt) : null;
      var ds = d && !isNaN(d.getTime()) ? " · " + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : "";
      return String(rel.tag) + ds;
    }
    return p.lastUpdate || "";
  }

  /* ---------- 站点运营配置（公告由中间件注入；这里管排序 / 隐藏） ---------- */
  var SITE_CFG = null;

  /* ---------- R2 镜像下载统一走 /api/dl（统计 + 302 跳转） ---------- */
  function mirrorHref(url) {
    var m = /^https:\/\/dl\.ginyva\.site\/releases\/([^\/]+)\/latest\/([^\/?#]+)$/.exec(String(url || ""));
    if (!m) return url;
    var f = m[2];
    try { f = decodeURIComponent(f); } catch (e) {}
    return "/api/dl?p=" + encodeURIComponent(m[1]) + "&f=" + encodeURIComponent(f);
  }

  function cardHtml(p) {
    var gh = githubLink(p);
    var repo = gh ? repoFromUrl(gh.url) : null;
    var rel = releaseLink(p);
    var dl = downloadInfo(p);
    var upd = latestInfo(p);
    var tech = (p.tech || []).slice(0, 4).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    return '<article class="hub-card reveal">' +
      '<div class="hub-card-head">' +
        '<span class="hub-type">' + esc(p.type) + "</span>" +
        '<span class="hub-status' + (p.status === "已完成" ? " done" : "") + '">' + esc(p.status) + "</span>" +
        (repo ? '<span class="hub-auto" data-repo="' + esc(repo) + '"><span>★ <b data-stars>--</b></span><span>v<b data-ver>--</b></span></span>' : "") +
      "</div>" +
      "<h3>" + esc(p.name) + "</h3>" +
      '<p class="hub-summary">' + esc(p.summary) + "</p>" +
      (tech ? '<div class="hub-tech">' + tech + "</div>" : "") +
      '<div class="hub-links">' +
        (p.page ? '<a class="btn btn-primary btn-sm" href="' + esc(p.page) + '">查看详情</a>' : "") +
        (p.page ? '<a class="link-plain" href="' + esc(p.page) + 'guide/">📖 教程</a>' : "") +
        (dl
          ? '<a class="btn btn-ghost btn-sm" href="' + esc(mirrorHref(dl.url)) + '" target="_blank" rel="noopener noreferrer" title="' + (dl.mirrored ? "国内高速镜像（Cloudflare R2）" : "GitHub Releases") + '">⬇ 下载' + (dl.size ? " · " + esc(dl.size) : "") + "</a>"
          : (rel ? '<a class="btn btn-ghost btn-sm" href="' + esc(rel.url) + '" target="_blank" rel="noopener noreferrer">发布页</a>' : "")) +
        (gh ? '<a class="link-plain" href="' + esc(gh.url) + '" target="_blank" rel="noopener noreferrer">GitHub ↗</a>' : "") +
      "</div>" +
      (upd ? '<p class="hub-update">最近更新：' + esc(upd) + "</p>" : "") +
    "</article>";
  }

  /* ---------- 项目搜索 / 类型筛选 ---------- */
  var BASE_LIST = [];
  var HUB_FILTER = { type: "全部" };
  var hubToolsInited = false;

  function renderHubGrid() {
    var grid = $("#projectGrid");
    if (!grid) return;
    var input = $("#hubSearch");
    var q = (input && input.value ? input.value : "").trim().toLowerCase();
    var list = BASE_LIST.filter(function (p) {
      if (HUB_FILTER.type !== "全部" && p.type !== HUB_FILTER.type) return false;
      if (!q) return true;
      var hay = ((p.name || "") + " " + (p.summary || "") + " " + (p.detail || "") + " " + (p.type || "") + " " + ((p.tech || []).join(" "))).toLowerCase();
      return hay.indexOf(q) > -1;
    });
    grid.innerHTML = list.map(cardHtml).join("");
    var empty = $("#hubEmpty");
    if (empty) empty.hidden = list.length > 0;
    var sub = $("#projectsSub");
    if (sub) {
      sub.textContent = (q || HUB_FILTER.type !== "全部")
        ? "筛选出 " + list.length + " / " + BASE_LIST.length + " 个项目"
        : "共 " + list.length + " 个项目 · 每个都有独立主页、界面预览与图文教程。";
    }
    observeReveals(grid);
    initAutoData();
  }

  function initHubTools() {
    if (hubToolsInited) return;
    hubToolsInited = true;
    var input = $("#hubSearch");
    var filters = $("#hubFilters");

    if (filters) {
      var types = ["全部"];
      PROJECTS.forEach(function (p) { if (p.type && types.indexOf(p.type) < 0) types.push(p.type); });
      filters.innerHTML = types.map(function (t) {
        return '<button type="button" class="hub-filter' + (t === "全部" ? " active" : "") + '" data-type="' + esc(t) + '">' + esc(t) + "</button>";
      }).join("");
      $$(".hub-filter", filters).forEach(function (b) {
        b.addEventListener("click", function () {
          HUB_FILTER.type = b.getAttribute("data-type") || "全部";
          $$(".hub-filter", filters).forEach(function (x) { x.classList.toggle("active", x === b); });
          renderHubGrid();
        });
      });
    }

    if (input) {
      var timer = null;
      input.addEventListener("input", function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(renderHubGrid, 160);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Escape") { input.value = ""; renderHubGrid(); input.blur(); }
      });
    }

    /* 快捷键：/ 聚焦搜索（输入框内除外） */
    document.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      if (input) { input.focus(); input.select(); }
    });
  }

  function renderProjects() {
    var grid = $("#projectGrid");
    if (!grid) return;
    /* 应用运营配置：隐藏 + 排序 */
    var list = PROJECTS.slice();
    if (SITE_CFG) {
      if (SITE_CFG.hidden && SITE_CFG.hidden.length) {
        list = list.filter(function (p) { return SITE_CFG.hidden.indexOf(p.id) < 0; });
      }
      if (SITE_CFG.order && SITE_CFG.order.length) {
        var idx = {};
        SITE_CFG.order.forEach(function (id, i) { idx[id] = i; });
        list.sort(function (a, b) {
          var ia = Object.prototype.hasOwnProperty.call(idx, a.id) ? idx[a.id] : 999;
          var ib = Object.prototype.hasOwnProperty.call(idx, b.id) ? idx[b.id] : 999;
          return ia - ib;
        });
      }
    }
    BASE_LIST = list;
    initHubTools();
    renderHubGrid();
  }

  /* ---------- GitHub 自动数据（star / 最新版本） ---------- */
  var GH_CACHE = "gh-data-v2";
  function ghCacheGet() { try { return JSON.parse(localStorage.getItem(GH_CACHE) || "null") || {}; } catch (e) { return {}; } }
  function ghCacheSet(c) { try { localStorage.setItem(GH_CACHE, JSON.stringify(c)); } catch (e) {} }

  function fetchRepoInfo(repo, cb) {
    var cache = ghCacheGet();
    var hit = cache[repo];
    if (hit && Date.now() - hit.t < 30 * 60 * 1000) { cb(hit.d); return; }
    fetch("https://api.github.com/repos/" + repo)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) { cb(null); return; }
        var info = { stars: d.stargazers_count || 0 };
        return fetch("https://api.github.com/repos/" + repo + "/releases?per_page=1")
          .then(function (r2) { return r2.ok ? r2.json() : null; })
          .then(function (rels) {
            var rel = (rels && rels.length) ? rels[0] : null;
            if (rel) info.version = rel.tag_name;
            cache[repo] = { t: Date.now(), d: info };
            ghCacheSet(cache);
            cb(info);
          });
      })
      .catch(function () { cb(null); });
  }

  function initAutoData() {
    var seen = {};
    $$("[data-repo]").forEach(function (el) {
      var repo = el.getAttribute("data-repo");
      if (!repo || seen[repo]) return;
      seen[repo] = true;
      fetchRepoInfo(repo, function (info) {
        $$("[data-repo='" + repo + "']").forEach(function (node) {
          var stars = $("[data-stars]", node);
          var ver = $("[data-ver]", node);
          if (stars) stars.textContent = info ? String(info.stars) : "—";
          if (ver) ver.textContent = info && info.version ? String(info.version).replace(/^v/i, "") : "—";
        });
      });
    });
  }

  /* ---------- 社区反馈 ---------- */
  var STATUS_LABEL = { new: "待处理", planned: "已计划", doing: "进行中", done: "已完成" };

  function projectName(id) {
    if (id === "general" || !id) return "综合建议";
    for (var i = 0; i < PROJECTS.length; i++) {
      if (PROJECTS[i].id === id) return PROJECTS[i].name;
    }
    return id;
  }

  function timeAgo(iso) {
    if (!iso) return "";
    var t = Date.parse(iso.indexOf("T") > -1 ? iso : iso.replace(" ", "T") + "Z");
    if (isNaN(t)) return "";
    var diff = Date.now() - t;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
    if (diff < 30 * 86400000) return Math.floor(diff / 86400000) + " 天前";
    var d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fbItemHtml(item) {
    var st = STATUS_LABEL[item.status] || item.status;
    return '<article class="fb-item" data-id="' + esc(item.id) + '">' +
      '<div class="fb-item-head">' +
        '<span class="fb-proj">' + esc(projectName(item.project)) + "</span>" +
        '<span class="fb-badge s-' + esc(item.status) + '">' + esc(st) + "</span>" +
        "<time>" + esc(timeAgo(item.created_at)) + "</time>" +
      "</div>" +
      '<p class="fb-msg">' + esc(item.message) + "</p>" +
      '<p class="fb-nick">— ' + esc(item.name || "匿名") + "</p>" +
      (item.reply ? '<div class="fb-reply"><b>回复：</b>' + esc(item.reply) + "</div>" : "") +
    "</article>";
  }

  var FB_ITEMS = [];
  var FB_FILTER = "all";

  function renderFbList() {
    var list = $("#fbList");
    if (!list) return;
    var items = FB_ITEMS.filter(function (it) { return FB_FILTER === "all" || it.status === FB_FILTER; });
    if (!items.length) {
      list.innerHTML = '<p class="fb-empty">' + (FB_ITEMS.length ? "这个状态下还没有反馈～" : "还没有反馈，来抢沙发～") + "</p>";
      return;
    }
    list.innerHTML = items.map(fbItemHtml).join("");
  }

  function renderFbFilters() {
    var box = $("#fbFilters");
    if (!box) return;
    var found = {};
    FB_ITEMS.forEach(function (it) { found[it.status] = true; });
    var types = [["all", "全部"]];
    Object.keys(STATUS_LABEL).forEach(function (k) { types.push([k, STATUS_LABEL[k]]); });
    box.innerHTML = types.filter(function (t) { return t[0] === "all" || found[t[0]]; }).map(function (t) {
      return '<button type="button" class="fb-filter' + (FB_FILTER === t[0] ? " active" : "") + '" data-status="' + t[0] + '">' + esc(t[1]) + "</button>";
    }).join("");
    $$(".fb-filter", box).forEach(function (b) {
      b.addEventListener("click", function () {
        FB_FILTER = b.getAttribute("data-status") || "all";
        renderFbFilters();
        renderFbList();
      });
    });
  }

  function renderFeedbackList(items) {
    FB_ITEMS = items || [];
    renderFbFilters();
    renderFbList();
  }

  function loadFeedback() {
    var list = $("#fbList");
    if (list) list.innerHTML = '<p class="fb-empty">加载中…</p>';
    fetch("/api/feedback?limit=50")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) throw new Error("bad");
        renderFeedbackList(d.items);
      })
      .catch(function () {
        if (list) list.innerHTML = '<p class="fb-empty">反馈列表暂时加载不出来（服务尚未配置好），稍后再试试。</p>';
      });
  }

  function initFeedback() {
    var form = $("#fbForm");
    var select = $("#fbProject");
    if (!form || !select) return;

    // 下拉选项：综合建议 + 全部项目
    var opts = ['<option value="general">综合建议 / 其他</option>'];
    PROJECTS.forEach(function (p) {
      opts.push('<option value="' + esc(p.id) + '">' + esc(p.name) + "</option>");
    });
    select.innerHTML = opts.join("");

    var status = $("#fbStatus");
    var submit = $("#fbSubmit");

    var msgInput = $("#fbMessage");
    var countEl = $("#fbCount");
    function updateCount() {
      if (countEl && msgInput) countEl.textContent = msgInput.value.length + " / 800";
    }
    if (msgInput) msgInput.addEventListener("input", updateCount);
    updateCount();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var message = $("#fbMessage").value.trim();
      var name = $("#fbName").value.trim();
      var contact = $("#fbContact").value.trim();
      var hp = $("#fbHp").value;
      if (hp) return; // 机器人
      if (message.length < 4 || message.length > 800) {
        status.className = "fb-status err";
        status.textContent = "反馈内容请控制在 4–800 字之间。";
        return;
      }
      submit.disabled = true;
      status.className = "fb-status";
      status.textContent = "发送中…";
      fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: select.value, name: name, contact: contact, message: message, _hp: hp })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok || !res.d || !res.d.ok) {
            throw new Error((res.d && res.d.error) || "提交失败");
          }
          status.className = "fb-status ok";
          status.textContent = "✅ 已收到，感谢反馈！（如果填了联系方式，我回复时会用到）";
          $("#fbMessage").value = "";
          $("#fbHp").value = "";
          updateCount();
          if (res.d.item) {
            FB_ITEMS.unshift(res.d.item);
            FB_FILTER = "all";
            renderFbFilters();
            renderFbList();
          }
        })
        .catch(function (err) {
          status.className = "fb-status err";
          status.textContent = "提交失败：" + (err && err.message ? err.message : "请稍后再试");
        })
        .then(function () { submit.disabled = false; });
    });

    var refresh = $("#fbRefresh");
    if (refresh) refresh.addEventListener("click", loadFeedback);

    loadFeedback();
  }

  /* ---------- 页脚 ---------- */
  function renderFooter() {
    var text = $("#footerText");
    if (text) {
      text.textContent = "Ginyva 工具站 · 独立开发，持续更新 · 所有软件均可在各自主页免费下载";
    }
    var box = $("#footerSocials");
    if (!box) return;
    var socials = SITE.socials || {};
    var out = [];
    if (socials.github) out.push('<a href="' + esc(socials.github) + '" target="_blank" rel="noopener noreferrer">GitHub</a>');
    if (socials.bilibili) out.push('<a href="' + esc(socials.bilibili) + '" target="_blank" rel="noopener noreferrer">哔哩哔哩</a>');
    if (socials.steam) out.push('<a href="' + esc(socials.steam) + '" target="_blank" rel="noopener noreferrer">Steam</a>');
    if (socials.email) out.push('<a href="mailto:' + esc(socials.email) + '">邮箱</a>');
    box.innerHTML = out.join("");
  }

  /* ============================================================
   * Skills 仓库 / 提示词仓库
   * ============================================================ */
  var SHARE_TEXT = {}; // 预览/复制内容缓存（同源按需加载）

  function loadShareText(url, cb) {
    if (SHARE_TEXT[url] != null) { cb(SHARE_TEXT[url]); return; }
    fetch(url)
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) {
        if (t != null) SHARE_TEXT[url] = t;
        cb(t);
      })
      .catch(function () { cb(null); });
  }

  function copyText(text, cb) {
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        ta.remove();
        cb(!!ok);
      } catch (e) { cb(false); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { cb(true); }, fallback);
        return;
      }
    } catch (e) {}
    fallback();
  }

  function btnFlash(btn, text) {
    if (!btn) return;
    if (!btn._orig) btn._orig = btn.textContent;
    btn.textContent = text;
    clearTimeout(btn._ft);
    btn._ft = setTimeout(function () { btn.textContent = btn._orig; }, 1500);
  }

  function uniqCats(list, key) {
    var o = {};
    list.forEach(function (x) { if (x[key]) o[x[key]] = 1; });
    return Object.keys(o);
  }

  function shareChips(container, cats, onPick) {
    if (!container) return;
    container.innerHTML = ["全部"].concat(cats).map(function (c) {
      return '<button type="button" class="hub-filter' + (c === "全部" ? " active" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
    $$(".hub-filter", container).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".hub-filter", container).forEach(function (x) { x.classList.toggle("active", x === b); });
        onPick(b.getAttribute("data-cat") || "全部");
      });
    });
  }

  function sharePreviewBlock(fname, sizeText, id) {
    return '<div class="sc-preview">' +
      '<div class="sc-preview-bar"><span class="fname">' + esc(fname) + "</span><span>" + esc(sizeText) + "</span>" +
      '<button class="copy" type="button" data-copyshare="' + esc(id) + '">复制全文</button></div>' +
      '<pre class="sc-preview-body">（点击「预览原文」加载…）</pre></div>';
  }

  /* ---------- Skills ---------- */
  function skillCard(s) {
    var dlText = s.files > 1 ? "⬇ 下载 .zip" : "⬇ 下载 SKILL.md";
    return '<article class="share-card skill reveal" data-id="' + esc(s.id) + '">' +
      '<div class="sc-head"><span class="sc-badge">' + esc(s.badge) + "</span>" +
      '<span class="sc-meta">' + esc(s.size) + " · " + esc(s.updated) + "</span></div>" +
      '<h3 class="sc-title"><span class="emoji">' + esc(s.emoji) + "</span>" + esc(s.name) + "</h3>" +
      '<p class="sc-desc">' + esc(s.desc) + "</p>" +
      '<div class="sc-tags">' + (s.tags || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
      '<div class="sc-actions">' +
        '<a class="btn btn-primary btn-sm" href="' + esc(s.file) + '" download="' + esc(s.dlName || "SKILL.md") + '">' + dlText + "</a>" +
        '<button class="btn btn-ghost btn-sm" type="button" data-copycmd="' + esc(s.id) + '" title="适用于 opencode；其他工具见上方安装说明">📋 复制安装命令</button>' +
        (s.github ? '<a class="link-plain" href="' + esc(s.github) + '" target="_blank" rel="noopener noreferrer">GitHub ↗</a>' : "") +
        '<button class="sc-preview-toggle" type="button" data-preview="' + esc(s.id) + '" aria-expanded="false">预览原文 <span class="arrow">▼</span></button>' +
      "</div>" + sharePreviewBlock("SKILL.md", s.size, s.id) + "</article>";
  }

  function initSkillsSection() {
    var list = window.SKILLS || [];
    var grid = $("#skillGrid");
    if (!grid || !list.length) return;
    var state = { q: "", cat: "全部" };

    function render() {
      var out = list.filter(function (s) {
        if (state.cat !== "全部" && s.cat !== state.cat) return false;
        var q = state.q.toLowerCase();
        if (!q) return true;
        return ((s.name || "") + " " + (s.desc || "") + " " + (s.tags || []).join(" ")).toLowerCase().indexOf(q) > -1;
      });
      grid.innerHTML = out.map(skillCard).join("");
      var empty = $("#skillEmpty");
      if (empty) empty.hidden = out.length > 0;
      var cnt = $("#skillCount");
      if (cnt) cnt.textContent = "（" + list.length + " 个）";
      observeReveals(grid);
    }

    shareChips($("#skillFilters"), uniqCats(list, "cat"), function (c) { state.cat = c; render(); });
    var input = $("#skillSearch");
    if (input) {
      var timer = null;
      input.addEventListener("input", function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { state.q = input.value.trim(); render(); }, 160);
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Escape") { input.value = ""; state.q = ""; render(); } });
    }
    render();
  }

  /* ---------- 提示词 ---------- */
  function promptCard(p) {
    return '<article class="share-card prompt reveal" data-id="' + esc(p.id) + '">' +
      '<div class="sc-head"><span class="sc-badge">' + esc(p.cat) + "</span>" +
      '<span class="sc-meta">' + esc(p.chars || "") + " · " + esc(p.updated) + "</span></div>" +
      '<h3 class="sc-title"><span class="emoji">' + esc(p.emoji || "📝") + "</span>" + esc(p.title) + "</h3>" +
      '<p class="sc-desc">' + esc(p.desc) + "</p>" +
      '<div class="sc-tags">' + (p.tags || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
      '<div class="sc-actions">' +
        '<button class="btn btn-primary btn-sm" type="button" data-copytxt="' + esc(p.id) + '">📋 复制全文</button>' +
        '<a class="btn btn-ghost btn-sm" href="' + esc(p.file) + '" download="' + esc(p.dlName || "") + '">⬇ .txt</a>' +
        (p.github ? '<a class="link-plain" href="' + esc(p.github) + '" target="_blank" rel="noopener noreferrer">GitHub ↗</a>' : "") +
        '<button class="sc-preview-toggle" type="button" data-preview="' + esc(p.id) + '" aria-expanded="false">预览原文 <span class="arrow">▼</span></button>' +
      "</div>" + sharePreviewBlock(p.dlName || (p.id + ".txt"), p.chars || "", p.id) + "</article>";
  }

  function initPromptsSection() {
    var list = window.PROMPTS || [];
    var grid = $("#promptGrid");
    if (!grid || !list.length) return;
    var state = { q: "", cat: "全部" };

    function render() {
      var out = list.filter(function (p) {
        if (state.cat !== "全部" && p.cat !== state.cat) return false;
        var q = state.q.toLowerCase();
        if (!q) return true;
        return ((p.title || "") + " " + (p.desc || "") + " " + (p.tags || []).join(" ")).toLowerCase().indexOf(q) > -1;
      });
      grid.innerHTML = out.map(promptCard).join("");
      var empty = $("#promptEmpty");
      if (empty) empty.hidden = out.length > 0;
      var cnt = $("#promptCount");
      if (cnt) cnt.textContent = "（" + list.length + " 个）";
      observeReveals(grid);
    }

    shareChips($("#promptFilters"), uniqCats(list, "cat"), function (c) { state.cat = c; render(); });
    var input = $("#promptSearch");
    if (input) {
      var timer = null;
      input.addEventListener("input", function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { state.q = input.value.trim(); render(); }, 160);
      });
      input.addEventListener("keydown", function (e) { if (e.key === "Escape") { input.value = ""; state.q = ""; render(); } });
    }
    render();
  }

  function findShareItem(id) {
    var all = (window.SKILLS || []).concat(window.PROMPTS || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* 安装说明开合 */
  var installToggle = $("#installToggle");
  if (installToggle) {
    installToggle.addEventListener("click", function () {
      var box = $("#installBox");
      var open = box.hidden;
      box.hidden = !open;
      installToggle.setAttribute("aria-expanded", String(open));
      installToggle.textContent = open ? "📦 收起安装说明 ▴" : "📦 如何安装 ▾";
    });
  }

  /* 分享区事件委托：预览 / 复制命令 / 复制全文 */
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;

    var pv = e.target.closest("[data-preview]");
    if (pv) {
      var id = pv.getAttribute("data-preview");
      var card = pv.closest(".share-card");
      var item = findShareItem(id);
      if (!card || !item) return;
      var open = card.classList.toggle("open");
      pv.setAttribute("aria-expanded", String(open));
      if (open) {
        var pre = $(".sc-preview-body", card);
        if (pre && !card._loaded) {
          card._loaded = true;
          pre.textContent = "加载中…";
          loadShareText(item.file, function (txt) {
            pre.textContent = txt != null ? txt : "预览加载失败，可点「下载」查看原文件。";
          });
        }
      }
      return;
    }

    var cc = e.target.closest("[data-copycmd]");
    if (cc) {
      var sk = findShareItem(cc.getAttribute("data-copycmd"));
      if (sk && sk.cmd) copyText(sk.cmd, function (ok) { btnFlash(cc, ok ? "✅ 已复制" : "⚠️ 复制失败"); });
      return;
    }

    var cp = e.target.closest("[data-copytxt]");
    if (!cp) cp = e.target.closest("[data-copyshare]");
    if (cp) {
      var pid = cp.getAttribute("data-copytxt") || cp.getAttribute("data-copyshare");
      var it = findShareItem(pid);
      if (!it) return;
      loadShareText(it.file, function (txt) {
        if (txt == null) { btnFlash(cp, "⚠️ 加载失败"); return; }
        copyText(txt, function (ok) { btnFlash(cp, ok ? "✅ 已复制" : "⚠️ 复制失败"); });
      });
    }
  });

  /* ---------- 启动 ---------- */
  renderStats();
  renderFooter();
  initFeedback();
  initSkillsSection();
  initPromptsSection();
  observeReveals(document);

  var grid = $("#projectGrid");
  if (grid) observeReveals(grid);

  function bootProjects() {
    renderProjects();
    initAutoData();
  }

  /* 先取运营配置（排序 / 隐藏），再渲染项目墙，最后拉 GitHub 数据 */
  fetch("/api/site-config")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && d.ok && ((d.order && d.order.length) || (d.hidden && d.hidden.length))) SITE_CFG = d;
    })
    .catch(function () {})
    .then(bootProjects);
})();

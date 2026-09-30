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
          ? '<a class="btn btn-ghost btn-sm" href="' + esc(dl.url) + '" target="_blank" rel="noopener noreferrer" title="' + (dl.mirrored ? "国内高速镜像（Cloudflare R2）" : "GitHub Releases") + '">⬇ 下载' + (dl.size ? " · " + esc(dl.size) : "") + "</a>"
          : (rel ? '<a class="btn btn-ghost btn-sm" href="' + esc(rel.url) + '" target="_blank" rel="noopener noreferrer">发布页</a>' : "")) +
        (gh ? '<a class="link-plain" href="' + esc(gh.url) + '" target="_blank" rel="noopener noreferrer">GitHub ↗</a>' : "") +
      "</div>" +
      (upd ? '<p class="hub-update">最近更新：' + esc(upd) + "</p>" : "") +
    "</article>";
  }

  function renderProjects() {
    var grid = $("#projectGrid");
    if (!grid) return;
    var sub = $("#projectsSub");
    if (sub) sub.textContent = "共 " + PROJECTS.length + " 个项目 · 每个都有独立主页、界面预览与图文教程。";
    grid.innerHTML = PROJECTS.map(cardHtml).join("");
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

  function renderFeedbackList(items) {
    var list = $("#fbList");
    if (!list) return;
    if (!items || !items.length) {
      list.innerHTML = '<p class="fb-empty">还没有反馈，来抢沙发～</p>';
      return;
    }
    list.innerHTML = items.map(fbItemHtml).join("");
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
          if (res.d.item) {
            var list = $("#fbList");
            if (list) {
              var empty = $(".fb-empty", list);
              if (empty) list.innerHTML = "";
              list.insertAdjacentHTML("afterbegin", fbItemHtml(res.d.item));
            }
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

  /* ---------- 启动 ---------- */
  renderStats();
  renderProjects();
  renderFooter();
  initFeedback();
  initAutoData();
  observeReveals(document);

  var grid = $("#projectGrid");
  if (grid) observeReveals(grid);
})();

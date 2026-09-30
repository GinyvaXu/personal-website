/* ============================================================
 * 独立项目页渲染脚本
 * 页面用 <body class="pp" data-project="项目id"> 指定要渲染的项目，
 * 数据来自 ../../data/projects.js 的 window.PROJECTS。
 * 同一份页面既支持 www.ginyva.site/projects/<id>/ 直接访问，
 * 也可被子域名（如 projectdock.ginyva.site）通过 functions/_middleware.js
 * 重写到根路径展示。
 * ============================================================ */
(function () {
  var HOME = "https://www.ginyva.site/"; // 主站地址（换域名时改这里）

  var root = document.getElementById("ppRoot");
  var id = document.body.getAttribute("data-project");
  var projects = window.PROJECTS || [];
  var site = window.SITE_DATA || {};
  var p = null;
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].id === id) { p = projects[i]; break; }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  if (!root) return;
  if (!p) {
    root.innerHTML = '<p class="pp-loading">没有找到项目 <code>' + esc(id) + "</code>，请检查 data/projects.js。</p>";
    return;
  }

  document.title = p.name + " — 下载与介绍 | " + (site.name || "个人网站");

  var ghPage = (p.links || []).filter(function (l) { return /github\.com\//i.test(l.url); })[0] || null;
  var ghReleases = ghPage ? ghPage.url.replace(/\/+$/, "") + "/releases" : "";

  /* 资源相对前缀：兼容 /projects/<id>/（2 层）、/projects/<id>/guide/（3 层）与子域名重写后的 /guide/（1 层） */
  var SEG = location.pathname.split("/").filter(Boolean).length;
  var PP = new Array(SEG + 1).join("../");
  /* 镜像键 = 页面目录名（与 data/releases.js 的键一致） */
  var mirrorKey = (function () {
    var m = /^projects\/([^\/]+)\/?$/.exec(p.page || "");
    return m ? m[1] : id;
  })();
  var docs = (window.DOCS || {})[id] || null;

  function setVersionChip(tag) {
    var el = document.getElementById("ppVer");
    if (!el || !tag) return;
    var t = String(tag).replace(/^v/i, "");
    el.textContent = (/beta|alpha|rc/i.test(tag) ? "最新预览版 v" : "最新正式版 v") + t;
  }

  function fmtMb(bytes) {
    if (!bytes) return "";
    return (bytes / 1048576).toFixed(1).replace(/\.0$/, "") + " MB";
  }
  function labelForFile(name) {
    if (/debug/i.test(name)) return "Debug 版";
    if (/portable/i.test(name)) return "便携版";
    if (/setup|install/i.test(name)) return "安装包";
    return String(name).replace(/\.[^.]+$/, "");
  }
  function downloadList(p) {
    var R = window.RELEASES || {};
    var m = /^projects\/([^/]+)\/?$/.exec(p.page || "");
    var rel = R[m ? m[1] : p.id];
    if (rel && rel.files && rel.files.length) {
      return rel.files.map(function (f) {
        return { label: labelForFile(f.name), url: rel.base + encodeURIComponent(f.name), size: fmtMb(f.size), note: "R2 镜像" };
      });
    }
    return (p.downloads || []).map(function (d) { return { label: d.label, url: d.url, size: d.size, note: d.note }; });
  }
  var dls = downloadList(p).map(function (d) {
    return '<a class="btn btn-primary pp-dl" href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">' +
      "<span>" + esc(d.label) + (d.note ? ' <em class="pp-dl-note">' + esc(d.note) + "</em>" : "") + "</span>" +
      (d.size ? '<span class="pp-dl-size">' + esc(d.size) + " ↓</span>" : "<span>↓</span>") +
      "</a>";
  }).join("");

  var shots = (p.screenshots || []).map(function (s) {
    return '<figure class="pp-shot"><img src="' + PP + esc(s.src) + '" alt="' + esc(s.caption || p.name) + '" loading="lazy">' +
      (s.caption ? "<figcaption>" + esc(s.caption) + "</figcaption>" : "") + "</figure>";
  }).join("");

  /* ---------- 体系化文档（数据来自 data/docs.js，从仓库 README/CHANGELOG 提炼） ---------- */
  var featuresHtml = "";
  if (docs && docs.features && docs.features.length) {
    featuresHtml = '<div class="pp-block"><h2>功能介绍</h2>' +
      (docs.intro ? '<p class="pp-detail pp-intro">' + esc(docs.intro) + "</p>" : "") +
      docs.features.map(function (g) {
        return '<div class="pp-feat"><h3>' + esc(g.title) + '</h3><ul class="pp-list">' +
          (g.items || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
      }).join("") + "</div>";
  }
  var usageHtml = "";
  if (docs && docs.usage && docs.usage.length) {
    usageHtml = '<div class="pp-block"><h2>使用方法</h2>' + docs.usage.map(function (g) {
      return '<div class="pp-feat"><h3>' + esc(g.title) + '</h3><ol class="pp-steps">' +
        (g.steps || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></div>";
    }).join("") + "</div>";
  }
  var changelogHtml = "";
  if (docs && docs.changelog && docs.changelog.length) {
    changelogHtml = '<div class="pp-block"><h2>版本历史</h2><div class="pp-vers">' + docs.changelog.map(function (v) {
      return '<div class="pp-ver"><div class="pp-ver-head"><b>' + esc(v.version) + "</b>" +
        (v.date ? "<time>" + esc(v.date) + "</time>" : "") + "</div>" +
        '<ul class="pp-list">' + (v.items || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>";
    }).join("") + "</div></div>";
  }
  var faqHtml = "";
  if (docs && docs.faq && docs.faq.length) {
    faqHtml = '<div class="pp-block"><h2>常见问题</h2><div class="pp-faq">' + docs.faq.map(function (f) {
      return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>";
    }).join("") + "</div></div>";
  }

  var highlights = (p.highlights || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("");
  var tech = (p.tech || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");

  root.innerHTML =
    '<header class="pp-top">' +
      '<a class="pp-back" href="' + HOME + '">← 返回首页</a>' +
      '<button class="btn btn-ghost btn-sm" id="ppTheme" type="button">切换主题</button>' +
    "</header>" +
    '<div class="pp-badges">' +
      '<span class="pp-badge">' + esc(p.type) + "</span>" +
      '<span class="pp-badge pp-status">' + esc(p.status) + "</span>" +
      '<span class="pp-badge" id="ppVer">最新版 --</span>' +
    "</div>" +
    "<h1>" + esc(p.name) + "</h1>" +
    '<p class="pp-summary">' + esc(p.summary) + "</p>" +
    (p.detail ? '<p class="pp-detail">' + esc(p.detail) + "</p>" : "") +
    (dls
      ? '<div class="pp-block"><h2>⬇ 下载</h2><div class="pp-dls">' + dls + "</div>" +
        '<p class="pp-note">国内高速镜像（Cloudflare R2）' +
        (ghReleases ? '；也可在 <a href="' + esc(ghReleases) + '" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 获取官方原件' : "") +
        "。</p></div>"
      : "") +
    featuresHtml +
    usageHtml +
    changelogHtml +
    faqHtml +
    (highlights ? '<div class="pp-block"><h2>项目亮点</h2><ul class="pp-list">' + highlights + "</ul></div>" : "") +
    (tech ? '<div class="pp-block"><h2>技术栈</h2><div class="pp-tech">' + tech + "</div></div>" : "") +
    (!docs && p.lastUpdate ? '<div class="pp-block"><h2>最近更新</h2><p class="pp-update">' + esc(p.lastUpdate) + "</p></div>" : "") +
    (shots ? '<div class="pp-block"><h2>界面预览</h2><div class="pp-shots">' + shots + "</div></div>" : "") +
    '<p class="pp-foot">' + esc(site.name || "") + ' · <a href="' + HOME + '">返回首页</a></p>';

  // 主题切换（与主站共用 site-theme 偏好）
  var tbtn = document.getElementById("ppTheme");
  if (tbtn) tbtn.addEventListener("click", function () {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", "dark");
    try { localStorage.setItem("site-theme", dark ? "light" : "dark"); } catch (e) {}
  });

  // 版本号：优先用镜像管线的 RELEASES 数据（与下载链接一致），失败再退回 GitHub API
  var relM = (window.RELEASES || {})[mirrorKey];
  if (relM && relM.tag) setVersionChip(relM.tag);
  if (ghPage) {
    var m = /github\.com\/([^\/]+)\/([^\/?#]+)/.exec(ghPage.url);
    if (m) {
      var repo = m[1] + "/" + m[2].replace(/\.git$/, "");
      fetch("https://api.github.com/repos/" + repo + "/releases?per_page=1")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rels) {
          if (rels && rels.length) setVersionChip(rels[0].tag_name);
        })
        .catch(function () {});
    }
  }
})();

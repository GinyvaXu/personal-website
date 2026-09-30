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
    return '<figure class="pp-shot"><img src="../../' + esc(s.src) + '" alt="' + esc(s.caption || p.name) + '" loading="lazy">' +
      (s.caption ? "<figcaption>" + esc(s.caption) + "</figcaption>" : "") + "</figure>";
  }).join("");

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
    (highlights ? '<div class="pp-block"><h2>项目亮点</h2><ul class="pp-list">' + highlights + "</ul></div>" : "") +
    (tech ? '<div class="pp-block"><h2>技术栈</h2><div class="pp-tech">' + tech + "</div></div>" : "") +
    (p.lastUpdate ? '<div class="pp-block"><h2>最近更新</h2><p class="pp-update">' + esc(p.lastUpdate) + "</p></div>" : "") +
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

  // 可选：从 GitHub API 拉最新版本号（失败自动忽略，保持 --）
  if (ghPage) {
    var m = /github\.com\/([^\/]+)\/([^\/?#]+)/.exec(ghPage.url);
    if (m) {
      var repo = m[1] + "/" + m[2].replace(/\.git$/, "");
      fetch("https://api.github.com/repos/" + repo + "/releases?per_page=1")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rels) {
          var el = document.getElementById("ppVer");
          if (el && rels && rels.length) el.textContent = "最新版 " + String(rels[0].tag_name).replace(/^v/i, "");
        })
        .catch(function () {});
    }
  }
})();

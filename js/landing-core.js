/* ============================================================
 * 共享软件落地页渲染脚本
 * 数据来源：data/landings.js（每项目配置）+ projects.js + docs.js + releases.js
 * 页面：<body class="ld" data-project="<id>">
 * ============================================================ */
(function () {
  "use strict";
  var HOME = "https://www.ginyva.site/";
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtMb(bytes) { return bytes ? (bytes / 1048576).toFixed(1).replace(/\.0$/, "") + " MB" : ""; }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  /* 项目数据里的截图路径是「站点根相对」（assets/...，供首页使用）；
     落地页既可能位于子域名根（/）也可能位于主域路径（/projects/<id>/），
     统一加 ../../ 前缀后两种位置都会解析到站点根，避免主域路径版图片 404 */
  function assetSrc(s) {
    s = String(s == null ? "" : s);
    return /^assets\//.test(s) ? "../../" + s : s;
  }
  /* GIF 动图 → WebM 视频优先（体积约小 70%）；不支持或加载失败自动回退 GIF */
  function mediaTag(src, alt, lazy) {
    src = String(src == null ? "" : src);
    var image = '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '"' + (lazy ? ' loading="lazy"' : "") + ">";
    if (!/\.gif$/i.test(src)) return image;
    var webm = src.replace(/\.gif$/i, ".webm");
    return '<video class="gy-media" autoplay muted loop playsinline preload="auto" data-gif="' + esc(src) + '"' +
      (lazy ? ' data-lazy="1"' : "") + ' aria-label="' + esc(alt || "") + '">' +
      '<source src="' + esc(webm) + '" type="video/webm">' + image + "</video>";
  }
  function enhanceMedia(scope) {
    var reduce = false;
    try { reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    $$("video.gy-media", scope).forEach(function (v) {
      var gif = v.getAttribute("data-gif") || "";
      var alt = v.getAttribute("aria-label") || "";
      var lazy = v.getAttribute("data-lazy") === "1";
      var swapped = false;
      function toImg() {
        if (swapped) return; swapped = true;
        var img = document.createElement("img");
        img.src = gif; img.alt = alt; if (lazy) img.loading = "lazy";
        if (v.parentNode) v.parentNode.replaceChild(img, v);
      }
      if (!v.canPlayType || !v.canPlayType("video/webm")) { toImg(); return; }
      var s = v.querySelector("source");
      if (s) s.addEventListener("error", toImg);
      v.addEventListener("error", toImg);
      if (reduce) { try { v.pause(); v.removeAttribute("autoplay"); } catch (e) {} }
    });
  }

  var id = document.body.getAttribute("data-project");
  var P = null;
  (window.PROJECTS || []).forEach(function (x) { if (x.id === id) P = x; });
  var L = (window.LANDINGS || {})[id];
  var D = (window.DOCS || {})[id];
  var root = document.getElementById("ldRoot");
  if (!P || !L || !root) return;

  /* accent */
  var acc = L.accent || ["#0a84ff", "#5e5ce6"];
  document.documentElement.style.setProperty("--accent", acc[0]);
  document.documentElement.style.setProperty("--accent2", acc[1]);

  /* 镜像/版本数据 */
  var mk = (function () { var m = /^projects\/([^\/]+)\/?$/.exec(P.page || ""); return m ? m[1] : id; })();
  var rel = (window.RELEASES || {})[mk] || null;
  var ghPage = (P.links || []).filter(function (l) { return /github\.com\//i.test(l.url); })[0] || null;
  var ghReleases = ghPage ? ghPage.url.replace(/\/+$/, "") + "/releases" : "";
  var isPre = rel && /beta|alpha|rc/i.test(rel.tag || "");
  function pickSetup(files) {
    if (!files || !files.length) return null;
    for (var i = 0; i < files.length; i++) { if (/setup|install/i.test(files[i].name)) return files[i]; }
    return files[0];
  }
  var dlFile = rel ? pickSetup(rel.files) : null;
  var dlUrl = dlFile ? rel.base + encodeURIComponent(dlFile.name) : (ghReleases ? ghReleases + "/latest" : "#");
  if (L.dlUrl) dlUrl = L.dlUrl;          // 无 Release 的项目（如开源源码包）可自定义下载地址
  var dlLabel = L.dlLabel || "下载安装包";
  if (/^https:\/\/dl\.ginyva\.site\//.test(dlUrl)) {   // R2 镜像下载走 /api/dl（统计 + 302）
    var fn = (/\/latest\/([^\/?#]+)$/.exec(dlUrl) || [])[1] || "";
    try { fn = decodeURIComponent(fn); } catch (e) {}
    dlUrl = "/api/dl?p=" + encodeURIComponent(mk) + "&f=" + encodeURIComponent(fn);
  }
  var verTag = rel && rel.tag ? String(rel.tag) : "";
  var verText = verTag ? (isPre ? "最新预览版 " : "最新正式版 ") + verTag.replace(/^v/i, "") : "";

  /* ---------- 组装 ---------- */
  var demoItems = L.demo || [];
  var heroMedia = L.heroMedia || (demoItems[0] && demoItems[0].src) || assetSrc(((P.screenshots || [])[0] || {}).src) || null;
  var heroIsGif = heroMedia && /\.gif$/i.test(heroMedia);

  var featuresHtml = (L.features || []).map(function (f) {
    return '<article class="card reveal"><span class="card-ico">' + esc(f.icon || "✦") + "</span>" +
      "<h3>" + esc(f.title) + "</h3><p>" + esc(f.text) + "</p></article>";
  }).join("");

  var deepHtml = (L.deep || []).map(function (d, i) {
    return '<div class="deep reveal' + (i % 2 ? " rev" : "") + '">' +
      '<div class="deep-media"><figure class="window">' +
        (d.media ? mediaTag(d.media, d.caption || "", true) : "") +
      "</figure>" + (d.caption ? '<p class="media-cap">' + esc(d.caption) + "</p>" : "") + "</div>" +
      '<div class="deep-body"><p class="kicker">' + esc(d.kicker || "") + "</p><h3>" + esc(d.title) + "</h3>" +
      "<p>" + esc(d.text) + "</p>" +
      (d.bullets ? '<ul class="tick">' + d.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" : "") +
      "</div></div>";
  }).join("");

  var shots = P.screenshots || [];
  var galleryHtml = shots.concat(L.extraShots || []).map(function (s) {
    var src = assetSrc(s.src);
    return '<button class="gallery-item reveal" type="button" data-full="' + esc(src) + '" data-cap="' + esc(s.caption || P.name) + '">' +
      '<img src="' + esc(src) + '" alt="' + esc(s.caption || P.name) + '" loading="lazy">' +
      '<span class="gallery-cap">' + esc(s.caption || "") + "</span></button>";
  }).join("");

  var changelogHtml = (D && D.changelog ? D.changelog.slice(0, 3) : []).map(function (v) {
    return '<article class="tl-item"><span class="tl-ver">' + esc(v.version) + (v.date ? "<time>" + esc(v.date) + "</time>" : "") + "</span>" +
      '<div class="tl-body"><ul>' + (v.items || []).slice(0, 4).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div></article>";
  }).join("");

  var faqHtml = (D && D.faq ? D.faq.slice(0, 4) : []).map(function (f) {
    return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>";
  }).join("");

  var guideUrl = "guide/";
  var ctaSize = dlFile ? fmtMb(dlFile.size) : "";
  var dlDate = rel ? fmtDate(rel.updatedAt) : "";

  root.innerHTML =
    /* 导航 */
    '<nav class="nav" id="ldNav"><div class="container nav-inner">' +
      '<a class="nav-brand" href="#top">' + (L.logo ? '<img src="' + esc(L.logo) + '" alt="">' : "") + "<span>" + esc(L.short || P.name) + "</span></a>" +
      '<div class="nav-links"><a href="#demo">演示</a><a href="#features">功能</a><a href="#gallery">界面</a><a href="#changelog">更新</a><a class="hot" href="' + guideUrl + '">📖 使用教程</a></div>' +
      '<div class="nav-actions">' + (ghPage ? '<a class="btn btn-ghost btn-sm" href="' + esc(ghPage.url) + '" target="_blank" rel="noopener noreferrer">GitHub</a>' : "") +
      '<a class="btn btn-primary btn-sm" href="#download">下载</a></div>' +
    "</div></nav>" +
    /* Hero（含显著教程入口） */
    '<header class="hero" id="top"><div class="hero-grid"></div><div class="hero-glow"></div><div class="container hero-inner">' +
      '<div class="hero-badges reveal in">' +
        (verText ? '<span class="chip chip-accent">' + esc(verText) + "</span>" : "") +
        '<span class="chip">' + esc(P.type) + "</span><span class=\"chip\">" + esc(P.status) + "</span>" +
      "</div>" +
      '<h1 class="hero-title reveal in">' + L.heroTitle + "</h1>" +
      '<p class="hero-sub reveal in">' + esc(L.heroSub) + "</p>" +
      '<div class="hero-cta reveal in">' +
        '<a class="btn btn-primary btn-lg" href="#download">⬇ 下载' + (ctaSize ? '<span class="btn-sub">v' + esc(verTag.replace(/^v/i, "")) + " · " + esc(ctaSize) + "</span>" : "") + "</a>" +
        '<a class="btn btn-ghost btn-lg" href="' + guideUrl + '">📖 使用教程</a>' +
      "</div>" +
      '<ul class="hero-trust reveal in">' + (L.trust || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      (heroMedia ? '<figure class="window reveal in">' + mediaTag(heroMedia, P.name) + '</figure>' +
        (heroIsGif ? '<p class="media-cap">动图演示 · 持续循环</p>' : "") : "") +
    "</div></header>" +
    "<main>" +
    /* 演示 */
    (demoItems.length ? '<section class="section" id="demo"><div class="container">' +
      '<div class="section-head reveal"><p class="kicker">DEMO</p><h2>快速看懂 ' + esc(L.short || P.name) + "</h2><p class=\"section-sub\">" + esc(L.demoSub || "几张图，看完就知道它是不是你要的工具。") + "</p></div>" +
      '<div class="demo"><div class="demo-tabs" id="ldTabs">' + demoItems.map(function (d, i) {
        return '<button class="demo-tab' + (i === 0 ? " active" : "") + '" type="button" data-pane="ldp' + i + '">' + esc(d.label) + "</button>";
      }).join("") + "</div><div class=\"demo-stage\">" + demoItems.map(function (d, i) {
        return '<div class="demo-pane' + (i === 0 ? " active" : "") + '" id="ldp' + i + '"><figure class="window">' + mediaTag(d.src, d.caption || d.label) + '</figure>' +
          (d.caption ? '<p class="media-cap">' + esc(d.caption) + "</p>" : "") + "</div>";
      }).join("") + "</div></div></div></section>" : "") +
    /* 功能 */
    (featuresHtml ? '<section class="section section-alt" id="features"><div class="container">' +
      '<div class="section-head reveal"><p class="kicker">FEATURES</p><h2>' + esc(L.featuresTitle || "它能做什么") + "</h2>" +
      (L.featuresSub ? '<p class="section-sub">' + esc(L.featuresSub) + "</p>" : "") + "</div>" +
      '<div class="grid-3">' + featuresHtml + "</div></div></section>" : "") +
    /* 深度展示 */
    (deepHtml ? '<section class="section" id="deep"><div class="container">' + deepHtml + "</div></section>" : "") +
    /* 画廊 */
    (galleryHtml ? '<section class="section section-alt" id="gallery"><div class="container">' +
      '<div class="section-head reveal"><p class="kicker">SCREENS</p><h2>界面画廊</h2><p class="section-sub">点击查看大图。</p></div>' +
      '<div class="gallery">' + galleryHtml + "</div></div></section>" : "") +
    /* 更新日志 */
    (changelogHtml ? '<section class="section" id="changelog"><div class="container">' +
      '<div class="section-head reveal"><p class="kicker">CHANGELOG</p><h2>一直在更新</h2><p class="section-sub">完整说明见<a href="' + guideUrl + '">使用教程</a>。</p></div>' +
      '<div class="timeline reveal">' + changelogHtml + "</div></div></section>" : "") +
    /* 下载 */
    '<section class="section section-alt" id="download"><div class="container">' +
      '<div class="section-head reveal"><p class="kicker">DOWNLOAD</p><h2>下载 ' + esc(L.short || P.name) + "</h2><p class=\"section-sub\">" + esc(L.dlSub || "免费使用 · 本地运行") + "</p></div>" +
      '<div class="dl-card reveal"><div class="dl-meta">' +
        (verTag ? '<span class="chip chip-accent">' + esc((isPre ? "预览版 " : "正式版 ") + "v" + verTag.replace(/^v/i, "")) + "</span>" : "") +
        (ctaSize ? '<span class="chip">' + esc(ctaSize) + "</span>" : "") +
        (dlDate ? '<span class="chip">更新于 ' + esc(dlDate) + "</span>" : "") +
        (L.os ? '<span class="chip">' + esc(L.os) + "</span>" : "") +
      "</div>" +
      '<div class="dl-actions">' +
        '<a class="btn btn-primary btn-lg" href="' + esc(dlUrl) + '" target="_blank" rel="noopener noreferrer">⬇ ' + esc(dlLabel) + "</a>" +
        '<a class="btn btn-ghost btn-lg" href="' + guideUrl + '">📖 使用教程</a>' +
      "</div>" +
      '<p class="dl-note">' + (L.dlUrl
        ? '开源项目：下载源码包解压即用' + (ghPage ? '；源码与更新见 <a href="' + esc(ghPage.url) + '" target="_blank" rel="noopener noreferrer">GitHub 仓库</a>' : "") + "。"
        : '国内高速镜像（Cloudflare R2）' + (ghReleases ? '；也可在 <a href="' + esc(ghReleases) + '" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 获取官方原件' : "") + "。") + '图文教程与常见问题见 <a href="' + guideUrl + '">使用教程</a>。</p>' +
      (L.req ? '<ul class="dl-req">' + L.req.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>" : "") +
      "</div></div></section>" +
    /* FAQ */
    (faqHtml ? '<section class="section" id="faq"><div class="container container-narrow">' +
      '<div class="section-head reveal"><p class="kicker">FAQ</p><h2>常见问题</h2></div>' +
      '<div class="faq reveal">' + faqHtml + '</div><p class="center reveal" style="margin-top:18px"><a class="btn btn-ghost btn-sm" href="' + guideUrl + '">查看完整教程与全部问题 →</a></p></div></section>' : "") +
    /* 打赏 */
    '<section class="section section-alt" id="support"><div class="container container-narrow"><div class="support-card reveal">' +
      "<h2>如果它帮到了你</h2><p>" + esc(L.short || P.name) + " 会一直免费做下去。如果你想支持它，可以请作者喝杯咖啡。</p>" +
      '<div class="support-actions"><div class="qr-ph">赞赏码<br>筹备中</div>' +
      (ghPage ? '<a class="btn btn-ghost" href="' + esc(ghPage.url) + '" target="_blank" rel="noopener noreferrer">⭐ 去 GitHub 点个 Star</a>' : "") +
      "</div></div></div></section>" +
    "</main>" +
    /* 页脚 */
    '<footer class="footer"><div class="container footer-inner">' +
      "<div><strong>" + esc(P.name) + '</strong><p>由 <a href="' + HOME + '">Ginyva</a> 独立开发并维护。</p></div>' +
      '<div class="footer-links"><a href="' + HOME + '">个人主页</a><a href="' + guideUrl + '">使用教程</a>' +
      (ghPage ? '<a href="' + esc(ghPage.url) + '" target="_blank" rel="noopener noreferrer">GitHub</a>' : "") +
      "</div></div></footer>" +
    '<div class="lightbox" id="ldLightbox" hidden><button class="lightbox-close" type="button" aria-label="关闭">×</button>' +
    '<figure><img id="ldLbImg" src="" alt=""><figcaption id="ldLbCap"></figcaption></figure></div>';

  enhanceMedia(root);

  /* ---------- 交互 ---------- */
  var nav = $("#ldNav");
  window.addEventListener("scroll", function () { nav.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: "0px 0px -30px 0px" });
  $$(".reveal").forEach(function (el) { io.observe(el); });

  var tabs = $$("#ldTabs .demo-tab");
  if (tabs.length > 1) {
    var cur = 0, timer = null;
    var panes = $$(".demo-pane");
    var reduceMotion = false;
    try { reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    function go(i) {
      cur = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, k) { t.classList.toggle("active", k === cur); });
      panes.forEach(function (p, k) {
        var active = k === cur;
        p.classList.toggle("active", active);
        $$("video", p).forEach(function (v) {
          try { active ? (!reduceMotion && v.play()) : v.pause(); } catch (e) {}
        });
      });
    }
    function start() { stop(); timer = setInterval(function () { go(cur + 1); }, 6000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    tabs.forEach(function (t, i) { t.addEventListener("click", function () { go(i); start(); }); });
    var demoBox = $(".demo");
    if (demoBox) { start(); demoBox.addEventListener("mouseenter", stop); demoBox.addEventListener("mouseleave", start); }
  }

  var lb = $("#ldLightbox"), lbImg = $("#ldLbImg"), lbCap = $("#ldLbCap");
  $$(".gallery-item").forEach(function (el) {
    el.addEventListener("click", function () {
      lbImg.src = el.getAttribute("data-full");
      lbCap.textContent = el.getAttribute("data-cap") || "";
      lb.hidden = false; document.body.style.overflow = "hidden";
    });
  });
  function closeLb() { lb.hidden = true; lbImg.src = ""; document.body.style.overflow = ""; }
  $(".lightbox-close", lb).addEventListener("click", closeLb);
  lb.addEventListener("click", function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
})();

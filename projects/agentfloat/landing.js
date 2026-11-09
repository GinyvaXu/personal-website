/* ============================================================
 * AgentFloat 宣发页 · 交互脚本（零依赖）
 * 1. 滚动渐现      2. Hero 光晕跟随鼠标    3. 演示 Tab 轮播
 * 4. 画廊 Lightbox  5. 版本信息自动获取（稳定版 + 预发布版，失败降级）
 * ============================================================ */
(function () {
  "use strict";

  /* ---------- 1. 滚动渐现 ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- 2. Hero 光晕跟随鼠标 ---------- */
  var hero = document.querySelector(".hero");
  var glow = document.getElementById("heroGlow");
  if (hero && glow && window.matchMedia("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      glow.style.setProperty("--mx", (e.clientX - r.left) + "px");
      glow.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  }

  /* ---------- 3. 导航滚动阴影 ---------- */
  var nav = document.getElementById("nav");
  function onScroll() { if (nav) nav.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- 4. 演示 Tab 自动轮播 ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".demo-tab"));
  var panes = Array.prototype.slice.call(document.querySelectorAll(".demo-pane"));
  var demoBox = document.querySelector(".demo");
  var current = 0, timer = null;

  function activate(i) {
    current = (i + tabs.length) % tabs.length;
    tabs.forEach(function (t, k) { t.classList.toggle("active", k === current); });
    panes.forEach(function (p, k) { p.classList.toggle("active", k === current); });
  }
  function startAuto() {
    stopAuto();
    timer = window.setInterval(function () { activate(current + 1); }, 8000);
  }
  function stopAuto() { if (timer) { window.clearInterval(timer); timer = null; } }

  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { activate(i); startAuto(); });
  });
  if (tabs.length && demoBox) {
    startAuto();
    demoBox.addEventListener("mouseenter", stopAuto);
    demoBox.addEventListener("mouseleave", startAuto);
    document.addEventListener("visibilitychange", function () {
      document.hidden ? stopAuto() : startAuto();
    });
  }

  /* ---------- 5. Lightbox ---------- */
  var lightbox = document.getElementById("lightbox");
  var lbImg = document.getElementById("lightboxImg");
  var lbCap = document.getElementById("lightboxCap");
  var lbClose = lightbox ? lightbox.querySelector(".lightbox-close") : null;

  function openLightbox(src, cap) {
    if (!lightbox || !lbImg) return;
    lbImg.src = src;
    lbImg.alt = cap || "";
    if (lbCap) lbCap.textContent = cap || "";
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    if (lbImg) lbImg.src = "";
    document.body.style.overflow = "";
  }
  Array.prototype.slice.call(document.querySelectorAll(".zoom")).forEach(function (el) {
    el.addEventListener("click", function () {
      openLightbox(el.getAttribute("data-full"), el.getAttribute("data-cap"));
    });
  });
  if (lbClose) lbClose.addEventListener("click", closeLightbox);
  if (lightbox) {
    lightbox.addEventListener("click", function (e) { if (e.target === lightbox) closeLightbox(); });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLightbox(); });

  /* ---------- 6. 版本信息自动获取（稳定版 + 预发布版） ---------- */
  var REPO = "GinyvaXu/AgentFloat";
  var CACHE_KEY = "af-release-cache-v2";

  function fmtSize(bytes) {
    if (!bytes) return "";
    return (bytes / 1048576).toFixed(1).replace(/\.0$/, "") + " MB";
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function pickAsset(rel) {
    if (!rel || !rel.assets || !rel.assets.length) return null;
    for (var i = 0; i < rel.assets.length; i++) {
      if (/setup/i.test(rel.assets[i].name)) return rel.assets[i];
    }
    return rel.assets[0];
  }
  function apply(data) {
    if (!data) return;
    var stable = data.stable, beta = data.beta;
    var rel = (window.RELEASES || {})["agentfloat"];
    var mirrorUrl = "";
    if (rel && rel.files && rel.files.length && stable) {
      var stVer = String(stable.tag_name || "").replace(/^v/i, "");
      /* 镜像启用条件：tag 与最新正式版一致，且文件名带上该版本号（防止旧包挂新 tag） */
      if (String(rel.tag) === String(stable.tag_name) && stVer &&
          new RegExp(stVer.replace(/\./g, "\\.")).test(String(rel.files[0].name))) {
        mirrorUrl = rel.base + encodeURIComponent(rel.files[0].name);
      }
    }
    if (stable) {
      var ver = String(stable.tag_name || "").replace(/^v/i, "");
      var asset = pickAsset(stable);
      setAll("[data-version]", ver);
      if (asset) {
        setAll("[data-size]", fmtSize(asset.size));
        var sha = String(asset.digest || "").replace(/^sha256:/i, "").toUpperCase();
        setAll("[data-sha]", sha);
      }
      setAll("[data-date]", fmtDate(stable.published_at));
      /* 下载按钮：镜像 tag 与 GitHub 最新正式版一致才用镜像，否则用 GitHub Release 附件 */
      var btn = document.getElementById("dlBtn");
      if (btn) {
        if (mirrorUrl) btn.href = mirrorUrl;
        else if (asset && asset.browser_download_url) btn.href = asset.browser_download_url;
      }
    }
    /* 镜像入口：只有镜像 tag 与 GitHub 最新正式版一致时启用 */
    var mlink = document.querySelector("[data-mirror-link]");
    var mstate = document.querySelector("[data-mirror-state]");
    if (mlink) {
      if (mirrorUrl) {
        mlink.href = mirrorUrl;
        mlink.hidden = false;
        if (mstate) mstate.hidden = true;
      } else {
        mlink.hidden = true;
        if (mstate) mstate.hidden = false;
      }
    }
    /* 预发布版：有非 draft 的 prerelease 才显示入口 */
    var row = document.querySelector("[data-beta-row]");
    if (beta) {
      var blink = document.querySelector("[data-beta-link]");
      if (blink) blink.href = beta.html_url || blink.href;
      if (row) row.hidden = false;
    } else if (row) {
      row.hidden = true;
    }
  }
  function setAll(sel, text) {
    if (!text) return;
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el.textContent = text; });
  }

  function fetchReleases() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
    if (cached && Date.now() - cached.t < 30 * 60 * 1000) { apply(cached.d); return; }
    fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=10")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rels) {
        if (!rels || !rels.length) return;
        var stable = null, beta = null;
        for (var i = 0; i < rels.length; i++) {
          if (rels[i].draft) continue;
          if (!rels[i].prerelease && !stable) stable = rels[i];
          if (rels[i].prerelease && !beta) beta = rels[i];
        }
        var d = { stable: stable, beta: beta };
        apply(d);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      })
      .catch(function () { /* 静默降级：保留页面静态版本号 */ });
  }
  /* ---------- 7. 镜像管线数据（data/releases.js）已在 apply() 内按 tag 一致性裁决 ---------- */
  fetchReleases();
})();

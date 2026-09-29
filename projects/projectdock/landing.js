/* ============================================================
 * ProjectDock 宣发页 · 交互脚本（零依赖）
 * 1. 滚动渐现      2. Hero 光晕跟随鼠标    3. 演示 Tab 轮播
 * 4. 画廊 Lightbox  5. 版本号/大小自动获取（GitHub API，失败降级）
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

  /* ---------- 6. 版本号 / 大小自动更新（失败则保留静态值） ---------- */
  var REPO = "GinyvaXu/ProjectDock";
  var fmtSize = function (bytes) {
    if (!bytes) return "";
    return (bytes / 1048576).toFixed(1).replace(/\.0$/, "") + " MB";
  };
  var fmtDate = function (iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  // 30 分钟缓存，避免每次访问都请求 GitHub API
  var CACHE_KEY = "pd-release-cache-v1";
  function applyRelease(rel) {
    if (!rel) return;
    var ver = String(rel.tag_name || "").replace(/^v/i, "");
    var size = rel.assets && rel.assets.length ? fmtSize(rel.assets[0].size) : "";
    var date = fmtDate(rel.published_at);
    Array.prototype.forEach.call(document.querySelectorAll("[data-version]"), function (el) { if (ver) el.textContent = ver; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-size]"), function (el) { if (size) el.textContent = size; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-date]"), function (el) { if (date) el.textContent = date; });
  }
  function fetchRelease() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
    if (cached && Date.now() - cached.t < 30 * 60 * 1000) { applyRelease(cached.d); return; }
    fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=1")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rels) {
        if (rels && rels.length) {
          applyRelease(rels[0]);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: rels[0] })); } catch (e) {}
        }
      })
      .catch(function () { /* 静默降级：保留静态版本号 */ });
  }
  fetchRelease();
})();

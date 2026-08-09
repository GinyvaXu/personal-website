(function () {
  "use strict";

  var site = window.SITE_DATA || {};
  var projects = window.PROJECTS || [];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  var TYPE_ICONS = {
    "软件": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2.5"></rect><path d="M7 9.5 9.5 12 7 14.5"></path><path d="M12.5 14.5h4"></path></svg>',
    "游戏": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="3.2"></rect><path d="M6.5 10.5v3.5"></path><path d="M4.8 12.2h3.4"></path><circle cx="14.8" cy="11.2" r="0.9"></circle><circle cx="17.3" cy="13.4" r="0.9"></circle></svg>',
    "PPT": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2.5"></rect><path d="M8.5 21h7"></path><path d="M12 17v4"></path><path d="M7.5 8.5h9"></path><path d="M7.5 12h6"></path></svg>',
    "文稿": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h7.5L18 8v12.5H6z"></path><path d="M13.5 3.5V8H18"></path><path d="M9 12h6"></path><path d="M9 15.5h6"></path></svg>'
  };

  var CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path></svg>';

  var SOCIAL_DEFS = {
    github: { label: "GitHub", icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"></path></svg>' },
    steam: { label: "Steam", icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.1 7.6A3.6 3.6 0 0 1 6.7 4h10.6a3.6 3.6 0 0 1 3.6 3.6v8.8a3.6 3.6 0 0 1-3.6 3.6H6.7a3.6 3.6 0 0 1-3.6-3.6Z"></path><path d="M8.7 16a2.1 2.1 0 0 1 1.8-3.2l2.3 1.1a.62.62 0 0 0 .5-1.1l-.7-1.4a3.8 3.8 0 1 0-4.2 4.4l1.4.4a2 2 0 0 1-1.1-.2Z"></path><circle cx="9.2" cy="14.5" r="1.05"></circle></svg>' },
    email: { label: "邮箱", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="m3.5 7 8.5 6 8.5-6"></path></svg>' },
    wechat: { label: "微信", icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.1 3.6c-3.5 0-6.4 2.4-6.4 5.3 0 1.7.9 3.1 2.3 4.1l-.6 1.9 2.2-1.1c.7.2 1.4.3 2.1.3h.4a4 4 0 0 1-.2-1.3c0-2.8 2.7-5 6-5h.2c-.5-2.4-3-4.2-5.5-4.2Z"></path><path d="M20.9 14.1c0-2.3-2.2-4.2-5-4.2s-5 1.9-5 4.2 2.2 4.2 5 4.2c.6 0 1.1-.1 1.6-.2l1.7.9-.5-1.6c1-.8 1.6-1.9 1.6-3Z"></path><circle cx="7.1" cy="7" r="0.85"></circle><circle cx="11" cy="7" r="0.85"></circle><circle cx="13.7" cy="13.6" r="0.8"></circle><circle cx="16.5" cy="13.6" r="0.8"></circle></svg>' },
    qq: { label: "QQ", icon: "QQ" },
    bilibili: { label: "B站", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.3 3.4l1.3 2.1"></path><path d="M15.7 3.4l-1.3 2.1"></path><rect x="3" y="6.5" width="18" height="12.5" rx="2.5"></rect><path d="M7 10.5h10"></path><path d="M7 14h5.5"></path></svg>' },
    weibo: { label: "微博", icon: "微博" },
    douyin: { label: "抖音", icon: "抖音" }
  };
  var SOCIAL_ORDER = ["github", "steam", "email", "wechat", "qq", "bilibili", "weibo", "douyin"];

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });

  function observeReveals(root) {
    $$(".reveal:not(.in)", root).forEach(function (el) { revealObserver.observe(el); });
  }

  var name = site.name || "个人网站";
  var names = (site.names && site.names.length) ? site.names.slice() : [name];
  var nameIdx = 0;
  document.title = name + " · 个人网站";
  $("#brandName").textContent = name;
  $("#heroNameText").textContent = name;
  $("#heroTagline").textContent = site.tagline || "";

  function applyName(next) {
    var heroEl = $("#heroNameText");
    var brandEl = $("#brandName");
    [heroEl, brandEl].forEach(function (el) {
      if (!el) return;
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
    });
    window.setTimeout(function () {
      [heroEl, brandEl].forEach(function (el) { if (el) el.textContent = next; });
      document.title = next + " · 个人网站";
      var footerEl = $("#footerText");
      if (footerEl) footerEl.textContent = "© " + new Date().getFullYear() + " " + next + " · 用心做的小网站";
      window.requestAnimationFrame(function () {
        [heroEl, brandEl].forEach(function (el) {
          if (!el) return;
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
        });
      });
    }, 280);
  }

  if (names.length > 1) {
    window.setInterval(function () {
      nameIdx = (nameIdx + 1) % names.length;
      applyName(names[nameIdx]);
    }, 4200);
  }

  var avatarWrap = $("#heroAvatar");
  if (site.avatar) {
    var img = document.createElement("img");
    img.className = "hero-avatar-img";
    img.src = site.avatar;
    img.alt = name + "的头像";
    avatarWrap.appendChild(img);
  } else {
    var initial = document.createElement("div");
    initial.className = "hero-avatar-initial";
    initial.textContent = (name.trim().charAt(0) || "我");
    initial.setAttribute("aria-hidden", "true");
    avatarWrap.appendChild(initial);
  }

  $("#aboutText").textContent = site.about || "";

  function socialContent(key) {
    var def = SOCIAL_DEFS[key];
    if (!def) return "";
    if (def.icon.indexOf("<svg") === 0) return def.icon;
    return '<span class="social-glyph">' + def.icon + "</span>";
  }

  function renderSocials(container, large) {
    var html = SOCIAL_ORDER.filter(function (k) { return site.socials && site.socials[k]; }).map(function (k) {
      var def = SOCIAL_DEFS[k];
      var url = site.socials[k];
      if (k === "email" && url.indexOf("mailto:") !== 0) url = "mailto:" + url;
      if (k === "qq" && /^\d+$/.test(url)) url = "https://wpa.qq.com/msgrd?v=3&uin=" + url + "&site=qq&menu=yes";
      return '<a class="social-btn' + (large ? " social-btn-lg" : "") + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(def.label) + '" aria-label="' + esc(def.label) + '">' + socialContent(k) + "</a>";
    }).join("");
    container.innerHTML = html;
    container.classList.toggle("hidden", !html);
  }

  renderSocials($("#heroSocials"), false);
  renderSocials($("#contactSocials"), true);

  var typeSet = {};
  projects.forEach(function (p) { typeSet[p.type] = true; });
  var doneCount = projects.filter(function (p) { return p.status === "已完成"; }).length;
  var wipCount = projects.filter(function (p) { return p.status === "进行中"; }).length;

  $("#aboutStats").innerHTML = [
    { n: projects.length, label: "总项目" },
    { n: Object.keys(typeSet).length, label: "内容类型" },
    { n: doneCount, label: "已完成" },
    { n: wipCount, label: "进行中" }
  ].map(function (s) {
    return '<div class="stat"><b>' + s.n + "</b><span>" + s.label + "</span></div>";
  }).join("");

  var subEl = $("#projectsSub");
  if (subEl) {
    subEl.textContent = projects.length + " 个项目 · " + Object.keys(typeSet).join(" / ");
  }

  var TYPE_ORDER = ["软件", "游戏", "PPT", "文稿"];
  var types = TYPE_ORDER.filter(function (t) { return typeSet[t]; });
  var currentType = "全部";

  function typeIcon(type) { return TYPE_ICONS[type] || TYPE_ICONS["软件"]; }
  function statusClass(status) { return status === "进行中" ? "status-wip" : "status-done"; }

  function renderFilters() {
    var chips = ["全部"].concat(types).map(function (t) {
      var n = t === "全部" ? projects.length : projects.filter(function (p) { return p.type === t; }).length;
      var active = t === currentType;
      return '<button class="chip' + (active ? " active" : "") + '" data-type="' + esc(t) + '" role="tab" aria-selected="' + active + '">' + esc(t) + '<span class="chip-count">' + n + "</span></button>";
    }).join("");
    $("#filters").innerHTML = chips;
    $$(".chip", $("#filters")).forEach(function (chip) {
      chip.addEventListener("click", function () {
        currentType = chip.getAttribute("data-type");
        renderFilters();
        renderGrid();
      });
    });
  }

  function githubLink(p) {
    return (p.links || []).filter(function (l) { return /github/i.test(l.label) || /github\.com/i.test(l.url); })[0] || null;
  }

  function cardHtml(p, i) {
    var tech = (p.tech || []).slice(0, 3).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    var gh = githubLink(p);
    var flag = p.featured ? '<span class="card-flag">主力</span>' : "";
    return '<article class="project-card reveal' + (p.featured ? " card-featured" : "") + '" style="transition-delay:' + (i % 6) * 60 + 'ms" data-id="' + esc(p.id) + '" tabindex="0" role="button" aria-label="查看项目：' + esc(p.name) + '">' +
      '<div class="card-top">' +
        '<span class="card-icon type-' + esc(p.type) + '">' + typeIcon(p.type) + "</span>" +
        flag +
        '<span class="status ' + statusClass(p.status) + '">' + esc(p.status) + "</span>" +
      "</div>" +
      '<h3 class="card-name">' + esc(p.name) + "</h3>" +
      '<p class="card-summary">' + esc(p.summary) + "</p>" +
      (tech ? '<div class="card-tech">' + tech + "</div>" : "") +
      (p.lastUpdate ? '<div class="card-update">' + CLOCK_ICON + '<span>' + esc(p.lastUpdate) + "</span></div>" : "") +
      '<div class="card-foot">' +
        (gh ? '<a class="card-gh" href="' + esc(gh.url) + '" target="_blank" rel="noopener noreferrer" title="GitHub 仓库" aria-label="GitHub 仓库">' + SOCIAL_DEFS.github.icon + "<span>GitHub</span></a>" : "") +
        '<span class="card-more">查看详情 →</span>' +
      "</div>" +
    "</article>";
  }

  var grid = $("#projectGrid");
  var modal = $("#projectModal");
  var lastFocus = null;

  function renderGrid() {
    var list = currentType === "全部" ? projects : projects.filter(function (p) { return p.type === currentType; });
    grid.innerHTML = list.length
      ? list.map(cardHtml).join("")
      : '<p class="empty">暂无项目，去 data/projects.js 添加一条吧。</p>';
    $$(".project-card", grid).forEach(function (card) {
      var open = function () {
        var p = projects.filter(function (x) { return x.id === card.getAttribute("data-id"); })[0];
        if (p) openModal(p);
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
    $$(".card-gh", grid).forEach(function (a) {
      a.addEventListener("click", function (e) { e.stopPropagation(); });
    });
    observeReveals(grid);
  }

  function renderFeatured() {
    var panel = $("#featuredPanel");
    if (!panel) return;
    var p = projects.filter(function (x) { return x.featured; })[0];
    var head = $(".featured-head");
    if (!p) {
      panel.innerHTML = "";
      if (head) head.classList.add("hidden");
      return;
    }
    if (head) head.classList.remove("hidden");
    var tech = (p.tech || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    var highlights = (p.highlights || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("");
    var links = (p.links || []).map(function (l) {
      return '<a class="btn btn-primary btn-sm" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + " ↗</a>";
    }).join("");
    panel.innerHTML =
      '<div class="featured-main">' +
        '<div class="featured-meta">' +
          '<span class="featured-flag">★ 当前主力项目</span>' +
          '<span class="status ' + statusClass(p.status) + '">' + esc(p.status) + "</span>" +
        "</div>" +
        '<h3 class="featured-name">' + esc(p.name) + "</h3>" +
        '<p class="featured-summary">' + esc(p.summary) + "</p>" +
        (p.detail ? '<p class="featured-detail">' + esc(p.detail) + "</p>" : "") +
        (highlights ? '<ul class="featured-list">' + highlights + "</ul>" : "") +
        (tech ? '<div class="featured-tech">' + tech + "</div>" : "") +
        (p.lastUpdate ? '<div class="featured-update">' + CLOCK_ICON + "<span>" + esc(p.lastUpdate) + "</span></div>" : "") +
        '<div class="featured-actions">' + links +
          '<button class="btn btn-ghost btn-sm" type="button" data-featured-detail>查看详情</button>' +
        "</div>" +
      "</div>" +
      '<div class="featured-show" aria-hidden="true">' +
        '<div class="glass-ball">' +
          '<span class="ring ring-1"></span>' +
          '<span class="ring ring-2"></span>' +
          '<span class="ring ring-3"></span>' +
          '<span class="ball-core"><img src="assets/agentfloat-icon.png" alt="AgentFloat 图标"></span>' +
          '<span class="badge badge-api">API 余额监控</span>' +
          '<span class="badge badge-news">AI 快报</span>' +
          '<span class="badge badge-skills">Skills 辅助</span>' +
        "</div>" +
      "</div>";
    var detailBtn = panel.querySelector("[data-featured-detail]");
    if (detailBtn) detailBtn.addEventListener("click", function () { openModal(p); });
  }

  function openModal(p) {
    var tech = (p.tech || []).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("");
    var highlights = (p.highlights || []).map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("");
    var links = (p.links || []).map(function (l) {
      return '<a class="btn btn-primary btn-sm" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + " ↗</a>";
    }).join("");
    $("#modalContent").innerHTML =
      '<div class="modal-head">' +
        '<span class="card-icon type-' + esc(p.type) + '">' + typeIcon(p.type) + "</span>" +
        '<span class="status ' + statusClass(p.status) + '">' + esc(p.status) + "</span>" +
      "</div>" +
      '<h3 class="modal-name">' + esc(p.name) + "</h3>" +
      '<p class="modal-summary">' + esc(p.summary) + "</p>" +
      (p.detail ? '<p class="modal-detail">' + esc(p.detail) + "</p>" : "") +
      (p.lastUpdate ? '<div class="modal-block"><h4>最近更新</h4><p class="modal-update">' + esc(p.lastUpdate) + "</p></div>" : "") +
      (highlights ? '<div class="modal-block"><h4>项目亮点</h4><ul class="modal-list">' + highlights + "</ul></div>" : "") +
      (tech ? '<div class="modal-block"><h4>技术栈</h4><div class="modal-tech">' + tech + "</div></div>" : "") +
      (links ? '<div class="modal-links">' + links + "</div>" : "");
    lastFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    var closeBtn = $(".modal-close", modal);
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modal.classList.contains("open")) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  $$("[data-close-modal]", modal).forEach(function (el) {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  var header = $("#siteHeader");
  var navToggle = $("#navToggle");
  var navLinksEl = $("#navLinks");

  navToggle.addEventListener("click", function () {
    var open = navLinksEl.classList.toggle("open");
    navToggle.classList.toggle("active", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });

  $$(".nav-link", navLinksEl).forEach(function (link) {
    link.addEventListener("click", function () {
      navLinksEl.classList.remove("open");
      navToggle.classList.remove("active");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  var sectionObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        $$(".nav-link").forEach(function (l) {
          l.classList.toggle("active", l.getAttribute("href") === "#" + entry.target.id);
        });
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  ["home", "about", "featured", "projects", "contact"].forEach(function (id) {
    var sec = document.getElementById(id);
    if (sec) sectionObserver.observe(sec);
  });

  window.addEventListener("scroll", function () {
    header.classList.toggle("scrolled", window.scrollY > 8);
  }, { passive: true });

  $("#footerText").textContent = "© " + new Date().getFullYear() + " " + name + " · 用心做的小网站";

  renderFilters();
  renderGrid();
  renderFeatured();

  if (!("IntersectionObserver" in window)) {
    $$(".reveal").forEach(function (el) { el.classList.add("in"); });
  } else {
    observeReveals(document);
  }
})();
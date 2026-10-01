/* ============================================================
 * 管理控制台逻辑
 *   Tab：站点运营（公告 / 排序 / 镜像）· 统计 · 反馈 · 文件仓库
 *   数据：KV（公告/排序/token）、D1（统计/反馈）、R2（文件）
 * ============================================================ */
(function () {
  "use strict";

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (n == null) return "";
    if (n >= 1048576) return (n / 1048576).toFixed(2) + " MB";
    if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
    return n + " B";
  }
  function fmtTime(iso) {
    if (!iso) return "";
    return String(iso).replace("T", " ").slice(0, 16);
  }
  function flash(el, msg, isErr) {
    if (!el) return;
    el.textContent = msg;
    el.className = "admin-hint" + (isErr ? " err" : "");
  }

  var PROJECTS = window.PROJECTS || [];
  function projectName(id) {
    for (var i = 0; i < PROJECTS.length; i++) if (PROJECTS[i].id === id) return PROJECTS[i].name;
    return id;
  }

  var STATUS_OPTIONS = [
    ["new", "待处理"], ["planned", "已计划"], ["doing", "进行中"], ["done", "已完成"], ["hidden", "隐藏"],
  ];

  var loginView = $("#loginView");
  var dashView = $("#dashView");
  var logoutBtn = $("#logoutBtn");
  var loginStatus = $("#loginStatus");

  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
    logoutBtn.hidden = true;
  }
  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    initTabs();
    loadSiteConfig();
    loadMirror();
    loadStats();
    loadFeedback();
    loadFiles();
  }

  /* ---------- 会话检查 ---------- */
  fetch("/api/admin/session")
    .then(function (r) { r.ok ? showDash() : showLogin(); })
    .catch(showLogin);

  /* ---------- 登录 / 登出 ---------- */
  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = $("#loginPass").value;
    if (!pass) return;
    $("#loginBtn").disabled = true;
    loginStatus.className = "admin-hint";
    loginStatus.textContent = "登录中…";
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pass }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.ok) throw new Error((res.d && res.d.error) || "登录失败");
        $("#loginPass").value = "";
        loginStatus.textContent = "";
        showDash();
      })
      .catch(function (err) {
        loginStatus.className = "admin-hint err";
        loginStatus.textContent = "❌ " + (err.message || "登录失败");
      })
      .then(function () { $("#loginBtn").disabled = false; });
  });

  logoutBtn.addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST" }).finally(function () { showLogin(); });
  });

  /* ---------- Tab 切换 ---------- */
  function initTabs() {
    if (initTabs.done) return;
    initTabs.done = true;
    $$("#adminTabs button").forEach(function (b) {
      b.addEventListener("click", function () { activateTab(b.getAttribute("data-tab")); });
    });
    activateTab((location.hash || "#ops").replace("#", ""));
  }
  function activateTab(name) {
    if (!$("#tab-" + name)) name = "ops";
    $$("#adminTabs button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === name);
    });
    $$(".admin-tabpane").forEach(function (p) {
      p.hidden = p.id !== "tab-" + name;
    });
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
  }

  /* ============================================================
   * 站点运营：公告 + 排序 + 镜像
   * ============================================================ */

  var ORDER = { order: [], hidden: [] };

  function loadSiteConfig() {
    fetch("/api/admin/site-config")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "加载失败");
        var a = d.announce || {};
        $("#annEnabled").checked = !!a.enabled;
        $("#annText").value = a.text || "";
        $("#annLink").value = a.link || "";
        $("#annType").value = a.type || "info";
        ORDER = {
          order: (d.order && d.order.order) || [],
          hidden: (d.order && d.order.hidden) || [],
        };
        renderOrderList();
      })
      .catch(function (err) {
        $("#orderList").innerHTML = '<p class="admin-empty">加载失败：' + esc(err.message) + "</p>";
      });
  }

  function renderOrderList() {
    var box = $("#orderList");
    if (!box) return;
    var byId = {};
    PROJECTS.forEach(function (p) { byId[p.id] = p; });

    var ids = [];
    ORDER.order.forEach(function (id) { if (byId[id] && ids.indexOf(id) < 0) ids.push(id); });
    PROJECTS.forEach(function (p) { if (ids.indexOf(p.id) < 0) ids.push(p.id); });

    box.innerHTML = ids.map(function (id, i) {
      var p = byId[id];
      var hid = ORDER.hidden.indexOf(id) > -1;
      return '<div class="admin-order-row' + (hid ? " off" : "") + '" data-id="' + esc(id) + '">' +
        '<span class="ord-num">' + (i + 1) + "</span>" +
        '<span class="ord-name">' + esc(p.name) + "</span>" +
        '<span class="ord-type">' + esc(p.type) + "</span>" +
        '<button class="btn btn-ghost btn-sm" data-act="up" type="button" title="上移">↑</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="down" type="button" title="下移">↓</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="toggle" type="button">' + (hid ? "👁 隐藏中" : "👁 显示") + "</button>" +
        "</div>";
    }).join("");

    function renumber() {
      $$(".admin-order-row", box).forEach(function (row, i) {
        $(".ord-num", row).textContent = i + 1;
      });
    }

    $$(".admin-order-row", box).forEach(function (row) {
      var id = row.getAttribute("data-id");
      $('[data-act="up"]', row).addEventListener("click", function () {
        var prev = row.previousElementSibling;
        if (prev) { box.insertBefore(row, prev); renumber(); }
      });
      $('[data-act="down"]', row).addEventListener("click", function () {
        var next = row.nextElementSibling;
        if (next) { box.insertBefore(next, row); renumber(); }
      });
      $('[data-act="toggle"]', row).addEventListener("click", function () {
        var hid = ORDER.hidden.indexOf(id) > -1;
        if (hid) ORDER.hidden = ORDER.hidden.filter(function (x) { return x !== id; });
        else ORDER.hidden.push(id);
        row.classList.toggle("off", !hid);
        $('[data-act="toggle"]', row).textContent = hid ? "👁 显示" : "👁 隐藏中";
      });
    });
  }

  $("#annSave").addEventListener("click", function () {
    var body = {
      announce: {
        enabled: $("#annEnabled").checked,
        text: $("#annText").value.trim(),
        link: $("#annLink").value.trim(),
        type: $("#annType").value,
      },
    };
    if (body.announce.enabled && !body.announce.text) {
      flash($("#annStatus"), "启用公告时请先填写文案", true);
      return;
    }
    fetch("/api/admin/site-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error); flash($("#annStatus"), "✅ 已保存（约 1 分钟内全站可见）"); })
      .catch(function (err) { flash($("#annStatus"), "保存失败：" + err.message, true); });
  });

  $("#orderSave").addEventListener("click", function () {
    var ids = $$(".admin-order-row").map(function (el) { return el.getAttribute("data-id"); });
    fetch("/api/admin/site-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ids, hidden: ORDER.hidden }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error); flash($("#orderStatus"), "✅ 已保存（首页实时生效）"); })
      .catch(function (err) { flash($("#orderStatus"), "保存失败：" + err.message, true); });
  });

  $("#orderReset").addEventListener("click", function () {
    ORDER = { order: [], hidden: [] };
    renderOrderList();
    flash($("#orderStatus"), "已恢复默认顺序，点「保存排序」生效");
  });

  /* ---------- 镜像同步 ---------- */
  var RUN_LABEL = { queued: "排队中", in_progress: "进行中", completed: "已完成", waiting: "等待中" };
  function runState(r) {
    if (r.status !== "completed") return RUN_LABEL[r.status] || r.status;
    if (r.conclusion === "success") return "✅ 成功";
    if (!r.conclusion) return "已完成";
    return "❌ " + r.conclusion;
  }

  function loadMirror() {
    var box = $("#mirrorRuns");
    fetch("/api/admin/mirror")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        $("#mirrorTokenBox").hidden = !!d.hasToken;
        if (!d.ok && d.error) {
          box.innerHTML = '<p class="admin-empty">' + esc(d.error) + "</p>";
          return;
        }
        if (!d.hasToken) {
          box.innerHTML = '<p class="admin-empty">还没有配置 GitHub Token：粘贴一次即可启用「一键镜像」。</p>';
          return;
        }
        if (!d.runs || !d.runs.length) {
          box.innerHTML = '<p class="admin-empty">还没有运行记录。</p>';
          return;
        }
        box.innerHTML = d.runs.map(function (r) {
          return '<div class="admin-run-row">' +
            '<span class="run-state">' + esc(runState(r)) + "</span>" +
            '<span class="run-event">' + esc(r.event === "workflow_dispatch" ? "手动触发" : r.event) + "</span>" +
            '<time>' + esc(fmtTime(r.created)) + "</time>" +
            '<a class="btn btn-ghost btn-sm" href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer">详情</a>' +
            "</div>";
        }).join("");
      })
      .catch(function (err) {
        box.innerHTML = '<p class="admin-empty">加载失败：' + esc(err.message) + "</p>";
      });
  }

  $("#mirrorRun").addEventListener("click", function () {
    var btn = this;
    btn.disabled = true;
    fetch("/api/admin/mirror", { method: "POST" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.d.ok) {
          if (res.d.needToken) $("#mirrorTokenBox").hidden = false;
          throw new Error(res.d.error || "触发失败");
        }
        loadMirror();
        setTimeout(loadMirror, 5000);
        setTimeout(loadMirror, 60000);
      })
      .catch(function (err) { alert("触发失败：" + err.message); })
      .then(function () { btn.disabled = false; });
  });

  $("#mirrorTokenSave").addEventListener("click", function () {
    var t = $("#mirrorToken").value.trim();
    if (!t) { flash($("#mirrorTokenStatus"), "请先粘贴 Token", true); return; }
    fetch("/api/admin/mirror", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error);
        $("#mirrorToken").value = "";
        flash($("#mirrorTokenStatus"), "✅ 已保存");
        loadMirror();
      })
      .catch(function (err) { flash($("#mirrorTokenStatus"), err.message, true); });
  });

  $("#mirrorTokenClear").addEventListener("click", function () {
    if (!confirm("清除已保存的 GitHub Token？")) return;
    fetch("/api/admin/mirror", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error);
        flash($("#mirrorTokenStatus"), "已清除");
        loadMirror();
      })
      .catch(function (err) { flash($("#mirrorTokenStatus"), err.message, true); });
  });

  /* ============================================================
   * 统计
   * ============================================================ */
  function statCard(label, value, sub) {
    return '<div class="stat-card"><b>' + esc(value) + "</b><span>" + esc(label) + "</span>" +
      (sub ? '<em>' + esc(sub) + "</em>" : "") + "</div>";
  }

  function rankRows(rows, labelFn, maxN) {
    if (!rows || !rows.length) return '<p class="admin-empty">暂无数据</p>';
    var max = rows[0].c || 1;
    return rows.map(function (r) {
      var w = Math.max(4, Math.round((r.c / max) * 100));
      return '<div class="rank-row">' +
        '<span class="rank-bar" style="width:' + w + '%"></span>' +
        '<span class="rank-label">' + esc(labelFn(r)) + "</span>" +
        '<b class="rank-num">' + esc(r.c) + "</b>" +
        "</div>";
    }).join("");
  }

  function loadStats() {
    fetch("/api/admin/stats")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "加载失败");

        $("#statsCards").innerHTML =
          statCard("今日访问 PV", d.pv.today) +
          statCard("近 7 天 PV", d.pv.d7) +
          statCard("近 7 天独立访客", d.pv.uv7) +
          statCard("累计 PV", d.pv.total) +
          statCard("今日下载", d.dl.today) +
          statCard("累计下载", d.dl.total);

        var trend = d.trend || [];
        if (!trend.length) {
          $("#statsTrend").innerHTML = '<p class="admin-empty">还没有访问数据（部署后从下一次访问开始记录）</p>';
        } else {
          var max = Math.max.apply(null, trend.map(function (t) { return t.pv; }).concat([1]));
          $("#statsTrend").innerHTML = trend.map(function (t) {
            var h = Math.max(3, Math.round((t.pv / max) * 100));
            return '<div class="trend-col" title="' + esc(t.day) + " · PV " + t.pv + " · UV " + t.uv + '">' +
              '<i style="height:' + h + '%"></i>' +
              '<span>' + esc(String(t.day).slice(5)) + "</span></div>";
          }).join("");
        }

        $("#statsPaths").innerHTML = rankRows(d.topPaths, function (r) { return r.path; });
        $("#statsDl").innerHTML = rankRows(d.dlByProject, function (r) { return projectName(r.project); });
        $("#statsHosts").innerHTML = rankRows(d.topHosts, function (r) { return r.host; });
      })
      .catch(function (err) {
        $("#statsCards").innerHTML = '<p class="admin-empty">加载失败：' + esc(err.message) + "</p>";
      });
  }
  $("#statsReload").addEventListener("click", loadStats);

  /* ============================================================
   * 反馈管理（原有）
   * ============================================================ */
  function fbItemHtml(it) {
    var opts = STATUS_OPTIONS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === it.status ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
    return '<article class="admin-fb" data-id="' + esc(it.id) + '">' +
      '<div class="admin-fb-head">' +
        "<b>#" + esc(it.id) + "</b>" +
        "<span>" + esc(projectName(it.project)) + "</span>" +
        '<span class="admin-meta">' + esc(it.name || "匿名") + (it.contact ? " · " + esc(it.contact) : "") + "</span>" +
        "<time>" + esc(fmtTime(it.created_at)) + "</time>" +
      "</div>" +
      '<p class="admin-msg">' + esc(it.message) + "</p>" +
      '<div class="admin-fb-ops">' +
        '<select class="admin-status">' + opts + "</select>" +
        '<input class="admin-reply" type="text" maxlength="600" placeholder="回复（选填，将公开显示）" value="' + esc(it.reply || "") + '">' +
        '<button class="btn btn-primary btn-sm" data-op="save" type="button">保存</button>' +
        '<button class="btn btn-ghost btn-sm" data-op="del" type="button">删除</button>' +
      "</div>" +
    "</article>";
  }

  function bindFbItems(box) {
    $$(".admin-fb", box).forEach(function (el) {
      $('[data-op="save"]', el).addEventListener("click", function () {
        fetch("/api/admin/feedback", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: parseInt(el.getAttribute("data-id"), 10),
            status: $(".admin-status", el).value,
            reply: $(".admin-reply", el).value,
          }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (!d.ok) throw new Error(d.error); flash(el, "✅ 已保存"); })
          .catch(function (err) { flash(el, "保存失败：" + err.message, true); });
      });
      $('[data-op="del"]', el).addEventListener("click", function () {
        if (!confirm("确定删除这条反馈吗？")) return;
        fetch("/api/admin/feedback?id=" + encodeURIComponent(el.getAttribute("data-id")), { method: "DELETE" })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (!d.ok) throw new Error(d.error); el.remove(); })
          .catch(function (err) { flash(el, "删除失败：" + err.message, true); });
      });
    });
  }

  function loadFeedback() {
    var box = $("#adminFbList");
    if (!box) return;
    box.innerHTML = '<p class="admin-empty">加载中…</p>';
    fetch("/api/admin/feedback")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "加载失败");
        if (!d.items.length) { box.innerHTML = '<p class="admin-empty">暂无反馈</p>'; return; }
        box.innerHTML = d.items.map(fbItemHtml).join("");
        bindFbItems(box);
      })
      .catch(function (err) {
        box.innerHTML = '<p class="admin-empty">加载失败：' + esc(err.message) + "</p>";
      });
  }
  $("#fbReload").addEventListener("click", loadFeedback);

  /* ============================================================
   * 文件仓库（原有）
   * ============================================================ */
  function fileRowHtml(f) {
    var name = f.key.split("/").pop() || f.key;
    return '<div class="admin-file-row">' +
      '<span class="fname">' + esc(name) + "</span>" +
      '<a class="btn btn-ghost btn-sm fa" href="/api/admin/files?key=' + encodeURIComponent(f.key) + '">下载</a>' +
      '<button class="btn btn-ghost btn-sm" data-key="' + esc(f.key) + '" data-op="fdel" type="button">删除</button>' +
      '<span class="fmeta">' + esc(fmtSize(f.size)) + " · " + esc(fmtTime(f.uploaded)) + "</span>" +
    "</div>";
  }

  function loadFiles() {
    var box = $("#adminFileList");
    if (!box) return;
    box.innerHTML = '<p class="admin-empty">加载中…</p>';
    fetch("/api/admin/files")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "加载失败");
        if (!d.files.length) { box.innerHTML = '<p class="admin-empty">还没有文件，上传一个试试</p>'; return; }
        box.innerHTML = d.files.map(fileRowHtml).join("");
        $$("[data-op='fdel']", box).forEach(function (btn) {
          btn.addEventListener("click", function () {
            var key = btn.getAttribute("data-key");
            if (!confirm("确定删除文件：" + key + "？")) return;
            fetch("/api/admin/files?key=" + encodeURIComponent(key), { method: "DELETE" })
              .then(function (r) { return r.json(); })
              .then(function (d2) { if (!d2.ok) throw new Error(d2.error); loadFiles(); })
              .catch(function (err) { alert("删除失败：" + err.message); });
          });
        });
      })
      .catch(function (err) {
        box.innerHTML = '<p class="admin-empty">加载失败：' + esc(err.message) + "</p>";
      });
  }

  $("#uploadForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("#uploadFile");
    var status = $("#uploadStatus");
    if (!input.files || !input.files.length) {
      status.className = "admin-hint err";
      status.textContent = "请先选择文件";
      return;
    }
    var fd = new FormData();
    fd.append("file", input.files[0]);
    $("#uploadBtn").disabled = true;
    status.className = "admin-hint";
    status.textContent = "上传中…";
    fetch("/api/admin/files", { method: "POST", body: fd })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || "上传失败");
        status.textContent = "✅ 已上传：" + d.name;
        input.value = "";
        loadFiles();
      })
      .catch(function (err) {
        status.className = "admin-hint err";
        status.textContent = "❌ " + err.message;
      })
      .then(function () { $("#uploadBtn").disabled = false; });
  });
})();

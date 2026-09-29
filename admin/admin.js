/* ============================================================
 * 管理控制台逻辑：登录 / 反馈管理 / 文件仓库
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
    fetch("/api/admin/logout", { method: "POST" }).finally(function () {
      showLogin();
    });
  });

  /* ---------- 反馈管理 ---------- */
  function fbItemHtml(it) {
    var opts = STATUS_OPTIONS.map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === it.status ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
    return '<article class="admin-fb" data-id="' + esc(it.id) + '">' +
      '<div class="admin-fb-head">' +
        "<b>#" + esc(it.id) + "</b>" +
        "<span>" + esc(it.project) + "</span>" +
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

  function flash(el, msg, isErr) {
    var node = $(".admin-flash", el);
    if (!node) {
      node = document.createElement("span");
      node.className = "admin-flash";
      el.appendChild(node);
    }
    node.textContent = msg;
    node.className = "admin-flash" + (isErr ? " err" : "");
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

  /* ---------- 文件仓库 ---------- */
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

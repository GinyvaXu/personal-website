/* ============================================================
 * 全站公告条（由 functions/_middleware.js 注入到每个 HTML 页）
 * 数据：/api/site-config（KV 实时，60 秒缓存）
 * 关闭：sessionStorage 记住（同一标签页会话内不重复出现）
 * ============================================================ */
(function () {
  "use strict";

  function buildStyles() {
    var st = document.createElement("style");
    st.textContent =
      "body.gy-has-ann{padding-top:var(--gy-ann-h,42px)}" +
      "body.gy-has-ann .nav,body.gy-has-ann .site-header{top:var(--gy-ann-h,42px)!important}";
    document.head.appendChild(st);
  }

  fetch("/api/site-config")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.ok || !d.announce || !d.announce.text) return;
      var a = d.announce;
      var key = "gy-ann-" + a.text.slice(0, 60);
      try { if (sessionStorage.getItem(key) === "1") return; } catch (e) {}

      var colors = {
        info: ["#4f46e5", "#7c3aed"],
        promo: ["#0ea5e9", "#6366f1"],
        warn: ["#d97706", "#dc2626"],
      };
      var c = colors[a.type] || colors.info;

      var bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;" +
        "justify-content:center;gap:10px;padding:9px 46px 9px 16px;font-size:13.5px;line-height:1.5;" +
        "color:#fff;background:linear-gradient(90deg," + c[0] + "," + c[1] + ");" +
        "box-shadow:0 4px 18px rgba(0,0,0,.18);" +
        "font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif";

      var txt = document.createElement("span");
      txt.textContent = a.text;
      bar.appendChild(txt);

      if (a.link) {
        var link = document.createElement("a");
        link.href = a.link;
        link.textContent = "查看 →";
        link.style.cssText = "color:#fff;font-weight:700;text-decoration:underline;white-space:nowrap";
        bar.appendChild(link);
      }

      var x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", "关闭公告");
      x.textContent = "×";
      x.style.cssText =
        "position:absolute;right:10px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.2);" +
        "border:0;color:#fff;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:16px;line-height:1";
      x.addEventListener("click", function () {
        try { sessionStorage.setItem(key, "1"); } catch (e) {}
        bar.remove();
        document.body.classList.remove("gy-has-ann");
        document.documentElement.style.removeProperty("--gy-ann-h");
      });
      bar.appendChild(x);

      buildStyles();
      document.body.classList.add("gy-has-ann");
      document.body.insertBefore(bar, document.body.firstChild);

      var h = bar.offsetHeight || 42;
      document.documentElement.style.setProperty("--gy-ann-h", h + "px");
    })
    .catch(function () {});
})();

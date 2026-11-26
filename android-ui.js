/* ODDZA — small glue for the app-style layout: package lock icons, plan selection -> Continue, notification dot. */
(function () {
  "use strict";
  // Free tips now live on the home screen itself: any request for the old Free page opens home in Free mode.
  var _ss = window.showSection;
  if (typeof _ss === "function") window.showSection = function (t) {
    if (t === "free") { if (window.setHomeMode) window.setHomeMode("free"); return _ss.call(this, "home"); }
    return _ss.apply(this, arguments);
  };
  var TIERS = ["elite", "single", "overunder", "full"];

  // Lock / open state of the package cards on the VIP list, plus the ACTIVE pill and expiry line.
  function tr(k, fb) { try { var v = window.__t && window.__t(k); return v && v !== k ? v : fb; } catch (e) { return fb; } }
  function syncCards() {
    var has = window.__tierHasAccess;
    if (typeof has !== "function") return;
    TIERS.forEach(function (tier) {
      var card = document.querySelector('.pk-card[data-pk="' + tier + '"]');
      if (!card) return;
      var open = !!has(tier);
      if (card.classList.contains("is-open") !== open) card.classList.toggle("is-open", open);
      var box = card.querySelector(".pk-t"), badge = card.querySelector(".pk-badge"), until = card.querySelector(".pk-until");
      if (!open) { if (badge) badge.remove(); if (until) until.remove(); return; }
      if (!badge) { badge = document.createElement("span"); badge.className = "pk-badge"; card.appendChild(badge); }
      var bt = tr("pk_active", "ACTIVE"); if (badge.textContent !== bt) badge.textContent = bt;
      var d = typeof window.__tierUntil === "function" ? window.__tierUntil(tier) : "";
      if (!until && box) { until = document.createElement("span"); until.className = "pk-until"; box.appendChild(until); }
      if (until) { var ut = d ? tr("pk_until", "Active until") + " " + d : ""; if (until.textContent !== ut) until.textContent = ut; until.hidden = !d; }
    });
  }

  // Continue is only enabled once a plan is chosen.
  function syncPay() {
    document.querySelectorAll("#vipSection .vp").forEach(function (box) {
      var btn = box.querySelector(".vp-pay");
      if (!btn) return;
      var sel = box.querySelector(".plan-card.selected"), chosen = !!sel;
      if (btn.disabled === chosen) btn.disabled = !chosen;
      var amt = btn.querySelector(".vp-pay-amt");
      if (chosen) {
        if (!amt) { amt = document.createElement("span"); amt.className = "vp-pay-amt"; btn.appendChild(amt); }
        var tx = " \u00B7 TZS " + (sel.getAttribute("data-price") || "");
        if (amt.textContent !== tx) amt.textContent = tx;
      } else if (amt) amt.remove();
    });
  }
  window.addEventListener("vip-plan-changed", syncPay);

  // Small dot on the account icon when there are unread notifications (the bell lives inside the account page).
  function syncDot() {
    var c = document.getElementById("notifCount"), b = document.getElementById("accountBtn");
    if (!c || !b) return;
    b.classList.toggle("has-notif", !c.classList.contains("hidden") && (c.textContent || "0").trim() !== "0");
  }
  var nc = document.getElementById("notifCount");
  if (nc && window.MutationObserver) new MutationObserver(syncDot).observe(nc, { attributes: true, childList: true, characterData: true, subtree: true });

  window.addEventListener("vip-status-changed", function () { syncCards(); syncPay(); });
  setInterval(function () { if (!document.hidden) { syncCards(); syncDot(); } }, 4000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { syncCards(); syncPay(); syncDot(); } });
  syncCards(); syncPay(); syncDot();
})();

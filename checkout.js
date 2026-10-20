// ODDZA checkout: choose package -> hosted payment page -> server-verified activation.
// Nothing here grants VIP. The browser only (1) sends the buyer to the payment page and (2) asks the server whether
// the payment was verified. Access is issued by the backend after it verifies the payment; this file then
// redeems the server-issued entitlement for the signed-in user.
import { getApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const API = "https://pxsayqtnrrqwwtivxqdo.supabase.co/functions/v1";   // <- your Supabase project URL
const PAGE = "https://snippe.me/pay/";
const SLUG = { elite: "oddza-elite-", single: "oddza-single-", overunder: "oddza-ou-", full: "oddza-full-" };
const SUF = { "1day": "1d", "1week": "1w", "2weeks": "2w", "1month": "1m", "3months": "3m" };
const TIERS = { elite: "Elite VIP", single: "Single VIP", overunder: "Over-Under VIP", full: "Full Package" };
const PENDING = "oddza_pending";
const FRESH_MS = 20 * 60e3;   // a payment started this recently is treated as "in progress"
const KEEP_MS = 24 * 3600e3;  // how long we keep reconciling a started payment
const WATCH_MS = 45e3;        // how long one verification session polls before offering "check again"

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = (tier, plan) => tier === "single" && plan === "2weeks" ? "oddza-single-vip-2" : SLUG[tier] + SUF[plan];
const auth = () => getAuth(getApp());
const token = async () => { const u = auth().currentUser; if (!u) throw new Error("no-user"); return u.getIdToken(); };
const store = {
  get() { try { return JSON.parse(localStorage.getItem(PENDING) || "null"); } catch { return null; } },
  set(v) { try { localStorage.setItem(PENDING, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(PENDING); } catch {} }
};
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};
let S = null, run = 0, activating = false;

/* ---------- plan helpers ---------- */
function selectedPlan(tier) {
  const box = $(tier === "elite" ? "authBox" : "authBox_" + tier);
  const el = box && box.querySelector(".plan-card.selected");
  if (!el) return null;
  const dur = el.querySelector(".vp-dur");
  const name = el.querySelector(".vp-name");
  return {
    plan: el.dataset.plan.replace(/^(single|overunder|full)-/, ""),
    label: el.dataset.label, price: el.dataset.price,
    name: name ? name.textContent.trim() : (el.dataset.label.split("·")[1] || "").trim(),
    dur: dur ? dur.textContent.trim() : ""
  };
}
// Keep the "Pay TZS …" label on each package card in step with the selected plan.
function syncPayLabels() {
  document.querySelectorAll("#vipSection .vp").forEach(box => {
    const sel = box.querySelector(".plan-card.selected"), lab = box.querySelector(".vp-pay-label");
    if (sel && lab) lab.textContent = "Pay TZS " + sel.dataset.price;
  });
}
// Under each plan: price per day and how much cheaper it is than the shortest plan.
function decoratePlans() {
  const DAYS = { "1day": 1, "1week": 7, "2weeks": 14, "1month": 30, "3months": 90 };
  document.querySelectorAll("#vipSection .vp-plans").forEach(group => {
    const rows = [...group.querySelectorAll(".plan-card")].map(card => {
      const plan = String(card.dataset.plan || "").replace(/^(single|overunder|full)-/, "");
      const price = parseInt(String(card.dataset.price).replace(/\D/g, ""), 10);
      return { card, perDay: DAYS[plan] && price ? price / DAYS[plan] : 0 };
    });
    const base = Math.max(0, ...rows.map(r => r.perDay));   // savings are measured against the priciest per-day plan (the shortest one)
    rows.forEach(({ card, perDay }) => {
      const info = card.querySelector(".vp-info"), end = card.querySelector(".vp-end"), dur = card.querySelector(".vp-dur");
      if (!info || !end || !dur || !perDay || info.querySelector(".vp-perday")) return;
      const pct = base ? Math.round((1 - perDay / base) * 100) : 0;
      const meta = document.createElement("span");
      meta.className = "vp-meta";
      info.insertBefore(meta, dur);
      meta.appendChild(dur);
      const per = document.createElement("span");
      per.className = "vp-perday";
      per.textContent = "TZS " + Math.round(perDay).toLocaleString("en-US") + "/day";
      meta.appendChild(per);
      if (pct >= 5) {
        const save = document.createElement("span");
        save.className = "vp-save";
        save.textContent = "Save " + pct + "%";
        end.appendChild(save);
      }
    });
  });
}
window.addEventListener("vip-plan-changed", syncPayLabels);
document.addEventListener("keydown", e => {
  const card = e.target && e.target.closest && e.target.closest("#vipSection .plan-card");
  if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); card.click(); }
  if (e.key === "Escape" && $("ckBack") && $("ckBack").classList.contains("open")) closeCheckout();
});
syncPayLabels();
decoratePlans();

/* ---------- sheet shell ---------- */
function shell() {
  let el = $("ckBack");
  if (el) return el;
  el = document.createElement("div"); el.id = "ckBack"; el.className = "ck-back";
  el.innerHTML = '<div class="ck-sheet" role="dialog" aria-modal="true" aria-label="Checkout" aria-live="polite"></div>';
  el.addEventListener("click", e => { if (e.target === el) closeCheckout(); });
  document.body.appendChild(el); return el;
}
const sheet = () => shell().querySelector(".ck-sheet");
const show = html => { sheet().innerHTML = html; shell().classList.add("open"); };
const head = title => `<div class="ck-head"><div class="ck-title">${esc(title)}</div><button class="ck-x" aria-label="Close" onclick="closeCheckout()">×</button></div>`;
const support = () => { const m = window.ODDZA_SUPPORT_EMAIL; return m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : "support"; };
const methods = () => { const m = document.querySelector("#vipSection .vp-methods"); return m ? `<div class="ck-methods">${m.innerHTML}</div>` : ""; };

/* ---------- screens ---------- */
function renderForm(err) {
  const p = S.plan;
  show(`${head("Review and pay")}
    <div class="ck-sum">
      <div class="ck-sum-row"><span>Package</span><b>${esc(TIERS[S.tier])}</b></div>
      <div class="ck-sum-row"><span>Duration</span><b>${esc(p.name)}${p.dur ? " · " + esc(p.dur) : ""}</b></div>
      <div class="ck-sum-row ck-sum-total"><span>Total</span><b>TZS ${esc(p.price)}</b></div>
    </div>
    <ol class="ck-steps">
      <li><i>1</i><span>You are taken to a secure payment page.</span></li>
      <li><i>2</i><span>Choose a payment method and complete the payment.</span></li>
      <li><i>3</i><span>Your VIP activates automatically once the payment is confirmed.</span></li>
    </ol>
    ${methods()}
    <div class="ck-err" role="alert">${esc(err || "")}</div>
    <button class="ck-pay" id="ckPay">Pay TZS ${esc(p.price)}</button>`);
  $("ckPay").onclick = go;
}
function renderSignIn() {
  show(`${head("Sign in to continue")}<div class="ck-state"><div class="ck-ico ck-wait">${ICON.clock}</div>
    <h3>Log in first</h3><p>Your VIP is linked to your ODDZA account, so please log in or sign up before paying.</p>
    <button class="ck-pay" id="ckLogin">Log in or sign up</button></div>`);
  $("ckLogin").onclick = () => { closeCheckout(); if (window.openAuthModal) window.openAuthModal(); };
}
function renderPendingChoice(p) {
  const mins = Math.max(1, Math.round((Date.now() - p.at) / 60000));
  show(`${head("Payment already started")}<div class="ck-state"><div class="ck-ico ck-wait">${ICON.clock}</div>
    <h3>You have a payment in progress</h3>
    <p>You started a ${esc(TIERS[p.tier] || "VIP")} payment ${mins} min ago. If you already paid, check its status instead of paying again.</p>
    <button class="ck-pay" id="ckStatus">Check payment status</button>
    <button class="ck-ghost" id="ckNew">Start a new payment</button></div>`);
  $("ckStatus").onclick = () => watch(true);
  $("ckNew").onclick = () => { store.clear(); launch(); };
}
function renderRedirect() {
  show(`${head("Secure payment")}<div class="ck-state"><div class="ck-spin"></div>
    <h3>Opening secure payment</h3><p>Taking you to the secure payment page. Complete the payment there, then return to ODDZA.</p></div>`);
}
function renderVerifying(p) {
  show(`${head("Verifying payment")}<div class="ck-state"><div class="ck-spin"></div>
    <h3>Verifying your payment</h3>
    <p>We are waiting for confirmation from the payment provider. This usually takes a few seconds and updates by itself. Your VIP stays locked until the payment is confirmed.</p>
    <div class="ck-timer" id="ckTimer" aria-hidden="true">0:00</div>
    <button class="ck-ghost" onclick="closeCheckout()">Close and keep verifying in the background</button></div>`);
  const t0 = p ? p.at : Date.now(), el = $("ckTimer"), my = run;
  const tick = () => { if (my !== run || !el.isConnected) return; const s = Math.max(0, Math.floor((Date.now() - t0) / 1000)); el.textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); setTimeout(tick, 1000); };
  tick();
}
function renderActivating() {
  show(`${head("Payment confirmed")}<div class="ck-state"><div class="ck-spin"></div><h3>Activating your VIP</h3><p>Payment confirmed. Unlocking your access…</p></div>`);
}
function renderDone(tier) {
  show(`${head("Payment confirmed")}<div class="ck-state"><div class="ck-ico ck-ok">${ICON.check}</div>
    <h3>VIP activated</h3><p>Your ${esc(TIERS[tier] || "VIP")} is now active. Thank you for subscribing.</p>
    <button class="ck-pay" onclick="closeCheckout()">View my tips</button></div>`);
}
function renderTerminal(kind, p) {
  const cancelled = kind === "cancelled";
  show(`${head(cancelled ? "Payment cancelled" : "Payment failed")}<div class="ck-state"><div class="ck-ico ck-bad">${ICON.cross}</div>
    <h3>${cancelled ? "Payment cancelled" : "Payment not completed"}</h3>
    <p>${cancelled ? "The payment was cancelled and you have not been charged." : "The payment did not go through. If money was deducted it is normally returned automatically; otherwise contact " + support() + " with your payment confirmation message."}</p>
    <button class="ck-pay" id="ckAgain">Try again</button><button class="ck-ghost" onclick="closeCheckout()">Close</button></div>`);
  $("ckAgain").onclick = () => { const tier = (p && p.tier) || (S && S.tier); const plan = tier && selectedPlan(tier); if (!plan) return closeCheckout(); S = { tier, plan }; renderForm(); };
}
function renderLate() {
  show(`${head("Still confirming")}<div class="ck-state"><div class="ck-ico ck-wait">${ICON.clock}</div>
    <h3>Still waiting for confirmation</h3>
    <p>If you completed the payment, your VIP activates automatically as soon as it is confirmed. You do not need to pay again, and you can safely close this screen. Need help? Contact ${support()}.</p>
    <button class="ck-pay" id="ckRecheck">Check again</button><button class="ck-ghost" onclick="closeCheckout()">Close</button></div>`);
  $("ckRecheck").onclick = () => { const p = store.get(); if (p) { p.at = Date.now(); store.set(p); } watch(true); };
}
function renderActivationIssue(tier) {
  show(`${head("Almost there")}<div class="ck-state"><div class="ck-ico ck-wait">${ICON.clock}</div>
    <h3>Payment confirmed, activation pending</h3>
    <p>Your payment was confirmed but we could not finish unlocking ${esc(TIERS[tier] || "your VIP")} on this device. Check your connection and try again. If it keeps failing, contact ${support()}.</p>
    <button class="ck-pay" id="ckRetry">Try again</button><button class="ck-ghost" onclick="closeCheckout()">Close</button></div>`);
  $("ckRetry").onclick = () => watch(true);
}

/* ---------- start a payment ---------- */
function go() {
  const u = auth().currentUser;
  if (!u) return renderSignIn();
  const p = store.get();
  if (p && p.tier === S.tier && Date.now() - p.at < FRESH_MS) return renderPendingChoice(p);   // avoid double charges
  launch();
}
function launch() {
  const u = auth().currentUser;
  if (!u) return renderSignIn();
  const btn = $("ckPay"); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ck-btn-spin"></span><span>Preparing secure payment…</span>'; }
  // The payment link fixes the amount. `meta` is only a hint for reconciliation: the server must derive
  // package, amount and duration from the verified payment itself, never from this value.
  const meta = btoa(JSON.stringify({ uid: u.uid, tier: S.tier, plan: S.plan.plan }));
  store.set({ tier: S.tier, plan: S.plan.plan, price: S.plan.price, since: Date.now() - 60000, at: Date.now() });
  renderRedirect();
  setTimeout(() => { location.href = `${PAGE}${slug(S.tier, S.plan.plan)}?meta=${encodeURIComponent(meta)}`; }, 450);
}

/* ---------- verification (server is the only source of truth) ---------- */
async function check(p) {
  const r = await fetch(`${API}/payment-status?since=${p.since}`, { headers: { Authorization: "Bearer " + await token() } });
  if (!r.ok) throw new Error("status-" + r.status);
  const d = await r.json(), s = String(d.status || "").toLowerCase();
  if (s === "paid" && d.code) return { kind: "paid", d };
  if (s === "cancelled" || s === "canceled") return { kind: "cancelled" };
  if (s === "failed" || s === "declined" || s === "expired") return { kind: "failed" };
  return { kind: "pending" };
}
async function activate(tier, code) {
  if (activating) return; activating = true;
  try {
    renderActivating();
    const res = tier === "elite" ? await window.unlockVipCode(code) : await window.unlockExtraVipCode(tier, code);
    if (res && res.ok) { store.clear(); renderDone(tier); } else renderActivationIssue(tier);
  } catch { renderActivationIssue(tier); } finally { activating = false; }
}
const sheetOpen = () => { const b = $("ckBack"); return !!b && b.classList.contains("open"); };
// forceUi=true: the person asked ("Check again" etc.). Otherwise the sheet opens by itself only ONCE per payment;
// every later return to the app is a silent check that only speaks up when the payment is confirmed.
async function watch(forceUi) {
  const p = store.get();
  if (!p || Date.now() - p.at > KEEP_MS) { store.clear(); return; }
  const my = ++run, fresh = Date.now() - p.at < FRESH_MS;
  try { await auth().authStateReady?.(); } catch {}
  if (my !== run) return;
  if (!auth().currentUser) return;                         // signed out: nothing to verify, stay quiet
  const ui = forceUi === true || (fresh && !p.seen) || sheetOpen();
  if (ui) { if (!p.seen) { p.seen = true; store.set(p); } renderVerifying(p); }
  const t0 = Date.now();
  let late = false;
  const tick = async () => {
    if (my !== run) return;
    try {
      const res = await check(p);
      if (my !== run) return;
      if (res.kind === "paid") return activate(res.d.tier || p.tier, res.d.code);
      if (res.kind === "cancelled" || res.kind === "failed") { store.clear(); if (sheetOpen()) renderTerminal(res.kind, p); return; }
    } catch { /* offline or signed out: try again on the next tick */ }
    if (!fresh) return;                                    // old payment: one quiet check
    if (Date.now() - p.at > FRESH_MS) return;              // stop after 20 minutes
    if (!late && Date.now() - t0 > WATCH_MS) { late = true; if (sheetOpen()) renderLate(); }
    setTimeout(tick, late ? 10000 : 3000);                 // after the "still waiting" notice, keep checking quietly
  };
  tick();
}

window.openCheckout = function (tier) {
  const plan = selectedPlan(tier); if (!plan) return;
  run++; S = { tier, plan }; renderForm();
};
window.closeCheckout = function () { shell().classList.remove("open"); };   // keeps verifying in the background
window.ckCheck = () => watch(true);

// Coming back from the payment page (tab switch, back button, or a fresh page load): reconcile with the server.
const resume = () => { if (store.get() && !activating) setTimeout(watch, 600); };
document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });
window.addEventListener("pageshow", e => { if (e.persisted) resume(); });
resume();

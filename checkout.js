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
const TIERS = { elite: "Elite VIP", single: "Single VIP", overunder: "Daily 10+ Odds", full: "Full Package" };
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
const PREF = "oddza_pay_pref";
const NETS = [
  { id: "tigo",    name: "Mixx by Yas",  chip: "mixx",      bg: "#f9dc0a", fg: "#1b2b8f" },
  { id: "vodacom", name: "M-Pesa",       chip: "M-PESA",    bg: "#e60000", fg: "#ffffff" },
  { id: "airtel",  name: "Airtel Money", chip: "airtel",    bg: "#e11b22", fg: "#ffffff" },
  { id: "halotel", name: "HaloPesa",     chip: "halopesa",  bg: "#f47920", fg: "#ffffff" }
];
const netOf = id => NETS.find(n => n.id === id) || NETS[0];
const digits9 = v => { let d = String(v || "").replace(/\D/g, ""); if (d.startsWith("255")) d = d.slice(3); else if (d.startsWith("0")) d = d.slice(1); return d.slice(0, 9); };
const fmt9 = d => (d.match(/\d{1,3}/g) || []).join(" ");
const validPhone = d => /^[67]\d{8}$/.test(d || "");
const prefs = {
  get() { try { return JSON.parse(localStorage.getItem(PREF) || "null") || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(PREF, JSON.stringify(v)); } catch {} }
};
// Remove any phone number saved by earlier versions.
(() => { const p = prefs.get(); if (p && "phone" in p) { delete p.phone; prefs.set(p); } })();
let S = null, run = 0, activating = false;
// Phone/browser Back button support: while the checkout sheet is open it owns exactly ONE history entry.
// Back steps through the sheet (number -> network -> review) and then closes it, returning to the page underneath.
let hasEntry = false, swallow = false, CUR = "", ckN = 0;   // ckN = how many sheet entries are on the browser history stack (one per step)

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
// The pay button always reads "Continue to payment"; the price is shown on the next screen.
function syncPayLabels() {
  document.querySelectorAll("#vipSection .vp-pay-label").forEach(lab => { lab.textContent = "Continue to payment"; });
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
});
syncPayLabels();
decoratePlans();

/* ---------- sheet shell ---------- */
function shell() {
  let el = $("ckBack");
  if (el) return el;
  el = document.createElement("div"); el.id = "ckBack"; el.className = "ck-back";
  el.innerHTML = '<div class="ck-sheet" role="dialog" aria-modal="true" aria-label="Checkout" aria-live="polite"></div>';
  document.body.appendChild(el); return el;
}
const sheet = () => shell().querySelector(".ck-sheet");
let DIR = "fwd";   // "fwd" slides in from the right, "back" from the left, "none" swaps without motion (errors, in-place updates)
const show = html => {
  const b = shell(), wasOpen = b.classList.contains("open"), dir = wasOpen ? DIR : "none";
  DIR = "fwd";
  sheet().innerHTML = `<div class="ck-step" data-dir="${dir}">${html}</div>`;
  CUR = "";   // step screens set this right after show()
  if (!wasOpen) {
    b.classList.add("open"); document.documentElement.style.overflow = "hidden";
    if (!hasEntry) { try { history.pushState({ v: "ck", n: 1 }, ""); hasEntry = true; ckN = 1; } catch {} }
  }
  if (dir !== "none") b.scrollTop = 0;
};
const goBack = fn => { DIR = "back"; fn(); };
// Every forward step (Review -> Network -> Number) gets its own history entry, pushed from the user's tap, so the phone Back
// button walks back one step at a time and only leaves the sheet from the first screen.
const pushTo = n => { if (hasEntry && ckN < n) { try { history.pushState({ v: "ck", n }, ""); ckN = n; } catch {} } };
const hideSheet = () => { const b = $("ckBack"); if (b) b.classList.remove("open"); document.documentElement.style.overflow = ""; };
// In-app Back button: go through the browser history so the in-app and phone Back buttons behave the same.
const stepBack = fn => hasEntry ? history.back() : goBack(fn);
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
// No "x": the page has a back button only on safe screens; processing screens have none (nobody leaves by accident).
const head = title => `<div class="ck-head"><button class="ck-bk" type="button" onclick="closeCheckout()">${BACK}<span>Back</span></button><div class="ck-title">${esc(title)}</div></div>`;
const headB = (title, backLabel) => `<div class="ck-head"><button class="ck-bk" id="ckBk" type="button">${BACK}<span>${esc(backLabel)}</span></button><div class="ck-title">${esc(title)}</div></div>`;
const headL = title => `<div class="ck-head"><div class="ck-title">${esc(title)}</div></div>`;
const support = () => { const m = window.ODDZA_SUPPORT_EMAIL; return m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : "support"; };
const methods = () => { const m = document.querySelector("#vipSection .vp-methods"); return m ? `<div class="ck-methods">${m.innerHTML}</div>` : ""; };

/* ---------- screens ---------- */
function renderForm(err) {
  if (err) DIR = "none";
  const p = S.plan, ussd = S.method !== "page";
  show(`${head("Review and pay")}
    <div class="ck-sum">
      <div class="ck-sum-row"><span>Package</span><b>${esc(TIERS[S.tier])}</b></div>
      <div class="ck-sum-row"><span>Duration</span><b>${esc(p.name)}${p.dur ? " · " + esc(p.dur) : ""}</b></div>
      <div class="ck-sum-row ck-sum-total"><span>Total</span><b>TZS ${esc(p.price)}</b></div>
    </div>
    <div class="ck-lab">Choose Your Payment Method</div>
    <div class="ck-opts" role="radiogroup" aria-label="Payment method">
      <button type="button" class="ck-opt${ussd ? " on" : ""}" role="radio" aria-checked="${ussd}" data-m="ussd">
        <span class="ck-radio"></span>
        <span class="ck-opt-t"><b>Mobile Money Prompt</b><small>Receive a USSD push on your phone and approve it with your PIN.</small></span>
        <span class="ck-badge">Recommended</span>
      </button>
      <button type="button" class="ck-opt${ussd ? "" : " on"}" role="radio" aria-checked="${!ussd}" data-m="page">
        <span class="ck-radio"></span>
        <span class="ck-opt-t"><b>Other Payment Methods</b><small>Pay on our secure payment page with Mobile Money or a debit/credit card.</small></span>
      </button>
    </div>
    <div class="ck-more${ussd ? "" : " open"}" id="ckMore"><div>${methods()}</div></div>
    <div class="ck-err" role="alert">${esc(err || "")}</div>
    <button class="ck-pay" id="ckPay">Continue</button>`);
  document.querySelectorAll(".ck-opt").forEach(b => b.onclick = () => {
    S.method = b.dataset.m;
    document.querySelectorAll(".ck-opt").forEach(o => { const on = o === b; o.classList.toggle("on", on); o.setAttribute("aria-checked", on); });
    $("ckMore").classList.toggle("open", S.method === "page");
  });
  $("ckPay").onclick = go;
  CUR = "form";
}
// Step 2 (mobile money prompt): which network?
function renderNetwork() {
  pushTo(2);
  const pr = prefs.get();
  if (!S.network) S.network = pr.network || "tigo";
  const n = netOf(S.network);
  show(`${headB("Select network", "Back")}
    <div class="ck-nets" role="radiogroup" aria-label="Mobile network">
      ${NETS.map(x => `<button type="button" class="ck-net${x.id === S.network ? " on" : ""}" role="radio" aria-checked="${x.id === S.network}" data-n="${x.id}">
        <span class="ck-radio"></span><span class="ck-net-name">${esc(x.name)}</span>
        <span class="ck-chip" style="background:${x.bg};color:${x.fg}">${esc(x.chip)}</span></button>`).join("")}
    </div>
    <button class="ck-pay" id="ckPay">Continue with ${esc(n.name)}</button>`);
  CUR = "net";
  $("ckBk").onclick = () => stepBack(renderForm);
  document.querySelectorAll(".ck-net").forEach(b => b.onclick = () => {
    S.network = b.dataset.n;
    document.querySelectorAll(".ck-net").forEach(o => { const on = o === b; o.classList.toggle("on", on); o.setAttribute("aria-checked", on); });
    $("ckPay").textContent = "Continue with " + netOf(S.network).name;
  });
  $("ckPay").onclick = () => renderNumber();
}
// Step 3 (mobile money prompt): phone number, then Pay now.
function renderNumber(err) {
  pushTo(3);
  if (err) DIR = "none";
  const n = netOf(S.network);
  if (S.phone == null) S.phone = "";   // never pre-filled: the user types their own number each time
  const p = S.plan;
  show(`${headB("Mobile number", "Network")}
    <p class="ck-ask">Enter your <b>${esc(n.name)}</b> number to get a payment request on your phone.</p>
    <label class="ck-phone" for="ckPhone"><span class="ck-cc">+255</span>
      <input class="ck-in" id="ckPhone" name="ck_msisdn" type="tel" inputmode="numeric" enterkeyhint="go" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="7XX XXX XXX" value="${esc(fmt9(S.phone))}"></label>
    <div class="ck-sum-mini"><span>${esc(TIERS[S.tier])} · ${esc(p.name)}</span><b>TZS ${esc(p.price)}</b></div>
    <div class="ck-err" role="alert">${esc(err || "")}</div>
    <button class="ck-pay" id="ckPay"${validPhone(S.phone) ? "" : " disabled"}>Pay now</button>`);
  CUR = "num";
  $("ckBk").onclick = () => stepBack(renderNetwork);
  const inp = $("ckPhone");
  inp.oninput = () => { S.phone = digits9(inp.value); inp.value = fmt9(S.phone); $("ckPay").disabled = !validPhone(S.phone); const e = document.querySelector(".ck-err"); if (e) e.textContent = ""; };
  inp.onkeydown = e => { if (e.key === "Enter" && validPhone(S.phone)) { e.preventDefault(); inp.blur(); launchUssd(); } };
  $("ckPay").onclick = launchUssd;
  if (!err || !validPhone(S.phone)) setTimeout(() => inp.focus(), 60);
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
  $("ckNew").onclick = () => { store.clear(); start(); };
}
function renderRedirect() {
  show(`${headL("Secure payment")}<div class="ck-state"><div class="ck-spin"></div>
    <h3>Opening secure payment</h3><p>Taking you to the secure payment page. Complete the payment there, then return to ODDZA.</p></div>`);
}
function renderVerifying(p) {
  const ussd = p && p.via === "ussd";
  show(`${headL(ussd ? "Approve on your phone" : "Verifying payment")}<div class="ck-state"><div class="ck-spin"></div>
    <h3>${ussd ? "Processing payment…" : "Verifying your payment"}</h3>
    <span class="ck-warn">Please stay on this screen. Your VIP opens automatically once the payment is confirmed.</span>
    <p>${ussd ? "A payment request was sent to your phone. Enter your mobile money PIN to approve it. Your VIP activates automatically once the payment is confirmed." : "We are waiting for confirmation from the payment provider. This usually takes a few seconds and updates by itself. Your VIP stays locked until the payment is confirmed."}</p>
    <div class="ck-timer" id="ckTimer" aria-hidden="true">0:00</div>
    <button class="ck-ghost" onclick="closeCheckout()">Leave this screen (payment keeps verifying in the background)</button></div>`);
  const t0 = p ? p.at : Date.now(), el = $("ckTimer"), my = run;
  const tick = () => { if (my !== run || !el.isConnected) return; const s = Math.max(0, Math.floor((Date.now() - t0) / 1000)); el.textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); setTimeout(tick, 1000); };
  tick();
}
function renderActivating() {
  show(`${headL("Payment confirmed")}<div class="ck-state"><div class="ck-spin"></div><h3>Activating your VIP</h3><p>Payment confirmed. Unlocking your access…</p></div>`);
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
  $("ckAgain").onclick = () => { const tier = (p && p.tier) || (S && S.tier); const plan = tier && selectedPlan(tier); if (!plan) return closeCheckout(); S = { tier, plan, method: "ussd" }; renderForm(); };
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
  start();
}
const start = () => (S.method === "page" ? launch() : renderNetwork());
// Mobile money prompt (USSD push): the server starts the payment; the phone shows the approval prompt.
async function launchUssd() {
  const u = auth().currentUser;
  if (!u) return renderSignIn();
  if (!validPhone(S.phone)) return renderNumber("Enter a valid mobile number, e.g. 743 546 913.");
  const btn = $("ckPay"); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ck-btn-spin"></span><span>Sending request to your phone…</span>'; }
  const at = Date.now();
  try {
    const r = await fetch(`${API}/settlo-pay-create`, {
      method: "POST",
      headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" },
      body: JSON.stringify({ tier: S.tier, plan: S.plan.plan, phone: "+255" + S.phone, network: S.network })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return renderNumber(d.message || "Could not start the payment. Please try again.");
    prefs.set({ network: S.network });
    store.set({ tier: S.tier, plan: S.plan.plan, price: S.plan.price, since: at - 60000, at, via: "ussd" });
    watch(true);
  } catch { renderNumber("Network problem. Check your connection and try again."); }
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
  run++; S = { tier, plan, method: "ussd" }; renderForm();
};
window.closeCheckout = function () {
  hideSheet();
  if (hasEntry) { const n = ckN; hasEntry = false; ckN = 0; if (n > 0) { swallow = true; setTimeout(() => { swallow = false; }, 600); history.go(-n); } }   // drop every history entry the sheet added
};   // keeps verifying in the background
window.ckCheck = () => watch(true);

// Phone/browser Back while the sheet is open. Runs before the app's own popstate handler and stops it,
// so the page underneath keeps its current view.
window.addEventListener("popstate", e => {
  if (swallow) { swallow = false; e.stopImmediatePropagation(); return; }          // our own history.go() from closeCheckout
  if (hasEntry) {
    e.stopImmediatePropagation();
    const n = e.state && e.state.v === "ck" ? (e.state.n || 1) : 0;
    ckN = n;
    if (!sheetOpen()) { hasEntry = false; ckN = 0; return; }
    if (n >= 1 && (CUR === "net" || CUR === "num")) { goBack(n === 1 ? renderForm : renderNetwork); return; }   // one step back inside the sheet
    // first screen, or a status screen: leave the sheet (and unwind any entries still above the page)
    hasEntry = false; ckN = 0; hideSheet();
    if (n > 0) { swallow = true; setTimeout(() => { swallow = false; }, 600); history.go(-n); }
    return;
  }
  if (e.state && e.state.v === "ck") { e.stopImmediatePropagation(); swallow = true; setTimeout(() => { swallow = false; }, 600); history.back(); }   // Forward onto a stale sheet entry
}, true);

// Coming back from the payment page (tab switch, back button, or a fresh page load): reconcile with the server.
const resume = () => { if (store.get() && !activating) setTimeout(watch, 600); };
document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });
window.addEventListener("pageshow", e => { if (e.persisted) resume(); });
resume();

// ODDZA chat (user side) — Supabase backend, same system as the Android app and the admin panel.
// Login stays on Firebase: the Firebase ID token is used for Supabase (Third-Party Auth).
// First use calls the "chat-claim" Edge Function once so the token carries role=authenticated.
// All permissions are enforced server-side (RLS + RPC); nothing here can grant access by itself.
import { getApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, onAuthStateChanged, onIdTokenChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const SB_HOST = "pxsayqtnrrqwwtivxqdo.supabase.co";
const SB_URL = "https://" + SB_HOST;
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2F5cXRucnJxd3d0aXZ4cWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyOTYyOTEsImV4cCI6MjEwNjg3MjI5MX0.Sp28AfmyMUpCdNjTJpho0Q8k6RNR6toNXd1ntwm-SaU"; // public anon key (safe to ship)
const ADMIN_ONLINE_MS = 70e3;   // admin heartbeat is every 20s

const auth = getAuth(getApp());
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = m => { try { window.showToast && window.showToast(m); } catch {} };

/* ---------------- Supabase REST helpers ---------------- */
function roleOf(tok) {
  try { return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role || ""; } catch { return ""; }
}
async function sbToken(force) {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  let tok = await u.getIdToken(!!force);
  if (roleOf(tok) === "authenticated") return tok;
  const r = await fetch(SB_URL + "/functions/v1/chat-claim", {
    method: "POST",
    headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },   // no apikey: chat-claim CORS allows only these
    body: "{}"
  });
  if (!r.ok) throw new Error("chat-claim failed (" + r.status + ")");
  tok = await u.getIdToken(true);
  if (roleOf(tok) !== "authenticated") throw new Error("Chat is not ready yet, try again");
  return tok;
}
async function sbRest(method, path, body, retried) {
  const tok = await sbToken(!!retried);
  const h = { apikey: SB_KEY, Authorization: "Bearer " + tok };
  if (body != null) h["Content-Type"] = "application/json";
  const r = await fetch(SB_URL + path, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined });
  if (r.status === 401 && !retried) return sbRest(method, path, body, true);
  const txt = await r.text();
  if (!r.ok) {
    let m = txt; try { m = JSON.parse(txt).message || txt; } catch {}
    const e = new Error(m + " (" + r.status + ")"); e.status = r.status; throw e;
  }
  return txt ? JSON.parse(txt) : null;
}
const urlCache = new Map();
async function signedUrl(bucket, path, secs) {
  const k = bucket + "/" + path, c = urlCache.get(k);
  if (c && c.exp > Date.now()) return c.url;
  const j = await sbRest("POST", "/storage/v1/object/sign/" + bucket + "/" + encodeURI(path), { expiresIn: secs || 3600 });
  const su = (j && j.signedURL) || "";
  if (!su) throw new Error("no signed url");
  const url = SB_URL + "/storage/v1" + (su.startsWith("/") ? su : "/" + su);
  urlCache.set(k, { url, exp: Date.now() + (secs || 3600) * 800 });
  return url;
}
function upload(bucket, path, blob, mime, onP) {
  return sbToken(false).then(tok => new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open("POST", SB_URL + "/storage/v1/object/" + bucket + "/" + encodeURI(path));
    x.setRequestHeader("apikey", SB_KEY); x.setRequestHeader("Authorization", "Bearer " + tok); x.setRequestHeader("Content-Type", mime);
    x.upload.onprogress = e => { if (e.lengthComputable && onP) onP(Math.round(e.loaded * 100 / e.total)); };
    x.onload = () => (x.status >= 200 && x.status < 300) ? res() : rej(new Error("Upload failed (" + x.status + ")"));
    x.onerror = () => rej(new Error("Upload failed. Check your connection."));
    x.send(blob);
  }));
}

/* ---------------- state ---------------- */
let uid = null, msgs = [], conv = null, isOpen = false, hasEntry = false;
let loading = false, adminOnline = false, adminTyping = false, typTimer = null, lastTyped = 0;
let pending = null, sending = false, pollT = null, kickT = null, lastDelivered = "";
let ws = null, hb = null, tokT = null, retryT = null, retryN = 0, stopped = true;     // main realtime socket
let pws = null, phb = null, pRetryT = null;                                          // presence socket (only while chat is open)
let adminUnsub = null, adminLast = null, adminTick = null;

/* ---------------- UI ---------------- */
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M11.5 5.5L5 12l6.5 6.5"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.2-4.3A8 8 0 1 1 21 12z"/></svg>',
  one: '<svg class="chat-tick" viewBox="0 0 16 11"><path d="M11.07.65 4.5 7.2 1.93 4.6l-.97.97L4.5 9.14 12.04 1.6z" fill="currentColor"/></svg>',
  two: '<svg class="chat-tick" viewBox="0 0 16 11"><path d="M11.07.65 4.5 7.2 1.93 4.6l-.97.97L4.5 9.14 12.04 1.6z" fill="currentColor"/><path d="M14.97.65 8.4 7.2l-.5-.5-.97.97 1.47 1.47 7.54-7.54z" fill="currentColor"/></svg>',
  clock: '<svg class="chat-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
};

function build() {
  let m = $("chatModal");
  if (m && m.dataset.v === "sb") return m;
  if (m) m.remove();                                  // replace any old chat markup
  m = document.createElement("div");
  m.id = "chatModal"; m.className = "popup"; m.dataset.v = "sb"; m.style.display = "none";
  m.innerHTML = `
    <div class="popup-box chat-box" role="dialog" aria-modal="true" aria-label="Support chat">
      <div class="chat-header">
        <button type="button" class="chat-back-btn" id="chatBackBtn" aria-label="Back">${ICON.back}</button>
        <span class="chat-brand-mark"><img src="logo-ball.png" alt="" width="44" height="44"></span>
        <div class="chat-header-main">
          <div class="chat-brand-name">ODDZA SURE TIPS</div>
          <div class="chat-header-sub" id="chatHeaderSub">Admin Support</div>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages" aria-live="polite"></div>
      <div class="chat-attach-bar" id="chatAttachBar" hidden>
        <img id="chatAttachThumb" alt="">
        <div class="chat-attach-info"><span id="chatAttachName"></span><div class="chat-attach-prog" id="chatAttachProg" hidden><i id="chatAttachProgBar"></i></div></div>
        <button type="button" class="chat-attach-x" id="chatAttachX" aria-label="Remove">&#10005;</button>
      </div>
      <div class="chat-input-row">
        <div class="chat-input-pill">
          <button type="button" class="chat-attach-btn" id="chatAttachBtn" aria-label="Attach photo">${ICON.clip}</button>
          <input id="chatInput" type="text" placeholder="Type a message" maxlength="1000" autocomplete="off" enterkeyhint="send">
        </div>
        <button type="button" class="chat-send-btn" id="chatSendBtn" aria-label="Send">${ICON.send}</button>
        <input type="file" id="chatImgInput" accept="image/jpeg,image/png,image/webp,image/*" hidden>
      </div>
    </div>`;
  document.body.appendChild(m);

  $("chatBackBtn").onclick = () => closeChat();
  $("chatSendBtn").onclick = () => send();
  $("chatAttachBtn").onclick = () => $("chatImgInput").click();
  $("chatAttachX").onclick = clearAttach;
  $("chatImgInput").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) pickImage(f); };
  const inp = $("chatInput");
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); send(); } };
  inp.oninput = sendTyping;
  inp.addEventListener("paste", e => {
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); pickImage(f); }
  });
  const list = $("chatMessages");
  // press-and-hold on your own message to delete it
  let holdT = null;
  const cancelHold = () => { clearTimeout(holdT); list.querySelectorAll(".holding").forEach(x => x.classList.remove("holding")); };
  list.addEventListener("pointerdown", e => {
    const b = e.target.closest(".chat-bubble[data-mine]"); if (!b) return;
    b.classList.add("holding"); clearTimeout(holdT);
    holdT = setTimeout(() => { b.classList.remove("holding"); navigator.vibrate?.(15); askDelete(b.dataset.id); }, 550);
  });
  ["pointerup", "pointerleave", "pointercancel", "scroll"].forEach(ev => list.addEventListener(ev, cancelHold, { passive: true }));
  list.addEventListener("contextmenu", e => { if (e.target.closest(".chat-bubble[data-mine]")) e.preventDefault(); });
  list.addEventListener("click", e => {
    const img = e.target.closest("img[data-full]");
    if (img && /^https:\/\//.test(img.dataset.full)) window.open(img.dataset.full, "_blank", "noopener,noreferrer");
    const f = e.target.closest("[data-file]");
    if (f) downloadFile(f.dataset.file);
  });
  return m;
}

const dayLabel = d => {
  const n = new Date(), y = new Date(Date.now() - 864e5);
  if (d.toDateString() === n.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";
const ticks = st => st === "pending" ? `<span class="chat-msg-ticks pending">${ICON.clock}</span>`
  : `<span class="chat-msg-ticks${st === "read" ? " read" : ""}">${st === "delivered" || st === "read" ? ICON.two : ICON.one}</span>`;

/* ---- links: admin (and user) links become real tappable links; .apk links become a download card ---- */
const LINK_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}|\b(?:https?:\/\/|www\.)[^\s<]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|co\.tz|co\.ke|co|tz|app|io|me|info|biz|tv)\b(?:\/[^\s<]*)?/gi;
function linkHtml(t) {
  if (/^[^\s@]+@[^\s@]+$/.test(t)) return `<a class="chat-link" href="mailto:${esc(t)}">${esc(t)}</a>`;
  const href = /^https?:\/\//i.test(t) ? t : "https://" + t;
  let path = ""; try { path = new URL(href).pathname; } catch { return esc(t); }
  if (/\.apk$/i.test(path)) {
    const name = decodeURIComponent(path.split("/").pop() || "app.apk");
    return `<a class="chat-apk" href="${esc(href)}" download target="_blank" rel="noopener noreferrer"><span class="chat-apk-ico">APK</span><span class="chat-apk-meta"><b>${esc(name)}</b><small>Android app</small></span><span class="chat-apk-btn">Download</span></a>`;
  }
  return `<a class="chat-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
}
function linkify(raw) {
  const s = String(raw ?? ""); let out = "", last = 0, m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(s))) {
    let t = m[0], tail = "";
    const tr = t.match(/[.,;:!?)\]'"]+$/);
    if (tr) { tail = tr[0]; t = t.slice(0, -tail.length); }
    out += esc(s.slice(last, m.index)) + linkHtml(t) + esc(tail);
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

function render(stick) {
  const list = $("chatMessages"); if (!list) return;
  const nearBottom = stick || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  if (!msgs.length) {
    list.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">${ICON.chat}</div><p>How can we help?</p><small>Send us a message and we will reply here.</small></div>`;
    return;
  }
  let last = "";
  list.innerHTML = msgs.map(m => {
    const mine = m.sender === "user", d = new Date(m.created_at);
    const key = d.toDateString();
    const sep = key !== last ? `<div class="chat-day" role="separator"><span>${esc(dayLabel(d))}</span></div>` : "";
    last = key;
    const hold = mine && !String(m.id).startsWith("tmp-") ? ` data-mine="1" data-id="${esc(m.id)}"` : "";
    let body;
    if (m.file_path) {
      const ext = ((m.file_name || "").split(".").pop() || "file").toUpperCase().slice(0, 4);
      body = `<div class="chat-bubble chat-bubble-file"${hold}><div class="chat-file-card" data-file="${esc(m.id)}"><span class="chat-file-ico">${esc(ext)}</span><span class="chat-file-meta"><b>${esc(m.file_name || "file")}</b><small>${ext === "APK" ? "Android app · " : ""}${fmtSize(m.file_size)}</small></span><span class="chat-file-btn">Download</span></div>${m.body ? `<div class="chat-image-caption">${linkify(m.body)}</div>` : ""}</div>`;
    } else if (m.image_path || m.localImg) {
      const u = m.imageUrl || m.localImg || "";
      body = `<div class="chat-bubble chat-bubble-image"${hold}>${u ? `<img src="${esc(u)}" data-full="${esc(u)}" alt="photo" loading="lazy">` : '<div class="chat-img-ph"></div>'}${m.body ? `<div class="chat-image-caption">${linkify(m.body)}</div>` : ""}</div>`;
    } else {
      body = `<div class="chat-bubble"${hold}>${linkify(m.body)}</div>`;
    }
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${sep}<div class="chat-msg ${mine ? "user" : "admin"}"><div class="chat-msg-main">${body}<div class="chat-msg-time">${esc(time)}${mine ? ticks(m.status) : ""}</div></div></div>`;
  }).join("");
  if (nearBottom) list.scrollTop = list.scrollHeight;
}

function renderStatus() {
  // No online/offline status any more: the header always says "Admin Support" (or "typing…" while the admin types).
  const sub = $("chatHeaderSub"); if (!sub) return;
  sub.textContent = adminTyping ? "typing…" : "Admin Support";
}

function updateBadge() {
  const n = conv ? (conv.unread_by_user || 0) : 0;
  const dot = $("chatDot") || document.querySelector(".chat-dot");
  if (!dot) return;
  const show = n > 0 && !isOpen;
  dot.classList.toggle("hidden", !show);
  dot.classList.toggle("has-count", show);
  dot.textContent = show ? (n > 99 ? "99+" : String(n)) : "";
}

/* ---------------- data ---------------- */
async function loadConv() {
  const rows = await sbRest("GET", "/rest/v1/chat_conversations?select=*&uid=eq." + encodeURIComponent(uid));
  conv = (rows && rows[0]) || null;
  updateBadge();
  if (conv && (conv.unread_by_user || 0) > 0) {
    const k = uid + "|" + (conv.last_message_at || "");
    if (k !== lastDelivered) { lastDelivered = k; sbRest("POST", "/rest/v1/rpc/chat_mark_delivered", {}).catch(() => {}); }
  }
}
async function loadMessages() {
  if (loading || !uid) return; loading = true;
  const me = uid;
  try {
    const rows = await sbRest("GET", "/rest/v1/chat_messages?select=*&conversation_uid=eq." + encodeURIComponent(me) + "&order=created_at.asc&limit=300");
    if (me !== uid) return;
    const prev = new Map(msgs.map(m => [m.id, m]));
    const out = await Promise.all((rows || []).map(async r => {
      const p = prev.get(r.id);
      let imageUrl = p && p.imageUrl;
      if (r.image_path && !imageUrl) { try { imageUrl = await signedUrl("chat-images", r.image_path); } catch {} }
      return { ...r, imageUrl };
    }));
    const tmps = msgs.filter(m => String(m.id).startsWith("tmp-") && m.status === "pending");
    msgs = out.concat(tmps);
    if (isOpen) { render(false); markReadIfNeeded(); }
  } finally { loading = false; }
}
function markReadIfNeeded() {
  if (!isOpen || document.hidden) return;
  if (!msgs.some(m => m.sender === "admin" && m.status !== "read")) return;
  sbRest("POST", "/rest/v1/rpc/chat_mark_read", {}).then(() => loadConv()).catch(() => {});
}
function kick() {
  clearTimeout(kickT);
  kickT = setTimeout(async () => {
    try { await loadConv(); if (isOpen || msgs.length) await loadMessages(); } catch (e) { console.warn("chat refresh:", e.message); }
  }, 250);
}

/* ---------------- sending ---------------- */
async function compress(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.85, b;
  for (;;) { b = await new Promise(r => c.toBlob(r, "image/jpeg", q)); if (!b || b.size <= 4800000 || q <= 0.4) break; q -= 0.15; }
  if (!b || b.size > 5000000) throw new Error("Image is too large");
  return b;
}
async function pickImage(f) {
  try {
    if (!/^image\//.test(f.type)) throw new Error("Please choose a photo");
    clearAttach();
    const blob = await compress(f);
    pending = { blob, name: f.name || "photo.jpg", preview: URL.createObjectURL(blob) };
    $("chatAttachThumb").src = pending.preview;
    $("chatAttachName").textContent = pending.name;
    $("chatAttachProg").hidden = true; $("chatAttachProgBar").style.width = "0";
    $("chatAttachBar").hidden = false;
    $("chatInput").focus();
  } catch (e) { toast(e.message); }
}
function clearAttach() {
  if (pending && pending.preview) URL.revokeObjectURL(pending.preview);
  pending = null;
  const b = $("chatAttachBar"); if (b) b.hidden = true;
}
async function send() {
  if (sending || !uid) return;
  const inp = $("chatInput"), text = inp.value.trim(), att = pending;
  if (!text && !att) return;
  sending = true; $("chatSendBtn").disabled = true;
  const tmp = { id: "tmp-" + Date.now(), sender: "user", body: text, status: "pending", created_at: new Date().toISOString(), localImg: att ? att.preview : null, image_path: att ? "x" : null };
  msgs.push(tmp); inp.value = ""; render(true);
  try {
    let path = null;
    if (att) {
      path = uid + "/" + crypto.randomUUID() + ".jpg";
      $("chatAttachProg").hidden = false;
      await upload("chat-images", path, att.blob, "image/jpeg", n => { $("chatAttachProgBar").style.width = n + "%"; });
    }
    await sbRest("POST", "/rest/v1/rpc/chat_send_user", { p_body: text, p_image: path, p_name: auth.currentUser?.displayName || null });
    msgs = msgs.filter(m => m.id !== tmp.id);
    if (att) { urlCache.delete("x"); clearAttach(); }
    await Promise.all([loadMessages(), loadConv()]);
    render(true);
  } catch (e) {
    msgs = msgs.filter(m => m.id !== tmp.id);
    inp.value = text; render(true);
    toast(e.message === "rate_limited" ? "You are sending too fast. Please wait a moment." : "Message not sent: " + e.message);
  }
  sending = false; $("chatSendBtn").disabled = false; inp.focus();
}
async function downloadFile(id) {
  const m = msgs.find(x => x.id === id); if (!m || !m.file_path) return;
  try {
    const u = await signedUrl("chat-files", m.file_path, 600);
    const a = document.createElement("a");
    a.href = u + "&download=" + encodeURIComponent(m.file_name || "file");
    a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    if (/\.apk$/i.test(m.file_name || "")) toast("Download started. Open the file to install; allow installs if Android asks.");
  } catch (e) { toast("Download failed: " + e.message); }
}
async function askDelete(id) {
  const ok = window.showConfirmModal
    ? await window.showConfirmModal("Delete this message?", { confirmLabel: "Delete" })
    : confirm("Delete this message?");
  if (!ok) return;
  try { await sbRest("POST", "/rest/v1/rpc/chat_delete_message", { p_id: id }); msgs = msgs.filter(m => m.id !== id); render(false); kick(); }
  catch (e) { toast("Delete failed: " + e.message); }
}

/* ---------------- realtime: messages (always on while signed in) ---------------- */
function schedule() {
  if (stopped) return;
  clearTimeout(retryT);
  retryT = setTimeout(connect, Math.min(30000, 1000 * Math.pow(2, Math.min(retryN++, 5))));
}
async function connect() {
  if (stopped || !uid) return;
  let tok; try { tok = await sbToken(false); } catch (e) { return schedule(); }
  if (stopped) return;
  const topic = "realtime:user-chat:" + uid;
  const s = new WebSocket("wss://" + SB_HOST + "/realtime/v1/websocket?apikey=" + SB_KEY + "&vsn=1.0.0");
  ws = s;
  const out = (t, ev, p) => { try { s.send(JSON.stringify({ topic: t, event: ev, payload: p, ref: String(Date.now()) })); } catch {} };
  s.onopen = () => {
    s.send(JSON.stringify({ topic, event: "phx_join", ref: "1", join_ref: "1", payload: {
      config: { broadcast: { self: false, ack: false }, presence: { key: "" }, private: false, postgres_changes: [
        { event: "*", schema: "public", table: "chat_messages", filter: "conversation_uid=eq." + uid },
        { event: "*", schema: "public", table: "chat_conversations", filter: "uid=eq." + uid }
      ] }, access_token: tok } }));
    clearInterval(hb); hb = setInterval(() => out("phoenix", "heartbeat", {}), 25000);
    clearInterval(tokT); tokT = setInterval(async () => { try { out(topic, "access_token", { access_token: await sbToken(true) }); } catch {} }, 40 * 60000);
  };
  s.onmessage = ev => {
    try {
      const o = JSON.parse(ev.data);
      if (o.event === "postgres_changes") kick();
      else if (o.event === "phx_reply" && o.ref === "1") { if (o.payload && o.payload.status === "ok") retryN = 0; else { try { s.close(); } catch {} } }
    } catch {}
  };
  s.onclose = () => { if (ws === s) { clearInterval(hb); clearInterval(tokT); schedule(); } };
  s.onerror = () => { try { s.close(); } catch {} };
}

/* ---------------- realtime: presence + typing (only while the chat is open) ---------------- */
function closePresence() {
  clearInterval(phb); clearTimeout(pRetryT); clearTimeout(typTimer);
  const w = pws; pws = null; try { w && w.close(); } catch {}
  adminTyping = false;
}
async function openPresence() {
  closePresence();
  if (!uid || !isOpen) return;
  const me = uid; let tok; try { tok = await sbToken(false); } catch { return; }
  if (me !== uid || !isOpen) return;
  const topic = "realtime:chat:" + me;
  const s = new WebSocket("wss://" + SB_HOST + "/realtime/v1/websocket?apikey=" + SB_KEY + "&vsn=1.0.0");
  pws = s;
  s.onopen = () => {
    s.send(JSON.stringify({ topic, event: "phx_join", ref: "1", join_ref: "1", payload: { config: { broadcast: { self: false, ack: false }, presence: { key: me }, postgres_changes: [], private: true }, access_token: tok } }));
    phb = setInterval(() => { try { s.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()) })); } catch {} }, 25000);
  };
  s.onmessage = ev => {
    try {
      const o = JSON.parse(ev.data);
      if (o.event === "phx_reply" && o.ref === "1" && o.payload && o.payload.status === "ok") {
        s.send(JSON.stringify({ topic, event: "presence", payload: { type: "presence", event: "track", payload: { at: Date.now() } }, ref: "2" }));   // admin sees you as online
      } else if (o.event === "broadcast" && o.payload && o.payload.event === "typing" && o.payload.payload && o.payload.payload.from === "admin") {
        adminTyping = true; renderStatus(); clearTimeout(typTimer);
        typTimer = setTimeout(() => { adminTyping = false; renderStatus(); }, 3000);
      }
    } catch {}
  };
  s.onclose = () => { if (pws === s) { clearInterval(phb); pRetryT = setTimeout(() => { if (isOpen && uid === me) openPresence(); }, 3000); } };
  s.onerror = () => { try { s.close(); } catch {} };
}
function sendTyping() {
  const n = Date.now(); if (n - lastTyped < 2500 || !pws || !uid) return; lastTyped = n;
  try { pws.send(JSON.stringify({ topic: "realtime:chat:" + uid, event: "broadcast", payload: { type: "broadcast", event: "typing", payload: { from: "user" } }, ref: String(n) })); } catch {}
}

/* ---------------- admin online status (heartbeat written by the admin panel) ---------------- */
function startAdminWatch() {
  if (adminUnsub) return;
  const calc = () => {
    const ms = adminLast && adminLast.toMillis ? adminLast.toMillis() : 0;
    const on = !!(adminLast && adminLast.online && Date.now() - ms < ADMIN_ONLINE_MS);
    if (on !== adminOnline) { adminOnline = on; renderStatus(); }
  };
  try {
    adminUnsub = onSnapshot(doc(getFirestore(getApp()), "_meta", "adminPresence"), s => {
      const d = s.exists() ? s.data() : null;
      adminLast = d ? { online: !!d.online, toMillis: () => (d.lastSeen && d.lastSeen.toMillis ? d.lastSeen.toMillis() : 0) } : null;
      calc();
    }, () => {});
    adminTick = setInterval(calc, 15000);
  } catch {}
}

/* ---------------- open / close ---------------- */
async function openChat() {
  if (!auth.currentUser || auth.currentUser.isAnonymous) { window.openAuthModal && window.openAuthModal(); return; }
  const m = build();
  isOpen = true;
  m.style.display = "flex";
  document.documentElement.style.overflow = "hidden";
  if (!hasEntry) { try { history.pushState({ v: "chat" }, ""); hasEntry = true; } catch {} }
  updateBadge(); renderStatus(); render(true);
  openPresence();
  try { await Promise.all([loadConv(), loadMessages()]); render(true); }
  catch (e) {
    $("chatMessages").innerHTML = `<div class="chat-empty"><p>Chat is not available right now</p><small>${esc(e.message)}</small></div>`;
  }
  setTimeout(() => $("chatInput") && $("chatInput").focus(), 120);
}
function hide() {
  isOpen = false;
  const m = $("chatModal"); if (m) m.style.display = "none";
  document.documentElement.style.overflow = "";
  closePresence(); clearAttach(); updateBadge();
}
function closeChat() {
  if (!isOpen) return;
  if (hasEntry) history.back(); else hide();     // popstate handler below hides it
}
window.addEventListener("popstate", e => {
  if (!hasEntry) return;
  e.stopImmediatePropagation();
  hasEntry = false;
  hide();
}, true);

window.openChat = openChat;
// Push: lets index.html ask whether the chat is on screen (no duplicate banner) and open it from a notification click.
window.__chatIsOpen = () => isOpen && !document.hidden;
window.__openChatFromPush = () => {
  const t = window.__pendingOpenChat;
  if (!t || Date.now() - t > 60000) { window.__pendingOpenChat = 0; return; }   // stale request: ignore
  if (!uid) return;                                                              // account not ready yet: syncChatUser retries
  window.__pendingOpenChat = 0;
  if (!isOpen) openChat();
};
window.openSupportChat = openChat;   // backward-compat alias for old inline handlers
window.closeChat = closeChat;
window.toggleChat = () => (isOpen ? closeChat() : openChat());
window.sendChatMessage = send;
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-open-chat], #chatBtn, #chatBell, .js-open-chat");
  if (b) { e.preventDefault(); openChat(); }
});
document.addEventListener("visibilitychange", () => { if (!document.hidden && uid) { kick(); markReadIfNeeded(); } });
window.addEventListener("online", () => uid && kick());

/* ---------------- lifecycle ---------------- */
function stopAll() {
  stopped = true; closePresence();
  clearInterval(hb); clearInterval(tokT); clearInterval(pollT); clearTimeout(retryT); clearTimeout(kickT);
  const w = ws; ws = null; try { w && w.close(); } catch {}
  msgs = []; conv = null; lastDelivered = "";
  if (isOpen) { if (hasEntry) { hasEntry = false; } hide(); }
  updateBadge();
}
// Start / stop the chat for the current account. A guest who creates an account is LINKED (same uid, no sign-in
// event), so we also listen to token changes and to an explicit "account ready" event from app.js.
function syncChatUser(user) {
  const next = (user && !user.isAnonymous) ? user.uid : null;   // guests have no support chat
  if (next === uid) return;
  stopAll(); uid = next;
  if (!uid) return;
  stopped = false; retryN = 0;
  startAdminWatch();
  connect();
  clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden) kick(); }, 20000);   // safety net behind the websocket
  loadConv().catch(() => {});                                                                  // unread badge right away
  window.__openChatFromPush && window.__openChatFromPush();                                    // notification was tapped before login finished
}
onAuthStateChanged(auth, syncChatUser);
onIdTokenChanged(auth, syncChatUser);
window.addEventListener("oddza:account-ready", () => syncChatUser(auth.currentUser));


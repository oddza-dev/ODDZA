// ODDZA support chat. Opened from the chat icon in the top bar (#chatBtn): the customer messages the admin.
// The markup uses the original chat classes from styles.css (#chatModal, .chat-box, .chat-header, .chat-msg ...),
// so it looks exactly like the previous chat.
// Data model (matches the Firestore rules):
//   support_chats/{uid}                 -> name, email, lastMessage, lastMessageAt, lastSender, unreadByAdmin, unreadByUser, updatedAt
//   support_chats/{uid}/messages/{auto} -> sender ("user" | "admin"), text, imageUrl?, createdAt
import { getApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore, collection, doc, query, orderBy, limitToLast, onSnapshot,
  writeBatch, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

const MAX_LEN = 1000;       // characters per message (the Firestore rule allows 4000)
const KEEP = 300;           // newest messages kept (same as the old chat)
const SEND_GAP_MS = 500;    // ignore accidental double taps
const HOLD_MS = 550;        // press-and-hold on your own message to delete it
const IMG_MAX = 1280;       // longest side of an uploaded photo
const IMG_LIMIT = 15 * 1024 * 1024;
const TYPING_WINDOW_MS = 8000;          // "Admin is typing…" ignored when older than this
const ADMIN_ALWAYS_ONLINE = true;       // set false to follow the real _meta/adminPresence signal
const PRESENCE_WINDOW_MS = 45000;
const VIBRATE = [120, 60, 120];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fs = () => getFirestore(getApp());
const LOGO = "logo-ball.png";
const ADMIN_AVATAR = "icon-512.png";

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  bubble: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  tick1: '<svg class="chat-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  tick2: '<svg class="chat-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 12.5L6 17l8.5-9.5"/><path d="M9.5 15.5L11 17l9.5-9.5"/></svg>',
  clock: '<svg class="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  trash: '<svg class="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7m-8 0 1 13h8l1-13"/></svg>',
  copy: '<svg class="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
};

let user = null, uidWatching = null;
let parentUnsub = null, msgUnsub = null;
let parent = null;                    // support_chats/{uid} data
let rows = [], loaded = false, loadError = "";
let uploading = [];                   // photos being uploaded: { id, caption }
let modal = null, isOpen = false, lastSend = 0, stick = true, sendError = "", sheetMsg = null;
let presenceUnsub = null, presenceOnline = false, presenceTimer = null, typingTimer = null, parentSeenFirst = false;

/* ---------- toast / notification / confirm dialog: provided by app.js (window.*) ---------- */
const toast = msg => { if (typeof window.showToast === "function") window.showToast(msg); };
const notify = msg => { if (typeof window.addNotification === "function") window.addNotification(msg); };

/* ---------- admin presence (Online / Offline) ---------- */
function presenceShown() { return ADMIN_ALWAYS_ONLINE || presenceOnline; }
function applyPresence() {
  const st = $("chatStatus"), tx = $("chatStatusTxt");
  if (st) st.classList.toggle("online", presenceShown());
  if (tx) tx.textContent = presenceShown() ? "Online" : "Offline";
  if (isOpen) paint();   // delivered/sent ticks depend on it
}
const presenceFresh = d => !!(d && d.online && d.lastSeen && d.lastSeen.toDate && (Date.now() - d.lastSeen.toDate().getTime()) <= PRESENCE_WINDOW_MS);
function startPresence() {
  if (ADMIN_ALWAYS_ONLINE || presenceUnsub) return;
  presenceUnsub = onSnapshot(doc(fs(), "_meta", "adminPresence"), snap => {
    const d = snap.exists() ? snap.data() : null;
    presenceOnline = presenceFresh(d); applyPresence();
    clearInterval(presenceTimer);
    presenceTimer = setInterval(() => { const n = presenceFresh(d); if (n !== presenceOnline) { presenceOnline = n; applyPresence(); } }, 10000);
  }, () => {});
}

/* ---------- "Admin is typing…" (parent.adminTyping = Timestamp or true) ---------- */
function typingLeftMs() {
  const v = parent && parent.adminTyping;
  if (!v) return 0;
  if (v === true) return TYPING_WINDOW_MS;
  if (v.toDate) return Math.max(0, TYPING_WINDOW_MS - (Date.now() - v.toDate().getTime()));
  return 0;
}

/* ---------- time helpers ---------- */
const toDate = v => (v && typeof v.toDate === "function") ? v.toDate() : (v instanceof Date ? v : (typeof v === "number" ? new Date(v) : null));
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function dayLabel(d) {
  const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, y)) return "Yesterday";
  const o = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) o.year = "numeric";
  return d.toLocaleDateString("en-US", o);
}
const clock = d => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

/* ---------- top-bar chat icon: unread dot / count ---------- */
const seenKey = () => "oddza_chat_seen_" + (user ? user.uid : "");
function unreadCount() {
  let seen = 0; try { seen = Number(localStorage.getItem(seenKey())) || 0; } catch {}
  if (!seen) { const lastMine = rows.filter(m => m.sender === "user" && m.at).map(m => m.at.getTime()).pop(); seen = lastMine || 0; }
  return rows.filter(m => m.sender !== "user" && m.at && m.at.getTime() > seen).length;
}
function paintBadge() {
  const dot = $("chatDot");
  if (!dot) return;
  const show = !!user && !isOpen && !!parent && parent.unreadByUser === true;
  const n = show ? unreadCount() : 0;
  dot.classList.toggle("hidden", !show);
  dot.classList.toggle("has-count", show && n > 0);
  dot.textContent = show && n > 0 ? (n > 9 ? "9+" : String(n)) : "";
}

/* ---------- DOM ---------- */
function build() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "chatModal";
  modal.className = "popup";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Chat with admin");
  modal.innerHTML = `
    <div class="popup-box chat-box">
      <div class="chat-header">
        <button type="button" class="chat-back-btn" id="chatBack" aria-label="Back">${ICON.back}</button>
        <div class="chat-brand-mark"><img src="${LOGO}" alt="" onerror="this.style.display='none'"></div>
        <div class="chat-header-main">
          <div class="chat-brand-name"><span class="gold">ODDZA</span></div>
          <div class="chat-header-role">${ICON.bubble}<span>VIP Support</span></div>
          <div class="chat-header-sub">Usually replies within 20 minutes</div>
        </div>
        <div class="chat-status online" id="chatStatus">
          <div class="chat-status-line"><span class="chat-online-dot"></span><span id="chatStatusTxt">Online</span></div>
          <div class="chat-status-role">Admin Support</div>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages" aria-live="polite"></div>
      <div class="cs-err" id="chatErr" role="alert"></div>
      <div class="chat-input-row" id="chatInputRow">
        <div class="chat-input-pill">
          <input id="chatInput" type="text" maxlength="${MAX_LEN}" placeholder="Type your message…" autocomplete="off" enterkeyhint="send" aria-label="Message">
          <button type="button" class="chat-attach-btn" id="chatAttach" aria-label="Attach a photo">${ICON.clip}</button>
        </div>
        <button type="button" class="chat-send-btn" id="chatSend" aria-label="Send">${ICON.send}</button>
        <input type="file" id="chatFile" accept="image/*" hidden>
      </div>
    </div>`;
  document.body.appendChild(modal);

  $("chatBack").onclick = closeChat;
  $("chatSend").onclick = () => sendText();
  $("chatAttach").onclick = () => $("chatFile").click();
  $("chatFile").onchange = e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) sendImage(f); };
  $("chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); sendText(); } });
  $("chatInput").addEventListener("input", () => { if (sendError) { sendError = ""; paintErr(); } });

  const box = $("chatMessages");
  box.addEventListener("scroll", () => { stick = box.scrollHeight - box.scrollTop - box.clientHeight < 90; }, { passive: true });
  box.addEventListener("load", e => { if (e.target && e.target.tagName === "IMG" && stick) box.scrollTop = box.scrollHeight; }, true);
  box.addEventListener("click", e => {
    if (e.target.closest("#csLogin")) { closeChat(); if (window.openAuthModal) window.openAuthModal(); return; }
    const img = e.target.closest && e.target.closest("[data-full]");
    if (img) window.open(img.dataset.full, "_blank", "noopener");
  });
  wireHold(box);
  return modal;
}
function paintErr() { const e = $("chatErr"); if (e) e.textContent = sendError; }

/* ---------- messages ---------- */
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, u => `<a class="cs-link" href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}
function ticksFor(m, i) {
  if (m.pending) return `<span class="chat-msg-ticks pending" title="Sending">${ICON.clock}</span>`;
  const laterAdmin = rows.slice(i + 1).some(x => x.sender !== "user");
  const read = (parent && parent.unreadByAdmin === false) || laterAdmin;
  if (read) return `<span class="chat-msg-ticks read" title="Read">${ICON.tick2}</span>`;
  if (presenceShown()) return `<span class="chat-msg-ticks" title="Delivered">${ICON.tick2}</span>`;
  return `<span class="chat-msg-ticks" title="Sent">${ICON.tick1}</span>`;
}
function bubble(m, mine) {   // long-press works on every message (own: copy/delete, admin: copy)
  const img = /^https:\/\//i.test(m.imageUrl || "") ? `<img src="${esc(m.imageUrl)}" alt="Photo" loading="lazy" data-full="${esc(m.imageUrl)}" style="pointer-events:auto">` : "";
  const cap = m.text ? (img ? `<div class="chat-image-caption">${linkify(m.text)}</div>` : linkify(m.text)) : "";
  const cls = "chat-bubble" + (img ? " chat-bubble-image" : "") + (!m.pending ? " chat-bubble-holdable" : "");
  return `<div class="${cls}"${!m.pending ? ` data-mid="${esc(m.id)}"` : ""}>${img}${cap}</div>`;
}
function paint() {
  const box = $("chatMessages"), row = $("chatInputRow"); if (!box) return;
  if (!user) {
    row.hidden = true;
    box.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">${ICON.chat}</div><p>Log in to message us</p>
      <small>Your messages are linked to your ODDZA account, so we can find your payment and reply to you here.</small>
      <button type="button" class="cs-login" id="csLogin">Log in or sign up</button></div>`;
    return;
  }
  row.hidden = false;
  if (loadError) { box.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">${ICON.chat}</div><p>Chat unavailable</p><small>${esc(loadError)}</small></div>`; return; }
  if (!loaded) { box.innerHTML = `<div class="chat-empty"><div class="section-loader"><div class="spin-ring"></div></div></div>`; return; }
  if (!rows.length && !uploading.length) {
    box.innerHTML = `<div class="chat-empty"><div class="chat-empty-icon">${ICON.chat}</div><p>Send us a message</p>
      <small>Ask about payments, your VIP or the tips. The admin will reply here.</small></div>`;
    return;
  }
  let html = "", last = null;
  const mineBlock = (m, i) => `
    <div class="chat-msg user"><div class="chat-msg-main">${bubble(m, true)}
      <div class="chat-msg-time"><span>${m.at ? esc(clock(m.at)) : ""}</span>${ticksFor(m, i)}</div></div>
      <div class="chat-user-avatar"><div class="chat-avatar-disc">${ICON.person}</div><div class="chat-avatar-name">You</div></div></div>`;
  rows.forEach((m, i) => {
    if (m.at && (!last || !sameDay(last, m.at))) { html += `<div class="chat-day"><span>${esc(dayLabel(m.at))}</span></div>`; last = m.at; }
    if (m.sender === "user") html += mineBlock(m, i);
    else html += `
      <div class="chat-msg admin"><div class="chat-admin-avatar"><img src="${ADMIN_AVATAR}" alt="" onerror="this.onerror=null;this.src='${LOGO}'"></div>
        <div class="chat-msg-main"><div class="chat-msg-sender">ODDZA <span class="sep">•</span> <span class="role">Admin</span></div>${bubble(m, false)}
        <div class="chat-msg-time"><span>${m.at ? esc(clock(m.at)) : ""}</span></div></div></div>`;
  });
  uploading.forEach(u => {
    html += `<div class="chat-msg user"><div class="chat-msg-main"><div class="chat-bubble chat-bubble-image"><div class="cs-upload"><div class="spin-ring"></div><span>Sending photo…</span></div>${u.caption ? `<div class="chat-image-caption">${esc(u.caption)}</div>` : ""}</div></div>
      <div class="chat-user-avatar"><div class="chat-avatar-disc">${ICON.person}</div><div class="chat-avatar-name">You</div></div></div>`;
  });
  clearTimeout(typingTimer);
  const tl = typingLeftMs();
  if (tl > 0) {
    html += `<div class="chat-msg admin chat-typing" aria-live="polite"><div class="chat-admin-avatar"><img src="${ADMIN_AVATAR}" alt="" onerror="this.onerror=null;this.src='${LOGO}'"></div>
      <div class="chat-msg-main"><div class="chat-bubble"><div class="chat-msg-sender">ODDZA <span class="sep">•</span> <span class="role">Admin</span></div>
      <div class="chat-typing-row"><span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-typing-text">Admin is typing…</span></div></div></div></div>`;
    typingTimer = setTimeout(() => { if (isOpen) paint(); }, tl + 150);
  }
  box.innerHTML = html;
  if (stick) box.scrollTop = box.scrollHeight;
}

/* ---------- live data ---------- */
function startMessages() {
  stopMessages();
  if (!user) return;
  const q = query(collection(fs(), "support_chats", user.uid, "messages"), orderBy("createdAt", "asc"), limitToLast(KEEP));
  msgUnsub = onSnapshot(q, { includeMetadataChanges: true }, snap => {   // metadata changes clear the clock icon once the server confirms
    rows = snap.docs.map(d => {
      const x = d.data({ serverTimestamps: "estimate" });
      return { id: d.id, sender: x.sender, text: x.text || "", imageUrl: x.imageUrl || "", at: toDate(x.createdAt), pending: d.metadata.hasPendingWrites };
    });
    loaded = true; loadError = "";
    if (isOpen) { paint(); markRead(); } else paintBadge();
  }, err => {
    loaded = true; loadError = (err && err.code === "permission-denied") ? "You do not have access to this chat right now." : "Could not load your messages. Check your connection and try again.";
    if (isOpen) paint();
  });
}
function stopMessages() { if (msgUnsub) { msgUnsub(); msgUnsub = null; } rows = []; loaded = false; loadError = ""; }
function watchParent() {
  const uid = user ? user.uid : null;
  if (uid === uidWatching) return;
  if (parentUnsub) { parentUnsub(); parentUnsub = null; }
  stopMessages();
  uidWatching = uid; parent = null; parentSeenFirst = false; paintBadge();
  if (!uid) return;
  startPresence();
  parentUnsub = onSnapshot(doc(fs(), "support_chats", uid), snap => {
    parent = snap.exists() ? snap.data() : null;
    if (isOpen) { markRead(); paint(); }
    else {
      paintBadge();
      if (parentSeenFirst && parent && parent.unreadByUser === true) {   // admin just replied while the chat is closed
        notify("Admin replied in chat"); toast("Admin replied to your message");
        try { navigator.vibrate && navigator.vibrate(VIBRATE); } catch {}
      }
    }
    parentSeenFirst = true;
  }, () => { /* no access yet: no badge */ });
  startMessages();
}
function markRead() {
  if (!user || !isOpen) return;
  try { localStorage.setItem(seenKey(), String(Date.now())); } catch {}
  if (parent && parent.unreadByUser === true) {
    parent = Object.assign({}, parent, { unreadByUser: false });
    updateDoc(doc(fs(), "support_chats", user.uid), { unreadByUser: false }).catch(() => {});
  }
}
/* ---------- send ---------- */
function writeMessage(text, imageUrl) {
  const u = user, f = fs();
  const parentRef = doc(f, "support_chats", u.uid);
  const msgRef = doc(collection(f, "support_chats", u.uid, "messages"));     // auto-ID (the rule requires 20 letters/digits)
  const batch = writeBatch(f);
  batch.set(parentRef, {
    name: (u.displayName || "").slice(0, 60) || null,
    email: (u.email || "").slice(0, 120) || null,
    lastMessage: (text || (imageUrl ? "Photo" : "")).slice(0, 500),
    lastMessageAt: serverTimestamp(),
    lastSender: "user",
    unreadByAdmin: true,
    unreadByUser: false,
    updatedAt: serverTimestamp()
  }, { merge: true });
  const data = { sender: "user", text: text || "", createdAt: serverTimestamp() };
  if (imageUrl) data.imageUrl = imageUrl;
  batch.set(msgRef, data);
  stick = true;
  return batch.commit();
}
function sendText() {
  const input = $("chatInput");
  if (!input || !user) return;
  const text = input.value.trim();
  if (!text || Date.now() - lastSend < SEND_GAP_MS) return;
  lastSend = Date.now();
  sendError = ""; paintErr();
  input.value = "";
  writeMessage(text).catch(err => {
    // Not delivered: give the text back so nothing is lost.
    if (!input.value) input.value = text;
    sendError = (err && err.code === "permission-denied") ? "Message not sent: no permission." : "Message not sent. Check your connection and try again.";
    paintErr();
  });
}
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("encode")), "image/jpeg", 0.82));
}
async function sendImage(file) {
  if (!user) return;
  if (!/^image\//.test(file.type)) { sendError = "Please choose a photo."; return paintErr(); }
  if (file.size > IMG_LIMIT) { sendError = "That photo is too large (15 MB maximum)."; return paintErr(); }
  const input = $("chatInput"), caption = input.value.trim();
  input.value = ""; sendError = ""; paintErr();
  const token = { id: Date.now() + Math.random(), caption };
  uploading.push(token); stick = true; paint();
  const done = () => { uploading = uploading.filter(x => x !== token); paint(); };
  try {
    const blob = await shrink(file);
    const path = `support_chats/${user.uid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const r = storageRef(getStorage(getApp()), path);
    await uploadBytes(r, blob, { contentType: "image/jpeg" });
    const url = await getDownloadURL(r);
    await writeMessage(caption, url);
    done();
  } catch (err) {
    done();
    if (caption && !input.value) input.value = caption;
    sendError = (err && /unauthor|permission/i.test(String(err.code || err.message))) ? "Photo not sent: no permission to upload." : "Photo not sent. Check your connection and try again.";
    paintErr();
  }
}

/* ---------- press and hold your own message: copy / delete ---------- */
function wireHold(box) {
  let timer = null, el = null, x0 = 0, y0 = 0;
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; if (el) el.classList.remove("holding"); el = null; };
  box.addEventListener("pointerdown", e => {
    const b = e.target.closest && e.target.closest(".chat-bubble-holdable");
    if (!b || e.target.closest("a")) return;
    el = b; x0 = e.clientX; y0 = e.clientY; b.classList.add("holding");
    timer = setTimeout(() => { const id = b.dataset.mid; cancel(); if (id) openSheet(id); }, HOLD_MS);
  });
  box.addEventListener("pointermove", e => { if (timer && (Math.abs(e.clientX - x0) > 10 || Math.abs(e.clientY - y0) > 10)) cancel(); });
  ["pointerup", "pointercancel", "pointerleave", "scroll"].forEach(ev => box.addEventListener(ev, cancel, ev === "scroll" ? { passive: true } : undefined));
  box.addEventListener("contextmenu", e => { if (e.target.closest && e.target.closest(".chat-bubble-holdable")) e.preventDefault(); });
}
function sheet() {
  let s = $("chatActionSheet");
  if (s) return s;
  s = document.createElement("div");
  s.id = "chatActionSheet"; s.className = "popup"; s.style.zIndex = "10500";
  s.innerHTML = `<div class="chat-action-sheet-box" role="menu">
    <button type="button" class="chat-action-row" id="csCopy">${ICON.copy}<span>Copy text</span></button>
    <button type="button" class="chat-action-row" id="csCopyLink">${ICON.copy}<span>Copy image link</span></button>
    <button type="button" class="chat-action-row danger" id="csDel">${ICON.trash}<span>Delete message</span></button>
    <button type="button" class="chat-action-cancel" id="csCancel">Cancel</button></div>`;
  s.addEventListener("click", e => { if (e.target === s) closeSheet(); });
  document.body.appendChild(s);
  const copy = async txt => { try { await navigator.clipboard.writeText(txt); toast("Copied"); } catch {} };
  $("csCancel").onclick = closeSheet;
  $("csCopy").onclick = () => { const m = rows.find(x => x.id === sheetMsg); closeSheet(); if (m && m.text) copy(m.text); };
  $("csCopyLink").onclick = () => { const m = rows.find(x => x.id === sheetMsg); closeSheet(); if (m && m.imageUrl) copy(m.imageUrl); };
  $("csDel").onclick = async () => {
    const id = sheetMsg; closeSheet();
    if (!id || !user) return;
    const ok = await window.showConfirmModal("Delete this message?", { confirmLabel: "Delete" });
    if (!ok) return;
    deleteDoc(doc(fs(), "support_chats", user.uid, "messages", id)).catch(() => { toast("Couldn't delete message, please try again"); });
  };
  return s;
}
function openSheet(id) {
  const m = rows.find(x => x.id === id); if (!m) return;
  sheetMsg = id;
  const s = sheet();
  $("csCopy").style.display = m.text ? "" : "none";
  $("csCopyLink").style.display = m.imageUrl ? "" : "none";
  $("csDel").style.display = m.sender === "user" ? "" : "none";      // only your own messages can be deleted
  s.style.display = "flex";
  if (navigator.vibrate) try { navigator.vibrate(12); } catch {}
}
function closeSheet() { const s = $("chatActionSheet"); if (s) s.style.display = "none"; }

/* ---------- open / close ---------- */
// Keep the whole chat above the on-screen keyboard (Android Chrome overlays it instead of resizing the page).
function fit() {
  if (!modal || !isOpen) return;
  const v = window.visualViewport;
  if (v && matchMedia("(pointer:coarse)").matches) { modal.style.top = v.offsetTop + "px"; modal.style.bottom = "auto"; modal.style.height = v.height + "px"; }
  else { modal.style.top = modal.style.bottom = modal.style.height = ""; }
}
if (window.visualViewport) { visualViewport.addEventListener("resize", fit); visualViewport.addEventListener("scroll", fit); }
window.addEventListener("resize", fit);

function openChat() {
  build();
  if (!isOpen) { try { history.pushState({ v: "chat" }, ""); } catch {} }
  isOpen = true; stick = true; sendError = ""; paintErr();
  modal.style.display = "flex";
  document.documentElement.classList.add("cs-lock");
  fit();
  applyPresence(); markRead(); paintBadge();
  if (user && !matchMedia("(pointer:coarse)").matches) setTimeout(() => { const i = $("chatInput"); if (i) i.focus(); }, 60);
}
function closeChat() {
  if (isOpen && history.state && history.state.v === "chat") { history.back(); return; }   // popstate calls hardClose
  hardClose();
}
window.addEventListener("popstate", () => { if (isOpen) hardClose(); });
function hardClose() {
  isOpen = false; closeSheet(); clearTimeout(typingTimer);
  if (modal) { modal.style.display = "none"; modal.style.top = modal.style.bottom = modal.style.height = ""; }
  document.documentElement.classList.remove("cs-lock");
  paintBadge();
}
window.openSupportChat = openChat;
window.openChatModal = openChat;   // old name, still used by any old links
window.closeSupportChat = closeChat;
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && isOpen) { const s = $("chatActionSheet"); if (s && s.style.display === "flex") closeSheet(); else closeChat(); }
  const b = e.target && e.target.id === "chatBtn";
  if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openChat(); }
});

/* ---------- auth ---------- */
function boot() {
  let a;
  try { a = getAuth(getApp()); } catch { return setTimeout(boot, 300); }   // app.js has not created the Firebase app yet
  onAuthStateChanged(a, u => {
    user = u || null;
    watchParent();
    if (isOpen) paint();
  });
}
boot();

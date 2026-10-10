// ════════════════════════════════════════════════════════════════════
// ODDZA — app.js
// Sections (search for the title to jump):
//   1. FIREBASE, SERVICE WORKER & SMALL HELPERS
//   2. TRANSLATIONS (i18n)
//   3. UI HELPERS — skeletons, copy protection, splash screen
//   4. GLOBAL STATE & SERVER CLOCK
//   5. AUTH LISTENER & SESSION CLAIM
//   6. AUTH MODAL — login, sign-up, Google, password reset
//   7. ACCOUNT PANEL, VISITOR TRACKING & BACKGROUND WATCHERS
//   8. NOTIFICATIONS & PUSH
//   9. POPUPS, VIP-LOSS MESSAGE & ADMIN PRESENCE
//   10. NAVIGATION — home, categories, sections
//   11. VIP — ELITE TIER (plans, expiry, countdown, codes)
//   12. VIP — EXTRA TIERS (Single, Over-Under, Full Package)
//   13. CHAT WITH ADMIN
//   14. MATCH EVALUATION — tip wording & win/lost logic
//   15. MATCH RENDERING & LIVE LISTENERS
//   16. HISTORY — loaded on demand
//   17. APP BOOTSTRAP
//   18. LAYOUT, HOME SWIPE & CONSENT
// ════════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getFirestore, initializeFirestore, collection, query, where, limit, orderBy,
  onSnapshot, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, increment, runTransaction, arrayUnion,
  persistentLocalCache, persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signInWithCredential
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// ════════════════════════════════════════════════════════════════════
// FIREBASE, SERVICE WORKER & SMALL HELPERS
// ════════════════════════════════════════════════════════════════════

// Sections now scroll inside their own fixed area (app-shell layout), not the
// window — so "scroll to top" must reset those containers.
function scrollMainTop(opts) {
  const behavior = (opts && opts.behavior) || "auto";
  ["homeSection", "freeSection", "vipSection", "historySection"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.scrollTo({ top: 0, behavior });
  });
}

const firebaseConfig = {
  apiKey:            "AIzaSyDyL6CgZVuIprC7izQ4arOAcVL9m97GUrA",
  authDomain:        "bm-surescore.firebaseapp.com",
  projectId:         "bm-surescore",
  storageBucket:     "bm-surescore.firebasestorage.app",
  messagingSenderId: "642404428353",
  appId:             "1:642404428353:web:3b054b81c862ba2fd4b4c0",
  measurementId:     "G-1M0H58GZ95"
};
const app     = initializeApp(firebaseConfig);
// Auto-detect long-polling so live updates are not delayed on mobile networks / WebView
let db;
try {
  // Persistent cache: VIP code + tips survive offline / app restarts
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  console.warn("Persistent cache unavailable, using memory cache:", e && e.message);
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
}
const auth    = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

if ("serviceWorker" in navigator) {
  // Registered a moment AFTER the app has opened, so the service worker's downloads
  // never compete with the first screen (keeps start-up smooth).
  const registerSW = () => navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((reg) => {
    // Look for a new version whenever the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  }).catch(() => {});
  const later = () => setTimeout(registerSW, 2500);
  if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
}

// ════════════════════════════════════════════════════════════════════
// TRANSLATIONS (i18n)
// ════════════════════════════════════════════════════════════════════

const LANG_STRINGS = {
  en: {
    nav_free: "Free", nav_vip: "VIP", 
    tab_today: "TODAY TIPS", tab_history: "VIEW HISTORY",
    push_banner_title: "Never miss a tip",
    push_banner_sub: "Turn on notifications for new tips instantly",
    push_banner_cta: "Enable",
    apk_banner_title: "Get the Android app",
    apk_banner_sub: "Faster, with instant notifications",
    apk_banner_cta: "Download",
    apk_menu_item: "Download Android app",
    update_banner_title: "Update available",
    update_banner_sub: "A new version is ready, with the latest improvements.",
    update_banner_cta: "Update",
    push_ios_banner_title: "Enable notifications on iPhone",
    push_ios_banner_sub: "Tap the Share button, then choose \"Add to Home Screen\"",
    push_ios_banner_cta: "Got it",
    push_status_on: "Push notifications: On",
    push_status_off: "Push notifications: Off",
    push_status_blocked: "Push notifications: Blocked by browser",
    push_status_blocked_hint: "Open this site's browser settings and allow notifications",
    push_status_ios_hint: "Add to Home Screen first to get notifications",
    push_status_enable_btn: "Enable",
    push_status_disable_btn: "Disable",
    home_card_free_title: "Free Tips",
    empty_free_title: "No matches today",
    empty_free_sub: "Check back later for today's free tips",
    empty_vip_title: "No VIP tips today",
    empty_vip_sub: "Premium tips will appear here soon",
    empty_hist_title: "No history yet",
    empty_hist_sub: "Past results will appear here",
    account_title: "My Account",
    account_guest_msg: "You're not logged in yet.",
    btn_login_signup: "Sign Up / Log In",
    btn_logout: "Log Out",
    notif_title: "Notifications",
    notif_clear: "Clear all",
    notif_empty: "No notifications yet",
    auth_consent: 'I have read and agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>, and I confirm I am 18 years or older.',
    auth_consent_err: "Please accept the Terms and Privacy Policy to continue.",
    legal_terms: "Terms", legal_privacy: "Privacy", legal_delete: "Request account deletion",
    auth_sub_login: "Sign in to your account",
    auth_sub_signup: "Fill in your details to get started",
    label_name: "Your Name", label_email: "Email", label_password: "Password",
    placeholder_name: "Enter your name",
    placeholder_email: "Enter your email",
    placeholder_password: "Enter your password",
    btn_login: "Sign in", btn_signup: "Create account",
    auth_title_login: "Welcome back", auth_title_signup: "Create your account", legal_privacy_full: "Privacy Policy",
    btn_logging_in: "Signing in…", btn_signing_up: "Creating account…",
    forgot_password: "Forgot password?",
    auth_prompt_has_account: "Already have an account?",
    auth_prompt_no_account: "Don't have an account?",
    auth_link_login_instead: "Sign in",
    auth_link_signup_instead: "Create account",
    aria_show_password: "Show password",
    aria_hide_password: "Hide password",
    google_signin: "Continue with Google",
    auth_or: "or",
    google_signing_in: "Connecting…",
    blocked_title: "Access Blocked",
    blocked_msg: "Your account has been blocked from accessing ODDZA.",
    vip_active: "VIP ACTIVE",
    vip_expires: "Expires",
    auth_crown_title: "VIP Access",
    plans_title: "Choose a plan",
    plan_2weeks_name: "2 Weeks", plan_2weeks_dur: "14 days",
    plan_1month_name: "1 Month", plan_1month_dur: "30 days",
    plan_3months_name: "3 Months", plan_3months_dur: "90 days",
    tier_single_desc: "ONE single tip per day, with very high confidence.",
    tier_elite_desc: "SEVERAL tips per day, with deeper analysis.",
    tier_overunder_desc: "Tips about the number of GOALS — over or under a set number.",
    tier_full_desc: "Get all three VIP types above for one lower price.",
    tier_single_name: "Single VIP",
    tier_elite_name: "Elite VIP",
    tier_overunder_name: "Over-Under VIP",
    tier_full_name: "Full Package",
    empty_single_title: "No Single VIP tip today",
    empty_single_sub: "Today's high-confidence single tip will appear here",
    empty_overunder_title: "No Over-Under VIP tips today",
    empty_overunder_sub: "In-depth Over/Under tips will appear here",
    chat_cta_single: "Continue to payment",
    chat_cta_overunder: "Continue to payment",
    chat_prefill_tier: "Hi, I'd like to buy a {tier} code.",
    chat_prefill_full: "Hi, I'd like to buy the Full Package (all 3 VIP tiers — Single, Elite, Over-Under).",
    full_pkg_chat_btn: "Continue to payment",
    btn_paste: "Paste",
    btn_unlock_vip: "Unlock VIP",
    btn_checking: "CHECKING…",
    hist_prev: "‹ Prev Page",
    hist_next: "Next Page ›",
    other_matches: "OTHER MATCHES",
    tip_premium: "Premium Tip",
    lock_reveal: "UNLOCK TO REVEAL",
    postponed_flag: "Postponed",
    vip_match_label: "VIP MATCH",
    cd_days: "Days", cd_hrs: "Hrs", cd_min: "Min", cd_sec: "Sec", cd_expired: "Expired",
    kickoff: "Kick-off",
    loading_free: "Loading today's tips…",
    loading_vip: "Loading VIP tips…",
    loading_history: "Loading history…",
    loading_generic: "Loading…",
    splash_tagline: "Professional Football Predictions",
    err_name_first: "Please enter your name first",
    err_email_required: "Please enter your email",
    err_email_invalid: "That email doesn't look right, please check again",
    err_password_short: "Password must be at least 6 characters",
    welcome_new_account: "Welcome {name}! Your account has been created.",
    login_success: "Logged in successfully. Welcome back!",
    logout_success: "You've been logged out",
    forgot_email_required: "Enter a valid email first so we can send you a reset link",
    reset_email_sent: "We've sent a password reset email. Check your inbox.",
    code_empty: "Please enter a VIP code first",
    code_invalid: "Invalid code",
    code_disabled: "This code has been disabled",
    code_expired: "This code has expired",
    code_in_use: "This code is already in use on another account",
    code_accepted: "Code accepted. Unlocking…",
    code_denied: "Could not verify this code. Sign in again and retry.",
    code_network: "Connection problem. Check your internet and try again.",
    code_error: "Error: {msg}",
    code_disabled_popup: "This VIP code has been disabled",
    code_expired_popup: "This VIP code has expired",
    code_help_link: "Contact Admin",
    vip_renewal_days: "Expires in {days} day(s)",
    vip_renewal_today: "Expires today",
    btn_renew_now: "Renew Now",
    chat_prefill_renew: "Hi, I'd like to renew my {tier} before it expires.",
    account_vip_history_title: "VIP History",
    account_vip_history_empty: "You haven't unlocked VIP yet",
    vip_expired_popup: "Your VIP code has expired. Please request a new code.",
    vip_expired_notif: "Your VIP code has expired.",
    vip_unlocked_toast: "VIP tips unlocked!",
    vip_unlocked_notif: "VIP access activated! Enjoy premium predictions.",
    starting_soon_popup: "Starting soon:\n{match}",
    starting_soon_notif: "{match} starts in ~10 minutes",
    win_notif: "WIN {match}",
    lost_notif: "LOST {match}",
    postponed_notif: "POSTPONED {match}",
    clipboard_empty: "Clipboard is empty",
    clipboard_error: "Couldn't read clipboard — long-press the field and choose Paste instead",
    code_copied: "Code copied",
    chat_cta_btn: "Continue to payment",
    chat_modal_title: "Chat with Admin",
    chat_modal_sub: "Usually replies within 20 minutes",
    chat_header_role: "VIP Support",
    chat_status_role: "Admin Support",
    chat_you: "You",
    chat_admin_role: "Admin",
    chat_day_today: "Today",
    chat_day_yesterday: "Yesterday",
    chat_typing: "Admin is typing…",
    chat_placeholder: "Type your message…",
    chat_empty_title: "No messages yet",
    chat_empty_sub: "Send a message and we'll get back to you shortly — if there's ever a delay, it won't exceed 20 minutes.",
    chat_send_error: "Couldn't send message, please try again",
    chat_status_sending: "Sending…",
    chat_status_sent: "Sent",
    chat_status_delivered: "Delivered",
    chat_status_read: "Read",
    chat_admin_online: "Online",
    chat_admin_offline: "Offline",
    session_taken_confirm: "This account is already signed in on another device. If you continue, that other device will be logged out automatically. Do you want to continue?",
    session_kicked_popup: "You've been signed out because this account was logged in on another device.",
    chat_reply_notif: "Admin replied in chat",
    chat_reply_toast: "Admin replied to your message",
    chat_prefill_plan: "Hi, I'd like to buy a VIP code. Plan: {plan} — Tsh {price}",
    chat_prefill_generic: "Hi, I'd like to get a VIP code for ODDZA.",
    chat_login_required: "Please log in first to chat with admin",
    chat_attach_image: "Send image",
    chat_image_too_large: "Image is too large (max 5MB)",
    chat_image_invalid_type: "That file isn't an image",
    chat_image_upload_error: "Couldn't send image, please try again",
    chat_image_uploading: "Sending image…",
    chat_delete_confirm: "Delete this message?",
    chat_delete_error: "Couldn't delete message, please try again",
    chat_action_copy: "Copy text",
    chat_action_copy_link: "Copy image link",
    chat_action_delete: "Delete message",
    chat_copied_toast: "Copied",
    confirm_cancel_btn: "Cancel",
    confirm_delete_btn: "Delete",
    vlm_title: "Message to VIP Members",
    vlm_close: "Got it",
    install_prompt_title: "Install ODDZA",
    install_prompt_desc: "Add to your home screen for the full app experience",
    install_prompt_desc_ios: "Tap the Share button below, then choose \"Add to Home Screen\" to install",
    install_btn: "Install",
    install_btn_ios: "Show me",
    not_now_btn: "Not Now",
  }
};
function t(key, vars) {
  const dict = LANG_STRINGS.en;
  let str = dict[key] !== undefined ? dict[key] : key;
  if (vars) {
    Object.keys(vars).forEach(k => { str = str.replace(`{${k}}`, vars[k]); });
  }
  return str;
}

function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.innerHTML = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });
  document.documentElement.setAttribute("lang", "en");
}

try { localStorage.removeItem("appLang"); } catch {}

try { localStorage.removeItem("appTheme"); } catch {}

// ════════════════════════════════════════════════════════════════════
// UI HELPERS — skeletons, copy protection, splash screen
// ════════════════════════════════════════════════════════════════════

function skeletonHtml() {
  return '<div class="page-spinner"><div class="splash-spin"></div></div>';
}

function flashSectionLoading(type) {
  const dataEl    = document.getElementById(type === "free" ? "freeData" : "vipData");
  const emptyEl   = document.getElementById(type === "free" ? "emptyFree" : "emptyVip");
  const skelEl    = document.getElementById(type === "free" ? "freeSkeletonRows" : "vipSkeletonRows");

  const alreadyHasContent = dataEl.style.display !== "none" && dataEl.innerHTML.trim() !== "";
  if (alreadyHasContent) {
    processTodayMatches();
    return;
  }

  dataEl.style.display = "none";
  emptyEl.classList.add("hidden");

  skelEl.style.opacity = "1";
  skelEl.style.display = "block";
  skelEl.innerHTML = skeletonHtml();

  processTodayMatches();
}

const TEXT_INPUT_IDS = [
  "vipCodeInput", "authName", "authEmail", "authPassword",
  "vipCodeInput_single", "vipCodeInput_elite", "vipCodeInput_overunder", "vipCodeInput_full"
];
document.addEventListener("contextmenu", e => {
  if (TEXT_INPUT_IDS.includes(e.target.id)) return;
  e.preventDefault();
});
document.addEventListener("copy", e => e.preventDefault());
document.addEventListener("cut", e => e.preventDefault());
document.addEventListener("selectstart", e => {
  if (!TEXT_INPUT_IDS.includes(e.target.id)) e.preventDefault();
});
document.addEventListener("dragstart", e => e.preventDefault());


let splashHidden = false;
const splashMinTimePromise = Promise.resolve();

function hideSplash() {
  const el = document.getElementById("splashScreen");
  if (!el) return;
  // No internet: keep the spinner turning until data is back.
  if (!navigator.onLine) { window.addEventListener("online", hideSplash, { once: true }); return; }
  el.classList.add("hide");
  setTimeout(() => el.remove(), 250);
}

function trySplashHide() {
  if (splashHidden) return;
  splashHidden = true;
  splashMinTimePromise.then(hideSplash);
}

setTimeout(trySplashHide, 6000);

// The spinner disappears and the finished list appears in the same frame:
// no fade, no delay, so the page never shows half-loaded content.
function swapSkeletonForContent(skeletonEl) {
  if (!skeletonEl) return;
  skeletonEl.style.display = "none";
}

function renderWithFade(el, html) {
  if (!el) return;
  el.innerHTML = html;
  el.style.opacity = "1";
}

// ════════════════════════════════════════════════════════════════════
// GLOBAL STATE & SERVER CLOCK
// ════════════════════════════════════════════════════════════════════

let vipUnlocked     = false;
let vipExpiryDate   = null;
let vipRedeemedAt   = null; // ISO string — when THIS user's current VIP code was claimed
let autoLogoutTimer = null;
let codeUnsub       = null;
let currentVipCode  = localStorage.getItem("vipCode") || null;

let vipLossMsgData     = null;
let vipLossMsgShownFor = null; // updatedAt value of the last message we displayed
let notifiedMatches = JSON.parse(localStorage.getItem("notifiedMatches") || "{}");
let notifications   = JSON.parse(localStorage.getItem("vipNotifications") || "[]");
let currentVipTier  = "elite";

let serverOffsetMs = 0;

async function syncServerTime() {
  await Promise.race([_syncServerTime(), new Promise(res => setTimeout(res, 2000))]);
}
async function _syncServerTime() {
  try {
    const ref = doc(db, "_meta", "serverTime");
    const t0  = Date.now();
    await setDoc(ref, { ts: serverTimestamp() }, { merge: true });
    const snap = await getDoc(ref);
    const t1   = Date.now();
    const serverMillis = snap.data()?.ts?.toMillis?.();
    if (serverMillis) {
      const localMidpoint = (t0 + t1) / 2;
      serverOffsetMs = serverMillis - localMidpoint;
    }
  } catch (e) {
    console.warn("Could not sync server time, falling back to device clock:", e.message);
  }
}
function now() {
  return new Date(Date.now() + serverOffsetMs);
}

let today = null;
let date  = null;

function computeDateFromNow() {
  today = now();
  date  = [
    String(today.getDate()).padStart(2,"0"),
    String(today.getMonth()+1).padStart(2,"0"),
    today.getFullYear()
  ].join(".");

  if (localStorage.getItem("lastDate") !== date) {
    localStorage.removeItem("notifiedMatches");
    notifiedMatches = {};
    localStorage.setItem("lastDate", date);
  }

  updateDateHeading();
}

function updateDateHeading() {
  if (!today) return;
  document.querySelectorAll(".sec-date").forEach(el => { el.innerText = date; });
}

// ════════════════════════════════════════════════════════════════════
// AUTH LISTENER & SESSION CLAIM
// ════════════════════════════════════════════════════════════════════

let currentUid     = null;
let currentUser    = null;
let isGuestAccount = true;   // true whenever there is no signed-in user
let appInitialized = false;

let mySessionId       = null;
let sessionWatchUnsub = null;

function generateSessionId() {
  return (window.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)));
}

async function claimOrVerifySession(uid) {
  const storageKey = "deviceSessionId_" + uid;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    mySessionId = stored;
    return true;
  }

  const ref = doc(db, "device_sessions", uid);
  try {
    const snap = await getDoc(ref);
    const existing = snap.exists() ? snap.data().activeSessionId : null;

    if (existing) {
      trySplashHide();
      const proceed = await showConfirmModal(t('session_taken_confirm'));
      if (!proceed) {
        mySessionId = null;
        await signOut(auth).catch(() => {});
        return false;
      }
    }

    const newId = generateSessionId();
    await setDoc(ref, { activeSessionId: newId, activeSessionAt: serverTimestamp() }, { merge: true });
    mySessionId = newId;
    localStorage.setItem(storageKey, newId);
    return true;
  } catch (e) {
    console.warn("Session claim failed:", e.code || e.message);
    mySessionId = stored;
    return true;
  }
}

function startSessionWatcher(uid) {
  if (sessionWatchUnsub) sessionWatchUnsub();
  sessionWatchUnsub = onSnapshot(doc(db, "device_sessions", uid), snap => {
    if (!mySessionId) return; // still claiming — nothing to compare yet
    const data = snap.exists() ? snap.data() : null;
    if (data && data.activeSessionId && data.activeSessionId !== mySessionId) {
      stopSessionWatcher();
      localStorage.removeItem("deviceSessionId_" + uid);
      mySessionId = null;
      signOut(auth).catch(() => {});
      showPopup(t('session_kicked_popup'));
    }
  }, () => { /* ignore transient read errors */ });
}

function stopSessionWatcher() {
  if (sessionWatchUnsub) { sessionWatchUnsub(); sessionWatchUnsub = null; }
}

async function releaseSessionClaim(uid) {
  if (!uid) return;
  localStorage.removeItem("deviceSessionId_" + uid);
  try { await updateDoc(doc(db, "device_sessions", uid), { activeSessionId: null }); }
  catch { /* doc may not exist yet, or a transient error — non-critical */ }
}

function initAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const isNewSession = currentUid !== user.uid;
      currentUid     = user.uid;
      currentUser    = user;
      isGuestAccount = false;

      const sessionOk = await claimOrVerifySession(user.uid);
      if (!sessionOk) {
        return;
      }
      startSessionWatcher(user.uid);
      document.body.classList.remove("locked");
      trySplashHide(); // Home needs no data; section skeletons cover loading

      document.getElementById("authModal").style.display = "none";
      document.body.style.overflow = "";
      scrollMainTop({ top: 0, behavior: "instant" }); // sign-in screen must not leave Home scrolled
      updateAccountUI();
      // Splash stays until Free+VIP data has loaded (processTodayMatches
      // calls trySplashHide). The 6s safety timeout still applies.

      if (!appInitialized) {
        await startAppForUser();
      } else if (isNewSession) {
        await onUserChanged();
      }
    } else {
      stopSessionWatcher();
      currentUid     = null;
      currentUser    = null;
      isGuestAccount = true;

      if (codeUnsub) { codeUnsub(); codeUnsub = null; }
      if (blockedUnsub) { blockedUnsub(); blockedUnsub = null; }
      if (deviceResetUnsub) { deviceResetUnsub(); deviceResetUnsub = null; }
      if (autoLogoutTimer)   clearTimeout(autoLogoutTimer);
      if (countdownInterval) clearInterval(countdownInterval);
      stopAllCountdowns();
      stopChatListeners();

      updateAccountUI();
      document.body.classList.add("locked");
      document.getElementById("blockedScreen").style.display = "none";
      document.getElementById("chatModal").style.display = "none";
      window.openAuthModal();
      trySplashHide();
    }
  });
}

function getVisitorId() {
  return currentUid;
}

async function onUserChanged() {
  document.getElementById("vipRequestCard")?.remove();
  vipUnlocked   = false;
  vipExpiryDate = null;
  if (autoLogoutTimer)   clearTimeout(autoLogoutTimer);
  if (countdownInterval) clearInterval(countdownInterval);
  stopAllCountdowns();

  startBlockedWatcher();
  startDeviceResetWatcher();
  startChatDocListener();
  await trackVisit();

  if (currentVipCode) subscribeToCode(currentVipCode);
  else initVipCode();
}

async function trackVisit() {
  try {
    if (isGuestAccount) return;
    const visitorId = getVisitorId();
    if (!visitorId) return;
    const ref  = doc(db, "analytics_visitors", visitorId);
    const snap = await getDoc(ref).catch(() => null);
    const nowISO = now().toISOString();
    const name  = currentUser ? (currentUser.displayName || null) : null;
    const email = currentUser ? (currentUser.email || null) : null;

    if (snap && snap.exists()) {
      const data = snap.data();
      const isNewDay = data.lastDate !== date;
      await setDoc(ref, {
        lastSeen:   nowISO,
        lastDate:   date,
        visits:     increment(1),
        daysActive: isNewDay ? increment(1) : increment(0),
        ...(!data.firstSeen ? { firstSeen: data.lastSeen || nowISO } : {}),
        ...((name || email) ? { name, email } : {})
      }, { merge: true });
    } else {
      await setDoc(ref, {
        firstSeen:  nowISO,
        lastSeen:   nowISO,
        lastDate:   date,
        visits:     1,
        daysActive: 1,
        name,
        email
      }, { merge: true });
    }
  } catch (e) {
    console.warn("Visitor tracking failed:", e.message);
  }
}

// ════════════════════════════════════════════════════════════════════
// AUTH MODAL — login, sign-up, Google, password reset
// ════════════════════════════════════════════════════════════════════

let authMode = "login"; // "login" | "signup"

function translateAuthError(code) {
  const map = {
    en: {
      "auth/credential-already-in-use": "This email already has another account. Try logging in instead.",
      "auth/email-already-in-use": "This email already has an account. Try logging in instead.",
      "auth/invalid-email":        "That email address isn't valid.",
      "auth/weak-password":        "Password is too weak — use at least 6 characters.",
      "auth/missing-password":     "Please enter a password.",
      "auth/user-not-found":       "No account found with this email.",
      "auth/wrong-password":       "Incorrect password, please try again.",
      "auth/invalid-credential":   "Incorrect email or password.",
      "auth/too-many-requests":    "Too many attempts in a short time. Please wait a moment and try again.",
      "auth/network-request-failed": "Network problem. Check your connection and try again.",
      "auth/popup-blocked":        "Your browser blocked the sign-in popup. Allow popups and try again.",
      "auth/cancelled-popup-request": "The previous Google sign-in request wasn't finished. Please try again.",
      "auth/account-exists-with-different-credential": "This email already has an account created a different way (e.g. password). Try logging in that way instead."
    }
  };
  const dict = map.en;
  return dict[code] || "An error occurred, please try again.";
}

window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === "password";
  input.type = showing ? "text" : "password";
  btn.classList.toggle("showing", showing);
  btn.setAttribute("aria-label", t(showing ? 'aria_hide_password' : 'aria_show_password'));
  input.focus();
};

const AUTH_FIELDS = { Name: "authName", Email: "authEmail", Password: "authPassword", Consent: null };
function setFieldError(field, msg) {
  const err = document.getElementById("auth" + field + "Err");
  if (err) err.textContent = msg || "";
  const id = AUTH_FIELDS[field];
  if (id) document.getElementById(id)?.classList.toggle("is-invalid", !!msg);
  if (id && msg) document.getElementById(id)?.focus();
}
function clearAuthErrors() {
  Object.keys(AUTH_FIELDS).forEach(f => setFieldError(f, ""));
  const m = document.getElementById("authMsg");
  if (m) m.innerText = "";
}
function setAuthBusy(busy, label) {
  const btn = document.getElementById("authSubmitBtn");
  btn.disabled = busy;
  btn.classList.toggle("is-loading", busy);
  document.getElementById("authSubmitLabel").innerText = label;
}
["authName", "authEmail", "authPassword"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", () => {
    setFieldError(id.replace("auth", ""), "");
    const m = document.getElementById("authMsg"); if (m) m.innerText = "";
  });
});

window.setAuthMode = function(mode) {
  authMode = mode;
  const signup = mode === "signup";
  const $ = id => document.getElementById(id);
  $("authNameField").classList.toggle("hidden", !signup);
  $("authTitleText").innerText = t(signup ? 'auth_title_signup' : 'auth_title_login');
  $("authModalSub").innerText = t(signup ? 'auth_sub_signup' : 'auth_sub_login');
  $("authSubmitLabel").innerText = t(signup ? 'btn_signup' : 'btn_login');
  $("authConsent").classList.toggle("hidden", !signup); // Terms checkbox: sign-up only
  $("authForgotLink").classList.toggle("hidden", signup);
  $("authSwitchPrompt").innerText = t(signup ? 'auth_prompt_has_account' : 'auth_prompt_no_account');
  $("authSwitchLink").innerText = t(signup ? 'auth_link_login_instead' : 'auth_link_signup_instead');
  $("authPassword").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  clearAuthErrors();
};
window.switchAuthModeManually = function() { window.setAuthMode(authMode === "signup" ? "login" : "signup"); };
window.resetAuthModalToEmailStep = function() { window.setAuthMode("login"); };

window.openAuthModal = function() {
  window.resetAuthModalToEmailStep();
  document.body.style.overflow = "hidden";
  scrollMainTop({ top: 0, behavior: "instant" });
  document.getElementById("authModal").style.display = "flex";
};

window.submitAuth = async function() {
  const nameEl = document.getElementById("authName");
  const passEl = document.getElementById("authPassword");
  const msgEl  = document.getElementById("authMsg");
  const signup = authMode === "signup";

  const name     = nameEl.value.trim();
  const email    = document.getElementById("authEmail").value.trim();
  const password = passEl.value;

  clearAuthErrors();
  msgEl.style.color = "var(--coral)";

  if (signup && !name) return setFieldError("Name", t('err_name_first'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFieldError("Email", t(email ? 'err_email_invalid' : 'err_email_required'));
  if (!password || password.length < 6) return setFieldError("Password", t('err_password_short'));
  if (signup && !document.getElementById("authConsentChk")?.checked) return setFieldError("Consent", t('auth_consent_err'));

  setAuthBusy(true, t(signup ? 'btn_signing_up' : 'btn_logging_in'));

  try {
    if (signup) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      document.getElementById("authModal").style.display = "none";
      addNotification(t('welcome_new_account', { name }));
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      document.getElementById("authModal").style.display = "none";
      addNotification(t('login_success'));
    }
  } catch (e) {
    console.error("Auth failed:", e.code, e.message);
    const text = translateAuthError(e.code);
    if (signup && e.code === "auth/email-already-in-use") {
      window.setAuthMode("login");
      passEl.value = "";
      setFieldError("Email", text);
    } else if (["auth/invalid-email", "auth/user-not-found"].includes(e.code)) {
      setFieldError("Email", text);
    } else if (["auth/invalid-credential", "auth/wrong-password", "auth/weak-password", "auth/missing-password"].includes(e.code)) {
      setFieldError("Password", text);
    } else {
      msgEl.innerText = text;
    }
  }

  setAuthBusy(false, t(authMode === "signup" ? 'btn_signup' : 'btn_login'));
};

window.signInWithGoogle = async function() {
  if (window.__IS_WEBVIEW) return; // Google blocks sign-in inside WebView
  if (authMode === "signup" && !document.getElementById("authConsentChk")?.checked) {
    return setFieldError("Consent", t('auth_consent_err'));
  }
  clearAuthErrors();
  // Android app: use native Google sign-in, then log in to Firebase with the token.
  if (window.AndroidBridge && window.AndroidBridge.googleSignIn) {
    window.AndroidBridge.googleSignIn();
    return;
  }
  const msgEl = document.getElementById("authMsg");
  const btn   = document.getElementById("googleSignInBtn");

  btn.disabled = true;
  btn.classList.add("is-loading");
  const labelEl = btn.querySelector(".google-signin-btn-main");
  const originalLabel = labelEl.innerText;
  labelEl.innerText = t('google_signing_in');

  try {
    await signInWithPopup(auth, googleProvider);
    document.getElementById("authModal").style.display = "none";
    addNotification(t('login_success'));
  } catch (e) {
    console.error("Google sign-in failed:", e.code, e.message);
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      msgEl.style.color = "var(--coral)";
      msgEl.innerText = translateAuthError(e.code);
    }
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectErr) {
        console.error("Google redirect sign-in failed:", redirectErr.code, redirectErr.message);
      }
    }
  }

  btn.disabled = false;
  btn.classList.remove("is-loading");
  labelEl.innerText = originalLabel;
};

window.onNativeGoogleToken = async function(idToken) {
  const msgEl = document.getElementById("authMsg");
  try {
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    document.getElementById("authModal").style.display = "none";
    addNotification(t('login_success'));
  } catch (e) {
    console.error("Native Google sign-in failed:", e.code, e.message);
    if (msgEl) { msgEl.style.color = "var(--coral)"; msgEl.innerText = translateAuthError(e.code); }
  }
};
window.onNativeGoogleError = function(code) {
  if (/CANCEL/i.test(String(code))) return; // user closed the account picker
  const msgEl = document.getElementById("authMsg");
  if (msgEl) { msgEl.style.color = "var(--coral)"; msgEl.innerText = "Google sign-in failed. Try again."; }
};

async function checkGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      document.getElementById("authModal").style.display = "none";
      addNotification(t('login_success'));
    }
  } catch (e) {
    console.warn("Google redirect result check failed:", e.code, e.message);
  }
}

window.handleForgotPassword = async function() {
  const msgEl = document.getElementById("authMsg");
  const email = (document.getElementById("authEmail")?.value || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return setFieldError("Email", t('forgot_email_required'));
  }

  try {
    await sendPasswordResetEmail(auth, email);
    msgEl.style.color = "var(--pitch)";
    msgEl.innerText = t('reset_email_sent');
  } catch (e) {
    msgEl.style.color = "var(--coral)";
    msgEl.innerText = translateAuthError(e.code);
  }
};

window.logoutAccount = async function() {
  try {
    await releaseSessionClaim(currentUid);
    stopSessionWatcher();
    await signOut(auth);
    closeAccountPanel();
    showToast(t('logout_success'));
  } catch (e) {
    console.warn("Logout failed:", e.message);
  }
};

// ════════════════════════════════════════════════════════════════════
// ACCOUNT PANEL, VISITOR TRACKING & BACKGROUND WATCHERS
// ════════════════════════════════════════════════════════════════════

function buildVipHistoryList() {
  if (!myVipHistory.length) {
    return `<div class="account-vip-history-empty">${t('account_vip_history_empty')}</div>`;
  }
  const rows = myVipHistory.slice().reverse().slice(0, 10).map(h => `
    <div class="account-vip-history-row">
      <span class="account-vip-history-tier">${escapeHtml(tierDisplayName(h.tier))}</span>
      <span class="account-vip-history-date">${escapeHtml((h.redeemedAt || "").slice(0, 10))}</span>
    </div>`).join("");
  return rows;
}

function legalLinksHtml(withDelete) {
  const mail = "mailto:info.oddza@gmail.com?subject=" + encodeURIComponent("Account deletion request") +
    "&body=" + encodeURIComponent("Please delete my ODDZA account.\nRegistered email: " + (currentUser?.email || ""));
  return `<div class="legal-links">
    <a href="terms.html">${t('legal_terms')}</a><span>·</span><a href="privacy.html">${t('legal_privacy')}</a>
    ${withDelete ? `<a class="legal-delete" href="${mail}">${t('legal_delete')}</a>` : ""}
  </div>`;
}

function updateAccountUI() {
  const btn   = document.getElementById("accountBtn");
  const panel = document.getElementById("accountPanel");
  if (!btn || !panel) return;

  if (!isGuestAccount && currentUser) {
    btn.classList.add("account-active");
    panel.innerHTML = `
      <div class="notif-panel-header">${t('account_title')}</div>
      <div class="account-panel-body">
        <div class="account-name">${escapeHtml(currentUser.displayName || "User")}</div>
        <div class="account-email">${escapeHtml(currentUser.email || "")}</div>
        <div class="account-vip-history">
          <div class="account-vip-history-title">${t('account_vip_history_title')}</div>
          ${buildVipHistoryList()}
        </div>
        <button class="account-logout-btn" onclick="logoutAccount()">${t('btn_logout')}</button>
        ${legalLinksHtml(true)}
      </div>`;
  } else {
    btn.classList.remove("account-active");
    panel.innerHTML = `
      <div class="notif-panel-header">${t('account_title')}</div>
      <div class="account-panel-body account-guest">
        <div class="account-guest-msg">${t('account_guest_msg')}</div>
        <button class="account-login-btn" onclick="closeAccountPanel(); window.openAuthModal();">${t('btn_login_signup')}</button>
        ${legalLinksHtml(false)}
      </div>`;
  }
}

window.toggleAccountPanel = function() {
  const panel = document.getElementById("accountPanel");
  updateAccountUI();
  panel.classList.toggle("open");
};
window.closeAccountPanel = function() {
  document.getElementById("accountPanel")?.classList.remove("open");
};
document.addEventListener("click", e => {
  if (!e.target.closest(".account-panel") && !e.target.closest("#accountBtn")) {
    closeAccountPanel();
  }
});

function startVisitorHeartbeat() {
  setInterval(async () => {
    try {
      if (document.hidden || isGuestAccount) return;
      const visitorId = getVisitorId();
      if (!visitorId) return;
      const ref = doc(db, "analytics_visitors", visitorId);
      await setDoc(ref, { lastSeen: now().toISOString() }, { merge: true });
    } catch { /* ignore transient failures */ }
  }, 120000);
}

async function markVisitorVipUnlocked() {
  try {
    if (isGuestAccount) return;
    const ref = doc(db, "analytics_visitors", getVisitorId());
    await setDoc(ref, { vipUnlockedEver: true }, { merge: true });
  } catch { /* non-critical */ }
}

let blockedUnsub = null;
let myVipHistory = [];
function startBlockedWatcher() {
  const myId = getVisitorId();
  if (!myId) return;
  if (blockedUnsub) blockedUnsub();
  blockedUnsub = onSnapshot(doc(db, "analytics_visitors", myId), snap => {
    const data = snap.exists() ? snap.data() : null;
    const isBlocked = !!(data && data.blocked);
    document.getElementById("blockedScreen").style.display = isBlocked ? "flex" : "none";

    myVipHistory = (data && Array.isArray(data.vipHistory)) ? data.vipHistory : [];
    if (document.getElementById("accountPanel")?.classList.contains("open")) updateAccountUI();

    applyDirectGrants(data && data.directGrants);
  }, () => { /* ignore transient read errors */ });
}

let deviceResetUnsub = null;
function startDeviceResetWatcher() {
  const myId = getVisitorId();
  if (!myId) return;
  if (deviceResetUnsub) deviceResetUnsub();

  deviceResetUnsub = onSnapshot(doc(db, "device_resets", myId), async snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.resetRequested !== true) return;

    try {
      await updateDoc(doc(db, "device_resets", myId), { resetRequested: false });

      await releaseSessionClaim(myId).catch(() => {});
      stopSessionWatcher();

      await signOut(auth).catch(() => {});
      localStorage.clear();
      sessionStorage.clear();

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      window.location.href = window.location.href.split("#")[0];
    } catch (e) {
      console.warn("Device reset failed:", e.message);
    }
  }, () => { /* ignore transient read errors */ });
}

let listenersDate = null;   // the date the Firestore listeners were started with
let dayChangedPending = false;

function startDateRolloverWatcher() {
  // Never reload while the user is looking at the page. If the day changed
  // (midnight, or the server clock disagrees with the phone clock), wait
  // until the app goes to the background, then reload invisibly.
  listenersDate = date;

  const currentDateString = () => {
    const n = now();
    return [
      String(n.getDate()).padStart(2,"0"),
      String(n.getMonth()+1).padStart(2,"0"),
      n.getFullYear()
    ].join(".");
  };

  const check = () => {
    if (currentDateString() === listenersDate) return;
    dayChangedPending = true;
    if (document.visibilityState === "hidden") window.location.reload();
  };

  setInterval(check, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (dayChangedPending) window.location.reload();
    } else {
      check();
    }
  });
}


// ════════════════════════════════════════════════════════════════════
// NOTIFICATIONS & PUSH
// ════════════════════════════════════════════════════════════════════

function renderNotifications() {
  const list    = document.getElementById("notifList");
  const countEl = document.getElementById("notifCount");
  if (notifications.length === 0) {
    list.innerHTML = `<div class="notif-empty">${t('notif_empty')}</div>`;
    countEl.classList.add("hidden");
    return;
  }
  list.innerHTML = notifications.slice(0, 8).map(n =>
    `<div class="notif-item">${escapeHtml(n.msg)}<br>
     <span style="font-size:9px;opacity:.4;font-family:'JetBrains Mono',monospace;">${escapeHtml(n.time)}</span></div>`
  ).join("");
  countEl.innerText = Math.min(notifications.length, 9);
  countEl.classList.remove("hidden");
}
function addNotification(msg) {
  const time = now().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  notifications.unshift({ msg, time });
  if (notifications.length > 20) notifications.pop();
  localStorage.setItem("vipNotifications", JSON.stringify(notifications));
  renderNotifications();
}
window.toggleNotifPanel = function() {
  document.getElementById("notifPanel").classList.toggle("open");
  renderPushStatus();
};
window.clearNotifications = function() {
  notifications = [];
  localStorage.setItem("vipNotifications", JSON.stringify(notifications));
  renderNotifications();
};
document.addEventListener("click", e => {
  if (!e.target.closest(".notif-panel") && !e.target.closest("#notifBell")) {
    document.getElementById("notifPanel").classList.remove("open");
  }
});
renderNotifications();

async function renderPushStatus() {
  const row = document.getElementById("pushStatusRow");
  if (!row || !window.PushCenter) return;

  const status = await window.PushCenter.getStatus();
  if (!status.supported) { row.innerHTML = ""; return; }

  let dotClass = "push-status-dot--off";
  let label = t("push_status_off");
  let hint = "";
  let btnHtml = `<button type="button" class="push-status-btn" onclick="togglePushSubscription()">${escapeHtml(t("push_status_enable_btn"))}</button>`;

  if (status.needsIOSInstall) {
    dotClass = "push-status-dot--off";
    label = t("push_status_off");
    hint = t("push_status_ios_hint");
    btnHtml = "";
  } else if (status.permission === "denied") {
    dotClass = "push-status-dot--blocked";
    label = t("push_status_blocked");
    hint = t("push_status_blocked_hint");
    btnHtml = "";
  } else if (status.permission === "granted" && status.optedIn) {
    dotClass = "push-status-dot--on";
    label = t("push_status_on");
    btnHtml = `<button type="button" class="push-status-btn push-status-btn--off" onclick="togglePushSubscription()">${escapeHtml(t("push_status_disable_btn"))}</button>`;
  }

  row.innerHTML = `
    <span class="push-status-dot ${dotClass}"></span>
    <span class="push-status-text">${escapeHtml(label)}${hint ? `<br><span class="push-status-hint">${escapeHtml(hint)}</span>` : ""}</span>
    ${btnHtml}
  `;
}

window.togglePushSubscription = async function() {
  const status = await window.PushCenter.getStatus();
  if (status.permission === "granted" && status.optedIn) {
    await window.PushCenter.unsubscribe();
  } else {
    await window.PushCenter.subscribe();
  }
  renderPushStatus();
};

window.addEventListener("push-status-changed", renderPushStatus);
renderPushStatus();

// ════════════════════════════════════════════════════════════════════
// POPUPS, VIP-LOSS MESSAGE & ADMIN PRESENCE
// ════════════════════════════════════════════════════════════════════

function showToast(message) {
  document.getElementById("toast")?.remove();
  const toast = Object.assign(document.createElement("div"), { id:"toast", innerText: message });
  document.body.appendChild(toast);
  setTimeout(() => {
    if (!toast.isConnected) return;
    toast.classList.add("toast-leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, 4700);
}
window.closePopup = () => { document.getElementById("popup").style.display = "none"; };
window.showPopup  = function(msg) {
  document.getElementById("popupMsg").innerText = msg;
  document.getElementById("popup").style.display = "flex";
  navigator.vibrate?.([200, 100, 200]);
  if (window.Notification && Notification.permission === "granted" && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(reg =>
      reg.showNotification("ODDZA", {
        body: msg,
        icon: new URL("icon-192.png", location.href).href,
        badge: new URL("badge-96.png", location.href).href,
        tag: "oddza-popup",
        renotify: true,
        vibrate: [200, 100, 200]
      })
    );
  }
};

function showVipLossMessage(message, stamp) {
  document.getElementById("vlmOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "vlmOverlay";
  overlay.className = "vlm-overlay";
  overlay.innerHTML = `
    <div class="vlm-card">
      <div class="vlm-title">${escapeHtml(t('vlm_title'))}</div>
      <div class="vlm-body">${escapeHtml(message)}</div>
      <button class="vlm-close-btn" id="vlmCloseBtn">${escapeHtml(t('vlm_close'))}</button>
    </div>`;
  document.body.appendChild(overlay);
  const dismiss = () => {
    localStorage.setItem("vipLossMsgSeen", stamp);
    overlay.remove();
  };
  document.getElementById("vlmCloseBtn").onclick = dismiss;
  overlay.addEventListener("click", e => { if (e.target === overlay) dismiss(); });
}

function isUnlockedForLossMsgTier(tier) {
  if (tier === "vip") return isEliteUnlocked();
  return isExtraTierUnlocked(tier);
}

function checkVipLossMessage() {
  if (!vipLossMsgData || !vipLossMsgData.active || !vipLossMsgData.message) return;
  const targetTiers = Array.isArray(vipLossMsgData.tiers) && vipLossMsgData.tiers.length
    ? vipLossMsgData.tiers : ["vip"];
  if (!targetTiers.some(isUnlockedForLossMsgTier)) return;
  const stamp = vipLossMsgData.updatedAt || "1";

  if (vipRedeemedAt && stamp !== "1" && new Date(vipRedeemedAt).getTime() > new Date(stamp).getTime()) return;

  if (vipLossMsgShownFor === stamp) return;       // already shown this exact message this pageload
  if (localStorage.getItem("vipLossMsgSeen") === stamp) return; // already dismissed on this device
  vipLossMsgShownFor = stamp;
  showVipLossMessage(vipLossMsgData.message, stamp);
}

function startVipLossMessageListener() {
  onSnapshot(doc(db, "_meta", "vipLossMessage"), snap => {
    vipLossMsgData = snap.exists() ? snap.data() : null;
    checkVipLossMessage();
  }, err => { console.warn("vipLossMessage listener error:", err.code || err.message); });
}

// Show the admin as online at all times. Set to false to follow the real presence signal again.
const ADMIN_ALWAYS_ONLINE = true;
const ADMIN_PRESENCE_WINDOW_MS = 45000;
let adminPresenceOnline = false;
let adminPresenceCheckTimer = null;

function evaluateAdminPresence(data) {
  if (!data || !data.online || !data.lastSeen?.toDate) return false;
  return (Date.now() - data.lastSeen.toDate().getTime()) <= ADMIN_PRESENCE_WINDOW_MS;
}

function applyAdminPresenceUI() {
  const status = document.getElementById("chatStatus");
  const label  = document.getElementById("chatOnlineText");
  const shownOnline = ADMIN_ALWAYS_ONLINE || adminPresenceOnline;
  if (status) status.classList.toggle("online", shownOnline);
  const dot = document.getElementById("chatOnlineDot");
  if (dot) dot.classList.toggle("is-online", shownOnline);
  if (label)  label.innerText = shownOnline ? t('chat_admin_online') : t('chat_admin_offline');
  if (chatModalOpen) renderChatMessages(chatLastMsgs); // ticks depend on adminPresenceOnline too
}

function startAdminPresenceListener() {
  applyAdminPresenceUI(); // paint the default (offline) copy in the right language immediately
  if (ADMIN_ALWAYS_ONLINE) return; // presence is forced online: skip the Firestore listener and 10s timer
  onSnapshot(doc(db, "_meta", "adminPresence"), snap => {
    const data = snap.exists() ? snap.data() : null;
    adminPresenceOnline = evaluateAdminPresence(data);
    applyAdminPresenceUI();
    clearInterval(adminPresenceCheckTimer);
    adminPresenceCheckTimer = setInterval(() => {
      const stillOnline = evaluateAdminPresence(data);
      if (stillOnline !== adminPresenceOnline) {
        adminPresenceOnline = stillOnline;
        applyAdminPresenceUI();
      }
    }, 10000);
  }, err => { console.warn("adminPresence listener error:", err.code || err.message); });
}

// ════════════════════════════════════════════════════════════════════
// NAVIGATION — home, categories, sections
// ════════════════════════════════════════════════════════════════════

// Slides the Free ⇄ VIP pager; replaced by initHomeSwipe() once the DOM is ready.
let syncHomePager = () => {};

window.setHomeMode = function(mode) {
  const isVip = mode === "vip";
  document.getElementById("hmToggle")?.setAttribute("data-mode", mode);
  document.getElementById("hmBtnFree")?.classList.toggle("is-on", !isVip);
  document.getElementById("hmBtnVip")?.classList.toggle("is-on", isVip);
  document.getElementById("hmGridFree")?.classList.toggle("hidden", isVip);
  document.getElementById("hmGridVip")?.classList.toggle("hidden", !isVip);
  syncHomePager(true);
};

let currentCat = "free"; // free | single | elite | overunder | full

window.toggleCatMenu = function(e) { e?.stopPropagation(); document.getElementById("catMenu").classList.toggle("open"); };
window.closeCatMenu = function() { document.getElementById("catMenu")?.classList.remove("open"); };
document.addEventListener("click", () => window.closeCatMenu());
window.catBack = function() {
  if (history.state && history.state.v === "cat") { history.back(); return; }
  window.setHomeMode(currentCat === "free" ? "free" : "vip");
  window.showSection("home");
};

let navFromPop = false;
function syncNavState(view) {
  if (navFromPop) return;
  const st = { v: view === "home" ? "home" : "cat", cat: currentCat, view };
  const cur = history.state;
  if (view === "home" || (cur && cur.v === "cat")) history.replaceState(st, "");
  else history.pushState(st, "");
}
window.addEventListener("popstate", e => {
  if (chatModalOpen) { hardCloseChat(); return; }
  const st = e.state;
  navFromPop = true;
  try {
    if (st && st.v === "cat") {
      currentCat = st.cat;
      if (st.view === "history") window.showCatHistory(); else window.showCatToday();
    } else {
      window.setHomeMode(currentCat === "free" ? "free" : "vip");
      window.showSection("home");
    }
  } finally { navFromPop = false; }
});

function updateCatTabs(view) {
  document.body.dataset.cat = currentCat;
  document.body.dataset.view = view;
  const titleEl = document.getElementById("catTitle");
  if (titleEl) titleEl.textContent = currentCat === "free" ? t("home_card_free_title") : tierDisplayName(currentCat);
  document.body.classList.toggle("in-cat", view !== "home");
  syncNavState(view);
  document.getElementById("catTabToday")?.classList.toggle("is-on", view === "today");
  document.getElementById("catTabHist")?.classList.toggle("is-on", view === "history");
}

window.showCatToday = function() {
  if (currentCat === "free") window.showSection("free");
  else window.showSection("vip", currentCat);
};

window.showCatHistory = function() {
  if (currentCat === "full") return;
  ["homeSection","freeSection","vipSection"].forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById("historySection").classList.remove("hidden");
  document.body.classList.remove("home-active");
  window.ensureHistoryLoaded();
  const isFree = currentCat === "free";
  document.getElementById("historyFreeWrap").classList.toggle("hidden", !isFree);
  document.getElementById("historyVipWrap").classList.toggle("hidden", isFree);
  if (isFree) renderHistoryPage("free");
  else window.showHistVipTier(currentCat);
  updateCatTabs("history");
  scrollMainTop({ top: 0 });
};

window.showSection = function(type, tier) {
  if (type === "history") { window.showCatHistory(); return; }
  ["homeSection","freeSection","vipSection","historySection"].forEach(id =>
    document.getElementById(id).classList.add("hidden")
  );
  document.body.classList.toggle("home-active", type === "home");

  if (type === "home") {
    document.getElementById("homeSection").classList.remove("hidden");
    scrollMainTop({ top: 0 });
    updateCatTabs("home");
  } else if (type === "free") {
    currentCat = "free"; updateCatTabs("today");
    document.getElementById("freeSection").classList.remove("hidden");
    flashSectionLoading("free");
    scrollMainTop({ top: 0 });
  } else if (type === "vip") {
    document.getElementById("vipSection").classList.remove("hidden");
    if (!isEliteUnlocked()) {
      document.getElementById("authBox").style.display = "block";
    }
    window.showVipTier(tier || currentVipTier || "elite");
    flashSectionLoading("vip");
  } else {
    document.getElementById("historySection").classList.remove("hidden");
    const histType = document.getElementById("historyVipWrap").classList.contains("hidden") ? "free" : "vip";
    showHistoryType(histType);
    scrollMainTop({ top: 0 });
  }
};

window.showHistoryType = function(type) {
  document.getElementById("historyFreeWrap").classList.toggle("hidden", type !== "free");
  document.getElementById("historyVipWrap").classList.toggle("hidden",  type !== "vip");
  if (type === "vip" && !window.__histVipTierChosen) window.showHistVipTier("elite");
};

window.showHistVipTier = function(tier) {
  window.__histVipTierChosen = true;
  document.getElementById("histVipPanelSingle")?.classList.toggle("hidden", tier !== "single");
  document.getElementById("histVipPanelElite")?.classList.toggle("hidden", tier !== "elite");
  document.getElementById("histVipPanelOverunder")?.classList.toggle("hidden", tier !== "overunder");

  renderHistoryPage(tier);
};

// ════════════════════════════════════════════════════════════════════
// VIP — ELITE TIER (plans, expiry, countdown, codes)
// ════════════════════════════════════════════════════════════════════

function planFor(tier) {
  const box = document.getElementById(tier === "elite" ? "authBox" : "authBox_" + tier);
  const el = box && box.querySelector(".plan-card.selected");
  return el ? { label: el.dataset.label, price: el.dataset.price } : null;
}
window.selectPlan = function(el) {
  (el.closest(".vip-plans, .full-package-plans") || document).querySelectorAll(".plan-card").forEach(c => c.classList.remove("selected"));
  el.classList.add("selected");
};
window.selectFullPlan = window.selectPlan;

window.showVipTier = function(tier) {
  currentVipTier = tier;
  currentCat = tier; updateCatTabs("today");

  document.getElementById("tierPanelSingle")?.classList.toggle("hidden", tier !== "single");
  document.getElementById("tierPanelElite")?.classList.toggle("hidden", tier !== "elite");
  document.getElementById("tierPanelOverunder")?.classList.toggle("hidden", tier !== "overunder");
  document.getElementById("tierPanelFull")?.classList.toggle("hidden", tier !== "full");

  document.getElementById("vipTierDetail")?.classList.remove("hidden");
  scrollMainTop({ top: 0, behavior: "smooth" });
};

function scheduleAutoLogout(expiryDate) {
  if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
  const msLeft = expiryDate - now();
  if (msLeft <= 0) { performExpiryLogout(); return; }
  const maxTimeout = 2147483647;
  if (msLeft > maxTimeout) {
    autoLogoutTimer = setTimeout(() => scheduleAutoLogout(expiryDate), maxTimeout);
  } else {
    autoLogoutTimer = setTimeout(performExpiryLogout, msLeft);
  }
}

function performExpiryLogout() {
  clearStoredCode();
  vipUnlocked   = false;
  vipExpiryDate = null;
  document.getElementById("vipRequestCard")?.remove();
  if (!fullPackageActive) {
    showPopup(t('vip_expired_popup'));
    addNotification(t('vip_expired_notif'));
  }
  renderEliteFullPackageStatus();
  window.dispatchEvent(new Event("vip-status-changed"));
}

function verifyAllVipExpiries() {
  const n = now();
  if (vipUnlocked && vipExpiryDate && n > vipExpiryDate) performExpiryLogout();
  if (fullPackageActive && fullPackageExpiry && n > fullPackageExpiry) performExtraExpiryLogout("full");
  ["single", "overunder"].forEach(tier => {
    const st = extraTierState[tier];
    if (st && st.unlocked && st.expiryDate && n > st.expiryDate) performExtraExpiryLogout(tier);
  });
}
function startVipExpirySafetyNet() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") verifyAllVipExpiries();
  });
  setInterval(() => { if (!document.hidden) verifyAllVipExpiries(); }, 30000);
}

let countdownInterval = null;

let activeCountdowns = {}; // elId -> intervalId

function startCountdownFor(elId, expiryDate) {
  if (!expiryDate) return;
  if (activeCountdowns[elId]) clearInterval(activeCountdowns[elId]);
  updateCountdownFor(elId, expiryDate);
  activeCountdowns[elId] = setInterval(() => { if (!document.hidden) updateCountdownFor(elId, expiryDate); }, 1000);
}
function stopCountdownFor(elId) {
  if (activeCountdowns[elId]) { clearInterval(activeCountdowns[elId]); delete activeCountdowns[elId]; }
}
function stopAllCountdowns() {
  Object.keys(activeCountdowns).forEach(stopCountdownFor);
}
function updateCountdownFor(elId, expiryDate) {
  const wrap = document.getElementById(elId);
  if (!wrap) { stopCountdownFor(elId); return; }
  const msLeft = expiryDate - now();
  if (msLeft <= 0) {
    wrap.innerHTML = `<div class="cd-unit"><b>0</b><span>${t('cd_expired')}</span></div>`;
    return;
  }
  const totalSeconds = Math.floor(msLeft / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const mins    = Math.floor((totalSeconds % 3600) / 60);
  const secs    = totalSeconds % 60;

  wrap.innerHTML = `
    <div class="cd-unit"><b>${days}</b><span>${t('cd_days')}</span></div>
    <span class="cd-sep">:</span>
    <div class="cd-unit"><b>${String(hours).padStart(2,"0")}</b><span>${t('cd_hrs')}</span></div>
    <span class="cd-sep">:</span>
    <div class="cd-unit"><b>${String(mins).padStart(2,"0")}</b><span>${t('cd_min')}</span></div>
    <span class="cd-sep">:</span>
    <div class="cd-unit"><b>${String(secs).padStart(2,"0")}</b><span>${t('cd_sec')}</span></div>`;
  wrap.classList.toggle("urgent", days < 1);
}

function startCountdownDisplay() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (!vipExpiryDate) return;
  updateCountdownFor("vipCountdownWrap", vipExpiryDate);
  countdownInterval = setInterval(() => { if (!document.hidden) updateCountdownFor("vipCountdownWrap", vipExpiryDate); }, 1000);
}

function buildVipCard(html) {
  const slot = document.getElementById("vipStatusSlot");
  if (!slot) return;
  slot.innerHTML = `<div id="vipRequestCard">${html}</div>`;
}

function clearStoredCode() {
  localStorage.removeItem("vipCode");
  localStorage.removeItem("vipWasUnlocked");
  currentVipCode = null;
}

function buildVipTierBadge(data) {
  if (!data.redeemedAt || !data.expiry) return "";
  const redeemed = new Date(data.redeemedAt);
  const expiry   = new Date(data.expiry + "T23:59:59");
  const days     = Math.round((expiry - redeemed) / 86400000);
  if (!isFinite(days) || days <= 0) return "";

  const tier = days >= 60 ? "diamond" : days >= 21 ? "gold" : "bronze";

  return `<span class="vip-tier ${tier} vip-tier-pill">${tier.toUpperCase()}</span>`;
}

const SUPPORT_EMAIL = "info.oddza@gmail.com";

// One compact info box per section: [VIP status + countdown] / [booking codes] / [support email]
function bookingChipsHTML(codes) {
  if (!codes) return "";
  const chip = (cls, name, code) => code ? `
    <div class="booking-code-item ${cls}" data-bc-code="${escapeHtml(code)}">
      <span class="bc-platform">${name}</span>
      <span class="bc-code">${escapeHtml(code)}</span>
    </div>` : "";
  return chip("betpawa", "BetPawa", codes.betpawaCode) + chip("sportybet", "SportyBet", codes.sportybetCode);
}

function buildStatusRow({ expLabel, badge, countdownId }) {
  return `
    <div class="ti-status">
      <div class="ti-status-txt">
        <div class="ti-title"><b>${t('vip_active')}</b>${badge || ""}</div>
        <small>${t('vip_expires')} ${escapeHtml(expLabel || "")}</small>
      </div>
      <div class="vip-countdown-live" id="${countdownId}"></div>
    </div>`;
}

function buildTierInfoBox({ status = "", codes = null, after = "" } = {}) {
  const chips = bookingChipsHTML(codes);
  return `
    <div class="tier-info">
      ${status}
      ${chips ? `<div class="ti-codes">${chips}</div>` : ""}
      <a class="ti-mail" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
    </div>${after}`;
}

function renderFreeInfo() {
  const slot = document.getElementById("tierInfo_free");
  if (slot) slot.innerHTML = buildTierInfoBox({ codes: bookingCodes.free });
}

let eliteOwnData = null;
function renderEliteInfo() {
  if (vipUnlocked && eliteOwnData) {
    buildVipCard(buildTierInfoBox({
      status: buildStatusRow({ expLabel: eliteOwnData.expiry, badge: buildVipTierBadge(eliteOwnData), countdownId: "vipCountdownWrap" }),
      codes: bookingCodes.vip,
      after: buildRenewalBanner(vipExpiryDate, "elite")
    }));
    startCountdownDisplay();
  } else {
    renderEliteFullPackageStatus();
  }
}

const RENEWAL_WARNING_DAYS = 3;

function tierDisplayName(tier) {
  return tier === "single" ? t('tier_single_name') :
         tier === "overunder" ? t('tier_overunder_name') :
         tier === "full" ? t('tier_full_name') : t('tier_elite_name');
}

function buildRenewalBanner(expDate, tier) {
  if (!expDate) return "";
  const msLeft   = expDate - now();
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft > RENEWAL_WARNING_DAYS || msLeft <= 0) return "";
  const label = daysLeft <= 1 ? t('vip_renewal_today') : t('vip_renewal_days', { days: daysLeft });
  return `
    <div class="vip-renewal-banner">
      <span class="vip-renewal-text">${label}</span>
      <button type="button" class="vip-renewal-btn" onclick="openChatForRenewal('${tier}')">${t('btn_renew_now')}</button>
    </div>`;
}

window.openChatForRenewal = function(tier) {
  openChatModal();
  setTimeout(() => {
    const input = document.getElementById("chatInput");
    if (!input || input.value) return;
    input.value = t('chat_prefill_renew', { tier: tierDisplayName(tier) });
  }, 60);
};

// A failed claim transaction is NOT the same as "already claimed" (that case
// is handled by status "in_use"). Show the real reason instead.
function claimErrorText(o) {
  const c = o && o.code;
  if (c === "permission-denied" || c === "unauthenticated") return t('code_denied');
  if (c === "unavailable" || c === "deadline-exceeded") return t('code_network');
  return t('code_error', { msg: (o && o.message) || "" });
}

function renderCodeError(msgEl, text, tier) {
  if (!msgEl) return;
  msgEl.style.color = "var(--coral)";
  msgEl.innerHTML = `${escapeHtml(text)} <span class="code-help-link" onclick="openChatForVipRequest('${tier}')">${t('code_help_link')}</span>`;
}

async function recordVipHistory(tier, expiry) {
  try {
    const myId = getVisitorId();
    if (!myId) return;
    await setDoc(doc(db, "analytics_visitors", myId), {
      vipHistory: arrayUnion({ tier, redeemedAt: now().toISOString(), expiry: expiry || null })
    }, { merge: true });
  } catch { /* non-critical */ }
}

// ── Server-side VIP entitlement ─────────────────────────────────────────
// Firestore rules only serve VIP tips to a user whose vip_access/{uid} points
// to a live code redeemed by that same uid. The UI lock is no longer the gate.
const grantedThisSession = new Set();

async function grantVipAccess(key, code) {
  const myId = getVisitorId();
  if (!myId || !code) return false;
  const k = key + ":" + code;
  if (grantedThisSession.has(k)) return "cached";
  try {
    await setDoc(doc(db, "vip_access", myId), { [key]: code }, { merge: true });
    grantedThisSession.add(k);
    return "new";
  } catch (e) {
    console.error("grantVipAccess failed:", e && e.code, e && e.message);
    return false;
  }
}

async function claimCodeForMe(col, code) {
  const myId = getVisitorId();
  if (!myId) return false;
  const ref = doc(db, col, code);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return false;
      const d = snap.data();
      if (d.redeemedBy && d.redeemedBy !== myId) return false;
      if (!d.redeemedBy) tx.update(ref, { redeemedBy: myId, redeemedAt: now().toISOString() });
      return true;
    });
  } catch { return false; }
}

// Called when a live code is seen (also migrates users who unlocked before
// entitlements existed). Restarts the gated listeners once access is granted.
function ensureVipAccess(col, key, code, data) {
  (async () => {
    const myId = getVisitorId();
    if (data && !data.redeemedBy && !(await claimCodeForMe(col, code))) return;
    if (data && data.redeemedBy && data.redeemedBy !== myId) return;
    const r = await grantVipAccess(key, code);
    if (r === "new") window.dispatchEvent(new Event("vip-access-granted"));
  })();
}

// Public counts only (no names / tips) so locked users can see "N premium tips".
let vipTeaser = { date: null, elite: 0, single: 0, overunder: 0 };
function teaserCount(tier) { return vipTeaser.date === date ? (vipTeaser[tier] || 0) : 0; }

function startVipTeaserListener() {
  onSnapshot(doc(db, "_meta", "vipTeaser"), snap => {
    const d = snap.exists() ? snap.data() : {};
    vipTeaser = { date: d.date || null, elite: +d.elite || 0, single: +d.single || 0, overunder: +d.overunder || 0 };
    processTodayMatches();
    processExtraTierMatches("single");
    processExtraTierMatches("overunder");
  }, () => { /* teaser is optional */ });
}

function lockedPlaceholderHTML(n) {
  let h = "";
  for (let i = 0; i < n; i++) {
    h += `
    <div class="league-group"><div class="match-list">
      <div class="match-card is-locked" style="--i:${i}" data-status="locked">
        <div class="match-body">
          <div class="locked-teams-wrap">
            <div class="match-teams locked-teams-blur"><span class="match-team home">••••••••</span><span class="match-vs">VS</span><span class="match-team away">••••••••</span></div>
            <div class="lock-badge">${t('lock_reveal')}</div>
          </div>
        </div>
        <div class="match-tip-bar"><div><span class="tip-label vip-premium">${t('tip_premium')}</span></div><span class="odd-badge dim">•••</span></div>
      </div>
    </div></div>`;
  }
  return h;
}

function subscribeToCode(code) {
  if (codeUnsub) codeUnsub();
  const codeRef = doc(db, "vip_codes", code);
  codeUnsub = onSnapshot(codeRef, snap => {
    // OFFLINE GUARD: a cache-only snapshot with no doc does NOT mean the code was
    // deleted. Keep the stored code and wait for the real server answer.
    if (!snap.exists() && snap.metadata.fromCache) return;
    vipUnlocked   = false;
    vipExpiryDate = null;
    vipRedeemedAt = null;
    eliteOwnData  = null;
    if (autoLogoutTimer)   clearTimeout(autoLogoutTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById("vipRequestCard")?.remove();

    if (!snap.exists()) {
      clearStoredCode();
      renderEliteFullPackageStatus();
      window.dispatchEvent(new Event("vip-status-changed"));
      return;
    }

    const data = snap.data();
    const n    = now();
    const exp  = data.expiry ? new Date(data.expiry + "T23:59:59") : null;
    const myId = getVisitorId();

    if (data.redeemedBy && data.redeemedBy !== myId) {
      clearStoredCode();
      renderEliteFullPackageStatus();
      window.dispatchEvent(new Event("vip-status-changed"));
      return;
    }

    if (data.active && exp && n <= exp) {
      vipUnlocked   = true;
      vipExpiryDate = exp;
      vipRedeemedAt = data.redeemedAt || null;

      scheduleAutoLogout(exp);
      ensureVipAccess("vip_codes", "elite", code, data);
      document.getElementById("authBox").style.display = "none";

      if (!localStorage.getItem("vipWasUnlocked")) {
        localStorage.setItem("vipWasUnlocked", "1");
        setTimeout(() => { showToast(t('vip_unlocked_toast')); }, 500);
        addNotification(t('vip_unlocked_notif'));
        markVisitorVipUnlocked();
      }

      eliteOwnData = data;
      renderEliteInfo();
      window.dispatchEvent(new Event("vip-status-changed"));
    } else if (snap.metadata.fromCache) {
      // Offline: stale cache / wrong device clock must not wipe the code.
      renderEliteFullPackageStatus();
      window.dispatchEvent(new Event("vip-status-changed"));
    } else {
      const wasStored = currentVipCode === code;
      clearStoredCode();
      if (wasStored) {
        showPopup(!data.active ? t('code_disabled_popup') : t('code_expired_popup'));
      }
      renderEliteFullPackageStatus();
      window.dispatchEvent(new Event("vip-status-changed"));
    }
  }, err => console.warn("vip code listener:", err && err.code));
}

function initVipCode() {
  if (currentVipCode) {
    subscribeToCode(currentVipCode);
  } else {
    renderEliteFullPackageStatus();
  }
}

window.unlockVipCode = async function() {
  const input = document.getElementById("vipCodeInput");
  const msgEl = document.getElementById("codeMsg");
  const btn   = document.getElementById("authBtn");
  const code  = input.value.trim().toUpperCase();

  if (!code) {
    msgEl.style.color = "var(--coral)";
    msgEl.innerText = t('code_empty');
    return;
  }

  btn.disabled = true; btn.innerText = t('btn_checking');
  msgEl.style.color = "var(--slate)";
  msgEl.innerText = "";

  try {
    const codeRef  = doc(db, "vip_codes", code);
    const snap = await getDoc(codeRef);

    if (!snap.exists()) {
      renderCodeError(msgEl, t('code_invalid'), "elite");
    } else {
      const myId    = getVisitorId();
      const n       = now();

      let outcome;
      try {
        outcome = await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(codeRef);
          if (!freshSnap.exists()) return { status: "invalid" };
          const data = freshSnap.data();
          const exp  = data.expiry ? new Date(data.expiry + "T23:59:59") : null;

          if (!data.active) return { status: "disabled" };
          if (!exp || n > exp) return { status: "expired" };
          if (data.redeemedBy && data.redeemedBy !== myId) return { status: "in_use" };

          if (!data.redeemedBy) {
            tx.update(codeRef, { redeemedBy: myId, redeemedAt: n.toISOString() });
          }
          return { status: "ok", expiry: data.expiry || null };
        });
      } catch (txErr) {
        console.error("claim transaction failed:", txErr.code, txErr.message);
        outcome = { status: "claim_error", code: txErr.code, message: txErr.message };
      }

      if (outcome.status === "disabled") {
        renderCodeError(msgEl, t('code_disabled'), "elite");
      } else if (outcome.status === "expired") {
        renderCodeError(msgEl, t('code_expired'), "elite");
      } else if (outcome.status === "in_use") {
        renderCodeError(msgEl, t('code_in_use'), "elite");
      } else if (outcome.status === "invalid") {
        renderCodeError(msgEl, t('code_invalid'), "elite");
      } else if (outcome.status === "claim_error") {
        renderCodeError(msgEl, claimErrorText(outcome), "elite");
      } else {
        localStorage.setItem("vipCode", code);
        currentVipCode = code;
        msgEl.style.color = "var(--pitch)";
        msgEl.innerText = t('code_accepted');
        recordVipHistory("elite", outcome.expiry);
        await grantVipAccess("elite", code);
        subscribeToCode(code);
      }
    }
  } catch (e) {
    console.error("unlockVipCode failed:", e.code, e.message);
    msgEl.style.color = "var(--coral)";
    msgEl.innerText = t('code_error', { msg: e.message || "" });
  }

  btn.disabled = false; btn.innerText = t('btn_unlock_vip');
};

window.pasteVipCode = async function() {
  const input = document.getElementById("vipCodeInput");
  const msgEl = document.getElementById("codeMsg");
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      input.value = text.trim().toUpperCase();
      input.focus();
    } else {
      msgEl.style.color = "var(--slate)";
      msgEl.innerText = t('clipboard_empty');
    }
  } catch {
    msgEl.style.color = "var(--coral)";
    msgEl.innerText = t('clipboard_error');
    input.focus();
  }
};

// ════════════════════════════════════════════════════════════════════
// VIP — EXTRA TIERS (Single, Over-Under, Full Package)
// ════════════════════════════════════════════════════════════════════

const EXTRA_TIERS = {
  single:    { matchesCol: "matches_vip_single",    codesCol: "vip_codes_single" },
  overunder: { matchesCol: "matches_vip_overunder",  codesCol: "vip_codes_overunder" },
  full:      { matchesCol: null,                     codesCol: "vip_codes_full" },
};

let fullPackageActive     = false;
let fullPackageExpiry     = null; // Date
let fullPackageExpiryText = null; // raw "DD.MM.YYYY" string, for display

function markFullPackageUnlocked(exp, expiryText) {
  fullPackageActive     = true;
  fullPackageExpiry     = exp;
  fullPackageExpiryText = expiryText;
}
function clearFullPackage() {
  fullPackageActive     = false;
  fullPackageExpiry     = null;
  fullPackageExpiryText = null;
}
function isEliteUnlocked() {
  return vipUnlocked || (fullPackageActive && fullPackageExpiry && now() <= fullPackageExpiry);
}

function renderEliteFullPackageStatus() {
  const authBox   = document.getElementById("authBox");
  if (vipUnlocked) return; // Elite's own code already governs the UI

  if (fullPackageActive) {
    vipExpiryDate = fullPackageExpiry;
    if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
    if (authBox)   authBox.style.display = "none";
    buildVipCard(buildTierInfoBox({
      status: buildStatusRow({ expLabel: fullPackageExpiryText, badge: buildVipTierBadge({ redeemedAt: extraTierState.full.redeemedAt, expiry: fullPackageExpiryText }), countdownId: "vipCountdownWrap" }),
      codes: bookingCodes.vip
    }));
    startCountdownDisplay();
  } else {
    vipExpiryDate = null;
    buildVipCard(buildTierInfoBox({}));
    if (authBox)   authBox.style.display = "block";
  }
}

function refreshExtraTiersFromFullPackage() {
  Object.keys(EXTRA_TIERS).forEach(tier => {
    if (tier === "full") return; // the Full Package box manages its own status itself
    renderExtraTierStatus(tier);
    processExtraTierMatches(tier);
  });
  renderEliteFullPackageStatus();
  processTodayMatches();
}

let extraTierState = {};
let extraTierMatches = { single: [], overunder: [] };
let extraTierLoaded  = { single: false, overunder: false };

Object.keys(EXTRA_TIERS).forEach(tier => {
  extraTierState[tier] = {
    unlocked: false, expiryDate: null, expiryText: null, redeemedAt: null,
    code: localStorage.getItem("vipCode_" + tier) || null,
    unsub: null, autoLogoutTimer: null
  };
});

function isExtraTierUnlocked(tier) {
  return extraTierState[tier].unlocked ||
    (fullPackageActive && fullPackageExpiry && now() <= fullPackageExpiry);
}

function extraTierIds(tier) {
  return {
    authBox:    "authBox_" + tier,
    input:      "vipCodeInput_" + tier,
    msg:        "codeMsg_" + tier,
    btn:        "authBtn_" + tier,
    dataEl:     "vipData_" + tier,
    emptyEl:    "empty_" + tier,
    statusSlot: "vipStatusSlot_" + tier,
    summaryBox: "summary_" + tier,
    skeleton:   "skeleton_" + tier,
    oddsBanner: "oddsBanner_" + tier,
    oddsVal:    "oddsHeroVal_" + tier,
  };
}

function scheduleExtraAutoLogout(tier, expiryDate) {
  const st = extraTierState[tier];
  if (st.autoLogoutTimer) clearTimeout(st.autoLogoutTimer);
  const msLeft = expiryDate - now();
  const maxTimeout = 2147483647;
  if (msLeft <= 0) { performExtraExpiryLogout(tier); return; }
  if (msLeft > maxTimeout) st.autoLogoutTimer = setTimeout(() => scheduleExtraAutoLogout(tier, expiryDate), maxTimeout);
  else st.autoLogoutTimer = setTimeout(() => performExtraExpiryLogout(tier), msLeft);
}

function performExtraExpiryLogout(tier) {
  localStorage.removeItem("vipCode_" + tier);
  const st = extraTierState[tier];
  st.code = null; st.unlocked = false; st.expiryDate = null; st.expiryText = null;

  if (tier === "full") {
    clearFullPackage();
    showPopup(t('vip_expired_popup'));
    addNotification(t('vip_expired_notif'));
    refreshExtraTiersFromFullPackage();
    window.dispatchEvent(new Event("vip-status-changed"));
    renderExtraTierStatus(tier);
    processExtraTierMatches(tier);
    return;
  }

  const ids = extraTierIds(tier);
  const authBox = document.getElementById(ids.authBox);
  if (authBox && !isExtraTierUnlocked(tier)) authBox.style.display = "block";
  if (!fullPackageActive) {
    showPopup(t('vip_expired_popup'));
    addNotification(t('vip_expired_notif'));
  }
  renderExtraTierStatus(tier);
  processExtraTierMatches(tier);
}

function renderExtraTierStatus(tier) {
  const ids  = extraTierIds(tier);
  const slot = document.getElementById(ids.statusSlot);
  if (!slot) return;
  const st       = extraTierState[tier];
  const unlocked = isExtraTierUnlocked(tier);
  const authBox  = document.getElementById(ids.authBox);

  if (unlocked) {
    if (authBox) authBox.style.display = "none";
    const expLabel   = st.unlocked ? st.expiryText  : fullPackageExpiryText;
    const expDate    = st.unlocked ? st.expiryDate  : fullPackageExpiry;
    const redeemedAt = st.unlocked ? st.redeemedAt  : extraTierState.full.redeemedAt;
    const countdownId = "vipCountdownWrap_" + tier;
    slot.innerHTML = buildTierInfoBox({
      status: buildStatusRow({ expLabel, badge: buildVipTierBadge({ redeemedAt, expiry: expLabel }), countdownId }),
      codes: bookingCodes[tier],
      after: buildRenewalBanner(expDate, tier)
    });
    startCountdownFor(countdownId, expDate);
  } else {
    slot.innerHTML = buildTierInfoBox({});
    stopCountdownFor("vipCountdownWrap_" + tier);
    if (authBox) authBox.style.display = "block";
  }
}

function subscribeExtraCode(tier, code) {
  const st = extraTierState[tier];
  if (st.unsub) st.unsub();
  const codeRef = doc(db, EXTRA_TIERS[tier].codesCol, code);
  st.unsub = onSnapshot(codeRef, snap => {
    // OFFLINE GUARD (see subscribeToCode)
    if (!snap.exists() && snap.metadata.fromCache) return;
    st.unlocked = false; st.expiryDate = null; st.expiryText = null; st.redeemedAt = null;
    if (st.autoLogoutTimer) clearTimeout(st.autoLogoutTimer);
    stopCountdownFor("vipCountdownWrap_" + tier);

    if (!snap.exists()) {
      localStorage.removeItem("vipCode_" + tier); st.code = null;
    } else {
      const data = snap.data();
      const n    = now();
      const exp  = data.expiry ? new Date(data.expiry + "T23:59:59") : null;
      const myId = getVisitorId();

      if (data.redeemedBy && data.redeemedBy !== myId) {
        localStorage.removeItem("vipCode_" + tier); st.code = null;
      } else if (data.active && exp && n <= exp) {
        st.unlocked = true; st.expiryDate = exp; st.expiryText = data.expiry || null;
        st.redeemedAt = data.redeemedAt || null;
        scheduleExtraAutoLogout(tier, exp);
        ensureVipAccess(EXTRA_TIERS[tier].codesCol, tier, code, data);
      } else if (snap.metadata.fromCache) {
        // Offline: keep the stored code, wait for server confirmation
      } else {
        const wasStored = st.code === code;
        localStorage.removeItem("vipCode_" + tier); st.code = null;
        if (wasStored && !fullPackageActive) {
          showPopup(!data.active ? t('code_disabled_popup') : t('code_expired_popup'));
        }
      }
    }

    if (tier === "full") {
      if (st.unlocked) markFullPackageUnlocked(st.expiryDate, st.expiryText);
      else clearFullPackage();
      refreshExtraTiersFromFullPackage();
      window.dispatchEvent(new Event("vip-status-changed"));
    }

    if (tier !== "full") syncExtraTierListener(tier, false);
    renderExtraTierStatus(tier);
    processExtraTierMatches(tier);
  }, err => console.warn("extra code listener:", tier, err && err.code));
}

function initExtraTier(tier) {
  const st = extraTierState[tier];
  if (st.code) subscribeExtraCode(tier, st.code);
  else renderExtraTierStatus(tier);
}

function applyDirectGrants(directGrants) {
  if (!directGrants) return;
  Object.keys(directGrants).forEach(tier => {
    const grant = directGrants[tier];
    if (!grant || !grant.code) return;

    const seenKey = "directGrantSeen_" + tier;
    if (localStorage.getItem(seenKey) === grant.code) return;
    localStorage.setItem(seenKey, grant.code);

    if (tier === "vip") {
      if (currentVipCode === grant.code) return;
      localStorage.setItem("vipCode", grant.code);
      currentVipCode = grant.code;
      subscribeToCode(grant.code);
      recordVipHistory("elite", grant.expiry || null);
    } else if (EXTRA_TIERS[tier]) {
      const st = extraTierState[tier];
      if (!st || st.code === grant.code) return;
      localStorage.setItem("vipCode_" + tier, grant.code);
      st.code = grant.code;
      subscribeExtraCode(tier, grant.code);
      recordVipHistory(tier, grant.expiry || null);
    }
  });
}

window.unlockExtraVipCode = async function(tier) {
  const ids   = extraTierIds(tier);
  const input = document.getElementById(ids.input);
  const msgEl = document.getElementById(ids.msg);
  const btn   = document.getElementById(ids.btn);
  const code  = input.value.trim().toUpperCase();

  if (!code) { msgEl.style.color = "var(--coral)"; msgEl.innerText = t('code_empty'); return; }

  btn.disabled = true; btn.innerText = t('btn_checking');
  msgEl.style.color = "var(--slate)"; msgEl.innerText = "";

  try {
    const codeRef = doc(db, EXTRA_TIERS[tier].codesCol, code);
    const myId = getVisitorId();
    const n    = now();
    let outcome;
    try {
      outcome = await runTransaction(db, async (tx) => {
        const freshSnap = await tx.get(codeRef);
        if (!freshSnap.exists()) return { status: "invalid" };
        const data = freshSnap.data();
        const exp  = data.expiry ? new Date(data.expiry + "T23:59:59") : null;
        if (!data.active) return { status: "disabled" };
        if (!exp || n > exp) return { status: "expired" };
        if (data.redeemedBy && data.redeemedBy !== myId) return { status: "in_use" };
        if (!data.redeemedBy) tx.update(codeRef, { redeemedBy: myId, redeemedAt: n.toISOString() });
        return { status: "ok", expiry: data.expiry || null };
      });
    } catch (txErr) {
      console.error("extra claim transaction failed:", tier, txErr.code, txErr.message);
      outcome = { status: "claim_error", code: txErr.code, message: txErr.message };
    }

    if (outcome.status === "disabled")         { renderCodeError(msgEl, t('code_disabled'), tier); }
    else if (outcome.status === "expired")     { renderCodeError(msgEl, t('code_expired'), tier); }
    else if (outcome.status === "in_use")      { renderCodeError(msgEl, t('code_in_use'), tier); }
    else if (outcome.status === "invalid")     { renderCodeError(msgEl, t('code_invalid'), tier); }
    else if (outcome.status === "claim_error") { renderCodeError(msgEl, claimErrorText(outcome), tier); }
    else {
      localStorage.setItem("vipCode_" + tier, code);
      extraTierState[tier].code = code;
      msgEl.style.color = "var(--pitch)"; msgEl.innerText = t('code_accepted');
      recordVipHistory(tier, outcome.expiry);
      await grantVipAccess(tier, code);
      subscribeExtraCode(tier, code);
    }
  } catch (e) {
    msgEl.style.color = "var(--coral)";
    msgEl.innerText = t('code_error', { msg: e.message || "" });
  }

  btn.disabled = false; btn.innerText = t('btn_unlock_vip');
};

window.pasteExtraVipCode = async function(tier) {
  const ids   = extraTierIds(tier);
  const input = document.getElementById(ids.input);
  const msgEl = document.getElementById(ids.msg);
  try {
    const text = await navigator.clipboard.readText();
    if (text) { input.value = text.trim().toUpperCase(); input.focus(); }
    else { msgEl.style.color = "var(--slate)"; msgEl.innerText = t('clipboard_empty'); }
  } catch {
    msgEl.style.color = "var(--coral)"; msgEl.innerText = t('clipboard_error'); input.focus();
  }
};

function renderExtraGroupedByLeague(builtRows, unlocked) {
  if (builtRows.length === 0) return "";
  return builtRows.map(row => {
    const timeLabel = row.m.time || "--:--";
    if (unlocked) {
      const league = buildLeagueLabel(row.m) || t('other_matches');
      return `
        <div class="league-group">
          ${buildLeagueHeader(league, timeLabel, row.status)}
          <div class="match-list">${row.styledHtml}</div>
        </div>`;
    }
    return `
      <div class="league-group">
        ${buildVipHeader(timeLabel, row.status)}
        <div class="match-list">${row.styledHtml}</div>
      </div>`;
  }).join("");
}

function processExtraTierMatches(tier) {
  if (!extraTierLoaded[tier]) return;
  const ids      = extraTierIds(tier);
  const unlocked = isExtraTierUnlocked(tier);

  const rows = (unlocked ? extraTierMatches[tier] : [])
    .map(m => ({ m, matchTime: buildMatchTime(m.date, m.time) }))
    .sort((a, b) => a.matchTime - b.matchTime);

  let win = 0, lost = 0, pending = 0, odds = 1, streak = 0, prevWin = true;
  const built = rows.map(({ m, matchTime }, idx) => {
    const { html, status, oddVal } = buildRow(m, matchTime, false, unlocked);
    odds *= oddVal;
    if (status === "win")        { win++; if (prevWin) streak++; prevWin = true; }
    else if (status === "lost")  { lost++; prevWin = false; streak = 0; }
    else if (status !== "void")  { pending++; }
    return { m, styledHtml: html.replace('class="match-card', `style="--i:${idx}" class="match-card`), status };
  });

  swapSkeletonForContent(document.getElementById(ids.skeleton));
  const dataEl  = document.getElementById(ids.dataEl);
  const emptyEl = document.getElementById(ids.emptyEl);
  const total   = win + lost + pending;

  const teaseN = unlocked ? 0 : teaserCount(tier);
  if (dataEl)  dataEl.innerHTML = unlocked
    ? renderExtraGroupedByLeague(built, unlocked)
    : lockedPlaceholderHTML(teaseN);
  if (dataEl && emptyEl) {
    if (total > 0 || teaseN > 0) {
      dataEl.style.display = ""; dataEl.classList.add("fade-in-block"); emptyEl.classList.add("hidden");
    } else {
      dataEl.style.display = "none"; emptyEl.classList.remove("hidden"); emptyEl.classList.add("fade-in-block");
    }
  }

  const done = win + lost;
  const rate = done > 0 ? Math.round((win / done) * 100) : 0;
  const sb = document.getElementById(ids.summaryBox);
  if (sb) {
    if (total > 0) {
      sb.style.display = "";
      const set = (role, val) => { const el = sb.querySelector(`[data-role="${role}"]`); if (el) el.innerText = val; };
      set("win", win); set("lost", lost); set("rate", rate + "%"); set("odds", odds.toFixed(2));
    } else {
      sb.style.display = "none";
    }
  }

  const oddsBanner = document.getElementById(ids.oddsBanner);
  if (oddsBanner) {
    oddsBanner.style.display = total > 0 ? "flex" : "none";
    const oddsValEl = document.getElementById(ids.oddsVal);
    if (oddsValEl) oddsValEl.innerText = odds.toFixed(2);
  }
}

const extraTierUnsub = {};
const extraTierListenerMode = {};

function syncExtraTierListener(tier, force) {
  const want = isExtraTierUnlocked(tier) ? "on" : "off";
  if (!force && want === extraTierListenerMode[tier]) return;
  if (extraTierUnsub[tier]) { extraTierUnsub[tier](); extraTierUnsub[tier] = null; }
  extraTierListenerMode[tier] = want;

  if (want === "off") {
    extraTierMatches[tier] = [];
    extraTierLoaded[tier]  = true;
    processExtraTierMatches(tier);
    return;
  }
  const q = query(collection(db, EXTRA_TIERS[tier].matchesCol), where("date", "==", date));
  extraTierUnsub[tier] = onSnapshot(q, snapshot => {
    extraTierMatches[tier] = [];
    snapshot.forEach(docSnap => extraTierMatches[tier].push({ ...docSnap.data(), type: "vip" }));
    extraTierLoaded[tier] = true;
    processExtraTierMatches(tier);
  }, () => {
    extraTierUnsub[tier] = null;
    extraTierListenerMode[tier] = "error"; // retried on the next status change
    extraTierMatches[tier] = [];
    extraTierLoaded[tier]  = true;
    processExtraTierMatches(tier);
  });
}

function startExtraTierListener(tier) { syncExtraTierListener(tier, true); }

// ════════════════════════════════════════════════════════════════════
// CHAT WITH ADMIN
// ════════════════════════════════════════════════════════════════════

let chatDocUnsub      = null;
let chatMessagesUnsub = null;
let chatModalOpen     = false;
let chatSending       = false;
let chatLastThreadData = null; // { unreadByAdmin, ... } — used to compute ✓/✓✓ ticks
let chatLastMsgs        = [];   // cached so ticks can be refreshed without a re-fetch

function chatDocRef() {
  return doc(db, "support_chats", getVisitorId());
}
function chatMessagesCol() {
  return collection(db, "support_chats", getVisitorId(), "messages");
}

// Red badge on the chat icon: shows the NUMBER of unread admin messages (9+ if more).
// Falls back to a plain dot if the count isn't known yet.
let chatUnreadFlag  = false;  // unreadByUser from the chat document
let chatUnreadCount = 0;
let chatCountUnsub  = null;
function setChatUnreadBadge(isUnread, count) {
  const el = document.getElementById("chatUnreadDot");
  if (!el) return;
  el.classList.toggle("hidden", !isUnread);
  const n = isUnread && count > 0 ? (count > 9 ? "9+" : String(count)) : "";
  el.textContent = n;
  el.classList.toggle("has-count", !!n);
}
function chatReadKey() { return "bm_chat_read_" + getVisitorId(); }
function saveChatLastRead(ms) {
  try { if (ms > Number(localStorage.getItem(chatReadKey()) || 0)) localStorage.setItem(chatReadKey(), String(ms)); } catch {}
}
function countUnreadAdmin(msgsDesc) {
  let lastRead = 0;
  try { lastRead = Number(localStorage.getItem(chatReadKey()) || 0); } catch {}
  let n = 0;
  for (const m of msgsDesc) {
    if (m.sender === "admin") {
      const ts = m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : Infinity;
      if (lastRead && ts <= lastRead) break;
      n++;
    } else if (!lastRead) break; // no read-marker yet: count only the admin replies after the user's last message
  }
  return n;
}
// Lightweight listener (last 20 messages) that only runs while there is something unread.
function startChatCountListener() {
  if (chatCountUnsub) return;
  try {
    const q = query(chatMessagesCol(), orderBy("createdAt", "desc"), limit(20));
    chatCountUnsub = onSnapshot(q, snap => {
      const msgs = [];
      snap.forEach(d => msgs.push(d.data()));
      chatUnreadCount = countUnreadAdmin(msgs);
      setChatUnreadBadge(chatUnreadFlag && !chatModalOpen, chatUnreadCount);
    }, () => {});
  } catch (e) { /* badge just stays a dot */ }
}
function stopChatCountListener() {
  if (chatCountUnsub) { chatCountUnsub(); chatCountUnsub = null; }
  chatUnreadCount = 0;
}

let chatDocListenerSeenFirst = false;
function startChatDocListener() {
  if (isGuestAccount) return;
  const myId = getVisitorId();
  if (!myId) return;
  if (chatDocUnsub) chatDocUnsub();
  chatDocListenerSeenFirst = false;
  chatDocUnsub = onSnapshot(chatDocRef(), snap => {
    const data   = snap.exists() ? snap.data() : null;
    const unread = !!(data && data.unreadByUser);
    chatUnreadFlag = unread;
    if (unread && !chatModalOpen) startChatCountListener(); else stopChatCountListener();
    setChatUnreadBadge(unread && !chatModalOpen, chatUnreadCount);
    if (unread && !chatModalOpen && chatDocListenerSeenFirst) {
      addNotification(t('chat_reply_notif'));
      showToast(t('chat_reply_toast'));
      navigator.vibrate?.([120, 60, 120]);
    }
    chatDocListenerSeenFirst = true;
    chatLastThreadData = data;
    if (chatModalOpen) renderChatMessages(chatLastMsgs); // refresh ✓✓ read state
  }, () => { /* thread doesn't exist yet — nothing to show */ });
}

function stopChatListeners() {
  if (chatDocUnsub)      { chatDocUnsub();      chatDocUnsub      = null; }
  if (chatMessagesUnsub) { chatMessagesUnsub(); chatMessagesUnsub = null; }
  stopChatCountListener();
  chatUnreadFlag = false;
  chatModalOpen = false;
  setChatUnreadBadge(false);
}

const CHAT_ICON_CROWN = `<img src="icon-512.png" alt="" width="34" height="34" draggable="false">`;
const CHAT_ICON_USER  = `<svg aria-hidden="true"><use href="#ic-user"/></svg>`;
const CHAT_TICK_ONE   = `<svg class="chat-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const CHAT_TICK_TWO   = `<svg class="chat-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 12.5L6 17l9.5-9.5"/><path d="M10.5 15.5l1.5 1.5 9.5-9.5"/></svg>`;

function chatSenderLabelHTML() {
  return `<div class="chat-msg-sender"><span>ODDZA</span><span class="sep" aria-hidden="true">•</span><span class="role">${escapeHtml(t('chat_admin_role'))}</span></div>`;
}

function chatDayLabel(d) {
  const startOf = x => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff <= 0) return t('chat_day_today');
  if (diff === 1) return t('chat_day_yesterday');
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString([], opts);
}

// "Admin is typing…" is driven by the support thread document: the admin side
// sets `adminTyping` to a server Timestamp while typing (or to true).
// A timestamp older than TYPING_WINDOW_MS is ignored so it can never get stuck.
const CHAT_TYPING_WINDOW_MS = 8000;
let chatTypingExpiryTimer = null;
function chatAdminTypingLeftMs() {
  const v = chatLastThreadData && chatLastThreadData.adminTyping;
  if (!v) return 0;
  if (v === true) return CHAT_TYPING_WINDOW_MS;
  if (v.toDate) return Math.max(0, CHAT_TYPING_WINDOW_MS - (Date.now() - v.toDate().getTime()));
  return 0;
}

function renderChatMessages(msgs) {
  const list = document.getElementById("chatMessagesList");
  if (!list) return;
  chatLastMsgs = msgs;
  clearTimeout(chatTypingExpiryTimer);
  if (msgs.length === 0) {
    list.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon"><svg aria-hidden="true"><use href="#ic-bubble"/></svg></div>
        <p>${t('chat_empty_title')}</p>
        <small>${t('chat_empty_sub')}</small>
      </div>`;
    return;
  }
  const readByAdmin = !!(chatLastThreadData && chatLastThreadData.unreadByAdmin === false);
  let lastDayKey = "";
  const html = msgs.map(m => {
    const who  = m.sender === "admin" ? "admin" : "user";
    const when = m.createdAt?.toDate ? m.createdAt.toDate() : null;
    const time = when ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

    // Day divider — a message still waiting for its server timestamp is "now".
    const dayDate = when || new Date();
    const dayKey  = dayDate.toDateString();
    const dividerHTML = dayKey !== lastDayKey
      ? `<div class="chat-day" role="separator"><span>${escapeHtml(chatDayLabel(dayDate))}</span></div>`
      : "";
    lastDayKey = dayKey;

    const holdAttrs = m.id
      ? ` onmousedown="chatBubblePressStart(this,'${m.id}')" onmouseup="chatBubblePressEnd(this)" onmouseleave="chatBubblePressEnd(this)"
          ontouchstart="chatBubblePressStart(this,'${m.id}')" ontouchend="chatBubblePressEnd(this)" ontouchcancel="chatBubblePressEnd(this)"
          oncontextmenu="return false"`
      : "";
    const holdClass = m.id ? " chat-bubble-holdable" : "";
    const bodyHTML = m.imageUrl
      ? `<div class="chat-bubble chat-bubble-image${holdClass}"${holdAttrs}><img src="${escapeHtml(m.imageUrl)}" alt="chat image" loading="lazy" data-src="${escapeHtml(m.imageUrl)}" onclick="openChatImagePreview(this.dataset.src)">${m.text ? `<div class="chat-image-caption">${escapeHtml(m.text)}</div>` : ""}</div>`
      : `<div class="chat-bubble${holdClass}"${holdAttrs}>${escapeHtml(m.text)}</div>`;

    let ticksHTML = "";
    if (who === "user") {
      if (m._pending) {
        ticksHTML = `<span class="chat-msg-ticks pending" title="${escapeHtml(t('chat_status_sending'))}"><svg class="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg></span>`;
      } else if (readByAdmin) {
        ticksHTML = `<span class="chat-msg-ticks read" title="${escapeHtml(t('chat_status_read'))}">${CHAT_TICK_TWO}</span>`;
      } else if (ADMIN_ALWAYS_ONLINE || adminPresenceOnline) {
        ticksHTML = `<span class="chat-msg-ticks" title="${escapeHtml(t('chat_status_delivered'))}">${CHAT_TICK_TWO}</span>`;
      } else {
        ticksHTML = `<span class="chat-msg-ticks" title="${escapeHtml(t('chat_status_sent'))}">${CHAT_TICK_ONE}</span>`;
      }
    }
    const metaHTML = (time || ticksHTML)
      ? `<div class="chat-msg-time">${time ? `<span>${escapeHtml(time)}</span>` : ""}${ticksHTML}</div>`
      : "";

    const main = `<div class="chat-msg-main">${who === "admin" ? chatSenderLabelHTML() : ""}${bodyHTML}${metaHTML}</div>`;
    const avatar = who === "admin"
      ? `<span class="chat-admin-avatar">${CHAT_ICON_CROWN}</span>`
      : `<span class="chat-user-avatar"><span class="chat-avatar-disc">${CHAT_ICON_USER}</span><span class="chat-avatar-name">${escapeHtml(t('chat_you'))}</span></span>`;

    return `${dividerHTML}
      <div class="chat-msg ${who}">
        ${who === "admin" ? avatar + main : main + avatar}
      </div>`;
  }).join("");

  const typingMs = chatAdminTypingLeftMs();
  const typingHTML = typingMs > 0 ? `
      <div class="chat-msg admin chat-typing" aria-live="polite">
        <span class="chat-admin-avatar">${CHAT_ICON_CROWN}</span>
        <div class="chat-msg-main">
          <div class="chat-bubble">
            ${chatSenderLabelHTML()}
            <div class="chat-typing-row">
              <span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="chat-typing-text">${escapeHtml(t('chat_typing'))}</span>
            </div>
          </div>
        </div>
      </div>` : "";

  list.innerHTML = html + typingHTML;
  list.scrollTop = list.scrollHeight;

  if (typingMs > 0 && typingMs < CHAT_TYPING_WINDOW_MS) {
    chatTypingExpiryTimer = setTimeout(() => { if (chatModalOpen) renderChatMessages(chatLastMsgs); }, typingMs + 150);
  }
}

window.openChatImagePreview = function(url) {
  window.open(url, "_blank");
};

// Keep the chat sized to the *visible* area so the input stays above the on-screen keyboard.
function syncChatViewport() {
  const m = document.getElementById("chatModal");
  const vv = window.visualViewport;
  if (!m || !vv || !chatModalOpen) return;
  m.style.bottom = "auto";
  m.style.top    = vv.offsetTop + "px";
  m.style.height = vv.height + "px";
  const list = document.getElementById("chatMessagesList");
  if (list) list.scrollTop = list.scrollHeight;
}
function resetChatViewport() {
  const m = document.getElementById("chatModal");
  if (m) { m.style.top = ""; m.style.bottom = ""; m.style.height = ""; }
  window.visualViewport?.removeEventListener("resize", syncChatViewport);
  window.visualViewport?.removeEventListener("scroll", syncChatViewport);
}

window.openChatModal = async function() {
  if (isGuestAccount) {
    showToast(t('chat_login_required'));
    window.openAuthModal();
    return;
  }
  chatModalOpen = true;
  document.getElementById("chatModal").style.display = "flex";
  window.visualViewport?.addEventListener("resize", syncChatViewport);
  window.visualViewport?.addEventListener("scroll", syncChatViewport);
  syncChatViewport();
  history.pushState({ v: "chat" }, "");
  setChatUnreadBadge(false);

  updateDoc(chatDocRef(), { unreadByUser: false }).catch(() => { /* thread may not exist yet */ });

  const listEl = document.getElementById("chatMessagesList");
  if (listEl) listEl.innerHTML = `<div class="page-spinner"><div class="splash-spin"></div></div>`;

  if (chatMessagesUnsub) chatMessagesUnsub();
  const q = query(chatMessagesCol(), orderBy("createdAt", "asc"), limit(300));
  chatMessagesUnsub = onSnapshot(q, { includeMetadataChanges: true }, snap => {
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }));
    // everything on screen counts as read
    saveChatLastRead(msgs.reduce((a, m) => Math.max(a, m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : 0), 0));
    renderChatMessages(msgs);
  }, () => {
    if (listEl) renderChatMessages([]);
  });

  setTimeout(() => document.getElementById("chatInput")?.focus(), 250);
};

window.openChatForVipRequest = function(tier) {
  openChatModal();
  setTimeout(() => {
    const input = document.getElementById("chatInput");
    if (!input || input.value) return;
    const sp = planFor(tier || "elite");
    if (sp) {
      input.value = t('chat_prefill_plan', { plan: sp.label, price: sp.price });
    } else if (tier && tier !== "elite") {
      const tierName = tier === "single" ? t('tier_single_name') : t('tier_overunder_name');
      input.value = t('chat_prefill_tier', { tier: tierName });
    } else {
      input.value = t('chat_prefill_generic');
    }
  }, 60);
};

window.openChatForFullPackage = function() {
  openChatModal();
  setTimeout(() => {
    const input = document.getElementById("chatInput");
    if (!input || input.value) return;
    const sp = planFor("full");
    input.value = sp
      ? t('chat_prefill_plan', { plan: sp.label, price: sp.price })
      : t('chat_prefill_full');
  }, 60);
};

window.closeChatModal = function() {
  if (history.state && history.state.v === "chat") { history.back(); return; }
  hardCloseChat();
};
function hardCloseChat() {
  chatModalOpen = false;
  document.getElementById("chatModal").style.display = "none";
  resetChatViewport();
  closeChatActionSheet();
  if (chatMessagesUnsub) { chatMessagesUnsub(); chatMessagesUnsub = null; }
}

window.sendChatMessage = async function() {
  const input   = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const text    = input.value.trim();
  if (!text || chatSending) return;

  chatSending = true;
  sendBtn.disabled = true;

  input.value = "";

  try {
    await addDoc(chatMessagesCol(), {
      sender: "user",
      text,
      createdAt: serverTimestamp()
    });
    await setDoc(chatDocRef(), {
      name:          currentUser?.displayName || null,
      email:         currentUser?.email || null,
      lastMessage:   text,
      lastMessageAt: serverTimestamp(),
      lastSender:    "user",
      unreadByAdmin: true,
      unreadByUser:  false,
      updatedAt:     serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("sendChatMessage failed:", e.code, e.message);
    input.value = text; // give the message back so it isn't lost
    showToast(t('chat_send_error'));
  }

  chatSending = false;
  sendBtn.disabled = false;
  input.focus();
};

let confirmModalResolve = null;
window.showConfirmModal = function(message) {
  return new Promise(resolve => {
    confirmModalResolve = resolve;
    document.getElementById("confirmModalMsg").innerText = message;
    document.getElementById("confirmModal").style.display = "flex";
  });
};
window.resolveConfirmModal = function(result) {
  document.getElementById("confirmModal").style.display = "none";
  if (confirmModalResolve) { confirmModalResolve(result); confirmModalResolve = null; }
};

window.deleteChatMessage = async function(msgId) {
  if (!msgId) return;
  const ok = await showConfirmModal(t('chat_delete_confirm'));
  if (!ok) return;
  try {
    await deleteDoc(doc(chatMessagesCol(), msgId));
  } catch (e) {
    console.error("deleteChatMessage failed:", e.code, e.message);
    showToast(t('chat_delete_error'));
  }
};

let chatActionSheetMsgId = null;

window.openChatActionMenu = function(msgId) {
  const msg = (chatLastMsgs || []).find(m => m.id === msgId);
  if (!msg) return;
  chatActionSheetMsgId = msgId;

  const rows = [];
  if (msg.text) {
    rows.push(`<button type="button" class="chat-action-row" onclick="chatActionCopyText()">${t('chat_action_copy')}</button>`);
  }
  if (msg.imageUrl) {
    rows.push(`<button type="button" class="chat-action-row" onclick="chatActionCopyImageLink()">${t('chat_action_copy_link')}</button>`);
  }
  if (msg.sender === "user") {
    rows.push(`<button type="button" class="chat-action-row danger" onclick="chatActionDelete()">${t('chat_action_delete')}</button>`);
  }
  document.getElementById("chatActionSheetOptions").innerHTML = rows.join("");
  document.getElementById("chatActionSheet").style.display = "flex";
};

window.closeChatActionSheet = function() {
  document.getElementById("chatActionSheet").style.display = "none";
  chatActionSheetMsgId = null;
};

window.chatActionCopyText = function() {
  const msg = (chatLastMsgs || []).find(m => m.id === chatActionSheetMsgId);
  closeChatActionSheet();
  if (!msg?.text) return;
  navigator.clipboard?.writeText(msg.text).then(() => showToast(t('chat_copied_toast')));
};

window.chatActionCopyImageLink = function() {
  const msg = (chatLastMsgs || []).find(m => m.id === chatActionSheetMsgId);
  closeChatActionSheet();
  if (!msg?.imageUrl) return;
  navigator.clipboard?.writeText(msg.imageUrl).then(() => showToast(t('chat_copied_toast')));
};

window.chatActionDelete = function() {
  const msgId = chatActionSheetMsgId;
  closeChatActionSheet();
  deleteChatMessage(msgId);
};

const CHAT_HOLD_MS = 550;
let chatHoldTimer  = null;

window.chatBubblePressStart = function(el, msgId) {
  el.classList.add("holding");
  clearTimeout(chatHoldTimer);
  chatHoldTimer = setTimeout(() => {
    el.classList.remove("holding");
    openChatActionMenu(msgId);
  }, CHAT_HOLD_MS);
};

window.chatBubblePressEnd = function(el) {
  clearTimeout(chatHoldTimer);
  chatHoldTimer = null;
  el?.classList.remove("holding");
};

const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
let chatImageSending = false;

window.pickChatImage = function() {
  if (chatImageSending) return;
  document.getElementById("chatImageInput")?.click();
};

window.handleChatImageSelected = async function(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  inputEl.value = ""; // reset so picking the same file again still fires change
  if (!file || chatImageSending) return;

  if (!file.type.startsWith("image/")) {
    showToast(t('chat_image_invalid_type'));
    return;
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    showToast(t('chat_image_too_large'));
    return;
  }

  chatImageSending = true;
  const sendBtn = document.getElementById("chatSendBtn");
  const attachBtn = document.getElementById("chatAttachBtn");

  if (sendBtn) sendBtn.disabled = true;
  if (attachBtn) attachBtn.disabled = true;
  showToast(t('chat_image_uploading'));

  try {
    const myId = getVisitorId();
    const path = `chat_images/${myId}/${Date.now()}_${file.name}`.replace(/\s+/g, "_");
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await addDoc(chatMessagesCol(), {
      sender: "user",
      text: "",
      imageUrl: url,
      createdAt: serverTimestamp()
    });
    await setDoc(chatDocRef(), {
      name:          currentUser?.displayName || null,
      email:         currentUser?.email || null,
      lastMessage:   "Photo",
      lastMessageAt: serverTimestamp(),
      lastSender:    "user",
      unreadByAdmin: true,
      unreadByUser:  false,
      updatedAt:     serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("handleChatImageSelected failed:", e.code, e.message);
    showToast(t('chat_image_upload_error'));
  }

  chatImageSending = false;
  if (sendBtn) sendBtn.disabled = false;
  if (attachBtn) attachBtn.disabled = false;
};

// ════════════════════════════════════════════════════════════════════
// MATCH EVALUATION — tip wording & win/lost logic
// ════════════════════════════════════════════════════════════════════

function humanizeTip(tip, m) {
  if (!tip) return tip;
  const teams = splitTeams(m.match);
  const home = teams ? teams.home : "Home";
  const away = teams ? teams.away : "Away";
  const t = tip.toUpperCase().trim();
  if (t.includes(" & ")) {
    return t.split(" & ").map(leg => humanizeSingle(leg.trim(), home, away, m.tipType)).join(" & ");
  }
  return humanizeSingle(t, home, away, m.tipType);
}

function humanizeSingle(tRaw, home, away, tipType) {
  const L = {
    en: {
      firstHalf: "1st Half: ", secondHalf: "2nd Half: ", wins: n => `${n} Wins`, draw: "Draw",
      dcHome: n => `Double Chance (${n} or Draw)`, dc12: `Double Chance (${home} or ${away})`,
      dnb: n => `${n} Wins (Draw No Bet)`,
      bttsYes: "Both Teams to Score - Yes", bttsNo: "Both Teams to Score - No",
      scoreBothHalvesYes: n => `${n} to Score in Both Halves - Yes`, scoreBothHalvesNo: n => `${n} to Score in Both Halves - No`,
      winBothHalves: n => `${n} Wins Both Halves`,
      qualify: n => `${n} to Qualify`, winEither: n => `${n} Wins Either Half`,
      over: (n, g) => `${n} Over ${g} Goals`, under: (n, g) => `${n} Under ${g} Goals`,
      totalOver: (g, isCorners) => `Over ${g} ${isCorners ? "Corners" : "Goals"}`, totalUnder: (g, isCorners) => `Under ${g} ${isCorners ? "Corners" : "Goals"}`,
      odd: "Total Goals - Odd", even: "Total Goals - Even",
      cleanSheet: n => `${n} Clean Sheet`, winToNil: n => `${n} Wins to Nil`,
      goalsRange: (n, a, b) => `${n} Goals ${a}-${b}`, totalGoalsRange: (a,b) => `Total Goals ${a}-${b}`,
      handicap: (n, line) => `${n} Handicap (${line})`,
      correctScore: s => `Correct Score ${s}`,
      handicap3w: (n, line, pickLabel) => `${n} Handicap ${line} → ${pickLabel}`,
    }
  };
  const lang = L.en;

  let t = tRaw;
  let prefix = "";

  {
    const up = t.match(/^(\d)\s*UP\s+(.+)$/);
    if (up) {
      const pick = up[2].trim();
      const pickMap = { "1": lang.wins(home), "X": lang.draw, "2": lang.wins(away) };
      return (pickMap[pick] || pick) + ` (${up[1]}UP)`;
    }
  }

  {
    let x;
    if ((x = t.match(/^(FIRST|LAST)\s+(?:GOAL|TO SCORE|TEAM TO SCORE)\s+(HOME|AWAY|NONE|NO GOAL|1|2)$/))) {
      const who = (x[2] === "HOME" || x[2] === "1") ? home : (x[2] === "AWAY" || x[2] === "2") ? away : "No Goal";
      return `${x[1] === "FIRST" ? "First" : "Last"} Team to Score: ${who}`;
    }
    if ((x = t.match(/^TTS\s+(NONE|HOME|AWAY|BOTH)$/))) {
      const m4 = { NONE: "No Goal", HOME: `${home} Only`, AWAY: `${away} Only`, BOTH: "Both Teams" };
      return `Teams to Score: ${m4[x[1]]}`;
    }
    if ((x = t.match(/^MORE GOALS\s+(1H|HT|2H|EQUAL|X)$/))) {
      const m3 = { "1H": "1st Half", HT: "1st Half", "2H": "2nd Half", EQUAL: "Equal", X: "Equal" };
      return `Half With More Goals: ${m3[x[1]]}`;
    }
    if ((x = t.match(/GOALS(?:\s+RANGE)?\s+(\d+)\+$/))) {
      return (t.includes("HOME") ? `${home} Goals ` : t.includes("AWAY") ? `${away} Goals ` : "Total Goals ") + `${x[1]}+`;
    }
    if ((x = t.match(/^EXACT GOALS\s+(\d+)$/))) return `Exact Total Goals: ${x[1]}`;
  }

  if (t.startsWith("3W")) {
    const parts = t.split(" ");
    const side  = parts[1]; // HOME | AWAY
    const line  = parts[2]; // -2, -1, +1, +2 ...
    const pick  = parts[3]; // 1 | X | 2
    const pickMap = { "1": lang.wins(home), "X": lang.draw, "2": lang.wins(away) };
    const sideName = side === "AWAY" ? away : home;
    return lang.handicap3w(sideName, line, pickMap[pick] || pick);
  }

  if (t.startsWith("HT ") || t.startsWith("1H ")) {
    prefix = lang.firstHalf;
    t = t.replace(/^(HT|1H)\s+/, "");
  } else if (t.startsWith("2H ")) {
    prefix = lang.secondHalf;
    t = t.replace(/^2H\s+/, "");
  }

  const htft = t.match(/^(1|X|2)\s*\/\s*(1|X|2)$/);
  if (htft) {
    const map = { "1": home, "X": lang.draw, "2": away };
    return `HT/FT: ${map[htft[1]]} / ${map[htft[2]]}`;
  }

  if (t === "1" || t === "HOME") return prefix + lang.wins(home);
  if (t === "2" || t === "AWAY") return prefix + lang.wins(away);
  if (t === "X" || t === "DRAW") return prefix + lang.draw;
  if (t === "1X") return prefix + lang.dcHome(home);
  if (t === "X2") return prefix + lang.dcHome(away);
  if (t === "12") return prefix + lang.dc12;
  if (t === "DNB HOME") return prefix + lang.dnb(home);
  if (t === "DNB AWAY") return prefix + lang.dnb(away);

  if (t.startsWith("BTTS 1H")) return lang.firstHalf + (t.includes("YES") ? lang.bttsYes : lang.bttsNo);
  if (t.startsWith("BTTS 2H")) return lang.secondHalf + (t.includes("YES") ? lang.bttsYes : lang.bttsNo);

  if (t.startsWith("SCORE BOTH HALVES")) {
    const side = t.includes("HOME") ? home : away;
    return prefix + (t.includes("YES") ? lang.scoreBothHalvesYes(side) : lang.scoreBothHalvesNo(side));
  }

  if (t.startsWith("WIN BOTH HALVES")) {
    return prefix + lang.winBothHalves(t.includes("HOME") ? home : away);
  }

  if (t.includes("BTTS") || t.includes("BOTH")) {
    if (t.includes("YES")) return prefix + lang.bttsYes;
    if (t.includes("NO"))  return prefix + lang.bttsNo;
  }

  if (t.includes("QUALIFY")) {
    return prefix + (t.includes("HOME") ? lang.qualify(home) : lang.qualify(away));
  }

  if (t.includes("WIN EITHER HALF")) {
    return prefix + (t.includes("HOME") ? lang.winEither(home) : lang.winEither(away));
  }

  if (t.includes("HOME OVER"))  return prefix + lang.over(home, t.split(" ").pop());
  if (t.includes("AWAY OVER"))  return prefix + lang.over(away, t.split(" ").pop());
  if (t.includes("HOME UNDER")) return prefix + lang.under(home, t.split(" ").pop());
  if (t.includes("AWAY UNDER")) return prefix + lang.under(away, t.split(" ").pop());

  if (t.includes("GOALS") && /\d+\s*-\s*\d+/.test(t)) {
    const r = t.match(/(\d+)\s*-\s*(\d+)/);
    if (t.includes("HOME")) return prefix + lang.goalsRange(home, r[1], r[2]);
    if (t.includes("AWAY")) return prefix + lang.goalsRange(away, r[1], r[2]);
    return prefix + lang.totalGoalsRange(r[1], r[2]);
  }

  if (t.includes("AH")) {
    const line = t.split(" ").pop();
    return prefix + lang.handicap(t.includes("AWAY") ? away : home, line);
  }

  if (t.includes("OVER"))  return prefix + lang.totalOver(t.split(" ").pop(), tipType === "corners");
  if (t.includes("UNDER")) return prefix + lang.totalUnder(t.split(" ").pop(), tipType === "corners");
  if (t === "ODD")  return prefix + lang.odd;
  if (t === "EVEN") return prefix + lang.even;
  if (t === "HOME CLEAN SHEET") return prefix + lang.cleanSheet(home);
  if (t === "AWAY CLEAN SHEET") return prefix + lang.cleanSheet(away);
  if (t === "HOME WIN TO NIL") return prefix + lang.winToNil(home);
  if (t === "AWAY WIN TO NIL") return prefix + lang.winToNil(away);

  if (/^\d+-\d+$/.test(t)) return prefix + lang.correctScore(t);

  return prefix + tRaw;
}

// ════════════════════════════════════════════════════════════════════
// RESULT ENGINE  (win / lost / void / pending / postponed)
// --------------------------------------------------------------------
// Input = match doc fields: ft ("2-1" | "PP" | "???"), ht, corners,
//   goals  (goal timeline, e.g. "23H 60A 78H" = minute + H(ome)/A(way),
//           regular time only, in the order the goals were scored),
//   qualified, resultOverride ("win"|"lost"|"void"|"pending"|"postponed").
// Early-payout markets (1UP / 2UP / nUP) look at the goal timeline: if the
// team LED by n at ANY moment the bet is a win, even if the match was
// levelled or turned around later. Without a timeline the engine only
// gives a verdict when it is certain, otherwise the tip stays "pending".
// ════════════════════════════════════════════════════════════════════

// "23H 60A 45+2H H78 90+3A" -> [{min,side}] in scored order, or null.
function parseGoalTimeline(str) {
  if (typeof str !== "string") return null;
  const s = str.toUpperCase().trim();
  if (!s || s === "-" || s === "NONE") return [];
  const out = [];
  for (const tok of s.split(/[\s,;]+/).filter(Boolean)) {
    const m = tok.match(/^(\d{1,3})(?:\+\d+)?'?([HA])$/) || tok.match(/^([HA])(\d{1,3})(?:\+\d+)?'?$/);
    if (!m) return null;
    const side = isNaN(m[1]) ? m[1] : m[2];
    const min  = Number(isNaN(m[1]) ? m[2] : m[1]);
    out.push({ min, side, i: out.length });
  }
  out.sort((a, b) => a.min - b.min || a.i - b.i);
  return out;
}

// Timeline is trusted only when it adds up to the final score.
function validTimeline(m, home, away) {
  if (home === 0 && away === 0) return [];
  const tl = parseGoalTimeline(m.goals);
  if (!tl) return null;
  const h = tl.filter(g => g.side === "H").length;
  const a = tl.length - h;
  return (h === home && a === away) ? tl : null;
}

// Biggest lead each side had at any moment (regular time).
function maxLeads(tl) {
  let h = 0, a = 0, lh = 0, la = 0;
  for (const g of tl) {
    if (g.side === "H") h++; else a++;
    lh = Math.max(lh, h - a);
    la = Math.max(la, a - h);
  }
  return { home: lh, away: la };
}

function getHalves(m, tl) {
  let h1 = null, h2 = null;
  if (m.ht && m.ht.includes("-")) {
    const [hh, ha] = m.ht.split("-").map(Number);
    if (!isNaN(hh) && !isNaN(ha)) h1 = { home: hh, away: ha };
  } else if (tl && m.ft && m.ft.includes("-")) {
    const first = tl.filter(g => g.min <= 45);
    const hh = first.filter(g => g.side === "H").length;
    h1 = { home: hh, away: first.length - hh };
  }
  if (h1 && m.ft && m.ft.includes("-")) {
    const [fh, fa] = m.ft.split("-").map(Number);
    if (!isNaN(fh) && !isNaN(fa) && fh >= h1.home && fa >= h1.away) {
      h2 = { home: fh - h1.home, away: fa - h1.away };
    }
  }
  return { h1, h2 };
}

// Over/Under and Asian-handicap style settlement, incl. push and quarter lines.
//   dir +1: value - line > 0 wins (Over, handicap)   dir -1: line - value > 0 wins (Under)
// Returns win | lost | void | halfwin | halflost.
function settleLine(value, line, dir = 1) {
  const q = Math.round(line * 4) / 4;
  const frac = Math.abs(q % 1);
  const parts = (frac === 0.25 || frac === 0.75) ? [q - 0.25, q + 0.25] : [q];
  const sum = parts.reduce((acc, l) => {
    const d = dir * (value - l);
    return acc + (d > 0 ? 1 : d < 0 ? -1 : 0);
  }, 0) / parts.length;
  return sum === 1 ? "win" : sum === 0.5 ? "halfwin" : sum === 0 ? "void" : sum === -0.5 ? "halflost" : "lost";
}
const normStatus = s => s === "halfwin" ? "win" : s === "halflost" ? "lost" : s;

const lastNum = tip => parseFloat(tip.split(" ").pop());

// ctx = { tl }  (validated goal timeline or null)
function evalAtomic(tip, home, away, ctx = {}) {
  const total = home + away;
  const tl = ctx.tl || null;

  // ── Early payout: 1UP / 2UP / 3UP … ──────────────────────────────
  let mm = tip.match(/^(\d)\s*UP\s+(.+)$/);
  if (mm) {
    const n = Number(mm[1]), pick = mm[2].trim();
    if (pick === "X") return home === away ? "win" : "lost";
    if (pick !== "1" && pick !== "2") return null;
    const mine = pick === "1" ? home : away, other = pick === "1" ? away : home;
    if (mine > other) return "win";               // won at full time (so led at some point)
    if (mine < n) return "lost";                  // scored fewer than n goals: can never have led by n
    if (!tl) return "pending";                    // could have led — needs the goal timeline
    const lead = maxLeads(tl);
    return (pick === "1" ? lead.home : lead.away) >= n ? "win" : "lost";
  }

  // ── First / last team to score (3-way: Home / Away / No Goal) ────
  mm = tip.match(/^(FIRST|LAST)\s+(?:GOAL|TO SCORE|TEAM TO SCORE)\s+(HOME|AWAY|NONE|NO GOAL|1|2)$/);
  if (mm) {
    const which = mm[1], pick = mm[2];
    if (pick === "NONE" || pick === "NO GOAL") return total === 0 ? "win" : "lost";
    if (total === 0) return "lost";
    const wantHome = pick === "HOME" || pick === "1";
    if (tl) {
      const g = which === "FIRST" ? tl[0] : tl[tl.length - 1];
      return (g.side === "H") === wantHome ? "win" : "lost";
    }
    // no timeline: only certain when one side never scored
    if (wantHome && home === 0) return "lost";
    if (!wantHome && away === 0) return "lost";
    if (wantHome && away === 0) return "win";
    if (!wantHome && home === 0) return "win";
    return "pending";
  }

  // ── Teams to score, 4-way (No Goal / Home only / Away only / Both) ─
  mm = tip.match(/^TTS\s+(NONE|HOME|AWAY|BOTH)$/);
  if (mm) {
    const actual = home > 0 && away > 0 ? "BOTH" : home > 0 ? "HOME" : away > 0 ? "AWAY" : "NONE";
    return actual === mm[1] ? "win" : "lost";
  }

  // ── Total / team goals "N+" (e.g. GOALS RANGE 7+, HOME GOALS 3+) ──
  mm = tip.match(/GOALS(?:\s+RANGE)?\s+(\d+)\+$/);
  if (mm) {
    const n = Number(mm[1]);
    const v = tip.includes("HOME") ? home : tip.includes("AWAY") ? away : total;
    return v >= n ? "win" : "lost";
  }

  if (tip.startsWith("QUALIFY")) return null;

  if (tip.startsWith("3W")) {
    const parts = tip.split(" ");
    const side  = parts[1];
    const line  = parseFloat(parts[2]);
    const pick  = parts[3];
    if (isNaN(line) || !pick) return "pending";
    const adjHome = side === "AWAY" ? home : home + line;
    const adjAway = side === "AWAY" ? away + line : away;
    const outcome = adjHome > adjAway ? "1" : adjHome < adjAway ? "2" : "X";
    return outcome === pick ? "win" : "lost";
  }

  if (tip === "HOME" || tip === "1") return home > away ? "win" : "lost";
  if (tip === "AWAY" || tip === "2") return away > home ? "win" : "lost";
  if (tip === "DRAW" || tip === "X") return home === away ? "win" : "lost";
  if (tip === "1X") return home >= away ? "win" : "lost";
  if (tip === "X2") return away >= home ? "win" : "lost";
  if (tip === "12") return home !== away ? "win" : "lost";
  if (tip === "DNB HOME") return home > away ? "win" : home === away ? "void" : "lost";
  if (tip === "DNB AWAY") return away > home ? "win" : home === away ? "void" : "lost";
  if (tip.includes("BTTS") || tip.includes("BOTH")) {
    const both = home > 0 && away > 0;
    if (tip.includes("YES")) return both ? "win" : "lost";
    if (tip.includes("NO"))  return !both ? "win" : "lost";
  }
  if (/\bHOME (OVER|UNDER) /.test(tip)) {
    const line = lastNum(tip); if (isNaN(line)) return "pending";
    return settleLine(home, line, tip.includes("OVER") ? 1 : -1);
  }
  if (/\bAWAY (OVER|UNDER) /.test(tip)) {
    const line = lastNum(tip); if (isNaN(line)) return "pending";
    return settleLine(away, line, tip.includes("OVER") ? 1 : -1);
  }

  if (tip.includes("GOALS") && /\d+\s*-\s*\d+/.test(tip)) {
    const rangeMatch = tip.match(/(\d+)\s*-\s*(\d+)/);
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    if (isNaN(lo) || isNaN(hi)) return "pending";
    if (tip.includes("HOME")) return (home >= lo && home <= hi) ? "win" : "lost";
    if (tip.includes("AWAY")) return (away >= lo && away <= hi) ? "win" : "lost";
    return (total >= lo && total <= hi) ? "win" : "lost";
  }

  if (/\b(OVER|UNDER)\b/.test(tip) && !/\bAH\b/.test(tip)) {
    const line = lastNum(tip); if (isNaN(line)) return "pending";
    return settleLine(total, line, tip.includes("OVER") ? 1 : -1);
  }
  if (tip === "ODD")  return total % 2 === 1 ? "win" : "lost";
  if (tip === "EVEN") return total % 2 === 0 ? "win" : "lost";
  if (tip === "HOME CLEAN SHEET") return away === 0 ? "win" : "lost";
  if (tip === "AWAY CLEAN SHEET") return home === 0 ? "win" : "lost";
  if (tip === "HOME WIN TO NIL") return (home > away && away === 0) ? "win" : "lost";
  if (tip === "AWAY WIN TO NIL") return (away > home && home === 0) ? "win" : "lost";
  if (/\bAH\b/.test(tip)) {
    const line = lastNum(tip);
    if (isNaN(line)) return "pending";
    const diff = tip.includes("AWAY") ? (away - home) : (home - away);
    return settleLine(diff, -line, 1);            // diff + line > 0 wins
  }
  mm = tip.match(/^EXACT GOALS (\d+)$/);
  if (mm) return total === Number(mm[1]) ? "win" : "lost";
  if (/^\d+-\d+$/.test(tip)) return tip === `${home}-${away}` ? "win" : "lost";
  return null;                                     // unknown market -> caller decides (pending)
}

function combineStatuses(list) {
  const l = list.map(normStatus);
  if (l.some(s => s === "lost")) return "lost";
  if (l.some(s => s === "postponed")) return "postponed";
  if (l.some(s => s === "pending" || s === null)) return "pending";
  const decisive = l.filter(s => s !== "void");
  if (decisive.length === 0) return "void";
  return "win";
}

const MANUAL_STATUSES = ["win", "lost", "void", "pending", "postponed"];

function getStatus(m) {
  // Admin override beats every automatic rule (for markets the engine can't grade).
  const ov = String(m.resultOverride || "").toLowerCase();
  if (MANUAL_STATUSES.includes(ov)) return ov;

  if (m.ft && m.ft.toUpperCase().trim() === "PP") return "postponed";
  if (!m.ft || m.ft === "???" || !m.ft.includes("-")) return "pending";
  const [home, away] = m.ft.split("-").map(Number);
  if (isNaN(home) || isNaN(away)) return "pending";
  const tip = String(m.tip || "").toUpperCase().trim();
  const tl  = validTimeline(m, home, away);
  const ctx = { tl };
  const { h1, h2 } = getHalves(m, tl);
  const ftCode = home > away ? "1" : home < away ? "2" : "X";
  const atom = (t, h, a) => evalAtomic(t, h, a, ctx) ?? "pending";   // unknown market: never guess "lost"

  if (m.tipType === "htft" || /(^|:)\s*(1|X|2)\s*\/\s*(1|X|2)\s*$/.test(tip)) {
    if (!h1) return "pending";
    const htCode = h1.home > h1.away ? "1" : h1.home < h1.away ? "2" : "X";
    const match = tip.match(/(1|X|2)\s*\/\s*(1|X|2)\s*$/);
    return match ? ((htCode === match[1] && ftCode === match[2]) ? "win" : "lost") : "pending";
  }

  if (tip.includes("QUALIFY")) {
    if (!m.qualified) return "pending";
    const wantHome = tip.includes("HOME");
    return (m.qualified.toUpperCase() === (wantHome ? "HOME" : "AWAY")) ? "win" : "lost";
  }

  {
    const mg = tip.match(/^MORE GOALS\s+(1H|HT|2H|EQUAL|X)$/);
    if (mg) {                                        // Half With More Goals
      if (!h1 || !h2) return "pending";
      const a1 = h1.home + h1.away, a2 = h2.home + h2.away;
      const actual = a1 > a2 ? "1H" : a1 < a2 ? "2H" : "EQUAL";
      const want = mg[1] === "HT" ? "1H" : mg[1] === "X" ? "EQUAL" : mg[1];
      return actual === want ? "win" : "lost";
    }
  }

  if (tip.includes("WIN EITHER HALF")) {
    if (!h1 || !h2) return "pending";
    const isHome = tip.includes("HOME");
    const wonH1 = isHome ? h1.home > h1.away : h1.away > h1.home;
    const wonH2 = isHome ? h2.home > h2.away : h2.away > h2.home;
    const yes = (wonH1 || wonH2);
    return (tip.includes(" NO") ? !yes : yes) ? "win" : "lost";
  }

  if (tip.startsWith("BTTS 1H")) {
    if (!h1) return "pending";
    const both = h1.home > 0 && h1.away > 0;
    return (tip.includes("YES") ? both : !both) ? "win" : "lost";
  }
  if (tip.startsWith("BTTS 2H")) {
    if (!h2) return "pending";
    const both = h2.home > 0 && h2.away > 0;
    return (tip.includes("YES") ? both : !both) ? "win" : "lost";
  }

  if (tip.startsWith("SCORE BOTH HALVES")) {
    if (!h1 || !h2) return "pending";
    const isHome = tip.includes("HOME");
    const scoredBoth = isHome ? (h1.home > 0 && h2.home > 0) : (h1.away > 0 && h2.away > 0);
    return (tip.includes("YES") ? scoredBoth : !scoredBoth) ? "win" : "lost";
  }

  if (tip.startsWith("WIN BOTH HALVES")) {
    if (!h1 || !h2) return "pending";
    const isHome = tip.includes("HOME");
    const wonH1 = isHome ? h1.home > h1.away : h1.away > h1.home;
    const wonH2 = isHome ? h2.home > h2.away : h2.away > h2.home;
    return (wonH1 && wonH2) ? "win" : "lost";
  }

  if (m.tipType === "corners") {
    // No corner count entered yet -> pending (never treat "empty" as 0 corners).
    if (m.corners === null || m.corners === undefined || m.corners === "" || isNaN(Number(m.corners))) return "pending";
    const corners = Number(m.corners);
    const line = lastNum(tip);
    if (isNaN(line)) return "pending";
    if (tip.includes("OVER"))  return normStatus(settleLine(corners, line, 1));
    if (tip.includes("UNDER")) return normStatus(settleLine(corners, line, -1));
    return "pending";
  }

  if (tip.startsWith("HT ") || tip.startsWith("1H ")) {
    if (!h1) return "pending";
    return normStatus(atom(tip.replace(/^(HT|1H)\s+/, ""), h1.home, h1.away));
  }

  if (tip.startsWith("2H ")) {
    if (!h2) return "pending";
    return normStatus(atom(tip.replace(/^2H\s+/, ""), h2.home, h2.away));
  }

  if (tip.includes(" & ")) {
    const legs = tip.split(" & ").map(s => s.trim());
    const results = legs.map(leg => {
      if (leg.startsWith("HT ") || leg.startsWith("1H ")) {
        if (!h1) return "pending";
        return atom(leg.replace(/^(HT|1H)\s+/, ""), h1.home, h1.away);
      }
      if (leg.startsWith("2H ")) {
        if (!h2) return "pending";
        return atom(leg.replace(/^2H\s+/, ""), h2.home, h2.away);
      }
      return atom(leg.replace(/^DC\s+/, ""), home, away);
    });
    return combineStatuses(results);
  }

  return normStatus(atom(tip, home, away));
}

// ════════════════════════════════════════════════════════════════════
// MATCH RENDERING & LIVE LISTENERS
// ════════════════════════════════════════════════════════════════════

function getCountdownLabel(matchTime) {
  const diff = matchTime - now();
  if (diff > 0) {
    const hrs  = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  }
  return t('kickoff');
}

function buildMatchTime(dateStr, timeStr) {
  const [d, mo, y] = dateStr.split(".");
  return new Date(`${y}-${mo}-${d}T${timeStr || "00:00"}`);
}

function splitTeams(matchStr) {
  if (!matchStr) return null;
  const seps = [" vs ", " VS ", " v ", " - ", " – "];
  for (const sep of seps) {
    if (matchStr.includes(sep)) {
      const [home, away] = matchStr.split(sep);
      if (home && away) return { home: home.trim(), away: away.trim() };
    }
  }
  return null;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function buildLeagueLabel(m) {
  const league = (m.league && String(m.league).trim()) ? String(m.league).trim() : "";
  return league;
}

const STATUS_SVG = {
  pending:   `<svg class="mc-ico" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12.5"/><path d="M16 8.5V16l4.8 3.2"/></svg>`,
  win:       `<svg class="mc-ico" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" fill="currentColor"/><path d="M9.5 16.5l4.5 4.5 8.5-9.5" stroke="#1a1a1a" stroke-width="3"/></svg>`,
  lost:      `<svg class="mc-ico" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" fill="currentColor"/><path d="M10.5 10.5l11 11M21.5 10.5l-11 11" stroke="#1a1a1a" stroke-width="3"/></svg>`,
  postponed: `<svg class="mc-ico" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" fill="currentColor"/><path d="M12.5 10.5v11M19.5 10.5v11" stroke="#1a1a1a" stroke-width="3"/></svg>`,
  void:      `<svg class="mc-ico" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="14" fill="currentColor"/><path d="M9.5 16h13" stroke="#1a1a1a" stroke-width="3"/></svg>`
};

function buildStatusMark(status) {
  const key = STATUS_SVG[status] ? status : "pending";
  return `<span class="lh-status is-${key}">${STATUS_SVG[key]}</span>`;
}

function buildLeagueHeader(league, timeLabel, status) {
  return `
    <div class="league-header">
      <span class="lh-time">${escapeHtml(timeLabel)}</span>
      <span class="lh-league">${escapeHtml(league)}</span>
      ${buildStatusMark(status)}
    </div>`;
}

function buildVipHeader(timeLabel, status) {
  return `
    <div class="league-header is-vip">
      <span class="lh-time">${escapeHtml(timeLabel)}</span>
      <span class="lh-league">${t('vip_match_label')}</span>
      ${buildStatusMark(status)}
    </div>`;
}

function buildScoreHTML(m, status) {
  const hasFt = m.ft && m.ft !== "???" && m.ft.includes("-");
  if (status === "postponed" && !hasFt) {
    return `<span class="match-score is-postponed">P-P</span>`;
  }
  const txt = hasFt ? String(m.ft).replace(/\s+/g, "") : "0-0";
  const cls = status === "win" ? "is-win" : status === "lost" ? "is-lost" : "";
  return `<span class="match-score ${cls}">${escapeHtml(txt)}</span>`;
}

function buildTipNote(m) {
  if (m.tipType === "corners" && m.corners) return `<span class="corners-note">corners: ${escapeHtml(m.corners)}</span>`;
  if (m.ht && (m.tipType === "htft" || /HT|1H|\//.test((m.tip||"").toUpperCase()))) {
    return `<span class="corners-note">HT: ${escapeHtml(m.ht)}</span>`;
  }
  return "";
}

document.addEventListener("click", e => {
  const item = e.target.closest(".booking-code-item");
  if (!item) return;
  const code = item.dataset.bcCode;
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showToast(t('code_copied'));
  }).catch(() => showToast(t('clipboard_error')));
});

function buildRow(m, matchTime, isFree, unlockedFlag = isEliteUnlocked()) {
  const status    = getStatus(m);
  const oddVal    = parseFloat(m.odd) || 1;
  const locked    = !isFree && !unlockedFlag;

  const tipClass = isFree ? "free" : "vip-lock";
  let tipHTML, oddHTML;

  if (locked) {
    tipHTML = `<span class="tip-label vip-premium">${t('tip_premium')}</span>`;
    oddHTML = `<span class="odd-badge dim">•••</span>`;
  } else {
    tipHTML = `<span class="tip-label ${tipClass}">${escapeHtml(humanizeTip(m.tip, m))}</span>${buildTipNote(m)}`;
    oddHTML = `<span class="odd-badge">${escapeHtml(m.odd)}</span>`;
  }

  let teamsHTML;
  const teams = splitTeams(m.match);
  if (locked) {
    const blurredNamesHTML = teams
      ? `<div class="match-teams locked-teams-blur"><span class="match-team home">${escapeHtml(teams.home)}</span><span class="match-vs">VS</span><span class="match-team away">${escapeHtml(teams.away)}</span></div>`
      : `<div class="match-single-name locked-teams-blur">${escapeHtml(m.match)}</div>`;
    teamsHTML = `
      <div class="locked-teams-wrap">
        ${blurredNamesHTML}
        <div class="lock-badge">${t('lock_reveal')}</div>
      </div>`;
  } else if (teams) {
    const scoreHTML = buildScoreHTML(m, status);
    teamsHTML = `
      <div class="match-teams">
        <span class="match-team home">${escapeHtml(teams.home)}</span>
        ${scoreHTML}
        <span class="match-team away">${escapeHtml(teams.away)}</span>
      </div>`;
  } else {
    const hasFt = m.ft && m.ft !== "???" && m.ft.includes("-");
    const ftSuffix = hasFt
      ? ` <span style="opacity:.5;font-family:'JetBrains Mono',monospace;">(${escapeHtml(m.ft)})</span>`
      : status === "postponed"
        ? ` <span class="postponed-vs" style="font-family:'JetBrains Mono',monospace;">${t('postponed_flag')}</span>`
        : "";
    teamsHTML = `<div class="match-single-name">${escapeHtml(m.match)}${ftSuffix}</div>`;
  }

  const cardStateClass = locked ? "" : status === "win" ? "is-win" : status === "lost" ? "is-lost" : status === "postponed" ? "is-postponed" : "";
  const codesHTML = "";

  return {
    html: `
    <div class="match-card ${cardStateClass}${locked ? ' is-locked' : ''}" data-mtime="${matchTime.getTime()}" data-status="${locked ? 'locked' : status}">
      <div class="match-body">
        ${teamsHTML}
      </div>
      <div class="match-tip-bar">
        <div>${tipHTML}</div>
        ${oddHTML}
      </div>
      ${codesHTML}
    </div>`,
    status,
    oddVal
  };
}

let latestFreeMatches = [];
let latestVipMatches  = [];
let freeLoaded = false;
let vipLoaded  = false;

let bookingCodes = { free: null, vip: null, single: null, overunder: null, full: null };

const bcPick = (data, field) => (data[field + "BetpawaCode"] || data[field + "SportybetCode"])
  ? { betpawaCode: data[field + "BetpawaCode"] || "", sportybetCode: data[field + "SportybetCode"] || "" }
  : null;

function rerenderBookingCodes() {
  processTodayMatches();
  Object.keys(EXTRA_TIERS).forEach(tier => processExtraTierMatches(tier));
  renderFreeInfo();
  renderEliteInfo();
  Object.keys(EXTRA_TIERS).forEach(tier => renderExtraTierStatus(tier));
}

// Free codes: public doc. VIP codes: vip_booking/{tier}, readable only with a
// live entitlement (enforced by Firestore rules), so listeners are attached
// only while the matching tier is unlocked.
function startBookingCodesListener() {
  onSnapshot(doc(db, "_meta", "bookingCodes"), snap => {
    const data = snap.exists() ? (snap.data() || {}) : {};
    bookingCodes.free = bcPick(data, "free");
    rerenderBookingCodes();
  }, () => { /* ignore transient read errors */ });
  syncVipBookingListeners(true);
}

const vipBookingUnsub = {};
const vipBookingMode  = {};
const VIP_BOOKING_TIERS = {
  vip:       () => isEliteUnlocked(),
  single:    () => isExtraTierUnlocked("single"),
  overunder: () => isExtraTierUnlocked("overunder"),
  full:      () => isExtraTierUnlocked("full"),
};

function syncVipBookingListeners(force) {
  Object.keys(VIP_BOOKING_TIERS).forEach(tier => {
    let want = "off";
    try { want = VIP_BOOKING_TIERS[tier]() ? "on" : "off"; } catch { /* not ready yet */ }
    if (!force && want === vipBookingMode[tier]) return;
    if (vipBookingUnsub[tier]) { vipBookingUnsub[tier](); vipBookingUnsub[tier] = null; }
    vipBookingMode[tier] = want;

    if (want === "off") {
      if (bookingCodes[tier]) { bookingCodes[tier] = null; rerenderBookingCodes(); }
      return;
    }
    vipBookingUnsub[tier] = onSnapshot(doc(db, "vip_booking", tier), snap => {
      bookingCodes[tier] = snap.exists() ? bcPick(snap.data() || {}, tier) : null;
      rerenderBookingCodes();
    }, () => {
      vipBookingUnsub[tier] = null;
      vipBookingMode[tier]  = "error"; // retried on the next status change
      bookingCodes[tier] = null;
    });
  });
}

window.addEventListener("vip-status-changed", () => syncVipBookingListeners(false));
window.addEventListener("vip-access-granted", () => syncVipBookingListeners(true));

function renderGroupedByLeague(builtRows, isVip) {
  if (builtRows.length === 0) return "";
  return builtRows.map(row => {
    const timeLabel = row.m.time || "--:--";
    if (isVip) {
      if (isEliteUnlocked()) {
        const league = buildLeagueLabel(row.m) || t('other_matches');
        return `
          <div class="league-group">
            ${buildLeagueHeader(league, timeLabel, row.status)}
            <div class="match-list">${row.styledHtml}</div>
          </div>`;
      }
      return `
        <div class="league-group">
          ${buildVipHeader(timeLabel, row.status)}
          <div class="match-list">${row.styledHtml}</div>
        </div>`;
    }
    const league = buildLeagueLabel(row.m) || t('other_matches');
    return `
      <div class="league-group">
        ${buildLeagueHeader(league, timeLabel, row.status)}
        <div class="match-list">${row.styledHtml}</div>
      </div>`;
  }).join("");
}

function processTodayMatches() {
  if (!freeLoaded || !vipLoaded) return;
  trySplashHide();

  const rows = [...latestFreeMatches, ...(isEliteUnlocked() ? latestVipMatches : [])].map(m => ({
    m,
    matchTime: buildMatchTime(m.date, m.time)
  }));

  rows.forEach(({ m, matchTime }) => {
    const diff = matchTime - now();
    if (diff > 0 && diff <= 600000) {
      const isVipOnly = (m.type || "vip") !== "free";
      if (!isVipOnly || isEliteUnlocked()) {
        const key = m.match + m.time;
        if (!notifiedMatches[key]) {
          notifiedMatches[key] = true;
          localStorage.setItem("notifiedMatches", JSON.stringify(notifiedMatches));
          showPopup(t('starting_soon_popup', { match: m.match }));
          addNotification(t('starting_soon_notif', { match: m.match }));
        }
      }
    }
  });

  rows.sort((a, b) => a.matchTime - b.matchTime);

  let stats = { winF:0, lostF:0, pendingF:0, oddsF:1, winV:0, lostV:0, pendingV:0, oddsV:1 };
  let freeStreakCount = 0, vipStreakCount = 0;
  let prevFreeWin = true, prevVipWin = true;
  const freeBuilt = [], vipBuilt = [];

  rows.forEach(({ m, matchTime }, idx) => {
    const isFree = (m.type || "vip") === "free";
    const { html, status, oddVal } = buildRow(m, matchTime, isFree);

    if (!isFree && isEliteUnlocked()) {
      const key = "result_" + m.match + m.time;
      if (status !== "pending" && !notifiedMatches[key]) {
        notifiedMatches[key] = true;
        localStorage.setItem("notifiedMatches", JSON.stringify(notifiedMatches));
        if (status === "win")  addNotification(t('win_notif', { match: m.match }));
        if (status === "lost") addNotification(t('lost_notif', { match: m.match }));
        if (status === "postponed") addNotification(t('postponed_notif', { match: m.match }));
      }
    }

    const styledHtml = html.replace('class="match-card', `style="--i:${idx}" class="match-card`);

    if (isFree) {
      freeBuilt.push({ m, styledHtml, status });
      stats.oddsF *= oddVal;
      if (status === "win")        { stats.winF++; if(prevFreeWin) freeStreakCount++; prevFreeWin=true; }
      else if (status === "lost")  { stats.lostF++; prevFreeWin=false; freeStreakCount=0; }
      else if (status === "void")  { /* refunded — doesn't count toward win/lost */ }
      else                         { stats.pendingF++; }
    } else {
      vipBuilt.push({ m, styledHtml, status });
      stats.oddsV *= oddVal;
      if (status === "win")        { stats.winV++; if(prevVipWin) vipStreakCount++; prevVipWin=true; }
      else if (status === "lost")  { stats.lostV++; prevVipWin=false; vipStreakCount=0; }
      else if (status === "void")  { /* refunded — doesn't count toward win/lost */ }
      else                         { stats.pendingV++; }
    }
  });

  const fTotal = stats.winF + stats.lostF + stats.pendingF;
  const vTotal = stats.winV + stats.lostV + stats.pendingV;

  swapSkeletonForContent(document.getElementById("freeSkeletonRows"));
  swapSkeletonForContent(document.getElementById("vipSkeletonRows"));

  const freeDataEl  = document.getElementById("freeData");
  const vipDataEl   = document.getElementById("vipData");
  const emptyFreeEl = document.getElementById("emptyFree");
  const emptyVipEl  = document.getElementById("emptyVip");

  freeDataEl.innerHTML = renderGroupedByLeague(freeBuilt, false);
  const teaseN = isEliteUnlocked() ? 0 : teaserCount("elite");
  vipDataEl.innerHTML  = isEliteUnlocked()
    ? renderGroupedByLeague(vipBuilt, true)
    : lockedPlaceholderHTML(teaseN);

  if (fTotal > 0) {
    freeDataEl.style.display = "";
    freeDataEl.classList.add("fade-in-block");
    emptyFreeEl.classList.add("hidden");
  } else {
    freeDataEl.style.display = "none";
    emptyFreeEl.classList.remove("hidden");
    emptyFreeEl.classList.add("fade-in-block");
  }
  if (vTotal > 0 || teaseN > 0) {
    vipDataEl.style.display = "";
    vipDataEl.classList.add("fade-in-block");
    emptyVipEl.classList.add("hidden");
  } else {
    vipDataEl.style.display = "none";
    emptyVipEl.classList.remove("hidden");
    emptyVipEl.classList.add("fade-in-block");
  }
}

function startFreeMatchesListener() {
  const todayFreeQuery = query(collection(db, "matches_free"), where("date", "==", date));
  onSnapshot(todayFreeQuery, snapshot => {
    latestFreeMatches = [];
    snapshot.forEach(docSnap => latestFreeMatches.push({ ...docSnap.data(), type: "free" }));
    freeLoaded = true;
    processTodayMatches();
  });
}

let vipMatchesUnsub  = null;
let vipListenerMode  = null;

function syncVipMatchesListener(force) {
  const want = isEliteUnlocked() ? "on" : "off";
  if (!force && want === vipListenerMode) return;
  if (vipMatchesUnsub) { vipMatchesUnsub(); vipMatchesUnsub = null; }
  vipListenerMode = want;

  if (want === "off") {
    latestVipMatches = [];
    vipLoaded = true;
    processTodayMatches();
    return;
  }
  const todayVipQuery = query(collection(db, "matches_vip"), where("date", "==", date));
  vipMatchesUnsub = onSnapshot(todayVipQuery, snapshot => {
    latestVipMatches = [];
    snapshot.forEach(docSnap => latestVipMatches.push({ ...docSnap.data(), type: "vip" }));
    vipLoaded = true;
    processTodayMatches();
  }, () => {
    vipMatchesUnsub = null;
    vipListenerMode = "error"; // retried on the next status change
    latestVipMatches = [];
    vipLoaded = true;
    processTodayMatches();
  });
}

function startVipMatchesListener() { syncVipMatchesListener(true); }

window.addEventListener("vip-status-changed", () => {
  syncVipMatchesListener(false);
  ["single", "overunder"].forEach(tr => syncExtraTierListener(tr, false));
});
window.addEventListener("vip-access-granted", () => {
  syncVipMatchesListener(true);
  ["single", "overunder"].forEach(tr => syncExtraTierListener(tr, true));
});

window.addEventListener("vip-status-changed", () => { processTodayMatches(); checkVipLossMessage(); });

// ════════════════════════════════════════════════════════════════════
// HISTORY — loaded on demand
// ════════════════════════════════════════════════════════════════════

let latestFreeAll = null;
let latestVipAll  = null;
let latestSingleAll = null;
let latestOverunderAll = null;

let freeHistGroups = {}, vipHistGroups = {}, singleHistGroups = {}, overunderHistGroups = {};
let freeHistDates  = [], vipHistDates  = [], singleHistDates  = [], overunderHistDates  = [];
let freeHistPage   = 0,  vipHistPage   = 0,  singleHistPage   = 0,  overunderHistPage   = 0;

function isPastDate(dStr) {
  const [d, mo, y] = dStr.split(".").map(Number);
  const matchDay = new Date(y, mo - 1, d);
  const n = now();
  const todayDay = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return matchDay < todayDay;
}

function sortDatesDesc(groups) {
  const toISO = d => d.split(".").reverse().join("-");
  return Object.keys(groups).sort((a, b) => new Date(toISO(b)) - new Date(toISO(a)));
}

function buildHistoryCard(m, isFree) {
  const status = getStatus(m);
  const tipClass = isFree ? "free" : "vip-lock";
  const teams = splitTeams(m.match);
  const hasFt = m.ft && m.ft !== "???" && m.ft.includes("-");

  let teamsHTML;
  if (teams) {
    const scoreHTML = buildScoreHTML(m, status);
    teamsHTML = `
      <div class="match-teams">
        <span class="match-team home">${escapeHtml(teams.home)}</span>
        ${scoreHTML}
        <span class="match-team away">${escapeHtml(teams.away)}</span>
      </div>`;
  } else {
    const ftSuffix = hasFt
      ? ` <span style="opacity:.5;font-family:'JetBrains Mono',monospace;">(${escapeHtml(m.ft)})</span>`
      : status === "postponed"
        ? ` <span class="postponed-vs" style="font-family:'JetBrains Mono',monospace;">${t('postponed_flag')}</span>`
        : "";
    teamsHTML = `<div class="match-single-name">${escapeHtml(m.match)}${ftSuffix}</div>`;
  }

  return `
    <div class="match-card ${status === 'win' ? 'is-win' : status === 'lost' ? 'is-lost' : status === 'postponed' ? 'is-postponed' : ''}">
      <div class="match-body">${teamsHTML}</div>
      <div class="match-tip-bar">
        <div>
          <span class="tip-label ${tipClass}">${escapeHtml(humanizeTip(m.tip, m))}</span>
          ${buildTipNote(m)}
        </div>
        <span class="odd-badge">${escapeHtml(m.odd)}</span>
      </div>
    </div>`;
}

function renderHistoryPage(type) {
  const isFree   = type === "free";
  const groupsByType = { free: freeHistGroups, elite: vipHistGroups, single: singleHistGroups, overunder: overunderHistGroups };
  const datesByType  = { free: freeHistDates,  elite: vipHistDates,  single: singleHistDates,  overunder: overunderHistDates };
  const pageByType   = { free: freeHistPage,   elite: vipHistPage,   single: singleHistPage,   overunder: overunderHistPage };
  const targetIdByType = { free: "historyFree", elite: "historyVip", single: "historySingle", overunder: "historyOverunder" };

  const groups   = groupsByType[type];
  const dates    = datesByType[type];
  const pageIdx  = pageByType[type];
  const targetEl = document.getElementById(targetIdByType[type]);
  if (!targetEl) return;

  if (dates.length === 0) {
    renderWithFade(targetEl, `<div class="empty-state"><h3>${t('empty_hist_title')}</h3><p>${t('empty_hist_sub')}</p></div>`);
    return;
  }

  const clamped = Math.min(Math.max(pageIdx, 0), dates.length - 1);
  if (type === "free") freeHistPage = clamped;
  else if (type === "elite") vipHistPage = clamped;
  else if (type === "single") singleHistPage = clamped;
  else if (type === "overunder") overunderHistPage = clamped;

  const d = dates[clamped];
  const matches = groups[d];

  const leaguesHTML = matches.map(m => {
    const status = getStatus(m);
    const headerHTML = buildLeagueHeader(buildLeagueLabel(m) || t('other_matches'), m.time || "--:--", status);
    return `
      <div class="league-group">
        ${headerHTML}
        <div class="match-list">${buildHistoryCard(m, isFree)}</div>
      </div>`;
  }).join("");

  renderWithFade(targetEl, `
    <div class="date-group">${d}</div>
    ${leaguesHTML}
    <div class="hist-pager">
      <button class="hist-pager-btn" onclick="changeHistoryPage('${type}', -1)" ${clamped === 0 ? "disabled" : ""}>${t('hist_prev')}</button>
      <button class="hist-pager-btn" onclick="changeHistoryPage('${type}', 1)" ${clamped === dates.length - 1 ? "disabled" : ""}>${t('hist_next')}</button>
    </div>`);
}

window.changeHistoryPage = function(type, delta) {
  if (type === "free") freeHistPage += delta;
  else if (type === "elite") vipHistPage += delta;
  else if (type === "single") singleHistPage += delta;
  else if (type === "overunder") overunderHistPage += delta;
  renderHistoryPage(type);
  scrollMainTop({ top: 0, behavior: "smooth" }); // date sits right under the header
};

function processHistory() {
  if (!latestFreeAll || !latestVipAll) return;

  const freeGroups = {}, vipGroups = {}, singleGroups = {}, overunderGroups = {};

  latestFreeAll.forEach(docSnap => {
    const m = docSnap.data();
    if (m.date === date) return;
    if (!isPastDate(m.date)) return;
    if (!freeGroups[m.date]) freeGroups[m.date] = [];
    freeGroups[m.date].push(m);
  });

  latestVipAll.forEach(docSnap => {
    const m = docSnap.data();
    if (m.date === date) return;
    if (!isPastDate(m.date)) return;
    if (!vipGroups[m.date]) vipGroups[m.date] = [];
    vipGroups[m.date].push(m);
  });

  (latestSingleAll || []).forEach(docSnap => {
    const m = docSnap.data();
    if (m.date === date) return;
    if (!isPastDate(m.date)) return;
    if (!singleGroups[m.date]) singleGroups[m.date] = [];
    singleGroups[m.date].push(m);
  });

  (latestOverunderAll || []).forEach(docSnap => {
    const m = docSnap.data();
    if (m.date === date) return;
    if (!isPastDate(m.date)) return;
    if (!overunderGroups[m.date]) overunderGroups[m.date] = [];
    overunderGroups[m.date].push(m);
  });

  freeHistGroups = freeGroups;
  vipHistGroups  = vipGroups;
  singleHistGroups = singleGroups;
  overunderHistGroups = overunderGroups;
  freeHistDates  = sortDatesDesc(freeGroups);
  vipHistDates   = sortDatesDesc(vipGroups);
  singleHistDates = sortDatesDesc(singleGroups);
  overunderHistDates = sortDatesDesc(overunderGroups);

  renderHistoryPage("free");
  renderHistoryPage("elite");
  renderHistoryPage("single");
  renderHistoryPage("overunder");
}

// ── History: loaded ON DEMAND, only the last HIST_DAYS days, cached 10 min ──
// Before, every app start opened 4 live listeners on the WHOLE collections,
// so each visit re-read every match ever stored (and it grew every day).
const HIST_DAYS = 30;                 // Firestore "in" allows max 30 values
const HIST_CACHE_MS = 60 * 1000;      // history refreshes at most once a minute
let histLoadedAt = 0;
let histLoading  = null;

function pastDateStrings(n) {
  const base = now();
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    out.push([
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear()
    ].join("."));
  }
  return out;
}

window.ensureHistoryLoaded = function(force) {
  if (!date) return Promise.resolve();
  if (!force && histLoadedAt && Date.now() - histLoadedAt < HIST_CACHE_MS) return Promise.resolve();
  if (histLoading) return histLoading;

  const dates = pastDateStrings(HIST_DAYS);
  const load = (col) =>
    getDocs(query(collection(db, col), where("date", "in", dates))).then(s => s.docs);

  histLoading = Promise.all([
    load("matches_free"),
    load("matches_vip_history"),
    load(EXTRA_TIERS.single.matchesCol + "_history"),
    load(EXTRA_TIERS.overunder.matchesCol + "_history")
  ]).then(([f, v, s, o]) => {
    latestFreeAll = f; latestVipAll = v; latestSingleAll = s; latestOverunderAll = o;
    histLoadedAt = Date.now();
    processHistory();
  }).catch(e => {
    console.error("history load failed:", e && e.code, e && e.message);
  }).finally(() => { histLoading = null; });

  return histLoading;
};

// When the app comes back to the foreground, make the next History open fetch fresh data.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") histLoadedAt = 0;
});

// ════════════════════════════════════════════════════════════════════
// APP BOOTSTRAP
// ════════════════════════════════════════════════════════════════════

function startCountdownRefresh() {
  setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll('.match-card[data-status="pending"]').forEach(card => {
      const mtime = Number(card.dataset.mtime);
      if (!mtime) return;
      const badge = card.querySelector(".match-countdown");
      if (badge) badge.innerText = getCountdownLabel(new Date(mtime));
    });
  }, 30000);
}

async function initApp() {
  applyStaticTranslations();
  await checkGoogleRedirectResult();
  initAuthListener();
}

// Let the browser paint / handle touches between start-up steps, so opening the app stays smooth.
const nextIdle = () => new Promise(r =>
  (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 16)));

let appStarting = false;
async function startAppForUser() {
  if (appStarting) return; // already starting (start-up is spread over a few frames)
  appStarting = true;
  // 1) Only what the first screen needs
  computeDateFromNow(); // device clock first so the page shows immediately
  syncServerTime().then(computeDateFromNow); // refine in background; rollover watcher reloads if the day differs
  startDateRolloverWatcher();
  startBlockedWatcher();
  startDeviceResetWatcher();
  renderFreeInfo();
  startFreeMatchesListener();
  startCountdownRefresh();

  // 2) VIP + chat, right after the first frame
  await nextIdle();
  startChatDocListener();
  startVipTeaserListener();
  startVipMatchesListener();
  startVipExpirySafetyNet();
  initVipCode();

  // 3) Everything else, in the next idle slot
  await nextIdle();
  startBookingCodesListener();
  startVipLossMessageListener();
  startAdminPresenceListener();
  startExtraTierListener("single");
  startExtraTierListener("overunder");
  initExtraTier("single");
  initExtraTier("overunder");
  initExtraTier("full"); // no startExtraTierListener ? Full Package has no matches of its own

  await nextIdle();
  await trackVisit();
  startVisitorHeartbeat();
  updateAccountUI();
  appInitialized = true;
  scrollMainTop({ top: 0, behavior: "instant" });
}

document.addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target.closest('[role="button"]');
  if (!el) return;
  e.preventDefault();
  el.click();
});

(function initInstallPrompt() {
  const STORAGE_KEY = "ukd_install_choice"; // "installed" | "not_now" | "dismissed"
  const overlay = document.getElementById("installPromptOverlay");
  const installBtn = document.getElementById("ipbInstallBtn");
  const notNowBtn = document.getElementById("ipbNotNowBtn");
  const descEl = document.getElementById("ipbDesc");
  const iosHelp = document.getElementById("iosInstallHelp");
  const iosHelpClose = document.getElementById("iihClose");
  if (!overlay || !installBtn || !notNowBtn) return;

  let deferredPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }
  function isIOS() {
    const ua = navigator.userAgent || "";
    const iOSDevice = /iPad|iPhone|iPod/.test(ua);
    const iPadOS13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return iOSDevice || iPadOS13;
  }
  function isIOSSafari() {
    return isIOS();
  }
  function alreadyDecided() {
    return !!localStorage.getItem(STORAGE_KEY);
  }

  function updateTexts() {
    if (deferredPrompt) {
      if (descEl) descEl.textContent = t("install_prompt_desc");
      installBtn.textContent = t("install_btn");
    } else if (isIOSSafari()) {
      if (descEl) descEl.textContent = t("install_prompt_desc_ios");
      installBtn.textContent = t("install_btn_ios");
    } else {
      if (descEl) descEl.textContent = t("install_prompt_desc");
      installBtn.textContent = t("install_btn");
    }
  }

  function showBanner() {
    if (isStandalone() || alreadyDecided()) return;
    overlay.classList.remove("hidden");
  }
  function hideBanner() {
    overlay.classList.add("hidden");
  }

  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      hideBanner();
      deferredPrompt.prompt();
      try {
        const { outcome } = await deferredPrompt.userChoice;
        localStorage.setItem(STORAGE_KEY, outcome === "accepted" ? "installed" : "not_now");
      } catch {
        localStorage.setItem(STORAGE_KEY, "not_now");
      }
      deferredPrompt = null;
    } else if (isIOSSafari()) {
      hideBanner();
      if (iosHelp) iosHelp.classList.remove("hidden");
    } else {
      hideBanner();
    }
  });

  notNowBtn.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, "not_now");
    hideBanner();
  });

  if (iosHelpClose && iosHelp) {
    iosHelpClose.addEventListener("click", () => {
      iosHelp.classList.add("hidden");
      localStorage.setItem(STORAGE_KEY, "not_now");
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateTexts();
    showBanner();
  });

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(STORAGE_KEY, "installed");
    hideBanner();
    if (iosHelp) iosHelp.classList.add("hidden");
  });

  if (isIOSSafari() && !isStandalone() && !alreadyDecided()) {
    updateTexts();
    showBanner();
  }
})();

initApp();

history.replaceState({ v: "home" }, "");
document.body.classList.add("home-active");

// ════════════════════════════════════════════════════════════════════
// LAYOUT, HOME SWIPE & CONSENT
// ════════════════════════════════════════════════════════════════════

// keep --topbar-h in sync so the category bar sits right under the header
(function syncTopbarHeight() {
  const tb=document.querySelector(".topbar");
  if(!tb||!window.ResizeObserver) return;
  new ResizeObserver(()=>document.documentElement.style.setProperty("--topbar-h",tb.offsetHeight+"px")).observe(tb);
})();

// ── HOME swipe: finger-following slide between Free ⇄ VIP ─────────────
(function initHomeSwipe() {
  const home  = document.getElementById("homeSection");
  const pager = document.getElementById("hmPager");
  const track = document.getElementById("hmTrack");
  const gFree = document.getElementById("hmGridFree");
  const gVip  = document.getElementById("hmGridVip");
  if (!home || !pager || !track || !gFree || !gVip) return;

  const SETTLE = "transform .45s cubic-bezier(.22,.8,.28,1)"; // slow, smooth settle
  const isVipMode = () => document.getElementById("hmToggle")?.getAttribute("data-mode") === "vip";

  function position(animate) {
    const vip = isVipMode();
    track.style.transition = animate ? SETTLE : "none";
    track.style.transform = vip ? "translateX(-100%)" : "translateX(0)";
    gFree.inert = vip;   // off-screen side can't be tapped / tabbed into
    gVip.inert  = !vip;
  }

  // Any mode change (toggle buttons, back from a category, swipe) slides smoothly
  syncHomePager = position;
  position(false);

  let sx = 0, sy = 0, st = 0, dx = 0, state = "idle"; // idle | pending | drag | ignore

  home.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) { state = "ignore"; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); dx = 0;
    state = "pending";
    track.style.transition = "none";
  }, { passive: true });

  home.addEventListener("touchmove", e => {
    if (state === "ignore" || state === "idle") return;
    const t = e.touches[0];
    const mx = t.clientX - sx, my = t.clientY - sy;
    if (state === "pending") {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      state = Math.abs(mx) > Math.abs(my) ? "drag" : "ignore";
      if (state === "ignore") return;
    }
    dx = mx;
    const w = pager.offsetWidth || 1;
    const base = isVipMode() ? -w : 0;
    let x = base + dx;
    // rubber-band at the edges (can't go left of Free or right of VIP)
    if (x > 0)  x = x * 0.25;
    if (x < -w) x = -w + (x + w) * 0.25;
    track.style.transition = "none";
    track.style.transform = "translateX(" + x + "px)";
  }, { passive: true });

  function finish() {
    if (state !== "drag") { state = "idle"; return; }
    state = "idle";
    const w = pager.offsetWidth || 1;
    const dt = Math.max(1, Date.now() - st);
    const v = dx / dt;                                  // px per ms
    const passed = Math.abs(dx) > w * 0.25 || (Math.abs(v) > 0.45 && Math.abs(dx) > 30);
    const vip = isVipMode();
    let target = vip ? "vip" : "free";
    if (passed) target = dx < 0 ? "vip" : "free";
    if (target !== (vip ? "vip" : "free")) window.setHomeMode(target); // slides + updates buttons
    else position(true);                                 // not far enough → glide back
  }
  home.addEventListener("touchend", finish, { passive: true });
  home.addEventListener("touchcancel", finish, { passive: true });
})();


// ---- Terms / Privacy consent (remembered on this device) ----
window.saveAuthConsent = function(on) {
  try { on ? localStorage.setItem("bm_terms_ok", "1") : localStorage.removeItem("bm_terms_ok"); } catch {}
  document.getElementById("authConsent")?.classList.remove("shake");
  if (on) setFieldError("Consent", "");
};
(function initAuthConsent() {
  const chk = document.getElementById("authConsentChk");
  if (!chk) return;
  try { chk.checked = localStorage.getItem("bm_terms_ok") === "1"; } catch {}
})();

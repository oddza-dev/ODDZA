/* ==========================================================================
   ODDZA — Service Worker
   --------------------------------------------------------------------------
   HOW TO RELEASE AN UPDATE
   1. Change VERSION below (e.g. "33" -> "34").
   2. Use the SAME number in index.html:  app.js?v=12  and  styles.css?v=12
   3. Upload everything. Users get the new version on their next visit.

   WHAT THIS DOES
   - Precaches the app shell so the app opens instantly and works offline.
   - Pages (index, terms, privacy): network-first, offline fallback to cache.
   - Own JS/CSS/icons: stale-while-revalidate (fast, self-updating).
   - Firebase SDK + Google Fonts: cached after first load.
   - Firestore, Auth, Storage, OneSignal and all other live data are NEVER
     cached — tips, VIP status and chat always come fresh from the network.
   - OneSignal push keeps using its own worker in /onesignal/ (untouched).
   ========================================================================== */

const VERSION = "52";
const PREFIX = "oddza-";
const STATIC_CACHE = `${PREFIX}static-${VERSION}`;
const RUNTIME_CACHE = `${PREFIX}runtime`;
const RUNTIME_MAX_ENTRIES = 80;
const NAV_TIMEOUT_MS = 8000;

const SCOPE = self.registration.scope; // works under sub-folders like /tips/

const PRECACHE = [
  "./",
  "index.html",
  "terms.html",
  "privacy.html",
  `app.js?v=${VERSION}`,
  `styles.css?v=${VERSION}`,
  "manifest.json",
  "favicon.svg",
  "favicon-16.png",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "logo-ball.png",
  "home-bg-dark.jpg",
  "home-bg-light.jpg",
  "logo-banner.jpg",
  "badge-96.png",
];

const abs = (p) => new URL(p, SCOPE).href;

/* ------------------------------ Install ---------------------------------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // allSettled: one missing file must never break the whole install.
      await Promise.allSettled(
        PRECACHE.map(async (path) => {
          const req = new Request(abs(path), { cache: "reload" });
          const res = await fetch(req);
          if (res.ok) await cache.put(req, res);
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* ------------------------------ Activate --------------------------------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches from older versions.
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(PREFIX) && !keep.has(n))
          .map((n) => caches.delete(n))
      );
      // Faster page loads while the worker boots.
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (e) {}
      }
      await self.clients.claim();
    })()
  );
});

/* ------------------------------- Fetch ----------------------------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("range")) return;

  const url = new URL(req.url);
  if (/\.apk$|version\.json$/i.test(url.pathname)) return; // APK + update-check file: always straight from the network

  // ---- Same-origin ----
  if (url.origin === self.location.origin) {
    // Leave OneSignal's own worker and files alone.
    if (url.pathname.includes("/onesignal/")) return;

    if (req.mode === "navigate") {
      event.respondWith(handleNavigation(event));
      return;
    }
    // Own JS/CSS: cache first, refresh in background (?v=N separates versions).
    if (/\.(js|css)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
    return;
  }

  // ---- Cross-origin we choose to cache ----
  if (url.hostname === "fonts.googleapis.com") {
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
    return;
  }
  if (
    url.hostname === "fonts.gstatic.com" ||
    (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/"))
  ) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Everything else (Firestore, Auth, Storage, OneSignal API...) -> network only.
});

/* ------------------------------ Strategies ------------------------------- */
async function handleNavigation(event) {
  // CACHE FIRST: the app shell opens instantly from cache, then refreshes
  // quietly in the background (picked up on the next open). The old version
  // waited up to 8s for the network, which made the installed app look like
  // a slow browser page.
  const req = event.request;
  const cache = await caches.open(STATIC_CACHE);

  const clean = new URL(req.url);
  clean.search = "";
  clean.hash = "";
  const isRoot = clean.pathname.endsWith("/");
  const key = isRoot ? abs("index.html") : clean.href; // terms.html keeps its own entry

  const cached = await cache.match(key, { ignoreSearch: true });

  const network = (async () => {
    try {
      const preload = event.preloadResponse ? await event.preloadResponse : null;
      const res = preload || (await fetch(req));
      if (res && res.ok && res.type === "basic") {
        await cache.put(key, res.clone());
      }
      return res;
    } catch (err) {
      return null;
    }
  })();

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const res = await Promise.race([
    network,
    new Promise((resolve) => setTimeout(() => resolve(null), NAV_TIMEOUT_MS)),
  ]);
  if (res) return res;

  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<title>Offline</title><body style='margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
      "background:#1b1b1b;color:#f2f2f2;font-family:system-ui,sans-serif;text-align:center;padding:24px'>" +
      "<div><h2 style='color:#f6ff00'>You're offline</h2><p>Check your internet connection and try again.</p></div>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

async function networkFirst(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res && res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    return cached || new Response("", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req); // exact match: ?v=N keeps versions apart

  const network = fetch(req)
    .then(async (res) => {
      if (res && res.ok) {
        await cache.put(req, res.clone());
        if (cacheName === RUNTIME_CACHE) trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network); // refresh in the background
    return cached;
  }
  const res = await network;
  return res || new Response("", { status: 503, statusText: "Offline" });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(req, res.clone());
      trimCache(cacheName, RUNTIME_MAX_ENTRIES);
    }
    return res;
  } catch (err) {
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
}

/* ------------------------------ Messages --------------------------------- */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

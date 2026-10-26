// Rivl service worker. Keeps the app shell and visited screens available
// offline. Task data is not cached here: the app keeps it in IndexedDB and
// syncs it itself (lib/tasks/store.ts).

const VERSION = "v1";
const STATIC = `rivl-static-${VERSION}`;
const PAGES = `rivl-pages-${VERSION}`;
const FONTS = `rivl-fonts-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC, PAGES, FONTS]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rivl-") && !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Signing out clears everything cached for the previous user.
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("rivl-")).map((k) => caches.delete(k)))));
  }
});

const cacheable = (res) => res && res.ok && !res.redirected && res.type !== "opaqueredirect";

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res) || res.type === "opaque") (await caches.open(cacheName)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res) || res.type === "opaque") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? network;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (cacheable(res)) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase and anything else: straight to network.
  if (url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, OFFLINE_URL));
    return;
  }
  // React Server Component payloads depend on router state headers; never serve them from cache.
  // Offline, Next falls back to a full navigation, which the cache above can answer.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (url.pathname === "/manifest.webmanifest") event.respondWith(staleWhileRevalidate(request, STATIC));
});

// Web push (/api/push/flush sends { title, body, url, tag }).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Rivl", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      // Same kind replaces the last one instead of stacking up.
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/today" },
    }),
  );
});

// Tapping a notification opens Rivl on the right screen, reusing an open window.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/today", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      return open.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
    }),
  );
});

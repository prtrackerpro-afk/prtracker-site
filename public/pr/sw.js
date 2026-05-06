// PR Tracker — service worker for the athlete PWA scope.
//
// Strategy:
// - Pre-cache the app shell static assets (icons, manifest) on install.
// - Network-first for /pr/* HTML pages — fresh data when online, cached
//   fallback when offline. Stale revalidates against the next request.
// - Network-first with no cache for /api/pr/* (always fresh, never serve
//   stale auth state).
// - Cache-first for /_astro/* and /fonts/* (immutable hashed assets).
//
// Scope is /pr by default (manifest scope). Athletes installing as a
// home-screen app see a working dashboard even on shaky 3G.

const VERSION = "pr-v3";
const SHELL_CACHE = `pr-shell-${VERSION}`;
const PAGE_CACHE = `pr-pages-${VERSION}`;
const ASSET_CACHE = `pr-assets-${VERSION}`;

const SHELL = [
  "/pr",
  "/pr/manifest.webmanifest",
  "/favicon-32.png",
  "/admin/icon-192.png",
  "/admin/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Auth APIs and POST endpoints — never cache, always go to network.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Hashed Astro assets / brand fonts — cache-first, immutable.
  if (
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(woff2?|css|js|svg|png|jpg|webp)$/.test(url.pathname)
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return cached || new Response("offline asset", { status: 503 });
        }
      })
    );
    return;
  }

  // /pr/* HTML pages — network-first, fall back to cached page on failure.
  if (url.pathname === "/pr" || url.pathname.startsWith("/pr/")) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Last-resort offline page — point user to login if shell missed.
          return caches.match("/pr") || new Response("offline", { status: 503 });
        }
      })()
    );
  }
});

// Allow the page to push a "skip waiting" command after deploy bumps.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

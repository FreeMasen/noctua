// Noctua service worker.
// - Precaches the app shell for offline launch.
// - Same-origin assets: stale-while-revalidate.
// - Cross-origin catalog data (feeds, covers): stale-while-revalidate so
//   previously-seen browsing works offline. Bump CACHE_VERSION on shell changes.

const CACHE_VERSION = "v9";
const SHELL_CACHE = `noctua-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `noctua-runtime-${CACHE_VERSION}`;

// Paths are relative to the service worker's scope (works under GitHub Pages
// subpaths too). Keep in sync with the module graph.
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "icons/favicon.png",
  "icons/owl-mask.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "js/config.js",
  "js/router.js",
  "js/http.js",
  "js/main.js",
  "js/db/idb.js",
  "js/ui/templates.js",
  "js/ui/dom.js",
  "js/ui/covers.js",
  "js/ui/sanitize.js",
  "js/ui/format.js",
  "js/ui/theme.js",
  "js/opds/rels.js",
  "js/opds/model.js",
  "js/opds/atom.js",
  "js/opds/auth.js",
  "js/opds/uritemplate.js",
  "js/opds/pubcache.js",
  "js/views/feed.js",
  "js/views/publication.js",
  "js/views/search.js",
  "js/views/login.js",
  "js/views/library.js",
  "js/views/settings.js",
  "js/views/reader.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

const cacheable = (res) => res && res.ok && (res.type === "basic" || res.type === "cors");

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function appShell() {
  const cache = await caches.open(SHELL_CACHE);
  return (await cache.match("index.html")) || (await cache.match("./")) || fetch("index.html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // let non-GET pass through untouched

  // Hash routing means real navigations only ever load the app shell.
  if (request.mode === "navigate") {
    event.respondWith(appShell());
    return;
  }

  const sameOrigin = new URL(request.url).origin === self.location.origin;
  event.respondWith(staleWhileRevalidate(request, sameOrigin ? SHELL_CACHE : RUNTIME_CACHE));
});

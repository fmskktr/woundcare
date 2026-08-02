// Wound Care Assist — Service Worker
// Bump this on every deploy so returning visitors pick up the new build.
const CACHE_VERSION = 'wca-v2';
const CACHE_NAME = `wound-care-assist-${CACHE_VERSION}`;

// Small "app shell" files only. index.html is intentionally NOT precached here —
// it is a large single-file app, so it is cached opportunistically at runtime
// instead (see fetch handler below). Precaching a very large file at install
// time is unreliable on slow connections and low-storage devices.
const PRECACHE_URLS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch(() => {
        // Non-fatal: shell assets may 404 during local testing; ignore.
      })
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('wound-care-assist-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for the app itself. index.html is ~93MB, so re-fetching it on
// every launch (as network-first would) means the installed PWA "redownloads"
// the whole app every time it's opened while online. Instead: serve the
// cached copy immediately (instant offline-capable launch), and separately
// refresh the cache in the background so the *next* launch picks up a new
// build. Bump CACHE_VERSION when you deploy a change to force that refresh.
// Only GET requests are handled.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        // Kick off a background refresh regardless, but don't make the user
        // wait on it — this is what lets a new deploy (new CACHE_VERSION)
        // eventually reach the device without re-downloading on every open.
        const networkUpdate = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
            return response;
          })
          .catch(() => null);

        // Serve cache instantly if we have it; otherwise wait on the network
        // (first-ever load, or a fresh cache after a version bump).
        return cached || networkUpdate || caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => cached);
    })
  );
});

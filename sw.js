// Service worker for Shelf.
// Strategy: NETWORK-FIRST for everything we serve.
// When online, the app always fetches the latest version from the server and
// only falls back to the cache when the network is unavailable (offline).
// On a new deploy, bump CACHE_VERSION (kept in sync with version.js).

const CACHE_VERSION = '1.5.0';
const CACHE_NAME = `shelf-cache-v${CACHE_VERSION}`;

// Core files that make the app usable offline.
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './version.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Install: pre-cache the shell, then take over immediately so a new version
// can activate without waiting for every tab to close.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate: drop old caches and immediately control all open pages.
// clients.claim() triggers a `controllerchange` event in the page, which the
// app listens for to auto-reload into the new version exactly once.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Allow the page to ask a waiting worker to activate right away.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET requests for our own origin. Let cross-origin requests
  // (book APIs, cover images) go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // NETWORK-FIRST: try the network, cache a fresh copy, fall back to cache.
  event.respondWith(
    fetch(req)
      .then((response) => {
        // Only cache valid, basic (same-origin) responses.
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          // For navigations, fall back to the cached app shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});

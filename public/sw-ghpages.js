/*
 * GitHub Pages SPA Service Worker
 * Intercepts navigation requests and returns index.html for any path
 * that isn't a real file (JS, CSS, images, JSON, etc.)
 * This allows the React SPA to handle routing via window.location.pathname.
 */
const CACHE_NAME = 'ghpages-spa-v1';
const PRECACHE = [
  '/sargagame/',
  '/sargagame/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Only handle paths under /sargagame/
  if (!url.pathname.startsWith('/sargagame/')) return;

  // For navigation requests (HTML pages), serve index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch('/sargagame/index.html', { cache: 'no-store' })
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/sargagame/index.html'))
    );
    return;
  }

  // For other requests, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Service Worker — Sargasses PWA
// Cache-first for static assets, network-first for API data
const CACHE_NAME = 'sargasses-v8'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icon-192.png', '/data/beaches-list.json', '/data/beaches-images.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Stale-while-revalidate for /data/ files (beaches-list, images)
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(res => {
            cache.put(e.request, res.clone())
            return res
          }).catch(() => cached)
          return cached || fresh
        })
      )
    )
    return
  }

  // Network-first for API data (sargassum.json)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(js|css|png|jpg|webp|svg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        return res
      }))
    )
    return
  }

  // Network-first for HTML pages
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

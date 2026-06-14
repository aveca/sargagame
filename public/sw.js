// Service Worker — Sargasses PWA
// Cache-first for static assets, network-first for HTML/API data.
// IMPORTANT : bumper CACHE_NAME a CHAQUE deploy de code -> purge l'ancien cache (sinon
// les users restent coinces sur l'ancien index.html/bundle, cf. bug clic plages juin 2026).
const CACHE_NAME = 'sargasses-v81'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icon-192.png', '/data/beaches-list.json', '/data/beaches-images.json']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 1) Purge tous les anciens caches
    const keys = await caches.keys()
    const hadOldCache = keys.some(k => k !== CACHE_NAME)
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    // 2) Prend le controle immediatement
    await self.clients.claim()
    // 3) Force-reload les onglets ouverts -> les visiteurs coinces sur l'ancien bundle
    //    cache recoivent la version fraiche SANS avoir a vider leur cache.
    //    UNIQUEMENT en upgrade (ancien cache present) : a la PREMIERE visite le
    //    bundle est deja frais, et le reload ~10-25s apres l'arrivee fermait le
    //    paywall/formulaire de paiement en pleine saisie (mesure 2026-06-10).
    if (!hadOldCache) return
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) {
      try { if ('navigate' in client) await client.navigate(client.url) } catch (e) {}
    }
  })())
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

  // Network-first with cache fallback for Open-Meteo weather APIs (avoid 429)
  if (url.hostname === 'api.open-meteo.com' || url.hostname === 'marine-api.open-meteo.com') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first for static assets — ne JAMAIS mettre en cache une erreur (un 404
  // d'image resterait servi jusqu'au prochain bump CACHE_NAME).
  if (url.pathname.match(/\.(js|css|png|jpg|webp|svg|woff2?)$/)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return res
      }))
    )
    return
  }

  // Network-first for HTML pages — HTML points to hash-fingerprinted JS, MUST be fresh.
  // Stale HTML trapped users on old bundles for days (v22 bug, fixed 2026-04-13).
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone()
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
      return res
    }).catch(() => caches.match(e.request))
  )
})

// Service Worker — Sargasses PWA
// Cache-first for static assets, network-first for HTML/API data.
// IMPORTANT : ne PLUS éditer ce CACHE_NAME à la main — il est dérivé de
// public/release-notes.json (`current`) par scripts/sync-version.cjs (lancé en
// `prebuild`). Publier une release = monter `current` dans release-notes.json :
// le SW + version.json se bumpent ensemble sur toute la flotte (cf. bug clic
// plages juin 2026 = bundle figé faute de bump manuel).
const CACHE_NAME = 'sargasses-v217'
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/favicon.ico', '/favicon-32x32.png', '/favicon-16x16.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/data/beaches-list.json', '/data/beaches-images.json']

// PRECACHE_ASSETS = TOUT le graphe JS/CSS buildé (+ data verdict). VIDE dans ce template
// public/ ; rempli au postbuild dans dist/sw.js par scripts/stamp-sw-hash.cjs (glob de
// dist/assets/*). POURQUOI : les ~25 chunks LAZY (paywall PremiumModal, WeekHub, ComicDetail,
// ChasseHome, WorldMapView, onboarding, scènes, AccountSheet…) sont hashés → non listables à la
// main, et ne sont fetchés (donc cachés cache-first) QUE si le visiteur ouvre cet écran EN LIGNE.
// Un visiteur qui charge l'accueil en wifi puis passe HORS LIGNE voyait chaque écran profond
// casser (import() rejette → lazyWithRetry reload en boucle). En précachant tout le graphe à
// l'install, TOUTE l'UI marche offline dès le 1er chargement complet. Best-effort (cf. install)
// → hors chemin critique du 1er paint, zéro impact budget JS eager.
const PRECACHE_ASSETS = [/*__SG_PRECACHE__*/]

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // 1) Coquille critique — ATOMIQUE (cache.addAll rejette en bloc) : petite liste sûre.
    await cache.addAll(STATIC_ASSETS)
    // 2) Graphe complet buildé (chunks lazy inclus) — BEST-EFFORT : un put par asset,
    //    allSettled → un asset qui échoue (4G Caraïbe flaky) n'annule NI l'install NI le reste.
    //    Ce que le précache rate, le cache-first le remplira à la 1re navigation en ligne.
    //    Résultat net : après un 1er chargement complet, toute l'UI est disponible offline.
    if (PRECACHE_ASSETS.length) {
      await Promise.allSettled(PRECACHE_ASSETS.map(async (u) => {
        try {
          const res = await fetch(u)
          if (res && res.ok) await cache.put(u, res.clone())
        } catch (_) {}
      }))
    }
  })())
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

// Network-first AVEC timeout → sur un lien à haute latence intermittente (wifi avion/
// satellite, bateau, panneau d'affichage sur 4G faible), on ne LAISSE PAS le réseau bloquer :
// si le cache existe et que le réseau traîne au-delà de NET_TIMEOUT_MS, on sert le cache tout
// de suite. Si le réseau répond ensuite, on met QUAND MÊME le cache à jour (fraîcheur en tâche
// de fond). Sans cache, on attend le réseau (pas de faux échec). Réservé aux DATA (/api,
// open-meteo) : le HTML reste strictement network-first (piège du bundle périmé, cf. plus bas).
const NET_TIMEOUT_MS = 3500
function networkFirst(req, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = (r) => { if (!done) { done = true; resolve(r) } }
    const timer = setTimeout(() => {
      caches.match(req).then(cached => { if (cached) finish(cached) })
    }, timeoutMs)
    fetch(req).then(res => {
      clearTimeout(timer)
      if (res && res.ok) { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)) }
      finish(res)
    }).catch(() => {
      clearTimeout(timer)
      caches.match(req).then(cached => finish(cached || Response.error()))
    })
  })
}

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

  // Network-first (AVEC timeout) for API data (sargassum.json…) — le verdict s'affiche
  // instantanément depuis le cache si le lien traîne (avion/bateau/panneau), fraîcheur en fond.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(e.request, NET_TIMEOUT_MS))
    return
  }

  // Network-first (AVEC timeout) for Open-Meteo weather APIs (avoid 429 + liens flaky).
  if (url.hostname === 'api.open-meteo.com' || url.hostname === 'marine-api.open-meteo.com') {
    e.respondWith(networkFirst(e.request, NET_TIMEOUT_MS))
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
  // HORS LIGNE : la coquille SPA est identique quelle que soit la querystring (le routing
  // est côté client). Sans réseau, on retombe sur l'URL exacte PUIS sur la coquille cachée
  // (/index.html, / — précachées) → une navigation avec query (?demo=1 panneau d'affichage,
  // ?nav=map, deep-links, start_url PWA) BOOTE l'app au lieu d'afficher la page d'erreur du
  // navigateur. Ne s'active qu'au .catch (réseau mort) → aucun risque de bundle périmé en ligne.
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone()
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
      return res
    }).catch(() => caches.match(e.request)
      .then(r => r || caches.match('/index.html'))
      .then(r => r || caches.match('/')))
  )
})

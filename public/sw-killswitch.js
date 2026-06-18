// KILL-SWITCH SW — casseur-de-vitre, NON déployé en permanence (sinon plus d'offline).
//
// À déployer SOUS LE NOM /sw.js UNIQUEMENT en incident « version coincée » : c'est le SEUL
// mécanisme qui débloque un client dont le VIEUX service worker sert l'HTML/sw en cache-first
// (cas non atteint par reg.update / activate-reload). À l'activation il : vide TOUS les caches,
// se DÉSENREGISTRE, et recharge les onglets → le prochain chargement n'a plus de SW du tout,
// caches vides, HTML re-servi par le réseau. Rend obsolète le « clear site data » manuel.
//
// PROCÉDURE (cf. NEXT_SESSION / handoff) :
//   1) cp public/sw-killswitch.js public/sw.js  → build + FTP (ou upload direct de sw.js)
//   2) attendre l'assainissement de la flotte (<24h, minutes avec updateViaCache:'none')
//   3) git checkout public/sw.js (restaure le SW de cache normal) + bump release-notes `current`
//      + build + FTP → REDÉPLOIE un SW normal (rétablit l'offline). NE JAMAIS laisser ce
//      kill-switch en prod en continu.

self.addEventListener('install', function () { self.skipWaiting() })

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try { var ks = await caches.keys(); await Promise.all(ks.map(function (k) { return caches.delete(k) })) } catch (_) {}
    try { await self.registration.unregister() } catch (_) {}
    try {
      var cs = await self.clients.matchAll({ type: 'window' })
      for (var i = 0; i < cs.length; i++) { try { if ('navigate' in cs[i]) await cs[i].navigate(cs[i].url) } catch (_) {} }
    } catch (_) {}
  })())
})

// Pas de handler 'fetch' : tout passe au réseau (HTML re-servi frais). S'appuie sur le re-fetch
// hors-cache de /sw.js (garanti <24h par spec, immédiat avec updateViaCache:'none' à l'enregistrement).

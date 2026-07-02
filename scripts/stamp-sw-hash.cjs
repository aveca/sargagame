#!/usr/bin/env node
/**
 * stamp-sw-hash.cjs — POSTBUILD : appose un hash du CODE SOURCE au CACHE_NAME du
 * service worker (dist/sw.js).
 *
 * POURQUOI : sync-version.cjs dérive CACHE_NAME de release-notes.json `current`,
 * qui ne bouge QUE sur une release user-facing. Donc un déploiement de CODE (bugfix,
 * refonte) ne changeait PAS le CACHE_NAME → les PWA installées (et tabs ouverts) ne
 * voyaient jamais de nouveau SW → restaient bloquées sur l'ancien bundle en cache
 * (bug « app installée = vieille version », fondateur 2026-06-18 ; mes fixes du jour
 * n'arrivaient jamais dans l'app installée).
 *
 * FIX : on ajoute au CACHE_NAME un hash du contenu de src/ (= le code qui produit le
 * bundle SPA). Résultat :
 *   • Déploiement de CODE (src/ change)        → hash change → SW bump → activate
 *     purge l'ancien cache + force-reload les clients → l'app installée se rafraîchit.
 *   • Déploiement DATA-only (sargassum.json…)  → src/ inchangé → hash identique →
 *     pas de bump → AUCUN reload intempestif (4×/j) en pleine session/paiement.
 * Le hash vient des FICHIERS SOURCE (déterministe), pas du bundle buildé (qui inline
 * __RELIABILITY__ et pourrait bouger chaque jour → reloads quotidiens non voulus).
 *
 * N'édite QUE dist/sw.js (jamais public/sw.js, qui reste `sargasses-vNNN` propre pour
 * que sync-version.cjs garde son regex). Lancé après `vite build` (cf. package.json).
 *
 * DEUXIÈME rôle (offline complet) : injecte dans le placeholder PRECACHE_ASSETS de
 * dist/sw.js la liste de TOUT le graphe JS/CSS buildé (dist/assets/*) + les data verdict.
 * Sans ça, les ~25 chunks LAZY (paywall, hub, scènes, onboarding…) — hashés, donc non
 * listables à la main — n'étaient cachés QUE si le visiteur ouvrait l'écran EN LIGNE, et
 * cassaient hors ligne. Le SW les précache à l'install (best-effort) → toute l'UI marche
 * offline dès le 1er chargement. Le placeholder reste vide dans public/sw.js (dev/preview
 * inchangés). Idempotent : re-remplit le tableau à chaque build (chemins triés).
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.join(__dirname, '..')
const swPath = path.join(root, 'dist', 'sw.js')
const srcDir = path.join(root, 'src')

if (!fs.existsSync(swPath)) {
  // Pas de dist/sw.js (build partiel ?) — ne bloque pas le build.
  console.log('[stamp-sw] dist/sw.js absent — skip (pas un build complet).')
  process.exit(0)
}
if (!fs.existsSync(srcDir)) {
  console.log('[stamp-sw] src/ absent — skip.')
  process.exit(0)
}

// Hash récursif et DÉTERMINISTE du contenu de src/ (chemins triés).
function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}
// Hash src/ + les autres ENTRÉES qui changent le bundle/HTML servi : index.html
// (shell + <style> global) et vite.config.js (génération pages + injections). Sans ça,
// un fix dans index.html (ex: forced-color-adjust global) ne bumpait PAS le SW → les
// PWA installées ne se rafraîchissaient pas (rapport fondateur 18/06).
const files = walk(srcDir, []).sort()
for (const extra of ['index.html', 'vite.config.js']) {
  const fp = path.join(root, extra)
  if (fs.existsSync(fp)) files.push(fp)
}
const h = crypto.createHash('sha256')
for (const f of files) {
  h.update(path.relative(root, f).replace(/\\/g, '/'))
  h.update('\0')
  h.update(fs.readFileSync(f))
}
const hash = h.digest('hex').slice(0, 8)

// Pose le hash de build dans dist/version.json (champ `b`) → la garde de version page-level
// (index.html, fetch /version.json no-store) reload sur CHAQUE deploy de CODE. Sans ça elle ne
// comparait que `v` (= release-notes `current`, inchangé sur un deploy de code) → ne reloadait
// JAMAIS sur un fix de code = cause « version grise coincée » (fondateur 18/06). `v` reste pour
// le Journal du Veilleur ; `b` est le déclencheur de fraîcheur.
try {
  const vp = path.join(root, 'dist', 'version.json')
  if (fs.existsSync(vp)) {
    const vj = JSON.parse(fs.readFileSync(vp, 'utf-8'))
    if (vj.b !== hash) {
      vj.b = hash
      fs.writeFileSync(vp, JSON.stringify(vj) + '\n', 'utf-8')
      console.log(`[stamp-sw] dist/version.json b → ${hash}`)
    }
  }
} catch (e) { console.error('[stamp-sw] version.json (non bloquant):', e.message) }

let sw = fs.readFileSync(swPath, 'utf-8')
const original = sw

// 1) CACHE_NAME ← hash de build. Tolère un suffixe -hash déjà présent (re-stamp).
const m = sw.match(/const CACHE_NAME = '(sargasses-v\d+)(?:-[a-z0-9]+)?'/)
if (!m) {
  console.error("[stamp-sw] CACHE_NAME introuvable dans dist/sw.js (format inattendu).")
  process.exit(1)
}
const stamped = `${m[1]}-${hash}`
sw = sw.replace(m[0], `const CACHE_NAME = '${stamped}'`)

// 2) PRECACHE_ASSETS ← tout le graphe JS/CSS buildé + data verdict. Précaché par le SW à
//    l'install (best-effort) → toute l'UI (chunks lazy inclus) marche OFFLINE dès le 1er
//    chargement complet. Sans ça, un visiteur passé hors ligne cassait sur paywall/hub/détail.
const distDir = path.join(root, 'dist')
const assetsDir = path.join(distDir, 'assets')
const precache = []
if (fs.existsSync(assetsDir)) {
  const stack = [assetsDir]
  while (stack.length) {
    const d = stack.pop()
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (/\.(js|css)$/i.test(e.name)) {
        precache.push('/' + path.relative(distDir, p).replace(/\\/g, '/'))
      }
    }
  }
}
// Data verdict hors STATIC_ASSETS (celles-ci y sont déjà) — présentes → précachées.
for (const rel of ['api/copernicus/sargassum.json', 'api/copernicus/track-record.json']) {
  if (fs.existsSync(path.join(distDir, rel))) precache.push('/' + rel)
}
precache.sort()
const list = precache.map(u => JSON.stringify(u)).join(',')
if (/const PRECACHE_ASSETS = \[[^\]]*\]/.test(sw)) {
  sw = sw.replace(/const PRECACHE_ASSETS = \[[^\]]*\]/, `const PRECACHE_ASSETS = [${list}]`)
} else {
  console.warn('[stamp-sw] placeholder PRECACHE_ASSETS introuvable dans dist/sw.js — précache offline NON injecté.')
}

if (sw !== original) {
  fs.writeFileSync(swPath, sw, 'utf-8')
  console.log(`[stamp-sw] dist/sw.js CACHE_NAME → ${stamped} · PRECACHE_ASSETS → ${precache.length} assets (hash de ${files.length} fichiers src/).`)
} else {
  console.log(`[stamp-sw] dist/sw.js déjà à jour (${stamped}, ${precache.length} assets précachés).`)
}

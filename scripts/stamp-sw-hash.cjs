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
const files = walk(srcDir, []).sort()
const h = crypto.createHash('sha256')
for (const f of files) {
  h.update(path.relative(root, f).replace(/\\/g, '/'))
  h.update('\0')
  h.update(fs.readFileSync(f))
}
const hash = h.digest('hex').slice(0, 8)

let sw = fs.readFileSync(swPath, 'utf-8')
// Tolère un éventuel suffixe -hash déjà présent (re-stamp).
const m = sw.match(/const CACHE_NAME = '(sargasses-v\d+)(?:-[a-z0-9]+)?'/)
if (!m) {
  console.error("[stamp-sw] CACHE_NAME introuvable dans dist/sw.js (format inattendu).")
  process.exit(1)
}
const stamped = `${m[1]}-${hash}`
const want = `const CACHE_NAME = '${stamped}'`
if (sw.includes(want)) {
  console.log(`[stamp-sw] dist/sw.js déjà à jour (${stamped}).`)
  process.exit(0)
}
sw = sw.replace(m[0], want)
fs.writeFileSync(swPath, sw, 'utf-8')
console.log(`[stamp-sw] dist/sw.js CACHE_NAME → ${stamped} (hash de ${files.length} fichiers src/).`)

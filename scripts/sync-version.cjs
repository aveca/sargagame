#!/usr/bin/env node
/**
 * sync-version.cjs — UN SEUL point de bump pour toute la flotte.
 *
 * Lit public/release-notes.json (`current`) et synchronise :
 *   1. public/version.json   → { v: current, date }   (ping cache-bust + Journal du Veilleur)
 *   2. public/sw.js          → const CACHE_NAME = 'sargasses-<current>'
 *
 * Pourquoi : avant, le CACHE_NAME du SW était bumpé À LA MAIN et version.json
 * vivait sa vie (figé sur MQ/GP depuis le 2026-04-14, churn quotidien sur les
 * régions USD). Résultat : versions incohérentes d'un site à l'autre + le
 * mécanisme de fraîcheur version.json mort sur les 2 sites principaux. Désormais,
 * éditer release-notes.json bump TOUT, partout, d'un coup. Idempotent.
 *
 * Lancé en `prebuild` (npm run build) → s'applique à chaque build de chaque région,
 * donc les 5 dossiers FTP partent toujours de la même version. Lançable seul :
 *   node scripts/sync-version.cjs
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const notesPath = path.join(root, 'public', 'release-notes.json')
const versionPath = path.join(root, 'public', 'version.json')
const swPath = path.join(root, 'public', 'sw.js')

function fail(msg) { console.error('[sync-version] ' + msg); process.exit(1) }

if (!fs.existsSync(notesPath)) fail('public/release-notes.json introuvable.')
let notes
try { notes = JSON.parse(fs.readFileSync(notesPath, 'utf-8')) }
catch (e) { fail('release-notes.json invalide: ' + e.message) }

const current = notes.current
if (!current || !/^v\d+$/.test(current)) {
  fail(`release-notes.json: "current" doit être de la forme "vNNN" (reçu: ${JSON.stringify(current)}).`)
}
if (!Array.isArray(notes.releases) || !notes.releases.length || notes.releases[0].v !== current) {
  fail('release-notes.json: releases[0].v doit être égal à "current".')
}
const date = (notes.releases[0].date) || new Date().toISOString().slice(0, 10)

// ── 1. version.json ────────────────────────────────────────────────────────
const versionPayload = JSON.stringify({ v: current, date }) + '\n'
const prevVersion = fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf-8') : ''
if (prevVersion !== versionPayload) {
  fs.writeFileSync(versionPath, versionPayload, 'utf-8')
  console.log(`[sync-version] public/version.json → {"v":"${current}","date":"${date}"}`)
} else {
  console.log(`[sync-version] public/version.json déjà à jour (${current})`)
}

// ── 2. sw.js CACHE_NAME ──────────────────────────────────────────────────────
if (!fs.existsSync(swPath)) fail('public/sw.js introuvable.')
const sw = fs.readFileSync(swPath, 'utf-8')
const wantCache = `sargasses-${current}`
const m = sw.match(/const CACHE_NAME = '(sargasses-v\d+)'/)
if (!m) fail("public/sw.js : ligne `const CACHE_NAME = 'sargasses-vNNN'` introuvable (format inattendu).")
const haveCache = m[1]

// Garde anti-régression : ne JAMAIS faire reculer le numéro de cache (ferait
// rejouer un vieux bundle aux visiteurs qui avaient déjà la version récente).
const numOf = (s) => parseInt(s.replace('sargasses-v', ''), 10)
if (numOf(wantCache) < numOf(haveCache)) {
  fail(`régression de version refusée : release-notes "current"=${current} (→ ${wantCache}) est INFÉRIEUR au CACHE_NAME actuel ${haveCache}. Monte "current" dans release-notes.json.`)
}
if (haveCache !== wantCache) {
  fs.writeFileSync(swPath, sw.replace(m[0], `const CACHE_NAME = '${wantCache}'`), 'utf-8')
  console.log(`[sync-version] public/sw.js CACHE_NAME ${haveCache} → ${wantCache}`)
} else {
  console.log(`[sync-version] public/sw.js CACHE_NAME déjà à jour (${wantCache})`)
}

console.log(`[sync-version] OK — flotte alignée sur ${current} (${date}).`)

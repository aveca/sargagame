#!/usr/bin/env node
'use strict'

// Contrat PWA - mission SARG-MOBILE-PWA-EXPERIENCE-20261126 (aveca/sargagame#1492).
// Verrouille :
//   1. les champs d'installabilite du manifest (name/short_name/start_url/display/
//      icones 192 + 512 en "any maskable", theme/background) ;
//   2. le caractere REGION-NEUTRE du manifest : public/ est partage par les six
//      builds regionaux (regions/*.json injecte via VITE_REGION). Un nom regional
//      faisait mentir l'installation sur cinq domaines sur six (defaut mesure :
//      "Sargasses Martinique & Guadeloupe" affiche a l'installation sur Miami,
//      Punta Cana, Cancun, Tulum) ;
//   3. chaque raccourci pointe vers une route REELLEMENT livree
//      (public/<route>/index.html) - defaut mesure : /carte-sargasses/ et
//      /previsions/ ne sont pas livres et renvoyaient 404 ;
//   4. la coquille service worker : sw.js livre + enregistre dans index.html +
//      icones presentes sur disque (magic PNG verifie).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'))
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

// 1. champs d'installabilite
for (const key of ['name', 'short_name', 'start_url', 'display', 'icons', 'background_color', 'theme_color', 'lang']) {
  assert.ok(manifest[key], `manifest: champ obligatoire absent (${key})`)
}
assert.equal(manifest.display, 'standalone', 'display doit rester standalone')

// icones declarees + presentes sur disque + magic bytes
const sizes = new Set(manifest.icons.filter((i) => i.type === 'image/png').map((i) => i.sizes))
for (const required of ['192x192', '512x512']) {
  assert.ok(sizes.has(required), `icone PNG ${required} obligatoire pour l'installation`)
}
for (const icon of manifest.icons) {
  const file = path.join(root, 'public', icon.src.replace(/^\//, ''))
  assert.ok(fs.existsSync(file), `fichier d'icone absent: ${icon.src}`)
  const head = fs.readFileSync(file).subarray(0, 8)
  const isPng = icon.type === 'image/png' && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  const isSvg = icon.type === 'image/svg+xml'
  assert.ok(isPng || isSvg, `type d'icone incoherent: ${icon.src} (${icon.type})`)
}
const maskable192 = manifest.icons.some((i) => i.sizes === '192x192' && /maskable/.test(i.purpose || ''))
const maskable512 = manifest.icons.some((i) => i.sizes === '512x512' && /maskable/.test(i.purpose || ''))
assert.ok(maskable192 && maskable512, 'icones maskable 192 + 512 requises (icones adaptatives Android)')

// 2. region-neutre : public/ est partage par les six domaines
const copy = `${manifest.name} ${manifest.description || ''}`
assert.doesNotMatch(
  copy,
  /Martinique|Guadeloupe|Miami|Punta\s*Cana|Canc[uú]n|Cancun|Tulum|Florida|Antilles/i,
  'le manifest est partage par les six domaines : pas de nom ni de description regionale'
)

// 3. raccourcis = routes livrees (public/<route>/index.html)
assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 1, 'au moins un raccourci')
for (const shortcut of manifest.shortcuts) {
  const route = shortcut.url.replace(/[?#].*$/, '')
  const file = path.join(root, 'public', route.replace(/^\//, ''), 'index.html')
  assert.ok(fs.existsSync(file), `raccourci vers une route non livree: ${shortcut.url}`)
}

// 4. coquille SW
assert.ok(fs.existsSync(path.join(root, 'public/sw.js')), 'sw.js doit etre livre dans public/')
assert.match(html, /<link[^>]+rel="manifest"[^>]+href="\/manifest\.json"/, 'index.html doit lier le manifest')
assert.match(html, /navigator\.serviceWorker\.register\(\s*['"]\/sw\.js['"]/, 'index.html doit enregistrer /sw.js')
assert.match(html, /rel="apple-touch-icon"/, 'icone iOS (Add to Home Screen) liee')

console.log('OK - contrat PWA : installabilite, manifest region-neutre, raccourcis reels, coquille SW')
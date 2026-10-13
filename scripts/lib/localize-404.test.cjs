#!/usr/bin/env node
/**
 * localize-404.test.cjs — auto-découvert par scripts/run-tests.cjs (donc lancé
 * en CI via `npm test`). Régressions tâche 404-i18n-20261011-001 :
 *   1. FR (mq/gp) : comportement historique strictement inchangé.
 *   2. EN (florida, barbados, puntacana) : aucun résidu français.
 *   3. ES (rivieramaya, tulum) : espagnol complet, ni français ni anglais.
 *   4. Les 7 régions réelles passent sans exception, lang attr conforme.
 *   5. Garde fail-loud : ancre manquante → throw (dérive source détectée).
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const { localize404 } = require('./localize-404.cjs')
const R = require('../../regions/index.cjs')

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', '404.html'), 'utf-8')
const byId = Object.fromEntries(R.getAllRegions().map(r => [r.id, r]))

const FR_MARKERS = [
  'Même le satellite', 'glissé au large', 'Voir la carte des sargasses',
  'Le Plan B', 'la carte du jour', 'Prévisions 7 jours', 'Mentions légales',
  'Confidentialité', 'Le Veilleur a perdu', 'lang="fr"'
]
const EN_MARKERS = [
  'Even the satellite', 'See the sargassum map', "today's map",
  '7-day forecast', 'lang="en"'
]
const HREFS = ['href="/"', 'href="/previsions/"', 'href="/mentions-legales.html"', 'href="/confidentialite.html"']

let n = 0
function test(name, fn) {
  n++
  try { fn(); console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

test('FR (mq) : inchangé sauf nom de site, comportement historique', () => {
  const out = localize404(SRC, byId.mq, byId.mq.name)
  assert.ok(out.includes('<html lang="fr">'), 'lang fr conservé')
  assert.ok(out.includes('Même le satellite a perdu celle-ci'), 'h1 FR intact')
  assert.ok(out.includes('Sargassum Martinique'), 'nom de site remplacé (historique)')
  assert.ok(!out.includes('Sargasses Martinique & Guadeloupe'), 'ancien nom parti')
})

test('EN (florida) : zéro résidu français, liens/SEO intacts', () => {
  const out = localize404(SRC, byId.florida, byId.florida.name)
  assert.ok(out.includes('<html lang="en">'), 'lang en')
  for (const m of FR_MARKERS) assert.ok(!out.includes(m), `résidu FR: ${m}`)
  assert.ok(out.includes('Even the satellite lost this one'), 'h1 EN')
  assert.ok(out.includes('See the sargassum map'), 'CTA EN')
  assert.ok(out.includes('Sargassum Florida'), 'brand EN')
  for (const h of HREFS) assert.ok(out.includes(h), `lien conservé: ${h}`)
  assert.ok(out.includes('noindex, follow'), 'robots conservé')
})

test('ES (tulum) : espagnol complet, ni FR ni EN', () => {
  const out = localize404(SRC, byId.tulum, byId.tulum.name)
  assert.ok(out.includes('<html lang="es">'), 'lang es')
  for (const m of FR_MARKERS) assert.ok(!out.includes(m), `résidu FR: ${m}`)
  for (const m of EN_MARKERS) assert.ok(!out.includes(m), `résidu EN: ${m}`)
  assert.ok(out.includes('Hasta el satélite perdió esta'), 'h1 ES')
  assert.ok(out.includes('Ver el mapa de sargazo'), 'CTA ES')
  assert.ok(out.includes('Sargazo Tulum'), 'brand ES')
  for (const h of HREFS) assert.ok(out.includes(h), `lien conservé: ${h}`)
})

test('les 7 régions réelles passent, lang attr conforme à primaryLang', () => {
  for (const r of R.getAllRegions()) {
    const out = localize404(SRC, r, r.name)
    const want = r.primaryLang === 'fr' ? 'fr' : r.primaryLang
    assert.ok(out.includes(`<html lang="${want}">`), `${r.id}: lang=${want}`)
  }
})

test('garde fail-loud : ancre manquante → throw explicite', () => {
  assert.throws(
    () => localize404('<html><body>sans ancres</body></html>', byId.florida, 'Florida'),
    /404-i18n: ancre introuvable/,
    'devrait lever sur source dérivante'
  )
})

test('idempotence Vite → prepare-ftp : une 404 déjà localisée est préservée', () => {
  for (const r of R.getAllRegions()) {
    const once = localize404(SRC, r, r.name)
    const twice = localize404(once, r, r.name)
    assert.strictEqual(twice, once, `${r.id}: seconde localisation identique octet par octet`)
  }
})

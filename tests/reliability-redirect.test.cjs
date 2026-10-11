#!/usr/bin/env node
/**
 * Test de régression Jalon 4 — redirection legacy /fiabilite/ pour les régions.
 * Constat live 2026-10-11 : /fiabilite/ = HTTP 404 sur sargassummiami.com,
 * sargassumpuntacana.com, sargassumcancun.com (slug FR absent des builds régionaux,
 * alors que /reliability/ et /fiabilidad/ existent). generateReliabilityPages(region)
 * doit désormais émettre dist/fiabilite/index.html → redirection vers le slug primaire.
 *
 * Auto-exécutant (pattern fb-gate) : exit 0 = OK, exit 1 = échec.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const { generateReliabilityPages } = require('../scripts/lib/reliability-page.cjs')

let failures = 0
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`) } else { failures++; console.error(`  ✗ ${msg}`) }
}

const mkDist = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relpg-'))
const seedSitemap = dist => fs.writeFileSync(
  path.join(dist, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
)

console.log('1) Région EN primaire (florida-like) → /fiabilite/ doit rediriger vers /reliability/')
{
  const dist = mkDist()
  seedSitemap(dist)
  generateReliabilityPages(
    { id: 'florida', domain: 'sargassummiami.com', name: 'Florida', primaryLang: 'en', secondaryLangs: ['es'] },
    dist
  )
  const legacyFile = path.join(dist, 'fiabilite', 'index.html')
  assert(fs.existsSync(legacyFile), 'dist/fiabilite/index.html écrit')
  if (fs.existsSync(legacyFile)) {
    const html = fs.readFileSync(legacyFile, 'utf-8')
    assert(html.includes('url=/reliability/'), 'meta refresh vers /reliability/')
    assert(html.includes('location.replace("/reliability/")'), 'fallback JS location.replace')
    assert(html.includes('rel="canonical" href="https://sargassummiami.com/reliability/"'), 'canonical sur la page cible')
    assert(!html.includes('backtest'), 'pas de contenu inventé (page = pure redirection)')
  }
  assert(fs.existsSync(path.join(dist, 'reliability', 'index.html')), 'page canonique /reliability/ toujours générée')
  const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf-8')
  assert(sm.includes('/reliability/'), 'sitemap référence /reliability/')
  assert(!sm.includes('/fiabilite/'), 'sitemap NE référence PAS la redirection')
  fs.rmSync(dist, { recursive: true, force: true })
}

console.log('2) Région ES primaire (puntacana-like) → /fiabilite/ doit rediriger vers /fiabilidad/')
{
  const dist = mkDist()
  seedSitemap(dist)
  generateReliabilityPages(
    { id: 'puntacana', domain: 'sargassumpuntacana.com', name: 'Punta Cana', primaryLang: 'es', secondaryLangs: ['en'] },
    dist
  )
  const legacyFile = path.join(dist, 'fiabilite', 'index.html')
  assert(fs.existsSync(legacyFile), 'dist/fiabilite/index.html écrit')
  if (fs.existsSync(legacyFile)) {
    const html = fs.readFileSync(legacyFile, 'utf-8')
    assert(html.includes('url=/fiabilidad/'), 'meta refresh vers /fiabilidad/ (langue primaire ES)')
  }
  assert(fs.existsSync(path.join(dist, 'fiabilidad', 'index.html')), 'page canonique /fiabilidad/ générée')
  fs.rmSync(dist, { recursive: true, force: true })
}

if (failures) { console.error(`\n✗ ${failures} assertion(s) en échec`); process.exit(1) }
console.log('\nOK — redirection legacy /fiabilite/ conforme')

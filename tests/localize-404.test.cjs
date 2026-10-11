#!/usr/bin/env node
/**
 * Test de régression — page 404 localisée par région (canal, mission
 * sargagame-ux-repair-404-i18n-20261011-001). Constat live 2026-10-11 : la
 * 404 FR générique était servie sur les domaines EN/ES.
 * Auto-exécutant (pattern fb-gate) : exit 0 = OK, exit 1 = échec.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const { build404, localize404 } = require('../scripts/lib/legacy-404-localize.cjs')

let failures = 0
const assert = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`) } }

console.log('1) Région EN primaire (florida-like)')
{
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'l404-'))
  fs.writeFileSync(path.join(dist, '404.html'), '<html lang="fr">' + 'ancienne 404 FR</html>')
  const r = localize404({ id: 'florida', primaryLang: 'en' }, dist)
  assert(r.lang === 'en', 'langue résolue = en')
  const html = fs.readFileSync(path.join(dist, '404.html'), 'utf-8')
  assert(html.includes('<html lang="en"'), 'html lang=en')
  assert(html.includes('Even the satellite lost this one'), 'titre 404 localisé EN')
  assert(!html.includes('Même le satellite a perdu celle-ci'), 'le texte FR a disparu')
  assert(html.includes('/reliability/'), 'lien vers /reliability/ (slug existant au build)')
  assert(html.includes('/terms/') && html.includes('/privacy/'), 'liens légaux régionaux EN existants')
  assert(html.includes('rel="stylesheet"'), 'styles préservés')
  fs.rmSync(dist, { recursive: true, force: true })
}

console.log('2) Région ES primaire (puntacana-like)')
{
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'l404-'))
  fs.writeFileSync(path.join(dist, '404.html'), 'ancienne 404 FR')
  const r = localize404({ id: 'puntacana', primaryLang: 'es' }, dist)
  assert(r.lang === 'es', 'langue résolue = es')
  const html = fs.readFileSync(path.join(dist, '404.html'), 'utf-8')
  assert(html.includes('<html lang="es"'), 'html lang=es')
  assert(html.includes('Hasta el satélite perdió esta página'), 'titre 404 localisé ES')
  assert(html.includes('/fiabilidad/'), 'lien vers /fiabilidad/ (slug ES généré)')
  assert(html.includes('/terminos/') && html.includes('/privacidad/'), 'liens légaux ES existants')
  fs.rmSync(dist, { recursive: true, force: true })
}

console.log('3) build404 fr conservé (MQ/GP inchangés par sécurité)')
{
  const html = build404('fr')
  assert(html.includes('Même le satellite a perdu celle-ci'), 'contenu FR historique préservé')
  assert(html.includes('/previsions/'), 'lien historique /previsions/ sur domaines FR')
}

if (failures) { console.error(`\n✗ ${failures} assertion(s) en échec`); process.exit(1) }
console.log('\nOK — 404 localisée conforme (3 langues couvertes, liens internes valides)')

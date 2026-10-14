#!/usr/bin/env node
/**
 * Régression SEO — pages légales MQ/GP : sitemap et canonicals extensionless.
 * Constat live 2026-10-13 (crawl 641 URLs) : les sitemaps MQ/GP listent
 * /mentions-legales.html, /confidentialite.html, /cgv.html, /remboursement.html
 * qui répondent 307 vers les formes extensionless, elles-mêmes 200 avec un
 * canonical pointant vers la forme .html (contradiction + hop inutile).
 * Correctif : canonicals et entrées sitemap en forme extensionless
 * (servie 200 en direct, octets identiques prouvés), overlay GP inchangé
 * (swap de domaine path-agnostique dans prepare-ftp.cjs).
 *
 * Auto-exécutant : exit 0 = OK, exit 1 = échec.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SLUGS = ['mentions-legales', 'confidentialite', 'cgv', 'remboursement']

let failures = 0
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`) } else { failures++; console.error(`  ✗ ${msg}`) }
}

console.log('1) Canonicals des 4 pages légales statiques (forme extensionless, template MQ)')
for (const slug of SLUGS) {
  const p = path.join(ROOT, 'public', `${slug}.html`)
  assert(fs.existsSync(p), `${slug}.html présent dans public/`)
  if (!fs.existsSync(p)) continue
  const html = fs.readFileSync(p, 'utf-8')
  const m = html.match(/<link rel="canonical" href="([^"]+)" \/>/)
  assert(!!m, `${slug} : canonical présent`)
  if (m) {
    assert(m[1] === `https://sargasses-martinique.com/${slug}`,
      `${slug} : canonical extensionless template MQ (vu : ${m[1]})`)
    assert(!m[1].endsWith('.html'), `${slug} : canonical sans .html (pas de hop 307)`)
  }
}

console.log('2) Bloc sitemap MQ/GP de vite.config.js (aucune entrée .html légale)')
{
  const vc = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf-8')
  for (const slug of SLUGS) {
    assert(!vc.includes(`/${slug}.html</loc>`), `sitemap : pas de /${slug}.html`)
    assert(vc.includes(`/\${d}/${slug}</loc>`) || vc.includes(`\${d}/${slug}</loc>`),
      `sitemap : entrée extensionless /${slug} présente`)
  }
}

console.log('3) Cohérence sitemap ↔ canonical (même chemin, pas de contradiction)')
for (const slug of SLUGS) {
  const html = fs.readFileSync(path.join(ROOT, 'public', `${slug}.html`), 'utf-8')
  const canonPath = (html.match(/<link rel="canonical" href="https:\/\/[^/]+([^"]+)" \/>/) || [])[1]
  assert(canonPath === `/${slug}`, `${slug} : chemin canonical == chemin sitemap (/${slug})`)
}

console.log(failures ? `\n${failures} échec(s)` : '\nOK — canonicals et sitemap légaux cohérents (extensionless)')
process.exit(failures ? 1 : 0)

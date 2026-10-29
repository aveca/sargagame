#!/usr/bin/env node
// Regression test: every emitted EN/ES region has a localized beach directory
// with canonical, hreflang, real beach links, and a sitemap entry.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { generateRegionSeoPages } = require('../../scripts/lib/region-seo-pages.cjs')
const { emittedLangs, normLang } = require('../../scripts/lib/region-langs.cjs')

const ROOT = path.resolve(__dirname, '../..')
const REGION_IDS = ['florida', 'puntacana', 'rivieramaya']

function template(domain, lang) {
  return `<!doctype html><html lang="${lang}"><head>
<title>Template</title>
<meta name="description" content="Template">
<link rel="canonical" href="https://${domain}/">
<meta property="og:title" content="Template">
<meta property="og:description" content="Template">
<meta property="og:url" content="https://${domain}/">
<meta name="twitter:title" content="Template">
<meta name="twitter:description" content="Template">
<link rel="alternate" hreflang="${lang}" href="https://${domain}/" />
<script type="application/ld+json">{}</script>
</head><body><noscript><h1>Template</h1></noscript><div id="root"></div></body></html>`
}

let checks = 0
for (const id of REGION_IDS) {
  const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', `${id}.json`), 'utf8'))
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `sargagame-${id}-`))
  try {
    fs.writeFileSync(path.join(outDir, 'index.html'), template(region.domain, normLang(region.primaryLang)))
    generateRegionSeoPages(region, outDir)
    const primary = normLang(region.primaryLang)
    const langs = emittedLangs(region)
    for (const lang of langs) {
      const prefix = lang === primary ? '' : `/${lang}`
      const dir = lang === 'es' ? 'playas' : 'beaches'
      const route = `${prefix}/${dir}/`
      const file = path.join(outDir, ...`${route}index.html`.split('/').filter(Boolean))
      assert.ok(fs.existsSync(file), `${id}: missing ${route}index.html`)
      const html = fs.readFileSync(file, 'utf8')
      const canonical = `https://${region.domain}${route}`
      assert.ok(html.includes(`<html lang="${lang}"`), `${id}/${lang}: incorrect html lang`)
      assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`), `${id}/${lang}: missing self-canonical`)
      assert.ok(html.includes(`hreflang="${lang}" href="${canonical}"`), `${id}/${lang}: missing self hreflang`)
      const primaryDir = primary === 'es' ? 'playas' : 'beaches'
      const xDefault = `https://${region.domain}/${primaryDir}/`
      assert.ok(html.includes(`hreflang="x-default" href="${xDefault}"`), `${id}/${lang}: incorrect x-default`)
      const linkedBeaches = html.match(/<li><a href="/g) || []
      assert.equal(linkedBeaches.length, (region.beaches || []).length, `${id}/${lang}: directory does not link every regional beach`)
      const sitemap = fs.readFileSync(path.join(outDir, 'sitemap.xml'), 'utf8')
      assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${id}/${lang}: index missing from sitemap`)
      assert.ok(!fs.existsSync(path.join(outDir, 'plages', 'index.html')), `${id}/${lang}: unexpected FR index in USD build`)
      checks += 8
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true })
  }
}
console.log(`REGIONAL_BEACH_DIRECTORY_INDEX_TESTS PASS (${checks} assertions across ${REGION_IDS.length} regions)`)

'use strict'

const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { buildPage } = require('../../scripts/lib/premium-page.cjs')
const { buildOffersPage } = require('../../scripts/lib/offers-page.cjs')
const { injectFirstPaint } = require('../../scripts/lib/home-first.cjs')

const root = path.resolve(__dirname, '../..')
const regions = {
  gp: JSON.parse(fs.readFileSync(path.join(root, 'regions/gp.json'), 'utf8')),
  florida: JSON.parse(fs.readFileSync(path.join(root, 'regions/florida.json'), 'utf8')),
  rivieramaya: JSON.parse(fs.readFileSync(path.join(root, 'regions/rivieramaya.json'), 'utf8')),
  puntacana: JSON.parse(fs.readFileSync(path.join(root, 'regions/puntacana.json'), 'utf8')),
  tulum: JSON.parse(fs.readFileSync(path.join(root, 'regions/tulum.json'), 'utf8')),
}
const iso = '2026-11-09T12:00:00.000Z'

const gpPremium = buildPage(Object.assign({}, regions.gp, { primaryLang: 'fr' }))
assert.match(gpPremium, /plage de Guadeloupe/)
assert.doesNotMatch(gpPremium, /plage de Martinique/)
assert.match(gpPremium, /<title>[^<]*Guadeloupe/)

for (const id of ['florida', 'rivieramaya', 'puntacana', 'tulum']) {
  const lang = id === 'florida' ? 'en' : 'es'
  const html = buildPage(Object.assign({}, regions[id], { primaryLang: lang }))
  assert.doesNotMatch(html, /Prévisions sargasses Martinique/, id + ' premium title')
  assert.match(html, new RegExp(regions[id].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), id + ' premium names the region')
}

const miami = buildOffersPage(regions.florida, iso)
assert.match(miami, /lang="en"/)
assert.match(miami, /\$8\.99/)
assert.match(miami, /\$16\.99/)
assert.match(miami, /\$27\.99/)
assert.match(miami, /\$89\/month/)
assert.match(miami, /\$790/)
assert.match(miami, /data-sg-lead/)
assert.match(miami, /2026/)
assert.doesNotMatch(miami, /219/)
assert.doesNotMatch(miami, /Martinique/)

for (const id of ['rivieramaya', 'puntacana', 'tulum']) {
  const html = buildOffersPage(regions[id], iso)
  assert.match(html, /lang="es"/, id)
  assert.match(html, /\$8\.99/, id)
  assert.match(html, /data-sg-lead/, id)
  assert.doesNotMatch(html, /Prévisions sargasses Martinique/, id)
  assert.doesNotMatch(html, /219/, id)
}

const home = injectFirstPaint('<div id="root"><div id="sg-boot"></div><noscript><h1>old</h1></noscript></div>', regions.florida, iso)
assert.match(home, /id="sg-first"/)
assert.match(home, /Latest satellite observation/)
assert.match(home, /href="\/offres\/#pro"/)
assert.match(home, /pass=p30/)
assert.match(home, /<h1>old<\/h1>/)

const off = buildOffersPage(regions.florida, iso)
assert.doesNotMatch(off, /rel="sponsored"/)

const pricing = ['public/pro/pricing/index.html', 'public/pro/en/pricing/index.html', 'public/pro/es/pricing/index.html']
for (const rel of pricing) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8')
  assert.doesNotMatch(html, /219/, rel)
  assert.doesNotMatch(html, /2 mois offerts|two months free|dos meses gratis/i, rel)
}

console.log('PASS commercial offers pages')

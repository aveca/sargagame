'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')

const cases = [
  {
    id: 'florida',
    domain: 'sargassummiami.com',
    beachCount: 20,
    title: 'Florida Sargassum Map — Satellite Beach Observations',
    description: 'Latest available satellite observations for Florida beaches, from Miami to Key West. Check each observation date and confidence before planning a visit.',
    routes: {
      season: 'sargassum-season-florida',
      best: 'best-beaches-no-sargassum-florida',
      weekly: 'sargassum-florida-this-week',
    },
  },
  {
    id: 'puntacana',
    domain: 'sargassumpuntacana.com',
    beachCount: 12,
    title: 'Punta Cana Sargassum Map — Satellite Beach Observations',
    description: 'Latest available satellite observations for Punta Cana beaches, including Bávaro, Macao and Cap Cana. Check each observation date and confidence before you go.',
    routes: {
      season: 'sargassum-season-punta-cana',
      best: 'best-beaches-no-sargassum-punta-cana',
      weekly: 'sargassum-punta-cana-this-week',
    },
  },
]

const unsupportedFreshness = [
  /\btoday\b/i,
  /\blive\b/i,
  /\bin real time\b/i,
  /\breal-time\b/i,
  /\bupdated\s+daily\b/i,
  /\bupdated\s+4\s*[×x]?\s*(?:times\s+)?daily\b/i,
  /\b4\s*[×x]\s*daily\b/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\bevery\s+4\s+hours\b/i,
  /\bright now\b/i,
]

for (const item of cases) {
  const file = path.join(root, 'regions', item.id + '.json')
  const region = JSON.parse(fs.readFileSync(file, 'utf8'))

  assert.equal(region.domain, item.domain, item.id + ' domain identity is preserved')
  assert.equal(region.currency, 'USD', item.id + ' currency is preserved')
  assert.equal(region.primaryLang, 'en', item.id + ' primary language is preserved')
  assert.deepEqual(region.secondaryLangs, ['es'], item.id + ' secondary language is preserved')
  assert.equal(region.beaches.length, item.beachCount, item.id + ' beach catalogue is preserved')
  assert.deepEqual(region.routes, item.routes, item.id + ' canonical route slugs are preserved')
  assert.equal(region.seo.homeTitle, item.title, item.id + ' title uses evidence-based copy')
  assert.equal(region.seo.homeDesc, item.description, item.id + ' description uses evidence-based copy')

  for (const pattern of unsupportedFreshness) {
    assert.doesNotMatch(region.seo.homeTitle, pattern, item.id + ' title must not promise unsupported freshness: ' + pattern)
    assert.doesNotMatch(region.seo.homeDesc, pattern, item.id + ' description must not promise unsupported freshness: ' + pattern)
  }

  assert.match(region.seo.homeDesc, /latest available satellite observations/i)
  assert.match(region.seo.homeDesc, /observation date/i)
  assert.match(region.seo.homeDesc, /confidence/i)
  assert.doesNotMatch(region.seo.homeDesc, /\b\d+\s+beaches\b/i, item.id + ' meta description must not hard-code a beach count')
  assert.ok(region.seo.homeTitle.length <= 60, item.id + ' title remains concise')
  assert.ok(region.seo.homeDesc.length <= 160, item.id + ' meta description remains concise')
  assert.equal(region.seo.freshTitles, true, item.id + ' title pipeline flag is preserved')
  assert.equal(region.seo.dateModifiedFromPipeline, true, item.id + ' dateModified pipeline flag is preserved')
}

for (const marker of ['region.seo.homeTitle', 'region.seo.homeDesc', 'og:title', 'og:description', 'twitter:title', 'twitter:description']) {
  assert.ok(generator.includes(marker), 'regional homepage generator must propagate ' + marker)
}

console.log('US_REGION_HOME_META_FRESHNESS PASS')

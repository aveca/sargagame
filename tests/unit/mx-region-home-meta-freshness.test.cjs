'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')

const cases = [
  {
    id: 'rivieramaya',
    domain: 'sargassumcancun.com',
    title: 'Sargazo en Cancún y Riviera Maya — Observaciones satelitales',
    description: 'Últimas observaciones satelitales disponibles en Cancún y Riviera Maya. Consulta la fecha de observación y la confianza antes de elegir playa.',
    beachCount: 20,
    routes: {
      season: 'temporada-sargazo-rivieramaya',
      best: 'mejores-playas-sin-sargazo-rivieramaya',
      weekly: 'sargazo-rivieramaya-esta-semana',
    },
  },
  {
    id: 'tulum',
    domain: 'sargazotulum.com',
    title: 'Sargazo en Tulum — Observaciones satelitales',
    description: 'Últimas observaciones satelitales disponibles para las playas de Tulum. Revisa la fecha de observación y la confianza antes de decidir.',
    beachCount: 5,
    routes: {
      season: 'temporada-sargazo-tulum',
      best: 'mejores-playas-sin-sargazo-tulum',
      weekly: 'sargazo-tulum-esta-semana',
    },
  },
]

const unsupportedFreshness = [
  /\\bhoy\\b/i,
  /\\ben vivo\\b/i,
  /\\btiempo real\\b/i,
  /\\blive\\b/i,
  /\\btoday\\b/i,
  /\\breal[- ]?time\\b/i,
  /\\bpron[oó]stico(?:\\s+de)?\\s+7\\s+d[ií]as\\b/i,
  /\\bactualizad[oa]\\s+4\\s+veces\\s+al\\s+d[ií]a\\b/i,
  /\\b4\\s+veces\\s+al\\s+d[ií]a\\b/i,
  /\\bcuatro\\s+veces\\s+al\\s+d[ií]a\\b/i,
]

for (const item of cases) {
  const region = JSON.parse(fs.readFileSync(path.join(root, 'regions', item.id + '.json'), 'utf8'))

  assert.equal(region.id, item.id, item.id + ' region id is preserved')
  assert.equal(region.domain, item.domain, item.id + ' domain is preserved')
  assert.equal(region.primaryLang, 'es', item.id + ' primary language is preserved')
  assert.deepEqual(region.secondaryLangs, ['en'], item.id + ' secondary language is preserved')
  assert.equal(region.currency, 'USD', item.id + ' currency is preserved')
  assert.equal(region.beaches.length, item.beachCount, item.id + ' beach catalogue is preserved')
  assert.equal(region.beachFilter.island, item.id, item.id + ' beach filter is preserved')
  assert.deepEqual(region.routes, item.routes, item.id + ' canonical route slugs are preserved')

  assert.equal(region.seo.homeTitle, item.title, item.id + ' title uses observation-based copy')
  assert.equal(region.seo.homeDesc, item.description, item.id + ' description uses observation-based copy')
  assert.ok(region.seo.homeTitle.length <= 60, item.id + ' title stays within 60 characters')
  assert.ok(region.seo.homeDesc.length <= 160, item.id + ' description stays within 160 characters')
  assert.equal(region.seo.freshTitles, true, item.id + ' freshTitles pipeline flag is preserved')
  assert.equal(region.seo.dateModifiedFromPipeline, true, item.id + ' dateModified pipeline flag is preserved')

  for (const pattern of unsupportedFreshness) {
    assert.doesNotMatch(region.seo.homeTitle, pattern, item.id + ' title must not promise unsupported freshness')
    assert.doesNotMatch(region.seo.homeDesc, pattern, item.id + ' description must not promise unsupported freshness')
  }

  assert.match(region.seo.homeTitle, /sargazo/i)
  assert.match(region.seo.homeTitle, /observaciones satelitales/i)
  assert.match(region.seo.homeDesc, /observaciones satelitales disponibles/i)
  assert.match(region.seo.homeDesc, /fecha de observación/i)
  assert.match(region.seo.homeDesc, /confianza/i)
  assert.doesNotMatch(region.seo.homeDesc, /\\b\\d+\\s+playas\\b/i, item.id + ' meta description must not hard-code beach counts')
}

for (const marker of [
  'region.seo.homeTitle',
  'region.seo.homeDesc',
  'og:title',
  'og:description',
  'twitter:title',
  'twitter:description',
]) {
  assert.ok(generator.includes(marker), 'regional homepage generator must propagate ' + marker)
}

console.log('MX_REGION_HOME_META_FRESHNESS PASS')

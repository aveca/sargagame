'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const source = JSON.parse(fs.readFileSync(
  path.join(root, 'regions/seo-content/puntacana.es.json'),
  'utf8',
))
const page = source.extraPages.find(item => item.slug === 'como-saber-si-hay-sargazo-en-punta-cana')

assert.ok(page, 'Punta Cana Spanish guide route remains present')
assert.equal(page.lang, 'es', 'route remains Spanish')
assert.equal(page.priority, '0.7', 'SEO priority is preserved')
assert.equal(page.daily, false, 'route remains non-daily content')
assert.match(page.title, /sargazo en Punta Cana/i, 'search intent remains in the title')
assert.match(page.h1, /sargazo en Punta Cana/i, 'search intent remains in the H1')

const copy = [
  page.desc,
  page.intro,
  ...page.sections.flatMap(section => [section.h2, section.text]),
  ...page.faq.flatMap(item => [item.q, item.a]),
].join('\n')

const unsupportedCadence = [
  /\b(?:4|cuatro)\s*(?:×|x)?\s*veces\s*(?:al|por)\s*d[ií]a\b/i,
  /\b(?:actualizad[oa]s?|refrescad[oa]s?)\s*(?:4|cuatro)\s*veces\s*al\s*d[ií]a\b/i,
  /\b(?:actualizado|actualizada)\s+4\s+veces\s+al\s+d[ií]a\b/i,
]
const unsupportedLiveClaims = [
  /\bmapa(?: satelital)? en vivo\b/i,
  /\bestado en vivo\b/i,
  /\bahora mismo\b/i,
  /\bcondiciones reales de esta ma[ñn]ana\b/i,
]

for (const pattern of unsupportedCadence) {
  assert.doesNotMatch(copy, pattern, 'guide must not promise a fixed satellite update cadence')
}
for (const pattern of unsupportedLiveClaims) {
  assert.doesNotMatch(copy, pattern, 'guide must not imply a continuous/live satellite feed')
}

assert.match(copy, /última observación satelital publicada/i, 'guide identifies the latest published observation')
assert.match(copy, /hora.*confianza|confianza.*hora/i, 'guide tells visitors to check observation time and confidence')
assert.match(copy, /no se promete una frecuencia fija/i, 'guide explicitly rejects a fixed update schedule')
assert.match(copy, /solo se muestra cuando/i, 'forecast is conditional on validated inputs')
assert.match(copy, /no se publica una recomendación de playa limpia/i, 'delayed data cannot support a clean-beach recommendation')
assert.match(page.sections[2].text, /USD 5\.99/, 'existing USD Pass price is preserved')
assert.match(page.faq[4].a, /USD 5\.99/, 'existing USD Pass FAQ price is preserved')

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /extraPages/, 'regional SEO generator still consumes extraPages')

console.log('PUNTACANA_ES_OBSERVATION_COPY PASS (route, freshness, cadence, forecast, price)')

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const files = [
  ['regions/seo-content/florida.json', 'en'],
  ['regions/seo-content/florida.es.json', 'es'],
  ['regions/seo-content/puntacana.json', 'en'],
  ['regions/seo-content/puntacana.es.json', 'es'],
  ['regions/seo-content/rivieramaya.json', 'es'],
  ['regions/seo-content/rivieramaya.en.json', 'en'],
  ['regions/seo-content/tulum.json', 'es'],
  ['regions/seo-content/tulum.en.json', 'en'],
]

const unsupportedCadence = [
  /\b(?:four|4)\s*(?:×|x)\s*(?:a day|per day|daily)\b/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\b(?:four|4)\s+times\s+daily\b/i,
  /\b(?:updated|refreshed|recalculated|rechecked|checked|verified)\s+(?:daily|every day)\b/i,
  /\b(?:cuatro|4)\s+veces\s+al\s+d[ií]a\b/i,
  /\bactualizad[oa]s?\s+(?:4|cuatro)\s+veces\s+al\s+d[ií]a\b/i,
  /\bactualizad[oa]s?\s+a\s+diario\b/i,
  /\bactualizad[oa]s?\s+diariamente\b/i,
  /\bdaily satellite forecast\b/i,
  /\bpronóstico satelital diario\b/i,
]

const unsupportedCurrent = [
  /\blive map\b/i,
  /\bmapa en vivo\b/i,
  /\bright now\b/i,
  /\bahora mismo\b/i,
  /\bhoy mismo\b/i,
  /\breal satellite flow\b/i,
  /\bflujo real por satélite\b/i,
  /\bmapa en directo\b/i,
]

for (const [relativePath, lang] of files) {
  const absolutePath = path.join(root, relativePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  const content = JSON.parse(source)

  assert.ok(Array.isArray(content.faq) && content.faq.length >= 6, relativePath + ' keeps its homepage FAQ contract')

  for (const index of content.faq.keys()) {
    const answer = content.faq[index].a
    assert.equal(typeof answer, 'string', relativePath + ' FAQ ' + index + ' remains text')
    for (const pattern of unsupportedCadence) {
      assert.doesNotMatch(answer, pattern, relativePath + ' FAQ ' + index + ' must not promise a fixed satellite cadence')
    }
    for (const pattern of unsupportedCurrent) {
      assert.doesNotMatch(answer, pattern, relativePath + ' FAQ ' + index + ' must not imply a continuous live feed')
    }
  }

  const statusAnswer = content.faq[1].a
  const reliabilityAnswer = content.faq[2].a
  const forecastAnswer = content.faq[3].a
  const actionAnswer = content.faq[5].a
  const cleaningAnswer = content.faq[4].a

  if (lang === 'en') {
    assert.match(statusAnswer, /latest published observation/i, relativePath + ' states that the map uses the latest published observation')
    assert.match(statusAnswer, /timestamp|observation time/i, relativePath + ' tells visitors to check the observation timestamp')
    assert.match(reliabilityAnswer, /intermittent/i, relativePath + ' explains that satellite observations are intermittent')
    assert.match(reliabilityAnswer, /confidence/i, relativePath + ' preserves the confidence explanation')
    assert.match(forecastAnswer, /shown only when/i, relativePath + ' gates the forecast on available validated inputs')
    assert.match(forecastAnswer, /no fixed refresh cadence/i, relativePath + ' does not promise a refresh schedule')
    assert.match(actionAnswer, /delayed/i, relativePath + ' explains delayed readings')
    assert.match(actionAnswer, /no current clean-beach recommendation|withholds a current clean-beach recommendation/i, relativePath + ' withholds unsupported clean recommendations')
    assert.match(cleaningAnswer, /latest published observation/i, relativePath + ' cleaning FAQ points to the latest observation')
    assert.match(cleaningAnswer, /satellite reading does not confirm/i, relativePath + ' does not equate a satellite reading with beach cleaning')
  } else {
    assert.match(statusAnswer, /última observación publicada/i, relativePath + ' states that the map uses the latest published observation')
    assert.match(statusAnswer, /fecha|hora/i, relativePath + ' tells visitors to check the observation time')
    assert.match(reliabilityAnswer, /intermitentes/i, relativePath + ' explains that satellite observations are intermittent')
    assert.match(reliabilityAnswer, /confianza/i, relativePath + ' preserves the confidence explanation')
    assert.match(forecastAnswer, /solo se muestra cuando/i, relativePath + ' gates the forecast on available validated inputs')
    assert.match(forecastAnswer, /no se promete una cadencia fija/i, relativePath + ' does not promise a refresh schedule')
    assert.match(actionAnswer, /retrasad/i, relativePath + ' explains delayed readings')
    assert.match(actionAnswer, /suspende|no se publica/i, relativePath + ' withholds unsupported clean recommendations')
    assert.match(cleaningAnswer, /última observación publicada/i, relativePath + ' cleaning FAQ points to the latest observation')
    assert.match(cleaningAnswer, /lectura satelital no confirma/i, relativePath + ' does not equate a satellite reading with beach cleaning')
  }

  if (content.home) {
    assert.ok(content.home.title.length <= 60, relativePath + ' home title stays within 60 characters')
    assert.ok(content.home.desc.length <= 160, relativePath + ' home description stays within 160 characters')
    for (const pattern of unsupportedCadence.concat(unsupportedCurrent, [/\btoday\b/i, /\bhoy\b/i, /\ben vivo\b/i])) {
      assert.doesNotMatch(content.home.title, pattern, relativePath + ' home title must use observation-based copy')
      assert.doesNotMatch(content.home.desc, pattern, relativePath + ' home description must use observation-based copy')
    }
    if (lang === 'en') assert.match(content.home.desc, /latest .*observations/i, relativePath + ' home description identifies the latest observations')
    else assert.match(content.home.desc, /últimas observaciones satelitales/i, relativePath + ' home description identifies the latest observations')
  }
}

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /content\.faq\.map/, 'homepage FAQ remains wired into JSON-LD')
assert.match(generator, /FAQ \+ liens hubs \+ réseau dans le noscript racine/, 'homepage FAQ remains available in the static HTML')
assert.match(generator, /content\.home/, 'secondary-language homepage metadata remains wired to its content file')

console.log('REGIONAL_HOMEPAGE_OBSERVATION_COPY PASS (8 locale files)')

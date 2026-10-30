const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const files = [
  'regions/seo-content/florida.json',
  'regions/seo-content/florida.es.json',
  'regions/seo-content/puntacana.json',
  'regions/seo-content/puntacana.es.json',
  'regions/seo-content/rivieramaya.en.json',
  'regions/seo-content/rivieramaya.json',
  'regions/seo-content/tulum.en.json',
  'regions/seo-content/tulum.json',
  'regions/rivieramaya.json',
  'regions/tulum.json',
]

const unsupportedCadence = [
  /\\b(?:four|4)\\s+times\\s+(?:a|per)\\s+day\\b/i,
  /\\b(?:four|4)\\s+times\\s+daily\\b/i,
  /\\b4\\s*[×x]\\s*(?:\\/\\s*day|daily|a\\s+day|per\\s+day)\\b/i,
  /\\b(?:cuatro|4)\\s+veces\\s+al\\s+d[ií]a\\b/i,
  /\\b4\\s*[×x]\\s*(?:al|por)\\s+d[ií]a\\b/i,
  /\\bcada\\s+(?:3|tres|4|cuatro|6|seis)\\s+horas?\\b/i,
  /\\bevery few hours\\b/i,
  /\\bfour satellite reads a day\\b/i,
]

const obsoleteScientificClaims = [
  /3\\.5[- ]day half-life/i,
  /half-life of 3\\.5 days/i,
  /vida media de (?:unos?\\s+)?3[.,]5 días/i,
  /vida media de (?:unos?\\s+)?3[.,]5 dias/i,
  /3[.,]5 días de vida media/i,
  /48\\s*(?:a|–|-)\\s*72\\s*horas/i,
  /48\\s+to\\s+72\\s+hours/i,
  /Days?\\s+1[–-]3\\s+(?:are|carry)\\s+(?:the\\s+)?(?:most\\s+)?(?:accurate|reliable|confidence)/i,
  /accuracy is highest on days 1 to 3/i,
  /los días 1[–-]3 son los más (?:fiables|precisos)/i,
  /los días 1 a 3 son los más (?:fiables|precisos)/i,
  /la mayor precisión está en los días 1 a 3/i,
]

for (const relativePath of files) {
  const absolutePath = path.resolve(__dirname, '../..', relativePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  if (relativePath.endsWith('.json')) {
    assert.doesNotThrow(() => JSON.parse(source), `${relativePath} remains valid JSON`)
  }
  for (const pattern of unsupportedCadence) {
    assert.doesNotMatch(source, pattern, `${relativePath} contains unsupported satellite cadence: ${pattern}`)
  }
  for (const pattern of obsoleteScientificClaims) {
    assert.doesNotMatch(source, pattern, `${relativePath} contains an obsolete or unsupported scientific claim: ${pattern}`)
  }
}

console.log('PASS: active six-region EN/ES content has no fixed satellite cadence, obsolete beach half-life or unsupported regional accuracy claims')

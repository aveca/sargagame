const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const files = [
  'regions/seo-content/florida.json',
  'regions/seo-content/puntacana.json',
  'regions/seo-content/tulum.json',
  'regions/seo-content/tulum.en.json',
]

const unsupportedCadence = [
  /\b(?:four|4)\s*[×x]\s*(?:a\s+day|per\s+day|\/\s*day)\b/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\b(?:four|4)\s+times\s+daily\b/i,
  /\b(?:updated|refreshed|recalculated|rechecked|checked|verified)\s+(?:every\s+)?(?:3|three|4|four|6|six)\s+hours?\b/i,
  /\bevery\s+(?:3|three|4|four|6|six)\s+hours?\b/i,
  /\b(?:4|four)[- ]hour(?:ly)?\b/i,
  /\b(?:cuatro|4)\s+veces\s+al\s+d[ií]a\b/i,
  /\bcada\s+(?:3|tres|4|cuatro|6|seis)\s+horas?\b/i,
  /\b(?:4|cuatro)\s*[×x]\s*(?:al\s+d[ií]a|por\s+d[ií]a)\b/i,
]

for (const relativePath of files) {
  const absolutePath = path.resolve(__dirname, '../..', relativePath)
  const source = fs.readFileSync(absolutePath, 'utf8')
  assert.doesNotThrow(() => JSON.parse(source), `${relativePath} remains valid JSON`)
  for (const pattern of unsupportedCadence) {
    assert.doesNotMatch(
      source,
      pattern,
      `${relativePath} contains an unsupported satellite refresh-cadence claim: ${pattern}`
    )
  }
}

console.log('PASS: Florida, Punta Cana and Tulum EN/ES content contains no fixed satellite cadence promises')

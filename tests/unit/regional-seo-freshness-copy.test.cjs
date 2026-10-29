const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/region-seo-pages.cjs'),
  'utf8'
)

const unsupportedCadence = [
  /\b4\s*[×x]\s*(?:\/\s*(?:day|j)|per\s*day|a\s*day|daily)\b/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\b4\s+veces\s+al\s+d[ií]a\b/i,
  /\bcuatro\s+veces\s+al\s+d[ií]a\b/i,
  /\bevery\s+4\s+hours\b/i,
  /\bcada\s+4\s+horas\b/i,
  /\bevery\s+3\s+hours\b/i,
  /\bthree\s+hours\b/i,
  /\btoutes?\s+les?\s+3\s+heures\b/i,
  /\bcada\s+3\s+horas\b/i,
]

for (const pattern of unsupportedCadence) {
  assert.doesNotMatch(source, pattern, `unsupported satellite cadence remains: ${pattern}`)
}

assert.ok(source.includes('Page generated ${d}; satellite observation time may differ.'))
assert.ok(source.includes('Página generada el ${d}; la hora de observación satelital puede ser distinta.'))
assert.ok(source.includes('latest published satellite status'))
assert.ok(source.includes('última observación satelital disponible'))
assert.doesNotMatch(source, /Live Status & 7-Day Forecast|Today — Live Status & Forecast|Estado en vivo y pronóstico 7 días/i)

console.log('PASS: regional SEO generator avoids unsupported satellite cadence and current-status guarantees (EN/ES)')

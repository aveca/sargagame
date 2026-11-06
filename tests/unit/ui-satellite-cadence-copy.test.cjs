'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const files = [
  'src/PremiumModal.jsx',
  'src/PassOffer.jsx',
  'src/PaidOnboarding.jsx',
  'src/WelcomePoste.jsx',
  'src/ArenaOnboarding.jsx',
  'src/BeachSheet.jsx',
  'public/a-propos/index.html',
  'public/404.html',
  'public/weekend.html',
  'scripts/lib/localize-404.cjs',
  'scripts/automation/B2B_OFFER.md',
]
const unsupportedCadence = [
  /(?:4×|4x)\s*(?:daily|a day|per day|\/\s*day|al\s+d[ií]a|\/\s*d[ií]a|par\s+jour|\/\s*jour)/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\b(?:cuatro|4)\s+veces\s+al\s+d[ií]a\b/i,
]
for (const relativePath of files) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
  for (const pattern of unsupportedCadence) {
    assert.doesNotMatch(source, pattern, `${relativePath} must not promise a fixed satellite-observation cadence`)
  }
}
const about = fs.readFileSync(path.join(ROOT, 'public/a-propos/index.html'), 'utf8')
assert.ok(about.includes('NOAA/AOML ERDDAP'), 'About page must identify the verified AFAI distribution source')
assert.ok(about.includes('USF Optical Oceanography Laboratory'), 'About page must identify the source laboratory')
assert.doesNotMatch(about, /MODIS|Résolution 1 km|Copernicus \(ESA\)/i, 'About page must not publish unsupported AFAI sensor or resolution attribution')

console.log('PASS: 11 customer-facing and outbound surfaces use timestamped source-observation language')

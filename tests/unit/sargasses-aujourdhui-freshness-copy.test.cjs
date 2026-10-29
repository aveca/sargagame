#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const file = path.resolve(__dirname, '../../public/sargasses-aujourdhui/index.html')
const html = fs.readFileSync(file, 'utf8')
const lower = html.toLowerCase()

// This acquisition page must not promise an unsupported satellite cadence or instant shoreline state.
const unsupportedClaims = [
  'en temps réel',
  'en direct',
  '4 fois par jour',
  '4×/jour',
  '4×/day',
  'four times a day',
  'updated 4× daily',
  '75 à 78 %',
  'recalculé 4 fois',
  'chaque matin',
  "l'état exact du jour",
]
for (const claim of unsupportedClaims) {
  assert.equal(lower.includes(claim.toLowerCase()), false, `Unsupported freshness claim remains: ${claim}`)
}

// Keep the page's canonical, language targets, OG URL, and structured-data contracts intact.
assert.ok(html.includes('<link rel="canonical" href="https://sargasses-martinique.com/sargasses-aujourdhui/"/>'))
assert.ok(html.includes('<link rel="alternate" hreflang="fr" href="https://sargasses-martinique.com/sargasses-aujourdhui/"/>'))
assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://sargasses-martinique.com/en/sargassum-map/"/>'))
assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://sargasses-martinique.com/sargasses-aujourdhui/"/>'))
assert.ok(html.includes('<meta property="og:url" content="https://sargasses-martinique.com/sargasses-aujourdhui/"/>'))
assert.ok(html.includes("Sargasses aujourd'hui"))

const blocks = html
  .split('<script type="application/ld+json">')
  .slice(1)
  .map(block => block.split('</script>')[0].trim())
const schemas = blocks.map(block => JSON.parse(block))
assert.ok(schemas.some(schema => schema['@type'] === 'WebPage'))
assert.ok(schemas.some(schema => schema['@type'] === 'BreadcrumbList'))
assert.ok(schemas.some(schema => schema['@type'] === 'FAQPage'))
assert.ok(html.includes('136 plages'))
console.log('PASS: freshness-honest copy; canonical, hreflang, OG URL and JSON-LD preserved.')

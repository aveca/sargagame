#!/usr/bin/env node
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const file = path.resolve(__dirname, '../../public/sargasses-aujourdhui/index.html')
const html = fs.readFileSync(file, 'utf8')

// This static acquisition page must not promise a satellite cadence or instant shoreline state.
const unsupportedFreshnessClaims = [
  /en temps réel/i,
  /en direct/i,
  /4 fois par jour/i,
  /4×\\/jour/i,
  /4×\\/day/i,
  /four times a day/i,
  /updated 4× daily/i,
  /75\\s*à\\s*78\\s*%/i,
  /recalculé 4 fois/i,
  /chaque matin/i,
]
for (const pattern of unsupportedFreshnessClaims) {
  assert.equal(pattern.test(html), false, `Unsupported freshness claim remains: ${pattern}`)
}

// Preserve the canonical, existing language targets, and structured-data contracts.
assert.match(html, /<link rel="canonical" href="https:\\/\\/sargasses-martinique\\.com\\/sargasses-aujourdhui\\/"\\/>/)
assert.match(html, /hreflang="fr" href="https:\\/\\/sargasses-martinique\\.com\\/sargasses-aujourdhui\\/"\/>/)
assert.match(html, /hreflang="en" href="https:\\/\\/sargasses-martinique\\.com\\/en\\/sargassum-map\\/"\/>/)
assert.match(html, /hreflang="x-default"/)
assert.match(html, /property="og:url" content="https:\\/\\/sargasses-martinique\\.com\\/sargasses-aujourdhui\\/"/)

const jsonLd = [...html.matchAll(/<script type="application\\/ld\\+json">([\\s\\S]*?)<\\/script>/g)]
  .map(match => JSON.parse(match[1]))
assert.ok(jsonLd.some(schema => schema['@type'] === 'WebPage'))
assert.ok(jsonLd.some(schema => schema['@type'] === 'BreadcrumbList'))
assert.ok(jsonLd.some(schema => schema['@type'] === 'FAQPage'))
assert.match(html, /136 plages/)
console.log('PASS: sargasses-aujourdhui copy is freshness-honest; canonical, hreflang, OG URL and JSON-LD preserved.')

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolvePublicAccuracy } = require('../../scripts/lib/regional-track-record.cjs')
const {
  getSatelliteObservationFreshness,
  formatSatelliteObservationLabel,
} = require('../../scripts/lib/region-seo-pages.cjs')
const { getRegion } = require('../../regions/index.cjs')
const { generateRegionSeoPages } = require('../../scripts/lib/region-seo-pages.cjs')

const ROOT = path.resolve(__dirname, '../..')

const freshnessNow = Date.parse('2026-10-30T12:27:00.000Z')
const republishedOldObservation = {
  erddapTimestamp: '2026-10-27T12:00:00.000Z',
  updatedAt: '2026-10-30T12:26:00.000Z',
  dataAgeMinutes: 1772,
  stale: false,
}
const oldObservationState = getSatelliteObservationFreshness(republishedOldObservation, freshnessNow)
assert.equal(oldObservationState.state, 'delayed',
  'a recent republication and stale dataAgeMinutes must never make an old source observation current')
assert.equal(oldObservationState.ageMinutes, 4347)
assert.equal(formatSatelliteObservationLabel(republishedOldObservation, 'en', freshnessNow),
  'Latest satellite observation: 2026-10-27 12:00 UTC · delayed')
assert.equal(formatSatelliteObservationLabel(republishedOldObservation, 'es', freshnessNow),
  'Última observación satelital: 2026-10-27 12:00 UTC · retrasada')
assert.equal(formatSatelliteObservationLabel(republishedOldObservation, 'fr', freshnessNow),
  'Dernière observation satellite: 2026-10-27 12:00 UTC · en retard')

const withinSla = getSatelliteObservationFreshness({
  erddapTimestamp: new Date(freshnessNow - 899 * 60000).toISOString(),
  stale: false,
}, freshnessNow)
assert.equal(withinSla.state, 'fresh', '899 minutes remains inside the 900-minute operational SLA')
const atSla = getSatelliteObservationFreshness({
  erddapTimestamp: new Date(freshnessNow - 900 * 60000).toISOString(),
  stale: false,
}, freshnessNow)
assert.equal(atSla.state, 'delayed', 'the exact 900-minute SLA boundary is delayed')
assert.equal(getSatelliteObservationFreshness({
  erddapTimestamp: new Date(freshnessNow - 1 * 60000).toISOString(),
  stale: true,
}, freshnessNow).state, 'delayed', 'an explicit stale flag must never be overridden')

for (const raw of [undefined, null, '', 'not-a-date', new Date(freshnessNow + 60000).toISOString()]) {
  assert.equal(getSatelliteObservationFreshness({ erddapTimestamp: raw }, freshnessNow).state, 'unknown',
    'missing, invalid and future source timestamps fail closed')
}
assert.equal(formatSatelliteObservationLabel({}, 'en', freshnessNow),
  'Satellite observation timestamp unavailable · status to verify')

const currentRecord = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public/api/copernicus/track-record.json'),
  'utf8'
))

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// The current public record is stale and covers only the combined MQ + GP scope.
for (const region of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']) {
  const resolved = resolvePublicAccuracy(currentRecord, region)
  assert.equal(resolved.available, false, region + ': stale/out-of-scope record must not become a current percentage')
  assert.equal(resolved.recordStale, true)
  assert.equal(resolved.scopeLabel, 'MQ + GP')
  assert.equal(resolved.reason, region === 'mq' || region === 'gp' ? 'stale' : 'region-not-covered')
}

// A future fresh record may be shown only for a region in its declared scope,
// and its label must retain the aggregate scope rather than implying per-beach accuracy.
const freshRecord = {
  ...currentRecord,
  freshness: { stale: false },
  window: { from: '2026-10-08', to: '2026-10-28' },
  sampleSize: 2205,
  byHorizon: [
    { day: 1, hitRatePct: 99, pairs: 420 },
    { day: 3, hitRatePct: 99, pairs: 378 },
  ],
}
const mqAccuracy = resolvePublicAccuracy(freshRecord, 'mq')
assert.equal(mqAccuracy.available, true)
assert.equal(mqAccuracy.scopeLabel, 'MQ + GP')
assert.equal(mqAccuracy.horizons['J+1'].statusMatchPct, 99)
assert.equal(mqAccuracy.horizons['J+3'].statusMatchPct, 99)
assert.equal(resolvePublicAccuracy(freshRecord, 'tulum').reason, 'region-not-covered')

const incomplete = resolvePublicAccuracy({
  regions: ['mq'],
  freshness: { stale: false },
  window: { from: '2026-10-08', to: '2026-10-28' },
  sampleSize: 10,
  byHorizon: [{ day: 1, hitRatePct: 99, pairs: 10 }],
}, 'mq')
assert.equal(incomplete.available, false)
assert.equal(incomplete.reason, 'incomplete-record')
assert.equal(resolvePublicAccuracy(null, 'mq').reason, 'missing-record')

// Exercise the real generator against all four USD-region configurations.
// It must keep the methodology URL but never inject the stale MQ/GP 99% metric.
const template = `<!doctype html>
<html lang="en"><head>
<title>Regional page</title>
<meta name="description" content="Regional page">
<meta property="og:title" content="Regional page">
<meta property="og:description" content="Regional page">
<meta property="og:url" content="https://example.test/">
<meta property="og:locale" content="en_US">
<meta name="twitter:title" content="Regional page">
<meta name="twitter:description" content="Regional page">
<link rel="canonical" href="https://example.test/">
</head><body><noscript><h1>Regional page</h1></noscript><div id="root"></div></body></html>`

for (const regionId of ['florida', 'puntacana', 'rivieramaya', 'tulum']) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-methodology-' + regionId + '-'))
  try {
    fs.writeFileSync(path.join(distDir, 'index.html'), template)
    generateRegionSeoPages(getRegion(regionId), distDir)
    const generatedFiles = walk(distDir).filter(file => file.endsWith('.html'))
    const methodPages = generatedFiles.filter(file => /(?:methodology|metodologia)\/index\.html$/i.test(file))
    assert.ok(methodPages.length > 0, regionId + ': methodology page must remain generated')
    for (const file of methodPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, /MQ \+ GP/, regionId + ': declared validation scope must be visible')
      assert.match(html, /stale|obsoleto/i, regionId + ': stale status must be explicit')
      assert.match(html, /No separately validated accuracy percentage is published|No publicamos un porcentaje de precisión validado/i)
      assert.doesNotMatch(html, /Measured accuracy across our Caribbean network|Precisión medida en nuestra red Caribe/)
      assert.doesNotMatch(html, /status is correct 99%|estado a 1 día acierta el 99%/)
    }

    const pressPages = generatedFiles.filter(file => /(?:press|prensa|media)[^/]*\/index\.html$/i.test(file))
    assert.ok(pressPages.length > 0, regionId + ': press page must remain generated')
    for (const file of pressPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, /Validation scope|Alcance de validación/i, regionId + ': press page must publish its validation scope')
      assert.match(html, /does not cover this region|no cubre esta región/i, regionId + ': out-of-scope validation must be explicit')
      assert.doesNotMatch(html, /—%|\{accuracyJ[13]Pct\}|across our Caribbean network|en toda nuestra red del Caribe/i,
        regionId + ': press page must not render an unscoped or empty accuracy percentage')
    }

  } finally {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
}

const generatorSource = fs.readFileSync(path.join(ROOT, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generatorSource, /track-record\.json/)
assert.doesNotMatch(generatorSource, /backtest-results\.json/, 'raw backtest input has no public regional freshness contract')
assert.match(generatorSource, /No separately validated accuracy percentage is published/)
assert.doesNotMatch(generatorSource, /Measured accuracy across our Caribbean network|Precisión medida en nuestra red Caribe/)
assert.match(generatorSource, /getSatelliteObservationFreshness\(data\)/)
assert.match(generatorSource, /formatSatelliteObservationLabel\(data, lang\)/)
assert.match(generatorSource, /updatedAt: observationFreshness\.state === 'fresh' \? data\.erddapTimestamp : null/)
assert.doesNotMatch(generatorSource, /LIVE · satellite \$\{liveHHMM\}/,
  'generated beach pages must not label publication time as a LIVE satellite observation')

console.log('PASS: stale and unsupported regional track-record metrics are never published as current methodology accuracy')
console.log('PASS: methodology pages remain generated for Florida, Punta Cana, Riviera Maya and Tulum')
console.log('PASS: fresh aggregate metrics retain their declared MQ + GP scope')

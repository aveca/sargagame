'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolvePublicAccuracy } = require('../../scripts/lib/regional-track-record.cjs')
const {
  getSatelliteObservationFreshness,
  getPublishableBeachDecision,
  formatSatelliteObservationLabel,
} = require('../../scripts/lib/region-seo-pages.cjs')
const { getRegion } = require('../../regions/index.cjs')
const { generateRegionSeoPages } = require('../../scripts/lib/region-seo-pages.cjs')

const ROOT = path.resolve(__dirname, '../..')

const freshnessNow = Date.parse('2026-10-30T12:27:00.000Z')
const republishedOldObservation = {
  source: 'erddap-live',
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
  source: 'erddap-live',
  erddapTimestamp: new Date(freshnessNow - 899 * 60000).toISOString(),
  stale: false,
}, freshnessNow)
assert.equal(withinSla.state, 'fresh', '899 minutes remains inside the 900-minute operational SLA')
const atSla = getSatelliteObservationFreshness({
  source: 'erddap-live',
  erddapTimestamp: new Date(freshnessNow - 900 * 60000).toISOString(),
  stale: false,
}, freshnessNow)
assert.equal(atSla.state, 'delayed', 'the exact 900-minute SLA boundary is delayed')
assert.equal(getSatelliteObservationFreshness({
  source: 'erddap-live',
  erddapTimestamp: new Date(freshnessNow - 1 * 60000).toISOString(),
  stale: true,
}, freshnessNow).state, 'delayed', 'an explicit stale flag must never be overridden')

for (const raw of [undefined, null, '', 'not-a-date', new Date(freshnessNow + 60000).toISOString()]) {
  assert.equal(getSatelliteObservationFreshness({ source: 'erddap-live', erddapTimestamp: raw }, freshnessNow).state, 'unknown',
    'missing, invalid and future source timestamps fail closed')
}
assert.equal(formatSatelliteObservationLabel({}, 'en', freshnessNow),
  'Satellite observation timestamp unavailable · status to verify')

const verifiedLevel = { status: 'clean', score: 75, afai: 0.2 }
const staleDecision = getPublishableBeachDecision(republishedOldObservation, verifiedLevel, freshnessNow)
assert.equal(staleDecision.available, false, 'stale ERDDAP observations must not publish a beach decision')
assert.equal(staleDecision.status, null)
assert.equal(staleDecision.score, null)
assert.equal(staleDecision.afai, null)
assert.equal(staleDecision.freshness.state, 'delayed')

const freshDecision = getPublishableBeachDecision({
  source: 'erddap-live',
  erddapTimestamp: new Date(freshnessNow - 899 * 60000).toISOString(),
  stale: false,
}, verifiedLevel, freshnessNow)
assert.equal(freshDecision.available, true, 'a valid level is publishable only inside the source SLA')
assert.equal(freshDecision.status, 'clean')
assert.equal(freshDecision.score, 75)
assert.equal(freshDecision.afai, 0.2)

const nonLiveDecision = getPublishableBeachDecision({
  source: 'static-fallback',
  erddapTimestamp: new Date(freshnessNow - 1 * 60000).toISOString(),
  stale: false,
}, verifiedLevel, freshnessNow)
assert.equal(nonLiveDecision.available, false, 'a fresh-looking non-ERDDAP source must fail closed')
assert.equal(nonLiveDecision.freshness.state, 'unknown')

const missingLevelDecision = getPublishableBeachDecision({
  source: 'erddap-live',
  erddapTimestamp: new Date(freshnessNow - 1 * 60000).toISOString(),
  stale: false,
}, {}, freshnessNow)
assert.equal(missingLevelDecision.available, false, 'fresh source data without an explicit beach status must not invent one')

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
    const sourceData = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'public', 'api', 'copernicus', regionId, 'sargassum.json'),
      'utf8'
    ))
    const staleData = {
      ...sourceData,
      source: 'erddap-live',
      erddapTimestamp: '2026-10-27T12:00:00.000Z',
      stale: false,
    }
    generateRegionSeoPages(getRegion(regionId), distDir, { data: staleData, now: freshnessNow })
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
    const beachPages = generatedFiles.filter(file => /(?:beaches|playas)\/[^/]+\/index\.html$/i.test(file.replace(/\\/g, '/')))
    assert.ok(beachPages.length > 0, regionId + ': beach detail pages must remain generated')
    for (const file of beachPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, /Latest satellite observation: 2026-10-27 12:00 UTC · delayed|Última observación satelital: 2026-10-27 12:00 UTC · retrasada/,
        regionId + ': beach page must expose the actual delayed observation timestamp')
      assert.match(html, /Unavailable — decision paused until a fresh satellite observation is available|No disponible — decisión suspendida hasta que haya una observación satelital reciente/,
        regionId + ': beach page must suspend the decision when the observation is stale')
      assert.doesNotMatch(html, /Published status: (?:Clean|Moderate|Avoid)|Estado publicado: (?:Limpia|Moderada|Evitar)/,
        regionId + ': stale beach status must not be published')
      assert.doesNotMatch(html, /Beach Score \d+\/100/,
        regionId + ': stale Beach Score must not be published')
      assert.doesNotMatch(html, /<h2>7-day forecast<\/h2>|<h2>Pronóstico de 7 días<\/h2>/,
        regionId + ': stale forecast section must be suspended')
      assert.doesNotMatch(html, /class="sg-hero"/,
        regionId + ': stale beach page must not render the clean-default decision hero')
    }

    const unavailableDecision = /Unavailable — decision paused until a fresh satellite observation is available|No disponible — decisión suspendida hasta que haya una observación satelital reciente/
    const resortDirectoryPages = generatedFiles.filter(file => /\/(?:resorts|hoteles)\/index\.html$/i.test(file.replace(/\\/g, '/')))
    const hotelLandingPages = generatedFiles.filter(file => /\/(?:sargassum-for-hotels|sargazo-para-hoteles)\/index\.html$/i.test(file.replace(/\\/g, '/')))
    const resortDetailPages = generatedFiles.filter(file => /\/(?:resorts|hoteles)\/[^/]+\/index\.html$/i.test(file.replace(/\\/g, '/')))
    const resortBriefPages = generatedFiles.filter(file => /\/(?:resorts|hoteles)\/[^/]+\/brief\/index\.html$/i.test(file.replace(/\\/g, '/')))
    assert.ok(resortDirectoryPages.length > 0, regionId + ': B2B resort directory must remain generated')
    assert.ok(hotelLandingPages.length > 0, regionId + ': B2B hotel landing must remain generated')
    assert.ok(resortDetailPages.length > 0, regionId + ': resort detail pages must remain generated')
    assert.ok(resortBriefPages.length > 0, regionId + ': resort briefs must remain generated')
    for (const file of resortDirectoryPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, unavailableDecision, regionId + ': resort directory must pause stale beach decisions')
      assert.match(html, /Latest satellite observation: 2026-10-27 12:00 UTC · delayed|Última observación satelital: 2026-10-27 12:00 UTC · retrasada/,
        regionId + ': resort directory must expose the source observation timestamp')
      assert.doesNotMatch(html, /<small>[^<]* · (?:Clean|Moderate|Avoid|Limpia|Moderada|Evitar)<\/small>/,
        regionId + ': resort directory must not display stale beach status')
    }
    for (const file of hotelLandingPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, unavailableDecision, regionId + ': hotel coverage must pause stale beach decisions')
      assert.match(html, /Latest satellite observation: 2026-10-27 12:00 UTC · delayed|Última observación satelital: 2026-10-27 12:00 UTC · retrasada/,
        regionId + ': hotel landing must expose the source observation timestamp')
      assert.doesNotMatch(html, /<b>[^<]+<\/b> · (?:Clean|Moderate|Avoid|Limpia|Moderada|Evitar)<br>/,
        regionId + ': hotel landing must not display stale beach status')
    }
    for (const file of resortDetailPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, unavailableDecision, regionId + ': resort detail must pause stale beach decisions')
      assert.doesNotMatch(html, /Published status: (?:Clean|Moderate|Avoid)|Estado publicado: (?:Limpia|Moderada|Evitar)/,
        regionId + ': resort detail must not publish a stale verdict')
      assert.doesNotMatch(html, /<h2>7-day forecast<\/h2>|<h2>Pronóstico de 7 días<\/h2>/,
        regionId + ': resort detail must not publish a stale forecast')
    }
    for (const file of resortBriefPages) {
      const html = fs.readFileSync(file, 'utf8')
      assert.match(html, /Latest reading: Unavailable|Última lectura: No disponible/,
        regionId + ': hotel brief must show an unavailable current reading')
      assert.match(html, unavailableDecision, regionId + ': hotel brief must explain why the decision is paused')
      assert.doesNotMatch(html, /<h2[^>]*>7-day outlook<\/h2>|<h2[^>]*>Pronóstico 7 días<\/h2>/,
        regionId + ': hotel brief must not publish a stale forecast')
      assert.doesNotMatch(html, /\d+ clean beach day|\d+ día(?:s)? de playa limpia/,
        regionId + ': hotel brief must not make stale guest recommendations')
    }

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

// Fresh data must keep the existing B2B status and forecast presentation.
const freshRegionId = 'florida'
const freshDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sargagame-b2b-fresh-'))
try {
  fs.writeFileSync(path.join(freshDistDir, 'index.html'), template)
  const sourceData = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'api', 'copernicus', freshRegionId, 'sargassum.json'),
    'utf8'
  ))
  const freshData = {
    ...sourceData,
    source: 'erddap-live',
    erddapTimestamp: new Date(freshnessNow - 899 * 60000).toISOString(),
    stale: false,
  }
  generateRegionSeoPages(getRegion(freshRegionId), freshDistDir, { data: freshData, now: freshnessNow })
  const freshFiles = walk(freshDistDir).filter(file => file.endsWith('.html'))
  const freshLanding = freshFiles.find(file => /sargassum-for-hotels\/index\.html$/i.test(file.replace(/\\/g, '/')))
  const freshDirectory = freshFiles.find(file => /resorts\/index\.html$/i.test(file.replace(/\\/g, '/')))
  const freshBrief = freshFiles.find(file => /resorts\/[^/]+\/brief\/index\.html$/i.test(file.replace(/\\/g, '/')))
  assert.ok(freshLanding && freshDirectory && freshBrief, 'fresh B2B landing, directory and brief must remain generated')
  assert.match(fs.readFileSync(freshLanding, 'utf8'), /<b>[^<]+<\/b> · (?:Clean|Moderate|Avoid)<br>/,
    'a fresh valid observation must preserve the hotel coverage status')
  assert.match(fs.readFileSync(freshDirectory, 'utf8'), /<small>[^<]* · (?:Clean|Moderate|Avoid)<\/small>/,
    'a fresh valid observation must preserve the resort directory status')
  assert.match(fs.readFileSync(freshBrief, 'utf8'), /Latest reading: (?:Clean|Moderate|Avoid)/,
    'a fresh valid observation must preserve the hotel brief status')
} finally {
  fs.rmSync(freshDistDir, { recursive: true, force: true })
}

const generatorSource = fs.readFileSync(path.join(ROOT, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generatorSource, /track-record\.json/)
assert.doesNotMatch(generatorSource, /backtest-results\.json/, 'raw backtest input has no public regional freshness contract')
assert.match(generatorSource, /No separately validated accuracy percentage is published/)
assert.doesNotMatch(generatorSource, /Measured accuracy across our Caribbean network|Precisión medida en nuestra red Caribe/)
assert.match(generatorSource, /getSatelliteObservationFreshness\(data, now\)/)
assert.match(generatorSource, /formatSatelliteObservationLabel\(data, lang, now\)/)
assert.match(generatorSource, /getPublishableBeachDecision\(data, b\.lv, now\)/)
assert.doesNotMatch(generatorSource, /status: b\.lv\.status \|\| 'clean'/,
  'generated beach pages must never default an unavailable observation to clean')
assert.doesNotMatch(generatorSource, /typeof b\.lv\.afai === 'number' \? b\.lv\.afai : \(typeof b\.afai === 'number' \? b\.afai : 0\.2\)/,
  'generated beach pages must never fabricate a fallback AFAI value')
assert.match(generatorSource, /updatedAt: observationFreshness\.state === 'fresh' \? data\.erddapTimestamp : null/)
assert.doesNotMatch(generatorSource, /LIVE · satellite \$\{liveHHMM\}/,
  'generated beach pages must not label publication time as a LIVE satellite observation')

console.log('PASS: stale and unsupported regional track-record metrics are never published as current methodology accuracy')
console.log('PASS: methodology pages remain generated for Florida, Punta Cana, Riviera Maya and Tulum')
console.log('PASS: fresh aggregate metrics retain their declared MQ + GP scope')

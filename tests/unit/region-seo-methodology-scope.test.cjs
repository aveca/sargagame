'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { resolvePublicAccuracy } = require('../../scripts/lib/regional-track-record.cjs')
const { getRegion } = require('../../regions/index.cjs')
const { generateRegionSeoPages } = require('../../scripts/lib/region-seo-pages.cjs')

const ROOT = path.resolve(__dirname, '../..')
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
    const generatedHtml = generatedFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')
    assert.match(generatedHtml, /AFAI satellite index distributed by NOAA\/AOML ERDDAP/)
    assert.match(generatedHtml, /latest public record is marked stale|El último registro público está marcado como obsoleto/i)
    assert.doesNotMatch(generatedHtml, /Raw NOAA\/Copernicus imagery|Las imágenes en bruto de NOAA\/Copernicus/)
  } finally {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
}

const generatorSource = fs.readFileSync(path.join(ROOT, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generatorSource, /track-record\.json/)
assert.doesNotMatch(generatorSource, /backtest-results\.json/, 'raw backtest input has no public regional freshness contract')

console.log('PASS: stale and unsupported regional track-record metrics are never published as current methodology accuracy')
console.log('PASS: methodology pages remain generated for Florida, Punta Cana, Riviera Maya and Tulum')
console.log('PASS: fresh aggregate metrics retain their declared MQ + GP scope')

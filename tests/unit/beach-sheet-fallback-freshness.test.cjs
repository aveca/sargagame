'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(__dirname, '../../src/Sargasses_PROD.jsx'),
  'utf8'
)
const start = source.indexOf('function BeachSheet(')
const end = source.indexOf('\nfunction ', start)
assert.ok(start >= 0 && end > start, 'inline BeachSheet fallback exists')
const component = source.slice(start, end)
const staleFallback = fs.readFileSync(path.resolve(__dirname, '../../src/BeachSheetStaleFallback.jsx'), 'utf8')

assert.ok(component.includes('const satelliteDecisionCurrent = sargData?.source === "erddap-live" && sargData?.stale === false && isSatelliteFresh12h(sargData)'),
  'fallback requires live source, explicit stale=false and a fresh ERDDAP observation')
assert.ok(component.includes('if(!satelliteDecisionCurrent) return('),
  'fallback must replace the whole decision UI when the observation is not current')
assert.ok(component.includes('<LazyBeachSheetStaleFallback'), 'stale UI is lazy-loaded off the eager path')
assert.ok(staleFallback.includes('lcDetailFreshnessLabel(sargData, lang)'), 'stale fallback shows ERDDAP observation age')
assert.ok(staleFallback.includes('data-testid="beach-sheet-fallback-stale"'))
assert.ok(staleFallback.includes('data-testid="beach-sheet-fallback-score-paused"'))
assert.ok(component.includes('data-testid="beach-sheet-fallback-current"'))
assert.ok(component.includes('if(!satelliteDecisionCurrent||!beach)return null'),
  'forecast must be hidden when the observation is not current')
assert.ok(component.includes('if(!Array.isArray(fc)||fc.length===0)return null'),
  'forecast must require an actual weekly pipeline series')
assert.ok(!component.includes('generateForecast(beach.afai,lang)'),
  'fallback must not synthesize a forecast when the weekly pipeline is absent')
assert.ok(source.includes('beachfallback=1') && source.includes('window.location.hostname === "127.0.0.1"'),
  'QA override must be restricted to 127.0.0.1')

;(async () => {
  const { isSatelliteFresh12h, lcDetailFreshnessLabel } = await import('../../src/lib/format-freshness.mjs')
  const now = Date.parse('2026-11-02T09:35:00.000Z')
  const stale = {
    source: 'erddap-live',
    stale: false,
    erddapTimestamp: '2026-10-27T12:00:00.000Z',
    updatedAt: '2026-11-02T09:34:00.000Z'
  }
  assert.equal(isSatelliteFresh12h(stale, now), false,
    'a recent publication timestamp must not refresh an old ERDDAP observation')
  assert.match(lcDetailFreshnessLabel(stale, 'fr'), /historique, pas un verdict actuel/,
    'stale fallback explains that the ERDDAP observation is historical')
  assert.equal(Math.round((now - Date.parse(stale.erddapTimestamp)) / 3600000), 142,
    'stale fallback test fixture is based on the old ERDDAP observation, not updatedAt')

  const fresh = {
    source: 'erddap-live',
    stale: false,
    erddapTimestamp: '2026-11-02T08:35:00.000Z',
    updatedAt: '2026-11-02T09:34:00.000Z'
  }
  assert.equal(isSatelliteFresh12h(fresh, now), true,
    'a recent, explicitly live observation may preserve the normal fallback')

  assert.ok(component.includes('sargData?.stale === false'),
    'the component requires the stale flag to be explicitly false')
  assert.equal(isSatelliteFresh12h({ updatedAt: fresh.updatedAt }, now), false,
    'updatedAt alone must not qualify as an observation timestamp')
  assert.equal(isSatelliteFresh12h({ ...fresh, erddapTimestamp: '2026-11-02T10:00:00.000Z' }, now), false,
    'future observation timestamps must fail closed')

  console.log('BEACH_SHEET_FALLBACK_FRESHNESS_TESTS PASS')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

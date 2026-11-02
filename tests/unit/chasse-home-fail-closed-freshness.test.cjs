'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.resolve(__dirname, '../../src/ChasseHome.jsx'), 'utf8')
const wrapperStart = source.indexOf('export default function ChasseHome(props){')
const innerStart = source.indexOf('function ChasseHomeFresh(props){', wrapperStart)
assert.ok(wrapperStart >= 0 && innerStart > wrapperStart, 'ChasseHome freshness wrapper exists')
const wrapper = source.slice(wrapperStart, innerStart)

assert.match(wrapper, /sargData\?\.source === "erddap-live"/,
  'the Chasse home requires the live satellite source')
assert.match(wrapper, /sargData\?\.stale === false/,
  'the Chasse home requires an explicitly non-stale payload')
assert.match(wrapper, /isSatelliteFresh12h\(sargData\)/,
  'the Chasse home derives freshness from erddapTimestamp')
assert.match(wrapper, /data-testid="chasse-home-stale"/,
  'the stale state exposes a stable browser-test selector')
assert.match(wrapper, /lcDetailFreshnessLabel\(sargData, lang\)/,
  'the stale state explains the actual observation age or unknown timestamp')
assert.match(wrapper, /À VÉRIFIER/)
assert.match(wrapper, /CHECK REQUIRED/)
assert.match(wrapper, /POR VERIFICAR/)
assert.match(wrapper, /return <ChasseHomeFresh \{\.\.\.props\}\/>/,
  'the data-dependent game only mounts after the freshness gate')
assert.doesNotMatch(wrapper, /useState|useEffect|useMemo|useCallback/,
  'the wrapper stays hook-free so its early return is React-safe')

;(async () => {
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')
  const now = Date.parse('2026-11-02T11:11:16.000Z')
  const staleDespiteRecentRepublish = {
    source: 'erddap-live',
    stale: false,
    erddapTimestamp: '2026-10-27T12:00:00Z',
    updatedAt: new Date(now).toISOString()
  }
  assert.equal(isSatelliteFresh12h(staleDespiteRecentRepublish, now), false,
    'a recent republication cannot make the 27 October observation current')
  assert.equal(isSatelliteFresh12h({
    erddapTimestamp: new Date(now - 11.9 * 3600000).toISOString()
  }, now), true, 'an observation younger than 12 hours may enable the Chasse')
  assert.equal(isSatelliteFresh12h({
    erddapTimestamp: new Date(now - 12 * 3600000).toISOString()
  }, now), false, 'the exact 12-hour boundary fails closed')
  assert.equal(isSatelliteFresh12h({}, now), false, 'a missing observation timestamp fails closed')
  assert.equal(isSatelliteFresh12h({
    erddapTimestamp: new Date(now + 60000).toISOString()
  }, now), false, 'a future observation timestamp fails closed')

  console.log('CHASSE_HOME_FAIL_CLOSED_FRESHNESS_TESTS PASS')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

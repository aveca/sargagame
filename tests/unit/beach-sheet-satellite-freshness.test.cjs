'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(__dirname, '../../src/Sargasses_PROD.jsx'),
  'utf8'
)

const freshnessStart = source.indexOf('// ── Fraîcheur satellite (confiance) — preuve')
const freshnessEnd = source.indexOf('// ── Distance / lieu', freshnessStart)
assert.ok(freshnessStart >= 0 && freshnessEnd > freshnessStart, 'beach-sheet freshness block exists')
const freshnessBlock = source.slice(freshnessStart, freshnessEnd)

assert.match(freshnessBlock, /satelliteAgeHours\(sargData\)/,
  'beach-sheet age must come from the ERDDAP observation helper')
assert.match(source, /const satelliteDecisionCurrent = isSatelliteFresh12h\(sargData\)/,
  'the detail decision must use the shared 12-hour contract')
assert.match(freshnessBlock, /satelliteDecisionCurrent/,
  'the freshness label must reuse the same decision freshness state')
assert.doesNotMatch(freshnessBlock, /sargData\?\.updatedAt/,
  'pipeline publication time must never substitute for the satellite observation')
assert.match(freshnessBlock, /Observation satellite à vérifier/,
  'missing, invalid or future source timestamps must be labelled for verification')

const proofStart = source.indexOf('{/* Preuve fraîcheur satellite */}')
const proofEnd = source.indexOf('{/* PRÉVISIONS 7 j', proofStart)
assert.ok(proofStart >= 0 && proofEnd > proofStart, 'beach-sheet freshness proof row exists')
const proofBlock = source.slice(proofStart, proofEnd)
assert.match(proofBlock, /background:satFresh\?COMIC\.clean:COMIC\.orange/,
  'the indicator must not stay green when the satellite is not fresh')
assert.doesNotMatch(proofBlock, /donnée vérifiée|verified data|dato verificado/,
  'the stale/unknown row must not claim verified-current data')

const componentStart = source.indexOf('function BeachSheetComic')
const componentEnd = source.indexOf('\nfunction BeachSheet(', componentStart)
assert.ok(componentStart >= 0 && componentEnd > componentStart, 'beach-sheet component exists')
const component = source.slice(componentStart, componentEnd)
assert.match(component, /const status = _terrainStatus \|\| \(satelliteDecisionCurrent \? _satStatus : "_loading"\)/,
  'stale satellite status must not remain a current decision')
assert.match(component, /const hasScore = satelliteDecisionCurrent && typeof beach\?\.score === "number"/,
  'numeric score must be hidden unless the satellite observation is current')
assert.match(component, /if\(!satelliteDecisionCurrent\|\|!beach/,
  'Plan B recommendations must not rely on stale regional statuses')
assert.match(component, /\{satelliteDecisionCurrent \? \(/,
  'forecast chart must be gated by source freshness')
assert.match(component, /satelliteDecisionCurrent&&weeklyData&&<ForecastCred/,
  'forecast credibility panel must be gated by source freshness')
assert.match(component, /Dernier statut observé :/,
  'stale status must be explicitly historical')
assert.match(component, /data-testid="beach-sheet-verdict"/)
assert.match(component, /data-testid="beach-sheet-score"/)
assert.match(component, /data-testid="beach-sheet-forecast-paused"/)

;(async () => {
  const { satelliteAgeHours, isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')
  const now = Date.parse('2026-10-30T10:30:00.000Z')
  const stalePayload = {
    erddapTimestamp: '2026-10-27T12:00:00Z',
    updatedAt: '2026-10-30T10:29:00Z'
  }

  assert.equal(satelliteAgeHours(stalePayload, now), 70.5,
    'the age must be computed from the old observation, not the recent republication')
  assert.equal(isSatelliteFresh12h(stalePayload, now), false,
    'a recent updatedAt must not make an old satellite observation fresh')
  assert.equal(isSatelliteFresh12h({ erddapTimestamp: new Date(now - 11 * 3600000).toISOString() }, now), true,
    'an observation younger than 12 hours may show a current decision')
  assert.equal(isSatelliteFresh12h({ erddapTimestamp: new Date(now - 12 * 3600000).toISOString() }, now), false,
    'the 12-hour boundary must fail closed for current decisions')
  assert.equal(satelliteAgeHours({ updatedAt: '2026-10-30T10:29:00Z' }, now), null,
    'updatedAt alone must leave observation freshness unknown')
  assert.equal(isSatelliteFresh12h({ updatedAt: '2026-10-30T10:29:00Z' }, now), false,
    'missing ERDDAP timestamp must fail closed')
  assert.equal(satelliteAgeHours({ erddapTimestamp: '2026-10-30T11:00:00Z' }, now), null,
    'a future observation timestamp must remain unknown')
  assert.equal(isSatelliteFresh12h({ erddapTimestamp: '2026-10-30T11:00:00Z' }, now), false,
    'a future timestamp must not be treated as fresh')

  console.log('BEACH_SHEET_SATELLITE_FRESHNESS_TESTS PASS')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

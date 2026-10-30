'use strict'

const assert = require('node:assert/strict')
const {
  OPERATIONAL_SLA_MINUTES,
  getOgObservationState,
  buildOgSvg,
} = require('../../scripts/automation/generate-og-beaches.cjs')

const now = Date.parse('2026-10-30T13:30:00.000Z')
const beach = {
  id: 'grande-anse',
  island: 'mq',
  name: 'Grande Anse',
  slug: 'grande-anse',
  status: 'clean',
  afai: 0.06,
  score: 82,
}
const cleanLevel = { id: 'grande-anse', status: 'clean', afai: 0.06, score: 82 }

assert.equal(OPERATIONAL_SLA_MINUTES, 900)

const freshPayload = {
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 899 * 60_000).toISOString(),
  updatedAt: new Date(now).toISOString(),
  dataAgeMinutes: 1,
  stale: false,
}
const fresh = getOgObservationState(freshPayload, cleanLevel, now)
assert.equal(fresh.fresh, true, '899 minutes with a valid live observation is eligible')
assert.equal(fresh.status, 'clean')
assert.equal(fresh.score, 82)
const freshSvg = buildOgSvg(beach, fresh)
assert.match(freshSvg, /Observation du 2026-10-30 13:15 UTC · PROPRE/)
assert.doesNotMatch(freshSvg, /LIVE|aujourd'hui/, 'share image uses a dated observation, never a live/today claim')

const atBoundary = getOgObservationState({
  ...freshPayload,
  erddapTimestamp: new Date(now - 900 * 60_000).toISOString(),
}, cleanLevel, now)
assert.equal(atBoundary.fresh, false, 'exactly 900 minutes is outside the strict operational SLA')
assert.equal(atBoundary.status, null)
assert.equal(atBoundary.score, null)

const staleRepublishedPayload = {
  source: 'erddap-live',
  erddapTimestamp: '2026-10-27T12:00:00.000Z',
  updatedAt: new Date(now - 60_000).toISOString(),
  dataAgeMinutes: 1,
  stale: false,
}
const stale = getOgObservationState(staleRepublishedPayload, cleanLevel, now)
assert.equal(stale.fresh, false, 'a recent updatedAt and frozen dataAgeMinutes cannot refresh the source observation')
assert.equal(stale.reason, 'outside-operational-sla')
assert.equal(stale.status, null)
assert.equal(stale.score, null)
const staleSvg = buildOgSvg(beach, stale)
assert.match(staleSvg, /Observation du 2026-10-27 12:00 UTC · RETARDÉE/)
assert.match(staleSvg, /À VÉRIFIER/)
assert.doesNotMatch(staleSvg, /PROPRE|aujourd'hui|LIVE/, 'stale OG card cannot retain the beach-list clean fallback or LIVE badge')

for (const invalidTimestamp of [undefined, null, '', 'not-a-date', new Date(now + 60_000).toISOString()]) {
  const invalid = getOgObservationState({ source: 'erddap-live', erddapTimestamp: invalidTimestamp, stale: false }, cleanLevel, now)
  assert.equal(invalid.fresh, false, 'missing, invalid and future timestamps fail closed')
  assert.equal(invalid.status, null)
  assert.equal(invalid.score, null)
  assert.doesNotMatch(buildOgSvg(beach, invalid), /PROPRE|LIVE|aujourd'hui/)
}

const staleFlag = getOgObservationState({
  source: 'erddap-live',
  erddapTimestamp: freshPayload.erddapTimestamp,
  stale: true,
}, cleanLevel, now)
assert.equal(staleFlag.fresh, false, 'an explicit stale flag cannot be overridden by a recent timestamp')

const nonLive = getOgObservationState({
  source: 'reference',
  erddapTimestamp: freshPayload.erddapTimestamp,
  stale: false,
}, cleanLevel, now)
assert.equal(nonLive.fresh, false, 'reference data cannot produce a current social-card verdict')

const missingLevel = getOgObservationState(freshPayload, null, now)
assert.equal(missingLevel.fresh, false, 'a fresh source without a matching beach level has no verdict')
assert.equal(missingLevel.reason, 'missing-level')
const missingLevelSvg = buildOgSvg(beach, missingLevel)
assert.match(missingLevelSvg, /STATUT INDISPONIBLE/)
assert.doesNotMatch(missingLevelSvg, /PROPRE|LIVE|aujourd'hui/, 'static beach-list status is never used as a live fallback')

console.log('GENERATE_OG_BEACHES_FRESHNESS_TESTS PASS')

'use strict'

const assert = require('node:assert/strict')
const { publishFreshness, RENDER_MAX_AGE_H } = require('../../scripts/video/storyboard.cjs')

const now = Date.parse('2026-11-01T11:27:00.000Z')
const staleSnapshot = {
  source: 'erddap-live',
  updatedAt: '2026-10-30T19:18:52.925Z',
  erddapTimestamp: '2026-10-29T12:00:00.000Z',
  // The stored pipeline age says 31h, while the observation is actually 71h27 old.
  dataAgeMinutes: 1879,
  stale: false,
}

assert.equal(RENDER_MAX_AGE_H, 36)
const staleResult = publishFreshness(staleSnapshot, 36, now)
assert.equal(staleResult.ok, false, 'old ERDDAP observation must block a video even when cached metadata says fresh')
assert.ok(Math.abs(staleResult.ageH - 71.45) < 0.001, 'age must come from erddapTimestamp, not dataAgeMinutes')
assert.match(staleResult.reason, /satellite .* plafond/)

const freshTimestampWithOldCachedAge = {
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  dataAgeMinutes: 5000,
  stale: false,
}
assert.equal(publishFreshness(freshTimestampWithOldCachedAge, 36, now).ok, true,
  'the scientific timestamp is authoritative over a stale cached age field')

const missingTimestamp = { source: 'erddap-live', dataAgeMinutes: 1, stale: false }
assert.equal(publishFreshness(missingTimestamp, 36, now).ok, false,
  'cached age cannot replace a missing scientific timestamp')

const invalidTimestamp = { source: 'erddap-live', erddapTimestamp: 'not-a-date', dataAgeMinutes: 1, stale: false }
assert.equal(publishFreshness(invalidTimestamp, 36, now).ok, false)

const futureTimestamp = { source: 'erddap-live', erddapTimestamp: new Date(now + 60_000).toISOString(), stale: false }
assert.equal(publishFreshness(futureTimestamp, 36, now).ok, false,
  'future observations must fail closed')

const exactly36h = { source: 'erddap-live', erddapTimestamp: new Date(now - 36 * 60 * 60 * 1000).toISOString(), stale: false }
assert.equal(publishFreshness(exactly36h, 36, now).ok, false,
  'the exact 36-hour stale boundary must be rejected')

const justUnder36h = { source: 'erddap-live', erddapTimestamp: new Date(now - (36 * 60 * 60 * 1000 - 1)).toISOString(), stale: false }
assert.equal(publishFreshness(justUnder36h, 36, now).ok, true,
  'a verifiable observation just under the render ceiling remains eligible')

assert.equal(publishFreshness({ ...freshTimestampWithOldCachedAge, source: 'fixture' }, 36, now).ok, false)
assert.equal(publishFreshness({ ...freshTimestampWithOldCachedAge, stale: true }, 36, now).ok, false)
assert.equal(publishFreshness(freshTimestampWithOldCachedAge, 0, now).ok, false)
assert.equal(publishFreshness(freshTimestampWithOldCachedAge, 36, Number.NaN).ok, false)

console.log('VIDEO_STORYBOARD_FRESHNESS_TESTS PASS (12 assertions)')

'use strict'

const assert = require('node:assert/strict')
const { preparePayload, dataSignature } = require('../../scripts/automation/prepare-pages-code-only-payload.cjs')

const now = Date.parse('2026-11-06T10:00:00.000Z')
const timestamp = minutes => new Date(now - minutes * 60000).toISOString()

const base = {
  source: 'erddap-live',
  stale: false,
  dataAgeMinutes: 4,
  erddapTimestamp: timestamp(14119),
  updatedAt: '2026-11-06T09:55:00.000Z',
  beaches: [{ id: 'mq001', score: 81, status: 'clean', levels: [1, 2, 3] }],
  weekly: { mq001: { forecast: [{ date: '2026-11-07', status: 'moderate' }] } },
  scientificMetadata: { algorithm: 'v3', provenance: ['NOAA/AOML ERDDAP'] },
}

const oldSignature = dataSignature(base)
const oldResult = preparePayload(base, now)
assert.equal(oldResult.dataAgeMinutes, 14119)
assert.equal(oldResult.stale, true, 'a 235-hour observation must be publicly stale')
assert.equal(dataSignature(oldResult), oldSignature, 'no observation, beach, score or forecast data may change')
assert.equal(base.dataAgeMinutes, 4, 'preparation must not mutate the fetched live object')
assert.equal(base.stale, false, 'preparation must not mutate the fetched live object')
assert.equal(oldResult.updatedAt, base.updatedAt, 'publication time is preserved, not rewritten')

const fresh = preparePayload({
  ...base,
  erddapTimestamp: timestamp(120),
  dataAgeMinutes: 999,
  stale: true,
}, now)
assert.equal(fresh.dataAgeMinutes, 120)
assert.equal(fresh.stale, false, 'fresh live observation clears only the public stale marker')

const unknown = preparePayload({
  source: 'erddap-live',
  erddapTimestamp: 'not-a-date',
  updatedAt: '2026-11-06T09:55:00.000Z',
  beaches: base.beaches,
}, now)
assert.equal(unknown.dataAgeMinutes, null)
assert.equal(unknown.stale, true, 'invalid observation timestamp fails closed')

const fallback = preparePayload({
  source: 'reference-fallback',
  erddapTimestamp: timestamp(5),
  stale: false,
  beaches: base.beaches,
}, now)
assert.equal(fallback.dataAgeMinutes, null)
assert.equal(fallback.stale, true, 'non-live sources cannot be represented as current')

console.log('PASS: code-only packaging preserves all live data and recomputes only freshness metadata')

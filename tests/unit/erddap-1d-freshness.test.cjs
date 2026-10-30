#!/usr/bin/env node
'use strict'

/**
 * Tests the actual production helpers used by fetch-sargassum-live.cjs.
 * Thresholds remain defined by satellite-freshness.cjs:
 * 900 min operational release SLA; 2160 min public stale threshold.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { satelliteFreshness, SAT_STALE_HOURS } = require('../../scripts/lib/satellite-freshness.cjs')
const {
  extractFirstErddapTimestamp,
  get1DGridFreshness,
} = require('../../scripts/lib/erddap-grid-freshness.cjs')

const now = Date.parse('2026-10-30T08:00:00Z')
const HOUR = 60 * 60 * 1000

function gridAt(ageHours) {
  return {
    points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }],
    erddapTimestamp: new Date(now - ageHours * HOUR).toISOString(),
  }
}

console.log('=== Production ERDDAP timestamp extraction ===')
assert.equal(extractFirstErddapTimestamp([], 3), null)
assert.equal(extractFirstErddapTimestamp([[1, 2, 3]], 3), null)
assert.equal(extractFirstErddapTimestamp([[1, 2, 3, null], [1, 2, 3, '2026-10-30T07:00:00Z']], 3), '2026-10-30T07:00:00Z')
assert.equal(extractFirstErddapTimestamp([[1, 2, 3, 'not-a-date']], 3), 'not-a-date')
assert.equal(extractFirstErddapTimestamp([[1, 2, 3, '2026-10-30T07:00:00Z']], -1), null)

console.log('=== Production 1D correction freshness gate ===')
assert.equal(get1DGridFreshness(null, now).fresh, false)
assert.equal(get1DGridFreshness({ points: [] }, now).reason, 'missing-grid')
assert.equal(get1DGridFreshness({ points: [{}], erddapTimestamp: null }, now).reason, 'missing-timestamp')

const fresh = get1DGridFreshness(gridAt(35.99), now)
assert.equal(fresh.fresh, true)
assert.equal(fresh.reason, 'fresh')

const atBoundary = get1DGridFreshness(gridAt(36), now)
assert.equal(atBoundary.fresh, false)
assert.equal(atBoundary.reason, 'stale')

const stale = get1DGridFreshness(gridAt(36.01), now)
assert.equal(stale.fresh, false)
assert.equal(stale.reason, 'stale')

const invalid = get1DGridFreshness({ points: [{}], erddapTimestamp: 'not-a-date' }, now)
assert.equal(invalid.fresh, false)
assert.equal(invalid.reason, 'invalid-or-future-timestamp')
assert.equal(invalid.dataAgeMinutes, null)

const future = get1DGridFreshness({ points: [{}], erddapTimestamp: new Date(now + HOUR).toISOString() }, now)
assert.equal(future.fresh, false)
assert.equal(future.reason, 'invalid-or-future-timestamp')

console.log('=== Production wiring contract ===')
const source = fs.readFileSync(path.join(__dirname, '../../scripts/fetch-sargassum-live.cjs'), 'utf8')
assert.match(source, /extractFirstErddapTimestamp(rows, timeIdx)/)
assert.match(source, /get1DGridFreshness(grid1D)/)

console.log('=== Shared freshness contract ===')
assert.equal(SAT_STALE_HOURS, 36)
assert.equal(satelliteFreshness(now - 15 * 60 * 1000, now).stale, false)
assert.equal(satelliteFreshness(now - 36 * HOUR, now).stale, true)

console.log('ALL PRODUCTION ERDDAP 1D FRESHNESS TESTS PASSED')

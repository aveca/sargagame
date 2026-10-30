#!/usr/bin/env node
'use strict'

/**
 * Tests the actual production helpers used by fetch-sargassum-live.cjs.
 * The 1D correction uses the shared 36h public freshness cutoff. The 7D grid
 * requires a valid observation timestamp and preserves its real age. The
 * separate 900 min operational release gate remains unchanged.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { satelliteFreshness, SAT_STALE_HOURS } = require('../../scripts/lib/satellite-freshness.cjs')
const {
  extractFirstErddapTimestamp,
  getErddapGridAge,
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

console.log('=== Production 7D grid timestamp contract ===')
const valid7D = getErddapGridAge('2026-10-30T08:00:00Z', now)
assert.equal(valid7D.ok, true)
assert.equal(valid7D.dataAgeHours, 0, 'a fresh zero-age grid must stay zero, not fall back to 24h')

const old7D = getErddapGridAge('2026-10-28T12:00:00Z', now)
assert.equal(old7D.ok, true)
assert.equal(old7D.dataAgeHours, 44, 'valid old observations retain their actual age for the separate release gate')

assert.equal(getErddapGridAge(null, now).reason, 'missing-timestamp')
assert.equal(getErddapGridAge('', now).reason, 'missing-timestamp')
assert.equal(getErddapGridAge('not-a-date', now).reason, 'invalid-timestamp')
assert.equal(getErddapGridAge(new Date(now + HOUR).toISOString(), now).reason, 'future-timestamp')
assert.equal(getErddapGridAge('2026-10-30T07:00:00Z', NaN).reason, 'invalid-clock')

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
assert.ok(source.includes('extractFirstErddapTimestamp(rows, timeIdx)'))
assert.ok(source.includes('get1DGridFreshness(grid1D)'))
assert.ok(source.includes('getErddapGridAge(erddapTimestamp)'))
assert.ok(source.includes('if (!gridAge.ok)'))
assert.ok(source.includes('Number.isFinite(grid.dataAgeHours) && grid.dataAgeHours >= 0'))

console.log('=== Shared freshness contract ===')
assert.equal(SAT_STALE_HOURS, 36)
assert.equal(satelliteFreshness(now - 15 * 60 * 1000, now).stale, false)
assert.equal(satelliteFreshness(now - 36 * HOUR, now).stale, true)

console.log('ALL PRODUCTION ERDDAP 1D/7D FRESHNESS TESTS PASSED')

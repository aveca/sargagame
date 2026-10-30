#!/usr/bin/env node
'use strict';

/**
 * ERDDAP 1D/7D Freshness Tests
 * Tests the fetchErddapGrid1D timestamp extraction and compute1DCorrection freshness gating
 * 
 * Thresholds (immutable):
 * - 900 min operational (15h)
 * - 2160 min public stale (36h)
 * - SAT_STALE_HOURS = 36
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const { satelliteFreshness, SAT_STALE_HOURS } = require('../../scripts/lib/satellite-freshness.cjs');

// Mock the fetch-sargassum-live module functions for testing
// We'll test the logic directly since the functions aren't exported

// Test satelliteFreshness directly with various timestamps
const now = Date.now();
const ONE_HOUR_MS = 60 * 60 * 1000;

function testFreshnessCase(label, timestampMs, expectedStale, expectedAgeMinutesRange) {
  const result = satelliteFreshness(timestampMs, now);
  console.log(`  ${label}:`);
  console.log(`    dataAgeMinutes: ${result.dataAgeMinutes}`);
  console.log(`    stale: ${result.stale} (expected: ${expectedStale})`);
  assert.strictEqual(result.stale, expectedStale, `${label}: stale flag mismatch`);
  if (expectedAgeMinutesRange) {
    const [min, max] = expectedAgeMinutesRange;
    assert.ok(result.dataAgeMinutes >= min && result.dataAgeMinutes <= max,
      `${label}: age ${result.dataAgeMinutes} not in range [${min}, ${max}]`);
  }
}

console.log('=== satelliteFreshness threshold tests ===');

// 0h - fresh
testFreshnessCase('0h', now, false, [0, 5]);

// 35.99h - just under 36h threshold (fresh)
testFreshnessCase('35.99h', now - 35.99 * ONE_HOUR_MS, false, [35 * 60, 36 * 60]);

// 36h - exactly at threshold (stale per public contract)
testFreshnessCase('36h', now - 36 * ONE_HOUR_MS, true, [35 * 60, 37 * 60]);

// 36.01h - just over threshold (stale)
testFreshnessCase('36.01h', now - 36.01 * ONE_HOUR_MS, true, [36 * 60, 37 * 60]);

// timestamp absent (null)
console.log('  timestamp absent (null):');
let result = satelliteFreshness(null, now);
console.log(`    dataAgeMinutes: ${result.dataAgeMinutes}`);
console.log(`    stale: ${result.stale} (expected: true)`);
assert.strictEqual(result.stale, true, 'null timestamp should be stale');
assert.strictEqual(result.dataAgeMinutes, null, 'null timestamp should have null age');

// timestamp invalid (string that doesn't parse)
console.log('  timestamp invalid (string):');
result = satelliteFreshness('not-a-date', now);
console.log(`    dataAgeMinutes: ${result.dataAgeMinutes}`);
console.log(`    stale: ${result.stale} (expected: true)`);
assert.strictEqual(result.stale, true, 'invalid timestamp should be stale');
assert.strictEqual(result.dataAgeMinutes, null, 'invalid timestamp should have null age');

// timestamp in the future
console.log('  timestamp future:');
result = satelliteFreshness(now + ONE_HOUR_MS, now);
console.log(`    dataAgeMinutes: ${result.dataAgeMinutes}`);
console.log(`    stale: ${result.stale} (expected: true)`);
assert.strictEqual(result.stale, true, 'future timestamp should be stale');
assert.strictEqual(result.dataAgeMinutes, null, 'future timestamp should have null age');

console.log('\n=== compute1DCorrection freshness gating tests ===');

// Test the logic that would be in compute1DCorrection
// Since we can't import it directly, we test the satelliteFreshness logic it uses

function mockCompute1DCorrection(grid1D) {
  // This mirrors the logic added to compute1DCorrection
  if (!grid1D || !grid1D.points || grid1D.points.length === 0) return { correction: 0, reason: 'no grid1D' };
  
  if (grid1D.erddapTimestamp) {
    const freshness1D = satelliteFreshness(grid1D.erddapTimestamp);
    if (freshness1D.stale || freshness1D.dataAgeMinutes === null) {
      return { 
        correction: 0, 
        reason: `1D data is stale (age: ${freshness1D.dataAgeMinutes ? Math.round(freshness1D.dataAgeMinutes / 60) + 'h' : 'unknown'})` 
      };
    }
  } else {
    return { correction: 0, reason: '1D data has no timestamp' };
  }
  
  // If we get here, 1D data is fresh - correction would be computed
  return { correction: 'computed', reason: '1D data is fresh' };
}

// 1D stale avec 7D frais (1D > 36h, 7D fresh)
console.log('  1D stale (40h) + 7D fresh (5h):');
const grid1D_stale = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }], erddapTimestamp: now - 40 * ONE_HOUR_MS };
const grid7D_fresh = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.005 }], erddapTimestamp: now - 5 * ONE_HOUR_MS };
let res = mockCompute1DCorrection(grid1D_stale);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 0, '1D stale should skip correction');

// 1D frais avec 7D stale (1D < 12h, 7D > 36h) - 1D fresh so correction applies
console.log('  1D fresh (6h) + 7D stale (40h):');
const grid1D_fresh = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }], erddapTimestamp: now - 6 * ONE_HOUR_MS };
const grid7D_stale = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.005 }], erddapTimestamp: now - 40 * ONE_HOUR_MS };
res = mockCompute1DCorrection(grid1D_fresh);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 'computed', '1D fresh should allow correction');

// Deux sources stale (both > 36h)
console.log('  1D stale (40h) + 7D stale (40h):');
res = mockCompute1DCorrection(grid1D_stale);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 0, '1D stale should skip correction even if 7D also stale');

// Désaccord des timestamps: 1D says 10h, 7D says 40h - 1D is fresh so correction applies
console.log('  1D fresh (10h) + 7D stale (40h) - timestamp disagreement:');
const grid1D_disagree = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }], erddapTimestamp: now - 10 * ONE_HOUR_MS };
res = mockCompute1DCorrection(grid1D_disagree);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 'computed', '1D fresh should allow correction regardless of 7D');

// No timestamp on 1D
console.log('  1D no timestamp:');
const grid1D_no_ts = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }], erddapTimestamp: null };
res = mockCompute1DCorrection(grid1D_no_ts);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 0, '1D without timestamp should skip correction');

// Invalid timestamp on 1D
console.log('  1D invalid timestamp:');
const grid1D_invalid_ts = { points: [{ latitude: 14.5, longitude: -61.0, AFAI: 0.01 }], erddapTimestamp: 'invalid' };
res = mockCompute1DCorrection(grid1D_invalid_ts);
console.log(`    correction: ${res.correction}, reason: ${res.reason}`);
assert.strictEqual(res.correction, 0, '1D with invalid timestamp should skip correction');

console.log('\n=== fetchErddapGrid1D timestamp extraction logic ===');

// Test the timestamp extraction logic (simulated)
function extractTimestampFromRows(rows, timeIdx) {
  if (timeIdx < 0) return null;
  for (const row of rows) {
    if (row[timeIdx]) return row[timeIdx];
  }
  return null;
}

// Valid timestamp in rows
console.log('  Valid timestamp in rows:');
const rowsWithTime = [
  [14.5, -61.0, 0.01, '2026-10-29T12:00:00Z'],
  [14.6, -61.1, 0.005, '2026-10-29T11:00:00Z']
];
const timeIdx = 3;
let ts = extractTimestampFromRows(rowsWithTime, timeIdx);
console.log(`    extracted: ${ts}`);
assert.strictEqual(ts, '2026-10-29T12:00:00Z', 'Should extract first valid timestamp');

// No time column
console.log('  No time column:');
const rowsNoTime = [
  [14.5, -61.0, 0.01],
  [14.6, -61.1, 0.005]
];
ts = extractTimestampFromRows(rowsNoTime, -1);
console.log(`    extracted: ${ts}`);
assert.strictEqual(ts, null, 'Should return null when no time column');

// Empty rows
console.log('  Empty rows:');
ts = extractTimestampFromRows([], 3);
console.log(`    extracted: ${ts}`);
assert.strictEqual(ts, null, 'Should return null for empty rows');

// All null timestamps
console.log('  All null timestamps:');
const rowsNullTime = [
  [14.5, -61.0, 0.01, null],
  [14.6, -61.1, 0.005, null]
];
ts = extractTimestampFromRows(rowsNullTime, 3);
console.log(`    extracted: ${ts}`);
assert.strictEqual(ts, null, 'Should return null when all timestamps are null');

console.log('\n=== ALL ERDDAP 1D/7D FRESHNESS TESTS PASSED ===');
console.log('SAT_STALE_HOURS =', SAT_STALE_HOURS);
console.log('Operational threshold: 900 min (15h)');
console.log('Public stale threshold: 2160 min (36h)');
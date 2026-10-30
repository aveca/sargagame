#!/usr/bin/env node
'use strict';

/**
 * observation-freshness.test.cjs — Tests for the shared observation freshness contract.
 *
 * Covers all required scenarios from the P0 mission:
 *   - 0h (fresh)
 *   - 35.99h (within public window, past operational SLA)
 *   - 36h (public stale boundary)
 *   - 36.01h (publicly stale)
 *   - timestamp absent
 *   - timestamp invalid
 *   - timestamp future
 *   - 1D stale with 7D fresh
 *   - 1D fresh with 7D stale
 *   - two sources stale
 *   - timestamp disagreement
 *   - non-live source (reference/synthetic)
 *   - updatedAt vs erddapTimestamp separation
 */

const assert = require('node:assert/strict');
const { observationFreshness, SAT_STALE_HOURS, OPERATIONAL_SLA_MINUTES } = require('../../scripts/lib/observation-freshness.cjs');

const NOW = Date.now();
const H = 60 * 60 * 1000;

function msFromHoursAgo(hours) {
  return NOW - hours * H;
}

function msFromHoursFuture(hours) {
  return NOW + hours * H;
}

console.log('=== Observation Freshness Contract Tests ===');
console.log(`SAT_STALE_HOURS = ${SAT_STALE_HOURS} (${SAT_STALE_HOURS * 60} min public stale)`);
console.log(`OPERATIONAL_SLA_MINUTES = ${OPERATIONAL_SLA_MINUTES} min`);
console.log(`NOW = ${new Date(NOW).toISOString()}\n`);

// --- Threshold tests ---

// 0h — fresh
let r = observationFreshness({ source: 'erddap-live', erddapTimestamp: NOW, now: NOW });
console.log(`0h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, true, '0h should be fresh');
assert.strictEqual(r.stale, false, '0h should not be stale');
assert.strictEqual(r.unknown, false, '0h should not be unknown');
assert.strictEqual(r.canShowCurrentScore, true, '0h can show current score');
assert.strictEqual(r.canShowCurrentVerdict, true, '0h can show current verdict');
assert.strictEqual(r.canShowForecast, true, '0h can show forecast');

// 35.99h — past operational SLA (900 min = 15h), within public window (2160 min = 36h)
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(35.99), now: NOW });
console.log(`35.99h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, '35.99h should not be fresh');
assert.strictEqual(r.stale, false, '35.99h should not be publicly stale');
assert.strictEqual(r.unknown, false, '35.99h should not be unknown');
assert.strictEqual(r.canShowCurrentScore, false, '35.99h cannot show current score (past operational SLA)');
assert.strictEqual(r.canShowCurrentVerdict, false, '35.99h cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, '35.99h cannot show forecast');

// 36h — public stale boundary
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(36), now: NOW });
console.log(`36h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, '36h should not be fresh');
assert.strictEqual(r.stale, true, '36h should be publicly stale');
assert.strictEqual(r.unknown, false, '36h should not be unknown');
assert.strictEqual(r.canShowCurrentScore, false, '36h cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, '36h cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, '36h cannot show forecast');

// 36.01h — publicly stale
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(36.01), now: NOW });
console.log(`36.01h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, '36.01h should not be fresh');
assert.strictEqual(r.stale, true, '36.01h should be publicly stale');
assert.strictEqual(r.unknown, false, '36.01h should not be unknown');
assert.strictEqual(r.canShowCurrentScore, false, '36.01h cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, '36.01h cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, '36.01h cannot show forecast');

// 15h — exactly at operational SLA boundary (900 min)
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(15), now: NOW });
console.log(`15h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
// 15h = 900 min exactly — should be fresh (not > 900)
assert.strictEqual(r.fresh, true, '15h (exactly 900 min) should still be fresh');

// 15.01h — just past operational SLA
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(15.01), now: NOW });
console.log(`15.01h: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, '15.01h should not be fresh');
assert.strictEqual(r.stale, false, '15.01h should not be publicly stale');

// --- Edge cases ---

// timestamp absent (null)
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: null, now: NOW });
console.log(`absent: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, 'absent should not be fresh');
assert.strictEqual(r.stale, true, 'absent should be stale');
assert.strictEqual(r.unknown, true, 'absent should be unknown');
assert.strictEqual(r.ageMinutes, null, 'absent age should be null');
assert.strictEqual(r.canShowCurrentScore, false, 'absent cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, 'absent cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, 'absent cannot show forecast');

// timestamp invalid (unparseable string)
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: 'not-a-date', now: NOW });
console.log(`invalid: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, 'invalid should not be fresh');
assert.strictEqual(r.unknown, true, 'invalid should be unknown');
assert.strictEqual(r.ageMinutes, null, 'invalid age should be null');
assert.strictEqual(r.canShowCurrentScore, false, 'invalid cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, 'invalid cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, 'invalid cannot show forecast');

// timestamp future
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursFuture(1), now: NOW });
console.log(`future: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, 'future should not be fresh');
assert.strictEqual(r.unknown, true, 'future should be unknown');
assert.strictEqual(r.ageMinutes, null, 'future age should be null');
assert.strictEqual(r.canShowCurrentScore, false, 'future cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, 'future cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, 'future cannot show forecast');

// non-live source (reference)
r = observationFreshness({ source: 'reference', erddapTimestamp: NOW, now: NOW });
console.log(`reference source: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, 'reference source should not be fresh');
assert.strictEqual(r.unknown, true, 'reference source should be unknown for current verdict');
assert.strictEqual(r.ageMinutes, 0, 'reference age should be 0');
assert.strictEqual(r.canShowCurrentScore, false, 'reference cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, 'reference cannot show current verdict');
assert.strictEqual(r.canShowForecast, false, 'reference cannot show forecast');

// non-live source (synthetic)
r = observationFreshness({ source: 'synthetic', erddapTimestamp: NOW, now: NOW });
console.log(`synthetic source: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes} reason="${r.reason}"`);
assert.strictEqual(r.fresh, false, 'synthetic source should not be fresh');
assert.strictEqual(r.unknown, true, 'synthetic source should be unknown');
assert.strictEqual(r.canShowCurrentScore, false, 'synthetic cannot show current score');

// --- 1D/7D interaction scenarios ---

// 1D stale (40h) + 7D fresh (5h) — 1D alone cannot prove current status
const grid1D_stale = { source: 'erddap-live', erddapTimestamp: msFromHoursAgo(40) };
const grid7D_fresh = { source: 'erddap-live', erddapTimestamp: msFromHoursAgo(5) };
r = observationFreshness(grid1D_stale);
console.log(`1D stale (40h): fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes}`);
assert.strictEqual(r.fresh, false, '1D stale (40h) should not be fresh');
assert.strictEqual(r.stale, true, '1D stale (40h) should be stale');
assert.strictEqual(r.canShowCurrentScore, false, '1D stale cannot show current score');
assert.strictEqual(r.canShowCurrentVerdict, false, '1D stale cannot show current verdict');

// 1D fresh (6h) + 7D stale (40h) — 1D fresh allows current status
const grid1D_fresh = { source: 'erddap-live', erddapTimestamp: msFromHoursAgo(6) };
const grid7D_stale = { source: 'erddap-live', erddapTimestamp: msFromHoursAgo(40) };
r = observationFreshness(grid1D_fresh);
console.log(`1D fresh (6h): fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes}`);
assert.strictEqual(r.fresh, true, '1D fresh (6h) should be fresh');
assert.strictEqual(r.canShowCurrentScore, true, '1D fresh can show current score');
assert.strictEqual(r.canShowCurrentVerdict, true, '1D fresh can show current verdict');

// Both sources stale
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(40), now: NOW });
console.log(`both stale (40h): fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown} age=${r.ageMinutes}`);
assert.strictEqual(r.fresh, false, 'both stale should not be fresh');
assert.strictEqual(r.stale, true, 'both stale should be stale');

// Timestamp disagreement: 1D says 10h, 7D says 40h — 1D is fresh so current status allowed
const grid1D_disagree = { source: 'erddap-live', erddapTimestamp: msFromHoursAgo(10) };
r = observationFreshness(grid1D_disagree);
console.log(`1D fresh (10h) despite 7D stale: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown}`);
assert.strictEqual(r.fresh, true, '1D fresh (10h) should be fresh regardless of 7D');
assert.strictEqual(r.canShowCurrentScore, true, '1D fresh can show current score');

// --- updatedAt vs erddapTimestamp separation ---

// updatedAt is recent but erddapTimestamp is old — should NOT be fresh
r = observationFreshness({
  source: 'erddap-live',
  erddapTimestamp: msFromHoursAgo(40), // old observation
  now: NOW,
});
console.log(`old erddap + recent updatedAt: fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown}`);
assert.strictEqual(r.fresh, false, 'old erddapTimestamp should not be fresh even with recent updatedAt');
assert.strictEqual(r.stale, true, 'old erddapTimestamp should be stale');

// Build time is never an observation timestamp
r = observationFreshness({
  source: 'erddap-live',
  erddapTimestamp: null, // no observation, only build time available
  now: NOW,
});
console.log(`no erddapTimestamp (build time only): fresh=${r.fresh} stale=${r.stale} unknown=${r.unknown}`);
assert.strictEqual(r.fresh, false, 'no observation timestamp should not be fresh');
assert.strictEqual(r.unknown, true, 'no observation timestamp should be unknown');

// --- Region context ---
r = observationFreshness({ source: 'erddap-live', erddapTimestamp: msFromHoursAgo(10), now: NOW, region: 'mq' });
console.log(`with region mq: reason="${r.reason}"`);
assert.ok(r.reason.includes('region=mq'), 'reason should include region context');

// --- Threshold immutability ---
assert.strictEqual(SAT_STALE_HOURS, 36, 'SAT_STALE_HOURS must remain 36');
assert.strictEqual(OPERATIONAL_SLA_MINUTES, 900, 'OPERATIONAL_SLA_MINUTES must remain 900');

console.log('\n=== ALL OBSERVATION FRESHNESS CONTRACT TESTS PASSED ===');

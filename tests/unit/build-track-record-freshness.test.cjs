'use strict';

const assert = require('node:assert/strict');
const { calculateTrackRecordFreshness } = require('../../scripts/automation/lib/track-record-freshness.cjs');

const now = Date.parse('2026-10-27T10:00:00.000Z');
const recent = calculateTrackRecordFreshness({
  computedAt: '2026-10-27T09:00:00.000Z',
  archiveTo: '2026-10-27',
  nowMs: now,
});
assert.equal(recent.stale, false, 'current UTC day is allowed within the documented 24h future-window skew');
assert.equal(recent.archiveToAgeDays, 0, 'same-day window age must not be reported as negative');

const roundedGap = calculateTrackRecordFreshness({
  computedAt: '2026-10-27T09:00:00.000Z',
  archiveTo: '2026-10-24',
  nowMs: now,
});
assert.equal(roundedGap.archiveToAgeDays, 2, 'fixture reproduces Math.round(58h / 24h) === 2');
assert.equal(roundedGap.windowAgeHours, 58, 'exact elapsed window age is retained for diagnostics');
assert.equal(roundedGap.stale, true, 'a window older than 48 hours fails even when rounded days equal 2');

const exactBoundaryNow = Date.parse('2026-10-27T23:59:59.000Z');
const exactBoundary = calculateTrackRecordFreshness({
  computedAt: '2026-10-27T22:59:59.000Z',
  archiveTo: '2026-10-25',
  nowMs: exactBoundaryNow,
});
assert.equal(exactBoundary.windowAgeHours, 48, 'boundary fixture is exactly 48 hours after window end');
assert.equal(exactBoundary.stale, false, 'exactly 48 hours preserves the inclusive two-day threshold');

const beyondBoundary = calculateTrackRecordFreshness({
  computedAt: '2026-10-27T22:59:59.000Z',
  archiveTo: '2026-10-25',
  nowMs: exactBoundaryNow + 1000,
});
assert.equal(beyondBoundary.stale, true, 'one second beyond 48 hours fails closed');

assert.equal(calculateTrackRecordFreshness({ archiveTo: '2026-10-27', nowMs: now }).stale, true,
  'missing backtest timestamp cannot be published as fresh');
assert.equal(calculateTrackRecordFreshness({ computedAt: 'not-a-date', archiveTo: '2026-10-27', nowMs: now }).stale, true,
  'invalid backtest timestamp fails closed');
assert.equal(calculateTrackRecordFreshness({ computedAt: '2026-10-27T09:00:00.000Z', archiveTo: '2026-02-30', nowMs: now }).stale, true,
  'invalid UTC date fails closed');
assert.equal(calculateTrackRecordFreshness({
  computedAt: '2026-10-27T09:00:00.000Z',
  archiveTo: '2026-10-29',
  nowMs: now,
}).stale, true, 'measurement window more than 24 hours in the future fails closed');

console.log('BUILD_TRACK_RECORD_FRESHNESS_TESTS PASS (10 assertions)');

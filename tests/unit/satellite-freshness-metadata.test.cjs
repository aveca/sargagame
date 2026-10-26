'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SAT_STALE_HOURS, satelliteFreshness, refreshSatellitePayload } = require('../../scripts/lib/satellite-freshness.cjs');

const now = Date.parse('2026-10-26T00:00:00.000Z');
let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

check(SAT_STALE_HOURS === 36, 'pipeline threshold remains 36 hours');
check(
  JSON.stringify(satelliteFreshness('2026-10-24T12:00:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: 2160, stale: false }),
  'exactly 36 hours retains the existing >36h stale boundary'
);
check(
  JSON.stringify(satelliteFreshness('2026-10-24T11:59:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: 2161, stale: true }),
  '36h01 is stale even when a previous static dataAgeMinutes value was lower'
);
check(
  JSON.stringify(satelliteFreshness('2026-10-25T12:00:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: 720, stale: false }),
  '12-hour observation is not stale under the 36-hour pipeline threshold'
);
check(
  JSON.stringify(satelliteFreshness(null, now)) === JSON.stringify({ dataAgeMinutes: null, stale: false }),
  'missing observation timestamp is unknown, not fabricated'
);
check(
  JSON.stringify(satelliteFreshness('not-a-date', now)) === JSON.stringify({ dataAgeMinutes: null, stale: false }),
  'invalid observation timestamp is unknown'
);
check(
  JSON.stringify(satelliteFreshness('2026-10-26T01:00:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: null, stale: false }),
  'future observation timestamp is not accepted as fresh'
);
check(
  satelliteFreshness('2026-10-24T12:00:00.000Z', now).dataAgeMinutes !== 1713,
  'age is recalculated from erddapTimestamp rather than reusing a frozen production value'
);

console.log(`SATELLITE_FRESHNESS_METADATA_TESTS PASS (${assertions} assertions)`);

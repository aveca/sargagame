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
const staleBoundaryMs = SAT_STALE_HOURS * 60 * 60 * 1000;
check(
  JSON.stringify(satelliteFreshness('2026-10-24T12:00:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: 2160, stale: true }),
  'exactly 36 hours is stale under the public >=36h contract'
);
check(
  satelliteFreshness(now - staleBoundaryMs + 1, now).stale === false,
  'one millisecond before the 36h boundary is not stale even if displayed minutes round to 2160'
);
check(
  satelliteFreshness(now - staleBoundaryMs - 1, now).stale === true,
  'one millisecond after the 36h boundary is stale even if displayed minutes round to 2160'
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
  JSON.stringify(satelliteFreshness(null, now)) === JSON.stringify({ dataAgeMinutes: null, stale: true }),
  'missing observation timestamp fails closed: unknown age, stale/unverified'
);
check(
  JSON.stringify(satelliteFreshness('not-a-date', now)) === JSON.stringify({ dataAgeMinutes: null, stale: true }),
  'invalid observation timestamp fails closed'
);
check(
  JSON.stringify(satelliteFreshness('2026-10-26T01:00:00.000Z', now)) === JSON.stringify({ dataAgeMinutes: null, stale: true }),
  'future observation timestamp fails closed'
);
check(
  JSON.stringify(satelliteFreshness('2026-10-25T12:00:00.000Z', Number.NaN)) === JSON.stringify({ dataAgeMinutes: null, stale: true }),
  'invalid clock fails closed rather than implying freshness'
);
check(
  satelliteFreshness('2026-10-24T12:00:00.000Z', now).dataAgeMinutes !== 1713,
  'age is recalculated from erddapTimestamp rather than reusing a frozen production value'
);

const regionalPayload = {
  source: 'erddap-live',
  updatedAt: '2026-10-25T16:33:08.017Z',
  erddapTimestamp: '2026-10-24T11:59:00.000Z',
  dataAgeMinutes: 1713,
  stale: false,
  levels: [{ id: 'fl001', score: 69 }],
  weekly: { fl001: [{ date: '2026-10-26', afai: 0.05 }] },
  scores: { fl001: { score: 69 } },
};
const originalDecisionData = JSON.stringify({
  updatedAt: regionalPayload.updatedAt,
  levels: regionalPayload.levels,
  weekly: regionalPayload.weekly,
  scores: regionalPayload.scores,
});
refreshSatellitePayload(regionalPayload, now);
check(regionalPayload.dataAgeMinutes === 2161, 'regional stale age is recomputed from the satellite timestamp');
check(regionalPayload.stale === true, 'regional stale flag is recomputed at packaging time');
check(
  JSON.stringify({
    updatedAt: regionalPayload.updatedAt,
    levels: regionalPayload.levels,
    weekly: regionalPayload.weekly,
    scores: regionalPayload.scores,
  }) === originalDecisionData,
  'regional refresh changes freshness metadata only, preserving observation and forecast fields'
);

const unknownPayload = {
  source: 'erddap-live',
  updatedAt: '2026-10-25T23:59:00.000Z',
  erddapTimestamp: null,
  dataAgeMinutes: 5,
  stale: false,
  levels: [{ id: 'mq001', status: 'clean' }],
};
refreshSatellitePayload(unknownPayload, now);
check(unknownPayload.dataAgeMinutes === null, 'unknown satellite age overwrites a misleading static age');
check(unknownPayload.stale === true, 'unknown satellite timestamp is not published as fresh');
check(unknownPayload.levels[0].status === 'clean', 'unknown freshness does not mutate beach decision data');

const referencePayload = { source: 'reference', dataAgeMinutes: null, stale: false };
refreshSatellitePayload(referencePayload, now);
check(
  JSON.stringify(referencePayload) === JSON.stringify({ source: 'reference', dataAgeMinutes: null, stale: false }),
  'reference fallback payload is not changed by the live-data refresher'
);

const prepareFtpSource = fs.readFileSync(path.join(__dirname, '../../scripts/prepare-ftp.cjs'), 'utf-8');
check(
  prepareFtpSource.includes("require('./lib/satellite-freshness.cjs')") &&
    prepareFtpSource.includes('refreshSatellitePayload(payload)'),
  'regional FTP packaging recalculates freshness before copying a live payload'
);

console.log(`SATELLITE_FRESHNESS_METADATA_TESTS PASS (${assertions} assertions)`);

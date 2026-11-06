'use strict';

const assert = require('node:assert/strict');
const { buildLegacyBeachIndexStatus } = require('../../scripts/lib/legacy-beach-index-status.cjs');

const NOW = Date.parse('2026-11-06T06:00:00.000Z');
const map = {
  'grande-anse': 'mq014',
  'gp-grande-anse': 'gp021',
};

function payload(timestamp, overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: timestamp,
    // Cached fields are deliberately misleading in several tests.
    dataAgeMinutes: 0,
    stale: false,
    levels: [
      { id: 'grande-anse', status: 'clean', score: 81 },
      { id: 'gp-grande-anse', status: 'moderate', score: 54 },
      { id: 'unknown-beach', status: 'unverified', score: 99 },
    ],
    ...overrides,
  };
}

{
  const result = buildLegacyBeachIndexStatus(
    payload(new Date(NOW - 899 * 60_000).toISOString(), { stale: true, dataAgeMinutes: 9999 }),
    map,
    NOW,
  );
  assert.equal(result.available, true, 'timestamp is authoritative over cached stale/age fields');
  assert.equal(result.statusByBeachId.mq014, 'clean');
  assert.equal(result.statusByBeachId.gp021, 'moderate');
  assert.equal(result.validCount, 2);
  assert.equal(result.cleanCount, 1);
  assert.equal(result.statusByBeachId['unknown-beach'], undefined);
}

{
  const result = buildLegacyBeachIndexStatus(
    payload(new Date(NOW - 901 * 60_000).toISOString()),
    map,
    NOW,
  );
  assert.equal(result.available, false, 'stale observation must suspend all published statuses');
  assert.deepEqual(result.statusByBeachId, {});
  assert.equal(result.reason, 'observation-outside-operational-sla');
}

for (const [label, timestamp] of [
  ['missing', null],
  ['invalid', 'not-a-date'],
  ['future', new Date(NOW + 60_000).toISOString()],
]) {
  const result = buildLegacyBeachIndexStatus(payload(timestamp), map, NOW);
  assert.equal(result.available, false, `${label} timestamp must fail closed`);
  assert.deepEqual(result.statusByBeachId, {});
}

{
  const result = buildLegacyBeachIndexStatus(
    payload(new Date(NOW - 5 * 60_000).toISOString(), { source: 'fixture' }),
    map,
    NOW,
  );
  assert.equal(result.available, false, 'non-live source must not publish statuses');
  assert.deepEqual(result.statusByBeachId, {});
}

{
  const result = buildLegacyBeachIndexStatus(
    payload(new Date(NOW - 5 * 60_000).toISOString(), { levels: [{ id: 'grande-anse', status: 'unknown' }] }),
    map,
    NOW,
  );
  assert.equal(result.available, false, 'unknown statuses must not be rendered as a verdict');
  assert.deepEqual(result.statusByBeachId, {});
}

console.log('legacy-beach-index-status: PASS (fresh, stale, missing, invalid, future, non-live, unknown)');

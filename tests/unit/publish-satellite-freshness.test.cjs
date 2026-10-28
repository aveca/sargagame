'use strict';

const assert = require('node:assert/strict');
const { MAX_AGE_MINUTES, evaluatePayload, evaluatePayloadSet } = require('../../scripts/autopilot/check-publish-satellite-freshness.cjs');

const now = Date.parse('2026-10-28T12:00:00.000Z');
const live = timestamp => ({ source: 'erddap-live', erddapTimestamp: timestamp, updatedAt: new Date(now).toISOString() });
const sixRegions = timestamp => ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum'].map(id => ({ id, payload: live(timestamp) }));

assert.equal(MAX_AGE_MINUTES, 900);
assert.equal(evaluatePayload(live('2026-10-27T21:00:00.000Z'), now).ok, true, 'exactly 900 minutes passes');
assert.equal(evaluatePayload(live('2026-10-27T20:59:00.000Z'), now).ok, false, '901 minutes fails');
assert.equal(evaluatePayload(live(new Date(now - 900 * 60_000 - 1).toISOString()), now).ok, false, '1 ms beyond the SLA fails');
assert.equal(evaluatePayload(live('not-a-date'), now).ok, false, 'invalid timestamp fails closed');
assert.equal(evaluatePayload({ source: 'erddap-live', updatedAt: new Date(now).toISOString() }, now).ok, false, 'updatedAt cannot replace the observation timestamp');
assert.equal(evaluatePayload(live(new Date(now + 1).toISOString()), now).ok, false, 'future observation fails closed');
assert.equal(evaluatePayload({ source: 'reference', erddapTimestamp: new Date(now).toISOString() }, now).ok, false, 'reference data is not a live observation');
assert.equal(evaluatePayload(live('2026-10-27T21:00:00.000Z'), Number.NaN).ok, false, 'invalid check clock fails closed');

assert.equal(evaluatePayloadSet(live('2026-10-27T21:00:00.000Z'), sixRegions('2026-10-27T21:00:00.000Z'), now).ok, true, 'root and all six regional payloads pass');
const oneRegionStale = sixRegions('2026-10-27T21:00:00.000Z');
oneRegionStale[4].payload = live('2026-10-27T20:59:00.000Z');
const staleSet = evaluatePayloadSet(live('2026-10-27T21:00:00.000Z'), oneRegionStale, now);
assert.equal(staleSet.ok, false, 'one stale regional payload blocks publication');
assert.ok(staleSet.failedRegions.includes('rivieramaya'), 'the failed region is identified');
assert.equal(evaluatePayloadSet(live('2026-10-27T21:00:00.000Z'), [], now).ok, false, 'missing regional payload set fails closed');
const missingRegion = sixRegions('2026-10-27T21:00:00.000Z');
missingRegion[2].payload = null;
assert.equal(evaluatePayloadSet(live('2026-10-27T21:00:00.000Z'), missingRegion, now).ok, false, 'missing regional JSON fails closed');

console.log('PUBLISH_SATELLITE_FRESHNESS_TESTS PASS (12 assertions)');

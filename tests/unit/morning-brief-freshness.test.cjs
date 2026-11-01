'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  OPERATIONAL_SLA_MINUTES,
  operationalSatelliteFreshness,
} = require('../../scripts/lib/satellite-freshness.cjs');

const now = Date.parse('2026-10-31T16:22:00.000Z');
const minute = 60_000;

assert.equal(OPERATIONAL_SLA_MINUTES, 900, 'morning brief operational SLA stays at 900 minutes');

const fresh = operationalSatelliteFreshness({
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 900 * minute).toISOString(),
}, now);
assert.equal(fresh.fresh, true, 'exactly 900 minutes remains eligible');

const justOutside = operationalSatelliteFreshness({
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 900 * minute - 1).toISOString(),
}, now);
assert.equal(justOutside.fresh, false, 'one millisecond beyond 900 minutes is blocked');

const staleButLying = operationalSatelliteFreshness({
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 1702 * minute).toISOString(),
  updatedAt: new Date(now - minute).toISOString(),
  dataAgeMinutes: 60,
  stale: false,
}, now);
assert.equal(staleButLying.fresh, false, 'recent publication metadata cannot override old ERDDAP observation');
assert.equal(staleButLying.ageMinutes, 1702, 'age is recalculated from erddapTimestamp');

for (const region of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']) {
  const result = operationalSatelliteFreshness({
    region,
    source: 'erddap-live',
    erddapTimestamp: new Date(now - 1702 * minute).toISOString(),
  }, now);
  assert.equal(result.fresh, false, region + ' stale observation must be blocked');
}

for (const [label, payload] of [
  ['missing payload', null],
  ['missing timestamp', { source: 'erddap-live' }],
  ['invalid timestamp', { source: 'erddap-live', erddapTimestamp: 'not-a-date' }],
  ['future timestamp', { source: 'erddap-live', erddapTimestamp: new Date(now + minute).toISOString() }],
  ['non-live source', { source: 'cached', erddapTimestamp: new Date(now - minute).toISOString() }],
]) {
  assert.equal(operationalSatelliteFreshness(payload, now).fresh, false, label + ' must fail closed');
}
assert.equal(
  operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: new Date(now - minute).toISOString() }, Number.NaN).fresh,
  false,
  'invalid clock must fail closed',
);

// Verify the actual scheduled sender applies the guard before selecting/building/sending a verdict.
const sender = fs.readFileSync(
  path.join(__dirname, '../../scripts/automation/send-notifications.cjs'),
  'utf8',
);
const start = sender.indexOf('async function sendMorningBriefPush(sargassum)');
const end = sender.indexOf('\n}\n', start) + 3;
assert.ok(start >= 0 && end > start, 'sendMorningBriefPush source must remain discoverable');
const sendFunction = sender.slice(start, end);
const gate = sendFunction.indexOf('operationalSatelliteFreshness(data)');
assert.ok(gate >= 0, 'morning brief must evaluate the real ERDDAP timestamp');
assert.ok(gate < sendFunction.indexOf('pickTopForBrief(data, island)'), 'freshness gate must run before choosing a beach');
assert.ok(gate < sendFunction.indexOf('buildBriefMessage(pick, islandName, lang)'), 'freshness gate must run before constructing a customer verdict');
assert.ok(gate < sendFunction.indexOf('sendPushNotification(island, msg, heading)'), 'freshness gate must run before any OneSignal request');
assert.ok(sendFunction.includes("reason: 'observation-not-operationally-fresh'"), 'skips must be explicitly recorded');

console.log('MORNING_BRIEF_FRESHNESS_TESTS PASS (21 assertions; no network calls)');

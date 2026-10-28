'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDV = require('../../scripts/autopilot/post-deploy-verify.cjs');

const source = fs.readFileSync(path.join(__dirname, '../../scripts/autopilot/post-deploy-verify.cjs'), 'utf8');
let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

const now = Date.parse('2026-10-27T00:33:49.000Z');
const payload = {
  source: 'erddap-live',
  updatedAt: '2026-10-26T22:45:47.765Z',
  erddapTimestamp: '2026-10-25T12:00:00.000Z',
  dataAgeMinutes: 2086,
  stale: false,
};
const stale = PDV.checkSatelliteFreshness(payload, now);
check(stale.status === 'FAILED', 'a fresh pipeline cannot mask a satellite observation outside the strict operational SLA');
check(stale.ageMinutes === 2194, 'satellite age is recomputed from erddapTimestamp, not the frozen dataAgeMinutes field');
check(/périmée/.test(stale.detail), 'stale observation reports an explicit reason');

const fresh = PDV.checkSatelliteFreshness({
  ...payload,
  erddapTimestamp: '2026-10-26T12:33:49.000Z',
}, now);
check(fresh.status === 'VERIFIED' && fresh.ageMinutes === 720, 'a 12-hour observation passes the strict 900-minute operational SLA');

const boundary = PDV.checkSatelliteFreshness({
  ...payload,
  erddapTimestamp: '2026-10-26T09:33:49.000Z',
}, now);
check(boundary.status === 'VERIFIED' && boundary.ageMinutes === 900, 'exactly 15 hours satisfies the strict operational boundary');

const overLimit = PDV.checkSatelliteFreshness({
  ...payload,
  erddapTimestamp: '2026-10-26T09:32:49.000Z',
}, now);
check(overLimit.status === 'FAILED' && overLimit.ageMinutes === 901 && /900min/.test(overLimit.detail), '15h01 blocks release even though the public stale marker remains false');

check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: null }, now).status === 'FAILED', 'missing satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: 'not-a-date' }, now).status === 'FAILED', 'invalid satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: '2026-10-27T01:00:00.000Z' }, now).status === 'FAILED', 'future satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ source: 'reference', updatedAt: payload.updatedAt }, now).status === 'NOT_VERIFIED', 'non-live reference payload is not falsely certified as satellite-fresh');
check(source.includes('SATELLITE_OPERATIONAL_LIMIT_MINUTES = 900'), 'post-deploy verifier enforces the strict 15-hour release gate');
check(source.includes("set('satellite_freshness', satelliteCheck.status, satelliteCheck.detail)"), 'post-deploy verifier wires satellite freshness into the per-domain gate');

console.log(`POST_DEPLOY_SATELLITE_FRESHNESS_TESTS PASS (${assertions} assertions)`);

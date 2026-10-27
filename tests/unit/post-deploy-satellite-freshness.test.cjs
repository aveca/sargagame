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
check(stale.status === 'FAILED', 'a fresh pipeline cannot mask a satellite observation older than 36 hours');
check(stale.ageMinutes === 2194, 'satellite age is recomputed from erddapTimestamp, not the frozen dataAgeMinutes field');
check(/périmée/.test(stale.detail), 'stale observation reports an explicit reason');

const fresh = PDV.checkSatelliteFreshness({
  ...payload,
  erddapTimestamp: '2026-10-26T12:33:49.000Z',
}, now);
check(fresh.status === 'VERIFIED' && fresh.ageMinutes === 720, 'a 12-hour observation passes the 36-hour threshold');

const boundary = PDV.checkSatelliteFreshness({
  ...payload,
  erddapTimestamp: '2026-10-25T12:33:49.000Z',
}, now);
check(boundary.status === 'VERIFIED' && boundary.ageMinutes === 2160, 'exactly 36 hours preserves the existing non-stale boundary');

check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: null }, now).status === 'FAILED', 'missing satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: 'not-a-date' }, now).status === 'FAILED', 'invalid satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ ...payload, erddapTimestamp: '2026-10-27T01:00:00.000Z' }, now).status === 'FAILED', 'future satellite timestamp fails closed');
check(PDV.checkSatelliteFreshness({ source: 'reference', updatedAt: payload.updatedAt }, now).status === 'NOT_VERIFIED', 'non-live reference payload is not falsely certified as satellite-fresh');
check(source.includes("set('satellite_freshness', satelliteCheck.status, satelliteCheck.detail)"), 'post-deploy verifier wires satellite freshness into the per-domain gate');

const trackRecord = {
  generatedAt: '2026-10-27T00:00:00.000Z',
  freshness: { computedAt: '2026-10-27T00:00:00.000Z', stale: false },
  window: { from: '2026-10-08', to: '2026-10-27' },
  sampleSize: 2079,
  byHorizon: [{ day: 1, hitRatePct: 99, pairs: 300 }],
  byRegime: { calm: { cleanSamples: 100, cleanReliabilityPct: 99 } },
};
const trackFresh = PDV.checkTrackRecordFreshness(trackRecord, now);
check(trackFresh.status === 'VERIFIED', 'recent track record with a recent window passes');
check(trackFresh.computedAgeHours === 0.6, 'track-record computation age is calculated from freshness.computedAt');

const staleTrackRecord = {
  ...trackRecord,
  generatedAt: '2026-10-27T00:30:00.000Z',
  freshness: { computedAt: '2026-10-27T00:30:00.000Z', stale: false },
  window: { from: '2026-07-27', to: '2026-08-05' },
};
const staleRecordCheck = PDV.checkTrackRecordFreshness(staleTrackRecord, now);
check(staleRecordCheck.status === 'FAILED', 'a recently republished record with an old measurement window fails even if stale=false');
check(/fenêtre/.test(staleRecordCheck.detail), 'stale measurement window is the reported failure reason');
check(PDV.checkTrackRecordFreshness({ ...trackRecord, freshness: { ...trackRecord.freshness, stale: true } }, now).status === 'FAILED', 'explicit stale marker fails closed');
check(PDV.checkTrackRecordFreshness(null, now).status === 'FAILED', 'missing track record fails closed');
check(PDV.checkTrackRecordFreshness({ ...trackRecord, window: { from: '2026-10-27', to: '2026-10-25' } }, now).status === 'FAILED', 'inverted measurement window fails closed');
check(PDV.checkTrackRecordFreshness({ ...trackRecord, freshness: { computedAt: '2026-10-27T00:40:00.000Z', stale: false } }, now).status === 'FAILED', 'future computation beyond five-minute skew fails closed');
check(PDV.checkTrackRecordFreshness({ ...trackRecord, window: { from: '2026-10-01', to: '2026-10-23' } }, now).status === 'FAILED', 'measurement window older than two days fails closed');
check(source.includes("set('track_record_freshness', recordCheck.status, recordCheck.detail)"), 'post-deploy verifier wires track-record freshness into the gate');
check(source.includes('/api/copernicus/track-record.json?pdv='), 'track-record check uses a cache-busting query');

console.log(`POST_DEPLOY_SATELLITE_FRESHNESS_TESTS PASS (${assertions} assertions)`);

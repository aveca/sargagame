'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MAX_AGE_MINUTES,
  evaluateObservation,
} = require('../../scripts/autopilot/check-predeploy-satellite-freshness.cjs');

let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

const now = Date.parse('2026-10-28T12:00:00.000Z');
check(MAX_AGE_MINUTES === 900, 'operational pre-deploy SLA remains exactly 900 minutes');

const exactBoundary = evaluateObservation('2026-10-27T21:00:00.000Z', now);
check(exactBoundary.ok && exactBoundary.ageMinutes === 900, 'exactly 900 minutes is accepted');

const overBoundary = evaluateObservation('2026-10-27T20:59:00.000Z', now);
check(!overBoundary.ok && overBoundary.ageMinutes === 901, '901 minutes is rejected');

const subMinuteOver = evaluateObservation(new Date(now - (900 * 60_000) - 1).toISOString(), now);
check(!subMinuteOver.ok && subMinuteOver.ageMinutes > 900, 'fractional overrun is rejected without rounding');

check(!evaluateObservation(null, now).ok, 'missing source timestamp fails closed');
check(!evaluateObservation('not-a-date', now).ok, 'invalid source timestamp fails closed');
check(!evaluateObservation(new Date(now + 1).toISOString(), now).ok, 'future source timestamp fails closed');
check(!evaluateObservation('2026-10-27T21:00:00.000Z', Number.NaN).ok, 'invalid check clock fails closed');

const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/cloudflare-production.yml'), 'utf8');
function block(start, end) {
  const a = workflow.indexOf(start);
  const b = workflow.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `workflow section found: ${start} .. ${end}`);
  return workflow.slice(a, b);
}
const build = block('\n  build:', '\n  certification-gate:');
const deploy = block('\n  deploy:', '\n  post-deploy-verify:');
const pages = block('\n  deploy-pages:', '\n  verify-fleet:');

for (const id of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']) {
  check(build.includes(`id: ${id}`), `global build matrix includes region ${id}`);
}
const buildPrep = build.indexOf('Verify prepare-ftp produces a deployable site');
const buildGate = build.indexOf('Pre-deploy satellite freshness gate (all six regions)');
const buildValidate = build.indexOf('Validate prepared HTML CSP and bundle references');
check(buildPrep >= 0 && buildPrep < buildGate && buildGate < buildValidate, 'all six prepared payloads are freshness-gated before deploy jobs can start');
const buildGateBlock = build.slice(buildGate, buildValidate);
check(/if:\\s*github\\.ref == 'refs\\/heads\\/main'/.test(buildGateBlock), 'the global freshness gate runs only on the production main ref; non-production validation runs remain usable');

const workerGate = deploy.indexOf('Recheck satellite freshness immediately before Worker deploy');
const workerDeploy = deploy.indexOf('- name: Deploy Worker');
check(/needs:\s*\[build, certification-gate, scope, mollie-live-gate\]/.test(deploy), 'Worker deployment depends on the all-region build gate');
check(workerGate >= 0 && workerGate < workerDeploy, 'Worker freshness recheck precedes the first Worker deployment command');

const pagesGate = pages.indexOf('Recheck satellite freshness immediately before Pages deploy');
const pagesDeploy = pages.indexOf('- name: Deploy Pages');
check(/needs:\s*\[build, certification-gate, scope, mollie-live-gate\]/.test(pages), 'Pages deployment depends on the all-region build gate');
check(pagesGate >= 0 && pagesGate < pagesDeploy, 'Pages freshness recheck precedes the first Pages deployment command');

const helper = fs.readFileSync(path.resolve(__dirname, '../../scripts/autopilot/check-predeploy-satellite-freshness.cjs'), 'utf8');
check(helper.includes("payload.source !== 'erddap-live'"), 'non-live/reference payloads cannot satisfy the satellite gate');
check(helper.includes("payload.erddapTimestamp"), 'gate reads the actual observation timestamp, not updatedAt');

const sentinel = fs.readFileSync(path.resolve(__dirname, '../../scripts/autopilot/live-production-sentinel.cjs'), 'utf8');
check(sentinel.includes("evaluateObservation, MAX_AGE_MINUTES } = require('./check-predeploy-satellite-freshness.cjs')"), 'live sentinel shares the strict operational freshness contract');
check(sentinel.includes('evaluateObservation(data.erddapTimestamp)'), 'live sentinel evaluates the true observation timestamp');
check(!sentinel.includes('satelliteFreshness(data.erddapTimestamp)'), 'live sentinel no longer treats the 36-hour public stale marker as the 15-hour operational SLA');

console.log(`PREDEPLOY_SATELLITE_FRESHNESS_TESTS PASS (${assertions} assertions)`);

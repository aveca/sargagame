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
check(MAX_AGE_MINUTES === 900, 'operational SLA remains exactly 900 minutes');
const exact = evaluateObservation('2026-10-27T21:00:00.000Z', now);
check(exact.ok && exact.ageMinutes === 900, 'exactly 900 minutes is accepted');
const over = evaluateObservation('2026-10-27T20:59:00.000Z', now);
check(!over.ok && over.ageMinutes === 901, '901 minutes is rejected');
const fractional = evaluateObservation(new Date(now - 900 * 60000 - 1).toISOString(), now);
check(!fractional.ok && fractional.ageMinutes > 900, 'fractional overrun is rejected without rounding');
check(!evaluateObservation(null, now).ok, 'missing timestamp fails closed');
check(!evaluateObservation('not-a-date', now).ok, 'invalid timestamp fails closed');
check(!evaluateObservation(new Date(now + 1).toISOString(), now).ok, 'future timestamp fails closed');
check(!evaluateObservation('2026-10-27T21:00:00.000Z', Number.NaN).ok, 'invalid control clock fails closed');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const verify = read('scripts/verify-ftp-ready.cjs');
check(verify.includes('evaluateObservation(data.erddapTimestamp)'), 'publication gate uses the actual source observation timestamp');
check(verify.includes("const requiredRegionDirs = ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']"), 'publication gate requires all six production regional payloads');
check(verify.includes('discoveredRegionDirs'), 'publication gate also validates additional regional payloads already present');
check(verify.includes('if (!fs.existsSync(regPath))'), 'missing regional payload is a publication failure');
const helper = read('scripts/autopilot/check-predeploy-satellite-freshness.cjs');
check(helper.includes("payload.source !== 'erddap-live'"), 'pre-deploy gate rejects unproven source');
check(helper.includes('payload.erddapTimestamp'), 'pre-deploy gate reads erddapTimestamp');

function block(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `workflow section found: ${start} .. ${end}`);
  return source.slice(a, b);
}
const workflow = read('.github/workflows/cloudflare-production.yml');
const build = block(workflow, '\n  build:', '\n  certification-gate:');
const prep = build.indexOf('Verify prepare-ftp produces a deployable site');
const buildGate = build.indexOf('Pre-deploy satellite freshness gate (all six regions)');
const validate = build.indexOf('Validate prepared HTML CSP and bundle references');
check(prep >= 0 && prep < buildGate && buildGate < validate, 'all six prepared region artifacts are gated before build jobs can succeed');
check(build.includes("if: github.ref == 'refs/heads/main'"), 'production gate is restricted to main so PR validation remains possible');
for (const id of ['mq', 'gp', 'florida', 'puntacana', 'rivieramaya', 'tulum']) {
  check(build.includes(`- id: ${id}`), `build matrix includes ${id}`);
}
const deploy = block(workflow, '\n  deploy:', '\n  deploy-pages:');
check(deploy.indexOf('Recheck satellite freshness immediately before Worker deploy') >= 0 &&
      deploy.indexOf('Recheck satellite freshness immediately before Worker deploy') < deploy.indexOf('- name: Deploy Worker'),
      'Worker freshness is rechecked before deploy command');
const pages = block(workflow, '\n  deploy-pages:', '\n  verify-fleet:');
check(pages.indexOf('Recheck satellite freshness immediately before Pages deploy') >= 0 &&
      pages.indexOf('Recheck satellite freshness immediately before Pages deploy') < pages.indexOf('- name: Deploy Pages'),
      'Pages freshness is rechecked before deploy command');

for (const file of ['.github/workflows/daily-copernicus.yml', '.github/workflows/data-refresh.yml']) {
  const text = read(file);
  const step = text.indexOf('- name: Déclenche la chaîne CI + déploiement');
  const condition = text.slice(step, step + 700);
  check(condition.includes("steps.verify.outcome == 'success'"), `${file} dispatch requires integrity/freshness verification`);
  check(condition.includes("steps.erddap.outcome == 'success'"), `${file} dispatch requires successful ERDDAP fetch`);
}

console.log(`PREDEPLOY_SATELLITE_FRESHNESS_TESTS PASS (${assertions} assertions)`);

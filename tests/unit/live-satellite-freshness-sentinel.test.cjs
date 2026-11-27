'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sentinel = require('../../scripts/autopilot/live-production-sentinel.cjs');

const originalFetch = global.fetch;
let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}


const workflowPath = path.resolve(__dirname, '../../.github/workflows/live-production-sentinel.yml');
const workflowSource = fs.readFileSync(workflowPath, 'utf8');
check(workflowSource.includes('wrangler@latest tail'), 'Sentinel still captures bounded Wrangler tail sessions');
check(workflowSource.includes('--status=error'), 'Sentinel keeps the error-only tail filter');
check(!workflowSource.includes('--sampling-rate=1'), 'Sentinel never passes the invalid explicit sampling-rate=1 argument');


(async () => {
  const payload = {
    source: 'erddap-live',
    updatedAt: new Date().toISOString(),
    erddapTimestamp: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString(),
    dataAgeMinutes: 1713,
    stale: false,
  };

  global.fetch = async (url) => ({
    status: 200,
    text: async () => String(url).endsWith('/api/copernicus/sargassum.json')
      ? JSON.stringify(payload)
      : 'ok',
  });

  try {
    const stale = await sentinel.checkDomain('example.test');
    check(stale.publicationAgeMinutes < 15, 'fresh updatedAt is reported as publication age only');
    check(stale.satelliteAgeMinutes >= 36 * 60, 'satellite age is recalculated from erddapTimestamp');
    check(stale.operationalFreshness.status === 'OPERATIONAL_SLA_BREACHED', 'fresh publication cannot hide a satellite observation beyond the 900-minute SLA');
    check(stale.errors.length === 0, 'stale satellite data is not misclassified as an HTTP error');
    check(stale.httpOk === true, 'HTTP and JSON health remain true when the endpoint responds with valid JSON');
    check(stale.ok === false, 'overall domain status is degraded when satellite freshness fails');

    payload.updatedAt = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    payload.erddapTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fresh = await sentinel.checkDomain('example.test');
    check(fresh.publicationAgeMinutes >= 20 * 60, 'old publication time remains visible for diagnosis');
    check(fresh.satelliteAgeMinutes < 12 * 60, 'recent satellite timestamp remains fresh');
    check(fresh.operationalFreshness.status === 'WITHIN_SLA', 'fresh observation is explicitly within the operational SLA');
    check(fresh.errors.length === 0 && fresh.httpOk === true, 'old updatedAt alone does not make HTTP health fail');
    check(fresh.ok === true, 'old publication time does not block a genuinely fresh satellite observation');

    global.fetch = async (url) => ({
      status: 200,
      text: async () => String(url).endsWith('/api/copernicus/sargassum.json') ? '{"source":' : 'ok',
    });
    const malformed = await sentinel.checkDomain('example.test', 900);
    check(malformed.ok === false, 'HTTP 200 with malformed JSON fails closed');
    check(malformed.errors.some(error => error.startsWith('sargassum.json JSON invalide')), 'malformed JSON has an explicit error');

    const tailDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-sentinel-tail-'));
    try {
      fs.writeFileSync(path.join(tailDir, 'tail-status.txt'),
        sentinel.EXPECTED_TAIL_WORKERS.map(worker => worker + '=1').join('\n') + '\n');
      fs.writeFileSync(path.join(tailDir, 'tail-errors.txt'),
        sentinel.EXPECTED_TAIL_WORKERS.map(worker => 'TAIL_COMMAND_ERROR=' + worker + ' exit=1').join('\n') + '\n');
      for (const worker of sentinel.EXPECTED_TAIL_WORKERS) {
        fs.writeFileSync(path.join(tailDir, worker + '.jsonl'), 'wrangler tail failed: unauthorized\n');
      }

      const failedTail = sentinel.parseTailDir(tailDir);
      check(failedTail.commandErrors.length === 6, 'non-zero Wrangler tail exits are recorded for all six workers');
      check(failedTail.missing.length === 0, 'failed commands are distinct from missing evidence files');
      const report = sentinel.buildReport({
        domains: [{ domain: 'example.test', ok: true, errors: [], ts: '2026-10-28T00:00:00.000Z' }],
        ciFailures: { ok: true, failures: [] },
        tail: failedTail,
        localErrors: [],
        at: '2026-10-28T00:00:00.000Z',
      });
      check(report.sensor.ok === false, 'failed Wrangler commands cannot produce a healthy sensor');
      check(report.sensor.status === 'NOT_PROVEN', 'failed sensor capture is explicitly NOT_PROVEN');
      check(report.ok === true, 'sensor permission/CLI failure does not fabricate a live incident');
      check(report.incidents.length === 0, 'sensor failure is not misclassified as a Worker exception');

      fs.writeFileSync(path.join(tailDir, 'tail-status.txt'),
        sentinel.EXPECTED_TAIL_WORKERS.map(worker => worker + '=124').join('\n') + '\n');
      fs.writeFileSync(path.join(tailDir, 'tail-errors.txt'), '');
      for (const worker of sentinel.EXPECTED_TAIL_WORKERS) {
        fs.writeFileSync(path.join(tailDir, worker + '.jsonl'), '');
      }
      const boundedTail = sentinel.parseTailDir(tailDir);
      check(boundedTail.commandErrors.length === 0, 'expected bounded timeout exit 124 is not treated as command failure');
      check(boundedTail.missing.length === 0, 'empty bounded no-event captures remain valid when status proves completion');
      check(sentinel.buildReport({
        domains: [{ domain: 'example.test', ok: true, errors: [], ts: '2026-10-28T00:00:00.000Z' }],
        ciFailures: { ok: true, failures: [] },
        tail: boundedTail,
        localErrors: [],
        at: '2026-10-28T00:00:00.000Z',
      }).sensor.ok === true, 'bounded successful tail window can prove the sensor');

      fs.writeFileSync(path.join(tailDir, 'tail-status.txt'),
        sentinel.EXPECTED_TAIL_WORKERS.slice(1).map(worker => worker + '=124').join('\n') + '\n');
      const missingStatus = sentinel.parseTailDir(tailDir);
      check(missingStatus.missing.includes('status:' + sentinel.EXPECTED_TAIL_WORKERS[0]),
        'missing per-worker exit status leaves sensor NOT_PROVEN');
    } finally {
      fs.rmSync(tailDir, { recursive: true, force: true });
    }

    console.log(`LIVE_SATELLITE_FRESHNESS_SENTINEL_TESTS PASS (${assertions} assertions)`);
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

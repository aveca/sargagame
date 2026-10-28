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
    const stale = await sentinel.checkDomain('example.test', 15);
    check(stale.ageMinutes < 15, 'pipeline updatedAt is fresh');
    check(stale.satelliteAgeMinutes >= 36 * 60, 'satellite age is recalculated from erddapTimestamp');
    check(stale.errors.some(error => error.startsWith('observation satellite hors SLA')), 'fresh pipeline cannot hide an observation outside the 900-minute operational SLA');
    check(stale.ok === false, 'stale satellite makes the domain health check fail');

    payload.erddapTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fresh = await sentinel.checkDomain('example.test', 15);
    check(fresh.satelliteAgeMinutes < 12 * 60, 'recent satellite timestamp remains fresh');
    check(fresh.ok === true, 'fresh pipeline and fresh satellite produce a healthy result');

    global.fetch = async (url) => ({
      status: 200,
      text: async () => String(url).endsWith('/api/copernicus/sargassum.json') ? '{"source":' : 'ok',
    });
    const malformed = await sentinel.checkDomain('example.test', 900);
    check(malformed.ok === false, 'HTTP 200 with malformed JSON cannot pass live health');
    check(malformed.errors.some(error => error.startsWith('sargassum.json JSON invalide')),
      'malformed JSON is reported as an explicit health-check failure');

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

'use strict';

const assert = require('node:assert/strict');
const { fetchJsonWithTimeout } = require('../../scripts/lib/fetch-json.cjs');
const { inspectErddapGridResponse } = require('../../scripts/lib/erddap-grid-freshness.cjs');

async function main() {
  const now = Date.parse('2026-11-04T04:15:00.000Z');
  const observedAt = '2026-11-04T04:00:00.000Z';
  const response = (timestamp = observedAt, rows = [[timestamp, 14.5, -61, 0.002]]) => ({
    table: { columnNames: ['time', 'latitude', 'longitude', 'AFAI'], rows },
  });

  const timeout = await fetchJsonWithTimeout('https://noaa.invalid/timeout', 1, (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true })));
  assert.deepEqual({ ok: timeout.ok, kind: timeout.kind, reason: timeout.reason }, { ok: false, kind: 'FETCH_FAILED', reason: 'timeout' });

  const network = await fetchJsonWithTimeout('https://noaa.invalid/network', 100, async () => { throw new Error('offline'); });
  assert.equal(network.kind, 'FETCH_FAILED');
  assert.equal(network.reason, 'network-error');

  const invalidJson = await fetchJsonWithTimeout('https://noaa.invalid/json', 100, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } }));
  assert.equal(invalidJson.kind, 'VALIDATION_FAILED');
  assert.equal(invalidJson.reason, 'invalid-json');

  const emptyRows = inspectErddapGridResponse(response(observedAt, []), now);
  assert.deepEqual({ ok: emptyRows.ok, reason: emptyRows.reason }, { ok: false, reason: 'empty-rows' });
  assert.equal(inspectErddapGridResponse({ table: { columnNames: [], rows: [] } }, now).reason, 'empty-rows');
  assert.equal(inspectErddapGridResponse(response('not-a-date'), now).reason, 'invalid-timestamp');
  assert.equal(inspectErddapGridResponse(response('2026-11-04T04:16:00.000Z'), now).reason, 'future-timestamp');
  assert.equal(inspectErddapGridResponse(response(observedAt, [[observedAt, 'bad-latitude', -61, 0.002]]), now).reason, 'invalid-grid-value');

  const repeatedObservation = inspectErddapGridResponse(response(observedAt, [
    [observedAt, 14.5, -61, 0.002],
    [observedAt, 14.6, -61.1, null],
  ]), now);
  assert.equal(repeatedObservation.ok, true);
  assert.equal(repeatedObservation.erddapTimestamp, observedAt, 'repeated timestamps stay the exact NOAA observation time');
  assert.equal(inspectErddapGridResponse(response(observedAt, [
    [observedAt, 14.5, -61, 0.002],
    ['2026-11-03T12:00:00.000Z', 14.6, -61.1, null],
  ]), now).reason, 'mixed-observation-timestamps');

  console.log('ERDDAP_FETCH_CLASSIFICATION PASS (timeout, network, empty/invalid/future/mixed/repeated observations)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

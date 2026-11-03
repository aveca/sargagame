#!/usr/bin/env node
'use strict';
// Runtime metadata refresh for the public Copernicus asset.
// Scientific payload fields and erddapTimestamp must remain unchanged.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');

async function run() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const originalNow = Date.now;
  const fixedNow = Date.parse('2026-11-03T21:42:00.000Z');
  Date.now = () => fixedNow;

  const makePayload = (overrides = {}) => ({
    source: 'erddap-live',
    updatedAt: '2026-11-03T00:50:42.903Z',
    erddapTimestamp: '2026-10-27T12:00:00.000Z',
    dataAgeMinutes: 1772,
    stale: false,
    levels: [{ id: 'mq016', status: 'clean', score: 67, afai: 0.2 }],
    weekly: { mq016: [{ day: 'Mon', status: 'clean' }] },
    scores: { mq016: { score: 67, breakdown: { wind: 1 } } },
    ...overrides
  });

  async function request(payload, status = 200) {
    let calls = 0;
    const response = await worker.fetch(
      new Request('https://sargazotulum.com/api/copernicus/sargassum.json'),
      { ASSETS: { fetch: async () => {
        calls++;
        return new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' }
        });
      } } }
    );
    return { response, calls };
  }

  try {
    const old = makePayload();
    const oldScientific = structuredClone(old);
    delete oldScientific.dataAgeMinutes;
    delete oldScientific.stale;
    const stale = await request(old);
    assert.equal(stale.calls, 1, 'Copernicus asset is fetched exactly once');
    assert.equal(stale.response.status, 200);
    assert.equal(stale.response.headers.get('cache-control'), 'no-store');
    const staleBody = await stale.response.json();
    assert.equal(staleBody.dataAgeMinutes, 10662);
    assert.equal(staleBody.stale, true);
    assert.equal(staleBody.updatedAt, old.updatedAt, 'publication timestamp is preserved');
    assert.equal(staleBody.erddapTimestamp, old.erddapTimestamp, 'scientific timestamp is immutable');
    const staleScientific = structuredClone(staleBody);
    delete staleScientific.dataAgeMinutes;
    delete staleScientific.stale;
    assert.deepEqual(staleScientific, oldScientific, 'all scientific fields remain unchanged');

    const fresh = makePayload({ erddapTimestamp: new Date(fixedNow - 5 * 60_000).toISOString() });
    const freshResult = await request(fresh);
    const freshBody = await freshResult.response.json();
    assert.equal(freshBody.dataAgeMinutes, 5);
    assert.equal(freshBody.stale, false);

    const invalidResult = await request(makePayload({ erddapTimestamp: 'not-a-date' }));
    const invalidBody = await invalidResult.response.json();
    assert.equal(invalidBody.dataAgeMinutes, null);
    assert.equal(invalidBody.stale, true);

    const futureResult = await request(makePayload({ erddapTimestamp: new Date(fixedNow + 60_000).toISOString() }));
    const futureBody = await futureResult.response.json();
    assert.equal(futureBody.dataAgeMinutes, null);
    assert.equal(futureBody.stale, true);

    const fallbackResult = await request(makePayload({ source: 'fallback', stale: false, dataAgeMinutes: 1 }));
    const fallbackBody = await fallbackResult.response.json();
    assert.equal(fallbackBody.dataAgeMinutes, null);
    assert.equal(fallbackBody.stale, true);

    const missing = await request(makePayload(), 404);
    assert.equal(missing.response.status, 404);

    assert.match(TPL, /"run_worker_first"\s*:\s*\[\s*"\/api\/copernicus\/sargassum\.json"\s*\]/);
    assert.doesNotMatch(TPL, /"run_worker_first"\s*:\s*true/);

    console.log('WORKER_COPERNICUS_FRESHNESS_TESTS PASS (6 scenarios)');
  } finally {
    Date.now = originalNow;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

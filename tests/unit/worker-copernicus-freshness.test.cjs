#!/usr/bin/env node
'use strict';

// Recalculate public Copernicus freshness metadata at request time.
// Only dataAgeMinutes/stale may change; scientific fields and timestamps stay immutable.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, 'wrangler.template.jsonc'), 'utf8');
const FIXED_NOW = Date.parse('2026-11-13T09:41:00.000Z');
const OBSERVATION = '2026-11-09T12:00:00.000Z';
const HOSTS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassummiami.com',
  'sargassumpuntacana.com',
  'sargassumcancun.com',
  'sargazotulum.com',
];

function makePayload(overrides = {}) {
  return {
    source: 'erddap-live',
    updatedAt: '2026-11-10T01:24:45.651Z',
    erddapTimestamp: OBSERVATION,
    dataAgeMinutes: 826,
    stale: false,
    levels: [{ id: 'pc001', status: 'clean', score: 71, confidence: 5 }],
    weekly: { pc001: { forecast: [{ date: '2026-11-10', status: 'clean' }] } },
    weather: { puntacana: { wind_speed: 8 } },
    ...overrides,
  };
}

async function fetchThroughWorker(worker, host, body, status = 200) {
  let calls = 0;
  const origin = 'https://' + host;
  const response = await worker.fetch(
    new Request(origin + '/api/copernicus/sargassum.json', {
      method: 'GET',
      headers: { Origin: origin },
    }),
    {
      ASSETS: {
        fetch: async () => {
          calls++;
          return new Response(body, {
            status,
            headers: {
              'content-type': 'application/json',
              'cache-control': 'public, max-age=3600',
            },
          });
        },
      },
    },
  );
  return { response, calls, origin };
}

async function run() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const originalNow = Date.now;
  Date.now = () => FIXED_NOW;
  let checks = 0;
  const check = (name, condition) => {
    assert.ok(condition, name);
    checks++;
  };

  try {
    const source = makePayload();
    const expectedAge = Math.round((FIXED_NOW - Date.parse(OBSERVATION)) / 60_000);
    check('fixture is older than the 36h public threshold', expectedAge > 36 * 60);

    for (const host of HOSTS) {
      const { response, calls, origin } = await fetchThroughWorker(worker, host, JSON.stringify(source));
      check(host + ': one asset read', calls === 1);
      check(host + ': HTTP 200', response.status === 200);
      check(host + ': no-store response', response.headers.get('cache-control') === 'no-store');
      check(host + ': CORS origin preserved', response.headers.get('access-control-allow-origin') === origin);
      check(host + ': GET allowed by CORS', /GET/.test(response.headers.get('access-control-allow-methods') || ''));
      const body = await response.json();
      check(host + ': observation age recalculated', body.dataAgeMinutes === expectedAge);
      check(host + ': stale flag recalculated', body.stale === true);
      check(host + ': scientific payload preserved', JSON.stringify({
        source: body.source,
        updatedAt: body.updatedAt,
        erddapTimestamp: body.erddapTimestamp,
        levels: body.levels,
        weekly: body.weekly,
        weather: body.weather,
      }) === JSON.stringify({
        source: source.source,
        updatedAt: source.updatedAt,
        erddapTimestamp: source.erddapTimestamp,
        levels: source.levels,
        weekly: source.weekly,
        weather: source.weather,
      }));
    }

    const freshPayload = makePayload({
      erddapTimestamp: new Date(FIXED_NOW - 5 * 60_000).toISOString(),
      dataAgeMinutes: 999999,
      stale: true,
    });
    const freshResult = await fetchThroughWorker(worker, HOSTS[3], JSON.stringify(freshPayload));
    const freshBody = await freshResult.response.json();
    check('fresh observation overrides stale publication metadata', freshBody.dataAgeMinutes === 5 && freshBody.stale === false);

    const invalidResult = await fetchThroughWorker(worker, HOSTS[3], JSON.stringify(makePayload({ erddapTimestamp: 'not-a-date' })));
    const invalidBody = await invalidResult.response.json();
    check('invalid timestamp fails closed', invalidBody.dataAgeMinutes === null && invalidBody.stale === true);

    const futureResult = await fetchThroughWorker(worker, HOSTS[3], JSON.stringify(makePayload({
      erddapTimestamp: new Date(FIXED_NOW + 60_000).toISOString(),
    })));
    const futureBody = await futureResult.response.json();
    check('future timestamp fails closed', futureBody.dataAgeMinutes === null && futureBody.stale === true);

    const fallbackResult = await fetchThroughWorker(worker, HOSTS[3], JSON.stringify(makePayload({ source: 'fallback' })));
    const fallbackBody = await fallbackResult.response.json();
    check('non-live source fails closed', fallbackBody.dataAgeMinutes === null && fallbackBody.stale === true);

    const missingResult = await fetchThroughWorker(worker, HOSTS[3], 'missing', 404);
    check('missing asset status is preserved', missingResult.response.status === 404);

    const malformedResult = await fetchThroughWorker(worker, HOSTS[3], 'not-json');
    check('malformed asset fails closed with 502', malformedResult.response.status === 502);
    check('selective Worker-first path is configured', /"run_worker_first"\s*:\s*\[\s*"\/api\/copernicus\/sargassum\.json"\s*\]/.test(TPL));
    check('global Worker-first is not enabled', !/"run_worker_first"\s*:\s*true/.test(TPL));

    console.log('WORKER_COPERNICUS_FRESHNESS_TESTS PASS (' + checks + ' assertions; 6 regional hosts)');
  } finally {
    Date.now = originalNow;
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
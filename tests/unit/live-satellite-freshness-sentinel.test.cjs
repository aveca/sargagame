'use strict';

const assert = require('node:assert/strict');
const sentinel = require('../../scripts/autopilot/live-production-sentinel.cjs');

const originalFetch = global.fetch;
let assertions = 0;
function check(condition, message) {
  assertions++;
  assert.ok(condition, message);
}

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
    check(stale.errors.some(error => error.startsWith('composite satellite périmé')), 'fresh pipeline cannot hide stale satellite data');
    check(stale.ok === false, 'stale satellite makes the domain health check fail');

    payload.erddapTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fresh = await sentinel.checkDomain('example.test', 15);
    check(fresh.satelliteAgeMinutes < 12 * 60, 'recent satellite timestamp remains fresh');
    check(fresh.ok === true, 'fresh pipeline and fresh satellite produce a healthy result');

    console.log(`LIVE_SATELLITE_FRESHNESS_SENTINEL_TESTS PASS (${assertions} assertions)`);
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

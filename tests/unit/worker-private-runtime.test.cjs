#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

async function run() {
  const { default: worker } = await import('../../workers/sargagame/index.js');
  const hosts = [
    'sargasses-martinique.com',
    'sargasses-guadeloupe.com',
    'sargassummiami.com',
    'sargassumpuntacana.com',
    'sargassumcancun.com',
    'sargazotulum.com',
  ];
  const paths = [
    '/api/copernicus/_private/forecast-full.json',
    '/api/copernicus/mq/_private/forecast-full.json',
    '/api/copernicus/tulum/_private/forecast-full.json',
  ];
  for (const host of hosts) {
    for (const path of paths) {
      let assetCalls = 0;
      const response = await worker.fetch(
        new Request('https://' + host + path),
        { ASSETS: { fetch: async () => { assetCalls += 1; return new Response('private leak'); } } },
      );
      assert.equal(response.status, 404, host + path + ' must be denied');
      assert.equal(assetCalls, 0, host + path + ' must be rejected before ASSETS');
      assert.deepEqual(await response.json(), { error: 'not_found' });
    }
  }
  console.log('WORKER_PRIVATE_RUNTIME PASS (6 domains × 3 private paths)');
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

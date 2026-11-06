'use strict';
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js');

async function main() {
  const { resolveB2BWidgetRegion } = await import(pathToFileURL(WORKER_PATH).href);
  const cases = [
    ['MQ', 'sargasses-martinique.com', 'fr'],
    ['Guadeloupe', 'sargasses-guadeloupe.com', 'fr'],
    ['Florida', 'sargassummiami.com', 'en'],
    ['Punta Cana', 'sargassumpuntacana.com', 'en'],
    ['Riviera Maya', 'sargassumcancun.com', 'en'],
    ['Tulum', 'sargazotulum.com', 'en']
  ];

  for (const [region, domain, lang] of cases) {
    const resolved = resolveB2BWidgetRegion(region);
    assert.ok(resolved, `known region resolves: ${region}`);
    assert.equal(resolved.domain, domain, `correct regional domain: ${region}`);
    assert.equal(resolved.lang, lang, `correct widget language: ${region}`);
  }

  assert.equal(resolveB2BWidgetRegion('unknown-region'), null,
    'unknown region fails closed instead of falling back to Martinique');
  assert.equal(resolveB2BWidgetRegion(''), null,
    'empty region fails closed');

  console.log('PASS b2b-widget-region-routing: 14 assertions');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

'use strict';

const assert = require('node:assert/strict');

(async () => {
  const { formatFreshnessAge } = await import('../../src/lib/format-freshness.mjs');
  const now = Date.parse('2026-10-12T12:00:00.000Z');

  assert.equal(formatFreshnessAge('2026-10-12T11:59:50.000Z', 'fr', now), 'à l’instant');
  assert.equal(formatFreshnessAge('2026-10-12T11:50:00.000Z', 'fr', now), 'il y a 10 min');
  assert.equal(formatFreshnessAge('2026-10-12T09:00:00.000Z', 'fr', now), 'il y a 3 h');
  assert.equal(formatFreshnessAge('2026-10-10T12:00:00.000Z', 'fr', now), 'il y a 2 j');
  assert.equal(formatFreshnessAge('2026-10-10T12:00:00.000Z', 'en', now), '2 days ago');
  assert.equal(formatFreshnessAge('2026-10-12T09:00:00.000Z', 'es', now), 'hace 3 h');
  assert.equal(formatFreshnessAge('2026-10-10T12:00:00.000Z', 'es', now), 'hace 2 días');
  assert.equal(formatFreshnessAge('not-a-date', 'fr', now), 'âge inconnu');
  assert.equal(formatFreshnessAge(null, 'en', now), 'age unknown');
  assert.equal(formatFreshnessAge('2026-10-12T12:01:00.000Z', 'es', now), 'hora por verificar');
  assert.equal(formatFreshnessAge('2026-10-12T11:59:50.000Z', 'unsupported', now), 'à l’instant');

  console.log('MAP_FRESHNESS_FORMAT_TESTS PASS (11 assertions)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

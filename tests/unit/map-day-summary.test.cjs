'use strict';

const assert = require('node:assert/strict');

(async () => {
  const { summarizeBeachStatuses } = await import('../../src/lib/map-day-summary.mjs');
  const beaches = [
    { id: 'clean-1', days: ['clean', 'moderate'] },
    { id: 'clean-2', days: ['clean', 'avoid'] },
    { id: 'moderate', days: ['moderate', 'clean'] },
    { id: 'avoid', days: ['avoid', 'avoid'] },
    { id: 'unknown', days: [null, 'clean'] },
    { id: 'missing' }
  ];

  assert.deepEqual(summarizeBeachStatuses(beaches, 0), {
    clean: 2, moderate: 1, avoid: 1, unknown: 2, total: 6
  });
  assert.deepEqual(summarizeBeachStatuses(beaches, 1), {
    clean: 3, moderate: 1, avoid: 2, unknown: 1, total: 6
  });
  assert.deepEqual(summarizeBeachStatuses([], 0), {
    clean: 0, moderate: 0, avoid: 0, unknown: 0, total: 0
  });
  assert.deepEqual(summarizeBeachStatuses(null, 0), {
    clean: 0, moderate: 0, avoid: 0, unknown: 0, total: 0
  });
  assert.equal(summarizeBeachStatuses([{ days: ['unknown'] }], 0).clean, 0);
  assert.equal(summarizeBeachStatuses([{ days: ['unknown'] }], 0).avoid, 0);
  assert.equal(summarizeBeachStatuses([{ days: ['clean'] }], 2).unknown, 1);

  console.log('MAP_DAY_STATUS_SUMMARY_TESTS PASS (7 assertions)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

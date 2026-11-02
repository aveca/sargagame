'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { assertRequiredEditProducedDiff } = require('./edit-required-guard.cjs');

assert.throws(
  () => assertRequiredEditProducedDiff(['src/example.cjs'], { files: [] }, 'qwen-test'),
  {
    message: /Agent produced no modification: exit 0 but empty git diff.*src\/example\.cjs.*qwen-test/,
  },
  'required edit + empty diff must fail'
);

assert.deepEqual(
  assertRequiredEditProducedDiff(['src/example.cjs'], { files: ['src/example.cjs'] }, 'qwen-test'),
  { editRequired: true, changedFileCount: 1 },
  'required edit + real diff must be accepted'
);

assert.deepEqual(
  assertRequiredEditProducedDiff([], { files: [] }, 'read-only-test'),
  { editRequired: false, changedFileCount: 0 },
  'read-only task + empty diff must remain valid'
);

assert.throws(
  () => assertRequiredEditProducedDiff(['src/example.cjs'], {}, 'missing-diff-test'),
  /Agent produced no modification/,
  'missing/invalid diff must fail closed when an edit is required'
);

execFileSync(process.execPath, ['--check', path.resolve(__dirname, '..', 'local-agent-executor.cjs')], { stdio: 'pipe' });
console.log('local-agent-executor syntax: PASS');
console.log('edit-required-guard: 4/4 assertions passed');

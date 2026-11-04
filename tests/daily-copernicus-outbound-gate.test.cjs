'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'daily-copernicus.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const start = workflow.indexOf('  email-automation:\n');
assert.notEqual(start, -1, 'email-automation job exists');
const tail = workflow.slice(start);
const nextJob = tail.slice(1).search(/^  [a-zA-Z0-9_-]+:\s*$/m);
const job = nextJob < 0 ? tail : tail.slice(0, nextJob + 1);

assert.match(job, /needs:\s*\[fetch-data\]/, 'outbound job depends on fetch-data');
assert.match(job, /needs\.fetch-data\.result == 'success'/, 'fetch job must succeed');
assert.match(job, /needs\.fetch-data\.outputs\.gate_outcome == 'success'/, 'integrity gate must pass');
assert.match(job, /publication_status == 'FRESH_AND_PUBLISHED'/, 'fresh publication is allowed');
assert.match(job, /publication_status == 'NO_NEW_OBSERVATION'/, 'no-new-observation is allowed only after gate pass');
assert.match(job, /purge-analytics\.cjs --dry/, 'scheduled purge is explicitly dry-run');
assert.doesNotMatch(job, /purge-analytics\.cjs --execute/, 'scheduled workflow never authorizes deletion');

console.log('DAILY_COPERNICUS_OUTBOUND_GATE_TESTS PASS');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8');
const jobStart = workflow.indexOf('  email-automation:\n');
const jobEnd = workflow.indexOf('\n  health-check:', jobStart);

assert.ok(jobStart >= 0 && jobEnd > jobStart, 'email-automation job must exist');
const job = workflow.slice(jobStart, jobEnd);

assert.ok(job.includes('needs: [fetch-data]'),
  'outbound automation must depend on fetch-data');
assert.ok(job.includes("needs.fetch-data.result == 'success'"),
  'outbound automation must require a successful fetch job');
assert.ok(job.includes("needs.fetch-data.outputs.gate_outcome == 'success'"),
  'outbound automation must require the actual integrity gate to pass');
assert.ok(job.includes("needs.fetch-data.outputs.publication_status == 'FRESH_AND_PUBLISHED'"),
  'outbound automation must allow a freshly published source');
assert.ok(job.includes("needs.fetch-data.outputs.publication_status == 'NO_NEW_OBSERVATION'"),
  'outbound automation may reuse a successfully fetched observation that remains inside the operational SLA');
assert.ok(workflow.includes('gate_outcome: ${{ steps.verify.outcome }}'),
  'the fetch job must expose the actual integrity-gate outcome');
assert.ok(workflow.includes('publication_status: ${{ steps.publication_status.outputs.status }}'),
  'the fetch job must expose the classified publication status');
assert.ok(job.includes('push-winback.cjs --send'),
  'the send-capable push step must remain inside the gated job');
assert.ok(job.includes('revenue-watch.cjs --send'),
  'the send-capable revenue alert step must remain inside the gated job');

console.log('DAILY COPERNICUS OUTBOUND FRESHNESS GATE PASS');

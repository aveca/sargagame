#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8');
const jobMatch = workflow.match(/^  email-automation:\n([\\s\\S]*?)(?=^  (?:health-check|build|notify-failure):)/m);

assert.ok(jobMatch, 'email-automation job must exist');
const job = jobMatch[1];

assert.match(job, /^    needs: \\[fetch-data\\]$/m,
  'outbound automation must depend on fetch-data');
assert.match(job, /^    if: .*needs\\.fetch-data\\.result == 'success'.*needs\\.fetch-data\\.outputs\\.gate_outcome == 'success'.*FRESH_AND_PUBLISHED.*NO_NEW_OBSERVATION/m,
  'outbound automation must require a successful fetch, a successful freshness gate, and an accepted publication status');
assert.match(workflow, /gate_outcome: \\$\\{\\{ steps\\.verify\\.outcome \\}\\}/,
  'the fetch job must expose the actual integrity-gate outcome');
assert.match(workflow, /publication_status: \\$\\{\\{ steps\\.publication_status\\.outputs\\.status \\}\\}/,
  'the fetch job must expose the classified publication status');
assert.match(job, /push-winback\\.cjs --send/,
  'the send-capable push step must remain inside the gated job');
assert.match(job, /revenue-watch\\.cjs --send/,
  'the send-capable revenue alert step must remain inside the gated job');

console.log('DAILY COPERNICUS OUTBOUND FRESHNESS GATE PASS');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const daily = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8').replace(/\r\n/g, '\n');
const refresh = fs.readFileSync(path.join(root, '.github/workflows/data-refresh.yml'), 'utf8').replace(/\r\n/g, '\n');

for (const [name, text] of [['daily-copernicus.yml', daily], ['data-refresh.yml', refresh]]) {
  assert.ok(text.includes('id: verify') && text.includes('gate_status=BLOCKED_STALE_SOURCE'), name + ': stale gate classification missing');
  assert.ok(text.includes('id: publication_status') && text.includes('if: always()'), name + ': final status step must always run');
  assert.ok(text.includes('publication_status: ${{ steps.publication_status.outputs.status }}'), name + ': status output missing');
  assert.ok(text.includes('operationalSlaMinutes: 900'), name + ': operational SLA missing from evidence');
  assert.ok(text.includes('publicStaleThresholdMinutes: 2160'), name + ': public stale threshold missing from evidence');
  assert.ok(text.includes("payloadFieldComparison: 'NOT_PERFORMED_BY_WORKFLOW_STATUS_PATCH'"), name + ': must not claim a field-level comparison');
  assert.ok(text.includes('name: Upload publication status evidence') && text.includes('actions/upload-artifact@v4'), name + ': status artifact missing');
  assert.ok(text.includes('process.exit(1)'), name + ': blocked/failed status must fail the job');
  assert.ok(text.includes('id: dispatch') && text.includes("steps.verify.outcome == 'success'"), name + ': deploy dispatch must remain gated');
  assert.ok(text.includes('continue-on-error: true') && text.includes('gate_status=BLOCKED_STALE_SOURCE'), name + ': gate must remain observable while marker handling runs');
}

assert.ok(daily.includes("needs.fetch-data.outputs.publication_status != 'BLOCKED_STALE_SOURCE'") && daily.includes("needs.fetch-data.outputs.publication_status != 'FAILED_VALIDATION'") && daily.includes("needs.fetch-data.outputs.publication_status != 'FAILED_PUBLISH'"), 'classified data-pipeline failures must not trigger new failure emails');
assert.ok(daily.includes("needs.fetch-data.outputs.publication_status != 'FAILED_PUBLISH' && github.run_attempt == '1'"), 'classified data-pipeline failures must not cause an automatic retry/dispatch');

console.log('COPERNICUS_WORKFLOW_STATUS_CONTRACT PASS');

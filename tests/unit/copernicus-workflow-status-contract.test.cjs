#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
  assert.ok(text.includes('name: Upload publication status evidence') && /uses: actions\/upload-artifact@[a-f0-9]{40} # v7\.0\.2/.test(text), name + ': status artifact missing');
  assert.ok(text.includes('process.exit(1)'), name + ': blocked/failed status must fail the job');
  assert.ok(text.includes('id: dispatch') && text.includes("steps.verify.outcome == 'success'"), name + ': deploy dispatch must remain gated');
  assert.ok(text.includes('continue-on-error: true') && text.includes('gate_status=BLOCKED_STALE_SOURCE'), name + ': gate must remain observable while marker handling runs');
  assert.ok(text.includes('echo "changed=false" >> "$GITHUB_OUTPUT"') && text.includes('echo "changed=true" >> "$GITHUB_OUTPUT"'), name + ': publication step must expose whether a commit was created');
  assert.ok(text.includes('PUBLISH_CHANGED: ${{ steps.publish.outputs.changed }}'), name + ': publication-change output must reach status classifier');
  assert.ok(text.includes('classifyPublicationStatus') && text.includes("publishChanged"), name + ': publication status must use the tested classifier');
  assert.ok(text.includes('Snapshot last published satellite timestamp') && text.includes('PREVIOUS_SOURCE_TIMESTAMP'), name + ': repeated observations must be compared to the published source timestamp');
  assert.ok(text.includes('ERDDAP_FAILURE_KIND') && text.includes('steps.erddap.outputs.failure_kind'), name + ': ERDDAP fetch/validation failure kind must reach the status report');
}

assert.ok(daily.includes("needs.fetch-data.result == 'skipped' || needs.fetch-data.outputs.publication_status == 'PUBLISHED' || needs.fetch-data.outputs.publication_status == 'NO_NEW_OBSERVATION'"), 'failure emails are limited to unrelated failures after an unclassified/successful data job or a push-only build');
assert.ok(daily.includes("needs.fetch-data.outputs.publication_status == 'PUBLISHED' || needs.fetch-data.outputs.publication_status == 'NO_NEW_OBSERVATION'") && daily.includes("github.run_attempt == '1'"), 'automatic retry is limited to unrelated failures after a successful/empty data refresh');
assert.ok(daily.includes("['SOURCE_DELAYED', 'FETCH_FAILED', 'VALIDATION_FAILED', 'PUBLISH_FAILED'].includes(status)"), 'delayed/fetch/validation/publish failures must fail the data job');
const classifier = fs.readFileSync(path.join(root, 'scripts/lib/copernicus-publication-status.cjs'), 'utf8');
for (const status of ['SOURCE_DELAYED', 'FETCH_FAILED', 'VALIDATION_FAILED', 'PUBLISHED']) {
  assert.ok(classifier.includes(status), 'required publication reporting status missing: ' + status);
}
assert.ok(fs.readFileSync(path.join(root, 'scripts/autopilot/post-deploy-verify.cjs'), 'utf8').includes("return allSixVerified ? 'DEPLOYED_VERIFIED'"), 'only six-domain post-deploy verification may report DEPLOYED_VERIFIED');
assert.ok(fs.readFileSync(path.join(root, '.github/workflows/cloudflare-production.yml'), 'utf8').includes("STATUS: **'+r.status+'**"), 'post-deploy workflow summary must display the verified deployment status');

const yamlCheck = spawnSync('ruby', [
  '-e',
  'require "yaml"; ARGV.each { |file| YAML.parse_file(file) }',
  path.join(root, '.github/workflows/daily-copernicus.yml'),
  path.join(root, '.github/workflows/data-refresh.yml')
], { encoding: 'utf8' });
if (yamlCheck.error && yamlCheck.error.code === 'ENOENT') {
  console.log('YAML syntax parser unavailable locally; GitHub-hosted CI validation is still required');
} else {
  assert.equal(yamlCheck.status, 0, 'modified workflow YAML must parse: ' + (yamlCheck.stderr || yamlCheck.stdout));
  console.log('WORKFLOW_YAML_SYNTAX PASS (Ruby Psych)');
}

console.log('COPERNICUS_WORKFLOW_STATUS_CONTRACT PASS');

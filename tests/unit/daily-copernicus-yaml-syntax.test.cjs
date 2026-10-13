'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(ROOT, '.github', 'workflows', 'daily-copernicus.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const lines = source.split(/\r?\n/);

function check(condition, label) {
  assert.ok(condition, label);
  console.log('OK  ' + label);
}

// Regression P0 (2026-10-13): "with: fetch-depth: 0" broke workflow parsing.
// Lock the exact nested mapping shape in the health-check checkout.
const healthStart = lines.findIndex(line => /^  health-check:\s*$/.test(line));
check(healthStart >= 0, 'health-check job exists');

const nextJobOffset = lines.findIndex((line, index) =>
  index > healthStart && /^  [a-zA-Z0-9_-]+:\s*$/.test(line)
);
const healthBlock = lines.slice(healthStart, nextJobOffset < 0 ? lines.length : nextJobOffset);
const checkoutOffset = healthBlock.findIndex(line => /^      - uses: actions\/checkout@v4\s*$/.test(line));
check(checkoutOffset >= 0, 'health-check uses actions/checkout@v4');
check(healthBlock[checkoutOffset + 1] === '        with:', 'checkout "with" is a standalone YAML key');
check(healthBlock[checkoutOffset + 2] === '          fetch-depth: 0', 'fetch-depth is nested under with at the correct indentation');
check(!/^[ \t]*with:[ \t]+fetch-depth:[ \t]*0[ \t]*$/m.test(source), 'malformed inline with/fetch-depth regression is absent');

// Preserve the scheduled data-refresh cadence while repairing syntax.
check(/^[ \t]*- cron: ['"]0 0,6,12,18 \* \* \*['"][ \t]*$/m.test(source),
  'four daily Copernicus runs remain scheduled at 00/06/12/18 UTC');
check(/^jobs:\s*$/m.test(source), 'workflow jobs section remains present');

// GitHub-hosted Ubuntu images include Ruby/Psych. Use its standard YAML parser
// for a full syntax check in CI; on machines without Ruby, keep the exact
// structural regression assertions above available without adding a package.
const ruby = spawnSync('ruby', [
  '-e',
  'require "yaml"; YAML.load_file(ARGV.fetch(0)); puts "YAML_PARSE_OK"',
  workflowPath
], { encoding: 'utf8', timeout: 15000 });

if (ruby.error && ruby.error.code === 'ENOENT') {
  console.warn('WARN Ruby YAML parser unavailable; exact regression structure checks passed.');
} else {
  assert.equal(ruby.status, 0, 'daily-copernicus.yml must parse as YAML: ' + (ruby.stderr || ruby.stdout || 'unknown parser error'));
  check(ruby.stdout.includes('YAML_PARSE_OK'), 'full daily-copernicus.yml parses successfully with Ruby/Psych');
}

console.log('DAILY_COPERNICUS_YAML_SYNTAX_REGRESSION PASS');

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const workflowPath = path.join(ROOT, '.github', 'workflows', 'agent-handoff.yml');
const source = fs.readFileSync(workflowPath, 'utf8');
const lines = source.split(/\r?\n/);

function check(condition, label) {
  assert.ok(condition, label);
  console.log('OK  ' + label);
}

// Regression from main 2026-10-13: two step entries were accidentally
// dedented to column 1, making GitHub unable to parse/execute the workflow.
check(/^jobs:\s*$/m.test(source), 'jobs section remains present');
check(lines.filter(line => /^      - name: Pick next task$/.test(line)).length === 1,
  'Pick next task remains a step under its job steps');
check(lines.filter(line => /^      - name: Claim task in tasks\.md$/.test(line)).length === 1,
  'Claim task in tasks.md remains a step under its job steps');
check(!/^- name: (Pick next task|Claim task in tasks\.md)$/m.test(source),
  'the two historically dedented step entries do not regress');
check(/^        id: pick_task$/m.test(source), 'pick_task identifier remains under its step');
check(/^        if: \$\{\{ steps\.pick_task\.outputs\.task_id != '' \}\}$/m.test(source),
  'claim condition still depends on the task selected by pick_task');

// Use the standard Ruby/Psych parser on GitHub-hosted Ubuntu CI; Windows
// workstations without Ruby still run the exact structural regression checks.
const ruby = spawnSync('ruby', [
  '-e',
  'require "yaml"; YAML.load_file(ARGV.fetch(0)); puts "YAML_PARSE_OK"',
  workflowPath
], { encoding: 'utf8', timeout: 15000 });

if (ruby.error && ruby.error.code === 'ENOENT') {
  console.warn('WARN Ruby YAML parser unavailable; exact regression structure checks passed.');
} else {
  assert.equal(ruby.status, 0, 'agent-handoff.yml must parse as YAML: ' + (ruby.stderr || ruby.stdout || 'unknown parser error'));
  check(ruby.stdout.includes('YAML_PARSE_OK'), 'full agent-handoff.yml parses successfully with Ruby/Psych');
}

console.log('AGENT_HANDOFF_YAML_SYNTAX_REGRESSION PASS');

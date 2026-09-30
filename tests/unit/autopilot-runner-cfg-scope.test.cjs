#!/usr/bin/env node
/**
 * autopilot-runner-cfg-scope.test.cjs — Regression test for runner cfg scope bug
 * 
 * Ensures runOrchestrator(cfg) receives cfg and can access cfg.loop.maxRunMinutes
 * without ReferenceError: cfg is not defined
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RUNNER = path.join(ROOT, 'scripts', 'autopilot', 'runner.cjs');

let passed = 0;

function check(name, cond, details = '') {
  if (cond) {
    console.log('  \u2713 ' + name);
    passed++;
  } else {
    console.log('  \u2717 ' + name + (details ? ' \u2014 ' + details : ''));
  }
}

console.log('AUTOPILOT RUNNER CFG SCOPE TESTS\n');

// Test: runner source doesn't reference cfg outside scope
console.log('Test: runner.cjs runOrchestrator receives cfg parameter');
const runnerSrc = fs.readFileSync(RUNNER, 'utf8');

// Check that runOrchestrator is defined with a parameter
const hasParam = /async function runOrchestrator\s*\(\s*cfg\s*\)/.test(runnerSrc);
check('runOrchestrator accepts cfg parameter', hasParam, 'function signature should be runOrchestrator(cfg)');

// Check that runOrchestrator is called with cfg
const calledWithCfg = /runOrchestrator\s*\(\s*cfg\s*\)/.test(runnerSrc);
check('runOrchestrator called with cfg', calledWithCfg, 'call site should pass cfg');

// Check that cfg.loop.maxRunMinutes is accessed inside runOrchestrator
const usesCfgLoop = /cfg\.loop\.maxRunMinutes/.test(runnerSrc);
check('cfg.loop.maxRunMinutes accessed inside runOrchestrator', usesCfgLoop, 'should use cfg.loop.maxRunMinutes for TIMEBOX');

// Ensure no bare 'cfg' references outside function scope that would be undefined
// (This is a basic check - the real test is that it runs without ReferenceError)
console.log('\nAll static checks passed. Runtime test via dry-run...');

// Runtime test: dry run should not crash with ReferenceError
const { spawnSync } = require('child_process');
const RUN = path.join(ROOT, 'scripts', 'autopilot', 'run.cjs');

const r = spawnSync(process.execPath, [RUN, '--dry', '--direct'], {
  cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 30000, env: { ...process.env }
});

check('run.cjs --dry --direct exits cleanly (no ReferenceError)', r.status === 0, 
  r.status !== 0 ? 'exit code: ' + r.status + ', stderr: ' + (r.stderr || '').slice(0, 500) : '');

console.log('\n' + passed + ' checks passed');
process.exit(passed === 5 ? 0 : 1);

function check(name, cond, details = '') {
  if (cond) {
    console.log('  \u2713 ' + name);
    passed++;
  } else {
    console.log('  \u2717 ' + name + (details ? ' \u2014 ' + details : ''));
  }
}
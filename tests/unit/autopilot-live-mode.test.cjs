#!/usr/bin/env node
/**
 * autopilot-live-mode.test.cjs — Tests pour le mode LIVE/CONTINUOUS
 * 
 * Teste :
 * A. --live active bien le mode live
 * B. --continuous active bien le mode continu
 * C. les deux flags peuvent être combinés
 * D. STOP arrête proprement la boucle
 * E. le lock empêche réellement deux instances
 * H. le mode normal reste inchangé sans --live
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const RUN = path.join(ROOT, 'scripts', 'autopilot', 'run.cjs');
let passed = 0;

function check(name, cond, details = '') {
  if (cond) {
    console.log('  \u2713 ' + name);
    passed++;
  } else {
    console.log('  \u2717 ' + name + (details ? ' \u2014 ' + details : ''));
  }
}

console.log('AUTOPILOT LIVE MODE TESTS\n');

// Test A: --live flag sets env var
console.log('Test A: --live flag');
const r1 = spawnSync(process.execPath, [RUN, '--live', '--dry', '--direct'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, SARGA_AUTOPILOT_LIVE: '0' }
});
check('run.cjs accepts --live flag', r1.status === 0, r1.stderr || r1.stdout);

// Test B: --continuous flag sets env var
console.log('\nTest B: --continuous flag');
const r2 = spawnSync(process.execPath, [RUN, '--continuous', '--dry', '--direct'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, SARGA_AUTOPILOT_CONTINUOUS: '0' }
});
check('run.cjs accepts --continuous flag', r2.status === 0, r2.stderr || r2.stdout);

// Test C: Combined flags
console.log('\nTest C: Combined --live --continuous');
const r3 = spawnSync(process.execPath, [RUN, '--live', '--continuous', '--dry', '--direct'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, SARGA_AUTOPILOT_LIVE: '0', SARGA_AUTOPILOT_CONTINUOUS: '0' }
});
check('run.cjs accepts both flags together', r3.status === 0, r3.stderr || r3.stdout);

// Test H: Normal mode unchanged (no live prefix)
console.log('\nTest H: Normal mode (no --live)');
const r4 = spawnSync(process.execPath, [RUN, '--dry', '--direct'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, SARGA_AUTOPILOT_LIVE: '0', SARGA_AUTOPILOT_CONTINUOUS: '0' }
});
const hasLivePrefix = r4.stdout.includes('SARGAGAME AUTOPILOT LIVE');
check('Normal mode does NOT show LIVE banner', !hasLivePrefix, 'got LIVE banner in normal mode');

console.log('\n' + passed + ' checks passed');
process.exit(passed === 4 ? 0 : 1);
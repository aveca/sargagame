#!/usr/bin/env node
/**
 * autopilot-live-mode.test.cjs — Tests pour le mode LIVE/CONTINUOUS
 * 
 * Teste :
 * A. --live active bien la variable d'env SARGA_AUTOPILOT_LIVE
 * B. --continuous active bien la variable d'env SARGA_AUTOPILOT_CONTINUOUS
 * C. les deux flags peuvent être combinés
 * H. le mode normal reste inchangé sans --live
 * 
 * Ce test utilise --check-flags qui ne lance PAS l'orchestrateur,
 * il vérifie seulement que run.cjs définit correctement les variables d'environnement.
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

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

console.log('AUTOPILOT LIVE MODE TESTS (unit only)\n');

// Test A: --live flag sets env var
console.log('Test A: --live flag');
const r1 = spawnSync(process.execPath, [RUN, '--live', '--check-flags'], {
  cwd: ROOT, encoding: 'utf8', timeout: 10000, env: { ...process.env }
});
check('run.cjs sets SARGA_AUTOPILOT_LIVE=1 with --live', r1.status === 0 && r1.stdout.includes('SARGA_AUTOPILOT_LIVE=1'));

// Test B: --continuous flag sets env var
console.log('\nTest B: --continuous flag');
const r2 = spawnSync(process.execPath, [RUN, '--continuous', '--check-flags'], {
  cwd: ROOT, encoding: 'utf8', timeout: 10000, env: { ...process.env }
});
check('run.cjs sets SARGA_AUTOPILOT_CONTINUOUS=1 with --continuous', r2.status === 0 && r2.stdout.includes('SARGA_AUTOPILOT_CONTINUOUS=1'));

// Test C: Combined flags
console.log('\nTest C: Combined --live --continuous');
const r3 = spawnSync(process.execPath, [RUN, '--live', '--continuous', '--check-flags'], {
  cwd: ROOT, encoding: 'utf8', timeout: 10000, env: { ...process.env }
});
check('run.cjs sets both flags when combined', r3.status === 0 && r3.stdout.includes('SARGA_AUTOPILOT_LIVE=1') && r3.stdout.includes('SARGA_AUTOPILOT_CONTINUOUS=1'));

// Test H: Normal mode unchanged (no live prefix)
console.log('\nTest H: Normal mode (no --live)');
const r4 = spawnSync(process.execPath, [RUN, '--check-flags'], {
  cwd: ROOT, encoding: 'utf8', timeout: 10000, env: { ...process.env }
});
const hasLivePrefix = r4.stdout.includes('SARGA_AUTOPILOT_LIVE=1');
check('Normal mode does NOT set LIVE flag', !hasLivePrefix, 'got LIVE flag in normal mode');

console.log('\n' + passed + ' checks passed');
process.exit(passed === 4 ? 0 : 1);
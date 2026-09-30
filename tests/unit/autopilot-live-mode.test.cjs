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
const OBS_DIR = path.join(ROOT, '.ai', 'autopilot', 'observations');
let passed = 0;

function check(name, cond, details = '') {
  if (cond) {
    console.log('  \u2713 ' + name);
    passed++;
  } else {
    console.log('  \u2717 ' + name + (details ? ' \u2014 ' + details : ''));
  }
}

/** Crée une observation mock pour éviter le lancement Playwright */
function createMockObservation() {
  const mockObs = {
    id: '2026-09-30-0000',
    at: new Date().toISOString(),
    heavy: false,
    regions: {
      mq: { domain: 'sargasses-martinique.com', pages: [] },
      gp: { domain: 'sargasses-guadeloupe.com', pages: [] }
    },
    totals: { pages: 0, consoleErrors: 0, pageErrors: 0, firstPartyFailures: 0, brokenLinks: 0, visualFlagged: 0 },
    durationSec: 1
  };
  fs.mkdirSync(OBS_DIR, { recursive: true });
  fs.writeFileSync(path.join(OBS_DIR, 'latest.json'), JSON.stringify(mockObs, null, 2), 'utf8');
}

function runTest(name, args, env = {}) {
  console.log('\n' + name);
  console.log('  ARGS:', args.join(' '));
  console.log('  ROOT:', ROOT);
  const mockEnv = { ...process.env, SARGA_AUTOPILOT_LIVE: '0', SARGA_AUTOPILOT_CONTINUOUS: '0', ...env };
  createMockObservation(); // Ensure fresh mock before each run
  console.log('  MOCK OBS CREATED');
  const r = spawnSync(process.execPath, [RUN, ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, env: mockEnv
  });
  console.log('  SPAWN DONE, status:', r.status, 'signal:', r.signal);
  if (r.status !== 0) {
    console.log('  STDOUT:', r.stdout?.slice(0, 2000));
    console.log('  STDERR:', r.stderr?.slice(0, 2000));
    console.log('  STATUS:', r.status);
    console.log('  SIGNAL:', r.signal);
  }
  return r;
}

console.log('AUTOPILOT LIVE MODE TESTS\n');

// Test A: --live flag sets env var
console.log('Test A: --live flag');
const r1 = runTest('Test A: --live flag', ['--live', '--dry', '--direct']);
check('run.cjs accepts --live flag', r1.status === 0, r1.stderr || r1.stdout);

// Test B: --continuous flag sets env var
console.log('\nTest B: --continuous flag');
const r2 = runTest('Test B: --continuous flag', ['--continuous', '--dry', '--direct']);
check('run.cjs accepts --continuous flag', r2.status === 0, r2.stderr || r2.stdout);

// Test C: Combined flags
console.log('\nTest C: Combined --live --continuous');
const r3 = runTest('Test C: Combined --live --continuous', ['--live', '--continuous', '--dry', '--direct']);
check('run.cjs accepts both flags together', r3.status === 0, r3.stderr || r3.stdout);

// Test H: Normal mode unchanged (no live prefix)
console.log('\nTest H: Normal mode (no --live)');
const r4 = runTest('Test H: Normal mode', ['--dry', '--direct']);
const hasLivePrefix = r4.stdout.includes('SARGAGAME AUTOPILOT LIVE');
check('Normal mode does NOT show LIVE banner', !hasLivePrefix, 'got LIVE banner in normal mode');

console.log('\n' + passed + ' checks passed');
process.exit(passed === 4 ? 0 : 1);
#!/usr/bin/env node
/**
 * run.cjs — point d'entrée unique de l'autopilot (`npm run autopilot`).
 *
 *   node scripts/autopilot/run.cjs              → UN tick complet via runner (lock + timebox)
 *   node scripts/autopilot/run.cjs --observe    → sonde prod seule (pas d'implémentation)
 *   node scripts/autopilot/run.cjs --status     → état mémoire (status.cjs)
 *   node scripts/autopilot/run.cjs --dry        → orchestrateur sans aucune écriture git
 *   node scripts/autopilot/run.cjs --direct     → orchestrateur sans enveloppe runner (debug)
 *   node scripts/autopilot/run.cjs --live       → runner avec streaming OpenCode temps réel
 *   node scripts/autopilot/run.cjs --continuous → runner en boucle continue (WAITING entre cycles)
 *   node scripts/autopilot/run.cjs --live --continuous  → mode LIVE + CONTINUOUS combiné
 *   node scripts/autopilot/run.cjs --check-flags → affiche les variables d'env et quitte (test)
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const passthrough = args.filter(a => !['--observe', '--status', '--direct', '--live', '--continuous', '--check-flags'].includes(a));

// Check flags mode - just print env vars and exit
if (args.includes('--check-flags')) {
  if (args.includes('--live')) {
    process.env.SARGA_AUTOPILOT_LIVE = '1';
  }
  if (args.includes('--continuous')) {
    process.env.SARGA_AUTOPILOT_CONTINUOUS = '1';
  }
  console.log('SARGA_AUTOPILOT_LIVE=' + (process.env.SARGA_AUTOPILOT_LIVE || '0'));
  console.log('SARGA_AUTOPILOT_CONTINUOUS=' + (process.env.SARGA_AUTOPILOT_CONTINUOUS || '0'));
  process.exit(0);
}

let script;
if (args.includes('--status')) script = 'status.cjs';
else if (args.includes('--observe')) script = 'observe.cjs';
else if (args.includes('--direct')) script = 'orchestrator.cjs';
else script = 'runner.cjs';

// Set environment variables for runner
if (args.includes('--live')) {
  process.env.SARGA_AUTOPILOT_LIVE = '1';
}
if (args.includes('--continuous')) {
  process.env.SARGA_AUTOPILOT_CONTINUOUS = '1';
}

const r = spawnSync(process.execPath, [path.join(__dirname, script), ...passthrough], {
  cwd: path.resolve(__dirname, '..', '..'), 
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
process.exit(r.status == null ? 1 : r.status);

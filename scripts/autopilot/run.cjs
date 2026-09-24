#!/usr/bin/env node
/**
 * run.cjs — point d'entrée unique de l'autopilot (`npm run autopilot`).
 *
 *   node scripts/autopilot/run.cjs            → UN tick complet via runner (lock + timebox)
 *   node scripts/autopilot/run.cjs --observe  → sonde prod seule (pas d'implémentation)
 *   node scripts/autopilot/run.cjs --status   → état mémoire (status.cjs)
 *   node scripts/autopilot/run.cjs --dry      → orchestrateur sans aucune écriture git
 *   node scripts/autopilot/run.cjs --direct   → orchestrateur sans enveloppe runner (debug)
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const passthrough = args.filter(a => !['--observe', '--status', '--direct'].includes(a));

let script;
if (args.includes('--status')) script = 'status.cjs';
else if (args.includes('--observe')) script = 'observe.cjs';
else if (args.includes('--direct')) script = 'orchestrator.cjs';
else script = 'runner.cjs';

const r = spawnSync(process.execPath, [path.join(__dirname, script), ...passthrough], {
  cwd: path.resolve(__dirname, '..', '..'), stdio: 'inherit',
});
process.exit(r.status == null ? 1 : r.status);

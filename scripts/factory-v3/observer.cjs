#!/usr/bin/env node
'use strict';

/**
 * observer.cjs — lance l'observateur local Factory V3.
 *
 * Usage :
 *   node scripts/factory-v3/observer.cjs [--root <repo>] [--state <dir>] [--interval <ms>]
 *
 * Le processus reste vivant, écrit un état structuré dans le répertoire
 * d'état et peut être relancé sans perdre l'historique.
 */

const path = require('path');
const fs = require('fs');

const { createObserver } = require('./lib/observer.cjs');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function resolveRoot(rootArg) {
  const value = rootArg || process.env.FACTORY_V3_ROOT || process.cwd();
  return path.resolve(value);
}

function main() {
  const root = resolveRoot(argValue('--root'));
  const stateDir = path.resolve(argValue('--state') || path.join(root, 'state', 'observer'));
  const intervalMs = Math.max(5_000, Number(argValue('--interval', '30_000')) || 30_000);

  if (!fs.existsSync(path.join(root, '.git'))) {
    console.error(`[observer] Le répertoire observé n'est pas un dépôt Git : ${root}`);
    process.exit(1);
  }

  const observer = createObserver({ rootDir: root, stateDir, debounceMs: 500 });
  const { watchRoots } = observer.start();
  observer.reconcile();

  const timer = setInterval(() => observer.reconcile(), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.log(`[observer] Watcher démarré sur ${watchRoots.join(', ')}`);
  console.log(`[observer] État persistant dans ${stateDir}`);
}

if (require.main === module) main();

module.exports = { main };

#!/usr/bin/env node
/**
 * prune.cjs — pruning des logs/runs autopilot (exécuté périodiquement).
 *
 * Règles :
 *  - runs/ : garde les 500 derniers fichiers .md (triés par nom = timestamp), supprime le reste
 *  - runs/runner.log : rotation à 10 Mo (garde les 5000 dernières lignes)
 *  - runs/log.txt : rotation à 5 Mo (garde les 2000 dernières lignes)
 *  - observations/ : garde les 200 derniers fichiers .json
 *  - regressions/ : garde les 100 derniers fichiers
 *  - Ne JAMAIS supprimer : queue.json, scheduler.json, latest.md, config.json, STOP, orchestrator.lock
 *  - Crash-safe : écriture atomique, fail-closed si doute.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./lib/common.cjs');

function pruneDir(dir, pattern, keep) {
  if (!fs.existsSync(dir)) return { kept: 0, removed: 0 };
  const files = fs.readdirSync(dir)
    .filter(f => f.match(pattern))
    .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  let removed = 0;
  for (let i = keep; i < files.length; i++) {
    try { fs.rmSync(files[i].path); removed++; } catch (_) {}
  }
  return { kept: Math.min(files.length, keep), removed };
}

function rotateLog(file, maxBytes, keepLines) {
  if (!fs.existsSync(file)) return { rotated: false };
  const stat = fs.statSync(file);
  if (stat.size < maxBytes) return { rotated: false };
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const kept = lines.slice(-keepLines).join('\n') + '\n';
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, kept, 'utf8');
  fs.renameSync(tmp, file);
  return { rotated: true, linesBefore: lines.length, linesAfter: keepLines };
}

function main() {
  C.ensureDirs();
  const results = {};

  // runs/*.md
  results.runsMd = pruneDir(C.paths.runs, /^\d{4}-\d{2}-\d{2}-\d{6}-p.*\.md$/, 500);

  // runner.log (10 MB -> 5000 lines)
  results.runnerLog = rotateLog(path.join(C.paths.runs, 'runner.log'), 10 * 1024 * 1024, 5000);

  // log.txt (5 MB -> 2000 lines)
  results.mainLog = rotateLog(path.join(C.paths.runs, 'log.txt'), 5 * 1024 * 1024, 2000);

  // observations/*.json
  results.observations = pruneDir(C.paths.observations, /^\d{4}-\d{2}-\d{2}-\d{6}-p.*\.json$/, 200);

  // regressions/*
  results.regressions = pruneDir(C.paths.regressions, /.*/, 100);

  console.log(JSON.stringify(results, null, 2));
  return results;
}

function prune() {
  return main();
}

if (require.main === module) {
  main();
}

module.exports = { pruneDir, rotateLog, prune };
#!/usr/bin/env node
'use strict';

/**
 * session-registry.cjs — construit et persiste le registre d'états de sessions
 * normalisés de Factory V3 (jobs + sessions OpenCode).
 *
 * Usage :
 *   node scripts/factory-v3/session-registry.cjs [--state <dir>] [--limit <n>]
 *                                                 [--no-sessions] [--print]
 *
 * Sorties :
 *   <state>/observer/SESSION_REGISTRY.json   — instantané courant
 *   <state>/observer/SESSION_HISTORY.jsonl   — transitions horodatées
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { readQueue } = require('./run.cjs');
const { resolveOpencodeBin } = require('./lib/exec.cjs');
const {
  buildRegistry,
  persistRegistry,
  loadRegistry,
} = require('./lib/session-registry.cjs');

const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readSessionsCli(limit) {
  try {
    const bin = resolveOpencodeBin();
    const out = execFileSync(
      bin,
      ['session', 'list', '--format', 'json', '-n', String(limit)],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return { error: `SESSIONS_CLI_FAILED: ${String(error && error.message || error).slice(0, 300)}` };
  }
}

function readRecentFailoverJobIds(stateDir, windowMs = 15 * 60 * 1000) {
  const logsDir = path.join(path.resolve(stateDir), 'logs');
  const day = new Date();
  const candidates = [day, new Date(day.getTime() - 24 * 60 * 60 * 1000)];
  const jobIds = new Set();
  const nowMs = Date.now();
  for (const at of candidates) {
    const file = path.join(logsDir, `factory-${at.toISOString().slice(0, 10)}.jsonl`);
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    } catch (_) {
      continue;
    }
    // Les logs récents sont en fin de fichier : lecture inversée pour s'arrêter tôt.
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      let parsed;
      try {
        parsed = JSON.parse(lines[i]);
      } catch (_) {
        continue;
      }
      const ts = Date.parse(parsed.ts);
      if (Number.isFinite(ts) && nowMs - ts > windowMs) break;
      if (parsed.event === 'MODEL_FAILOVER' && parsed.jobId) jobIds.add(parsed.jobId);
    }
  }
  return jobIds;
}

function main() {
  const stateDir = path.resolve(argValue('--state') || STATE_DIR_DEFAULT);
  const limit = Math.max(1, Number(argValue('--limit', '40')) || 40);
  const withSessions = !process.argv.includes('--no-sessions');
  const print = process.argv.includes('--print');

  const errors = [];
  let jobs = [];
  try {
    const queue = readQueue(stateDir);
    jobs = Array.isArray(queue && queue.jobs) ? queue.jobs : [];
  } catch (error) {
    errors.push(`QUEUE_UNREADABLE: ${String(error && error.message || error).slice(0, 300)}`);
  }

  let sessions = [];
  if (withSessions) {
    const result = readSessionsCli(limit);
    if (Array.isArray(result)) sessions = result;
    else errors.push(result.error);
  }

  const failoverJobIds = readRecentFailoverJobIds(stateDir);
  const registry = buildRegistry({ jobs, sessions, failoverJobIds, nowMs: Date.now() });
  if (errors.length) {
    registry.errors = errors;
  }

  const { registryFile, historyFile, transitions } = persistRegistry({ stateDir, registry });

  const summary = {
    generatedAt: registry.generatedAt,
    counts: registry.counts,
    sources: registry.sources,
    transitions: transitions.length,
    errors,
    registryFile,
    historyFile,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (print) {
    console.log(JSON.stringify(registry.entries, null, 2));
  }
  return summary;
}

if (require.main === module) main();

module.exports = { main, readSessionsCli, readRecentFailoverJobIds };

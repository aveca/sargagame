#!/usr/bin/env node
/**
 * lock.cjs — verrou PID à fichier : UN SEUL orchestrateur possède le repo.
 *
 * - acquire() refuse si un lock VIVANT existe (PID encore actif, fenêtre non expirée).
 * - Un lock dont le PID est mort OU plus vieux que staleAfterMinutes est « stale »
 *   → récupéré (survit à un crash/reboot).
 * - releaseHandlers enregistrés : SIGINT/SIGTERM/exit → lock libéré.
 */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const { paths, nowIso } = require('./common.cjs');

const STALE_AFTER_MS_DEFAULT = 120 * 60 * 1000; // 2 h

function pidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return new RegExp(`\\b${pid}\\b`).test(out);
    } catch (_) { return false; }
  }
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(paths.lockFile, 'utf8')); } catch (_) { return null; }
}

function removeLock() { try { fs.unlinkSync(paths.lockFile); } catch (_) {} }

/**
 * Tente d'acquérir. Retourne {ok:true} ou {ok:false, reason, holder}.
 * opts.staleAfterMs surcharge la fenêtre de péremption.
 */
function acquire(opts = {}) {
  const staleAfter = opts.staleAfterMs || STALE_AFTER_MS_DEFAULT;
  const existing = readLock();
  if (existing && existing.pid) {
    const age = Date.now() - new Date(existing.startedAt).getTime();
    if (pidAlive(existing.pid) && age < staleAfter) {
      return {
        ok: false,
        reason: `lock détenu par PID ${existing.pid} depuis ${existing.startedAt} (âge ${(age / 60000).toFixed(0)} min)`,
        holder: existing,
        code: 'LOCKED',
      };
    }
    // Stale : PID mort ou fenêtre dépassée → récupération documentée.
  }
  const entry = { pid: process.pid, startedAt: nowIso(), host: require('os').hostname(), ppid: process.ppid };
  fs.mkdirSync(require('path').dirname(paths.lockFile), { recursive: true });
  fs.writeFileSync(paths.lockFile, JSON.stringify(entry, null, 2), 'utf8');

  const release = () => { const cur = readLock(); if (cur && cur.pid === process.pid) removeLock(); };
  process.on('exit', release);
  if (!opts.noSignalHandlers) {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.on(sig, () => { release(); process.exit(130); });
    }
  }
  return { ok: true, entry, release };
}

function release() {
  const cur = readLock();
  if (cur && cur.pid === process.pid) removeLock();
}

function status() {
  const l = readLock();
  if (!l) return { locked: false };
  return { locked: pidAlive(l.pid), lock: l, alive: pidAlive(l.pid) };
}

module.exports = { acquire, release, status, pidAlive, readLock };

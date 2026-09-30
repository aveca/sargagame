#!/usr/bin/env node
/**
 * lock.cjs — verrou single-runner ATOMIQUE : UN SEUL runner possède le repo.
 *
 * Garanties :
 *  - acquisition atomique (création 'wx' exclusive — pas de TOCTOU) ;
 *  - Windows/Node : aucun binaire externe requis (fs + tasklist présents) ;
 *  - second runner refusé proprement ({ok:false, code:'LOCKED'}) ;
 *  - un lock vivant n'est JAMAIS considéré stale (pid vivant ⇒ refus) ;
 *  - release/heartbeat réservés au détenteur (pid + token) ;
 *  - sortie normale → lock libéré (handler 'exit' synchrone) ;
 *  - lock stale (pid mort ou PID recyclé) → reprise SÛRE avec preuve
 *    conservée (backup `.stale-<ts>.json`, jamais de suppression silencieuse) ;
 *  - fail-closed : lock corrompu/illisible ou vérification impossible ⇒ refus ;
 *  - écritures atomiques (tmp + rename) : un crash ne laisse jamais un lock
 *    tronqué, donc un refus est toujours une vraie collision, jamais un artefact.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { paths, nowIso } = require('./common.cjs');

const STALE_AFTER_MS_DEFAULT = 120 * 60 * 1000; // 2 h (garde-fou ultime, le pid prime)
const HEARTBEAT_FRESH_MS_DEFAULT = 10 * 60 * 1000; // observabilité : activité récente

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

/**
 * Heure de démarrage d'un processus (anti-recyclage de PID).
 * Retourne ms epoch, ou null si invérifiable (→ l'appelant doit fail-closed).
 */
function processStartTime(pid) {
  if (!pid || typeof pid !== 'number') return null;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToString('o')`],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
      const t = new Date(out).getTime();
      return Number.isFinite(t) ? t : null;
    }
    // POSIX : temps écoulé via /proc (Linux) — à défaut, invérifiable.
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const m = stat.match(/\)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
    if (m) {
      const clk = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()) || 100;
      const btime = Number(fs.readFileSync('/proc/stat', 'utf8').match(/btime\s+(\d+)/)[1]);
      return (btime + Number(m[1]) / clk) * 1000;
    }
    return null;
  } catch (_) { return null; }
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(paths.lockFile, 'utf8')); } catch (_) { return null; }
}

/** Lecture brute : distingue « absent » (null + missing) de « corrompu ». */
function readLockRaw() {
  let raw = null;
  try { raw = fs.readFileSync(paths.lockFile, 'utf8'); }
  catch (e) { return { state: e.code === 'ENOENT' ? 'missing' : 'unreadable', error: e.message }; }
  try { return { state: 'ok', lock: JSON.parse(raw), raw }; }
  catch (e) { return { state: 'corrupt', error: e.message, raw }; }
}

function removeLock() { try { fs.unlinkSync(paths.lockFile); } catch (_) {} }

/** Écriture atomique tmp→rename (jamais de JSON tronqué observable). */
function writeLockAtomic(entry) {
  fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
  const tmp = `${paths.lockFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2), 'utf8');
  fs.renameSync(tmp, paths.lockFile);
}

/**
 * Le détenteur déclaré est-il réellement vivant ?
 * FAIL-CLOSED : pid vivant ⇒ vivant (même si heartbeat vieux — un processus
 * hung n'est jamais préempté). PID recyclé détecté via heure de démarrage.
 * Retourne {alive:boolean, reason}.
 */
function holderAlive(holder) {
  if (!holder || typeof holder.pid !== 'number') return { alive: false, reason: 'no-pid' };
  if (!pidAlive(holder.pid)) return { alive: false, reason: `pid ${holder.pid} mort` };
  const holderSince = new Date(holder.startedAt).getTime();
  const procStart = processStartTime(holder.pid);
  if (procStart == null) {
    // Invérifiable (powershell indisponible…) → doute ⇒ vivant (fail-closed).
    return { alive: true, reason: `pid ${holder.pid} vivant (démarrage invérifiable — fail-closed)` };
  }
  if (Number.isFinite(holderSince) && procStart > holderSince + 60000) {
    return { alive: false, reason: `PID ${holder.pid} recyclé (processus démarré après le lock)` };
  }
  return { alive: true, reason: `pid ${holder.pid} vivant` };
}

/** Notre entrée (détenteur courant de CE processus). */
let owned = null;
function isOwner() {
  if (!owned) return false;
  const cur = readLock();
  return !!cur && cur.pid === owned.pid && cur.token === owned.token;
}

/**
 * Tente d'acquérir. Retourne {ok:true, entry, release} ou
 * {ok:false, reason, holder, code:'LOCKED'|'CORRUPT'}.
 * opts.staleAfterMs : garde-fou ultime (défaut 2 h).
 */
function acquire(opts = {}) {
  const staleAfter = opts.staleAfterMs || STALE_AFTER_MS_DEFAULT;
  const raw = readLockRaw();

  if (raw.state === 'missing') {
    // Chemin rapide atomique : création exclusive, échec si un concurrent gagne.
    const entry = newEntry();
    try {
      fs.mkdirSync(path.dirname(paths.lockFile), { recursive: true });
      fs.writeFileSync(paths.lockFile, JSON.stringify(entry, null, 2), { flag: 'wx', encoding: 'utf8' });
    } catch (e) {
      if (e.code === 'EEXIST') return acquireContended();
      return { ok: false, reason: `lock non acquis (FS: ${e.message})`, code: 'LOCKED' };
    }
    return claimVerified(entry, 'créé (atomique)', opts);
  }

  if (raw.state === 'corrupt' || raw.state === 'unreadable') {
    // Fail-closed : on ne devine jamais. Le fichier est préservé pour diagnostic.
    return {
      ok: false,
      reason: `lock ${raw.state} (${paths.lockFile}) — refus fail-closed, intervention requise : inspecter puis supprimer le fichier. Détail : ${raw.error || ''}`.slice(0, 300),
      code: 'CORRUPT',
    };
  }

  const existing = raw.lock;
  const ha = holderAlive(existing);
  const age = existing && existing.startedAt ? Date.now() - new Date(existing.startedAt).getTime() : Infinity;
  if (ha.alive && age < staleAfter) {
    return {
      ok: false,
      reason: `lock détenu par PID ${existing.pid} depuis ${existing.startedAt} (âge ${(age / 60000).toFixed(0)} min, ${ha.reason})`,
      holder: existing,
      code: 'LOCKED',
    };
  }
  if (ha.alive) {
    // Fenêtre dépassée MAIS pid vivant → jamais de préemption (fail-closed).
    return {
      ok: false,
      reason: `lock tenu par PID vivant ${existing.pid} au-delà de la fenêtre (${(age / 60000).toFixed(0)} min) — refus fail-closed, ne jamais préempter un processus vivant`,
      holder: existing,
      code: 'LOCKED',
    };
  }
  // Stale sûr (pid mort ou recyclé) → reprise AVEC preuve conservée.
  return takeover(existing, `reprise stale (${ha.reason})`, opts);
}

/** Perdu la course 'wx' : relit l'état réel et refuse proprement. */
function acquireContended() {
  const cur = readLock();
  return {
    ok: false,
    reason: `course d'acquisition perdue — lock détenu par PID ${cur && cur.pid} (démarré ${cur && cur.startedAt})`,
    holder: cur,
    code: 'LOCKED',
  };
}

function newEntry() {
  return {
    pid: process.pid,
    ppid: process.ppid,
    token: crypto.randomBytes(8).toString('hex'),
    startedAt: nowIso(),
    heartbeatAt: nowIso(),
    host: require('os').hostname(),
    argv: process.argv.slice(1, 4).join(' ').slice(0, 160),
  };
}

/** Vérifie qu'on possède bien ce qu'on vient d'écrire (anti-TOCTOU résiduel). */
function claimVerified(entry, how, opts = {}) {
  const cur = readLock();
  if (!cur || cur.pid !== entry.pid || cur.token !== entry.token) {
    return { ok: false, reason: 'vérification post-écriture échouée — un concurrent a gagné, refus', holder: cur, code: 'LOCKED' };
  }
  return hold(entry, how, opts);
}

function hold(entry, how, opts = {}) {
  owned = entry;
  const release = () => releaseOwned();
  process.on('exit', () => releaseOwned());
  if (!opts.noSignalHandlers && !hold._sig) {
    hold._sig = true;
    for (const sig of ['SIGINT', 'SIGTERM']) {
      try { process.on(sig, () => { releaseOwned(); process.exit(130); }); } catch (_) {}
    }
  }
  return { ok: true, entry, release, how };
}

/** Reprise d'un lock stale : backup horodaté PUIS remplacement vérifié. */
function takeover(existing, why, opts = {}) {
  const entry = newEntry();
  // 1. Preuve conservée (jamais de suppression silencieuse).
  try {
    const bak = `${paths.lockFile}.stale-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}.json`;
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.writeFileSync(bak, JSON.stringify({ takenAt: nowIso(), takenBy: entry.pid, why, previous: existing }, null, 2), 'utf8');
  } catch (_) {}
  // 2. Relecture anti-course : si le lock a changé depuis, quelqu'un a gagné → refus.
  const cur = readLock();
  if (cur && (cur.pid !== (existing && existing.pid) || cur.token !== (existing && existing.token))) {
    return { ok: false, reason: 'reprise avortée — le lock a changé pendant la vérification (concurrent actif), refus', holder: cur, code: 'LOCKED' };
  }
  // 3. Remplacement atomique + vérification.
  try { writeLockAtomic(entry); }
  catch (e) { return { ok: false, reason: `reprise échouée (FS: ${e.message})`, code: 'LOCKED' }; }
  return claimVerified(entry, why, opts);
}

function releaseOwned() {
  if (!owned) return false;
  const cur = readLock();
  if (cur && cur.pid === owned.pid && cur.token === owned.token) { removeLock(); owned = null; return true; }
  owned = null;
  return false;
}

function release() { return releaseOwned(); }

/**
 * Rafraîchit heartbeatAt — réservé au détenteur (prouve « encore utilisé »).
 * Retourne {ok:true} ou {ok:false, reason}.
 */
function heartbeat() {
  if (!isOwner()) return { ok: false, reason: 'non-détenteur — heartbeat refusé' };
  const cur = readLock();
  cur.heartbeatAt = nowIso();
  try { writeLockAtomic(cur); owned = cur; return { ok: true }; }
  catch (e) { return { ok: false, reason: e.message }; }
}

function status() {
  const raw = readLockRaw();
  if (raw.state === 'missing') return { locked: false };
  if (raw.state !== 'ok') return { locked: false, state: raw.state, error: raw.error };
  const l = raw.lock;
  const ha = holderAlive(l);
  const now = Date.now();
  return {
    locked: ha.alive,
    lock: l,
    alive: ha.alive,
    holderReason: ha.reason,
    ageMs: l.startedAt ? now - new Date(l.startedAt).getTime() : null,
    heartbeatAgeMs: l.heartbeatAt ? now - new Date(l.heartbeatAt).getTime() : null,
    heartbeatFresh: l.heartbeatAt ? (now - new Date(l.heartbeatAt).getTime()) < HEARTBEAT_FRESH_MS_DEFAULT : false,
    ownedBySelf: isOwner(),
  };
}

module.exports = { acquire, release, heartbeat, status, pidAlive, processStartTime, holderAlive, readLock };

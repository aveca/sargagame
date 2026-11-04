#!/usr/bin/env node
/**
 * semaphore.cjs — Sémaphore OpenCode durci (Phase 2 — Mission P0)
 *
 * Correctifs vs l'ancienne implémentation inline du runner :
 *   1. Un holder porte sa PREUVE DE VIE : pid + hostname + horodatage UTC.
 *      Un verrou dont le pid est mort OU dépassé le TTL est **abandonné** :
 *      il est libéré automatiquement (sweep) avant toute décision d'admission.
 *   2. `count` n'est plus une variable désynchronisable : il est recalculé
 *      depuis les holders réellement actifs.
 *   3. Écritures atomiques (tmp + rename) : pas de sémaphore à moitié écrit.
 *   4. Fichier corrompu : mis en quarantaine (.corrupt-<ts>) et jamais écrasé
 *      silencieusement — l'historique reste inspectable.
 *   5. Toute action (acquire, release, sweep, refus) est JOURNALISÉE dans
 *      state/semaphore-journal.jsonl. Les libérations sont idempotentes.
 *
 * Une libération « admin » (reclaim) exige une PREUVE d'abandon :
 * pid mort OU TTL dépassé. Sans preuve, elle est REFUSÉE (journalisée).
 *
 * Usage module :  const { acquire, release, audit } = require('./semaphore.cjs');
 * Usage CLI   :  node scripts/local-factory/semaphore.cjs status|audit|sweep|release --task <id>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.FACTORY_STATE_DIR || path.join(__dirname, 'state');
const LOGS_DIR = process.env.FACTORY_LOGS_DIR || path.join(__dirname, 'logs');
const SEMAPHORE_FILE = path.join(STATE_DIR, 'opencode-semaphore.json');
const JOURNAL_FILE = path.join(STATE_DIR, 'semaphore-journal.jsonl');

const MAX_OPENCODE_CONCURRENT = 2;
// TTL d'un verrou : au-delà, il est présumé abandonné (une exécution OpenCode
// réelle ne dépasse pas ce délai ; au pire elle échoue et le TTL débloque la file).
const SEMAPHORE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h
const HOLDER_MIN_AGE_MS = 1000; // évite les auto-sweeps de verrous tout juste pris

fs.mkdirSync(STATE_DIR, { recursive: true });

/** Erreur d'attente : la tâche n'a PAS été exécutée et ne doit jamais être « success ». */
class SemaphoreWaitError extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.name = 'SemaphoreWaitError';
    this.code = 'SEMAPHORE_WAIT';
    this.reason = reason;
    this.details = details;
  }
}

function pidAlive(pid) {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try { process.kill(Number(pid), 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // EPERM = existe mais protégé -> vivant
}

function atomicWriteJSON(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function journal(event, data = {}) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    event,
    pid: process.pid,
    host: os.hostname(),
    ...data,
  }) + '\n';
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(JOURNAL_FILE, line);
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOGS_DIR, `factory-${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify({
      t: new Date().toISOString(), event: `semaphore.${event}`, ...data,
    }) + '\n');
  } catch (_) { /* log factory absent : le journal reste la source de vérité */ }
}

function readSemaphore() {
  if (!fs.existsSync(SEMAPHORE_FILE)) return { count: 0, holders: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(SEMAPHORE_FILE, 'utf8'));
    if (!parsed || !Array.isArray(parsed.holders)) return { count: 0, holders: [] };
    return parsed;
  } catch (e) {
    // Corrompu : quarantaine (jamais d'écrasement silencieux)
    const quarantine = `${SEMAPHORE_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { fs.renameSync(SEMAPHORE_FILE, quarantine); } catch (_) {}
    journal('corrupt_file_quarantined', { file: SEMAPHORE_FILE, quarantine, error: e.message });
    return { count: 0, holders: [] };
  }
}

function writeSemaphore(sem) {
  // count est DÉRIVÉ des holders : pas de désynchronisation possible
  atomicWriteJSON(SEMAPHORE_FILE, { count: sem.holders.length, holders: sem.holders, updatedAt: new Date().toISOString() });
}

/** Classifie un holder : actif | abandonné (pid mort) | abandonné (TTL dépassé). */
function classifyHolder(h, now = Date.now()) {
  // Formats historiques acceptés : acquiredAtMs (epoch ms) | acquiredAt (epoch ms
  // ou ISO). Un âge calculable est ce qui rend le TTL opposable.
  let acquiredMs = null;
  if (h.acquiredAtMs !== undefined && !Number.isNaN(Number(h.acquiredAtMs))) acquiredMs = Number(h.acquiredAtMs);
  else if (typeof h.acquiredAt === 'number' && !Number.isNaN(h.acquiredAt)) acquiredMs = h.acquiredAt;
  else if (typeof h.acquiredAt === 'string') { const p = Date.parse(h.acquiredAt); if (!Number.isNaN(p)) acquiredMs = p; }
  const ageMs = acquiredMs !== null ? now - acquiredMs : null;
  const alive = pidAlive(h.pid);
  if (!alive) return { verdict: 'orphan_dead_pid', reason: `pid ${h.pid} inexistant`, ageMs, pidAlive: false };
  if (ageMs !== null && ageMs > SEMAPHORE_TTL_MS) {
    return { verdict: 'orphan_expired', reason: `verrou agé de ${(ageMs / 3600000).toFixed(1)}h > TTL ${SEMAPHORE_TTL_MS / 3600000}h`, ageMs, pidAlive: true };
  }
  return { verdict: 'active', reason: alive ? `pid ${h.pid} vivant` : 'pid inconnu', ageMs, pidAlive: true };
}

/**
 * Libère les verrous abandonnés (pid mort ou TTL dépassé).
 * Idempotent : ne touche que les holders réellement présents.
 * @returns {{released: Array, kept: Array}}
 */
function sweepOrphans({ dryRun = false, force = false, reason = 'sweep automatique (verrou abandonne)' } = {}) {
  const sem = readSemaphore();
  const now = Date.now();
  const released = [];
  const kept = [];

  for (const h of sem.holders) {
    const c = classifyHolder(h, now);
    const abandonned = c.verdict !== 'active';
    const ageTooYoung = c.ageMs !== null && c.ageMs < HOLDER_MIN_AGE_MS;
    if (abandonned && (force || !ageTooYoung)) {
      released.push({ ...h, why: c.verdict, detail: c.reason, ageMs: c.ageMs });
    } else {
      kept.push(h);
    }
  }

  if (released.length && !dryRun) {
    writeSemaphore({ ...sem, holders: kept });
    for (const r of released) {
      journal('release.orphan', {
        taskId: r.taskId, pid: r.pid, acquiredAtMs: r.acquiredAtMs,
        ageMs: r.ageMs, why: r.why, detail: r.detail, reason, by: 'sweep',
      });
    }
  } else if (released.length && dryRun) {
    for (const r of released) {
      journal('release.orphan.dry_run', { taskId: r.taskId, why: r.why, detail: r.detail });
    }
  }
  return { released, kept };
}

/**
 * Acquiert un jeton. Si le sémaphore est saturé par des holders ACTIFS,
 * renvoie { acquired: false, reason } — l'appelant DOIT alors traiter la tâche
 * comme non exécutée (jamais comme un succès).
 */
function acquire(taskId, { pid = process.pid, force = false } = {}) {
  sweepOrphans({ force }); // on ne décide jamais sur des verrous abandonnés
  const sem = readSemaphore();
  const now = Date.now();

  const active = sem.holders.map(h => ({ h, c: classifyHolder(h, now) })).filter(x => x.c.verdict === 'active');

  // Interdit de détenir deux fois le même jeton (même tâche, même processus) :
  // garde-fou contre les doubles exécutions.
  const sameTaskSamePid = active.find(x => x.h.taskId === taskId && x.h.pid === pid);
  if (sameTaskSamePid) {
    journal('acquire.duplicate_refused', { taskId, pid, heldSince: sameTaskSamePid.h.acquiredAt });
    return { acquired: false, reason: 'duplicate holder (meme tache, meme processus)', duplicate: true };
  }

  if (active.length >= MAX_OPENCODE_CONCURRENT) {
    journal('acquire.wait', {
      taskId, pid,
      reason: 'max concurrent OpenCode reached',
      activeHolders: active.map(x => ({ taskId: x.h.taskId, pid: x.h.pid, ageMs: x.c.ageMs })),
    });
    return {
      acquired: false,
      reason: 'max concurrent OpenCode reached',
      holders: active.map(x => ({ taskId: x.h.taskId, pid: x.h.pid, ageMs: x.c.ageMs })),
    };
  }

  const holder = {
    taskId,
    pid,
    host: os.hostname(),
    acquiredAt: new Date(now).toISOString(),
    acquiredAtMs: now,
  };
  sem.holders.push(holder);
  writeSemaphore(sem);
  journal('acquire.ok', { taskId, pid, holders: sem.holders.length });
  return { acquired: true, holder };
}

/**
 * Libération par le propriétaire (fin d'exécution). Elle ne retire QUE son
 * propre holder ; elle est idempotente si le holder n'existe plus.
 */
function release(taskId, { pid = process.pid } = {}) {
  const sem = readSemaphore();
  const idx = sem.holders.findIndex(h => h.taskId === taskId);
  if (idx === -1) {
    journal('release.noop', { taskId, pid, reason: 'aucun holder correspondant' });
    return { released: false, removed: 0, reason: 'noop' };
  }
  const holder = sem.holders[idx];
  const mine = holder.pid === pid || pid === undefined || pid === null;
  if (!mine) {
    // Quelqu'un d'autre détient ce jeton : on ne le casse PAS au passage.
    journal('release.refused', { taskId, holderPid: holder.pid, callerPid: pid, reason: 'holder detenu par un autre processus' });
    return { released: false, removed: 0, reason: 'refused_not_owner' };
  }
  sem.holders.splice(idx, 1);
  writeSemaphore(sem);
  journal('release.owner', { taskId, pid, ageMs: Date.now() - (holder.acquiredAtMs || Date.now()) });
  return { released: true, removed: 1, holder };
}

/**
 * Libération ADMIN : exige une preuve d'abandon (pid mort ou TTL dépassé).
 * Idempotente, journalisée, et REFUSE les verrous encore vivants sans preuve.
 */
function reclaim(taskId, { reason = 'liberation manuelle', by = 'admin', force = false } = {}) {
  const sem = readSemaphore();
  const now = Date.now();
  const idx = sem.holders.findIndex(h => h.taskId === taskId);
  if (idx === -1) {
    journal('release.noop', { taskId, by, reason: 'aucun holder correspondant (idempotent)' });
    return { released: false, removed: 0, reason: 'noop' };
  }
  const holder = sem.holders[idx];
  const c = classifyHolder(holder, now);
  if (c.verdict === 'active' && !force) {
    journal('release.refused', { taskId, by, pid: holder.pid, detail: c.reason, reason: 'aucune preuve d abandon' });
    return { released: false, removed: 0, reason: 'refused_no_proof', proof: c };
  }
  sem.holders.splice(idx, 1);
  writeSemaphore(sem);
  journal('release.reclaim', {
    taskId, pid: holder.pid, by, reason, forced: Boolean(force),
    proof: c.verdict === 'active' ? 'FORCE sans preuve d abandon' : c.reason,
    ageMs: c.ageMs,
  });
  return { released: true, removed: 1, holder, proof: c };
}

/** État lisible du sémaphore (pour audit et supervision). */
function audit() {
  const sem = readSemaphore();
  const now = Date.now();
  const holders = sem.holders.map(h => {
    const c = classifyHolder(h, now);
    return {
      taskId: h.taskId,
      pid: h.pid,
      host: h.host,
      acquiredAt: h.acquiredAt,
      ageMs: c.ageMs,
      verdict: c.verdict,
      detail: c.reason,
    };
  });
  const active = holders.filter(h => h.verdict === 'active');
  return {
    file: SEMAPHORE_FILE,
    max: MAX_OPENCODE_CONCURRENT,
    count: active.length,              // count recalculé depuis les preuves de vie
    rawDeclaredCount: typeof sem.count === 'number' ? sem.count : null,
    holders,
    active,
    orphans: holders.filter(h => h.verdict !== 'active'),
    saturated: active.length >= MAX_OPENCODE_CONCURRENT,
  };
}

module.exports = {
  MAX_OPENCODE_CONCURRENT,
  SEMAPHORE_TTL_MS,
  SEMAPHORE_FILE,
  JOURNAL_FILE,
  STATE_DIR,
  SemaphoreWaitError,
  pidAlive,
  readSemaphore,
  writeSemaphore,
  classifyHolder,
  sweepOrphans,
  acquire,
  release,
  reclaim,
  audit,
  journal,
};

// CLI admin
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const getFlag = (name) => {
    const i = args.indexOf(name);
    return i > -1 ? args[i + 1] : null;
  };
  const taskId = getFlag('--task');

  if (cmd === 'status' || cmd === 'audit') {
    console.log(JSON.stringify(audit(), null, 2));
  } else if (cmd === 'sweep') {
    const r = sweepOrphans({ dryRun: args.includes('--dry-run'), force: args.includes('--force'), reason: getFlag('--reason') || 'sweep manuel' });
    console.log(JSON.stringify({ released: r.released.map(x => ({ taskId: x.taskId, why: x.why, detail: x.detail })), kept: r.kept.length }, null, 2));
  } else if (cmd === 'release') {
    if (!taskId) { console.error('Usage: semaphore.cjs release --task <id> [--force --reason <txt>]'); process.exit(2); }
    const r = reclaim(taskId, { reason: getFlag('--reason') || 'liberation manuelle', force: args.includes('--force') });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.released ? 0 : 1);
  } else {
    console.log('Usage: node semaphore.cjs <status|audit|sweep|release> [--task <id>] [--force] [--reason <txt>] [--dry-run]');
  }
}

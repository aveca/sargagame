#!/usr/bin/env node
/**
 * Factory V3 — Orchestrateur autonome RÉEL (v2 — 2026-11-14)
 *
 * Garanties (contrat P0) :
 *  - ZÉRO simulation : chaque verdict provient d'une exécution réelle (agent opencode CLI,
 *    gates de livraison, git, gh). Un job n'est jamais déclaré terminé sans preuve.
 *  - Preuves : state/evidence/<jobId>.json écrit à CHAQUE étape (agent, gates, commit, PR).
 *  - Queue persistante atomique : state/queue.json (tmp + rename).
 *  - Lock single-runner : state/factory.lock — reclaim si PID mort OU si le PID du lock
 *    a été réutilisé par un autre processus (lock âgé > 4 h) — preuve conservée (.stale-<ts>).
 *  - Recovery : au démarrage, jobs RUNNING dont le runner est mort → re-queued (backoff).
 *  - Anti-doublon : claim atomique par job ; un job RUNNING n'est jamais relancé.
 *  - Backoff exponentiel + max attempts → PARKED (jamais de boucle infinie).
 *  - Timeout par étape + kill de l'arbre de processus (taskkill /T /F).
 *  - Heartbeat : state/heartbeat.json à chaque cycle + logs JSONL structurés.
 *
 * CLI :
 *   node scripts/factory-v3/run.cjs --continuous
 *   node scripts/factory-v3/run.cjs --once
 *   node scripts/factory-v3/run.cjs --status
 *   node scripts/factory-v3/run.cjs --recover
 *   node scripts/factory-v3/run.cjs --clear-stale-lock
 *   node scripts/factory-v3/run.cjs --enqueue '{"repo":"sargagame","task":"..."}'
 *   node scripts/factory-v3/run.cjs --enqueue-file <chemin.json>
 *   Options : --state-dir <chemin> (tests), --max-cycles <n>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { runProcess, runShell } = require('./lib/exec.cjs');
const { executeJobWithFailover } = require('./lib/failover.cjs');
const inventoryLib = require('./lib/inventory.cjs');
const registryLib = require('./lib/model-registry.cjs');

// ============================================================
// Configuration
// ============================================================
const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

const DEFAULT_CONFIG = {
  cycleDelayMs: 60_000,
  lockMaxAgeMs: 4 * 60 * 60 * 1000, // au-delà : lock stale même si PID vivant (réutilisation de PID)
  maxAttempts: 3,
  // Priorité commerciale absolue : BOT-WOW avant Sargasses. À priorité égale,
  // la queue reste FIFO afin de ne pas affamer une mission ancienne.
  repoPriority: ['botwow', 'sargagame'],
  backoffBaseMs: 5 * 60 * 1000,
  backoffMaxMs: 60 * 60 * 1000,
  stepTimeoutMs: { agent: 15 * 60 * 1000, gate: 20 * 60 * 1000 },
  // Racine des worktrees isolés Factory V3. Elle est volontairement HORS des
  // dépôts sources : un job ne doit jamais modifier le checkout principal.
  worktreeRoot: path.resolve(__dirname, '../../../factory-v3'),
  // Exécutable OpenCode (surchargeable pour les tests : stub déterministe).
  opencodeBin: 'opencode',
  // AUCUNE dépense autorisée par défaut : les modèles payants sont exclus.
  paidAllowed: false,
  // Moteur de bascule automatique (mission P0 : failover + quota autopilot).
  failover: {
    maxModelSwitches: 4,          // nombre max de modèles distincts pour un job
    maxSameModelAttempts: 3,      // retries max sur le MÊME modèle (transitoire)
    providerSlotWaitMs: 30 * 1000,
    providerSlotLeaseMs: 16 * 60 * 1000,
    availabilityCacheMs: 30 * 60 * 1000,
    agentTimeoutMs: 15 * 60 * 1000,
    agentIdleTimeoutMs: 5 * 60 * 1000, // hang fournisseur (aucune sortie)
    inventoryMaxAgeMs: 30 * 60 * 1000,
    circuitThreshold: 3,           // circuit breaker : échecs consécutifs
    cooldowns: {
      dailyMs: 24 * 60 * 60 * 1000,
      hourlyMs: 60 * 60 * 1000,
      rateMs: 2 * 60 * 1000,
      providerMs: 10 * 60 * 1000,
      technicalMs: 2 * 60 * 1000,
    },
  },
  // Priorité de mission (ordre de préférence), PAS une chaîne figée.
  // La liste réelle est redécouverte à chaud via l'inventaire dynamique ;
  // ces modèles sont simplement priorisés (bonus dégressif par rang).
  // `ollama/qwen2.5-coder:14b` a été RETIRÉ : il figurait au catalogue OpenCode
  // mais n'est PAS installé (`ollama list`) — l'ancien runner le visait à tort.
  models: [
    'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b',
    'opencode/nemotron-3.5-super-vl-free',
    'ollama/qwen2.5-coder:7b',
    'router/auto'
  ],
  // Sondes de bascule : modèles volontairement tentés EN PREMIER pour éprouver
  // la mécanique de bascule sur une vraie erreur de fournisseur (coût 0).
  // Une sonde payante connue est refusée avant tout appel.
  probeModels: [],
  repos: {
    sargagame: {
      local: 'C:\\factory\\worktrees\\sargagame-main',
      defaultBranch: 'main',
      baseBranch: 'main',
      gates: [
        { id: 'build', cmd: 'npm run build' },
        { id: 'bundle-budget', cmd: 'node scripts/check-bundle-budget.cjs' },
        { id: 'unit-tests', cmd: 'node scripts/run-tests.cjs' }
      ]
    },
    botwow: {
      local: 'C:\\factory\\worktrees\\bot-wow-repo',
      defaultBranch: 'main',
      baseBranch: 'main',
      gates: [
        { id: 'build', cmd: 'npm run build' }
      ]
    }
  }
};

function loadConfig(stateDir) {
  const file = path.join(stateDir, 'config.json');
  let overrides = {};
  try { overrides = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { /* défauts du code */ }
  const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (overrides.paidAllowed === true || (overrides.failover && overrides.failover.paidAllowed === true)) {
    const error = new Error('PAID_MODELS_FORBIDDEN: paidAllowed=true est interdit par le contrat Factory V3');
    error.code = 'PAID_MODELS_FORBIDDEN';
    throw error;
  }
  for (const k of Object.keys(overrides)) {
    if (k === 'repos' && overrides.repos && typeof overrides.repos === 'object') {
      for (const r of Object.keys(overrides.repos)) {
        merged.repos[r] = Object.assign({}, merged.repos[r] || {}, overrides.repos[r]);
      }
    } else if (k === 'failover' && overrides.failover && typeof overrides.failover === 'object') {
      merged.failover = Object.assign({}, merged.failover, overrides.failover);
      if (overrides.failover.cooldowns) {
        merged.failover.cooldowns = Object.assign(
          {},
          merged.failover.cooldowns || {},
          overrides.failover.cooldowns,
        );
      }
    } else { merged[k] = overrides[k]; }
  }
  return merged;
}

// ============================================================
// Utilitaires état (lectures/écritures atomiques)
// ============================================================
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomique sur le même volume
}

// ============================================================
// Lock single-runner (réparation : EPERM = vivant ; lock ancien = PID réutilisé)
// ============================================================
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e && e.code === 'EPERM'; } // EPERM = le processus existe (permission refusée)
}

function lockIsStale(lock, lockMaxAgeMs) {
  const parsedAt = Date.parse((lock && lock.at) || '');
  const age = Date.now() - parsedAt;
  if (!Number.isFinite(age)) return true;
  if (!pidAlive(lock.pid)) return true; // PID mort
  return age > lockMaxAgeMs; // PID vivant mais lock trop vieux → PID réutilisé
}

// Le token du lock appartient au processus qui l'a réellement acquis. Il évite
// qu'un runner supprime le lock d'un autre runner simplement parce que les PID
// sont identiques après réécriture du système.
let heldRunnerLock = null;

function acquireLock(stateDir, config) {
  const lockFile = path.join(stateDir, 'factory.lock');
  const lock = registryLib.acquireLockFile(lockFile, 5000, {
    staleMs: config.lockMaxAgeMs,
    meta: { host: os.hostname(), kind: 'factory-runner' },
  });
  if (!lock.ok) {
    const owner = readJson(lockFile, null);
    return {
      acquired: false,
      reason: owner
        ? `runner actif (pid ${owner.pid}${owner.token ? `, token ${owner.token}` : ''})`
        : `lock indisponible (${lock.reason || 'timeout'})`,
    };
  }
  heldRunnerLock = { stateDir: path.resolve(stateDir), token: lock.token, lockFile };
  if (lock.stalePath) {
    appendLog(stateDir, 'LOCK_RECLAIMED', {
      old: readJson(lock.stalePath, null),
      proof: lock.stalePath,
    });
  }
  return { acquired: true, reason: 'lock acquis', token: lock.token };
}

function releaseLock(stateDir) {
  if (!heldRunnerLock || heldRunnerLock.stateDir !== path.resolve(stateDir)) return false;
  const released = registryLib.releaseLockFile(heldRunnerLock.lockFile, heldRunnerLock.token);
  heldRunnerLock = null;
  return released;
}

function renewHeldLock(stateDir) {
  if (!heldRunnerLock || heldRunnerLock.stateDir !== path.resolve(stateDir)) return false;
  return registryLib.renewLockFile(heldRunnerLock.lockFile, heldRunnerLock.token, {
    host: os.hostname(),
    kind: 'factory-runner',
  });
}

function clearStaleLock(stateDir, config) {
  const lockFile = path.join(stateDir, 'factory.lock');
  const lock = readJson(lockFile, null);
  if (!lock) return { cleared: false, reason: 'aucun lock' };
  if (lock.pid === process.pid) {
    // Un PID identique ne prouve PAS la propriété : après réutilisation de
    // PID, seul le token détenu par CE processus autorise la suppression.
    if (!heldRunnerLock || !lock.token || heldRunnerLock.token !== lock.token) {
      return { cleared: false, reason: 'PID identique mais token de propriété absent — refus fail-closed' };
    }
    const released = registryLib.releaseLockFile(lockFile, heldRunnerLock.token);
    heldRunnerLock = null;
    return {
      cleared: released,
      reason: released ? 'lock de ce processus libéré par token' : 'token de propriété invalide — refus fail-closed',
    };
  }
  if (!lockIsStale(lock, config.lockMaxAgeMs)) {
    return { cleared: false, reason: `lock valide (pid ${lock.pid})` };
  }
  const acquired = acquireLock(stateDir, config);
  if (!acquired.acquired) return { cleared: false, reason: acquired.reason };
  const staleProof = fs.readdirSync(stateDir)
    .map((name) => path.join(stateDir, name))
    .filter((file) => path.basename(file).startsWith('factory.lock.stale-'))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  releaseLock(stateDir);
  appendLog(stateDir, 'LOCK_CLEARED_MANUAL', { old: lock, proof: staleProof });
  return {
    cleared: true,
    reason: staleProof
      ? `lock stale retiré (preuve: ${path.basename(staleProof)})`
      : 'lock stale retiré',
  };
}

// ============================================================
// Logs structurés JSONL + heartbeat
// ============================================================
function appendLog(stateDir, event, data = {}) {
  const dir = path.join(stateDir, 'logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...data }) + '\n';
    fs.appendFileSync(path.join(dir, `factory-${new Date().toISOString().slice(0, 10)}.jsonl`), line);
  } catch (cause) {
    const error = new Error(`LOG_WRITE_FAILED: ${event}`);
    error.code = 'LOG_WRITE_FAILED';
    error.cause = cause;
    throw error;
  }
}

function writeHeartbeat(stateDir, currentJobId, cycleCount) {
  const mem = process.memoryUsage();
  writeJsonAtomic(path.join(stateDir, 'heartbeat.json'), {
    pid: process.pid,
    host: os.hostname(),
    at: new Date().toISOString(),
    cycleCount,
    currentJobId: currentJobId || null,
    rssMB: Math.round(mem.rss / 1024 / 1024),
    uptimeS: Math.round(process.uptime())
  });
}

// ============================================================
// Queue persistante + claims atomiques (anti-doublon)
// ============================================================
const QUEUE_VERSION = 2;

function emptyQueue() {
  return { version: QUEUE_VERSION, updatedAt: null, jobs: [] };
}

function normalizeQueue(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.jobs)) {
    const error = new Error(`QUEUE_CORRUPT: structure invalide (${source})`);
    error.code = 'QUEUE_CORRUPT';
    throw error;
  }
  const version = Number(raw.version);
  if (!Number.isInteger(version) || version < 1 || version > QUEUE_VERSION) {
    const error = new Error(`QUEUE_CORRUPT: version invalide (${source})`);
    error.code = 'QUEUE_CORRUPT';
    throw error;
  }
  const jobIds = new Set();
  const allowedStatuses = new Set(['PENDING', 'RUNNING', 'DONE', 'BLOCKED', 'PARKED']);
  for (const [index, job] of raw.jobs.entries()) {
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      const error = new Error(`QUEUE_CORRUPT: job[${index}] invalide (${source})`);
      error.code = 'QUEUE_CORRUPT';
      throw error;
    }
    for (const field of ['jobId', 'repo', 'status']) {
      if (typeof job[field] !== 'string' || !job[field]) {
        const error = new Error(`QUEUE_CORRUPT: job[${index}].${field} invalide (${source})`);
        error.code = 'QUEUE_CORRUPT';
        throw error;
      }
    }
    if (!allowedStatuses.has(job.status)) {
      const error = new Error(`QUEUE_CORRUPT: statut invalide pour ${job.jobId} (${source})`);
      error.code = 'QUEUE_CORRUPT';
      throw error;
    }
    if (jobIds.has(job.jobId)) {
      const error = new Error(`QUEUE_CORRUPT: jobId dupliqué ${job.jobId} (${source})`);
      error.code = 'QUEUE_CORRUPT';
      throw error;
    }
    jobIds.add(job.jobId);
  }
  raw.version = QUEUE_VERSION;
  return raw;
}

function readQueue(stateDir) {
  const file = path.join(stateDir, 'queue.json');
  if (!fs.existsSync(file)) {
    const backup = `${file}.bak`;
    if (!fs.existsSync(backup)) return emptyQueue();
    try {
      const recovered = normalizeQueue(JSON.parse(fs.readFileSync(backup, 'utf8')), backup);
      // Le backup sain est réinstallé comme état principal sans être écrasé.
      writeQueue(stateDir, recovered);
      return recovered;
    } catch (backupError) {
      const error = new Error(`QUEUE_CORRUPT: ${file}`);
      error.code = 'QUEUE_CORRUPT';
      error.cause = backupError;
      throw error;
    }
  }
  try {
    return normalizeQueue(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  } catch (primaryError) {
    const backup = `${file}.bak`;
    try {
      const recovered = normalizeQueue(JSON.parse(fs.readFileSync(backup, 'utf8')), backup);
      // Préserver la copie corrompue pour diagnostic, puis réinstaller le
      // backup sain comme état principal. `writeQueue` ne remplacera pas le
      // backup sain car la copie principale échoue à la validation stricte.
      let corruptProof = null;
      if (fs.existsSync(file)) {
        corruptProof = `${file}.corrupt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        fs.copyFileSync(file, corruptProof);
      }
      writeQueue(stateDir, recovered);
      appendLog(stateDir, 'QUEUE_RECOVERED_FROM_BACKUP', {
        file,
        backup,
        corruptProof,
        error: String(primaryError && primaryError.message || primaryError),
      });
      return recovered;
    } catch (backupError) {
      const error = new Error(`QUEUE_CORRUPT: ${file}`);
      error.code = 'QUEUE_CORRUPT';
      error.cause = primaryError;
      error.backupCause = backupError;
      throw error;
    }
  }
}

function writeQueue(stateDir, queue) {
  const file = path.join(stateDir, 'queue.json');
  const normalized = normalizeQueue(queue, file);
  normalized.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // La copie de secours n'est remplacée que par un état principal VALID.
  // Une queue corrompue ne peut donc jamais effacer la dernière version saine.
  try {
    const current = fs.readFileSync(file, 'utf8');
    normalizeQueue(JSON.parse(current), file);
    const backupTmp = `${file}.bak.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    fs.writeFileSync(backupTmp, current);
    fs.renameSync(backupTmp, `${file}.bak`);
  } catch (_) { /* absence ou corruption : conserver le backup existant */ }
  writeJsonAtomic(file, normalized);
}

/** Sérialise TOUTE mutation de queue (enqueue, claim, recovery, update). */
function withQueueLock(stateDir, mutator, opts = {}) {
  const lockFile = path.join(stateDir, 'queue.json.lock');
  const lock = registryLib.acquireLockFile(lockFile, Number(opts.lockTimeoutMs) || 5000, {
    staleMs: Number(opts.staleMs) || 5 * 60 * 1000,
    meta: { host: os.hostname(), kind: 'factory-queue' },
  });
  if (!lock.ok) {
    const error = new Error(`QUEUE_LOCK_TIMEOUT: ${stateDir}`);
    error.code = 'QUEUE_LOCK_TIMEOUT';
    throw error;
  }
  try {
    return mutator(readQueue(stateDir));
  } finally {
    registryLib.releaseLockFile(lockFile, lock.token);
  }
}

function newJobId() {
  return `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function assertValidBranch(branch) {
  const value = String(branch || '');
  try {
    execFileSync('git', ['check-ref-format', '--branch', value], { stdio: 'ignore' });
  } catch (_) {
    const error = new Error(`BRANCH_INVALID: ${value}`);
    error.code = 'BRANCH_INVALID';
    throw error;
  }
  return value;
}

function enqueue(stateDir, spec) {
  const cfg = loadConfig(stateDir);
  if (!spec || !cfg.repos[spec.repo]) throw new Error(`repo inconnu: ${spec && spec.repo}`);
  if (!spec.task || String(spec.task).trim().length < 8) throw new Error('task requise (>= 8 caractères)');
  const jobId = newJobId();
  const branch = String(spec.branch || `agent/factory/${jobId}`);
  assertValidBranch(branch);
  const worktree = spec.worktree
    ? path.resolve(String(spec.worktree))
    : null;
  const job = withQueueLock(stateDir, (queue) => {
    const created = {
      jobId,
      repo: spec.repo,
      task: String(spec.task),
      branch,
      severity: Number.isFinite(spec.severity) ? spec.severity : 2,
      createPr: !!spec.createPr,
      // Le contrat de résultat fait partie du job : il doit survivre à la
      // serialisation queue → claim → reprise après restart.
      verify: spec.verify && typeof spec.verify === 'object' ? spec.verify : null,
      worktree,
      expectedImpact: spec.expectedImpact || null,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: cfg.maxAttempts,
      nextRetryAt: null,
      claimedBy: null,
      evidence: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    queue.jobs.push(created);
    writeQueue(stateDir, queue);
    return created;
  });
  appendLog(stateDir, 'JOB_ENQUEUED', { jobId: job.jobId, repo: job.repo, task: job.task });
  return job;
}

function computeBackoff(cfg, attempt) {
  const ms = cfg.backoffBaseMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(ms, cfg.backoffMaxMs);
}

// Claim atomique : PREMIER job PENDING éligible → RUNNING avec claimedBy.
// Un job RUNNING n'est JAMAIS re-claimé (anti-doublon).
function claimNextJob(stateDir, cfg) {
  const claimed = withQueueLock(stateDir, (queue) => {
    const now = Date.now();
    const priority = Array.isArray(cfg && cfg.repoPriority) ? cfg.repoPriority : ['botwow', 'sargagame'];
    const priorityRank = (repo) => {
      const index = priority.indexOf(repo);
      return index === -1 ? priority.length : index;
    };
    const eligible = queue.jobs
      .filter(j => j.status === 'PENDING' && (!j.nextRetryAt || Date.parse(j.nextRetryAt) <= now))
      .sort((a, b) => {
        const repoDelta = priorityRank(a.repo) - priorityRank(b.repo);
        if (repoDelta !== 0) return repoDelta;
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      });
    if (eligible.length === 0) return null;
    const job = eligible[0];
    const claimToken = crypto.randomBytes(16).toString('hex');
    job.status = 'RUNNING';
    job.claimToken = claimToken;
    job.claimedBy = {
      pid: process.pid,
      host: os.hostname(),
      startedAt: new Date().toISOString(),
      claimToken,
      runnerToken: heldRunnerLock ? heldRunnerLock.token : null,
    };
    job.updatedAt = new Date().toISOString();
    writeQueue(stateDir, queue);
    return job;
  });
  if (claimed) appendLog(stateDir, 'JOB_CLAIMED', { jobId: claimed.jobId, pid: process.pid, claimToken: claimed.claimToken });
  return claimed;
}

// Recovery : RUNNING dont le runner est mort → PENDING (backoff). Jamais de perte silencieuse.
function recoverOrphans(stateDir, cfg) {
  return withQueueLock(stateDir, (queue) => {
    let recovered = 0;
    for (const job of queue.jobs) {
      if (job.status !== 'RUNNING') continue;
      const pid = job.claimedBy && job.claimedBy.pid;
      const claimRunnerToken = job.claimedBy && job.claimedBy.runnerToken;
      const activeRunnerToken = (heldRunnerLock && heldRunnerLock.token)
        || (readJson(path.join(stateDir, 'factory.lock'), null) || {}).token
        || null;
      const sameRunnerGeneration = !claimRunnerToken || !activeRunnerToken
        || claimRunnerToken === activeRunnerToken;
      // Un PID seul ne suffit pas : après réutilisation de PID, le token de
      // génération distingue l'ancien runner du nouveau.
      if (pid && pidAlive(pid) && sameRunnerGeneration) continue;
      job.status = 'PENDING';
      job.attempts = (job.attempts || 0) + 1;
      job.nextRetryAt = new Date(Date.now() + computeBackoff(cfg, job.attempts)).toISOString();
      job.claimedBy = null;
      job.claimToken = null;
      job.updatedAt = new Date().toISOString();
      job.recoveryNote = 'recoverOrphans: runner mort, job re-queued avec backoff';
      recovered++;
      appendLog(stateDir, 'JOB_RECOVERED', { jobId: job.jobId, attempts: job.attempts });
    }
    if (recovered > 0) writeQueue(stateDir, queue);
    return recovered;
  });
}

function updateJob(stateDir, jobId, patch, opts = {}) {
  return withQueueLock(stateDir, (queue) => {
    const job = queue.jobs.find(j => j.jobId === jobId);
    if (!job) return null;
    const expectedClaimToken = opts.expectedClaimToken || null;
    const liveClaimToken = job.claimedBy && job.claimedBy.claimToken;
    // Un job RUNNING ne peut être muté que par le détenteur EXACT de son
    // claim. L'absence de token n'est jamais une invitation à contourner le
    // contrôle : c'est un refus fail-closed.
    const claimRequired = job.status === 'RUNNING';
    const claimInvalid = (claimRequired && !expectedClaimToken)
      || (expectedClaimToken && liveClaimToken !== expectedClaimToken);
    if (claimInvalid) {
      appendLog(stateDir, 'JOB_UPDATE_REJECTED', {
        jobId,
        intendedEvent: opts.event || null,
        reason: claimRequired && !expectedClaimToken
          ? 'token de claim absent'
          : 'token de claim différent',
        expectedClaimToken: expectedClaimToken || null,
        liveClaimToken: liveClaimToken || null,
      });
      return null;
    }
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    if (patch.status && patch.status !== 'RUNNING') {
      job.claimToken = null;
      job.claimedBy = null;
    }
    writeQueue(stateDir, queue);
    return job;
  });
}

/**
 * Applique une transition de queue puis la journalise UNIQUEMENT si la
 * mutation a été acceptée par le propriétaire du claim.
 */
function transitionJob(stateDir, jobId, patch, opts, event, data = {}) {
  const updated = updateJob(stateDir, jobId, patch, Object.assign({}, opts, { event }));
  if (!updated) return false;
  appendLog(stateDir, event, Object.assign({ jobId }, data));
  return true;
}

/**
 * Vérifie que le worker possessé du job détient toujours le claim courant.
 * Cette vérification est relue avant les effets externes (agent, publication)
 * et la transition finale reste elle-même protégée par `updateJob`.
 */
function claimStillOwned(stateDir, job) {
  const expected = job && (job.claimToken || (job.claimedBy && job.claimedBy.claimToken)) || null;
  if (!expected) return false;
  const live = readQueue(stateDir).jobs.find((item) => item.jobId === job.jobId);
  if (!live || live.status !== 'RUNNING') return false;
  const liveToken = live.claimToken || (live.claimedBy && live.claimedBy.claimToken) || null;
  return liveToken === expected;
}

// ============================================================
// Workspace de job : branche dédiée + worktree isolé
// ============================================================
async function gitCommand(cwd, args, timeoutMs = 120_000) {
  return runProcess({ file: 'git', args, cwd, timeoutMs });
}

async function ghCommand(cwd, args, timeoutMs = 120_000) {
  return runProcess({ file: 'gh', args, cwd, timeoutMs });
}

function commandTail(result, limit = 800) {
  return String((result && result.stdout) || '').concat(String((result && result.stderr) || '')).trim().slice(-limit);
}

function parseJsonOutput(result) {
  try {
    return JSON.parse(String(result && result.stdout || '').trim());
  } catch (_) {
    return null;
  }
}

/**
 * Publie le commit produit par le job et vérifie les OID réels.
 *
 * Aucun shell n'est utilisé : chaque tâche et chaque branche est un argument
 * distinct. Le push n'est jamais forcé. Le SHA distant est relu avec
 * `git ls-remote`, puis le head de la PR est relu avec `gh pr view` : une URL
 * seule ne suffit jamais à prouver la publication.
 */
async function publishJob({ stateDir, cfg, job, repoCfg, agent, gate, deps = {} }) {
  const git = deps.git || gitCommand;
  const gh = deps.gh || ghCommand;
  const branch = assertValidBranch(job.branch);
  const baseBranch = assertValidBranch(String(
    repoCfg.baseBranch
    || repoCfg.defaultBranch
    || ((cfg.repos && cfg.repos[job.repo] && cfg.repos[job.repo].defaultBranch) || 'main'),
  ));
  const expectedSha = String(agent && agent.committedSha || '');
  const result = {
    ok: false,
    verdict: 'PUBLISH_BLOCKED',
    reason: null,
    branch,
    baseBranch,
    expectedSha: expectedSha || null,
    remoteSha: null,
    push: null,
    pr: null,
  };

  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) {
    result.reason = `SHA de publication invalide: ${expectedSha || 'absent'}`;
    return result;
  }
  if (branch === baseBranch) {
    result.reason = `La branche du job (${branch}) doit être differente de la branche de base (${baseBranch})`;
    return result;
  }

  const current = await git(repoCfg.local, ['branch', '--show-current']);
  if (current.exitCode !== 0 || current.timedOut || String(current.stdout || '').trim() !== branch) {
    result.reason = `Branche courante incompatible avec le job: ${String(current.stdout || '').trim() || 'inconnue'} (attendu ${branch})`;
    return result;
  }
  const localHead = await git(repoCfg.local, ['rev-parse', 'HEAD']);
  const localSha = String(localHead.stdout || '').trim();
  if (localHead.exitCode !== 0 || localHead.timedOut || localSha !== expectedSha) {
    result.reason = `HEAD local ${localSha || 'invalide'} != commit produit ${expectedSha}`;
    return result;
  }

  const push = await git(repoCfg.local, [
    'push',
    '--set-upstream',
    'origin',
    `HEAD:refs/heads/${branch}`,
  ], 180_000);
  result.push = {
    exitCode: push.exitCode,
    timedOut: !!push.timedOut,
    tail: commandTail(push),
  };
  if (push.exitCode !== 0 || push.timedOut) {
    result.reason = `push de la branche ${branch} impossible — aucune publication declaree`;
    return result;
  }

  const remote = await git(repoCfg.local, [
    'ls-remote',
    '--heads',
    'origin',
    `refs/heads/${branch}`,
  ], 120_000);
  const remoteLine = String(remote.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith(`refs/heads/${branch}`));
  const remoteSha = remoteLine ? String(remoteLine.split(/\s+/)[0] || '') : '';
  result.remoteSha = remoteSha || null;
  if (remote.exitCode !== 0 || remote.timedOut || !/^[0-9a-f]{40}$/i.test(remoteSha) || remoteSha !== expectedSha) {
    result.reason = `SHA distant ${remoteSha || 'absent'} != commit attendu ${expectedSha}`;
    return result;
  }

  if (!job.createPr) {
    result.ok = true;
    result.verdict = 'VERIFIED';
    result.reason = `branche ${branch} pushed et SHA distant vérifié (${expectedSha})`;
    return result;
  }

  const bodyFile = path.join(stateDir, 'prompts', `${job.jobId}.pr-body.md`);
  const safeTitle = String(job.task || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  try {
    fs.mkdirSync(path.dirname(bodyFile), { recursive: true });
    fs.writeFileSync(bodyFile, [
      `## Job ${job.jobId} — ${job.task}`,
      '',
      `Repo: ${job.repo} · Branche: ${branch} · Base: ${baseBranch}`,
      `Commit: ${expectedSha}`,
      `Gates: ${((gate && gate.results) || []).map((item) => `${item.id}=${item.exitCode}`).join(', ')}`,
      `Modèle demandé: ${agent.requestedModel || agent.model || 'non renseigné'}`,
      `Modèle observé: ${agent.resolvedModel || 'non vérifié'}`,
      `Fournisseur: ${agent.provider || 'non vérifié'}`,
      `Session: ${agent.sessionId || 'non vérifiée'}`,
      `Verdict agent: ${agent.completionMarker ? 'FACTORY_DONE observé' : 'FACTORY_DONE absent'}`,
      '',
      `Rollback: revert du commit ${expectedSha}.`,
    ].join('\n'));
  } catch (cause) {
    result.verdict = 'PR_BLOCKED';
    result.reason = `Corps de PR non écrit: ${String(cause && cause.message || cause)}`;
    return result;
  }

  const list = await gh(repoCfg.local, [
    'pr', 'list',
    '--head', branch,
    '--base', baseBranch,
    '--state', 'open',
    '--json', 'number,url,state,headRefName,headRefOid,baseRefName',
  ], 120_000);
  let pr = null;
  if (list.exitCode === 0 && !list.timedOut) {
    const parsed = parseJsonOutput(list);
    if (!Array.isArray(parsed)) {
      result.verdict = 'PR_BLOCKED';
      result.reason = `sortie JSON de gh pr list invalide: ${commandTail(list, 300) || 'aucune liste'}`;
      return result;
    }
    pr = parsed[0] || null;
  } else {
    result.verdict = 'PR_BLOCKED';
    result.reason = `impossible de lister les PR ouvertes: ${commandTail(list, 300)}`;
    return result;
  }

  if (!pr) {
    const created = await gh(repoCfg.local, [
      'pr', 'create',
      '--title', `factory: ${safeTitle}`,
      '--body-file', bodyFile,
      '--base', baseBranch,
      '--head', branch,
    ], 180_000);
    const createdText = commandTail(created, 2000);
    const urlMatch = createdText.match(/https:\/\/github\.com\/[^\s]+/i);
    result.pr = {
      created: true,
      exitCode: created.exitCode,
      timedOut: !!created.timedOut,
      url: urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : null,
      tail: createdText.slice(-800),
    };
    if (created.exitCode !== 0 || created.timedOut || !result.pr.url) {
      result.verdict = 'PR_BLOCKED';
      result.reason = `création de PR impossible: ${createdText.slice(-300) || 'aucune URL'}`;
      return result;
    }
    pr = { number: null, url: result.pr.url };
  } else {
    result.pr = {
      created: false,
      exitCode: 0,
      timedOut: false,
      url: pr.url || null,
      number: pr.number || null,
      tail: '',
    };
  }

  const viewTarget = pr.number != null ? String(pr.number) : result.pr.url;
  const view = await gh(repoCfg.local, [
    'pr', 'view', viewTarget,
    '--json', 'number,url,state,headRefName,headRefOid,baseRefName',
  ], 120_000);
  const viewed = parseJsonOutput(view);
  result.pr.verification = {
    exitCode: view.exitCode,
    timedOut: !!view.timedOut,
    headRefOid: viewed && viewed.headRefOid ? viewed.headRefOid : null,
    headRefName: viewed && viewed.headRefName ? viewed.headRefName : null,
    baseRefName: viewed && viewed.baseRefName ? viewed.baseRefName : null,
    state: viewed && viewed.state ? viewed.state : null,
    number: viewed && viewed.number != null ? viewed.number : null,
    url: viewed && viewed.url ? viewed.url : (result.pr.url || null),
    tail: commandTail(view, 500),
  };
  if (view.exitCode !== 0 || view.timedOut || !viewed) {
    result.verdict = 'PR_BLOCKED';
    result.reason = `PR créée mais head non vérifiable: ${commandTail(view, 300)}`;
    return result;
  }
  if (viewed.headRefOid !== expectedSha || viewed.headRefName !== branch || viewed.baseRefName !== baseBranch) {
    result.verdict = 'PR_BLOCKED';
    result.reason = `head de PR invalide (oid=${viewed.headRefOid || 'absent'}, branche=${viewed.headRefName || 'absent'}, base=${viewed.baseRefName || 'absent'}) — SHA attendu ${expectedSha}`;
    return result;
  }

  result.ok = true;
  result.verdict = 'VERIFIED';
  result.reason = `branche ${branch} pushed, SHA distant et head de PR vérifiés (${expectedSha})`;
  return result;
}

/**
 * Prépare un workspace Git réellement isolé pour le job.
 *
 * - un `job.worktree` absent est créé via `git worktree add` ;
 * - la branche du job est créée/sélectionnée sans reset ni force ;
 * - un changement de branche sur un arbre sale est refusé (aucun écrasement) ;
 * - le workspace existant d'une reprise est conservé tel quel.
 */
async function prepareJobWorkspace(cfg, repoCfg, job) {
  const branch = assertValidBranch(job.branch);
  const baseBranch = assertValidBranch(
    repoCfg.baseBranch || repoCfg.defaultBranch || 'main',
  );
  const source = path.resolve(repoCfg.local);
  const worktreeRoot = path.resolve(
    (cfg && cfg.worktreeRoot) || path.resolve(__dirname, '../../../factory-v3'),
  );
  const safeJobId = String(job.jobId || 'job')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120) || 'job';
  const safeRepo = String(job.repo || 'repo').replace(/[^a-zA-Z0-9._-]/g, '_');
  // Un job sans worktree explicite reçoit TOUJOURS un worktree dédié. Le
  // checkout principal reste hors de portée de l'agent et de la publication.
  const local = job.worktree
    ? path.resolve(job.worktree)
    : path.join(worktreeRoot, `${safeRepo}-${safeJobId}`);
  let createdWorktree = false;

  if (!fs.existsSync(local)) {
    fs.mkdirSync(path.dirname(local), { recursive: true });
    // La branche part de la base déclarée, jamais du HEAD de la feature
    // checkout sur laquelle le runner se trouve par hasard.
    let add = await gitCommand(source, ['worktree', 'add', '-b', branch, local, baseBranch]);
    if (add.exitCode !== 0 || add.timedOut) {
      // La branche peut déjà exister : on rattache alors le worktree sans
      // `-b`, toujours sans reset ni force-push.
      add = await gitCommand(source, ['worktree', 'add', local, branch]);
    }
    if (add.exitCode !== 0 || add.timedOut) {
      const error = new Error(`WORKTREE_CREATE_FAILED: ${local} — ${(add.stderr || add.stdout || '').trim().slice(-500)}`);
      error.code = 'WORKTREE_CREATE_FAILED';
      throw error;
    }
    createdWorktree = true;
  }

  const top = await gitCommand(local, ['rev-parse', '--show-toplevel']);
  if (top.exitCode !== 0 || top.timedOut) {
    const error = new Error(`WORKTREE_INVALID: ${local}`);
    error.code = 'WORKTREE_INVALID';
    throw error;
  }

  // Un chemin existant doit être un worktree du DÉPÔT SOURCE, pas un clone
  // arbitraire. On compare le common-dir Git canonique des deux côtés.
  const sourceCommon = await gitCommand(source, ['rev-parse', '--git-common-dir']);
  const localCommon = await gitCommand(local, ['rev-parse', '--git-common-dir']);
  if (sourceCommon.exitCode !== 0 || localCommon.exitCode !== 0
    || sourceCommon.timedOut || localCommon.timedOut) {
    const error = new Error(`WORKTREE_INVALID: ${local} — dépôt source illisible`);
    error.code = 'WORKTREE_INVALID';
    throw error;
  }
  const canonicalGitDir = (cwd, value) => {
    const candidate = path.resolve(cwd, String(value || '').trim());
    try { return fs.realpathSync(candidate); } catch (_) { return candidate; }
  };
  if (canonicalGitDir(source, sourceCommon.stdout) !== canonicalGitDir(local, localCommon.stdout)) {
    const error = new Error(`WORKTREE_WRONG_REPOSITORY: ${local} — worktree hors du dépôt source`);
    error.code = 'WORKTREE_WRONG_REPOSITORY';
    throw error;
  }

  let current = await gitCommand(local, ['branch', '--show-current']);
  let currentBranch = String(current.stdout || '').trim();
  if (current.exitCode !== 0 || current.timedOut) {
    const error = new Error(`WORKTREE_BRANCH_INVALID: ${local}`);
    error.code = 'WORKTREE_BRANCH_INVALID';
    throw error;
  }
  if (currentBranch !== branch) {
    const status = await gitCommand(local, ['status', '--porcelain', '-uall']);
    if (status.exitCode !== 0 || status.timedOut) {
      const error = new Error(`WORKTREE_STATUS_FAILED: ${local}`);
      error.code = 'WORKTREE_STATUS_FAILED';
      throw error;
    }
    if (String(status.stdout || '').trim()) {
      const error = new Error(`WORKTREE_DIRTY: ${local} — changement de branche refusé pour ne pas écraser du travail`);
      error.code = 'WORKTREE_DIRTY';
      throw error;
    }
    const exists = await gitCommand(local, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    const switched = await gitCommand(
      local,
      exists.exitCode === 0 ? ['switch', branch] : ['switch', '-c', branch],
    );
    if (switched.exitCode !== 0 || switched.timedOut) {
      const error = new Error(`BRANCH_SWITCH_FAILED: ${branch} — ${(switched.stderr || switched.stdout || '').trim().slice(-500)}`);
      error.code = 'BRANCH_SWITCH_FAILED';
      throw error;
    }
    current = await gitCommand(local, ['branch', '--show-current']);
    currentBranch = String(current.stdout || '').trim();
  }

  const head = await gitCommand(local, ['rev-parse', 'HEAD']);
  const headSha = String(head.stdout || '').trim();
  if (head.exitCode !== 0 || !/^[0-9a-f]{40}$/i.test(headSha)) {
    const error = new Error(`WORKTREE_HEAD_INVALID: ${local}`);
    error.code = 'WORKTREE_HEAD_INVALID';
    throw error;
  }

  return {
    local,
    source,
    baseBranch,
    branch: currentBranch,
    head: headSha,
    createdWorktree,
    repositoryRoot: String(top.stdout || '').trim(),
  };
}

// ============================================================
// Exécution RÉELLE de processus (timeout + kill de l'arbre + windowsHide)
// ============================================================
/**
 * Exécution robuste d'une étape (gate ou commande).
 *
 * CORRECTION d'un bug réel (job job-1794676119497-1f224f, 2026-11-14) :
 * avec `stdio: 'pipe'`, un petit-fils (opencode.exe) hérite des handles stdout
 * du powershell parent ; même après la mort du parent, le pipe reste ouvert →
 * l'événement 'close' de Node ne se déclenche JAMAIS → le runner reste bloqué
 * (41 min de hang observées, runner CPU 0,1 s).
 * Correctif : redirection stdout/stderr vers des FICHIERS (aucun handle hérité),
 * kill de l'arbre Windows systématique, résolution immédiate au timeout.
 */
function execStep(cmd, { cwd, timeoutMs } = {}) {
  return runShell(cmd, { cwd, timeoutMs: timeoutMs || 60000 }).then((r) => ({
    exitCode: r.exitCode,
    timedOut: r.timedOut || r.idleTimedOut,
    stdout: r.stdout,
    stderr: r.stderr,
    durationMs: r.durationMs,
  }));
}

// ============================================================
// Étape AGENT — exécution réelle via opencode CLI (bascule automatique)
// ============================================================

/**
 * Étape AGENT — exécution réelle via le moteur de bascule automatique.
 *
 * Le routage de modèle n'est plus une liste statique : l'inventaire est
 * découvert en direct via OpenCode (`opencode models --verbose`), filtré
 * (gratuit + outils + statut actif), classé (priorité Nvidia gratuit > autres
 * gratuits > locaux), puis les échecs de quota/rate/provider déclenchent une
 * bascule avec reprise de session et conservation du contexte.
 */
async function runAgentStage(stateDir, cfg, job, repoCfg) {
  const result = await executeJobWithFailover({
    stateDir,
    cfg,
    job,
    repoCfg,
    log: (event, data) => appendLog(stateDir, event, data),
  });
  return {
    ok: result.ok,
    model: result.model,
    requestedModel: result.requestedModel,
    resolvedModel: result.resolvedModel,
    provider: result.provider,
    modelVerified: result.modelVerified === true,
    providerVerified: result.providerVerified === true,
    sessionSeen: result.sessionSeen === true,
    completionMarker: result.completionMarker === true,
    replacementModel: result.replacementModel,
    finalResult: result.finalResult,
    totalDurationMs: result.totalDurationMs,
    sessionId: result.sessionId,
    attempts: result.attempts,
    failovers: result.failovers,
    resumes: result.resumes,
    committedSha: result.committedSha,
    commitVerified: result.commitVerified === true,
    dirtyFiles: result.dirtyFiles,
    interruptedWithCommit: result.interruptedWithCommit,
    skipped: result.skipped,
    spend: result.spend,
    error: result.error,
    errorCategory: result.errorCategory,
    exitCode: result.ok ? 0 : 1,
    timedOut: (result.attempts || []).some((a) => a.timedOut || a.idleTimedOut),
  };
}

// ============================================================
// Étape GATES — véritables gates de livraison (codes de sortie réels)
// ============================================================
async function runGateStage(stateDir, cfg, job, repoCfg) {
  const steps = repoCfg.gates || [];
  if (steps.length === 0) {
    return { allPassed: false, skipped: true, results: [], error: 'AUCUN_GATE_CONFIGURE: impossible de prouver la livraison' };
  }
  const results = [];
  let allPassed = true;
  for (const step of steps) {
    appendLog(stateDir, 'GATE_START', { jobId: job.jobId, gate: step.id });
    const r = await execStep(step.cmd, { cwd: repoCfg.local, timeoutMs: cfg.stepTimeoutMs.gate });
    results.push({ id: step.id, cmd: step.cmd, exitCode: r.exitCode, timedOut: r.timedOut, tail: r.stdout.slice(-1200) });
    if (r.exitCode !== 0 || r.timedOut) { allPassed = false; break; }
  }
  return { allPassed, skipped: false, results };
}

// ============================================================
// Verdict — STRICT : jamais de succès sans preuve complète
// ============================================================
function computeVerdict(agent, gate) {
  if (!agent) return { verdict: 'FAILED', reason: 'agent non exécuté' };
  // Quota épuisé partout : ce n'est PAS un échec de mission → reprise programmée.
  if (agent.errorCategory === 'ALL_MODELS_IN_COOLDOWN') {
    return { verdict: 'WAIT_QUOTA', reason: agent.error || 'tous les modèles sont en cooldown — reprise automatique programmée' };
  }
  if (agent.errorCategory === 'ALL_MODELS_PROVIDER_UNAVAILABLE') {
    return { verdict: 'WAIT_PROVIDER', reason: agent.error || 'tous les fournisseurs sont temporairement indisponibles — reprise automatique programmée' };
  }
  // Un agent en échec ne produit jamais VERIFIED, même s'il a laissé un commit
  // avant interruption. Le commit est une preuve, pas un succès de mission.
  if (!agent.ok) return { verdict: 'FAILED', reason: (agent.error) || 'agent en échec' };
  if (agent.modelVerified !== true || agent.providerVerified !== true || agent.sessionSeen !== true) {
    return { verdict: 'FAILED', reason: 'modèle, fournisseur ou session observés non vérifiés — aucun faux succès' };
  }
  if (agent.completionMarker !== true) {
    return { verdict: 'FAILED', reason: 'marqueur FACTORY_DONE absent — résultat non prouvé' };
  }
  if (agent.dirtyFiles > 0) return { verdict: 'BLOCKED_UNCOMMITTED', reason: `${agent.dirtyFiles} fichier(s) modifié(s) non commités par l'agent` };
  if (!gate || !gate.allPassed) return { verdict: 'FAILED', reason: 'gates de livraison en échec' };
  if (agent.committedSha) {
    if (!/^[0-9a-f]{40}$/i.test(String(agent.committedSha))) {
      return { verdict: 'FAILED', reason: `SHA de commit invalide: ${agent.committedSha}` };
    }
    if (agent.commitVerified !== true) {
      return { verdict: 'FAILED', reason: `commit ${agent.committedSha} introuvable ou non reachable depuis HEAD` };
    }
    return { verdict: 'VERIFIED', reason: `commit ${agent.committedSha} + gates verts` };
  }
  return { verdict: 'DONE_NO_CHANGE', reason: 'aucune modification nécessaire (légitime) + gates verts' };
}

/** Date de fin de cooldown la plus proche (tous modèles) — sert à reprogrammer un job. */
function earliestCooldownMs(stateDir) {
  const reg = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  const now = Date.now();
  let min = Infinity;
  for (const e of Object.values(reg.models || {})) {
    for (const value of [e.cooldownUntil, e.notBefore]) {
      if (!value) continue;
      const t = Date.parse(value);
      if (Number.isFinite(t) && t > now && t < min) min = t;
    }
  }
  for (const p of Object.values(reg.providers || {})) {
    for (const value of [p.cooldownUntil, p.notBefore]) {
      if (!value) continue;
      const t = Date.parse(value);
      if (Number.isFinite(t) && t > now && t < min) min = t;
    }
  }
  return Number.isFinite(min) ? min : null;
}

// ============================================================
// Pipeline d'un job
// ============================================================
async function processJob(stateDir, cfg, job) {
  const configuredRepoCfg = cfg.repos[job.repo];
  writeHeartbeat(stateDir, job.jobId, 0);

  const evidence = {
    job_id: job.jobId, repo: job.repo, task: job.task, branch: job.branch,
    runner: { pid: process.pid, host: os.hostname() },
    workspace: null,
    agent: null, gates: null, verdict: null, reason: null,
    attempts: job.attempts || 0,
    timestamps: { startedAt: new Date().toISOString() }
  };
  const evidenceFile = path.join(stateDir, 'evidence', `${job.jobId}.json`);
  const saveEvidence = () => {
    try {
      writeJsonAtomic(evidenceFile, evidence);
    } catch (cause) {
      const error = new Error(`EVIDENCE_WRITE_FAILED: ${evidenceFile}`);
      error.code = 'EVIDENCE_WRITE_FAILED';
      error.cause = cause;
      throw error;
    }
  };
  // La preuve initiale est obligatoire : sans fichier d'état lisible, le
  // runner ne doit pas lancer de fournisseur ni finir un job.
  saveEvidence();

  // --- Workspace Git réel : branche dédiée, worktree isolé, aucun reset ---
  let repoCfg = configuredRepoCfg;
  try {
    const workspace = await prepareJobWorkspace(cfg, configuredRepoCfg, job);
    repoCfg = Object.assign({}, configuredRepoCfg, { local: workspace.local });
    evidence.workspace = workspace;
    evidence.timestamps.workspace = new Date().toISOString();
    saveEvidence();
    appendLog(stateDir, 'WORKSPACE_READY', {
      jobId: job.jobId,
      repo: job.repo,
      branch: workspace.branch,
      local: workspace.local,
      head: workspace.head,
      createdWorktree: workspace.createdWorktree,
    });
  } catch (error) {
    const reason = String(error && error.message || error);
    evidence.workspace = { ok: false, code: error && error.code || 'WORKSPACE_FAILED', error: reason };
    evidence.verdict = 'FAILED';
    evidence.reason = reason;
    evidence.timestamps.endedAt = new Date().toISOString();
    saveEvidence();
    appendLog(stateDir, 'WORKSPACE_FAILED', { jobId: job.jobId, repo: job.repo, error: reason });
    const expectedClaimToken = job.claimToken || (job.claimedBy && job.claimedBy.claimToken) || null;
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = Number(job.maxAttempts || cfg.maxAttempts || 1);
    let queueUpdated = false;
    if (attempts >= maxAttempts) {
      queueUpdated = transitionJob(stateDir, job.jobId, {
        status: 'PARKED', attempts, evidence,
        quotaWait: false,
        providerWait: false,
      }, { expectedClaimToken }, 'JOB_PARKED', { attempts, verdict: 'FAILED' });
    } else {
      const nextRetryAt = new Date(Date.now() + computeBackoff(cfg, attempts)).toISOString();
      queueUpdated = transitionJob(stateDir, job.jobId, {
        status: 'PENDING',
        attempts,
        evidence,
        nextRetryAt,
        quotaWait: false,
        providerWait: false,
      }, { expectedClaimToken }, 'JOB_RETRY_QUEUED', { attempts, verdict: 'FAILED' });
    }
    return { jobId: job.jobId, verdict: 'FAILED', queueUpdated };
  }

  // --- Étape agent (réelle) ---
  appendLog(stateDir, 'AGENT_STAGE_START', { jobId: job.jobId, repo: job.repo });
  const agent = await runAgentStage(stateDir, cfg, job, repoCfg);
  evidence.agent = agent; evidence.timestamps.agent = new Date().toISOString(); saveEvidence();

  // --- Étape gates (réelles) ---
  appendLog(stateDir, 'GATE_STAGE_START', { jobId: job.jobId, repo: job.repo });
  const gate = await runGateStage(stateDir, cfg, job, repoCfg);
  evidence.gates = gate; evidence.timestamps.gates = new Date().toISOString(); saveEvidence();

  // --- Verdict strict de l'AGENT (avant publication) ---
  let { verdict, reason } = computeVerdict(agent, gate);
  evidence.agentVerdict = verdict;
  evidence.agentReason = reason;
  evidence.timestamps.agentVerdictAt = new Date().toISOString();
  saveEvidence();
  appendLog(stateDir, 'AGENT_VERDICT', { jobId: job.jobId, verdict, reason });

  // --- Publication réelle : push sans force, SHA distant + head PR exacts ---
  if (verdict === 'VERIFIED') {
    const publication = await publishJob({ stateDir, cfg, job, repoCfg, agent, gate });
    evidence.publish = publication;
    if (!publication.ok) {
      verdict = publication.verdict || 'PUBLISH_BLOCKED';
      reason = publication.reason || 'publication non vérifiée';
    } else {
      reason = publication.reason || reason;
    }
  }

  // Le verdict final n'existe qu'APRÈS publication. Une preuve illisible ou
  // non écrite interdit toute transition DONE.
  evidence.verdict = verdict;
  evidence.reason = reason;
  evidence.timestamps.endedAt = new Date().toISOString();
  saveEvidence();
  appendLog(stateDir, 'FINAL_VERDICT', {
    jobId: job.jobId,
    verdict,
    reason,
    published: !!(evidence.publish && evidence.publish.ok),
    remoteSha: evidence.publish ? evidence.publish.remoteSha : null,
    prUrl: evidence.publish && evidence.publish.pr ? evidence.publish.pr.url : null,
  });

  // --- Mise à jour queue selon verdict ---
  const expectedClaimToken = job.claimToken || (job.claimedBy && job.claimedBy.claimToken) || null;
  let queueUpdated = false;
  if (verdict === 'VERIFIED' || verdict === 'DONE_NO_CHANGE') {
    queueUpdated = transitionJob(stateDir, job.jobId, {
      status: 'DONE', evidence,
      quotaWait: false,
      providerWait: false,
    }, { expectedClaimToken }, 'JOB_DONE', { verdict });
  } else if (verdict === 'BLOCKED_UNCOMMITTED') {
    queueUpdated = transitionJob(stateDir, job.jobId, {
      status: 'BLOCKED', evidence,
      quotaWait: false,
      providerWait: false,
    }, { expectedClaimToken }, 'JOB_BLOCKED', { reason });
  } else if (verdict === 'WAIT_QUOTA' || verdict === 'WAIT_PROVIDER') {
    // Quota/fournisseur indisponible : ce n'est pas une faute de la mission →
    // reprogrammation SANS consommer de tentative (le travail est différé).
    const next = earliestCooldownMs(stateDir) || (Date.now() + cfg.backoffBaseMs);
    const nextRetryAt = new Date(next).toISOString();
    queueUpdated = transitionJob(stateDir, job.jobId, {
      status: 'PENDING', evidence,
      nextRetryAt,
      quotaWait: verdict === 'WAIT_QUOTA',
      providerWait: verdict === 'WAIT_PROVIDER',
    }, { expectedClaimToken }, verdict === 'WAIT_QUOTA' ? 'JOB_QUOTA_WAIT' : 'JOB_PROVIDER_WAIT', {
      nextRetryAt,
      reason,
    });
  } else {
    const attempts = (job.attempts || 0) + 1;
    const maxAttempts = Number(job.maxAttempts || cfg.maxAttempts || 1);
    if (attempts >= maxAttempts) {
      queueUpdated = transitionJob(stateDir, job.jobId, {
        status: 'PARKED', attempts, evidence,
        quotaWait: false,
        providerWait: false,
      }, { expectedClaimToken }, 'JOB_PARKED', { attempts, verdict });
    } else {
      const nextRetryAt = new Date(Date.now() + computeBackoff(cfg, attempts)).toISOString();
      queueUpdated = transitionJob(stateDir, job.jobId, {
        status: 'PENDING', attempts, evidence,
        nextRetryAt,
        quotaWait: false,
        providerWait: false,
      }, { expectedClaimToken }, 'JOB_RETRY_QUEUED', { attempts, verdict });
    }
  }
  return { jobId: job.jobId, verdict, queueUpdated };
}

// ============================================================
// Boucle dispatcher
// ============================================================
async function runLoop(stateDir, cfg, { once = false, maxCycles = Infinity } = {}) {
  const lock = acquireLock(stateDir, cfg);
  if (!lock.acquired) { console.log(`[factory] ${lock.reason} — sortie (single-runner garanti)`); return; }
  let cycles = 0;
  let currentJobId = null;
  let lockLost = false;
  const heartbeatIntervalMs = Math.max(10_000, Number(cfg.heartbeatIntervalMs) || 60_000);
  const heartbeatTimer = setInterval(() => {
    try {
      const renewed = renewHeldLock(stateDir);
      if (!renewed) {
        lockLost = true;
        appendLog(stateDir, 'RUNNER_LOCK_LOST', { cycle: cycles, currentJobId });
        return;
      }
      writeHeartbeat(stateDir, currentJobId, cycles);
    } catch (error) {
      lockLost = true;
      appendLog(stateDir, 'RUNNER_LOCK_RENEW_FAILED', { cycle: cycles, error: String(error && error.message || error) });
    }
  }, heartbeatIntervalMs);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
  try {
    while (cycles < maxCycles) {
      if (lockLost || !renewHeldLock(stateDir)) {
        lockLost = true;
        throw new Error('RUNNER_LOCK_LOST: le runner ne possède plus son lock tokenisé');
      }
      cycles++;
      currentJobId = null;
      writeHeartbeat(stateDir, null, cycles);
      appendLog(stateDir, 'CYCLE_START', { cycle: cycles });
      const recovered = recoverOrphans(stateDir, cfg);
      if (recovered) console.log(`[factory] ${recovered} job(s) orphelin(s) récupéré(s)`);
      const job = claimNextJob(stateDir, cfg);
      if (job) {
        currentJobId = job.jobId;
        writeHeartbeat(stateDir, currentJobId, cycles);
        console.log(`[factory] job ${job.jobId} (${job.repo}) → exécution réelle`);
        appendLog(stateDir, 'JOB_STARTED', {
          jobId: job.jobId,
          repo: job.repo,
          task: job.task,
          claimToken: job.claimToken,
          cycle: cycles,
        });
        try { await processJob(stateDir, cfg, job); }
        catch (e) {
          appendLog(stateDir, 'JOB_CRASHED', { jobId: job.jobId, error: String(e && e.stack || e && e.message || e) });
          const attempts = (job.attempts || 0) + 1;
          const maxAttempts = Number(job.maxAttempts || cfg.maxAttempts || 1);
          const expectedClaimToken = job.claimToken || (job.claimedBy && job.claimedBy.claimToken) || null;
          if (attempts >= maxAttempts) {
            transitionJob(stateDir, job.jobId, {
              status: 'PARKED', attempts,
            }, { expectedClaimToken }, 'JOB_PARKED', { attempts, reason: 'JOB_CRASHED' });
          } else {
            const nextRetryAt = new Date(Date.now() + computeBackoff(cfg, attempts)).toISOString();
            transitionJob(stateDir, job.jobId, {
              status: 'PENDING', attempts, nextRetryAt,
            }, { expectedClaimToken }, 'JOB_RETRY_QUEUED', { attempts, reason: 'JOB_CRASHED' });
          }
        } finally {
          currentJobId = null;
        }
      } else if (!once) {
        appendLog(stateDir, 'CYCLE_IDLE', { cycle: cycles, nextCycleAt: new Date(Date.now() + cfg.cycleDelayMs).toISOString() });
        await new Promise(r => setTimeout(r, cfg.cycleDelayMs));
      }
      if (once) break;
    }
  } finally {
    clearInterval(heartbeatTimer);
    releaseLock(stateDir);
  }
}

// ============================================================
// CLI
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const has = (flag) => args.includes(flag);
  const stateDir = get('--state-dir') || STATE_DIR_DEFAULT;
  fs.mkdirSync(path.join(stateDir, 'evidence'), { recursive: true });
  const cfg = loadConfig(stateDir);

  if (has('--status')) {
    const lock = readJson(path.join(stateDir, 'factory.lock'), null);
    const hb = readJson(path.join(stateDir, 'heartbeat.json'), null);
    const queue = readQueue(stateDir);
    console.log(JSON.stringify({
      lock: lock ? { pid: lock.pid, at: lock.at, stale: lockIsStale(lock, cfg.lockMaxAgeMs) } : null,
      heartbeat: hb,
      queue: {
        total: queue.jobs.length,
        byStatus: queue.jobs.reduce((m, j) => { m[j.status] = (m[j.status] || 0) + 1; return m; }, {}),
        jobs: queue.jobs.slice(-10).map(j => ({ jobId: j.jobId, repo: j.repo, status: j.status, attempts: j.attempts, task: j.task.slice(0, 80) }))
      }
    }, null, 2));
    return;
  }
  if (has('--clear-stale-lock')) { console.log(JSON.stringify(clearStaleLock(stateDir, cfg))); return; }
  if (has('--recover')) {
    const recoveryLock = acquireLock(stateDir, cfg);
    if (!recoveryLock.acquired) {
      console.log(JSON.stringify({ recovered: 0, reason: recoveryLock.reason }));
      return;
    }
    try {
      console.log(JSON.stringify({ recovered: recoverOrphans(stateDir, cfg) }));
    } finally {
      releaseLock(stateDir);
    }
    return;
  }
  if (has('--inventory')) {
    // Découverte réelle via les mécanismes natifs OpenCode (jamais de liste supposée).
    const inv = await inventoryLib.refreshInventory({
      opencodeBin: cfg.opencodeBin,
      paidAllowed: cfg.paidAllowed,
      providers: cfg.inventory && cfg.inventory.providers,
      cwd: (cfg.repos.sargagame && cfg.repos.sargagame.local) || process.cwd(),
    });
    inventoryLib.saveInventory(path.join(stateDir, 'inventory.json'), inv);
    console.log(JSON.stringify({
      updatedAt: inv.updatedAt,
      counts: inv.counts,
      authProviders: inv.authProviders,
      installedOllama: inv.installedOllama,
      top: inventoryLib.rankModels(inv, { preferred: cfg.models }).slice(0, 12),
      errors: inv.errors,
    }, null, 2));
    return;
  }
  if (has('--models')) {
    const inv = inventoryLib.loadInventory(path.join(stateDir, 'inventory.json'));
    if (!inv) { console.log('Aucun inventaire en cache — lancez d\'abord : node scripts/factory-v3/run.cjs --inventory'); return; }
    const ranked = inventoryLib.rankModels(inv, { preferred: cfg.models });
    console.log(JSON.stringify(ranked.map((r) => ({
      ref: r.ref, provider: r.provider, free: r.free, score: r.score, reasons: r.reasons,
    })), null, 2));
    return;
  }
  if (has('--dashboard')) {
    const { buildDashboard, render } = require('./dashboard.cjs');
    const dash = buildDashboard(stateDir);
    console.log(has('--json') ? JSON.stringify(dash, null, 2) : render(dash));
    return;
  }
  if (has('--enqueue')) { console.log(JSON.stringify(enqueue(stateDir, JSON.parse(get('--enqueue'))), null, 2)); return; }
  if (has('--enqueue-file')) { console.log(JSON.stringify(enqueue(stateDir, JSON.parse(fs.readFileSync(get('--enqueue-file'), 'utf8'))), null, 2)); return; }

  await runLoop(stateDir, cfg, { once: has('--once'), maxCycles: Number(get('--max-cycles')) || Infinity });
}

if (require.main === module) {
  main().catch(e => { console.error('[factory] FATAL:', e); process.exit(1); });
}

// Exports pour tests de non-régression
module.exports = {
  pidAlive, lockIsStale, acquireLock, releaseLock, clearStaleLock,
  readQueue, writeQueue, enqueue, claimNextJob, recoverOrphans, updateJob,
  transitionJob, prepareJobWorkspace, publishJob,
  computeBackoff, computeVerdict, loadConfig, execStep, DEFAULT_CONFIG
};

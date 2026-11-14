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
  backoffBaseMs: 5 * 60 * 1000,
  backoffMaxMs: 60 * 60 * 1000,
  stepTimeoutMs: { agent: 15 * 60 * 1000, gate: 20 * 60 * 1000 },
  // Exécutable OpenCode (surchargeable pour les tests : stub déterministe).
  opencodeBin: 'opencode',
  // AUCUNE dépense autorisée par défaut : les modèles payants sont exclus.
  paidAllowed: false,
  // Moteur de bascule automatique (mission P0 : failover + quota autopilot).
  failover: {
    maxModelSwitches: 4,          // nombre max de tentatives modèle pour un job
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
      gates: [
        { id: 'build', cmd: 'npm run build' },
        { id: 'bundle-budget', cmd: 'node scripts/check-bundle-budget.cjs' },
        { id: 'unit-tests', cmd: 'node scripts/run-tests.cjs' }
      ]
    },
    botwow: {
      local: 'C:\\factory\\worktrees\\bot-wow-repo',
      defaultBranch: 'main',
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
  for (const k of Object.keys(overrides)) {
    if (k === 'repos' && overrides.repos && typeof overrides.repos === 'object') {
      for (const r of Object.keys(overrides.repos)) {
        merged.repos[r] = Object.assign({}, merged.repos[r] || {}, overrides.repos[r]);
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
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
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
  const age = Date.now() - Date.parse(lock.at || 0);
  if (!Number.isFinite(age)) return true;
  if (!pidAlive(lock.pid)) return true; // PID mort
  return age > lockMaxAgeMs; // PID vivant mais lock trop vieux → PID réutilisé
}

function acquireLock(stateDir, config) {
  const lockFile = path.join(stateDir, 'factory.lock');
  if (fs.existsSync(lockFile)) {
    const lock = readJson(lockFile, null);
    if (lock && lock.pid !== process.pid && !lockIsStale(lock, config.lockMaxAgeMs)) {
      return { acquired: false, reason: `runner actif (pid ${lock.pid})` };
    }
    // Stale : préserver la preuve avant reclaim
    if (lock) {
      const proof = path.join(stateDir, `factory.lock.stale-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      try { fs.copyFileSync(lockFile, proof); appendLog(stateDir, 'LOCK_RECLAIMED', { old: lock, proof }); } catch (_) {}
    }
    try { fs.unlinkSync(lockFile); } catch (_) {}
  }
  writeJsonAtomic(lockFile, { pid: process.pid, host: os.hostname(), at: new Date().toISOString() });
  return { acquired: true, reason: 'lock acquis' };
}

function releaseLock(stateDir) {
  const lockFile = path.join(stateDir, 'factory.lock');
  const lock = readJson(lockFile, null);
  if (lock && lock.pid === process.pid) { try { fs.unlinkSync(lockFile); } catch (_) {} }
}

function clearStaleLock(stateDir, config) {
  const lockFile = path.join(stateDir, 'factory.lock');
  const lock = readJson(lockFile, null);
  if (!lock) return { cleared: false, reason: 'aucun lock' };
  if (lock.pid === process.pid) { try { fs.unlinkSync(lockFile); } catch (_) {} return { cleared: true, reason: 'lock de ce processus' }; }
  if (!lockIsStale(lock, config.lockMaxAgeMs)) return { cleared: false, reason: `lock valide (pid ${lock.pid})` };
  const proof = path.join(stateDir, `factory.lock.stale-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.copyFileSync(lockFile, proof);
  fs.unlinkSync(lockFile);
  appendLog(stateDir, 'LOCK_CLEARED_MANUAL', { old: lock, proof });
  return { cleared: true, reason: `lock stale retiré (preuve: ${path.basename(proof)})` };
}

// ============================================================
// Logs structurés JSONL + heartbeat
// ============================================================
function appendLog(stateDir, event, data = {}) {
  try {
    const dir = path.join(stateDir, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...data }) + '\n';
    fs.appendFileSync(path.join(dir, `factory-${new Date().toISOString().slice(0, 10)}.jsonl`), line);
  } catch (_) {}
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
function readQueue(stateDir) {
  return readJson(path.join(stateDir, 'queue.json'), { version: 2, updatedAt: null, jobs: [] });
}

function writeQueue(stateDir, queue) {
  queue.updatedAt = new Date().toISOString();
  writeJsonAtomic(path.join(stateDir, 'queue.json'), queue);
}

function newJobId() {
  return `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function enqueue(stateDir, spec) {
  const cfg = loadConfig(stateDir);
  if (!spec || !cfg.repos[spec.repo]) throw new Error(`repo inconnu: ${spec && spec.repo}`);
  if (!spec.task || String(spec.task).trim().length < 8) throw new Error('task requise (>= 8 caractères)');
  const queue = readQueue(stateDir);
  const job = {
    jobId: newJobId(),
    repo: spec.repo,
    task: String(spec.task),
    branch: spec.branch || cfg.repos[spec.repo].defaultBranch || 'main',
    severity: Number.isFinite(spec.severity) ? spec.severity : 2,
    createPr: !!spec.createPr,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: cfg.maxAttempts,
    nextRetryAt: null,
    claimedBy: null,
    evidence: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  queue.jobs.push(job);
  writeQueue(stateDir, queue);
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
  const queue = readQueue(stateDir);
  const now = Date.now();
  const eligible = queue.jobs
    .filter(j => j.status === 'PENDING' && (!j.nextRetryAt || Date.parse(j.nextRetryAt) <= now))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (eligible.length === 0) return null;
  const job = eligible[0];
  job.status = 'RUNNING';
  job.claimedBy = { pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString() };
  job.updatedAt = new Date().toISOString();
  writeQueue(stateDir, queue);
  appendLog(stateDir, 'JOB_CLAIMED', { jobId: job.jobId, pid: process.pid });
  return job;
}

// Recovery : RUNNING dont le runner est mort → PENDING (backoff). Jamais de perte silencieuse.
function recoverOrphans(stateDir, cfg) {
  const queue = readQueue(stateDir);
  let recovered = 0;
  for (const job of queue.jobs) {
    if (job.status !== 'RUNNING') continue;
    const pid = job.claimedBy && job.claimedBy.pid;
    if (pid && pidAlive(pid)) continue; // runner vivant → ne pas toucher
    job.status = 'PENDING';
    job.attempts = (job.attempts || 0) + 1;
    job.nextRetryAt = new Date(Date.now() + computeBackoff(cfg, job.attempts)).toISOString();
    job.claimedBy = null;
    job.updatedAt = new Date().toISOString();
    job.recoveryNote = 'recoverOrphans: runner mort, job re-queued avec backoff';
    recovered++;
    appendLog(stateDir, 'JOB_RECOVERED', { jobId: job.jobId, attempts: job.attempts });
  }
  if (recovered > 0) writeQueue(stateDir, queue);
  return recovered;
}

function updateJob(stateDir, jobId, patch) {
  const queue = readQueue(stateDir);
  const job = queue.jobs.find(j => j.jobId === jobId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  writeQueue(stateDir, queue);
  return job;
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
    sessionId: result.sessionId,
    attempts: result.attempts,
    failovers: result.failovers,
    resumes: result.resumes,
    committedSha: result.committedSha,
    dirtyFiles: result.dirtyFiles,
    interruptedWithCommit: result.interruptedWithCommit,
    skipped: result.skipped,
    spend: result.spend,
    error: result.error,
    errorCategory: result.errorCategory,
    exitCode: result.ok ? 0 : 1,
    timedOut: false,
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
  if (!agent.ok) {
    // Le modèle a produit un commit AVANT l'interruption : les gates décident.
    if (agent.interruptedWithCommit && agent.committedSha) {
      if (agent.dirtyFiles > 0) return { verdict: 'BLOCKED_UNCOMMITTED', reason: `${agent.dirtyFiles} fichier(s) non commités après interruption` };
      if (!gate || !gate.allPassed) return { verdict: 'FAILED', reason: `commit ${agent.committedSha} produit avant interruption mais gates rouges` };
      return { verdict: 'VERIFIED', reason: `commit ${agent.committedSha} produit avant interruption + gates verts` };
    }
    return { verdict: 'FAILED', reason: (agent.error) || 'agent en échec' };
  }
  if (agent.dirtyFiles > 0) return { verdict: 'BLOCKED_UNCOMMITTED', reason: `${agent.dirtyFiles} fichier(s) modifié(s) non commités par l'agent` };
  if (!gate || !gate.allPassed) return { verdict: 'FAILED', reason: 'gates de livraison en échec' };
  if (agent.committedSha) return { verdict: 'VERIFIED', reason: `commit ${agent.committedSha} + gates verts` };
  return { verdict: 'DONE_NO_CHANGE', reason: 'aucune modification nécessaire (légitime) + gates verts' };
}

/** Date de fin de cooldown la plus proche (tous modèles) — sert à reprogrammer un job. */
function earliestCooldownMs(stateDir) {
  const reg = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  const now = Date.now();
  let min = Infinity;
  for (const e of Object.values(reg.models || {})) {
    if (!e.cooldownUntil) continue;
    const t = Date.parse(e.cooldownUntil);
    if (Number.isFinite(t) && t > now && t < min) min = t;
  }
  return Number.isFinite(min) ? min : null;
}

// ============================================================
// Pipeline d'un job
// ============================================================
async function processJob(stateDir, cfg, job) {
  const repoCfg = cfg.repos[job.repo];
  writeHeartbeat(stateDir, job.jobId, 0);

  const evidence = {
    job_id: job.jobId, repo: job.repo, task: job.task, branch: job.branch,
    runner: { pid: process.pid, host: os.hostname() },
    agent: null, gates: null, verdict: null, reason: null,
    attempts: job.attempts || 0,
    timestamps: { startedAt: new Date().toISOString() }
  };
  const evidenceFile = path.join(stateDir, 'evidence', `${job.jobId}.json`);
  const saveEvidence = () => { try { writeJsonAtomic(evidenceFile, evidence); } catch (_) {} };
  saveEvidence();

  // --- Étape agent (réelle) ---
  const agent = await runAgentStage(stateDir, cfg, job, repoCfg);
  evidence.agent = agent; evidence.timestamps.agent = new Date().toISOString(); saveEvidence();

  // --- Étape gates (réelles) ---
  const gate = await runGateStage(stateDir, cfg, job, repoCfg);
  evidence.gates = gate; evidence.timestamps.gates = new Date().toISOString(); saveEvidence();

  // --- Verdict strict ---
  const { verdict, reason } = computeVerdict(agent, gate);
  evidence.verdict = verdict; evidence.reason = reason; evidence.timestamps.endedAt = new Date().toISOString();
  saveEvidence();

  // --- PR optionnelle (réelle, gh CLI) ---
  if (job.createPr && (verdict === 'VERIFIED')) {
    const bodyFile = path.join(stateDir, 'prompts', `${job.jobId}.pr-body.md`);
    fs.writeFileSync(bodyFile, [
      `## Job ${job.jobId} — ${job.task}`,
      '', `Repo: ${job.repo} · Branche: ${job.branch}`,
      `Commit: ${agent.committedSha}`,
      `Gates: ${gate.results.map(g => `${g.id}=${g.exitCode}`).join(', ')}`,
      `Modèle: ${agent.model}`, `Verdict: ${verdict} — ${reason}`,
      '', 'Rollback: revert du commit ci-dessus.'
    ].join('\n'));
    const pr = await execStep(
      `gh pr create --title "factory: ${job.task.slice(0, 60)}" --body-file "${bodyFile}" --base main --head "${job.branch}"`,
      { cwd: repoCfg.local, timeoutMs: 120_000 });
    evidence.pr = { exitCode: pr.exitCode, tail: (pr.stdout + pr.stderr).slice(-600) };
    saveEvidence();
  }

  // --- Mise à jour queue selon verdict ---
  if (verdict === 'VERIFIED' || verdict === 'DONE_NO_CHANGE') {
    updateJob(stateDir, job.jobId, { status: 'DONE', claimedBy: null, evidence });
    appendLog(stateDir, 'JOB_DONE', { jobId: job.jobId, verdict });
  } else if (verdict === 'BLOCKED_UNCOMMITTED') {
    updateJob(stateDir, job.jobId, { status: 'BLOCKED', claimedBy: null, evidence });
    appendLog(stateDir, 'JOB_BLOCKED', { jobId: job.jobId, reason });
  } else if (verdict === 'WAIT_QUOTA') {
    // Quota épuisé : ce n'est pas une faute de la mission → reprogrammation
    // SANS consommer de tentative (le travail n'a pas « échoué », il est différé).
    const next = earliestCooldownMs(stateDir) || (Date.now() + cfg.backoffBaseMs);
    updateJob(stateDir, job.jobId, {
      status: 'PENDING', claimedBy: null, evidence,
      nextRetryAt: new Date(next).toISOString(),
      quotaWait: true,
    });
    appendLog(stateDir, 'JOB_QUOTA_WAIT', { jobId: job.jobId, nextRetryAt: new Date(next).toISOString(), reason });
  } else {
    const attempts = (job.attempts || 0) + 1;
    if (attempts >= job.maxAttempts) {
      updateJob(stateDir, job.jobId, { status: 'PARKED', attempts, claimedBy: null, evidence });
      appendLog(stateDir, 'JOB_PARKED', { jobId: job.jobId, attempts });
    } else {
      updateJob(stateDir, job.jobId, {
        status: 'PENDING', attempts, claimedBy: null, evidence,
        nextRetryAt: new Date(Date.now() + computeBackoff(cfg, attempts)).toISOString()
      });
      appendLog(stateDir, 'JOB_RETRY_QUEUED', { jobId: job.jobId, attempts, verdict });
    }
  }
  return { jobId: job.jobId, verdict };
}

// ============================================================
// Boucle dispatcher
// ============================================================
async function runLoop(stateDir, cfg, { once = false, maxCycles = Infinity } = {}) {
  const lock = acquireLock(stateDir, cfg);
  if (!lock.acquired) { console.log(`[factory] ${lock.reason} — sortie (single-runner garanti)`); return; }
  let cycles = 0;
  try {
    while (cycles < maxCycles) {
      cycles++;
      writeHeartbeat(stateDir, null, cycles);
      const recovered = recoverOrphans(stateDir, cfg);
      if (recovered) console.log(`[factory] ${recovered} job(s) orphelin(s) récupéré(s)`);
      const job = claimNextJob(stateDir, cfg);
      if (job) {
        console.log(`[factory] job ${job.jobId} (${job.repo}) → exécution réelle`);
        try { await processJob(stateDir, cfg, job); }
        catch (e) {
          appendLog(stateDir, 'JOB_CRASHED', { jobId: job.jobId, error: String(e && e.message || e) });
          const attempts = (job.attempts || 0) + 1;
          updateJob(stateDir, job.jobId, {
            status: attempts >= job.maxAttempts ? 'PARKED' : 'PENDING', attempts, claimedBy: null,
            nextRetryAt: attempts >= job.maxAttempts ? null : new Date(Date.now() + computeBackoff(cfg, attempts)).toISOString()
          });
        }
      } else if (!once) {
        await new Promise(r => setTimeout(r, cfg.cycleDelayMs));
      }
      if (once) break;
    }
  } finally { releaseLock(stateDir); }
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
  if (has('--recover')) { console.log(JSON.stringify({ recovered: recoverOrphans(stateDir, cfg) })); return; }
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
  computeBackoff, computeVerdict, loadConfig, execStep, DEFAULT_CONFIG
};

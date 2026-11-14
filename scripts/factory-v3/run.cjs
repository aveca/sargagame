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
const { spawn } = require('child_process');

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
  // Chaîne de modèles — vérifiée disponibles & gratuites via le sélecteur natif OpenCode
  // (tools.opencode.models, coût 0/0) le 2026-11-14. Fallback automatique dans l'ordre.
  models: [
    'nvidia/nvidia/nemotron-3.5-super-vl-120b-a12b',
    'opencode/nemotron-3.5-super-vl-free',
    'router/auto',
    'ollama/qwen2.5-coder:14b'
  ],
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
function execStep(cmd, { cwd, timeoutMs }) {
  return new Promise(resolve => {
    const child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { cwd, windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL' });
    let stdout = '', stderr = '', done = false, timedOut = false;
    const cap = s => { if (s.length > 200 * 1024) return s.slice(0, 100 * 1024) + '...[tronqué]...' + s.slice(-100 * 1024); return s; };
    child.stdout.on('data', d => { if (stdout.length < 400 * 1024) stdout += d; });
    child.stderr.on('data', d => { if (stderr.length < 400 * 1024) stderr += d; });
    child.on('error', e => { if (!done) { done = true; resolve({ exitCode: -1, timedOut: false, stdout: cap(stdout), stderr: cap(stderr + '\nSPAWN_ERROR: ' + e.message) }); } });
    child.on('close', code => {
      if (done) return; done = true;
      resolve({ exitCode: code, timedOut, stdout: cap(stdout), stderr: cap(stderr) });
    });
    // timeout du spawn ne garantit pas l'arbre (opencode.exe petit-fils) → taskkill /T /F
    const to = setTimeout(() => {
      timedOut = true;
      try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); } catch (_) {}
    }, timeoutMs);
    child.on('close', () => clearTimeout(to));
  });
}

// ============================================================
// Étape AGENT — exécution réelle via opencode CLI (chaîne de modèles, fallback)
// ============================================================
function buildAgentPrompt(job, repoCfg) {
  return [
    `Tâche FACTORY (job ${job.jobId}, repo ${job.repo}, sévérité ${job.severity}) : ${job.task}`,
    '',
    'Règles absolues :',
    '- Travaille réellement dans ce dépôt : LIS les fichiers concernés, MODIFIE si nécessaire, TESTE, COMMIT.',
    '- Commits conventionnels (feat/fix/docs/chore/test(scope): description) sur la branche courante.',
    '- Si la tâche ne nécessite aucune modification de fichier, dis-le explicitement (résultat légitime).',
    '- INTERDIT : inventer des données, falsifier des timestamps, toucher aux paiements/prix/clés, modifier dist/.',
    '- Si tu es bloqué après 3 tentatives, arrête-toi et explique le blocage (le job sera marqué FAILED honnêtement).',
    '- Termine par une ligne : FACTORY_DONE: <résumé en 1 ligne de ce qui a réellement été fait>.'
  ].join('\n');
}

async function runAgentStage(stateDir, cfg, job, repoCfg) {
  const repoPath = repoCfg.local;
  const headBefore = await execStep('git rev-parse HEAD', { cwd: repoPath, timeoutMs: 30_000 });
  const promptDir = path.join(stateDir, 'prompts');
  fs.mkdirSync(promptDir, { recursive: true });
  const promptFile = path.join(promptDir, `${job.jobId}.txt`);
  fs.writeFileSync(promptFile, buildAgentPrompt(job, repoCfg));

  const attempts = [];
  for (const model of cfg.models) {
    appendLog(stateDir, 'AGENT_ATTEMPT', { jobId: job.jobId, model });
    const psScript = `opencode run --dir '${repoPath}' -m '${model}' (Get-Content -Raw -LiteralPath '${promptFile}')`;
    const r = await execStep(psScript, { cwd: repoPath, timeoutMs: cfg.stepTimeoutMs.agent });
    attempts.push({ model, exitCode: r.exitCode, timedOut: r.timedOut, tail: r.stdout.slice(-1500) });
    if (r.exitCode === 0 && !r.timedOut) {
      const headAfter = await execStep('git rev-parse HEAD', { cwd: repoPath, timeoutMs: 30_000 });
      const status = await execStep('git status --porcelain', { cwd: repoPath, timeoutMs: 30_000 });
      const dirtyFiles = status.stdout.split('\n').filter(Boolean).length;
      return {
        ok: true, model, attempts,
        exitCode: r.exitCode, timedOut: false, outputTail: r.stdout.slice(-4000),
        headBefore: headBefore.stdout.trim(), headAfter: headAfter.stdout.trim(),
        committedSha: headAfter.stdout.trim() !== headBefore.stdout.trim() ? headAfter.stdout.trim() : null,
        dirtyFiles
      };
    }
    appendLog(stateDir, 'AGENT_ATTEMPT_FAILED', { jobId: job.jobId, model, exitCode: r.exitCode, timedOut: r.timedOut });
  }
  return {
    ok: false, model: null, attempts,
    exitCode: attempts.length ? attempts[attempts.length - 1].exitCode : -1,
    error: 'AGENT_UNAVAILABLE: toute la chaîne de modèles a échoué (aucun fallback restant)'
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
  if (!agent || !agent.ok) return { verdict: 'FAILED', reason: (agent && agent.error) || 'agent en échec' };
  if (agent.dirtyFiles > 0) return { verdict: 'BLOCKED_UNCOMMITTED', reason: `${agent.dirtyFiles} fichier(s) modifié(s) non commités par l'agent` };
  if (!gate || !gate.allPassed) return { verdict: 'FAILED', reason: 'gates de livraison en échec' };
  if (agent.committedSha) return { verdict: 'VERIFIED', reason: `commit ${agent.committedSha} + gates verts` };
  return { verdict: 'DONE_NO_CHANGE', reason: 'aucune modification nécessaire (légitime) + gates verts' };
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

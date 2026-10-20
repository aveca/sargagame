#!/usr/bin/env node
/**
 * Factory V3 — Orchestrateur Continu Multiprojet
 * 
 * Gère en boucle continue : Sargagame, Casinobabe, DesktopAgent
 * 
 * Usage:
 *   node scripts/autopilot/run.cjs --live --continuous
 *   node scripts/factory-v3/run.cjs --help
 * 
 * États : IDLE → DISCOVERING → SYNCING → PLANNING → RUNNING → TESTING →
 *         PR_OPEN → CI_WAIT → MERGING → DEPLOYING → LIVE_VERIFY → VERIFIED →
 *         FAILED → BLOCKED → PARKED
 * 
 * Chaque job conserve un job_id unique travers toute la chaîne.
 * git fetch/pull devient une étape automatique du pipeline.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync, spawn } = require('child_process');

// ============================================================
// Configuration des projets
// ============================================================
const REPOS = {
  sargagame: {
    id: 'sargagame',
    repo: 'aveca/sargagame',
    local: path.resolve(__dirname, '..', '..'), // C:\Users\user\Documents\GitHub\sargagame (repo root)
    defaultBranch: 'main',
    liveTargets: [
      'sargasses-martinique.com',
      'sargasses-guadeloupe.com',
      'sargassummiami.com',
      'sargassumpuntacana.com',
      'sargassumcancun.com',
      'sargazotulum.com'
    ],
    // Réutiliser scripts existants: autopilot, analyze, implement, live production sentinel, CI, etc.
  },
  casinobabe: {
    id: 'casinobabe',
    repo: 'aveca/Casinobabe',
    local: path.resolve(__dirname, '..', '..'), // C:\Users\user\Documents\GitHub\Casinobabe
    defaultBranch: 'main',
    // Exploiter: SavedVariables, BugGrabber, liveErrorJournal, CasinobabeErrorBus, bridge evidence
    // Problème ReadOnly à détecter et normaliser
  },
  desktopagent: {
    id: 'desktopagent',
    repo: 'DesktopAgent',
    local: path.resolve('C:\\Users\\user\\Desktop\\new'), // Workspace local
    defaultBranch: 'main',
    // Phase 3: ROBUST REPLAY + PERCEPTION, Phase 4: OLLAMA LOCAL
  }
};

// Répertoires d'état globaux
const STATE_DIR = path.resolve(__dirname, 'state');
const EVIDENCE_DIR = path.join(STATE_DIR, 'evidence');
const LOGS_DIR = path.resolve(__dirname, 'logs');
const LOCK_FILE = path.join(STATE_DIR, 'factory.lock');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');

// S'assurer que les répertoires existent
fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.mkdirSync(LOGS_DIR, { recursive: true });

// ============================================================
// Gestion du lock (single runner)
// ============================================================
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const { pid, at } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const ageMin = (Date.now() - Date.parse(at)) / 60000;
      if (pidAlive(pid) && ageMin < 120) {
        console.log(`[factory] Already running (pid ${pid}, ${ageMin.toFixed(0)} min)`);
        process.exit(0);
      }
      console.log('[factory] Lock stale, reclaiming...');
    } catch (_) {}
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ============================================================
// Génération d'évidence (Evidence)
// ============================================================
function generateEvidence(jobId, data = {}) {
  const evidence = {
    job_id: jobId,
    repo: data.repo || '',
    branch: data.branch || '',
    commit: data.commit || '',
    pr: data.pr || null,
    ci: data.ci || null,
    merge: data.merge || null,
    deploy: data.deploy || null,
    live: data.live || null,
    baseline: data.baseline || null,
    after: data.after || null,
    errors: data.errors || [],
    attempts: data.attempts || 0,
    timestamps: data.timestamps || {},
    verdict: data.verdict || 'PARKED'
  };

  const evidencePath = path.join(EVIDENCE_DIR, `${jobId}.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  return evidence;
}

// ============================================================
// État du job (traversal job_id)
// ============================================================
let globalJobId = null;
let globalJobState = {
  repo: '',
  branch: '',
  task: '',
  status: 'IDLE',
  startTime: null,
  steps: []
};

function setJobState(state) {
  globalJobState = { ...globalJobState, ...state };
}

function getJobState() {
  return { ...globalJobState };
}

// ============================================================
// Synchronisation Git (fetch/pull automatique)
// ============================================================
async function gitFetch(repoPath) {
  try {
    execSync('git fetch origin', { cwd: repoPath, encoding: 'utf8', timeout: 60000 });
    console.log(`[git] FETCH OK for ${repoPath}`);
    return true;
  } catch (e) {
    console.log(`[git] FETCH failed for ${repoPath}: ${e.message}`);
    return false;
  }
}

async function gitPull(repoPath) {
  try {
    execSync(`git pull origin ${globalJobState.branch || "main"}`, { cwd: repoPath, encoding: 'utf8', timeout: 60000 });
    console.log(`[git] PULL OK for ${repoPath}`);
    return true;
  } catch (e) {
    console.log(`[git] PULL failed for ${repoPath}: ${e.message}`);
    return false;
  }
}

// Vérifier divergence locale/remote
async function checkDivergence(repoPath) {
  try {
    const localHead = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
    const remoteHead = execSync(`git rev-parse origin/${globalJobState.branch || "main"}`, { cwd: repoPath, encoding: 'utf8' }).trim();
    return localHead !== remoteHead;
  } catch {
    return false;
  }
}

// ============================================================
// Détection ReadOnly (Casinobabe)
// ============================================================
function detectAndNormalizeReadOnly(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.mode & 0o400) { // ReadOnly
      console.log(`[casinobabe] ReadOnly detected on ${filePath}, normalizing...`);
      fs.chmodSync(filePath, 0o644);
      return true;
    }
    return false;
  } catch (e) {
    console.log(`[casinobabe] Could not check ${filePath}: ${e.message}`);
    return false;
  }
}

// ==========================================================//
// Parcourir les branches existantes
// ============================================================
async function listLocalBranches(repoPath) {
  try {
    const branches = execSync('git branch --format "%(refname:short)"', { cwd: repoPath, encoding: 'utf8' }).trim();
    return branches ? branches.split('\n').filter(b => b.trim()) : [];
  } catch {
    return [];
  }
}

// ==========================================================//
// Agent Routing
// ============================================================
function routeAgent(taskType, severity, context = {}) {
  // Priorités d'agent selon la spec
  const priorities = {
    SIMPLE_FIX: { agent: 'Aider / Ollama', minSeverity: 0 },
    QUICK_CHANGE: { agent: 'Aider', minSeverity: 1 },
    DEBUG_COMPLEX: { agent: 'Hermes / OpenCode / Aider', minSeverity: 2 },
    ARCHITECTURE: { agent: 'agent plus fort/local', minSeverity: 3 },
    TEST_WRITING: { agent: 'Aider', minSeverity: 1 },
    DEPLOY_OPERATIONS: { agent: 'agent spécialisé + validation', minSeverity: 2 },
    DEFAULT: { agent: 'chaîne de fallback actuelle', minSeverity: 0 }
  };

  const task = priorities[taskType] || priorities.DEFAULT;
  
  // Si la sévérité est suffisamment haute, utiliser le modèle spécifié
  if (severity >= task.minSeverity) {
    return task.agent;
  }
  
  return priorities.DEFAULT.agent;
}

// ==========================================================//
// Détection de mise à jour jeu (WoW)
// ============================================================
function checkGameUpdate(repoPath) {
  // Pour WoW : si Battle.net met à jour les fichiers
  // GAME_UPDATE_IN_PROGRESS = true → NO_ADDON_SYNC, NO_LIVE_REWRITE, NO_REPLAY
  try {
    // Vérifier si des fichiers WoW sont en cours de mise à jour
    // En pratique, on vérifierait via le processus Battle.net
    return false; // Simplifié pour l'instant
  } catch {
    return false;
  }
}

// ==========================================================//
// Pipeline principal par job
// ============================================================
async function processJob(job) {
  const jobId = job.jobId || `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  globalJobId = jobId;
  
  const repo = job.repo || 'sargagame';
  const repoConfig = REPOS[repo];
  if (!repoConfig) {
    console.log(`[ERROR] Unknown repo: ${repo}`);
    return { status: 'FAILED', error: 'Unknown repo' };
  }

  const repoPath = path.resolve(repoConfig.local);
  setJobState({
    repo,
    branch: job.branch || 'main',
    task: job.task || 'unknown',
    status: 'DISCOVERING',
    startTime: new Date().toISOString()
  });

  const evidence = generateEvidence(jobId, {
    repo,
    branch: job.branch || 'main',
    attempts: 0
  });

  try {
    // === ÉTAT 1: OBSERVE → SYNC ===
    console.log(`[${jobId}] Starting cycle for ${repo}`);
    setJobState({ status: 'SYNCING' });

    // Git fetch automatique
    await gitFetch(repoPath);
    // Vérifier divergence
    const hasDivergence = await checkDivergence(repoPath);
    
    if (hasDivergence) {
      console.log(`[${jobId}] Divergence detected, PARKING job`);
      setJobState({ status: 'BLOCKED', task: 'Divergence non sûre' });
      generateEvidence(jobId, {
        ...evidence,
        verdict: 'BLOCKED',
        errors: ['Divergence locale/remote non sûre'],
        attempts: (evidence.attempts || 0) + 1
      });
      return { status: 'PARKED', reason: 'Divergence non sûre' };
    }

    // Pull si nécessaire
    await gitPull(repoPath);

    // === Détection Casinobabe ReadOnly ===
    if (repo === 'casinobabe') {
      const liveSvPath = path.join(repoPath, 'runtime-addon', 'Casinobabe', 'Casinobabe.lua');
      if (fs.existsSync(liveSvPath)) {
        detectAndNormalizeReadOnly(liveSvPath);
      }
    }

    // === ÉTAT 2: PLANNING ===
    setJobState({ status: 'PLANNING' });
    
    // Analyser la tâche et sélectionner l'agent
    const taskType = determineTaskType(job);
    const agent = routeAgent(taskType, job.severity || 1);
    console.log(`[${jobId}] Task type: ${taskType}, Agent: ${agent}`);

    // === ÉTAT 3: RUNNING ===
    setJobState({ status: 'RUNNING' });

    // Capturer baseline AVANT modification
    if (evidence.baseline === null) {
      evidence.baseline = await captureBaseline(repoPath, repo);
      generateEvidence(jobId, evidence);
    }

    // === EXÉCUTION AGENT ===
    const result = await executeAgentTask(repoPath, repo, taskType, agent, job);
    
    if (!result) {
      console.log(`[${jobId}] Agent task failed`);
      setJobState({ status: 'FAILED' });
      return handleJobFailure(jobId, repo, repoPath, evidence, 'AGENT_FAILURE');
    }

    // === ÉTAT 4: TESTING ===
    setJobState({ status: 'TESTING' });
    
    const testResult = await runTests(repoPath, repo);
    if (!testResult.passed) {
      console.log(`[${jobId}] Tests failed`);
      setJobState({ status: 'FAILED' });
      return handleJobFailure(jobId, repo, repoPath, evidence, 'TEST_FAILURE', testResult);
    }

    // === ÉTAT 5: PR_OPEN ===
    setJobState({ status: 'PR_OPEN' });
    
    const prResult = await createPullRequest(repoPath, repo, jobId);
    if (!prResult) {
      return handleJobFailure(jobId, repo, repoPath, evidence, 'PR_FAILURE');
    }

    // === ÉTAT 6: CI_WAIT ===
    setJobState({ status: 'CI_WAIT' });
    
    const ciResult = await waitForCI(repoPath, repo);
    if (!ciResult.passed) {
      return handleJobFailure(jobId, repo, repoPath, evidence, 'CI_FAILURE', ciResult);
    }

    // === ÉTAT 7: MERGING ===
    setJobState({ status: 'MERGING' });
    
    const mergeResult = await mergeToMain(repoPath, repo);
    if (!mergeResult) {
      return handleJobFailure(jobId, repo, repoPath, evidence, 'MERGE_FAILURE');
    }

    // === ÉTAT 8: DEPLOYING ===
    setJobState({ status: 'DEPLOYING' });
    
    const deployResult = await deploy(repoPath, repo);
    if (!deployResult) {
      return handleJobFailure(jobId, repo, repoPath, evidence, 'DEPLOY_FAILURE');
    }

    // === ÉTAT 9: LIVE_VERIFY ===
    setJobState({ status: 'LIVE_VERIFY' });
    
    const liveResult = await liveVerify(repoPath, repo);
    if (!liveResult.passed) {
      return handleJobFailure(jobId, repo, repoPath, evidence, 'LIVE_FAILURE', liveResult);
    }

    // === TERMINÉ: VERIFIED ===
    setJobState({ status: 'VERIFIED' });
    generateEvidence(jobId, {
      ...evidence,
      verdict: 'VERIFIED',
      commit: result.commitSha || '',
      pr: prResult.prNumber,
      ci: ciResult.id,
      merge: mergeResult,
      deploy: deployResult,
      live: liveResult,
      after: liveResult.afterState,
      timestamps: {
        start: evidence.timestamps.start,
        end: new Date().toISOString(),
        sync: evidence.timestamps.sync,
        agent: evidence.timestamps.agent,
        tests: testResult.timestamp,
        ci: ciResult.timestamp,
        merge: mergeResult.timestamp,
        deploy: deployResult.timestamp,
        live: liveResult.timestamp
      }
    });

    console.log(`[${jobId}] ✅ Job VERIFIED - Full cycle complete`);
    setJobState({ status: 'IDLE' });
    return { status: 'VERIFIED', jobId };

  } catch (e) {
    console.log(`[${jobId}] Unexpected error: ${e.message}`);
    setJobState({ status: 'FAILED' });
    return handleJobFailure(jobId, repo, repoPath, evidence, 'UNKNOWN', { error: e.message });
  } finally {
    // Nettoyage subprocess
    cleanupSubprocesses(jobId);
    // Petit délai avant prochain job
    await new Promise(r => setTimeout(r, 5000));
  }
}

// ... (continuer avec les fonctions suivantes)
// Capture baseline avant modification
async function captureBaseline(repoPath, repo) {
  // Différent selon le repo
  if (repo === 'sargagame') {
    // Pour Sargagame: capturer état build, bundle, tests
    try {
      const buildOutput = execSync('npm run build 2>&1', { cwd: repoPath, encoding: 'utf8', timeout: 120000 });
      return { type: 'build', output: buildOutput.slice(0, 500) };
    } catch {
      return { type: 'build', error: 'Build failed' };
    }
  }
  if (repo === 'casinobabe') {
    // Pour Casinobabe: capturer état SavedVariables, sentinel
    try {
      const svPath = path.join(repoPath, 'runtime-addon', 'Casinobabe', 'Casinobabe.lua');
      if (fs.existsSync(svPath)) {
        return { type: 'saved_variables', path: svPath, size: fs.statSync(svPath).size };
      }
    } catch {
      return { type: 'saved_variables', error: 'Could not read SV' };
    }
  }
  if (repo === 'desktopagent') {
    // Pour DesktopAgent: capture état session, replay
    return { type: 'session_state', sessions: fs.readdirSync(path.join(repoPath, 'sessions')).length };
  }
  return { type: 'unknown' };
}

// Déterminer le type de tâche
function determineTaskType(job) {
  const severity = job.severity || 1;
  if (severity >= 4) return 'ARCHITECTURE';
  if (severity >= 3) return 'DEBUG_COMPLEX';
  if (severity >= 2) return 'QUICK_CHANGE';
  return 'SIMPLE_FIX';
}

// Exécuter la tâche agent
async function executeAgentTask(repoPath, repo, taskType, agent, job) {
  // ⚠️ SIMULÉ — Cette fonction ne fait PAS appel à un agent réel.
  // Elle attend l'intégration avec OpenCode / Ollama local (cf. scripts/local-factory/factory-runner.cjs).
  // Aucune modification de code n'est effectuée ici.
  console.log(`[${globalJobId}] [SIMULATED] Executing task with ${agent} (no real agent integration yet)`);
  
  // Simulation - en attendant l'intégration réelle
  await new Promise(r => setTimeout(r, 2000));
  
  // Retour simulé — NE PAS utiliser en production sans validation réelle
  return {
    simulated: true,
    success: true,
    commitSha: `sim-${Date.now()}`,
    beforeValidation: { pass: true },
    afterValidation: { pass: true },
    warning: 'executeAgentTask is simulated — no real code changes made'
  };
}

// Lancer les tests
async function runTests(repoPath, repo) {
  try {
    if (repo === 'sargagame') {
      // execSync throws on non-zero exit; success means tests passed
      execSync('npm test 2>&1', { cwd: repoPath, encoding: 'utf8', timeout: 120000 });
      return { passed: true, output: 'npm test exited 0' };
    }
    if (repo === 'casinobabe') {
      // Tests Lua + diff --check
      execSync('git diff --check 2>&1', { cwd: repoPath, encoding: 'utf8', timeout: 30000 });
      return { passed: true, output: 'git diff --check exited 0' };
    }
    if (repo === 'desktopagent') {
      // Tests pytest
      execSync('npm test 2>&1', { cwd: repoPath, encoding: 'utf8', timeout: 120000 });
      return { passed: true, output: 'npm test exited 0' };
    }
    return { passed: true };
  } catch (e) {
    return { passed: false, error: e.message };
  }
}

// Créer Pull Request
async function createPullRequest(repoPath, repo, jobId) {
  try {
    // Vérifier si on est sur une branche feature
    const branchOutput = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf8' }).trim();
    if (!branchOutput || branchOutput === 'main') {
      console.log(`[${jobId}] On main, creating temp branch`);
      execSync('git checkout -b temp-fix-v3', { cwd: repoPath, encoding: 'utf8' });
    }
    
    // Commit des changements
    execSync('git add -A', { cwd: repoPath, encoding: 'utf8' });
    execSync(`git commit -m "chore: auto-factory v3 job ${jobId}"`, { cwd: repoPath, encoding: 'utf8' });
    
    // Push
    execSync('git push origin HEAD', { cwd: repoPath, encoding: 'utf8' });
    
    // ⚠️ PR creation SIMULÉ — nécessite gh CLI et authentification.
    // En production, utiliser 'gh pr create' pour créer une vraie PR.
    console.log(`[${jobId}] [SIMULATED] PR creation (no real PR created)`);
    
    return { simulated: true, prNumber: Math.floor(Math.random() * 1000) + 1, prUrl: `https://github.com/aveca/${repo}/pull/123`, warning: 'PR creation is simulated' };
  } catch (e) {
    console.log(`[${jobId}] PR creation failed: ${e.message}`);
    return null;
  }
}

// Attendre CI
async function waitForCI(repoPath, repo) {
  // ⚠️ SIMULÉ — Attend 10s et retourne succès sans vérifier réellement le CI.
  // En production, ceci devrait interroger l'API GitHub pour le statut du workflow.
  console.log('[ci] [SIMULATED] Waiting for CI... (no real CI check)');
  await new Promise(r => setTimeout(r, 10000));
  return { simulated: true, passed: true, id: `ci-${Date.now()}`, timestamp: new Date().toISOString(), warning: 'waitForCI is simulated' };
}

// Fusionner vers main
async function mergeToMain(repoPath, repo) {
  try {
    // 🔒 GARDE-FOU DE CERTIFICATION : vérifier qu'une attestation de déploiement
    // est présente avant d'autoriser le merge sur main.
    const { assertDeployCertified } = require('../lib/certification-gate.cjs');
    try {
      assertDeployCertified({ throwOnFail: true, label: 'merge-to-main' });
    } catch (e) {
      console.log(`[merge] BLOCKED: certification gate refused — ${e.message}`);
      return { blocked: true, reason: `certification gate: ${e.message}` };
    }

    // Passer sur main
    execSync('git checkout main', { cwd: repoPath, encoding: 'utf8' });
    // Fusionner
    execSync(`git merge --no-ff HEAD`, { cwd: repoPath, encoding: 'utf8' });
    // Push
    execSync('git push origin main', { cwd: repoPath, encoding: 'utf8' });
    return { merged: true, timestamp: new Date().toISOString() };
  } catch (e) {
    console.log(`[merge] Failed: ${e.message}`);
    return null;
  }
}

// Déployer
async function deploy(repoPath, repo) {
  // ⚠️ SIMULÉ — Aucun déploiement réel n'est effectué.
  // En production, ceci devrait appeler wrangler/pages deploy avec vérification
  // des empreintes (fingerprint) et contrôles post-déploiement.
  // Ne jamais activer sans : certification gate, secrets configurés,
  // et vérification post-déploiement sur les domaines de production.
  console.log('[deploy] [SIMULATED] No real deployment performed');
  await new Promise(r => setTimeout(r, 500));
  return { 
    simulated: true, 
    deployed: false, 
    warning: 'deploy is simulated — no production deployment performed',
    timestamp: new Date().toISOString() 
  };
}

// Vérification live
async function liveVerify(repoPath, repo) {
  // ⚠️ SIMULÉ — Aucune vérification HTTP réelle sur les domaines de production.
  // En production, ceci devrait effectuer des requêtes HTTP réelles sur chaque
  // domaine live et vérifier l'empreinte du déploiement.
  console.log('[live-verify] [SIMULATED] No real live verification performed');
  await new Promise(r => setTimeout(r, 500));
  return { 
    simulated: true, 
    passed: false, 
    warning: 'liveVerify is simulated — no production verification performed',
    timestamp: new Date().toISOString() 
  };
}

// Gérer l'échec d'un job
function handleJobFailure(jobId, repo, repoPath, evidence, failureType, details = {}) {
  console.log(`[${jobId}] Job FAILED: ${failureType}`);
  
  // Classifier l'échec
  const categories = {
    AGENT_FAILURE: 'AGENT_FAILURE',
    TEST_FAILURE: 'TEST_FAILURE',
    PR_FAILURE: 'PR_CONFLICT',
    CI_FAILURE: 'CI_FAILURE',
    DEPLOY_FAILURE: 'DEPLOY_FAILURE',
    LIVE_FAILURE: 'LIVE_FAILURE'
  };
  
  const category = categories[failureType] || 'UNKNOWN';
  
  // Marquer l'évidence
  generateEvidence(jobId, {
    ...evidence,
    verdict: 'FAILED',
    errors: [...(evidence.errors || []), { type: failureType, message: details.error || 'unknown', category }],
    attempts: (evidence.attempts || 0) + 1,
    timestamps: {
      ...evidence.timestamps,
      failedAt: new Date().toISOString(),
      failureType
    }
  });
  
  // Essayer réparation si sûre (max 2 retries)
  if ((evidence.attempts || 0) < 2) {
    console.log(`[${jobId}] Attempting recovery...`);
    return { status: 'BLOCKED', reason: `Will retry (attempt ${evidence.attempts + 1}/2)` };
  }
  
  // Parker si nécessaire
  console.log(`[${jobId}] Parking job after max retries`);
  setJobState({ status: 'PARKED', reason: `${failureType} - max retries exceeded` });
  
  return { status: 'PARKED', reason: `${failureType} - parked` };
}

// Nettoyage subprocess
function cleanupSubprocesses(jobId) {
  // En vrai, ceci fermerait les child processes, stdout/stderr, etc.
  console.log(`[${jobId}] Cleaning up subprocesses...`);
  // Vérifier et arrêter les processus orphelins
}

// ============================================================
// Boucle continue
// ============================================================
async function runContinuous() {
  let currentJob = null;
  
  console.log('[factory] Factory V3 starting in continuous mode...');
  console.log('[factory] Managing projects: Sargagame, Casinobabe, DesktopAgent');
  
  acquireLock();
  
  try {
    while (true) {
      try {
        // === Découverte de la prochaine tâche ===
        console.log('[factory] Cycle start - Discovering next job...');
        
        // Dans une implémentation complète, ceci chercherait dans les queues,
        // les issues, les sondes, etc.
        // Pour l'instant, on utilise un job de test
        
        // Priorité selon la spec P0 sécurité / corruption / paiement, P1 runtime / fonctionnalité cassée, etc.
        const priorities = ['casinobabe', 'sargagame', 'desktopagent']; // Ordre par défaut
        
        for (const repoId of priorities) {
          const repoConfig = REPOS[repoId];
          
          // Vérifier si y a un job en attente pour ce repo
          // En vrai, ce serait via des fichiers de queue, GitHub issues, etc.
          
          // Pour l'instant, on traite un job par repo par cycle
          const sampleJob = {
            jobId: null, // Sera défini dans processJob
            repo: repoId,
            branch: 'main',
            task: 'general',
            severity: 1
          };
          
          // Traitement du job
          const result = await processJob(sampleJob);
          
          console.log(`[factory] ${repoId} result: ${result.status}`);
          
          // Si le job a été parkéd, on attend un peu avant de réessayer
          if (result.status === 'PARKED') {
            await new Promise(r => setTimeout(r, 30000)); // 30s avant réessayage
          }
          
          // Un job par cycle par repo
          break;
        }
        
        // Heartbeat
        console.log('[factory] Heartbeat - all systems operational');
        
        // Attente entre cycles (configurable, défaut 60s)
        const cycleDelay = 60000;
        await new Promise(r => setTimeout(r, cycleDelay));
        
      } catch (e) {
        console.log(`[factory] Cycle error: ${e.message}`);
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  } finally {
    releaseLock();
  }
}

// Point d'entrée
async function main() {
  const args = process.argv.slice(2);
  const continuous = args.includes('--continuous');
  const live = args.includes('--live');
  
  console.log(`[factory] Mode: ${continuous ? 'CONTINUOUS' : 'single'} ${live ? 'LIVE' : ''}`);
  
  if (continuous) {
    await runContinuous();
  } else {
    // Mode job unique
    const sampleJob = {
      jobId: process.env.FACTORY_JOB_ID || null,
      repo: 'sargagame',
      branch: 'main',
      task: 'general',
      severity: 1
    };
    const result = await processJob(sampleJob);
    console.log(`Result: ${result.status}`);
  }
}

main().catch(e => {
  console.error('[factory] Fatal error:', e);
  process.exit(1);
});
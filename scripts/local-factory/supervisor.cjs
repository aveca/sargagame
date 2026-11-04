#!/usr/bin/env node
/**
 * supervisor.cjs — Superviseur externe du factory runner
 * 
 * Vérifie périodiquement que le runner autonome est vivant et progresse (via heartbeat).
 * Si le runner est mort (crash, blocage, redémarrage Windows) ou bloqué (pas de progrès),
 * le superviseur le relance automatiquement avec délai progressif.
 * 
 * Usage:
 *   node scripts/local-factory/supervisor.cjs --watch          # surveillance continue
 *   node scripts/local-factory/supervisor.cjs --check          # vérification unique
 *   node scripts/local-factory/supervisor.cjs --restart        # redémarrage forcé
 * 
 * À enregistrer dans le Planificateur Windows (tâche au logon) pour
 * assurer la reprise après crash immédiat du runner.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const heartbeatLib = require('./heartbeat.cjs');

const ROOT = process.env.FACTORY_ROOT_DIR ? path.resolve(process.env.FACTORY_ROOT_DIR) : path.resolve(__dirname, '..', '..');
const STATE_DIR = process.env.FACTORY_STATE_DIR ? path.resolve(process.env.FACTORY_STATE_DIR) : path.join(__dirname, 'state');
const HEARTBEAT_FILE = heartbeatLib.HEARTBEAT_FILE;
const SUPERVISOR_LOG = path.join(STATE_DIR, 'supervisor.log');
const SUPERVISOR_STATE_FILE = path.join(STATE_DIR, 'supervisor-persist.json');
const LOCK_FILE = path.join(STATE_DIR, 'factory.lock');
const RUNNER_SCRIPT = path.join(__dirname, 'factory-runner.cjs');

// Heartbeat : validité + fraîcheur déléguées au module partagé (source unique)
const HEARTBEAT_MAX_AGE_MS = heartbeatLib.HEARTBEAT_MAX_AGE_MS;
const STUCK_AFTER_MS = heartbeatLib.STUCK_AFTER_MS;
const RESTART_BACKOFF_BASE = 10000;   // 10s : délai minimum entre deux tentatives
const MAX_RESTARTS_PER_HOUR = 12;     // limite conservée (fenêtre glissante 60 min)
const FAST_DEATH_MS = 60000;          // mort < 60 s = instable -> cooldown
const RESTART_COOLDOWN_MS = 5 * 60 * 1000; // 5 min de repos après mort rapide

fs.mkdirSync(STATE_DIR, { recursive: true });

let restartCount = 0;
let lastRestartHour = new Date().getHours();
// Dernier cycle observé pour détecter le blocage (pas de progrès)
let lastSeenCycle = null;
let lastSeenCycleTime = null;
// Runner lancé par CE superviseur (suivi des morts rapides)
let currentChild = null;
let currentChildStartedAt = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg.replace(/[^\x20-\x7E]/g, '-')}`; // ASCII-only : pas de mojibake
  console.log(line);
  try { fs.appendFileSync(SUPERVISOR_LOG, line + '\n'); } catch (_) {}
}

function loadSupervisorPersist() {
  try { return JSON.parse(fs.readFileSync(SUPERVISOR_STATE_FILE, 'utf8')); } catch (_) { return {}; }
}
function saveSupervisorPersist(data) {
  try { fs.writeFileSync(SUPERVISOR_STATE_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

/** État de récupération persisté = explicite et observable (mission P0). */
function setRecovery(state, reason, extra = {}) {
  const now = new Date();
  const payload = {
    ...loadSupervisorPersist(),
    recovery: { state, reason, at: now.toISOString(), ...extra },
  };
  saveSupervisorPersist(payload);
  log(`supervisor: recovery=${state} - ${reason}`);
}

/**
 * Vrai si un runner vivant détient déjà le verrou d'usine : dans ce cas on ne
 * relance RIEN (le runner démarre peut-être encore — le heartbeat suivra).
 */
function lockHeldByLiveProcess() {
  try {
    if (!fs.existsSync(LOCK_FILE)) return null;
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    if (!lock || !lock.pid) return null;
    try { process.kill(Number(lock.pid), 0); } catch (e) {
      if (e.code === 'ESRCH') return null; // verrou fantôme d'un processus mort
    }
    const ageMin = lock.at ? (Date.now() - Date.parse(lock.at)) / 60000 : null;
    return { pid: lock.pid, ageMin };
  } catch (_) { return null; }
}

/**
 * État du runner selon le contrat heartbeat partagé :
 * présence, lisisibilité, fraîcheur, PID vivant, état non final.
 */
function isRunnerAlive() {
  const evaluation = heartbeatLib.evaluateHeartbeat();
  if (!evaluation.alive) {
    return { alive: false, reason: evaluation.reason, heartbeat: evaluation.heartbeat };
  }
  const hb = evaluation.heartbeat;

  // Progrès : un runner frais mais bloqué (cycle figé, file non vide) est détecté.
  const progress = heartbeatLib.evaluateProgress(hb, { lastSeenCycle, lastSeenCycleTime });
  if (progress.stuck) {
    return { alive: false, reason: `runner blocked (${progress.reason})`, heartbeat: hb };
  }
  return { alive: true, reason: evaluation.reason, heartbeat: hb, ageMs: evaluation.ageMs };
}

/** Fenêtre glissante de redémarrages (60 min) — remplace le compteur par heure. */
function restartWindow() {
  const p = loadSupervisorPersist();
  const now = Date.now();
  return (Array.isArray(p.restarts) ? p.restarts : []).filter(t => now - t < 60 * 60 * 1000);
}

function canRestart() {
  const p = loadSupervisorPersist();
  if (p.cooldownUntil && Date.parse(p.cooldownUntil) > Date.now()) {
    const waitS = Math.round((Date.parse(p.cooldownUntil) - Date.now()) / 1000);
    return { allowed: false, reason: `cooldown apres morts rapides (${waitS}s restantes)`, nextResetAt: p.cooldownUntil };
  }
  const window = restartWindow();
  if (window.length >= MAX_RESTARTS_PER_HOUR) {
    return {
      allowed: false,
      reason: `limite de ${MAX_RESTARTS_PER_HOUR} redemarrages/heure atteinte (fenetre glissante)`,
      nextResetAt: new Date(window[0] + 60 * 60 * 1000).toISOString(),
    };
  }
  return { allowed: true, used: window.length };
}

function recordRestart() {
  const window = restartWindow();
  window.push(Date.now());
  restartCount = window.length;
  lastRestartHour = new Date().getHours();
  saveSupervisorPersist({
    restartCount,
    lastRestartHour,
    restarts: window,
    recovery: { ...(loadSupervisorPersist().recovery || {}), state: 'spawned', at: new Date().toISOString(), usedInWindow: window.length },
  });
  log(`supervisor: restart #${window.length} dans la fenetre glissante (max ${MAX_RESTARTS_PER_HOUR}/h)`);
}

/** Appelé à la mort du runner : cooldown si mort trop rapide (anti-boucle). */
function markRunnerExited(code, startedAt) {
  const aliveMs = startedAt ? Date.now() - startedAt : null;
  if (aliveMs !== null && aliveMs < FAST_DEATH_MS) {
    const until = new Date(Date.now() + RESTART_COOLDOWN_MS).toISOString();
    saveSupervisorPersist({ ...loadSupervisorPersist(), cooldownUntil: until });
    setRecovery('cooldown_fast_death', `runner mort apres ${(aliveMs / 1000).toFixed(0)}s (< ${FAST_DEATH_MS / 1000}s) : repos ${RESTART_COOLDOWN_MS / 60000} min`, { exitCode: code, aliveMs });
  } else {
    setRecovery('runner_exited', 'runner arrete (duree de vie normale)', { exitCode: code, aliveMs });
  }
}

function startRunner() {
  const lock = lockHeldByLiveProcess();
  if (lock) {
    log(`supervisor: verrou d'usine detenu par un processus vivant (pid ${lock.pid}) - pas de double lancement`);
    return null;
  }

  log('supervisor: starting factory runner (mode continu, heartbeat attendu)...');
  const startedAt = Date.now();

  // Le runner doit SURVIVRE au superviseur : spawn détaché + unref.
  // Sortie redirigée vers un fichier (pas de pipe héritée) : pas d'EPIPE si le
  // superviseur meurt, et la sortie reste consultable comme preuve.
  const RUNNER_LOG = path.join(STATE_DIR, 'runner.log');
  let outFd;
  try { outFd = fs.openSync(RUNNER_LOG, 'a'); } catch (_) { outFd = 'ignore'; }

  const child = spawn(process.execPath, [RUNNER_SCRIPT, '--supervisor'], {
    cwd: ROOT,
    stdio: ['ignore', outFd, outFd],
    windowsHide: true,
    detached: true
  });
  if (typeof outFd === 'number') { try { fs.closeSync(outFd); } catch (_) {} }
  if (child.unref) child.unref(); // ne bloque pas l'arrêt du superviseur

  child.on('close', (code) => {
    log(`supervisor: runner exited with code ${code}`);
    markRunnerExited(code, startedAt);
    currentChild = null;
  });

  child.on('error', (e) => {
    log(`supervisor: failed to start runner: ${e.message}`);
    setRecovery('spawn_error', e.message);
  });

  currentChild = child;
  currentChildStartedAt = startedAt;
  return child;
}

function checkOllama() {
  try {
    const out = execSync('ollama list', { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const lines = out.trim().split('\n').slice(1);
    const models = lines.filter(l => l.trim()).map(l => l.split(/\s+/)[0]);
    return { available: true, models, count: models.length };
  } catch (e) {
    return { available: false, error: e.message };
  }
}

async function check() {
  log('supervisor: check cycle');

  // Vérifier Ollama (informatif : n'empêche pas le runner local)
  const ollama = checkOllama();
  if (!ollama.available) {
    log(`supervisor: WARN — Ollama indisponible: ${ollama.error}`);
  } else {
    log(`supervisor: Ollama OK (${ollama.count} models)`);
  }

  // Vérifier le runner
  const status = isRunnerAlive();
  if (status.alive) {
    log(`supervisor: runner alive (PID ${status.heartbeat.pid}, cycle ${status.heartbeat.cycle}, age ${(status.ageMs / 1000).toFixed(0)}s, state ${status.heartbeat.state})`);
    setRecovery('nominal', `runner vivant (pid ${status.heartbeat.pid}, cycle ${status.heartbeat.cycle})`, {
      pid: status.heartbeat.pid, cycle: status.heartbeat.cycle,
    });
    return { status: 'ok', runner: status, ollama };
  }

  log(`supervisor: runner NOT alive — ${status.reason}`);

  // Un processus enfant que CE superviseur a lancé tourne encore : on attend
  // son heartbeat (il démarre peut-être). On ne relance pas un doublon.
  if (currentChild && currentChild.pid) {
    let stillAlive = true;
    try { process.kill(Number(currentChild.pid), 0); }
    catch (e) { if (e.code === 'ESRCH') stillAlive = false; }
    if (stillAlive) {
      log(`supervisor: runner enfant ${currentChild.pid} encore en cours de demarrage - pas de double lancement`);
      return { status: 'pending_start', reason: status.reason, ollama, childPid: currentChild.pid };
    }
    currentChild = null; // mort avant l'event close : on reprend le cours normal
  }

  // Verrou d'usine détenu par un processus vivant : quelqu'un d'autre (ou un
  // démarrage concurrent) détient le runner — pas de double lancement.
  const lock = lockHeldByLiveProcess();
  if (lock) {
    log(`supervisor: verrou d'usine detenu par un processus vivant (pid ${lock.pid}) - en attente du heartbeat`);
    setRecovery('pending_lock', `verrou d'usine detenu par le pid ${lock.pid}`, { pid: lock.pid, ageMin: lock.ageMin });
    return { status: 'pending_lock', reason: status.reason, ollama, lock };
  }

  // Politique de redémarrage observable : cooldown anti-boucle puis limite
  // fenêtre glissante. Aucune relance aveugle.
  const gate = canRestart();
  if (!gate.allowed) {
    log(`supervisor: pas de redemarrage — ${gate.reason}`);
    setRecovery('blocked_limit', gate.reason, { nextResetAt: gate.nextResetAt || null });
    return { status: 'blocked', reason: gate.reason, nextResetAt: gate.nextResetAt || null, runner: status, ollama };
  }

  recordRestart();
  const child = startRunner();
  if (!child) {
    // Départ retardé car un verrou vivant est apparu entre-temps : pas une erreur.
    setRecovery('pending_lock', 'verrou vivant detecté au moment du lancement');
    return { status: 'pending_lock', reason: status.reason, ollama };
  }

  setRecovery('restarted', `runner relance (pid ${child.pid})`, { childPid: child.pid });
  return { status: 'restarted', runner: status, ollama, childPid: child.pid };
}

async function watch() {
  log('supervisor: watch mode started (check every 60s)');
  while (true) {
    try {
      await check();
    } catch (e) {
      log(`supervisor: check error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 60000));
  }
}

const args = process.argv.slice(2);
if (args.includes('--check')) {
  check().then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
} else if (args.includes('--restart')) {
  // Forçage manuel explicite (évasion volontaire des garde-fous automatiques) :
  // reste journalisé et visible via --check, jamais silencieux.
  const gate = canRestart();
  if (!gate.allowed) log(`supervisor: redemarrage manuel malgre la limite (${gate.reason})`);
  recordRestart();
  const child = startRunner();
  log(`supervisor: manual restart initiated${child ? ` (pid ${child.pid})` : ' (verrou vivant: lancement ignore)'}`);
} else {
  // Default: watch mode
  watch();
}

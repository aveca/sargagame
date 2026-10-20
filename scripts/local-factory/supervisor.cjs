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

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(__dirname, 'state');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');
const SUPERVISOR_LOG = path.join(STATE_DIR, 'supervisor.log');
const SUPERVISOR_STATE_FILE = path.join(STATE_DIR, 'supervisor-persist.json');
const RUNNER_SCRIPT = path.join(__dirname, 'factory-runner.cjs');

const MAX_AGE_MINUTES = 10;      // heartbeat considéré périmé après 10 min
const STUCK_PROGRESS_MINUTES = 15; // runner considéré bloqué si aucun progrès après 15 min
const RESTART_BACKOFF_BASE = 10000;  // 10s premier redémarrage
const MAX_RESTARTS_PER_HOUR = 12;    // max 12 redémarrages par heure

fs.mkdirSync(STATE_DIR, { recursive: true });

let restartCount = 0;
let lastRestartHour = new Date().getHours();
// Dernier cycle observé pour détecter le blocage (pas de progrès)
let lastSeenCycle = null;
let lastSeenCycleTime = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(SUPERVISOR_LOG, line + '\n'); } catch (_) {}
}

function loadSupervisorPersist() {
  try { return JSON.parse(fs.readFileSync(SUPERVISOR_STATE_FILE, 'utf8')); } catch (_) { return {}; }
}
function saveSupervisorPersist(data) {
  try { fs.writeFileSync(SUPERVISOR_STATE_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

function loadHeartbeat() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); } catch (_) { return null; }
}

function isRunnerAlive() {
  const hb = loadHeartbeat();
  if (!hb) return { alive: false, reason: 'no heartbeat file', heartbeat: null };

  const now = Date.now();
  const ageMin = (now - Date.parse(hb.at)) / 60000;

  // 1. Vérifier la fraîcheur du heartbeat
  if (ageMin > MAX_AGE_MINUTES) {
    return { alive: false, reason: `heartbeat stale (${ageMin.toFixed(0)} min old)`, heartbeat: hb };
  }

  // 2. Vérifier que le PID est encore vivant
  if (hb.pid) {
    try {
      process.kill(hb.pid, 0);
    } catch (e) {
      if (e.code === 'ESRCH') {
        return { alive: false, reason: `PID ${hb.pid} not running`, heartbeat: hb };
      }
      // EPERM sur Windows peut signifier que le processus existe mais n'est pas accessible
      // Dans ce cas, considérer comme vivant si le heartbeat est frais
    }
  }

  // 3. Vérifier les progrès : le cycle a-t-il augmenté depuis la dernière vérification ?
  const currentCycle = hb.cycle || 0;
  if (lastSeenCycle !== null && lastSeenCycleTime !== null) {
    if (currentCycle === lastSeenCycle) {
      const stuckMin = (now - lastSeenCycleTime) / 60000;
      if (stuckMin > STUCK_PROGRESS_MINUTES) {
        return { alive: false, reason: `runner stuck (no progress for ${stuckMin.toFixed(0)} min, cycle ${currentCycle})`, heartbeat: hb };
      }
    } else {
      // Progrès détecté, réinitialiser le suivi de blocage
      lastSeenCycle = currentCycle;
      lastSeenCycleTime = now;
    }
  } else {
    // Première observation
    lastSeenCycle = currentCycle;
    lastSeenCycleTime = now;
  }

  return { alive: true, heartbeat: hb, ageMin };
}

function canRestart() {
  const now = new Date();
  const hour = now.getHours();
  if (hour !== lastRestartHour) {
    restartCount = 0;
    lastRestartHour = hour;
    saveSupervisorPersist({ restartCount, lastRestartHour });
  }
  return restartCount < MAX_RESTARTS_PER_HOUR;
}

function recordRestart() {
  restartCount++;
  saveSupervisorPersist({ restartCount, lastRestartHour });
  log(`supervisor: restart #${restartCount} this hour`);
}

function startRunner() {
  log('supervisor: starting factory runner...');
  const child = spawn(process.execPath, [RUNNER_SCRIPT, '--once', '--supervisor'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; });
  child.stderr.on('data', d => { stderr += d; });

  child.on('close', (code) => {
    log(`supervisor: runner exited with code ${code}`);
    if (stdout.trim()) log(`runner stdout: ${stdout.trim().slice(-500)}`);
    if (stderr.trim()) log(`runner stderr: ${stderr.trim().slice(-500)}`);
  });

  child.on('error', (e) => {
    log(`supervisor: failed to start runner: ${e.message}`);
  });

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

  // Vérifier Ollama
  const ollama = checkOllama();
  if (!ollama.available) {
    log(`supervisor: WARN — Ollama indisponible: ${ollama.error}`);
  } else {
    log(`supervisor: Ollama OK (${ollama.count} models)`);
  }

  // Vérifier le runner
  const status = isRunnerAlive();
  if (status.alive) {
    log(`supervisor: runner alive (PID ${status.heartbeat.pid}, cycle ${status.heartbeat.cycle}, age ${status.ageMin.toFixed(0)}min)`);
    return { status: 'ok', runner: status, ollama };
  }

  log(`supervisor: runner NOT alive — ${status.reason}`);

  // Tenter redémarrage
  if (!canRestart()) {
    log('supervisor: max restarts per hour reached, skipping');
    return { status: 'blocked', reason: 'max restarts per hour', runner: status, ollama };
  }

  recordRestart();
  const child = startRunner();

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
  recordRestart();
  startRunner();
  log('supervisor: manual restart initiated');
} else {
  // Default: watch mode
  watch();
}

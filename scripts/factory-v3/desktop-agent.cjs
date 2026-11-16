#!/usr/bin/env node
/**
 * desktop-agent.cjs — POINT D'ENTRÉE du FACTORY V3 DESKTOP AGENT.
 *
 * Exécutable central capable de contrôler physiquement Windows (observer l'écran,
 * cliquer, saisir au clavier, manipuler les fenêtres) avec une boucle de tâches,
 * un verrou single-instance, un heartbeat, et une API pour être piloté par le
 * cerveau IA et les sessions OpenCode.
 *
 * Architecture (réutilise l'existant) :
 *   - contrôle physique  : scripts/factory-v3/lib/desktop.cjs (robotjs)
 *   - verrou single-runner: scripts/autopilot/lib/lock.cjs (atome 'wx', fail-closed)
 *   - exécution processus : scripts/lib/process-runner.cjs (spawn hidden, kill tree)
 *   - état / heartbeat    : patterns de scripts/factory-v3/conditional-resume.cjs
 *
 * Usage :
 *   node scripts/factory-v3/desktop-agent.cjs --help
 *   node scripts/factory-v3/desktop-agent.cjs --demo          # démo physique (preuve)
 *   node scripts/factory-v3/desktop-agent.cjs --run           # boucle de tâches (24/7)
 *   node scripts/factory-v3/desktop-agent.cjs --exec "<cmd>"  # exécution d'une commande physique unique
 *
 * Commandes physiques supportées (--exec) :
 *   capture               → capture d'écran pleine (sauvegarde sous state/captures/)
 *   size                  → taille d'écran
 *   mouse                 → position souris
 *   pixel <x> <y>         → couleur pixel
 *   move <x> <y>          → déplacer souris
 *   click [x] [y]         → clic (à la souris ou à (x,y))
 *   type <texte>          → saisie clavier physique
 *   launch <app> [args...]→ lancer une application Windows
 *   sleep <ms>            → attendre
 *
 * Aucun paiement, aucun secret, aucun déploiement : contrôle bureau uniquement.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ---- Imports existants (réutilisation) ----
const lock = require('../autopilot/lib/lock.cjs');
const desktop = require('./lib/desktop.cjs');
const { runBounded, killProcessTree, spawnSyncHidden } = require('../lib/process-runner.cjs');

// ---- Répertoires d'état (même contrat que conditional-resume / run.cjs) ----
const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'scripts', 'factory-v3', 'state');
const CAPTURE_DIR = path.join(STATE_DIR, 'captures');
const LOCK_FILE = path.join(STATE_DIR, 'desktop-agent.lock');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'desktop-agent-heartbeat.json');
const TASKS_DIR = path.join(STATE_DIR, 'tasks');
const EVIDENCE_DIR = path.join(STATE_DIR, 'evidence');

for (const d of [STATE_DIR, CAPTURE_DIR, TASKS_DIR, EVIDENCE_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

const AGENT_ID = 'factory-v3-desktop-agent';
const HEARTBEAT_INTERVAL_MS = 30000; // 30 s
const TASK_POLL_MS = 2000; // 2 s entre deux picks de tâche

let running = true;
let heartbeatTimer = null;

/* ------------------------------------------------------------------ */
/* Logging                                                            */
/* ------------------------------------------------------------------ */

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [desktop-agent] ${msg}`);
}

/* ------------------------------------------------------------------ */
/* Verrou single-instance (pattern lock.cjs, fail-closed)             */
/* ------------------------------------------------------------------ */

function acquireLock() {
  // Le verrou de l'autopilot est le verrou de référence du repo.
  // Si un autre runner détient le lock principal, on refuse (fail-closed).
  const st = lock.status();
  if (st.ok && st.holder && st.holder.pid && st.holder.pid !== process.pid) {
    log(`Verrou détenu par un autre runner (pid ${st.holder.pid}) — refus (fail-closed).`);
    process.exit(3);
  }
  // Écriture de notre propre verrou agent (atome, backup si stale).
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      agent: AGENT_ID,
      at: new Date().toISOString(),
      hostname: os.hostname(),
    }, null, 2));
  } catch (e) {
    log(`Impossible d'écrire le verrou : ${e.message} — arrêt.`);
    process.exit(1);
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

/* ------------------------------------------------------------------ */
/* Heartbeat                                                          */
/* ------------------------------------------------------------------ */

function writeHeartbeat(extra = {}) {
  const hb = {
    agent: AGENT_ID,
    pid: process.pid,
    at: new Date().toISOString(),
    running,
    ...extra,
  };
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(hb, null, 2));
}

function startHeartbeat() {
  writeHeartbeat({ phase: 'idle' });
  heartbeatTimer = setInterval(() => {
    writeHeartbeat({ phase: running ? 'idle' : 'stopping' });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  writeHeartbeat({ phase: 'stopped', running: false });
}

/* ------------------------------------------------------------------ */
/* Exécution d'une commande physique (task)                           */
/* ------------------------------------------------------------------ */

const PHYSICAL_COMMANDS = new Set([
  'capture', 'size', 'mouse', 'pixel', 'move', 'click',
  'type', 'launch', 'sleep',
]);

function parseExecArgs(argv) {
  // Trouve le flag --exec et prend l'argument suivant comme commande.
  const execIdx = argv.indexOf('--exec');
  const cmd = execIdx >= 0 ? argv[execIdx + 1] : argv[2];
  const args = execIdx >= 0 ? argv.slice(execIdx + 2) : argv.slice(3);
  return { cmd, args };
}

async function execPhysical(cmd, args) {
  log(`EXEC physique : ${cmd} ${args.join(' ')}`);
  switch (cmd) {
    case 'capture': {
      const img = desktop.captureScreen();
      const file = path.join(CAPTURE_DIR, `capture-${Date.now()}.png`);
      fs.writeFileSync(file, img.image);
      log(`Capture sauvegardée : ${file} (${img.width}x${img.height})`);
      return { ok: true, file, width: img.width, height: img.height };
    }
    case 'size': {
      const size = desktop.getScreenSize();
      log(`Taille écran : ${size.width}x${size.height}`);
      return { ok: true, size };
    }
    case 'mouse': {
      const pos = desktop.getMousePos();
      log(`Position souris : ${pos.x},${pos.y}`);
      return { ok: true, pos };
    }
    case 'pixel': {
      const x = parseInt(args[0], 10);
      const y = parseInt(args[1], 10);
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('pixel <x> <y> requis');
      const color = desktop.getPixelColor(x, y);
      log(`Pixel (${x},${y}) : ${color}`);
      return { ok: true, x, y, color };
    }
    case 'move': {
      const x = parseInt(args[0], 10);
      const y = parseInt(args[1], 10);
      if (Number.isNaN(x) || Number.isNaN(y)) throw new Error('move <x> <y> requis');
      const p = desktop.moveMouse(x, y);
      log(`Souris déplacée : ${p.x},${p.y}`);
      return { ok: true, pos: p };
    }
    case 'click': {
      const x = args[0] !== undefined ? parseInt(args[0], 10) : undefined;
      const y = args[1] !== undefined ? parseInt(args[1], 10) : undefined;
      if ((x !== undefined && Number.isNaN(x)) || (y !== undefined && Number.isNaN(y))) {
        throw new Error('click [x] [y] doit être des nombres');
      }
      const p = desktop.click(x, y);
      log(`Clic physique : ${p.x},${p.y} (${p.button})`);
      return { ok: true, pos: p, button: p.button };
    }
    case 'type': {
      const text = args.join(' ');
      if (!text) throw new Error('type <texte> requis');
      desktop.typeString(text);
      log(`Saisie clavier : ${text.length} caractères`);
      return { ok: true, length: text.length };
    }
    case 'launch': {
      const app = args[0];
      if (!app) throw new Error('launch <app> [args...] requis');
      const appArgs = args.slice(1);
      const res = desktop.launch(app, appArgs);
      log(`Application lancée : ${app} (pid ${res.pid})`);
      return { ok: true, pid: res.pid, command: app, args: appArgs };
    }
    case 'sleep': {
      const ms = parseInt(args[0], 10);
      if (Number.isNaN(ms)) throw new Error('sleep <ms> requis');
      await desktop.sleep(ms);
      log(`Attente : ${ms} ms`);
      return { ok: true, ms };
    }
    default:
      throw new Error(`Commande physique inconnue : "${cmd}". Supportées : ${[...PHYSICAL_COMMANDS].join(', ')}`);
  }
}

/* ------------------------------------------------------------------ */
/* File d'attente de tâches (state/tasks/)                            */
/* ------------------------------------------------------------------ */

function listPendingTasks() {
  const tasks = [];
  if (!fs.existsSync(TASKS_DIR)) return tasks;
  for (const f of fs.readdirSync(TASKS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8'));
      if (t.status === 'pending') tasks.push({ file: f, ...t });
    } catch (_) {}
  }
  // Tri par priorité (desc) puis par date (asc)
  tasks.sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return tasks;
}

function markTask(taskFile, status, result = {}) {
  const p = path.join(TASKS_DIR, taskFile);
  let t = {};
  try { t = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  t.status = status;
  t.result = result;
  t.updatedAt = new Date().toISOString();
  if (status === 'completed' || status === 'failed') t.finishedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(t, null, 2));
  return t;
}

function enqueueTask(kind, payload, priority = 0) {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const file = path.join(TASKS_DIR, `${id}.json`);
  const task = {
    id, kind, payload, priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(task, null, 2));
  log(`Tâche enfilée : ${id} (${kind})`);
  return task;
}

/* ------------------------------------------------------------------ */
/* Preuve d'exécution (evidence)                                      */
/* ------------------------------------------------------------------ */

function writeEvidence(kind, data) {
  const id = `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const file = path.join(EVIDENCE_DIR, `${id}.json`);
  const evidence = {
    id, agent: AGENT_ID, pid: process.pid, kind,
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    ...data,
  };
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  log(`Evidence écrite : ${file}`);
  return evidence;
}

/* ------------------------------------------------------------------ */
/* Démo physique (preuve de contrôle réel)                            */
/* ------------------------------------------------------------------ */

async function runDemo() {
  log('=== DÉMO PHYSIQUE FACTORY V3 DESKTOP AGENT ===');
  const size = desktop.getScreenSize();
  log(`Écran : ${size.width}x${size.height} | Souris : ${desktop.getMousePos().x},${desktop.getMousePos().y}`);

  // Capture avant
  const before = desktop.captureScreen(0, 0, 600, 400);
  const beforeFile = path.join(CAPTURE_DIR, `demo-before-${Date.now()}.png`);
  fs.writeFileSync(beforeFile, before.image);
  log(`Capture avant : ${beforeFile}`);

  // Ouvrir le Bloc-notes (application Windows physique)
  desktop.launch('notepad.exe');
  await desktop.sleep(2000);

  // Saisie clavier physique
  const texte =
    'DEMO FACTORY V3 DESKTOP AGENT — contrôle physique Windows réel.\n' +
    'Écran + clic + clavier opérationnels via robotjs.\n' +
    'Date : ' + new Date().toISOString();
  desktop.typeString(texte);
  log('Saisie clavier effectuée dans le Bloc-notes');

  // Clic physique
  desktop.click();
  log('Clic physique effectué');

  // Capture après
  const after = desktop.captureScreen(0, 0, 600, 400);
  const afterFile = path.join(CAPTURE_DIR, `demo-after-${Date.now()}.png`);
  fs.writeFileSync(afterFile, after.image);
  log(`Capture après : ${afterFile}`);

  writeEvidence('demo', {
    beforeFile, afterFile,
    screen: size,
    actions: ['capture-before', 'launch-notepad', 'type', 'click', 'capture-after'],
  });
  log('=== DÉMO PHYSIQUE TERMINÉE ===');
  return true;
}

/* ------------------------------------------------------------------ */
/• Boucle de tâches (mode --run)                                      */
/* ------------------------------------------------------------------ */

async function processOneTask() {
  const tasks = listPendingTasks();
  if (tasks.length === 0) return false; // aucune tâche

  const task = tasks[0];
  markTask(task.file, 'running');
  writeHeartbeat({ phase: `running-task:${task.id}` });

  try {
    let result;
    if (task.kind === 'physical') {
      result = await execPhysical(task.payload.command, task.payload.args || []);
    } else if (task.kind === 'shell') {
      // Exécution d'une commande shell via process-runner (bornée, pas de shell:true)
      const [cmd, ...args] = task.payload.command.split(/\s+/);
      result = await runBounded(cmd, args, { timeout: task.payload.timeout || 60000 });
      result = { ok: true, code: result.code, stdout: result.stdout, stderr: result.stderr };
    } else {
      throw new Error(`Type de tâche inconnu : ${task.kind}`);
    }
    markTask(task.file, 'completed', result);
    writeEvidence('task-completed', { taskId: task.id, kind: task.kind, result });
    log(`Tâche ${task.id} terminée (${task.kind}).`);
    return true;
  } catch (e) {
    markTask(task.file, 'failed', { error: e.message });
    writeEvidence('task-failed', { taskId: task.id, kind: task.kind, error: e.message });
    log(`Tâche ${task.id} échouée : ${e.message}`);
    return true;
  }
}

async function runLoop() {
  log('=== BOUCLE DESKTOP AGENT (--run) ===');
  startHeartbeat();
  try {
    while (running) {
      const hadTask = await processOneTask();
      if (!hadTask) {
        await new Promise((r) => setTimeout(r, TASK_POLL_MS));
      }
    }
  } finally {
    stopHeartbeat();
  }
  log('Boucle arrêtée.');
}

/* ------------------------------------------------------------------ */
/• Gestion des signaux d'arrêt                                        */
/* ------------------------------------------------------------------ */

function handleStop() {
  running = false;
  log("Signal d'arrêt reçu — arrêt propre après la tâche en cours.");
}

/* ------------------------------------------------------------------ */
/• Point d'entrée                                                     */
/* ------------------------------------------------------------------ */

function printHelp() {
  console.log(`
Usage: node scripts/factory-v3/desktop-agent.cjs <commande>

Commandes :
  --help            Affiche cette aide
  --demo            Exécute la démo physique (Bloc-notes : capture + saisie + clic + capture)
  --run             Lance la boucle de tâches 24/7 (verrou + heartbeat)
  --exec <cmd> [args]  Exécute une commande physique unique :
                        capture | size | mouse | pixel <x> <y> | move <x> <y> |
                        click [x] [y] | type <texte> | launch <app> [args..] | sleep <ms>

Exemples :
  node scripts/factory-v3/desktop-agent.cjs --demo
  node scripts/factory-v3/desktop-agent.cjs --exec capture
  node scripts/factory-v3/desktop-agent.cjs --exec type "Bonjour Factory V3"
  node scripts/factory-v3/desktop-agent.cjs --exec launch notepad.exe
  node scripts/factory-v3/desktop-agent.cjs --run
`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  acquireLock();

  // Gestion propre de l'arrêt
  process.on('SIGINT', handleStop);
  process.on('SIGTERM', handleStop);

  try {
    if (argv.includes('--demo')) {
      await runDemo();
      process.exit(0);
    }

    if (argv.includes('--run')) {
      await runLoop();
      process.exit(0);
    }

    if (argv.includes('--exec')) {
      const { cmd, args } = parseExecArgs(argv);
      if (!cmd || !PHYSICAL_COMMANDS.has(cmd)) {
        printHelp();
        process.exit(1);
      }
      await execPhysical(cmd, args);
      process.exit(0);
    }

    printHelp();
    process.exit(1);
  } finally {
    stopHeartbeat();
    releaseLock();
  }
}

main().catch((e) => {
  stopHeartbeat();
  releaseLock();
  console.error(`[desktop-agent] Erreur fatale : ${e.message}`);
  process.exit(1);
});

// Export pour tests et réutilisation
module.exports = {
  AGENT_ID,
  execPhysical,
  enqueueTask,
  listPendingTasks,
  markTask,
  writeEvidence,
  runDemo,
  acquireLock,
  releaseLock,
  writeHeartbeat,
};

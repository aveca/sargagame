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
const MISSIONS_DIR = path.join(STATE_DIR, 'missions');
const SESSIONS_DIR = path.join(STATE_DIR, 'sessions');
const RESULTS_DIR = path.join(STATE_DIR, 'results');

for (const d of [STATE_DIR, CAPTURE_DIR, TASKS_DIR, EVIDENCE_DIR, MISSIONS_DIR, SESSIONS_DIR, RESULTS_DIR]) {
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
/* Intégration de mission + dédoublonnage (state/missions/)           */
/* ------------------------------------------------------------------ */

// Sessions A–D : capacité et statut. Session A = ce contrôleur desktop.
const SESSIONS = {
  A: { id: 'A', role: 'factory/desktop-agent', status: 'idle', currentTask: null, heartbeatAt: null, maxConcurrent: 1 },
  B: { id: 'B', role: 'sargagame/revenue', status: 'idle', currentTask: null, heartbeatAt: null, maxConcurrent: 1 },
  C: { id: 'C', role: 'integration/QA', status: 'idle', currentTask: null, heartbeatAt: null, maxConcurrent: 1 },
  D: { id: 'D', role: 'supervision/resilience', status: 'idle', currentTask: null, heartbeatAt: null, maxConcurrent: 1 },
};

function sessionHeartbeat(sessionId, extra = {}) {
  const s = SESSIONS[sessionId];
  if (!s) return { ok: false, reason: `session inconnue : ${sessionId}` };
  s.heartbeatAt = new Date().toISOString();
  s.status = extra.status || s.status;
  const file = path.join(SESSIONS_DIR, `session-${sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...s, ...extra }, null, 2));
  return { ok: true, session: s };
}

function sessionStatus(sessionId) {
  const s = SESSIONS[sessionId];
  if (!s) return null;
  return { ...s };
}

/**
 * Dédoublonnage d'une mission : on refuse une mission dont l'identifiant
 * (missionId) existe déjà, ou dont le contenu (hash) a déjà été ingéré.
 * Retourne {ok:true, mission, duplicate:false} ou {ok:false, duplicate:true, reason}.
 */
function intakeMission(mission) {
  if (!mission || typeof mission !== 'object') {
    return { ok: false, reason: 'mission invalide (objet attendu)' };
  }
  const missionId = mission.missionId || `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const contentHash = require('crypto').createHash('sha1')
    .update(JSON.stringify({ kind: mission.kind, title: mission.title, payload: mission.payload }))
    .digest('hex').slice(0, 12);

  // Vérifier doublon par missionId.
  const idFile = path.join(MISSIONS_DIR, `${missionId}.json`);
  if (fs.existsSync(idFile)) {
    const existing = JSON.parse(fs.readFileSync(idFile, 'utf8'));
    return { ok: false, duplicate: true, reason: `missionId déjà ingéré : ${missionId}`, mission: existing };
  }

  // Vérifier doublon par contenu (hash) sur toutes les missions existantes.
  for (const f of fs.readdirSync(MISSIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(MISSIONS_DIR, f), 'utf8'));
      if (m.contentHash === contentHash) {
        return { ok: false, duplicate: true, reason: `contenu déjà ingéré (hash ${contentHash})`, mission: m };
      }
    } catch (_) {}
  }

  const record = {
    id: missionId,
    missionId,
    contentHash,
    kind: mission.kind || 'generic',
    title: mission.title || '(sans titre)',
    payload: mission.payload || {},
    status: 'ingested', // ingested → decomposed → assigned → running → blocked → completed/failed
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessions: {},
    tasks: [],
    result: null,
    receipt: null,
  };
  fs.writeFileSync(idFile, JSON.stringify(record, null, 2));
  writeEvidence('mission-ingested', { missionId, kind: record.kind, title: record.title, contentHash });
  log(`Mission ingérée : ${missionId} (${record.kind})`);
  return { ok: true, mission: record, duplicate: false };
}

function listMissions() {
  const missions = [];
  if (!fs.existsSync(MISSIONS_DIR)) return missions;
  for (const f of fs.readdirSync(MISSIONS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try { missions.push(JSON.parse(fs.readFileSync(path.join(MISSIONS_DIR, f), 'utf8'))); } catch (_) {}
  }
  missions.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return missions;
}

function updateMission(missionId, patch) {
  const file = path.join(MISSIONS_DIR, `${missionId}.json`);
  let m = {};
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return { ok: false, reason: 'mission introuvable' }; }
  Object.assign(m, patch, { updatedAt: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
  return { ok: true, mission: m };
}

/* ------------------------------------------------------------------ */
/* Décomposition de mission + affectation de session (state/tasks/)   */
/* ------------------------------------------------------------------ */

/**
 * Décompose une mission en sous-tâches et les met en file d'attente.
 * Selon le kind de mission, génère des tâches physiques ou shell.
 * Retourne la liste des tâches créées.
 */
function decomposeMission(missionId) {
  const file = path.join(MISSIONS_DIR, `${missionId}.json`);
  let m = {};
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {
    return { ok: false, reason: 'mission introuvable' };
  }
  if (m.status !== 'ingested') {
    return { ok: false, reason: `mission déjà traitée (${m.status})` };
  }

  const tasks = [];
  const kind = m.kind;
  const payload = m.payload || {};

  if (kind === 'physical') {
    tasks.push(enqueueTask('physical', { command: payload.command, args: payload.args || [] }, payload.priority || 0));
  } else if (kind === 'shell') {
    tasks.push(enqueueTask('shell', { command: payload.command, timeout: payload.timeout || 60000 }, payload.priority || 0));
  } else if (kind === 'composite') {
    const steps = payload.steps || [];
    steps.forEach((step, i) => {
      tasks.push(enqueueTask(step.kind || 'shell', {
        command: step.command,
        args: step.args || [],
        timeout: step.timeout || 60000,
        missionId,
        stepIndex: i,
      }, step.priority || 0));
    });
  } else {
    tasks.push(enqueueTask('shell', { command: payload.command || 'echo mission', timeout: 60000 }, 0));
  }

  m.tasks = tasks.map(t => t.id);
  m.status = 'decomposed';
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(m, null, 2));
  writeEvidence('mission-decomposed', { missionId, taskCount: tasks.length, kind });
  log(`Mission ${missionId} décomposée en ${tasks.length} tâche(s).`);
  return { ok: true, mission: m, tasks };
}

/**
 * Affecte une tâche à une session disponible (idle + heartbeat frais < 5 min).
 */
function assignSession(taskId) {
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  let task = {};
  try { task = JSON.parse(fs.readFileSync(taskFile, 'utf8')); } catch (_) {
    return { ok: false, reason: 'tâche introuvable' };
  }
  if (task.status !== 'pending') {
    return { ok: false, reason: `tâche déjà prise (${task.status})` };
  }

  const now = Date.now();
  let best = null;
  for (const [id, s] of Object.entries(SESSIONS)) {
    const hbAge = s.heartbeatAt ? now - new Date(s.heartbeatAt).getTime() : Infinity;
    const fresh = s.status === 'idle' && (!s.heartbeatAt || hbAge < 5 * 60 * 1000);
    if (fresh && (!best || (s.heartbeatAt && best.heartbeatAt && new Date(s.heartbeatAt) < new Date(best.heartbeatAt)))) {
      best = { id, ...s };
    }
  }

  if (!best) return { ok: false, reason: 'aucune session disponible' };

  const s = SESSIONS[best.id];
  s.status = 'running';
  s.currentTask = taskId;
  s.heartbeatAt = new Date().toISOString();
  sessionHeartbeat(best.id, { status: 'running', currentTask: taskId });

  task.status = 'assigned';
  task.assignedTo = best.id;
  task.assignedAt = new Date().toISOString();
  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
  markTask(`${taskId}.json`, 'assigned', { session: best.id });

  writeEvidence('task-assigned', { taskId, session: best.id, kind: task.kind });
  log(`Tâche ${taskId} affectée à la session ${best.id}.`);
  return { ok: true, session: { id: best.id, role: s.role } };
}

/**
 * Une session réclame sa prochaine tâche affectée.
 * Ne dépend pas de session.currentTask (état en mémoire, réinitialisé à chaque
 * processus) : seule la source de vérité sur disque (tâche assignée à la
 * session, statut 'assigned') fait foi.
 */
function claimTask(sessionId) {
  const s = SESSIONS[sessionId];
  if (!s) return { ok: false, reason: 'session inconnue' };

  const tasks = listTasksAssignedTo(sessionId);
  if (tasks.length === 0) return { ok: false, reason: 'aucune tâche assignée à cette session' };
  const task = tasks[0];

  // Une session ne peut réclamer qu'une tâche à la fois, sauf si c'est la
  // même (reprise après crash).
  if (s.status === 'running' && s.currentTask && s.currentTask !== task.id) return { ok: false, reason: 'session déjà occupée' };

  const taskFile = path.join(TASKS_DIR, `${task.id}.json`);
  let t = {};
  try { t = JSON.parse(fs.readFileSync(taskFile, 'utf8')); } catch (_) {
    return { ok: false, reason: 'tâche introuvable' };
  }
  if (t.assignedTo !== sessionId) return { ok: false, reason: 'tâche non affectée à cette session' };
  if (t.status !== 'assigned') return { ok: false, reason: `tâche non assignée (${t.status})` };

  t.status = 'running';
  t.startedAt = new Date().toISOString();
  fs.writeFileSync(taskFile, JSON.stringify(t, null, 2));
  markTask(`${task.id}.json`, 'running', { session: sessionId });
  s.status = 'running';
  s.currentTask = task.id;
  s.heartbeatAt = new Date().toISOString();
  sessionHeartbeat(sessionId, { status: 'running', currentTask: task.id });

  return { ok: true, task: t };
}

/**
 * Marque une tâche terminée et libère la session.
 */
function completeTask(sessionId, taskId, result = {}) {
  const s = SESSIONS[sessionId];
  if (!s) return { ok: false, reason: 'session inconnue' };
  if (s.currentTask !== taskId) return { ok: false, reason: 'tâche non courante pour cette session' };

  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  markTask(`${taskId}.json`, 'completed', result);

  s.status = 'idle';
  s.currentTask = null;
  s.heartbeatAt = new Date().toISOString();
  sessionHeartbeat(sessionId, { status: 'idle', currentTask: null });

  writeEvidence('task-completed', { taskId, session: sessionId, result });
  return { ok: true };
}

/**
 * Détecte les sessions bloquées (pas de heartbeat frais alors qu'en running).
 */
function detectBlockedSessions() {
  const now = Date.now();
  const blocked = [];
  for (const [id, s] of Object.entries(SESSIONS)) {
    if (s.status === 'running' && s.heartbeatAt) {
      const age = now - new Date(s.heartbeatAt).getTime();
      if (age > 5 * 60 * 1000) {
        blocked.push({ id, ...s, reason: `heartbeat âgé de ${Math.round(age / 1000)} s` });
      }
    }
  }
  return blocked;
}

/**
 * Réassigne la tâche d'une session bloquée vers une autre session disponible.
 */
function reassignBlocked(sessionId) {
  const s = SESSIONS[sessionId];
  if (!s || !s.currentTask) return { ok: false, reason: 'session sans tâche à réassigner' };

  const taskId = s.currentTask;
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  let task = {};
  try { task = JSON.parse(fs.readFileSync(taskFile, 'utf8')); } catch (_) {
    return { ok: false, reason: 'tâche introuvable' };
  }

  task.status = 'pending';
  task.assignedTo = null;
  task.assignedAt = null;
  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
  markTask(`${taskId}.json`, 'pending', { reassignedFrom: sessionId });

  s.status = 'idle';
  s.currentTask = null;
  s.heartbeatAt = new Date().toISOString();
  sessionHeartbeat(sessionId, { status: 'idle', currentTask: null, blocked: true });

  writeEvidence('task-reassigned', { taskId, from: sessionId });
  log(`Tâche ${taskId} réassignée depuis la session bloquée ${sessionId}.`);
  return { ok: true, taskId, from: sessionId };
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

/* ------------------------------------------------------------------ */
/* Planification : décomposition, affectation, réassignation          */
/* ------------------------------------------------------------------ */

const DECOMPOSE_EVERY = 10; // décomposer les missions ingestées toutes les N itérations

let decomposeCounter = 0;

function decomposeIngestedMissions() {
  const missions = listMissions();
  let count = 0;
  for (const m of missions) {
    if (m.status === 'ingested') {
      const r = decomposeMission(m.missionId);
      if (r.ok) count++;
    }
  }
  return count;
}

function assignPendingTasks() {
  const tasks = [];
  if (!fs.existsSync(TASKS_DIR)) return 0;
  for (const f of fs.readdirSync(TASKS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8'));
      if (t.status === 'pending') tasks.push(t);
    } catch (_) {}
  }
  let assigned = 0;
  for (const t of tasks) {
    const r = assignSession(t.id);
    if (r.ok) assigned++;
  }
  return assigned;
}

function reassignBlockedSessions() {
  const blocked = detectBlockedSessions();
  let count = 0;
  for (const b of blocked) {
    const r = reassignBlocked(b.id);
    if (r.ok) count++;
  }
  return count;
}

function listTasksAssignedTo(sessionId) {
  const tasks = [];
  if (!fs.existsSync(TASKS_DIR)) return tasks;
  for (const f of fs.readdirSync(TASKS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8'));
      if (t.assignedTo === sessionId && t.status === 'assigned') tasks.push({ file: f, ...t });
    } catch (_) {}
  }
  tasks.sort((a, b) => (b.priority || 0) - (a.priority || 0) || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return tasks;
}

async function processOneTaskForSession(sessionId) {
  const s = SESSIONS[sessionId];
  if (!s) return false;

  // Tâches assignées à cette session.
  let tasks = listTasksAssignedTo(sessionId);

  // Orphelins : tâche 'assigned' affectée à une session inactive de ce
  // processus → la reprendre (crash/restart recovery inter-processus).
  if (tasks.length === 0) {
    const orphan = findOrphanedAssignedTask(sessionId);
    if (orphan) {
      adoptTask(sessionId, orphan.id);
      tasks = listTasksAssignedTo(sessionId);
    }
  }
  if (tasks.length === 0) return false;

  const task = tasks[0];
  const claim = claimTask(sessionId);
  if (!claim.ok) {
    log(`Impossible de réclamer ${task.id} : ${claim.reason}`);
    return false; // aucun travail claimable → on dort, pas de boucle serrée
  }

  writeHeartbeat({ phase: `running-task:${task.id}`, session: sessionId });
  try {
    let result;
    if (task.kind === 'physical') {
      result = await execPhysical(task.payload.command, task.payload.args || []);
    } else if (task.kind === 'shell') {
      const [cmd, ...args] = task.payload.command.split(/\s+/);
      result = await runBounded(cmd, args, { timeout: task.payload.timeout || 60000 });
    } else {
      throw new Error(`Type de tâche inconnu : ${task.kind}`);
    }
    completeTask(sessionId, task.id, { ok: true, code: result.code, stdout: result.stdout, stderr: result.stderr });
    writeEvidence('task-completed', { taskId: task.id, kind: task.kind, result });
    log(`Tâche ${task.id} terminée (${task.kind}) par ${sessionId}.`);
    return true;
  } catch (e) {
    completeTask(sessionId, task.id, { ok: false, error: e.message });
    writeEvidence('task-failed', { taskId: task.id, kind: task.kind, error: e.message });
    log(`Tâche ${task.id} échouée : ${e.message}`);
    return true;
  }
}

/**
 * Trouve une tâche 'assigned' dont la session titulaire est inactive (idle)
 * dans ce processus : elle est orpheline (crash précédent) et peut être reprise.
 */
function findOrphanedAssignedTask(excludingSessionId) {
  if (!fs.existsSync(TASKS_DIR)) return null;
  const now = Date.now();
  for (const f of fs.readdirSync(TASKS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8'));
      if (t.status !== 'assigned' || !t.assignedTo) continue;
      const holder = SESSIONS[t.assignedTo];
      const holderIdle = holder && holder.status === 'idle';
      // N'adopte que si le titulaire n'est pas cette session et est inactif.
      if (t.assignedTo !== excludingSessionId && holderIdle) return t;
    } catch (_) {}
  }
  return null;
}

/**
 * Passe la propriété d'une tâche déjà 'assigned' à une autre session (sans
 * repasser par 'pending').
 */
function adoptTask(sessionId, taskId) {
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  let t = {};
  try { t = JSON.parse(fs.readFileSync(taskFile, 'utf8')); } catch (_) { return false; }
  const previous = t.assignedTo;
  t.assignedTo = sessionId;
  fs.writeFileSync(taskFile, JSON.stringify(t, null, 2));
  markTask(`${taskId}.json`, 'assigned', { session: sessionId, adoptedFrom: previous });
  writeEvidence('task-adopted', { taskId, from: previous, to: sessionId });
  log(`Tâche ${taskId} adoptée par ${sessionId} (était ${previous}).`);
  return true;
}

async function runLoop() {
  log('=== BOUCLE DESKTOP AGENT (--run) ===');
  startHeartbeat();
  try {
    while (running) {
      // 1. Décomposer les missions ingestées pas encore traitées.
      if (decomposeCounter++ % DECOMPOSE_EVERY === 0) {
        const n = decomposeIngestedMissions();
        if (n > 0) log(`${n} mission(s) décomposée(s).`);
      }
      // 2. Affecter les tâches pending aux sessions libres.
      assignPendingTasks();
      // 3. Détecter les sessions bloquées et réassigner leurs tâches.
      reassignBlockedSessions();
      // 4. Cette session (A) réclame et exécute sa prochaine tâche assignée.
      const hadTask = await processOneTaskForSession('A');
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
  --intake <fichier>   Ingère une mission JSON (dédoublonnage par missionId + contenu).
  --status             Affiche l'état des missions, sessions et tâches pour reporting.
  --run                Lance la boucle de tâches 24/7 (verrou + heartbeat)

Exemples :
  node scripts/factory-v3/desktop-agent.cjs --demo
  node scripts/factory-v3/desktop-agent.cjs --exec capture
  node scripts/factory-v3/desktop-agent.cjs --exec type "Bonjour Factory V3"
  node scripts/factory-v3/desktop-agent.cjs --exec launch notepad.exe
  node scripts/factory-v3/desktop-agent.cjs --intake missions/mission-001.json
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

    if (argv.includes('--intake')) {
      const idx = argv.indexOf('--intake');
      const file = argv[idx + 1];
      if (!file) {
        console.error('[desktop-agent] --intake <fichier> requis');
        process.exit(1);
      }
      let mission;
      try { mission = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
        console.error(`[desktop-agent] Impossible de lire la mission : ${e.message}`);
        process.exit(1);
      }
      const result = intakeMission(mission);
      if (!result.ok) {
        console.log(`[desktop-agent] Mission rejetée : ${result.reason}`);
        process.exit(result.duplicate ? 2 : 1);
      }
      console.log(`[desktop-agent] Mission acceptée : ${result.mission.id} (${result.mission.kind})`);
      process.exit(0);
    }

    if (argv.includes('--status')) {
      const missions = listMissions();
      const sessions = Object.values(SESSIONS);
      console.log(`=== STATUS DESKTOP AGENT (${new Date().toISOString()}) ===`);
      console.log(`Sessions:`);
      for (const s of sessions) {
        const hb = s.heartbeatAt ? `hb=${new Date(s.heartbeatAt).toISOString()}` : 'hb=none';
        console.log(`  ${s.id} (${s.role}): status=${s.status} currentTask=${s.currentTask || '-'} ${hb}`);
      }
      console.log(`Missions (${missions.length}):`);
      for (const m of missions) {
        console.log(`  ${m.missionId} [${m.kind}] status=${m.status} tasks=${(m.tasks||[]).length} created=${m.createdAt}`);
      }
      const blocked = detectBlockedSessions();
      console.log(`Sessions bloquées: ${blocked.length}`);
      process.exit(0);
    }

    printHelp();
    process.exit(1);
  } finally {
    stopHeartbeat();
    releaseLock();
  }
}

if (require.main === module) {
  main().catch((e) => {
    stopHeartbeat();
    releaseLock();
    console.error(`[desktop-agent] Erreur fatale : ${e.message}`);
    process.exit(1);
  });
}

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
  intakeMission,
  listMissions,
  updateMission,
  sessionHeartbeat,
  sessionStatus,
  SESSIONS,
  decomposeMission,
  assignSession,
  claimTask,
  completeTask,
  detectBlockedSessions,
  reassignBlocked,
};

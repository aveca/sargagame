#!/usr/bin/env node
/**
 * common.cjs — bases partagées de l'autopilot (paths, fs, log, run-id).
 * Zéro dépendance externe. CommonJS (le runner Windows l'exécute directement).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AP_DIR = path.join(ROOT, '.ai', 'autopilot');

const DIRS = [
  'observations', 'research', 'opportunities', 'experiments',
  'baselines', 'regressions', 'runs', 'decisions',
];

function ensureDirs() {
  for (const d of DIRS) {
    fs.mkdirSync(path.join(AP_DIR, d), { recursive: true });
  }
}

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, p); // écriture atomique — un crash ne laisse jamais un JSON tronqué
}

function loadConfig() {
  const cfg = readJSON(path.join(AP_DIR, 'config.json'), null);
  if (!cfg) throw new Error('.ai/autopilot/config.json introuvable ou invalide');
  return cfg;
}

let _runSeq = 0;
function runId(d = new Date()) {
  // Identifiant de cycle RÉELLEMENT unique (triable) :
  //   YYYY-MM-DD-HHMMSS + pid base36 + aléatoire.
  // Le format minute seul (YYYY-MM-DD-HHMM) a causé la collision 1608 :
  // 2 cycles dans la même minute ⇒ même nom de branche/worktree
  // ⇒ `git worktree add -b` → "already exists" → exit 1.
  // Le pid sépare les processus concurrents, l'aléatoire couvre les
  // redémarrages rapides / horloges douteuses. Charset [0-9a-z-] = git-ref sûr.
  const t = d instanceof Date ? d : new Date(d);
  // YYYY-MM-DD-HHMMSSmmm (UTC) : préfixe lisible, triable, compatible avec
  // l'ancien format minute (runIdMinute). Les millisecondes rendent les cycles
  // séquentiels uniques de façon déterministe ; pid + aléatoire couvrent les
  // processus concurrents et les horloges douteuses.
  const base = t.toISOString().slice(0, 23).replace('T', '-').replace(/[:.]/g, '');
  const pid = process.pid.toString(36);
  // Compteur monotonique par processus : unicité stricte même si l'horloge
  // ne progresse pas (granularité Windows ~15 ms). pid + aléatoire couvrent
  // les processus concurrents et les redémarrages.
  const seq = (++_runSeq).toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${base}-p${pid}-${seq}${rnd}`;
}

/** Préfixe minute d'un runId (regroupement/affichage, ex: 2026-09-30-1608). */
function runIdMinute(id) {
  const m = String(id || '').match(/^(\d{4}-\d{2}-\d{2}-\d{4})/);
  return m ? m[1] : String(id || '');
}

function nowIso() { return new Date().toISOString(); }

/** Log horodaté vers console + fichier du run (le report builder s'en sert). */
function makeLogger(runDir) {
  const logFile = runDir ? path.join(runDir, 'log.txt') : null;
  const lines = [];
  const log = (level, msg) => {
    const line = `${nowIso()} [${level}] ${msg}`;
    lines.push(line);
    console.log(line);
    if (logFile) { try { fs.appendFileSync(logFile, line + '\n'); } catch (_) {} }
  };
  return { log, lines };
}

/** Heure « nuit » (travail lourd autorisé) selon config resources. */
function isUnattendedWindow(cfg, d = new Date()) {
  const s = cfg.resources.unattendedHeavyStartHour; // ex. 21
  const e = cfg.resources.unattendedHeavyEndHour;   // ex. 8
  const h = d.getHours();
  return s <= e ? (h >= s && h < e) : (h >= s || h < e);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = {
  ROOT, AP_DIR, DIRS, ensureDirs, readJSON, writeJSON, loadConfig,
  runId, runIdMinute, nowIso, makeLogger, isUnattendedWindow, sleep,
  paths: {
    queue: path.join(AP_DIR, 'queue.json'),
    latestMd: path.join(AP_DIR, 'latest.md'),
    stopFile: path.join(AP_DIR, 'STOP'),
    lockFile: path.join(AP_DIR, 'orchestrator.lock'),
    rejected: path.join(AP_DIR, 'decisions', 'rejected.json'),
    runs: path.join(AP_DIR, 'runs'),
    observations: path.join(AP_DIR, 'observations'),
    baselines: path.join(AP_DIR, 'baselines'),
    regressions: path.join(AP_DIR, 'regressions'),
    opportunities: path.join(AP_DIR, 'opportunities'),
    research: path.join(AP_DIR, 'research'),
    experiments: path.join(AP_DIR, 'experiments'),
    runnerLog: path.join(AP_DIR, 'runs', 'runner.log'),
  },
};

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

function runId(d = new Date()) {
  // YYYY-MM-DD-HHMM (UTC) — triable, collision-safe à la minute près (le lock
  // garantit 1 cycle à la fois, suffisant).
  return d.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
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
  runId, nowIso, makeLogger, isUnattendedWindow, sleep,
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

#!/usr/bin/env node
/**
 * heartbeat.cjs — Heartbeat du runner : contrat UNIQUE partagé par le runner
 * (producteur) et le superviseur (consommateur). Phase 3 — Mission P0.
 *
 * Contenu minimal du heartbeat (exigé par la mission) :
 *   - timestamp UTC          -> `timestamp` (et alias historique `at`)
 *   - PID du runner          -> `pid`
 *   - état du runner         -> `state` (starting | running | busy | idle | stopped | terminated)
 *   - identifiant du cycle   -> `cycle` (compteur persistant, survit aux redémarrages)
 * Compléments utiles à la supervision : `queueDepth`, `uptimeMs`, `host`, `lastTask`.
 *
 * Validité (évaluée par le superviseur, jamais par le producteur) :
 *   - fichier présent et lisible,
 *   - fraîcheur <= HEARTBEAT_MAX_AGE_MS,
 *   - PID vivant,
 *   - état non final.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.FACTORY_STATE_DIR || path.join(__dirname, 'state');
const HEARTBEAT_FILE = path.join(STATE_DIR, 'heartbeat.json');

/** Intervalle d'écriture (défaut 15 s) — surchargeable pour les tests. */
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.FACTORY_HEARTBEAT_MS || '15000', 10);
/** Un heartbeat plus vieux que ça = runner bloqué ou mort. */
const HEARTBEAT_MAX_AGE_MS = parseInt(process.env.FACTORY_HEARTBEAT_MAX_AGE_MS || '120000', 10);
/**
 * Un runner `busy` exécute une tâche réelle potentiellement longue (rendu,
 * build, revue OpenCode) : sa boucle d'événements peut être occupée plus de
 * HEARTBEAT_MAX_AGE_MS. On tolère alors une péremption plus longue TANT QUE le
 * PID est vivant — sinon une tâche longue provoquerait un redémarrage et une
 * DOUBLE exécution. Les vrais blocages sont attrapés par evaluateProgress().
 * Borne choisie < TTL du sémaphore (2 h) pour rester cohérente.
 */
const BUSY_MAX_AGE_MS = parseInt(process.env.FACTORY_BUSY_MAX_AGE_MS || String(45 * 60 * 1000), 10);
/** Blocage détecté si aucun progrès de cycle aussi longtemps (file non vide). */
const STUCK_AFTER_MS = parseInt(process.env.FACTORY_STUCK_AFTER_MS || String(60 * 60 * 1000), 10);

const HB_VERSION = 2;

function atomicWriteJSON(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

/** PID vivant ? (false si inconnu/illisible — on n'invente pas une vie). */
function pidAliveStr(pid) {
  const n = Number(pid);
  if (!pid || Number.isNaN(n)) return false;
  try { process.kill(n, 0); return true; }
  catch (e) { return e.code === 'EPERM'; } // protégé mais existant = vivant
}

/** Écrit (ou rafraîchit) le heartbeat. Retourne l'objet écrit. */
function writeHeartbeat(patch = {}) {
  const now = new Date();
  const previous = readHeartbeat() || {};
  const hb = {
    ...previous,
    ...patch,
    at: now.toISOString(),          // alias historique (lu par les anciens superviseurs)
    timestamp: now.toISOString(),   // timestamp UTC — exigence mission
    pid: patch.pid || process.pid,
    host: patch.host || os.hostname(),
    state: patch.state || 'running',
    version: HB_VERSION,
  };
  if (hb.uptimeMs === undefined && previous.startedAtMs) hb.uptimeMs = now.getTime() - previous.startedAtMs;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  atomicWriteJSON(HEARTBEAT_FILE, hb);
  return hb;
}

function readHeartbeat() {
  try { return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8')); }
  catch (_) { return null; }
}

/**
 * Évalue la validité + fraîcheur d'un heartbeat.
 * @returns {{alive: boolean, reason: string, ageMs: number|null, heartbeat: object|null}}
 */
function evaluateHeartbeat(hb = readHeartbeat(), now = Date.now()) {
  if (!hb) return { alive: false, reason: 'no heartbeat file', ageMs: null, heartbeat: null };
  const stamp = hb.timestamp || hb.at;
  if (!stamp) return { alive: false, reason: 'heartbeat sans timestamp', ageMs: null, heartbeat: hb };

  const ageMs = now - Date.parse(stamp);
  if (Number.isNaN(ageMs)) return { alive: false, reason: `timestamp illisible (${stamp})`, ageMs: null, heartbeat: hb };
  if (ageMs > HEARTBEAT_MAX_AGE_MS) {
    // Runner en exécution (busy) : tolérance longue si le PID vit encore.
    // Un redémarrage ici créerait une double exécution de la même tâche.
    if (hb.state === 'busy' && ageMs <= BUSY_MAX_AGE_MS && pidAliveStr(hb.pid)) {
      return {
        alive: true,
        reason: `alive (tache longue en cours, heartbeat age de ${(ageMs / 60000).toFixed(0)} min, borne busy ${BUSY_MAX_AGE_MS / 60000} min)`,
        ageMs, heartbeat: hb, tolerant: true,
      };
    }
    return { alive: false, reason: `heartbeat stale (${(ageMs / 1000).toFixed(0)}s > ${HEARTBEAT_MAX_AGE_MS / 1000}s)`, ageMs, heartbeat: hb };
  }
  if (hb.state === 'stopped' || hb.state === 'terminated') {
    return { alive: false, reason: `runner arrete proprement (state=${hb.state})`, ageMs, heartbeat: hb };
  }
  if (hb.pid) {
    try { process.kill(Number(hb.pid), 0); }
    catch (e) {
      if (e.code === 'ESRCH') return { alive: false, reason: `PID ${hb.pid} not running`, ageMs, heartbeat: hb };
      // EPERM : le processus existe mais est protégé -> on fait confiance à la fraîcheur
    }
  }
  return { alive: true, reason: 'alive', ageMs, heartbeat: hb };
}

/**
 * Détecte un runner VIVANT mais BLOQUÉ : heartbeat frais, état idle, cycle figé
 * et file non vide. Un runner en `busy` exécute une tâche longue : pas un blocage.
 */
function evaluateProgress(hb, { lastSeenCycle, lastSeenCycleTime, now = Date.now(), stuckAfterMs = STUCK_AFTER_MS }) {
  if (!hb || !lastSeenCycle || !lastSeenCycleTime) return { stuck: false, reason: 'pas encore d observation' };
  const cycle = hb.cycle || 0;
  if (cycle !== lastSeenCycle) return { stuck: false, reason: 'progres detecte' };
  const stuckMs = now - lastSeenCycleTime;
  if (stuckMs <= stuckAfterMs) return { stuck: false, reason: `cycle fige depuis ${(stuckMs / 60000).toFixed(0)} min (sous le seuil)` };
  const idleWithWork = (hb.state === 'idle' || hb.state === 'running') && Number(hb.queueDepth) > 0;
  if (!idleWithWork) {
    return { stuck: false, reason: `cycle fige depuis ${(stuckMs / 60000).toFixed(0)} min mais state=${hb.state}, queueDepth=${hb.queueDepth}` };
  }
  return { stuck: true, reason: `aucun progres depuis ${(stuckMs / 60000).toFixed(0)} min, cycle ${cycle}, file ${hb.queueDepth}` };
}

module.exports = {
  HEARTBEAT_FILE,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_MAX_AGE_MS,
  BUSY_MAX_AGE_MS,
  STUCK_AFTER_MS,
  STATE_DIR,
  pidAliveStr,
  writeHeartbeat,
  readHeartbeat,
  evaluateHeartbeat,
  evaluateProgress,
};

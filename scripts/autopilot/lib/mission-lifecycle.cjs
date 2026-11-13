#!/usr/bin/env node
/**
 * mission-lifecycle.cjs — état DURABLE du cycle de vie des missions GitHub.
 *
 * Le pont GitHub ne se contente pas de « importer » : chaque mission traverse
 * des états observables (`queued → imported → started → heartbeat → completed`,
 * ou `blocked` / `failed` / `retrying`) qui doivent être :
 *   1. persistés (survit à un redémarrage du PC ou du runner) ;
 *   2. publiés sur l'issue source (preuve visible par le fondateur) ;
 *   3. consultables (commande de statut) ;
 *   4. reprises par le watchdog si l'agent meurt ou si le heartbeat expire.
 *
 * Le fichier d'état est `.ai/autopilot/mission-state.json` (écriture atomique).
 * Il est borné : l'historique ne grossit pas indéfiniment.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { AP_DIR, nowIso, readJSON, writeJSON } = require('./common.cjs');

/** États du cycle de viepublished sur l'issue. */
const STATES = ['queued', 'imported', 'started', 'heartbeat', 'completed', 'blocked', 'failed', 'retrying'];

/** Historique borné (missions terminées conservées pour diagnostic). */
const HISTORY_MAX = 200;

const STATE_FILE = process.env.SARGA_MISSION_STATE_FILE || path.join(AP_DIR, 'mission-state.json');

/** Charge l'état durable (jamais d'exception : un fichier corrompu ne tue pas le runner). */
function load() {
  const raw = readJSON(STATE_FILE, null);
  if (!raw || typeof raw !== 'object') return { missions: {}, updatedAt: null };
  if (!raw.missions || typeof raw.missions !== 'object') raw.missions = {};
  return raw;
}

/** Écrit l'état durable (atomique). */
function save(state) {
  state.updatedAt = nowIso();
  writeJSON(STATE_FILE, state);
  return state;
}

/** Clé d'une mission : dépôt + issue + task_id (jamais de collision entre repos). */
function keyOf(repo, issue, taskId) {
  return `${repo || '?'}#${issue || '?'}|${taskId || '?'}`;
}

/**
 * Enregistre / met à jour une mission.
 * @param {object} mission {taskId, repo, issue, fingerprint, state, ...}
 */
function upsert(mission = {}) {
  const state = load();
  const key = keyOf(mission.repo, mission.issue, mission.taskId);
  const prev = state.missions[key] || {};
  const next = {
    ...prev,
    ...mission,
    key,
    taskId: mission.taskId || prev.taskId || null,
    repo: mission.repo || prev.repo || null,
    issue: mission.issue || prev.issue || null,
    fingerprint: mission.fingerprint || prev.fingerprint || null,
    state: mission.state || prev.state || 'queued',
    startedAt: mission.startedAt || prev.startedAt || null,
    lastHeartbeatAt: mission.lastHeartbeatAt || prev.lastHeartbeatAt || null,
    agent: mission.agent || prev.agent || null,
    model: mission.model || prev.model || null,
    branch: mission.branch || prev.branch || null,
    commit: mission.commit || prev.commit || null,
    tests: mission.tests || prev.tests || [],
    pr: mission.pr || prev.pr || null,
    attempts: mission.attempts || prev.attempts || 0,
    reason: mission.reason !== undefined ? mission.reason : (prev.reason || null),
    pid: mission.pid || prev.pid || null,
    updatedAt: nowIso(),
  };
  state.missions[key] = next;
  prune(state);
  save(state);
  return next;
}

/** BORNAGE de l'historique : les missions terminées les plus anciennes partent. */
function prune(state) {
  const entries = Object.values(state.missions || {});
  if (entries.length <= HISTORY_MAX) return;
  const terminal = entries
    .filter(m => ['completed', 'failed', 'blocked'].includes(m.state))
    .sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')));
  let toRemove = entries.length - HISTORY_MAX;
  for (const m of terminal) {
    if (toRemove <= 0) break;
    delete state.missions[m.key];
    toRemove -= 1;
  }
}

/** Missions en cours (non terminales). */
function active() {
  const state = load();
  return Object.values(state.missions || {}).filter(m =>
    ['queued', 'imported', 'started', 'heartbeat', 'retrying'].includes(m.state));
}

/** Une mission donnée (par taskId) — la plus récente. */
function findByTaskId(taskId) {
  const state = load();
  const hits = Object.values(state.missions || {}).filter(m => m.taskId === taskId);
  if (!hits.length) return null;
  hits.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return hits[0];
}

/**
 * La mission liée à une PR (par numéro) — la plus récente.
 *
 * Pourquoi (défaut réel du 2026-11-09, mission #1376) : quand le pont
 * détecte une PR ouverte qui bloque une nouvelle mission, il doit pouvoir
 * publier l'état final sur la mission d'ORIGINE de cette PR. Sans cette
 * recherche, la mission d'origine reste silencieuse (dernier statut :
 * `heartbeat`) alors qu'une PR verte l'attend.
 */
function findByPr(prNumber) {
  const n = Number(String(prNumber || '').replace(/^#/, ''));
  if (!Number.isInteger(n) || n <= 0) return null;
  const state = load();
  const hits = Object.values(state.missions || {}).filter(m => {
    if (!m.pr) return false;
    // L'URL GitHub d'une PR est `.../pull/1377` (PAS de `#`), mais une
    // référence courte peut être `#1377`. On accepte les deux formes.
    const url = String(m.pr);
    const match = url.match(/\/pull\/(\d+)/) || url.match(/#(\d+)/);
    return match && Number(match[1]) === n;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return hits[0];
}

/** Le processus owning la mission est-il encore vivant ? */
function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Missions « à reprendre » : cœur du watchdog.
 *
 * Une mission estcandidate si :
 *   - elle est dans un état non terminal (`started` / `heartbeat` / `retrying`) ;
 *   - ET son heartbeat est expiré (plus vieux que `staleAfterMs`) ;
 *   - OU le processus qui la portait est mort.
 *
 * @param {object} opts {staleAfterMs, now}
 */
function stale(opts = {}) {
  const staleAfterMs = Number(opts.staleAfterMs) > 0 ? Number(opts.staleAfterMs) : 10 * 60 * 1000;
  const now = Number(opts.now) || Date.now();
  return active().filter(m => {
    const hb = m.lastHeartbeatAt ? Date.parse(m.lastHeartbeatAt) : 0;
    const expired = !hb || (now - hb) > staleAfterMs;
    const dead = m.pid ? !pidAlive(m.pid) : false;
    return expired || dead;
  });
}

/** Mise à jour d'un champ sans écraser le reste. */
function patch(taskId, repo, issue, fields = {}) {
  const state = load();
  const key = keyOf(repo, issue, taskId);
  const prev = state.missions[key];
  if (!prev) return null;
  state.missions[key] = { ...prev, ...fields, updatedAt: nowIso() };
  prune(state);
  save(state);
  return state.missions[key];
}

module.exports = {
  STATES,
  STATE_FILE,
  keyOf,
  load,
  save,
  upsert,
  patch,
  prune,
  active,
  findByTaskId,
  findByPr,
  stale,
  pidAlive,
};

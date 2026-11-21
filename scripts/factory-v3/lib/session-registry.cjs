'use strict';

/**
 * session-registry.cjs — registre d'états de sessions normalisés de Factory V3.
 *
 * Fusionne deux sources réelles :
 *   - les jobs de la queue Factory (`state/queue.json`) ;
 *   - les sessions OpenCode découvertes par le CLI local.
 *
 * États normalisés imposés par la mission :
 *   PLANNING, RUNNING, WAITING, BLOCKED, RECOVERING, VERIFYING, COMPLETED, FAILED
 *
 * Contrats honnêteté (fail-closed) :
 *   - `DONE` sans verdict vérifié → FAILED (jamais COMPLETED par défaut) ;
 *   - une session sans activité récente → WAITING avec `stale` (jamais
 *     BLOCKED déduit du silence seul) ;
 *   - RECOVERING uniquement sur preuve réelle de failover récent ;
 *   - VERIFYING uniquement quand l'agent a réussi et que les gates tournent.
 *
 * Le registre est persisté avec un historique de transitions horodaté, et peut
 * être relancé sans perte d'historique.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const NORMALIZED_STATES = Object.freeze([
  'PLANNING',
  'RUNNING',
  'WAITING',
  'BLOCKED',
  'RECOVERING',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
]);

const RECENT_FAILOVER_MS = 15 * 60 * 1000;
const SESSION_ACTIVE_MS = 5 * 60 * 1000;
const SESSION_STALE_MS = 30 * 60 * 1000;
const HISTORY_MAX_LINES = 5000;
const HISTORY_KEEP_LINES = 4000;

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto
    .randomBytes(3)
    .toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function appendJsonl(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
}

function readJsonlLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function withinLast(timestamp, windowMs, nowMs) {
  if (!timestamp) return false;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms >= 0 && nowMs - ms <= windowMs;
}

function recentFailover(job, nowMs) {
  const agent = job && job.evidence ? job.evidence.agent : null;
  if (!Array.isArray(agent && agent.failovers)) return false;
  return agent.failovers.some((f) => withinLast(f && (f.at || f.ts), RECENT_FAILOVER_MS, nowMs));
}

/**
 * Normalise un job de la queue Factory vers un état normalisé.
 * @returns {{ state: string, reason: string }}
 */
function normalizeJob(job, { nowMs = Date.now() } = {}) {
  if (!isObject(job) || !job.jobId) {
    return { state: 'BLOCKED', reason: 'job illisible ou sans identifiant — intervention requise' };
  }
  const evidence = isObject(job.evidence) ? job.evidence : {};
  const verdict = evidence.verdict || null;
  const status = job.status;

  if (status === 'PENDING') {
    if (job.quotaWait) {
      return { state: 'WAITING', reason: 'quota fournisseur — reprise automatique programmée' };
    }
    if (job.providerWait) {
      return { state: 'WAITING', reason: 'fournisseur indisponible — reprise automatique programmée' };
    }
    const retryMs = job.nextRetryAt ? Date.parse(job.nextRetryAt) : NaN;
    if (Number.isFinite(retryMs) && retryMs > nowMs) {
      const afterFailure = (job.attempts || 0) > 0;
      return {
        state: 'WAITING',
        reason: afterFailure
          ? `retry programmé après échec (${job.attempts}/${job.maxAttempts})`
          : 'démarrage programmé',
      };
    }
    return { state: 'PLANNING', reason: 'en file, non encore claimé' };
  }

  if (status === 'RUNNING') {
    const agent = isObject(evidence.agent) ? evidence.agent : null;
    if (agent && agent.ok === true && !evidence.gates) {
      return { state: 'VERIFYING', reason: 'agent réussi — gates de livraison en cours' };
    }
    if (recentFailover(job, nowMs)) {
      return { state: 'RECOVERING', reason: 'failover modèle/fournisseur récent — reprise en cours' };
    }
    return { state: 'RUNNING', reason: 'agent en exécution' };
  }

  if (status === 'DONE') {
    if (verdict === 'VERIFIED') {
      return { state: 'COMPLETED', reason: 'verdict vérifié (agent + gates + commit réel)' };
    }
    return {
      state: 'FAILED',
      reason: `DONE sans verdict vérifié (${verdict || 'aucun'}) — fail-closed, aucun faux succès`,
    };
  }

  if (status === 'PARKED') {
    if (verdict === 'WAIT_QUOTA' || verdict === 'WAIT_PROVIDER') {
      return { state: 'WAITING', reason: `${verdict} répété — reprise automatique restera programmée` };
    }
    return {
      state: 'BLOCKED',
      reason: `parké après ${job.attempts || '?'} tentatives — intervention requise : ${evidence.reason || verdict || 'sans raison enregistrée'}`,
    };
  }

  if (status === 'BLOCKED') {
    return { state: 'BLOCKED', reason: evidence.reason || 'job marqué bloqué' };
  }

  return { state: 'BLOCKED', reason: `statut de job inconnu: ${String(status)}` };
}

/**
 * Normalise une session OpenCode vers un état normalisé.
 * Le silence seul ne produit JAMAIS BLOCKED — seulement WAITING + stale.
 */
function normalizeSession(session, {
  nowMs = Date.now(),
  activeMs = SESSION_ACTIVE_MS,
  staleMs = SESSION_STALE_MS,
} = {}) {
  if (!isObject(session) || !session.id) {
    return { state: 'WAITING', reason: 'session illisible ou sans identifiant', stale: false, stallSeconds: null };
  }
  const updatedMs = Number(session.updated);
  if (!Number.isFinite(updatedMs)) {
    return { state: 'WAITING', reason: 'horodatage de session illisible', stale: false, stallSeconds: null };
  }
  const silenceMs = Math.max(0, nowMs - updatedMs);
  if (silenceMs <= activeMs) {
    return { state: 'RUNNING', reason: 'activité récente observée', stale: false, stallSeconds: Math.round(silenceMs / 1000) };
  }
  if (silenceMs <= staleMs) {
    return { state: 'WAITING', reason: 'aucune activité récente', stale: false, stallSeconds: Math.round(silenceMs / 1000) };
  }
  return {
    state: 'WAITING',
    reason: `aucune activité depuis ${Math.round(silenceMs / 60000)} min — surveillance requise`,
    stale: true,
    stallSeconds: Math.round(silenceMs / 1000),
  };
}

/**
 * Construit le registre fusionné jobs + sessions.
 * @param {object} params
 * @param {Array} params.jobs jobs de la queue (structure run.cjs)
 * @param {Array} params.sessions sessions OpenCode (CLI `session list`)
 * @param {Set<string>} [params.failoverJobIds] jobIds avec failover récent dans les logs
 * @param {number} [params.nowMs]
 */
function buildRegistry({ jobs, sessions, failoverJobIds = null, nowMs = Date.now() } = {}) {
  const nowIso = new Date(nowMs).toISOString();
  const entries = [];
  const sessionIdsReferencedByJobs = new Set();

  const jobList = Array.isArray(jobs) ? jobs : [];
  for (const job of jobList) {
    const evidence = isObject(job.evidence) ? job.evidence : {};
    const agent = isObject(evidence.agent) ? evidence.agent : {};
    const { state, reason } = normalizeJob(job, { nowMs });
    const explicitRecent = failoverJobIds instanceof Set && failoverJobIds.has(job.jobId);
    let resolved = { state, reason };
    if (
      state === 'RUNNING'
      && !explicitRecent
      && failoverJobIds instanceof Set
      && failoverJobIds.has(job.jobId)
    ) {
      resolved = { state: 'RECOVERING', reason: 'failover récent détecté dans les logs runner' };
    } else if (state === 'RUNNING' && explicitRecent) {
      resolved = { state: 'RECOVERING', reason: 'failover récent détecté dans les logs runner' };
    }
    const sessionId = agent.sessionId || null;
    if (sessionId) sessionIdsReferencedByJobs.add(sessionId);
    entries.push({
      kind: 'job',
      id: job.jobId,
      repo: job.repo || null,
      task: job.task || null,
      branch: job.branch || null,
      state: resolved.state,
      reason: resolved.reason,
      attempts: job.attempts != null ? job.attempts : null,
      maxAttempts: job.maxAttempts != null ? job.maxAttempts : null,
      nextRetryAt: job.nextRetryAt || null,
      lastActivityAt: job.updatedAt || null,
      sessionId,
      requestedModel: agent.requestedModel || null,
      resolvedModel: agent.resolvedModel || agent.model || null,
      provider: agent.provider || null,
      spend: Number.isFinite(Number(agent.spend)) ? Number(agent.spend) : null,
      committedSha: agent.committedSha || null,
      dirtyFiles: Array.isArray(agent.dirtyFiles) ? agent.dirtyFiles.length : null,
      worktree: job.worktree || null,
    });
  }

  const sessionList = Array.isArray(sessions) ? sessions : [];
  for (const session of sessionList) {
    if (isObject(session) && session.id && sessionIdsReferencedByJobs.has(session.id)) continue;
    const { state, reason, stale, stallSeconds } = normalizeSession(session, { nowMs });
    entries.push({
      kind: 'session',
      id: session && session.id ? session.id : null,
      title: (session && session.title) || null,
      directory: (session && session.directory) || null,
      projectId: (session && session.projectId) || null,
      state,
      reason,
      stale: Boolean(stale),
      stallSeconds,
      lastActivityAt: session && Number.isFinite(Number(session.updated))
        ? new Date(Number(session.updated)).toISOString()
        : null,
    });
  }

  const counts = {};
  for (const stateName of NORMALIZED_STATES) counts[stateName] = 0;
  for (const entry of entries) {
    if (counts[entry.state] == null) counts[entry.state] = 0;
    counts[entry.state] += 1;
  }

  return {
    version: 1,
    generatedAt: nowIso,
    counts,
    sources: {
      jobs: jobList.length,
      sessions: sessionList.length,
      sessionsMergedIntoJobs: sessionIdsReferencedByJobs.size,
    },
    entries,
  };
}

/**
 * Persiste le registre et enregistre les transitions d'état dans l'historique.
 */
function persistRegistry({ stateDir, registry }) {
  const observerDir = path.join(path.resolve(stateDir), 'observer');
  const registryFile = path.join(observerDir, 'SESSION_REGISTRY.json');
  const historyFile = path.join(observerDir, 'SESSION_HISTORY.jsonl');
  const previous = readJson(registryFile, null);
  const previousStates = new Map();
  if (isObject(previous) && Array.isArray(previous.entries)) {
    for (const entry of previous.entries) {
      if (entry && entry.id) previousStates.set(`${entry.kind}:${entry.id}`, entry.state);
    }
  }

  const transitions = [];
  for (const entry of registry.entries) {
    if (!entry.id) continue;
    const key = `${entry.kind}:${entry.id}`;
    const from = previousStates.has(key) ? previousStates.get(key) : null;
    if (from !== entry.state) {
      transitions.push({
        ts: registry.generatedAt,
        id: entry.id,
        kind: entry.kind,
        from,
        to: entry.state,
        reason: entry.reason,
      });
    }
  }
  for (const [key, from] of previousStates.entries()) {
    if (!registry.entries.some((e) => `${e.kind}:${e.id}` === key)) {
      const [kind, ...rest] = key.split(':');
      transitions.push({
        ts: registry.generatedAt,
        id: rest.join(':'),
        kind,
        from,
        to: 'ABSENT',
        reason: 'entrée disparue de la source',
      });
    }
  }

  for (const transition of transitions) appendJsonl(historyFile, transition);

  // Bornage de l'historique : réécriture compacte au-delà du plafond.
  const lines = readJsonlLines(historyFile);
  if (lines.length > HISTORY_MAX_LINES) {
    fs.mkdirSync(observerDir, { recursive: true });
    fs.writeFileSync(historyFile, `${lines.slice(-HISTORY_KEEP_LINES).join('\n')}\n`, 'utf8');
  }

  writeJsonAtomic(registryFile, registry);
  return { registryFile, historyFile, transitions };
}

function loadRegistry(stateDir) {
  return readJson(path.join(path.resolve(stateDir), 'observer', 'SESSION_REGISTRY.json'), null);
}

module.exports = {
  NORMALIZED_STATES,
  normalizeJob,
  normalizeSession,
  buildRegistry,
  persistRegistry,
  loadRegistry,
  RECENT_FAILOVER_MS,
  SESSION_ACTIVE_MS,
  SESSION_STALE_MS,
};

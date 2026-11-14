'use strict';
/**
 * Factory V3 — Registre persistant des modèles (mémoire des quotas).
 *
 * Rôle : source de vérité locale sur la disponibilité réelle de chaque modèle.
 *  - qui est en cooldown et jusqu'à quand ;
 *  - nature de l'indisponibilité (daily / hourly / rate / provider / credit) ;
 *  - compteur d'échecs consécutifs (circuit breaker) ;
 *  - date de dernière tentative / dernier résultat ;
 *  - statistiques de bascule, de reprise et de dépense (toujours 0 sans autorisation).
 *
 * Le registre est un fichier JSON écrit de façon atomique (tmp + rename) sous
 * scripts/factory-v3/state/model-registry.json (runtime éphémère, non versionné).
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_VERSION = 2;

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    updatedAt: null,
    models: {},
    stats: {
      failovers: 0,
      resumes: 0,
      quotaEvents: 0,
      attempts: 0,
      successes: 0,
      failures: 0,
      spend: 0,
    },
  };
}

function readRegistry(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyRegistry();
    const reg = Object.assign(emptyRegistry(), raw);
    reg.models = raw.models && typeof raw.models === 'object' ? raw.models : {};
    reg.stats = Object.assign(emptyRegistry().stats, raw.stats || {});
    return reg;
  } catch (_) {
    return emptyRegistry();
  }
}

function writeRegistry(file, registry) {
  registry.updatedAt = new Date().toISOString();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
  fs.renameSync(tmp, file);
}

function providerOf(modelId) {
  const s = String(modelId || '');
  const i = s.indexOf('/');
  return i > 0 ? s.slice(0, i) : 'unknown';
}

// ---------------------------------------------------------------------------
// Verrou d'écriture : plusieurs agents simultanés ne doivent pas s'écraser.
// ---------------------------------------------------------------------------
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}

function acquireLockFile(lockFile, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e && e.code !== 'EEXIST') return false;
      // verrou orphelin (processus mort) : on le récupère après 30 s
      try {
        const st = fs.statSync(lockFile);
        if (Date.now() - st.mtimeMs > 30000) { fs.unlinkSync(lockFile); continue; }
      } catch (_) { continue; }
      sleepSync(25);
    }
  }
  return false;
}

/**
 * Transaction atomique sur le registre : lecture → mutation → écriture,
 * sous verrou de fichier. Deux agents concurrents ne perdent pas d'écriture.
 */
function updateRegistry(file, mutator) {
  const lockFile = `${file}.lock`;
  const locked = acquireLockFile(lockFile);
  try {
    const registry = readRegistry(file);
    const result = mutator(registry);
    writeRegistry(file, registry);
    return result;
  } finally {
    if (locked) { try { fs.unlinkSync(lockFile); } catch (_) {} }
  }
}

function getEntry(registry, modelId) {
  if (!registry.models[modelId]) {
    registry.models[modelId] = {
      model: modelId,
      provider: providerOf(modelId),
      status: 'unknown',
      free: null,
      cost: null,
      capabilities: null,
      quota: null,
      cooldownUntil: null,
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastAttemptAt: null,
      lastResult: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureCategory: null,
      verifiedByUse: false,
      observedModel: null,
    };
  }
  return registry.models[modelId];
}

function isInCooldown(entry, now = Date.now()) {
  if (!entry || !entry.cooldownUntil) return false;
  const until = Date.parse(entry.cooldownUntil);
  return Number.isFinite(until) && until > now;
}

function cooldownRemainingMs(entry, now = Date.now()) {
  if (!entry || !entry.cooldownUntil) return 0;
  const until = Date.parse(entry.cooldownUntil);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}

/**
 * Enregistre un échec : cooldown + compteur circuit breaker.
 * Un modèle qui échoue N fois consécutivement passe en 'circuit_open'.
 */
function recordFailure(registry, modelId, classification, meta = {}) {
  const entry = getEntry(registry, modelId);
  const now = Date.now();
  entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
  entry.totalFailures = (entry.totalFailures || 0) + 1;
  entry.lastAttemptAt = new Date(now).toISOString();
  entry.lastFailureAt = new Date(now).toISOString();
  entry.lastFailureCategory = classification.category || 'UNKNOWN';
  entry.lastResult = classification.category || 'UNKNOWN';
  entry.quota = {
    type: classification.quotaType || 'none',
    detectedAt: new Date(now).toISOString(),
    resetAt: classification.resetAt || null,
    reason: classification.reason || null,
  };
  const cooldownMs = Number(classification.cooldownMs || 0);
  entry.cooldownUntil = cooldownMs > 0 ? new Date(now + cooldownMs).toISOString() : null;
  const circuitThreshold = meta.circuitThreshold || 3;
  if (entry.consecutiveFailures >= circuitThreshold) {
    entry.status = 'circuit_open';
    // Circuit ouvert : cooldown long (1h) même si la classification était courte.
    entry.cooldownUntil = new Date(now + 60 * 60 * 1000).toISOString();
  } else if (cooldownMs > 0) {
    entry.status = 'cooldown';
  } else {
    entry.status = 'available';
  }
  if (meta.observedModel) entry.observedModel = meta.observedModel;
  registry.stats.failures = (registry.stats.failures || 0) + 1;
  if (classification.quotaType && classification.quotaType !== 'none') {
    registry.stats.quotaEvents = (registry.stats.quotaEvents || 0) + 1;
  }
  return entry;
}

function recordSuccess(registry, modelId, meta = {}) {
  const entry = getEntry(registry, modelId);
  const now = Date.now();
  entry.consecutiveFailures = 0;
  entry.totalSuccesses = (entry.totalSuccesses || 0) + 1;
  entry.lastAttemptAt = new Date(now).toISOString();
  entry.lastSuccessAt = new Date(now).toISOString();
  entry.lastResult = 'success';
  entry.status = 'available';
  entry.cooldownUntil = null;
  entry.quota = null;
  entry.verifiedByUse = true;
  if (meta.observedModel) entry.observedModel = meta.observedModel;
  if (meta.cost != null) {
    const cost = Number(meta.cost) || 0;
    registry.stats.spend = Number(registry.stats.spend || 0) + cost;
  }
  registry.stats.successes = (registry.stats.successes || 0) + 1;
  return entry;
}

function recordAttempt(registry) {
  registry.stats.attempts = (registry.stats.attempts || 0) + 1;
}

function recordFailover(registry) {
  registry.stats.failovers = (registry.stats.failovers || 0) + 1;
}

function recordResume(registry) {
  registry.stats.resumes = (registry.stats.resumes || 0) + 1;
}

/**
 * Réintègre automatiquement les modèles dont le cooldown est expiré.
 * Retourne la liste des modèles réintégrés (preuve de "retour automatique").
 */
function expireCooldowns(registry, now = Date.now()) {
  const restored = [];
  for (const entry of Object.values(registry.models)) {
    if (!entry.cooldownUntil) continue;
    const until = Date.parse(entry.cooldownUntil);
    if (Number.isFinite(until) && until <= now && entry.status !== 'available') {
      entry.status = 'available';
      entry.cooldownUntil = null;
      entry.consecutiveFailures = 0;
      restored.push(entry.model);
    }
  }
  return restored;
}

function snapshot(registry) {
  return JSON.parse(JSON.stringify(registry));
}

module.exports = {
  REGISTRY_VERSION,
  emptyRegistry,
  readRegistry,
  writeRegistry,
  updateRegistry,
  acquireLockFile,
  providerOf,
  getEntry,
  isInCooldown,
  cooldownRemainingMs,
  recordFailure,
  recordSuccess,
  recordAttempt,
  recordFailover,
  recordResume,
  expireCooldowns,
  snapshot,
};

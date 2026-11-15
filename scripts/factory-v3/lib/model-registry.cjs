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
const crypto = require('crypto');

const REGISTRY_VERSION = 3;

function emptyRegistry() {
  return {
    version: REGISTRY_VERSION,
    updatedAt: null,
    models: {},
    providers: {},
    // Cache de disponibilité : évite de re-sonder inutilement un modèle ou un
    // fournisseur dont l'état récent est déjà connu.
    availability: {},
    stats: {
      failovers: 0,
      resumes: 0,
      quotaEvents: 0,
      attempts: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      lastFailoverAt: null,
      spend: 0,
    },
  };
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) {
    const error = new Error(`MODEL_REGISTRY_INVALID: ${label} doit être un objet JSON`);
    error.code = 'MODEL_REGISTRY_INVALID';
    throw error;
  }
}

function normalizeRegistry(raw) {
  if (!isPlainObject(raw)) {
    const error = new Error('MODEL_REGISTRY_INVALID: la racine doit être un objet JSON');
    error.code = 'MODEL_REGISTRY_INVALID';
    throw error;
  }
  const version = Number(raw.version);
  if (!Number.isInteger(version) || version < 1 || version > REGISTRY_VERSION) {
    const error = new Error(`MODEL_REGISTRY_INVALID: version non prise en charge (${raw.version})`);
    error.code = 'MODEL_REGISTRY_INVALID';
    throw error;
  }

  // Les sections qui portent l'historique ne peuvent JAMAIS être remplacées
  // silencieusement par `{}`. Une structure valide mais corrompue doit soit
  // restaurer le backup, soit faire échouer le runner en mode fail-closed.
  assertPlainObject(raw.models, 'models');
  if (version >= REGISTRY_VERSION) {
    assertPlainObject(raw.providers, 'providers');
    assertPlainObject(raw.availability, 'availability');
    assertPlainObject(raw.stats, 'stats');
  } else {
    if (raw.providers !== undefined) assertPlainObject(raw.providers, 'providers');
    if (raw.availability !== undefined) assertPlainObject(raw.availability, 'availability');
    if (raw.stats !== undefined) assertPlainObject(raw.stats, 'stats');
  }
  for (const [ref, entry] of Object.entries(raw.models)) assertPlainObject(entry, `models.${ref}`);
  for (const [provider, entry] of Object.entries(raw.providers || {})) assertPlainObject(entry, `providers.${provider}`);
  for (const [key, entry] of Object.entries(raw.availability || {})) assertPlainObject(entry, `availability.${key}`);

  const reg = Object.assign(emptyRegistry(), raw);
  reg.version = REGISTRY_VERSION;
  reg.models = raw.models;
  reg.providers = raw.providers && isPlainObject(raw.providers) ? raw.providers : {};
  reg.availability = raw.availability && isPlainObject(raw.availability) ? raw.availability : {};
  reg.stats = Object.assign(emptyRegistry().stats, raw.stats || {});
  for (const key of Object.keys(emptyRegistry().stats)) {
    if (!['lastFailoverAt'].includes(key) && raw.stats && raw.stats[key] != null) {
      const value = Number(raw.stats[key]);
      if (!Number.isFinite(value) || value < 0) {
        const error = new Error(`MODEL_REGISTRY_INVALID: stats.${key} doit être un nombre positif`);
        error.code = 'MODEL_REGISTRY_INVALID';
        throw error;
      }
    }
  }
  return reg;
}

/**
 * Lit le registre sans jamais convertir un JSON corrompu en registre vide.
 * Un registre vide ferait perdre quotas, deadlines et breakers : on le
 * remplacerait silencieusement par de nouveaux appels, potentiellement
 * payants ou martelés. Si la copie principale est corrompue, la dernière
 * copie valide (`.bak`) est utilisée ; sinon l'échec est fail-closed.
 */
function writeRegistrySnapshot(file, registry) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.restore.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2));
  fs.renameSync(tmp, file);
}

function readRegistry(file) {
  if (!fs.existsSync(file)) {
    const backup = `${file}.bak`;
    if (!fs.existsSync(backup)) return emptyRegistry();
    try {
      const recovered = normalizeRegistry(JSON.parse(fs.readFileSync(backup, 'utf8')));
      // Le backup devient l'état principal SANS modifier le backup sain.
      writeRegistrySnapshot(file, recovered);
      return recovered;
    } catch (backupError) {
      const error = new Error(`MODEL_REGISTRY_CORRUPT: ${file}`);
      error.code = 'MODEL_REGISTRY_CORRUPT';
      error.cause = backupError;
      throw error;
    }
  }
  try {
    return normalizeRegistry(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (primaryError) {
    const backup = `${file}.bak`;
    try {
      const recovered = normalizeRegistry(JSON.parse(fs.readFileSync(backup, 'utf8')));
      // Préserver la copie corrompue puis réinstaller le backup exact comme
      // état principal. Sans backup sain, l'échec reste fermé plus bas.
      if (fs.existsSync(file)) {
        const corruptProof = `${file}.corrupt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        fs.copyFileSync(file, corruptProof);
      }
      writeRegistrySnapshot(file, recovered);
      return recovered;
    } catch (backupError) {
      const error = new Error(`MODEL_REGISTRY_CORRUPT: ${file}`);
      error.code = 'MODEL_REGISTRY_CORRUPT';
      error.cause = primaryError;
      error.backupCause = backupError;
      throw error;
    }
  }
}

function writeRegistry(file, registry) {
  registry.updatedAt = new Date().toISOString();
  const normalized = normalizeRegistry(registry);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  // Conserver une copie de secours UNIQUEMENT si l'état courant est valide.
  // Une copie corrompue ne doit jamais remplacer la dernière bonne version.
  try {
    const current = fs.readFileSync(file, 'utf8');
    normalizeRegistry(JSON.parse(current));
    const backupTmp = `${file}.bak.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(backupTmp, current);
    fs.renameSync(backupTmp, `${file}.bak`);
  } catch (_) { /* absence ou corruption : la copie valide reste inchangée */ }
  writeRegistrySnapshot(file, normalized);
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

function pidAlive(pid) {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0) return false;
  try {
    process.kill(numeric, 0);
    return true;
  } catch (e) {
    return !!(e && e.code === 'EPERM');
  }
}

function readLockOwner(lockFile) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    return owner && typeof owner === 'object' ? owner : null;
  } catch (_) {
    return null;
  }
}

/**
 * Mutex de récupération : sérialise la vérification/remise en jeu d'un lock.
 *
 * Le fichier `.recovery` est créé atomiquement (`wx`). Un mutex orphelin n'est
 * repris que si son PID est mort ; un mutex vivant mais bloqué provoque un
 * timeout fail-closed plutôt qu'un contournement. La vérification du token
 * après reprise empêche un ancien propriétaire de supprimer un lock neuf.
 */
function acquireRecoveryMutex(lockFile, timeoutMs = 5000, staleMs = 30_000) {
  const recoveryFile = `${lockFile}.recovery`;
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 5000);
  const staleAfter = Math.max(1000, Number(staleMs) || 30_000);

  while (Date.now() < deadline) {
    let fd = null;
    try {
      fd = fs.openSync(recoveryFile, 'wx');
      const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, at: new Date().toISOString() }));
      fs.closeSync(fd);
      fd = null;
      return { ok: true, token, file: recoveryFile };
    } catch (error) {
      if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
      if (!error || error.code !== 'EEXIST') {
        return { ok: false, reason: String(error && error.message || error), token: null, file: recoveryFile };
      }

      const observed = readLockOwner(recoveryFile);
      let stale = false;
      if (observed) {
        stale = !pidAlive(observed.pid);
      } else {
        try { stale = Date.now() - fs.statSync(recoveryFile).mtimeMs > staleAfter; } catch (_) {}
      }
      if (stale) {
        const stalePath = `${recoveryFile}.stale-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        try {
          fs.renameSync(recoveryFile, stalePath);
          const moved = readLockOwner(stalePath);
          const observedToken = observed && observed.token ? observed.token : null;
          const movedToken = moved && moved.token ? moved.token : null;
          // Si l'inode déplacé appartient à un mutex plus récent que celui
          // observé, on le remet en place : l'ancien contender ne doit jamais
          // supprimer le mutex d'un propriétaire vivant.
          if (movedToken && movedToken !== observedToken) {
            try {
              if (!fs.existsSync(recoveryFile)) fs.renameSync(stalePath, recoveryFile);
            } catch (_) {}
          } else {
            try { fs.unlinkSync(stalePath); } catch (_) {}
          }
        } catch (_) { /* un autre contender a déjà récupéré le mutex */ }
      }
      sleepSync(25);
    }
  }
  return { ok: false, reason: 'timeout', token: null, file: recoveryFile };
}

function releaseRecoveryMutex(recoveryFile, token) {
  if (!recoveryFile || !token) return false;
  const owner = readLockOwner(recoveryFile);
  if (!owner || owner.token !== token) return false;
  try { fs.unlinkSync(recoveryFile); return true; } catch (_) { return false; }
}

function recoveryMutexOwned(recoveryFile, token) {
  const owner = readLockOwner(recoveryFile);
  return !!(owner && owner.token === token);
}

/**
 * Acquéredit un verrou avec propriétaire tokenisé.
 *
 * Toutes les opérations de lecture/remplacement/suppression sont sérialisées
 * par le mutex de récupération. Le fichier principal n'est jamais remplacé
 * lors d'un heartbeat : son inode reste stable, ce qui ferme la course
 * release/unlink qui supprimait parfois le lock d'un nouveau propriétaire.
 */
function acquireLockFile(lockFile, timeoutMs = 5000, opts = {}) {
  const timeout = Math.max(1, Number(timeoutMs) || 5000);
  const staleMs = Math.max(1000, Number(opts.staleMs) || 30_000);
  const token = String(opts.token || `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
  const deadline = Date.now() + timeout;
  let lastStalePath = null;

  while (Date.now() < deadline) {
    const recovery = acquireRecoveryMutex(lockFile, Math.max(1, deadline - Date.now()), staleMs);
    if (!recovery.ok) {
      if (Date.now() >= deadline) break;
      sleepSync(25);
      continue;
    }
    try {
      // Si le mutex a été déplacé/reclaimé pendant la section critique,
      // l'ancien propriétaire s'abstient : fail-closed.
      if (!recoveryMutexOwned(recovery.file, recovery.token)) {
        sleepSync(25);
        continue;
      }
      const lockExists = fs.existsSync(lockFile);
      if (!lockExists) {
        let fd = null;
        try {
          fd = fs.openSync(lockFile, 'wx');
          const newOwner = Object.assign({ pid: process.pid, token, at: new Date().toISOString() }, opts.meta || {});
          fs.writeFileSync(fd, JSON.stringify(newOwner));
          fs.closeSync(fd);
          fd = null;
          return { ok: true, token, stalePath: lastStalePath };
        } catch (error) {
          if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
          if (!error || error.code !== 'EEXIST') {
            return { ok: false, reason: String(error && error.message || error), token };
          }
        }
      } else {
        const owner = readLockOwner(lockFile);
        let fileAge = Infinity;
        try { fileAge = Date.now() - fs.statSync(lockFile).mtimeMs; } catch (_) {}
        const ownerAge = owner ? Date.now() - (Date.parse(owner.at || '') || 0) : Infinity;
        // Un lock vide/illisible reçoit une grâce courte : son propriétaire peut
        // être entre la création atomique et l'écriture du JSON. Passé ce délai,
        // il est réellement orphelin et peut être remis en jeu sous preuve.
        const unreadableGraceMs = Math.min(5000, staleMs);
        const stale = owner
          ? (!pidAlive(owner.pid) || ownerAge > staleMs || fileAge > staleMs)
          : (fileAge > unreadableGraceMs);
        if (stale) {
          const stalePath = `${lockFile}.stale-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
          try {
            fs.renameSync(lockFile, stalePath);
            lastStalePath = stalePath;
            let fd = null;
            try {
              fd = fs.openSync(lockFile, 'wx');
              const newOwner = Object.assign({ pid: process.pid, token, at: new Date().toISOString() }, opts.meta || {});
              fs.writeFileSync(fd, JSON.stringify(newOwner));
              fs.closeSync(fd);
              fd = null;
              return { ok: true, token, stalePath: lastStalePath };
            } catch (error) {
              if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
              if (!error || error.code !== 'EEXIST') {
                return { ok: false, reason: String(error && error.message || error), token, stalePath: lastStalePath };
              }
            }
          } catch (_) { /* un autre contender a déjà récupéré */ }
        }
      }
    } finally {
      releaseRecoveryMutex(recovery.file, recovery.token);
    }
    sleepSync(25);
  }
  return { ok: false, reason: 'timeout', token, stalePath: lastStalePath };
}

/** Libère un verrou uniquement si le token est encore le propriétaire. */
function releaseLockFile(lockFile, token) {
  if (!token) return false;
  const recovery = acquireRecoveryMutex(lockFile, 5000, 30_000);
  if (!recovery.ok) return false;
  try {
    if (!recoveryMutexOwned(recovery.file, recovery.token)) return false;
    const owner = readLockOwner(lockFile);
    if (!owner || owner.token !== token) return false;
    try { fs.unlinkSync(lockFile); return true; } catch (_) { return false; }
  } finally {
    releaseRecoveryMutex(recovery.file, recovery.token);
  }
}

/** Renouvelle le heartbeat d'un lock sans remplacer son inode. */
function renewLockFile(lockFile, token, meta = {}) {
  if (!token) return false;
  const recovery = acquireRecoveryMutex(lockFile, 5000, 30_000);
  if (!recovery.ok) return false;
  try {
    if (!recoveryMutexOwned(recovery.file, recovery.token)) return false;
    const owner = readLockOwner(lockFile);
    if (!owner || owner.token !== token) return false;
    const now = new Date().toISOString();
    const renewed = Object.assign({}, owner, meta, {
      pid: owner.pid,
      token: owner.token,
      at: now,
      heartbeatAt: now,
    });
    let fd = null;
    try {
      fd = fs.openSync(lockFile, 'r+');
      fs.ftruncateSync(fd, 0);
      fs.writeFileSync(fd, JSON.stringify(renewed));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = null;
      return true;
    } catch (_) {
      if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
      return false;
    }
  } finally {
    releaseRecoveryMutex(recovery.file, recovery.token);
  }
}

/**
 * Transaction atomique sur le registre : lecture → mutation → écriture,
 * sous verrou de fichier. Deux agents concurrents ne perdent pas d'écriture.
 */
function updateRegistry(file, mutator, opts = {}) {
  const lockFile = `${file}.lock`;
  const lockTimeoutMs = Math.max(1, Number(opts.lockTimeoutMs) || 5000);
  const lock = acquireLockFile(lockFile, lockTimeoutMs, {
    staleMs: opts.staleMs,
    meta: opts.meta,
  });
  if (!lock.ok) {
    // Fail-closed : sans verrou, écrire le registre écraserait les mutations
    // d'un autre agent. Mieux vaut faire échouer la tentative explicitement.
    const error = new Error(`MODEL_REGISTRY_LOCK_TIMEOUT: ${file}`);
    error.code = 'MODEL_REGISTRY_LOCK_TIMEOUT';
    throw error;
  }
  try {
    const registry = readRegistry(file);
    const result = mutator(registry);
    writeRegistry(file, registry);
    return result;
  } finally {
    releaseLockFile(lockFile, lock.token);
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
      // Deadline partagée : aucun autre agent ne doit sonder le modèle avant
      // l'échéance Retry-After/backoff enregistrée dans le registre.
      notBefore: null,
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
  const now = Number(meta.now || Date.now());
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
  const requestedCooldownMs = Number(classification.cooldownMs || 0);
  const knownReset = classification.resetAt ? Date.parse(classification.resetAt) : NaN;
  const knownResetDelayMs = Number.isFinite(knownReset) ? Math.max(0, knownReset - now) : 0;
  // Un reset connu ne peut jamais être raccourci par le cooldown local.
  const cooldownMs = Math.max(requestedCooldownMs, knownResetDelayMs);
  entry.cooldownUntil = cooldownMs > 0 ? new Date(now + cooldownMs).toISOString() : null;
  entry.notBefore = entry.cooldownUntil;
  const circuitThreshold = meta.circuitThreshold || 3;
  if (entry.consecutiveFailures >= circuitThreshold) {
    entry.status = 'circuit_open';
    // Circuit ouvert : cooldown long (1h) même si la classification était
    // courte. Un reset de quota connu plus tard ne peut jamais être raccourci.
    const circuitUntil = now + 60 * 60 * 1000;
    entry.cooldownUntil = new Date(Number.isFinite(knownReset)
      ? Math.max(circuitUntil, knownReset)
      : circuitUntil).toISOString();
    entry.notBefore = entry.cooldownUntil;
  } else if (cooldownMs > 0) {
    entry.status = 'cooldown';
  } else {
    entry.status = 'available';
    entry.notBefore = null;
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
  // Un autre agent peut avoir observé un 429 plus strict entre-temps. Ce
  // succès ne doit pas autoriser un nouvel appel avant la deadline partagée.
  if (!entry.notBefore || Date.parse(entry.notBefore) <= now) entry.notBefore = null;
  entry.quota = null;
  entry.verifiedByUse = true;
  if (meta.observedModel) entry.observedModel = meta.observedModel;
  registry.stats.successes = (registry.stats.successes || 0) + 1;
  return entry;
}

function recordAttempt(registry, cost = 0) {
  registry.stats.attempts = (registry.stats.attempts || 0) + 1;
  const observedCost = Number(cost) || 0;
  if (observedCost > 0) {
    registry.stats.spend = Number(registry.stats.spend || 0) + observedCost;
  }
}

/**
 * Enregistre une NOUVELLE tentative sur le MÊME modèle (retry justifié).
 * Un retry ne consomme pas de bascule et ne pose pas de cooldown : tant que
 * le modèle n'a pas épuisé ses tentatives, il reste eligible.
 */
function recordRetry(registry, modelId, meta = {}) {
  const entry = getEntry(registry, modelId);
  const now = Number(meta.now || Date.now());
  const delayMs = Math.max(0, Number(meta.delayMs) || 0);
  const notBefore = new Date(now + delayMs).toISOString();
  entry.lastAttemptAt = new Date(now).toISOString();
  entry.totalRetries = (entry.totalRetries || 0) + 1;
  entry.lastRetry = {
    at: entry.lastAttemptAt,
    category: meta.category || null,
    delayMs: meta.delayMs != null ? Number(meta.delayMs) : null,
    retryAfterMs: meta.retryAfterMs != null ? Number(meta.retryAfterMs) : null,
    httpStatus: meta.httpStatus != null ? Number(meta.httpStatus) : null,
    reason: meta.reason || null,
  };
  if (meta.category) entry.lastFailureCategory = meta.category;
  // Deadline modèle ET fournisseur : les agents concurrents doivent respecter
  // le même Retry-After au lieu de déclencher leurs propres retries en rafale.
  const previousModelDeadline = Date.parse(entry.notBefore || '') || 0;
  entry.notBefore = new Date(Math.max(previousModelDeadline, now + delayMs)).toISOString();
  if (meta.providerId) {
    const provider = getProviderEntry(registry, meta.providerId);
    const previousProviderDeadline = Date.parse(provider.notBefore || '') || 0;
    provider.notBefore = new Date(Math.max(previousProviderDeadline, now + delayMs)).toISOString();
    if (meta.category) provider.lastFailureCategory = meta.category;
  }
  registry.stats.retries = (registry.stats.retries || 0) + 1;
  return entry;
}

/**
 * Cache de disponibilité d'un modèle (ou d'un fournisseur).
 * `ttlMs` borne la durée de validité ; après expiration, une nouvelle sonde
 * est autorisée.
 */
function recordAvailability(registry, key, meta = {}) {
  if (!registry.availability) registry.availability = {};
  const now = Date.now();
  const ttlMs = Number(meta.ttlMs || 30 * 60 * 1000);
  registry.availability[key] = {
    key,
    available: !!meta.available,
    reason: meta.reason || null,
    category: meta.category || null,
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + Math.max(0, ttlMs)).toISOString(),
  };
  return registry.availability[key];
}

function getAvailability(registry, key, now = Date.now()) {
  const entry = registry.availability && registry.availability[key];
  if (!entry || !entry.expiresAt) return null;
  const until = Date.parse(entry.expiresAt);
  if (!Number.isFinite(until) || until <= now) return null;
  return entry;
}

function recordFailover(registry, meta = {}) {
  registry.stats.failovers = (registry.stats.failovers || 0) + 1;
  registry.stats.lastFailoverAt = new Date().toISOString();
  registry.stats.lastFailover = {
    at: registry.stats.lastFailoverAt,
    from: meta.from || null,
    to: meta.to || null,
    provider: meta.provider || null,
    category: meta.category || null,
  };
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
      if (!entry.notBefore || Date.parse(entry.notBefore) <= now) entry.notBefore = null;
      // Le compteur reste pour que le breaker modèle atteigne réellement son
      // seuil sur plusieurs cycles. Il est remis à zéro par `recordSuccess`.
      if (registry.availability && registry.availability[entry.model]) {
        registry.availability[entry.model] = {
          key: entry.model,
          available: true,
          reason: 'cooldown expiré — réintégration automatique',
          category: null,
          checkedAt: new Date(now).toISOString(),
          expiresAt: new Date(now).toISOString(),
        };
      }
      restored.push(entry.model);
    }
  }
  return restored;
}

/**
 * Snapshot.
 */
function snapshot(registry) {
  return JSON.parse(JSON.stringify(registry));
}

// ===========================================================================
// CIRCUIT BREAKER PAR FOURNISSEUR + LIMITATION DE CONCURRENCE
// ===========================================================================

/** Limites par défaut de requêtes simultanées par fournisseur. */
const DEFAULT_PROVIDER_LIMITS = {
  nvidia: 2,
  opencode: 2,
  ollama: 1,        // local : CPU-bound, une requête à la fois
  'ollama-cloud': 1,
  router: 2,
  openrouter: 2,
  mistral: 2,
  zenmux: 2,
  meta: 2,
  minimax: 2,
  openai: 2,
};

function providerLimit(providerId, limits) {
  const table = Object.assign({}, DEFAULT_PROVIDER_LIMITS, limits || {});
  const id = String(providerId || 'unknown');
  const raw = table[id] != null ? Number(table[id]) : 2;
  // Une limite invalide ne doit JAMAIS désactiver le plafond (NaN > limite).
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 2;
}

function getProviderEntry(registry, providerId) {
  const id = String(providerId || 'unknown');
  if (!registry.providers) registry.providers = {};
  if (!registry.providers[id]) {
    registry.providers[id] = {
      provider: id,
      state: 'closed',            // closed | open | half_open
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      cooldownUntil: null,
      notBefore: null,
      lastFailureAt: null,
      lastFailureCategory: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      inFlight: 0,
      peakInFlight: 0,
      rejected: 0,
      // Locations de slots : token → bail. Un bail expiré est récupérable
      // après un crash du runner (sinon une concurrence resterait bloquée).
      slots: {},
    };
  }
  return registry.providers[id];
}

/** Supprime les baux de concurrence expirés (runner crashé). */
function pruneProviderSlots(entry, now = Date.now()) {
  if (!entry.slots || typeof entry.slots !== 'object') {
    entry.slots = {};
    entry.inFlight = 0;
    return;
  }
  for (const [token, lease] of Object.entries(entry.slots)) {
    const expiresAt = Date.parse(lease && lease.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) delete entry.slots[token];
  }
  entry.inFlight = Object.keys(entry.slots).length;
}

/**
 * État courant d'un fournisseur.
 * - `closed`    : disponible ;
 * - `open`      : circuit ouvert (cooldown) → fournisseur à éviter ;
 * - `half_open` : cooldown expiré → UNE seule sonde autorisée (réouverture
 *                 progressive : le fournisseur n'est réadmis qu'après un
 *                 essai réussi).
 */
function providerStatus(registry, providerId, now = Date.now()) {
  const entry = getProviderEntry(registry, providerId);
  pruneProviderSlots(entry, now);
  if (entry.state === 'open' && entry.cooldownUntil) {
    const until = Date.parse(entry.cooldownUntil);
    if (Number.isFinite(until) && until <= now) {
      // Réouverture progressive : une seule tentative de sonde.
      entry.state = 'half_open';
      entry.cooldownUntil = null;
    }
  }
  const limit = providerLimit(providerId, registry.providerLimits);
  const open = entry.state === 'open';
  const halfOpenSlotUsed = entry.state === 'half_open' && entry.inFlight >= 1;
  const notBeforeMs = Date.parse(entry.notBefore || '') || 0;
  const deferred = notBeforeMs > now;
  return {
    provider: entry.provider,
    state: entry.state,
    available: !open && !halfOpenSlotUsed && !deferred,
    retryAt: deferred ? entry.notBefore : entry.cooldownUntil,
    notBefore: entry.notBefore,
    consecutiveFailures: entry.consecutiveFailures,
    inFlight: entry.inFlight,
    limit,
    reason: open
      ? `circuit ouvert jusqu'au ${entry.cooldownUntil}`
      : (deferred
        ? `Retry-After partagé jusqu'au ${entry.notBefore}`
        : (halfOpenSlotUsed ? 'sonde half_open déjà en cours' : 'disponible')),
  };
}

/**
 * Enregistre un échec de FOURNISSEUR : incrémente le compteur, ouvre le
 * circuit au seuil, cooldown progressif (×2, plafonné à 1 h).
 */
function recordProviderFailure(registry, providerId, meta = {}) {
  const entry = getProviderEntry(registry, providerId);
  const now = Number(meta.now || Date.now());
  entry.consecutiveFailures = (entry.consecutiveFailures || 0) + 1;
  entry.totalFailures = (entry.totalFailures || 0) + 1;
  entry.lastFailureAt = new Date(now).toISOString();
  entry.lastAttemptAt = entry.lastFailureAt;
  entry.lastFailureCategory = meta.category || 'UNKNOWN';

  const threshold = meta.circuitThreshold || 3;
  const base = Number(meta.cooldownMs) || 10 * 60 * 1000;
  const reset = meta.resetAt ? Date.parse(meta.resetAt) : NaN;
  // La deadline partagée existe AVANT l'ouverture du breaker. Un 429 final
  // doit interdire aux autres agents ET aux autres modèles du fournisseur de
  //sonder immédiatement, même si le compteur n'a pas encore atteint le seuil.
  const sharedDelay = Math.max(base, Number.isFinite(reset) ? Math.max(0, reset - now) : 0);
  const previousDeadline = Date.parse(entry.notBefore || '') || 0;
  entry.notBefore = new Date(Math.max(previousDeadline, now + sharedDelay)).toISOString();

  if (entry.consecutiveFailures >= threshold || entry.state === 'half_open') {
    entry.state = 'open';
    // Au seuil du breaker : 1 h. Les échecs suivants appliquent un cooldown
    // progressif, toujours plafonné à 1 h.
    const openingBase = entry.consecutiveFailures >= threshold ? Math.max(base, 60 * 60 * 1000) : base;
    const progressive = Math.min(openingBase * Math.pow(2, Math.max(0, entry.consecutiveFailures - threshold)), 60 * 60 * 1000);
    const fallbackUntil = Number.isFinite(progressive) ? now + progressive : now + openingBase;
    // Un reset fournisseur connu ne peut jamais raccourcir le breaker.
    const until = Number.isFinite(reset) ? Math.max(reset, fallbackUntil) : fallbackUntil;
    entry.cooldownUntil = new Date(until).toISOString();
    entry.notBefore = entry.cooldownUntil;
  }
  return entry;
}

/** Succès : le fournisseur redevient disponible sans annuler une deadline future. */
function recordProviderSuccess(registry, providerId) {
  const entry = getProviderEntry(registry, providerId);
  const now = Date.now();
  entry.consecutiveFailures = 0;
  entry.totalSuccesses = (entry.totalSuccesses || 0) + 1;
  entry.lastSuccessAt = new Date(now).toISOString();
  entry.lastAttemptAt = entry.lastSuccessAt;
  entry.state = 'closed';
  entry.cooldownUntil = null;
  // Un autre agent peut avoir observé un 429 plus strict entre-temps. Ce
  // succès ne doit pas autoriser un appel avant cette deadline partagée.
  if (!entry.notBefore || Date.parse(entry.notBefore) <= now) entry.notBefore = null;
  return entry;
}

/**
 * Réserve un slot de concurrence pour le fournisseur.
 * L'opération est toujours appelée sous `updateRegistry` : l'écriture est
 * donc atomique même avec plusieurs agents dans des processus différents.
 *
 * @returns {{ok:boolean, reason:string, limit:number, token?:string, state?:string}}
 */
function acquireProviderSlot(registry, providerId, limits, opts = {}) {
  const now = Number(opts.now || Date.now());
  const status = providerStatus(registry, providerId, now);
  const limit = providerLimit(providerId, limits || registry.providerLimits);
  const entry = getProviderEntry(registry, providerId);
  if (status.state === 'open') {
    entry.rejected = (entry.rejected || 0) + 1;
    return { ok: false, reason: status.reason, limit, state: status.state, retryAt: status.retryAt };
  }
  const deferredUntil = Date.parse(entry.notBefore || '') || 0;
  if (deferredUntil > now) {
    entry.rejected = (entry.rejected || 0) + 1;
    return {
      ok: false,
      reason: `Retry-After partagé jusqu'au ${entry.notBefore}`,
      limit,
      state: 'rate_limited',
      retryAt: entry.notBefore,
    };
  }
  const effectiveLimit = entry.state === 'half_open' ? 1 : limit;
  if (entry.inFlight >= effectiveLimit) {
    entry.rejected = (entry.rejected || 0) + 1;
    return {
      ok: false,
      reason: `limite de concurrence atteinte (${entry.inFlight}/${effectiveLimit})`,
      limit: effectiveLimit,
      state: entry.state,
    };
  }
  const token = String(opts.token || `${process.pid}-${now}-${Math.random().toString(16).slice(2, 10)}`);
  const leaseMs = Math.max(30_000, Number(opts.leaseMs || 15 * 60 * 1000));
  if (!entry.slots || typeof entry.slots !== 'object') entry.slots = {};
  entry.slots[token] = {
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + leaseMs).toISOString(),
  };
  entry.inFlight = Object.keys(entry.slots).length;
  if (entry.inFlight > (entry.peakInFlight || 0)) entry.peakInFlight = entry.inFlight;
  entry.lastAttemptAt = new Date(now).toISOString();
  return { ok: true, reason: 'slot obtenu', limit: effectiveLimit, token, state: entry.state };
}

/** Renouvelle le bail d'un slot (Retry-After long + tentative suivante). */
function renewProviderSlot(registry, providerId, token, leaseMs, now = Date.now()) {
  const entry = getProviderEntry(registry, providerId);
  if (!token || !entry.slots || !entry.slots[token]) return false;
  const duration = Math.max(30_000, Number(leaseMs) || 15 * 60 * 1000);
  entry.slots[token].expiresAt = new Date(Number(now) + duration).toISOString();
  entry.slots[token].renewedAt = new Date(Number(now)).toISOString();
  return true;
}

/** Libère le slot de concurrence (par token si fourni). */
function releaseProviderSlot(registry, providerId, token) {
  const entry = getProviderEntry(registry, providerId);
  if (token) {
    // Un token déjà expiré/pruné ne doit JAMAIS supprimer le slot d'un autre
    // agent : la libération est un no-op si le bail n'existe plus.
    if (entry.slots && entry.slots[token]) delete entry.slots[token];
  } else {
    const tokens = Object.keys(entry.slots || {});
    if (tokens.length) delete entry.slots[tokens[tokens.length - 1]];
  }
  entry.inFlight = Object.keys(entry.slots || {}).length;
  return entry;
}

module.exports = {
  REGISTRY_VERSION,
  DEFAULT_PROVIDER_LIMITS,
  emptyRegistry,
  readRegistry,
  writeRegistry,
  updateRegistry,
  acquireLockFile,
  releaseLockFile,
  renewLockFile,
  providerOf,
  getEntry,
  isInCooldown,
  cooldownRemainingMs,
  recordFailure,
  recordSuccess,
  recordAttempt,
  recordRetry,
  recordAvailability,
  getAvailability,
  recordFailover,
  recordResume,
  expireCooldowns,
  snapshot,
  getProviderEntry,
  providerStatus,
  providerLimit,
  recordProviderFailure,
  recordProviderSuccess,
  acquireProviderSlot,
  renewProviderSlot,
  releaseProviderSlot,
};

'use strict';

/**
 * continuity.cjs — continuité OpenCode pour Factory V3.
 *
 * RÔLE : ce module est une BIBLIOTHÈQUE de continuité, PAS un orchestrateur.
 * Il ne fait PAS de boucle, PAS de file, PAS de politique de jobs : le
 * runner `run.cjs` reste le seul orchestrateur (cf. README Factory V3).
 *
 * Ce que le module apporte, en s'appuyant sur les modules existants :
 *   - détection d'une session OpenCode bloquée        (session-registry)
 *   - lecture du dernier état validé                  (checkpoints JSON atomiques)
 *   - identification de l'erreur fournisseur          (error-classifier)
 *   - sélection d'un modèle de secours                (model-registry + failover)
 *   - backoff exponentiel + jitter                    (retry-policy)
 *   - reprise dans la MÊME session OpenCode            (CLI `opencode run --session`)
 *   - vérification factuelle de la reprise            (failover.verifyModelUsed)
 *   - journal append-only sans secret                 (observer.appendJsonl)
 *   - anti-concurrence                                (model-registry lock tokenisé)
 *
 * Aucun secret n'est journalisé : tout texte passe par `redactText`.
 */

const fs = require('fs');
const path = require('path');

const {
  CATEGORY,
  classifyFailure,
  extractErrorText,
} = require('./error-classifier.cjs');
const {
  computeDelayMs,
  decideRetry,
  isProviderLimited,
  isModelSpecific,
} = require('./retry-policy.cjs');
const {
  providerOf,
  readRegistry,
  updateRegistry,
  getEntry,
  isInCooldown,
  recordFailure,
  recordSuccess,
  recordAttempt,
  recordFailover,
  recordResume,
  acquireProviderSlot,
  releaseProviderSlot,
  acquireLockFile,
  releaseLockFile,
} = require('./model-registry.cjs');
const {
  chooseNextCandidate,
  verifyModelUsed,
  parseJsonl,
} = require('./failover.cjs');
const {
  normalizeSession,
  SESSION_ACTIVE_MS,
  SESSION_STALE_MS,
} = require('./session-registry.cjs');
const {
  appendJsonl,
  writeJsonAtomic,
  readJson,
} = require('./observer.cjs');
const { runProcess, resolveOpencodeBin } = require('./exec.cjs');
const { redactText } = require('../publish-observer-state.cjs');

const CONTINUITY_VERSION = 1;

/* ------------------------------------------------------------------ chemins */

function continuityPaths(stateDir) {
  const dir = path.join(path.resolve(stateDir), 'continuity');
  return {
    dir,
    journal: path.join(dir, 'journal.jsonl'),
    checkpoints: path.join(dir, 'checkpoints'),
    lock: path.join(dir, 'continuity.lock'),
  };
}

function checkpointFile(stateDir, sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(continuityPaths(stateDir).checkpoints, `${safe}.json`);
}

/* --------------------------------------------------------------- journalisation */

/**
 * Journalise une opération de continuité (append-only, sans secret).
 * @returns {object} l'entrée réellement écrite.
 */
function journalContinuity(stateDir, entry = {}) {
  const paths = continuityPaths(stateDir);
  const record = Object.assign({ ts: new Date().toISOString(), version: CONTINUITY_VERSION }, entry);
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'string') record[key] = redactText(record[key]);
  }
  appendJsonl(paths.journal, record);
  return record;
}

function readContinuityJournal(stateDir, limit = 50) {
  const paths = continuityPaths(stateDir);
  try {
    const lines = fs.readFileSync(paths.journal, 'utf8').split(/\r?\n/).filter(Boolean);
    const out = [];
    for (const line of lines.slice(-limit)) {
      try { out.push(JSON.parse(line)); } catch (_) { /* ligne illisible : ignorée */ }
    }
    return out;
  } catch (_) {
    return [];
  }
}

/* ------------------------------------------------------------- dernier état validé */

/** Sauvegarde le dernier point validé d'une session (écriture atomique). */
function saveCheckpoint(stateDir, sessionId, checkpoint = {}) {
  const payload = Object.assign(
    { version: CONTINUITY_VERSION, sessionId, updatedAt: new Date().toISOString() },
    checkpoint
  );
  writeJsonAtomic(checkpointFile(stateDir, sessionId), payload);
  return payload;
}

/** Relit le dernier point validé d'une session (null si absent). */
function loadCheckpoint(stateDir, sessionId) {
  return readJson(checkpointFile(stateDir, sessionId), null);
}

/* ------------------------------------------------------------ détection de blocage */

/**
 * Détecte les sessions OpenCode bloquées (silence prolongé, état d'attente,
 * état bloqué ou reprise en cours).
 */
function detectStuckSessions({
  sessions = [],
  nowMs = Date.now(),
  activeMs = SESSION_ACTIVE_MS,
  staleMs = SESSION_STALE_MS,
} = {}) {
  const stuck = [];
  for (const raw of sessions) {
    if (!raw || typeof raw !== 'object') continue;
    // Le CLI `opencode session list --format json` expose `time.updated` ;
    // le registre normalisé attend `updated` (ms). On accepte les deux formes.
    const session = (raw.updated === undefined && raw.time && raw.time.updated !== undefined)
      ? Object.assign({}, raw, { updated: raw.time.updated })
      : raw;
    const normalized = normalizeSession(session, { nowMs, activeMs, staleMs });
    if (!normalized) continue;
    const isBlocked = ['WAITING', 'BLOCKED', 'RECOVERING'].includes(normalized.state);
    if (!isBlocked && !normalized.stale) continue;
    const model = session.model && typeof session.model === 'object' ? session.model : null;
    stuck.push({
      id: session.id || session.sessionID || null,
      title: session.title || null,
      directory: session.directory || (session.location && session.location.directory) || null,
      modelRef: model ? (model.id || model.modelID || null) : (typeof session.model === 'string' ? session.model : null),
      providerID: model ? (model.providerID || null) : null,
      state: normalized.state,
      reason: normalized.reason,
      stale: !!normalized.stale,
      stallSeconds: normalized.stallSeconds,
      updatedAt: session.time && session.time.updated ? session.time.updated : null,
    });
  }
  return stuck;
}

/* --------------------------------------------------------- classification d'erreur */

/**
 * Identifie l'erreur fournisseur d'une exécution OpenCode.
 * @returns {{classification: object, errorText: string}}
 */
function classifySessionFailure({
  stdout = '',
  stderr = '',
  events = [],
  timedOut = false,
  idleTimedOut = false,
  cooldowns = undefined,
} = {}) {
  const errorText = extractErrorText(events)
    || [stderr, stdout].filter(Boolean).join('\n');
  const classification = classifyFailure({
    stdout, stderr, events, timedOut, idleTimedOut, cooldowns,
  });
  return { classification, errorText };
}

/* --------------------------------------------------------- sélection du secours */

/**
 * Sélectionne un modèle de secours DISPONIBLE en réutilisant le registre
 * Factory (cooldowns) et la politique de bascule existante.
 */
function selectFallbackModel({
  registry,
  currentModel = null,
  classification = {},
  candidates = [],
} = {}) {
  const list = (candidates || []).map((c) => (
    typeof c === 'string' ? { ref: c, provider: providerOf(c) } : c
  )).filter((c) => c && c.ref);
  if (!list.length) return null;

  const eligible = [];
  for (const candidate of list) {
    if (currentModel && candidate.ref === currentModel) continue;
    const entry = getEntry(registry, candidate.ref);
    if (isInCooldown(entry)) continue;
    eligible.push(candidate);
  }
  if (!eligible.length) return null;

  const current = { ref: currentModel, provider: providerOf(currentModel || '') };
  const picked = chooseNextCandidate(eligible, -1, current, classification);
  if (!picked) return null;
  return {
    ref: picked.ref,
    provider: picked.provider || providerOf(picked.ref),
    reason: classification.reason || 'selection secours',
    providerLimited: isProviderLimited(classification),
    modelSpecific: isModelSpecific(classification),
  };
}

/* ------------------------------------------------------------- prompt de reprise */

/**
 * Construit le prompt de reprise : contexte conservé, dernier point validé,
 * erreur constatée, et consigne explicite de NE PAS recommencer.
 */
function buildContinuityPrompt({
  mission = '',
  checkpoint = null,
  errorText = '',
  modelRef = null,
  providerID = null,
} = {}) {
  const lines = [];
  lines.push('[FACTORY-V3 CONTINUITE]');
  lines.push(`date: ${new Date().toISOString()}`);
  if (modelRef) lines.push(`modele: ${modelRef}`);
  if (providerID) lines.push(`fournisseur: ${providerID}`);
  lines.push('');
  lines.push('MISSION (contexte conserve, NE PAS recommencer) :');
  lines.push(redactText(String(mission || '(contexte non disponible)')).slice(0, 4000));
  if (checkpoint) {
    lines.push('');
    lines.push('DERNIER POINT VALIDE :');
    lines.push(redactText(JSON.stringify(checkpoint, null, 2)).slice(0, 3000));
  }
  if (errorText) {
    lines.push('');
    lines.push('ERREUR FOURNISSEUR CONSTATEE :');
    lines.push(redactText(String(errorText)).slice(0, 1200));
  }
  lines.push('');
  lines.push('REPRISE APRES BASCULE DE MODELE');
  lines.push('- Reprendre exactement au dernier point valide ci-dessus.');
  lines.push('- Ne pas rejouer les etapes deja validees.');
  lines.push('- Ne jamais fabriquer un resultat : rapporter l etat reel.');
  lines.push('- Terminer par un resume factuel de ce qui reste a faire.');
  return lines.join('\n');
}

/* --------------------------------------------------------------- anti-concurrence */

/**
 * Verrouille la continuité (une seule opération à la fois, tous runners).
 */
function acquireContinuityLock(stateDir, { timeoutMs = 5000 } = {}) {
  const paths = continuityPaths(stateDir);
  fs.mkdirSync(paths.dir, { recursive: true });
  return acquireLockFile(paths.lock, timeoutMs, { kind: 'factory-continuity' });
}

function releaseContinuityLock(stateDir, token) {
  return releaseLockFile(continuityPaths(stateDir).lock, token);
}

/* --------------------------------------------------------------- reprise réelle */

/**
 * Reprend une session OpenCode existante via le CLI local (comme un opérateur
 * humain qui rouvre la conversation et relance une consigne).
 */
async function resumeSession({
  repoDir,
  sessionId,
  modelRef,
  prompt,
  opencodeBin = null,
  opencodePrefixArgs = [],
  timeoutMs = 900000,
  idleTimeoutMs = 300000,
  cwd = null,
} = {}) {
  if (!repoDir) throw new Error('CONTINUITY_REPO_DIR_REQUIRED');
  if (!sessionId) throw new Error('CONTINUITY_SESSION_REQUIRED');
  if (!modelRef) throw new Error('CONTINUITY_MODEL_REQUIRED');

  const bin = resolveOpencodeBin(opencodeBin);
  const args = [
    ...(opencodePrefixArgs || []),
    'run',
    '--dir', repoDir,
    '-m', modelRef,
    '--format', 'json',
    '--print-logs',
    '--log-level', 'INFO',
    '--title', `factory-continuity-${sessionId}`,
    '--session', sessionId,
    prompt,
  ];
  const result = await runProcess({
    file: bin,
    args,
    cwd: cwd || repoDir,
    timeoutMs,
    idleTimeoutMs,
  });
  const events = parseJsonl(result.stdout);
  return Object.assign({}, result, { events, args });
}

/**
 * Vérifie FACTUELLEMENT que la session a repris : le modèle, le fournisseur et
 * l'identifiant de session doivent apparaître sur la MÊME ligne de log.
 */
function verifyResume({ result = {}, sessionId, modelRef } = {}) {
  const proof = verifyModelUsed(result.stderr || '', modelRef, sessionId);
  const events = result.events || [];
  const errorEvents = events.filter((e) => e && (e.type === 'error' || e.error));
  const textEvents = events.filter((e) => e && (e.type === 'text' || (e.part && e.part.type === 'text') || e.text));
  const ok = !result.timedOut
    && !result.idleTimedOut
    && result.exitCode === 0
    && errorEvents.length === 0
    && proof.verified === true;
  return {
    ok,
    verified: proof.verified === true,
    modelUsed: proof,
    errorEvents: errorEvents.length,
    textEvents: textEvents.length,
    exitCode: result.exitCode,
    timedOut: !!result.timedOut,
    idleTimedOut: !!result.idleTimedOut,
  };
}

/* ------------------------------------------------------------------ opérations */

/**
 * Opération de continuité COMPLETE (une seule, sans boucle) :
 * lecture d'état → classification → sélection du secours → reprise → vérification.
 *
 * @returns {Promise<object>} rapport factuel (aucune valeur de secret).
 */
async function runContinuity({
  stateDir,
  session,
  repoDir,
  mission = '',
  candidates = [],
  modelRef = null,
  errorText = '',
  stdout = '',
  stderr = '',
  events = [],
  opencodeBin = null,
  opencodePrefixArgs = [],
  timeoutMs = 900000,
  idleTimeoutMs = 300000,
  dryRun = false,
  now = () => Date.now(),
} = {}) {
  const startedAt = now();
  const sessionId = session && (session.id || session.sessionID);
  const currentModel = modelRef
    || (session && session.model && (session.model.id || session.model.modelID))
    || null;
  const providerID = (session && session.model && session.model.providerID)
    || (currentModel ? providerOf(currentModel) : null);

  const report = {
    sessionId,
    currentModel,
    providerID,
    startedAt: new Date(startedAt).toISOString(),
    steps: [],
    resumed: false,
    verified: false,
    fallbackUsed: null,
    error: null,
  };

  const lock = acquireContinuityLock(stateDir);
  if (!lock.ok) {
    report.error = 'CONTINUITY_LOCK_BUSY';
    report.steps.push({ step: 'lock', ok: false, reason: lock.reason || 'busy' });
    journalContinuity(stateDir, { event: 'CONTINUITY_LOCK_BUSY', sessionId });
    return report;
  }
  report.steps.push({ step: 'lock', ok: true });

  try {
    // 1. Dernier point validé
    const checkpoint = loadCheckpoint(stateDir, sessionId);
    report.steps.push({ step: 'checkpoint', ok: true, found: !!checkpoint, updatedAt: checkpoint ? checkpoint.updatedAt : null });

    // 2. Erreur fournisseur
    const { classification, errorText: detected } = classifySessionFailure({
      stdout, stderr, events,
    });
    report.classification = {
      category: classification.category,
      providerLimited: classification.providerLimited,
      modelSpecific: classification.modelSpecific,
      httpStatus: classification.httpStatus,
      retryAfterMs: classification.retryAfterMs,
      reason: classification.reason,
    };
    report.steps.push({ step: 'classify', ok: true, category: classification.category });

    // 3. Modèle de secours
    const registryFile = path.join(path.resolve(stateDir), 'model-registry.json');
    const registry = readRegistry(registryFile);
    const fallback = selectFallbackModel({
      registry, currentModel, classification, candidates,
    });
    report.fallbackUsed = fallback ? fallback.ref : null;
    report.steps.push({ step: 'select_fallback', ok: !!fallback, ref: fallback ? fallback.ref : null });

    // 4. Backoff si un retry immédiat est envisageable
    const retry = decideRetry({
      classification,
      attempt: 1,
      maxAttempts: 3,
      retryAfterMs: classification.retryAfterMs,
    });
    report.retry = { retry: retry.retry, delayMs: retry.delayMs, reason: retry.reason };
    report.steps.push({ step: 'backoff', ok: true, delayMs: retry.delayMs, retry: retry.retry });

    if (dryRun) {
      report.steps.push({ step: 'dry_run', ok: true });
      journalContinuity(stateDir, {
        event: 'CONTINUITY_DRY_RUN',
        sessionId,
        currentModel,
        fallback: report.fallbackUsed,
        category: classification.category,
      });
      return report;
    }

    if (!fallback) {
      report.error = 'NO_FALLBACK_AVAILABLE';
      journalContinuity(stateDir, {
        event: 'CONTINUITY_NO_FALLBACK',
        sessionId,
        currentModel,
        category: classification.category,
      });
      return report;
    }

    // 5. Reprise réelle dans la MÊME session
    const prompt = buildContinuityPrompt({
      mission,
      checkpoint,
      errorText: errorText || detected,
      modelRef: fallback.ref,
      providerID: fallback.provider,
    });
    const result = await resumeSession({
      repoDir,
      sessionId,
      modelRef: fallback.ref,
      prompt,
      opencodeBin,
      opencodePrefixArgs,
      timeoutMs,
      idleTimeoutMs,
    });
    report.resumed = true;
    report.exitCode = result.exitCode;
    report.steps.push({ step: 'resume', ok: result.exitCode === 0, exitCode: result.exitCode });

    // 6. Vérification factuelle de la reprise
    const verification = verifyResume({ result, sessionId, modelRef: fallback.ref });
    report.verified = verification.ok;
    report.verification = {
      ok: verification.ok,
      verified: verification.verified,
      observedModel: verification.modelUsed ? verification.modelUsed.observedModel : null,
      observedProvider: verification.modelUsed ? verification.modelUsed.observedProvider : null,
      boundSession: verification.modelUsed ? verification.modelUsed.boundSession : null,
      errorEvents: verification.errorEvents,
      textEvents: verification.textEvents,
    };
    report.steps.push({ step: 'verify', ok: verification.ok });

    // 7. Mise à jour du dernier point validé + registre Factory
    saveCheckpoint(stateDir, sessionId, {
      currentModel: fallback.ref,
      providerID: fallback.provider,
      previousModel: currentModel,
      resumedAt: new Date().toISOString(),
      verified: verification.ok,
      lastCategory: classification.category,
    });
    try {
      updateRegistry(registryFile, (reg) => {
        recordAttempt(reg, 0);
        if (verification.ok) {
          recordSuccess(reg, fallback.ref, { via: 'continuity' });
          recordFailover(reg, { from: currentModel, to: fallback.ref, sessionId, via: 'continuity' });
          recordResume(reg);
        } else {
          recordFailure(reg, fallback.ref, classification, { via: 'continuity' });
        }
        return reg;
      });
    } catch (_) { /* registre indisponible : la continuité ne doit pas die */ }

    journalContinuity(stateDir, {
      event: 'CONTINUITY_RESUME',
      sessionId,
      from: currentModel,
      to: fallback.ref,
      provider: fallback.provider,
      category: classification.category,
      verified: verification.ok,
      exitCode: result.exitCode,
    });
    return report;
  } finally {
    releaseContinuityLock(stateDir, lock.token);
  }
}

module.exports = {
  CONTINUITY_VERSION,
  CATEGORY,
  continuityPaths,
  checkpointFile,
  journalContinuity,
  readContinuityJournal,
  saveCheckpoint,
  loadCheckpoint,
  detectStuckSessions,
  classifySessionFailure,
  selectFallbackModel,
  buildContinuityPrompt,
  acquireContinuityLock,
  releaseContinuityLock,
  resumeSession,
  verifyResume,
  runContinuity,
};

'use strict';
/**
 * Factory V3 — Moteur de bascule automatique de modèle (failover + quota autopilot).
 *
 * Principes (mission P0) :
 *  - Un quota épuisé n'est JAMAIS une raison de s'arrêter : on bascule.
 *  - On ne change PAS de modèle pour une simple erreur de code.
 *  - Le contexte (mission, branche, fichiers modifiés, décisions) est conservé :
 *    reprise native de la session OpenCode (`--session <id>`) + bloc de reprise.
 *  - Les modèles payants sont exclus tant que `paidAllowed` est false.
 *  - Chaque bascule est tracée (registre persistant + logs JSONL + tableau de bord).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { runProcess, runShell, resolveOpencodeBin } = require('./exec.cjs');
const inventoryLib = require('./inventory.cjs');
const registryLib = require('./model-registry.cjs');
const { classifyFailure, CATEGORY } = require('./error-classifier.cjs');
const retryPolicy = require('./retry-policy.cjs');

const DEFAULTS = {
  maxModelSwitches: 4,
  maxSameModelAttempts: retryPolicy.MAX_SAME_MODEL_ATTEMPTS,
  providerSlotWaitMs: 30 * 1000,
  providerSlotLeaseMs: 16 * 60 * 1000,
  availabilityCacheMs: 30 * 60 * 1000,
  agentTimeoutMs: 15 * 60 * 1000,
  agentIdleTimeoutMs: 5 * 60 * 1000,
  inventoryMaxAgeMs: 30 * 60 * 1000,
  circuitThreshold: 3,
  cooldowns: {
    dailyMs: 24 * 60 * 60 * 1000,
    hourlyMs: 60 * 60 * 1000,
    rateMs: 2 * 60 * 1000,
    providerMs: 10 * 60 * 1000,
    technicalMs: 2 * 60 * 1000,
  },
};

function mergeDeep(base, over) {
  const out = Object.assign({}, base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') {
      out[k] = mergeDeep(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

/**
 * Choisit le prochain modèle après un échec.
 *
 * - fournisseur limité (429 / 5xx / auth) → priorité à un AUTRE fournisseur ;
 * - problème propre au modèle (modèle inexistant, quota daily du modèle) →
 *   priorité à un AUTRE modèle du MÊME fournisseur ;
 * - sinon → ordre de classement déjà calculé.
 */
function chooseNextCandidate(candidates, currentIndex, current, classification) {
  const remaining = candidates.slice(currentIndex + 1);
  if (!remaining.length) return null;
  const providerLimited = retryPolicy.isProviderLimited(classification);
  const modelSpecific = retryPolicy.isModelSpecific(classification);
  if (providerLimited) {
    // Si OpenCode a réellement répondu via un AUTRE fournisseur, ce
    // fournisseur a fait son travail : il ne doit pas être penalise. On le
    // preference pour le prochain modele, sinon on change de fournisseur.
    const observedProvider = classification && classification.evidence
      ? classification.evidence.observedProvider
      : null;
    if (observedProvider) {
      const observedCandidate = remaining.find((c) => c.provider === observedProvider);
      if (observedCandidate) return observedCandidate;
    }
    const otherProvider = remaining.find((c) => c.provider !== current.provider);
    if (otherProvider) return otherProvider;
  }
  if (modelSpecific) {
    const sameProvider = remaining.find((c) => c.provider === current.provider);
    if (sameProvider) return sameProvider;
  }
  return remaining[0];
}

function parseJsonl(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t[0] !== '{') continue;
    try {
      events.push(JSON.parse(t));
    } catch (_) {
      /* ligne non JSON : ignorée */
    }
  }
  return events;
}

/**
 * Convertit un coût OpenCode en nombre positif observé.
 *
 * Le runtime OpenCode expose le coût dans `part.cost` (nombre ou objet selon
 * la version), tandis que certaines émissions historiques l'exposent dans
 * `event.cost`. Les deux formes sont lues, sans jamais convertir une valeur
 * inconnue en zéro.
 */
function observedCostValue(raw) {
  if (raw == null) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.abs(raw) : 0;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.abs(n) : 0;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return 0;
  // Un total explicite est prioritaire : sommer aussi ses composants
  // compterait deux fois le même coût.
  for (const key of ['total', 'amount', 'value']) {
    if (raw[key] != null) {
      const n = Number(raw[key]);
      if (Number.isFinite(n)) return Math.abs(n);
    }
  }
  let total = 0;
  for (const key of ['input', 'output', 'cache', 'reasoning']) {
    const value = raw[key];
    if (value == null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const nestedKey of ['read', 'write']) {
        const nested = Number(value[nestedKey]);
        if (Number.isFinite(nested)) total += Math.abs(nested);
      }
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) total += Math.abs(n);
    }
  }
  return total;
}

/** Somme les coûts réellement observés dans les événements OpenCode. */
function extractObservedCost(events) {
  return (events || []).reduce((total, event) => {
    if (!event || typeof event !== 'object') return total;
    const raw = event.part && event.part.cost != null ? event.part.cost : event.cost;
    return total + observedCostValue(raw);
  }, 0);
}

/** Somme les tokens réellement observés dans `part.tokens` ou `event.tokens`. */
function extractObservedTokens(events) {
  return (events || []).reduce((total, event) => {
    if (!event || typeof event !== 'object') return total;
    const tokens = event.part && event.part.tokens ? event.part.tokens : event.tokens;
    const n = Number(tokens && tokens.total);
    return total + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Compare le modèle ET le fournisseur observés dans un même log OpenCode. */
function verifyModelUsed(stderrText, requestedRef, sessionId, expectedProvider = null) {
  const text = String(stderrText || '');
  const records = String(text).split(/\r?\n/).map((line) => {
    const modelMatch = line.match(/\bmodelID=([^\s]+)/)
      || line.match(/\bllm\.model=([^\s]+)/);
    const providerMatch = line.match(/\bproviderID=([^\s]+)/)
      || line.match(/\bllm\.provider=([^\s]+)/);
    const sessionMatch = line.match(/\bsession\.id=([^\s]+)/);
    return {
      line,
      model: modelMatch ? modelMatch[1] : null,
      provider: providerMatch ? providerMatch[1] : null,
      session: sessionMatch ? sessionMatch[1] : null,
    };
  });
  const modelIds = records.map((r) => r.model).filter(Boolean);
  const providers = records.map((r) => r.provider).filter(Boolean);
  const requestedId = String(requestedRef || '').includes('/')
    ? String(requestedRef).split('/').slice(1).join('/')
    : String(requestedRef || '');
  const expectedProviderId = expectedProvider || String(requestedRef || '').split('/')[0] || null;
  const matchingModel = (value) => !!value && (value === requestedRef || value === requestedId);
  const modelVerified = records.some((r) => matchingModel(r.model));
  const providerVerified = !!expectedProviderId
    && records.some((r) => r.provider === expectedProviderId);
  const sessionSeen = !!sessionId && records.some((r) => r.session === sessionId);
  // Le modèle, le fournisseur et la session doivent être présents dans LA MÊME
  // ligne. Empiler des tokens issus de lignes différentes fabriquerait un faux succès.
  const bound = records.find((r) => (
    matchingModel(r.model)
    && r.provider === expectedProviderId
    && !!sessionId
    && r.session === sessionId
  )) || null;
  const verified = modelVerified && providerVerified && sessionSeen && !!bound;
  return {
    observedModel: bound ? bound.model : (modelIds.length ? modelIds[modelIds.length - 1] : null),
    observedProvider: bound ? bound.provider : (providers.length ? providers[providers.length - 1] : null),
    lastObservedModel: modelIds.length ? modelIds[modelIds.length - 1] : null,
    lastObservedProvider: providers.length ? providers[providers.length - 1] : null,
    boundModel: bound ? bound.model : null,
    boundProvider: bound ? bound.provider : null,
    boundSession: bound ? bound.session : null,
    verified,
    modelVerified,
    providerVerified,
    sessionSeen,
    evidenceRecord: bound ? bound.line.slice(0, 1000) : null,
    modelIds,
    providers,
  };
}

function gitState(repoPath) {
  return (async () => {
    const head = await runShell('git rev-parse HEAD', { cwd: repoPath, timeoutMs: 30000 });
    const status = await runShell('git status --porcelain -uall', { cwd: repoPath, timeoutMs: 30000 });
    const stat = await runShell('git diff HEAD --stat', { cwd: repoPath, timeoutMs: 30000 });
    const last = await runShell('git log -1 --format=%H%x20%s', { cwd: repoPath, timeoutMs: 30000 });
    const dirty = String(status.stdout || '').split(/\r?\n/).filter((l) => l.trim().length);
    const headValue = String(head.stdout || '').trim();
    const valid = head.exitCode === 0
      && status.exitCode === 0
      && /^[0-9a-f]{40}$/i.test(headValue);
    return {
      head: headValue,
      valid,
      dirtyFiles: dirty.length,
      dirtyList: dirty.slice(0, 40),
      diffStat: String(stat.stdout || '').slice(-1500),
      lastCommit: String(last.stdout || '').trim(),
    };
  })();
}

/** Contexte de reprise persisté par job (survit aux redémarrages du runner). */
function contextFile(stateDir, jobId) {
  return path.join(stateDir, 'context', `${jobId}.json`);
}

/**
 * Vérifie que l'agent a RÉELLEMENT produit le résultat attendu.
 *
 * Un modèle peut répondre « j'ai créé le fichier et commité » sans l'avoir
 * fait (constaté le 2026-11-14 avec un petit modèle local : appels d'outils
 * émis en TEXTE, aucun fichier créé). Sans cette vérification, Factory
 * déclarerait un faux succès.
 *
 * Contrat (`job.verify` ou `cfg.failover.verifyResult`) :
 *   { requiredFiles: [{ path, contains? }], requireCommit?: bool, requireCleanTree?: bool }
 */
/** Empreinte d'un fichier requis, capturée AVANT la tentative modèle. */
function fileFingerprint(repoPath, relativePath) {
  const target = path.resolve(repoPath, relativePath);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return { exists: false, hash: null, size: 0 };
  }
  try {
    const content = fs.readFileSync(target);
    return {
      exists: true,
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      size: content.length,
    };
  } catch (_) {
    return { exists: true, hash: null, size: 0 };
  }
}

function snapshotRequiredFiles(repoPath, spec) {
  const snapshot = {};
  const files = spec && Array.isArray(spec.requiredFiles) ? spec.requiredFiles : [];
  for (const f of files) snapshot[f.path] = fileFingerprint(repoPath, f.path);
  return snapshot;
}

function gitOutput(repoPath, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    };
  } catch (e) {
    return { ok: false, stdout: '', error: String(e && e.message || e) };
  }
}

/** Un SHA persisté n'est réutilisé que s'il existe et est sur le HEAD courant. */
function isReachableCommit(repoPath, sha) {
  if (!/^[0-9a-f]{40}$/i.test(String(sha || ''))) return false;
  const exists = gitOutput(repoPath, ['cat-file', '-e', `${sha}^{commit}`]);
  if (!exists.ok) return false;
  return gitOutput(repoPath, ['merge-base', '--is-ancestor', sha, 'HEAD']).ok;
}

/**
 * Vérifie que l'agent a RÉELLEMENT produit le résultat attendu.
 *
 * `context` contient l'état Git avant/après et les empreintes des fichiers
 * requis AVANT la tentative. Un fichier préexistant inchangé ne peut donc pas
 * faire passer le contrat à tort ; un commit préexistant ne compte pas.
 */
function verifyResult(repoPath, spec, context = {}) {
  const checks = [];
  if (!spec) return { ok: true, checks };
  const before = context.before || null;
  const after = context.after || null;
  const beforeFiles = context.beforeFiles || null;

  const fileList = Array.isArray(spec.requiredFiles) ? spec.requiredFiles : [];
  for (const f of fileList) {
    const target = path.resolve(repoPath, f.path);
    const exists = fs.existsSync(target) && fs.statSync(target).isFile();
    let contains = null;
    if (exists && f.contains != null) {
      try {
        contains = fs.readFileSync(target, 'utf8').includes(f.contains);
      } catch (_) {
        contains = false;
      }
    }
    const prior = beforeFiles ? beforeFiles[f.path] : null;
    const changed = !prior || !prior.exists || !exists || prior.hash !== fileFingerprint(repoPath, f.path).hash;
    const ok = exists && changed && (contains === null || contains === true);
    checks.push({
      id: `file:${f.path}`,
      ok,
      detail: !exists
        ? 'fichier absent'
        : (contains === false
          ? `contenu attendu « ${f.contains} » absent`
          : (changed ? 'présent et produit par la tentative' : 'présent AVANT la tentative mais inchangé')),
    });
  }

  if (spec.requireCommit) {
    const validBefore = !!(before && before.valid && /^[0-9a-f]{40}$/i.test(before.head || ''));
    const validAfter = !!(after && after.valid && /^[0-9a-f]{40}$/i.test(after.head || ''));
    const newCommit = validBefore && validAfter && after.head !== before.head;
    checks.push({
      id: 'commit',
      ok: newCommit,
      detail: !validBefore || !validAfter
        ? 'état Git initial/final invalide — commit non prouvable'
        : (newCommit ? `nouveau commit ${after.head}` : 'aucun nouveau commit pendant la tentative'),
    });
  }

  if (spec.requireCleanTree) {
    const status = gitOutput(repoPath, ['status', '--porcelain', '-uall']);
    const clean = status.ok && !status.stdout.trim();
    checks.push({
      id: 'clean-tree',
      ok: clean,
      detail: !status.ok ? 'état Git illisible — arbre NON validé' : (clean ? 'arbre propre' : 'modifications non commitées'),
    });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

function saveContext(stateDir, jobId, ctx) {
  const file = contextFile(stateDir, jobId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2));
  fs.renameSync(tmp, file);
}

function loadContext(stateDir, jobId) {
  const file = contextFile(stateDir, jobId);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('CONTEXT_INVALID: racine invalide');
    }
    return raw;
  } catch (cause) {
    const error = new Error(`CONTEXT_CORRUPT: ${file}`);
    error.code = 'CONTEXT_CORRUPT';
    error.cause = cause;
    throw error;
  }
}

/** Construit le prompt : mission + règles + bloc de reprise (si applicable). */
function buildPrompt(job, repoCfg, resume) {
  const base = [
    `Tâche FACTORY (job ${job.jobId}, repo ${job.repo}, sévérité ${job.severity}) : ${job.task}`,
    '',
    'Règles absolues :',
    '- Travaille réellement dans ce dépôt : LIS les fichiers concernés, MODIFIE si nécessaire, TESTE, COMMIT.',
    '- Commits conventionnels (feat/fix/docs/chore/test(scope): description) sur la branche courante.',
    '- Si la tâche ne nécessite aucune modification de fichier, dis-le explicitement (résultat légitime).',
    '- INTERDIT : inventer des données, falsifier des timestamps, toucher aux paiements/prix/clés, modifier dist/.',
    '- Si tu es bloqué après 3 tentatives, arrête-toi et explique le blocage (le job sera marqué FAILED honnêtement).',
    '- Termine par une ligne : FACTORY_DONE: <résumé en 1 ligne de ce qui a réellement été fait>.',
  ];
  if (!resume || !resume.attempts || resume.attempts.length === 0) return base.join('\n');

  const lines = [
    '',
    '=== REPRISE APRÈS BASCULE DE MODÈLE (contexte à conserver, NE PAS recommencer) ===',
    `Ancien modèle en échec : ${resume.attempts[resume.attempts.length - 1].ref} (${resume.attempts[resume.attempts.length - 1].category || 'inconnu'})`,
    `Raison : ${resume.attempts[resume.attempts.length - 1].reason || 'n/a'}`,
  ];
  if (resume.git && resume.git.lastCommit) lines.push(`Dernier commit confirmé : ${resume.git.lastCommit}`);
  if (resume.git && resume.git.dirtyFiles > 0) {
    lines.push(`Fichiers déjà modifiés (${resume.git.dirtyFiles}) — NE PAS les supprimer ni les écraser :`);
    for (const d of resume.git.dirtyList) lines.push(`  - ${d}`);
    if (resume.git.diffStat) lines.push('Diff en cours :\n' + resume.git.diffStat);
  }
  if (resume.sessionId) lines.push(`Session OpenCode à poursuivre : ${resume.sessionId}`);
  lines.push('Tâches restantes : reprends exactement là où le travail s\'est arrêté, vérifie ce qui est déjà fait, et termine la mission.');
  lines.push('=== FIN DU BLOC DE REPRISE ===');
  return base.concat(lines).join('\n');
}

/** Budget de tentatives déjà consommé par un modèle dans CE job. */
function modelAttemptBudget(attempts, ref, maxAttempts) {
  const prior = (attempts || []).filter((a) => a.ref === ref && a.outcome !== 'success');
  const completed = prior.filter((a) => a.outcome !== 'in_progress');
  const inProgress = prior.filter((a) => a.outcome === 'in_progress');
  const categories = completed.map((a) => a.category).filter(Boolean);
  const terminal = categories.some((category) => (
    retryPolicy.NO_RETRY_CATEGORIES.has(category)
    || category === CATEGORY.DAILY_QUOTA_EXHAUSTED
  ));
  const safetyFailures = categories.filter((c) => c === CATEGORY.CONTENT_SAFETY_UNAVAILABLE).length;
  // Si le runner meurt pendant la reprise safety, l'appel en cours compte
  // déjà : une troisième tentative safety ne doit jamais être autorisée.
  const pendingSafety = safetyFailures > 0 ? inProgress.length : 0;
  const safetyConsumed = safetyFailures + pendingSafety;
  const used = prior.length;
  return {
    used,
    safetyFailures,
    safetyConsumed,
    terminal,
    exhausted: terminal || safetyConsumed >= 2 || used >= maxAttempts,
    canAttempt: !terminal && safetyConsumed < 2 && used < maxAttempts,
  };
}

/** Marqueur de fin explicite exigé pour reconnaître un résultat réel. */
function hasCompletionMarker(text) {
  return /\bFACTORY_DONE\s*:/i.test(String(text || ''));
}

/**
 * Exécute un job avec bascule automatique de modèle.
 */
async function executeJobWithFailover(opts = {}) {
  const { stateDir, job, repoCfg } = opts;
  const cfg = mergeDeep(DEFAULTS, opts.cfg && opts.cfg.failover ? opts.cfg.failover : opts.cfg);
  const preferred = (opts.cfg && opts.cfg.models) || [];
  const opencodeBin = resolveOpencodeBin((opts.cfg && opts.cfg.opencodeBin) || 'opencode');
  // Le contrat P0 est ABSOLU : une configuration locale ne peut pas activer
  // un modèle payant. Toute tentative d'override échoue avant l'inventaire.
  if (opts.cfg && (
    opts.cfg.paidAllowed === true
    || (opts.cfg.failover && opts.cfg.failover.paidAllowed === true)
  )) {
    const error = new Error('PAID_MODELS_FORBIDDEN: paidAllowed=true est interdit par le contrat Factory V3');
    error.code = 'PAID_MODELS_FORBIDDEN';
    throw error;
  }
  const paidAllowed = false;
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;
  const sleep = typeof opts.sleep === 'function'
    ? opts.sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  const maxSameModelAttempts = Math.min(
    retryPolicy.MAX_SAME_MODEL_ATTEMPTS,
    Math.max(1, Number(cfg.maxSameModelAttempts) || DEFAULTS.maxSameModelAttempts),
  );
  // Un bail trop court permettrait à un autre agent de sonder le fournisseur
  // pendant que la tentative OpenCode est encore active. Le bail minimum
  // couvre donc TOUTE une tentative (timeout total + marge de terminaison),
  // puis est renouvelé avant chaque attente Retry-After.
  const configuredProviderLeaseMs = Math.max(
    30_000,
    Number(cfg.providerSlotLeaseMs) || DEFAULTS.providerSlotLeaseMs,
  );
  const agentTimeoutMs = Math.max(1, Number(cfg.agentTimeoutMs) || DEFAULTS.agentTimeoutMs);
  const providerAttemptLeaseMs = Math.max(configuredProviderLeaseMs, agentTimeoutMs + 60_000);
  const jobStartedAt = now();

  const registryFile = path.join(stateDir, 'model-registry.json');
  const inventoryFile = path.join(stateDir, 'inventory.json');
  let registry = registryLib.readRegistry(registryFile);

  const restored = registryLib.updateRegistry(registryFile, (reg) => registryLib.expireCooldowns(reg, now()));
  if (restored.length) log('MODEL_REINSTATED', { models: restored });
  registry = registryLib.readRegistry(registryFile);

  // Reprise après interruption/restart : le contexte persistant est relu
  // AVANT la sélection des candidats pour conserver la session, l'historique
  // ET les budgets de retry déjà consommés.
  const persistedContext = loadContext(stateDir, job.jobId);
  const attempts = persistedContext && Array.isArray(persistedContext.attempts)
    ? persistedContext.attempts.slice()
    : [];
  const distinctModelsUsed = new Set([
    ...(persistedContext && Array.isArray(persistedContext.distinctModelsUsed)
      ? persistedContext.distinctModelsUsed
      : []),
    ...attempts.map((attempt) => attempt.ref).filter(Boolean),
  ]);
  let sessionId = persistedContext && persistedContext.sessionId ? persistedContext.sessionId : null;
  // Le HEAD persisté était le HEAD AVANT le job : il ne prouve aucun commit
  // produit par la mission. Seul un SHA explicitement créé par ce job est
  // réutilisé après restart.
  let committedSha = persistedContext && persistedContext.committedSha || null;
  let interruptedWithCommit = false;
  let spend = persistedContext && Number(persistedContext.spend || 0) || 0;
  let failovers = persistedContext && Number(persistedContext.failovers || 0) || 0;
  let resumes = persistedContext && Number(persistedContext.resumes || 0) || 0;
  let replacementModel = persistedContext && persistedContext.replacementModel || null;
  const verifySpec = (job && job.verify) || (cfg && cfg.verifyResult) || null;

  // Le contrat de résultat est évalué au niveau JOB, pas à la tentative : un
  // fichier créé par la tentative A puis laissé intact par B satisfait le contrat.
  let jobBaseline = persistedContext && persistedContext.baseline || null;
  if (!jobBaseline || !jobBaseline.before || !jobBaseline.beforeFiles) {
    const baselineBefore = await gitState(repoCfg.local);
    jobBaseline = {
      before: baselineBefore,
      beforeFiles: snapshotRequiredFiles(repoCfg.local, verifySpec),
      capturedAt: new Date().toISOString(),
    };
  }
  if (committedSha && !isReachableCommit(repoCfg.local, committedSha)) {
    // Un contexte ancien ou altéré ne peut pas injecter un faux SHA dans le
    // verdict. Le commit sera re-prouvé par Git avant toute réutilisation.
    committedSha = null;
  }
  const persistContext = (git = jobBaseline.before) => saveContext(stateDir, job.jobId, {
    jobId: job.jobId,
    attempts,
    git,
    baseline: jobBaseline,
    committedSha,
    sessionId,
    failovers,
    resumes,
    replacementModel,
    spend,
    distinctModelsUsed: Array.from(distinctModelsUsed),
    updatedAt: new Date().toISOString(),
  });
  // Persister le baseline avant le premier appel : un crash ultérieur ne doit
  // jamais faire perdre la preuve de résultat du job.
  persistContext(jobBaseline.before);

  // Un retry planifié avant un crash ne doit jamais être relancé avant son
  // échéance. On attend le reliquat strict avant toute nouvelle sélection.
  const pendingRetry = attempts
    .filter((a) => a.retryScheduled && a.retryReadyAt && Date.parse(a.retryReadyAt) > now())
    .sort((a, b) => Date.parse(b.retryReadyAt) - Date.parse(a.retryReadyAt))[0];
  if (pendingRetry) {
    const remainingMs = Date.parse(pendingRetry.retryReadyAt) - now();
    log('RETRY_DEADLINE_RESTORED', {
      jobId: job.jobId,
      ref: pendingRetry.ref,
      remainingMs,
      retryReadyAt: pendingRetry.retryReadyAt,
    });
    await sleep(remainingMs);
  }

  // --- Inventaire (cache + rafraîchissement si périmé) ---------------------
  let inventory = inventoryLib.loadInventory(inventoryFile);
  const inventoryAge = inventory ? now() - Date.parse(inventory.updatedAt || 0) : Infinity;
  if (!inventory || inventoryAge > cfg.inventoryMaxAgeMs || opts.forceInventoryRefresh) {
    log('INVENTORY_REFRESH_START', { reason: !inventory ? 'absent' : 'périmé' });
    inventory = await inventoryLib.refreshInventory({
      opencodeBin,
      paidAllowed,
      providers: (opts.cfg && opts.cfg.inventory && opts.cfg.inventory.providers) || undefined,
      cwd: repoCfg.local,
    });
    inventoryLib.saveInventory(inventoryFile, inventory);
    log('INVENTORY_REFRESHED', {
      discovered: inventory.counts.discovered,
      eligible: inventory.counts.eligible,
      free: inventory.counts.free,
      authProviders: inventory.authProviders,
      errors: inventory.errors,
    });
  }

  // --- Candidats (dynamique, gratuit uniquement, cooldown exclu) ----------
  const ranked = inventoryLib.rankModels(inventory, { preferred, registry, now: now(), paidAllowed });
  const candidates = [];
  const skipped = [];
  for (const c of ranked) {
    const entry = registry.models[c.ref];
    const budget = modelAttemptBudget(attempts, c.ref, maxSameModelAttempts);
    if (budget.exhausted) {
      skipped.push({
        ref: c.ref,
        state: 'MODEL_BUDGET_EXHAUSTED',
        reason: budget.terminal
          ? `budget terminal déjà consommé pour ce modèle (${budget.used} tentative(s), sécurité=${budget.safetyFailures})`
          : `budget de ${maxSameModelAttempts} tentative(s) déjà consommé pour ce modèle`,
      });
      continue;
    }
    if (entry && registryLib.isInCooldown(entry, now())) {
      skipped.push({
        ref: c.ref,
        state: 'MODEL_COOLDOWN',
        category: entry.lastFailureCategory || null,
        reason: `cooldown jusqu'au ${entry.cooldownUntil} (${entry.lastFailureCategory || 'indisponible'})`,
      });
      continue;
    }
    if (entry && entry.notBefore && Date.parse(entry.notBefore) > now()) {
      skipped.push({
        ref: c.ref,
        state: 'MODEL_DEFERRED',
        category: entry.lastFailureCategory || null,
        retryAt: entry.notBefore,
        reason: `deadline partagée jusqu'au ${entry.notBefore} (Retry-After/backoff)`,
      });
      continue;
    }
    const cached = registryLib.getAvailability(registry, c.ref, now());
    if (cached && cached.available === false) {
      skipped.push({
        ref: c.ref,
        state: 'MODEL_UNAVAILABLE',
        category: cached.category || null,
        reason: `disponibilité en cache=false jusqu'à ${cached.expiresAt} (${cached.reason || cached.category || 'indisponible'})`,
      });
      continue;
    }
    const providerEntry = registry.providers[c.provider] || null;
    const pStatus = registryLib.providerStatus(registry, c.provider, now());
    if (pStatus.state === 'open') {
      skipped.push({
        ref: c.ref,
        state: 'PROVIDER_CIRCUIT_OPEN',
        category: providerEntry && providerEntry.lastFailureCategory || null,
        retryAt: pStatus.retryAt || null,
        reason: `circuit fournisseur ${c.provider} ouvert jusqu'au ${pStatus.retryAt || '?'}`,
      });
      continue;
    }
    if (pStatus.notBefore && Date.parse(pStatus.notBefore) > now()) {
      skipped.push({
        ref: c.ref,
        state: 'PROVIDER_RATE_LIMITED',
        category: providerEntry && providerEntry.lastFailureCategory || null,
        retryAt: pStatus.notBefore,
        reason: `fournisseur ${c.provider} différé jusqu'au ${pStatus.notBefore} (Retry-After partagé)`,
      });
      continue;
    }
    candidates.push(c);
  }
  if (opts.preferredFirst && Array.isArray(opts.preferredFirst)) {
    // Les modèles explicitement listés restent prioritaires, mais ne peuvent
    // jamais contourner cooldown/cache/breaker. On réordonne UNIQUEMENT les
    // candidats déjà éligibles.
    const byRef = new Map(candidates.map((c) => [c.ref, c]));
    const eligible = new Set(byRef.keys());
    const head = opts.preferredFirst.filter((ref) => eligible.has(ref));
    const rest = candidates.filter((c) => !head.includes(c.ref));
    candidates.length = 0;
    candidates.push(...head.map((ref) => byRef.get(ref)).filter(Boolean), ...rest);
  }

  // --- Sondes de bascule (probe) ------------------------------------------
  // Une sonde est un modèle volontairement appelé EN PREMIER pour éprouver la
  // mécanique de bascule sur une VRAIE erreur de fournisseur. Elle est :
  //   - soit absente de l'inventaire → OpenCode répond « model not found »
  //     (aucun token consommé, coût 0) ;
  //   - soit présente dans l'inventaire → elle doit être gratuite, sinon
  //     elle est REFUSÉE (jamais de modèle payant sollicité).
  // Ce mécanisme ne sert qu'à la preuve/test : la production l'utilise pour
  // vérifier qu'une chaîne de secours est réellement branchée.
  const probeModels = (opts.cfg && opts.cfg.failover && opts.cfg.failover.probeModels)
    || (opts.cfg && opts.cfg.probeModels)
    || [];
  // Une sonde de coût inconnu exige une allowlist EXACTE de refs. Un simple
  // booléen autoriserait n'importe quel modèle payant absent de l'inventaire.
  const unknownCostProbeAllowlist = new Set([
    ...(Array.isArray(cfg.unknownCostProbeAllowlist) ? cfg.unknownCostProbeAllowlist : []),
    ...(Array.isArray(cfg.allowUnknownCostProbeRefs) ? cfg.allowUnknownCostProbeRefs : []),
    ...(Array.isArray(opts.cfg && opts.cfg.unknownCostProbeAllowlist) ? opts.cfg.unknownCostProbeAllowlist : []),
    ...(Array.isArray(opts.cfg && opts.cfg.allowUnknownCostProbeRefs) ? opts.cfg.allowUnknownCostProbeRefs : []),
  ]);
  const probeCandidates = [];
  for (const ref of (Array.isArray(probeModels) ? probeModels : [])) {
    // Une sonde déjà en cooldown n'est PAS re-sondée : elle aurait un coût
    // CPU inutile et pourrait marteler un fournisseur déjà connu comme HS.
    const probeEntry = registry.models[ref];
    const probeBudget = modelAttemptBudget(attempts, ref, maxSameModelAttempts);
    if (probeBudget.exhausted) {
      skipped.push({
        ref,
        state: 'MODEL_BUDGET_EXHAUSTED',
        reason: `budget de sonde déjà consommé (${probeBudget.used} tentative(s))`,
      });
      continue;
    }
    if (probeEntry && registryLib.isInCooldown(probeEntry, now())) {
      skipped.push({
        ref,
        state: 'MODEL_COOLDOWN',
        reason: `sonde déjà en cooldown jusqu'au ${probeEntry.cooldownUntil} (aucun nouveau sondage)`,
      });
      continue;
    }
    if (probeEntry && probeEntry.notBefore && Date.parse(probeEntry.notBefore) > now()) {
      skipped.push({
        ref,
        state: 'MODEL_DEFERRED',
        retryAt: probeEntry.notBefore,
        reason: `sonde differee jusqu'au ${probeEntry.notBefore}`,
      });
      continue;
    }
    // Recherche dans l'INVENTAIRE BRUT (pas dans le classement filtré) : un
    // modèle payant connu doit être refusé même s'il a été exclu du ranking.
    const knownRaw = (inventory.models || []).find((m) => m.ref === ref);
    const known = ranked.find((r) => r.ref === ref);
    if (knownRaw && !knownRaw.free && !paidAllowed) {
      skipped.push({ ref, state: 'PAID_MODEL_REFUSED', reason: 'sonde payante REFUSEE (cout non nul, paidAllowed=false)' });
      continue;
    }
    if (known) {
      const cached = registryLib.getAvailability(registry, ref, now());
      if (cached && cached.available === false) {
        skipped.push({ ref, state: 'MODEL_UNAVAILABLE', reason: `sonde indisponible dans le cache jusqu'au ${cached.expiresAt}` });
        continue;
      }
      const providerStatus = registryLib.providerStatus(registry, known.provider, now());
      if (providerStatus.state === 'open' || (providerStatus.notBefore && Date.parse(providerStatus.notBefore) > now())) {
        skipped.push({
          ref,
          state: providerStatus.state === 'open' ? 'PROVIDER_CIRCUIT_OPEN' : 'PROVIDER_RATE_LIMITED',
          retryAt: providerStatus.retryAt || providerStatus.notBefore || null,
          reason: `sonde bloquee par le fournisseur ${known.provider} (${providerStatus.reason})`,
        });
        continue;
      }
      probeCandidates.push(Object.assign({}, known, {
        score: 1000000,
        isProbe: true,
        reasons: (known.reasons || []).concat(['sonde de bascule (priorité forcée)']),
      }));
      continue;
    }
    if (knownRaw) {
      // Connu mais non éligible (statut non actif, sans outils, etc.) : on ne
      // le sonde pas — l'inventaire reste la source de vérité.
      skipped.push({ ref, state: 'MODEL_UNAVAILABLE', reason: 'sonde connue mais non eligible dans l\'inventaire' });
      continue;
    }
    if (!unknownCostProbeAllowlist.has(ref)) {
      skipped.push({
        ref,
        state: 'UNKNOWN_COST_REFUSED',
        reason: 'sonde absente de l\'inventaire : coût inconnu, refusée sans allowlist exacte de ref',
      });
      continue;
    }
    probeCandidates.push({
      ref,
      provider: String(ref).split('/')[0],
      name: ref,
      free: true,
      status: 'probe',
      cost: null,
      capabilities: null,
      limit: null,
      family: null,
      installed: null,
      score: 1000000,
      reasons: ['sonde hors inventaire (test explicite ; echec de resolution attendu)'],
      isProbe: true,
    });
  }
  if (probeCandidates.length) {
    const probeRefs = new Set(probeCandidates.map((p) => p.ref));
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (probeRefs.has(candidates[i].ref)) candidates.splice(i, 1);
    }
    candidates.unshift(...probeCandidates);
    log('FAILOVER_PROBES_ARMED', {
      probes: probeCandidates.map((p) => p.ref),
      skippedPaidProbes: skipped.filter((s) => s.state === 'PAID_MODEL_REFUSED'),
    });
  }
  const uniqueCandidates = [];
  const seenCandidateRefs = new Set();
  for (const c of candidates) {
    if (seenCandidateRefs.has(c.ref)) continue;
    seenCandidateRefs.add(c.ref);
    uniqueCandidates.push(c);
  }
  candidates.length = 0;
  candidates.push(...uniqueCandidates);

  log('FAILOVER_CANDIDATES', {
    candidates: candidates.map((c) => ({ ref: c.ref, provider: c.provider, score: c.score, reasons: c.reasons, isProbe: !!c.isProbe })),
    skipped,
  });

  const maxAttempts = Math.max(1, Number(cfg.maxModelSwitches || DEFAULTS.maxModelSwitches));
  const limit = Math.min(candidates.length, maxAttempts);

  /** Réserve un slot fournisseur sous verrou atomique ; attend brièvement. */
  const acquireProviderSlot = async (providerId) => {
    const deadline = now() + Math.max(0, Number(cfg.providerSlotWaitMs || 0));
    for (;;) {
      const slot = registryLib.updateRegistry(registryFile, (reg) => registryLib.acquireProviderSlot(
        reg,
        providerId,
        cfg.providerLimits,
        {
          leaseMs: providerAttemptLeaseMs,
          now: now(),
        },
      ));
      if (slot.ok) return slot;
      if (slot.state === 'open' || slot.state === 'rate_limited') return slot;
      if (now() >= deadline) return slot;
      await sleep(Math.min(250, Math.max(25, deadline - now())));
    }
  };

  for (let i = 0; i < limit; i++) {
    const cand = candidates[i];
    if (!distinctModelsUsed.has(cand.ref) && distinctModelsUsed.size >= maxAttempts) {
      skipped.push({
        ref: cand.ref,
        state: 'MODEL_SWITCH_BUDGET_EXHAUSTED',
        reason: `budget global de ${maxAttempts} modèle(s) distinct(s) consommé pour ce job`,
      });
      continue;
    }
    if (!cand.isProbe && cand.free !== true) {
      skipped.push({
        ref: cand.ref,
        state: 'PAID_MODEL_REFUSED',
        reason: 'modèle non prouvé gratuit — appel refusé avant le fournisseur',
      });
      continue;
    }
    const liveBeforeAcquire = registryLib.readRegistry(registryFile);
    const liveModel = liveBeforeAcquire.models[cand.ref];
    const liveProvider = liveBeforeAcquire.providers[cand.provider];
    const sharedDeadline = Math.max(
      Date.parse((liveModel && liveModel.notBefore) || '') || 0,
      Date.parse((liveProvider && liveProvider.notBefore) || '') || 0,
    );
    if (sharedDeadline > now()) {
      skipped.push({
        ref: cand.ref,
        state: 'MODEL_DEFERRED',
        category: (liveProvider && liveProvider.lastFailureCategory)
          || (liveModel && liveModel.lastFailureCategory)
          || null,
        retryAt: new Date(sharedDeadline).toISOString(),
        reason: `deadline partagee jusqu'au ${new Date(sharedDeadline).toISOString()}`,
      });
      log('[FAILOVER]', {
        message: `provider=${cand.provider} unavailable`,
        provider: cand.provider,
        ref: cand.ref,
        reason: 'shared_retry_deadline',
        retryAt: new Date(sharedDeadline).toISOString(),
      });
      continue;
    }
    const slot = await acquireProviderSlot(cand.provider);
    if (!slot.ok) {
      skipped.push({
        ref: cand.ref,
        state: slot.state === 'rate_limited' ? 'PROVIDER_RATE_LIMITED' : (slot.state === 'open' ? 'PROVIDER_CIRCUIT_OPEN' : 'PROVIDER_BUSY'),
        retryAt: slot.retryAt || null,
        reason: `slot fournisseur refuse : ${slot.reason}`,
      });
      log('[FAILOVER]', {
        message: `provider=${cand.provider} unavailable`,
        provider: cand.provider,
        ref: cand.ref,
        reason: slot.reason,
      });
      continue;
    }

    /**
     * Renouvelle le bail sous le même verrou atomique que l'acquisition.
     * Si le slot a disparu (course impossible avec un bail valide, ou registre
     * corrompu), on échoue explicitement plutôt que de lancer une requête non
     * bornée : aucune fausse concurrence ni faux succès.
     */
    const renewProviderSlot = async (leaseMs, reason) => {
      const durationMs = Math.max(30_000, Number(leaseMs) || providerAttemptLeaseMs);
      const renewed = registryLib.updateRegistry(registryFile, (reg) => registryLib.renewProviderSlot(
        reg,
        cand.provider,
        slot.token,
        durationMs,
      ));
      if (!renewed) {
        log('PROVIDER_SLOT_LEASE_LOST', {
          jobId: job.jobId,
          provider: cand.provider,
          ref: cand.ref,
          reason,
        });
        const error = new Error(`PROVIDER_SLOT_LEASE_LOST: ${cand.provider}`);
        error.code = 'PROVIDER_SLOT_LEASE_LOST';
        throw error;
      }
      log('PROVIDER_SLOT_RENEWED', {
        jobId: job.jobId,
        provider: cand.provider,
        ref: cand.ref,
        reason,
        leaseMs: durationMs,
      });
      return true;
    };

    try {
      const initialBudget = modelAttemptBudget(attempts, cand.ref, maxSameModelAttempts);
      let modelAttempt = initialBudget.used;
      while (modelAttempt < maxSameModelAttempts) {
        modelAttempt += 1;
        const liveBeforeAttempt = registryLib.readRegistry(registryFile);
        const liveModelEntry = liveBeforeAttempt.models[cand.ref];
        const liveProviderEntry = liveBeforeAttempt.providers[cand.provider];
        const attemptDeadline = Math.max(
          Date.parse((liveModelEntry && liveModelEntry.notBefore) || '') || 0,
          Date.parse((liveProviderEntry && liveProviderEntry.notBefore) || '') || 0,
        );
        if (attemptDeadline > now()) {
          skipped.push({
            ref: cand.ref,
            state: 'MODEL_DEFERRED',
            category: (liveProviderEntry && liveProviderEntry.lastFailureCategory)
              || (liveModelEntry && liveModelEntry.lastFailureCategory)
              || null,
            retryAt: new Date(attemptDeadline).toISOString(),
            reason: `nouvel appel differe jusqu'au ${new Date(attemptDeadline).toISOString()}`,
          });
          break;
        }
        // Chaque appel réel repart avec un bail couvrant son timeout complet.
        await renewProviderSlot(providerAttemptLeaseMs, 'attempt_start');
        const before = await gitState(repoCfg.local);
        const requestedResumeSession = sessionId;
        const resume = sessionId || attempts.length
          ? { attempts, git: before, sessionId }
          : null;
        const prompt = buildPrompt(job, repoCfg, resume);
        const promptFile = path.join(stateDir, 'prompts', `${job.jobId}.attempt${attempts.length + 1}.txt`);
        fs.mkdirSync(path.dirname(promptFile), { recursive: true });
        fs.writeFileSync(promptFile, prompt);

        const args = [
          ...((opts.cfg && opts.cfg.opencodePrefixArgs) || []),
          'run',
          '--dir', repoCfg.local,
          '-m', cand.ref,
          '--format', 'json',
          '--print-logs',
          '--log-level', 'INFO',
          '--title', `factory-${job.jobId}`,
        ];
        log('[MODEL]', {
          message: `requested=${cand.ref}`,
          jobId: job.jobId,
          requested: cand.ref,
          provider: cand.provider,
          modelAttempt,
          maxSameModelAttempts,
        });
        if (requestedResumeSession) {
          args.push('--session', requestedResumeSession);
        }
        args.push(prompt);

        log('MODEL_ATTEMPT_START', {
          jobId: job.jobId,
          ref: cand.ref,
          provider: cand.provider,
          score: cand.score,
          reasons: cand.reasons,
          resumedSession: sessionId,
          attempt: attempts.length + 1,
          modelAttempt,
          maxSameModelAttempts,
          maxAttempts: limit,
        });

        const started = now();
        // Write-ahead : la tentative est consommée et persistée AVANT l'appel
        // fournisseur. Si le runner meurt pendant OpenCode, le restart ne peut
        // pas dépasser le budget de 3 essais ni réautoriser le safety retry.
        const attempt = {
          ref: cand.ref,
          requestedModel: cand.ref,
          provider: cand.provider,
          isProbe: !!cand.isProbe,
          attemptNumber: attempts.length + 1,
          modelAttempt,
          outcome: 'in_progress',
          startedAt: new Date(started).toISOString(),
          promptFile,
        };
        distinctModelsUsed.add(cand.ref);
        attempts.push(attempt);
        persistContext(before);

        const r = await runProcess({
          file: opencodeBin,
          args,
          cwd: repoCfg.local,
          timeoutMs: cfg.agentTimeoutMs,
          idleTimeoutMs: cfg.agentIdleTimeoutMs,
        });
        const events = parseJsonl(r.stdout);
        const errorEvents = events.filter((e) => e.type === 'error');
        const finishEvents = events.filter((e) => e.type === 'step_finish');
        const observedSession = events.find((e) => e.sessionID) ? events.find((e) => e.sessionID).sessionID : null;
        const sessionResumed = !!(requestedResumeSession && observedSession === requestedResumeSession);
        if (sessionResumed) {
          resumes++;
          registryLib.updateRegistry(registryFile, (reg) => registryLib.recordResume(reg));
          log('[MODEL]', {
            message: 'execution_resumed=true',
            jobId: job.jobId,
            requested: cand.ref,
            sessionId: observedSession,
            executionResumed: true,
          });
        } else if (requestedResumeSession && observedSession && observedSession !== requestedResumeSession) {
          log('[MODEL]', {
            message: 'execution_resumed=false',
            jobId: job.jobId,
            requested: cand.ref,
            expectedSession: requestedResumeSession,
            observedSession,
            executionResumed: false,
            sessionMismatch: true,
          });
          sessionId = observedSession;
        } else if (observedSession && !sessionId) {
          sessionId = observedSession;
        }
        const verify = verifyModelUsed(
          r.stderr,
          cand.ref,
          observedSession || requestedResumeSession,
          cand.provider,
        );
        const providerVerified = verify.providerVerified === true;
        const modelVerified = verify.modelVerified === true;
        const sessionVerified = verify.sessionSeen === true;
        const resolvedModel = verify.observedModel || null;
        log('[MODEL]', {
          message: `resolved=${resolvedModel || 'UNVERIFIED'}`,
          jobId: job.jobId,
          requested: cand.ref,
          resolved: resolvedModel,
          observedProvider: verify.observedProvider,
          modelVerified,
          providerVerified,
          sessionVerified,
          evidenceRecord: verify.evidenceRecord,
          sessionId: observedSession || sessionId,
        });
        const cost = extractObservedCost(finishEvents);
        spend += cost;

        const after = await gitState(repoCfg.local);
        const sha = before.valid
          && after.valid
          && /^[0-9a-f]{40}$/i.test(after.head || '')
          && after.head !== before.head
          ? after.head
          : null;
        if (sha) committedSha = sha;

        const hasError = errorEvents.length > 0;
        const finished = finishEvents.length > 0;
        const textOut = events.filter((e) => e.type === 'text' && e.part && e.part.text).map((e) => e.part.text).join('\n');
        const executionSucceeded = !hasError
          && r.exitCode === 0
          && (finished || textOut.trim().length > 0)
          && !r.timedOut
          && !r.idleTimedOut;
        const completionMarker = hasCompletionMarker(textOut);
        let resultCheck = null;
        if (executionSucceeded && verifySpec) {
          resultCheck = verifyResult(repoCfg.local, verifySpec, {
            before: jobBaseline.before,
            after,
            beforeFiles: jobBaseline.beforeFiles,
          });
        }
        let success = executionSucceeded
          && completionMarker
          && modelVerified
          && providerVerified
          && sessionVerified
          && verify.verified
          && cost === 0
          && before.valid
          && after.valid
          && (!resultCheck || resultCheck.ok);
        if (executionSucceeded && (!resultCheck || !resultCheck.ok)) {
          log('RESULT_NOT_PRODUCED', {
            jobId: job.jobId,
            ref: cand.ref,
            completionMarker,
            modelVerified,
            gitValid: before.valid && after.valid,
            checks: resultCheck ? resultCheck.checks.filter((c) => !c.ok) : [],
          });
        }

        Object.assign(attempt, {
          resolvedModel,
          observedProvider: verify.observedProvider,
          outcome: success ? 'success' : 'failed',
          exitCode: r.exitCode,
          timedOut: r.timedOut,
          idleTimedOut: r.idleTimedOut,
          durationMs: r.durationMs,
          sessionId: observedSession || sessionId,
          sessionResumed,
          completionMarker,
          modelVerified,
          providerVerified,
          sessionSeen: sessionVerified,
          observedModel: verify.observedModel,
          evidenceRecord: verify.evidenceRecord,
          tokens: extractObservedTokens(finishEvents),
          cost,
          committedSha: sha,
          dirtyFiles: after.dirtyFiles,
          errorText: hasError ? JSON.stringify(errorEvents[0]).slice(0, 1200) : String(r.stderr || '').slice(-1200),
          outputTail: textOut.slice(-1500),
          resultCheck,
          stdoutFile: r.stdoutFile,
          stderrFile: r.stderrFile,
        });

        registryLib.updateRegistry(registryFile, (reg) => registryLib.recordAttempt(reg, cost));
        if (success) {
          attempt.category = null;
          attempt.reason = 'Réponse obtenue du modèle (exit 0).';
          registryLib.updateRegistry(registryFile, (reg) => {
            registryLib.recordSuccess(reg, cand.ref, { observedModel: verify.observedModel, cost });
            registryLib.recordProviderSuccess(reg, cand.provider);
            registryLib.recordAvailability(reg, cand.ref, {
              available: true,
              reason: 'exécution réelle réussie',
              ttlMs: cfg.availabilityCacheMs,
            });
          });
          log('MODEL_ATTEMPT_SUCCESS', {
            jobId: job.jobId,
            ref: cand.ref,
            modelVerified,
            observedModel: verify.observedModel,
            sessionId: attempt.sessionId,
            committedSha: sha,
            durationMs: r.durationMs,
            cost,
          });
          persistContext(after);
          return {
            ok: true,
            model: cand.ref,
            requestedModel: cand.ref,
            resolvedModel,
            provider: cand.provider,
            modelVerified: true,
            providerVerified: true,
            sessionSeen: true,
            completionMarker: true,
            finalResult: 'success',
            replacementModel,
            totalDurationMs: Math.max(0, now() - jobStartedAt),
            sessionId: attempt.sessionId,
            attempts,
            failovers,
            resumes,
            committedSha: committedSha || sha,
            commitVerified: !!(committedSha || sha) && isReachableCommit(repoCfg.local, committedSha || sha),
            dirtyFiles: after.dirtyFiles,
            interruptedWithCommit,
            skipped,
            spend,
            error: null,
            inventoryUpdatedAt: inventory.updatedAt,
          };
        }

        // --- Échec : classification ------------------------------------------
        const liveRegistryForFailure = registryLib.readRegistry(registryFile);
        const entry = liveRegistryForFailure.models[cand.ref] || { consecutiveFailures: 0 };
        let classification;
        if (cost !== 0) {
          const technicalCooldownMs = (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000;
          classification = {
            category: CATEGORY.COST_VIOLATION,
            switchModel: false,
            quotaType: 'none',
            cooldownMs: technicalCooldownMs,
            resetAt: new Date(now() + technicalCooldownMs).toISOString(),
            reason: `Coût observé non nul (${cost}) sur un modèle censé être gratuit — succès refusé, aucun nouvel appel ni achat.`,
            transient: false,
            providerLimited: false,
            modelSpecific: true,
            evidence: { cost, requestedModel: cand.ref, observedModel: verify.observedModel },
          };
        } else if (executionSucceeded && verify.observedProvider && verify.observedProvider !== cand.provider) {
          // Le fournisseur observé est DIFFÉRENT de celui demandé. C'est une
          // panne de routage/authentification fournisseur, pas une simple
          // dérive de modèle : le prochain candidat doit changer de fournisseur.
          classification = {
            category: CATEGORY.PROVIDER_MISMATCH,
            switchModel: true,
            quotaType: 'none',
            cooldownMs: (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000,
            resetAt: new Date(now() + ((cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000)).toISOString(),
            reason: `Fournisseur observe different du fournisseur demande (${verify.observedProvider} != ${cand.provider}) — aucun faux succes, failover fournisseur requis.`,
            transient: false,
            providerLimited: true,
            modelSpecific: false,
            evidence: {
              requestedModel: cand.ref,
              requestedProvider: cand.provider,
              observedModel: verify.observedModel,
              observedProvider: verify.observedProvider,
              modelVerified,
              providerVerified,
              sessionVerified,
            },
          };
        } else if (executionSucceeded && !modelVerified) {
          classification = {
            category: CATEGORY.MODEL_MISMATCH,
            switchModel: true,
            quotaType: 'none',
            cooldownMs: (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000,
            resetAt: new Date(now() + ((cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000)).toISOString(),
            reason: 'Modele observe different du modele demande — aucun faux succes, failover requis.',
            transient: false,
            providerLimited: false,
            modelSpecific: true,
            evidence: {
              requestedModel: cand.ref,
              requestedProvider: cand.provider,
              observedModel: verify.observedModel,
              observedProvider: verify.observedProvider,
              modelVerified,
              providerVerified,
              sessionVerified,
            },
          };
        } else if (executionSucceeded && !sessionVerified) {
          classification = {
            category: CATEGORY.RESULT_NOT_PRODUCED,
            switchModel: true,
            quotaType: 'none',
            cooldownMs: (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000,
            resetAt: new Date(now() + ((cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000)).toISOString(),
            reason: 'Session OpenCode non observee sur la ligne de preuve du modele — aucun faux succes, failover requis.',
            transient: false,
            providerLimited: false,
            modelSpecific: true,
            evidence: {
              requestedModel: cand.ref,
              requestedProvider: cand.provider,
              observedModel: verify.observedModel,
              observedProvider: verify.observedProvider,
              modelVerified,
              providerVerified,
              sessionVerified,
            },
          };
        } else if (executionSucceeded && (!completionMarker || !before.valid || !after.valid || (resultCheck && !resultCheck.ok))) {
          // Le modèle a répondu mais n'a PAS produit un résultat prouvable.
          classification = {
            category: CATEGORY.RESULT_NOT_PRODUCED,
            switchModel: true,
            quotaType: 'none',
            cooldownMs: (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000,
            resetAt: new Date(now() + ((cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000)).toISOString(),
            reason: 'Resultat attendu non produit (marqueur, Git ou contrat de resultat non prouve) — bascule requise.',
            transient: false,
            providerLimited: false,
            modelSpecific: true,
            evidence: {
              completionMarker,
              gitValid: before.valid && after.valid,
              checks: resultCheck ? resultCheck.checks : [],
            },
          };
        } else {
          classification = classifyFailure({
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
            events,
            timedOut: r.timedOut,
            idleTimedOut: r.idleTimedOut,
            consecutiveFailures: entry.consecutiveFailures || 0,
            cooldowns: cfg.cooldowns,
          });
        }
        // Une sonde hors inventaire n'est jamais rejouée. Son périmètre reste
        // toutefois celui de l'ERREUR RÉELLE : un modèle inexistant est propre
        // au modèle, mais une panne 429/5xx/auth reste une panne FOURNISSEUR.
        if (cand.isProbe) {
          classification.transient = false;
          if (classification.category === CATEGORY.MODEL_INVALID) {
            classification.modelSpecific = true;
            classification.providerLimited = false;
          } else if (retryPolicy.isProviderLimited(classification)) {
            classification.modelSpecific = false;
            classification.providerLimited = true;
          } else {
            classification.modelSpecific = true;
            classification.providerLimited = false;
          }
          classification.reason += ' (sonde : aucun retry sur ce modèle, failover direct)';
        }

        attempt.category = classification.category;
        attempt.reason = classification.reason;
        attempt.quotaType = classification.quotaType;
        attempt.cooldownUntil = classification.resetAt;
        attempt.httpStatus = classification.httpStatus != null ? classification.httpStatus : null;
        attempt.retryAfterMs = classification.retryAfterMs != null ? classification.retryAfterMs : null;
        attempt.knownResetAt = classification.knownResetAt || null;
        attempt.replacementModel = null;
        // Persister la catégorie avant toute décision de reprise : après un
        // crash, le budget safety/no-retry doit refléter l'échec observé.
        persistContext(after);

        const currentBudget = modelAttemptBudget(attempts, cand.ref, maxSameModelAttempts);
        const retryDecision = retryPolicy.decideRetry({
          classification,
          attempt: modelAttempt,
          safetyAttempt: currentBudget.safetyFailures,
          maxAttempts: maxSameModelAttempts,
          knownResetAt: classification.knownResetAt,
          now: now(),
          jitterRatio: cfg.jitterRatio,
          random: opts.random,
        });

        // Retry intelligent : on ne boucle que si l'erreur est transitoire ET que
        // le budget du même modèle n'est pas épuisé. Le délai Retry-After est
        // respecté strictement (sleep injectable pour les tests).
        if (retryDecision.retry) {
          attempt.replacementModel = cand.ref;
          attempt.retryScheduled = true;
          attempt.retryDelayMs = retryDecision.delayMs;
          attempt.retryReadyAt = new Date(now() + retryDecision.delayMs).toISOString();
          // Write-ahead du plan de reprise AVEC le registre : un crash entre
          // ces deux écritures ne peut plus perdre `retryReadyAt`.
          persistContext(after);
          registryLib.updateRegistry(registryFile, (reg) => registryLib.recordRetry(reg, cand.ref, {
            category: classification.category,
            delayMs: retryDecision.delayMs,
            retryAfterMs: classification.retryAfterMs,
            httpStatus: classification.httpStatus,
            providerId: cand.provider,
            now: now(),
            reason: retryDecision.reason,
          }));
          log('MODEL_RETRY_SCHEDULED', {
            jobId: job.jobId,
            ref: cand.ref,
            category: classification.category,
            httpStatus: classification.httpStatus,
            retryAfterMs: classification.retryAfterMs,
            delayMs: retryDecision.delayMs,
            modelAttempt,
            maxSameModelAttempts,
            reason: retryDecision.reason,
          });
          log('[MODEL]', {
            message: `retry=${cand.ref} delay_ms=${retryDecision.delayMs}`,
            jobId: job.jobId,
            requested: cand.ref,
            category: classification.category,
            httpStatus: classification.httpStatus,
            retryAfterMs: classification.retryAfterMs,
            delayMs: retryDecision.delayMs,
          });
          // Le délai fournisseur peut dépasser toutes les fenêtres usuelles. Le
          // bail est donc étendu pour couvrir l'attente STRICTE + la tentative
          // suivante ; sans cela un autre agent pourrait sonder pendant l'attente.
          await renewProviderSlot(providerAttemptLeaseMs + retryDecision.delayMs, 'retry_wait');
          await sleep(retryDecision.delayMs);
          continue;
        }

        registryLib.updateRegistry(registryFile, (reg) => {
          registryLib.recordFailure(reg, cand.ref, classification, {
            circuitThreshold: cfg.circuitThreshold,
            observedModel: verify.observedModel,
            now: now(),
          });
          registryLib.recordAvailability(reg, cand.ref, {
            available: false,
            reason: classification.reason,
            category: classification.category,
            ttlMs: Math.min(
              cfg.availabilityCacheMs || DEFAULTS.availabilityCacheMs,
              Math.max(60_000, Number(classification.cooldownMs || 0)),
            ),
          });
          if (retryPolicy.isProviderLimited(classification)) {
            registryLib.recordProviderFailure(reg, cand.provider, {
              category: classification.category,
              cooldownMs: classification.cooldownMs,
              resetAt: classification.resetAt,
              circuitThreshold: cfg.circuitThreshold,
              now: now(),
            });
          }
        });

        log('MODEL_ATTEMPT_FAILED', {
          jobId: job.jobId,
          ref: cand.ref,
          category: classification.category,
          quotaType: classification.quotaType,
          switchModel: classification.switchModel,
          cooldownUntil: classification.resetAt,
          httpStatus: classification.httpStatus,
          retryAfterMs: classification.retryAfterMs,
          modelAttempt,
          maxSameModelAttempts,
          reason: classification.reason,
          committedSha: sha,
        });

        persistContext(after);

        // La session native est CONSERVÉE après un échec fournisseur/quota : le
        // modèle de remplacement reprend le contexte via `--session` (et le
        // prompt contient de toute façon le handoff complet).
        if (sessionId && attempt.sessionId === sessionId && !success) {
          log('SESSION_CONTEXT_PRESERVED', { jobId: job.jobId, sessionId, ref: cand.ref });
        }

        // Le modèle a produit un commit avant l'interruption : on le conserve.
        if (sha && after.dirtyFiles === 0) {
          interruptedWithCommit = true;
          log('INTERRUPTED_BUT_COMMITTED', { jobId: job.jobId, ref: cand.ref, committedSha: sha });
        }

        // Erreur de code → pas de bascule (contrat P0).
        // Coût observé non nul → aucun nouvel appel : continuer risquerait un
        // second achat et ne doit jamais devenir une attente fournisseur.
        if (classification.category === CATEGORY.CODE_ERROR || classification.category === CATEGORY.COST_VIOLATION) {
          return {
            ok: false,
            model: cand.ref,
            requestedModel: cand.ref,
            resolvedModel,
            provider: cand.provider,
            modelVerified: false,
            providerVerified: false,
            sessionSeen: false,
            completionMarker: false,
            finalResult: 'failed',
            replacementModel: null,
            totalDurationMs: Math.max(0, now() - jobStartedAt),
            sessionId,
            attempts,
            failovers,
            resumes,
            committedSha: committedSha || sha,
            dirtyFiles: after.dirtyFiles,
            interruptedWithCommit,
            skipped,
            spend,
            error: classification.reason,
            errorCategory: classification.category,
            inventoryUpdatedAt: inventory.updatedAt,
          };
        }

        // Bascule vers le modèle suivant : autre fournisseur si le fournisseur
        // est limité, autre modèle du même fournisseur si le défaut est propre
        // au modèle, sinon classement normal.
        const next = chooseNextCandidate(candidates, i, cand, classification);
        if (next) {
          const nextIndex = candidates.findIndex((c) => c.ref === next.ref);
          if (nextIndex > i + 1) {
            const tmp = candidates[i + 1];
            candidates[i + 1] = candidates[nextIndex];
            candidates[nextIndex] = tmp;
          }
          replacementModel = next.ref;
          attempt.replacementModel = next.ref;
          // Une transition n'est comptabilisée que si un modèle SUIVANT existe
          // réellement. Le dernier échec terminal n'est pas un failover.
          failovers++;
          registryLib.updateRegistry(registryFile, (reg) => registryLib.recordFailover(reg, {
            from: cand.ref,
            to: next.ref,
            provider: cand.provider,
            category: classification.category,
          }));
        }
        log('[FAILOVER]', {
          message: `reason=${classification.category}`,
          jobId: job.jobId,
          reason: classification.category,
          from: cand.ref,
          httpStatus: classification.httpStatus,
          retryAfterMs: classification.retryAfterMs,
          modelAttempt,
        });
        if (retryPolicy.isProviderLimited(classification)) {
          log('[FAILOVER]', {
            message: `provider=${cand.provider} unavailable`,
            jobId: job.jobId,
            provider: cand.provider,
            unavailable: true,
            reason: classification.category,
          });
        }
        log('[FAILOVER]', {
          message: `next_model=${next ? next.ref : 'NONE'}`,
          jobId: job.jobId,
          nextModel: next ? next.ref : null,
          nextProvider: next ? next.provider : null,
        });
        log('MODEL_FAILOVER', {
          jobId: job.jobId,
          from: cand.ref,
          category: classification.category,
          httpStatus: classification.httpStatus,
          retryAfterMs: classification.retryAfterMs,
          next: next ? next.ref : null,
          contextPreserved: true,
          sessionReused: !!sessionId,
        });
        persistContext(after);
        break;
      }
    } finally {
      registryLib.updateRegistry(registryFile, (reg) => registryLib.releaseProviderSlot(reg, cand.provider, slot.token));
    }
  }

  // --- Tous les candidats ont échoué -------------------------------------
  const providerBlockedStates = new Set([
    'PROVIDER_CIRCUIT_OPEN',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_BUSY',
  ]);
  const quotaWaitCategories = new Set([CATEGORY.DAILY_QUOTA_EXHAUSTED]);
  const providerWaitCategories = new Set([
    CATEGORY.RATE_LIMITED,
    CATEGORY.PROVIDER_UNAVAILABLE,
    CATEGORY.AUTH_ERROR,
    CATEGORY.QUOTA_CREDIT,
  ]);
  const waitCategories = attempts
    .filter((a) => a.outcome === 'failed' && a.category)
    .map((a) => a.category)
    .concat(skipped.map((s) => {
      if (s.category) return s.category;
      if (providerBlockedStates.has(s.state)) return CATEGORY.PROVIDER_UNAVAILABLE;
      return null;
    }))
    .filter(Boolean);
  const candidateRefs = new Set(candidates.map((c) => c.ref));
  const coveredRefs = new Set([
    ...attempts.map((a) => a.ref),
    ...skipped.map((s) => s.ref),
  ].filter(Boolean));
  const allCandidatesCovered = candidateRefs.size === 0
    ? skipped.length > 0
    : [...candidateRefs].every((ref) => coveredRefs.has(ref));
  const onlyWaitableCategories = waitCategories.length > 0
    && waitCategories.every((category) => quotaWaitCategories.has(category) || providerWaitCategories.has(category));
  const hasProviderWait = waitCategories.some((category) => providerWaitCategories.has(category));
  const allInCooldown = allCandidatesCovered
    && onlyWaitableCategories
    && !hasProviderWait;
  const providerUnavailable = allCandidatesCovered
    && onlyWaitableCategories
    && hasProviderWait;
  const nextAvailableAt = [
    ...attempts.map((a) => a.cooldownUntil || a.retryReadyAt || a.reason).filter(Boolean),
    ...skipped.map((s) => s.retryAt || s.reason).filter(Boolean),
  ].join('; ') || null;
  const last = attempts[attempts.length - 1];
  const errorCategory = allInCooldown
    ? 'ALL_MODELS_IN_COOLDOWN'
    : (providerUnavailable ? 'ALL_MODELS_PROVIDER_UNAVAILABLE' : (last ? last.category : 'UNKNOWN'));
  return {
    ok: false,
    model: last ? last.ref : null,
    requestedModel: last ? last.requestedModel : null,
    resolvedModel: last ? last.resolvedModel : null,
    provider: last ? last.provider : null,
    modelVerified: false,
    providerVerified: false,
    sessionSeen: false,
    completionMarker: false,
    finalResult: 'failed',
    replacementModel,
    totalDurationMs: Math.max(0, now() - jobStartedAt),
    sessionId,
    attempts,
    failovers,
    resumes,
    committedSha,
    dirtyFiles: last ? last.dirtyFiles : 0,
    interruptedWithCommit,
    skipped,
    spend,
    error: allInCooldown
      ? `ALL_MODELS_IN_COOLDOWN: aucun modèle disponible actuellement (${nextAvailableAt})`
      : (providerUnavailable
        ? `ALL_MODELS_PROVIDER_UNAVAILABLE: aucun fournisseur disponible actuellement (${nextAvailableAt})`
        : `ALL_MODELS_FAILED: ${last ? last.ref + ' — ' + (last.reason || last.category) : 'aucun candidat'}`),
    errorCategory,
    inventoryUpdatedAt: inventory.updatedAt,
  };
}

module.exports = {
  DEFAULTS,
  mergeDeep,
  parseJsonl,
  observedCostValue,
  extractObservedCost,
  extractObservedTokens,
  verifyModelUsed,
  verifyResult,
  gitState,
  buildPrompt,
  chooseNextCandidate,
  contextFile,
  saveContext,
  loadContext,
  executeJobWithFailover,
};

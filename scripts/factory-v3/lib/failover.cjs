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
const { execSync } = require('child_process');

const { runProcess, runShell, resolveOpencodeBin } = require('./exec.cjs');
const inventoryLib = require('./inventory.cjs');
const registryLib = require('./model-registry.cjs');
const { classifyFailure, CATEGORY } = require('./error-classifier.cjs');

const DEFAULTS = {
  maxModelSwitches: 4,
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

/** Compare le modèle observé dans les logs OpenCode au modèle demandé. */
function verifyModelUsed(stderrText, requestedRef, sessionId) {
  const text = String(stderrText || '');
  const modelIds = [];
  const providers = [];
  let matchedSession = null;
  const reModel = /\bmodelID=([^\s]+)/g;
  const reLlmModel = /\bllm\.model=([^\s]+)/g;
  const reProvider = /\bproviderID=([^\s]+)|\bllm\.provider=([^\s]+)/g;
  const reSession = /\bsession\.id=([^\s]+)/g;
  let m;
  while ((m = reModel.exec(text))) modelIds.push(m[1]);
  while ((m = reLlmModel.exec(text))) modelIds.push(m[1]);
  while ((m = reProvider.exec(text))) providers.push(m[1] || m[2]);
  while ((m = reSession.exec(text))) {
    if (!sessionId || m[1] === sessionId) { matchedSession = m[1]; break; }
  }
  const requestedId = requestedRef.includes('/') ? requestedRef.split('/').slice(1).join('/') : requestedRef;
  const observed = modelIds.length ? modelIds[modelIds.length - 1] : null;
  const verified = !!observed && (observed === requestedRef || observed === requestedId);
  return { observedModel: observed, observedProvider: providers.length ? providers[providers.length - 1] : null, verified, sessionSeen: matchedSession, modelIds };
}

function gitState(repoPath) {
  return (async () => {
    const head = await runShell('git rev-parse HEAD', { cwd: repoPath, timeoutMs: 30000 });
    const status = await runShell('git status --porcelain -uall', { cwd: repoPath, timeoutMs: 30000 });
    const stat = await runShell('git diff --stat', { cwd: repoPath, timeoutMs: 30000 });
    const last = await runShell('git log -1 --format=%H%x20%s', { cwd: repoPath, timeoutMs: 30000 });
    const dirty = String(status.stdout || '').split(/\r?\n/).filter((l) => l.trim().length);
    return {
      head: String(head.stdout || '').trim(),
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
function verifyResult(repoPath, spec) {
  const checks = [];
  if (!spec) return { ok: true, checks };

  const fileList = Array.isArray(spec.requiredFiles) ? spec.requiredFiles : [];
  for (const f of fileList) {
    const target = path.resolve(repoPath, f.path);
    const exists = fs.existsSync(target);
    let contains = null;
    if (exists && f.contains != null) {
      try {
        contains = fs.readFileSync(target, 'utf8').includes(f.contains);
      } catch (_) {
        contains = false;
      }
    }
    const ok = exists && (contains === null || contains === true);
    checks.push({
      id: `file:${f.path}`,
      ok,
      detail: !exists
        ? 'fichier absent'
        : (contains === false ? `contenu attendu « ${f.contains} » absent` : 'présent'),
    });
  }

  if (spec.requireCommit) {
    let log = '';
    try {
      log = execSync('git -C ' + JSON.stringify(repoPath) + ' log --oneline -5', { encoding: 'utf8' });
    } catch (_) {
      log = '';
    }
    const hasCommit = /\S/.test(log);
    checks.push({ id: 'commit', ok: hasCommit, detail: hasCommit ? 'commit(s) présent(s)' : 'aucun commit' });
  }

  if (spec.requireCleanTree) {
    let status = '';
    try {
      status = execSync('git -C ' + JSON.stringify(repoPath) + ' status --porcelain -uall', { encoding: 'utf8' });
    } catch (_) {
      status = '';
    }
    const clean = !status.trim();
    checks.push({ id: 'clean-tree', ok: clean, detail: clean ? 'arbre propre' : 'modifications non commitées' });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

function saveContext(stateDir, jobId, ctx) {
  const file = contextFile(stateDir, jobId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2));
  fs.renameSync(tmp, file);
}

function loadContext(stateDir, jobId) {
  try {
    return JSON.parse(fs.readFileSync(contextFile(stateDir, jobId), 'utf8'));
  } catch (_) {
    return null;
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

/**
 * Exécute un job avec bascule automatique de modèle.
 */
async function executeJobWithFailover(opts = {}) {
  const { stateDir, job, repoCfg } = opts;
  const cfg = mergeDeep(DEFAULTS, opts.cfg && opts.cfg.failover ? opts.cfg.failover : opts.cfg);
  const preferred = (opts.cfg && opts.cfg.models) || [];
  const opencodeBin = resolveOpencodeBin((opts.cfg && opts.cfg.opencodeBin) || 'opencode');
  const paidAllowed = !!(opts.cfg && opts.cfg.paidAllowed);
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;

  const registryFile = path.join(stateDir, 'model-registry.json');
  const inventoryFile = path.join(stateDir, 'inventory.json');
  const registry = registryLib.readRegistry(registryFile);

  const restored = registryLib.updateRegistry(registryFile, (reg) => registryLib.expireCooldowns(reg, now()));
  if (restored.length) log('MODEL_REINSTATED', { models: restored });

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
    if (entry && registryLib.isInCooldown(entry, now())) {
      skipped.push({
        ref: c.ref,
        reason: `cooldown jusqu'au ${entry.cooldownUntil} (${entry.lastFailureCategory || 'indisponible'})`,
      });
      continue;
    }
    candidates.push(c);
  }
  if (opts.preferredFirst && Array.isArray(opts.preferredFirst)) {
    // Les modèles explicitement listés dans la config restent prioritaires
    // (ordre de mission), mais seulement s'ils sont dans l'inventaire vérifié.
    const known = new Set(ranked.map((r) => r.ref));
    const head = opts.preferredFirst.filter((ref) => known.has(ref));
    const rest = candidates.filter((c) => !head.includes(c.ref));
    candidates.length = 0;
    candidates.push(...head.map((ref) => ranked.find((r) => r.ref === ref)), ...rest);
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
  const probeCandidates = [];
  for (const ref of (Array.isArray(probeModels) ? probeModels : [])) {
    // Recherche dans l'INVENTAIRE BRUT (pas dans le classement filtré) : un
    // modèle payant connu doit être refusé même s'il a été exclu du ranking.
    const knownRaw = (inventory.models || []).find((m) => m.ref === ref);
    const known = ranked.find((r) => r.ref === ref);
    if (knownRaw && !knownRaw.free && !paidAllowed) {
      skipped.push({ ref, reason: 'sonde payante REFUSÉE (coût non nul, paidAllowed=false)' });
      continue;
    }
    if (known) {
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
      skipped.push({ ref, reason: 'sonde connue mais non éligible dans l\'inventaire' });
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
      reasons: ['sonde hors inventaire (échec attendu du fournisseur, coût 0)'],
      isProbe: true,
    });
  }
  if (probeCandidates.length) {
    candidates.unshift(...probeCandidates);
    log('FAILOVER_PROBES_ARMED', {
      probes: probeCandidates.map((p) => p.ref),
      skippedPaidProbes: skipped.filter((s) => /sonde payante/.test(s.reason)),
    });
  }

  log('FAILOVER_CANDIDATES', {
    candidates: candidates.map((c) => ({ ref: c.ref, provider: c.provider, score: c.score, reasons: c.reasons, isProbe: !!c.isProbe })),
    skipped,
  });

  const attempts = [];
  let sessionId = null;
  let committedSha = null;
  let interruptedWithCommit = false;
  let spend = 0;
  let failovers = 0;
  let resumes = 0;

  const maxAttempts = Math.max(1, Number(cfg.maxModelSwitches || DEFAULTS.maxModelSwitches));
  const limit = Math.min(candidates.length, maxAttempts);

  for (let i = 0; i < limit; i++) {
    const cand = candidates[i];
    const before = await gitState(repoCfg.local);
    const resume = sessionId || attempts.length
      ? { attempts, git: before, sessionId }
      : null;
    const prompt = buildPrompt(job, repoCfg, resume);
    const promptFile = path.join(stateDir, 'prompts', `${job.jobId}.attempt${i + 1}.txt`);
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
    if (sessionId) {
      args.push('--session', sessionId);
      resumes++;
      registryLib.updateRegistry(registryFile, (reg) => registryLib.recordResume(reg));
    }
    args.push(prompt);

    log('MODEL_ATTEMPT_START', {
      jobId: job.jobId,
      ref: cand.ref,
      provider: cand.provider,
      score: cand.score,
      reasons: cand.reasons,
      resumedSession: sessionId,
      attempt: i + 1,
      maxAttempts: limit,
    });

    const started = now();
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
    if (observedSession && !sessionId) sessionId = observedSession;
    const verify = verifyModelUsed(r.stderr, cand.ref, observedSession || sessionId);
    const cost = finishEvents.reduce((acc, e) => acc + Number((e.cost || 0)), 0);
    spend += cost;

    const after = await gitState(repoCfg.local);
    const sha = after.head && after.head !== before.head ? after.head : null;
    if (sha) committedSha = sha;

    const hasError = errorEvents.length > 0;
    const finished = finishEvents.length > 0;
    const textOut = events.filter((e) => e.type === 'text' && e.part && e.part.text).map((e) => e.part.text).join('\n');
    let success = !hasError && r.exitCode === 0 && (finished || textOut.trim().length > 0) && !r.timedOut && !r.idleTimedOut;

    // --- Vérification du résultat RÉELLEMENT produit ----------------------
    // Un modèle peut déclarer « j'ai commité » sans l'avoir fait. Si le job
    // porte un contrat de résultat, on le vérifie dans l'arbre de travail :
    // échec → ce n'est PAS un succès → on bascule vers le modèle suivant.
    const verifySpec = (job && job.verify) || (cfg && cfg.verifyResult) || null;
    let resultCheck = null;
    if (success && verifySpec) {
      resultCheck = verifyResult(repoCfg.local, verifySpec);
      if (!resultCheck.ok) {
        success = false;
        log('RESULT_NOT_PRODUCED', {
          jobId: job.jobId,
          ref: cand.ref,
          checks: resultCheck.checks.filter((c) => !c.ok),
        });
      }
    }

    const attempt = {
      ref: cand.ref,
      provider: cand.provider,
      isProbe: !!cand.isProbe,
      outcome: success ? 'success' : 'failed',
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      idleTimedOut: r.idleTimedOut,
      durationMs: r.durationMs,
      sessionId: observedSession || sessionId,
      modelVerified: verify.verified,
      observedModel: verify.observedModel,
      observedProvider: verify.observedProvider,
      tokens: finishEvents.reduce((acc, e) => acc + Number((e.tokens && e.tokens.total) || 0), 0),
      cost,
      committedSha: sha,
      dirtyFiles: after.dirtyFiles,
      errorText: hasError ? JSON.stringify(errorEvents[0]).slice(0, 1200) : String(r.stderr || '').slice(-1200),
      outputTail: textOut.slice(-1500),
      resultCheck,
      stdoutFile: r.stdoutFile,
      stderrFile: r.stderrFile,
      promptFile,
    };

    registryLib.updateRegistry(registryFile, (reg) => registryLib.recordAttempt(reg));
    if (success) {
      attempt.category = null;
      attempt.reason = 'Réponse obtenue du modèle (exit 0).';
      registryLib.updateRegistry(registryFile, (reg) => {
        registryLib.recordSuccess(reg, cand.ref, { observedModel: verify.observedModel, cost });
      });
      attempts.push(attempt);
      log('MODEL_ATTEMPT_SUCCESS', {
        jobId: job.jobId,
        ref: cand.ref,
        modelVerified: verify.verified,
        observedModel: verify.observedModel,
        sessionId: attempt.sessionId,
        committedSha: sha,
        durationMs: r.durationMs,
        cost,
      });
      saveContext(stateDir, job.jobId, { jobId: job.jobId, attempts, git: after, sessionId, updatedAt: new Date().toISOString() });
      return {
        ok: true,
        model: cand.ref,
        sessionId: attempt.sessionId,
        attempts,
        failovers,
        resumes,
        committedSha: sha,
        dirtyFiles: after.dirtyFiles,
        interruptedWithCommit: false,
        skipped,
        spend,
        error: null,
        inventoryUpdatedAt: inventory.updatedAt,
      };
    }

    // --- Échec : classification ------------------------------------------
    const entry = registry.models[cand.ref] || { consecutiveFailures: 0 };
    let classification;
    if (resultCheck && !resultCheck.ok) {
      // Le modèle a répondu mais n'a PAS produit le résultat attendu
      // (faux succès). Ce n'est pas une erreur de code : on bascule.
      classification = {
        category: 'RESULT_NOT_PRODUCED',
        switchModel: true,
        quotaType: 'none',
        cooldownMs: (cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000,
        resetAt: new Date(Date.now() + ((cfg.cooldowns && cfg.cooldowns.technicalMs) || 2 * 60 * 1000)).toISOString(),
        reason: 'Résultat attendu non produit (le modèle a répondu sans exécuter) — bascule requise.',
        evidence: { checks: resultCheck.checks },
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
    attempt.category = classification.category;
    attempt.reason = classification.reason;
    attempt.quotaType = classification.quotaType;
    attempt.cooldownUntil = classification.resetAt;
    attempts.push(attempt);

    registryLib.updateRegistry(registryFile, (reg) => {
      registryLib.recordFailure(reg, cand.ref, classification, {
        circuitThreshold: cfg.circuitThreshold,
        observedModel: verify.observedModel,
      });
    });

    log('MODEL_ATTEMPT_FAILED', {
      jobId: job.jobId,
      ref: cand.ref,
      category: classification.category,
      quotaType: classification.quotaType,
      switchModel: classification.switchModel,
      cooldownUntil: classification.resetAt,
      reason: classification.reason,
      committedSha: sha,
    });

    saveContext(stateDir, job.jobId, { jobId: job.jobId, attempts, git: after, sessionId, updatedAt: new Date().toISOString() });

    // Reprise de session inutilisable : si la tentative reprise (avec
    // `--session`) a échoué, on abandonne la session pour les tentatives
    // suivantes (le CONTEXTE est de toute façon transmis dans le prompt).
    if (sessionId && attempt.sessionId === sessionId && !success) {
      log('SESSION_RESUME_DROPPED', { jobId: job.jobId, sessionId, ref: cand.ref });
      sessionId = null;
    }

    // Le modèle a produit un commit avant l'interruption : on le conserve.
    if (sha && after.dirtyFiles === 0) {
      interruptedWithCommit = true;
      log('INTERRUPTED_BUT_COMMITTED', { jobId: job.jobId, ref: cand.ref, committedSha: sha });
    }

    // Erreur de code → pas de bascule (contrat P0).
    if (classification.category === CATEGORY.CODE_ERROR) {
      return {
        ok: false,
        model: cand.ref,
        sessionId,
        attempts,
        failovers,
        resumes,
        committedSha: sha,
        dirtyFiles: after.dirtyFiles,
        interruptedWithCommit,
        skipped,
        spend,
        error: classification.reason,
        errorCategory: classification.category,
        inventoryUpdatedAt: inventory.updatedAt,
      };
    }

    // Bascule vers le modèle suivant.
    failovers++;
    registryLib.updateRegistry(registryFile, (reg) => registryLib.recordFailover(reg));
    log('MODEL_FAILOVER', {
      jobId: job.jobId,
      from: cand.ref,
      category: classification.category,
      next: candidates[i + 1] ? candidates[i + 1].ref : null,
      contextPreserved: true,
      sessionReused: !!sessionId,
    });
  }

  // --- Tous les candidats ont échoué -------------------------------------
  const allInCooldown = candidates.length === 0 && skipped.length > 0;
  const nextAvailableAt = skipped.length
    ? skipped.map((s) => s.reason).join('; ')
    : null;
  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    model: last ? last.ref : null,
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
      : `ALL_MODELS_FAILED: ${last ? last.ref + ' — ' + (last.reason || last.category) : 'aucun candidat'}`,
    errorCategory: allInCooldown ? 'ALL_MODELS_IN_COOLDOWN' : (last ? last.category : 'UNKNOWN'),
    inventoryUpdatedAt: inventory.updatedAt,
  };
}

module.exports = {
  DEFAULTS,
  mergeDeep,
  parseJsonl,
  verifyModelUsed,
  verifyResult,
  gitState,
  buildPrompt,
  contextFile,
  saveContext,
  loadContext,
  executeJobWithFailover,
};

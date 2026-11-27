#!/usr/bin/env node
'use strict';
/**
 * Factory V3 — Tableau de bord d'observabilité (failover / quotas).
 *
 * Affiche : modèle courant par agent, fournisseur, disponibilité, quota épuisé,
 * nombre de bascules, dernier changement de modèle, modèle de secours,
 * tâches reprises automatiquement, agents bloqués, dépense (toujours 0 sans
 * autorisation explicite).
 *
 * Usage : node scripts/factory-v3/dashboard.cjs [--state-dir <chemin>] [--json]
 */

const fs = require('fs');
const path = require('path');

const registryLib = require('./lib/model-registry.cjs');

const STATE_DIR_DEFAULT = path.resolve(__dirname, 'state');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function validateQueue(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.jobs)) {
    const error = new Error(`QUEUE_CORRUPT: structure invalide (${source})`);
    error.code = 'QUEUE_CORRUPT';
    throw error;
  }
  for (const job of raw.jobs) {
    if (!job || typeof job !== 'object' || Array.isArray(job)
      || typeof job.jobId !== 'string' || typeof job.repo !== 'string' || typeof job.status !== 'string') {
      const error = new Error(`QUEUE_CORRUPT: job invalide (${source})`);
      error.code = 'QUEUE_CORRUPT';
      throw error;
    }
  }
  return raw;
}

function readQueueForDashboard(stateDir) {
  const file = path.join(stateDir, 'queue.json');
  if (!fs.existsSync(file)) return { version: 2, updatedAt: null, jobs: [] };
  try {
    return validateQueue(JSON.parse(fs.readFileSync(file, 'utf8')), file);
  } catch (primaryError) {
    const backup = `${file}.bak`;
    try {
      return validateQueue(JSON.parse(fs.readFileSync(backup, 'utf8')), backup);
    } catch (backupError) {
      const error = new Error(`QUEUE_CORRUPT: ${file}`);
      error.code = 'QUEUE_CORRUPT';
      error.cause = primaryError;
      error.backupCause = backupError;
      throw error;
    }
  }
}

function readSessionRegistryForDashboard(stateDir) {
  const file = path.join(stateDir, 'observer', 'SESSION_REGISTRY.json');
  if (!fs.existsSync(file)) {
    return { present: false, note: 'registre absent — lancer scripts/factory-v3/session-registry.cjs' };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.counts || !Array.isArray(raw.entries)) {
      return { present: true, healthy: false, error: 'SESSION_REGISTRY_CORRUPT' };
    }
    return {
      present: true,
      healthy: true,
      error: null,
      generatedAt: raw.generatedAt,
      counts: raw.counts,
      errors: Array.isArray(raw.errors) ? raw.errors : [],
      entries: raw.entries.map((e) => ({
        kind: e.kind,
        id: e.id,
        state: e.state,
        reason: e.reason,
        repo: e.repo || null,
        branch: e.branch || null,
        lastActivityAt: e.lastActivityAt || null,
        sessionId: e.sessionId || null,
        resolvedModel: e.resolvedModel || e.requestedModel || null,
        provider: e.provider || null,
        spend: e.spend != null ? e.spend : null,
        committedSha: e.committedSha || null,
        stale: !!e.stale,
      })),
    };
  } catch (error) {
    return { present: true, healthy: false, error: `SESSION_REGISTRY_UNREADABLE: ${String(error && error.message || error)}` };
  }
}

function readObserverForDashboard(stateDir) {
  const dir = path.join(stateDir, 'observer');
  const current = readJson(path.join(dir, 'CURRENT_STATE.json'), null);
  const tests = readJson(path.join(dir, 'TEST_RESULTS.json'), null);
  const blockers = readJson(path.join(dir, 'BLOCKERS.json'), null);
  const nextActions = readJson(path.join(dir, 'NEXT_ACTIONS.json'), null);
  if (!current && !tests && !blockers && !nextActions) {
    return { present: false, note: 'observateur absent — lancer scripts/factory-v3/observer.cjs' };
  }
  const results = tests && Array.isArray(tests.results) ? tests.results : [];
  const latestTest = results.length ? results[results.length - 1] : null;
  const openBlockers = blockers && Array.isArray(blockers.blockers)
    ? blockers.blockers.filter((b) => !b.resolved)
    : [];
  return {
    present: true,
    healthy: !!current,
    error: current ? null : 'CURRENT_STATE_UNREADABLE',
    generatedAt: current ? current.generatedAt : null,
    branch: current ? current.branch : null,
    head: current ? current.head : null,
    remoteHead: current ? current.remoteHead : null,
    ahead: current ? current.ahead : null,
    behind: current ? current.behind : null,
    lastCommitAt: current ? current.lastCommitAt : null,
    localChanges: current ? current.localChanges : null,
    dernierTest: latestTest ? { at: latestTest.ts, command: latestTest.command, ok: !!latestTest.ok } : null,
    blocagesOuverts: blockers ? openBlockers.length : null,
    prochainesActions: nextActions && Array.isArray(nextActions.actions) ? nextActions.actions.length : null,
  };
}

function buildDashboard(stateDir) {
  let registry = null;
  let registryError = null;
  try {
    registry = registryLib.readRegistry(path.join(stateDir, 'model-registry.json'));
  } catch (error) {
    registryError = {
      code: error && error.code || 'MODEL_REGISTRY_UNREADABLE',
      message: String(error && error.message || error),
    };
  }
  if (!registry) registry = registryLib.emptyRegistry();

  let queue = { jobs: [] };
  let queueError = null;
  try {
    queue = readQueueForDashboard(stateDir);
  } catch (error) {
    queueError = {
      code: error && error.code || 'QUEUE_UNREADABLE',
      message: String(error && error.message || error),
    };
  }

  const inventory = readJson(path.join(stateDir, 'inventory.json'), null);
  const now = Date.now();

  const models = Object.values(registry.models || {}).map((m) => {
    const cached = registryLib.getAvailability(registry, m.model, now);
    const provider = registry.providers && registry.providers[m.provider];
    const providerStatus = provider
      ? registryLib.providerStatus(registry, m.provider, now)
      : { available: true, state: 'unknown', retryAt: null, notBefore: null };
    const quotaResetAt = m.quota && m.quota.resetAt ? Date.parse(m.quota.resetAt) : NaN;
    const quotaActive = !!(m.quota && m.quota.type && m.quota.type !== 'none'
      && (!Number.isFinite(quotaResetAt) || quotaResetAt > now));
    const modelCooldown = !!(m.cooldownUntil && Date.parse(m.cooldownUntil) > now);
    const modelDeferred = !!(m.notBefore && Date.parse(m.notBefore) > now);
    const cacheUnavailable = !!(cached && cached.available === false);
    const circuitOpen = m.status === 'circuit_open' || providerStatus.state === 'open';
    const available = !modelCooldown && !modelDeferred && !cacheUnavailable
      && !quotaActive && !circuitOpen && providerStatus.available !== false;
    const statut = modelCooldown || modelDeferred
      ? 'cooldown'
      : (circuitOpen ? 'circuit_ouvert' : (m.verifiedByUse ? 'validé' : (m.status || 'inconnu')));
    return {
      model: m.model,
      provider: m.provider,
      statut,
      disponible: available,
      indisponibilite: cacheUnavailable ? 'cache' : (modelCooldown ? 'cooldown' : (modelDeferred ? 'deadline' : (quotaActive ? 'quota' : (circuitOpen ? 'circuit' : null)))),
      cacheJusqua: cached ? cached.expiresAt : null,
      fournisseurEtat: providerStatus.state,
      fournisseurCooldown: provider ? provider.cooldownUntil : null,
      fournisseurNextAllowed: providerStatus.notBefore || providerStatus.retryAt || null,
      quotaEpuisé: quotaActive,
      quotaType: quotaActive ? m.quota.type : null,
      quotaResetAt: quotaActive ? m.quota.resetAt : null,
      cooldownJusqua: m.cooldownUntil,
      nextAllowed: m.notBefore || null,
      echecsConsecutifs: m.consecutiveFailures,
      retries: m.totalRetries || 0,
      dernierResultat: m.lastResult,
      derniereTentative: m.lastAttemptAt,
      dernierSucces: m.lastSuccessAt,
      modeleObserve: m.observedModel,
      gratuit: m.free === true,
    };
  }).sort((a, b) => String(a.model).localeCompare(String(b.model)));

  const providers = Object.values(registry.providers || {}).map((p) => {
    const status = registryLib.providerStatus(registry, p.provider, now);
    return {
      fournisseur: p.provider,
      etat: status.state,
      disponible: status.available,
      raison: status.reason,
      echecsConsecutifs: p.consecutiveFailures,
      cooldownJusqua: p.cooldownUntil,
      nextAllowed: status.notBefore || status.retryAt || null,
      requetesSimultanees: status.inFlight,
      limiteSimultanee: status.limit,
      picSimultaneite: p.peakInFlight || 0,
      dernierEchec: p.lastFailureAt,
      derniereCategorie: p.lastFailureCategory,
    };
  }).sort((a, b) => String(a.fournisseur).localeCompare(String(b.fournisseur)));

  const agents = (queue.jobs || []).map((j) => {
    const evidence = j.evidence || null;
    const agent = evidence && evidence.agent ? evidence.agent : null;
    const attempts = (agent && agent.attempts) || [];
    const last = attempts[attempts.length - 1] || null;
    const success = [...attempts].reverse().find((a) => a.outcome === 'success') || null;
    return {
      jobId: j.jobId,
      repo: j.repo,
      statutJob: j.status,
      modeleCourant: last ? last.ref : null,
      modeleObserve: last ? last.observedModel : null,
      fournisseur: last ? last.provider : null,
      fournisseurObserve: last ? last.observedProvider : null,
      modeleVerifie: last ? !!last.modelVerified : null,
      fournisseurVerifie: last ? last.providerVerified === true : null,
      quotaEpuisé: last ? !!(last.quotaType && last.quotaType !== 'none') : false,
      bascules: agent ? agent.failovers || 0 : 0,
      reprises: agent ? agent.resumes || 0 : 0,
      dernierChangement: last ? last.startedAt || last.ref : null,
      modeleSecours: attempts.length > 1
        ? (attempts.find((a) => a.replacementModel && a.replacementModel !== a.ref) || {}).replacementModel || last.ref
        : null,
      tentatives: attempts.length,
      dernierVerdict: evidence ? evidence.verdict : null,
      attente: j.status === 'PENDING' && !!(j.quotaWait || j.providerWait),
      quotaWait: !!j.quotaWait,
      providerWait: !!j.providerWait,
      prochaineReprise: j.nextRetryAt || null,
      commit: agent ? agent.committedSha || (success && success.committedSha) || null : null,
      bloque: j.status === 'BLOCKED' || j.status === 'PARKED' || j.status === 'RUNNING',
    };
  });

  const blocked = agents.filter((a) => a.bloque && a.statutJob !== 'RUNNING');
  const running = agents.filter((a) => a.statutJob === 'RUNNING');

  const sessions = readSessionRegistryForDashboard(stateDir);
  const observer = readObserverForDashboard(stateDir);

  return {
    generatedAt: new Date().toISOString(),
    registryHealthy: !registryError,
    registryError,
    queueHealthy: !queueError,
    queueError,
    stats: {
      bascules: registry.stats.failovers || 0,
      reprisesAutomatiques: registry.stats.resumes || 0,
      evenementsQuota: registry.stats.quotaEvents || 0,
      tentatives: registry.stats.attempts || 0,
      succes: registry.stats.successes || 0,
      echecs: registry.stats.failures || 0,
      retries: registry.stats.retries || 0,
      dernierChangement: registry.stats.lastFailoverAt || null,
      depense: Number(registry.stats.spend || 0),
      depenseAutorisee: false,
    },
    inventaire: inventory
      ? { maj: inventory.updatedAt, decouverts: inventory.counts.discovered, eligibles: inventory.counts.eligible, gratuits: inventory.counts.free, fournisseurs: inventory.authProviders }
      : null,
    modeles: models,
    fournisseurs: providers,
    agents,
    agentsEnCours: running.map((r) => r.jobId),
    agentsBloques: blocked.map((b) => ({ jobId: b.jobId, statut: b.statutJob, verdict: b.dernierVerdict })),
    sessions,
    observer,
    // Distinction exigée par la mission : activité ≠ progression ≠ résultat ≠ validation.
    preuves: {
      definition: {
        activite: 'dernier événement observé (fichier, session, heartbeat) — ne prouve RIEN',
        progression: 'travail produit réel (fichiers modifiés, commits locaux non poussés)',
        resultat: 'commit vérifié + tests réellement exécutés',
        validation: 'verdict VERIFIED (agent vérifié + gates verts + commit reachable + test exécuté)',
      },
      sessionsParEtat: sessions && sessions.healthy ? sessions.counts : null,
      observerPresent: !!(observer && observer.present),
    },
  };
}

function render(dash) {
  const lines = [];
  lines.push('=== FACTORY V3 — TABLEAU DE BORD MODÈLES / QUOTAS ===');
  lines.push(`Généré : ${dash.generatedAt}`);
  lines.push(`Dépense : ${dash.stats.depense} (autorisée : ${dash.stats.depenseAutorisee ? 'oui' : 'NON'})`);
  lines.push(`Bascules : ${dash.stats.bascules} · Reprises automatiques : ${dash.stats.reprisesAutomatiques} · Événements quota : ${dash.stats.evenementsQuota}`);
  lines.push(`Tentatives : ${dash.stats.tentatives} · Succès : ${dash.stats.succes} · Échecs : ${dash.stats.echecs} · Retries : ${dash.stats.retries}`);
  lines.push(`Dernier changement : ${dash.stats.dernierChangement || '-'}`);
  if (!dash.registryHealthy) {
    lines.push(`ERREUR REGISTRE (${dash.registryError.code}) : ${dash.registryError.message}`);
  }
  if (!dash.queueHealthy) {
    lines.push(`ERREUR QUEUE (${dash.queueError.code}) : ${dash.queueError.message}`);
  }
  lines.push('');
  lines.push('--- MODÈLES ---');
  if (!dash.modeles.length) lines.push('  (aucun modèle enregistré)');
  for (const m of dash.modeles) {
    lines.push(
      `  ${m.model}\n` +
      `    fournisseur=${m.provider} statut=${m.statut} quota=${m.quotaEpuisé ? 'ÉPUISÉ (' + m.quotaType + ')' : 'ok'} cooldown=${m.cooldownJusqua || '-'}\n` +
      `    indisponibilité=${m.indisponibilite || '-'} next_allowed=${m.nextAllowed || '-'} échecs consécutifs=${m.echecsConsecutifs} dernier=${m.dernierResultat || '-'} modèle observé=${m.modeleObserve || '-'}`
    );
  }
  lines.push('');
  lines.push('--- FOURNISSEURS ---');
  if (!dash.fournisseurs.length) lines.push('  (aucun fournisseur enregistré)');
  for (const p of dash.fournisseurs) {
    lines.push(
      `  ${p.fournisseur} état=${p.etat} disponible=${p.disponible ? 'oui' : 'non'}` +
      ` échecs=${p.echecsConsecutifs} concurrence=${p.requetesSimultanees}/${p.limiteSimultanee} pic=${p.picSimultaneite}` +
      ` cooldown=${p.cooldownJusqua || '-'}` +
      ` raison=${p.raison || '-'}`
    );
  }
  lines.push('');
  lines.push('--- AGENTS ---');
  if (!dash.agents.length) lines.push('  (aucun job)');
  for (const a of dash.agents) {
    lines.push(
      `  ${a.jobId} [${a.repo}] job=${a.statutJob} modèle=${a.modeleCourant || '-'} (${a.fournisseur || '-'})` +
      ` vérifié=${a.modeleVerifie} quota=${a.quotaEpuisé ? 'OUI' : 'non'} bascules=${a.bascules} reprises=${a.reprises}` +
      ` secours=${a.modeleSecours || '-'} verdict=${a.dernierVerdict || '-'}`
    );
  }
  if (dash.agentsBloques.length) {
    lines.push('');
    lines.push('--- AGENTS BLOQUÉS ---');
    for (const b of dash.agentsBloques) lines.push(`  ${b.jobId} : ${b.statut} (${b.verdict || '-'})`);
  }

  lines.push('');
  lines.push('--- SESSIONS (états normalisés) ---');
  if (!dash.sessions || !dash.sessions.present) {
    lines.push(`  (absent : ${dash.sessions && dash.sessions.note || 'inconnu'})`);
  } else if (dash.sessions.healthy === false) {
    lines.push(`  ERREUR : ${dash.sessions.error}`);
  } else {
    const counts = dash.sessions.counts || {};
    lines.push(
      `  PLANNING=${counts.PLANNING || 0} RUNNING=${counts.RUNNING || 0} WAITING=${counts.WAITING || 0}`
      + ` BLOCKED=${counts.BLOCKED || 0} RECOVERING=${counts.RECOVERING || 0} VERIFYING=${counts.VERIFYING || 0}`
      + ` COMPLETED=${counts.COMPLETED || 0} FAILED=${counts.FAILED || 0}`
    );
    if (dash.sessions.errors && dash.sessions.errors.length) {
      for (const err of dash.sessions.errors) lines.push(`  ERREUR SOURCE : ${err}`);
    }
    for (const s of dash.sessions.entries || []) {
      lines.push(
        `  [${s.state}] ${s.kind} ${s.id}` +
        ` ${s.repo || s.title || ''}` +
        ` modèle=${s.resolvedModel || '-'} commit=${s.committedSha || '-'} dépense=${s.spend != null ? s.spend : '-'}`
      );
      lines.push(`    raison=${s.reason}`);
    }
  }

  lines.push('');
  lines.push('--- OBSERVATEUR LOCAL ---');
  if (!dash.observer || !dash.observer.present) {
    lines.push(`  (absent : ${dash.observer && dash.observer.note || 'inconnu'})`);
  } else if (dash.observer.healthy === false) {
    lines.push(`  ERREUR : ${dash.observer.error}`);
  } else {
    lines.push(
      `  branche=${dash.observer.branch} head=${String(dash.observer.head || '').slice(0, 12)}`
      + ` ahead/behind=${dash.observer.ahead}/${dash.observer.behind}`
      + ` dernier commit=${dash.observer.lastCommitAt || '-'}`
    );
    lines.push(`  changements locaux=${JSON.stringify(dash.observer.localChanges || {})}`);
    lines.push(
      `  dernier test=${dash.observer.dernierTest ? `${dash.observer.dernierTest.ok ? 'OK' : 'ÉCHEC'} ${dash.observer.dernierTest.command} (${dash.observer.dernierTest.at})` : '-'}`
    );
    lines.push(`  blocages ouverts=${dash.observer.blocagesOuverts != null ? dash.observer.blocagesOuverts : '-'} prochaines actions=${dash.observer.prochainesActions != null ? dash.observer.prochainesActions : '-'}`);
  }

  lines.push('');
  lines.push('--- DISTINCTION DES PREUVES (activité ≠ progression ≠ résultat ≠ validation) ---');
  lines.push('  activité = événement observé (fichier, session) — ne prouve RIEN');
  lines.push('  progression = fichiers modifiés / commits locaux réels');
  lines.push('  résultat = commit vérifié + tests réellement exécutés');
  lines.push('  validation = verdict VERIFIED (agent vérifié + gates verts + commit reachable + test)');
  if (dash.preuves && dash.preuves.sessionsParEtat) {
    const c = dash.preuves.sessionsParEtat;
    lines.push(`  validation terminée (COMPLETED)=${c.COMPLETED || 0} · résultat en vérification (VERIFYING)=${c.VERIFYING || 0}`);
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--state-dir');
  const stateDir = i >= 0 && args[i + 1] ? args[i + 1] : STATE_DIR_DEFAULT;
  const dash = buildDashboard(stateDir);
  if (args.includes('--json')) {
    console.log(JSON.stringify(dash, null, 2));
  } else {
    console.log(render(dash));
  }
}

if (require.main === module) main();

module.exports = { buildDashboard, render, STATE_DIR_DEFAULT };

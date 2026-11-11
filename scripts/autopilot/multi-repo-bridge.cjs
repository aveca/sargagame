#!/usr/bin/env node
/**
 * multi-repo-bridge.cjs — extension multi-dépôt du pont ChatGPT/autopilot.
 *
 * Étend scripts/autopilot/bridge.cjs pour accepter les deux dépôts AUTORISÉS
 * (aveca/bot-wow, aveca/sargagame) avec :
 *
 *   - une ALLOWLIST stricte : tout autre dépôt est rejeté, jamais exécuté ;
 *   - un ROUTAGE strict : une mission `bot-wow` reste dans BOT-WOW. Elle n'est
 *     JAMAIS enfilée dans la queue locale sargagame — elle est seulement
 *     relayée (statut publié sur l'issue source) pour que le runner de BOT-WOW
 *     la prenne en charge chez elle ;
 *   - une IDEMPOTENCE par dépôt + issue + task_id, compatible avec la clé
 *     existante de bridge.cjs pour qu'aucune tâche ne soit importée deux fois ;
 *   - des STATUTS GitHub corrélés : imported / started / heartbeat / blocked /
 *     completed / failed, publiés sur l'issue de la mission.
 *
 * AUCUN nouveau runner, AUCUNE API LLM payante, AUCUN runner dans le cloud :
 * ce module est une CLI du runner Factory V3 existant.
 *
 * Contrat obligatoire de chaque tâche importée :
 *   repository_full_name, issue_number, task_id, priority, source, mode,
 *   humanGate, moneyPath, acceptance, rollback.
 *
 * Compatibilité : les missions publiées avant l'introduction du contrat complet
 * ne portent que `id` (cf. #1336, #1337). Elles restent acceptées, mais le
 * contrat est vérifié champ par champ et les champs manquants sont signalés
 * dans le rapport (jamais silencieusement complétés).
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const C = require('./lib/common.cjs');
const mem = require('./lib/memory.cjs');
const safety = require('./lib/safety-guard.cjs');
const lifecycle = require('./lib/mission-lifecycle.cjs');
const agentRouter = require('./lib/agent-router.cjs');
const scheduler = require('./lib/scheduler.cjs');

/** Dépôts autorisés. Liste fermée : aucun autre dépôt n'est jamais lu. */
const ALLOWED_REPOS = ['aveca/bot-wow', 'aveca/sargagame'];

/** Dépôt de repli quand le remote n'est pas déterminable. */
const DEFAULT_LOCAL_REPO = 'aveca/sargagame';

const FENCE = String.fromCharCode(96).repeat(3);
const AUTOPILOT_PREFIX = '[AUTOPILOT]';
const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const CONFIDENCE = new Set(['proven', 'observed', 'inferred']);

/**
 * Cycle de vie complet publié sur l'issue.
 * `queued` : mission vue, pas encore importée.
 * `imported` : mission enfilée dans la queue durable.
 * `started` : un agent a été lancé.
 * `heartbeat` : l'agent est vivant (published périodiquement).
 * `completed` : travail terminé ET vérifié (preuves jointes).
 * `blocked` : opération interdite (sécurité / human gate).
 * `failed` : erreur d'exécution.
 * `retrying` : reprise après crash / heartbeat expiré / agent mort.
 */
const STATUSES = ['queued', 'imported', 'started', 'heartbeat', 'completed', 'blocked', 'failed', 'retrying'];

/**
 * Taille maximale de l'historique des missions RELAYÉES (trace de
 * déduplication locale). Borné : la queue locale ne grossit pas sans fin.
 */
const RELAYED_HISTORY_MAX = 200;
const STATUS_EMOJI = {
  queued: '🕓',
  imported: '📥',
  started: '🔄',
  heartbeat: '❤️',
  blocked: '🚫',
  completed: '✅',
  failed: '❌',
  retrying: '🔁',
};

/** Champs exigés par le contrat de mission. */
const REQUIRED_CONTRACT = [
  'repository_full_name',
  'issue_number',
  'task_id',
  'priority',
  'source',
  'mode',
  'humanGate',
  'moneyPath',
  'acceptance',
  'rollback',
];

// ── gh ───────────────────────────────────────────────────────────────────────

/**
 * Exécute `gh`. La résolution d'exécutable est identique à bridge.cjs :
 * chemin primaire sous Windows, `gh` du PATH en repli.
 */
function gh(args, cwd = C.ROOT) {
  const isWin = process.platform === 'win32';
  const primary = isWin ? 'C:\\Program Files\\GitHub CLI\\gh.exe' : '/usr/local/bin/gh';
  const fallback = isWin ? 'gh.exe' : 'gh';

  try {
    return execFileSync(primary, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      windowsHide: true,
    }).trim();
  } catch (primaryError) {
    try {
      return execFileSync(fallback, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000,
        windowsHide: true,
      }).trim();
    } catch (fallbackError) {
      console.log(`[bridge] gh primary (${primary}) failed: ${primaryError.message}.`);
      console.log(`[bridge] gh fallback (${fallback}) also failed: ${fallbackError.message}`);
      throw primaryError;
    }
  }
}

// ── Dépôt local ──────────────────────────────────────────────────────────────

/**
 * Dépôt de ce checkout. C'est lui qui décide de l'exécution : une mission
 * d'un AUTRE dépôt autorisé est relayée, pas exécutée ici.
 */
function detectLocalRepo(cwd = C.ROOT) {
  const fromEnv = process.env.AUTOPILOT_LOCAL_REPO;
  if (fromEnv && isAllowedRepo(fromEnv)) return fromEnv;
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      windowsHide: true,
    }).trim();
    const m = url.match(/github\.com[:/]+([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    if (m) {
      const full = `${m[1]}/${m[2]}`;
      if (isAllowedRepo(full)) return full;
    }
  } catch (_) {
    // remote illisible : on retombe sur le dépôt par défaut.
  }
  return DEFAULT_LOCAL_REPO;
}

// ── Contrat ──────────────────────────────────────────────────────────────────

/** Un dépôt est-il dans l'allowlist ? */
function isAllowedRepo(repoFullName) {
  return ALLOWED_REPOS.includes(String(repoFullName));
}

/**
 * Vérifie le contrat de mission.
 * `legacy` = la tâche ne porte pas encore le contrat complet (missions
 * publiées avant son introduction) : elle reste recevable, mais l'écart est
 * reporté au lieu d'être silencieusement comblé.
 */
function requiredContract(task) {
  const missing = [];
  for (const field of REQUIRED_CONTRACT) {
    if (task[field] === undefined || task[field] === null || task[field] === '') missing.push(field);
  }
  return { ok: missing.length === 0, missing, legacy: missing.length > 0 };
}

/** Identifiant de tâche : `task_id` (contrat) ou `id` (format historique). */
function taskIdOf(task) {
  return String(task.task_id || task.id || '').trim();
}

// ── Clés de déduplication ────────────────────────────────────────────────────

/**
 * Clé canonique : dépôt + issue + task_id.
 * Elle est qualifiée par le dépôt, donc deux missions homonymes dans deux
 * dépôts distincts ne se confondent jamais.
 */
function fingerprint(repoFullName, issueNumber, taskId) {
  return `chatgpt-issue|${repoFullName}|${issueNumber}|${taskId}`;
}

/**
 * Clé historique produite par bridge.cjs : issue + task_id, sans dépôt.
 * Elle est reconnue à la déduplication pour que le pont multi-dépôt ne
 * réimporte jamais une tâche déjà importée par bridge.cjs (et inversement).
 */
function legacyFingerprint(issueNumber, taskId) {
  return `chatgpt-issue|${issueNumber}|${taskId}`;
}

/**
 * Index de ce qui est DÉJÀ connu dans la queue locale.
 * On indexe la clé canonique, la clé historique ET l'id de tâche : la
 * déduplication de bridge.cjs porte sur l'id, il faut donc couvrir les trois
 * espaces de clés pour garantir l'idempotence.
 */
function buildKnownIndex(queue) {
  const fingerprints = new Set();
  const ids = new Set();
  for (const o of (queue && queue.opportunities) || []) {
    if (o.fingerprint) fingerprints.add(String(o.fingerprint));
    if (o.id) ids.add(String(o.id));
    const legacy = o.fingerprint && String(o.fingerprint).indexOf('|') !== -1
      ? String(o.fingerprint).split('|').slice(1).join('|')
      : null;
    if (legacy) fingerprints.add(legacy);
  }
  return { fingerprints, ids };
}

/** Cette tâche est-elle déjà connue ? */
function isAlreadyKnown(known, repoFullName, issueNumber, taskId) {
  return (
    known.fingerprints.has(fingerprint(repoFullName, issueNumber, taskId)) ||
    known.fingerprints.has(legacyFingerprint(issueNumber, taskId)) ||
    known.ids.has(String(taskId))
  );
}

/**
 * Index des missions DÉJÀ RELAYÉES.
 *
 * Une mission d'un autre dépôt autorisé n'entre PAS dans la queue locale :
 * elle est seulement relayée (statut publié sur son issue d'origine). Sans
 * trace durable, le runner la relayerait à CHAQUE cycle — donc à chaque
 * minute en mode continu — et republierait un commentaire `imported` sur
 * l'issue du dépôt d'origine (flottement de commentaires, faux compteurs).
 * On mémorise donc la clé canonique des missions relayées, dans la queue
 * locale, sous la clé `relayed` (bornée, jamais mélangée aux opportunités).
 */
function buildRelayedIndex(queue) {
  const fingerprints = new Set();
  const entries = (queue && queue.relayed) || [];
  for (const entry of entries) {
    if (typeof entry === 'string') fingerprints.add(entry);
    else if (entry && entry.fingerprint) fingerprints.add(String(entry.fingerprint));
  }
  return fingerprints;
}

/** Enregistre une mission relayée (trace durable, bornée). */
function recordRelayed(queue, repoFullName, issueNumber, taskId, key) {
  if (!queue || !key) return;
  if (!Array.isArray(queue.relayed)) queue.relayed = [];
  queue.relayed.push({
    fingerprint: key,
    repository_full_name: repoFullName,
    issue_number: issueNumber,
    task_id: taskId,
    relayedAt: C.nowIso(),
  });
  if (queue.relayed.length > RELAYED_HISTORY_MAX) {
    queue.relayed = queue.relayed.slice(-RELAYED_HISTORY_MAX);
  }
}

/**
 * Index des missions BLOQUÉES par le garde-fou de sécurité.
 *
 * Sans trace durable, le pont republierait un commentaire `blocked` à CHAQUE
 * cycle (donc chaque minute) sur la même issue : bruit inutile et compteur
 * faux. La trace est bornée comme celle des missions relayées.
 */
function buildBlockedIndex(queue) {
  const fingerprints = new Set();
  const entries = (queue && queue.blockedSafety) || [];
  for (const entry of entries) {
    if (typeof entry === 'string') fingerprints.add(entry);
    else if (entry && entry.fingerprint) fingerprints.add(String(entry.fingerprint));
  }
  return fingerprints;
}

/** Enregistre une mission bloquée par la sécurité (trace durable, bornée). */
function recordBlockedSafety(queue, repoFullName, issueNumber, taskId, key, reason) {
  if (!queue || !key) return;
  if (!Array.isArray(queue.blockedSafety)) queue.blockedSafety = [];
  queue.blockedSafety.push({
    fingerprint: key,
    repository_full_name: repoFullName,
    issue_number: issueNumber,
    task_id: taskId,
    reason: String(reason || '').slice(0, 300),
    blockedAt: C.nowIso(),
  });
  if (queue.blockedSafety.length > RELAYED_HISTORY_MAX) {
    queue.blockedSafety = queue.blockedSafety.slice(-RELAYED_HISTORY_MAX);
  }
}

/**
 * LEVÉE d'un blocage de SÉCURITÉ devenue sans objet.
 *
 * Un blocage est DEFINITIF tant que le garde-fou le justifie. Mais un
 * blocage peut avoir été décidé sur une FAUX POSITIF : c'est exactement ce
 * qui est arrivé le 2026-11-10 à la mission `SARG-B2B-LEAD-ACK-20261109`
 * (#1384) — le corps de la mission était propre (`blocked:false`), et c'est
 * un COMMENTAIRE DE STATUT de la boucle (« … déploiement et LIVE comme étapes
 * distinctes ») qui avait déclenché `production-deploy`. Le blocage étant
 * inscrit dans la trace durable (`blockedSafety`), la mission restait
 * bloquée indéfiniment, sans aucune nouvelle trace.
 *
 * On ne lève QUE si :
 *   - le verdict courant est explicitement SAIN (`safety.blocked` absent) ;
 *   - l'opportunité porte le marqueur `safety.blocked` (donc c'est bien le
 *     garde-fou qui l avait bloquée, pas une PR ouverte ou un autre motif).
 *
 * Un blocage pour un autre motif (PR en cours, mission rejetée) n'est JAMAIS
 * levé par cette fonction.
 *
 * ── Statut de sortie : `new` ou `picked` ? ─────────────────────────────────
 * Ce n'est PAS un détail : c'est la différence entre une mission RELANCÉE et
 * une mission LIBÉRÉE mais INVISIBLE.
 *
 *   - `analyze.cjs` ne sélectionne QUE les opportunités en statut `new`
 *     (`pool = queue.filter(o => o.status === 'new')`) ;
 *   - `picked` signifie « RÉCLAMÉE par le scheduler » : `persistClaimed`
 *     la traite comme déjà claimée, et `analyze` l'ignore ;
 *   - `restoreSelected` ne restaure que l'opportunité REFERENCÉE par le
 *     scheduler (`claimedId` / `selectedId`).
 *
 * Mettre la mission libérée en `picked` sans que le scheduler la référence
 * revient donc à la rendre INEXÉCUTABLE : elle ne serait plus jamais
 * sélectionnée (constaté en exécution réelle le 2026-11-11 : mission #1384
 * libérée, statut `picked`, jamais sélectionnée).
 *
 * Règle retenue :
 *   - si le scheduler a DÉJÀ claimé la mission (`claimedIds`) → `picked`
 *     (le scheduler la restaurera : pas de doublon) ;
 *   - sinon → `new` (elle redevient sélectionnable par `analyze`).
 *
 * Dans les deux cas, une seule entrée en queue : la levée ne crée JAMAIS de
 * doublon d'opportunité.
 */
function releaseSafetyBlocked(queue, opp, schedulerState = null) {
  if (!queue || !opp) return null;
  const queued = (queue.opportunities || []).find(o =>
    o && (o.id === opp.id || o.fingerprint === opp.fingerprint));
  if (!queued || !queued.safety || queued.safety.blocked !== true) return null;
  if (queued.status !== 'blocked') return null;

  let st = schedulerState;
  if (!st) {
    try { st = scheduler.loadScheduler(); } catch (_) { st = { claimedIds: [] }; }
  }
  const alreadyClaimed = Array.isArray(st && st.claimedIds) && st.claimedIds.includes(queued.id);

  queued.status = alreadyClaimed ? 'picked' : 'new';
  queued.blockReason = null;
  queued.safetyReleasedAt = C.nowIso();
  queued.safetyReleasedTo = queued.status;
  queued.safety = { blocked: false, reason: queued.safety.reason || '', releasedAt: queued.safetyReleasedAt };
  if (Array.isArray(queue.blockedSafety)) {
    queue.blockedSafety = queue.blockedSafety.filter(e => {
      const fp = typeof e === 'string' ? e : (e && e.fingerprint);
      return fp !== opp.fingerprint && fp !== opp.legacyFingerprint;
    });
  }
  return queued;
}

// ── Lecture GitHub ───────────────────────────────────────────────────────────

/** Issues ouvertes `[AUTOPILOT]` d'un dépôt donné. */
function loadOpenAutopilotIssuesForRepo(repoFullName, ghFn = gh) {
  const out = ghFn([
    'issue', 'list',
    '--repo', repoFullName,
    '--state', 'open',
    '--limit', '100',
    '--json', 'number,title,body,url,createdAt',
  ]);
  const issues = JSON.parse(out || '[]');
  return issues.filter((i) => String(i.title || '').startsWith(AUTOPILOT_PREFIX));
}

/**
 * Un commentaire est-il PUBLIÉ PAR L'AUTOPILOT (et non par l'opérateur) ?
 *
 * Nos propres commentaires de statut ne sont PAS des « précisions utiles » :
 * les relire comme une consigne de mission créerait des faux positifs (une
 * ancienne ligne « aucun merge sur main, aucun paiement » serait lue comme une
 * demande de merge). On les exclut donc — et on le fait par MARQUEUR stable
 * (commentaire HTML invisible) plus un repli sur l'entête historique.
 */
function isAutopilotComment(body) {
  const b = String(body || '');
  if (b.indexOf('<!-- autopilot-status:') >= 0) return true;
  return /Autopilot\s+(multi-repo\s+)?—\s*statut\s*:/i.test(b);
}

/**
 * Commentaires de l'issue (précisions utiles de l'opérateur).
 *
 * Une mission GitHub n'est jamais complète dans son seul corps : les précisions
 * arrivent souvent en commentaire (fichiers exacts, commande de test, message
 * d'erreur). Les commentaires sont donc récupérés et transmis À L'AGENT.
 *
 * Best-effort : un échec de lecture des commentaires n'empêche JAMAIS
 * l'import (une mission ne doit pas être perdue pour une API capricieuse).
 */
function loadIssueComments(repoFullName, issueNumber, ghFn = gh) {
  try {
    const out = ghFn([
      'issue', 'view', String(issueNumber),
      '--repo', repoFullName,
      '--json', 'comments',
    ]);
    const parsed = JSON.parse(out || '{}');
    const comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    return comments
      .map(c => ({
        author: (c && (c.author && (c.author.login || c.author.name))) || 'unknown',
        createdAt: (c && c.createdAt) || null,
        body: String((c && c.body) || '').trim(),
      }))
      .filter(c => c.body && !isAutopilotComment(c.body));
  } catch (e) {
    console.log(`[bridge] commentaires illisibles sur ${repoFullName}#${issueNumber}: ${e.message}`);
    return [];
  }
}

/**
 * TEXTE INTÉGRAL de la mission : c'est CE texte qui part à l'agent.
 * Il contient le corps complet de l'issue, les commentaires utiles et le bloc
 * AUTOPILOT_TASK — jamais seulement le titre.
 */
function buildMissionText(issue, comments, task) {
  const parts = [];
  parts.push(`# Issue ${issue.number} — ${issue.title || ''}`);
  if (issue.url) parts.push(`URL : ${issue.url}`);
  parts.push('');
  parts.push('## CORPS COMPLET DE L\'ISSUE');
  parts.push(String(issue.body || '').trim() || '(corps vide)');
  if (comments && comments.length) {
    parts.push('');
    parts.push('## COMMENTAIRES (précisions de l\'opérateur)');
    for (const c of comments) {
      parts.push(`- @${c.author}${c.createdAt ? ` (${c.createdAt})` : ''} : ${c.body}`);
    }
  }
  if (task) {
    parts.push('');
    parts.push('## BLOC AUTOPILOT_TASK (contrat machine)');
    try {
      parts.push(JSON.stringify(task, null, 2));
    } catch (_) {
      parts.push(String(task));
    }
  }
  return parts.join('\n');
}

/** Extrait le bloc JSON `AUTOPILOT_TASK` du corps d'issue. */
function extractTask(body = '') {
  const markerAt = body.indexOf('AUTOPILOT_TASK');
  const from = markerAt >= 0 ? markerAt : 0;
  const start = body.indexOf(FENCE + 'json', from);
  if (start < 0) return null;
  const contentStart = start + (FENCE + 'json').length;
  const end = body.indexOf(FENCE, contentStart);
  if (end < 0) return null;
  try {
    const task = JSON.parse(body.slice(contentStart, end).trim());
    if (!task || typeof task !== 'object') return null;
    if (!taskIdOf(task) || !task.title || !['agent', 'auto'].includes(task.mode)) return null;
    return task;
  } catch (_) {
    return null;
  }
}

function normalizeFiles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
}

function priorityToSeverity(value) {
  return PRIORITY[String(value || '').toLowerCase()] || 'medium';
}

// ── Conversion en opportunité ────────────────────────────────────────────────

/**
 * Construit l'opportunité, ou un motif de rejet.
 *
 * Rejets (jamais d'import partiel) :
 *   - dépôt hors allowlist ;
 *   - dépôt déclaré dans la tâche différent du dépôt qui héberge l'issue
 *     (une mission ne peut pas prétendre appartenir à un autre dépôt) ;
 *   - identifiant de tâche absent.
 */
/**
 * Type de l'opportunité — normalisation du contrat EXTERNE (mission GitHub)
 * vers le contrat INTERNE de l'orchestrateur.
 *
 * Le contrat local exige `opp.type` (string non vide) : `validateOpportunityContract`
 * parque l'opportunité « contrat invalide : type manquant » AVANT toute
 * exécution. Les opportunités découvertes par la sonde locale (analyze.cjs)
 * portent toujours un type ; c'est donc l'ADAPTATEUR — le pont — qui doit
 * normaliser la mission GitHub, pas l'orchestrateur qui doit s'assouplir.
 *
 * - type déclaré par la mission -> respecté tel quel ;
 * - sinon -> type générique honnête. Il ne doit surtout PAS déclencher le
 *   routage browser-recon : les seuls types qui le déclenchent sont
 *   'ux-ui', 'browser-interaction', 'aha-wow' et 'svg-assets-a11y'.
 */
function opportunityType(task) {
  const declared = task && typeof task.type === 'string' ? task.type.trim() : '';
  if (declared) return declared;
  return task && task.mode === 'auto' ? 'auto-task' : 'agent-task';
}

/**
 * Commentaires RETENUS pour l'évaluation de sécurité.
 *
 * Le garde-fou scanne titre + corps + commentaires. Les commentaires de
 * STATUT produits par la boucle elle-même ne sont PAS des instructions :
 *
 *   - `<!-- autopilot-status:… -->` : c'est l'ÉCHO du garde-fou. Sans ce
 *     filtre, le commentaire « blocked — déploiement en production
 *     [production-deploy] » RE-DÉCLENCHERAIT le garde-fou au cycle suivant
 *     (auto-amplification : le verdict se réécrit lui-même) ;
 *   - `<!-- SARGAGAME-CYCLE-STATUS -->` : rapport de statut de l'agent sur la
 *     mission. Défaut réel du 2026-11-10 (#1384) : la ligne « Vérifier PR,
 *     CI sur SHA exact, merge, déploiement et LIVE comme étapes distinctes »
 *     (une DESCRIPTION de protocole, pas une demande) a fait basculer une
 *     mission legitimate en `blocked` 13 h après son import, alors que le
 *     corps de la mission était propre (verdict `blocked:false`).
 *
 * Le corps de la mission (titre + bloc AUTOPILOT_TASK) reste INTÉGRALEMENT
 * protégé : c'est lui qui porte la demande d'exécution. Seuls les
 * commentaires générés mécaniquement par la boucle sont écartés ; un
 * commentaire humain ordinaire reste entièrement scanné.
 */
const MACHINE_STATUS_MARKERS = ['<!-- autopilot-status:', '<!-- SARGAGAME-CYCLE-STATUS -->'];

function safetyRelevantComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list.filter(c => {
    const body = String((c && c.body) || '');
    return !MACHINE_STATUS_MARKERS.some(marker => body.includes(marker));
  });
}

function toOpportunity(task, issue, repoFullName, options = {}) {
  if (!isAllowedRepo(repoFullName)) {
    return { rejected: true, reason: 'repository_not_allowed: ' + repoFullName };
  }

  const declaredRepo = task.repository_full_name ? String(task.repository_full_name) : null;
  if (declaredRepo && declaredRepo !== repoFullName) {
    return {
      rejected: true,
      reason: `repository_mismatch: issue=${repoFullName} task=${declaredRepo}`,
    };
  }

  const taskId = taskIdOf(task);
  if (!taskId) return { rejected: true, reason: 'missing_task_id' };

  const contract = requiredContract(task);
  const humanGate = Boolean(task.humanGate || task.moneyPath);
  const hasRecipe = Boolean(task.recipe);
  let actionable = 'agent';
  if (humanGate) actionable = 'human';
  else if (task.mode === 'auto' && hasRecipe) actionable = 'auto';

  const issueNumber = Number(issue.number);
  const issueRef = {
    number: issueNumber,
    url: issue.url || null,
    title: issue.title || null,
    repository_full_name: repoFullName,
  };

  const comments = Array.isArray(options.comments) ? options.comments : [];
  const missionText = buildMissionText(issue, comments, task);

  // Garde-fou de sécurité : fail-closed, jamais contournable par la mission.
  // Les commentaires de STATUT de la boucle sont écartés du scan (cf.
  // `safetyRelevantComments`) : ils ne sont pas des instructions, et l'écho
  // du propre verdict du garde-fou ne doit pas le re-déclencher.
  const safetyVerdict = options.safety || safety.evaluateMissionSafety({
    title: issue.title,
    body: issue.body,
    comments: safetyRelevantComments(comments).map(c => c.body).join('\n'),
    task,
  });

  // Routage réel : quel agent / quel modèle va exécuter cette mission.
  //
  // `options.router` est un point d'INJECTION (symétrique à `options.safety`
  // ci-dessus) : il permet de tester le pont avec une décision de routage
  // DÉTERMINISTE. Sans lui, le test dépend de la machine : le routeur ne
  // retient que les agents RÉELLEMENT installé (un binaire `opencode`
  // présent sur le PC du fondateur, absent sur un runner CI) — le même
  // test passait en local et échouait en CI. Un test qui dépend de
  // l'installation de la machine est un test non déterministe : il doit
  // être rendu explicite, pas contourné.
  const router = options.router || agentRouter;
  let agent = null;
  try {
    agent = router.route({ type: task.type || '', priority: task.priority });
  } catch (e) {
    agent = { ok: false, reason: 'routage impossible: ' + e.message };
  }

  return {
    id: taskId,
    fingerprint: fingerprint(repoFullName, issueNumber, taskId),
    legacyFingerprint: legacyFingerprint(issueNumber, taskId),
    title: String(task.title),
    // Contrat interne de l'orchestrateur : sans type, la mission importée est
    // parquée avant même d'être dispatchée.
    type: opportunityType(task),
    repository_full_name: repoFullName,
    issue_number: issueNumber,
    source: `${String(task.source || 'chatgpt')} issue #${issueNumber} (${repoFullName})`,
    severity: priorityToSeverity(task.priority),
    confidence: CONFIDENCE.has(task.confidence) ? task.confidence : 'observed',
    actionable,
    evidence: String(task.evidence || task.diagnostic || task.acceptance || 'preuve non declaree dans la mission'),
    rollback: String(task.rollback || 'revert du commit'),
    // `expectedImpact` alimente le champ « AHA » de l'hypothese UX, qui
    // exige au moins 20 caracteres. Un fallback 'n/a' (3 caracteres) faisait
    // parquer la mission « AHA insuffisamment defini » AVANT tout travail
    // utile. La mission declare presque toujours un `acceptance` explicite :
    // on l'utilise comme impact attendu, en priorite sur un placeholder.
    expectedImpact: String(task.metric || task.expectedImpact || task.acceptance || 'impact non declare dans la mission'),
    status: 'new',
    createdAt: issue.createdAt || C.nowIso(),
    scope: { files: normalizeFiles(task.filesToModify) },
    contract: { ok: contract.ok, missing: contract.missing },
    sourceIssue: issueRef,
    acceptance: task.acceptance || 'n/a',
    // Garde-fou de sécurité : verdict figé à l'import (jamais réévalué à
    // l'exécution : une mission ne peut pas s'auto-autoriser ensuite).
    safety: {
      blocked: !!safetyVerdict.blocked,
      categories: safetyVerdict.categories || [],
      reason: safetyVerdict.reason || '',
    },
    // Agent routé (décision + raison, pour la preuve publiée sur l'issue).
    // `engine` = moteur RÉELLEMENT exécuté ; `declaredAgent` = agent déclaré
    // par le profil Factory (peut différer s'il n'est pas câblé).
    agent: agent && agent.ok
      ? {
          agent: agent.agent,
          engine: agent.engine || agent.agent,
          declaredAgent: agent.declaredAgent || null,
          model: agent.model || null,
          profile: agent.profile,
          reason: agent.reason,
          source: agent.source,
        }
      : { agent: null, engine: null, declaredAgent: null, model: null, profile: (agent && agent.profile) || null, reason: (agent && agent.reason) || 'routage indisponible', source: (agent && agent.source) || null },
    // MISSION INTÉGRALE transmise à l'agent (corps + commentaires + contrat).
    mission: {
      text: missionText,
      body: String(issue.body || ''),
      comments,
      instructions: String(task.instructions || task.instruction || task.description || ''),
      acceptance: task.acceptance || 'n/a',
      constraints: Array.isArray(task.constraints) ? task.constraints : [],
      rollback: String(task.rollback || 'revert du commit'),
      filesToRead: normalizeFiles(task.filesToRead),
      filesToModify: normalizeFiles(task.filesToModify),
      previousAttempts: Array.isArray(task.previousAttempts) ? task.previousAttempts : [],
    },
    task: {
      ...task,
      task_id: taskId,
      repository_full_name: repoFullName,
      issue_number: issueNumber,
      filesToRead: normalizeFiles(task.filesToRead),
      filesToModify: normalizeFiles(task.filesToModify),
      humanGate,
    },
  };
}

// ── Statuts GitHub ───────────────────────────────────────────────────────────

/**
 * Publie un statut corrélé sur l'issue de la mission.
 *
 * Le commentaire porte TOUTES les preuves exigées par la mission P0 :
 * identifiant de mission, dépôt, branche, agent lancé (+ modèle), heure de
 * début, dernier heartbeat, commit SHA, tests réellement exécutés et leurs
 * résultats, PR créée, motif de blocage/échec.
 *
 * Retourne true si le commentaire a bien été publié.
 * Une erreur de publication est SIGNALÉE (log + retour false) : elle ne doit
 * jamais disparaître silencieusement.
 *
 * @param {string} repoFullName dépôt (allowlist fermée)
 * @param {number} issueNumber numéro d'issue
 * @param {string} status       état du cycle de vie
 * @param {string} details      détail libre (une ligne)
 * @param {object} options      {taskId, fingerprint, evidence}
 */
function publishStatus(repoFullName, issueNumber, status, details = '', options = {}) {
  if (!STATUSES.includes(status)) {
    throw new Error(`statut inconnu: ${status} (attendu: ${STATUSES.join(', ')})`);
  }
  if (!isAllowedRepo(repoFullName)) {
    throw new Error(`dépôt non autorisé pour la publication d'un statut: ${repoFullName}`);
  }
  const ghFn = options.gh || gh;
  const ev = options.evidence || {};
  const safe = safety.maskSecrets;

  const lines = [
    `${STATUS_EMOJI[status] || '•'} Autopilot — statut : **${status}**`,
    '',
    `- mission ID : ${options.taskId || 'n/a'}`,
    `- dépôt : ${repoFullName}`,
    `- issue : #${issueNumber}`,
  ];
  if (options.fingerprint) lines.push(`- clé : ${options.fingerprint}`);
  if (ev.branch) lines.push(`- branche : \`${ev.branch}\``);
  if (ev.agent) lines.push(`- agent lancé : ${ev.agent}${ev.model ? ` (modèle : ${ev.model})` : ''}`);
  if (ev.startedAt) lines.push(`- début : ${ev.startedAt}`);
  if (ev.lastHeartbeatAt) lines.push(`- dernier heartbeat : ${ev.lastHeartbeatAt}`);
  if (ev.attempts) lines.push(`- tentatives : ${ev.attempts}`);
  if (ev.commit) lines.push(`- commit SHA : \`${ev.commit}\``);
  if (ev.pr) lines.push(`- PR : ${ev.pr}`);
  if (Array.isArray(ev.tests) && ev.tests.length) {
    lines.push('- tests réellement exécutés :');
    for (const t of ev.tests) {
      const label = typeof t === 'string' ? t : `${t.name || t.command || 'test'} — ${t.result || 'inconnu'}`;
      lines.push(`  - ${safe(String(label)).slice(0, 200)}`);
    }
  }
  if (ev.reason) lines.push(`- motif : ${safe(String(ev.reason)).slice(0, 400)}`);
  if (details) lines.push(`- détail : ${safe(String(details)).slice(0, 400)}`);

  const body = [
    ...lines,
    '',
    `_Statut publié par le pont Factory V3. Aucune intervention manuelle n'est requise pour ce statut._`,
    `<!-- autopilot-status:${options.taskId || 'n/a'}:${status} -->`,
  ].join('\n');
  try {
    ghFn(['issue', 'comment', String(issueNumber), '--repo', repoFullName, '--body', body]);
    return true;
  } catch (e) {
    console.log(`[bridge] publication du statut "${status}" impossible sur ${repoFullName}#${issueNumber}: ${e.message}`);
    return false;
  }
}

// ── Ingestion ────────────────────────────────────────────────────────────────

/**
 * Ingestion multi-dépôt.
 *
 * @param {object}   options
 * @param {boolean}  options.dry                aucune écriture, aucun statut
 * @param {function} options.log
 * @param {function} options.gh                 injecté dans les tests
 * @param {string}   options.localRepo          dépôt de ce checkout
 * @param {function} options.loadIssues         (repo) => issues[]
 * @param {object}   options.queue              queue injectée (tests)
 * @param {function} options.saveQueue
 * @param {function} options.writeOpportunityFile
 * @param {function} options.publishStatus
 * @param {{route:Function}} [options.router]  routeur d'agent injecté (tests
 *        déterministes). Par défaut : `lib/agent-router.cjs`, qui ne retient
 *        que les agents RÉELLEMENT installés — donc une assertion de test
 *        sur l'agent retenu dépend de la machine (cf. run CI 42651059357).
 * @param {{evaluateMissionSafety:Function}} [options.safety] verdict de
 *        sécurité injecté (tests) ; par défaut : `lib/safety-guard.cjs`.
 * @param {{claimedIds:string[]}} [options.schedulerState] état du scheduler
 *        injecté (tests) ; par défaut : `lib/scheduler.cjs`. Détermine si une
 *        mission libérée redevient `new` (sélectionnable) ou `picked`
 *        (déjà claimée par le scheduler).
 */
function ingestMultiRepo(options = {}) {
  const dry = options.dry === true;
  const log = options.log || console.log;
  const ghFn = options.gh || gh;
  const localRepo = options.localRepo || detectLocalRepo();
  const loadIssues = options.loadIssues || ((repo) => loadOpenAutopilotIssuesForRepo(repo, ghFn));
  const loadComments = options.loadComments || ((repo, number) => loadIssueComments(repo, number, ghFn));
  const publish = options.publishStatus || publishStatus;
  const loadQueue = options.loadQueue || mem.loadQueue;
  const saveQueue = options.saveQueue || mem.saveQueue;
  const writeOppFile = options.writeOpportunityFile || mem.writeOpportunityFile;
  // Points d'injection (tests déterministes, indépendants de la machine) :
  // le routage d'agent et le verdict de sécurité sont résolus par défaut via
  // les modules réels, mais peuvent être fournis par l'appelant.
  // `null` = « utilise le module réel » (le `||` de `toOpportunity`).
  const router = options.router || null;
  const safetyInjector = options.safety || null;

  if (!dry) C.ensureDirs();

  const queue = options.queue || loadQueue();
  queue.opportunities = queue.opportunities || [];
  const known = buildKnownIndex(queue);
  const relayedKnown = buildRelayedIndex(queue);
  const blockedKnown = buildBlockedIndex(queue);

  let imported = 0;
  let wouldImport = 0;
  let relayed = 0;
  let wouldRelay = 0;
  let ignored = 0;
  let rejected = 0;
  let blocked = 0;
  let neutralized = 0;
  let releasedCount = 0;
  let statusFailures = 0;
  const perRepo = {};
  const relayedTasks = [];
  const importedTasks = [];
  const wouldImportTasks = [];
  const blockedTasks = [];

  for (const repoFullName of ALLOWED_REPOS) {
    perRepo[repoFullName] = { issues: 0, imported: 0, wouldImport: 0, relayed: 0, wouldRelay: 0, ignored: 0, rejected: 0, blocked: 0 };

    let issues;
    try {
      issues = loadIssues(repoFullName);
    } catch (e) {
      log(`[bridge] dépôt inaccessible ${repoFullName}: ${e.message}`);
      perRepo[repoFullName].rejected += 1;
      rejected += 1;
      continue;
    }
    perRepo[repoFullName].issues = issues.length;

    for (const issue of issues) {
      const task = extractTask(issue.body || '');
      if (!task) {
        ignored += 1;
        perRepo[repoFullName].ignored += 1;
        log(`[bridge] ${repoFullName} issue #${issue.number} ignorée : AUTOPILOT_TASK invalide/absent`);
        continue;
      }

      // Commentaires utiles de l'opérateur (best-effort : une API capricieuse
      // ne doit JAMAIS faire perdre une mission).
      const comments = loadComments(repoFullName, issue.number) || [];

      const opp = toOpportunity(task, issue, repoFullName, { comments, router, safety: safetyInjector });
      if (opp.rejected) {
        rejected += 1;
        perRepo[repoFullName].rejected += 1;
        log(`[bridge] ${repoFullName} issue #${issue.number} rejetée : ${opp.reason}`);
        continue;
      }

      // ── GARDE-FOU DE SÉCURITÉ (fail-closed) ─────────────────────────────
      // Une mission qui demande un déploiement production, une modification de
      // prix, un paiement réel, un secret, une migration irréversible, un envoi
      // massif ou une fusion paiements/sécurité est BLOQUÉE et signalée
      // explicitement. Elle n'est JAMAIS enfilée, JAMAIS exécutée.
      //
      // CAS DE LEVÉE : si le verdict courant est SAIN alors que l'opportunité
      // porte encore un blocage de sécurité (faux positif sur un commentaire
      // de statut — cf. `releaseSafetyBlocked`), le blocage est levé : sans
      // cela la mission restait bloquée indéfiniment, sur la foi d'une trace
      // durable devenue fausse.
      if (!(opp.safety && opp.safety.blocked)) {
        const released = releaseSafetyBlocked(queue, opp, options.schedulerState || null);
        if (released) {
          releasedCount += 1;
          log(`[bridge] LEVÉE ${repoFullName} #${opp.issue_number} ${opp.id} — le blocage de sécurité ne s'applique plus`);
          try {
            lifecycle.patch(opp.id, repoFullName, opp.issue_number, {
              state: 'imported',
              reason: 'blocage de sécurité levé : le verdict courant est sain',
              // RÉINITIALISATION du compteur de tentatives.
              //
              // Les tentatives accumulées avant la levée sont un ARTEFACT du
              // défaut (auto-reprise infinie : 242 sur #1384), pas du travail
              // réel. Sans cette remise à zéro, la mission levée serait
              // « déjà au plafond » pour le watchdog et partirait en `failed`
              // sans jamais être exécutée — la levée serait alors vide de
              // sens. La reprise repart donc avec un budget NEUF et borné
              // (`mission.maxAttempts`), soit exactement UNE reprise propre.
              attempts: 0,
              lastHeartbeatAt: null,
              pid: null,
            });
          } catch (e) {
            log(`[bridge] levée non écrite dans l'état durable (non-fatal): ${e.message}`);
          }
        }
      }
      if (opp.safety && opp.safety.blocked) {
        // Une mission déjà enfilée AVANT l'arrivée du garde-fou (ou importée
        // par une autre voie) doit être NEUTRALISÉE dans la queue : sinon
        // l'orchestrateur la sélectionne et l'exécute — fail-open. On la
        // marque `blocked` (état terminal pour le sélecteur) et on conserve
        // le motif. C'est la correction d'une faille réelle constatée sur la
        // mission SARG-P0-B2B-SIBLING-HANDLERS-RETIREMENT-20261108 (#1368).
        const queued = (queue.opportunities || []).find(o =>
          o && (o.id === opp.id || o.fingerprint === opp.fingerprint));
        if (queued && !['done', 'rejected', 'blocked'].includes(queued.status)) {
          queued.status = 'blocked';
          queued.blockReason = `[safety] ${opp.safety.reason}`.slice(0, 300);
          queued.blockedAt = C.nowIso();
          queued.safety = { blocked: true, reason: opp.safety.reason };
          neutralized += 1;
          log(`[bridge] NEUTRALISÉE ${repoFullName} #${opp.issue_number} ${opp.id} (queue ${queued.status})`);
        }
        if (blockedKnown.has(opp.fingerprint)) {
          ignored += 1;
          perRepo[repoFullName].ignored += 1;
          continue;
        }
        blocked += 1;
        perRepo[repoFullName].blocked += 1;
        blockedTasks.push({ repo: repoFullName, issue: opp.issue_number, taskId: opp.id, reason: opp.safety.reason });
        log(`[bridge] BLOQUÉ ${repoFullName} #${opp.issue_number} ${opp.id} : ${opp.safety.reason}`);
        if (!dry) {
          recordBlockedSafety(queue, repoFullName, opp.issue_number, opp.id, opp.fingerprint, opp.safety.reason);
          known.fingerprints.add(opp.fingerprint);
          known.ids.add(opp.id);
          // Trace durable du blocage (survit au redémarrage, visible dans
          // `status.cjs`).
          try {
            lifecycle.upsert({
              taskId: opp.id,
              repo: repoFullName,
              issue: opp.issue_number,
              fingerprint: opp.fingerprint,
              state: 'blocked',
              reason: opp.safety.reason,
            });
          } catch (e) {
            log(`[bridge] état durable non écrit (non-fatal): ${e.message}`);
          }
          const ok = publish(
            repoFullName,
            opp.issue_number,
            'blocked',
            'exécution automatique interdite : ' + opp.safety.reason,
            {
              taskId: opp.id,
              fingerprint: opp.fingerprint,
              gh: ghFn,
              evidence: { reason: opp.safety.reason },
            },
          );
          if (!ok) statusFailures += 1;
        }
        continue;
      }

      if (isAlreadyKnown(known, repoFullName, opp.issue_number, opp.id)) {
        ignored += 1;
        perRepo[repoFullName].ignored += 1;
        continue;
      }

      // Mission déjà RELAYÉE lors d'un cycle précédent : on ne la rejoue pas
      // (sinon un commentaire `imported` est republié à chaque cycle).
      if (relayedKnown.has(opp.fingerprint)) {
        ignored += 1;
        perRepo[repoFullName].ignored += 1;
        log(`[bridge] ${repoFullName} #${opp.issue_number} déjà relayée — pas de nouveau statut`);
        continue;
      }

      // ── Routage strict ───────────────────────────────────────────────────
      // Une mission d'un dépôt autorisé qui n'est pas CE dépôt est RELAYÉE :
      // elle reste chez son dépôt d'origine. Elle n'est jamais enfilée dans
      // la queue locale, donc jamais exécutée par ce runner.
      const isLocal = repoFullName === localRepo;
      if (!isLocal) {
        wouldRelay += 1;
        perRepo[repoFullName].wouldRelay += 1;
        known.fingerprints.add(opp.fingerprint);
        known.ids.add(opp.id);
        relayedTasks.push({ repo: repoFullName, issue: opp.issue_number, taskId: opp.id });
        log(`[bridge] relay ${repoFullName} #${opp.issue_number} → ${opp.id} (reste dans ${repoFullName})`);
        if (!dry) {
          relayed += 1;
          perRepo[repoFullName].relayed += 1;
          recordRelayed(queue, repoFullName, opp.issue_number, opp.id, opp.fingerprint);
          const ok = publish(
            repoFullName,
            opp.issue_number,
            'imported',
            `mission relayée vers ${repoFullName} (non exécutée ici)`,
            {
              taskId: opp.id,
              fingerprint: opp.fingerprint,
              gh: ghFn,
              evidence: {
                agent: opp.agent && opp.agent.agent ? `${opp.agent.agent} (profil ${opp.agent.profile})` : null,
                reason: 'routage strict : la mission reste dans son dépôt d\'origine',
              },
            },
          );
          if (!ok) statusFailures += 1;
        }
        continue;
      }

      // ── Tâche locale ─────────────────────────────────────────────────────
      if (opp.actionable === 'human') {
        ignored += 1;
        perRepo[repoFullName].ignored += 1;
        log(`[bridge] HUMAN ${repoFullName} #${opp.issue_number} ${opp.id} laissée dans GitHub`);
        if (!dry) {
          const ok = publish(
            repoFullName,
            opp.issue_number,
            'blocked',
            'humanGate/moneyPath : exécution automatique interdite',
            {
              taskId: opp.id,
              fingerprint: opp.fingerprint,
              gh: ghFn,
              evidence: { reason: 'humanGate/moneyPath : exécution automatique interdite' },
            },
          );
          if (!ok) statusFailures += 1;
        }
        continue;
      }

      // Un dry-run ne mute JAMAIS la queue : il annonce ce qui serait fait.
      wouldImport += 1;
      perRepo[repoFullName].wouldImport += 1;
      known.fingerprints.add(opp.fingerprint);
      known.ids.add(opp.id);
      wouldImportTasks.push({ repo: repoFullName, issue: opp.issue_number, taskId: opp.id });
      log(`[bridge] ${dry ? 'would import' : 'import'} ${repoFullName} #${opp.issue_number} → ${opp.id} (${opp.actionable})`);

      if (!dry) {
        queue.opportunities.push(opp);
        imported += 1;
        perRepo[repoFullName].imported += 1;
        importedTasks.push({ repo: repoFullName, issue: opp.issue_number, taskId: opp.id });
        writeOppFile(opp);
        // Trace durable du cycle de vie (survit au redémarrage).
        try {
          lifecycle.upsert({
            taskId: opp.id,
            repo: repoFullName,
            issue: opp.issue_number,
            fingerprint: opp.fingerprint,
            state: 'imported',
            agent: opp.agent && opp.agent.agent,
            model: opp.agent && opp.agent.model,
          });
        } catch (e) {
          log(`[bridge] état durable non écrit (non-fatal): ${e.message}`);
        }
        const ok = publish(
          repoFullName,
          opp.issue_number,
          'imported',
          `opportunité ${opp.id} (${opp.actionable})`,
          {
            taskId: opp.id,
            fingerprint: opp.fingerprint,
            gh: ghFn,
            evidence: {
              agent: opp.agent && opp.agent.agent ? `${opp.agent.agent}${opp.agent.model ? ` (modèle ${opp.agent.model})` : ''}` : null,
              reason: opp.agent && opp.agent.reason,
            },
          },
        );
        if (!ok) statusFailures += 1;
      }
    }
  }

  // La queue est persistée s'il y a eu un import, un relay, un blocage
  // sécurité OU une NEUTRALISATION (une mission déjà enfilée qui devient
  // interdite DOIT être retirée du sélecteur, sinon elle s'exécuterait) OU
  // une LEVÉE de blocage devenu sans objet.
  if ((imported || relayed || blocked || neutralized || releasedCount) && !dry) saveQueue(queue);

  return {
    imported,
    wouldImport,
    relayed,
    wouldRelay,
    ignored,
    rejected,
    blocked,
    neutralized,
    released: releasedCount,
    statusFailures,
    perRepo,
    relayedTasks,
    importedTasks,
    wouldImportTasks,
    blockedTasks,
    localRepo,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  // ── Publication d'un statut de cycle de vie ──────────────────────────────
  if (args.status) {
    const repo = String(args.repo || '');
    const issue = Number(args.issue);
    if (!isAllowedRepo(repo)) {
      console.error(`MULTI-REPO-BRIDGE ERROR: dépôt non autorisé: ${repo || '(vide)'}`);
      process.exit(1);
    }
    if (!Number.isInteger(issue) || issue <= 0) {
      console.error('MULTI-REPO-BRIDGE ERROR: --issue doit être un numéro d\'issue valide');
      process.exit(1);
    }
    const ok = publishStatus(repo, issue, String(args.status), String(args.detail || ''), {
      taskId: args.task ? String(args.task) : undefined,
      fingerprint: args.fingerprint ? String(args.fingerprint) : undefined,
    });
    console.log(`MULTI-REPO-BRIDGE STATUS · ${repo}#${issue} · ${args.status} · published=${ok}`);
    if (!ok) process.exit(1);
    return;
  }

  // ── Ingestion ────────────────────────────────────────────────────────────
  const dry = args.dry === true || args.dry === 'true';
  const result = ingestMultiRepo({ dry, log: console.log });
  const imported = dry ? result.wouldImport : result.imported;
  const relayed = dry ? result.wouldRelay : result.relayed;
  console.log(
    `MULTI-REPO-BRIDGE ${dry ? 'DRY' : 'PASS'} · imported=${imported} relayed=${relayed} ` +
    `blocked=${result.blocked} ignored=${result.ignored} rejected=${result.rejected} ` +
    `statusFailures=${result.statusFailures} local=${result.localRepo}`,
  );
  for (const [repo, stats] of Object.entries(result.perRepo)) {
    const repoImported = dry ? stats.wouldImport : stats.imported;
    const repoRelayed = dry ? stats.wouldRelay : stats.relayed;
    console.log(
      `   ${repo} : issues=${stats.issues} imported=${repoImported} relayed=${repoRelayed} ` +
      `blocked=${stats.blocked} ignored=${stats.ignored} rejected=${stats.rejected}`,
    );
  }
  if (result.statusFailures > 0) process.exit(1);
}

if (require.main === module) {
  try {
    runCli();
  } catch (e) {
    console.error('MULTI-REPO-BRIDGE ERROR: ' + e.message);
    process.exit(1);
  }
}

module.exports = {
  ALLOWED_REPOS,
  REQUIRED_CONTRACT,
  STATUSES,
  detectLocalRepo,
  requiredContract,
  isAllowedRepo,
  taskIdOf,
  fingerprint,
  legacyFingerprint,
  buildKnownIndex,
  isAlreadyKnown,
  buildRelayedIndex,
  recordRelayed,
  buildBlockedIndex,
  recordBlockedSafety,
  releaseSafetyBlocked,
  safetyRelevantComments,
  MACHINE_STATUS_MARKERS,
  loadOpenAutopilotIssuesForRepo,
  loadIssueComments,
  isAutopilotComment,
  buildMissionText,
  extractTask,
  normalizeFiles,
  priorityToSeverity,
  opportunityType,
  toOpportunity,
  publishStatus,
  ingestMultiRepo,
  parseArgs,
  runCli,
};

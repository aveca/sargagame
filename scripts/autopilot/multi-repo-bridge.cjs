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

/** Dépôts autorisés. Liste fermée : aucun autre dépôt n'est jamais lu. */
const ALLOWED_REPOS = ['aveca/bot-wow', 'aveca/sargagame'];

/** Dépôt de repli quand le remote n'est pas déterminable. */
const DEFAULT_LOCAL_REPO = 'aveca/sargagame';

const FENCE = String.fromCharCode(96).repeat(3);
const AUTOPILOT_PREFIX = '[AUTOPILOT]';
const PRIORITY = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };
const CONFIDENCE = new Set(['proven', 'observed', 'inferred']);

const STATUSES = ['imported', 'started', 'heartbeat', 'blocked', 'completed', 'failed'];
const STATUS_EMOJI = {
  imported: '📥',
  started: '🔄',
  heartbeat: '❤️',
  blocked: '🚫',
  completed: '✅',
  failed: '❌',
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
function toOpportunity(task, issue, repoFullName) {
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

  return {
    id: taskId,
    fingerprint: fingerprint(repoFullName, issueNumber, taskId),
    legacyFingerprint: legacyFingerprint(issueNumber, taskId),
    title: String(task.title),
    repository_full_name: repoFullName,
    issue_number: issueNumber,
    source: `${String(task.source || 'chatgpt')} issue #${issueNumber} (${repoFullName})`,
    severity: priorityToSeverity(task.priority),
    confidence: CONFIDENCE.has(task.confidence) ? task.confidence : 'observed',
    actionable,
    evidence: String(task.evidence || task.diagnostic || 'n/a'),
    rollback: String(task.rollback || 'revert du commit'),
    expectedImpact: String(task.metric || task.expectedImpact || 'n/a'),
    status: 'new',
    createdAt: issue.createdAt || C.nowIso(),
    scope: { files: normalizeFiles(task.filesToModify) },
    contract: { ok: contract.ok, missing: contract.missing },
    sourceIssue: issueRef,
    acceptance: task.acceptance || 'n/a',
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
 * Retourne true si le commentaire a bien été publié.
 * Une erreur de publication est SIGNALÉE (log + retour false) : elle ne doit
 * jamais disparaître silencieusement.
 */
function publishStatus(repoFullName, issueNumber, status, details = '', options = {}) {
  if (!STATUSES.includes(status)) {
    throw new Error(`statut inconnu: ${status} (attendu: ${STATUSES.join(', ')})`);
  }
  if (!isAllowedRepo(repoFullName)) {
    throw new Error(`dépôt non autorisé pour la publication d'un statut: ${repoFullName}`);
  }
  const ghFn = options.gh || gh;
  const body = [
    `${STATUS_EMOJI[status]} Autopilot multi-repo — statut : **${status}**`,
    '',
    `- dépôt : ${repoFullName}`,
    `- issue : #${issueNumber}`,
    `- task ID : ${options.taskId || 'n/a'}`,
    options.fingerprint ? `- clé : ${options.fingerprint}` : '',
    details ? `- détail : ${details}` : '',
    '',
    '_Statut publié par multi-repo-bridge.cjs. Aucune intervention manuelle n’est requise pour ce statut._',
  ].filter(Boolean).join('\n');
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
 */
function ingestMultiRepo(options = {}) {
  const dry = options.dry === true;
  const log = options.log || console.log;
  const ghFn = options.gh || gh;
  const localRepo = options.localRepo || detectLocalRepo();
  const loadIssues = options.loadIssues || ((repo) => loadOpenAutopilotIssuesForRepo(repo, ghFn));
  const publish = options.publishStatus || publishStatus;
  const loadQueue = options.loadQueue || mem.loadQueue;
  const saveQueue = options.saveQueue || mem.saveQueue;
  const writeOppFile = options.writeOpportunityFile || mem.writeOpportunityFile;

  if (!dry) C.ensureDirs();

  const queue = options.queue || loadQueue();
  queue.opportunities = queue.opportunities || [];
  const known = buildKnownIndex(queue);

  let imported = 0;
  let wouldImport = 0;
  let relayed = 0;
  let wouldRelay = 0;
  let ignored = 0;
  let rejected = 0;
  let statusFailures = 0;
  const perRepo = {};
  const relayedTasks = [];
  const importedTasks = [];
  const wouldImportTasks = [];

  for (const repoFullName of ALLOWED_REPOS) {
    perRepo[repoFullName] = { issues: 0, imported: 0, wouldImport: 0, relayed: 0, wouldRelay: 0, ignored: 0, rejected: 0 };

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

      const opp = toOpportunity(task, issue, repoFullName);
      if (opp.rejected) {
        rejected += 1;
        perRepo[repoFullName].rejected += 1;
        log(`[bridge] ${repoFullName} issue #${issue.number} rejetée : ${opp.reason}`);
        continue;
      }

      if (isAlreadyKnown(known, repoFullName, opp.issue_number, opp.id)) {
        ignored += 1;
        perRepo[repoFullName].ignored += 1;
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
          const ok = publish(
            repoFullName,
            opp.issue_number,
            'imported',
            `mission relayée vers ${repoFullName} (non exécutée ici)`,
            { taskId: opp.id, fingerprint: opp.fingerprint, gh: ghFn },
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
            { taskId: opp.id, fingerprint: opp.fingerprint, gh: ghFn },
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
        const ok = publish(
          repoFullName,
          opp.issue_number,
          'imported',
          `opportunité ${opp.id} (${opp.actionable})`,
          { taskId: opp.id, fingerprint: opp.fingerprint, gh: ghFn },
        );
        if (!ok) statusFailures += 1;
      }
    }
  }

  if (imported && !dry) saveQueue(queue);

  return {
    imported,
    wouldImport,
    relayed,
    wouldRelay,
    ignored,
    rejected,
    statusFailures,
    perRepo,
    relayedTasks,
    importedTasks,
    wouldImportTasks,
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
    `ignored=${result.ignored} rejected=${result.rejected} statusFailures=${result.statusFailures} local=${result.localRepo}`,
  );
  for (const [repo, stats] of Object.entries(result.perRepo)) {
    const repoImported = dry ? stats.wouldImport : stats.imported;
    const repoRelayed = dry ? stats.wouldRelay : stats.relayed;
    console.log(
      `   ${repo} : issues=${stats.issues} imported=${repoImported} relayed=${repoRelayed} ` +
      `ignored=${stats.ignored} rejected=${stats.rejected}`,
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
  loadOpenAutopilotIssuesForRepo,
  extractTask,
  normalizeFiles,
  priorityToSeverity,
  toOpportunity,
  publishStatus,
  ingestMultiRepo,
  parseArgs,
  runCli,
};

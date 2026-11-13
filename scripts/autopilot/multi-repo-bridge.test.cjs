#!/usr/bin/env node
/**
 * multi-repo-bridge.test.cjs — tests déterministes (sans réseau, sans écriture
 * hors mémoire) du bridge multi-dépôt.
 *
 * Aucun appel `gh` réel : l'exécutable est injecté. Aucune écriture disque :
 * la queue, la sauvegarde et les fiches d'opportunité sont injectées.
 *
 * Couvre :
 *   1. requiredContract : contrat complet / incomplet / mission historique
 *   2. isAllowedRepo : allowlist stricte
 *   3. fingerprint : déterministe, qualifié par le dépôt, clé historique
 *   4. isAlreadyKnown : idempotence sur clé canonique, clé historique et id
 *   5. toOpportunity : dépôt hors allowlist, dépôt déclaré incohérent, mission
 *      historique (champ `id` seul) acceptée, humanGate => human
 *   6. ingestMultiRepo : routage strict (bot-wow relayé, pas enfilé localement),
 *      idempotence, human non enfilé, dry-run sans écriture, statuts corrélés,
 *      échec de publication compté
 */

'use strict';

const assert = require('node:assert/strict');
const path = require('path');

const bridge = require('./multi-repo-bridge.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LOCAL = 'aveca/sargagame';
const OTHER = 'aveca/bot-wow';

function taskBlock(overrides = {}) {
  return {
    id: 'T-1',
    task_id: 'T-1',
    title: 'Tâche de test',
    mode: 'agent',
    source: 'chatgpt',
    priority: 'high',
    confidence: 'observed',
    evidence: 'preuve',
    rollback: 'revert du commit',
    humanGate: false,
    moneyPath: false,
    acceptance: 'critères ok',
    repository_full_name: LOCAL,
    issue_number: 1336,
    filesToRead: [],
    filesToModify: ['README.md'],
    ...overrides,
  };
}

function issue(number, task, repo = LOCAL) {
  const body = 'AUTOPILOT_TASK\n```json\n' + JSON.stringify(task, null, 2) + '\n```';
  return {
    number,
    url: `https://github.com/${repo}/issues/${number}`,
    title: '[AUTOPILOT] test',
    body,
    createdAt: '2026-11-06T00:00:00Z',
  };
}

// ── 1. requiredContract ──────────────────────────────────────────────────────

console.log('=== 1. requiredContract ===');
{
  const c1 = bridge.requiredContract(taskBlock());
  check('contrat complet valide', c1.ok === true, JSON.stringify(c1.missing));
  check('contrat complet non legacy', c1.legacy === false);

  const c2 = bridge.requiredContract({ id: 'T-2', title: 'X', mode: 'agent' });
  check('contrat incomplet détecté', c2.ok === false);
  check('champs manquants listés', c2.missing.includes('task_id') && c2.missing.includes('priority'));
  check('contrat incomplet marqué legacy', c2.legacy === true);
}

// ── 2. isAllowedRepo ─────────────────────────────────────────────────────────

console.log('=== 2. isAllowedRepo ===');
{
  check('aveca/bot-wow autorisé', bridge.isAllowedRepo(OTHER) === true);
  check('aveca/sargagame autorisé', bridge.isAllowedRepo(LOCAL) === true);
  check('dépôt inconnu rejeté', bridge.isAllowedRepo('aveca/autre-repo') === false);
  check('chaîne vide rejetée', bridge.isAllowedRepo('') === false);
  check('dépôt hors allowlist rejeté', bridge.isAllowedRepo('aveca/sargagame-privé') === false);
}

// ── 3. fingerprint ───────────────────────────────────────────────────────────

console.log('=== 3. fingerprint ===');
{
  const f1 = bridge.fingerprint(OTHER, 1336, 'T-1');
  const f2 = bridge.fingerprint(OTHER, 1336, 'T-1');
  const f3 = bridge.fingerprint(LOCAL, 1336, 'T-1');
  const f4 = bridge.fingerprint(OTHER, 1337, 'T-1');
  check('déterministe', f1 === f2);
  check('qualifié par le dépôt', f1 !== f3);
  check('intègre le numéro d\'issue', f1 !== f4);
  check('format canonique', f1 === 'chatgpt-issue|aveca/bot-wow|1336|T-1');
  check(
    'clé historique sans dépôt',
    bridge.legacyFingerprint(1336, 'T-1') === 'chatgpt-issue|1336|T-1',
  );
}

// ── 4. isAlreadyKnown (idempotence) ──────────────────────────────────────────

console.log('=== 4. isAlreadyKnown ===');
{
  const known = bridge.buildKnownIndex({
    opportunities: [
      // importée par bridge.cjs : clé historique + id
      { id: 'T-OLD', fingerprint: 'chatgpt-issue|1336|T-OLD' },
      // importée par le bridge multi-dépôt : clé canonique
      { id: 'T-NEW', fingerprint: 'chatgpt-issue|aveca/sargagame|1400|T-NEW' },
    ],
  });
  check('clé historique reconnue', bridge.isAlreadyKnown(known, LOCAL, 1336, 'T-OLD') === true);
  check('clé canonique reconnue', bridge.isAlreadyKnown(known, LOCAL, 1400, 'T-NEW') === true);
  check('id seul reconnu (dédup bridge.cjs)', bridge.isAlreadyKnown(known, LOCAL, 9999, 'T-OLD') === true);
  check('tâche inconnue non reconnue', bridge.isAlreadyKnown(known, LOCAL, 1336, 'T-FRESH') === false);
  check(
    'même task_id dans un AUTRE dépôt reste distinct (clé qualifiée par dépôt)',
    bridge.isAlreadyKnown(bridge.buildKnownIndex({ opportunities: [] }), OTHER, 1, 'T-X') === false,
  );
  // Cas où SEULE la clé d'empreinte permet de reconnaître la tâche : l'entrée
  // en queue porte une clé historique mais un id différent de celui que la
  // mission déclare aujourd'hui.
  {
    const k2 = bridge.buildKnownIndex({
      opportunities: [{ id: 'T-DIFFERENT', fingerprint: 'chatgpt-issue|1336|T-SHARED' }],
    });
    check(
      'clé historique reconnue malgré un id différent',
      bridge.isAlreadyKnown(k2, LOCAL, 1336, 'T-SHARED') === true,
    );
    check(
      'id différent seul ne suffit pas à reconnaître la tâche',
      bridge.isAlreadyKnown(k2, LOCAL, 1336, 'T-AUTRE') === false,
    );
  }
}

// ── 5. toOpportunity ─────────────────────────────────────────────────────────

console.log('=== 5. toOpportunity ===');
{
  const iss = issue(1336, taskBlock());

  const o1 = bridge.toOpportunity(taskBlock(), iss, 'aveca/inconnu');
  check('dépôt inconnu rejeté', o1.rejected === true, JSON.stringify(o1.reason));

  const o2 = bridge.toOpportunity(taskBlock({ repository_full_name: OTHER }), iss, LOCAL);
  check('dépôt déclaré incohérent rejeté', o2.rejected === true, JSON.stringify(o2.reason));

  const o3 = bridge.toOpportunity(taskBlock(), iss, LOCAL);
  check('contrat valide accepté', o3.rejected === undefined && o3.status === 'new');
  check('repository_full_name renseigné', o3.repository_full_name === LOCAL);
  check('issue_number renseigné', o3.issue_number === 1336);
  check('actionable agent (pas humanGate)', o3.actionable === 'agent');
  check('clé canonique', o3.fingerprint === 'chatgpt-issue|aveca/sargagame|1336|T-1');
  check('clé historique conservée', o3.legacyFingerprint === 'chatgpt-issue|1336|T-1');
  check('acceptance présente', o3.acceptance === 'critères ok');
  check('rollback présent', o3.rollback === 'revert du commit');

  // Mission au format historique (champ `id` seul) : acceptée, écart signalé.
  const legacyTask = {
    id: 'SARG-PAGES-CODE-ONLY-RELEASE-20261106',
    source: 'chatgpt',
    priority: 'critical',
    mode: 'agent',
    humanGate: false,
    moneyPath: false,
    title: 'Mission historique',
    diagnostic: 'diag',
    acceptance: 'ok',
    rollback: 'revert',
  };
  const o4 = bridge.toOpportunity(legacyTask, issue(1336, legacyTask), LOCAL);
  check('mission historique (id seul) acceptée', o4.rejected === undefined, JSON.stringify(o4.reason));
  check('id de tâche déduit de `id`', o4.id === 'SARG-PAGES-CODE-ONLY-RELEASE-20261106');
  check('écart de contrat signalé', o4.contract.ok === false && o4.contract.missing.includes('task_id'));

  const o5 = bridge.toOpportunity(taskBlock({ humanGate: true }), iss, LOCAL);
  check('humanGate => actionable human', o5.actionable === 'human');
}

// ── 6. ingestMultiRepo ───────────────────────────────────────────────────────

console.log('=== 6. ingestMultiRepo ===');
{
  // 6a. Routage strict : une mission bot-wow n'est PAS enfilée localement.
  {
    const queue = { opportunities: [] };
    const saved = [];
    const written = [];
    const statuses = [];

    const sargTask = taskBlock({ id: 'T-SARG', task_id: 'T-SARG', issue_number: 2000, repository_full_name: LOCAL });
    const wowTask = taskBlock({ id: 'T-WOW', task_id: 'T-WOW', issue_number: 125, repository_full_name: OTHER });

    const result = bridge.ingestMultiRepo({
      dry: false,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: (q) => saved.push(q),
      writeOpportunityFile: (o) => written.push(o.id),
      publishStatus: (repo, issueNumber, status, details, opts) => {
        statuses.push({ repo, issueNumber, status, taskId: opts && opts.taskId });
        return true;
      },
      loadIssues: (repo) =>
        repo === LOCAL ? [issue(2000, sargTask)] : [issue(125, wowTask, OTHER)],
    });

    check('dépôt local détecté', result.localRepo === LOCAL);
    check('mission locale importée', result.imported === 1, JSON.stringify(result.perRepo));
    check('mission distante RELAYÉE', result.relayed === 1, JSON.stringify(result.perRepo));
    check('mission distante absente de la queue locale', queue.opportunities.length === 1);
    check('seule la mission locale est enfilée', queue.opportunities[0].id === 'T-SARG');
    check('fiche d\'opportunité écrite pour la mission locale', written.join(',') === 'T-SARG');
    check('queue sauvegardée une fois', saved.length === 1);
    check(
      'statut publié sur l\'issue du dépôt qui porte la mission',
      statuses.some((s) => s.repo === OTHER && s.issueNumber === 125 && s.status === 'imported')
      && statuses.some((s) => s.repo === LOCAL && s.issueNumber === 2000 && s.status === 'imported'),
      JSON.stringify(statuses),
    );
    check(
      'statut corrélé au task ID',
      statuses.every((s) => s.taskId === 'T-SARG' || s.taskId === 'T-WOW'),
      JSON.stringify(statuses),
    );
    check('mission relayée listée', result.relayedTasks.length === 1 && result.relayedTasks[0].repo === OTHER);
    check(
      'tâches importées listées',
      result.importedTasks.length === 1
      && result.importedTasks[0].taskId === 'T-SARG'
      && result.importedTasks[0].repo === LOCAL,
      JSON.stringify(result.importedTasks),
    );
    check(
      'tâches annoncées en dry-run distinguées des appliquées',
      result.wouldImportTasks.length === 1 && result.importedTasks.length === 1,
      JSON.stringify(result.wouldImportTasks),
    );
  }

  // 6b. Idempotence : un second passage n'importe rien.
  {
    const queue = { opportunities: [] };
    const t = taskBlock({ id: 'T-IDEM', task_id: 'T-IDEM', issue_number: 3000 });
    const issues = { [LOCAL]: [issue(3000, t)], [OTHER]: [] };
    const opts = {
      dry: false,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: () => {},
      writeOpportunityFile: () => {},
      publishStatus: () => true,
      loadIssues: (repo) => issues[repo] || [],
    };
    const first = bridge.ingestMultiRepo(opts);
    const second = bridge.ingestMultiRepo(opts);
    check('1er passage importe', first.imported === 1);
    check('2e passage importe 0', second.imported === 0, JSON.stringify(second.perRepo));
    check('2e passage ignore la tâche connue', second.ignored === 1);
    check('une seule entrée en queue', queue.opportunities.length === 1);
  }

  // 6c. Une tâche déjà importée par bridge.cjs (clé historique) n'est pas réimportée.
  {
    const queue = {
      opportunities: [{ id: 'T-LEGACY', fingerprint: 'chatgpt-issue|4000|T-LEGACY' }],
    };
    const t = taskBlock({ id: 'T-LEGACY', task_id: 'T-LEGACY', issue_number: 4000 });
    const result = bridge.ingestMultiRepo({
      dry: false,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: () => {},
      writeOpportunityFile: () => {},
      publishStatus: () => true,
      loadIssues: (repo) => (repo === LOCAL ? [issue(4000, t)] : []),
    });
    check('tâche bridge.cjs non réimportée', result.imported === 0, JSON.stringify(result.perRepo));
    check('tâche bridge.cjs comptée ignorée', result.ignored === 1);
    check('queue inchangée', queue.opportunities.length === 1);
  }

  // 6d. Une tâche humanGate n'est jamais enfilée pour exécution.
  {
    const queue = { opportunities: [] };
    const statuses = [];
    const t = taskBlock({ id: 'T-HG', task_id: 'T-HG', issue_number: 5000, humanGate: true });
    const result = bridge.ingestMultiRepo({
      dry: false,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: () => {},
      writeOpportunityFile: () => {},
      publishStatus: (repo, issueNumber, status) => {
        statuses.push(status);
        return true;
      },
      loadIssues: (repo) => (repo === LOCAL ? [issue(5000, t)] : []),
    });
    check('humanGate non importée', result.imported === 0);
    check('humanGate comptée ignorée', result.ignored === 1);
    check('humanGate absente de la queue', queue.opportunities.length === 0);
    check('statut blocked publié', statuses.includes('blocked'));
  }

  // 6e. Dry-run : aucune écriture, aucun statut, aucun import persisté.
  {
    const queue = { opportunities: [] };
    let saveCalled = 0;
    let writeCalled = 0;
    let statusCalled = 0;
    const t = taskBlock({ id: 'T-DRY', task_id: 'T-DRY', issue_number: 6000 });
    const result = bridge.ingestMultiRepo({
      dry: true,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: () => { saveCalled += 1; },
      writeOpportunityFile: () => { writeCalled += 1; },
      publishStatus: () => { statusCalled += 1; return true; },
      loadIssues: (repo) => (repo === LOCAL ? [issue(6000, t)] : []),
    });
    check('dry-run : aucun import appliqué', result.imported === 0);
    check('dry-run : import annoncé sans être appliqué', result.wouldImport === 1);
    check('dry-run : aucune tâche appliquée', result.importedTasks.length === 0);
    check('dry-run : tâche annoncée listée', result.wouldImportTasks.length === 1);
    check('dry-run : queue non sauvegardée', saveCalled === 0);
    check('dry-run : aucune fiche écrite', writeCalled === 0);
    check('dry-run : aucun statut publié', statusCalled === 0);
    check('dry-run : queue inchangée', queue.opportunities.length === 0);
  }

  // 6f. Échec de publication d'un statut : il est compté, pas avalé.
  {
    const queue = { opportunities: [] };
    const t = taskBlock({ id: 'T-FAIL', task_id: 'T-FAIL', issue_number: 7000 });
    const result = bridge.ingestMultiRepo({
      dry: false,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue,
      saveQueue: () => {},
      writeOpportunityFile: () => {},
      publishStatus: () => false,
      loadIssues: (repo) => (repo === LOCAL ? [issue(7000, t)] : []),
    });
    check('échec de publication compté', result.statusFailures === 1, JSON.stringify(result));
    check('la tâche reste importée', result.imported === 1);
  }

  // 6g. Dépôt hors allowlist : jamais lu.
  {
    const seen = [];
    const result = bridge.ingestMultiRepo({
      dry: true,
      log: () => {},
      localRepo: LOCAL,
      loadComments: () => [],
      queue: { opportunities: [] },
      loadIssues: (repo) => { seen.push(repo); return []; },
    });
    check(
      'seuls les dépôts de l\'allowlist sont lus',
      seen.length === 2 && seen.includes(LOCAL) && seen.includes(OTHER),
      JSON.stringify(seen),
    );
    check('aucun dépôt hors allowlist', !seen.some((r) => !bridge.isAllowedRepo(r)));
    check('résultat par dépôt présent', Object.keys(result.perRepo).length === 2);
  }
}

// ── 7. detectLocalRepo (variable d'environnement) ───────────────────────────

console.log('=== 7. detectLocalRepo ===');
{
  const previous = process.env.AUTOPILOT_LOCAL_REPO;
  process.env.AUTOPILOT_LOCAL_REPO = OTHER;
  check('variable d\'environnement respectée', bridge.detectLocalRepo() === OTHER);
  process.env.AUTOPILOT_LOCAL_REPO = 'aveca/pas-autorise';
  check('variable hors allowlist ignorée', bridge.detectLocalRepo() !== 'aveca/pas-autorise');
  if (previous === undefined) delete process.env.AUTOPILOT_LOCAL_REPO;
  else process.env.AUTOPILOT_LOCAL_REPO = previous;
}

// ── 8. parseArgs ─────────────────────────────────────────────────────────────

console.log('=== 8. parseArgs ===');
{
  const a = bridge.parseArgs(['--status', 'started', '--repo', LOCAL, '--issue', '1337', '--task', 'T-1']);
  check('option avec valeur', a.status === 'started' && a.repo === LOCAL && a.issue === '1337');
  check('option sans valeur', bridge.parseArgs(['--dry']).dry === true);
}

console.log('');
if (failures === 0) {
  console.log('MULTI-REPO-BRIDGE TESTS : OK (' + failures + ' échec)');
  process.exit(0);
} else {
  console.log('MULTI-REPO-BRIDGE TESTS : ' + failures + ' ÉCHEC(S)');
  process.exit(1);
}

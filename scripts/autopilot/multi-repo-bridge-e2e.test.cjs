#!/usr/bin/env node
/**
 * e2e-bridge.test.cjs — TEST DE BOUT EN BOUT du pont GitHub ↔ Factory ↔ Agent.
 *
 * Ce test n'est PAS un test de parser : il traverse le VRAI chemin de code
 * (pont multi-dépôt → mission complète → agent → heartbeats → publication →
 * redémarrage → reprise → garde-fou de sécurité) avec un GitHub simulé en
 * mémoire (aucun appel réseau, aucune écriture hors du fichier d'état
 * temporaire).
 *
 * Les 12 étapes exigées par la mission P0 :
 *   1. mission de test non destructive créée
 *   2. mission publiée (dans le GitHub simulé)
 *   3. le pont la détecte automatiquement
 *   4. le corps INTÉGRAL (corps + commentaires) arrive à l'agent
 *   5. l'agent démarre réellement (statut `started`)
 *   6. heartbeat publié pendant l'exécution
 *   7. résultat publié sur GitHub (commit + tests + PR)
 *   8. redémarrage du pont simulé (état durable relu)
 *   9. reprise sans doublon
 *  10. une mission terminée n'est PAS relancée
 *  11. une mission sensible est BLOQUÉE
 *  12. les deux dépôts sont surveillés
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_STATE = path.join(os.tmpdir(), `sarga-e2e-state-${process.pid}.json`);
process.env.SARGA_MISSION_STATE_FILE = TMP_STATE;
try { fs.unlinkSync(TMP_STATE); } catch (_) {}

const bridge = require('./multi-repo-bridge.cjs');
const publisher = require('./lib/mission-publisher.cjs');
const watchdog = require('./lib/mission-watchdog.cjs');

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + ' ' + detail);
  }
}

// ── Faux GitHub (en mémoire) ─────────────────────────────────────────────────

const LOCAL = 'aveca/sargagame';
const OTHER = 'aveca/bot-wow';
const BODY_MARKER = 'E2E-BODY-MARKER-42';
const COMMENT_MARKER = 'E2E-COMMENT-MARKER-42';

function taskBlock(overrides = {}) {
  return {
    task_id: 'E2E-TASK-1',
    title: 'Mission E2E non destructive',
    mode: 'agent',
    type: 'agent-task',
    priority: 'medium',
    confidence: 'observed',
    source: 'chatgpt',
    evidence: 'fixture de test E2E',
    diagnostic: BODY_MARKER,
    acceptance: 'le marqueur ' + BODY_MARKER + ' est présent dans le fichier',
    rollback: 'revert du commit',
    humanGate: false,
    moneyPath: false,
    repository_full_name: LOCAL,
    issue_number: 9101,
    filesToRead: ['README.md'],
    filesToModify: ['README.md'],
    instructions: 'Ajouter une ligne de test sans toucher au code métier.',
    constraints: ['ne pas toucher aux paiements'],
    ...overrides,
  };
}

function issueOf(number, task, repo) {
  const body = [
    'Voici la mission, merci de l\'exécuter.',
    BODY_MARKER,
    'AUTOPILOT_TASK',
    '```json',
    JSON.stringify(task, null, 2),
    '```',
  ].join('\n');
  return {
    number,
    title: '[AUTOPILOT] ' + task.title,
    body,
    url: `https://github.com/${repo}/issues/${number}`,
    createdAt: '2026-11-09T00:00:00Z',
  };
}

const ghState = {
  repos: {
    [LOCAL]: { issues: [], comments: {} },
    [OTHER]: { issues: [], comments: {} },
  },
  published: [],
  listCalls: [],
};

function fakeGh(args) {
  const cmd = args[0];
  if (cmd === 'issue' && args[1] === 'list') {
    const repo = args[args.indexOf('--repo') + 1];
    ghState.listCalls.push(repo);
    const issues = (ghState.repos[repo] && ghState.repos[repo].issues) || [];
    return JSON.stringify(issues.map(i => ({
      number: i.number, title: i.title, body: i.body, url: i.url, createdAt: i.createdAt,
    })));
  }
  if (cmd === 'issue' && args[1] === 'view') {
    const number = Number(args[2]);
    const repo = args[args.indexOf('--repo') + 1];
    const comments = (ghState.repos[repo] && ghState.repos[repo].comments[number]) || [];
    return JSON.stringify({ comments });
  }
  if (cmd === 'issue' && args[1] === 'comment') {
    const number = Number(args[2]);
    const repo = args[args.indexOf('--repo') + 1];
    const body = args[args.indexOf('--body') + 1];
    ghState.published.push({ repo, issue: number, body });
    return '';
  }
  throw new Error('gh simulé : commande non supportée ' + cmd + ' ' + args[1]);
}

// ── Mémoire simulée (queue en RAM) ───────────────────────────────────────────

const memory = {
  opportunities: [],
  relayed: [],
  blockedSafety: [],
};
const fakeMem = {
  loadQueue: () => memory,
  updateOpportunity: (id, patch) => {
    const o = memory.opportunities.find(x => x.id === id);
    if (o) Object.assign(o, patch);
    return o || null;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 1-2 : création et publication de la mission de test
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 1-2 : mission de test non destructive créée et publiée ===');
const task = taskBlock();
ghState.repos[LOCAL].issues.push(issueOf(9101, task, LOCAL));
ghState.repos[LOCAL].comments[9101] = [
  { author: { login: 'aveca' }, createdAt: '2026-11-09T00:01:00Z', body: 'Précision : ' + COMMENT_MARKER + ' — utilise la commande `npm test`.' },
];
// Une mission dans l'AUTRE dépôt (permet de vérifier que les 2 repos sont surveillés).
const otherTask = taskBlock({ task_id: 'E2E-TASK-OTHER', repository_full_name: OTHER, issue_number: 9202 });
ghState.repos[OTHER].issues.push(issueOf(9202, otherTask, OTHER));
// Une mission SENSIBLE (déploiement production) dans le dépôt local.
const sensitiveTask = taskBlock({
  task_id: 'E2E-TASK-SENSITIVE',
  issue_number: 9303,
  title: 'Déployer en production',
  diagnostic: 'Déployer en production dès que possible.',
});
ghState.repos[LOCAL].issues.push(issueOf(9303, sensitiveTask, LOCAL));

check('mission de test créée dans le dépôt local', ghState.repos[LOCAL].issues.length === 2);
check('mission de test créée dans le second dépôt', ghState.repos[OTHER].issues.length === 1);

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 3 : détection automatique
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 3 : détection automatique par le pont ===');
const ingest = bridge.ingestMultiRepo({
  gh: fakeGh,
  log: () => {},
  localRepo: LOCAL,
  queue: memory,
  saveQueue: () => {},
  writeOpportunityFile: () => {},
});
check('mission importée', ingest.imported === 1, JSON.stringify(ingest.perRepo));
check('mission du second dépôt relayée (reste chez elle)', ingest.relayed === 1, JSON.stringify(ingest.perRepo));
check('mission sensible bloquée', ingest.blocked === 1, JSON.stringify(ingest.perRepo));
check('les deux dépôts ont été lus', ghState.listCalls.includes(LOCAL) && ghState.listCalls.includes(OTHER), JSON.stringify(ghState.listCalls));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 4 : le corps INTÉGRAL arrive à l'agent
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 4 : corps intégral transmis à l\'agent ===');
const opp = memory.opportunities.find(o => o.id === 'E2E-TASK-1');
check('opportunité enfilée', !!opp);
check('corps complet reçu (marqueur du corps)', !!(opp && opp.mission.text.includes(BODY_MARKER)));
check('commentaire utile reçu (marqueur du commentaire)', !!(opp && opp.mission.text.includes(COMMENT_MARKER)));
check('critères d\'acceptation reçus', !!(opp && opp.mission.acceptance.includes(BODY_MARKER)));
check('instructions complémentaires reçues', !!(opp && opp.mission.instructions.includes('sans toucher')));
check('contraintes reçues', !!(opp && opp.mission.constraints.length === 1));
check('agent routé décidé', !!(opp && opp.agent && opp.agent.agent), JSON.stringify(opp && opp.agent));
check('branche d\'opportunité connue', !!(opp && opp.fingerprint));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 5-6 : démarrage réel de l'agent + heartbeat
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 5-6 : agent démarré + heartbeat ===');
const branch = 'agent/autopilot/e2e-e2e-task-1';
publisher.publishMissionStatus('E2E-TASK-1', 'started', 'exécution locale par le runner Factory (agent)', {
  branch, agent: 'opencode', model: 'qwen3.5:9b', startedAt: new Date().toISOString(),
}, { mem: fakeMem, bridge, lifecycle: require('./lib/mission-lifecycle.cjs'), gh: fakeGh, log: () => {} });
publisher.publishMissionStatus('E2E-TASK-1', 'heartbeat', 'agent en cours', {
  branch, agent: 'opencode', model: 'qwen3.5:9b', lastHeartbeatAt: new Date().toISOString(),
}, { mem: fakeMem, bridge, lifecycle: require('./lib/mission-lifecycle.cjs'), gh: fakeGh, log: () => {} });

const startedComment = ghState.published.find(c => c.body.includes('**started**'));
const heartbeatComment = ghState.published.find(c => c.body.includes('**heartbeat**'));
check('statut started publié sur l\'issue', !!startedComment);
check('statut heartbeat publié sur l\'issue', !!heartbeatComment);
check('le commentaire started porte la branche', !!(startedComment && startedComment.body.includes(branch)));
check('le commentaire started porte l\'agent', !!(startedComment && startedComment.body.includes('opencode')));
check('le commentaire heartbeat porte le dernier heartbeat', !!(heartbeatComment && heartbeatComment.body.includes('dernier heartbeat')));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 7 : publication du résultat (commit + tests + PR)
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 7 : résultat publié (commit + tests + PR) ===');
publisher.publishMissionStatus('E2E-TASK-1', 'completed', 'READY TO MERGE — all gates green', {
  branch,
  commit: 'abc1234def5678',
  pr: 'https://github.com/aveca/sargagame/pull/4242',
  agent: 'opencode',
  tests: ['npm run build → exit 0', 'npm test → 185/185', 'check-bundle-budget → 206.7/210 Ko'],
}, { mem: fakeMem, bridge, lifecycle: require('./lib/mission-lifecycle.cjs'), gh: fakeGh, log: () => {} });

const completedComment = ghState.published.find(c => c.body.includes('**completed**'));
check('statut completed publié', !!completedComment);
check('le completed porte le commit SHA', !!(completedComment && completedComment.body.includes('abc1234def5678')));
check('le completed porte les tests réellement exécutés', !!(completedComment && completedComment.body.includes('npm test')));
check('le completed porte la PR', !!(completedComment && completedComment.body.includes('/pull/4242')));
check('aucun secret dans les commentaires', !ghState.published.some(c => /ghp_[A-Za-z0-9]{10,}/.test(c.body)));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 8-9 : redémarrage + reprise sans doublon
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 8-9 : redémarrage + reprise sans doublon ===');
// Redémarrage simulé : les modules sont rechargés, l'état durable est relu.
for (const k of Object.keys(require.cache)) {
  if (k.includes('mission-lifecycle.cjs') || k.includes('mission-publisher.cjs')) delete require.cache[k];
}
const lifecycleAfterRestart = require('./lib/mission-lifecycle.cjs');
const stateAfterRestart = lifecycleAfterRestart.findByTaskId('E2E-TASK-1');
check('état de mission relu après redémarrage', !!stateAfterRestart, JSON.stringify(stateAfterRestart));
check('état terminal conservé après redémarrage', stateAfterRestart && stateAfterRestart.state === 'completed');

const ingest2 = bridge.ingestMultiRepo({
  gh: fakeGh,
  log: () => {},
  localRepo: LOCAL,
  queue: memory,
  saveQueue: () => {},
  writeOpportunityFile: () => {},
});
check('aucun ré-import après redémarrage', ingest2.imported === 0, JSON.stringify(ingest2.perRepo));
check('la mission terminée est ignorée', ingest2.ignored >= 1, JSON.stringify(ingest2.perRepo));
check('aucune duplication dans la queue', memory.opportunities.filter(o => o.id === 'E2E-TASK-1').length === 1);

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 10 : une mission terminée n'est PAS relancée
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 10 : mission terminée non relancée ===');
const wd = watchdog.runMissionWatchdog({
  cfg: { mission: { watchdogStaleSeconds: 60 } },
  log: () => {},
  publish: (repo, issue, status, detail, options) => {
    const ok = bridge.publishStatus(repo, issue, status, detail, { ...options, gh: fakeGh });
    return ok;
  },
  mem: fakeMem,
  lifecycle: lifecycleAfterRestart,
});
check('aucune mission terminée reprise', wd.resumed === 0, JSON.stringify(wd));
check('aucun commentaire retrying sur la mission terminée', !ghState.published.some(c => c.issue === 9101 && c.body.includes('**retrying**')));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 11 : mission sensible bloquée
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 11 : mission sensible bloquée ===');
const blockedComment = ghState.published.find(c => c.issue === 9303 && c.body.includes('**blocked**'));
check('mission sensible bloquée (commentaire)', !!blockedComment);
check('le motif de blocage est précis', !!(blockedComment && blockedComment.body.includes('déploiement en production')), blockedComment && blockedComment.body);
check('la mission sensible n\'est PAS enfilée', !memory.opportunities.some(o => o.id === 'E2E-TASK-SENSITIVE'));
check('la mission sensible n\'est PAS exécutée', !ghState.published.some(c => c.issue === 9303 && c.body.includes('**started**')));

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 12 : les deux dépôts sont surveillés
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 12 : les deux dépôts sont surveillés ===');
check('dépôt local surveillé', ghState.listCalls.includes(LOCAL), JSON.stringify(ghState.listCalls));
check('dépôt bot-wow surveillé', ghState.listCalls.includes(OTHER), JSON.stringify(ghState.listCalls));
check('statut publié sur l\'issue du dépôt relayé', ghState.published.some(c => c.repo === OTHER && c.issue === 9202), JSON.stringify(ghState.published.map(c => c.repo + '#' + c.issue)));

try { fs.unlinkSync(TMP_STATE); } catch (_) {}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 8b : mission laissée en cours par un crash → reprise par le watchdog
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 8b : crash → reprise sans doublon ===');
const crashTask = taskBlock({ task_id: 'E2E-TASK-CRASH', issue_number: 9404 });
ghState.repos[LOCAL].issues.push(issueOf(9404, crashTask, LOCAL));
const ingestCrash = bridge.ingestMultiRepo({
  gh: fakeGh, log: () => {}, localRepo: LOCAL, queue: memory, saveQueue: () => {}, writeOpportunityFile: () => {},
});
check('mission de crash importée', ingestCrash.imported === 1, JSON.stringify(ingestCrash.perRepo));
// L'agent « meurt » : la mission reste `started` avec un heartbeat périmé.
lifecycleAfterRestart.upsert({
  taskId: 'E2E-TASK-CRASH', repo: LOCAL, issue: 9404, state: 'started', agent: 'opencode',
  lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
});
const wdCrash = watchdog.runMissionWatchdog({
  cfg: { mission: { watchdogStaleSeconds: 60 } },
  log: () => {},
  publish: (repo, issue, status, detail, options) => bridge.publishStatus(repo, issue, status, detail, { ...options, gh: fakeGh }),
  mem: fakeMem,
  lifecycle: lifecycleAfterRestart,
});
check('mission de crash reprise', wdCrash.resumed === 1, JSON.stringify(wdCrash));
check('statut retrying publié pour la mission de crash', ghState.published.some(c => c.issue === 9404 && c.body.includes('**retrying**')));
check('opportunité remise en file sans doublon', memory.opportunities.filter(o => o.id === 'E2E-TASK-CRASH').length === 1);
check('mission de crash repassée à retrying', lifecycleAfterRestart.findByTaskId('E2E-TASK-CRASH').state === 'retrying');

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 11b : une mission SENSIBLE déjà enfilée est NEUTRALISÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// Faille fail-open corrigée : une mission importée AVANT l'existence du
// garde-fou restait `new` dans la queue et pouvait être exécutée par
// l'orchestrateur. Le pont doit maintenant la neutraliser.

console.log('=== ÉTAPE 11b : mission sensible déjà enfilée → neutralisée ===');
{
  const legacyTask = taskBlock({
    task_id: 'E2E-TASK-LEGACY-SENSITIVE',
    issue_number: 9505,
    title: 'Merger la PR paiement en production',
    diagnostic: 'Merger la PR qui touche le checkout, puis déployer en production.',
  });
  // L'opportunité « legacy » est DÉJÀ dans la queue (import antérieur).
  memory.opportunities.push({
    id: 'E2E-TASK-LEGACY-SENSITIVE',
    fingerprint: bridge.fingerprint(LOCAL, 9505, 'E2E-TASK-LEGACY-SENSITIVE'),
    title: legacyTask.title,
    type: 'agent-task',
    status: 'new',
    repository_full_name: LOCAL,
    issue_number: 9505,
  });
  ghState.repos[LOCAL].issues.push(issueOf(9505, legacyTask, LOCAL));

  const ingestLegacy = bridge.ingestMultiRepo({
    gh: fakeGh, log: () => {}, localRepo: LOCAL, queue: memory, saveQueue: () => {}, writeOpportunityFile: () => {},
  });
  check('mission sensible legacy comptée comme bloquée', ingestLegacy.blocked === 1, JSON.stringify(ingestLegacy.perRepo));
  check('mission sensible legacy NEUTRALISÉE dans la queue',
    memory.opportunities.find(o => o.id === 'E2E-TASK-LEGACY-SENSITIVE').status === 'blocked',
    JSON.stringify(memory.opportunities.find(o => o.id === 'E2E-TASK-LEGACY-SENSITIVE')));
  check('la neutralisation est signalée', ingestLegacy.neutralized === 1, JSON.stringify(ingestLegacy));
  check('la mission legacy n\'est PAS dupliquée',
    memory.opportunities.filter(o => o.id === 'E2E-TASK-LEGACY-SENSITIVE').length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPE 11c : verrou d'exécution (re-vérification du garde-fou)
// ═══════════════════════════════════════════════════════════════════════════

console.log('=== ÉTAPE 11c : verrou d\'exécution dans l\'orchestrateur ===');
{
  const orchestrator = require('./orchestrator.cjs');
  const sensitive = {
    id: 'E2E-TASK-EXEC-GATE',
    type: 'agent-task',
    title: 'déploiement',
    mission: { body: 'Déployer en production dès que possible.', comments: [] },
    task: { task_id: 'E2E-TASK-EXEC-GATE' },
  };
  const verdict = orchestrator.evaluateOpportunitySafety(sensitive);
  check('mission sensible bloquée au niveau exécution', verdict.blocked === true, JSON.stringify(verdict));
  const legit = {
    id: 'E2E-TASK-EXEC-OK',
    type: 'agent-task',
    title: 'correction de lien',
    mission: { body: 'Corriger le lien 404 de la page plage.', comments: [] },
    task: { task_id: 'E2E-TASK-EXEC-OK' },
  };
  check('mission légitime acceptée au niveau exécution',
    orchestrator.evaluateOpportunitySafety(legit).blocked === false);
  const frozen = {
    id: 'E2E-TASK-EXEC-FROZEN', type: 'agent-task', title: 'x',
    safety: { blocked: true, reason: 'verdict figé à l\'import' },
    mission: { body: 'mission sans danger', comments: [] }, task: {},
  };
  check('verdict figé à l\'import respecté',
    orchestrator.evaluateOpportunitySafety(frozen).blocked === true);
}

console.log(failures === 0 ? 'E2E-BRIDGE TESTS : OK (0 échec)' : `E2E-BRIDGE TESTS : ${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);

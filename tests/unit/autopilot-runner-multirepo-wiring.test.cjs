#!/usr/bin/env node
'use strict'

/**
 * tests/unit/autopilot-runner-multirepo-wiring.test.cjs
 *
 * Intégration EFFECTIVE du pont multi-dépôt dans la boucle Factory locale.
 *
 * Le pont `scripts/autopilot/multi-repo-bridge.cjs` est livré dans `main`
 * (PR #1349, merge 87702066a79c03ff930500a2bad524df58c1f6f7) mais il n'était
 * PAS branché : `scripts/autopilot/runner.cjs` chargeait encore `bridge.cjs`
 * et appelait `ingestOpenIssues()`. Les missions multi-dépôts n'étaient donc
 * jamais relayées et le poller local n'utilisait pas l'allowlist fermée.
 *
 * Ce test est 100 % déterministe et hors-ligne : aucun appel réseau, aucune
 * écriture sur le disque, aucun commentaire GitHub.
 *
 * Preuves :
 *   1. le runner charge `multi-repo-bridge.cjs` et appelle `ingestMultiRepo()` ;
 *   2. le runner n'appelle PLUS le pont mono-dépôt ;
 *   3. l'ingestion du runner reste NON BLOQUANTE (une panne du pont ne tue
 *      pas la factory) ;
 *   4. l'orchestrateur publie les statuts de cycle de vie (`started`,
 *      `completed`, `blocked`, `failed`) sur l'issue source, et jamais en
 *      mode `--dry` ;
 *   5. une mission AUTOPILOT de la forme de #1362 est importée et le statut
 *      `imported` est publié ;
 *   6. l'idempotence tient : un second passage n'importe RIEN et ne
 *      republie aucun statut ;
 *   7. une mission d'un AUTRE dépôt autorisé est RELAYÉE (jamais enfilée dans
 *      la queue locale) ;
 *   8. un dépôt hors allowlist ou une mission usurpant un autre dépôt est
 *      REJETÉE.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const runnerSrc = fs.readFileSync(path.join(ROOT, 'scripts/autopilot/runner.cjs'), 'utf8');
const orchSrc = fs.readFileSync(path.join(ROOT, 'scripts/autopilot/orchestrator.cjs'), 'utf8');
const bridge = require(path.join(ROOT, 'scripts/autopilot/multi-repo-bridge.cjs'));

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks++;
}

function makeTask(overrides) {
  return Object.assign({
    id: 'SARG-P1-TRUTHFUL-FRESHNESS-COPY-20261107',
    task_id: 'SARG-P1-TRUTHFUL-FRESHNESS-COPY-20261107',
    source: 'chatgpt',
    mode: 'agent',
    repository_full_name: 'aveca/sargagame',
    issue_number: 1362,
    priority: 'P1',
    confidence: 'observed',
    humanGate: false,
    moneyPath: false,
    title: 'Remove unsupported live and four-times-daily freshness claims across the six Sargasses sites',
    acceptance: 'copy honnete sur les six domaines',
    rollback: 'git revert du commit',
  }, overrides || {});
}

function issueBody(task) {
  return [
    'Mission relay for canonical tracker #1111.',
    '',
    '### AUTOPILOT_TASK',
    '```json',
    JSON.stringify(task, null, 2),
    '```',
    '',
  ].join('\n');
}

// ── 1-3. Câblage du runner ───────────────────────────────────────────────────

ok(
  /require\('\.\/multi-repo-bridge\.cjs'\)/.test(runnerSrc),
  "runner.cjs must require './multi-repo-bridge.cjs' (the multi-repo bridge must be the one wired into the Factory loop)"
);
ok(
  /multiRepoBridge\.ingestMultiRepo\(/.test(runnerSrc),
  'runner.cjs must call multiRepoBridge.ingestMultiRepo() to ingest AUTOPILOT missions'
);
ok(
  !/ingestOpenIssues\(/.test(runnerSrc),
  'runner.cjs must NOT call the single-repo bridge ingestOpenIssues() anymore'
);
ok(
  !/require\('\.\/bridge\.cjs'\)/.test(runnerSrc),
  "runner.cjs must NOT require the legacy single-repo './bridge.cjs' anymore"
);
ok(
  /bridge failed \(non-fatal\)/.test(runnerSrc),
  'the bridge step must stay non-blocking: a bridge failure must not crash the Factory cycle'
);
ok(
  /statusFailures/.test(runnerSrc),
  'the runner must report status publication failures instead of swallowing them'
);

// ── 4. Statuts de cycle de vie publiés par l'orchestrateur ───────────────────

ok(
  /function publishMissionStatus\(/.test(orchSrc),
  'orchestrator.cjs must expose publishMissionStatus() to correlate mission lifecycle on the source issue'
);
ok(
  /multiRepoBridge\.publishStatus\(/.test(orchSrc),
  'orchestrator.cjs must publish mission statuses through the multi-repo bridge publishStatus()'
);
for (const status of ['started', 'completed', 'blocked', 'failed']) {
  ok(
    orchSrc.includes(`'${status}'`),
    `orchestrator.cjs must be able to publish the '${status}' status`
  );
}
ok(
  /function publishMissionStatus\([^)]*\)\s*\{\s*if \(DRY\) return;/.test(orchSrc),
  'publishMissionStatus() must be a no-op in --dry mode (a dry-run has no side effect)'
);
ok(
  /publishMissionStatus\(opp\.id, 'started'/.test(orchSrc),
  'orchestrator.cjs must publish `started` when a mission is picked up'
);
ok(
  /publishMissionStatus\(oppId, missionStatusForPark\(safe\)/.test(orchSrc),
  'orchestrator.cjs must publish the terminal mission status when a task is parked'
);
ok(
  /publishMissionStatus\(opp && opp\.id, 'failed'/.test(orchSrc),
  'orchestrator.cjs must publish `failed` when execution throws'
);

// ── 5-8. Comportement du pont appelé par le runner ──────────────────────────

const sargagameIssue = {
  number: 1362,
  title: '[AUTOPILOT] SARG-P1-TRUTHFUL-FRESHNESS-COPY-20261107',
  url: 'https://github.com/aveca/sargagame/issues/1362',
  createdAt: '2026-11-07T20:44:00Z',
  body: issueBody(makeTask()),
};
const botwowIssue = {
  number: 125,
  title: '[AUTOPILOT] FACTORY-MULTIREPO-MISSION-RELAY-20261106',
  url: 'https://github.com/aveca/bot-wow/issues/125',
  createdAt: '2026-11-06T13:31:00Z',
  body: issueBody(makeTask({
    id: 'FACTORY-MULTIREPO-MISSION-RELAY-20261106',
    task_id: 'FACTORY-MULTIREPO-MISSION-RELAY-20261106',
    repository_full_name: 'aveca/bot-wow',
    issue_number: 125,
    title: 'Mission relay multi-repo',
  })),
};

const published = [];
const queue = { opportunities: [] };
let saved = 0;
let written = 0;

function fakeLoadIssues(repo) {
  if (repo === 'aveca/sargagame') return [sargagameIssue];
  if (repo === 'aveca/bot-wow') return [botwowIssue];
  return [];
}

const first = bridge.ingestMultiRepo({
  dry: false,
  log: () => {},
  localRepo: 'aveca/sargagame',
  loadIssues: fakeLoadIssues,
  queue,
  saveQueue: () => { saved++; },
  writeOpportunityFile: () => { written++; },
  publishStatus: (repo, issue, status, details) => {
    published.push({ repo, issue, status, details });
    return true;
  },
});

ok(first.imported === 1, 'the local mission must be imported exactly once');
ok(first.relayed === 1, 'the mission of the other allowed repository must be relayed');
ok(first.rejected === 0, 'no mission must be rejected');
ok(first.statusFailures === 0, 'no status publication must fail');
ok(queue.opportunities.length === 1, 'only the local mission may enter the local queue');
ok(queue.opportunities[0].id === 'SARG-P1-TRUTHFUL-FRESHNESS-COPY-20261107', 'the imported opportunity must carry the mission task id');
ok(
  typeof queue.opportunities[0].type === 'string' && queue.opportunities[0].type.length > 0,
  'the imported opportunity must carry a non-empty `type` — the orchestrator contract requires it and parks every mission without it as "contrat invalide: type manquant" BEFORE dispatch',
);
ok(
  !['ux-ui', 'browser-interaction', 'aha-wow', 'svg-assets-a11y'].some((k) => queue.opportunities[0].type.includes(k)),
  'the default type must not trigger the browser-recon routing (only ux-ui / browser-interaction / aha-wow / svg-assets-a11y do)',
);
ok(
  queue.opportunities[0].repository_full_name === 'aveca/sargagame' &&
  queue.opportunities[0].issue_number === 1362,
  'the imported opportunity must carry its source repository and issue (status correlation)'
);
ok(
  published.some(p => p.repo === 'aveca/sargagame' && p.issue === 1362 && p.status === 'imported'),
  'the `imported` status must be published on the source issue of the local mission'
);
ok(
  published.some(p => p.repo === 'aveca/bot-wow' && p.issue === 125 && p.status === 'imported'),
  'a relayed mission must get its `imported` status on ITS OWN repository issue'
);
ok(
  !queue.opportunities.some(o => o.repository_full_name === 'aveca/bot-wow'),
  'a mission of another repository must NEVER enter the local queue'
);

// ── 6. Idempotence : un second passage ne réimporte rien ────────────────────

const publishedBefore = published.length;
const second = bridge.ingestMultiRepo({
  dry: false,
  log: () => {},
  localRepo: 'aveca/sargagame',
  loadIssues: fakeLoadIssues,
  queue,
  saveQueue: () => { saved++; },
  writeOpportunityFile: () => { written++; },
  publishStatus: (repo, issue, status, details) => {
    published.push({ repo, issue, status, details });
    return true;
  },
});

ok(second.imported === 0, 'a known mission must never be imported twice');
ok(second.relayed === 0, 'a known relayed mission must never be relayed twice');
ok(queue.opportunities.length === 1, 'the queue must not grow on a second pass');
ok(published.length === publishedBefore, 'no status may be republished for an already known mission');

// ── 8. Rejets : dépôt hors allowlist / mission usurpatrice ──────────────────

ok(bridge.isAllowedRepo('aveca/bot-wow'), 'aveca/bot-wow is an allowed repository');
ok(bridge.isAllowedRepo('aveca/sargagame'), 'aveca/sargagame is an allowed repository');
ok(!bridge.isAllowedRepo('aveca/autre'), 'any other repository must be refused');

const impostor = {
  number: 1400,
  title: '[AUTOPILOT] IMPOSTOR',
  url: 'https://github.com/aveca/sargagame/issues/1400',
  createdAt: '2026-11-07T21:00:00Z',
  body: issueBody(makeTask({ id: 'IMPOSTOR', task_id: 'IMPOSTOR', repository_full_name: 'aveca/bot-wow' })),
};
const rejectQueue = { opportunities: [] };
const rejected = bridge.ingestMultiRepo({
  dry: false,
  log: () => {},
  localRepo: 'aveca/sargagame',
  loadIssues: (repo) => (repo === 'aveca/sargagame' ? [impostor] : []),
  queue: rejectQueue,
  saveQueue: () => {},
  writeOpportunityFile: () => {},
  publishStatus: () => true,
});
ok(rejected.rejected === 1, 'a mission declaring another repository must be rejected');
ok(rejected.imported === 0, 'a rejected mission must never be imported');
ok(rejectQueue.opportunities.length === 0, 'a rejected mission must never enter the queue');

// ── Le runner doit rester sûr : le pont est fail-closed sur dépôt inconnu ───

const outside = bridge.toOpportunity(makeTask({ repository_full_name: 'aveca/inconnu' }), { number: 1 }, 'aveca/inconnu');
ok(!!outside.rejected, 'toOpportunity() must reject a repository outside the allowlist');

// ── Le type déclaré par la mission est respecté tel quel ────────────────────

const declaredType = bridge.toOpportunity(
  makeTask({ id: 'TYPED', task_id: 'TYPED', type: 'ux-ui' }),
  { number: 7, url: 'https://github.com/aveca/sargagame/issues/7', createdAt: '2026-11-07T22:00:00Z' },
  'aveca/sargagame',
);
ok(declaredType.type === 'ux-ui', 'a type explicitly declared by the mission must be preserved (not overwritten by the generic default)');

const defaultType = bridge.toOpportunity(
  makeTask({ id: 'UNTYPED', task_id: 'UNTYPED' }),
  { number: 8, url: 'https://github.com/aveca/sargagame/issues/8', createdAt: '2026-11-07T22:00:00Z' },
  'aveca/sargagame',
);
ok(
  typeof defaultType.type === 'string' && defaultType.type.length > 0,
  'a mission without a declared type must still get a usable type',
);

// ── Les champs derivés doivent etre UTILISABLES par l'orchestrateur ────────
// L'hypothese UX exige `aha` >= 20 caracteres : un fallback 'n/a' (3
// caracteres) faisait parquer la mission « AHA insuffisamment defini ».

const derived = bridge.toOpportunity(
  makeTask({ id: 'DERIVED', task_id: 'DERIVED', acceptance: 'le texte de Verification honnete est retire des six domaines' }),
  { number: 9, url: 'https://github.com/aveca/sargagame/issues/9', createdAt: '2026-11-07T22:00:00Z' },
  'aveca/sargagame',
);
ok(
  typeof derived.expectedImpact === 'string' && derived.expectedImpact.length >= 20,
  'the derived expectedImpact (AHA) must be at least 20 characters — the UX hypothesis validation rejects shorter ones, which parked every imported mission before any work',
);
ok(
  derived.expectedImpact.includes('Verification honnete'),
  'the derived expectedImpact must reuse the mission acceptance when no metric is declared (honest, not a placeholder)',
);
ok(
  typeof derived.evidence === 'string' && derived.evidence.length >= 20,
  'the derived evidence must be long enough to document the problem',
);

console.log(`autopilot-runner-multirepo-wiring : ${checks} assertions OK`);
console.log('  - runner.cjs charge multi-repo-bridge.cjs et appelle ingestMultiRepo()');
console.log('  - runner.cjs n\'appelle plus ingestOpenIssues() (pont mono-dépôt)');
console.log('  - orchestrator.cjs publie started/completed/blocked/failed sur l\'issue source');
console.log('  - mission #1362 importée + statut `imported` publié ; idempotence prouvée');
console.log('  - mission d\'un autre dépôt relayée, jamais enfilée localement');

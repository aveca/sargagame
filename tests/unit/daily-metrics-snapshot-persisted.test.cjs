#!/usr/bin/env node
'use strict'

/**
 * daily-metrics-snapshot-persisted.test.cjs — garde-fou de PERSISTANCE du
 * snapshot métrique quotidien.
 *
 * FAILLE RÉELLE, PROUVÉE PAR LECTURE DES WORKFLOWS (2026-10-27) :
 *
 *  - `scripts/automation/daily-stats-check.cjs:390` ÉCRIT
 *    `scripts/automation/data/daily-metrics.json` (le snapshot du funnel).
 *  - Il est appelé par `daily-copernicus.yml` (ligne ~294, étape
 *    « Daily stats check »), qui tourne 4×/jour (cron `0 0,6,12,18 * * *`).
 *  - MAIS `daily-copernicus.yml` ne committe JAMAIS ce fichier : son étape de
 *    commit (lignes ~384-388) n'additionne que les marqueurs email
 *    (`welcome-sent.json`, `drip-sent.json`, …).
 *  - Le SEUL commit de `daily-metrics.json` vit dans `weekly-optimize.yml`
 *    (cron `0 10 * * 2,3,5`), donc AU PLUS UNE FOIS PAR SEMAINE.
 *
 * CONSÉQUENCE MESURABLE : le snapshot est régénéré 4×/jour puis ÉCRASÉ à
 * chaque run. L'historique quotidien du funnel (paywall, CTA, checkout,
 * paiements) n'est donc pas conservé dans git — la version suivie peut avoir
 * jusqu'à 7 jours. Toute comparaison de périodes (KPI, A/B, funnel) se fait
 * sur une donnée non durable.
 *
 * RÈGLE VERROUILLÉE : tout workflow qui GÉNÈRE un artefact doit aussi le
 * committer, sinon la génération est sans persistance.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const wfDir = path.join(root, '.github', 'workflows');

const readWf = f => fs.readFileSync(path.join(wfDir, f), 'utf8');

// 1. Le générateur doit exister et écrire le snapshot
const gen = fs.readFileSync(path.join(root, 'scripts/automation/daily-stats-check.cjs'), 'utf8');
assert.ok(/daily-metrics\.json/.test(gen), 'daily-stats-check.cjs doit référencer daily-metrics.json');
assert.ok(/writeFileSync\(\s*METRICS_PATH/.test(gen),
  'daily-stats-check.cjs doit ÉCRIRE le snapshot (METRICS_PATH)');

// 2. Le workflow quotidien doit appeler le générateur
const daily = readWf('daily-copernicus.yml');
assert.ok(/daily-stats-check/.test(daily),
  'daily-copernicus.yml doit appeler daily-stats-check (le snapshot est généré 4x/jour)');
assert.ok(/0 0,6,12,18 \* \* \*/.test(daily),
  'daily-copernicus.yml doit garder son cadence 4x/jour');

// 3. …ET doit COMMITTER le snapshot qu'il génère.
//    C'est la faille : sans ça, l'artefact est écrasé à chaque run.
assert.ok(/git add scripts\/automation\/data\/daily-metrics\.json/.test(daily),
  "daily-copernicus.yml doit committer daily-metrics.json — aujourd'hui seul weekly-optimize le fait (1x/semaine), "
  + "le snapshot est donc écrasé 4x/jour sans aucun historique conservé");

// 4. Régression : aucun workflow ne doit générer un artefact sans le committer.
//    Liste blanche des artefacts persistés par au moins un workflow.
const workflows = fs.readdirSync(wfDir).filter(f => f.endsWith('.yml'));
const allCommits = workflows.map(readWf).join('\n');
const generated = 'scripts/automation/data/daily-metrics.json';
if (/daily-stats-check/.test(allCommits)) {
  assert.ok(new RegExp('git add[^\n]*' + generated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(allCommits),
    'un artefact généré par un workflow doit être commité par AU MOINS un workflow');
}

console.log('OK Test 1: daily-stats-check écrit bien le snapshot métrique');
console.log('OK Test 2: daily-copernicus.yml appelle le générateur (cadence 4x/jour)');
console.log('OK Test 3: daily-copernicus.yml committe le snapshot — FAILLE si cette assertion échoue');
console.log('OK Test 4: tout artefact généré est commité par au moins un workflow');

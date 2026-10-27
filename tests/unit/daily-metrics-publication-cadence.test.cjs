#!/usr/bin/env node
'use strict'

/**
 * Cadence et persistance du snapshot métrique quotidien — architecture
 * CONSOLIDÉE (PR #1070 + garde de #1071).
 *
 * Règles verrouillées :
 *  1. Les QUATRE exécutions quotidiennes sont conservées (4 entrées cron
 *     distinctes — pas l'ancienne expression unique `0 0,6,12,18 * * *`).
 *  2. Le snapshot canonique n'est publié qu'une fois par date UTC, au run 18:00.
 *  3. La publication est une responsabilité SÉPARÉE du commit email, SANS
 *     `continue-on-error` : un échec définitif fait ÉCHOUER le workflow.
 *  4. La garde d'exploitabilité protège les deux formes réelles du snapshot.
 *  5. Les workflows hebdomadaires ne publient pas de snapshot concurrent.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
// Normalisation CRLF/LF : le checkout Windows peut basculer les fins de ligne,
// et un test greppant `schedule:\n` échouerait alors à tort.
const daily = fs.readFileSync(path.join(root, '.github/workflows/daily-copernicus.yml'), 'utf8').replace(/\r\n/g, '\n')
const weekly = fs.readFileSync(path.join(root, '.github/workflows/weekly-optimize.yml'), 'utf8').replace(/\r\n/g, '\n')

// ── 1. Cadence : 4 entrées cron distinctes conservées ──────────────────────
const schedule = (daily.match(/^  schedule:\n([\s\S]*?)(?=^  workflow_dispatch:)/m) || [])[1] || ''
for (const cron of ["0 0 * * *", "0 6 * * *", "0 12 * * *", "0 18 * * *"]) {
  assert.ok(schedule.includes(`- cron: '${cron}'`), `daily Copernicus schedule must retain ${cron}`)
}
// L'ancienne expression cron UNIQUE ne doit pas revenir.
assert.doesNotMatch(schedule, /0 0,6,12,18 \* \* \*/,
  "l ancienne expression cron unique 0 0,6,12,18 ne doit pas revenir")
console.log('OK 1: quatre exécutions quotidiennes conservées en entrées cron distinctes')

// ── 2. Le step de publication existe et cible le run 18:00 ─────────────────
assert.match(daily, /- name: Publish daily metrics snapshot/,
  'un step dédié « Publish daily metrics snapshot » doit exister')
assert.match(daily, /if: github\.event_name == 'schedule' && github\.event\.schedule == '0 18 \* \* \*'/,
  "la publication est réservée au run planifié de 18:00 UTC")
console.log('OK 2: snapshot publié uniquement sur le run 18:00 UTC')

// La collecte doit précéder la publication, et le même artefact doit traverser
// la garde, le staging, le commit puis le push. Cela vérifie le câblage réel,
// pas seulement l'existence d'un step portant le bon nom.
const statsStart = daily.indexOf('- name: Daily stats check (metrics + trend detection)')
const statsRun = daily.indexOf('run: node scripts/automation/daily-stats-check.cjs', statsStart)
const publishMarker = '- name: Publish daily metrics snapshot'
assert.ok(statsStart >= 0 && statsRun > statsStart && statsRun < daily.indexOf(publishMarker),
  'la collecte quotidienne doit précéder le step de publication')

const publishStart = daily.indexOf(publishMarker)
const publishEnd = daily.indexOf('- name: Commit email state', publishStart)
const publishStep = daily.slice(publishStart, publishEnd)
const guardIndex = publishStep.indexOf('if [ ! -f "$M" ] || ! node -e')
const stageIndex = publishStep.indexOf('git add "$M"')
const commitIndex = publishStep.indexOf('git commit -m "chore: daily metrics snapshot ${TODAY_UTC}"')
const pushIndex = publishStep.indexOf('git push origin "HEAD:$BRANCH"')
assert.ok(guardIndex >= 0 && guardIndex < stageIndex,
  'le snapshot doit être validé avant tout staging')
assert.ok(stageIndex < commitIndex && commitIndex < pushIndex,
  'le snapshot validé doit être stage, committé puis poussé dans cet ordre')
console.log('OK 2b: collecte → garde → staging → commit → push vérifiés')

// ── 3. Responsabilité séparée + échec NON silencieux ───────────────────────
// Le step de publication ne doit PAS avoir continue-on-error : sinon un échec
// définitif de publication laisse le workflow VERT (annotation ::error seule).
const stepStart = daily.indexOf('- name: Publish daily metrics snapshot')
const stepEnd = daily.indexOf('- name: Commit email state', stepStart)
assert.ok(stepStart >= 0 && stepEnd > stepStart, 'bornes du step de publication introuvables')
const step = daily.slice(stepStart, stepEnd)
assert.doesNotMatch(step, /^\s*continue-on-error:\s*true\s*$/m,
  "le step de publication ne doit PAS avoir la clé continue-on-error: true : un échec de publication doit faire échouer le workflow")
// L'échec définitif doit produire un exit NON NUL, pas une simple annotation.
assert.match(step, /push_ok" != "1"[\s\S]{0,400}?exit 1/,
  "un échec définitif de push doit produire exit 1 (une annotation ::error seule ne suffit pas)")
// Le commentaire d'échec doit être explicite.
assert.match(step, /::error title=Publication du snapshot métrique échouée/,
  "l'annotation d'erreur de publication doit exister")

// ── 4. La garde anti-écrasement (issue #1071) ──────────────────────────────
// Ne stager que si le snapshot est réellement exploitable.
assert.match(step, /GARDE d'exploitabilité/, 'la garde anti-écrasement doit être documentée')
assert.match(step, /Array\.isArray\(j\)\?\(j\[0\]\|\|\{\}\):j/,
  "la garde doit gérer les DEUX formes : tableau (le vrai fichier en est un, 13 éléments) ET objet")
assert.match(step, /if\(!has\('funnel','stripe','sessions','paywall','count'\)\)process\.exit\(4\)/,
  "la garde doit exiger des clés de mesure exploitables")
assert.match(step, /if \[ ! -f "\$M" \] \|\| ! node -e/, 'la garde doit vérifier la présence du fichier')

// ── 5. Le step email garde son rôle anti-doublon (continue-on-error légitime) ─
const emailStart = daily.indexOf('- name: Commit email state')
const emailEnd = daily.indexOf('- name: ', emailStart + 10)
const emailStep = daily.slice(emailStart, emailEnd)
assert.match(emailStep, /continue-on-error: true/,
  "le step email conserve son continue-on-error (l'email n'est pas critique)")
assert.doesNotMatch(emailStep, /git add scripts\/automation\/data\/daily-metrics\.json/,
  "le step email ne doit PLUS committer le snapshot — responsabilité séparée")
console.log('OK 3: publication = step séparé sans continue-on-error, échec définitif = exit 1')
console.log('OK 4: garde anti-écrasement (formes tableau ET objet gérées)')

// ── 6. Les workflows hebdomadaires ne publient pas de snapshot concurrent ───
assert.doesNotMatch(weekly, /git add[^\n]*scripts\/automation\/data\/daily-metrics\.json/,
  "un workflow hebdomadaire ne doit PAS publier de daily-metrics.json concurrent")
assert.match(weekly, /git reset -q -- scripts\/automation\/data\/daily-metrics\.json \|\| true/,
  "weekly-optimize doit explicitement désindexer le snapshot canonique")
for (const name of ['[Wednesday] Commit data quality snapshot', '[Saturday] Commit weekend data', '[Sunday] Commit Sunday data']) {
  assert.ok(weekly.includes(name), `weekly workflow must retain the ${name} job`)
}
console.log('OK 5: aucun snapshot concurrent publié par les workflows hebdomadaires')

// ── 7. Le VRAI fichier du dépôt doit passer la garde ───────────────────────
// On teste le fichier réel, pas seulement des fixtures : c'est un TABLEAU.
const realPath = path.join(root, 'scripts/automation/data/daily-metrics.json');
const raw = JSON.parse(fs.readFileSync(realPath, 'utf8'));
const asArray = Array.isArray(raw);
assert.ok(asArray, "le snapshot réel du dépôt doit être un tableau (vérifié : " + (asArray ? raw.length : 'objet') + " éléments)")
const first = asArray ? (raw[0] || {}) : raw;
const keys = Object.keys(first);
const measurable = keys.some(k => ['funnel','stripe','sessions','paywall','count'].some(m => k.toLowerCase().includes(m)));
assert.ok(measurable, "le premier élément du tableau réel doit porter une clé de mesure — trouvé : " + keys.slice(0,6).join(', '));
console.log('OK 6: le VRAI snapshot du dépôt (' + (asArray ? 'tableau ' + raw.length + ' éléments' : 'objet') + ') passe la garde')

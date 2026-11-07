#!/usr/bin/env node
'use strict';

/**
 * tests/unit/copernicus-dense-cadence.test.cjs — NON-RÉGRESSION de la
 * CADENCE DENSE Copernicus (mission P0 « Workers first, freshness »).
 *
 * OBJECTIF
 * --------
 * La publication satellite passe de 4 à 12 ticks par jour dans la fenêtre de
 * capture ERDDAP (00:00 → 02:45 UTC, un tick toutes les 15 min). Cette
 * densification NE DOIT PAS :
 *   1. multiplier les Travaux LOURDS (track-record, rapport MRR, emails de
 *      win-back) — sinon le fondateur reçoit 12 rapports MRR et 12 campagnes
 *      par jour, et le track-record public est régénéré 12 fois ;
 *   2. déclencher un SECOND run à 00:00 UTC (double fetch, double publication) ;
 *   3. marquer le track-record public « stale » sur un tick dense (le backtest
 *      y est SKIPPE, donc `outcome != 'success'` : sans garde, le track-record
 *      serait marqué stale 12 fois par jour alors que rien n'a échoué) ;
 *   4. élargir le SLA de fraîcheur (900 min) — la densification le RESSERRE.
 *
 * Le test verrouille ces quatre règles au niveau du CLASSIFIER (sans horloge :
 * `--now` est injecté) ET du câblage du workflow (les `if:` réels).
 */

const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..', '..')
const {
  FAMILIES,
  DENSE_SCHEDULE,
  CANONICAL_SCHEDULES,
  DENSE_CANONICAL_TOLERANCE_MINUTES,
  classifyPublicationSlot
} = require('../../scripts/lib/copernicus-publication-slot.cjs')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const at = (iso) => Date.parse(iso)

// ── 1. Classification du slot ─────────────────────────────────────────────
// 1a. Famille dense : 12 ticks/jour, un seul est canonique (00:00 UTC).
const denseTicks = [
  '2026-11-07T00:00:00Z', '2026-11-07T00:15:00Z', '2026-11-07T00:30:00Z',
  '2026-11-07T00:45:00Z', '2026-11-07T01:00:00Z', '2026-11-07T01:15:00Z',
  '2026-11-07T01:30:00Z', '2026-11-07T01:45:00Z', '2026-11-07T02:00:00Z',
  '2026-11-07T02:15:00Z', '2026-11-07T02:30:00Z', '2026-11-07T02:45:00Z'
]
for (const iso of denseTicks) {
  const slot = classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: at(iso) })
  t(slot.family === FAMILIES.DENSE, 'tick dense ' + iso + ' : famille dense')
}
const canonicalDense = denseTicks.filter(iso =>
  classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: at(iso) }).canonical
)
t(canonicalDense.length === 1 && canonicalDense[0] === '2026-11-07T00:00:00Z',
  'un seul tick dense est canonique : 00:00 UTC (retrouve : ' + canonicalDense.join(', ') + ')')

// 1b. Tolérance de retard de l'ordonnanceur : le tick 00:00 reste canonique
//     s'il démarre avec quelques minutes de retard, mais le tick 00:15 JAMAIS.
t(classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: at('2026-11-07T00:07:00Z') }).canonical === true,
  'tick dense 00:00 retardé de 7 min : toujours canonique')
t(classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: at('2026-11-07T00:15:00Z') }).canonical === false,
  'tick dense 00:15 : jamais canonique')
t(DENSE_CANONICAL_TOLERANCE_MINUTES < 15,
  'la tolérance (' + DENSE_CANONICAL_TOLERANCE_MINUTES + ' min) reste inférieure à l\'écart entre deux ticks (15 min)')
t(classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: at('2026-11-07T01:00:00Z') }).canonical === false,
  'tick dense 01:00 (autre heure) : jamais canonique')

// 1c. Créneaux canoniques historiques : toujours canoniques.
for (const cron of CANONICAL_SCHEDULES) {
  const slot = classifyPublicationSlot({ eventName: 'schedule', schedule: cron, now: at('2026-11-07T06:00:00Z') })
  t(slot.family === FAMILIES.CANONICAL && slot.canonical === true, 'créneau canonique ' + cron + ' : canonique')
}
t(!CANONICAL_SCHEDULES.includes('0 0 * * *'),
  '00:00 UTC n est PAS un cron autonome (il est dans la famille dense : pas de doublon)')

// 1d. Manual et push.
t(classifyPublicationSlot({ eventName: 'workflow_dispatch', schedule: '', now: at('2026-11-07T13:37:00Z') }).canonical === true,
  'exécution manuelle : canonique (refresh à la demande = publication complète)')
t(classifyPublicationSlot({ eventName: 'push', schedule: '', now: at('2026-11-07T09:00:00Z') }).canonical === false,
  'push de code : jamais canonique')

// 1e. Fail-closed : cron inconnu, événement inconnu, horloge invalide.
t(classifyPublicationSlot({ eventName: 'schedule', schedule: '0 3 * * *', now: at('2026-11-07T03:00:00Z') }).canonical === false,
  'cron inconnu : jamais canonique (fail-closed)')
t(classifyPublicationSlot({ eventName: 'unknown_event', schedule: DENSE_SCHEDULE, now: at('2026-11-07T00:00:00Z') }).canonical === false,
  'événement inconnu : jamais canonique (fail-closed)')
t(classifyPublicationSlot({ eventName: 'schedule', schedule: DENSE_SCHEDULE, now: 'not-a-date' }).canonical === false,
  'horloge invalide : jamais canonique (fail-closed)')

// ── 2. Câblage du workflow ────────────────────────────────────────────────
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/daily-copernicus.yml'), 'utf8').replace(/\r\n/g, '\n')
const scheduleBlock = (workflow.match(/^  schedule:\n([\s\S]*?)(?=^  workflow_dispatch:)/m) || [])[1] || ''

t(scheduleBlock.includes("- cron: '*/15 0-2 * * *'"), 'le workflow déclare la famille dense (15 min, 00:00 → 02:45 UTC)')
for (const cron of ["0 6 * * *", "0 12 * * *", "0 18 * * *"]) {
  t(scheduleBlock.includes("- cron: '" + cron + "'"), 'le workflow conserve le créneau canonique ' + cron)
}
t(!/- cron: '0 0 \* \* \*'/.test(scheduleBlock), 'pas de doublon 00:00 UTC dans le workflow')
t(!/0 0,6,12,18 \* \* \*/.test(scheduleBlock), 'pas de retour de l\'expression cron unique')

// Le step de calcul du slot existe et appelle la source unique.
t(workflow.includes('id: slot'), 'le workflow calcule un slot (id: slot)')
t(workflow.includes('node scripts/automation/compute-publication-slot.cjs'), 'le workflow appelle le calculateur de slot')
t((workflow.match(/id: slot/g) || []).length === 2,
  'le slot est calculé dans fetch-data ET dans revenue-metrics (job autonome)')

// Les jobs LOURDS sont bornés au créneau canonique.
t(/if: steps\.src\.outputs\.source != 'none' && steps\.verify\.outcome == 'success' && steps\.slot\.outputs\.canonical == 'true'/.test(workflow),
  'le backtest du track-record ne tourne que sur un créneau canonique')
t(/steps\.public_track_record_backtest\.outcome != 'success' \|\| steps\.public_track_record_build\.outcome != 'success'\) && steps\.slot\.outputs\.canonical == 'true'/.test(workflow),
  'le marquage « stale » du track-record ne se déclenche PAS sur un tick dense')
t(/needs\.fetch-data\.outputs\.canonical == 'true'/.test(workflow),
  'email-automation (emails win-back) ne tourne que sur un créneau canonique')
t(/if: steps\.slot\.outputs\.canonical == 'true'\n\s+continue-on-error: true\n\s+env:\n\s+MOLLIE_API_KEY/.test(workflow),
  'le rapport MRR (mollie-mrr.cjs --send) ne tourne que sur un créneau canonique')
t(/if: always\(\) && github\.event_name != 'push' && steps\.slot\.outputs\.canonical == 'true'/.test(workflow),
  'le commit des rapports de mesure est borné au créneau canonique')

// La publication rapide (fetch + gate + publication + dispatch) reste ACTIVE
// sur les ticks denses : c'est tout l'intérêt de la densification.
const fetchJob = (workflow.match(/^  fetch-data:\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\n)/m) || [])[1] || ''
t(!/if: steps\.slot\.outputs\.canonical/.test(fetchJob.split('Commit + push des données Copernicus')[0].split('Backtest forecast accuracy')[1] || ''),
  'la CHAÎNE DE PUBLICATION (fetch, gate, publish, dispatch) n est PAS bornée au créneau canonique')
t(fetchJob.includes('- name: Commit + push des données Copernicus'), 'la publication des données reste dans fetch-data')
t(fetchJob.includes('- name: Déclenche la chaîne CI + déploiement'), 'le dispatch de la chaîne CI + déploiement reste dans fetch-data')
t(!/steps\.slot\.outputs\.canonical/.test(fetchJob.split('- name: Déclenche la chaîne CI + déploiement')[1] || ''),
  'le dispatch n est PAS borné au créneau canonique (c est la densification)')

// Le job revenue-metrics reste AUTONOME (règle du repo : aucun `needs:`).
const revenueJob = (workflow.match(/^  revenue-metrics:\n([\s\S]*?)(?=^  [a-zA-Z0-9_-]+:\n)/m) || [])[1] || ''
t(!/^\s*needs:/m.test(revenueJob), 'revenue-metrics reste autonome (aucun needs:)')
t(/if: github\.event_name == 'schedule'/.test(revenueJob), 'revenue-metrics ne tourne que sur schedule')

// ── 3. Le SLA produit reste à 900 min ─────────────────────────────────────
const freshnessGate = fs.readFileSync(path.join(ROOT, 'scripts/autopilot/check-predeploy-satellite-freshness.cjs'), 'utf8')
t(/MAX_AGE_MINUTES\s*=\s*900/.test(freshnessGate), 'le gate pré-déploiement conserve MAX_AGE_MINUTES = 900 (SLA inchangé)')
const observationFreshness = fs.readFileSync(path.join(ROOT, 'src/observation-freshness.js'), 'utf8')
t(/ageMinutes\s*>\s*900/.test(observationFreshness), 'le helper produit conserve le seuil de 900 min')

console.log('\nCOPERNICUS_DENSE_CADENCE_TESTS PASS (' + n + ' assertions)')

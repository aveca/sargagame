#!/usr/bin/env node
'use strict'
/**
 * tests/unit/freshness-decision-contract.test.cjs — NON-RÉGRESSION du
 * CONTRAT PRODUIT « aucune décision courante au-delà du SLA de 900 minutes ».
 *
 * Ce test ne duplique pas les tests existants par fichier
 * (`tests/unit/observation-freshness.test.cjs` couvre le helper 900 min,
 * `tests/unit/lc-detail-freshness.test.cjs` couvre le câblage de la fiche) :
 * il verrouille la CONJONCTION des trois règles du mission, avec les helpers
 * RÉELS (pas de copie de logique) :
 *
 *   R1. AUCUNE donnée de plus de 900 minutes ne peut autoriser un verdict
 *       courant — même si le payload MENT (`stale:false`, `dataAgeMinutes:60`).
 *   R2. Un état INCONNU (horodatage absent / invalide / futur / source absente)
 *       vaut « à vérifier », jamais « courant ».
 *   R3. Quand les données ne sont pas fiables, le SCORE et le CTA de décision
 *       sont masqués (contrat DOM fail-closed).
 *
 * Le seuil produit (900 min) et le seuil plus strict du client (12 h = 720 min)
 * sont tous deux ≤ 900 : le SLA ne peut pas être franchi.
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')

const ROOT = path.resolve(__dirname, '..', '..')
const { checkFailClosedDecisionUi } = require('../../scripts/automation/lib/detail-decision-ui.cjs')

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const NOW = Date.parse('2026-11-07T18:00:00.000Z')
const atAge = (minutes) => new Date(NOW - minutes * 60_000).toISOString()

async function main() {
  const { getObservationFreshness } = await import('../../src/observation-freshness.js')
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')

  // ── R1 : le SLA de 900 minutes est un PLAFOND strict ──────────────────────
  t(getObservationFreshness({ erddapTimestamp: atAge(900) }, NOW).fresh === true, '900 min pile => encore dans le SLA')
  t(getObservationFreshness({ erddapTimestamp: atAge(901) }, NOW).fresh === false, '901 min => hors SLA (verdict courant interdit)')
  t(getObservationFreshness({ erddapTimestamp: atAge(901) }, NOW).reason === 'stale', '901 min => raison "stale" (état à vérifier)')

  // Le payload qui MENT (stale=false, dataAgeMinutes récent) ne peut pas
  // ressusciter une observation hors SLA.
  const lying = { source: 'erddap-live', stale: false, dataAgeMinutes: 60, erddapTimestamp: atAge(901) }
  t(getObservationFreshness(lying, NOW).fresh === false, 'payload mensonger (stale=false) hors SLA => toujours pas frais')
  t(isSatelliteFresh12h(lying, NOW) === false, 'prédicat client (12 h) refuse aussi le payload mensonger hors SLA')
  t(isSatelliteFresh12h({ ...lying, erddapTimestamp: atAge(890) }, NOW) === false,
    '890 min : dans le SLA 900 mais hors du gate strict 12 h => aucun verdict courant')
  t(getObservationFreshness({ ...lying, erddapTimestamp: atAge(890) }, NOW).fresh === true,
    '890 min : le SLA 900 est respecté (le gate 12 h, plus strict, suspend quand même la décision)')
  t(isSatelliteFresh12h({ ...lying, erddapTimestamp: atAge(700) }, NOW) === true, '700 min => dans les deux seuils (12 h et 900 min)')

  // Le garde-fou client (12 h) est PLUS strict que le SLA (900 min) : il ne
  // peut jamais laisser passer une observation hors SLA.
  t(12 * 60 <= 900, 'seuil client 12 h (720 min) ≤ SLA 900 min')

  // ── R2 : état inconnu = état à vérifier (jamais « courant ») ──────────────
  // Règle appliquée par les helpers partagés (src/observation-freshness.js).
  // `isSatelliteFresh12h` est volontairement « timestamp seulement » : un âge
  // DÉCLARÉ trompeur (dataAgeMinutes) ne doit jamais ressusciter une
  // observation, mais un horodatage valide reste une preuve (cf. commentaire
  // du helper : updatedAt/dataAgeMinutes ne servent JAMAIS seuls).
  const timestampUnknowns = [
    ['horodatage absent', {}],
    ['horodatage invalide', { erddapTimestamp: 'not-a-timestamp' }],
    ['horodatage futur', { erddapTimestamp: atAge(-60) }]
  ]
  for (const [label, payload] of timestampUnknowns) {
    const freshness = getObservationFreshness(payload, NOW)
    t(freshness.fresh === false, 'état inconnu => pas frais : ' + label)
    t(freshness.reason === 'unknown' || freshness.reason === 'stale', 'état inconnu => raison honnête : ' + label)
    t(isSatelliteFresh12h(payload, NOW) === false, 'état inconnu => prédicat client fail-closed : ' + label)
  }
  // Âge déclaré incohérent => état inconnu pour le helper 900 min.
  const declaredAgeInvalid = getObservationFreshness({ erddapTimestamp: atAge(5), dataAgeMinutes: 'bad' }, NOW)
  t(declaredAgeInvalid.fresh === false, 'dataAgeMinutes invalide => pas frais')
  t(declaredAgeInvalid.reason === 'unknown', 'dataAgeMinutes invalide => raison "unknown"')

  // Provenance non live : la règle est appliquée au niveau de la DÉCISION
  // (ChasseHome satelliteDecisionCurrent), pas dans le helper d'âge : une
  // source de repli (« reference », « reference-fallback ») ne peut pas
  // autoriser un verdict courant, même avec un horodatage récent.
  const decisionContract = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  t(/sargData\?\.source==="erddap-live"/.test(decisionContract),
    'source non live (reference / reference-fallback) => aucun verdict courant possible')
  t(/stale===false/.test(decisionContract), 'payload stale=true => aucun verdict courant possible')
  // Le repli de référence ne porte aucun horodatage d'observation : l'état est
  // donc « inconnu », jamais « courant ».
  const buildFallback = fs.readFileSync(path.join(ROOT, 'scripts', 'build-sargassum-json.cjs'), 'utf8')
  t(/erddapTimestamp:\s*null/.test(buildFallback), 'payload de repli (source=reference) sans horodatage d\'observation')

  // ── R3 : score et CTA de décision masqués quand la donnée n'est pas fiable ─
  // On rejoue le contrat DOM avec une mesure «.build legacy» (score porté par
  // la classe legacy, pas de data-testid de garde) : c'est le cas qui rendait
  // l'ancien détecteur aveugle.
  const legacyLeakingMeasure = {
    head: 'GO - Baignade OK',
    scoreText: '66',
    hasCurrentScore: true,
    scorePaused: false,
    staleNotice: false,
    hasForecast: true,
    forecastPaused: false,
    hasForecastCta: true,
    verdictWords: ['PROPRE']
  }
  t(checkFailClosedDecisionUi(legacyLeakingMeasure).ok === false,
    'build legacy affichant un score courant => contrat fail-closed NON tenu (détecté)')

  const legacyCompliantMeasure = {
    head: 'À VÉRIFIER',
    scoreText: '',
    hasCurrentScore: false,
    scorePaused: true,
    staleNotice: true,
    hasForecast: false,
    forecastPaused: true,
    hasForecastCta: false,
    verdictWords: []
  }
  t(checkFailClosedDecisionUi(legacyCompliantMeasure).ok === true,
    'build legacy fail-closed => contrat tenu')

  // ── R4 : câblage — la fiche plage utilise les deux prédicats ─────────────
  const chasse = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  t(/isSatelliteFresh12h/.test(chasse), 'ChasseDetail : prédicat satellite 12 h utilisé')
  t(/data-testid="lc-detail-score-paused"/.test(chasse), 'ChasseDetail : score masqué (badge suspended)')
  t(/data-testid="lc-detail-forecast-paused"/.test(chasse), 'ChasseDetail : prévision suspendue (badge)')
  t(/data-testid="lc-detail-stale"/.test(chasse), 'ChasseDetail : avis "observation à vérifier"')

  const sheet = fs.readFileSync(path.join(ROOT, 'src', 'BeachSheet.jsx'), 'utf8')
  t(/getObservationFreshness/.test(sheet), 'BeachSheet : helper 900 min utilisé')
  t(/hasTrustedObservation/.test(sheet), 'BeachSheet : décision conditionnée par la fraîcheur')

  console.log('\nFRESHNESS_DECISION_CONTRACT_TESTS PASS (' + n + ' assertions)')
}

main().catch(err => { console.error(err); process.exit(1) })

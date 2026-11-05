#!/usr/bin/env node
'use strict'
/**
 * satellite-freshness-sla.test.cjs — verrouillage des seuils de fraîcheur
 * (mission P0.118 §9).
 *
 * Deux seuils distincts, souvent confondus :
 *   - SAT_STALE_HOURS = 36 h : le MARQUEUR PUBLIC « donnée périmée » du payload
 *     (inchangé, contrat de publication).
 *   - OPERATIONAL_SLA_MINUTES = 900 : le SLA OPÉRATIONNEL, plus strict, qui
 *     autorise un envoi programmé (Morning Brief / alertes). Il ne doit JAMAIS
 *     être abaissé.
 *   - La garde UI (isSatelliteFresh12h) est à 720 min : encore plus stricte,
 *     elle ne peut donc pas élargir le SLA opérationnel.
 */

const assert = require('node:assert/strict')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const {
  SAT_STALE_HOURS,
  OPERATIONAL_SLA_MINUTES,
  satelliteFreshness,
  operationalSatelliteFreshness,
  refreshSatellitePayload
} = require(path.join(ROOT, 'scripts', 'lib', 'satellite-freshness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const NOW = Date.parse('2026-11-04T12:00:00.000Z')
const at = (minutes) => new Date(NOW - minutes * 60_000).toISOString()

async function main() {
  // 1. Seuils
  t(SAT_STALE_HOURS === 36, 'seuil PUBLIC inchangé : 36 h')
  t(OPERATIONAL_SLA_MINUTES === 900, 'SLA opérationnel : 900 minutes (jamais abaissé)')
  t(OPERATIONAL_SLA_MINUTES < SAT_STALE_HOURS * 60, 'le SLA opérationnel est plus strict que le marqueur public')

  // 2. Marqueur public : fail-closed sur timestamp absent / invalide / futur.
  t(satelliteFreshness(undefined, NOW).stale === true, 'timestamp absent => stale=true (fail-closed)')
  t(satelliteFreshness('not-a-date', NOW).stale === true, 'timestamp invalide => stale=true')
  t(satelliteFreshness(at(-60), NOW).stale === true, 'timestamp futur => stale=true')
  t(satelliteFreshness(at(36 * 60 - 1), NOW).stale === false, '36 h - 1 min => pas encore stale (public)')
  t(satelliteFreshness(at(36 * 60 + 1), NOW).stale === true, '36 h + 1 min => stale (public)')

  // 3. SLA opérationnel : frontière exacte à 900 min.
  const inside = operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: at(900) }, NOW)
  t(inside.fresh === true, '900 min exactement => frais (opérationnel)')
  const outside = operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: at(901) }, NOW)
  t(outside.fresh === false, '901 min => hors SLA opérationnel')
  t(outside.reason === 'observation-outside-operational-sla', 'le motif de refus est explicite')

  // 4. SLA opérationnel : fail-closed (provenance + horodatage).
  t(operationalSatelliteFreshness({ source: 'cached-fallback', erddapTimestamp: at(1) }, NOW).fresh === false, 'source non live => refus')
  t(operationalSatelliteFreshness({ source: 'erddap-live' }, NOW).fresh === false, 'observation absente => refus')
  t(operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: at(-1) }, NOW).fresh === false, 'observation future => refus')
  t(operationalSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: 'bad' }, NOW).fresh === false, 'observation invalide => refus')

  // 5. Le SLA ignore le cache (dataAgeMinutes / stale / updatedAt figés).
  const frozen = operationalSatelliteFreshness({
    source: 'erddap-live', erddapTimestamp: at(2000), dataAgeMinutes: 1, stale: false, updatedAt: at(1)
  }, NOW)
  t(frozen.fresh === false, 'le SLA opérationnel ignore le dataAgeMinutes/stale/updatedAt figés')
  t(frozen.ageMinutes === 2000, 'l\'âge opérationnel vient de l\'observation')

  // 6. refreshSatellitePayload conserve le contrat public (36 h) et ne touche
  //    qu'aux deux métadonnées de fraîcheur.
  const payload = { source: 'erddap-live', erddapTimestamp: at(100), levels: [{ id: 'mq001' }], scores: { mq001: 12 } }
  const refreshed = refreshSatellitePayload({ ...payload }, NOW)
  t(refreshed.dataAgeMinutes === 100, 'refreshSatellitePayload calcule dataAgeMinutes')
  t(refreshed.stale === false, 'refreshSatellitePayload conserve le marqueur public')
  t(JSON.stringify(refreshed.levels) === JSON.stringify(payload.levels), 'levels inchangés')
  t(JSON.stringify(refreshed.scores) === JSON.stringify(payload.scores), 'scores inchangés')

  // 7. La garde UI (720 min) est plus stricte que le SLA opérationnel (900) :
  //    elle ne peut donc jamais élargir la fenêtre d'autorisation.
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')
  t(isSatelliteFresh12h({ erddapTimestamp: at(719) }, NOW) === true, 'garde UI : 719 min => décision courante possible')
  t(isSatelliteFresh12h({ erddapTimestamp: at(721) }, NOW) === false, 'garde UI : 721 min => aucune décision courante')
  t(12 * 60 < OPERATIONAL_SLA_MINUTES, 'la garde UI (720 min) est plus stricte que le SLA opérationnel (900 min)')

  console.log(`\nSATELLITE_FRESHNESS_SLA_TESTS PASS (${n} assertions)`)
}

main().catch(err => { console.error(err); process.exit(1) })

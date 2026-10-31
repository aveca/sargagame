#!/usr/bin/env node
// tests/unit/worldmap-pill-freshness.test.cjs — régression mission #39
// (worldmap-pill-freshness-gate-20261013-001) : la pill de WorldMapView affichait
// « EN DIRECT » pour toute observation de 0 à 36 h via un prédicat local isStale(36h),
// divergent du contrat fraîcheur 12h. Le fix remplace le prédicat local par les
// prédicats partagés (isSatelliteFresh12h / isSatelliteStale36h) calculés sur
// l'observation erddapTimestamp passée en prop dédiée par l'appelant.
// Ce test verrouille :
//  1. <12h  → LIVE autorisé (comportement conservé) ;
//  2. =12h exact → PLUS de LIVE (bordure stricte du prédicat partagé) ;
//  3. 16-17h → pas de LIVE, âge réel affiché ;
//  4. 36-40h → pas de LIVE (péremption) ;
//  5. horodatage absent → aucun LIVE inventé, fallback « ··· » ;
//  6. horodatage invalide → idem ;
//  7. horodatage futur → idem ;
//  8. cohérence mixte : label ET âge de la pill dérivent tous deux de l'observation
//     erddap (source : prop erddapTimestamp câblée depuis Sargasses_PROD.jsx),
//     aucune lecture updatedAt pour ce libellé ;
//  + traductions FR/EN/ES présentes, autres surfaces fraîcheur intactes.
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')

const now = Date.parse('2026-10-13T04:00:00.000Z')
let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

async function main() {
  const { isSatelliteFresh12h, isSatelliteStale36h, satelliteFreshnessStatus } = await import('../../src/lib/format-freshness.mjs')
  const { mapDecisionFreshness } = await import('../../src/lib/map-decision-freshness.mjs')

  // 1. Mesure récente <12h : LIVE autorisé.
  const fresh = { erddapTimestamp: new Date(now - 3 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(fresh, now) === true, '<12h (3h) => isSatelliteFresh12h true (observation satellite fraîche)')
  t(satelliteFreshnessStatus(fresh, 'fr', now) === 'SATELLITE À JOUR', '<12h => statut satellite à jour')
  t(satelliteFreshnessStatus(fresh, 'en', now) === 'SATELLITE CURRENT', '<12h => label anglais')
  t(satelliteFreshnessStatus(fresh, 'es', now) === 'SATÉLITE AL DÍA', '<12h => label espagnol')

  // 2. Seuil exact 12h : PLUS de LIVE (bordure stricte).
  const edge = { erddapTimestamp: new Date(now - 12 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(edge, now) === false, '=12h exact => isSatelliteFresh12h false (plus de EN DIRECT)')

  // 3. 16-17h (la plainte production) : pas de LIVE, âge réel.
  const delayed = { erddapTimestamp: new Date(now - 17 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(delayed, now) === false, '17h => isSatelliteFresh12h false (pas de EN DIRECT)')
  t(isSatelliteStale36h(delayed, now) === false, '17h => isSatelliteStale36h false (fenêtre 12-36h)')
  t(satelliteFreshnessStatus(delayed, 'fr', now) === 'MESURE SATELLITE', '12–36h => âge montré sans alarme globale « donnée en retard »')
  t(satelliteFreshnessStatus(delayed, 'en', now) === 'SATELLITE READING', '12–36h => libellé anglais neutre')
  t(satelliteFreshnessStatus(delayed, 'es', now) === 'MEDICIÓN SATELITAL', '12–36h => libellé espagnol neutre')

  // 4. 36-40h : péremption.
  const old = { erddapTimestamp: new Date(now - 40 * 3.6e6).toISOString() }
  t(isSatelliteStale36h(old, now) === true, '40h => isSatelliteStale36h true (observation satellite en retard)')
  t(satelliteFreshnessStatus(old, 'fr', now) === 'SATELLITE EN RETARD', '>=36h => alerte explicitement attribuée au satellite')
  t(satelliteFreshnessStatus(old, 'en', now) === 'SATELLITE DELAYED', '>=36h => label retard anglais')
  t(satelliteFreshnessStatus(old, 'es', now) === 'SATÉLITE ATRASADO', '>=36h => label retard espagnol')

  // 5. Horodatage absent : aucun LIVE inventé.
  t(isSatelliteFresh12h({}, now) === false, 'absent => isSatelliteFresh12h false (fallback honnête)')
  t(isSatelliteStale36h({}, now) === false, 'absent => isSatelliteStale36h false (fallback honnête)')
  t(satelliteFreshnessStatus({}, 'fr', now) === 'Vérification', 'horodatage absent => vérification, aucune fraîcheur inventée')
  t(satelliteFreshnessStatus({ erddapTimestamp: new Date(now + 3.6e6).toISOString() }, 'fr', now) === 'Vérification', 'horodatage futur => vérification')

  // 6. Horodatage invalide.
  t(isSatelliteFresh12h({ erddapTimestamp: 'not-a-timestamp' }, now) === false, 'invalide => pas de LIVE')
  t(isSatelliteStale36h({ erddapTimestamp: 'not-a-timestamp' }, now) === false, 'invalide => pas de statut périmé affirmé')

  // 7. Horodatage futur.
  t(isSatelliteFresh12h({ erddapTimestamp: new Date(now + 3.6e6).toISOString() }, now) === false, 'futur => pas de LIVE')

  // 8. Carte : un verdict n'est disponible que si l'horodatage satellite est
  //    prouvé et <36h. Un updatedAt identique signale le fallback historique du parent.
  const mapNow = Date.parse('2026-10-31T14:30:00.000Z')
  const atAge = hours => new Date(mapNow - hours * 3.6e6).toISOString()
  const mapFresh = mapDecisionFreshness(atAge(3), atAge(2), mapNow)
  t(mapFresh.available === true && mapFresh.reason === 'available', 'carte : observation 3h + publication distincte => décisions disponibles')
  const mapRecent = mapDecisionFreshness(atAge(20), atAge(1), mapNow)
  t(mapRecent.available === true, 'carte : 12–36h conserve les statuts avec âge explicite')
  const mapEdge = mapDecisionFreshness(atAge(36), atAge(1), mapNow)
  t(mapEdge.available === false && mapEdge.reason === 'stale', 'carte : seuil 36h exact => décisions suspendues')
  const mapOld = mapDecisionFreshness(atAge(98), atAge(1), mapNow)
  t(mapOld.available === false && mapOld.reason === 'stale', 'carte : observation 98h => décisions suspendues')

  const mapFallback = mapDecisionFreshness(atAge(3), atAge(3), mapNow)
  t(mapFallback.available === false && mapFallback.reason === 'publication-fallback' && mapFallback.timestamp === null, 'carte : updatedAt réutilisé comme erddapTimestamp => inconnu, fail-closed')
  t(mapDecisionFreshness(null, atAge(1), mapNow).reason === 'unknown', 'carte : observation absente malgré publication récente => inconnue')
  t(mapDecisionFreshness('invalid', atAge(1), mapNow).available === false, 'carte : horodatage invalide => aucune décision')
  t(mapDecisionFreshness(atAge(-1), atAge(-2), mapNow).available === false, 'carte : horodatage futur => aucune décision')

  // 9. Câblage source : la pill consomme la prop erddapTimestamp (venue de l'appelant),
  //    les prédicats partagés, et le prédicat local isStale(36h) est supprimé.
  const wm = fs.readFileSync(path.join(ROOT, 'src', 'WorldMapView.jsx'), 'utf8')
  const lib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')
  t(wm.includes('satelliteFreshnessStatus') && wm.includes('format-freshness.mjs'), 'WorldMapView utilise le statut partagé de fraîcheur satellite')
  t(!/function isStale\(/.test(wm), 'prédicat local isStale(36h) supprimé de WorldMapView')
  t(/wmSatLbl\s*=\s*satelliteFreshnessStatus\(\{\s*erddapTimestamp:\s*wmSatObservationTimestamp\s*\},\s*lang\)/.test(wm), 'label pill précise la fraîcheur de la seule source satellite validée')
  t(/wmSatDotColor/.test(wm) && /animation:\(!wmSatFresh\|\|noAnim\)\?"none"/.test(wm), 'point vert animé uniquement quand le satellite a moins de 12h')
  t(/wmSatAgeColor\s*=\s*wmSatStale\s*\?\s*"#B87A00"\s*:\s*wmSatFresh\s*\?\s*"#00786C"\s*:\s*"#667085"/.test(wm), 'couleur neutre entre 12h et 36h, ambre uniquement après 36h')
  t(/formatFreshnessAge\(wmSatObservationTimestamp,\s*lang\)/.test(wm), 'âge pill = formatFreshnessAge(observation satellite validée), jamais updatedAt seul')
  t(/wmSatAge\s*=\s*wmSatValid\s*\?\s*formatFreshnessAge\(wmSatObservationTimestamp,\s*lang\)\s*:\s*"···"/.test(wm), 'fallback âge absent/invalide = « ··· » (aucun âge inventé)')
  const caller = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
  t(/erddapTimestamp=\\{sargData\\?\\.erddapTimestamp\\|\\|sargData\\?\\.updatedAt\\|\\|null\\}/.test(caller), 'appelant : prop erddapTimestamp (observation erddap, fallback updatedAt = valeur de l ancien affichage)')
  t(wm.includes('mapDecisionFreshness') && wm.includes('map-decision-freshness.mjs'), 'WorldMapView utilise le gate fail-closed des décisions')
  t(wm.includes('setMapFreshnessTick') && wm.includes('window.setTimeout') && wm.includes('visibilitychange') && wm.includes('window.addEventListener("focus"'), 'carte : le cutoff stale est recalculé après 36h et au retour d’onglet')
  t(/data-map-decision-state=\{wmDecisionAvailable\?"available":"unavailable"\}/.test(wm), 'état décision exposé pour tests et diagnostic')
  t(/data-map-pin="1" data-map-status=\{st\|\|"unknown"\}/.test(wm), 'chaque pin expose un statut neutre vérifiable')
  t(wm.includes('Statuts suspendus') && wm.includes('Statuses paused') && wm.includes('Estados suspendidos'), 'résumé map suspendu traduit FR/EN/ES')
  t(wm.includes('Verdict suspendu') && wm.includes('Verdict paused'), 'fiche sélectionnée explique la suspension du verdict')
  t(/const friseOn = mapForecastAvailable && !mapFriseOff/.test(wm), 'frise et claims de prévision masqués si la source ne permet pas de décision')
  t(/if\(!wmDecisionAvailable\|\|!toVB\|\|!afaiGrid/.test(wm), 'couche AFAI masquée lorsque la source est stale/inconnue')
  t(wm.includes('if(!wmDecisionAvailable) return') && wm.includes('if(!wmDecisionAvailable||mapDecideOff||!selected) return null'), 'near-me et plan B ne proposent pas de plage sur données périmées')
  t(wm.includes('status:currentStatus') && wm.includes('score:wmDecisionAvailable?b.score:null'), 'objet plage transmis à la fiche est assaini en mode stale')
  t(wm.includes('erddapTimestamp') && !/updatedAt&&isStale\(updatedAt\)/.test(wm), 'ancien câblage updatedAt&&isStale supprimé')

  // 9. Traductions FR/EN/ES de la pill conservées.
  t(lib.includes("fresh: 'SATELLITE CURRENT'") && lib.includes("fresh: 'SATÉLITE AL DÍA'"), 'statuts frais traduits en anglais et espagnol')
  t(/SATELLITE EN RETARD/.test(lib) && /SATELLITE DELAYED/.test(lib) && /SATÉLITE ATRASADO/.test(lib), 'traductions retard explicites et attribuées au satellite')
  t(lib.includes("unknown: 'Vérification'") && lib.includes("unknown: 'Verification'") && lib.includes("unknown: 'Verificación'"), 'fallback de vérification traduit FR/EN/ES')

  // 10. Autres surfaces fraîcheur non régressées : les helpers canoniques restent exportés.
  t(/export function isSatelliteFresh12h/.test(lib), 'isSatelliteFresh12h toujours exporté (contrat 12h intact)')
  t(/export function isSatelliteStale36h/.test(lib), 'isSatelliteStale36h toujours exporté')
  t(/export function lcDetailFreshnessLabel/.test(lib), 'lcDetailFreshnessLabel (#906) intact')
  t(/export function formatFreshnessAge/.test(lib), 'formatFreshnessAge intact')

  console.log(`\nWORLDMAP_PILL_FRESHNESS_TESTS PASS (${n} assertions)`)
}

main().catch((err) => { console.error(err); process.exit(1) })

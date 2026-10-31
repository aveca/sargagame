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
  const { worldMapFreshness } = await import('../../src/lib/world-map-freshness.mjs')

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

  // 4. Contrat de la carte : source live obligatoire, transitions 12h puis 36h.
  const mapFresh = worldMapFreshness('erddap-live', fresh.erddapTimestamp, 'fr', now)
  t(mapFresh[0] && mapFresh[1] === '#00786C' && mapFresh[4] === 9 * 3.6e6 + 50, 'carte <12h : décision autorisée, point vert, prochain cutoff 12h')
  const mapRecent = worldMapFreshness('erddap-live', delayed.erddapTimestamp, 'en', now)
  t(mapRecent[0] && mapRecent[1] === '#667085' && mapRecent[4] === 19 * 3.6e6 + 50, 'carte 12–36h : décision limitée, âge visible, point neutre')
  const mapOld = worldMapFreshness('erddap-live', old.erddapTimestamp, 'es', now)
  t(!mapOld[0] && mapOld[1] === '#B87A00' && mapOld[4] === null, 'carte >=36h : décisions suspendues, alerte ambre')
  const mapNonLive = worldMapFreshness('cached', fresh.erddapTimestamp, 'fr', now)
  t(!mapNonLive[0] && mapNonLive[1] === '#B87A00' && mapNonLive[2] === 'Vérification' && mapNonLive[3] === '···' && mapNonLive[4] === null, 'carte source non-live : fail closed, aucune fraîcheur inventée')

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

  // 8. Câblage source : la pill consomme la prop erddapTimestamp (venue de l'appelant),
  //    les prédicats partagés, et le prédicat local isStale(36h) est supprimé.
  const wm = fs.readFileSync(path.join(ROOT, 'src', 'WorldMapView.jsx'), 'utf8')
  const lib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')
  const mapLib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'world-map-freshness.mjs'), 'utf8')
  t(wm.includes('worldMapFreshness(source, erddapTimestamp, lang)') && wm.includes('wmFreshDelay') && wm.includes('wmDecisionAvailable'), 'WorldMapView utilise le contrat partagé de fraîcheur carte')
  t(wm.includes('wmSatLbl') && wm.includes('wmSatAge'), 'label et âge proviennent du contrat partagé')
  t(wm.includes('wmSatLbl'), 'label pill précise la fraîcheur de la seule source satellite validée')
  t(wm.includes('const [wmDecisionAvailable, wmSatColor, wmSatLbl, wmSatAge, wmFreshDelay] = worldMapFreshness(source, erddapTimestamp, lang)'), 'la pill reçoit couleur, label, âge et cutoff du helper carte')
  t(mapLib.includes('const color = !available ? "#B87A00" : age < 12 ? "#00786C" : "#667085"'), 'couleur ambre fail-closed, vert <12h, neutre 12–36h')
  t(wm.includes('wmSatLbl, wmSatAge') && wm.includes('background:wmSatColor'), 'âge pill = observation satellite validée, jamais updatedAt seul')
  t(mapLib.includes('export function worldMapFreshness') && mapLib.includes('source === "erddap-live"'), 'helper carte rejette les sources absentes/non-live')
  const caller = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
  t(/updatedAt=\{sargData\?\.updatedAt\}/.test(caller) && /erddapTimestamp=\{sargData\?\.erddapTimestamp\}/.test(caller) && /source=\{sargData\?\.source\}/.test(caller), 'appelant : transmet séparément publication, observation ERDDAP et provenance')
  t(wm.includes('wmFreshDelay') && wm.includes('setMapFreshnessTick(tick=>!tick)') && wm.includes('clearTimeout(timer)'), 'timer partagé : transition 12h puis 36h pendant une page ouverte')
  t(mapLib.includes('return [available, color') && mapLib.includes('available ? ((age < 12 ? 12 : 36) - age) * 36e5 + 50 : null'), 'helper : transitions planifiées à 12h puis 36h')
  t(wm.includes('wmDecisionAvailable') && wm.includes('data-sg-live="1"'), 'décisions stale bloquées et SVG carte identifié pour le smoke')
  t(wm.includes('const st=b.days[day]') && (wm.match(/"#9aa0a8"/g)||[]).length>=2, 'pins stale rendus en gris neutre sans statut de décision')
  t(wm.includes('{wmDecisionAvailable && <div') && wm.includes('wmSatLbl'), 'compteurs masqués quand la source ne permet plus une décision, pill satellite conservée')
  t(wm.includes('if(!wmDecisionAvailable)setSelected(null)'), 'tooltip sélectionné fermé lorsque les décisions deviennent stale')
  t(wm.includes('{wmDecisionAvailable&&(<div style={{'), 'scrubber de prévisions masqué lorsque la source ne permet pas de décision')
  t(/const friseOn = mapPremium && !mapFriseOff/.test(wm), 'frise et claims de prévision masqués si la source ne permet pas de décision')
  t(/if\(!wmDecisionAvailable\|\|!toVB\|\|!afaiGrid/.test(wm), 'couche AFAI masquée lorsque la source est stale/inconnue')
  t(wm.includes('const mapPremium = !!isPremium && !mapForecastOff && wmDecisionAvailable') && wm.includes('if(mapDecideOff||!selected) return null'), 'prévisions et plan B bloqués lorsque la source ne permet pas de décision')
  t(wm.includes('const currentStatus=wmDecisionAvailable&&b.status||null') && wm.includes('status:currentStatus') && wm.includes('...(!wmDecisionAvailable?{score:null,afai:null}:{})'), 'objet plage transmis à la fiche est assaini en mode stale')
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

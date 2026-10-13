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
  const { isSatelliteFresh12h, isSatelliteStale36h } = await import('../../src/lib/format-freshness.mjs')

  // 1. Mesure récente <12h : LIVE autorisé.
  const fresh = { erddapTimestamp: new Date(now - 3 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(fresh, now) === true, '<12h (3h) => isSatelliteFresh12h true (EN DIRECT autorisé)')

  // 2. Seuil exact 12h : PLUS de LIVE (bordure stricte).
  const edge = { erddapTimestamp: new Date(now - 12 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(edge, now) === false, '=12h exact => isSatelliteFresh12h false (plus de EN DIRECT)')

  // 3. 16-17h (la plainte production) : pas de LIVE, âge réel.
  const delayed = { erddapTimestamp: new Date(now - 17 * 3.6e6).toISOString() }
  t(isSatelliteFresh12h(delayed, now) === false, '17h => isSatelliteFresh12h false (pas de EN DIRECT)')
  t(isSatelliteStale36h(delayed, now) === false, '17h => isSatelliteStale36h false (fenêtre 12-36h : statut non-actuel, âge réel affiché)')

  // 4. 36-40h : péremption.
  const old = { erddapTimestamp: new Date(now - 40 * 3.6e6).toISOString() }
  t(isSatelliteStale36h(old, now) === true, '40h => isSatelliteStale36h true (statut non-actuel)')

  // 5. Horodatage absent : aucun LIVE inventé.
  t(isSatelliteFresh12h({}, now) === false, 'absent => isSatelliteFresh12h false (fallback honnête)')
  t(isSatelliteStale36h({}, now) === false, 'absent => isSatelliteStale36h false (fallback honnête)')

  // 6. Horodatage invalide.
  t(isSatelliteFresh12h({ erddapTimestamp: 'not-a-timestamp' }, now) === false, 'invalide => pas de LIVE')
  t(isSatelliteStale36h({ erddapTimestamp: 'not-a-timestamp' }, now) === false, 'invalide => pas de statut périmé affirmé')

  // 7. Horodatage futur.
  t(isSatelliteFresh12h({ erddapTimestamp: new Date(now + 3.6e6).toISOString() }, now) === false, 'futur => pas de LIVE')

  // 8. Câblage source : la pill consomme la prop erddapTimestamp (venue de l'appelant),
  //    les prédicats partagés, et le prédicat local isStale(36h) est supprimé.
  const wm = fs.readFileSync(path.join(ROOT, 'src', 'WorldMapView.jsx'), 'utf8')
  t(/isSatelliteFresh12h,\s*isSatelliteStale36h\s*\}\s*from\s*"\.\/lib\/format-freshness\.mjs"/.test(wm) || /import\s*\{\s*formatFreshnessAge,\s*isSatelliteFresh12h,\s*isSatelliteStale36h\s*\}\s*from\s*"\.\/lib\/format-freshness\.mjs"/.test(wm), 'WorldMapView importe les prédicats partagés')
  t(!/function isStale\(/.test(wm), 'prédicat local isStale(36h) supprimé de WorldMapView')
  t(/wmSatLbl\s*=.*isSatelliteFresh12h|wmSatFresh\s*&&\s*isSatelliteFresh12h|const wmSatFresh\s*=\s*wmSatValid\s*&&\s*isSatelliteFresh12h/.test(wm), 'label pill piloté par isSatelliteFresh12h')
  t(/erddapTimestamp\?formatFreshnessAge\(erddapTimestamp,lang\)|formatFreshnessAge\(erddapTimestamp,\s*lang\)/.test(wm), 'âge pill = formatFreshnessAge(erddapTimestamp) (jamais updatedAt seul)')
  t(/wmSatAge\s*=\s*wmSatValid\s*\?\s*formatFreshnessAge\(erddapTimestamp,\s*lang\)\s*:\s*"···"/.test(wm), 'fallback âge absent/invalide = « ··· » (aucun âge inventé)')
  const caller = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
  t(/erddapTimestamp=\\{sargData\\?\\.erddapTimestamp\\|\\|sargData\\?\\.updatedAt\\|\\|null\\}/.test(caller), 'appelant : prop erddapTimestamp={sargData?.erddapTimestamp||sargData?.updatedAt||null} câblée (observation erddap, fallback updatedAt = valeur déjà affichée par l ancien âge)')
  t(wm.includes('erddapTimestamp') && !/updatedAt&&isStale\(updatedAt\)/.test(wm), 'ancien câblage updatedAt&&isStale supprimé')

  // 9. Traductions FR/EN/ES de la pill conservées.
  t(wm.includes('"EN DIRECT","LIVE","EN VIVO"') || /_t\(lang,"EN DIRECT","LIVE","EN VIVO"\)/.test(wm), 'traductions EN DIRECT/LIVE/EN VIVO conservées')
  t(/DONNÉE EN RETARD|DATA DELAYED|DATO EN RETRASO/.test(wm), 'traductions statut non-actuel conservées')
  t(/"Vérification","Verification","Verificación"/.test(wm), 'fallback traduit absent/invalide présent')

  // 10. Autres surfaces fraîcheur non régressées : les helpers canoniques restent exportés.
  const lib = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')
  t(/export function isSatelliteFresh12h/.test(lib), 'isSatelliteFresh12h toujours exporté (contrat 12h intact)')
  t(/export function isSatelliteStale36h/.test(lib), 'isSatelliteStale36h toujours exporté')
  t(/export function lcDetailFreshnessLabel/.test(lib), 'lcDetailFreshnessLabel (#906) intact')
  t(/export function formatFreshnessAge/.test(lib), 'formatFreshnessAge intact')

  console.log(`\nWORLDMAP_PILL_FRESHNESS_TESTS PASS (${n} assertions)`)
}

main().catch((err) => { console.error(err); process.exit(1) })

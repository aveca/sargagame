#!/usr/bin/env node
// tests/unit/lc-detail-freshness.test.cjs — régression SG-PRODUCT-FRESHNESS-LCDETAIL-20261013-001 :
// lc-detail n'annonçait « Mesuré au satellite ce matin » quelle que soit l'âge réel
// (baseline live : observation ~16h contraire au libellé principal alors que le panneau
// « Pourquoi ce verdict ? » affichait l'âge correct). Ce test verrouille le COMPORTEMENT
// réel du produit en important le helper partagé (pas de copie de logique) et couvre :
//  1. observation récente (<12h) avec source live/non-stale => libellé récent ;
//  2. observation ~16h (la plainte) => âge réel affiché (« il y a 16 h »), jamais « ce matin » ;
//  3. observation >36h (seuil de péremption existant) => âge réel affirmé ;
//  4. horodatage absent => formulation de vérification, aucune fréquence inventée ;
//  5. horodatage futur => même comportement honnête ;
//  6. horodatage invalide => idem.
// Et verrouille le câblage source (ChasseHome l.610 : helper partagé, prédicat satellite,
// aucune lecture updatedAt pour ce libellé).
'use strict'
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const ROOT = path.resolve(__dirname, '..', '..')

const now = Date.parse('2026-10-13T04:00:00.000Z')
let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

async function main() {
  const { lcDetailFreshnessLabel, isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')

  // 1. Observation récente (3h) : source live explicite et payload non stale.
  const fresh = { source: 'erddap-live', stale: false, erddapTimestamp: '2026-10-13T01:00:00.000Z' }
  t(lcDetailFreshnessLabel(fresh, 'fr', now).includes('Observation satellite récente'), '3h => libellé récent sans promesse liée à l’heure de la journée')

  // 2. Baseline live (~16h + updatedAt récent) : l'âge réel s'affiche, jamais « ce matin ».
  const delayed = { source: 'erddap-live', stale: false, erddapTimestamp: new Date(now - 16 * 3.6e6).toISOString(), updatedAt: new Date(now - 0.5 * 3.6e6).toISOString() }
  const delayedFr = lcDetailFreshnessLabel(delayed, 'fr', now)
  t(!delayedFr.includes('ce matin'), '16h => « ce matin » supprimé')
  t(delayedFr.includes('il y a 16 h'), '16h => « il y a 16 h » = cohérence avec le panneau Pourquoi')
  t(/Dernière observation satellite/.test(delayedFr), '16h : formulation relative honnête (pas de fréquence)')

  // 3. Dépassement seuil stale (40h) : âge réel s'affiche, jamais « ce matin ».
  const stale = { source: 'erddap-live', stale: false, erddapTimestamp: new Date(now - 40 * 3.6e6).toISOString() }
  const staleFr = lcDetailFreshnessLabel(stale, 'fr', now)
  t(!staleFr.includes('ce matin'), '40h => « ce matin » jamais affiché')
  t(staleFr.includes('il y a 40 h'), '40h => âge réel affiché (aligné avec le panneau Pourquoi)')
  t(staleFr.includes('historique') && staleFr.includes('pas un verdict actuel') && !staleFr.includes('vérifié'), '40h => explicitement historique, jamais présenté comme verdict actuel')

  // 4. Timestamp absent : formulation de vérification, aucune fréquence inventée.
  const missing = lcDetailFreshnessLabel({}, 'fr', now)
  t(missing.includes('vérification') && !missing.includes('matin'), 'absent => « en cours de vérification » honnête')

  // 5. Timestamp futur : même comportement (impossible d'être frais), aucune fréquence.
  const future = lcDetailFreshnessLabel({ erddapTimestamp: new Date(now + 3.6e6).toISOString() }, 'fr', now)
  t(future.includes('vérification') && !future.includes('matin'), 'futur => « en cours de vérification » honnête')

  // 6. Timestamp invalide : même comportement.
  const invalid = lcDetailFreshnessLabel({ erddapTimestamp: 'not-a-timestamp' }, 'fr', now)
  t(invalid.includes('vérification') && !invalid.includes('matin'), 'invalide => « en cours de vérification » honnête')

  // 7. Câblage source : ChasseDetail utilise le helper partagé, plus jamais de « ce matin » dur.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  const idx = src.indexOf('lc-detail-sub')
  const seg = src.slice(idx, idx + 1200)
  t(/lcDetailFreshnessLabel/.test(seg), 'source : lc-detail appelle lcDetailFreshnessLabel (helper partagé)')
  t(!seg.match(/fr:"Mesuré au satellite ce matin"[\s\S]*?without.*helper/is), 'source : aucun « ce matin » dur dans lc-detail')
  t(!/updatedAt/.test(seg.replace(/updatedAt\s+and\s+/, '').replace(/updatedAt\b(?![^\n]*comment)/, '')), 'source : lc-detail n utilise plus updatedAt pour ce libellé')

  // 8. Aucune régression sur les surfaces fraîcheur déjà auditées : la fiche garde
  //    le panneau Pourquoi (why.ageH) et le gate 12h partagé restent en place.
  t(/isSatelliteFresh12h/.test(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')), 'helper partage isSatelliteFresh12h (kill-switch 12h)')
  t(/satelliteAgeHours/.test(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'format-freshness.mjs'), 'utf8')), 'helper partage satelliteAgeHours (observation)')


  // 9. A current decision requires live provenance, stale=false, a valid beach status and <12h.
  t(!isSatelliteFresh12h(stale, now), 'old observation cannot authorize a current decision')
  t(lcDetailFreshnessLabel({ ...fresh, stale: true }, 'fr', now).includes('non validée'), 'explicit stale=true blocks a current freshness label')
  t(lcDetailFreshnessLabel({ ...fresh, source: 'cached-fallback' }, 'fr', now).includes('non validée'), 'non-live source blocks a current freshness label')
  t(lcDetailFreshnessLabel({ ...fresh, source: undefined }, 'fr', now).includes('non validée'), 'missing source provenance blocks a current freshness label')

  const chasse = fs.readFileSync(path.join(ROOT, 'src', 'ChasseHome.jsx'), 'utf8')
  t(/sargData\?\.source==="erddap-live"&&sargData\?\.stale===false&&isSatelliteFresh12h\(sargData\)&&\["clean","moderate","avoid"\]\.includes\(beach\?\.status\)/.test(chasse), 'ChasseDetail uses the complete source/status freshness contract')
  t(/const sc=satelliteDecisionCurrent&&beach\.score!=null/.test(chasse), 'stale score is never passed to the current score display')
  t(/data-testid="lc-detail-stale"/.test(chasse), 'stale detail announces historical-only state')
  t(/data-testid="lc-detail-score-paused"/.test(chasse), 'stale detail explicitly suppresses current score')
  t(/data-testid="lc-detail-forecast-paused"/.test(chasse), 'stale detail explicitly pauses forecast')

  console.log(`\nLC_DETAIL_FRESHNESS_TESTS PASS (${n} assertions)`)
}
main().catch(err => { console.error(err); process.exit(1) })

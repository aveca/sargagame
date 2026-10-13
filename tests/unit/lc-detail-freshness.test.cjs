#!/usr/bin/env node
// tests/unit/lc-detail-freshness.test.cjs — régression SG-PRODUCT-FRESHNESS-LCDETAIL-20261013-001 :
// lc-detail n'annonçait « Mesuré au satellite ce matin » quelle que soit l'âge réel
// (baseline live : observation ~16h contraire au libellé principal alors que le panneau
// « Pourquoi ce verdict ? » affichait l'âge correct). Ce test verrouille le COMPORTEMENT
// réel du produit en important le helper partagé (pas de copie de logique) et couvre :
//  1. observation récente (<12h) => formulation « ce matin » préservée ;
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

  // 1. Observation récente (3h) : « ce matin » (le comportement actuel est préservé).
  const fresh = { erddapTimestamp: '2026-10-13T01:00:00.000Z' }
  t(lcDetailFreshnessLabel(fresh, 'fr', now).includes('ce matin'), '3h => « ce matin » conservé (aucune régression les 12h)')

  // 2. Baseline live (~16h + updatedAt récent) : l'âge réel s'affiche, jamais « ce matin ».
  const delayed = { erddapTimestamp: new Date(now - 16 * 3.6e6).toISOString(), updatedAt: new Date(now - 0.5 * 3.6e6).toISOString() }
  const delayedFr = lcDetailFreshnessLabel(delayed, 'fr', now)
  t(!delayedFr.includes('ce matin'), '16h => « ce matin » supprimé')
  t(delayedFr.includes('il y a 16 h'), '16h => « il y a 16 h » = cohérence avec le panneau Pourquoi')
  t(/Dernière mesure satellite/.test(delayedFr), '16h : formulation relative honnête (pas de fréquence)')

  // 3. Dépassement seuil stale (40h) : âge réel s'affiche, jamais « ce matin ».
  const stale = { erddapTimestamp: new Date(now - 40 * 3.6e6).toISOString() }
  const staleFr = lcDetailFreshnessLabel(stale, 'fr', now)
  t(!staleFr.includes('ce matin'), '40h => « ce matin » jamais affiché')
  t(staleFr.includes('il y a 40 h'), '40h => âge réel affiché (aligné avec le panneau Pourquoi)')

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

  console.log(`\nLC_DETAIL_FRESHNESS_TESTS PASS (${n} assertions)`)
}
main().catch(err => { console.error(err); process.exit(1) })

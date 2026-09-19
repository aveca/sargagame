#!/usr/bin/env node
/**
 * map-declutter.test.cjs — K3 DECLUTTER (2026-09-19).
 *
 * La carte = surface d'EXPLORATION pure (défaut), la décision vit dans l'onglet
 * Accueil XP. Flag unique ?mapdeclutter (défaut ON) ; rollback ?mapdeclutter=0
 * = chrome historique complet. Rendu conditionnel seul : aucune logique
 * supprimée, aucun tracking modifié, aucun z-index touché.
 * Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

function main() {
  const WMV = read('src/WorldMapView.jsx')

  // 1. Flag unique, défaut ON (masqué sauf ?mapdeclutter=0).
  ok(WMV.includes('[?&]mapdeclutter=0'), 'flag ?mapdeclutter=0 défini (WorldMapView)')
  ok(WMV.includes('const mapDeclutterOff'), 'const mapDeclutterOff présent')

  // 2. Les 5 panneaux décisionnels sont gardés (ni supprimés ni déplacés).
  ok(/if\(!mapDeclutterOff\|\|\/\[\?&\]maphero=0\//.test(WMV), 'garde héros « Où te baigner » (?maphero=0 préservé)')
  ok(WMV.includes('if(!mapDeclutterOff||myOff||!myBeachInfo'), 'garde carte Ma Plage inline (?mapmy=0 préservé)')
  ok(WMV.includes('(mapDeclutterOff&&(!mapV2||selected))'), 'garde sticker email carte')
  ok(WMV.includes('{mapDeclutterOff&&!proMapOff&&onOpenPro&&('), 'garde chip B2B légende (?promap=0 préservé)')
  ok(WMV.includes('{mapDeclutterOff&&weekDigest&&!selected&&('), 'garde digest « Cette semaine »')

  // 3. Conservés intacts : recherche, jauge, légende, près de moi, scrub, labels.
  ok(WMV.includes('aria-label={_t(lang,"Chercher une plage"'), 'recherche carte intacte')
  ok(WMV.includes('sg_map_cleancount_tap'), 'jauge « plages propres » intacte')
  ok(WMV.includes('Une plage propre près de moi'), 'CTA « près de moi » intact')
  ok(WMV.includes('DAY_LBL.map('), 'scrub J0→J5 intact')
  ok(WMV.includes('data-sg-labels-ready'), 'readiness labels intacte (E2E)')

  // 4. Money-path / tracking / z-index : zéro changement.
  ok(!/mapDeclutterOff.{0,80}?(1260|1300|zIndex|payMounted|createToken|doSubscribe)/s.test(WMV),
    'aucune interférence paywall/checkout/z-index/tracking')
  ok(WMV.includes('sg_best_beach_click'), 'tracking héros préservé (rollback path)')
  ok(WMV.includes('sg_b2b_open'), 'tracking B2B préservé (rollback path)')
  ok(WMV.includes('sg_weekhub_open_cta'), 'tracking digest préservé (rollback path)')

  // 5. Suite rollback : ma-plage couvre ?mapdeclutter=0.
  const MA = read('tests/e2e/ma-plage.spec.ts')
  ok(MA.includes('?mapdeclutter=0'), 'ma-plage.spec.ts couvre le path rollback')

  console.log(failures === 0 ? '\nMAP-DECLUTTER TESTS: ALL PASS' : `\nMAP-DECLUTTER TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()

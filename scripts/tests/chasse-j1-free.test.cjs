#!/usr/bin/env node
/**
 * chasse-j1-free.test.cjs — A13 J+1 PORT dans ChasseDetail (2026-09-20).
 *
 * Miroir de A13 BeachSheetComic (PR #691, Sargasses_PROD.jsx:4656) sur la
 * variante live des pins carte (ChasseDetail, ChasseHome.jsx) : J+1 offert
 * aux non-premium, badge INCLUS, rollback ?j1_free=0, J+2+ verrouillés.
 * Rendu conditionnel seul : premium/free7/quota/tracking/z-index intacts.
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
  const CH = read('src/ChasseHome.jsx')

  // 1. Flag miroir : même nom de param, même défaut ON, même sémantique que BSC.
  ok(CH.includes('const j1FreeOn='), 'const j1FreeOn présent (ChasseDetail)')
  ok(CH.includes('[?&]j1_free=0'), 'rollback ?j1_free=0 lu (ChasseDetail)')
  ok(/return !\/\[\?&\]j1_free=0\//.test(CH), 'défaut ON sauf ?j1_free=0 (miroir BSC)')

  // 2. Gating : J+1 (i===1) rejoint la branche débloquée, J+2+ restent en teaser.
  ok(CH.includes('if(isPremium||free7||(j1FreeOn&&i===1))'), 'branche débloquée étendue à J+1 sous j1_free')
  ok(CH.includes('lc-fc-cell teaser'), 'branche teaser conservée (J+2+ verrouillés)')
  // Honnêteté : sans série (!d) → cadenas, jamais de déblocage à vide.
  ok(/if\(!d\) return/.test(CH), '!d → cadenas conservé (pas de J+1 sans donnée)')

  // 3. Badge INCLUS trilingue, scopé non-premium + non-free7 + j1_free + i===1.
  ok(CH.includes('lc-fc-inclus'), 'classe badge lc-fc-inclus présente (JSX + CSS)')
  ok(CH.includes('{fr:"INCLUS",en:"INCLUDED",es:"INCLUIDO"}'), 'badge INCLUS trilingue (miroir BSC)')
  ok(CH.includes('{!isPremium&&!free7&&j1FreeOn&&i===1&&('), 'badge scopé : non-premium, non-free7, j1_free, i===1')

  // 4. Tap J+1 libre : stopPropagation (le tap ne remonte pas au openFc paywall).
  ok(CH.includes('e.stopPropagation()}catch(_){}'), 'stopPropagation présent sur la cellule J+1 libre')

  // 5. Chemins premium / free7 / quota intacts.
  ok(CH.includes('if(isPremium||free7||(j1FreeOn&&i===1)) return ('), 'premium+free7 passent toujours par la branche débloquée')
  ok(CH.includes('Prévision 7 jours disponible avec Premium'), 'mur quota intact')
  ok(CH.includes('Ma plage — suivie, 7 jours offerts'), 'bandeau suivi intact')

  // 6. Tracking inchangé (noms + payloads).
  ok(CH.includes('sg_forecast_lock_click') && CH.includes('{variant:"fcstrip",beat:0}'), 'sg_forecast_lock_click{fcstrip} intact')
  ok(CH.includes('sg_chasse_detail_premium'), 'sg_chasse_detail_premium intact')
  ok(CH.includes('sg_chasse_share'), 'sg_chasse_share intact')
  ok(CH.includes('sg_follow_beach') && CH.includes('{beach_id:beach.id,via:"chasse_detail"}'), 'sg_follow_beach{via:chasse_detail} intact')
  ok(CH.includes('sg_chasse_fav'), 'sg_chasse fav/unfav intact')

  // 7. Hors scope intacts : BeachSheetComic porte toujours son propre A13.
  const BSC = read('src/Sargasses_PROD.jsx')
  ok(BSC.includes('const j1FreeOn='), 'A13 BeachSheetComic intact (aucune modification BSC)')
  ok(BSC.includes('{fr:"INCLUS","INCLUDED","INCLUIDO"}') || BSC.includes('INCLUS","INCLUDED","INCLUIDO'), 'badge INCLUS BSC intact')

  console.log(failures === 0 ? '\nCHASSE-J1-FREE TESTS: ALL PASS' : `\nCHASSE-J1-FREE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()

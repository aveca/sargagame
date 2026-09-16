#!/usr/bin/env node
// mollie-mount-guard.test.cjs — P0 money-path (2026-09-16) : jamais de
// createToken() Mollie sans les 4 Components montés.
//
// Contexte : 7× sg_payment_failed en prod avec le texte vendeur brut
// "Not all required components are mounted" — payReadyRef ne couvrait que
// l'objet Mollie (init), PAS les mounts (Effet 2 OnsiteCheckout). Le clic
// rapide (ou mount bloqué) tirait createToken dans le vide.
// Vérifie STATICEMENT la garde : flag partagé écrit au mount, attendu avant
// tokenize, retry du message transitoire, mapping friendly (zéro texte
// vendeur brut côté UI/analytics). Ne prétend rien de fonctionnel.
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`) }
  else { fail++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const PM = R('src/PremiumModal.jsx')
const OC = R('src/PremiumModal/OnsiteCheckout.jsx')
const DS = R('src/PremiumModal/doSubscribe.jsx')

console.log('— flag partagé payMountedRef —')
check('PremiumModal crée payMountedRef (useRef)',
  /const payMountedRef\s*=\s*useRef\(false\)/.test(PM))
check('payMountedRef passé à usePaymentLogic',
  /usePaymentLogic\(\{[\s\S]*?payReadyRef,\s*payMountedRef,/.test(PM))
check('payMountedRef passé à OnsiteCheckout (onsiteCheckoutProps)',
  /payReadyRef,\s*payMountedRef,\s*payRedirecting,\s*setPayRedirecting,\s*\n\s*paySuccess/.test(PM))

console.log('— writer : OnsiteCheckout pose le flag au succès des 4 mounts —')
check('OnsiteCheckout lit la prop payMountedRef (pas de double source)',
  /payMountedRef,/.test(OC) && !/const payMountedRef\s*=\s*useRef/.test(OC))
check('flag posé après les 4 mount()',
  /mountedRef\.current\s*=\s*true/.test(OC) || /payMountedRef\.current\s*=\s*true/.test(OC))

console.log('— reader : doSubscribe attend les mounts avant createToken —')
check('doSubscribe reçoit payMountedRef',
  /payMountedRef,/.test(DS))
check('attente mounts (poll) AVANT createToken',
  DS.indexOf('const mountsReady') !== -1 && DS.indexOf('const mountsReady') < DS.indexOf('mollieRef.current.createToken()'))
check('aucun tokenize sans mounts : timeout → return avant createToken',
  /sg_mollie_components_not_mounted/.test(DS))
check('retry couvre "not all required components are mounted" (transitoire)',
  /not all required components are mounted/i.test(DS))

console.log('— zéro texte vendeur brut —')
check('message vendeur jamais affiché tel quel (mapping friendly)',
  !/Not all required components are mounted, see/.test(DS))
check('reason analytics = taxonomy stable (components_not_mounted)',
  (DS.match(/components_not_mounted/g) || []).length >= 3)

console.log('— mesure fiable : trafic synthétique tagué —')
const PROD = R('src/Sargasses_PROD.jsx')
check('track() tague synthetic quand navigator.webdriver (E2E/probes)',
  /navigator\.webdriver/.test(PROD) && /p\.synthetic\s*=\s*true/.test(PROD))

console.log(`\n${pass} ok, ${fail} échecs`)
process.exit(fail ? 1 : 0)

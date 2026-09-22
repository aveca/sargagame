#!/usr/bin/env node
/**
 * checkout-redirect-state.test.cjs — PAYUX #2 (parcours paiement, surface loading).
 *
 * Friction : quand le serveur Mollie répond checkoutUrl (checkout hébergé / 3DS),
 * doSubscribe fait setPayRedirecting(true) puis laisse payBusy=true en attendant
 * la navigation — le bouton affichait « Activation… » (générique) pendant les
 * secondes de bascule : l'utilisateur ne sait plus si ça tourne ou si ça plante.
 * payRedirecting n'était JAMAIS rendu (état mort).
 *
 * Fix (UI only) : le bouton principal de OnsiteCheckout se verrouille et affiche
 * « Redirection vers ta banque… » tant que payRedirecting — aucun changement de
 * logique paiement (doSubscribe intact), rollback ?sgpayredirect=0.
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
  const OC = read('src/PremiumModal/OnsiteCheckout.jsx')
  const DS = read('src/PremiumModal/doSubscribe.jsx')

  // 1. État dérivé + rollback.
  ok(OC.includes('sgpayredirect=0'), 'rollback produit ?sgpayredirect=0 présent')
  ok(/const redirecting = !!\(redirectUi && payRedirecting\)/.test(OC), 'redirecting = état dérivé de la prop payRedirecting (aucun nouvel état)')

  // 2. Bouton principal : verrou + libellé + a11y.
  ok(OC.includes('disabled={payBusy || redirecting}'), 'bouton Payer verrouillé pendant la redirection')
  ok(/aria-disabled=\{\(consentFlag && !PAY_CAPTURE_ONLY && passCtx && !consentOk\) \|\| redirecting/.test(OC), 'aria-disabled couvre la redirection')
  ok(OC.includes('Redirection vers ta banque…'), 'libellé FR « Redirection vers ta banque… »')
  ok(OC.includes('Redirecting to your bank…'), 'libellé EN')
  ok(OC.includes('Redirigiendo a tu banco…'), 'libellé ES')
  ok(OC.includes('cursor: (payBusy || redirecting) ? "wait"'), 'curseur wait pendant la redirection')

  // 3. Logique paiement INTACTE (doSubscribe non touché par ce chantier).
  ok(DS.includes('setPayRedirecting(true)'), 'doSubscribe : setPayRedirecting(true) conservé')
  ok(DS.includes('window.location.href=d.checkoutUrl'), 'doSubscribe : navigation checkoutUrl conservée')
  ok(!DS.includes('sgpayredirect'), 'doSubscribe : aucune lecture du flag UI (séparation logique/présentation)')

  // 4. Déverrouillage bfcache INCHANGÉ (les deux flags libérés au retour).
  ok(OC.includes('setPayBusy(false); setPayRedirecting(false)'), 'handler pageshow bfcache intact')

  // 5. Sécurité périmètre : aucun montant/provider/endpoint/tracking touché.
  ok(!(/14,?99|1499/.test(OC.slice(OC.indexOf('PAYUX #2'), OC.indexOf('PAYUX #2') + 900))), 'aucun montant dans le bloc fix')
  ok(!/track\(/.test(OC.slice(OC.indexOf('PAYUX #2'), OC.indexOf('PAYUX #2') + 900)), 'aucun tracking nouveau')

  console.log(failures === 0 ? '\nCHECKOUT-REDIRECT-STATE TESTS: ALL PASS' : `\nCHECKOUT-REDIRECT-STATE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()

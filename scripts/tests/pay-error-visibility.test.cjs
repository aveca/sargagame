#!/usr/bin/env node
/**
 * pay-error-visibility.test.cjs — NEXT BUILD (parcours paiement).
 *
 * Friction : le message de garde (consent manquant, email invalide, mounts…)
 * naissait AU-DESSUS du bouton Payer, potentiellement hors-écran après un tap
 * sur un bouton dimmé-mais-cliquable → l'utilisateur ne voyait rien.
 * Fix : l'alerte (role=alert) est amenée en vue + focus à chaque apparition
 * (pattern B2BModal stepTitleRef). Logique paiement/montants/provider intacts.
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

  // 1. Ref + focus sur l'alerte erreur.
  ok(OC.includes('const payErrorRef = useRef(null)'), 'ref payErrorRef déclarée')
  ok(/payErrorRef\.current && payErrorRef\.current\.scrollIntoView\(\{ block: "nearest" \}\)/.test(OC), 'scrollIntoView nearest à chaque payError')
  ok(/payErrorRef\.current && payErrorRef\.current\.focus\(\{ preventScroll: true \}\)/.test(OC), 'focus preventScroll à chaque payError')
  ok(/<div ref=\{payErrorRef\} tabIndex=\{-1\} role="alert"/.test(OC), 'alerte focusable (tabIndex -1, role=alert conservé)')

  // 2. Garde consentement intacte (wording + condition), logique paiement intacte.
  ok(DS.includes('Coche la case pour activer ton accès immédiat.'), 'message garde consentement inchangé')
  ok(DS.includes('if(consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk){'), 'condition garde consentement inchangée')
  ok(OC.includes('disabled={payBusy}'), 'disabled={payBusy} seul (comportement bouton inchangé)')
  ok(OC.includes('onClick={() => { try { doSubscribe() } catch (_) {} }}'), 'onClick → doSubscribe inchangé')

  // 3. Scope : aucun montant/provider/tracking touché par le fix.
  ok(!/cents|createToken|create_payment|mollieRef/.test(OC.slice(OC.indexOf('payErrorRef = useRef'), OC.indexOf('payErrorRef = useRef') + 1200)), 'bloc fix sans montant ni appel paiement')

  console.log(failures === 0 ? '\nPAY-ERROR-VISIBILITY TESTS: ALL PASS' : `\nPAY-ERROR-VISIBILITY TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main()

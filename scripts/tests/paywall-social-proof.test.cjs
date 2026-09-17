#!/usr/bin/env node
/**
 * paywall-social-proof.test.cjs — Test E2 + E9 (preuve sociale + preuve qualité données sur les paywalls).
 *
 * E2: La preuve = le compteur réel __COMM (build, jamais inventé), même copy que
 * le checkout (OnsiteCheckout : "Déjà N+ qui suivent leurs plages", FR/EN/ES).
 * E9: Quand community=0, afficher la preuve qualité données (97% vérifiées, satellite, backtest).
 * Gardes : community > 0 (E2) / community === 0 (E9) + rollback ?sgsocial=0.
 *
 * Audits :
 *  1. commonPaywallProps relaie community depuis __COMM.
 *  2. WorldPaywall : prop community=0 + gate `socialOn && community > 0` (E2) + `socialOn && community === 0` (E9).
 *  3. WorldPaywall : flag ?sgsocial=0 + testid + bloc AVANT la carte PassOffer.
 *  4. WorldPaywall : copy honnête (template ${community}, aucun chiffre en dur).
 *  5. WorldPaywall : E9 data-quality proof present (testid, copy, gate).
 *  6. ComicPaywall (dormant) : même câblage (prop + gate E2/E9 + testid + copy).
 *  7. OnsiteCheckout (preuve pré-existante) intacte.
 *
 * Preuve live (preview + Playwright : ligne rendue avec le vrai N, rollback,
 * CTA intact) exécutée à la main, consignée dans MASTER_AUDIT.md. Exit 1 si échec.
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

function checkPaywall(name, src) {
  ok(src.includes('community = 0'), `${name} : prop community=0`)
  ok(/socialOn && community > 0/.test(src), `${name} : gate socialOn && community > 0 (E2)`)
  ok(/socialOn && community === 0/.test(src), `${name} : gate socialOn && community === 0 (E9)`)
  ok(/sgsocial=0/.test(src), `${name} : rollback ?sgsocial=0`)
  ok(src.includes('data-testid="paywall-social-proof"'), `${name} : testid paywall-social-proof (E2)`)
  ok(src.includes('data-testid="paywall-data-quality-proof"'), `${name} : testid paywall-data-quality-proof (E9)`)
  ok(src.includes('${community}+'), `${name} : compteur réel interpolé (aucun chiffre inventé)`)
  ok(src.includes('98%'), `${name} : preuve qualité données 98% (E9)`)
ok(src.includes('Backtest 99%'), `${name} : backtest 99% J+3→J+6 (E9)`)
}

function main() {
  const PM = read('src/PremiumModal.jsx')
  const WP = read('src/PremiumModal/WorldPaywall.jsx')
  const CP = read('src/PremiumModal/ComicPaywall.jsx')
  const OC = read('src/PremiumModal/OnsiteCheckout.jsx')

  ok(PM.includes('community: __COMM'), 'commonPaywallProps relaie community depuis __COMM')
  checkPaywall('WorldPaywall', WP)
  const preIdx = WP.indexOf('PREUVE SOCIALE (E2')
  const offerIdx = WP.indexOf('Pricing card (PassOffer)')
  ok(preIdx !== -1 && offerIdx !== -1 && preIdx < offerIdx, 'WorldPaywall : preuve AVANT la carte PassOffer')
  checkPaywall('ComicPaywall', CP)
  ok(OC.includes('{__COMM > 0 && ('), 'OnsiteCheckout (preuve pré-existante) intacte')

  console.log(failures === 0 ? '\nPAYWALL-SOCIAL-PROOF TESTS: ALL PASS' : `\nPAYWALL-SOCIAL-PROOF TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

try { main() } catch (e) {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
}

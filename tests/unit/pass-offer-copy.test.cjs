#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const offer = fs.readFileSync(path.join(ROOT, 'src', 'PassOffer.jsx'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
const abFetch = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'ab-fetch-ga4.cjs'), 'utf8')

let failures = 0
function check(ok, label) {
  if (ok) console.log('  ✓ ' + label)
  else { failures++; console.error('  ✗ ' + label) }
}

console.log('PassOffer copy experiment — regression checks')
check(offer.includes('Débloquer la prévision 7 jours →'), 'French variant names the unlocked benefit')
check(offer.includes('Unlock the 7-day forecast →'), 'English variant names the unlocked benefit')
check(offer.includes('Desbloquear el pronóstico de 7 días →'), 'Spanish variant names the unlocked benefit')
check(offer.includes('Méthode, précision mesurée et limites →'), 'trust link is framed transparently, not as an error catalogue')
check(offer.includes('Before you pay, see our errors →') && offer.includes('Commencer maintenant →'), 'control copy remains available for valid comparison')
check(offer.includes('passcopy=1') && offer.includes('passcopy=0'), 'URL overrides force the experiment arm for QA/rollback')
check(app.includes('"pass_copy": null'), 'experiment is enabled in the A/B freeze map')
check(offer.includes('track("sg_pass_offer_view"') && offer.includes('copy_variant:copyVariant'), 'variant attribution is included on offer view')
check(offer.includes('track("sg_pass_cta"') && offer.includes('copy_variant:copyVariant'), 'variant attribution is included on CTA click')
check(abFetch.includes("id: 'pass_copy', dimension: 'customEvent:ab_pass_copy'") && abFetch.includes("metric: 'sg_pass_cta'"), 'GA4 evaluator is wired to measure pass CTA by variant')
check(offer.includes('cents: { eur: 1499, usd: 1199 }, days: 30'), 'price and pass duration are unchanged')
check(offer.includes('onBuy({c:cents,pass:PASS.key,days:PASS.days,segment:seg})'), 'checkout callback and payment path remain unchanged')

console.log('\nPASS_COPY_TESTS', failures === 0 ? 'PASS' : 'FAIL')
process.exit(failures ? 1 : 0)

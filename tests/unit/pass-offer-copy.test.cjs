#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.resolve(__dirname, '..', '..')
const offer = fs.readFileSync(path.join(ROOT, 'src', 'PassOffer.jsx'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
const abFetch = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'ab-fetch-ga4.cjs'), 'utf8')
const pricing = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'pricing.js'), 'utf8')

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

// ── Contrat de prix (2026-11-04) ─────────────────────────────────────────────
// AVANT : `const PASS = { key:"p30", cents:{eur:1499,usd:1199}, days:30 }` figé
// dans le composant → l'affichage USD (11,99 $) divergeait du débit serveur
// (13,79 $ en juin→novembre, surcharge +15 %) et le pass affiché n'était pas
// paramétrable par durée.
// APRÈS : les prix vivent dans src/lib/pricing.js (miroir du serveur) :
//   • le composant ENVOIE le montant de BASE (accepté par l'allowlist serveur)
//   • le composant AFFICHE le montant EFFECTIF (base + surcharge USD)
//   • le pass affiché vient de resolvePass(passKey, devise)
check(!offer.includes('cents: { eur: 1499, usd: 1199 }'), 'no hardcoded price table remains in PassOffer')
check(/from\s*["']\.\/lib\/pricing\.js["']/.test(offer), 'PassOffer imports the single pricing source')
check(/passBaseCents/.test(offer) && /passEffectiveCents/.test(offer), 'PassOffer resolves base and effective amounts')
check(/PASS_DAYS\[key\]/.test(offer), 'pass duration comes from PASS_DAYS (pricing.js)')
check(pricing.includes('PASS_DAYS = Object.freeze({ p30: 30, trip7: 7, season: 210 })'), 'PASS_DAYS covers the 3 server passes')
check(pricing.includes('p30: Object.freeze({ eur: 1499, usd: 1199 })'), 'pricing.js mirrors the server p30 price (14,99 € / 11,99 $)')
check(pricing.includes('trip7: Object.freeze({ eur: 499, usd: 599 })'), 'pricing.js mirrors the server trip7 price (4,99 € / 5,99 $)')
check(pricing.includes('season: Object.freeze({ eur: 1999, usd: null })'), 'pricing.js mirrors the server season price (19,99 €, absent en USD)')
// 2026-11-09 : le pass « SOS » (1 €) a été retiré du parcours client — il ne
// doit plus être proposé au client (la LIVRAISON des paiements déjà encaissés
// reste gérée côté serveur, cf. FULFILL_PRICES).
check(!pricing.includes('sos: Object.freeze({ eur: 100, usd: null })'), 'pricing.js ne propose plus le pass SOS (1,00 €)')
check(!/PASS_KEYS\s*=\s*Object\.freeze\(\[[^\]]*sos/.test(pricing), 'PASS_KEYS ne contient plus le pass « sos »')
check(pricing.includes('USD_HIGH_SEASON_RATE = 0.15'), 'pricing.js mirrors the USD high-season surcharge (+15 %)')
check(pricing.includes('resolvePass'), 'pricing.js exposes resolvePass (fallback p30 si le pass n’est pas vendu)')
check(offer.includes('resolvePass(passKey, cur)'), 'PassOffer falls back to the main offer when a pass is not sold in the currency')
check(/onBuy\(\{c:baseCents,cents:effCents,baseCents,pass:key,days,segment:seg\}\)/.test(offer),
  'checkout callback sends the BASE cents and reports the EFFECTIVE cents')
check(offer.includes('track("sg_pass_cta"') && offer.includes('base_cents:baseCents'), 'CTA event carries both base and effective cents')

console.log('\nPASS_COPY_TESTS', failures === 0 ? 'PASS' : 'FAIL')
process.exit(failures ? 1 : 0)

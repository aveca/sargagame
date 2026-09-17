#!/usr/bin/env node
/**
 * paywall-email-pre.test.cjs — Test A1 (email capture AVANT le CTA du paywall).
 *
 * Contexte : l'email n'était capturé qu'au paiement ou après l'offre
 * (WorldPaywall, variant live unique — ComicPaywall dormant, non servi en prod).
 * A1 ajoute un champ optionnel pré-CTA avec soumission lead immédiate (G1),
 * SANS jamais bloquer le CTA (décision CRO J0-J30 conservée).
 *
 * Partie A — audits de source :
 *  1. WorldPaywall branche le hook (import + flag emailPre + rollback ?email_pre=0).
 *  2. Le bloc pré-CTA est rendu AVANT la carte PassOffer (ordre source).
 *  3. L'input pré-CTA : type=email, data-testid, JAMAIS required.
 *  4. CTA non conditionné à l'email (onPassBuy sans garde email).
 *  5. submitLead câblé (commonPaywallProps + hook, source "paywall_pre").
 *  6. Gardes J0-J30 intacts (payOrderOfferFirst + PassOffer-avant-email + rollback).
 *  7. ComicPaywall (dormant) non touché par A1.
 *
 * Partie B — unit réel du helper (node, sans React render) :
 *  8. isValidEmail : cas valides/invalides.
 *  9. shouldSubmitEmail : valide + dédup anti-doublon + rejet invalide.
 *  10. emailPreEnabled : ON par défaut, OFF avec ?email_pre=0.
 *
 * Le flux réel (preview + Playwright : lead POST observé, CTA cliquable sans
 * email, rollback ?email_pre=0) est prouvé à la main et consigné dans
 * MASTER_AUDIT.md. Exit 1 si échec.
 */
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const ROOT = path.resolve(__dirname, '..', '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
let failures = 0
function ok(cond, label) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}`)
  if (!cond) failures++
}

async function main() {
  console.log('Partie A : audits de source')
  const WP = read('src/PremiumModal/WorldPaywall.jsx')
  const PM = read('src/PremiumModal.jsx')
  const HOOK = read('src/PremiumModal/preCtaEmail.js')
  const COMIC = read('src/PremiumModal/ComicPaywall.jsx')

  ok(WP.includes('./preCtaEmail.js') && WP.includes('usePreCtaEmail') && WP.includes('emailPreEnabled'), 'WorldPaywall branche le hook A1')
  ok(/email_pre=0/.test(WP), 'rollback ?email_pre=0 présent')
  const preIdx = WP.indexOf('EMAIL PRÉ-CTA (A1')
  const offerIdx = WP.indexOf('Pricing card (PassOffer)')
  ok(preIdx !== -1 && offerIdx !== -1 && preIdx < offerIdx, 'bloc pré-CTA rendu AVANT la carte PassOffer')
  const preBlock = preIdx !== -1 ? WP.slice(preIdx, offerIdx) : ''
  ok(preBlock.includes('data-testid="pre-cta-email"') && preBlock.includes('type="email"'), 'input pré-CTA typé + testid')
  const preInputs = [...preBlock.matchAll(/<input\b[^>]*>/g)].map((m) => m[0])
  ok(preInputs.length > 0 && preInputs.every((tag) => !/\brequired\b/.test(tag)), 'input pré-CTA JAMAIS required (attribut)')
  // CTA non conditionné : onPassBuy ne teste aucun email.
  const onBuy = PM.match(/const onPassBuy[\s\S]*?\n  \},\[/)
  ok(!!onBuy && !/email/i.test(onBuy[0]), 'onPassBuy sans garde email (CTA jamais bloqué)')
  ok(PM.includes('submitLead, // A1'), 'submitLead dans commonPaywallProps')
  ok(HOOK.includes('PRE_CTA_SOURCE = "paywall_pre"'), 'source lead = "paywall_pre"')
  ok(/submitLead\(email,\s*PRE_CTA_SOURCE\)|submitLead && submitLead\(email/.test(HOOK), 'hook soumet le lead via submitLead')
  // Gardes J0-J30 intacts.
  ok(/sgpayorder=0/.test(WP) && /payOrderOfferFirst/.test(WP), 'flag payOrderOfferFirst + rollback intacts')
  ok(WP.indexOf('{payOrderOfferFirst && (') !== -1, 'pattern PassOffer-avant-email intact (contrat j0)')
  ok(!/type="email"[\s\S]{0,120}required/.test(WP), 'aucun email required côté World (contrat j0)')
  ok(!COMIC.includes('email_pre') && !COMIC.includes('preCtaEmail'), 'ComicPaywall (dormant) non touché')

  console.log('Partie B : unit réel du helper')
  const mod = await import(pathToFileURL(path.join(ROOT, 'src', 'PremiumModal', 'preCtaEmail.js')).href)
  ok(mod.isValidEmail('a@b.c') && mod.isValidEmail('x.y+z@dom.co'), 'isValidEmail accepte valides')
  ok(!mod.isValidEmail('') && !mod.isValidEmail('nope') && !mod.isValidEmail('a@b') && !mod.isValidEmail('a b@c.d'), 'isValidEmail rejette invalides')
  ok(mod.shouldSubmitEmail('a@b.c', '') === 'a@b.c', 'shouldSubmitEmail soumet 1re fois')
  ok(mod.shouldSubmitEmail('a@b.c', 'a@b.c') === null, 'shouldSubmitEmail dédup anti-doublon')
  ok(mod.shouldSubmitEmail('nope', '') === null, 'shouldSubmitEmail rejette invalide')
  ok(mod.shouldSubmitEmail('  a@b.c  ', '') === 'a@b.c', 'shouldSubmitEmail trim')
  global.window = { location: { search: '' } }
  ok(mod.emailPreEnabled() === true, 'emailPreEnabled ON par défaut')
  global.window = { location: { search: '?paywall=1&email_pre=0' } }
  ok(mod.emailPreEnabled() === false, 'emailPreEnabled OFF avec ?email_pre=0')
  delete global.window

  console.log(failures === 0 ? '\nPAYWALL-EMAIL-PRE TESTS: ALL PASS' : `\nPAYWALL-EMAIL-PRE TESTS: ${failures} ÉCHEC(S)`)
  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('Erreur harnais test:', e && e.message)
  process.exit(1)
})

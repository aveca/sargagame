#!/usr/bin/env node
'use strict'

/**
 * pass-cta-measurement.test.cjs — la MESURE du CTA B2C doit dire la vérité.
 *
 * DÉFAUT RÉEL, MESURÉ SUR LE LIVE (2026-11-26) :
 *   `?action=funnel` sur 28 j rapportait
 *     premium_modal_open = 1 147 · premium_modal_cta = 4 · pass_cta = 0
 *   `pass_cta` est pourtant, d'après l'agrégateur lui-même
 *   (scripts/appscript/Code.js:585), « le VRAI CTA du storefront (sg_pass_cta) »
 *   depuis le flip pass-only du 2026-06-25. Contrôle navigateur sur /alertes/ :
 *   le clic sur la carte CTA émet bien `sg_pass_cta` (POST vers Supabase).
 *
 * CAUSE RACINE n°1 — la beacon Apps Script ne partait JAMAIS pour ce clic.
 *   `track()` (src/Sargasses_PROD.jsx) n'envoie vers Apps Script (donc vers la
 *   feuille `analytics_events` lue par `?action=funnel`) que les événements
 *   `critical`. La liste couvrait `startsWith("sg_premium")` (l'ANCIEN
 *   abonnement, surface retirée) mais PAS `sg_pass_cta` — le seul CTA réel
 *   depuis 5 mois. Le tunnel mesurait donc une surface morte.
 *
 * CAUSE RACINE n°2 — le clic était compté DEUX fois.
 *   `PassOffer.buy()` émettait `sg_pass_cta` (avec copy_variant), PUIS le
 *   `onBuy` de PremiumModal émettait le MÊME `sg_pass_cta` (avec source) →
 *   2 lignes par clic. Corriger n°1 seul aurait gonflé le taux affiché ×2 :
 *   un « bon » chiffre de mesure qui aurait menti.
 *
 * CONTRAT VERROUILLÉ ICI (les deux causes) :
 *   1. `sg_pass_cta` figure dans la liste `critical` de track() ;
 *   2. toute étape du tunnel déclarée dans SG_FUNNEL_EVENTS est couverte par
 *      `critical` (sinon une étape redevient invisible) ;
 *   3. `sg_pass_cta` n'est émis QU'UNE fois par clic : depuis PassOffer, jamais
 *      depuis PremiumModal (aucune émission ne peut lire `item.` = le payload
 *      du clic PassOffer) ;
 *   4. l'émission unique porte l'attribution COMPLÈTE (copy_variant ET source).
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const app = fs.readFileSync(path.join(ROOT, 'src', 'Sargasses_PROD.jsx'), 'utf8')
const offer = fs.readFileSync(path.join(ROOT, 'src', 'PassOffer.jsx'), 'utf8')
const modal = fs.readFileSync(path.join(ROOT, 'src', 'PremiumModal.jsx'), 'utf8')

// ── 1. sg_pass_cta doit être dans la liste `critical` ───────────────────────
const criticalBlock = app.slice(
  app.indexOf('const critical='),
  app.indexOf('if(remoteEnabled&&critical){')
)
assert.ok(criticalBlock.length > 200, 'bloc `critical` introuvable dans track()')
assert.ok(
  criticalBlock.includes('event==="sg_pass_cta"'),
  'sg_pass_cta (CTA reel du storefront pass-only) doit etre dans la file critique : ' +
    'sans lui la beacon Apps Script ne part jamais et ?action=funnel compte 0 CTA'
)
assert.ok(/startsWith\("sg_premium"\)/.test(criticalBlock),
  'le prefixe sg_premium doit rester (premium_modal_cta historique)')

// ── 2. aucune étape du tunnel hors de la file critique ─────────────────────
const funnelBlock = app.slice(
  app.indexOf('const SG_FUNNEL_EVENTS'),
  app.indexOf('export function track')
)
const declared = new Set()
for (const m of funnelBlock.matchAll(/"((?:sg_|pricing_|CTA_|checkout_)[A-Za-z0-9_]+)"/g)) declared.add(m[1])
assert.ok(declared.has('sg_pass_cta'), 'sg_pass_cta doit rester déclaré dans SG_FUNNEL_EVENTS')

const STEPS = [
  'sg_session_start', 'sg_forecast_lock_click',
  'sg_premium_modal_open', 'sg_premium_modal_cta', 'sg_pass_cta',
  'sg_checkout_started', 'sg_checkout_redirect', 'sg_conversion',
  'sg_email_submit'
]
const prefixes = [...criticalBlock.matchAll(/startsWith\("([^"]+)"\)/g)].map((m) => m[1])
const covered = (evt) =>
  criticalBlock.includes(`event==="${evt}"`) || prefixes.some((p) => evt.startsWith(p))
const blindSteps = STEPS.filter((evt) => declared.has(evt) && !covered(evt))
assert.deepStrictEqual(blindSteps, [],
  'ces étapes du tunnel sont declarees mesurables mais SANS chemin vers la feuille ' +
    'analytics_events (?action=funnel les lira a 0) : ' + blindSteps.join(', '))

// ── 3. UNE seule émission `sg_pass_cta` par clic PassOffer ─────────────────
assert.strictEqual((offer.match(/track\("sg_pass_cta"/g) || []).length, 1,
  'PassOffer doit emettre sg_pass_cta exactement UNE fois (buy)')
assert.ok(!/track\("sg_pass_cta",\{pass:item\./.test(modal),
  'PremiumModal ne doit plus re-emettre sg_pass_cta depuis le onBuy de PassOffer ' +
    '(doublon : 2 lignes par clic, taux modal→CTA gonfle ×2)')
assert.ok(!/track\("sg_pass_cta",\{[^}]*item\.(pass|cents|baseCents)/.test(modal),
  'aucune emission sg_pass_cta de PremiumModal ne doit lire le payload PassOffer (item.*)')
assert.strictEqual((modal.match(/source=\{source\|\|"unknown"\}/g) || []).length, 2,
  'les deux points de montage de PassStorefront doivent passer source, sinon la ' +
    'segmentation modale par source dans ?action=funnel perd le CTA')
assert.ok(/copy_variant:\s*copyVariant/.test(modal),
  'l emission sg_pass_cta de PassStorefront doit porter copy_variant (variante A/B)')
assert.ok(/segment:\s*seg/.test(modal),
  'l emission sg_pass_cta de PassStorefront doit porter segment (visiteur)')

// ── 4. l'émission unique porte l'attribution complète ─────────────────────
const buyBody = offer.slice(offer.indexOf('const buy=()=>{'), offer.indexOf('const lost ='))
assert.ok(buyBody.length > 100, 'corps de buy() introuvable dans PassOffer')
assert.strictEqual((buyBody.match(/track\("sg_pass_cta"/g) || []).length, 1,
  'une seule emission sg_pass_cta dans buy()')
for (const field of ['copy_variant:copyVariant', 'source:ctaSource', 'segment:seg', 'onsite:1']) {
  assert.ok(buyBody.includes(field),
    'l emission sg_pass_cta doit porter ' + field + ' (attribution du clic)')
}
assert.ok(buyBody.includes('base_cents:baseCents') && buyBody.includes('cents:effCents'),
  'l emission sg_pass_cta doit porter les deux montants (affiché et envoyé au serveur)')

console.log('OK cause n°1 : sg_pass_cta est critique → la beacon Apps Script part, ?action=funnel voit le vrai CTA')
console.log('OK cause n°2 : un seul sg_pass_cta par clic, avec copy_variant ET source (pas de taux gonflé ×2)')
console.log('OK invariant : aucune étape du tunnel declaree n est hors de la file critique')
#!/usr/bin/env node
'use strict'

/**
 * landing-pass-cta-attribution.test.cjs — l'attribution doit dire la vérité.
 *
 * DÉFAUT RÉEL, MESURÉ SUR LE LIVE (fenêtre 28 j, 2026-11-26) :
 *   `?action=funnel` rapportait pour la source `deeplink` :
 *     premium_modal_open = 504 · premium_modal_cta = 0
 *   `deeplink` est le bucket fourre-tout du deep-link paywall
 *   (src/Sargasses_PROD.jsx : `utm_source` absent → `"deeplink_"+u` tronqué).
 *
 * CAUSE RACINE — le CTA voyageur du premier peint des 6 accuels de région
 * était le SEUL producteur utilisateur de `?paywall=1` sans `utm_source`.
 * Preuve par balayage des pages prod (lecture seule, 2026-11-26) : chaque
 * domaine n'a qu'un lien `?paywall=1`, tous nus. Tous les autres producteurs
 * du dépôt passent déjà `utm_source` (emails, campagnes, fiche-dive,
 * `/a-propos/`, noscript `/alertes/`). Ce CTA porte un prix réel
 * (`Pass voyageur 14,99 €`, `Traveler pass $16.99`, `Pase viajero`), c'est
 * donc la plus grande entrée B2C à haute intention, et elle n'était attributable
 * à aucune campagne : 504 ouvertures rendues indiscernables du bruit.
 *
 * CONTRAT VERROUILLÉ ICI :
 *   1. les 3 CTA `?paywall=1` de `scripts/lib/home-first.cjs` conservent
 *      `pass=p30` (l'offre ne change pas) ;
 *   2. chacun porte `utm_source=landing_pass` (la source devient explicite) ;
 *   3. le généré (FR/EN/ES) contient cette source, pas seulement la source JS ;
 *   4. aucun `?paywall=1` de ce premier peint ne repart nu.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { firstPaintInner } = require('../../scripts/lib/home-first.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'home-first.cjs'), 'utf8')

// 1. audit de la source du générateur (les 3 langues sont écrites à la main)
const paywallHrefs = [...src.matchAll(/href="(\/\?paywall=1[^"]*)"/g)].map((m) => m[1])
assert.ok(paywallHrefs.length >= 3,
  'au moins 3 CTAs paywall attendus (FR, EN, ES) dans home-first.cjs, trouvé ' +
  paywallHrefs.length)
for (const raw of paywallHrefs) {
  const href = raw.split('&' + 'amp;').join('&')
  assert.match(href, /^\/\?paywall=1&pass=p30&utm_source=landing_pass$/,
    'le CTA paywall du premier peint doit garder pass=p30 ET porter ' +
      'utm_source=landing_pass (sinon il retombe dans le bucket deeplink fourre-tout) : ' + href)
}

// 2. audit du HTML réellement généré, une fois par langue réellement servie
const regions = ['gp', 'florida', 'tulum'].map((id) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8')))
const iso = '2026-11-26T12:00:00.000Z'
const seenLabels = new Set()
for (const region of regions) {
  const html = firstPaintInner(region, iso)
  const raw = [...html.matchAll(/href="(\/\?paywall=1[^"]*)"/g)].map((m) => m[1])
  assert.strictEqual(raw.length, 1,
    'un seul CTA paywall par premier peint, trouvé ' + raw.length + ' pour ' + region.id)
  const href = raw[0].split('&' + 'amp;').join('&')
  assert.match(href, /^\/\?paywall=1&pass=p30&utm_source=landing_pass$/,
    'HTML généré ' + region.id + ' : attribution landing_pass manquante sur ' + href)
  // le libellé porteur du CTA doit rester une promesse de pass, pas une promo inventée
  const label = (/<a href="\/\?paywall=1[^"]*"[^>]*>([^<]*)<\/a>/.exec(html) || [])[1] || ''
  seenLabels.add(label.trim())
}
assert.ok([...seenLabels].length === 3,
  'les 3 libellés de langue doivent rester (FR/EN/ES) ; trouvé ' +
    JSON.stringify([...seenLabels]))
for (const label of seenLabels) {
  assert.match(label, /^(Pass voyageur|Traveler pass|Pase viajero)\b/,
    'libellé inattendu (aucune promo inventée autorisée) : ' + label)
}

console.log('OK : les 3 CTA voyageur du premier peint portent utm_source=landing_pass (bucket deeplink démarquable)')
console.log('OK : pass=p30 conservé sur les 3 langues (FR/EN/ES), aucune offre modifiée')
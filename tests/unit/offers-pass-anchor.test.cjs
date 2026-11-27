#!/usr/bin/env node
'use strict'

/**
 * offers-pass-anchor.test.cjs — l'ancre `#pass` promise par un email de
 * récupération de panier doit exister réellement.
 *
 * DÉFAUT RÉEL DANS LE DÉPÔT (pas une production live) :
 *   scripts/automation/cart-recovery-j3.cjs:46 pointait vers
 *   `https://sargasses-martinique.com/#pass`, alors que `/#pass` n'existe
 *   nulle part dans src/ ni dans les pages générées. La SEULE ancre de la page
 *   `/offres/` était `id="pro"` (section B2B). Le lien de récupération B2C ne
 *   pouvait donc pas atterrir sur la grille des passes.
 *
 * CONTEXTE HONNÊTE : `cart-recovery-j3.cjs` n'est référencé par AUCUN workflow
 * (workflow vivant = `sales-lifecycle-emails.yml` → `recover-abandoned-cart.cjs`).
 * Il n'y a donc AUCUN impact live aujourd'hui. Ce test verrouille la cohérence
 * pour que la réactivation d'un ancien script ne renvoie pas un lien mort.
 *
 * CONTRAT VERROUILLÉ ICI :
 *   1. la grille B2C de `/offres/` porte `id="pass"` (ancre cible) ;
 *   2. la section B2B conserve `id="pro"` (les CTA Pro de home-first.cjs sont
 *      volontairement `/offres/#pro` : ce sont des CTA B2B, pas des passes) ;
 *   3. un seul `#pass` sur la page (pas de doublon d'id) ;
 *   4. le script de récupération de panier pointe vers `/offres/#pass`, pas
 *      vers `/#pass`.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { buildOffersPage } = require('../../scripts/lib/offers-page.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const iso = '2026-11-26T12:00:00.000Z'

const regions = ['gp', 'florida', 'tulum'].map((id) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8')))

for (const region of regions) {
  const html = buildOffersPage(region, iso)
  assert.match(html, /<div class="grid" id="pass">/,
    region.id + ' : la grille B2C doit porter id="pass" (cible des emails de récupération)')
  assert.match(html, /<section id="pro">/,
    region.id + ' : la section B2B doit conserver id="pro" (CTA Pro de l\'accueil)')
  assert.strictEqual((html.match(/id="pass"/g) || []).length, 1,
    region.id + ' : un seul id="pass" attendu (doublon = lien ambigu)')
  assert.strictEqual((html.match(/id="pro"/g) || []).length, 1,
    region.id + ' : un seul id="pro" attendu (doublon = lien ambigu)')
}

const cart = fs.readFileSync(path.join(ROOT, 'scripts', 'automation', 'cart-recovery-j3.cjs'), 'utf8')
assert.match(cart, /const PASS_URL = 'https:\/\/sargasses-martinique\.com\/offres\/#pass';/,
  'le script de récupération de panier doit pointer vers /offres/#pass, pas vers /#pass (ancre inexistante)')
assert.doesNotMatch(cart, /https:\/\/sargasses-martinique\.com\/#pass/,
  'aucun lien vers /#pass ne doit rester : cette ancre n\'existe pas')

console.log('OK : /offres/ expose id="pass" et conserve id="pro" (pas de CTA Pro recâblé par erreur)')
console.log('OK : le lien de récupération de panier cible /offres/#pass (plus de #pass mort)')
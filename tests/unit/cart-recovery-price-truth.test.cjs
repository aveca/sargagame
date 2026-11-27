#!/usr/bin/env node
'use strict';

/**
 * cart-recovery-price-truth.test.cjs — PRIX ANNONCÉ = PRIX FACTURÉ.
 *
 * DÉFAUT RÉEL DANS LE DÉPÔT (aucun impact live aujourd'hui) :
 *   La famille `scripts/automation/cart-recovery-*` (j1, j3, j5, unified) et
 *   ses 3 templates annonçaient « 12,99 € · 9,99 $ · 11,99 $ » et une remise
 *   « −2 € » via `?promo=sejour_promo_eur`. La grille réellement facturée est
 *   14,99 € / 16,99 $ (offre validée 2026-11-09, alignée sur le serveur de
 *   paiement EN PRODUCTION), et AUCUNE route de src/, workers/ ou public/api/
 *   ne lit `?promo=`. J+5 pointait en plus vers `/checkout` (route inexistante)
 *   et J+1 vers `payment-links.mollie.com/payment/your-sejour-eur-link`
 *   (placeholder jamais remplacé).
 *
 *   Ces scripts ne sont appelés par AUCUN workflow (le chemin vivant est
 *   `sales-lifecycle-emails.yml` → `recover-abandoned-cart.cjs`, qui affiche
 *   bien 14,99 € / 16,99 $). Le risque est donc dormant : il se matérialise à
 *   la première relance manuelle — un email qui promet un prix qu'aucun
 *   serveur ne facture.
 *
 * CONTRATS VERROUILLÉS ICI :
 *   1. `scripts/automation/lib/pass-price.cjs` renvoie la grille RÉELLE, égale
 *      à src/lib/pricing.js (miroir client du serveur de paiement) ;
 *   2. AUCUN montant, remise, paramètre promo ou lien mort n'est écrit en dur
 *      dans la famille cart-recovery (commentaires exclus du scan) ;
 *   3. chaque script de la famille LIT le prix via pass-price.cjs ;
 *   4. les templates exposent `{{prix}}` (injecté au rendu), pas de montant ;
 *   5. le CTA pointe vers le deep-link vivant `/?paywall=1&pass=p30` ;
 *   6. devise et domaine coïncident : une région USD ne reçoit pas un lien EUR.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { passPrice, paywallUrl, regionDomain } = require('../../scripts/automation/lib/pass-price.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * Retire les commentaires d'un source JS — les notes historiques du correctif
 * citent les anciens montants (« annonçait 12,99 € »), ce qui est de la
 * documentation, pas du code exécutable.
 * Règle URL : `//` n'est un commentaire que s'il n'est PAS précédé de `:`
 * (sinon `https://…` serait coupé).
 */
function stripComments(src) {
  // Normaliser les fins de ligne AVANT tout : ces fichiers sont en CRLF, et
  // `.` ne traversant pas `\r`, `// …$` ne matcherait jamais (aucun commentaire
  // ne serait retiré → le test échouerait sur de la simple documentation).
  const lf = src.replace(/\r\n?/g, '\n');
  const noBlock = lf.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join('\n');
}

const FAMILY = [
  'scripts/automation/cart-recovery-j1.cjs',
  'scripts/automation/cart-recovery-j3.cjs',
  'scripts/automation/cart-recovery-j5.cjs',
  'scripts/automation/cart-recovery-unified.cjs',
  'scripts/automation/cart-recovery-j1-template.md',
  'scripts/automation/cart-recovery-j3-template.md',
  'scripts/automation/cart-recovery-j5-template.md',
  'scripts/automation/lib/pass-price.cjs',
];

// Montants INTERDITS en dur : l'ancienne grille (périmée) ET la grille
// actuelle. Si un montant doit s'afficher, il vient de passPrice(region) —
// jamais d'un littéral dans ces fichiers.
const FORBIDDEN_AMOUNTS = [
  /12[.,]99/, /9[.,]99/, /11[.,]99/, /1299/, /1499/, /1699/, /899/, /2799/,
];
// Promesses interdites : remise, urgence factice, lien mort.
const FORBIDDEN_PATTERNS = [
  { re: /au lieu de/i, why: 'aucune remise n\'existe : afficher « au lieu de » = promettre un prix qui ne sera pas facturé' },
  { re: /[-−]\s*2\s*€/, why: 'remise de 2 € inventée' },
  { re: /sejour_promo_eur/, why: 'identifiant de promo lu par aucune route' },
  { re: /promo=/, why: 'paramètre `promo` sans handler (aucune route ne l\'applique)' },
  { re: /\/checkout\?/, why: 'la route `/checkout` n\'existe pas (deep-link vivant = /?paywall=1&pass=p30)' },
  { re: /payment-links\.mollie\.com/, why: 'placeholder de lien de paiement jamais remplacé (404)' },
  { re: /your-sejour/, why: 'placeholder de lien de paiement' },
  { re: /à vie|illimité à vie|accès illimité/i, why: 'le pass 30 jours donne 30 jours, pas un accès à vie' },
];

// ── 1. La grille RÉELLE, alignée sur src/lib/pricing.js ───────────────────
const pricingSrc = read('src/lib/pricing.js');
const cents = {};
const clientRe = /(p30|trip7|season):\s*Object\.freeze\(\{\s*eur:\s*(\d+),\s*usd:\s*(\d+)\s*\}\)/g;
let m;
while ((m = clientRe.exec(pricingSrc))) cents[m[1]] = { eur: Number(m[2]), usd: Number(m[3]) };

assert.ok(cents.p30, 'src/lib/pricing.js doit déclarer p30 (grille de référence)');

const eur = passPrice('mq');
const usd = passPrice('florida');

assert.strictEqual(eur.price, '14,99 €', 'MQ (EUR) : le prix annoncé doit être le prix facturé (14,99 €)');
assert.strictEqual(eur.cents, cents.p30.eur, 'les centimes EUR affichés doivent être ceux de src/lib/pricing.js');
assert.strictEqual(usd.price, '$16.99', 'Floride (USD) : idem en dollars ($16.99)');
assert.strictEqual(usd.cents, cents.p30.usd, 'les centimes USD affichés doivent être ceux de src/lib/pricing.js');
assert.strictEqual(usd.currency, 'USD', 'une région USD est facturée en USD');
assert.strictEqual(eur.currency, 'EUR', 'une région EUR est facturée en EUR');
assert.strictEqual(eur.days, 30, 'le pass vendu dans ces emails est le pass 30 jours');

// La même promesse pour toutes les régions facturées en USD.
for (const r of ['fl', 'puntacana', 'rivieramaya', 'tulum', 'barbados']) {
  const p = passPrice(r);
  assert.strictEqual(p.cents, cents.p30.usd, r + ' doit être facturée ' + cents.p30.usd + ' ¢ (USD)');
  assert.strictEqual(p.currency, 'USD', r + ' doit être facturée en USD');
}

// ── 2. Aucun montant / promesse / lien mort en dur ────────────────────────
for (const file of FAMILY) {
  const code = stripComments(read(file));
  for (const re of FORBIDDEN_AMOUNTS) {
    assert.ok(!re.test(code), file + ' : montant en dur interdit (' + re + ') — le prix doit venir de passPrice(region)');
  }
  for (const { re, why } of FORBIDDEN_PATTERNS) {
    assert.ok(!re.test(code), file + ' : ' + why);
  }
}

// ── 3. Chaque script LIT le prix (aucune demi-mesure) ─────────────────────
const SCRIPTS = FAMILY.filter((f) => f.endsWith('.cjs'));
for (const file of SCRIPTS) {
  const code = stripComments(read(file));
  assert.match(code, /require\(['"]\.\/lib\/pass-price\.cjs['"]\)|require\(['"]\.\.\/\.\.\/lib\/premium-page\.cjs['"]\)/,
    file + ' doit lire le prix dans pass-price.cjs (source verrouillée par price-parity)');
  assert.match(code, /passPrice\(/,
    file + ' doit APPELER passPrice(region) : importer sans appeler = prix jamais injecté');
}

// Les templates, eux, reçoivent le prix par placeholder — jamais en dur.
for (const file of FAMILY.filter((f) => f.endsWith('-template.md'))) {
  const tpl = read(file);
  assert.match(tpl, /\{\{prix\}\}/, file + ' : le prix doit être un placeholder {{prix}} injecté au rendu');
}

// ── 4. Le CTA pointe vers le deep-link VIVANT ─────────────────────────────
const url = paywallUrl('mq', 'j5');
assert.match(url, /^https:\/\/sargasses-martinique\.com\/\?paywall=1&pass=p30&/,
  'le CTA de relance doit utiliser /?paywall=1&pass=p30 (comme recover-abandoned-cart.cjs)');
assert.doesNotMatch(url, /promo=/, 'le CTA de relance ne doit pas porter de paramètre promo');

// ── 5. Devise et domaine coïncident ───────────────────────────────────────
for (const [region, domain] of [
  ['mq', 'sargasses-martinique.com'],
  ['gp', 'sargasses-guadeloupe.com'],
  ['florida', 'sargassummiami.com'],
  ['puntacana', 'sargassumpuntacana.com'],
  ['rivieramaya', 'sargassumcancun.com'],
  ['tulum', 'sargazotulum.com'],
]) {
  assert.strictEqual(regionDomain(region), domain, region + ' doit pointer sur ' + domain);
  const p = passPrice(region);
  if (p.currency === 'USD') {
    assert.ok(!domain.endsWith('sargasses-martinique.com') && !domain.endsWith('sargasses-guadeloupe.com'),
      region + ' est facturée en USD : son domaine ne doit pas être un domaine EUR');
  }
}

console.log('OK : la famille cart-recovery annonce le prix facturé (14,99 € / 16,99 $), sans remise ni lien mort');
console.log('OK : les prix viennent de pass-price.cjs (parité verrouillée par price-parity.test.cjs)');
console.log('OK : le CTA de relance utilise le deep-link vivant /?paywall=1&pass=p30');
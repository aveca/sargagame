#!/usr/bin/env node
'use strict';

/**
 * price-parity.test.cjs — PARITÉ DES PRIX B2C (source unique = le serveur).
 *
 * ⚠️ 2026-11-09 — NOUVEAU CONTRAT (offre validée + alignement sur le serveur
 * de paiement EN PRODUCTION, `workers/sg-payments` live) :
 *
 *   pass     │ EUR    │ USD
 *   ─────────┼────────┼────────
 *   trip7    │ 7,99 € │ $8.99
 *   p30      │ 14,99 €│ $16.99
 *   season   │ 24,99 €│ $27.99
 *
 *   • PLUS DE SURCHARGE USD DE HAUTE SAISON (+15 %, juin→novembre) : elle
 *     existait côté serveur (mollie.php ×1,15) et côté affichage. Le serveur
 *     live facture le montant AFFICHÉ. Un client qui voyait « 16,99 $ » et
 *     payait 19,54 $ avait une divergence affichage/débit : c'est supprimé.
 *   • Les prix HISTORIQUES (trip7 4,99 € / $5.99, p30 11,99 $, season
 *     19,99 €) restent LIVRABLES pour un paiement DÉJÀ encaissé avant la
 *     coupure du 2026-11-09 (date de création vérifiable) — encaisser sans
 *     livrer serait un trou de confiance. Un paiement NOUVEL au tarif ancien
 *     reste REFUSÉ.
 *
 * Ce test verrouille la parité entre TOUTES les sources de prix :
 *   1. src/lib/pricing.js             (client, miroir du serveur)
 *   2. public/api/mollie.php          ($passPrices — CRÉATION)
 *   3. public/api/mollie-lib.php      (mol_pass_prices — LIVRAISON +
 *                                      mol_historical_pass_prices — fenêtre)
 *   4. workers/sargagame/index.js     (PASS_PRICES / FULFILL_PRICES /
 *                                      HISTORICAL_PRICES — déployé par la CI)
 *   5. workers/sg-payments/index.js   (serveur de paiement Mollie live)
 *   6. scripts/lib/premium-page.cjs   (OFFERS / USD_OFFERS — page /premium/)
 *   7. public/api/create-checkout.php ($ALLOWED_CENTS — anti-tampering)
 *   8. regions/*.json                 (prix d'entrée affichés par région)
 * et vérifie que les surfaces PUBLIÉES affichent exactement ces montants.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pricingSrc = read('src/lib/pricing.js');
const molliePhp = read('public/api/mollie.php');
const mollieLibSrc = read('public/api/mollie-lib.php');
const workerJs = read('workers/sargagame/index.js');
const workerPayJs = read('workers/sg-payments/index.js');
const checkoutPhp = read('public/api/create-checkout.php');
const paypalPhp = read('public/api/paypal.php');
const premiumLib = require(path.join(root, 'scripts', 'lib', 'premium-page.cjs'));

let failures = 0;
function check(ok, label) {
  if (ok) console.log('  ok  ' + label);
  else { failures++; console.error('  FAIL ' + label); }
}

// ── 1. src/lib/pricing.js ─────────────────────────────────────────────────────
const clientPrices = {};
const clientRe = /(p30|trip7|season|sos):\s*Object\.freeze\(\{\s*eur:\s*(\d+),\s*usd:\s*(\d+|null)\s*\}\)/g;
let m;
while ((m = clientRe.exec(pricingSrc))) {
  clientPrices[m[1]] = { eur: Number(m[2]), usd: m[3] === 'null' ? null : Number(m[3]) };
}
const clientDays = {};
const clientDaysRe = /PASS_DAYS\s*=\s*Object\.freeze\(\{([^}]+)\}\)/.exec(pricingSrc);
if (clientDaysRe) {
  for (const part of clientDaysRe[1].split(',')) {
    const kv = part.split(':').map((x) => x.trim());
    if (kv.length === 2) clientDays[kv[0]] = Number(kv[1]);
  }
}

console.log('1. src/lib/pricing.js');
check(Object.keys(clientPrices).length === 3, 'les 3 passes sont déclarés (p30, trip7, season)');
check(!('sos' in clientPrices), 'le pass « sos » n’est PLUS déclaré côté client (retrait 2026-11-09)');
check(!/USD_HIGH_SEASON_RATE/.test(pricingSrc), 'plus de constante USD_HIGH_SEASON_RATE');
check(!/USD_HIGH_SEASON_MONTHS/.test(pricingSrc), 'plus de fenêtre USD_HIGH_SEASON_MONTHS');
check(!/isUsdHighSeason/.test(pricingSrc), 'plus de fonction isUsdHighSeason');
check(!/passHasSurcharge/.test(pricingSrc), 'plus de fonction passHasSurcharge');
check(!/1\.15/.test(pricingSrc), 'aucune surcharge ×1,15 résiduelle dans pricing.js');
check(/function passEffectiveCents/.test(pricingSrc), 'passEffectiveCents existe (API conservée)');
check(clientPrices.p30.eur === 1499 && clientPrices.p30.usd === 1699, 'p30 = 14,99 € / 16,99 $');
check(clientPrices.trip7.eur === 799 && clientPrices.trip7.usd === 899, 'trip7 = 7,99 € / 8,99 $');
check(clientPrices.season.eur === 2499 && clientPrices.season.usd === 2799, 'season = 24,99 € / 27,99 $');

// ── 2. public/api/mollie.php (création — source autoritative) ─────────────────
const serverPrices = {};
const serverRe = /'(p30|trip7|season|sos)'\s*=>\s*\['EUR'\s*=>\s*([\d.]+),\s*'USD'\s*=>\s*([\d.]+|null)\]/g;
while ((m = serverRe.exec(molliePhp))) {
  serverPrices[m[1]] = { eur: Math.round(Number(m[2]) * 100), usd: m[3] === 'null' ? null : Math.round(Number(m[3]) * 100) };
}

console.log('\n2. public/api/mollie.php ($passPrices — CRÉATION)');
check(Object.keys(serverPrices).length === 3, 'les 3 passes sont définis côté serveur');
check(!('sos' in serverPrices), 'le pass « sos » n’est PLUS créable côté serveur');
check(!/1\.15/.test(molliePhp), 'le serveur n’applique PLUS la surcharge ×1,15');
check(!/\$month\s*>=\s*6/.test(molliePhp), 'plus de fenêtre mensuelle de haute saison');
check(serverPrices.p30.eur === 1499 && serverPrices.p30.usd === 1699, 'p30 serveur = 14,99 € / 16,99 $');
check(serverPrices.trip7.eur === 799 && serverPrices.trip7.usd === 899, 'trip7 serveur = 7,99 € / 8,99 $');
check(serverPrices.season.eur === 2499 && serverPrices.season.usd === 2799, 'season serveur = 24,99 € / 27,99 $');
// Grille de LIVRAISON : `sos` reste accepté pour les paiements DÉJÀ encaissés.
check(/'sos'\s*=>\s*\[\s*'EUR'\s*=>\s*1\.0/.test(mollieLibSrc),
  'la grille de LIVRAISON (mollie-lib.php) conserve « sos » pour les paiements déjà encaissés');
// Fenêtre historique (montants de l'ancienne offre).
check(/function mol_historical_pass_prices/.test(mollieLibSrc), 'mollie-lib.php expose mol_historical_pass_prices()');
check(/function mol_offer_cutoff_date/.test(mollieLibSrc), 'mollie-lib.php expose mol_offer_cutoff_date()');
check(/mol_offer_cutoff_date\(\)/.test(mollieLibSrc), 'la fenêtre historique est branchée sur la date de coupure');
check(/2026-11-09/.test(mollieLibSrc), 'la date de coupure de l’ancienne offre est le 2026-11-09');

// ── 3. workers/sargagame/index.js (déployé par la CI sur les 6 workers) ───────
const workerPrices = {};
const workerRe = /(p30|trip7|season|sos):\{EUR:([\d.]+),USD:([\d.]+|null)\}/g;
while ((m = workerRe.exec(workerJs))) {
  workerPrices[m[1]] = { eur: Math.round(Number(m[2]) * 100), usd: m[3] === 'null' ? null : Math.round(Number(m[3]) * 100) };
}
const workerDays = {};
const workerDaysRe = /DAYS_TABLE\s*=\s*Object\.freeze\(\{([^}]+)\}\)/.exec(workerJs);
if (workerDaysRe) {
  for (const part of workerDaysRe[1].split(',')) {
    const kv = part.split(':').map((x) => x.trim());
    if (kv.length === 2) workerDays[kv[0]] = Number(kv[1]);
  }
}
console.log('\n3. workers/sargagame/index.js (validation des grants)');
for (const pass of Object.keys(serverPrices)) {
  check(workerPrices[pass] && workerPrices[pass].eur === serverPrices[pass].eur,
    'worker ' + pass + ' EUR = ' + serverPrices[pass].eur + '¢ (identique au serveur)');
  check(workerPrices[pass] && workerPrices[pass].usd === serverPrices[pass].usd,
    'worker ' + pass + ' USD = ' + serverPrices[pass].usd + '¢ (identique au serveur)');
}
check(JSON.stringify(workerDays) === JSON.stringify({ p30: 30, trip7: 7, season: 210, sos: 1 }),
  'DAYS_TABLE worker = p30/trip7/season/sos avec les bonnes durées');
check(!('p7' in workerDays) && !('saison' in workerDays), 'aucune clé legacy « p7 » / « saison » dans le worker');
check(!/1\.15/.test(workerJs), 'le worker régional n’applique PLUS la surcharge ×1,15');
check(/HISTORICAL_PRICES/.test(workerJs), 'le worker régional expose la grille HISTORICAL_PRICES');
check(/OFFER_CUTOFF_DATE\s*=\s*"2026-11-09/.test(workerJs), 'le worker régional fixe la coupure au 2026-11-09');
check(/created\s*<\s*Date\.parse\(OFFER_CUTOFF_DATE\)/.test(workerJs),
  'la fenêtre historique est conditionnée par la date de création du paiement');

// ── 3b. Séparation CRÉATION / LIVRAISON (retrait SOS 2026-11-09) ──────────────
const parsePriceBlock = (src, label) => {
  const re = new RegExp(label + '\\s*=\\s*(?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\n\\s*\\}\\)?;');
  const m = re.exec(src);
  const out = {};
  if (!m) return out;
  const kre = /(p30|trip7|season|sos)\s*:\s*\{\s*EUR\s*:\s*([\d.]+)\s*,\s*USD\s*:\s*([\d.]+|null)\s*\}/g;
  let mm;
  while ((mm = kre.exec(m[1]))) {
    out[mm[1]] = { eur: Math.round(Number(mm[2]) * 100), usd: mm[3] === 'null' ? null : Math.round(Number(mm[3]) * 100) };
  }
  return out;
};
console.log('\n3b. Séparation CRÉATION / LIVRAISON (pass « sos »)');
const workerCreate = parsePriceBlock(workerJs, 'const PASS_PRICES');
const workerFulfill = parsePriceBlock(workerJs, 'const FULFILL_PRICES');
check(Object.keys(workerCreate).length === 3 && !('sos' in workerCreate),
  'workers/sargagame PASS_PRICES (création) = 3 passes, sans « sos »');
check('sos' in workerFulfill && workerFulfill.sos.eur === 100,
  'workers/sargagame FULFILL_PRICES (livraison) conserve « sos » à 1,00 €');
check(/offre_indisponible/.test(workerJs) && /410/.test(workerJs),
  'workers/sargagame refuse la création d’un pass « sos » en 410 « offre_indisponible »');

const workerPayCreate = parsePriceBlock(workerPayJs, 'var PASS_PRICES');
const workerPayFulfill = parsePriceBlock(workerPayJs, 'var FULFILL_PRICES');
check(!('sos' in workerPayCreate),
  'workers/sg-payments PASS_PRICES (création) n’a PAS de « sos »');
check('sos' in workerPayFulfill && workerPayFulfill.sos.eur === 100,
  'workers/sg-payments FULFILL_PRICES (livraison) conserve « sos » à 1,00 €');
check(/hasOwnProperty\.call\(PASS_PRICES,\s*pass\)/.test(workerPayJs),
  'workers/sg-payments refuse un pass INCONNU à la création (fail-closed)');
check(/HISTORICAL_PASS_PRICES/.test(workerPayJs), 'workers/sg-payments expose HISTORICAL_PASS_PRICES');
check(/OFFER_CUTOFF_DATE\s*=\s*"2026-11-09/.test(workerPayJs), 'workers/sg-payments fixe la coupure au 2026-11-09');
check(!/1\.15/.test(workerPayJs), 'workers/sg-payments n’applique PLUS la surcharge ×1,15');
check(workerPayCreate.p30.eur === 1499 && workerPayCreate.p30.usd === 1699 &&
  workerPayCreate.trip7.eur === 799 && workerPayCreate.trip7.usd === 899 &&
  workerPayCreate.season.eur === 2499 && workerPayCreate.season.usd === 2799,
  'workers/sg-payments PASS_PRICES = les 3 passes de l’offre validée (EUR + USD)');

console.log('\n3c. Catalogue public /premium/');
check(!premiumLib.OFFERS.some((o) => o.pass === 'sos'),
  'scripts/lib/premium-page.cjs n’offre plus le pass « sos »');
check(!premiumLib.USD_OFFERS.some((o) => o.pass === 'sos'),
  'scripts/lib/premium-page.cjs n’offre plus le pass « sos » en USD');

// ── 4. Parité client ↔ serveur ↔ worker ──────────────────────────────────────
console.log('\n4. Parité client / serveur / worker');
for (const pass of Object.keys(serverPrices)) {
  const c = clientPrices[pass] || {};
  check(c.eur === serverPrices[pass].eur, 'pricing.js ' + pass + '.eur = ' + serverPrices[pass].eur + '¢');
  check(c.usd === serverPrices[pass].usd, 'pricing.js ' + pass + '.usd = ' + serverPrices[pass].usd + '¢');
  check(clientDays[pass] === workerDays[pass], 'pricing.js ' + pass + '.days = ' + workerDays[pass] + ' j');
}

// ── 5. scripts/lib/premium-page.cjs (catalogue de la page /premium/) ─────────
console.log('\n5. scripts/lib/premium-page.cjs (OFFERS)');
for (const o of premiumLib.OFFERS) {
  check(clientPrices[o.pass] && clientPrices[o.pass].eur === o.cents,
    'OFFERS ' + o.pass + ' = ' + o.cents + '¢ (identique au serveur)');
  check(clientDays[o.pass] === o.days, 'OFFERS ' + o.pass + ' = ' + o.days + ' jours');
}
for (const o of premiumLib.USD_OFFERS) {
  check(clientPrices[o.pass] && clientPrices[o.pass].usd === o.cents,
    'USD_OFFERS ' + o.pass + ' = ' + o.cents + '¢ (identique au serveur)');
}
check(premiumLib.OFFERS.length === 3, 'la page /premium/ propose les 3 passes en EUR');
check(premiumLib.USD_OFFERS.length === 3, 'la page /premium/ propose les 3 passes en USD');
check(!/USD_HIGH_SEASON/.test(fs.readFileSync(path.join(root, 'scripts', 'lib', 'premium-page.cjs'), 'utf8')),
  'plus de constante USD_HIGH_SEASON dans premium-page.cjs');
check(premiumLib.effectiveCents({ pass: 'p30', cents: 1699, cur: 'USD' }, new Date(2026, 10, 4)) === 1699,
  'aucune surcharge saisonnière : p30 USD reste à 1699¢ (16,99 $)');
check(premiumLib.effectiveCents({ pass: 'p30', cents: 1699, cur: 'USD' }, new Date(2026, 0, 4)) === 1699,
  'aucune surcharge saisonnière : p30 USD reste à 1699¢ (16,99 $) en janvier');
check(premiumLib.effectiveCents({ pass: 'trip7', cents: 899, cur: 'USD' }, new Date(2026, 10, 4)) === 899,
  'trip7 USD n’est jamais surchargé');

// ── 6. Allowlists anti-tampering ─────────────────────────────────────────────
console.log('\n6. Allowlists anti-tampering (create-checkout.php / paypal.php)');
const allowRe = /\$ALLOWED_CENTS\s*=\s*\$isUsd\s*\?\s*\[([\d,\s]+)\]\s*:\s*\[([\d,\s]+)\]/;
const allowM = allowRe.exec(checkoutPhp);
check(!!allowM, 'la ligne $ALLOWED_CENTS est retrouvée');
if (allowM) {
  const usd = allowM[1].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  const eur = allowM[2].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  check(JSON.stringify(eur) === JSON.stringify([799, 1499, 2499]),
    'allowlist EUR = [799, 1499, 2499] (7,99 / 14,99 / 24,99 €) — sans résidu legacy');
  check(JSON.stringify(usd) === JSON.stringify([899, 1699, 2799]),
    'allowlist USD = [899, 1699, 2799] ($8.99 / $16.99 / $27.99) — sans résidu legacy');
  for (const pass of Object.keys(serverPrices)) {
    check(eur.includes(clientPrices[pass].eur), 'allowlist EUR contient ' + pass + ' (' + clientPrices[pass].eur + ')');
    check(usd.includes(clientPrices[pass].usd), 'allowlist USD contient ' + pass + ' (' + clientPrices[pass].usd + ')');
  }
}
const ppM = /pp_currency_and_allowed[\s\S]{0,400}?\[([\d,\s]+)\]\s*:\s*\[([\d,\s]+)\]/.exec(paypalPhp);
check(!!ppM, 'la grille paypal.php est retrouvée');
if (ppM) {
  const usd = ppM[1].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  const eur = ppM[2].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  check(JSON.stringify(eur) === JSON.stringify([799, 1499, 2499]), 'allowlist paypal EUR = [799, 1499, 2499]');
  check(JSON.stringify(usd) === JSON.stringify([899, 1699, 2799]), 'allowlist paypal USD = [899, 1699, 2799]');
}

// ── 7. Surfaces publiées : prix affichés = prix débités ───────────────────────
console.log('\n7. Surfaces publiées (affichage = débit)');
const offres = read('public/offres/index.html');
check(offres.includes('14,99 €'), '/offres/ affiche 14,99 € (Pass 30 jours)');
check(offres.includes('7,99 €'), '/offres/ affiche 7,99 € (Pass 7 jours)');
check(offres.includes('24,99 €'), '/offres/ affiche 24,99 € (Pass Saison)');
check(!/(?<![\d.,])4,99/.test(offres), '/offres/ n’affiche plus 4,99 € (ancien tarif)');
check(!/(?<![\d.,])19,99/.test(offres), '/offres/ n’affiche plus 19,99 € (ancien tarif)');
check(/pass=p30/.test(offres), '/offres/ : le CTA 30 jours porte ?pass=p30');
check(/pass=trip7/.test(offres), '/offres/ : le CTA 7 jours porte ?pass=trip7');
check(/pass=season/.test(offres), '/offres/ : le CTA saison porte ?pass=season (et NON ?pass=saison)');
check(!/pass=saison/.test(offres), '/offres/ : aucune clé serveur invalide « saison »');

const cgv = read('public/cgv.html');
check(cgv.includes('7,99 € (zone EUR)'), 'CGV : Pass 7 jours = 7,99 € (zone EUR)');
check(cgv.includes('8,99 $ (zone USD)'), 'CGV : Pass 7 jours = 8,99 $ (zone USD)');
check(cgv.includes('14,99 € (zone EUR)'), 'CGV : Pass 30 jours = 14,99 € (zone EUR)');
check(cgv.includes('16,99 $ (zone USD)'), 'CGV : Pass 30 jours = 16,99 $ (zone USD)');
check(cgv.includes('24,99 € (zone EUR)'), 'CGV : Pass Saison = 24,99 € (zone EUR)');
check(cgv.includes('27,99 $ (zone USD)'), 'CGV : Pass Saison = 27,99 $ (zone USD)');
check(!cgv.includes('+15 %'), 'CGV : plus de mention de la surcharge USD de haute saison');
check(!/(?<![\d.,])4,99/.test(cgv), 'CGV : plus de 4,99 € (ancien tarif)');
check(!/(?<![\d.,])19,99/.test(cgv), 'CGV : plus de 19,99 € (ancien tarif)');

const premiumPage = read('public/premium/index.html');
check(!/\/mois/.test(premiumPage), '/premium/ n’annonce plus aucun abonnement « /mois »');
check(!/S’abonner|S'abonner/.test(premiumPage), '/premium/ : plus de bouton « S’abonner »');
check(premiumPage.includes('"cents":799') && premiumPage.includes('"cents":1499') &&
  premiumPage.includes('"cents":2499'),
  '/premium/ : le catalogue embarqué contient les 3 passes EUR aux bons centimes');
check(premiumPage.includes('"cents":899') && premiumPage.includes('"cents":1699') &&
  premiumPage.includes('"cents":2799'),
  '/premium/ : le catalogue embarqué contient les 3 passes USD aux bons centimes');
check(!/"pass"\s*:\s*"sos"/.test(premiumPage) && !/"cents"\s*:\s*100[,\}]/.test(premiumPage),
  '/premium/ : le catalogue embarqué ne propose plus le pass « sos » (1,00 €)');
check(!/HIGH_MONTHS/.test(premiumPage) && !/RATE = 0\.15/.test(premiumPage),
  '/premium/ : plus de mécanisme de surcharge saisonnière');
check(!/"cents":499/.test(premiumPage) && !/"cents":599/.test(premiumPage) &&
  !/"cents":1199/.test(premiumPage) && !/"cents":1999/.test(premiumPage),
  '/premium/ : plus aucun centime de l’ancienne offre');

// Surfaces éditoriales : prix d’entrée = 7,99 € / $8.99 (offre validée).
const entrySurfaces = [
  ['public/a-propos/index.html', '7,99 €'],
  ['public/about/index.html', '€7.99'],
  ['public/veilleur/index.html', '7,99 €'],
  ['src/HomeAZ.jsx', '7,99 €'],
  ['src/HomeJuicy.jsx', '7,99 €'],
  ['src/VerticalesMap.jsx', '7,99 €'],
];
for (const [f, needle] of entrySurfaces) {
  const s = read(f);
  check(s.includes(needle), f + ' : affiche le prix d’entrée ' + needle);
  check(!/(?<![\d.,])4,99/.test(s) && !/(?<![\d.,])5\.99/.test(s),
    f + ' : n’affiche plus l’ancien prix d’entrée (4,99 € / $5.99)');
}
const premiumModalSrc = read('src/PremiumModal.jsx');
check(premiumModalSrc.includes('"7,99 € · 7 jours"'), 'PremiumModal : le CTA trip7 EUR affiche 7,99 €');
check(premiumModalSrc.includes('"24,99 € une fois'), 'PremiumModal : le CTA saison EUR affiche 24,99 €');
check(!/"4,99 € · 7 jours"/.test(premiumModalSrc), 'PremiumModal : plus de CTA trip7 à 4,99 €');
check(!/19,99 € une fois/.test(premiumModalSrc), 'PremiumModal : plus de CTA saison à 19,99 €');

// ── 8. Le client envoie le montant affiché = montant débité ──────────────────
console.log('\n8. Contrat affichage/débit (client)');
const passOffer = read('src/PassOffer.jsx');
check(/passBaseCents/.test(passOffer) && /passEffectiveCents/.test(passOffer),
  'PassOffer résout le montant de BASE et le montant EFFECTIF');
check(/onBuy\(\{c:baseCents/.test(passOffer),
  'PassOffer envoie les centimes affichés au serveur (sinon 400 « Prix invalide »)');
check(!/cents: \{ eur: 1499, usd: 1199 \}/.test(passOffer),
  'PassOffer ne fige plus les prix en dur (source unique : pricing.js)');
check(!/passHasSurcharge/.test(passOffer), 'PassOffer n’affiche plus de bandeau « +15 % »');
check(!/\+15/.test(passOffer), 'PassOffer ne mentionne plus le « +15 % »');

const premiumModal = read('src/PremiumModal.jsx');
check(/resolvePass/.test(premiumModal), 'PremiumModal résout le pass demandé via pricing.js');
check(!/'saison'/.test(premiumModal), 'PremiumModal n’utilise jamais la clé serveur invalide « saison »');
check(!/_passTable\s*=\s*\{\s*p30:\s*\{\s*cents:\s*1499/.test(premiumModal),
  'PremiumModal ne fige plus les centimes en dur dans la présélection URL');
check(/passBaseCents\("season","eur"\)/.test(premiumModal), 'PremiumModal prend le prix saison dans pricing.js');
check(/passBaseCents\("trip7","usd"\)/.test(premiumModal), 'PremiumModal prend le prix trip7 USD dans pricing.js');
check(/passBaseCents\("trip7","eur"\)/.test(premiumModal), 'PremiumModal prend le prix trip7 EUR dans pricing.js');

const prod = read('src/Sargasses_PROD.jsx');
const eurTrip = /export const EUR_TRIP_CENTS=(\d+)/.exec(prod);
check(!!eurTrip && Number(eurTrip[1]) === clientPrices.trip7.eur,
  'Sargasses_PROD EUR_TRIP_CENTS = ' + clientPrices.trip7.eur + ' (identique au serveur)');
const priceTrip = /export const PRICE_TRIP=REGION_PAY\?\(REGION\.pricing\?\.tripPass\|\|"\$8\.99"\)/.test(prod);
check(priceTrip, 'PRICE_TRIP par défaut = $8.99 (identique à trip7 USD)');

// ── 9. Prix d'entrée par région (regions/*.json) ────────────────────────────
console.log('\n9. regions/*.json (prix d’entrée affichés)');
for (const f of fs.readdirSync(path.join(root, 'regions')).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(root, 'regions', f), 'utf8'));
  if (!r.pricing || !r.pricing.tripPass) continue;
  if (r.currency === 'USD') {
    check(r.pricing.tripPass === '$8.99', f + ' : tripPass USD = $8.99 (identique à trip7 USD)');
  } else {
    check(r.pricing.tripPass === '7,99 €', f + ' : tripPass EUR = 7,99 € (identique à trip7 EUR)');
  }
}

// ── 10. Mesure de l'écart affichage = débit ──────────────────────────────────
console.log('\n10. Mesure de l’écart affichage/débit');
check(/'amount'\s*=>\s*\['value'\s*=>\s*\$amount\['value'\]/.test(molliePhp),
  'mollie.php renvoie le montant facturé dans la réponse create_payment');
check(/sg_price_mismatch/.test(premiumModal),
  'PremiumModal compare le montant serveur au montant affiché (sg_price_mismatch)');
check(/"sg_price_mismatch"/.test(prod),
  'sg_price_mismatch est dans l’allowlist des événements de funnel (mesurable)');

// ── 11. Aucun abonnement B2C fantôme dans le modèle documenté ─────────────────
console.log('\n11. Modèle B2C = pass unique, pas d’abonnement');
const configExample = read('public/api/mollie-config.example.php');
check(!/'\s*p7'\s*=>/.test(configExample), 'le template de config ne documente plus le pass legacy « p7 »');
check(!/'\s*sos'\s*=>/.test(configExample), 'le template de config ne documente plus le pass « sos » (retrait 2026-11-09)');
check(/'season'\s*=>/.test(configExample), 'le template de config documente la clé serveur « season »');
check(configExample.includes("'cents' => 799"), 'le template de config documente trip7 = 799¢');
check(configExample.includes("'cents' => 2499"), 'le template de config documente season = 2499¢');
check(!/'monthly'\s*=>\s*\[\s*'amount'\s*=>\s*'4\.99'/.test(configExample),
  'le template de config ne documente plus l’abonnement B2C fantôme 4,99 €/mois');

console.log('\nPRICE_PARITY_TESTS', failures === 0 ? 'PASS' : 'FAIL');
process.exit(failures ? 1 : 0);

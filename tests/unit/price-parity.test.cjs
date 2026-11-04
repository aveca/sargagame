#!/usr/bin/env node
'use strict';

/**
 * price-parity.test.cjs — PARITÉ DES PRIX B2C (source unique = le serveur).
 *
 * Écarts constatés avant ce correctif (2026-11-04) :
 *   • /offres/ affichait 7,99 € (7 j) et 24,99 € (saison) alors que le serveur
 *     débite 4,99 € et 19,99 € → le CTA « Pass 7 jours » facturait en plus
 *     30 jours à 14,99 € (le paramètre ?pass= n'existait pas) ;
 *   • PassOffer affichait 11,99 $ alors que mollie.php débite 13,79 $ en
 *     juin→novembre (surcharge USD +15 %) ;
 *   • /premium/index.html annonçait « 4,99 €/mois » et débait 14,99 € ;
 *   • la CGV annonçait 7,99 € / 24,99 € / 19,99 $ (saison).
 *
 * Ce test verrouille la parité entre TOUTES les sources de prix :
 *   1. src/lib/pricing.js             (client, miroir du serveur)
 *   2. public/api/mollie.php          ($passPrices — SOURCE AUTORITATIVE)
 *   3. workers/sargagame/index.js     (PASS_PRICES / DAYS_TABLE — validation)
 *   4. scripts/lib/premium-page.cjs   (OFFERS / USD_OFFERS — page /premium/)
 *   5. public/api/create-checkout.php ($ALLOWED_CENTS — anti-tampering)
 *   6. regions/*.json                 (prix d'entrée affichés par région)
 * et vérifie que les surfaces PUBLIÉES affichent exactement ces montants,
 * avec le bon paramètre ?pass= (étape « durée » du tunnel).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const pricingSrc = read('src/lib/pricing.js');
const molliePhp = read('public/api/mollie.php');
const workerJs = read('workers/sargagame/index.js');
const checkoutPhp = read('public/api/create-checkout.php');
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
const clientHighMonths = (() => {
  const r = /USD_HIGH_SEASON_MONTHS\s*=\s*Object\.freeze\(\[([^\]]+)\]\)/.exec(pricingSrc);
  return r ? r[1].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)) : [];
})();
const clientHighRate = (() => {
  const r = /USD_HIGH_SEASON_RATE\s*=\s*([\d.]+)/.exec(pricingSrc);
  return r ? Number(r[1]) : null;
})();

console.log('1. src/lib/pricing.js');
check(Object.keys(clientPrices).length === 4, 'les 4 passes sont déclarés (p30, trip7, season, sos)');
check(clientHighRate === 0.15, 'la surcharge USD de haute saison est de +15 %');
check(JSON.stringify(clientHighMonths) === JSON.stringify([6, 7, 8, 9, 10, 11]), 'la fenêtre USD est juin → novembre');

// ── 2. public/api/mollie.php (source autoritative) ────────────────────────────
const serverPrices = {};
const serverRe = /'(p30|trip7|season|sos)'\s*=>\s*\['EUR'\s*=>\s*([\d.]+),\s*'USD'\s*=>\s*([\d.]+|null)\]/g;
while ((m = serverRe.exec(molliePhp))) {
  serverPrices[m[1]] = { eur: Math.round(Number(m[2]) * 100), usd: m[3] === 'null' ? null : Math.round(Number(m[3]) * 100) };
}
const bandRe = /\$amountVal\s*>\s*([\d.]+)\s*&&\s*\$amountVal\s*<\s*([\d.]+)/.exec(molliePhp);
const usdBand = bandRe ? { min: Number(bandRe[1]), max: Number(bandRe[2]) } : null;

console.log('\n2. public/api/mollie.php ($passPrices — autoritaire)');
check(Object.keys(serverPrices).length === 4, 'les 4 passes sont définis côté serveur');
check(/\$month\s*>=\s*6\s*&&\s*\$month\s*<=\s*11/.test(molliePhp), 'la fenêtre serveur est juin → novembre');
check(/1\.15/.test(molliePhp), 'le serveur applique la surcharge ×1,15');
check(/\$pass\s*!==\s*'trip7'/.test(molliePhp), 'le serveur exclut trip7 de la surcharge');
check(!!usdBand, 'le serveur expose une bande de plausibilité pour les prix USD variables');

// ── 3. workers/sargagame/index.js ───────────────────────────────────────────
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
}
check(JSON.stringify(workerDays) === JSON.stringify({ p30: 30, trip7: 7, season: 210, sos: 1 }),
  'DAYS_TABLE worker = p30/trip7/season/sos avec les bonnes durées');
check(!('p7' in workerDays) && !('saison' in workerDays), 'aucune clé legacy « p7 » / « saison » dans le worker');

// ── 4. Parité client ↔ serveur ↔ worker ──────────────────────────────────────
// Cas particulier USD : mollie.php laisse le montant USD « variable par région »
// pour trip7/season (bande de plausibilité). trip7 a un prix RÉGIONAL défini
// ($5.99 dans regions/*.json, allowlist Stripe USD = [599]) → le client doit
// l'utiliser. season/sos n'ont AUCUN prix défini en USD → non commercialisés
// en USD → le client ne doit JAMAIS les afficher (resolvePass retombe sur p30).
const usdVariableSold = { trip7: 599 };

console.log('\n4. Parité client / serveur / worker');
for (const pass of Object.keys(serverPrices)) {
  const c = clientPrices[pass] || {};
  check(c.eur === serverPrices[pass].eur, 'pricing.js ' + pass + '.eur = ' + serverPrices[pass].eur + '¢');
  if (serverPrices[pass].usd !== null) {
    check(c.usd === serverPrices[pass].usd, 'pricing.js ' + pass + '.usd = ' + serverPrices[pass].usd + '¢');
  } else if (usdVariableSold[pass] != null) {
    check(c.usd === usdVariableSold[pass], 'pricing.js ' + pass + '.usd = ' + usdVariableSold[pass] + '¢ (prix régional défini)');
    check(!!usdBand && usdVariableSold[pass] / 100 > usdBand.min && usdVariableSold[pass] / 100 < usdBand.max,
      'le prix USD ' + pass + ' reste dans la bande de plausibilité du serveur');
  } else {
    check(c.usd === null, 'pricing.js ' + pass + '.usd = null (aucun prix USD défini → non commercialisé en USD)');
  }
  check(clientDays[pass] === workerDays[pass], 'pricing.js ' + pass + '.days = ' + workerDays[pass] + ' j');
}
check(clientPrices.p30.eur === 1499, 'Pass 30 jours EUR = 14,99 €');
check(clientPrices.trip7.eur === 499, 'Pass 7 jours EUR = 4,99 €');
check(clientPrices.season.eur === 1999, 'Pass Saison EUR = 19,99 €');
check(clientPrices.p30.usd === 1199, 'Pass 30 jours USD base = 11,99 $');
check(clientPrices.trip7.usd === 599, 'Pass 7 jours USD = 5,99 $');
check(clientPrices.season.usd === null, 'Pass Saison non commercialisé en USD');

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
check(premiumLib.USD_OFFERS.length === 2, 'la page /premium/ n’offre que les passes vendus en USD');
check(premiumLib.effectiveCents({ pass: 'p30', cents: 1199, cur: 'USD' }, new Date(2026, 10, 4)) === 1379,
  'surcharge USD effective p30 en novembre = 1379¢ (13,79 $)');
check(premiumLib.effectiveCents({ pass: 'p30', cents: 1199, cur: 'USD' }, new Date(2026, 0, 4)) === 1199,
  'hors haute saison, p30 USD reste à 1199¢ (11,99 $)');
check(premiumLib.effectiveCents({ pass: 'trip7', cents: 599, cur: 'USD' }, new Date(2026, 10, 4)) === 599,
  'trip7 USD n’est jamais surchargé');

// ── 6. public/api/create-checkout.php (allowlist anti-tampering) ──────────────
console.log('\n6. public/api/create-checkout.php ($ALLOWED_CENTS)');
const allowRe = /\$ALLOWED_CENTS\s*=\s*\$isUsd\s*\?\s*\[([\d,\s]+)\]\s*:\s*\[([\d,\s]+)\]/;
const allowM = allowRe.exec(checkoutPhp);
check(!!allowM, 'la ligne $ALLOWED_CENTS est retrouvée');
if (allowM) {
  const usd = allowM[1].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  const eur = allowM[2].split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n));
  // Invariant critique : aucun prix VIVANT ne doit être rejeté par l'allowlist.
  check(eur.includes(clientPrices.p30.eur), 'EUR allowlist contient p30 (1499)');
  check(eur.includes(clientPrices.trip7.eur), 'EUR allowlist contient trip7 (499)');
  check(eur.includes(clientPrices.season.eur), 'EUR allowlist contient season (1999)');
  check(usd.includes(clientPrices.trip7.usd), 'USD allowlist contient trip7 (599)');
  // Résiduel documenté : montants legacy acceptés par l'endpoint Stripe (QA,
  // atteint seulement via ?pay=stripe). Aucun prix affiché ne correspond.
  const liveEur = [clientPrices.trip7.eur, clientPrices.p30.eur, clientPrices.season.eur];
  const legacyEur = eur.filter((c) => liveEur.indexOf(c) === -1).sort((a, b) => a - b);
  check(JSON.stringify(legacyEur) === JSON.stringify([799, 999, 2499]),
    'les montants legacy de l’allowlist Stripe EUR sont exactement [799, 999, 2499] (résiduel documenté)');
  const reportPath = path.join(root, 'reports', 'sargagame', 'REVENUE-STATE-2026-11-04.md');
  const reportExists = fs.existsSync(reportPath);
  check(reportExists, 'le rapport de vérité revenue existe (reports/sargagame/REVENUE-STATE-2026-11-04.md)');
  if (reportExists) {
    const report = fs.readFileSync(reportPath, 'utf8');
    check(/799/.test(report) && /2499/.test(report),
      'le rapport documente le résiduel 799 / 2499 (allowlist Stripe legacy)');
  }
}

// ── 7. Surfaces publiées : prix affichés = prix débités ───────────────────────
console.log('\n7. Surfaces publiées (affichage = débit)');
const offres = read('public/offres/index.html');
check(offres.includes('14,99 €'), '/offres/ affiche 14,99 € (Pass 30 jours)');
check(offres.includes('4,99 €'), '/offres/ affiche 4,99 € (Pass 7 jours)');
check(offres.includes('19,99 €'), '/offres/ affiche 19,99 € (Pass Saison)');
check(!offres.includes('24,99'), '/offres/ n’affiche plus 24,99 € (prix saison legacy)');
check(!offres.includes('7,99'), '/offres/ n’affiche plus 7,99 € (prix 7 j legacy)');
check(/pass=p30/.test(offres), '/offres/ : le CTA 30 jours porte ?pass=p30');
check(/pass=trip7/.test(offres), '/offres/ : le CTA 7 jours porte ?pass=trip7');
check(/pass=season/.test(offres), '/offres/ : le CTA saison porte ?pass=season (et NON ?pass=saison)');
check(!/pass=saison/.test(offres), '/offres/ : aucune clé serveur invalide « saison »');

const cgv = read('public/cgv.html');
check(cgv.includes('4,99 \u20ac (zone EUR)'), 'CGV : Pass 7 jours = 4,99 € (zone EUR)');
check(cgv.includes('14,99 \u20ac (zone EUR)'), 'CGV : Pass 30 jours = 14,99 € (zone EUR)');
check(cgv.includes('19,99 \u20ac (zone EUR)'), 'CGV : Pass Saison = 19,99 € (zone EUR)');
check(cgv.includes('+15 %'), 'CGV : la surcharge USD de haute saison est mentionnée');
check(!cgv.includes('24,99'), 'CGV : plus de 24,99 € (prix saison legacy)');
check(!/Pass 7 jours<\/strong> \u2014 7,99/.test(cgv), 'CGV : plus de 7,99 € (prix 7 j legacy)');

const premiumPage = read('public/premium/index.html');
check(!/\/mois/.test(premiumPage), '/premium/ n’annonce plus aucun abonnement « /mois »');
check(!/S\u2019abonner|S'abonner/.test(premiumPage), '/premium/ : plus de bouton « S’abonner »');
check(premiumPage.includes('"cents":499') && premiumPage.includes('"cents":1499') &&
  premiumPage.includes('"cents":1999') && premiumPage.includes('"cents":100'),
  '/premium/ : le catalogue embarqué contient les 4 passes EUR aux bons centimes');
check(premiumPage.includes('"cents":599') && premiumPage.includes('"cents":1199'),
  '/premium/ : le catalogue embarqué contient les 2 passes USD aux bons centimes');
check(!premiumPage.includes('"cents":799'), '/premium/ : plus de pass legacy à 799¢');

// Surfaces éditoriales : prix d'entrée = plus bas prix réellement débité (4,99 €).
const entrySurfaces = [
  'public/a-propos/index.html',
  'public/about/index.html',
  'public/veilleur/index.html',
  'src/HomeAZ.jsx',
  'src/HomeJuicy.jsx',
  'src/VerticalesMap.jsx',
  'src/PremiumModal.jsx',
];
for (const f of entrySurfaces) {
  const s = read(f);
  check(!/d\u00e8s 7,99|d\u00e8s \u20ac7\.99|from \u20ac7\.99/.test(s), f + ' : plus de prix d’entrée 7,99 €');
}

// ── 8. Le client envoie la BASE, le serveur applique la surcharge ────────────
console.log('\n8. Contrat base/effectif (client)');
const passOffer = read('src/PassOffer.jsx');
check(/passBaseCents/.test(passOffer) && /passEffectiveCents/.test(passOffer),
  'PassOffer distingue le montant de BASE (envoyé) du montant EFFECTIF (affiché)');
check(/onBuy\(\{c:baseCents/.test(passOffer),
  'PassOffer envoie les centimes de BASE au serveur (sinon 400 « Prix invalide »)');
check(!/cents:\s*\{ eur: 1499, usd: 1199 \}/.test(passOffer),
  'PassOffer ne fige plus les prix en dur (source unique : pricing.js)');

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
  'Sargasses_PROD EUR_TRIP_CENTS = 499 (identique au serveur)');
const priceTrip = /export const PRICE_TRIP=REGION_PAY\?\(REGION\.pricing\?\.tripPass\|\|"\$5\.99"\)/.test(prod);
check(priceTrip, 'PRICE_TRIP par défaut = $5.99 (identique à trip7 USD)');

// ── 9. Prix d'entrée par région (regions/*.json) ────────────────────────────
console.log('\n9. regions/*.json (prix d’entrée affichés)');
for (const f of fs.readdirSync(path.join(root, 'regions')).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(root, 'regions', f), 'utf8'));
  if (!r.pricing || !r.pricing.tripPass) continue;
  if (r.currency === 'USD') {
    check(r.pricing.tripPass === '$5.99', f + ' : tripPass USD = $5.99 (identique à trip7 USD)');
  } else {
    check(r.pricing.tripPass === '4,99 €', f + ' : tripPass EUR = 4,99 € (identique à trip7 EUR)');
  }
}

// ── 10. Mesure de l'écart affichage = débit ──────────────────────────────────
console.log('\n10. Mesure de l’écart affichage/débit');
check(/'amount'\s*=>\s*\['value'\s*=>\s*\$amount\['value'\]/.test(molliePhp),
  'mollie.php renvoie le montant EFFECTIF dans la réponse create_payment');
check(/sg_price_mismatch/.test(premiumModal),
  'PremiumModal compare le montant serveur au montant affiché (sg_price_mismatch)');
check(/"sg_price_mismatch"/.test(prod),
  'sg_price_mismatch est dans l’allowlist des événements de funnel (mesurable)');

// ── 11. Aucun abonnement B2C fantôme dans le modèle documenté ─────────────────
console.log('\n11. Modèle B2C = pass unique, pas d’abonnement');
const configExample = read('public/api/mollie-config.example.php');
check(!/'\s*p7'\s*=>/.test(configExample), 'le template de config ne documente plus le pass legacy « p7 »');
check(/'season'\s*=>/.test(configExample), 'le template de config documente la clé serveur « season »');
check(!/'monthly'\s*=>\s*\[\s*'amount'\s*=>\s*'4\.99'/.test(configExample),
  'le template de config ne documente plus l’abonnement B2C fantôme 4,99 €/mois');

console.log('\nPRICE_PARITY_TESTS', failures === 0 ? 'PASS' : 'FAIL');
process.exit(failures ? 1 : 0);

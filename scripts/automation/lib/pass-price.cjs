'use strict'

/**
 * pass-price.cjs — le prix de vente RÉEL du pass, pour les emails de relance.
 *
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------
 * Quatre scripts de relance panier (`cart-recovery-j1/j3/j5/unified`) et leurs
 * templates annonçaient « 12,99 € / 9,99 $ » et une remise « −2 € » (lien
 * `?promo=sejour_promo_eur`) qui n'existent nulle part : la grille réellement
 * facturée est 14,99 € / 16,99 $ depuis le 2026-11-09 (offre validée), et
 * AUCUN handler ne lit `?promo=` dans src/, workers/ ou public/api/.
 * Un email qui promet un prix qu'aucun serveur ne facture est une facture
 * raturée à l'avance : le client paie 14,99 € en croyant 12,99 €.
 *
 * SOURCE DE VÉRITÉ (aucun prix inventé ici)
 * -----------------------------------------
 * `scripts/lib/premium-page.cjs` (OFFERS / USD_OFFERS) est la source n°6 de
 * `tests/unit/price-parity.test.cjs`, qui la verrouille contre :
 *   • src/lib/pricing.js                    (client, miroir du serveur)
 *   • public/api/mollie.php                 (création — $passPrices)
 *   • workers/sg-payments/index.js          (serveur de paiement EN PRODUCTION)
 *   • public/api/create-checkout.php        (anti-tampering)
 *   • workers/sargagame/index.js            (livraison des grants)
 * Lire un prix ICI sans y toucher = lire le prix que le client paiera.
 * Si la grille change un jour, price-parity échoue d'abord, et ces emails
 * suivent automatiquement — c'est exactement le contrat cherché.
 *
 * DEVISE PAR RÉGION (miroir de regions/*.json)
 * --------------------------------------------
 * EUR : mq, gp. USD : florida, puntacana, rivieramaya, tulum, barbados.
 * Région inconnue → EUR (défaut historique du site, martinique).
 *
 * DESTINATION DES CTA
 * -------------------
 * `/?paywall=1&pass=p30` est le deep-link vivant de l'application
 * (`src/Sargasses_PROD.jsx`) et celui qu'utilise déjà le workflow vivant
 * `sales-lifecycle-emails.yml` → `recover-abandoned-cart.cjs`. Les anciens
 * liens (`/checkout?promo=…` et `payment-links.mollie.com/payment/your-sejour-…`)
 * ne répondent pas : aucune route `/checkout`, et placeholder jamais remplacé.
 */

const { OFFERS, USD_OFFERS } = require('../../lib/premium-page.cjs')

const EUR_P30 = OFFERS.find((o) => o.pass === 'p30')
const USD_P30 = USD_OFFERS.find((o) => o.pass === 'p30')

if (!EUR_P30 || !USD_P30) {
  throw new Error('pass-price.cjs : p30 absent de OFFERS/USD_OFFERS (premium-page.cjs a bougé)')
}

// Régions facturées en USD (miroir regions/*.json currency === "USD").
const USD_REGIONS = new Set([
  'us', 'usa', 'fl', 'florida', 'miami',
  'pc', 'puntacana',
  'rm', 'rivieramaya', 'riviera', 'cancun',
  'tulum', 'barbados',
])

// Domaine par région (miroir regions/*.json domain).
const DOMAINS = {
  mq: 'sargasses-martinique.com',
  gp: 'sargasses-guadeloupe.com',
  fl: 'sargassummiami.com',
  florida: 'sargassummiami.com',
  pc: 'sargassumpuntacana.com',
  puntacana: 'sargassumpuntacana.com',
  rm: 'sargassumcancun.com',
  rivieramaya: 'sargassumcancun.com',
  tulum: 'sargazotulum.com',
  barbados: 'sargassumbarbados.com',
}

function isUsdRegion(region) {
  return USD_REGIONS.has(String(region || '').trim().toLowerCase())
}

/**
 * Prix de vente du pass 30 jours POUR CETTE RÉGION, tel que facturé.
 * @returns {{pass:string, days:number, cents:number, currency:string, price:string, usd:boolean}}
 *   price = libellé prêt à afficher ("14,99 €" / "$16.99"), cents = montant
 *   réellement débité. Les deux viennent de la même ligne de la grille.
 */
function passPrice(region) {
  const o = isUsdRegion(region) ? USD_P30 : EUR_P30
  return {
    pass: o.pass,
    days: o.days,
    cents: o.cents,
    currency: o.cur,
    price: o.price,
    usd: o.cur === 'USD',
  }
}

/** Domaine de la région (défaut : martinique). */
function regionDomain(region) {
  const key = String(region || '').trim().toLowerCase()
  return DOMAINS[key] || 'sargasses-martinique.com'
}

/**
 * Deep-link de reprise de paiement. `pass=p30` SELON la région (une région
 * USD ne doit pas atterrir sur la grille EUR).
 */
function paywallUrl(region, utmCampaign) {
  const q = new URLSearchParams({
    paywall: '1',
    pass: 'p30',
    utm_source: 'email',
    utm_medium: 'cart_recovery',
    utm_campaign: String(utmCampaign || 'recovery'),
  })
  return `https://${regionDomain(region)}/?${q.toString()}`
}

module.exports = {
  passPrice,
  regionDomain,
  paywallUrl,
  EUR_P30,
  USD_P30,
}
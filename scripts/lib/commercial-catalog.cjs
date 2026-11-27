'use strict'

/**
 * Grille commerciale affichée (miroir des montants déjà encaissables).
 * Aucun prix n'est inventé ici : B2C = PASS_PRICES, Pro = B2B_PLANS.
 * L'annuel n'est PAS « 2 mois offerts » : 79×10 = 790 € et 89×10 = 890 $,
 * or les montants réellement catalogués sont 690 € et 790 $. On les énonce
 * tels quels, sans rabais imaginaire.
 * Le palier « Territoire / Coastline » (199 € / 219 $) n'existe dans aucun
 * catalogue de paiement : il n'est pas affiché.
 */
const B2C = Object.freeze({
  eur: Object.freeze([
    Object.freeze({ pass: 'trip7', days: 7, price: '7,99 €' }),
    Object.freeze({ pass: 'p30', days: 30, price: '14,99 €' }),
    Object.freeze({ pass: 'season', days: 210, price: '24,99 €' }),
  ]),
  usd: Object.freeze([
    Object.freeze({ pass: 'trip7', days: 7, price: '$8.99' }),
    Object.freeze({ pass: 'p30', days: 30, price: '$16.99' }),
    Object.freeze({ pass: 'season', days: 210, price: '$27.99' }),
  ]),
})

const PRO = Object.freeze({
  eur: Object.freeze({ month: '79 €', year: '690 €', monthAmount: 79, yearAmount: 690, currency: 'EUR' }),
  usd: Object.freeze({ month: '$89', year: '$790', monthAmount: 89, yearAmount: 790, currency: 'USD' }),
})

/** Langue de la page d'offres : consigne propriétaire, pas le primaryLang brut. */
function offerLang(region) {
  const id = region && region.id
  if (id === 'florida') return 'en'
  if (id === 'puntacana' || id === 'rivieramaya' || id === 'tulum') return 'es'
  return 'fr'
}

function currencyOf(region) {
  return region && region.currency === 'USD' ? 'usd' : 'eur'
}

module.exports = { B2C, PRO, offerLang, currencyOf }

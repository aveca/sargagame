// src/lib/pricing.js — SOURCE DE VÉRITÉ CLIENT des prix B2C (passes).
//
// MIROIR EXACT du serveur — aucune valeur n'est inventée ici :
//   • public/api/mollie.php          → $passPrices (EUR/USD)
//   • public/api/mollie-lib.php      → mol_pass_prices() (grille de livraison)
//   • public/api/create-checkout.php → $ALLOWED_CENTS (anti-tampering)
//   • workers/sargagame/index.js     → PASS_PRICES / FULFILL_PRICES / DAYS_TABLE
//   • workers/sg-payments/index.js   → PASS_PRICES (serveur de paiement Mollie)
//   • scripts/lib/premium-page.cjs   → OFFERS / USD_OFFERS (page /premium/)
// La parité des sources est verrouillée par tests/unit/price-parity.test.cjs.
//
// ── OFFRE B2C VALIDÉE (2026-11-09) ───────────────────────────────────────────
//   trip7  → 7,99 €   / $8.99   (7 jours)
//   p30   → 14,99 €  / $16.99  (30 jours — produit mis en avant)
//   season→ 24,99 €  / $27.99  (210 jours)
// Ces montants sont ceux du worker de paiement EN PRODUCTION (sg-payments,
// version live) : le serveur et le client ne peuvent pas diverger.
//
// ⚠️ 2026-11-09 — PLUS DE SURCHARGE USD DE HAUTE SAISON.
// La surcharge « +15 % de juin à novembre » a été SUPPRIMÉE côté serveur
// (le worker live facture le montant affiché, point final). Si le client
// appliquait encore +15 % à l'affichage, il afficherait 16,99 $ alors que le
// serveur facture 16,99 $… mais 19,54 $ pour un ancien build : le montant
// affiché DOIT être exactement celui débité. Donc : base = montant facturé.
//
// Offre B2C : AUCUN abonnement. Un pass = une durée fixe = un paiement unique.

/**
 * Clés de pass acceptées par le serveur (mollie.php $passPrices).
 *
 * ⚠️ 2026-11-09 — Le pass « SOS » (1 €, rapport 24 h) a été RETIRÉ du parcours
 * client : plus aucune création de paiement `sos` n'est acceptée (serveur
 * fail-closed) et plus aucun CTA/deep-link ne l'expose. La LIVRAISON des
 * paiements `sos` DÉJÀ encaissés reste possible côté backfill contrôlé.
 */
export const PASS_KEYS = Object.freeze(["p30", "trip7", "season"])

/** Durée d'accès en jours (workers/sargagame DAYS_TABLE + premium-page OFFERS). */
export const PASS_DAYS = Object.freeze({ p30: 30, trip7: 7, season: 210 })

/**
 * Montants de BASE en centimes, par devise.
 *   eur → public/api/mollie.php $passPrices (valeurs exactes).
 *   usd → idem (workers/sg-payments PASS_PRICES, version live).
 * Source : offre validée 2026-11-09 = trip7 7,99 €/$8.99 · p30 14,99 €/$16.99
 * · season 24,99 €/$27.99. Aucun montant n'est null : les 3 passes sont
 * vendus dans les deux devises.
 */
export const PASS_BASE_CENTS = Object.freeze({
  p30: Object.freeze({ eur: 1499, usd: 1699 }),
  trip7: Object.freeze({ eur: 799, usd: 899 }),
  season: Object.freeze({ eur: 2499, usd: 2799 }),
})

/**
 * Montant EFFECTIF débité (centimes).
 *
 * ⚠️ 2026-11-09 — la surcharge USD de haute saison (+15 %) n'existe PLUS :
 * le serveur live facture exactement le montant affiché. La fonction est
 * conservée (signature stable, appelée par PassOffer.jsx) mais elle renvoie
 * désormais le montant de BASE — c'est-à-dire le montant débité.
 */
export function passEffectiveCents(pass, currency, _date) {
  return passBaseCents(pass, currency, _date)
}

/** Libellés de durée (par pass et par langue). */
export const PASS_COPY = Object.freeze({
  p30: {
    fr: { title: "Pass 30 jours", sub: "Toutes les plages · Prévision 7 j", days: "30 jours" },
    en: { title: "30-day pass", sub: "All beaches · 7-day forecast", days: "30 days" },
    es: { title: "Pase 30 días", sub: "Todas las playas · Pronóstico 7 d", days: "30 días" },
  },
  trip7: {
    fr: { title: "Pass 7 jours", sub: "Une escapade · Toutes les plages", days: "7 jours" },
    en: { title: "7-day pass", sub: "A quick escape · All beaches", days: "7 days" },
    es: { title: "Pase 7 días", sub: "Una escapada · Todas las playas", days: "7 días" },
  },
  season: {
    fr: { title: "Pass Saison", sub: "Toute la saison · Toutes les plages", days: "210 jours" },
    en: { title: "Season pass", sub: "All season · All beaches", days: "210 days" },
    es: { title: "Pase Temporada", sub: "Toda la temporada · Todas las playas", days: "210 días" },
  },
})

/** Normalise une devise ('EUR' | 'usd' | ...) en 'eur' | 'usd'. */
export function normalizeCurrency(currency) {
  return String(currency || "eur").toLowerCase() === "usd" ? "usd" : "eur"
}

/** Montant de BASE à ENVOYER au serveur (centimes). null = pass non vendu ici. */
export function passBaseCents(pass, currency, _date) {
  const row = PASS_BASE_CENTS[pass]
  if (!row) return null
  const v = row[normalizeCurrency(currency)]
  return typeof v === "number" ? v : null
}

/** Formatage localisé d'un montant en centimes (FR : 14,99 € / EN : €14.99 / USD : $16.99). */
export function formatCents(cents, currency, lang) {
  if (cents == null) return ""
  const cur = normalizeCurrency(currency)
  const value = cents / 100
  if (cur === "usd") return "$" + value.toFixed(2)
  if (lang === "en") return "€" + value.toFixed(2)
  return value.toFixed(2).replace(".", ",") + " €"
}

/**
 * Pass à proposer pour un couple (pass demandé, devise) :
 * retombe sur p30 (offre principale) si le pass demandé n'est pas vendu
 * dans cette devise — on n'affiche JAMAIS un prix non débitable.
 */
export function resolvePass(pass, currency) {
  const key = PASS_KEYS.indexOf(pass) !== -1 ? pass : "p30"
  return passBaseCents(key, currency) == null ? "p30" : key
}

/** Libellé (titre / sous-titre / durée) d'un pass pour une langue. */
export function passCopy(pass, lang) {
  const row = PASS_COPY[pass] || PASS_COPY.p30
  return row[lang] || row.fr
}

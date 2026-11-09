// src/lib/pricing.js — SOURCE DE VÉRITÉ CLIENT des prix B2C (passes).
//
// MIROIR EXACT du serveur — aucune valeur n'est inventée ici :
//   • public/api/mollie.php          → $passPrices (EUR/USD) + surcharge USD +15 %
//   • public/api/create-checkout.php → $ALLOWED_CENTS (anti-tampering)
//   • workers/sargagame/index.js     → PASS_PRICES / DAYS_TABLE
//   • scripts/lib/premium-page.cjs   → OFFERS (page /premium/)
// La parité des 4 sources est verrouillée par tests/unit/price-parity.test.cjs.
//
// ── RÈGLE DE FONDERIE (importante) ───────────────────────────────────────────
// Le serveur VALIDE le montant de BASE puis APPLIQUE la surcharge USD de haute
// saison (+15 %, juin→novembre, sauf trip7) :
//     $priceValid = abs($amountVal - $expected) < 0.02   // sur la BASE
//     $amount['value'] = round($amount['value'] * 1.15, 2) // ensuite
// Donc le client doit ENVOYER les centimes de BASE, et AFFICHER le montant
// EFFECTIF (base +15 %). Confondre les deux = afficher 11,99 $ et encaisser
// 13,79 $ (divergence constatée avant ce correctif).
//
// Offre B2C : AUCUN abonnement. Un pass = une durée fixe = un paiement unique.

/**
 * Clés de pass acceptées par le serveur (mollie.php $passPrices).
 *
 * ⚠️ 2026-11-09 — Le pass « SOS » (1 €, rapport 24 h) a été RETIRÉ du parcours
 * client : plus aucune création de paiement `sos` n'est acceptée (serveur
 * fail-closed) et plus aucun CTA/deep-link ne l'expose. La LIVRAISON des
 * paiements `sos` DÉJÀ encaissés reste possible côté backfill contrôlé
 * (scripts/automation/backfill-mollie-grants.cjs) : encaisser sans livrer
 * serait un trou de confiance.
 */
export const PASS_KEYS = Object.freeze(["p30", "trip7", "season"])

/** Durée d'accès en jours (workers/sargagame DAYS_TABLE + premium-page OFFERS). */
export const PASS_DAYS = Object.freeze({ p30: 30, trip7: 7, season: 210 })

/**
 * Montants de BASE en centimes, par devise.
 *   eur → public/api/mollie.php $passPrices (valeurs exactes).
 *   usd → p30 = 11.99 (mollie.php) ; trip7 = 5.99 (allowlist create-checkout.php
 *         $ALLOWED_CENTS USD = [599]) ; season = null = NON VENDU en USD
 *         (aucun montant serveur déterministe → pas d'offre affichable).
 */
export const PASS_BASE_CENTS = Object.freeze({
  p30: Object.freeze({ eur: 1499, usd: 1199 }),
  trip7: Object.freeze({ eur: 499, usd: 599 }),
  season: Object.freeze({ eur: 1999, usd: null }),
})

/** Surcharge USD « haute saison » : juin → novembre, SAUF trip7 (cf. mollie.php). */
export const USD_HIGH_SEASON_MONTHS = Object.freeze([6, 7, 8, 9, 10, 11])
export const USD_HIGH_SEASON_RATE = 0.15

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

/** Vrai si la date tombe dans la fenêtre de surcharge USD (juin → novembre). */
export function isUsdHighSeason(date) {
  const d = date || new Date()
  const m = typeof d.getMonth === "function" ? d.getMonth() + 1 : Number(d)
  return USD_HIGH_SEASON_MONTHS.indexOf(m) !== -1
}

/** Montant de BASE à ENVOYER au serveur (centimes). null = pass non vendu ici. */
export function passBaseCents(pass, currency, _date) {
  const row = PASS_BASE_CENTS[pass]
  if (!row) return null
  const v = row[normalizeCurrency(currency)]
  return typeof v === "number" ? v : null
}

/** Vrai si ce pass/devise subit la surcharge USD de haute saison. */
export function passHasSurcharge(pass, currency, date) {
  if (normalizeCurrency(currency) !== "usd") return false
  if (pass === "trip7") return false // exclu par mollie.php
  return isUsdHighSeason(date)
}

/**
 * Montant EFFECTIF débité (centimes) = base + surcharge USD.
 * C'est CE montant qui doit être affiché à l'utilisateur.
 */
export function passEffectiveCents(pass, currency, date) {
  const base = passBaseCents(pass, currency, date)
  if (base == null) return null
  if (!passHasSurcharge(pass, currency, date)) return base
  return Math.round(base * (1 + USD_HIGH_SEASON_RATE))
}

/** Formatage localisé d'un montant en centimes (FR : 14,99 € / EN : €14.99 / USD : $13.79). */
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

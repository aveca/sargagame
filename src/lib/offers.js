/**
 * offers.js — CATALOGUE CANONIQUE DES OFFRES B2C (B2C Offer Architecture Lab).
 *
 * Rôle : source unique CÔTÉ AFFICHAGE/ÉLIGIBILITÉ des offres B2C.
 * Ne débite RIEN. Les montants réellement débités vivent EXCLUSIVEMENT dans
 * `public/api/mollie.php` ($passPrices + mol_b2b_plans) — voir
 * `.ai/plans/B2C-OFFER-ARCHITECTURE.md` §1.
 *
 * Règles :
 * - Toute offre `status:"live"` DOIT exister dans l'allowlist serveur avec le
 *   MÊME montant de base (test : tests/unit/offers-contract.test.cjs).
 * - Toute offre `status:"planned"` n'est NI servie NI chargeable (spec pure).
 * - Clés canoniques en anglais (`season`, jamais `saison`) — le serveur rejette
 *   les clés inconnues (`Prix invalide`).
 * - Kill-switch : `?offerlab=0` désactive toute exposition d'offre lab.
 *
 * Pur module (zéro import produit — testable, réutilisable B2C/B2B).
 */

import { PASS_CENTS } from "./pass-price.js"

// Montants de base MIRROR du serveur (public/api/mollie.php $passPrices).
// Toute divergence = bug (le contrat test échoue).
const SERVER_MIRROR = {
  p30: { EUR: 14.99, USD: 11.99 },
  trip7: { EUR: 4.99, USD: null }, // USD variable → plausibilité serveur
  season: { EUR: 19.99, USD: null }, // USD variable → plausibilité serveur
}

export const OFFER_STATUS = { LIVE: "live", PLANNED: "planned" }

export const OFFERS = {
  free: {
    key: "free",
    kind: "free",
    billing: "none",
    status: OFFER_STATUS.LIVE,
    price: { EUR: 0, USD: 0 },
    days: null,
    entitlement: "free",
    features: ["map", "today", "photo", "beach_object", "forecast_preview", "coastal_lab", "seo_pages", "reliability_proof"],
    funnelMoment: "discover",
  },
  trip7: {
    key: "trip7",
    kind: "one-time",
    billing: "one-time",
    status: OFFER_STATUS.LIVE, // chargeable serveur, PAS encore servi par le front (seul p30 l'est)
    price: { EUR: 4.99, USD: null },
    days: 7,
    entitlement: "pass",
    features: ["forecast_full", "alternatives_full", "trip_planner", "confidence"],
    funnelMoment: "decide",
  },
  p30: {
    key: "p30",
    kind: "one-time",
    billing: "one-time",
    status: OFFER_STATUS.LIVE, // seul produit servi aujourd'hui (PassOffer.jsx)
    price: { EUR: PASS_CENTS.eur / 100, USD: PASS_CENTS.usd / 100 },
    days: 30,
    entitlement: "pass",
    features: ["forecast_full", "alternatives_full", "trip_planner", "confidence"],
    funnelMoment: "decide",
  },
  season: {
    key: "season",
    kind: "one-time",
    billing: "one-time",
    status: OFFER_STATUS.LIVE, // chargeable serveur (210j), PAS encore servi par le front
    price: { EUR: 19.99, USD: null },
    days: 210,
    entitlement: "pass",
    features: ["forecast_full", "alternatives_full", "trip_planner", "confidence"],
    funnelMoment: "decide",
  },
  watch_monthly: {
    key: "watch_monthly",
    kind: "recurring",
    billing: "monthly",
    status: OFFER_STATUS.PLANNED, // BLOQUÉ : pas d'infra B2C recurring (§7 rapport)
    price: { EUR: null, USD: null }, // hypothèse de test uniquement, JAMAIS débitée
    days: 30,
    entitlement: "b2c_watch",
    features: ["favorites", "watch", "alerts", "forecast_full", "alternatives_full", "trip_planner", "history"],
    funnelMoment: "monitor",
  },
  watch_annual: {
    key: "watch_annual",
    kind: "recurring",
    billing: "annual",
    status: OFFER_STATUS.PLANNED, // BLOQUÉ : idem
    price: { EUR: null, USD: null },
    days: 365,
    entitlement: "b2c_watch",
    features: ["favorites", "watch", "alerts", "forecast_full", "alternatives_full", "trip_planner", "history"],
    funnelMoment: "monitor",
  },
  mon_stay: {
    key: "mon_stay",
    kind: "one-time",
    billing: "one-time",
    status: OFFER_STATUS.PLANNED, // BLOQUÉ : pas de clé allowlist serveur
    price: { EUR: null, USD: null },
    days: null, // accès au rapport, pas au produit
    entitlement: "report",
    features: ["stay_synthesis"],
    funnelMoment: "personalize",
  },
}

export function getOffer(key) {
  return OFFERS[key] || null
}

export function liveOffers() {
  return Object.values(OFFERS).filter((o) => o.status === OFFER_STATUS.LIVE)
}

export function plannedOffers() {
  return Object.values(OFFERS).filter((o) => o.status === OFFER_STATUS.PLANNED)
}

// Une offre planned ne doit JAMAIS atteindre le checkout.
export function isChargeable(key) {
  const o = getOffer(key)
  return !!o && o.status === OFFER_STATUS.LIVE && o.kind !== "free"
}

// Kill-switch lab : ?offerlab=0 → le lab n'expose rien.
export function offerLabOff(search) {
  try {
    const q = typeof search === "string" ? search : (typeof window !== "undefined" ? window.location.search : "")
    return /[?&]offerlab=0(?:&|$)/.test(q)
  } catch (_) {
    return false
  }
}

// Miroir serveur exposé pour les tests (pas pour l'UI).
export function serverMirror() {
  return SERVER_MIRROR
}

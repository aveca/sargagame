'use strict';
/**
 * Factory V3 — Politique centralisée de retry.
 *
 * Objectif : supprimer les BOUCULES DE RETRY INUTILES tout en restant
 * correct face à un fournisseur qui impose un délai.
 *
 * Règles :
 *  - HTTP 429 → le `Retry-After` du fournisseur est RESPECTÉ STRICTEMENT
 *    (le délai ne peut jamais être raccourci) ;
 *  - backoff exponentiel avec jitter : 2 s, 5 s, 10 s, 20 s, puis 60 s max ;
 *  - 2 à 3 tentatives maximum sur le MÊME modèle pour une erreur transitoire ;
 *  - quota épuisé → cooldown jusqu'à la réinitialisation connue (pas de retry
 *    immédiat) ; reset inconnu → cooldown progressif, sans boucle infinie ;
 *  - filtrage de sécurité indisponible → UNE seule reprise différée, puis
 *    bascule (le contrôle de sécurité n'est jamais désactivé) ;
 *  - erreur d'authentification / modèle inexistant → AUCUNE répétition.
 */

const { CATEGORY } = require('./error-classifier.cjs');

/** Séquence de backoff imposée par la mission (plafond 60 s). */
const BACKOFF_SCHEDULE_MS = [2000, 5000, 10000, 20000, 60000];
const MAX_DELAY_MS = 60000;
const MAX_SAME_MODEL_ATTEMPTS = 3;
const JITTER_RATIO = 0.25;

/** Catégories qui ne justifient JAMAIS un nouvel essai sur le même modèle. */
const NO_RETRY_CATEGORIES = new Set([
  CATEGORY.CODE_ERROR,      // erreur de programmation : le modèle n'y peut rien
  CATEGORY.AUTH_ERROR,      // 401/403 : inutile de réessayer
  CATEGORY.MODEL_INVALID,   // modèle inexistant : inutile de réessayer
  CATEGORY.QUOTA_CREDIT,    // 402 : aucun achat de crédit sans autorisation
  CATEGORY.RESULT_NOT_PRODUCED, // réponse sans résultat réel : pas de faux succès
  CATEGORY.MODEL_MISMATCH,  // modèle/fournisseur observé ≠ modèle demandé
  CATEGORY.COST_VIOLATION,  // coût observé non nul : succès refusé, aucun nouvel appel
]);

/** Catégories où le fournisseur est lui-même en cause (bascule fournisseur). */
const PROVIDER_LIMITED_CATEGORIES = new Set([
  CATEGORY.RATE_LIMITED,
  CATEGORY.PROVIDER_UNAVAILABLE,
  CATEGORY.AUTH_ERROR,
]);

function baseDelayForAttempt(attempt) {
  const i = Math.max(1, attempt) - 1;
  return BACKOFF_SCHEDULE_MS[Math.min(i, BACKOFF_SCHEDULE_MS.length - 1)];
}

/**
 * Calcule le délai d'attente avant un nouvel essai.
 * @param {object} p
 * @param {number} p.attempt          numéro de tentative (1 = premier essai)
 * @param {number|null} p.retryAfterMs délai imposé par le fournisseur
 * @param {number} [p.jitterRatio]
 * @param {function} [p.random]       source d'aléatoire (injectable en test)
 */
function computeDelayMs(p = {}) {
  const attempt = Math.max(1, Number(p.attempt) || 1);
  const rawRetryAfter = p.retryAfterMs != null ? Number(p.retryAfterMs) : null;
  const resetAt = p.knownResetAt ? Date.parse(p.knownResetAt) : NaN;
  const resetDelay = Number.isFinite(resetAt)
    ? Math.max(0, resetAt - (Number(p.now) || Date.now()))
    : 0;
  const retryAfter = rawRetryAfter != null && Number.isFinite(rawRetryAfter)
    ? Math.max(rawRetryAfter, resetDelay)
    : (resetDelay > 0 ? resetDelay : null);

  // Délai imposé par le fournisseur/reset : respect STRICT (jamais raccourci).
  // Exception volontaire au plafond de 60 s : un Retry-After de 120 s doit
  // rester 120 s, sinon nous irions marteler le fournisseur trop tôt.
  if (retryAfter != null && Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.max(retryAfter, baseDelayForAttempt(attempt));
  }

  const base = baseDelayForAttempt(attempt);
  const ratio = p.jitterRatio != null ? Number(p.jitterRatio) : JITTER_RATIO;
  const random = typeof p.random === 'function' ? p.random : Math.random;
  // Jitter ADDITIF : le délai ne descend jamais sous la valeur de base.
  const jitter = Math.floor(base * ratio * random());
  return Math.min(MAX_DELAY_MS, base + jitter);
}

/**
 * Décide s'il faut RÉESSAYER sur le MÊME modèle, et après quel délai.
 *
 * @returns {{retry:boolean, delayMs:number, reason:string, category:string}}
 */
function decideRetry(p = {}) {
  const classification = p.classification || {};
  const category = classification.category || CATEGORY.UNKNOWN;
  const attempt = Math.max(1, Number(p.attempt) || 1);
  const maxAttempts = Math.min(
    MAX_SAME_MODEL_ATTEMPTS,
    Math.max(1, Number(p.maxAttempts) || MAX_SAME_MODEL_ATTEMPTS),
  );

  if (NO_RETRY_CATEGORIES.has(category)) {
    return {
      retry: false,
      delayMs: 0,
      category,
      reason: `${category} : aucun nouvel essai sur le même modèle (inutile).`,
    };
  }

  // Quota épuisé : cooldown jusqu'au reset connu, pas de retry immédiat.
  if (category === CATEGORY.DAILY_QUOTA_EXHAUSTED) {
    return {
      retry: false,
      delayMs: 0,
      category,
      reason: classification.resetAt
        ? `Quota épuisé : cooldown jusqu'au reset connu (${classification.resetAt}).`
        : 'Quota épuisé sans reset communiqué : cooldown progressif, pas de retry immédiat.',
    };
  }

  // Filtrage de sécurité : UNE seule reprise différée, puis failover.
  // `safetyAttempt` compte les échecs safety de CE modèle dans le job entier
  // (et non seulement depuis le dernier restart), pour ne pas réautoriser une
  // seconde reprise après interruption du runner.
  if (category === CATEGORY.CONTENT_SAFETY_UNAVAILABLE) {
    const safetyAttempt = Math.max(1, Number(p.safetyAttempt) || attempt);
    if (safetyAttempt >= 2) {
      return {
        retry: false,
        delayMs: 0,
        category,
        reason: 'Filtrage de sécurité indisponible : la reprise différée unique a échoué → bascule.',
      };
    }
    const delayMs = computeDelayMs({
      attempt,
      retryAfterMs: classification.retryAfterMs,
      knownResetAt: classification.knownResetAt,
      now: p.now,
      jitterRatio: p.jitterRatio,
      random: p.random,
    });
    return {
      retry: true,
      delayMs,
      category,
      reason: `Filtrage de sécurité indisponible : une seule reprise différée (${delayMs} ms).`,
    };
  }

  // Une erreur explicitement non transitoire (ex. résultat non produit)
  // ne mérite pas un nouvel essai sur le même modèle.
  if (classification.transient === false) {
    return {
      retry: false,
      delayMs: 0,
      category,
      reason: `${category} : erreur non transitoire — pas de nouvel essai sur le même modèle.`,
    };
  }

  // Erreur transitoire : jusqu'à `maxAttempts` essais sur le même modèle.
  if (attempt >= maxAttempts) {
    return {
      retry: false,
      delayMs: 0,
      category,
      reason: `${category} : ${maxAttempts} tentative(s) sur le même modèle épuisée(s) → bascule.`,
    };
  }

  const delayMs = computeDelayMs({
    attempt,
    retryAfterMs: classification.retryAfterMs,
    knownResetAt: classification.knownResetAt,
    now: p.now,
    jitterRatio: p.jitterRatio,
    random: p.random,
  });
  const strict = classification.retryAfterMs != null ? ' (Retry-After respecté)' : '';
  return {
    retry: true,
    delayMs,
    category,
    reason: `${category} : nouvel essai dans ${delayMs} ms${strict}.`,
  };
}

/** Le fournisseur lui-même est-il la cause (→ changer de fournisseur) ? */
function isProviderLimited(classification) {
  if (!classification) return false;
  // Un quota propre à un modèle (daily free messages) ne condamne pas tous les
  // modèles du fournisseur : on peut tenter un autre modèle du même provider.
  if (classification.modelSpecific && !classification.providerLimited) return false;
  if (classification.providerLimited) return true;
  return PROVIDER_LIMITED_CATEGORIES.has(classification.category);
}

/** Le problème est propre au modèle (→ essayer un autre modèle du même fournisseur) ? */
function isModelSpecific(classification) {
  if (!classification) return false;
  if (classification.modelSpecific) return true;
  return classification.category === CATEGORY.MODEL_INVALID;
}

module.exports = {
  BACKOFF_SCHEDULE_MS,
  MAX_DELAY_MS,
  MAX_SAME_MODEL_ATTEMPTS,
  JITTER_RATIO,
  NO_RETRY_CATEGORIES,
  PROVIDER_LIMITED_CATEGORIES,
  computeDelayMs,
  decideRetry,
  isProviderLimited,
  isModelSpecific,
};

#!/usr/bin/env node
/**
 * safety-guard.cjs — garde-fou de sécurité des missions GitHub (fail-closed).
 *
 * Une mission `[AUTOPILOT]` est une DONNÉE, jamais une autorisation. Ce module
 * decide si la mission peut être exécutée automatiquement, ou si elle doit être
 * BLOQUÉE avec un motif précis publié sur l'issue.
 *
 * Catégories bloquantes (mission P0 §7) :
 *   - production-deploy       : déploiement / mise en ligne en production
 *   - payments-security-merge : fusion touchant paiements ou sécurité
 *   - payment-live            : création/modification de paiements réels, remboursements
 *   - pricing                 : modification des prix / forfaits
 *   - secrets-permissions     : secrets, tokens, credentials, permissions
 *   - irreversible-migration  : migrations irréversibles / suppressions destructrices
 *   - mass-send-spend         : envois massifs / dépenses massives
 *
 * Règles :
 *   - AUCUN contournement possible depuis le texte de la mission (une issue ne
 *     peut pas s'auto-autoriser) : il n'existe volontairement aucun mécanisme
 *     d'override dans ce module ;
 *   - la détection est faite sur le TEXTE INTÉGRAL (titre + corps + commentaires
 *     + bloc AUTOPILOT_TASK), pas sur le seul titre ;
 *   - les extraits publiés sont MASQUÉS (un secret ne doit jamais fuiter dans
 *     un commentaire GitHub ni dans un log) ;
 *   - le module est 100 % déterministe et sans dépendance : il est testable
 *     hors-ligne.
 */

'use strict';

/** Catégories interdites à l'exécution automatique. */
const CATEGORIES = [
  {
    category: 'production-deploy',
    label: 'déploiement en production',
    patterns: [
      /\b(?:deploy(?:er|ment|ed|ing|s)?|dépl(?:oy|oi)\w*|release|mise en ligne|mettre en ligne|mets? en production|publier|push(?:er)?)[^\n]{0,70}\b(?:prod(?:uction)?|en ligne|live|ftp|direct)\b/i,
      /\b(?:prod(?:uction)?|live)[^\n]{0,70}(?:deploy(?:er|ment)?|dépl(?:oy|oi)\w*|mise en ligne|release|publier)\b/i,
      /\bwrangler\s+deploy\b/i,
      /\bcloudflare[^\n]{0,40}\b(?:pages?\s+publish|deploy)\b/i,
      /\bftp\b[^\n]{0,40}\b(?:deploy|push|upload|transfér)/i,
      /\bmerg(?:e|er|ing)\b[^\n]{0,40}\bmain\b[^\n]{0,40}\b(?:deploy|release|mise en ligne)\b/i,
    ],
  },
  {
    category: 'payments-security-merge',
    label: 'fusion touchant les paiements ou la sécurité',
    patterns: [
      /\bmerg(?:e|er|ing)\b[^\n]{0,70}\b(?:paiement|payments|mollie|stripe|paypal|checkout|security|sécurité|authentification|auth)\b/i,
      /\b(?:paiement|payments|mollie|stripe|paypal|checkout|security|sécurité)\b[^\n]{0,70}\bmerg(?:e|er|ing)\b/i,
    ],
  },
  {
    category: 'payment-live',
    label: 'création ou modification de paiements réels, remboursements',
    patterns: [
      /\brefund\b|\brembours(?:er|ement|e)\b|\brembourser\b/i,
      /\b(?:paiement|payment|transaction|charge|checkout)[^\n]{0,70}\b(?:r(?:é|e)el|real|live|production|effectif)\b/i,
      /\b(?:r(?:é|e)el|real|live)[^\n]{0,70}\b(?:paiement|payment|transaction|charge)\b/i,
      /\b(?:cr(?:é|e)er|create|modifi(?:er|er)|modifier|émettre|emettre|emit)[^\n]{0,50}\b(?:paiement|payment|transaction|charge)\b/i,
      /\bmollie\b[^\n]{0,40}\blive\b|\blive\b[^\n]{0,40}\bmollie\b/i,
    ],
  },
  {
    category: 'pricing',
    label: 'modification des prix ou des forfaits',
    patterns: [
      /\b(?:prix|price|pricing|tarif|tarifs|montant|montants|amount)\b[^\n]{0,60}\b(?:chang(?:er|e|ement)|modifi(?:er|er)|revis(?:er|ion)|adjust(?:er|ment)?|augment(?:er|ation)|reduc(?:e|tion)|update|mise à jour)\b/i,
      /\b(?:chang(?:er|e|ement)|modifi(?:er|er)|revis(?:er|ion)|update|mise à jour|ajuster)\b[^\n]{0,50}\b(?:prix|price|pricing|tarif|tarifs|forfait)\b/i,
      /\bpass[-_ ]?price\b|\bTIERS\b|\bprix du pass\b/i,
    ],
  },
  {
    category: 'secrets-permissions',
    label: 'secrets, tokens, credentials et permissions',
    patterns: [
      /\b(?:secret|secrets|token|tokens|api[_ -]?key|credential|credentials|password|mot de passe)\b[^\n]{0,70}\b(?:ajout(?:er)?|add|create|cr(?:é|e)er|rotate|rotation|commit|push|expos|reveal|révél|lire|read|print|partage|share)\b/i,
      /\b(?:ajout(?:er)?|add|commit|push|expos|reveal|révél|partage|share)[^\n]{0,50}\b(?:secret|secrets|token|api[_ -]?key|credential|credentials)\b/i,
      /\bpermissions?\b[^\n]{0,50}\b(?:chmod|grant|elevate|admin|administrateur|write|manage|gestion)\b/i,
      /\bgh\s+secret\b|\bnpm\s+token\b|\bdeploy\s+key\b|\bssh\s+key\b|\bpersonal\s+access\s+token\b/i,
      /(^|[\s"'`/])\.env(\.[\w-]+)?\b/i,
    ],
  },
  {
    category: 'irreversible-migration',
    label: 'migration irréversible ou suppression destructive',
    patterns: [
      /\bmigration\b[^\n]{0,60}\b(?:irr(?:é|e)versible|non r(?:é|e)versible|destructive|destructrice|sans rollback|without rollback)\b/i,
      /\b(?:drop|delete|supprimer|truncate|rm)[^\n]{0,40}\b(?:table|column|colonne|tableau|index|database|base de donn(?:é|e)es)\b/i,
      /\brm\s+-rf\b[^\n]{0,40}\b(?:prod|production)\b/i,
      /\b(?:suppression|delete)[^\n]{0,40}\bdonn(?:é|e)es? de production\b/i,
    ],
  },
  {
    category: 'mass-send-spend',
    label: 'envois massifs ou dépenses massives',
    patterns: [
      /\b(?:envoi|envoie|envois|send|blast|campagne|newsletter)\b[^\n]{0,70}\b(?:massif|massive|en masse|à tous|all users|tous les utilisateurs|bulk)\b/i,
      /\b(?:d(?:é|e)pense|spend|buy|acheter|abonnement cloud)\b[^\n]{0,70}\b(?:massif|massive|bulk|illimit(?:é|e)|unlimited|des milliers)\b/i,
    ],
  },
];

/**
 * Masque les séquences qui ressemblent à un secret.
 *
 * Objectif : NE JAMAIS publier une clé, un token ou un mot de passe dans un
 * commentaire GitHub ou un log — même quand la mission en contient un (cas
 * réel : l'utilisateur colle son token dans l'issue).
 *
 * Prudence : un masquage trop agressif détruit l'information utile (le premier
 * masquage transformait `FAIL_TARGET_UNCHANGED: no files modified` en
 * `***MASKED***`, ce qui rendait le motif de blocage illisible). On ne masque
 * donc que si :
 *   - la CLÉ ressemble à un secret (token, secret, password, api_key…), ou
 *   - la VALEUR a la forme d'un jeton connu (ghp_, sk-, xox…, AKIA…, PEM).
 */
const SECRET_KEY = /\b(?:secret|secrets|token|tokens|api[_-]?key|apikey|credential|credentials|password|passwd|pwd|bearer|authorization|access[_-]?key|private[_-]?key|passphrase)\b/i;

function maskSecrets(text) {
  if (!text) return '';
  let out = String(text);
  // Valeur de type clé/valeur, UNIQUEMENT si la clé est sensible.
  out = out.replace(
    /([A-Za-z0-9_.-]{2,})\s*[:=]\s*["']?([^\s"']{12,})["']?/g,
    (m, key, value) => (SECRET_KEY.test(key) ? `${key}=***MASKED***` : m),
  );
  // Jetons génériques (forme connue).
  out = out.replace(/\b(gh[pousr]_[A-Za-z0-9]{16,})\b/g, '***MASKED***');
  out = out.replace(/\b(sk-[A-Za-z0-9]{16,})\b/g, '***MASKED***');
  out = out.replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '***MASKED***');
  out = out.replace(/\bAKIA[0-9A-Z]{12,}\b/g, '***MASKED***');
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '***MASKED***');
  // Secret dans une URL
  out = out.replace(/(\/\/[^:\s/]+:)[^@\s]+@/g, '$1***MASKED***@');
  return out;
}

/** Découpe un texte en "phrases" (lignes, points, points-virgules). */
function sentences(text) {
  return String(text || '')
    .split(/[\n\r.;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * NÉGATIONS — une phrase qui dit « ne PAS faire X » ne doit PAS déclencher
 * le garde-fou.
 *
 * Sans ce filtre, un simple commentaire de preuve (« aucun merge sur main,
 * aucun paiement, aucun secret ») bloquait la mission : faux positif
 *Packages critique, observé sur l'issue bot-wow#125 (commentaires de statut
 * de l'autopilot eux-mêmes).
 */
const NEGATION_MARKERS = [
  /\baucun(?:e)?\b/i,
  /\baucune\b/i,
  /\bsans\b/i,
  /\bne\b[^.;]{0,40}\bpas\b/i,
  /\bpas\s+(?:de|d')\b/i,
  /\bno[nt]?\b/i,
  /\bnever\b/i,
  /\bdo\s+not\b/i,
  /\bdon't\b/i,
  /\binterdit(?:e|s)?\b/i,
  /\bbloqu(?:é|e|és|ées)\b/i,
  /\bjamais\b/i,
  /\bwithout\b/i,
];

/** La phrase contient-elle une négation qui invalide la détection ? */
function isNegated(sentence) {
  return NEGATION_MARKERS.some(re => re.test(sentence));
}

/**
 * Évalue la sécurité d'une mission.
 *
 * @param {object} input
 * @param {string} input.title    titre de l'issue
 * @param {string} input.body     corps complet de l'issue
 * @param {string} input.comments commentaires utiles concaténés
 * @param {object} input.task     bloc AUTOPILOT_TASK parsé
 * @returns {{blocked:boolean, categories:Array, reason:string, scannedChars:number}}
 */
function evaluateMissionSafety(input = {}) {
  const parts = [];
  if (input.title) parts.push(String(input.title));
  if (input.body) parts.push(String(input.body));
  if (input.comments) parts.push(String(input.comments));
  if (input.task) {
    try {
      parts.push(JSON.stringify(input.task));
    } catch (_) {
      parts.push(String(input.task));
    }
  }
  const text = parts.join('\n');
  const hits = [];

  for (const rule of CATEGORIES) {
    for (const raw of sentences(text)) {
      // Une phrase niée (« aucun merge », « ne pas déployer ») n'est pas une
      // demande d'opération interdite.
      if (isNegated(raw)) continue;
      for (const re of rule.patterns) {
        const m = re.exec(raw);
        if (!m) continue;
        const evidence = maskSecrets(raw).slice(0, 180);
        hits.push({ category: rule.category, label: rule.label, evidence });
        break; // une preuve suffit par phrase
      }
      if (hits.some(h => h.category === rule.category)) break; // une preuve suffit par catégorie
    }
  }

  const blocked = hits.length > 0;
  const reason = blocked
    ? hits.map(h => `${h.label} [${h.category}]`).join(' ; ')
    : '';

  return {
    blocked,
    categories: hits,
    reason,
    scannedChars: text.length,
  };
}

module.exports = {
  CATEGORIES,
  evaluateMissionSafety,
  maskSecrets,
  isNegated,
};

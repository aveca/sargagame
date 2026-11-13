#!/usr/bin/env node
/**
 * final-scope.cjs — décision PURE du périmètre final d'un commit autopilot.
 *
 * Pourquoi ce module existe (défaut réel, observé le 2026-11-09) :
 *
 *   Le contrôle de scope (scope guard) et la denylist étaient validés sur le
 *   diff calculé AVANT le gate de ship. Or le gate lance `npm run build`, qui
 *   RÉGÉNÈRE des artefacts versionnés (`public/api/**`, `public/data/**`,
 *   `public/version.json`). Le diff était ensuite RECALCULÉ (ligne
 *   `const diff = gitops.diffStats(wt)`) juste avant `commitAll`, SANS
 *   revalidation : les fichiers hors scope étaient alors COMMITÉS.
 *
 *   Constat : la PR #1374 (mission « documenter .ai/autopilot/README.md »)
 *   contenait 4 fichiers — `.ai/autopilot/README.md` + `public/api/**` +
 *   `public/data/**`. La denylist (`public/api/**`) avait donc été contournée.
 *
 * Le correctif est en deux temps :
 *   1. RESTAURER (git checkout / suppression untracked) tout fichier hors
 *      périmètre — fait par `gitops.restoreOutOfScope` ;
 *   2. RE-VALIDER la liste finale sur la liste RÉELLEMENT committée — c'est
 *      le rôle de ce module (fail-closed).
 *
 * Ce module ne fait AUCUNE I/O : il est testable sans git.
 */
'use strict';

/** Normalise un chemin de dépôt : `./x`, `x\`, `/x` → `x`. */
function normalizeRepoPath(p) {
  return String(p || '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/^\\+/, '')
    .replace(/\\/g, '/');
}

/**
 * Partitionne les fichiers modifiés en « à garder » (dans le périmètre) et
 * « à restaurer » (hors périmètre).
 *
 * @param {{changedFiles?: string[], allowedFiles?: string[]}} input
 * @returns {{keep: string[], drop: string[]}}
 */
function partitionByScope({ changedFiles = [], allowedFiles = [] } = {}) {
  const allowed = new Set(allowedFiles.map(normalizeRepoPath));
  const keep = [];
  const drop = [];
  for (const f of changedFiles) {
    if (allowed.has(normalizeRepoPath(f))) keep.push(f);
    else drop.push(f);
  }
  return { keep, drop };
}

/**
 * Vérification FINALE (fail-closed) de la liste qui va être commitée.
 *
 * Règles :
 *  - aucun fichier hors périmètre ;
 *  - la CIBLE (premier fichier du périmètre) est effectivement modifiée ;
 *  - chaque fichier committé a été validé par le gate (syntaxe / lint) :
 *    `gateFiles` = liste des fichiers soumis au gate. Un fichier committé
 *    qui n'a pas été validé est un motif de parcage, pas un « ça passe ».
 *
 * @param {{changedFiles?: string[], allowedFiles?: string[], gateFiles?: string[]|null}} input
 * @returns {{ok: boolean, violations: string[], outOfScope: string[], notValidated: string[]}}
 */
function finalScopeCheck({ changedFiles = [], allowedFiles = [], gateFiles = null } = {}) {
  const allowed = new Set(allowedFiles.map(normalizeRepoPath));
  const modified = changedFiles.map(normalizeRepoPath);
  const violations = [];

  const outOfScope = modified.filter(f => !allowed.has(f));
  if (outOfScope.length) {
    violations.push(`FAIL_SCOPE: fichiers hors périmètre : ${outOfScope.join(', ')}`);
  }

  if (allowedFiles.length) {
    const target = normalizeRepoPath(allowedFiles[0]);
    if (!modified.includes(target)) {
      violations.push(`FAIL_TARGET_UNCHANGED: la cible ${target} n'est pas dans le diff final`);
    }
  } else if (!modified.length) {
    violations.push('FAIL_TARGET_UNCHANGED: aucun fichier modifié');
  }

  let notValidated = [];
  if (Array.isArray(gateFiles)) {
    const gate = new Set(gateFiles.map(normalizeRepoPath));
    notValidated = modified.filter(f => !gate.has(f));
    if (notValidated.length) {
      violations.push(`FAIL_NOT_VALIDATED: non contrôlés par le gate : ${notValidated.join(', ')}`);
    }
  }

  return { ok: violations.length === 0, violations, outOfScope, notValidated };
}

/**
 * Classe un échec du scope guard en deux catégories STRATÉGIQUEMENT
 * différentes :
 *
 *  - `scope-violation` : l'agent a touché des fichiers INTERDITS (hors
 *    mission ou denylist). C'est un signal de sécurité → on PARQUE, on ne
 *    relance pas (relancer donnerait au modèle une seconde chance
 *    d'écrire dans `public/api/**`).
 *  - `no-useful-change` : aucun fichier interdit, mais le fichier autorisé
 *    n'a pas été modifié (l'agent a narré son intention au lieu d'appeler
 *    son outil). C'est une maladresse d'exécution → on RELANCE l'agent avec
 *    le motif exact.
 *
 * @param {{ok?:boolean, reason?:string, details?:{outOfScope?:string[]}}} scopeGuard
 * @returns {{kind:'scope-violation'|'no-useful-change', retryable:boolean, reason:string, outOfScope:string[]}}
 */
function classifyScopeFailure(scopeGuard = {}) {
  const details = scopeGuard.details || {};
  const outOfScope = Array.isArray(details.outOfScope) ? details.outOfScope : [];
  if (outOfScope.length) {
    return {
      kind: 'scope-violation',
      retryable: false,
      reason: scopeGuard.reason || 'FAIL_SCOPE: fichiers hors périmètre',
      outOfScope,
    };
  }
  return {
    kind: 'no-useful-change',
    retryable: true,
    reason: scopeGuard.reason || 'FAIL_TARGET_UNCHANGED: no files modified by agent',
    outOfScope: [],
  };
}

module.exports = { normalizeRepoPath, partitionByScope, finalScopeCheck, classifyScopeFailure };

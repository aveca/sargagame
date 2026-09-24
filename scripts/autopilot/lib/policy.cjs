#!/usr/bin/env node
/**
 * policy.cjs — garde-fous de l'autopilot.
 *
 * Règles NON négociables (fusibles durs, mission + AGENTS.md) :
 *  - jamais d'écriture sur main (branche → PR)
 *  - denylist : paiements, secrets, workers, public/api, regions, workflows,
 *    automation, package*.json, vite.config, sw, dist, PremiumModal (money UI)
 *  - auto-merge UNIQUEMENT si catégorie whitelistée ET autoMergeEnabled
 *  - budgets : maxFilesChanged / maxDiffLines
 *  - stop conditions évaluées par l'orchestrateur à chaque étape
 */
'use strict';
const path = require('path');

/** Glob→regex minimal ('**' traverse les dossiers, '*' reste dans un segment). */
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++; // '**/' → '.*' englobe la barre
      } else re += '[^/]*';
    }
    else if ('\\^$.|?+()[]{}'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

function matchesAny(file, globs) {
  const f = file.split(path.sep).join('/');
  return (globs || []).some(g => globToRe(g).test(f));
}

const KEYWORD_DENY = /mollie|paypal|stripe|payment|checkout|secret|credential|token\.php/i;

/** {allowed, denied[], reasons[]} — évalue une liste de fichiers (chemins relatifs repo). */
function evaluateFiles(files, cfg) {
  const deny = cfg.policy.denyGlobs || [];
  const denied = [];
  const reasons = [];
  for (const f of (files || [])) {
    if (matchesAny(f, deny)) { denied.push(f); reasons.push(`${f} — matche denylist`); continue; }
    if (KEYWORD_DENY.test(f)) { denied.push(f); reasons.push(`${f} — mot-clé sensible (money/secret)`); }
  }
  return { allowed: denied.length === 0, denied, reasons };
}

/** Budgets de diff. stats = {files:int, insertions:int, deletions:int}. */
function evaluateBudget(stats, cfg) {
  const p = cfg.policy;
  const errs = [];
  if (stats.files > p.maxFilesChanged) errs.push(`${stats.files} fichiers > max ${p.maxFilesChanged}`);
  if (stats.insertions + stats.deletions > p.maxDiffLines) errs.push(`${stats.insertions + stats.deletions} lignes > max ${p.maxDiffLines}`);
  return errs;
}

/** Auto-merge autorisé ? (tous les fichiers dans la whitelist + flag global). */
function canAutoMerge(files, cfg) {
  if (!cfg.policy.autoMergeEnabled) return false;
  const wl = cfg.policy.autoMergeWhitelist || [];
  return (files || []).length > 0 && (files || []).every(f => matchesAny(f, wl));
}

/** Scan de secrets grossier sur le diff (défense en profondeur avant commit). */
const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]{8,}/, /pk_live_[A-Za-z0-9]{16,}/, /live_[A-Za-z0-9]{24,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /sb_secret_[A-Za-z0-9_-]{8,}/,
  /SG_STATS_KEY_[A-Z0-9]+\s*=\s*\S+/i, /SMTP_PASS\s*=\s*\S+/i,
];
function scanSecrets(text) {
  const hits = [];
  for (const re of SECRET_PATTERNS) { const m = text.match(re); if (m) hits.push(m[0].slice(0, 12) + '…'); }
  return hits;
}

/** Conditions d'arrêt global (chaque entrée vraie = STOP, jamais continuer à l'aveugle). */
function stopConditions(state) {
  // state: {prodDown[], prOpen, stopFileExists, repairAttempts, maxRepairAttempts, bundleBreached, testRegressions}
  const reasons = [];
  if (state.stopFileExists) reasons.push('fichier STOP présent (kill-switch fondateur)');
  if (state.prodDown && state.prodDown.length) reasons.push(`production outage : ${state.prodDown.join(', ')} injoignable/5xx`);
  if (state.prOpen) reasons.push(`PR autopilot déjà ouverte (${state.prOpen}) — une seule à la fois`);
  if (state.repairAttempts != null && state.repairAttempts > (state.maxRepairAttempts || 3)) reasons.push('réparations épuisées (>3)');
  if (state.bundleBreached) reasons.push('budget bundle dépassé après réparation');
  if (state.credentialsRequested) reasons.push('l\'implémentation demande des credentials');
  return reasons;
}

module.exports = { globToRe, matchesAny, evaluateFiles, evaluateBudget, canAutoMerge, scanSecrets, stopConditions };

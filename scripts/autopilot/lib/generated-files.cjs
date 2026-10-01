#!/usr/bin/env node
/**
 * generated-files.cjs — SOURCE UNIQUE des fichiers générés / temporaires.
 *
 * Problème résolu : prepareRepairWorktree() classait les artefacts de build
 * comme « WIP inconnu » et bloquait la réparation de PR (faux WIP).
 * Exemple réel : public/api/b2b-partners.json + src/lib/partners-catalog.json
 * sont régénérés à CHAQUE `npm run build` (gen-b2b-partners.cjs +
 * gen-context-partners.cjs) — les traiter comme du WIP développeur transforme
 * un artefact déterministe en blocage humain.
 *
 * Contrat :
 *  - GENERATED_FILES : liste EXPLICITE {pattern, reason, producer}.
 *    Exact match OU préfixe répertoire (pattern terminé par '/').
 *  - AUTOPILOT_TEMP_FILES : état runtime de l'usine (jamais du WIP produit).
 *  - classifyRepairFile(f) → 'generated' | 'autopilot-temp' | 'unknown'.
 *    'unknown' = WIP potentiellement développeur → PRÉSERVÉ, jamais nettoyé.
 *  - 100 % pur et testable (aucun I/O).
 */
'use strict';

/**
 * Fichiers régénérés de façon déterministe par le build / le pipeline.
 * Un worktree de réparation peut les nettoyer (`git checkout --`) sans perte :
 * le prochain build / run pipeline les régénère à l'identique.
 */
const GENERATED_FILES = [
  // Build step `gen-b2b-partners.cjs` (npm run build) — catalogue LIVE depuis
  // scripts/automation/data/b2b-partner-meta.json. JAMAIS édité à la main.
  { pattern: 'public/api/b2b-partners.json', reason: 'build:gen-b2b-partners', producer: 'scripts/automation/gen-b2b-partners.cjs' },
  // Build step `gen-context-partners.cjs` (npm run build) — catalogue LEAN in-app.
  { pattern: 'src/lib/partners-catalog.json', reason: 'build:gen-context-partners', producer: 'scripts/automation/gen-context-partners.cjs' },
  // Build step `gen-media-manifest.cjs` — manifeste médias (contrat v1).
  { pattern: 'public/data/media-manifest.json', reason: 'build:gen-media-manifest', producer: 'scripts/gen-media-manifest.cjs' },
  // Build step `build-sargassum-json.cjs` — composite ERDDAP-live + forecast.
  { pattern: 'public/api/copernicus/sargassum.json', reason: 'build:build-sargassum-json', producer: 'scripts/build-sargassum-json.cjs' },
  // Build step `sync-version.cjs` — empreinte version déployée.
  { pattern: 'public/version.json', reason: 'build:sync-version', producer: 'scripts/sync-version.cjs' },
  // Sortie bundler (jamais du WIP — cf. interdiction produit dist/).
  { pattern: 'dist/', reason: 'build:vite', producer: 'vite build + stamp-sw-hash.cjs' },
  // Dépendances (jamais committées, restaurées par npm ci).
  { pattern: 'node_modules/', reason: 'install:npm-ci', producer: 'npm ci' },
];

/**
 * État runtime de l'usine (cycles, observations, files d'attente locales).
 * Stashé (préservé), jamais supprimé, jamais committé comme WIP produit.
 */
const AUTOPILOT_TEMP_FILES = [
  { pattern: '.ai/autopilot/observations/latest.json', reason: 'runtime:observe-cache' },
  { pattern: '.ai/autopilot/queue.json', reason: 'runtime:opportunity-queue' },
  { pattern: '.ai/autopilot/scheduler.json', reason: 'runtime:scheduler-state' },
  { pattern: '.ai/autopilot/latest.md', reason: 'runtime:latest-report' },
  { pattern: '.ai/autopilot/runs/', reason: 'runtime:cycle-reports' },
  { pattern: '.ai/autopilot/regressions/', reason: 'runtime:regression-notes' },
];

function norm(f) {
  return String(f || '').split('\\').join('/').replace(/^\.\//, '');
}

function matchesPattern(file, pattern) {
  const f = norm(file);
  const p = norm(pattern);
  if (f === p) return true;
  // Préfixe répertoire : exige le séparateur (évite 'src' vs 'srcx').
  if (p.endsWith('/')) return f.startsWith(p);
  return f.startsWith(p + '/');
}

function isGeneratedFile(file) {
  return GENERATED_FILES.some(g => matchesPattern(file, g.pattern));
}

function isAutopilotTempFile(file) {
  return AUTOPILOT_TEMP_FILES.some(g => matchesPattern(file, g.pattern));
}

/**
 * Classification pour prepareRepairWorktree() :
 *  - 'generated' : nettoyage sûr (`git checkout --`, régénérable).
 *  - 'autopilot-temp' : stash (préservé pour diagnostic/reprise).
 *  - 'unknown' : PRÉSERVÉ tel quel (WIP développeur potentiel).
 */
function classifyRepairFile(file) {
  if (isGeneratedFile(file)) return 'generated';
  if (isAutopilotTempFile(file)) return 'autopilot-temp';
  return 'unknown';
}

function listGeneratedPatterns() {
  return GENERATED_FILES.map(g => g.pattern);
}

module.exports = {
  GENERATED_FILES,
  AUTOPILOT_TEMP_FILES,
  isGeneratedFile,
  isAutopilotTempFile,
  classifyRepairFile,
  listGeneratedPatterns,
};

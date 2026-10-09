#!/usr/bin/env node
/**
 * certification-gate.cjs — Verrou unique « aucune opération de production sans
 * certification PASS attestée pour le commit produit effectif ».
 *
 * Source de vérité : scripts/CHECK_certification_status.cjs --mode deploy
 * (attestation .ai/certification/attestations/<sha-produit>.json + preuves
 * vérifiées). AVANT tout déploiement / upload / merge automatique :
 *   const { assertDeployCertified } = require('./lib/certification-gate.cjs');
 *   assertDeployCertified();        // exit 1 si refus — jamais de warning seul
 *
 * Aucune variable d'environnement, option ou commande alternative ne contourne
 * ce refus : le verdict ne dépend que du code de HEAD et de ses preuves.
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CHECK = path.join(ROOT, 'scripts', 'CHECK_certification_status.cjs');

function runCheck(cwd) {
  return spawnSync(process.execPath, [CHECK, '--mode', 'deploy', '--root', cwd], { encoding: 'utf8' });
}

/**
 * Autorise ou BLOQUE. Par défaut : journalise le refus et termine le processus
 * (exit 1) — à appeler en tout premier, avant lecture de secrets ou réseau.
 * Avec { throwOnFail: true } : lève une erreur CERTIFICATION_REFUSED (usage
 * bibliothèque, ex. orchestrateur).
 */
function assertDeployCertified({ cwd = ROOT, throwOnFail = false, label = 'déploiement' } = {}) {
  const r = runCheck(cwd);
  if (r.status === 0) return true;
  const digest = (r.stdout || '')
    .split('\n')
    .filter(l => /GLOBAL|commit produit|deploy:|TECHNICAL|PRODUCTION|BUSINESS/.test(l))
    .join('\n');
  const msg = `CERTIFICATION REFUSÉE (${label}) — opération de production annulée AVANT tout accès externe.\n${digest}`;
  if (throwOnFail) {
    const e = new Error(msg);
    e.code = 'CERTIFICATION_REFUSED';
    throw e;
  }
  console.error(msg);
  process.exit(1);
}

/** Variante booléenne (tests, orchestrateur) — ne termine jamais le processus. */
function isDeployCertified({ cwd = ROOT } = {}) {
  return runCheck(cwd).status === 0;
}

module.exports = { assertDeployCertified, isDeployCertified };

#!/usr/bin/env node
/**
 * check-regional-artifact.cjs — Garde CI/déploiement : l'artefact PRÉPARÉ
 * d'une région (<ftpDir>/api/copernicus/sargassum.json) ne doit contenir
 * aucune plage d'une autre île (mission P0 MQ/GP).
 *
 * À exécuter APRÈS `node scripts/prepare-ftp.cjs` et AVANT tout envoi
 * Cloudflare (job `build` + job `deploy` de cloudflare-production.yml, pour
 * chaque région de la matrice). Étranger ou inconnu => exit 1 (bloquant).
 * Artefact absent/invalide => exit 1 (fail-closed, jamais de passe silencieux).
 *
 * Usage : node scripts/check-regional-artifact.cjs --region <id>
 *   (ex. mq, gp, florida, puntacana, rivieramaya, tulum).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { getRegion } = require('../regions/index.cjs');
const { checkRegionalArtifact, ownIslandOf } = require('./lib/regional-copernicus.cjs');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const ri = args.findIndex((a) => a === '--region');
const regionId = ri >= 0 ? args[ri + 1] : null;
if (!regionId) {
  console.error('Usage: node scripts/check-regional-artifact.cjs --region <id>');
  process.exit(1);
}

let region;
try {
  region = getRegion(regionId);
} catch (e) {
  console.error(`FAIL région inconnue "${regionId}" (${e.message.split('\n')[0]})`);
  process.exit(1);
}

const artifactPath = path.join(ROOT, region.ftpDir, 'api', 'copernicus', 'sargassum.json');
if (!fs.existsSync(artifactPath)) {
  console.error(`FAIL ${regionId} : artefact absent (${path.relative(ROOT, artifactPath)}) — exécuter prepare-ftp d'abord`);
  process.exit(1);
}
let artifact;
try {
  artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
} catch (e) {
  console.error(`FAIL ${regionId} : artefact illisible (${e.message.split('\n')[0]})`);
  process.exit(1);
}

const res = checkRegionalArtifact(artifact, region);
if (!res.ok) {
  console.error(`FAIL ${regionId} (${region.domain}, île ${ownIslandOf(region)}) : ${res.issues.length} entrée(s) non conformes :`);
  for (const i of res.issues.slice(0, 10)) {
    console.error(`  - ${i.where}:${i.key} (${i.problem}${i.island ? ', île ' + i.island : ''})`);
  }
  if (res.issues.length > 10) console.error(`  … +${res.issues.length - 10} autres`);
  process.exit(1);
}
console.log(`OK ${regionId} (${region.domain}) : artefact régional conforme, 0 plage étrangère, 0 inconnue`);

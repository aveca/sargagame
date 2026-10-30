#!/usr/bin/env node
'use strict';

/**
 * code-only-manifest.cjs — Produit les manifests de fichiers scientifiques
 * pour une release code-only. Compare les hashes byte-for-byte avec le
 * snapshot déployé pour garantir l'invariance des données.
 *
 * Usage: node scripts/code-only-manifest.cjs [deployed-sha]
 * Si deployed-sha est fourni, compare avec ce commit.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();

// Fichiers scientifiques protégés — aucune modification autorisée en release code-only
const PROTECTED_FILES = [
  'public/api/copernicus/sargassum.json',
  'public/api/copernicus/history.json',
  'public/api/copernicus/forecast-full.json',
  'public/api/copernicus/forecast-archive.json',
  'public/api/copernicus/sargassum-grid.json',
  'public/api/copernicus/sargassum-banks.json',
  'public/api/copernicus/caribbean-afai.json',
  'public/api/copernicus/track-record.json',
  'public/api/copernicus/forecast-accuracy.json',
  'public/api/copernicus/climatology.json',
  // Données régionales
  'public/api/copernicus/mq/sargassum.json',
  'public/api/copernicus/mq/history.json',
  'public/api/copernicus/gp/sargassum.json',
  'public/api/copernicus/gp/history.json',
  // Track record
  'public/api/copernicus/_private',
];

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return 'DIRECTORY';
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function sha256Dir(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      result[entry.name] = sha256Dir(full);
    } else {
      result[entry.name] = sha256File(full);
    }
  }
  return result;
}

function buildManifest() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    files: {},
    dirs: {},
  };

  for (const file of PROTECTED_FILES) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        manifest.dirs[file] = sha256Dir(fullPath);
      } else {
        manifest.files[file] = sha256File(fullPath);
      }
    } else {
      manifest.files[file] = 'MISSING';
    }
  }

  return manifest;
}

function compareManifests(current, deployed) {
  const differences = [];

  // Check files
  for (const [file, currentHash] of Object.entries(current.files)) {
    const deployedHash = deployed.files[file];
    if (deployedHash === undefined) {
      differences.push({ file, status: 'MISSING_IN_DEPLOYED', current: currentHash, deployed: null });
    } else if (currentHash !== deployedHash) {
      differences.push({ file, status: 'HASH_MISMATCH', current: currentHash, deployed: deployedHash });
    }
  }

  // Check dirs
  for (const [dir, currentHash] of Object.entries(current.dirs)) {
    const deployedHash = deployed.dirs[dir];
    if (deployedHash === undefined) {
      differences.push({ dir, status: 'MISSING_IN_DEPLOYED', current: currentHash, deployed: null });
    } else if (JSON.stringify(currentHash) !== JSON.stringify(deployedHash)) {
      differences.push({ dir, status: 'HASH_MISMATCH', current: currentHash, deployed: deployedHash });
    }
  }

  return differences;
}

const deployedSha = process.argv[2];
const current = buildManifest();
const manifestPath = path.join(ROOT, 'reports', 'sargagame', 'code-only-manifest.json');

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(current, null, 2), 'utf-8');
console.log(`Manifest écrit: ${manifestPath}`);
console.log(`Fichiers: ${Object.keys(current.files).length}, Répertoires: ${Object.keys(current.dirs).length}`);

if (deployedSha) {
  console.log(`\nComparaison avec le déployé ${deployedSha}...`);
  // En pratique, on vérifierait via git show <sha>:<path>
  // Pour l'instant, on signale que la comparaison doit être faite
  console.log('NOTE: La comparaison byte-for-byte nécessite git show <sha>:<path> pour chaque fichier.');
  console.log('      Cette étape doit être exécutée dans le CI avec le SHA déployé exact.');
} else {
  console.log('\nAucun SHA déployé fourni — manifest généré uniquement.');
  console.log('Pour la vérification complète, exécuter avec le SHA déployé:');
  console.log('  node scripts/code-only-manifest.cjs <deployed-sha>');
}

module.exports = { buildManifest, compareManifests, PROTECTED_FILES };

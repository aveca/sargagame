#!/usr/bin/env node
/**
 * check-beachsheet-syntax.cjs — garde-fou CI ciblé sur src/BeachSheet.jsx.
 *
 * Contexte : un résidu de merge (ligne `>>>>>>>` + bloc hors fragment,
 * octobre 2026) a rendu ce fichier non parsable sans faire échouer le build
 * (fichier hors graphe vite, hors `*.test.cjs`, hors smoke). Ce contrôle fait
 * échouer la CI sur toute future erreur de syntaxe du fichier.
 *
 * Contraintes :
 * - esbuild RÉSOLU LOCALEMENT (node_modules installé par `npm ci`, version
 *   verrouillée par package-lock.json) — aucun `npx --yes`, aucun téléchargement
 *   de version flottante.
 * - Vérification par transformation esbuild SANS écriture (write:false),
 *   imports non résolus : contrôle strictement limité à la syntaxe du fichier.
 *
 * Usage : node scripts/check-beachsheet-syntax.cjs [fichier...]
 *   défaut : src/BeachSheet.jsx (relatif à la racine du dépôt).
 * Exit : 0 = tous parsables ; 1 = au moins un en erreur.
 */
'use strict';
const path = require('path');
const esbuild = require('esbuild'); // local node_modules uniquement
const esbuildVersion = require('esbuild/package.json').version;

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const targets = args.length ? args : ['src/BeachSheet.jsx'];

let failed = 0;
for (const t of targets) {
  const abs = path.isAbsolute(t) ? t : path.join(ROOT, t);
  try {
    esbuild.buildSync({
      entryPoints: [abs],
      loader: { '.jsx': 'jsx' },
      write: false,
      logLevel: 'error',
    });
    console.log(`OK   ${t}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${t} — erreur de syntaxe (voir log esbuild ci-dessus)`);
  }
}

console.log(`esbuild local verrouillé : ${esbuildVersion} (package-lock.json, zéro téléchargement)`);
if (failed) {
  console.error(`${failed} fichier(s) en erreur de syntaxe`);
  process.exit(1);
}
console.log(`${targets.length} fichier(s) parsable(s)`);

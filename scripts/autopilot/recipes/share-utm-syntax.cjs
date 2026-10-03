#!/usr/bin/env node
/**
 * RECETTE share-utm-syntax — découverte AUTONOME de la sonde (probe-manual-2,
 * 2026-09-24) : pageerror « Unexpected token ';' » sur TOUTES les pages SEO
 * générées (beach + deep, mq + florida).
 *
 * Cause racine reproduite (scripts/lib/dedicated-pages.cjs, bloc shareScript) :
 *   const urls = {
 *     whatsapp: ..., …,
 *     copy: async () => {
 *       …
 *     };          ← PARSE ERROR : `};` au milieu d'un objet littéral.
 *                   L'objet n'est jamais refermé → tout le script inline meurt
 *                   → les 5 boutons de partage UTM des 136+ pages SEO sont MORTS
 *                   (dead-clicks wa.me/facebook/twitter/email/copy en prod).
 *
 * Transformation exacte (1 occurrence, assertion) :
 *   "    };\n  \n  if (platform === 'copy') {"
 *   → "    }\n  };\n  \n  if (platform === 'copy') {"
 *
 * Test de contrat ajouté : tests/unit/autopilot-share-utm.test.cjs
 * (extrait le <script> du template et le PARSE réellement via new Function).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TARGET = path.join('scripts', 'lib', 'dedicated-pages.cjs');
// Le fichier est en CRLF — les patterns sont construits sur l'EOL détecté.
const OLD_T = "    };\n  \n  if (platform === 'copy') {\n    urls.copy();";
const NEW_T = "    }\n  };\n  \n  if (platform === 'copy') {\n    urls.copy();";

const TEST_FILE = path.join('tests', 'unit', 'autopilot-share-utm.test.cjs');
const TEST_SRC = `// tests/unit/autopilot-share-utm.test.cjs — Contrat recette share-utm-syntax
// Le <script> shareWithUTM des pages générées DOIT parser (pageerror prod constaté).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'lib', 'dedicated-pages.cjs'), 'utf8');
let passed = 0;
function check(name, cond) { assert.ok(cond, name); passed++; console.log('  ✓ ' + name); }

console.log('SHARE-UTM — script inline des pages SEO parse\\n');
const i = src.indexOf('function shareWithUTM');
check('bloc shareWithUTM présent dans le générateur', i > 0);
// Reconstitue le script émis : du function jusqu'aux accolades fermantes de la fn.
const slice = src.slice(i, src.indexOf('</script>', i));
let parsed = null;
try { new Function(slice); parsed = true; } catch (e) { parsed = e.message; }
check('le script inline PARSE (new Function)', parsed === true, );
check('objet urls refermé correctement', /copy: async \\(\\) => \\{[\\s\\S]*?\\r?\\n    \\}\\r?\\n  \\};/.test(slice));
check('5 canaux de partage définis', ['whatsapp', 'facebook', 'twitter', 'email', 'copy'].every(k => slice.includes(k + ':')));

console.log(\`\\n\${passed}/4 checks OK\`);
`;

module.exports = {
  name: 'share-utm-syntax',
  description: 'Répare le script de partage UTM (syntax error objet) sur les 136+ pages SEO générées',
  apply(wt, log) {
    const file = path.join(wt, TARGET);
    const src = fs.readFileSync(file, 'utf8');
    const eol = src.includes('\r\n') ? '\r\n' : '\n';
    const OLD = OLD_T.split('\n').join(eol);
    const NEW = NEW_T.split('\n').join(eol);

    if (!src.includes(OLD) && src.includes(NEW)) {
      log('recette déjà appliquée (idempotent)');
      ensureTest(wt, log);
      return { files: [TARGET, TEST_FILE], summary: 'no-op (déjà appliqué)' };
    }
    const count = src.split(OLD).length - 1;
    if (count !== 1) throw new Error(`recette inapplicable : ${count} occurrence(s) du pattern au lieu de 1 — le générateur a bougé, revue humaine requise`);
    fs.writeFileSync(file, src.split(OLD).join(NEW), 'utf8');
    log('shareWithUTM : `};` objet corrigé (script de partage ressuscité)');
    ensureTest(wt, log);
    return { files: [TARGET, TEST_FILE], summary: 'script shareWithUTM reparé (pages SEO : boutons partage de nouveau fonctionnels)' };
  },
};

function ensureTest(wt, log) {
  const p = path.join(wt, TEST_FILE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) { fs.writeFileSync(p, TEST_SRC, 'utf8'); log('contrat ajouté : ' + TEST_FILE); }
}

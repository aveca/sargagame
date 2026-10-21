#!/usr/bin/env node
/**
 * Test de détection de mojibake (double-encodage UTF-8) dans les fichiers ES.
 * Vérifie qu'aucun caractère corrompu n'est présent dans les fichiers
 * espagnols du répertoire public/pro/es/.
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log('✅ ' + name);
  } catch (e) {
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
    console.log('❌ ' + name + ': ' + e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function findHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const MOJIBAKE_PATTERNS = [
  'Ã©', 'Ã¨', 'Ã­', 'Ã³', 'Ãº', 'Ã±', 'â€', 'Ã‰', 'Ãš', 'Ã‡', 'Â¡', 'Â¿'
];

const esDir = 'public/pro/es';
const esFiles = findHtmlFiles(esDir);

test('T1: Aucun fichier ES ne contient de mojibake (double-encodage UTF-8)', () => {
  const infected = [];
  for (const f of esFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const found = MOJIBAKE_PATTERNS.filter(p => content.includes(p));
    if (found.length > 0) {
      infected.push(f + ' → ' + found.join(', '));
    }
  }
  assert(infected.length === 0, 'Mojibake détecté dans: ' + infected.join('; '));
});

test('T2: Au moins un fichier ES existe pour test', () => {
  assert(esFiles.length > 0, 'Aucun fichier ES trouvé');
});

console.log('\n' + passed + ' tests passés, ' + failed + ' échoués');
process.exit(failed > 0 ? 1 : 0);

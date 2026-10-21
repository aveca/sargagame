'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../..');
const esDir = path.join(root, 'public', 'pro', 'es');
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile() && item.name.endsWith('.html')) files.push(full);
  }
}
if (fs.existsSync(esDir)) walk(esDir);

const markers = ['Ã©', 'Ã¨', 'Ã­', 'Ã³', 'Ãº', 'Ã±', 'â€', 'Ã‰', 'Ãš', 'Ã‡', 'Â¡', 'Â¿'];
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name + ': ' + error.message); process.exitCode = 1; }
}

test('les dix pages B2B espagnoles sont présentes', () => {
  assert.ok(files.length >= 10, `attendu au moins 10 fichiers HTML, trouvé ${files.length}`);
});
test('aucun marqueur mojibake, caractère de remplacement ou contrôle parasite', () => {
  const problems = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const found = markers.filter(marker => content.includes(marker));
    if (found.length) problems.push(`${path.relative(root, file)}: ${found.join(', ')}`);
    if (content.includes('\uFFFD')) problems.push(`${path.relative(root, file)}: U+FFFD`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content)) problems.push(`${path.relative(root, file)}: contrôle C0`);
  }
  assert.deepEqual(problems, []);
});
console.log(`es-encoding.test.cjs: ${passed}/2 tests passed`);

// Regression guard for absolute guarantees in the public hotel widget landing copy.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(
  path.join(ROOT, 'public', 'pro', 'widget-sargasses-hotel', 'index.html'),
  'utf8'
);

const card = html.match(/<div class="card"><div class="ic">⚡<\/div>([\s\S]*?)<\/div>/);
assert.ok(card, 'the widget maintenance card remains present');
assert.match(card[1], /<h3>Sans script à maintenir<\/h3>/);
assert.match(
  card[1],
  /aucun script tiers à charger sur votre page\. Le widget se met à jour automatiquement tant que le service est disponible\./
);
assert.doesNotMatch(card[1], /zéro risque|pour toujours/i);

console.log('WIDGET-LANDING-CLAIMS — 4 assertions passed');

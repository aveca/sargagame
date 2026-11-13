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

const lifetimeFreeClaim = /(?:et\s+restera\s+gratuit|ça\s+reste\s+gratuit|gratuit\s+à\s+vie|free\s+forever|free\s+for\s+life|will\s+remain\s+free)/i;
assert.doesNotMatch(html, lifetimeFreeClaim, 'the current free offer must not be presented as a lifetime guarantee');
assert.match(html, /Le widget est actuellement proposé gratuitement/, 'the current free offer remains explicit without a lifetime promise');
assert.match(html, /href="https:\/\/sargasses-martinique\.com\/pro\/pricing\/">Découvrir l’offre Pro<\/a>/, 'the Pro CTA routes to the canonical pricing page without choosing a price');
assert.doesNotMatch(html, /Passer en PRO[^<]*29\s*€/i, 'the widget landing no longer publishes the conflicting 29 EUR monthly price');
assert.doesNotMatch(html, /Widget%20PRO%20marque%20blanche/, 'the obsolete white-label mailto CTA is removed');

console.log('WIDGET-LANDING-CLAIMS — 9 assertions passed');

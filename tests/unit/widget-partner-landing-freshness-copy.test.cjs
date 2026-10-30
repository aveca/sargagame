#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const landing = fs.readFileSync(path.join(root, 'public/widget/index.html'), 'utf8');
const embed = fs.readFileSync(path.join(root, 'public/widget/embed/index.html'), 'utf8');
const hotels = fs.readFileSync(path.join(root, 'public/pro/hotels/index.html'), 'utf8');
const collectivites = fs.readFileSync(path.join(root, 'public/pro/collectivites/index.html'), 'utf8');


// Marketing copy must describe the same freshness gate that the embed actually enforces.
assert.doesNotMatch(
  landing,
  /en temps réel|en direct|4× par jour|4 fois par jour|pour toujours|zéro maintenance|gratuit et le restera/i,
  'the partner landing must not promise live status, a fixed cadence, or lifetime guarantees'
);
assert.match(landing, /dernière observation satellite disponible/i);
assert.match(landing, /le widget masque le verdict et la prévision/i);
assert.match(landing, /Données satellite par/);
assert.doesNotMatch(landing, /Conditions en direct par/i);

// B2B demo pages must not promise current/live data when their embedded observation can be stale.
for (const [name, page] of [['hotels', hotels], ['collectivites', collectivites]]) {
  assert.match(page, /Aperçu du widget/i, `${name} landing identifies the section as an example`);
  assert.match(page, /dernière observation/i, `${name} landing explains the observation timestamp`);
  assert.doesNotMatch(page, /Aperçu en direct|Données réelles,? en ce moment|Données réelles,? à l'instant|L'état d'une plage, en ce moment/i,
    `${name} landing must not claim the stale demo is live/current`);
}

// The embed uses the observation timestamp and hides its verdict/forecast when stale.
assert.match(embed, /isSatelliteFresh\(d\.erddapTimestamp\)/);
assert.match(embed, /if \(fresh && showFc && wk\.length\)/);
assert.match(embed, /\$\("fc"\)\.style\.display = "none"/);

// Preserve the existing partner setup and commercial route.
assert.match(landing, /rel="canonical"/);
assert.match(landing, /hreflang="fr"/);
assert.match(landing, /href="\/pro\/hotels\/"/);
assert.match(landing, /option value="fr"/);
assert.match(landing, /option value="en"/);
assert.match(landing, /option value="es"/);
assert.match(landing, /optgroup label="Martinique"/);
assert.match(landing, /optgroup label="Guadeloupe"/);
assert.match(landing, /function domain\(\).*sargasses-guadeloupe\.com/s);

console.log('WIDGET_PARTNER_LANDING_FRESHNESS_COPY PASS (23 assertions)');

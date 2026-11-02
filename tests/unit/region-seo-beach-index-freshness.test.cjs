#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildBeachIndexItems } = require('../../scripts/lib/region-seo-pages.cjs');

const now = Date.parse('2026-11-02T15:00:00Z');
const beaches = [
  { id: 'clean-beach', name: 'Miami Beach', slug: 'miami-beach', commune: 'Miami', lv: { status: 'clean', score: 75 } },
  { id: 'moderate-beach', name: 'South Beach', slug: 'south-beach', commune: 'Miami Beach', lv: { status: 'moderate', score: 62 } },
];

function payload(overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: new Date(now - 60 * 60_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    dataAgeMinutes: 1,
    stale: false,
    ...overrides,
  };
}

const freshHtml = buildBeachIndexItems(beaches, payload(), {
  lang: 'en',
  prefix: '',
  beachesDir: 'beaches',
  now,
});
assert.match(freshHtml, /href="\/beaches\/miami-beach\//);
assert.match(freshHtml, /href="\/beaches\/south-beach\//);
assert.match(freshHtml, /Miami Beach<\/a>/);
assert.match(freshHtml, /Clean · Beach Score 75\/100/);
assert.match(freshHtml, /Moderate · Beach Score 62\/100/);

// A fresh updatedAt and a small cached dataAgeMinutes must not override the
// scientific observation clock. At 901 minutes, names/links remain but decisions
// and scores are withheld from the server-rendered directory.
const staleHtml = buildBeachIndexItems(beaches, payload({
  erddapTimestamp: new Date(now - 901 * 60_000).toISOString(),
}), {
  lang: 'en',
  prefix: '',
  beachesDir: 'beaches',
  now,
});
assert.match(staleHtml, /href="\/beaches\/miami-beach\//);
assert.match(staleHtml, /href="\/beaches\/south-beach\//);
assert.match(staleHtml, /Status unavailable — decision paused until a fresh satellite observation is available/);
assert.doesNotMatch(staleHtml, /\b(?:Clean|Moderate|Avoid)\b|Beach Score \d+\/100/);

// The inclusive SLA boundary is deliberate: 899 minutes is publishable;
// exactly 900 minutes is delayed.
const underSla = buildBeachIndexItems(beaches, payload({
  erddapTimestamp: new Date(now - 899 * 60_000).toISOString(),
}), { lang: 'en', now });
assert.match(underSla, /Beach Score 75\/100/);
const atSla = buildBeachIndexItems(beaches, payload({
  erddapTimestamp: new Date(now - 900 * 60_000).toISOString(),
}), { lang: 'en', now });
assert.doesNotMatch(atSla, /Beach Score \d+\/100|\bClean\b|\bModerate\b/);
assert.match(atSla, /Status unavailable/);

// Spanish routes and copy remain localized; no stale status/score leaks.
const staleEs = buildBeachIndexItems(beaches, payload({
  erddapTimestamp: new Date(now - 48 * 60 * 60_000).toISOString(),
}), {
  lang: 'es',
  prefix: '/es',
  beachesDir: 'playas',
  now,
});
assert.match(staleEs, /href="\/es\/playas\/miami-beach\//);
assert.match(staleEs, /No disponible — decisión suspendida/);
assert.doesNotMatch(staleEs, /\b(?:Limpia|Moderada|Evitar)\b|Beach Score \d+\/100/);

// Unknown, future, and explicit stale sources all fail closed.
for (const invalid of [
  payload({ source: 'reference' }),
  payload({ erddapTimestamp: new Date(now + 60_000).toISOString() }),
  payload({ stale: true }),
]) {
  const html = buildBeachIndexItems(beaches, invalid, { lang: 'en', now });
  assert.match(html, /Status unavailable/);
  assert.doesNotMatch(html, /Beach Score \d+\/100|\bClean\b|\bModerate\b/);
}

const generator = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/lib/region-seo-pages.cjs'),
  'utf8',
);
assert.match(generator, /buildBeachIndexItems\(beaches, data/);
assert.match(generator, /formatSatelliteObservationLabel\(data, lang, now\)/);

console.log('REGION_SEO_BEACH_INDEX_FRESHNESS PASS');

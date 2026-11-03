#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  communeSeoList,
  communeNoscripts,
} = require('../../scripts/lib/commune-seo-pages.cjs');

const beaches = [
  { id: 'mq-test-1', name: 'Plage du Carbet', commune: 'Le Carbet', island: 'mq' },
  { id: 'gp-test-1', name: 'Plage du Souffleur', commune: 'Port-Louis', island: 'gp' },
];

const pages = communeSeoList(beaches);
const noscripts = communeNoscripts(beaches);
const forbiddenClaims = /en temps réel|temps réel|en direct|plusieurs fois par jour|prévision(?:s)?\s+7\s+jours|real[- ]time|live\s+(?:map|status|data)|four times a day|updated live|refreshed daily/i;

assert.equal(pages.length, 2, 'one generated commune page per island');
assert.ok(noscripts['sargasses-le-carbet'], 'Martinique no-JS content is generated');
assert.ok(noscripts['sargasses-port-louis'], 'Guadeloupe no-JS content is generated');

for (const page of pages) {
  assert.match(page.title, /dernières observations/i, page.path + ': title describes published observations');
  assert.match(page.desc, /observations satellite horodatées/i, page.path + ': description promises timestamped observations');
  assert.match(page.desc, /statut actuel uniquement si la mesure est assez récente/i, page.path + ': description makes current status conditional on freshness');
  assert.ok(page.desc.length <= 158, page.path + ': meta description stays within the existing 158-character limit');
  assert.doesNotMatch(page.title + '\n' + page.desc, forbiddenClaims, page.path + ': no unsupported live/cadence/7-day promise');
}

for (const [path, html] of Object.entries(noscripts)) {
  assert.match(html, /dernière observation satellite publiée/i, path + ': latest published observation is explicit');
  assert.match(html, /horodatage/i, path + ': observation timestamp is explicit');
  assert.match(html, /statut actuel n'est affiché que si la mesure est suffisamment récente/i, path + ': current status is freshness-gated');
  assert.match(html, /aucun verdict actuel n'est présenté/i, path + ': delayed/unavailable source fails closed');
  assert.match(html, /tendances disponibles/i, path + ': forecasts are conditional rather than guaranteed');
  assert.doesNotMatch(html, forbiddenClaims, path + ': no unsupported live/cadence/7-day promise');
  assert.match(html, /href="\/carte-sargasses\//, path + ': map route is preserved');
  assert.match(html, /href="\/previsions\//, path + ': trends route is preserved');
  assert.match(html, /href="\/alertes\//, path + ': alerts route is preserved');
}

const mq = noscripts['sargasses-le-carbet'];
const gp = noscripts['sargasses-port-louis'];
assert.match(mq, /href="\/saison-sargasses-martinique\//, 'Martinique season route stays regional');
assert.match(mq, /href="\/meilleures-plages-martinique-sargasses\//, 'Martinique best-beaches route stays regional');
assert.match(mq, /href="\/plages\/plage-du-carbet\//, 'Martinique beach link is preserved');
assert.doesNotMatch(mq, /saison-sargasses-guadeloupe|meilleures-plages-guadeloupe/, 'Martinique copy does not link to Guadeloupe-only routes');
assert.match(gp, /href="\/saison-sargasses-guadeloupe\//, 'Guadeloupe season route stays regional');
assert.match(gp, /href="\/meilleures-plages-guadeloupe-sargasses\//, 'Guadeloupe best-beaches route stays regional');
assert.match(gp, /href="\/plages\/plage-du-souffleur\//, 'Guadeloupe beach link is preserved');
assert.doesNotMatch(gp, /saison-sargasses-martinique|meilleures-plages-martinique/, 'Guadeloupe copy does not link to Martinique-only routes');

console.log('COMMUNE_SEO_FRESHNESS_COPY PASS (MQ + GP)');

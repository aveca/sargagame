#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderCleanBeachIndex } = require('../../scripts/lib/seo-clean-beach-index.cjs');

const root = path.resolve(__dirname, '../..');
const viteConfig = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
const now = Date.parse('2026-11-01T14:40:00.000Z');
const beaches = [
  { id: 'mq-beach', name: 'Anse Mitan', commune: 'Les Trois-Îlets', island: 'mq' },
  { id: 'gp-beach', name: 'Malendure', commune: 'Bouillante', island: 'gp' },
];
const beachToSarg = { 'mq-beach': 'mq001', 'gp-beach': 'gp001' };
const slugify = value => String(value).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

function payload(overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: new Date(now - 60 * 60_000).toISOString(),
    updatedAt: new Date(now).toISOString(),
    dataAgeMinutes: 1,
    stale: false,
    levels: [
      { id: 'mq001', status: 'clean', score: 82 },
      { id: 'gp001', status: 'clean', score: 88 },
    ],
    ...overrides,
  };
}

function render(input) {
  return renderCleanBeachIndex({
    payload: input,
    beaches,
    beachToSarg,
    slugify,
    now,
  });
}

// Fresh ERDDAP timestamp authorizes the actual list; stale publication metadata
// cannot override the scientific observation clock.
const freshHtml = render(payload({
  erddapTimestamp: new Date(now - 900 * 60_000).toISOString(),
  updatedAt: new Date(now).toISOString(),
  dataAgeMinutes: 999999,
}));
assert.match(freshHtml, /Dernière observation satellite/);
assert.match(freshHtml, /Anse Mitan/);
assert.match(freshHtml, /Malendure/);
assert.match(freshHtml, /score 82\/100/);
assert.match(freshHtml, /score 88\/100/);

// At 901 minutes, a recent updatedAt/dataAgeMinutes must not publish verdicts.
const staleHtml = render(payload({
  erddapTimestamp: new Date(now - 901 * 60_000).toISOString(),
  updatedAt: new Date(now).toISOString(),
  dataAgeMinutes: 1,
}));
assert.match(staleHtml, /Observation satellite en retard/);
assert.match(staleHtml, /sélection des plages propres est suspendue/);
assert.doesNotMatch(staleHtml, /Anse Mitan|Malendure|score 82\/100|score 88\/100/);

// Non-live, missing, invalid, future, and explicit stale states all fail closed.
for (const [label, overrides] of [
  ['non-live source', { source: 'reference' }],
  ['missing timestamp', { erddapTimestamp: null }],
  ['invalid timestamp', { erddapTimestamp: 'not-a-date' }],
  ['future timestamp', { erddapTimestamp: new Date(now + 60_000).toISOString() }],
  ['explicit stale flag', { stale: true }],
]) {
  const html = render(payload(overrides));
  assert.match(html, /suspendue/, label);
  assert.doesNotMatch(html, /Anse Mitan|Malendure|score 82\/100|score 88\/100/, label);
}

// The Vite route must use the tested renderer, not its former inline stale list.
const start = viteConfig.indexOf("'plages-sans-sargasses': (() => {");
const end = viteConfig.indexOf("'danger-sargasses-h2s':", start);
assert.ok(start >= 0 && end > start, 'plages-sans-sargasses generator block remains present');
const pageBlock = viteConfig.slice(start, end);
assert.match(pageBlock, /renderCleanBeachIndex/);
assert.doesNotMatch(pageBlock, /surveille en temps réel|plages propres aujourd'hui|aujourd'hui, <strong>/i);

for (const copy of [
  'Dernière observation satellite disponible pour la Martinique et la Guadeloupe.',
  'Latest available satellite observation for Martinique and Guadeloupe.',
  'Última observación satelital disponible para Martinica y Guadalupe.',
]) {
  assert.ok(viteConfig.includes(copy), 'localized metadata copy preserved: ' + copy);
}

console.log('SEO_CLEAN_BEACH_INDEX_FRESHNESS PASS');

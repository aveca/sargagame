#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const config = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');

const metaLine = config.split(/\r?\n/).find(line => line.includes("path: 'saison-sargasses-guadeloupe'"));
assert.ok(metaLine, 'Guadeloupe season route remains registered');
assert.match(metaLine, /path: 'saison-sargasses-guadeloupe', enPath: null/, 'Guadeloupe season remains a French-only regional route');
assert.match(metaLine, /title: 'Saison des sargasses en Guadeloupe 2026 — Quand et où \?'/, 'existing SEO title is preserved');

const description = (metaLine.match(/desc: '([^']*)'/) || [])[1];
assert.ok(description, 'Guadeloupe season meta description is present');
assert.ok(description.length <= 158, 'meta description stays within the existing 158-character limit');
assert.match(description, /avril à octobre/i, 'description retains the seasonal window');
assert.match(description, /mai à août/i, 'description retains the commonly observed peak period');

const marker = "            'saison-sargasses-guadeloupe': `<article>";
const start = config.indexOf(marker);
assert.notEqual(start, -1, 'Guadeloupe season editorial article remains in the build source');
const endToken = '</article>`,';
const end = config.indexOf(endToken, start);
assert.notEqual(end, -1, 'Guadeloupe season editorial article is complete');
const article = config.slice(start, end + endToken.length);

const unsupportedClaims = /en temps réel|carte en temps réel|en direct|real[- ]time|prévisions?\s+7\s+jours|4\s+fois par jour|mise à jour quotidienne|90\s*%|quasi garantie|quasi épargnée|année à haut risque/i;
assert.doesNotMatch(metaLine + '\n' + article, unsupportedClaims, 'season page must not promise live data, fixed cadence, 7-day forecasts or guaranteed clean beaches');

assert.match(article, /saison des échouages s'étend généralement d'avril à octobre/i, 'seasonality remains explicit');
assert.match(article, /pic souvent observé entre mai et août/i, 'peak period remains explicit');
assert.match(article, /dernière observation publiée et son horodatage/i, 'decision-making points to a dated observation');
assert.match(article, /aucun verdict actuel n'est confirmé/i, 'missing or stale observations are not presented as current');
assert.match(article, /considérez l'état comme non vérifié/i, 'stale or missing observation fails closed');
assert.match(article, /Ces différences décrivent une exposition géographique, pas un état garanti/i, 'geographic exposure is not represented as a beach-state guarantee');

for (const route of [
  '/carte-sargasses/',
  '/previsions/',
  '/alertes/',
  '/meilleures-plages-guadeloupe-sargasses/',
  '/sargasses-record-2026/',
  '/danger-sargasses-h2s/',
]) {
  assert.ok(article.includes('href="' + route + '"'), 'existing regional navigation route is preserved: ' + route);
}

for (const month of ['Novembre – Février', 'Mars', 'Avril', 'Mai – Juin', 'Juillet – Août', 'Septembre – Octobre']) {
  assert.ok(article.includes(month), 'month-by-month calendar remains complete: ' + month);
}

console.log('GUADELOUPE_SEASON_FRESHNESS_COPY PASS');

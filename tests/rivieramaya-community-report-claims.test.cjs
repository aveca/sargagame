#!/usr/bin/env node
'use strict';

// Riviera Maya / Cancún uses the regional satellite pipeline. The documented
// community-report adjustment is limited to MQ/GP, so public SEO copy must not
// promise that beachgoer reports correct or fill gaps in this region's readings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const parse = (p) => JSON.parse(read(p));
const es = parse('regions/seo-content/rivieramaya.json');
const en = parse('regions/seo-content/rivieramaya.en.json');
const region = parse('regions/rivieramaya.json');
const pipeline = read('docs/DATA-PIPELINE.md');

assert.equal(region.domain, 'sargassumcancun.com');
assert.equal(region.primaryLang, 'es');
assert.deepEqual(region.secondaryLangs, ['en']);
assert.ok(
  pipeline.includes('Community reports agrégés (fenêtre 48 h)') &&
    pipeline.includes('(MQ/GP seulement)'),
  'Documented community-report adjustment scope should remain MQ/GP only'
);

const esText = JSON.stringify(es);
const enText = JSON.stringify(en);
assert.doesNotMatch(
  esText,
  /reportes de bañistas en la playa corrigen|reportes de la comunidad corrigen al satélite|reportes de gente que está parada en la arena|reportes de bañistas en la arena corrigen/i,
  'Spanish Riviera Maya copy must not claim community reports correct satellite readings'
);
assert.doesNotMatch(
  enText,
  /reports from people on the beach fill in what clouds can hide|community reports correct the satellite|reports from people standing on the sand right now|reports from people standing on the beach correct the satellite/i,
  'English Riviera Maya copy must not claim community reports correct satellite readings'
);

assert.match(es.faq[2].a, /no corregimos la observación satelital con reportes de bañistas en esta región/i);
assert.match(es.pages.forecast.method, /en lugar de atribuir una corrección a reportes comunitarios/i);
assert.match(en.faq[2].a, /beachgoer reports are not used to correct satellite observations for this region/i);
assert.match(en.pages.forecast.method, /instead of claiming a correction from community reports/i);

console.log('✓ Riviera Maya: unsupported community-report claims removed (ES/EN)');

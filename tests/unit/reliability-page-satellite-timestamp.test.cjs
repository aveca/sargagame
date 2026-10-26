#!/usr/bin/env node
'use strict';

/**
 * /fiabilite/ labels the satellite observation, not the pipeline/build time.
 * updatedAt is pipeline metadata; erddapTimestamp is the observation timestamp.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'scripts', 'lib', 'reliability-page.cjs'), 'utf8');

const sectionStart = src.indexOf('function freshnessSection(lang, data, slug) {');
assert.ok(sectionStart >= 0, 'freshnessSection must exist');
// Frontière robuste : la prochaine fonction de premier niveau après
// freshnessSection, quelle que soit la forme des lignes vides.
const sectionEnd = src.indexOf('function renderPage', sectionStart);
assert.ok(sectionEnd > sectionStart, 'freshnessSection boundaries must be found');
const section = src.slice(sectionStart, sectionEnd);

assert.ok(section.includes('data.erddapTimestamp'), 'static page must use the satellite observation timestamp');
assert.ok(section.includes('Number.isFinite(Date.parse(satelliteISO))'), 'invalid/missing satellite timestamp must be rejected');
assert.ok(!section.includes('data.updatedAt'), 'pipeline update time must not be presented as satellite time');
assert.ok(section.includes('data-iso="${esc(satelliteISO)}"'), 'initial DOM timestamp must be the observation time');
assert.ok(section.includes('fmtDateTimeUTC(lang, satelliteISO)'), 'displayed date must use the observation time');

const refreshStart = src.indexOf('// Refresh client :');
assert.ok(refreshStart >= 0, 'client refresh block must exist');
const variantIndex = src.indexOf('var VARIANT =', refreshStart);
assert.ok(variantIndex > refreshStart, 'client refresh block boundary must be found');
const refresh = src.slice(refreshStart, variantIndex);

assert.ok(refresh.includes('d&&d.erddapTimestamp'), 'live refresh must read erddapTimestamp');
assert.ok(refresh.includes('Number.isFinite(Date.parse(d.erddapTimestamp))'), 'live refresh must reject invalid timestamps');
assert.ok(refresh.includes('show(d.erddapTimestamp)'), 'relative age must use the satellite observation time');
assert.ok(!refresh.includes('d.updatedAt'), 'client must not replace satellite time with pipeline time');

console.log('RELIABILITY_PAGE_SATELLITE_TIMESTAMP_TESTS PASS (13 assertions)');

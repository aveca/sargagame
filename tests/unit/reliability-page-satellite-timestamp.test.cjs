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


const unsupportedClaims = [
  /4 passages par jour/i,
  /4 passes a day/i,
  /4 pasadas al día/i,
  /recalculée à chaque passage satellite/i,
  /recomputed at every satellite pass/i,
  /recalcula en cada pasada satelital/i,
  /revalidée 4 fois par jour/i,
  /re-checked 4 times a day/i,
  /verificado 4 veces al día/i,
  /carte en direct/i,
  /see the live map/i,
  /mapa en vivo/i,
  /carte en temps réel/i,
  /regenerated with every update/i,
  /se regenera con cada actualización/i,
  /régénérée à chaque mise à jour/i,
  /chaque jour, la prévision de la veille/i,
  /Every day, yesterday’s forecast/i,
  /Cada día, el pronóstico de ayer/i,
  /Un backtest automatique, tous les jours/i,
  /An automatic backtest, every single day/i,
  /Un backtest automático, todos los días/i,
];
for (const pattern of unsupportedClaims) {
  assert.doesNotMatch(src, pattern, `reliability page must not promise an unsupported freshness cadence: ${pattern}`);
}
assert.ok(src.includes('les prévisions archivées sont comparées aux observations satellite disponibles'), 'French method copy must describe available observations without a daily guarantee');
assert.ok(src.includes('Archived forecasts are compared with the satellite observations available'), 'English method copy must describe available observations without a daily guarantee');
assert.ok(src.includes('Los pronósticos archivados se comparan con las observaciones satelitales disponibles'), 'Spanish method copy must describe available observations without a daily guarantee');
assert.ok(src.includes('horodatage de l\'observation satellite affiché ci-dessus'), 'French freshness copy must point to the displayed observation timestamp');
assert.ok(src.includes('the satellite observation timestamp is shown above'), 'English freshness copy must point to the displayed observation timestamp');
assert.ok(src.includes('la hora de la observación satelital se muestra arriba'), 'Spanish freshness copy must point to the displayed observation timestamp');
assert.ok(src.includes('Voir la carte des plages →') && src.includes('See the beach map →') && src.includes('Ver el mapa de playas →'), 'all localized CTAs must avoid an unsupported live-map promise');

console.log('RELIABILITY_PAGE_SATELLITE_TIMESTAMP_TESTS PASS (freshness and localized copy)');

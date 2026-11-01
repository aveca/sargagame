'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SATELLITE_SLA_MS, WEATHER_SLA_MS, evaluateConditionsFreshness } = require('../../scripts/lib/conditions-freshness.cjs');

const root = path.resolve(__dirname, '../..');
const vite = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8');
const now = Date.parse('2026-11-01T04:07:23.000Z');
const atAge = (minutes) => new Date(now - minutes * 60_000).toISOString();
const satellite = (ageMinutes, extra = {}) => ({ source: 'erddap-live', erddapTimestamp: atAge(ageMinutes), updatedAt: atAge(0), dataAgeMinutes: 0, stale: false, ...extra });

assert.equal(SATELLITE_SLA_MS, 900 * 60_000);
assert.equal(WEATHER_SLA_MS, 12 * 60 * 60_000);
const exactBoundary = evaluateConditionsFreshness(satellite(900), atAge(720), now);
assert.equal(exactBoundary.satelliteFresh, true, 'exactly 900 minutes remains within the operational SLA');
assert.equal(exactBoundary.weatherFresh, true, 'exactly 12 hours remains within the weather freshness window');
assert.equal(exactBoundary.selectionFresh, true, 'both independent sources must be fresh');
assert.match(exactBoundary.satelliteLabel, /Dernière observation satellite/);
assert.match(exactBoundary.weatherLabel, /mise à jour météo marine/);

const oneMillisecondLate = evaluateConditionsFreshness({ ...satellite(900), erddapTimestamp: new Date(now - 900 * 60_000 - 1).toISOString() }, atAge(60), now);
assert.equal(oneMillisecondLate.satelliteFresh, false, 'one millisecond beyond 900 minutes suspends the selection');
assert.equal(oneMillisecondLate.selectionFresh, false);
assert.match(oneMillisecondLate.satelliteLabel, /en retard/);

const republishedButOld = evaluateConditionsFreshness(satellite(901), atAge(10), now);
assert.equal(republishedButOld.satelliteFresh, false, 'recent updatedAt and dataAgeMinutes cannot override an old ERDDAP observation');
assert.equal(republishedButOld.selectionFresh, false);

for (const [label, payload] of [
  ['missing payload', null],
  ['missing timestamp', { source: 'erddap-live' }],
  ['invalid timestamp', { source: 'erddap-live', erddapTimestamp: 'not-a-date' }],
  ['future timestamp', { source: 'erddap-live', erddapTimestamp: atAge(-1) }],
  ['non-live source', { source: 'reference', erddapTimestamp: atAge(1) }],
  ['explicit stale flag', { ...satellite(1), stale: true }],
]) assert.equal(evaluateConditionsFreshness(payload, atAge(1), now).satelliteFresh, false, label + ' must fail closed');

assert.equal(evaluateConditionsFreshness(satellite(1), atAge(721), now).weatherFresh, false, 'weather older than 12 hours is rejected');
assert.equal(evaluateConditionsFreshness(satellite(1), atAge(-1), now).weatherFresh, false, 'future weather timestamp is rejected');
assert.equal(evaluateConditionsFreshness(satellite(1), null, now).weatherFresh, false, 'missing weather timestamp is rejected');
assert.equal(evaluateConditionsFreshness(satellite(1), atAge(1), Number.NaN).selectionFresh, false, 'invalid build clock fails closed');
const weatherOnlyStale = evaluateConditionsFreshness(satellite(1), atAge(721), now);
assert.equal(weatherOnlyStale.satelliteFresh, true);
assert.equal(weatherOnlyStale.selectionFresh, false, 'fresh satellite cannot mask stale weather');

assert.ok(vite.includes("const { evaluateConditionsFreshness } = _require('./scripts/lib/conditions-freshness.cjs')"));
assert.ok(vite.includes('const isConditionsFresh = conditionsFreshness.selectionFresh'));
assert.ok(vite.includes('const matching = !isConditionsFresh ? [] : enrichedBeaches'));
assert.ok(vite.includes('conditionsFreshness.satelliteLabel'));
assert.ok(vite.includes('conditionsFreshness.weatherLabel'));
assert.ok(vite.includes('Sélection suspendue'));
assert.ok(vite.includes('pageResultsHeading'));
assert.ok(vite.includes('rel="canonical"'), 'condition-page canonical generation remains present');
assert.ok(vite.includes('const condSitemapEntry ='), 'condition-page sitemap generation remains present');
assert.ok(!vite.includes('Données rafraîchies il y a '), 'ambiguous combined-source freshness copy is removed');
assert.ok(vite.includes('Les dates des deux sources sont affichées séparément'), 'hub explains independent source timestamps');

console.log('CONDITIONS_PAGE_FRESHNESS PASS');

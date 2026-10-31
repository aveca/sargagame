'use strict';

const assert = require('node:assert/strict');
const {
  buildHotelLandingFr,
  getSatelliteFreshness,
} = require('../../scripts/lib/hotel-landing-fr.cjs');

const now = Date.parse('2026-10-26T12:00:00.000Z');

assert.deepEqual(
  getSatelliteFreshness('2026-10-26T11:00:00.000Z', now),
  { status: 'fresh', ageLabel: 'il y a 1 h' },
  'fraîcheur calculée depuis l’observation satellite'
);
assert.equal(
  getSatelliteFreshness('2026-10-25T00:00:00.000Z', now).status,
  'fresh',
  'la borne de 36 h reste fraîche'
);
assert.equal(
  getSatelliteFreshness('2026-10-24T23:00:00.000Z', now).status,
  'stale',
  'une observation de 37 h est périmée'
);
assert.equal(
  getSatelliteFreshness('invalid-date', now).status,
  'unknown',
  'un timestamp invalide ne peut pas être déclaré frais'
);
assert.equal(
  getSatelliteFreshness('2026-10-26T13:00:00.000Z', now).status,
  'unknown',
  'un timestamp futur ne peut pas être déclaré frais'
);

const base = {
  islandId: 'mq',
  islandName: 'Martinique',
  domain: 'sargasses-martinique.com',
  coverage: [],
  reliability: null,
  updatedRel: '',
  freshnessStatus: 'unknown',
};
const render = (overrides = {}) => buildHotelLandingFr({ ...base, ...overrides });

const unknownHtml = render({
  coverage: [{ name: 'Plage test', status: 'clean', score: 88 }],
  freshnessStatus: 'unknown',
});
assert.match(unknownHtml, /Fraîcheur satellite inconnue/);
assert.match(unknownHtml, /À vérifier/);
assert.doesNotMatch(unknownHtml, /score 88\/100/);
assert.doesNotMatch(unknownHtml, /autour de 77\s*%/);
assert.doesNotMatch(unknownHtml, /tous régimes confondus/i);
assert.match(unknownHtml, /Aucun taux de fiabilité n’est affiché/);

const staleHtml = render({
  coverage: [{ name: 'Plage test', status: 'clean', score: 88 }],
  freshnessStatus: 'stale',
  updatedRel: 'il y a 40 h',
});
assert.match(staleHtml, /Observation satellite ancienne · il y a 40 h/);
assert.match(staleHtml, /Observation satellite trop ancienne/);
assert.match(staleHtml, /À vérifier/);
assert.doesNotMatch(staleHtml, /score 88\/100/);

const missingStatusHtml = render({
  coverage: [{ name: 'Plage sans statut', score: 88 }],
  freshnessStatus: 'fresh',
});
assert.match(missingStatusHtml, /Plage sans statut/);
assert.match(missingStatusHtml, /À vérifier/);
assert.doesNotMatch(missingStatusHtml, /score 88\/100/);

const measuredHtml = render({
  freshnessStatus: 'fresh',
  updatedRel: 'il y a 2 h',
  coverage: [{ name: 'Plage test', status: 'clean', score: 88 }],
  reliability: {
    overallPct: 98,
    calmPct: 100,
    calmSamples: 1050,
    calmAlertPct: 0,
    calmAlertSamples: 21,
    from: '2026-10-08',
    to: '2026-10-21',
  },
});
assert.match(measuredHtml, /100% des prévisions « mer propre » se sont vérifiées/);
assert.match(measuredHtml, /1[\s\u202f]050 cas/);
assert.match(measuredHtml, /0%<\/b> sur 21 cas/);
assert.doesNotMatch(measuredHtml, /98\s*%/);
assert.doesNotMatch(measuredHtml, /77\s*%/);
assert.match(measuredHtml, /Propre · score 88\/100/);
assert.match(measuredHtml, /class="fresh fresh"/);
assert.doesNotMatch(measuredHtml, /Données satellite Copernicus · il y a 2 h · il y a 2 h/);

console.log('OK — fraîcheur satellite, statuts inconnus et fiabilité par régime');
console.log('OK — aucune valeur de secours ni précision globale non étayée');

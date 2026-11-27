'use strict';

const assert = require('node:assert/strict');
const {
  buildHotelLandingFr,
  getSatelliteFreshness,
} = require('../../scripts/lib/hotel-landing-fr.cjs');

const now = Date.parse('2026-10-26T12:00:00.000Z');
const timestampAtAge = (minutes) => new Date(now - minutes * 60_000).toISOString();
const statusAtAge = (minutes) => getSatelliteFreshness(timestampAtAge(minutes), now).status;

assert.deepEqual(
  getSatelliteFreshness(timestampAtAge(60), now),
  { status: 'fresh', ageLabel: 'il y a 1 h' },
  'fraîcheur calculée depuis erddapTimestamp'
);
assert.equal(statusAtAge(899), 'fresh', '899 minutes restent dans le SLA');
assert.equal(statusAtAge(900), 'fresh', 'la borne exacte de 900 minutes est admissible');
assert.equal(statusAtAge(901), 'stale', '901 minutes dépassent le SLA');
assert.equal(statusAtAge(1080), 'stale', '18 heures dépassent le SLA');
assert.equal(statusAtAge(2160), 'stale', '36 heures dépassent le SLA');
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
assert.equal(
  getSatelliteFreshness({ source: 'fallback', erddapTimestamp: timestampAtAge(60) }, now).status,
  'unknown',
  'une source non-live ne peut pas être déclarée fraîche'
);
assert.equal(
  getSatelliteFreshness({ source: 'erddap-live', erddapTimestamp: timestampAtAge(60) }, now).status,
  'fresh',
  'la source ERDDAP live utilise le contrat de fraîcheur partagé'
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
assert.doesNotMatch(unknownHtml, /quatre fois par jour|4×\/jour|chaque matin|en direct/i);

const smallSampleHtml = render({
  freshnessStatus: 'fresh',
  reliability: {
    calmPct: 100,
    calmSamples: 19,
    calmAlertPct: 0,
    calmAlertSamples: 19,
    from: '2026-10-08',
    to: '2026-10-21',
  },
});
const smallSampleRelStart = smallSampleHtml.indexOf('<div class="rel">');
const smallSampleRelEnd = smallSampleHtml.indexOf('</div>', smallSampleRelStart);
assert.ok(smallSampleRelStart >= 0 && smallSampleRelEnd > smallSampleRelStart, 'reliability block is present');
const smallSampleRel = smallSampleHtml.slice(smallSampleRelStart, smallSampleRelEnd);
assert.match(smallSampleRel, /Aucun taux de fiabilité n’est affiché/);
assert.doesNotMatch(smallSampleRel, /100%|0%/);

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
    calmSamples: 20,
    calmAlertPct: 0,
    calmAlertSamples: 19,
    from: '2026-10-08',
    to: '2026-10-21',
  },
});
assert.match(measuredHtml, /100% des prévisions « mer propre » se sont vérifiées/);
assert.match(measuredHtml, /20 cas/);
assert.doesNotMatch(measuredHtml, /0%<\/b>/);
assert.doesNotMatch(measuredHtml, /98\s*%/);
assert.doesNotMatch(measuredHtml, /77\s*%/);
assert.match(measuredHtml, /Propre · score 88\/100/);
assert.match(measuredHtml, /class="fresh fresh"/);
assert.doesNotMatch(measuredHtml, /Données satellite Copernicus · il y a 2 h · il y a 2 h/);
assert.doesNotMatch(measuredHtml, /quatre fois par jour|4×\/jour|chaque matin|en direct/i);
assert.match(measuredHtml, /rel="canonical" href="https:\/\/sargasses-martinique\.com\/sargasses-pour-hotels\//);
assert.match(measuredHtml, /79 €\/mois ou 690 €\/an/);
assert.match(measuredHtml, /utm_campaign=b2b_hotels_fr_mq/);
const metaDescription = measuredHtml.match(/<meta name="description" content="([^"]+)"/);
assert.ok(metaDescription, 'meta description is present');
assert.ok(metaDescription[1].length <= 155, 'meta description stays within the SERP length budget');

const alertMetricHtml = render({
  freshnessStatus: 'fresh',
  reliability: {
    calmPct: 100,
    calmSamples: 20,
    calmAlertPct: 0,
    calmAlertSamples: 20,
    from: '2026-10-08',
    to: '2026-10-21',
  },
});
assert.match(alertMetricHtml, /0%<\/b> sur 20 cas/);

console.log('OK — SLA scientifique 900 min : 899/900 frais, 901/1080/2160 périmés');
console.log('OK — échantillon minimum de 20 pour publier les taux de fiabilité');
console.log('OK — aucune promesse fixe de cadence ou de temps réel');
console.log('OK — canonicals, prix EUR et attribution CTA conservés');

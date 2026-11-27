'use strict';

const assert = require('node:assert/strict');
const { STATUSES, classifyPublicationStatus } = require('../../scripts/lib/copernicus-publication-status.cjs');

const base = {
  gateStatus: 'PASS',
  erddapOutcome: 'success',
  source: 'erddap-live',
  gateOutcome: 'success',
  publishOutcome: 'success',
  publishChanged: true,
};

const cases = [
  ['fresh data committed', base, STATUSES.FRESH_AND_PUBLISHED],
  ['stale gate wins even if marker commit changed files', { ...base, gateStatus: STATUSES.BLOCKED_STALE_SOURCE }, STATUSES.BLOCKED_STALE_SOURCE],
  ['fetch failure fails closed', { ...base, erddapOutcome: 'failure' }, STATUSES.FAILED_VALIDATION],
  ['unknown source fails closed', { ...base, source: 'reference-fallback' }, STATUSES.FAILED_VALIDATION],
  ['missing source fails closed', { ...base, source: undefined }, STATUSES.FAILED_VALIDATION],
  ['missing source fails closed', { ...base, source: 'none' }, STATUSES.FAILED_VALIDATION],
  ['gate validation failure fails closed', { ...base, gateOutcome: 'failure', gateStatus: 'FAILED_VALIDATION' }, STATUSES.FAILED_VALIDATION],
  ['push failure is explicit', { ...base, publishOutcome: 'failure' }, STATUSES.FAILED_PUBLISH],
  ['skipped publish is not reported as a fresh publication', { ...base, publishOutcome: 'skipped', publishChanged: null }, STATUSES.NO_NEW_OBSERVATION],
  ['successful no-op commit step is not reported as a publication', { ...base, publishChanged: false }, STATUSES.NO_NEW_OBSERVATION],
  ['missing change signal fails closed', { ...base, publishChanged: null }, STATUSES.FAILED_VALIDATION],
  ['unknown publish outcome fails closed', { ...base, publishOutcome: undefined }, STATUSES.FAILED_VALIDATION],
];

for (const [name, input, expected] of cases) {
  assert.equal(classifyPublicationStatus(input), expected, name);
}
console.log('COPERNICUS_PUBLICATION_STATUS_CLASSIFIER PASS (' + cases.length + ' cases)');

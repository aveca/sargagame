'use strict';

const assert = require('node:assert/strict');
const { STATUSES, classifyPublicationStatus } = require('../../scripts/lib/copernicus-publication-status.cjs');

const nowMs = Date.parse('2026-11-04T04:15:00.000Z');
const sourceTimestamp = '2026-11-03T12:00:00.000Z';
const base = {
  gateStatus: 'PASS',
  erddapOutcome: 'success',
  source: 'erddap-live',
  gateOutcome: 'success',
  publishOutcome: 'success',
  publishChanged: true,
  sourceTimestamp: '2026-11-04T04:00:00.000Z',
  previousSourceTimestamp: '2026-11-03T12:00:00.000Z',
  nowMs,
};

const cases = [
  ['fresh data committed is published, not yet called deployed', base, STATUSES.PUBLISHED],
  ['NOAA observation older than the strict 900-minute SLA is delayed', {
    ...base, sourceTimestamp, gateStatus: 'BLOCKED_STALE_SOURCE',
  }, STATUSES.SOURCE_DELAYED],
  ['an observation exactly at 900 minutes is within the inclusive SLA boundary', {
    ...base, sourceTimestamp: '2026-11-03T13:15:00.000Z', nowMs,
  }, STATUSES.PUBLISHED],
  ['ERDDAP request timeout is reported as a fetch failure', { ...base, erddapOutcome: 'failure', erddapFailureKind: 'FETCH_FAILED' }, STATUSES.FETCH_FAILED],
  ['empty or malformed ERDDAP response is reported as validation failure', { ...base, erddapOutcome: 'failure', erddapFailureKind: 'VALIDATION_FAILED' }, STATUSES.VALIDATION_FAILED],
  ['empty source is a validation failure', { ...base, source: 'none' }, STATUSES.VALIDATION_FAILED],
  ['unknown source fails closed', { ...base, source: 'reference-fallback' }, STATUSES.VALIDATION_FAILED],
  ['missing timestamp fails closed', { ...base, sourceTimestamp: null }, STATUSES.VALIDATION_FAILED],
  ['invalid timestamp fails closed', { ...base, sourceTimestamp: 'not-a-date' }, STATUSES.VALIDATION_FAILED],
  ['future timestamp fails closed', { ...base, sourceTimestamp: '2026-11-04T04:16:00.000Z' }, STATUSES.VALIDATION_FAILED],
  ['failed integrity gate is a validation failure', { ...base, gateOutcome: 'failure', gateStatus: 'FAILED_VALIDATION' }, STATUSES.VALIDATION_FAILED],
  ['failed publication is reported explicitly', { ...base, publishOutcome: 'failure' }, STATUSES.PUBLISH_FAILED],
  ['skipped publication after valid data is not claimed as published', { ...base, publishOutcome: 'skipped' }, STATUSES.VALIDATION_FAILED],
  ['repeated observation with no committed payload change is explicit', {
    ...base, sourceTimestamp: '2026-11-04T04:00:00.000Z', previousSourceTimestamp: '2026-11-04T04:00:00.000Z', publishChanged: false,
  }, STATUSES.NO_NEW_OBSERVATION],
  ['new timestamp without a committed payload change is not called a repeated observation', {
    ...base, sourceTimestamp: '2026-11-04T04:01:00.000Z', previousSourceTimestamp: '2026-11-04T04:00:00.000Z', publishChanged: false,
  }, STATUSES.VALIDATION_FAILED],
  ['missing change signal fails closed', { ...base, publishChanged: null }, STATUSES.VALIDATION_FAILED],
  ['invalid clock fails closed', { ...base, nowMs: NaN }, STATUSES.VALIDATION_FAILED],
];

for (const [name, input, expected] of cases) {
  assert.equal(classifyPublicationStatus(input), expected, name);
}

console.log('COPERNICUS_PUBLICATION_STATUS_CLASSIFIER PASS (' + cases.length + ' cases)');

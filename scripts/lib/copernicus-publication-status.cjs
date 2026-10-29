'use strict';

const STATUSES = Object.freeze({
  FRESH_AND_PUBLISHED: 'FRESH_AND_PUBLISHED',
  NO_NEW_OBSERVATION: 'NO_NEW_OBSERVATION',
  BLOCKED_STALE_SOURCE: 'BLOCKED_STALE_SOURCE',
  FAILED_VALIDATION: 'FAILED_VALIDATION',
  FAILED_PUBLISH: 'FAILED_PUBLISH',
});

function classifyPublicationStatus(input = {}) {
  const {
    gateStatus,
    erddapOutcome,
    source,
    gateOutcome,
    publishOutcome,
    publishChanged,
  } = input;

  if (gateStatus === STATUSES.BLOCKED_STALE_SOURCE) {
    return STATUSES.BLOCKED_STALE_SOURCE;
  }
  if (
    erddapOutcome !== 'success' ||
    !['erddap-live', 'copernicus'].includes(source) ||
    gateOutcome !== 'success'
  ) {
    return STATUSES.FAILED_VALIDATION;
  }
  if (publishOutcome === 'failure') {
    return STATUSES.FAILED_PUBLISH;
  }
  if (publishOutcome === 'skipped') {
    return STATUSES.NO_NEW_OBSERVATION;
  }
  if (publishOutcome !== 'success') {
    return STATUSES.FAILED_VALIDATION;
  }
  if (publishChanged === false) {
    return STATUSES.NO_NEW_OBSERVATION;
  }
  if (publishChanged !== true) {
    return STATUSES.FAILED_VALIDATION;
  }
  return STATUSES.FRESH_AND_PUBLISHED;
}

module.exports = { STATUSES, classifyPublicationStatus };

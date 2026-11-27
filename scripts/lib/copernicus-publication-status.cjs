'use strict';

const STATUSES = Object.freeze({
  SOURCE_DELAYED: 'SOURCE_DELAYED',
  FETCH_FAILED: 'FETCH_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PUBLISHED: 'PUBLISHED',
  DEPLOYED_VERIFIED: 'DEPLOYED_VERIFIED',
  NO_NEW_OBSERVATION: 'NO_NEW_OBSERVATION',
  PUBLISH_FAILED: 'PUBLISH_FAILED',
});

function classifyPublicationStatus(input = {}) {
  const {
    gateStatus,
    erddapOutcome,
    erddapFailureKind,
    source,
    gateOutcome,
    publishOutcome,
    publishChanged,
    sourceTimestamp,
    previousSourceTimestamp,
    nowMs = Date.now(),
    operationalSlaMinutes = 900,
  } = input;

  if (erddapOutcome !== 'success') {
    return erddapFailureKind === STATUSES.VALIDATION_FAILED
      ? STATUSES.VALIDATION_FAILED
      : STATUSES.FETCH_FAILED;
  }
  if (!['erddap-live', 'copernicus'].includes(source)) return STATUSES.VALIDATION_FAILED;

  const timestampMs = typeof sourceTimestamp === 'number'
    ? sourceTimestamp
    : Date.parse(String(sourceTimestamp ?? ''));
  if (!Number.isFinite(timestampMs) || timestampMs <= 0 || !Number.isFinite(nowMs) || nowMs <= 0 || timestampMs > nowMs) {
    return STATUSES.VALIDATION_FAILED;
  }
  if (nowMs - timestampMs > operationalSlaMinutes * 60_000 || gateStatus === 'BLOCKED_STALE_SOURCE') {
    return STATUSES.SOURCE_DELAYED;
  }
  if (gateOutcome !== 'success' || gateStatus !== 'PASS') return STATUSES.VALIDATION_FAILED;

  if (publishOutcome === 'failure') {
    return STATUSES.PUBLISH_FAILED;
  }
  if (publishOutcome === 'skipped') {
    return STATUSES.VALIDATION_FAILED;
  }
  if (publishOutcome !== 'success') {
    return STATUSES.VALIDATION_FAILED;
  }
  if (publishChanged === false) {
    return previousSourceTimestamp === sourceTimestamp
      ? STATUSES.NO_NEW_OBSERVATION
      : STATUSES.VALIDATION_FAILED;
  }
  if (publishChanged !== true) {
    return STATUSES.VALIDATION_FAILED;
  }
  return STATUSES.PUBLISHED;
}

module.exports = { STATUSES, classifyPublicationStatus };

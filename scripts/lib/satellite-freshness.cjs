'use strict';

// Shared freshness contract for static satellite payloads.
// The observation timestamp (not updatedAt) is authoritative.
const SAT_STALE_HOURS = 36;
const OPERATIONAL_SLA_MINUTES = 900;

function satelliteFreshness(erddapTimestamp, now = Date.now()) {
  const timestamp = typeof erddapTimestamp === 'number'
    ? erddapTimestamp
    : Date.parse(String(erddapTimestamp ?? ''));

  // Fail closed: missing, invalid, future, or invalid-clock timestamps cannot prove
  // freshness. Keep age unknown, but mark the payload stale/unverified so callers
  // that only inspect the boolean never mistake an unverifiable observation as fresh.
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now) || timestamp > now) {
    return { dataAgeMinutes: null, stale: true };
  }

  const ageMs = now - timestamp;
  const dataAgeMinutes = Math.round(ageMs / 60_000);
  return {
    dataAgeMinutes,
    // The public contract is stale at >=36h. Decide from exact elapsed time;
    // rounded display minutes must never move an observation across the boundary.
    stale: ageMs >= SAT_STALE_HOURS * 60 * 60 * 1000,
  };
}

function refreshSatellitePayload(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.source !== 'erddap-live') {
    return payload;
  }

  const freshness = satelliteFreshness(payload.erddapTimestamp, now);
  payload.dataAgeMinutes = freshness.dataAgeMinutes;
  payload.stale = freshness.stale;
  return payload;
}

/**
 * Validate a live ERDDAP observation for customer-facing scheduled briefs.
 * This operational gate is stricter than the 36h public stale marker.
 * Cached dataAgeMinutes, stale, and updatedAt are deliberately ignored.
 */
function operationalSatelliteFreshness(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.source !== 'erddap-live') {
    return { fresh: false, ageMinutes: null, reason: 'non-live-source' };
  }

  const timestamp = typeof payload.erddapTimestamp === 'number'
    ? payload.erddapTimestamp
    : Date.parse(String(payload.erddapTimestamp ?? ''));

  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now) || timestamp > now) {
    return {
      fresh: false,
      ageMinutes: null,
      reason: payload.erddapTimestamp == null
        ? 'missing-observation-timestamp'
        : 'invalid-or-future-observation-timestamp',
    };
  }

  const ageMs = now - timestamp;
  const ageMinutes = Math.floor(ageMs / 60_000);
  const fresh = ageMs <= OPERATIONAL_SLA_MINUTES * 60_000;

  return {
    fresh,
    ageMinutes,
    reason: fresh ? 'within-operational-sla' : 'observation-outside-operational-sla',
  };
}

module.exports = {
  SAT_STALE_HOURS,
  OPERATIONAL_SLA_MINUTES,
  satelliteFreshness,
  refreshSatellitePayload,
  operationalSatelliteFreshness,
};

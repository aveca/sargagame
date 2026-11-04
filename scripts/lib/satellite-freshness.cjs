'use strict';

// Shared freshness contract for static satellite payloads.
// The observation timestamp (not updatedAt) is authoritative.
// SLA : le composite ERDDAP est considere frais si son erddapTimestamp a
// moins de 900 minutes (15 h). Au-delà, `stale` est vrai et le verdict
// hero doit etre masque (jamais de timestamp falsifie, jamais de SLA reduit).
const SAT_STALE_HOURS = 15; // 900 minutes SLA

function satelliteFreshness(erddapTimestamp, now = Date.now()) {
  const timestamp = typeof erddapTimestamp === 'number'
    ? erddapTimestamp
    : Date.parse(String(erddapTimestamp ?? ''));

  // Missing, invalid, future, or invalid-clock timestamps cannot prove age.
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now) || timestamp > now) {
    return { dataAgeMinutes: null, stale: false };
  }

  const dataAgeMinutes = Math.round((now - timestamp) / 60_000);
  return {
    dataAgeMinutes,
    stale: dataAgeMinutes > SAT_STALE_HOURS * 60,
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

module.exports = { SAT_STALE_HOURS, satelliteFreshness, refreshSatellitePayload };

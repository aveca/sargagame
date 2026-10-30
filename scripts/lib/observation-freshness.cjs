'use strict';

/**
 * observation-freshness.cjs — Shared pure contract for satellite observation freshness.
 *
 * This is the SINGLE source of truth for deciding whether a satellite observation
 * is fresh enough to show current scores/verdicts/forecasts.
 *
 * DESIGN PRINCIPLES:
 * - erddapTimestamp is the ONLY scientific observation clock.
 * - updatedAt is publication time only — never proves observation freshness.
 * - Build time is never an observation timestamp.
 * - Fail closed: missing / invalid / future / non-live source => UNKNOWN.
 * - Two separate thresholds: 900 min operational SLA, 2160 min public stale.
 * - Never auto-relax either threshold.
 */

const SAT_STALE_HOURS = 36; // 2160 minutes — public stale threshold
const OPERATIONAL_SLA_MINUTES = 900; // 15 hours — operational freshness SLA

// Source is considered "live" only when the pipeline asserts erddap-live.
// Any other source (reference, synthetic, cached, fallback) is non-live.
const LIVE_SOURCES = new Set(['erddap-live']);

function _parseMs(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.length > 0) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Evaluate observation freshness against the shared contract.
 *
 * @param {Object} input
 * @param {string} input.source — data source identifier (e.g. 'erddap-live', 'reference', 'synthetic')
 * @param {string|number|null} input.erddapTimestamp — ISO string or epoch ms of the ERDDAP observation
 * @param {number} [input.now=Date.now()] — current time in epoch ms (injected for testability)
 * @param {string} [input.region] — optional region id for contextual reason strings
 * @returns {Object}
 *   { fresh: boolean, stale: boolean, unknown: boolean, ageMinutes: number|null,
 *     reason: string, canShowCurrentScore: boolean, canShowCurrentVerdict: boolean,
 *     canShowForecast: boolean }
 */
function observationFreshness({ source, erddapTimestamp, now = Date.now(), region } = {}) {
  const isLiveSource = LIVE_SOURCES.has(source);
  const tsMs = _parseMs(erddapTimestamp);

  // --- Missing / invalid / future timestamp => UNKNOWN ---
  if (tsMs === null || !Number.isFinite(tsMs) || tsMs <= 0 || !Number.isFinite(now) || tsMs > now) {
    return {
      fresh: false,
      stale: true,
      unknown: true,
      ageMinutes: null,
      reason: erddapTimestamp == null
        ? `missing observation timestamp${region ? ` (region=${region})` : ''}`
        : `invalid or future observation timestamp${region ? ` (region=${region})` : ''}`,
      canShowCurrentScore: false,
      canShowCurrentVerdict: false,
      canShowForecast: false,
    };
  }

  const ageMs = now - tsMs;
  const ageMinutes = Math.round(ageMs / 60_000);
  const operationalStale = ageMinutes > OPERATIONAL_SLA_MINUTES;
  const publicStale = ageMinutes >= SAT_STALE_HOURS * 60;

  // --- Non-live source: cannot prove current status even if timestamp is fresh ---
  if (!isLiveSource) {
    return {
      fresh: false,
      stale: publicStale,
      unknown: true,
      ageMinutes,
      reason: `non-live source "${source}" cannot prove current observation${region ? ` (region=${region})` : ''}`,
      canShowCurrentScore: false,
      canShowCurrentVerdict: false,
      canShowForecast: false,
    };
  }

  // --- Fresh: live source + within operational SLA ---
  if (!operationalStale) {
    return {
      fresh: true,
      stale: false,
      unknown: false,
      ageMinutes,
      reason: `live observation ${ageMinutes} min old (region=${region || '-'})`,
      canShowCurrentScore: true,
      canShowCurrentVerdict: true,
      canShowForecast: true,
    };
  }

  // --- Recent but past operational SLA (15h–36h): not "current" but not yet publicly stale ---
  if (!publicStale) {
    return {
      fresh: false,
      stale: false,
      unknown: false,
      ageMinutes,
      reason: `observation ${ageMinutes} min old — past 900 min operational SLA, within 2160 min public window (region=${region || '-'})`,
      canShowCurrentScore: false,
      canShowCurrentVerdict: false,
      canShowForecast: false,
    };
  }

  // --- Publicly stale (>=36h): never show as current ---
  return {
    fresh: false,
    stale: true,
    unknown: false,
    ageMinutes,
    reason: `observation ${ageMinutes} min old — exceeds 2160 min public stale threshold (region=${region || '-'})`,
    canShowCurrentScore: false,
    canShowCurrentVerdict: false,
    canShowForecast: false,
  };
}

module.exports = {
  observationFreshness,
  SAT_STALE_HOURS,
  OPERATIONAL_SLA_MINUTES,
  LIVE_SOURCES,
};

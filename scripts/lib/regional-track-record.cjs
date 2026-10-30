'use strict';

/**
 * regional-track-record.cjs — Public accuracy validation for reliability pages.
 *
 * Provides resolvePublicAccuracy(record, regionId): validates that a backtest
 * record can be publicly presented as accuracy data for a given region.
 *
 * UNSUPPORTED REGIONS (must not receive MQ/GP accuracy figures):
 *   Florida, Punta Cana, Riviera Maya, Tulum
 *
 * VALIDATION RULES:
 *   1. Regional coverage — only 'mq' and 'gp' are covered by the backtest
 *   2. Freshness — record must not be stale (freshness.stale !== true)
 *   3. Record completeness — required fields must exist
 *   4. Sample size — totalPairs > 0
 *   5. Dates — dateRange must be valid and within acceptable bounds
 *   6. Valid percentages — statusHitRate must be valid numbers (0-100)
 *
 * Returns null if any check fails (no fallback figures).
 */

const SUPPORTED_REGIONS = new Set(['mq', 'gp']);

// Maximum age of backtest data before it's considered stale (30 days)
const MAX_BACKTEST_AGE_DAYS = 30;

function _isValidPct(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
}

function _isValidDate(iso) {
  if (!iso || typeof iso !== 'string') return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > 0;
}

/**
 * Validate a backtest record for public presentation as regional accuracy.
 *
 * @param {Object|null} record — backtest-results.json content
 * @param {string} regionId — region id (e.g. 'mq', 'gp', 'florida', 'puntacana')
 * @returns {Object|null} validated accuracy data, or null if any check fails
 */
function resolvePublicAccuracy(record, regionId) {
  // --- Rule 1: Regional coverage ---
  // Only MQ and GP are covered by the backtest. USD regions must not receive
  // MQ/GP accuracy figures.
  if (!record || !SUPPORTED_REGIONS.has(regionId)) {
    return null;
  }

  // --- Rule 2: Freshness ---
  // If the record has been explicitly marked stale, reject it.
  if (record.freshness && record.freshness.stale === true) {
    return null;
  }

  // --- Rule 3: Record completeness ---
  if (!record.byHorizon || !record.overall || !(record.totalPairs > 0)) {
    return null;
  }
  if (typeof record.overall.statusHitRate !== 'number') {
    return null;
  }

  // --- Rule 4: Sample size ---
  if (!(record.totalPairs > 0)) {
    return null;
  }

  // --- Rule 5: Dates ---
  if (record.dateRange) {
    if (!_isValidDate(record.dateRange.archiveFrom) || !_isValidDate(record.dateRange.archiveTo)) {
      return null;
    }
    const now = Date.now();
    const archiveToMs = Date.parse(record.dateRange.archiveTo);
    const maxAgeMs = MAX_BACKTEST_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (now - archiveToMs > maxAgeMs) {
      return null;
    }
  }

  // --- Rule 6: Valid percentages ---
  if (!_isValidPct(record.overall.statusHitRate)) {
    return null;
  }
  // Validate per-horizon rates if present
  for (const h of Object.keys(record.byHorizon || {})) {
    const hr = record.byHorizon[h];
    if (hr && typeof hr.statusHitRate === 'number' && !_isValidPct(hr.statusHitRate)) {
      return null;
    }
  }

  // All checks passed — return validated accuracy data (no invented figures)
  return {
    overall: record.overall.statusHitRate,
    calm: record.regimeReliability?.regimes?.calm?.cleanReliabilityPct ?? null,
    peak: record.regimeReliability?.regimes?.high?.cleanReliabilityPct ?? null,
    sample: record.totalPairs,
    window: record.regimeReliability?.window ?? null,
    method: record.regimeReliability?.method ?? null,
    headline: record.regimeReliability?.headline ?? null,
    byHorizon: Object.fromEntries(
      Object.entries(record.byHorizon).map(([k, v]) => [k, {
        statusHitRate: v.statusHitRate,
        pairs: v.pairs,
        avgConfidence: v.avgConfidence,
      }])
    ),
    byBeach: Object.fromEntries(
      Object.entries(record.byBeach || {}).map(([k, v]) => [k, {
        statusHitRate: v.statusHitRate,
        pairs: v.pairs,
        afaiMAE: v.afaiMAE,
      }])
    ),
    dateRange: record.dateRange ?? null,
    computed: record.computed ?? null,
  };
}

module.exports = {
  resolvePublicAccuracy,
  SUPPORTED_REGIONS,
  MAX_BACKTEST_AGE_DAYS,
};

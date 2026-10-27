'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_COMPUTED_AGE_MS = 36 * HOUR_MS;
const MAX_WINDOW_AGE_MS = 2 * DAY_MS;
const FUTURE_COMPUTED_SKEW_MS = 5 * 60 * 1000;
const FUTURE_WINDOW_SKEW_MS = 24 * HOUR_MS;

function parseUtcEndOfDay(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return NaN;
  const startMs = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(startMs) || new Date(startMs).toISOString().slice(0, 10) !== value) return NaN;
  return startMs + DAY_MS - 1000;
}

/**
 * Evaluate the age of the backtest and its inclusive UTC measurement window.
 * Keep the stale decision based on exact elapsed milliseconds, never rounded
 * day counts: rounding 58 hours to 2 days previously let a >48h-old window pass.
 */
function calculateTrackRecordFreshness({ computedAt, archiveTo, nowMs = Date.now() } = {}) {
  const computedMs = typeof computedAt === 'string' ? Date.parse(computedAt) : NaN;
  const archiveToMs = parseUtcEndOfDay(archiveTo);
  const computedAgeMs = Number.isFinite(computedMs) && Number.isFinite(nowMs) ? nowMs - computedMs : NaN;
  const windowAgeMs = Number.isFinite(archiveToMs) && Number.isFinite(nowMs) ? nowMs - archiveToMs : NaN;

  const ageHours = Number.isFinite(computedAgeMs) ? Math.round(computedAgeMs / HOUR_MS) : null;
  const archiveToAgeDays = Number.isFinite(windowAgeMs)
    ? Math.max(0, Math.round(windowAgeMs / DAY_MS))
    : null;
  const windowAgeHours = Number.isFinite(windowAgeMs) ? Math.round(windowAgeMs / HOUR_MS) : null;

  const stale =
    !Number.isFinite(computedAgeMs) ||
    computedAgeMs < -FUTURE_COMPUTED_SKEW_MS ||
    computedAgeMs > MAX_COMPUTED_AGE_MS ||
    !Number.isFinite(windowAgeMs) ||
    windowAgeMs < -FUTURE_WINDOW_SKEW_MS ||
    windowAgeMs > MAX_WINDOW_AGE_MS;

  return { ageHours, archiveToAgeDays, windowAgeHours, stale };
}

module.exports = { calculateTrackRecordFreshness };

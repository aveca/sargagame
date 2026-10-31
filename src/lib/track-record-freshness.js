const MAX_COMPUTED_AGE_MS = 36 * 60 * 60 * 1000;
const FUTURE_COMPUTED_SKEW_MS = 5 * 60 * 1000;
const MAX_WINDOW_AGE_MS = 2 * 24 * 60 * 60 * 1000;
const FUTURE_WINDOW_SKEW_MS = 24 * 60 * 60 * 1000;

/** Fail closed unless the public record has an explicit fresh marker and a recent, valid measurement window. */
export function isTrackRecordFresh(record, nowMs = Date.now()) {
  if (!record || !record.byRegime || typeof record.byRegime !== "object" || !record.freshness || record.freshness.stale !== false || !record.window) return false;
  const computedAtMs = Date.parse(record.freshness.computedAt || "");
  const windowFromMs = Date.parse(record.window.from ? record.window.from + "T00:00:00Z" : "");
  const windowToMs = Date.parse(record.window.to ? record.window.to + "T23:59:59Z" : "");
  if (![nowMs, computedAtMs, windowFromMs, windowToMs].every(Number.isFinite) || windowFromMs > windowToMs) return false;
  const computedAgeMs = nowMs - computedAtMs;
  const windowAgeMs = nowMs - windowToMs;
  return computedAgeMs >= -FUTURE_COMPUTED_SKEW_MS && computedAgeMs <= MAX_COMPUTED_AGE_MS && windowAgeMs >= -FUTURE_WINDOW_SKEW_MS && windowAgeMs <= MAX_WINDOW_AGE_MS;
}

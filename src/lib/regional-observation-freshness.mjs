/**
 * Public regional observation gate (900 minutes / 15 hours).
 * erddapTimestamp is the only observation clock. updatedAt and dataAgeMinutes
 * are pipeline/cache metadata and never prove scientific freshness.
 * Missing, invalid, future, non-live or unconfirmed observations fail closed.
 */
export const REGIONAL_OBSERVATION_MAX_AGE_MINUTES = 900;

export function regionalObservationFreshness(sargData, now = Date.now()) {
  const raw = sargData?.erddapTimestamp;
  const timestamp = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""));
  const timestampValid = Number.isFinite(timestamp) && timestamp > 0;
  const clockValid = Number.isFinite(now) && now > 0;
  const isFuture = timestampValid && clockValid && timestamp > now;
  const ageMinutes = timestampValid && clockValid && !isFuture ? (now - timestamp) / 60_000 : null;

  if (!timestampValid || !clockValid || isFuture) {
    return { state: "unknown", timestamp: timestampValid ? timestamp : null, ageMinutes: null,
      reason: !clockValid ? "invalid-clock" : !timestampValid ? "invalid-timestamp" : "future-timestamp" };
  }
  if (sargData?.source !== "erddap-live") {
    return { state: "unknown", timestamp, ageMinutes, reason: "non-live-source" };
  }
  if (sargData?.stale === true || ageMinutes >= REGIONAL_OBSERVATION_MAX_AGE_MINUTES) {
    return { state: "delayed", timestamp, ageMinutes, reason: sargData?.stale === true ? "stale-flag" : "outside-900-minute-sla" };
  }
  if (sargData?.stale !== false) {
    return { state: "unknown", timestamp, ageMinutes, reason: "missing-stale-clearance" };
  }
  return { state: "fresh", timestamp, ageMinutes, reason: "within-900-minute-sla" };
}

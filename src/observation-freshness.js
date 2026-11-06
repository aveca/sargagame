const MAX_OBSERVATION_AGE_MINUTES = 900

/**
 * Only the source observation timestamp can establish freshness.
 * Publication timestamps must never make old measurements appear current.
 */
export function getObservationFreshness(data, now = Date.now()) {
  const rawTimestamp = data?.erddapTimestamp
  if (typeof rawTimestamp !== "string" || !rawTimestamp.trim()) {
    return { fresh: false, reason: "unknown", ageMinutes: null }
  }

  const observedAt = Date.parse(rawTimestamp)
  if (!Number.isFinite(observedAt) || !Number.isFinite(now) || observedAt > now) {
    return { fresh: false, reason: "unknown", ageMinutes: null }
  }

  const timestampAge = (now - observedAt) / 60000
  const declaredAge = data?.dataAgeMinutes
  if (declaredAge != null && (!Number.isFinite(Number(declaredAge)) || Number(declaredAge) < 0)) {
    return { fresh: false, reason: "unknown", ageMinutes: timestampAge }
  }

  const ageMinutes = declaredAge == null
    ? timestampAge
    : Math.max(timestampAge, Number(declaredAge))
  const stale = data?.stale === true || ageMinutes > MAX_OBSERVATION_AGE_MINUTES

  return { fresh: !stale, reason: stale ? "stale" : "fresh", ageMinutes }
}

export { MAX_OBSERVATION_AGE_MINUTES }

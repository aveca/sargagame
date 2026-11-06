export function getObservationFreshness(data, now = Date.now()) {
  const raw = data?.erddapTimestamp
  if (typeof raw !== "string") return { fresh: false, reason: "unknown", ageMinutes: null }
  const timestamp = Date.parse(raw)
  if (!Number.isFinite(timestamp) || timestamp > now) return { fresh: false, reason: "unknown", ageMinutes: null }
  const ageMinutes = Math.max((now - timestamp) / 60000, Number(data?.dataAgeMinutes || 0))
  const stale = data?.stale === true || ageMinutes > 900
  return { fresh: !stale, reason: stale ? "stale" : "fresh", ageMinutes }
}

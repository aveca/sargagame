import { isSatelliteFresh12h, satelliteAgeHours } from "./format-freshness.mjs"

const VALID_STATUSES = new Set(["clean", "moderate", "avoid"])

/**
 * Enrich SOS beach choices only from a validated, current ERDDAP observation.
 * Missing, stale, future, invalid or unmatched data must never become "clean".
 */
export function enrichSosBeaches(beaches, sargData, region, now = Date.now()) {
  const observationCurrent = sargData?.source === "erddap-live"
    && sargData?.stale === false
    && isSatelliteFresh12h(sargData, now)
  const ageHours = satelliteAgeHours(sargData, now)
  const levels = Array.isArray(sargData?.levels) ? sargData.levels : []
  const byId = new Map(levels.filter(level => level && typeof level.id === "string").map(level => [level.id, level]))

  return (Array.isArray(beaches) ? beaches : [])
    .filter(beach => beach && beach.island === region)
    .map(beach => {
      const id = typeof beach.id === "string" ? beach.id : ""
      const alternateId = id.length > 2 ? region + id.slice(2) : ""
      const level = observationCurrent ? (byId.get(id) || byId.get(alternateId) || null) : null
      const valid = Boolean(level && VALID_STATUSES.has(level.status))
      const forecast = valid && Array.isArray(level.forecast)
        ? level.forecast.filter(day => day && VALID_STATUSES.has(day.status))
        : []

      return {
        ...beach,
        status: valid ? level.status : "unknown",
        confidence: valid && Number.isFinite(level.confidence) && level.confidence >= 0 && level.confidence <= 100
          ? level.confidence
          : null,
        forecast,
        afai: valid && Number.isFinite(level.afai) ? level.afai : null,
        observationCurrent: valid,
        observationAgeHours: ageHours,
      }
    })
}

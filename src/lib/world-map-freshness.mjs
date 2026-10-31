import { formatFreshnessAge, satelliteAgeHours, satelliteFreshnessStatus } from "./format-freshness.mjs";

/**
 * Freshness contract for WorldMapView. Kept in the map-only chunk so this
 * map-specific gate does not enlarge the shared eager freshness module.
 */
export function worldMapFreshness(source, erddapTimestamp, lang, now = Date.now()) {
  const data = source === "erddap-live" && { erddapTimestamp };
  const age = satelliteAgeHours(data, now);
  const valid = age != null, fresh = valid && age < 12, available = valid && age < 36;
  return [fresh, available, satelliteFreshnessStatus(data, lang, now), valid ? formatFreshnessAge(erddapTimestamp, lang, now) : "···", available ? ((fresh ? 12 : 36) - age) * 36e5 + 50 : null];
}

import { formatFreshnessAge, satelliteAgeHours, satelliteFreshnessStatus } from "./format-freshness.mjs";

/**
 * Freshness contract for WorldMapView.
 *
 * A current beach decision is allowed only while the satellite observation is
 * younger than 12 hours, matching lc-detail and the shared product contract.
 * 12–36h remains a neutral, dated reading; >=36h is explicitly delayed.
 * The next timer transition is scheduled at 12h and then 36h while the page stays open.
 */
export function worldMapFreshness(source, erddapTimestamp, lang, now = Date.now()) {
  const data = source === "erddap-live" && { erddapTimestamp };
  const age = satelliteAgeHours(data, now);
  const valid = age != null;
  const available = valid && age < 12;
  const color = !valid || age >= 36 ? "#B87A00" : available ? "#00786C" : "#667085";
  const nextCutoff = !valid || age >= 36 ? null : age < 12 ? 12 : 36;
  const nextChangeDelay = nextCutoff == null ? null : Math.max(0, (nextCutoff - age) * 36e5 + 50);
  return [available, color, satelliteFreshnessStatus(data, lang, now), valid ? formatFreshnessAge(erddapTimestamp, lang, now) : "···", nextChangeDelay];
}

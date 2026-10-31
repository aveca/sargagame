import { isSatelliteStale36h } from "./format-freshness.mjs";

function timestampMs(value) {
  return typeof value === "number" ? value : Date.parse(String(value ?? ""));
}

/**
 * A beach decision is usable only when an actual observation timestamp is proven.
 * The parent historically falls back from erddapTimestamp to updatedAt; equal
 * instants therefore cannot prove a separate observation clock and fail closed.
 * Serialized stale/dataAgeMinutes fields are deliberately ignored because static
 * API assets can age after publication.
 */
export function mapDecisionFreshness(erddapTimestamp, updatedAt, now = Date.now()) {
  const observationMs = timestampMs(erddapTimestamp);
  if (!Number.isFinite(observationMs) || observationMs <= 0 ||
      !Number.isFinite(now) || observationMs > now) {
    return { available: false, reason: "unknown", timestamp: null };
  }

  const publicationMs = timestampMs(updatedAt);
  if (Number.isFinite(publicationMs) && publicationMs === observationMs) {
    return { available: false, reason: "publication-fallback", timestamp: null };
  }

  const stale = isSatelliteStale36h({ erddapTimestamp }, now);
  return {
    available: !stale,
    reason: stale ? "stale" : "available",
    timestamp: erddapTimestamp,
  };
}


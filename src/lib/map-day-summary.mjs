const KNOWN_STATUSES = new Set(["clean", "moderate", "avoid"]);

/**
 * Count only source-provided day statuses for the map's current day.
 * Missing/unknown values never become a green beach or an avoid alert.
 */
export function summarizeBeachStatuses(beachList, day = 0) {
  const counts = { clean: 0, moderate: 0, avoid: 0, unknown: 0, total: 0 };
  if (!Array.isArray(beachList)) return counts;

  for (const beach of beachList) {
    counts.total += 1;
    const status = beach && beach.days && beach.days[day];
    if (KNOWN_STATUSES.has(status)) counts[status] += 1;
    else counts.unknown += 1;
  }

  return counts;
}

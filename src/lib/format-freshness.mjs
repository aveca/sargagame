const LABELS = {
  fr: { unknown: "âge inconnu", future: "horodatage à vérifier", now: "à l’instant" },
  en: { unknown: "age unknown", future: "timestamp needs checking", now: "just now" },
  es: { unknown: "antigüedad desconocida", future: "hora por verificar", now: "ahora mismo" },
};

/**
 * Gate 12h anti-fake-freshness (contrat produit) : seule l'observation satellite
 * (sargData.erddapTimestamp) prouve la fraîcheur. `updatedAt` (heure de republication
 * pipeline) ne doit JAMAIS servir seul — sinon un republish frais masque un satellite
 * vieux (défaut prod 2026-10-12 : updatedAt 22:07Z, erddap 54,8h, stale:false).
 * Absent/invalide/futur => false (« Vérification en cours »).
 */
export function isSatelliteFresh12h(sargData, now = Date.now()) {
  const raw = sargData?.erddapTimestamp;
  const timestamp = typeof raw === 'number' ? raw : Date.parse(String(raw ?? ''));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) return false;
  const elapsed = now - timestamp;
  return elapsed >= 0 && elapsed < 12 * 3_600_000;
}

/**
 * Format the age of the last verified data update for the map header.
 * It deliberately returns complete localized copy; it never invents a timestamp.
 */
export function formatFreshnessAge(updatedAt, lang = "fr", now = Date.now()) {
  const locale = Object.prototype.hasOwnProperty.call(LABELS, lang) ? lang : "fr";
  const labels = LABELS[locale];
  const timestamp = typeof updatedAt === "number" ? updatedAt : Date.parse(String(updatedAt ?? ""));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) {
    return labels.unknown;
  }

  const elapsed = now - timestamp;
  if (elapsed < 0) return labels.future;
  if (elapsed < 60_000) return labels.now;

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) {
    const age = minutes + " min";
    return locale === "fr" ? "il y a " + age : locale === "es" ? "hace " + age : age + " ago";
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const age = locale === "en" ? hours + (hours === 1 ? " hr" : " hrs") : hours + " h";
    return locale === "fr" ? "il y a " + age : locale === "es" ? "hace " + age : age + " ago";
  }

  const days = Math.floor(hours / 24);
  const age = locale === "fr" ? days + " j" : locale === "es" ? days + (days === 1 ? " día" : " días") : days + (days === 1 ? " day" : " days");
  return locale === "fr" ? "il y a " + age : locale === "es" ? "hace " + age : age + " ago";
}

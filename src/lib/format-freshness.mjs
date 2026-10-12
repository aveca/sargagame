const LABELS = {
  fr: { unknown: "âge inconnu", future: "horodatage à vérifier", now: "à l’instant" },
  en: { unknown: "age unknown", future: "timestamp needs checking", now: "just now" },
  es: { unknown: "antigüedad desconocida", future: "hora por verificar", now: "ahora mismo" },
};

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

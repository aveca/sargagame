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
 * Âge satellite en heures à l'instant du rendu (temps servi, jamais figé).
 * Remplace les lectures directes du champ statique `dataAgeMinutes`, qui est un
 * instantané à l'heure du run pipeline et pourrit en place (ex : 2048 figé
 * pendant que l'âge réel dépasse 36h). Erddap absent/invalide => null.
 */
export function satelliteAgeHours(sargData, now = Date.now()) {
  const raw = sargData?.erddapTimestamp;
  const timestamp = typeof raw === 'number' ? raw : Date.parse(String(raw ?? ''));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now)) return null;
  const hours = (now - timestamp) / 3_600_000;
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

/**
 * Borne externe d'honnêteté 36h (même seuil que SAT_STALE_HOURS pipeline et
 * isStale de WorldMapView), recalculée au rendu. Inconnu => false (comme
 * WorldMapView : pas d'alerte sans preuve ; le gate 12h reste fail-closed).
 */
export function isSatelliteStale36h(sargData, now = Date.now()) {
  const age = satelliteAgeHours(sargData, now);
  if (age == null) return false;
  return age >= 36;
}


/**
 * Statut précis de la source satellite pour la pill de carte.
 * Ne confond pas la fraîcheur de l'observation satellite avec la date de
 * republication du pipeline ou la fraîcheur globale des prévisions.
 * <12h : observation fraîche ; 12–36h : âge visible sans alarme globale ;
 * >=36h : observation satellite en retard. Date absente/invalide/future :
 * vérification en cours.
 */
export function satelliteFreshnessStatus(sargData, lang = 'fr', now = Date.now()) {
  const age = satelliteAgeHours(sargData, now);
  const labels = lang === 'en'
    ? { unknown: 'Verification', fresh: 'SATELLITE CURRENT', recent: 'SATELLITE READING', stale: 'SATELLITE DELAYED' }
    : lang === 'es'
      ? { unknown: 'Verificación', fresh: 'SATÉLITE AL DÍA', recent: 'MEDICIÓN SATELITAL', stale: 'SATÉLITE ATRASADO' }
      : { unknown: 'Vérification', fresh: 'SATELLITE À JOUR', recent: 'MESURE SATELLITE', stale: 'SATELLITE EN RETARD' };
  if (age == null) return labels.unknown;
  if (age < 12) return labels.fresh;
  if (age < 36) return labels.recent;
  return labels.stale;
}

/**
 * Libellé de fraîcheur du détail de plage (lc-detail) — correction
 * SG-PRODUCT-FRESHNESS-LCDETAIL-20261013-001 : le libellé principal annonçait
 * « Mesuré au satellite ce matin » quelle que soit l'âge réel (baseline live :
 * observation ~16h). Règle :
 *   - observation <12h → « ce matin » (comportement historique préservé),
 *   - au-delà → âge réel de l'observation (erddapTimestamp), cohérent avec le
 *     panneau « Pourquoi ce verdict ? » qui affiche déjà ce nombre,
 *   - absent/invalide/futur → formulation honnête de vérification, jamais
 *     d'affirmation de fréquence inventée.
 * Utilise exclusivement les prédicats partagés (aucune lecture updatedAt).
 */
export function lcDetailFreshnessLabel(sargData, lang = 'fr', now = Date.now()) {
  const ageH = satelliteAgeHours(sargData, now);
  if (ageH == null) {
    return lang === 'es' ? 'Medición satelital en verificación — no se publica un veredicto actual.'
      : lang === 'en' ? 'Satellite observation being verified — no current verdict is published.'
      : 'Mesure satellite en cours de vérification — aucun verdict actuel publié.';
  }
  const payloadCurrent = sargData?.source === 'erddap-live' && sargData?.stale === false && isSatelliteFresh12h(sargData, now);
  if (payloadCurrent) {
    return lang === 'es' ? 'Observación satelital reciente.'
      : lang === 'en' ? 'Recent satellite observation.'
      : 'Observation satellite récente.';
  }
  if (ageH < 12) {
    return lang === 'es' ? 'Observación no validada — estado por verificar.'
      : lang === 'en' ? 'Unvalidated observation — status to check.'
      : 'Observation non validée — statut à vérifier.';
  }
  const h = Math.round(ageH);
  return lang === 'es' ? `Observación hace ${h} h: dato histórico, no es un veredicto actual.`
    : lang === 'en' ? `Observation ${h}h ago: historical, not a current verdict.`
    : `Observation il y a ${h} h : historique, pas un verdict actuel.`;
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


// Copy contract for the ChasseHome map CTA. Beach counts are only called today/live
// when the observation itself is less than 12 hours old; pipeline republication time is not evidence.
const CHASSE_MAP_CTA_COPY = {
  fr: {
    unknown: "Horodatage satellite à vérifier · aucun statut en direct",
    delayed: hours => `Dernière mesure satellite il y a ${hours} h · pas de statut en direct`,
    stale: "Données satellite en retard · vérifie avant de choisir",
    live: (clean, total) => `${clean}/${total} plages propres aujourd'hui · en direct`,
  },
  en: {
    unknown: "Satellite timestamp needs checking · no live status",
    delayed: hours => `Last satellite reading ${hours}h ago · no live status`,
    stale: "Satellite data delayed · check before choosing",
    live: (clean, total) => `${clean}/${total} clean beaches today · live`,
  },
  es: {
    unknown: "Hora satelital por verificar · sin estado en vivo",
    delayed: hours => `Última medición satelital hace ${hours} h · sin estado en vivo`,
    stale: "Datos satelitales atrasados · verifica antes de elegir",
    live: (clean, total) => `${clean}/${total} playas limpias hoy · en directo`,
  },
};

/**
 * Honest localized summary for the ChasseHome map CTA.
 * Age must be derived from erddapTimestamp, not the pipeline updatedAt.
 * At >=12 h or unknown age, never publish a count as today/live.
 */
export function chasseMapCtaSummary(cleanCount, totalCount, satelliteAgeHours, lang = "fr") {
  const locale = Object.prototype.hasOwnProperty.call(CHASSE_MAP_CTA_COPY, lang) ? lang : "fr";
  const copy = CHASSE_MAP_CTA_COPY[locale];
  if (!Number.isFinite(satelliteAgeHours) || satelliteAgeHours < 0) return copy.unknown;
  if (satelliteAgeHours >= 36) return copy.stale;
  if (satelliteAgeHours >= 12) return copy.delayed(Math.floor(satelliteAgeHours));
  const clean = Number.isFinite(cleanCount) ? Math.max(0, Math.floor(cleanCount)) : 0;
  const total = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  return copy.live(clean, total);
}

/**
 * HomeAZ freshness contract.
 * Only erddapTimestamp proves observation freshness; updatedAt is publication time.
 * A recent-observation label is shown only under 12 h, 12–15 h is a dated reading, and >15 h is delayed.
 */
export function homeAzFreshness(sargData, lang = "fr", now = Date.now()) {
  const ageHours = satelliteAgeHours(sargData, now);
  const locale = lang === "en" ? "en" : lang === "es" ? "es" : "fr";
  const labels = {
    fr: {
      unknownBadge: "VÉRIFICATION",
      unknown: "Vérification des données satellite en cours",
      freshBadge: "OBSERVATION RÉCENTE",
      recentBadge: "MESURE SATELLITE",
      staleBadge: "SATELLITE EN RETARD",
      stale: "Données satellite en retard · vérifie avant de choisir",
      recent: hours => `Dernière mesure satellite il y a ${hours} h · statut non en direct`,
      minute: n => `· il y a ${n} min`,
      hour: n => `· il y a ${n} h`,
    },
    en: {
      unknownBadge: "VERIFICATION",
      unknown: "Satellite verification in progress",
      freshBadge: "RECENT OBSERVATION",
      recentBadge: "SATELLITE READING",
      staleBadge: "SATELLITE DELAYED",
      stale: "Satellite data delayed · check before choosing",
      recent: hours => `Last satellite reading ${hours}h ago · not live`,
      minute: n => `· ${n} min ago`,
      hour: n => `· ${n}h ago`,
    },
    es: {
      unknownBadge: "VERIFICACIÓN",
      unknown: "Verificación de datos satelitales en curso",
      freshBadge: "OBSERVACIÓN RECIENTE",
      recentBadge: "MEDICIÓN SATELITAL",
      staleBadge: "SATÉLITE ATRASADO",
      stale: "Datos satelitales atrasados · verifica antes de elegir",
      recent: hours => `Última medición satelital hace ${hours} h · sin estado en vivo`,
      minute: n => `· hace ${n} min`,
      hour: n => `· hace ${n} h`,
    },
  }[locale];

  // Missing, invalid or future timestamps cannot prove a current status.
  if (ageHours == null || ageHours < 0) {
    return { state: "unknown", live: false, badge: labels.unknownBadge, label: labels.unknown, ageHours: null };
  }
  if (ageHours < 12) {
    const label = ageHours < 1
      ? labels.minute(Math.max(1, Math.round(ageHours * 60)))
      : labels.hour(Math.max(1, Math.floor(ageHours)));
    return { state: "live", live: true, badge: labels.freshBadge, label, ageHours };
  }
  if (ageHours < 15) {
    const hours = Math.max(12, Math.floor(ageHours));
    return { state: "recent", live: false, badge: labels.recentBadge, label: labels.recent(hours), ageHours };
  }
  return { state: "stale", live: false, badge: labels.staleBadge, label: labels.stale, ageHours };
}



/** Format the source observation timestamp explicitly in UTC for the HomeAZ hero. */
export function formatObservationTimestamp(raw, lang = "fr") {
  const timestamp = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""));
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return lang === "en" ? "UNKNOWN" : lang === "es" ? "DESCONOCIDO" : "INCONNU";
  }
  const locale = lang === "en" ? "en-GB" : lang === "es" ? "es-ES" : "fr-FR";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).formatToParts(new Date(timestamp));
  const part = type => parts.find(item => item.type === type)?.value || "";
  return `${part("day")} ${part("month")} ${part("hour")}:${part("minute")} UTC`;
}

/**
 * Milliseconds until the next HomeAZ freshness transition (12h or 15h).
 * A small 50ms margin avoids evaluating just before a boundary due to timer
 * scheduling precision. Invalid/future timestamps and terminal stale state
 * require no timer; visibility and data updates still re-evaluate the state.
 */
export function nextHomeAzFreshnessBoundaryDelayMs(sargData, now = Date.now()) {
  const raw = sargData?.erddapTimestamp;
  const timestamp = typeof raw === "number" ? raw : Date.parse(String(raw ?? ""));
  if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(now) || now < timestamp) return null;
  const ageMs = now - timestamp;
  const nextBoundary = [12, 15].map(hours => hours * 3_600_000).find(boundary => ageMs < boundary);
  return nextBoundary == null ? null : Math.max(0, nextBoundary - ageMs + 50);
}

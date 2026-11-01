'use strict';

// Freshness contract for static /conditions/ aggregations.
// Satellite observation time and marine-weather update time are independent sources.
const SATELLITE_SLA_MS = 900 * 60_000;
const WEATHER_SLA_MS = 12 * 60 * 60_000;

function parseTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function formatUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
}

function evaluateConditionsFreshness(satellitePayload, weatherUpdatedAt, now = Date.now()) {
  const clockValid = Number.isFinite(now) && now > 0;
  // Only the ERDDAP observation timestamp can authorize a sargassum-based selection.
  // updatedAt and dataAgeMinutes are publication/cache metadata and are intentionally ignored.
  const satelliteTimestamp = parseTimestamp(satellitePayload?.erddapTimestamp);
  const satelliteAgeMs = clockValid && satelliteTimestamp !== null ? now - satelliteTimestamp : null;
  const satelliteFresh = satellitePayload?.source === 'erddap-live'
    && satelliteAgeMs !== null
    && satelliteAgeMs >= 0
    && satelliteAgeMs <= SATELLITE_SLA_MS
    && satellitePayload.stale !== true;
  let satelliteLabel;
  if (satellitePayload?.source !== 'erddap-live') satelliteLabel = 'Observation satellite non vérifiée — source non live';
  else if (satelliteAgeMs === null || satelliteAgeMs < 0) satelliteLabel = 'Observation satellite non vérifiée — horodatage absent, invalide ou futur';
  else if (satelliteFresh) satelliteLabel = 'Dernière observation satellite : ' + formatUtc(satelliteTimestamp);
  else satelliteLabel = 'Observation satellite en retard — dernière observation : ' + formatUtc(satelliteTimestamp);

  // Marine weather has its own timestamp and 12-hour threshold. Future timestamps fail closed.
  const weatherTimestamp = parseTimestamp(weatherUpdatedAt);
  const weatherAgeMs = clockValid && weatherTimestamp !== null ? now - weatherTimestamp : null;
  const weatherFresh = weatherAgeMs !== null && weatherAgeMs >= 0 && weatherAgeMs <= WEATHER_SLA_MS;
  let weatherLabel;
  if (weatherAgeMs === null || weatherAgeMs < 0) weatherLabel = 'Météo marine non vérifiée — horodatage absent, invalide ou futur';
  else if (weatherFresh) weatherLabel = 'Dernière mise à jour météo marine : ' + formatUtc(weatherTimestamp);
  else weatherLabel = 'Météo marine en retard — dernière mise à jour : ' + formatUtc(weatherTimestamp);

  return { satelliteFresh, satelliteTimestamp, satelliteLabel, weatherFresh, weatherTimestamp, weatherLabel, selectionFresh: satelliteFresh && weatherFresh };
}

// Remove current-day claims from SEO headings whenever the underlying selection is suspended.
function suspendConditionTitle(value) {
  const title = String(value ?? '').trim();
  const base = title
    .replace(/\\s+aujourd’hui\\b/gi, '')
    .replace(/\\s+aujourd'hui\\b/gi, '')
    .replace(/\\s+/g, ' ')
    .replace(/\\s+—\\s+/g, ' — ')
    .replace(/[—–-]\\s*$/, '')
    .trim();
  if (!base) return 'Sélection suspendue';
  return /sélection suspendue/i.test(base) ? base : base + ' — sélection suspendue';
}

module.exports = { SATELLITE_SLA_MS, WEATHER_SLA_MS, evaluateConditionsFreshness, suspendConditionTitle };

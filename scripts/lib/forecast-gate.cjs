/**
 * forecast-gate.cjs — gating serveur de la prévision payante J+2→J+7.
 *
 * Le JSON public (`public/api/copernicus/sargassum.json`) ne sert QUE J+0/J+1
 * (`forecast.slice(0,2)`). Les jours payants J+2→J+6 partent dans un fichier
 * PRIVÉ (`_private/forecast-full.json`, bloqué en HTTP direct par .htaccess) que
 * seul l'endpoint authentifié `forecast.php` (abonné/pass par email OU token
 * widget Pro) restitue. La granularité par jour (status/afai/confidence J+2-6)
 * est ce qui se vend ; on ne la diffuse plus en clair.
 *
 * NE TOUCHE JAMAIS le verdict du jour : `levels`, `scores`, `forecast[0]/[1]` et
 * les AGRÉGATS de tendance (drift/driftValue/arrivalDay/arrivalStrength/
 * reliableHorizon/regime…) restent gratuits — ils nourrissent le teaser de
 * conversion et NE révèlent PAS la série datée J+2-6.
 *
 * IDEMPOTENT : appelé sur un weekly DÉJÀ gaté (forecast = 2 jours), `gateWeekly`
 * ne marque PAS `truncated` et ne reconstruit donc PAS le fichier privé (sinon il
 * l'écraserait avec une série tronquée). Le fichier privé n'est (ré)écrit QUE
 * quand une vraie troncature a lieu (= le pipeline vient de produire du full).
 */
'use strict'

const FREE_DAYS = 2 // index 0 = J+0 (Auj.), 1 = J+1 (Dem.) — gratuits

/**
 * @param {Object} weekly  map beachId -> { forecast:[...7j], drift, ... }
 * @returns {{ publicWeekly:Object, privateForecasts:Object, truncated:boolean }}
 *   publicWeekly      : clone gaté (forecast = 2 jours, + gated/fullDays)
 *   privateForecasts  : map beachId -> forecast FULL (7 jours) — vide si rien à gater
 *   truncated         : true si au moins une plage avait > FREE_DAYS jours
 */
function gateWeekly(weekly) {
  const publicWeekly = {}
  const privateForecasts = {}
  let truncated = false
  if (!weekly || typeof weekly !== 'object') {
    return { publicWeekly, privateForecasts, truncated }
  }
  // Kill-switch opérateur (rollback données) : SG_GATING=0 → on ne tronque plus,
  // le JSON public repart full au prochain run (zéro fuite : l'endpoint reste auth).
  if (process.env.SG_GATING === '0') {
    for (const id of Object.keys(weekly)) publicWeekly[id] = weekly[id]
    return { publicWeekly, privateForecasts, truncated: false }
  }
  for (const id of Object.keys(weekly)) {
    const entry = weekly[id]
    const fc = entry && Array.isArray(entry.forecast) ? entry.forecast : null
    if (!fc) { publicWeekly[id] = entry; continue }
    if (fc.length > FREE_DAYS) {
      truncated = true
      privateForecasts[id] = fc // série complète (7 jours)
      publicWeekly[id] = { ...entry, forecast: fc.slice(0, FREE_DAYS), gated: true, fullDays: fc.length }
    } else {
      // Déjà gaté (ou série naturellement courte) : on préserve tel quel, sans
      // toucher au fichier privé.
      publicWeekly[id] = entry
    }
  }
  return { publicWeekly, privateForecasts, truncated }
}

module.exports = { gateWeekly, FREE_DAYS }

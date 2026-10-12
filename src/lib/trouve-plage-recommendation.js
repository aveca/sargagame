/**
 * Pure, testable decision logic for the "Trouve ta plage" experience.
 * Only current-region beaches and an explicitly supplied satellite observation
 * timestamp are eligible for a current recommendation.
 */
const REGION_PREFIX = Object.freeze({
  mq: 'mq',
  gp: 'gp',
  florida: 'fl',
  puntacana: 'pc',
  rivieramaya: 'rm',
  tulum: 'tu'
})

export function parseTimestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (value === '') return null
  const numeric = typeof value === 'number' ? value : (/^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN)
  const ms = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function isObservationFresh(observationAt, now = Date.now(), maxAgeHours = 12) {
  const observedMs = parseTimestamp(observationAt)
  if (observedMs == null) return { fresh: false, reason: 'missing', observedMs: null, ageHours: null }
  const ageHours = (now - observedMs) / 3600000
  if (ageHours < 0) return { fresh: false, reason: 'future', observedMs, ageHours }
  if (ageHours > maxAgeHours) return { fresh: false, reason: 'stale', observedMs, ageHours }
  return { fresh: true, reason: 'fresh', observedMs, ageHours }
}

export function matchesRegion(beach, regionId) {
  if (!beach || !regionId) return false
  if (beach.island && String(beach.island) === String(regionId)) return true
  const prefix = REGION_PREFIX[regionId]
  return !!(prefix && typeof beach.id === 'string' && beach.id.startsWith(prefix))
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const values = [aLat, aLon, bLat, bLon].map(Number)
  if (!values.every(Number.isFinite)) return Infinity
  const [a, b, c, d] = values
  if (Math.abs(a) > 90 || Math.abs(c) > 90 || Math.abs(b) > 180 || Math.abs(d) > 180) return Infinity
  const R = 6371
  const dLat = (c - a) * Math.PI / 180
  const dLon = (d - b) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)))
}

function rankBeaches(beaches, position) {
  return beaches.map(beach => ({
    ...beach,
    _distanceKm: position && beach.lat != null && beach.lng != null
      ? haversineKm(position.latitude, position.longitude, beach.lat, beach.lng)
      : null
  })).sort((a, b) => {
    const statusRank = (s) => s === 'clean' ? 2 : s === 'moderate' ? 1 : 0
    const statusDiff = statusRank(b.status) - statusRank(a.status)
    if (statusDiff) return statusDiff
    const scoreA = Number.isFinite(Number(a.score)) ? Number(a.score) : -Infinity
    const scoreB = Number.isFinite(Number(b.score)) ? Number(b.score) : -Infinity
    if (scoreA !== scoreB) return scoreB - scoreA
    if (Number.isFinite(a._distanceKm) && Number.isFinite(b._distanceKm)) return a._distanceKm - b._distanceKm
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

/**
 * Returns a small machine-readable recommendation result. UI copy is localized
 * separately. A selected avoid-status beach is never called a recommendation.
 */
export function getBeachRecommendation({
  beaches,
  observationAt,
  now = Date.now(),
  maxAgeHours = 12,
  regionId,
  position = null,
  manualId = ''
} = {}) {
  if (!Array.isArray(beaches) || beaches.length === 0) return { state: 'no_beaches' }

  const freshness = isObservationFresh(observationAt, now, maxAgeHours)
  if (!freshness.fresh) return { state: freshness.reason === 'stale' || freshness.reason === 'future' ? 'stale' : 'no_observation', freshness }

  const regional = beaches.filter(beach => matchesRegion(beach, regionId))
  if (!regional.length) return { state: 'no_regional_beaches', freshness }

  let pool = regional
  if (position) {
    pool = regional
      .map(beach => ({
        ...beach,
        _distanceKm: beach.lat != null && beach.lng != null
          ? haversineKm(position.latitude, position.longitude, beach.lat, beach.lng)
          : Infinity
      }))
      .filter(beach => beach._distanceKm <= 120)
    if (!pool.length) return { state: 'no_nearby_beaches', freshness }
  }

  const safe = rankBeaches(pool.filter(beach =>
    beach && (beach.status === 'clean' || beach.status === 'moderate')
  ), position)
  if (manualId) {
    const chosen = pool.find(beach => beach.id === manualId)
    if (!chosen) return { state: 'beach_not_found', freshness }
    const safeAlt = safe.find(beach => beach.id !== chosen.id) || null
    return {
      state: 'selected',
      chosen,
      alt: safeAlt,
      selectedIsAvoid: chosen.status === 'avoid',
      freshness,
      observationMs: freshness.observedMs
    }
  }

  if (!safe.length) return { state: 'no_recommended_beach', freshness }
  return {
    state: 'recommended',
    chosen: safe[0],
    alt: safe.find(beach => beach.id !== safe[0].id) || null,
    freshness,
    observationMs: freshness.observedMs
  }
}

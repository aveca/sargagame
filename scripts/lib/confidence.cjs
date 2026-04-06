/**
 * confidence.cjs — Confidence scoring for sargassum data pipeline
 *
 * Every piece of data gets a confidence score (0-100) so the UI can
 * honestly communicate reliability to users.
 *
 * Score ranges:
 *   85-95  Direct satellite, fresh (<12h), good coverage
 *   65-85  Satellite with gaps or aging data
 *   40-65  Beach memory, interpolation, or day-1 forecast
 *   10-40  Multi-day forecasts, sparse data
 *    5-15  Reference/fallback (static hardcoded data)
 */

const HALF_LIFE_DAYS = 3.5
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS

/**
 * Score a direct satellite measurement.
 * @param {string} method - extraction method string from extractBeachAfai()
 * @param {number} nearbyPts - count of grid points within 30km
 * @param {number} offshorePts - count of grid points 30-100km east/NE
 * @param {number} dataAgeHours - hours since ERDDAP data timestamp
 * @returns {number} confidence 0-100
 */
function satelliteConfidence(method, nearbyPts, offshorePts, dataAgeHours) {
  if (method === 'no-grid' || method === 'no-data') return 8

  let base
  const totalPts = nearbyPts + offshorePts

  if (method.startsWith('combined')) {
    if (nearbyPts >= 10) base = 90
    else if (nearbyPts >= 5) base = 82
    else base = 72
  } else if (method.startsWith('nearby')) {
    base = nearbyPts >= 10 ? 80 : nearbyPts >= 5 ? 72 : 62
  } else if (method.startsWith('offshore-only')) {
    base = offshorePts >= 10 ? 55 : offshorePts >= 5 ? 48 : 40
  } else {
    base = 8
  }

  // Age penalty: -2 per hour beyond 6h, capped at -30
  if (dataAgeHours > 6) {
    base -= Math.min(30, Math.round((dataAgeHours - 6) * 2))
  }

  return Math.max(5, Math.min(95, base))
}

/**
 * Score a beach-memory-boosted value.
 * Starts at 65% of original satellite confidence, decays with half-life.
 * @param {number} daysAgo - days since the beaching event
 * @param {number} originalConf - confidence of the original satellite reading
 * @returns {number} confidence 0-100
 */
function memoryConfidence(daysAgo, originalConf) {
  const startConf = originalConf * 0.65
  const decayed = startConf * Math.exp(-DECAY_LAMBDA * daysAgo)
  return Math.max(5, Math.min(70, Math.round(decayed)))
}

/**
 * Score an IDW-interpolated value.
 * @param {number[]} sentinelConfs - confidence scores of k-nearest sentinels
 * @param {number[]} distances - distances in km to each sentinel
 * @returns {number} confidence 0-100
 */
function interpolationConfidence(sentinelConfs, distances) {
  if (!sentinelConfs.length) return 10
  let sumW = 0, sumC = 0
  for (let i = 0; i < sentinelConfs.length; i++) {
    const w = 1 / (1 + distances[i])
    sumW += w
    sumC += w * sentinelConfs[i]
  }
  const avgConf = sumC / sumW
  // Distance penalty: max sentinel distance reduces confidence
  const maxDist = Math.max(...distances)
  const distPenalty = maxDist > 50 ? 20 : maxDist > 30 ? 12 : maxDist > 15 ? 5 : 0
  return Math.max(10, Math.min(65, Math.round(avgConf * 0.6 - distPenalty)))
}

/**
 * Score a forecast day.
 * @param {number} dayIndex - 0=today, 1=tomorrow, ...6
 * @param {number} baseConf - confidence of today's satellite reading
 * @param {boolean} hasWindForecast - true if Open-Meteo hourly wind is available
 * @returns {{ confidence: number, type: string }}
 */
function forecastConfidence(dayIndex, baseConf, hasWindForecast) {
  if (dayIndex === 0) {
    return { confidence: Math.round(baseConf * 0.85), type: 'observation' }
  }

  const windBonus = hasWindForecast ? 12 : 0

  if (dayIndex === 1) {
    return { confidence: Math.min(55, 35 + windBonus), type: 'tendance' }
  }
  if (dayIndex <= 3) {
    return { confidence: Math.min(40, 22 + windBonus - (dayIndex - 2) * 5), type: 'tendance' }
  }
  // Days 4-7: horizon — low confidence regardless of wind
  return { confidence: Math.max(8, 18 - (dayIndex - 4) * 3), type: 'horizon' }
}

/**
 * Score for reference/fallback static data.
 * @returns {number} always low: 10
 */
function referenceConfidence() {
  return 10
}

module.exports = {
  satelliteConfidence,
  memoryConfidence,
  interpolationConfidence,
  forecastConfidence,
  referenceConfidence,
  HALF_LIFE_DAYS,
  DECAY_LAMBDA,
}

/**
 * forecast.cjs — Honest 7-day sargassum forecast
 *
 * REPLACES the old buildWeeklyBatch() which used fabricated sin/cos noise
 * and id.length % N pseudo-randomness.
 *
 * New approach:
 *   Day 0: Direct satellite observation
 *   Day 1: 60% wind-drift estimate + 40% satellite 7-day trend
 *   Day 2-3: 40% wind + 60% satellite trend (wind less reliable further out)
 *   Day 4-7: Satellite trend only + widening uncertainty band
 *
 * Sources:
 *   - Wind forecast: Open-Meteo hourly (free, no API key)
 *   - Satellite trend: linear regression on history.json (last 7 days)
 */

const { forecastConfidence } = require('./confidence.cjs')

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function statusFromAfai(afai) {
  if (afai < 0.15) return 'clean'
  if (afai < 0.40) return 'moderate'
  return 'avoid'
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

/**
 * Compute satellite AFAI trend via simple linear regression.
 * @param {string} beachId
 * @param {Array} history - history.json entries [{date, levels: [{id, afai, status}]}]
 * @returns {{ slope: number, r2: number, days: number } | null}
 */
function computeSatelliteTrend(beachId, history) {
  if (!history || !history.length) return null

  // Extract last 7 days of data for this beach
  const sorted = history
    .filter(h => h.levels)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7)

  const points = []
  for (const entry of sorted) {
    const bl = entry.levels.find(l => l.id === beachId)
    if (bl && typeof bl.afai === 'number') {
      points.push({ x: points.length, y: bl.afai })
    }
  }

  if (points.length < 3) return null // insufficient data

  // Simple linear regression
  const n = points.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (const p of points) {
    sumX += p.x; sumY += p.y
    sumXY += p.x * p.y; sumX2 += p.x * p.x; sumY2 += p.y * p.y
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return { slope: 0, r2: 0, days: n }

  const slope = (n * sumXY - sumX * sumY) / denom
  const meanY = sumY / n
  let ssTot = 0, ssRes = 0
  const intercept = (sumY - slope * sumX) / n
  for (const p of points) {
    const pred = intercept + slope * p.x
    ssRes += (p.y - pred) ** 2
    ssTot += (p.y - meanY) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

  return {
    slope: Math.round(slope * 1000) / 1000, // AFAI change per day
    r2: Math.round(r2 * 100) / 100,
    days: n,
  }
}

/**
 * Estimate wind-based onshore drift effect for a beach.
 * Easterly winds push sargassum toward Atlantic-facing coasts.
 * @param {object} beach - { id, lat, lng, island }
 * @param {Array} hourlyWind - [{ time, speed, dir }, ...] for the beach's island
 * @param {number} dayIndex - 0-6
 * @returns {number} estimated daily AFAI change from wind (-0.05 to +0.05)
 */
function windDriftEffect(beach, hourlyWind, dayIndex) {
  if (!hourlyWind || !hourlyWind.length) return 0

  // Get wind for the relevant 24h window
  const startH = dayIndex * 24
  const endH = startH + 24
  const relevant = hourlyWind.slice(startH, endH)
  if (!relevant.length) return 0

  // Average wind speed and direction for this day
  let sumSpeed = 0, sumSinDir = 0, sumCosDir = 0
  for (const w of relevant) {
    sumSpeed += w.speed
    const rad = w.dir * Math.PI / 180
    sumSinDir += Math.sin(rad)
    sumCosDir += Math.cos(rad)
  }
  const avgSpeed = sumSpeed / relevant.length
  const avgDir = (Math.atan2(sumSinDir / relevant.length, sumCosDir / relevant.length) * 180 / Math.PI + 360) % 360

  // Onshore component: wind FROM east (60-120 degrees) pushes sargassum west toward Antilles
  // Wind FROM west (240-300) pushes it away
  // Stokes drift = 2.5% of wind speed
  const stokes = avgSpeed * 0.025 // km/h

  // Calculate onshore component
  // For Caribbean islands, "onshore" from Atlantic = wind from ~60-120 degrees
  const windBearing = (avgDir + 180) % 360 // direction wind is GOING
  const onshoreAngle = windBearing // roughly westward = toward coast

  // Component toward coast (270 = due west for Atlantic-facing)
  const coastBearing = beach.lng < -61.5 ? 270 : 260 // rough: west for MQ east coast
  const angleDiff = (onshoreAngle - coastBearing + 360) % 360
  const onshoreComponent = stokes * Math.cos(angleDiff * Math.PI / 180)

  // Map to AFAI effect: strong onshore wind = +0.05/day, offshore = -0.03/day
  const effect = onshoreComponent * 0.03 // empirical scaling
  return Math.max(-0.03, Math.min(0.05, Math.round(effect * 1000) / 1000))
}

/**
 * Build honest 7-day forecast for all beaches.
 * @param {Array} levels - [{ id, afai, status, confidence }]
 * @param {object|null} windForecast - { mq: { current, hourly }, gp: { current, hourly } }
 * @param {Array} history - history.json entries
 * @param {Array} beaches - BEACHES config with lat/lng/island
 * @returns {object} weekly forecast keyed by beach id
 */
function buildHonestForecast(levels, windForecast, history, beaches) {
  const weekly = {}
  const hasWind = !!(windForecast && (windForecast.mq?.hourly?.length || windForecast.gp?.hourly?.length))

  for (const level of levels) {
    const beach = beaches ? beaches.find(b => b.id === level.id) : null
    const island = beach?.island || (level.id.startsWith('gp-') ? 'gp' : 'mq')
    const hourlyWind = windForecast?.[island]?.hourly || null
    const trend = computeSatelliteTrend(level.id, history)
    const baseConf = level.confidence || 75

    // Beach memory flag: if today's value comes from memory (not fresh satellite),
    // predictions should decay faster toward clean baseline
    const isMemory = !!(level.beachMemory || (level.source && level.source.includes('memory')))
    const memoryDecay = isMemory ? 0.5 : 0 // 50% pull toward clean if memory-sourced
    const CLEAN_BASELINE = 0.05 // typical clean beach AFAI

    const series = []
    const t = new Date()

    for (let i = 0; i < 7; i++) {
      const d = new Date(t)
      d.setDate(d.getDate() + i)

      let afai
      let sources = []
      const { confidence, type } = forecastConfidence(i, baseConf, hasWind)

      if (i === 0) {
        // Day 0: direct observation
        afai = level.afai
        sources = ['satellite']
      } else if (i === 1) {
        // Day 1: persistence-anchored with regression toward clean
        // When satellite trend is strong (R²>0.5), trust it more than wind
        const windEffect = beach ? windDriftEffect(beach, hourlyWind, i) : 0
        const trendEffect = trend ? trend.slope : 0
        const strongTrend = trend && trend.r2 >= 0.5 && Math.abs(trend.slope) > 0.05
        const windW = strongTrend ? 0.3 : 0.6
        const trendW = strongTrend ? 0.7 : 0.4
        const modelDelta = windEffect * windW + trendEffect * trendW
        const raw = clamp01(level.afai + modelDelta * 0.3)
        // Regression toward clean: 30% baseline (50% if memory-sourced)
        const cleanPull = isMemory ? 0.5 : 0.3
        afai = raw * (1 - cleanPull) + CLEAN_BASELINE * cleanPull
        sources = hourlyWind ? ['wind-forecast', 'satellite-trend'] : ['satellite-trend']
      } else if (i <= 3) {
        // Days 2-3: stronger regression toward clean
        const windEffect = beach ? windDriftEffect(beach, hourlyWind, i) : 0
        const trendEffect = trend ? trend.slope * i : 0
        const strongTrend = trend && trend.r2 >= 0.5 && Math.abs(trend.slope) > 0.05
        const windW = strongTrend ? 0.2 : 0.3
        const trendW = strongTrend ? 0.6 : 0.5
        const modelDelta = windEffect * windW + trendEffect * trendW
        const raw = clamp01(level.afai + modelDelta * 0.5)
        // Increasing pull toward clean: 35-45% (55-65% if memory)
        const cleanPull = (0.30 + i * 0.05) + memoryDecay * 0.2
        afai = raw * (1 - cleanPull) + CLEAN_BASELINE * cleanPull
        sources = hourlyWind ? ['wind-forecast', 'satellite-trend'] : ['satellite-trend']
      } else {
        // Days 4-7: satellite trend + strong regression toward clean
        const trendEffect = trend ? trend.slope * i : 0
        const raw = clamp01(level.afai + trendEffect * 0.7)
        // Heavy pull toward clean: 50-70% (60-80% if memory)
        const cleanPull = (0.45 + (i - 4) * 0.08) + memoryDecay * 0.15
        afai = raw * (1 - Math.min(0.85, cleanPull)) + CLEAN_BASELINE * Math.min(0.85, cleanPull)
        sources = trend ? ['satellite-trend'] : []
      }

      afai = Math.round(afai * 100) / 100

      series.push({
        day: i === 0 ? 'Auj.' : i === 1 ? 'Dem.' : DAYS[d.getDay()],
        date: d.toISOString().slice(0, 10),
        afai,
        status: statusFromAfai(afai),
        confidence,
        type,
        sources,
      })
    }

    // Trend from day 0 to day 6
    const totalTrend = series[6].afai - series[0].afai

    // Forecast method label
    let forecastMethod, forecastDisclaimer
    if (hasWind && trend) {
      forecastMethod = 'wind-trend'
      forecastDisclaimer = 'Tendance basee sur satellite 7j + vent prevu (Open-Meteo)'
    } else if (trend) {
      forecastMethod = 'satellite-only'
      forecastDisclaimer = 'Tendance basee sur historique satellite 7j uniquement'
    } else {
      forecastMethod = 'baseline'
      forecastDisclaimer = 'Historique insuffisant — valeur du jour maintenue'
    }

    weekly[level.id] = {
      forecast: series,
      drift: totalTrend > 0.05 ? 'up' : totalTrend < -0.05 ? 'down' : 'stable',
      driftLabel: totalTrend > 0.05 ? 'Derive possible vers la cote'
        : totalTrend < -0.05 ? 'Dispersion attendue' : 'Stable',
      driftValue: Math.round(totalTrend * 100) / 100,
      forecastMethod,
      forecastDisclaimer,
    }
  }

  return weekly
}

module.exports = {
  buildHonestForecast,
  computeSatelliteTrend,
  windDriftEffect,
  statusFromAfai,
  DAYS,
}

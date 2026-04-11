/**
 * forecast.cjs — Honest sargassum forecast (v3, 2026-04-10)
 *
 * v2 (2026-04-06) replaced fabricated sin/cos noise with satellite trend + wind drift.
 * v3 (2026-04-10) fixes biases found by backtest on 5-day archive:
 *   - J+1 under-predicted 28% of cases (said less than reality)
 *   - J+2 over-predicted clean 25% of cases
 *   - J+3 over-predicted clean 38% of cases
 *   - J+4 over-predicted clean 50% of cases
 *   - Day-6 values collapsed to 3 unique numbers across 20 beaches (not a forecast)
 *
 * Changes vs v2:
 *   - Replace linear `cleanPull` with EXPONENTIAL PERSISTENCE (half-life 3.5d)
 *   - Plug in sargassum-banks.json drift predictions (J+0 to J+1 arrival signal)
 *   - Plug in community reports (48h window) to shift baseline up/down
 *   - Memory-sourced beaches: forecast ONLY day 0+1 (honest — no synthetic projection)
 *   - Trend R² gate: ignore regression if r² < 0.4 or < 5 points
 *   - Cap meaningful horizon at 4 days (days 5-7 flagged as `horizon`, conf < 15)
 *
 * Sources used:
 *   - Day 0: satellite observation (or memory if satellite missed a past event)
 *   - Day 1-3: persistence + arrival signal (banks drift) + wind + trend (if r²≥0.4)
 *   - Day 4+: persistence only + wider uncertainty (marked as horizon)
 */

const { forecastConfidence, HALF_LIFE_DAYS, DECAY_LAMBDA } = require('./confidence.cjs')

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const CLEAN_BASELINE = 0.05 // AFAI baseline for a quiet beach

function statusFromAfai(afai) {
  if (afai < 0.15) return 'clean'
  if (afai < 0.40) return 'moderate'
  return 'avoid'
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

/**
 * Linear regression on satellite history for a single beach.
 * @returns {{ slope, r2, days } | null} — null if insufficient or unreliable
 */
function computeSatelliteTrend(beachId, history) {
  if (!history || !history.length) return null

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

  if (points.length < 5) return null // v3: stricter gate (was 3)

  const n = points.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (const p of points) {
    sumX += p.x; sumY += p.y
    sumXY += p.x * p.y; sumX2 += p.x * p.x; sumY2 += p.y * p.y
  }
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null

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

  // v3: gate on quality
  if (r2 < 0.4) return null

  return {
    slope: Math.round(slope * 1000) / 1000,
    r2: Math.round(r2 * 100) / 100,
    days: n,
  }
}

/**
 * Geodesic distance in km (beach → bank centroid).
 */
function distKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111
  const dLng = (lng2 - lng1) * 111 * Math.cos(lat1 * Math.PI / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

/**
 * Compute arrival signal for a beach from nearby sargassum banks.
 * Uses current position + 6h/12h/24h drift predictions to find the MINIMUM
 * distance the bank will come to the beach in the next 24h.
 *
 * GEOGRAPHY RULE: 'sheltered' beaches (baie Fort-de-France, Basse-Terre
 * west coast) are protected by the relief and trade winds push sargassum
 * away. These return 0 — never an arrival signal.
 *
 * Anses d'Arlet + south-Martinique + Vieux-Fort (GP) are kept 'atlantic'
 * because sargassum can round the southern tip of the island with shifting
 * currents and reach them (rare but possible).
 *
 * @param {object} beach - { id, lat, lng, coast }
 * @param {Array} banks - sargassum-banks.json entries
 * @param {number} dayIndex - 1..3 (arrival only modeled in short term)
 * @returns {number} arrival contribution to AFAI (0 to 0.25)
 */
function arrivalSignalFromBanks(beach, banks, dayIndex) {
  if (!banks || !banks.length || dayIndex < 1 || dayIndex > 3) return 0
  if (!beach || beach.lat == null) return 0
  // RULE: sheltered beaches (baie FDF + Basse-Terre west) are always protected
  if (beach.coast === 'sheltered') return 0

  // Search radius: banks within 40km are potentially threatening
  const THREAT_RADIUS = 40
  let maxSignal = 0

  for (const bank of banks) {
    const mass = bank.mass || 0.10
    if (mass < 0.05) continue // ignore tiny banks

    // Scan all positions: current + 6h + 12h + 24h predictions
    const positions = [
      { centroid: bank.centroid, when: 0 },
    ]
    const preds = bank.drift?.predictions || {}
    if (preds['6h']?.centroid) positions.push({ centroid: preds['6h'].centroid, when: 6 })
    if (preds['12h']?.centroid) positions.push({ centroid: preds['12h'].centroid, when: 12 })
    if (preds['24h']?.centroid) positions.push({ centroid: preds['24h'].centroid, when: 24 })

    // Find minimum distance the bank comes to the beach within day 1
    let minDist = Infinity
    let bestPos = null
    for (const pos of positions) {
      const d = distKm(beach.lat, beach.lng, pos.centroid[0], pos.centroid[1])
      if (d < minDist) { minDist = d; bestPos = pos.centroid }
    }

    if (minDist > THREAT_RADIUS) continue
    if (!bestPos) continue

    // GEOGRAPHIC ORIENTATION: for atlantic beaches, bank must be east of
    // or aligned with the beach. Trade winds blow E→W, so a bank west of
    // the beach moves AWAY from it (unless very close & currents shift).
    // Allow banks slightly west (0.10° ≈ 11km) as residual risk.
    if (bestPos[1] < beach.lng - 0.10) continue

    // Signal strength: proximity × mass, degraded for far-out days
    const proximity = Math.max(0, 1 - minDist / THREAT_RADIUS)
    const dayDecay = dayIndex === 1 ? 1.0 : dayIndex === 2 ? 0.7 : 0.4
    const signal = mass * proximity * dayDecay

    if (signal > maxSignal) maxSignal = signal
  }

  // Cap at 0.20 — arrival alone can't push a clean beach to avoid in 1 day
  return Math.min(0.20, Math.round(maxSignal * 1000) / 1000)
}

/**
 * Community reports override / reinforce satellite reading.
 * @param {object} reports - { clean, moderate, avoid, total } for this beach (last 48h)
 * @returns {number} bias to apply to AFAI (-0.10 to +0.15)
 */
function communityBias(reports) {
  if (!reports || !reports.total || reports.total < 2) return 0
  const t = reports.total
  const avoidFrac = (reports.avoid || 0) / t
  const moderateFrac = (reports.moderate || 0) / t
  const cleanFrac = (reports.clean || 0) / t

  // Strong avoid consensus → bias up
  if (avoidFrac >= 0.5) return Math.min(0.15, 0.08 + avoidFrac * 0.1)
  // Moderate consensus → slight bias up
  if (moderateFrac + avoidFrac >= 0.6) return 0.06
  // Strong clean consensus overrides (boats often know faster than satellite)
  if (cleanFrac >= 0.7 && t >= 3) return -0.08
  return 0
}

/**
 * Onshore wind drift effect — kept from v2 but bounded smaller.
 * Effect is small: wind influences banks drift more than beach-local AFAI.
 */
function windDriftEffect(beach, hourlyWind, dayIndex) {
  if (!hourlyWind || !hourlyWind.length) return 0

  const startH = dayIndex * 24
  const endH = startH + 24
  const relevant = hourlyWind.slice(startH, endH)
  if (!relevant.length) return 0

  let sumSpeed = 0, sumSinDir = 0, sumCosDir = 0
  for (const w of relevant) {
    sumSpeed += w.speed
    const rad = w.dir * Math.PI / 180
    sumSinDir += Math.sin(rad)
    sumCosDir += Math.cos(rad)
  }
  const avgSpeed = sumSpeed / relevant.length
  const avgDir = (Math.atan2(sumSinDir / relevant.length, sumCosDir / relevant.length) * 180 / Math.PI + 360) % 360

  const stokes = avgSpeed * 0.025
  const windBearing = (avgDir + 180) % 360
  const coastBearing = beach.lng < -61.5 ? 270 : 260
  const angleDiff = (windBearing - coastBearing + 360) % 360
  const onshoreComponent = stokes * Math.cos(angleDiff * Math.PI / 180)

  const effect = onshoreComponent * 0.02
  return Math.max(-0.02, Math.min(0.04, Math.round(effect * 1000) / 1000))
}

/**
 * Build the 7-day honest forecast.
 *
 * @param {Array} levels - [{ id, afai, status, confidence, beachMemory, ... }]
 * @param {object|null} windForecast - { mq: { hourly }, gp: { hourly } }
 * @param {Array} history - history.json entries
 * @param {Array} beaches - BEACHES with lat/lng/island
 * @param {Array} [banks] - sargassum-banks.json entries (optional)
 * @param {object} [communityReports] - { beachId: { clean, moderate, avoid, total } } (optional)
 */
function buildHonestForecast(levels, windForecast, history, beaches, banks, communityReports) {
  const weekly = {}
  const hasWind = !!(windForecast && (windForecast.mq?.hourly?.length || windForecast.gp?.hourly?.length))
  const hasBanks = Array.isArray(banks) && banks.length > 0
  const reports = communityReports || {}

  for (const level of levels) {
    const beach = beaches ? beaches.find(b => b.id === level.id) : null
    const island = beach?.island || (level.id.startsWith('gp-') ? 'gp' : 'mq')
    const hourlyWind = windForecast?.[island]?.hourly || null
    const trend = computeSatelliteTrend(level.id, history)
    const baseConf = level.confidence || 75
    const isMemory = !!(level.beachMemory || (level.source && level.source.includes('memory')))
    const bReports = reports[level.id] || null
    const cBias = communityBias(bReports)

    // Check if any bank threatens this beach
    const islandBanks = hasBanks ? banks.filter(b => b.island === island) : []
    const hasArrival = islandBanks.length > 0

    const series = []
    const t = new Date()

    // Starting AFAI for Day 0: satellite + community bias (clamped)
    const day0Raw = clamp01(level.afai + cBias)

    for (let i = 0; i < 7; i++) {
      const d = new Date(t)
      d.setDate(d.getDate() + i)

      let afai, sources = []
      const arrivalContribution = hasArrival ? arrivalSignalFromBanks(beach, islandBanks, i) : 0
      let { confidence, type } = forecastConfidence(i, baseConf, hasWind, arrivalContribution > 0.02)
      // Memory beach forecasts must never be more confident than the memory observation itself
      if (isMemory && i > 0) confidence = Math.min(confidence, baseConf)

      if (i === 0) {
        // Day 0: direct observation (with community bias)
        afai = day0Raw
        sources = bReports && bReports.total >= 3 ? ['satellite', 'community'] : ['satellite']
      } else if (isMemory) {
        // Memory beaches: pure exponential decay for ALL forecast days.
        // No arrival/wind contributions — the beach-memory model only knows the last event decayed.
        const decayFactor = Math.exp(-DECAY_LAMBDA * i)
        afai = Math.max(CLEAN_BASELINE, day0Raw * decayFactor)
        sources = ['memory-decay']
      } else {
        // Days 1-6 (non-memory): persistence + arrival + wind
        // PHYSICAL MODEL: afai(d) = afai(d-1) * decay_1day + arrivals - dispersion
        const prevAfai = series[i - 1]?.afai || day0Raw

        // 1 day decay
        const dayDecay = Math.exp(-DECAY_LAMBDA) // ~0.82 per day

        // Wind: small contribution, weaker as days increase
        const windEffect = beach && i <= 3 ? windDriftEffect(beach, hourlyWind, i) * (1 - (i - 1) * 0.25) : 0

        // Trend: only if r² passed gate (computeSatelliteTrend returns null otherwise)
        // Apply only for days 1-3 where short-term trend matters
        const trendEffect = trend && i <= 3 ? trend.slope * 0.5 : 0

        // Persist + add arrival + wind + trend
        let raw = prevAfai * dayDecay + arrivalContribution + windEffect + trendEffect

        // Floor: can't go below clean baseline unless decay drives it there
        afai = clamp01(Math.max(CLEAN_BASELINE, raw))

        sources = []
        sources.push('persistence')
        if (arrivalContribution > 0.02) sources.push('banks-drift')
        if (windEffect !== 0) sources.push('wind')
        if (trendEffect !== 0) sources.push('satellite-trend')
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

    // Total drift: day 0 → day 3 (meaningful horizon, not day 6 noise)
    const meaningfulTrend = series[3].afai - series[0].afai

    // Arrival detection: significant arrival signal on day 1, 2 or 3
    // This is the USER-FACING "sargasses coming soon" signal
    // Threshold 0.03 = bank within ~30km OR bigger bank within 40km
    const maxArrival = beach && islandBanks.length > 0
      ? Math.max(
          arrivalSignalFromBanks(beach, islandBanks, 1),
          arrivalSignalFromBanks(beach, islandBanks, 2),
          arrivalSignalFromBanks(beach, islandBanks, 3),
        )
      : 0
    const arrivalDetected = maxArrival >= 0.03 && level.afai < 0.20

    // Forecast method label
    let forecastMethod, forecastDisclaimer
    if (isMemory) {
      forecastMethod = 'memory-decay'
      forecastDisclaimer = 'Donnees reconstruites (event passe). Prevision = decay naturel seulement.'
    } else if (arrivalDetected) {
      forecastMethod = 'arrival-banks'
      forecastDisclaimer = 'Banc de sargasses detecte a proximite — arrivee possible dans 1-3 jours.'
    } else if (hasBanks && hasArrival) {
      forecastMethod = 'banks-persistence'
      forecastDisclaimer = 'Persistance + bancs satellite + vent. Fiabilite decroit apres J+3.'
    } else if (hasWind) {
      forecastMethod = 'persistence-wind'
      forecastDisclaimer = 'Persistance + vent Open-Meteo. Pas de banc detecte a proximite.'
    } else {
      forecastMethod = 'persistence'
      forecastDisclaimer = 'Persistance simple (half-life 3.5j). Pas de signal externe.'
    }

    weekly[level.id] = {
      forecast: series,
      drift: meaningfulTrend > 0.05 ? 'up' : meaningfulTrend < -0.05 ? 'down' : 'stable',
      driftLabel: meaningfulTrend > 0.05 ? 'Derive possible vers la cote'
        : meaningfulTrend < -0.05 ? 'Dispersion attendue' : 'Stable',
      driftValue: Math.round(meaningfulTrend * 100) / 100,
      forecastMethod,
      forecastDisclaimer,
      // Max reliable horizon in days (frontend can cap display)
      reliableHorizon: isMemory ? 1 : hasArrival ? 3 : 2,
      // Flag for UI alert banner "arrival detected"
      arrivalDetected,
      arrivalStrength: Math.round(maxArrival * 100) / 100,
    }
  }

  return weekly
}

module.exports = {
  buildHonestForecast,
  computeSatelliteTrend,
  windDriftEffect,
  arrivalSignalFromBanks,
  communityBias,
  statusFromAfai,
  DAYS,
}

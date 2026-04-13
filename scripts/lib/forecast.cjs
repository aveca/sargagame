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

function cleanFloorFor() {
  return CLEAN_BASELINE
}

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

    // GEOGRAPHIC ORIENTATION: bank must be in the "incoming" direction for this beach.
    // Uses coastNormal (direction the coast faces) to define a 140° acceptance cone.
    // A bank outside this cone is drifting away from the beach, not toward it.
    const cn = beach.coastNormal || 90 // default: faces east (old behavior)
    const bankBearing = Math.round((Math.atan2(bestPos[1] - beach.lng, bestPos[0] - beach.lat) * 180 / Math.PI + 360) % 360)
    // Accept banks within 70° of coastNormal (symmetric cone)
    let diff = Math.abs(bankBearing - cn)
    if (diff > 180) diff = 360 - diff
    if (diff > 70 && minDist > 15) continue // reject if outside cone AND not very close

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
  // Age-weighted counts: recent reports matter more (7-day window)
  const r24 = reports.recent24h || {}
  const p48 = reports.prev24_48h || {}
  const r24Total = (r24.clean || 0) + (r24.moderate || 0) + (r24.avoid || 0)
  const p48Total = (p48.clean || 0) + (p48.moderate || 0) + (p48.avoid || 0)
  const olderTotal = Math.max(0, reports.total - r24Total - p48Total)
  // Weighted: 0-24h=1.0, 24-48h=0.6, 48h-7d=0.3
  const wClean = (r24.clean || 0) * 1.0 + (p48.clean || 0) * 0.6 + Math.max(0, (reports.clean || 0) - (r24.clean || 0) - (p48.clean || 0)) * 0.3
  const wMod = (r24.moderate || 0) * 1.0 + (p48.moderate || 0) * 0.6 + Math.max(0, (reports.moderate || 0) - (r24.moderate || 0) - (p48.moderate || 0)) * 0.3
  const wAvoid = (r24.avoid || 0) * 1.0 + (p48.avoid || 0) * 0.6 + Math.max(0, (reports.avoid || 0) - (r24.avoid || 0) - (p48.avoid || 0)) * 0.3
  const t = wClean + wMod + wAvoid
  if (t < 1.5) return 0 // ~2 recent reports minimum
  const avoidFrac = wAvoid / t
  const moderateFrac = wMod / t
  const cleanFrac = wClean / t

  // Strong avoid consensus → bias up
  if (avoidFrac >= 0.5) return Math.min(0.15, 0.08 + avoidFrac * 0.1)
  // Moderate consensus → slight bias up
  if (moderateFrac + avoidFrac >= 0.6) return 0.06
  // Strong clean consensus overrides (boats often know faster than satellite)
  if (cleanFrac >= 0.7 && t >= 2.5) return -0.08
  return 0
}

/**
 * Surface drift effect (wind + waves + ocean current → onshore component).
 * Uses real marine data (waves for physical Stokes drift, current direction)
 * when available. Falls back to wind-based 2.5% Stokes estimate if not.
 */
function windDriftEffect(beach, hourlyWind, dayIndex, marineData) {
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

  // Stokes drift: prefer wave-based physical calculation from marine data
  const island = beach.island || (beach.lat < 15.5 ? 'mq' : 'gp')
  const marine = marineData?.[island]
  const marineH = marine?.hourly?.slice(startH, Math.min(endH, (marine?.hourly?.length || 0)))
  let stokes, driftBearing
  if (marineH?.length > 0) {
    // Physical Stokes drift from waves: V_s ≈ 0.016 * H² / T (m/s → km/h)
    let sumStk = 0, sumStkSin = 0, sumStkCos = 0, n = 0
    for (const mh of marineH) {
      if (mh.waveH > 0 && mh.wavePeriod > 1) {
        const s = 0.016 * (mh.waveH ** 2) / mh.wavePeriod * 3.6 // km/h
        const dir = (mh.waveDir + 180) % 360 // push direction
        sumStk += s; sumStkSin += Math.sin(dir * Math.PI / 180); sumStkCos += Math.cos(dir * Math.PI / 180); n++
      }
    }
    if (n > 0) {
      stokes = sumStk / n
      driftBearing = (Math.atan2(sumStkSin / n, sumStkCos / n) * 180 / Math.PI + 360) % 360
    } else {
      stokes = avgSpeed * 0.025
      driftBearing = (avgDir + 180) % 360
    }
  } else {
    stokes = avgSpeed * 0.025
    driftBearing = (avgDir + 180) % 360
  }

  // coastNormal: direction the coast faces. Drift pushing in that direction is "onshore".
  const coastBearing = beach.coastNormal || (beach.lng < -61.5 ? 270 : 260)
  const angleDiff = (driftBearing - coastBearing + 360) % 360
  const onshoreComponent = stokes * Math.cos(angleDiff * Math.PI / 180)

  // Ocean current contribution (adds to onshore push)
  let currentOnshore = 0
  if (marine?.current?.speed) {
    const curKmh = marine.current.speed * 3.6
    const curAngle = (marine.current.dir - coastBearing + 360) % 360
    currentOnshore = curKmh * Math.cos(curAngle * Math.PI / 180) * 0.01 // scaled down
  }

  const effect = (onshoreComponent * 0.035) + currentOnshore
  return Math.max(-0.04, Math.min(0.08, Math.round(effect * 1000) / 1000))
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
function buildHonestForecast(levels, windForecast, history, beaches, banks, communityReports, marineData) {
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
        afai = Math.max(cleanFloorFor(beach), day0Raw * decayFactor)
        sources = ['memory-decay']
      } else {
        // Days 1-6 (non-memory): persistence + arrival + wind
        // PHYSICAL MODEL: afai(d) = afai(d-1) * decay_1day + arrivals - dispersion
        const prevAfai = series[i - 1]?.afai || day0Raw

        // 1 day decay
        const dayDecay = Math.exp(-DECAY_LAMBDA) // ~0.87 per day @ half-life 5.0

        // Wind: small contribution, weaker as days increase
        const windEffect = beach && i <= 3 ? windDriftEffect(beach, hourlyWind, i, marineData) * (1 - (i - 1) * 0.25) : 0

        // Trend: only if r² passed gate (computeSatelliteTrend returns null otherwise)
        // Apply only for days 1-3 where short-term trend matters
        const trendEffect = trend && i <= 3 ? trend.slope * 0.5 : 0

        // Persist + add arrival + wind + trend
        let raw = prevAfai * dayDecay + arrivalContribution + windEffect + trendEffect

        // Coast-aware floor: atlantic beaches never go cleaner than 0.15
        afai = clamp01(Math.max(cleanFloorFor(beach), raw))

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

    // arrivalDetected overrides trend-based drift only when signal is strong enough (>=0.05).
    // Weak borderline signals (0.03–0.04) still set forecastMethod=arrival-banks but don't
    // override the drift label — the actual trajectory determines drift in that case.
    const strongArrival = arrivalDetected && maxArrival >= 0.05
    const driftDir = strongArrival ? 'up'
      : meaningfulTrend > 0.05 ? 'up'
      : meaningfulTrend < -0.05 ? 'down'
      : 'stable'
    const driftLbl = strongArrival ? 'Arrivee imminente (banc detecte)'
      : meaningfulTrend > 0.05 ? 'Derive possible vers la cote'
      : meaningfulTrend < -0.05 ? 'Dispersion attendue'
      : 'Stable'

    weekly[level.id] = {
      forecast: series,
      drift: driftDir,
      driftLabel: driftLbl,
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

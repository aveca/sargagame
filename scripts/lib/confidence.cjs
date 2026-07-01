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

// v3.1 (2026-04-12): half-life 3.5 → 5.0 after backtest showed 66% J+1 hit
// (< 75% threshold) + chronic "over-predicts clean" bias at J+1..J+4.
// Slower decay (~13%/day vs 18%/day) keeps sargassum persistence on atlantic
// beaches without hurting the already-strong J+4 85% hit rate.
const HALF_LIFE_DAYS = 5.0
const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS

// v3.2 (2026-07-01): SEPARATE the two physics. The 5-day half-life above models
// SEA dispersion — floating sargassum drifts/scatters in days. But sargassum
// already BEACHED on the sand does NOT clear on that timescale: without
// collection (ramassage), a boom (barrage) or a strong retreating swell it stays
// and rots over WEEKS. Applying the sea half-life to an already-loaded beach is
// why a red beach absurdly greened in 3-6 days — and it matches the measured
// over-prediction of "clean" at J+2..J+4 (forecast.cjs backtest header). The
// beach STOCK gets this slower half-life; it is a physics prior (no active-season
// ground truth in the current calm window to fit it), re-tune against the
// reforecast backtest once échouage data accumulates. Only ever applied to a
// beach already ≥moderate with no clearing evidence, so calm season is untouched.
const BEACHED_HALF_LIFE_DAYS = 12.0
const BEACHED_DECAY_LAMBDA = Math.LN2 / BEACHED_HALF_LIFE_DAYS

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
function forecastConfidence(dayIndex, baseConf, hasWindForecast, hasArrivalSignal) {
  if (dayIndex === 0) {
    // Day 0 = direct observation, confidence IS the satellite/memory confidence
    return { confidence: Math.round(baseConf), type: 'observation' }
  }

  const windBonus = hasWindForecast ? 8 : 0
  const arrivalBonus = hasArrivalSignal ? 10 : 0

  if (dayIndex === 1) {
    // Backtest (5d archive): J+1 under-predicts 28% vs over-predicts 18%.
    // Baseline honest confidence ~40 (not 55). Boost when banks signal arrival.
    return { confidence: Math.min(60, 38 + windBonus + arrivalBonus), type: 'tendance' }
  }
  if (dayIndex <= 3) {
    // Backtest J+2: over-predict clean 25%. J+3: over-predict clean 38%.
    // Confidence drops fast.
    return { confidence: Math.min(45, 25 + windBonus + arrivalBonus - (dayIndex - 2) * 6), type: 'tendance' }
  }
  // Days 4-7: HORIZON — backtest J+4 shows 50% over-predict clean.
  // Explicit low confidence to flag unreliable predictions. Frontend should hide.
  return { confidence: Math.max(5, 12 - (dayIndex - 4) * 3), type: 'horizon' }
}

/**
 * Score for reference/fallback static data.
 * @returns {number} always low: 10
 */
function referenceConfidence() {
  return 10
}

// ---------------------------------------------------------------------------
// PER-REGIME CONFIDENCE (2026-06-15)
//
// The global "80% justes" figure is a blend that HIDES a regime. The re-forecast
// backtest over the May–June 2026 calm window (history.json, all observations
// clean, zero real arrivals) measured, per (regime × predicted-status):
//
//   calm | predicted clean  →  100% reliable  (2301/2301)
//   calm | predicted ALERT  →    0% reliable  (0/519)   ← every calm alert was wrong
//
// So a single global number is dishonest: in the calm regime our CLEAN calls are
// rock-solid and our ALERT calls are worse than a coin flip. We must surface
// confidence CONDITIONED on the regime + the direction we're predicting.
//
// `classifyRegime` keys off the beach's OWN recent observed level (not the
// calendar) — the honest definition of "is this beach in a quiet stretch or an
// active one". `regimeCeiling` caps the per-day confidence so a calm-season
// alert can never be shown as trustworthy, while clean calls keep their natural
// (conservative, horizon-decayed) confidence. It only ever LOWERS a number —
// never inflates — and never pins an AFAI value (that is the forecast's job).
// ---------------------------------------------------------------------------

// Regime thresholds on the beach's recent observed AFAI mean (+ today's reading).
// Deliberately wide neutral band so a beach must be clearly quiet to be "calm".
const REGIME_CALM_MAX = 0.12   // recent mean below this = calm stretch
const REGIME_HIGH_MIN = 0.25   // recent mean above this = active stretch

/**
 * Classify the conditions regime for a beach from its OWN recent observations.
 * @param {number} recentMeanAfai - mean observed AFAI over the trailing window
 * @param {number} day0Afai - today's observed AFAI (current reading)
 * @returns {'calm'|'transition'|'high'|'unknown'}
 */
function classifyRegime(recentMeanAfai, day0Afai) {
  if (recentMeanAfai == null || !isFinite(recentMeanAfai)) {
    // Fall back to today's reading alone if we have no history window.
    if (day0Afai == null || !isFinite(day0Afai)) return 'unknown'
    return day0Afai < 0.15 ? 'calm' : day0Afai >= 0.40 ? 'high' : 'transition'
  }
  // A spike in today's reading (>= avoid) overrides a quiet trailing mean.
  if (day0Afai != null && day0Afai >= 0.40) return 'high'
  if (recentMeanAfai < REGIME_CALM_MAX && (day0Afai == null || day0Afai < 0.15)) return 'calm'
  if (recentMeanAfai >= REGIME_HIGH_MIN || (day0Afai != null && day0Afai >= 0.40)) return 'high'
  return 'transition'
}

// Empirical reliability per (regime × predicted-status), from the re-forecast
// backtest. Used BOTH as the per-day confidence ceiling and as the app/page-
// facing "fiabilité par régime" stat. Calm+alert is held low (not literally 0:
// one quiet month can't prove an alert is ALWAYS wrong, but it must read as
// "ne pas se fier"). Calm+clean is capped at 90 — high, but not the literal
// 100% we measured, since a single calm window isn't proof of permanence.
const REGIME_RELIABILITY = {
  calm:       { clean: 90, alert: 30 },
  transition: { clean: 72, alert: 50 },
  high:       { clean: 75, alert: 80 },
  unknown:    { clean: 65, alert: 55 },
}

// Calm-season CLEAN confidence FLOOR by horizon. The backtest showed calm +
// predicted-clean is empirically ~100% reliable at EVERY horizon (clean persists
// in a quiet stretch), yet the raw horizon-decay collapses stated confidence to
// 6–12% by J+4 — we were HIDING our own reliability (the worst thing for a
// product whose pitch is "trust the data"). This lifts calm-clean confidence to a
// conservative, still-horizon-decaying curve, deliberately well below the
// measured 100% (one calm month is not proof of permanence). Applied ONLY to
// calm+clean, never above the day-0 observation confidence, never for memory
// beaches. The mirror of the calm+alert cap.
const CALM_CLEAN_CONF_FLOOR = { 1: 68, 2: 62, 3: 56, 4: 50, 5: 44, 6: 40 }

/**
 * The per-day confidence ceiling for a (regime, predicted-status) pair.
 * @param {string} regime - from classifyRegime
 * @param {string} predictedStatus - 'clean' | 'moderate' | 'avoid'
 * @returns {number}
 */
function regimeCeiling(regime, predictedStatus) {
  const r = REGIME_RELIABILITY[regime] || REGIME_RELIABILITY.unknown
  const isAlert = predictedStatus === 'moderate' || predictedStatus === 'avoid'
  return isAlert ? r.alert : r.clean
}

/**
 * Regime-calibrate a forecast day's confidence: CAP alerts and FLOOR clean calls
 * to their measured reliability. Day 0 (direct observation) is untouched.
 *   - calm + ALERT  → capped (≤30): a calm-season alert can't read as trustworthy.
 *   - calm + CLEAN  → floored (horizon-decaying ~68→40): stop hiding that clean
 *                     persists in a quiet stretch. Floor never exceeds the day-0
 *                     base confidence, and is suppressed for memory beaches.
 *   - other regimes → cap only (no data yet to justify raising them).
 * Only ever moves confidence TOWARD the measured reliability; never invents it.
 * @param {number} dayConf - horizon-decayed confidence from forecastConfidence
 * @param {string} regime
 * @param {string} predictedStatus
 * @param {number} dayIndex
 * @param {{ allowFloor?: boolean, baseConf?: number }} [opts] - allowFloor=false for memory beaches
 * @returns {number}
 */
function regimeAdjustedConfidence(dayConf, regime, predictedStatus, dayIndex, opts) {
  if (dayIndex === 0) return dayConf
  const isAlert = predictedStatus === 'moderate' || predictedStatus === 'avoid'
  let conf = Math.min(dayConf, regimeCeiling(regime, predictedStatus))
  if (!isAlert && regime === 'calm' && opts && opts.allowFloor) {
    let floor = CALM_CLEAN_CONF_FLOOR[dayIndex] || 0
    if (opts.baseConf != null) floor = Math.min(floor, opts.baseConf) // never claim more than the observation
    conf = Math.max(conf, floor)
  }
  return Math.round(conf)
}

/**
 * App/page-facing reliability summary for a beach's current regime. Lets the UI
 * show "saison calme : prévisions propres très fiables, alertes peu fiables"
 * instead of a single misleading global %.
 * @param {string} regime
 * @returns {{ regime: string, cleanReliability: number, alertReliability: number }}
 */
function regimeConfidenceSummary(regime) {
  const r = REGIME_RELIABILITY[regime] || REGIME_RELIABILITY.unknown
  return { regime, cleanReliability: r.clean, alertReliability: r.alert }
}

// ---------------------------------------------------------------------------
// GROUND-TRUTH TERRAIN — DISPLAY-ONLY reliability haircut (v3.3, 2026-07-01)
//
// When the founder validates a cleanup (clé 2 « Rétrograder », GTT spec
// docs/GROUND_TRUTH_TERRAIN.md), the satellite verdict was contradicted by
// verified ground truth → the DISPLAYED reliability for that beach should drop
// (honesty: we were wrong on the ground). This is a SEPARATE lane from the
// numeric confidence: it is NEVER fed into satelliteConfidence /
// forecastConfidence / regimeCeiling / regimeAdjustedConfidence, so the
// satellite-pure verdict and the /fiabilite/ calibration stay 100% satellite
// (loi moat : « /fiabilite/ sur satellite pur, le calque terrain n'y entre
// JAMAIS »). It only lowers a DISPLAY note. Max −25, floor 15, half-life 1 day,
// TTL 48 h (a downgrade's relevance fades fast; the satellite re-anchors at the
// next pass). Pure function, injectable clock → unit-testable, deterministic.
// ---------------------------------------------------------------------------
const GROUND_REL_MAX_DELTA = 25       // strongest haircut, at the moment of validation
const GROUND_REL_FLOOR = 15           // never show a reliability below this
const GROUND_REL_TTL_DAYS = 2.0       // 48 h, matches the descente overlay TTL
const GROUND_REL_HALF_LIFE_DAYS = 1.0
const GROUND_REL_LAMBDA = Math.LN2 / GROUND_REL_HALF_LIFE_DAYS

/**
 * DISPLAY-ONLY reliability delta from a founder-validated ground-truth downgrade.
 * Returns a NON-POSITIVE number (0 or negative) to ADD to a displayed reliability %.
 * ISOLATED: never enters the numeric confidence pipeline. Returns 0 when there is
 * no confirmation, it is in the future, it has expired (>48 h), or the input is
 * unparseable.
 * @param {number|string|null|undefined} confirmedAt - downgrade_confirmed_at (ms epoch or ISO)
 * @param {number} [nowMs] - current time in ms (injectable for tests/determinism)
 * @returns {number} delta in [-25, 0]
 */
function groundReliabilityDelta(confirmedAt, nowMs) {
  if (confirmedAt == null) return 0
  const t = typeof confirmedAt === 'number' ? confirmedAt : Date.parse(confirmedAt)
  if (!isFinite(t)) return 0
  const now = (typeof nowMs === 'number' && isFinite(nowMs)) ? nowMs : Date.now()
  const daysAgo = (now - t) / 86400000
  if (daysAgo < 0 || daysAgo > GROUND_REL_TTL_DAYS) return 0
  const decayed = GROUND_REL_MAX_DELTA * Math.exp(-GROUND_REL_LAMBDA * daysAgo)
  return -Math.round(decayed)
}

/**
 * Apply the ground-truth haircut to a DISPLAYED reliability %, clamped to the
 * floor. Pure display; never touches numeric confidence. If there is no active
 * downgrade the input is returned unchanged.
 * @param {number} displayedPct - satellite-derived reliability % (e.g. cleanReliabilityPct)
 * @param {number|string|null|undefined} confirmedAt
 * @param {number} [nowMs]
 * @returns {number}
 */
function applyGroundReliability(displayedPct, confirmedAt, nowMs) {
  const delta = groundReliabilityDelta(confirmedAt, nowMs)
  if (!delta) return displayedPct
  return Math.max(GROUND_REL_FLOOR, Math.round(displayedPct + delta))
}

module.exports = {
  satelliteConfidence,
  memoryConfidence,
  interpolationConfidence,
  forecastConfidence,
  referenceConfidence,
  classifyRegime,
  regimeCeiling,
  regimeAdjustedConfidence,
  regimeConfidenceSummary,
  REGIME_RELIABILITY,
  HALF_LIFE_DAYS,
  DECAY_LAMBDA,
  BEACHED_HALF_LIFE_DAYS,
  BEACHED_DECAY_LAMBDA,
  groundReliabilityDelta,
  applyGroundReliability,
  GROUND_REL_MAX_DELTA,
  GROUND_REL_FLOOR,
  GROUND_REL_TTL_DAYS,
}

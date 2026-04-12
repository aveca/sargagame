/**
 * Beach Score Engine — v1
 *
 * Computes a 0-100 score per beach from multi-factor signals.
 * Pure functions, no I/O. Inputs are ready-to-score snapshots.
 *
 * Intent: year-round relevance. Sargassum is one of 7 factors and weighs 30% max.
 * In off-season (Oct-Mar, typically clean), score differentiation comes from
 * waves/wind/sun/water-temp, so the product stays useful 365 days a year.
 *
 * Weights (sum = 100):
 *   - sargassum   30
 *   - wave height 20
 *   - wind speed  15
 *   - water temp  10
 *   - cloud cover 10
 *   - UV index    10
 *   - tide        5
 */

const WEIGHTS = {
  sargassum: 30,
  wave: 20,
  wind: 15,
  sst: 10,
  cloud: 10,
  uv: 10,
  tide: 5,
}

// ---- Per-factor scoring functions ----

function scoreSargassum(afai) {
  if (afai == null) return 18 // unknown → neutral
  if (afai < 0.15) return 30
  if (afai < 0.25) return 22
  if (afai < 0.40) return 12
  if (afai < 0.60) return 4
  return 0
}

function scoreWave(height_m) {
  if (height_m == null) return 12
  if (height_m < 0.4) return 20
  if (height_m < 0.8) return 17
  if (height_m < 1.2) return 12
  if (height_m < 1.6) return 7
  if (height_m < 2.2) return 3
  return 0
}

function scoreWind(speed_kmh) {
  if (speed_kmh == null) return 9
  if (speed_kmh < 8) return 15
  if (speed_kmh < 14) return 13
  if (speed_kmh < 20) return 9
  if (speed_kmh < 26) return 4
  return 0
}

function scoreWaterTemp(sst_c) {
  if (sst_c == null) return 6
  if (sst_c >= 27) return 10
  if (sst_c >= 25.5) return 9
  if (sst_c >= 24) return 7
  if (sst_c >= 22) return 4
  return 1
}

function scoreCloud(cover_pct) {
  if (cover_pct == null) return 6
  if (cover_pct < 20) return 10
  if (cover_pct < 40) return 8
  if (cover_pct < 60) return 5
  if (cover_pct < 80) return 2
  return 0
}

function scoreUV(uvIndex) {
  // Goldilocks — moderate UV is ideal for beach (tan without burn)
  if (uvIndex == null) return 6
  if (uvIndex < 3) return 5 // cloudy / early / late — won't even tan
  if (uvIndex < 6) return 10 // perfect sweet spot
  if (uvIndex < 8) return 8
  if (uvIndex < 11) return 5 // very strong, need shade
  return 2 // extreme
}

function scoreTide(tideRatio) {
  // tideRatio ∈ [0,1] where 0.5 = mid-tide
  // v1: default neutral. v2 will use beach-specific preferences.
  if (tideRatio == null) return 3
  return 3 + Math.round(2 * (1 - Math.abs(tideRatio - 0.5) * 2))
}

// ---- Reasoning strings (per factor, FR first — EN/ES later) ----

const STRENGTH_FR = {
  sargassum: "zéro sargasses",
  wave: "mer plate",
  wind: "vent calme",
  sst: "eau chaude",
  cloud: "ciel dégagé",
  uv: "soleil parfait",
  tide: "marée idéale",
}

function weakness(factor, snapshot) {
  switch (factor) {
    case "sargassum":
      if (snapshot.afai >= 0.60) return `alerte sargasses (AFAI ${snapshot.afai.toFixed(2)})`
      if (snapshot.afai >= 0.40) return `sargasses présentes (AFAI ${snapshot.afai.toFixed(2)})`
      return `trace de sargasses (AFAI ${snapshot.afai.toFixed(2)})`
    case "wave":
      return `houle ${snapshot.wave_height?.toFixed(1) ?? "?"} m`
    case "wind":
      return `vent ${Math.round(snapshot.wind_speed)} km/h`
    case "sst":
      return `eau fraîche ${snapshot.sst?.toFixed(1) ?? "?"} °C`
    case "cloud":
      return `ciel couvert`
    case "uv":
      return snapshot.uv_index >= 11 ? `UV extrême` : `UV faible`
    default:
      return null
  }
}

// ---- Label from total score ----

function labelFor(score) {
  if (score >= 90) return { label: "EXCEPTIONNEL", color: "#00B086" }
  if (score >= 80) return { label: "SUPER", color: "#1EC8B0" }
  if (score >= 70) return { label: "BON", color: "#6AC15A" }
  if (score >= 55) return { label: "MOYEN", color: "#E8A800" }
  if (score >= 40) return { label: "PASSABLE", color: "#E87B1E" }
  if (score >= 25) return { label: "ÉVITER", color: "#E8512A" }
  return { label: "NON", color: "#C93A1E" }
}

// ---- Main API ----

/**
 * Compute a full beach score from a snapshot.
 *
 * @param {object} snapshot
 *   - afai          number | null — sargassum concentration
 *   - wave_height   number | null — m
 *   - wind_speed    number | null — km/h
 *   - sst           number | null — °C (sea surface temp)
 *   - cloud_cover   number | null — %
 *   - uv_index      number | null — UV index
 *   - tide_ratio    number | null — 0..1 (0 = low, 0.5 = mid, 1 = high)
 * @returns {object} { score, breakdown, label, color, reason, strengths, weaknesses }
 */
function computeScore(snapshot = {}) {
  const breakdown = {
    sargassum: scoreSargassum(snapshot.afai),
    wave: scoreWave(snapshot.wave_height),
    wind: scoreWind(snapshot.wind_speed),
    sst: scoreWaterTemp(snapshot.sst),
    cloud: scoreCloud(snapshot.cloud_cover),
    uv: scoreUV(snapshot.uv_index),
    tide: scoreTide(snapshot.tide_ratio),
  }

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0)
  const { label, color } = labelFor(score)

  // Classify each factor by ratio score/max
  const strengths = []
  const weaknesses = []
  for (const [factor, pts] of Object.entries(breakdown)) {
    const max = WEIGHTS[factor]
    const ratio = pts / max
    if (ratio >= 0.9) strengths.push(STRENGTH_FR[factor])
    else if (ratio <= 0.3) {
      const w = weakness(factor, snapshot)
      if (w) weaknesses.push(w)
    }
  }

  let reason
  if (strengths.length && weaknesses.length) {
    reason = `${strengths.slice(0, 2).join(", ")}. Mais ${weaknesses.slice(0, 2).join(", ")}.`
  } else if (strengths.length) {
    reason = `${strengths.slice(0, 3).join(", ")}.`
  } else if (weaknesses.length) {
    reason = `${weaknesses.slice(0, 2).join(", ")}.`
  } else {
    reason = "Conditions moyennes sur tous les facteurs."
  }
  reason = reason.charAt(0).toUpperCase() + reason.slice(1)

  return { score, breakdown, label, color, reason, strengths, weaknesses }
}

module.exports = {
  computeScore,
  WEIGHTS,
  labelFor,
  // Exposed for testing
  _internal: {
    scoreSargassum,
    scoreWave,
    scoreWind,
    scoreWaterTemp,
    scoreCloud,
    scoreUV,
    scoreTide,
  },
}

// ---- CLI test mode: `node scripts/lib/score.cjs test` ----

if (require.main === module && process.argv[2] === "test") {
  const scenarios = [
    {
      name: "April sunny clean (ideal)",
      snap: { afai: 0.05, wave_height: 0.3, wind_speed: 10, sst: 27, cloud_cover: 15, uv_index: 5, tide_ratio: 0.5 },
    },
    {
      name: "July windy with some sargasses",
      snap: { afai: 0.22, wave_height: 0.9, wind_speed: 22, sst: 28, cloud_cover: 30, uv_index: 9, tide_ratio: 0.4 },
    },
    {
      name: "October rainy + rough sea (off-season hard day)",
      snap: { afai: 0.08, wave_height: 1.8, wind_speed: 28, sst: 26, cloud_cover: 85, uv_index: 2, tide_ratio: 0.5 },
    },
    {
      name: "May sargassum alert",
      snap: { afai: 0.72, wave_height: 0.5, wind_speed: 14, sst: 27, cloud_cover: 25, uv_index: 7, tide_ratio: 0.5 },
    },
    {
      name: "February perfect off-season (no sargasses)",
      snap: { afai: 0.04, wave_height: 0.4, wind_speed: 12, sst: 25, cloud_cover: 10, uv_index: 6, tide_ratio: 0.5 },
    },
    {
      name: "Missing data (sargassum only)",
      snap: { afai: 0.1 },
    },
  ]

  for (const s of scenarios) {
    const r = computeScore(s.snap)
    console.log(`\n${s.name}`)
    console.log(`  → ${r.score}/100 · ${r.label}`)
    console.log(`  reason: ${r.reason}`)
    console.log(`  breakdown: ${Object.entries(r.breakdown).map(([k, v]) => `${k}:${v}/${WEIGHTS[k]}`).join("  ")}`)
  }
}

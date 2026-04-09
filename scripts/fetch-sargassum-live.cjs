/**
 * fetch-sargassum-live.cjs
 *
 * Fetches REAL sargassum AFAI data from NOAA ERDDAP (7-day cumulative).
 * No authentication required — free public API.
 *
 * For each of the 20 monitored beaches:
 *   1. Query a WIDE offshore area (not coastal points — sargassum is detected 10-100km offshore)
 *   2. Nearby zone (0-30km): direct threat, weighted heavily
 *   3. Offshore zone (30-100km east/NE): incoming threat from Atlantic, weighted less
 *   4. Normalize raw AFAI (small floats ~0.001-0.01) to our 0-1 scale
 *   5. Build a 7-day forecast from drift trends
 *
 * Outputs:
 *   public/api/copernicus/sargassum.json  (source: "erddap-live")
 *   public/api/copernicus/history.json    (appended)
 *
 * Usage:
 *   node scripts/fetch-sargassum-live.cjs
 */
const fs = require('fs')
const path = require('path')
const { satelliteConfidence, memoryConfidence } = require('./lib/confidence.cjs')
const { buildHonestForecast, statusFromAfai: statusFromAfaiForecast, DAYS: FDAYS } = require('./lib/forecast.cjs')

// ── Beach coordinates (same as fetch-copernicus-live.py) ───────────
const BEACHES = [
  { id: 'grande-anse',    lat: 14.5028, lng: -61.0856, island: 'mq' },
  { id: 'anse-mitan',     lat: 14.5523, lng: -61.0552, island: 'mq' },
  { id: 'anse-noire',     lat: 14.5277, lng: -61.0874, island: 'mq' },
  { id: 'tartane',        lat: 14.7507, lng: -60.9257, island: 'mq' },
  { id: 'anse-madame',    lat: 14.6178, lng: -61.1036, island: 'mq' },
  { id: 'diamant',        lat: 14.4758, lng: -61.0314, island: 'mq' },
  { id: 'pt-marin',       lat: 14.4511, lng: -60.8836, island: 'mq' },
  { id: 'sainte-anne',     lat: 14.4305, lng: -60.8850, island: 'mq' },
  { id: 'les-salines',    lat: 14.3959, lng: -60.8690, island: 'mq' },
  { id: 'vauclin',        lat: 14.5414, lng: -60.8292, island: 'mq' },
  { id: 'gp-grande-anse', lat: 16.1312, lng: -61.7682, island: 'gp' },
  { id: 'gp-malendure',   lat: 16.1721, lng: -61.7767, island: 'gp' },
  { id: 'gp-sainte-anne', lat: 16.2226, lng: -61.3828, island: 'gp' },
  { id: 'gp-pt-chateaux', lat: 16.2531, lng: -61.2307, island: 'gp' },
  { id: 'gp-gosier',      lat: 16.2048, lng: -61.4948, island: 'gp' },
  { id: 'gp-caravelle',   lat: 16.2181, lng: -61.3965, island: 'gp' },
  { id: 'gp-bas-du-fort', lat: 16.2140, lng: -61.5237, island: 'gp' },
  { id: 'gp-deshaies',    lat: 16.3054, lng: -61.7951, island: 'gp' },
  { id: 'gp-moule',       lat: 16.4222, lng: -61.5337, island: 'gp' },
  { id: 'gp-vieux-fort',  lat: 16.2488, lng: -61.1428, island: 'gp' },
]

// ── ERDDAP configuration ──────────────────────────────────────────
const ERDDAP_BASE = 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_7D.json'
const FETCH_TIMEOUT_MS = 60000 // Wider bounding boxes = more data, need more time
const NO_DATA_AFAI = 0.05 // If null / no detection = clean ocean

// Wide bounding boxes: sargassum is detected OFFSHORE (10-100km from coast),
// not at coastal coordinates. Cover the Atlantic approach zones.
const REGIONS = {
  mq: { latMin: 13.5, latMax: 15.5, lngMin: -62.0, lngMax: -59.5 },
  gp: { latMin: 15.5, latMax: 17.0, lngMin: -62.5, lngMax: -60.0 },
}

// Radius bands for threat assessment (km)
const NEARBY_RADIUS_KM = 30   // direct threat zone
const OFFSHORE_RADIUS_KM = 100 // incoming threat zone (east/northeast)

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

// ── Helpers ────────────────────────────────────────────────────────

// Thresholds aligned with NOAA SIR (raw AFAI: 0.001/0.003).
// normalizeAfai maps: raw 0.002→0.15, raw 0.005→0.40.
function statusFromAfai(afai) {
  if (afai < 0.15) return 'clean'
  if (afai < 0.40) return 'moderate'
  return 'avoid'
}

/** Haversine distance in km */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Fetch with timeout. Returns null on error instead of throwing. */
async function safeFetch(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`HTTP ${res.status} for ${url.slice(0, 120)}... — ${body.slice(0, 200)}`)
      return null
    }
    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      console.warn(`Timeout (${timeoutMs}ms) for ${url.slice(0, 120)}...`)
    } else {
      console.warn(`Fetch error: ${err.message}`)
    }
    return null
  }
}

/**
 * Convert raw ERDDAP AFAI value to our 0-1 threat scale.
 * AFAI values are small floats: 0.001-0.01 moderate, >0.01 heavy.
 * Negative values = no sargassum = clean.
 */
function normalizeAfai(raw) {
  if (raw <= 0) return 0.05 // negative or zero → clean
  if (raw < 0.002) return 0.05 + (raw / 0.002) * 0.10 // 0.05-0.15 clean
  if (raw < 0.005) return 0.15 + ((raw - 0.002) / 0.003) * 0.25 // 0.15-0.40 transitioning
  if (raw < 0.01) return 0.40 + ((raw - 0.005) / 0.005) * 0.25 // 0.40-0.65 moderate
  // > 0.01 → heavy
  return Math.min(1.0, 0.65 + ((raw - 0.01) / 0.02) * 0.35) // 0.65-1.0 avoid
}

/**
 * Compute bearing from point1 to point2 in degrees (0=N, 90=E, 180=S, 270=W)
 */
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180
  const toDeg = r => r * 180 / Math.PI
  const dLng = toRad(lng2 - lng1)
  const y = Math.sin(dLng) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// ── ERDDAP grid fetching ──────────────────────────────────────────

/**
 * Fetch the AFAI grid for a region.
 * Returns { rows: [{latitude, longitude, AFAI},...], latitudes: [...], longitudes: [...] }
 * or null on failure.
 */
async function fetchErddapGrid(region) {
  const { latMin, latMax, lngMin, lngMax } = region
  // Use [(last)] for the most recent time step
  const url = `${ERDDAP_BASE}?AFAI[(last)][(${latMin}):(${latMax})][(${lngMin}):(${lngMax})]`
  console.log(`  ERDDAP request: lat [${latMin}, ${latMax}], lng [${lngMin}, ${lngMax}]`)
  console.log(`  URL: ${url}`)

  const data = await safeFetch(url, FETCH_TIMEOUT_MS)
  if (!data || !data.table) {
    console.warn('  No valid ERDDAP response')
    return null
  }

  const table = data.table
  const colNames = table.columnNames
  const rows = table.rows

  if (!colNames || !rows || rows.length === 0) {
    console.warn('  ERDDAP response has no rows')
    return null
  }

  const latIdx = colNames.indexOf('latitude')
  const lngIdx = colNames.indexOf('longitude')
  const afaiIdx = colNames.indexOf('AFAI')
  const timeIdx = colNames.indexOf('time')

  if (latIdx < 0 || lngIdx < 0 || afaiIdx < 0) {
    console.warn('  ERDDAP columns missing. Got:', colNames)
    return null
  }

  // Extract ERDDAP data timestamp (first non-null time value)
  let erddapTimestamp = null
  if (timeIdx >= 0) {
    for (const row of rows) {
      if (row[timeIdx]) { erddapTimestamp = row[timeIdx]; break }
    }
  }
  const dataAgeHours = erddapTimestamp
    ? Math.max(0, (Date.now() - new Date(erddapTimestamp).getTime()) / (1000 * 60 * 60))
    : 24 // assume 24h if unknown
  if (erddapTimestamp) {
    console.log(`  ERDDAP data timestamp: ${erddapTimestamp} (${Math.round(dataAgeHours)}h ago)`)
  }

  // Parse into structured array
  const points = []
  const latSet = new Set()
  const lngSet = new Set()

  for (const row of rows) {
    const lat = row[latIdx]
    const lng = row[lngIdx]
    const afai = row[afaiIdx] // may be null
    latSet.add(lat)
    lngSet.add(lng)
    points.push({ latitude: lat, longitude: lng, AFAI: afai })
  }

  console.log(`  Got ${points.length} grid points (${latSet.size} lats x ${lngSet.size} lngs)`)
  const nonNull = points.filter(p => p.AFAI !== null && p.AFAI !== undefined)
  const positive = nonNull.filter(p => p.AFAI > 0)
  const negative = nonNull.filter(p => p.AFAI <= 0)
  console.log(`  Non-null AFAI: ${nonNull.length} (${positive.length} positive/sargassum, ${negative.length} negative/clean)`)

  return {
    points,
    latitudes: [...latSet].sort((a, b) => a - b),
    longitudes: [...lngSet].sort((a, b) => a - b),
    erddapTimestamp,
    dataAgeHours,
  }
}

/**
 * For a given beach, compute sargassum threat level from the OFFSHORE grid.
 *
 * Sargassum is detected offshore (10-100km from coast), not at beach coordinates.
 * Strategy:
 *   1. Nearby zone (0-30km): direct threat — weighted heavily
 *   2. Offshore zone (30-100km, east/northeast): incoming threat — weighted less
 *   3. Combine both with nearby having 70% weight, offshore 30%
 *   4. Normalize raw AFAI values to our 0-1 scale
 */
function extractBeachAfai(beach, grid) {
  if (!grid || !grid.points || grid.points.length === 0) {
    return { afai: NO_DATA_AFAI, method: 'no-grid', nearbyPts: 0, offshorePts: 0, confidence: 8 }
  }
  const dataAgeHours = grid.dataAgeHours || 24

  const nearbyValues = []  // within 30km — direct threat
  const offshoreValues = [] // 30-100km east/NE — incoming threat

  for (const p of grid.points) {
    // Skip only literal null — negative AFAI is valid (means clean)
    if (p.AFAI === null || p.AFAI === undefined) continue

    const dist = haversineKm(beach.lat, beach.lng, p.latitude, p.longitude)
    if (dist > OFFSHORE_RADIUS_KM) continue

    const normalized = normalizeAfai(p.AFAI)

    if (dist <= NEARBY_RADIUS_KM) {
      // Nearby zone: weight by inverse distance (closer = more relevant)
      const weight = 1 / (1 + dist)
      nearbyValues.push({ value: normalized, weight, dist })
    } else {
      // Offshore zone: only count if east or northeast of beach (incoming from Atlantic)
      const bear = bearing(beach.lat, beach.lng, p.latitude, p.longitude)
      // East = 90, NE = 45, SE = 135. Accept 20-160 degrees (broad east arc)
      if (bear >= 20 && bear <= 160) {
        const weight = 1 / (1 + dist * 0.5) // lighter weight for distance
        offshoreValues.push({ value: normalized, weight, dist })
      }
    }
  }

  // Weighted average for each zone
  function weightedAvg(arr) {
    if (arr.length === 0) return null
    let sumW = 0, sumV = 0
    for (const { value, weight } of arr) {
      sumW += weight
      sumV += weight * value
    }
    return sumV / sumW
  }

  const nearbyAvg = weightedAvg(nearbyValues)
  const offshoreAvg = weightedAvg(offshoreValues)

  let afai
  let method

  if (nearbyAvg !== null && offshoreAvg !== null) {
    // Combine: 70% nearby direct threat, 30% offshore incoming
    afai = nearbyAvg * 0.7 + offshoreAvg * 0.3
    method = `combined-${nearbyValues.length}near-${offshoreValues.length}off`
  } else if (nearbyAvg !== null) {
    afai = nearbyAvg
    method = `nearby-${nearbyValues.length}pts`
  } else if (offshoreAvg !== null) {
    // Only offshore data — incoming risk is lower (it hasn't arrived yet)
    afai = offshoreAvg * 0.5
    method = `offshore-only-${offshoreValues.length}pts`
  } else {
    // No valid AFAI points at all in 100km — ocean is clean
    afai = NO_DATA_AFAI
    method = 'no-data'
  }

  afai = Math.max(0, Math.min(1, Math.round(afai * 100) / 100))

  const confidence = satelliteConfidence(method, nearbyValues.length, offshoreValues.length, dataAgeHours)
  return { afai, method, nearbyPts: nearbyValues.length, offshorePts: offshoreValues.length, confidence }
}

// ── Weekly forecast: uses lib/forecast.cjs (honest model) ──
// buildWeeklyBatch removed — was fabricating data with sin/cos + id.length % N
// Now using buildHonestForecast() from lib/forecast.cjs

// ── History tracking (same as scrape-copernicus.cjs) ───────────────

function updateHistory(dir, levels) {
  const today = new Date().toISOString().slice(0, 10)
  const historyPath = path.join(dir, 'history.json')

  let historyData = { history: [], changes: [] }
  try {
    const raw = fs.readFileSync(historyPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.history)) historyData = parsed
    if (!Array.isArray(historyData.changes)) historyData.changes = []
  } catch (_) {}

  const todayEntry = {
    date: today,
    levels: levels.map(l => ({ id: l.id, afai: l.afai, status: l.status })),
  }

  const existingIdx = historyData.history.findIndex(h => h.date === today)
  if (existingIdx >= 0) {
    historyData.history[existingIdx] = todayEntry
  } else {
    historyData.history.push(todayEntry)
  }

  // Detect status changes vs yesterday
  const newChanges = []
  const yesterday = historyData.history
    .filter(h => h.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (yesterday) {
    const yesterdayMap = {}
    for (const l of yesterday.levels) yesterdayMap[l.id] = l.status
    for (const l of todayEntry.levels) {
      const prev = yesterdayMap[l.id]
      if (prev && prev !== l.status) {
        newChanges.push({
          date: today,
          beach: l.id,
          from: prev,
          to: l.status,
          afai: l.afai,
        })
      }
    }
  }

  for (const c of newChanges) {
    const dupIdx = historyData.changes.findIndex(
      x => x.date === c.date && x.beach === c.beach
    )
    if (dupIdx >= 0) {
      historyData.changes[dupIdx] = c
    } else {
      historyData.changes.push(c)
    }
  }

  // Keep only last 30 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  historyData.history = historyData.history.filter(h => h.date >= cutoffStr)
  historyData.changes = historyData.changes.filter(c => c.date >= cutoffStr)

  fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf-8')
  console.log(`History: ${historyPath} | ${historyData.history.length} jours | ${newChanges.length} changement(s)`)

  return newChanges
}

// ── Beach Memory: accumulation decay from recent beaching events ──
//
// Rationale (cross-validated with external sources):
// - Sargassum material persists 14+ days on beaches without cleanup
//   (Source: EPA SIE guidelines, MDPI Remote Sensing 2025)
// - Decomposition starts at ~48h but physical mass remains visible
//   (Source: DAN Boater, ScienceDirect 2024 S0013935124001397)
// - Even equipped communes cannot keep up during heavy events
//   (Source: Sargassum Hub - French Antilles, Le Diamant daily ops)
// - 2026 is a record year with continuous beaching since Nov 2025
//   (Source: USF SaWS Bulletin 03/2026, La 1ere Guadeloupe)
//
// Parameters:
// - Half-life: 3.5 days (λ = ln(2)/3.5 ≈ 0.198)
//   → Day 1: 82% remains, Day 3: 55%, Day 7: 24%, Day 10: 14%
// - Window: 10 days lookback
// - Only boosts AFAI upward (never reduces current satellite reading)
//
// Sources: NOAA SIR v1.4, USF SaWS 2026, Wang & Hu 2016, EPA SIE

function applyBeachAccumulation(levels, dir) {
  const today = new Date().toISOString().slice(0, 10)
  const HALF_LIFE_DAYS = 3.5
  const DECAY_LAMBDA = Math.LN2 / HALF_LIFE_DAYS
  const WINDOW_DAYS = 10

  const historyPath = path.join(dir, 'history.json')
  let history = []
  try {
    const raw = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
    history = raw.history || []
  } catch (_) {}

  if (history.length === 0) return

  let boosted = 0
  for (const level of levels) {
    let peakDecayed = 0
    let bestDaysAgo = 0

    for (const entry of history) {
      const daysAgo = (new Date(today) - new Date(entry.date)) / (1000 * 60 * 60 * 24)
      if (daysAgo <= 0 || daysAgo > WINDOW_DAYS) continue

      const beachEntry = entry.levels.find(l => l.id === level.id)
      if (!beachEntry || beachEntry.afai < 0.15) continue // ignore history with no beaching

      // Exponential decay: value decreases by 50% every HALF_LIFE_DAYS
      const decayed = beachEntry.afai * Math.exp(-DECAY_LAMBDA * daysAgo)
      if (decayed > peakDecayed) {
        peakDecayed = decayed
        bestDaysAgo = daysAgo
      }
    }

    // If satellite shows clean (AFAI < 0.10) for 2+ consecutive recent days,
    // trust the satellite — sargassum has dissipated, skip memory boost.
    const sortedRecent = history
      .filter(h => {
        const d = (new Date(today) - new Date(h.date)) / (1000 * 60 * 60 * 24)
        return d > 0 && d <= 10
      })
      .sort((a, b) => b.date.localeCompare(a.date))
    let consecutiveClean = 0
    for (const entry of sortedRecent) {
      const bl = entry.levels.find(l => l.id === level.id)
      if (!bl || bl.afai >= 0.10) break
      consecutiveClean++
    }
    if (consecutiveClean >= 2) continue // satellite confirmed clean 2+ days

    // Only flag beachMemory when accumulation actually changes the STATUS
    const effectiveAfai = Math.round(peakDecayed * 100) / 100
    if (peakDecayed > level.afai && statusFromAfai(effectiveAfai) !== level.status) {
      level.afaiSat = level.afai  // preserve raw satellite value
      const origConf = level.confidence || 75
      level.afai = effectiveAfai
      level.status = statusFromAfai(level.afai)
      level.beachMemory = true
      level.memoryDaysAgo = Math.round(bestDaysAgo * 10) / 10
      level.memoryConfidence = memoryConfidence(bestDaysAgo, origConf)
      level.confidence = level.memoryConfidence // memory replaces satellite confidence
      level.source = 'memory'
      boosted++
      console.log(`    ${level.id}: satellite=${level.afaiSat.toFixed(2)} → effective=${level.afai.toFixed(2)} (${level.status}) [beach memory, ${level.memoryDaysAgo}d ago, conf=${level.confidence}%]`)
    }
  }

  if (boosted > 0) {
    console.log(`  Beach memory: ${boosted} beach(es) boosted (half-life=${HALF_LIFE_DAYS}d, window=${WINDOW_DAYS}d)`)
  }
}

// ── SARGASSUM BANKS: clustering + convex hull + drift predictions ──

/**
 * DBSCAN clustering of AFAI grid points.
 * Groups adjacent positive-AFAI points into "banks" (sargassum masses).
 * @param {Array} points - [[lat, lng, afai], ...]
 * @param {number} eps - max distance in degrees (~0.06° ≈ 6.5km)
 * @param {number} minPts - minimum points to form a cluster
 * @returns {Array} array of clusters, each cluster is an array of [lat, lng, afai]
 */
function dbscan(points, eps = 0.06, minPts = 3) {
  const n = points.length
  const labels = new Int16Array(n).fill(-1) // -1 = unvisited
  let clusterId = 0

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue
    const neighbors = []
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dlat = points[i][0] - points[j][0]
      const dlng = points[i][1] - points[j][1]
      if (dlat * dlat + dlng * dlng <= eps * eps) neighbors.push(j)
    }
    if (neighbors.length < minPts) { labels[i] = 0; continue } // noise
    clusterId++
    labels[i] = clusterId
    const queue = [...neighbors]
    while (queue.length > 0) {
      const qi = queue.shift()
      if (labels[qi] === 0) labels[qi] = clusterId
      if (labels[qi] !== -1) continue
      labels[qi] = clusterId
      const qn = []
      for (let j = 0; j < n; j++) {
        if (qi === j) continue
        const dlat = points[qi][0] - points[j][0]
        const dlng = points[qi][1] - points[j][1]
        if (dlat * dlat + dlng * dlng <= eps * eps) qn.push(j)
      }
      if (qn.length >= minPts) queue.push(...qn)
    }
  }

  const clusters = {}
  for (let i = 0; i < n; i++) {
    if (labels[i] <= 0) continue
    if (!clusters[labels[i]]) clusters[labels[i]] = []
    clusters[labels[i]].push(points[i])
  }
  return Object.values(clusters)
}

/**
 * Graham scan convex hull.
 * @param {Array} points - [[lat, lng, afai], ...]
 * @returns {Array} hull vertices [[lat, lng], ...]
 */
function convexHull(points) {
  if (points.length <= 2) return points.map(p => [p[0], p[1]])
  const pts = points.map(p => [p[0], p[1]])
  // Find bottom-left point
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] < pts[s][0] || (pts[i][0] === pts[s][0] && pts[i][1] < pts[s][1])) s = i
  }
  ;[pts[0], pts[s]] = [pts[s], pts[0]]
  const p0 = pts[0]
  const rest = pts.slice(1).sort((a, b) => {
    const cross = (a[0] - p0[0]) * (b[1] - p0[1]) - (a[1] - p0[1]) * (b[0] - p0[0])
    if (Math.abs(cross) > 1e-10) return cross > 0 ? -1 : 1
    return ((a[0] - p0[0]) ** 2 + (a[1] - p0[1]) ** 2) - ((b[0] - p0[0]) ** 2 + (b[1] - p0[1]) ** 2)
  })
  const hull = [p0, rest[0]]
  for (let i = 1; i < rest.length; i++) {
    while (hull.length > 1) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1], c = rest[i]
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) hull.pop()
      else break
    }
    hull.push(rest[i])
  }
  return hull
}

/**
 * Inflate hull outward from centroid (makes small polygons look more organic).
 */
function inflateHull(hull, centroid, factor = 1.2) {
  return hull.map(([lat, lng]) => [
    Math.round((centroid[0] + (lat - centroid[0]) * factor) * 1000) / 1000,
    Math.round((centroid[1] + (lng - centroid[1]) * factor) * 1000) / 1000,
  ])
}

/**
 * Fetch regional wind data from Open-Meteo for drift estimation.
 * Returns { speed (km/h), dir (degrees, "from" convention) } for each island.
 */
async function fetchRegionalWind() {
  const wind = {}
  const centers = { mq: [14.6, -61.0], gp: [16.2, -61.5] }
  for (const [island, [lat, lng]] of Object.entries(centers)) {
    // Fetch current + 7-day hourly forecast (168 hours)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m&hourly=wind_speed_10m,wind_direction_10m&forecast_days=7&timezone=America/Martinique`
    const data = await safeFetch(url, 15000)
    if (data?.current) {
      wind[island] = {
        speed: Math.round(data.current.wind_speed_10m * 10) / 10,
        dir: Math.round(data.current.wind_direction_10m),
      }
      // Parse hourly forecast
      if (data.hourly?.time?.length) {
        wind[island].hourly = data.hourly.time.map((t, i) => ({
          time: t,
          speed: data.hourly.wind_speed_10m[i] || 0,
          dir: data.hourly.wind_direction_10m[i] || 0,
        }))
        console.log(`  Wind ${island.toUpperCase()}: ${wind[island].speed} km/h from ${wind[island].dir}° + ${wind[island].hourly.length}h forecast`)
      } else {
        console.log(`  Wind ${island.toUpperCase()}: ${wind[island].speed} km/h from ${wind[island].dir}° (no hourly forecast)`)
      }
    } else {
      // Fallback: typical trade wind (15 km/h from ENE), no hourly
      wind[island] = { speed: 15, dir: 75, hourly: null }
      console.log(`  Wind ${island.toUpperCase()}: fallback 15 km/h from 75° (trade wind)`)
    }
  }
  return wind
}

/**
 * Average wind from hourly forecast over a window of hours.
 */
function avgWindForHours(hourlyWind, startH, endH) {
  if (!hourlyWind || !hourlyWind.length) return null
  const slice = hourlyWind.slice(startH, endH)
  if (!slice.length) return null
  let sumSpeed = 0, sumSin = 0, sumCos = 0
  for (const w of slice) {
    sumSpeed += w.speed
    sumSin += Math.sin(w.dir * Math.PI / 180)
    sumCos += Math.cos(w.dir * Math.PI / 180)
  }
  return {
    speed: sumSpeed / slice.length,
    dir: (Math.atan2(sumSin / slice.length, sumCos / slice.length) * 180 / Math.PI + 360) % 360,
  }
}

/**
 * Compute drift predictions for a bank.
 * Model: wind Stokes drift (2.5% of wind speed) + Caribbean current (0.5 km/h west).
 * Uses forecast wind when available for 6h/12h/24h predictions.
 */
function computeBankDrift(centroid, hull, windSpeed, windDir, island, hourlyWind) {
  // Wind drift: ~2.5% of wind speed, direction = opposite of "from"
  const driftBearing = (windDir + 180) % 360
  const driftSpeed = windSpeed * 0.025 // km/h

  // Caribbean baseline current: ~0.5 km/h westward (bearing 270°)
  const curSpeed = 0.5, curBearing = 270

  // Vector sum (bearing → N/E components)
  const toRad = d => d * Math.PI / 180
  const totalN = driftSpeed * Math.cos(toRad(driftBearing)) + curSpeed * Math.cos(toRad(curBearing))
  const totalE = driftSpeed * Math.sin(toRad(driftBearing)) + curSpeed * Math.sin(toRad(curBearing))
  const speed = Math.round(Math.sqrt(totalN ** 2 + totalE ** 2) * 10) / 10
  const bear = Math.round((Math.atan2(totalE, totalN) * 180 / Math.PI + 360) % 360)

  // Displacement per hour in degrees
  const dLatH = totalN / 111.0
  const dLngH = totalE / (111.0 * Math.cos(toRad(centroid[0])))

  // Coast capping: compute max hours before hitting nearest coast
  // Project drift vector onto direction-to-nearest-beach, cap at 85%
  const coastBeaches = BEACHES.filter(b => b.island === island)
  const nearest = coastBeaches
    .map(b => ({ lat: b.lat, lng: b.lng, dist: haversineKm(centroid[0], centroid[1], b.lat, b.lng) }))
    .sort((a, b) => a.dist - b.dist)[0]
  let maxDriftH = Infinity
  if (nearest) {
    const toBeachLat = nearest.lat - centroid[0]
    const toBeachLng = nearest.lng - centroid[1]
    const toBeachNorm = Math.sqrt(toBeachLat ** 2 + toBeachLng ** 2)
    if (toBeachNorm > 0) {
      // Drift component toward beach (degrees/h)
      const driftToward = (dLatH * toBeachLat + dLngH * toBeachLng) / toBeachNorm
      if (driftToward > 0) {
        // Drifting toward coast — cap at 85% of distance
        maxDriftH = (toBeachNorm * 0.85) / driftToward
      }
    }
  }

  const predictions = {}
  const confByHorizon = { 6: 75, 12: 55, 24: 35 }
  for (const h of [6, 12, 24]) {
    // Use forecast wind if available for this time window
    const forecastWind = avgWindForHours(hourlyWind, 0, h)
    let useDLatH = dLatH, useDLngH = dLngH
    if (forecastWind) {
      const fDriftBearing = (forecastWind.dir + 180) % 360
      const fDriftSpeed = forecastWind.speed * 0.025
      const fTotalN = fDriftSpeed * Math.cos(toRad(fDriftBearing)) + curSpeed * Math.cos(toRad(curBearing))
      const fTotalE = fDriftSpeed * Math.sin(toRad(fDriftBearing)) + curSpeed * Math.sin(toRad(curBearing))
      useDLatH = fTotalN / 111.0
      useDLngH = fTotalE / (111.0 * Math.cos(toRad(centroid[0])))
    }

    const effH = Math.min(h, maxDriftH) // cap at coastline
    predictions[`${h}h`] = {
      centroid: [
        Math.round((centroid[0] + useDLatH * effH) * 1000) / 1000,
        Math.round((centroid[1] + useDLngH * effH) * 1000) / 1000,
      ],
      hull: hull.map(([lat, lng]) => [
        Math.round((lat + useDLatH * effH) * 1000) / 1000,
        Math.round((lng + useDLngH * effH) * 1000) / 1000,
      ]),
      beached: h > maxDriftH,
      confidence: confByHorizon[h],
    }
  }
  return { speed, bearing: bear, predictions }
}

/**
 * Build sargassum-banks.json: clustered banks with drift predictions.
 */
async function buildSargassumBanks(gridPoints, dir, wind) {
  if (!gridPoints || gridPoints.length < 3) {
    console.log('  Skipping banks: not enough grid points')
    return
  }

  // 1. Cluster
  const clusters = dbscan(gridPoints, 0.06, 3)
  console.log(`  DBSCAN: ${clusters.length} banks from ${gridPoints.length} points`)

  // 2. Wind already fetched (passed in from main)

  // 3. Build bank objects
  const banks = clusters.map((cluster, i) => {
    // Centroid (weighted by AFAI)
    let sumLat = 0, sumLng = 0, sumW = 0
    for (const [lat, lng, afai] of cluster) {
      sumLat += lat * afai; sumLng += lng * afai; sumW += afai
    }
    const centroid = [
      Math.round((sumLat / sumW) * 1000) / 1000,
      Math.round((sumLng / sumW) * 1000) / 1000,
    ]
    const mass = Math.round((sumW / cluster.length) * 100) / 100 // avg AFAI
    const island = centroid[0] >= 15.5 ? 'gp' : 'mq'

    // Hull
    let hull = convexHull(cluster)
    hull = inflateHull(hull, centroid, 1.2)

    // Drift (uses forecast wind when available)
    const w = wind[island] || { speed: 15, dir: 75 }
    const drift = computeBankDrift(centroid, hull, w.speed, w.dir, island, w.hourly || null)

    // Threatened beaches at each time step
    const threatens = {}
    for (const timeKey of ['now', '6h', '12h', '24h']) {
      const c = timeKey === 'now' ? centroid : drift.predictions[timeKey].centroid
      const threatened = BEACHES
        .filter(b => b.island === island)
        .map(b => ({ id: b.id, km: Math.round(haversineKm(c[0], c[1], b.lat, b.lng)) }))
        .filter(t => t.km <= 30)
        .sort((a, b) => a.km - b.km)
      if (threatened.length) threatens[timeKey] = threatened
    }

    return {
      id: i + 1,
      island,
      centroid,
      mass,
      count: cluster.length,
      hull,
      drift,
      threatens,
    }
  })

  // Filter noise: only keep significant banks (mass >= 0.08 and 4+ points)
  const significant = banks.filter(b => b.mass >= 0.08 && b.count >= 4)
  // Sort by mass descending, keep top 15 per island to avoid clutter
  significant.sort((a, b) => b.mass - a.mass || b.count - a.count)
  const mqBanks = significant.filter(b => b.island === 'mq').slice(0, 15)
  const gpBanks = significant.filter(b => b.island === 'gp').slice(0, 15)
  const banks2 = [...mqBanks, ...gpBanks]
  banks2.forEach((b, i) => { b.id = i + 1 }) // re-index

  console.log(`  Filtered: ${banks.length} raw → ${banks2.length} significant banks`)
  const payload = {
    updatedAt: new Date().toISOString(),
    wind,
    bankCount: banks2.length,
    banks: banks2,
  }

  const outPath = path.join(dir, 'sargassum-banks.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log(`  Banks: ${outPath} | ${banks2.length} banks`)

  // Log threats
  const withThreats = banks2.filter(b => Object.keys(b.threatens).length > 0)
  if (withThreats.length) {
    for (const b of withThreats) {
      const times = Object.entries(b.threatens).map(([t, beaches]) =>
        `${t}: ${beaches.map(x => `${x.id}(${x.km}km)`).join(', ')}`
      ).join(' | ')
      console.log(`    Bank #${b.id} (mass=${b.mass}): ${times}`)
    }
  }
}

// ── MAIN ───────────────────────────────────────────────────────────

async function main() {
  console.log('=== fetch-sargassum-live.cjs ===')
  console.log(`Date: ${new Date().toISOString()}`)
  console.log('Source: NOAA ERDDAP (7-day AFAI composite)')
  console.log('')

  // 1. Fetch grids for both regions
  console.log('[1/3] Fetching ERDDAP grids...')
  let mqGrid = null
  let gpGrid = null

  try {
    console.log('  -- Martinique --')
    mqGrid = await fetchErddapGrid(REGIONS.mq)
  } catch (err) {
    console.warn(`  MQ grid fetch failed: ${err.message}`)
  }

  try {
    console.log('  -- Guadeloupe --')
    gpGrid = await fetchErddapGrid(REGIONS.gp)
  } catch (err) {
    console.warn(`  GP grid fetch failed: ${err.message}`)
  }

  const mqFetched = mqGrid && mqGrid.points !== undefined
  const gpFetched = gpGrid && gpGrid.points !== undefined
  if (!mqFetched && !gpFetched) {
    console.error('ERROR: ERDDAP unreachable for both regions. Exiting with code 1 so fallback runs.')
    process.exit(1)
  }
  // If grids were fetched but all values are null → no sargassum detected = all clean (this is valid data!)
  console.log(`  MQ grid: ${mqGrid ? mqGrid.points.length + ' points' : 'failed'} | GP grid: ${gpGrid ? gpGrid.points.length + ' points' : 'failed'}`)

  // 2. Extract AFAI for each beach
  console.log('')
  console.log('[2/3] Extracting beach AFAI values...')
  const levels = []

  for (const beach of BEACHES) {
    const grid = beach.island === 'mq' ? mqGrid : gpGrid
    const result = extractBeachAfai(beach, grid)
    const afai = Math.round(result.afai * 100) / 100
    const status = statusFromAfai(afai)
    levels.push({
      id: beach.id, afai, status,
      confidence: result.confidence,
      source: 'erddap-satellite',
      sourceDetail: result.method,
    })
    console.log(`  ${beach.id}: AFAI=${afai.toFixed(2)} (${status}) [${result.method}] conf=${result.confidence}% nearby=${result.nearbyPts} offshore=${result.offshorePts}`)
  }

  // 2b. Apply beach memory (accumulation decay from recent history)
  // IMPORTANT: save raw satellite levels BEFORE accumulation for history tracking
  const rawLevels = levels.map(l => ({ id: l.id, afai: l.afai, status: l.status }))

  const dir = path.join(__dirname, '..', 'public', 'api', 'copernicus')
  fs.mkdirSync(dir, { recursive: true })

  console.log('')
  console.log('[2b] Applying beach memory (accumulation decay)...')
  applyBeachAccumulation(levels, dir)

  // 3. Build honest forecast + write output
  console.log('')
  console.log('[3/3] Building honest forecast and writing output...')

  // Load history for satellite trend
  const historyPath = path.join(dir, 'history.json')
  let historyEntries = []
  try {
    const raw = JSON.parse(fs.readFileSync(historyPath, 'utf-8'))
    historyEntries = raw.history || []
  } catch (_) {}

  // Fetch wind forecast (7-day hourly) for drift model
  console.log('  Fetching 7-day wind forecast...')
  const windForecast = await fetchRegionalWind()

  const updatedAt = new Date().toISOString()
  const erddapTimestamp = (mqGrid?.erddapTimestamp || gpGrid?.erddapTimestamp) || null
  const dataAgeMinutes = erddapTimestamp
    ? Math.round((Date.now() - new Date(erddapTimestamp).getTime()) / 60000)
    : null

  const weekly = buildHonestForecast(levels, windForecast, historyEntries, BEACHES)
  const payload = {
    source: 'erddap-live',
    updatedAt,
    erddapTimestamp,
    dataAgeMinutes,
    pipelineVersion: '2.0',
    levels,
    weekly,
  }

  const outPath = path.join(dir, 'sargassum.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log(`OK: ${outPath}`)
  console.log(`   source: erddap-live | updatedAt: ${updatedAt.slice(0, 19)}`)

  // Archive today's forecasts for backtesting (1 snapshot per day, keep 30 days)
  const archivePath = path.join(dir, 'forecast-archive.json')
  const todayDate = updatedAt.slice(0, 10)
  let archive = { snapshots: [] }
  try { archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8')) } catch {}
  // Replace today's snapshot if it already exists (last run wins)
  archive.snapshots = archive.snapshots.filter(s => s.date !== todayDate)
  archive.snapshots.push({
    date: todayDate,
    updatedAt,
    forecasts: Object.fromEntries(
      Object.entries(weekly).map(([id, w]) => [id, {
        forecast: w.forecast,
        forecastMethod: w.forecastMethod,
      }])
    ),
  })
  // Keep only last 30 days
  archive.snapshots = archive.snapshots
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
  fs.writeFileSync(archivePath, JSON.stringify(archive), 'utf-8')
  console.log(`Forecast archive: ${archive.snapshots.length} days saved`)

  // 4. Export AFAI grid for client-side heatmap
  // Only positive AFAI points (sargassum detected), downsampled for performance
  const gridPoints = []
  for (const grid of [mqGrid, gpGrid]) {
    if (!grid || !grid.points) continue
    for (const p of grid.points) {
      if (p.AFAI == null || p.AFAI <= 0) continue
      // Downsample: keep ~1 in 4 points (skip odd lat/lng indices)
      const latIdx = grid.latitudes.indexOf(p.latitude)
      const lngIdx = grid.longitudes.indexOf(p.longitude)
      if (latIdx % 2 !== 0 || lngIdx % 2 !== 0) continue
      const norm = normalizeAfai(p.AFAI)
      if (norm < 0.06) continue // below noise floor
      gridPoints.push([
        Math.round(p.latitude * 1000) / 1000,
        Math.round(p.longitude * 1000) / 1000,
        Math.round(norm * 100) / 100,
      ])
    }
  }
  const gridPayload = { updatedAt, count: gridPoints.length, points: gridPoints }
  const gridPath = path.join(dir, 'sargassum-grid.json')
  fs.writeFileSync(gridPath, JSON.stringify(gridPayload), 'utf-8')
  console.log(`Grid: ${gridPath} | ${gridPoints.length} points (AFAI > 0)`)

  // 5. Cluster AFAI grid points into sargassum BANKS + drift predictions
  console.log('')
  console.log('[5/6] Clustering sargassum banks + drift predictions...')
  await buildSargassumBanks(gridPoints, dir, windForecast)

  // History — store RAW satellite values (not accumulated) to prevent compounding
  const changes = updateHistory(dir, rawLevels)
  if (changes.length > 0) {
    console.log(`Status changes detected:`)
    for (const c of changes) {
      console.log(`  ${c.beach}: ${c.from} -> ${c.to} (AFAI=${c.afai})`)
    }
  }

  // Summary
  const clean = levels.filter(l => l.status === 'clean').length
  const moderate = levels.filter(l => l.status === 'moderate').length
  const avoid = levels.filter(l => l.status === 'avoid').length
  console.log('')
  console.log(`Summary: ${clean} clean, ${moderate} moderate, ${avoid} avoid (${levels.length} beaches)`)
  console.log('Done.')
}

main().catch(err => {
  console.error('FATAL:', err.message || err)
  process.exit(1)
})

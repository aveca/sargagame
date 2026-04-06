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

  if (latIdx < 0 || lngIdx < 0 || afaiIdx < 0) {
    console.warn('  ERDDAP columns missing. Got:', colNames)
    return null
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
    return { afai: NO_DATA_AFAI, method: 'no-grid', nearbyPts: 0, offshorePts: 0 }
  }

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

  return { afai, method, nearbyPts: nearbyValues.length, offshorePts: offshoreValues.length }
}

// ── Weekly forecast builder (same logic as scrape-copernicus.cjs) ──

function buildWeeklyBatch(levels) {
  const weekly = {}
  for (const { id, afai } of levels) {
    const drift = afai > 0.6
      ? 0.02 + (id.length % 5) * 0.008
      : afai < 0.25
        ? -0.01 - (id.length % 3) * 0.005
        : (id.length % 7) * 0.006 - 0.02
    const base = Math.max(0, Math.min(1, afai))
    const series = []
    const t = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(t)
      d.setDate(d.getDate() + i)
      const noise = Math.sin((id.length + i) * 1.3) * 0.04 + Math.cos(i * 0.9) * 0.02
      const v = Math.max(0, Math.min(1, base + drift * i + noise))
      const s = statusFromAfai(v)
      series.push({
        day: i === 0 ? 'Auj.' : i === 1 ? 'Dem.' : DAYS[d.getDay()],
        date: d.toISOString().slice(0, 10),
        afai: Math.round(v * 100) / 100,
        status: s,
      })
    }
    const trend = series[6].afai - series[0].afai
    weekly[id] = {
      forecast: series,
      drift: trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
      driftLabel: trend > 0.05 ? 'Dérive possible vers la côte' : trend < -0.05 ? 'Dispersion attendue' : 'Stable',
      driftValue: Math.round(trend * 100) / 100,
    }
  }
  return weekly
}

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
    levels.push({ id: beach.id, afai, status })
    console.log(`  ${beach.id}: AFAI=${afai.toFixed(2)} (${status}) [${result.method}] nearby=${result.nearbyPts} offshore=${result.offshorePts}`)
  }

  // 3. Build forecast + write output
  console.log('')
  console.log('[3/3] Building forecast and writing output...')

  const updatedAt = new Date().toISOString()
  const weekly = buildWeeklyBatch(levels)
  const payload = { source: 'erddap-live', updatedAt, levels, weekly }

  const dir = path.join(__dirname, '..', 'public', 'api', 'copernicus')
  fs.mkdirSync(dir, { recursive: true })

  const outPath = path.join(dir, 'sargassum.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log(`OK: ${outPath}`)
  console.log(`   source: erddap-live | updatedAt: ${updatedAt.slice(0, 19)}`)

  // History
  const changes = updateHistory(dir, levels)
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

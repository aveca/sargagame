/**
 * fetch-caribbean-afai.cjs
 *
 * Fetches AFAI grid data for the entire Caribbean region from NOAA ERDDAP.
 * Resolution: ~0.25° (~25km) covering 8°N-28°N, 90°W-55°W.
 *
 * Output: public/api/copernicus/caribbean-afai.json
 *   { updatedAt, source, resolution, bounds, grid: [{lat, lng, afai, date},...] }
 *
 * Usage:
 *   node scripts/fetch-caribbean-afai.cjs
 */
const fs = require('fs')
const path = require('path')

// ── Configuration ─────────────────────────────────────────────────
const ERDDAP_7D = 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_7D.json'
const FETCH_TIMEOUT_MS = 120000 // Large region — allow 2 minutes
const OUTPUT = path.join(__dirname, '..', 'public', 'api', 'copernicus', 'caribbean-afai.json')

// Caribbean bounds
const BOUNDS = { latMin: 8, latMax: 28, lngMin: -90, lngMax: -55 }

// Resolution stride: fetch every ~0.25° (ERDDAP native resolution is ~0.01°,
// so we request a stride to get ~25km grid cells)
const STRIDE = 25 // ERDDAP stride parameter: every 25th point ≈ 0.25°

// ── Helpers ────────────────────────────────────────────────────────

function normalizeAfai(raw) {
  if (raw == null || isNaN(raw) || raw <= 0) return 0.02
  if (raw < 0.002) return 0.05 + (raw / 0.002) * 0.10
  if (raw < 0.005) return 0.15 + ((raw - 0.002) / 0.003) * 0.25
  if (raw < 0.01) return 0.40 + ((raw - 0.005) / 0.005) * 0.25
  return Math.min(1.0, 0.65 + ((raw - 0.01) / 0.02) * 0.35)
}

async function safeFetch(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`HTTP ${res.status} — ${body.slice(0, 300)}`)
      return null
    }
    return await res.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') console.warn(`Timeout (${timeoutMs}ms)`)
    else console.warn(`Fetch error: ${err.message}`)
    return null
  }
}

// ── Generate realistic fallback data ──────────────────────────────
function generateFallbackGrid() {
  console.log('  Generating fallback demo data...')
  const grid = []
  const now = new Date().toISOString()

  // Known sargassum hotspots with realistic AFAI levels
  const hotspots = [
    // NERR — North Equatorial Recirculation Region (main accumulation zone)
    { latC: 12, lngC: -65, radius: 4, intensity: 0.6 },
    // Sargasso Sea (traditional source)
    { latC: 25, lngC: -65, radius: 5, intensity: 0.3 },
    // Central Atlantic conveyor (between Africa and Caribbean)
    { latC: 10, lngC: -40, radius: 3, intensity: 0.45 },  // mid-Atlantic
    { latC: 9, lngC: -50, radius: 3, intensity: 0.5 },
    // Lesser Antilles approach
    { latC: 13, lngC: -58, radius: 2, intensity: 0.55 },
    // Gulf of Mexico (some accumulation)
    { latC: 22, lngC: -88, radius: 3, intensity: 0.2 },
    // Near Martinique/Guadeloupe offshore
    { latC: 14.5, lngC: -59.5, radius: 1.5, intensity: 0.35 },
    { latC: 16.5, lngC: -60, radius: 1.5, intensity: 0.25 },
  ]

  for (let lat = BOUNDS.latMin; lat <= BOUNDS.latMax; lat += 0.25) {
    for (let lng = BOUNDS.lngMin; lng <= BOUNDS.lngMax; lng += 0.25) {
      // Base: very low ocean background
      let afai = 0.02 + Math.random() * 0.03

      // Add hotspot influence (Gaussian-like falloff)
      for (const hs of hotspots) {
        const dLat = lat - hs.latC
        const dLng = lng - hs.lngC
        const dist = Math.sqrt(dLat * dLat + dLng * dLng)
        if (dist < hs.radius * 2) {
          const falloff = Math.exp(-(dist * dist) / (2 * (hs.radius * 0.6) ** 2))
          afai += hs.intensity * falloff * (0.8 + Math.random() * 0.4)
        }
      }

      // Only include points with some signal (skip pure ocean)
      if (afai > 0.06) {
        grid.push({
          lat: Math.round(lat * 100) / 100,
          lng: Math.round(lng * 100) / 100,
          afai: Math.round(Math.min(1, afai) * 1000) / 1000,
          date: now,
        })
      }
    }
  }

  return { grid, source: 'fallback-demo', date: now }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('=== Caribbean AFAI Grid Fetch ===')
  console.log(`  Bounds: ${BOUNDS.latMin}°N-${BOUNDS.latMax}°N, ${BOUNDS.lngMin}°W-${BOUNDS.lngMax}°W`)

  // ERDDAP query with stride for ~0.25° resolution
  // Format: variable[(time)][(latMin):(stride):(latMax)][(lngMin):(stride):(lngMax)]
  const url = `${ERDDAP_7D}?AFAI[(last)][(${BOUNDS.latMin}):${STRIDE}:(${BOUNDS.latMax})][(${BOUNDS.lngMin}):${STRIDE}:(${BOUNDS.lngMax})]`
  console.log(`  ERDDAP URL: ${url.slice(0, 150)}...`)

  const data = await safeFetch(url, FETCH_TIMEOUT_MS)

  let grid = []
  let source = 'erddap-live'
  let dataDate = new Date().toISOString()

  if (data?.table?.rows?.length) {
    const { columnNames, rows } = data.table
    const latIdx = columnNames.indexOf('latitude')
    const lngIdx = columnNames.indexOf('longitude')
    const afaiIdx = columnNames.indexOf('AFAI')
    const timeIdx = columnNames.indexOf('time')

    if (latIdx >= 0 && lngIdx >= 0 && afaiIdx >= 0) {
      // Get data timestamp
      if (timeIdx >= 0) {
        for (const row of rows) {
          if (row[timeIdx]) { dataDate = row[timeIdx]; break }
        }
      }

      for (const row of rows) {
        const rawAfai = row[afaiIdx]
        if (rawAfai == null || isNaN(rawAfai)) continue
        const afai = normalizeAfai(rawAfai)
        // Only include points with some signal
        if (afai > 0.06) {
          grid.push({
            lat: Math.round(row[latIdx] * 100) / 100,
            lng: Math.round(row[lngIdx] * 100) / 100,
            afai: Math.round(afai * 1000) / 1000,
            date: dataDate,
          })
        }
      }
      console.log(`  ERDDAP: ${rows.length} raw points → ${grid.length} with signal`)
    } else {
      console.warn('  Missing columns:', columnNames)
    }
  }

  // Fallback if ERDDAP returned nothing
  if (grid.length === 0) {
    console.warn('  ERDDAP returned no data — using fallback demo grid')
    const fallback = generateFallbackGrid()
    grid = fallback.grid
    source = fallback.source
    dataDate = fallback.date
  }

  const output = {
    updatedAt: new Date().toISOString(),
    source,
    dataDate,
    resolution: '~0.25°',
    bounds: BOUNDS,
    count: grid.length,
    grid,
  }

  // Ensure output directory exists
  const dir = path.dirname(OUTPUT)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(OUTPUT, JSON.stringify(output))
  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1)
  console.log(`  Written: ${OUTPUT} (${grid.length} points, ${sizeKB} KB)`)
  console.log(`  Source: ${source} | Date: ${dataDate}`)
}

main().catch(err => {
  console.error('FATAL:', err)
  // On failure, still generate fallback
  const fallback = generateFallbackGrid()
  const output = {
    updatedAt: new Date().toISOString(),
    source: fallback.source,
    dataDate: fallback.date,
    resolution: '~0.25°',
    bounds: BOUNDS,
    count: fallback.grid.length,
    grid: fallback.grid,
  }
  const dir = path.dirname(OUTPUT)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(OUTPUT, JSON.stringify(output))
  console.log(`  Fallback written: ${OUTPUT} (${fallback.grid.length} points)`)
})

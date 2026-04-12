#!/usr/bin/env node
/**
 * fetch-beach-weather.cjs — Year-round beach conditions from Open-Meteo.
 *
 * Free, no key. Fetches wave height/period + SST from the Marine API and
 * UV/wind from the Forecast API, batched via comma-separated coord lists
 * (Open-Meteo supports up to ~100 points per request).
 *
 * Writes: public/api/weather/beaches-weather.json
 *
 * This is the 365j/an signal the app needs for shoulder-season value:
 * when AFAI is clean and there's nothing sargassum-interesting to show,
 * the beach card still answers "is it swimmable today?" via wave + UV.
 *
 * Chain: cron → fetch-beach-weather → commit → deploy
 */
const fs = require('fs')
const path = require('path')

const BEACHES_PATH = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json')
const OUT_PATH = path.join(__dirname, '..', 'public', 'api', 'weather', 'beaches-weather.json')

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const CHUNK = 90

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchJson(url, attempt = 0) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (e) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      return fetchJson(url, attempt + 1)
    }
    console.log(`  fetch failed after retries: ${e.message}`)
    return null
  }
}

async function fetchMarine(beaches) {
  const lats = beaches.map(b => b.lat).join(',')
  const lons = beaches.map(b => b.lng).join(',')
  const url = `${MARINE_URL}?latitude=${lats}&longitude=${lons}&daily=wave_height_max,wave_period_max&current=wave_height,wave_period,sea_surface_temperature&timezone=auto&forecast_days=1`
  console.log(`  Marine batch (${beaches.length} pts)...`)
  const data = await fetchJson(url)
  if (!data) return null
  return Array.isArray(data) ? data : [data]
}

async function fetchForecast(beaches) {
  const lats = beaches.map(b => b.lat).join(',')
  const lons = beaches.map(b => b.lng).join(',')
  const url = `${FORECAST_URL}?latitude=${lats}&longitude=${lons}&daily=uv_index_max,wind_speed_10m_max,wind_direction_10m_dominant,temperature_2m_max,precipitation_sum&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=1`
  console.log(`  Forecast batch (${beaches.length} pts)...`)
  const data = await fetchJson(url)
  if (!data) return null
  return Array.isArray(data) ? data : [data]
}

function windBearingToFr(deg) {
  if (deg == null) return null
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function swimCondition({ waveHeight, windSpeed, sst }) {
  // Heuristic thresholds tuned for Caribbean beach-goers (not surfers).
  // Water in Martinique/GP rarely drops below 26°C, so cold isn't a factor.
  if (waveHeight == null && windSpeed == null) return 'unknown'
  if (waveHeight != null && waveHeight >= 1.5) return 'rough'
  if (windSpeed != null && windSpeed >= 35) return 'windy'
  if (waveHeight != null && waveHeight >= 0.8) return 'moderate'
  return 'calm'
}

async function main() {
  console.log('=== Beach Weather Fetch (Open-Meteo) ===')
  console.log(`Date: ${new Date().toISOString()}\n`)

  const beaches = JSON.parse(fs.readFileSync(BEACHES_PATH, 'utf-8'))
  console.log(`${beaches.length} beaches to enrich\n`)

  const marineResults = {}
  const forecastResults = {}

  for (const group of chunk(beaches, CHUNK)) {
    const [marine, forecast] = await Promise.all([fetchMarine(group), fetchForecast(group)])
    if (marine) group.forEach((b, i) => { marineResults[b.id] = marine[i] })
    if (forecast) group.forEach((b, i) => { forecastResults[b.id] = forecast[i] })
    await new Promise(r => setTimeout(r, 800))
  }

  const enriched = {}
  let ok = 0
  let empty = 0
  for (const b of beaches) {
    const m = marineResults[b.id]
    const f = forecastResults[b.id]
    if (!m && !f) { empty++; continue }

    const waveHeight = m?.current?.wave_height ?? m?.daily?.wave_height_max?.[0] ?? null
    const wavePeriod = m?.current?.wave_period ?? m?.daily?.wave_period_max?.[0] ?? null
    const sst = m?.current?.sea_surface_temperature ?? null
    const airTemp = f?.current?.temperature_2m ?? f?.daily?.temperature_2m_max?.[0] ?? null
    const windSpeed = f?.current?.wind_speed_10m ?? f?.daily?.wind_speed_10m_max?.[0] ?? null
    const windDeg = f?.current?.wind_direction_10m ?? f?.daily?.wind_direction_10m_dominant?.[0] ?? null
    const uvMax = f?.daily?.uv_index_max?.[0] ?? null
    const precip = f?.daily?.precipitation_sum?.[0] ?? null

    enriched[b.id] = {
      waveHeight: waveHeight != null ? Math.round(waveHeight * 10) / 10 : null,
      wavePeriod: wavePeriod != null ? Math.round(wavePeriod * 10) / 10 : null,
      sst: sst != null ? Math.round(sst * 10) / 10 : null,
      airTemp: airTemp != null ? Math.round(airTemp) : null,
      windSpeed: windSpeed != null ? Math.round(windSpeed) : null,
      windDir: windBearingToFr(windDeg),
      uvMax: uvMax != null ? Math.round(uvMax) : null,
      precip: precip != null ? Math.round(precip * 10) / 10 : null,
      condition: swimCondition({ waveHeight, windSpeed, sst }),
    }
    ok++
  }

  const out = {
    _comment: 'Year-round beach conditions (Open-Meteo Marine+Forecast). Refreshed daily.',
    updatedAt: new Date().toISOString(),
    source: 'open-meteo',
    count: ok,
    beaches: enriched,
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8')
  console.log(`\n✓ Wrote ${ok}/${beaches.length} beaches (${empty} empty)`)
  console.log(`  ${OUT_PATH}`)

  // Print 3 samples
  const ids = Object.keys(enriched).slice(0, 3)
  for (const id of ids) {
    const e = enriched[id]
    const b = beaches.find(x => x.id === id)
    console.log(`  • ${id} (${b.name}): ${e.condition} — waves ${e.waveHeight}m, wind ${e.windSpeed}km/h ${e.windDir}, SST ${e.sst}°C, UV ${e.uvMax}`)
  }
}

main().catch(e => { console.error('fetch-beach-weather error:', e); process.exit(1) })

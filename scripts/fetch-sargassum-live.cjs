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
 *   public/api/copernicus/sargassum.json       (source: "erddap-live") — contrat MQ/GP, INCHANGE
 *   public/api/copernicus/history.json         (appended)
 *   public/api/copernicus/<regionId>/sargassum.json + history.json (multi-regions, regions/*.json)
 *
 * Env:
 *   SARG_OUT_DIR  (mode test) redirige TOUTES les ecritures ET l'etat lu (history,
 *                 banks, archive) vers <dir>/api/copernicus/ au lieu de public/api/copernicus/.
 *                 Les INPUTS produits par d'autres scripts (beaches-list.json,
 *                 beaches-weather.json) restent lus depuis public/ dans tous les cas.
 *
 * Usage:
 *   node scripts/fetch-sargassum-live.cjs
 */
const fs = require('fs')
const path = require('path')
const { satelliteConfidence, memoryConfidence } = require('./lib/confidence.cjs')
const { buildHonestForecast, statusFromAfai: statusFromAfaiForecast, DAYS: FDAYS } = require('./lib/forecast.cjs')
const { gateWeekly, assertPrivateComplete } = require('./lib/forecast-gate.cjs')

// Guard fail-loud : n'écrit le privé QUE s'il couvre chaque sentinelle (levels) avec
// 7 jours. Sinon → erreur visible + run rouge (process.exitCode=1), SANS écrire un
// privé incomplet (cas 'precheur' : sentinelle ajoutée mais absente du privé). Honnête :
// on bloque/alerte, on ne fabrique jamais une série manquante. SG_GATING=0 = pas de gating.
function writePrivateGuarded(label, dir, privateForecasts, truncated, levels, updatedAt) {
  if (!truncated) return
  if (process.env.SG_GATING !== '0') {
    const { ok, missing, short } = assertPrivateComplete(privateForecasts, (levels || []).map(l => l.id), { requireDays: 7 })
    if (!ok) {
      console.error(`[${label}] PRIVÉ INCOMPLET — non écrit : missing=[${missing.join(',')}] short=${JSON.stringify(short)}`)
      process.exitCode = 1
      return
    }
  }
  writePrivateForecastFile(dir, privateForecasts, updatedAt)
}
const { computeScore } = require('./lib/score.cjs')
const { phaseForRegion, monthsForRegion } = require('./lib/season-climatology.cjs')
const { getAllRegions } = require('../regions/index.cjs')

// Repère de SAISON (orientation moyen terme, B2C fiche plage). Phase climatologique
// régionale SOURCÉE (season-climatology.cjs) — PAS une prévision, jamais datée, jamais
// notée sur /fiabilite/. Le front la combine au statut MESURÉ de la plage. Champ additif :
// n'altère JAMAIS le verdict (levels/weekly/scores restent 100% data ERDDAP).
function seasonOutlookFor(regionId, atDate) {
  const p = phaseForRegion(regionId, atDate)
  const m = monthsForRegion(regionId)
  return { phase: p.phase, source: p.source, months: m.months }
}

// ── Dossier de sortie ──────────────────────────────────────────────
// Defaut: public/ du repo (comportement historique). SARG_OUT_DIR = sandbox de test.
const OUT_PUBLIC = process.env.SARG_OUT_DIR
  ? path.resolve(process.env.SARG_OUT_DIR)
  : path.join(__dirname, '..', 'public')

// ── Beach coordinates + coast exposure ────────────────────────────
// coast: 'atlantic'  = cote exposee aux alizes (sargasses arrivent par l'est)
//        'sheltered' = cote ouest VRAIMENT abritee (baie FDF + cote ouest Basse-Terre)
//                      → NEVER has arrival signal (protegee par le relief)
// Note: Anses d'Arlet + Diamant sud PEUVENT recevoir sargasses qui contournent
// le sud de l'ile, classees 'atlantic' pour ne pas cacher un vrai risque.
const BEACHES = [
  // coastNormal = direction the coastline faces (degrees from N). Determines:
  //   - Which offshore bearing range to sample for incoming sargassum
  //   - Onshore wind component calculation
  //   - Bank arrival detection acceptance cone
  { id: 'grande-anse',    lat: 14.5028, lng: -61.0856, island: 'mq', coast: 'atlantic', coastNormal: 200 },  // Anses d'Arlet sud — faces S-SSW, contournement sud
  { id: 'anse-mitan',     lat: 14.5523, lng: -61.0552, island: 'mq', coast: 'sheltered', coastNormal: 270 }, // Trois-Ilets, baie FDF fermee
  { id: 'anse-noire',     lat: 14.5277, lng: -61.0874, island: 'mq', coast: 'sheltered', coastNormal: 270 }, // Anses d'Arlet nord, abritee
  { id: 'tartane',        lat: 14.7507, lng: -60.9257, island: 'mq', coast: 'atlantic', coastNormal: 80 },   // Caravelle, faces E-ENE
  { id: 'anse-madame',    lat: 14.6178, lng: -61.1036, island: 'mq', coast: 'sheltered', coastNormal: 270 }, // Schoelcher, baie FDF
  { id: 'diamant',        lat: 14.4758, lng: -61.0314, island: 'mq', coast: 'atlantic', coastNormal: 210 },  // faces SSW, ouvert au sud
  { id: 'pt-marin',       lat: 14.4511, lng: -60.8836, island: 'mq', coast: 'atlantic', coastNormal: 160 },  // Sainte-Anne sud, faces SSE
  { id: 'sainte-anne',    lat: 14.4305, lng: -60.8850, island: 'mq', coast: 'atlantic', coastNormal: 170 },  // faces S-SSE
  { id: 'les-salines',    lat: 14.3959, lng: -60.8690, island: 'mq', coast: 'atlantic', coastNormal: 180 },  // pointe sud, faces plein sud
  { id: 'vauclin',        lat: 14.5414, lng: -60.8292, island: 'mq', coast: 'atlantic', coastNormal: 110 },  // cote est, faces ESE
  // Côte caraïbe NORD (Le Prêcheur) — sentinelle ajoutée le 2026-06-30 après un
  // échouage massif observé à Anse Céron / Anse Couleuvre (post FB SOS Sargasses,
  // « première fois que je vois ça ») alors que ces plages, interpolées depuis des
  // baies abritées propres, s'affichaient VERTES. Anchor = Anse Céron (mq033). On
  // échantillonne donc directement l'AFAI au large de cette façade au lieu de
  // recopier des baies sud/est. coast:'atlantic' VOLONTAIRE (ne cache pas le risque,
  // cf. ligne ~1303) ; coastNormal 290 = face WNW (mer des Caraïbes, d'où dérive le
  // banc sur la côte sous-le-vent). Les anses voisines (mq030/mq032/mq066) interpolent
  // désormais depuis cette lecture directe.
  { id: 'precheur',       lat: 14.8334, lng: -61.2247, island: 'mq', coast: 'atlantic', coastNormal: 290 },  // Anse Céron, Le Prêcheur — côte caraïbe nord, faces WNW
  { id: 'gp-grande-anse', lat: 16.1312, lng: -61.7682, island: 'gp', coast: 'sheltered', coastNormal: 270 }, // Basse-Terre cote ouest
  { id: 'gp-malendure',   lat: 16.1721, lng: -61.7767, island: 'gp', coast: 'sheltered', coastNormal: 270 }, // Bouillante, cote ouest
  { id: 'gp-sainte-anne', lat: 16.2226, lng: -61.3828, island: 'gp', coast: 'atlantic', coastNormal: 170 },  // Grande-Terre sud, faces S-SSE
  { id: 'gp-pt-chateaux', lat: 16.2531, lng: -61.2307, island: 'gp', coast: 'atlantic', coastNormal: 90 },   // extreme est, faces E
  { id: 'gp-gosier',      lat: 16.2048, lng: -61.4948, island: 'gp', coast: 'atlantic', coastNormal: 180 },  // faces sud
  { id: 'gp-caravelle',   lat: 16.2181, lng: -61.3965, island: 'gp', coast: 'atlantic', coastNormal: 170 },  // faces S-SSE
  { id: 'gp-bas-du-fort', lat: 16.2140, lng: -61.5237, island: 'gp', coast: 'atlantic', coastNormal: 200 },  // faces S-SSW
  { id: 'gp-deshaies',    lat: 16.3054, lng: -61.7951, island: 'gp', coast: 'sheltered', coastNormal: 290 }, // Basse-Terre nord-ouest
  { id: 'gp-moule',       lat: 16.4222, lng: -61.5337, island: 'gp', coast: 'atlantic', coastNormal: 60 },   // Grande-Terre nord-est, faces ENE
  { id: 'gp-vieux-fort',  lat: 16.2488, lng: -61.1428, island: 'gp', coast: 'atlantic', coastNormal: 130 },  // Basse-Terre sud-est, faces SE
]

// ── ERDDAP configuration ──────────────────────────────────────────
const ERDDAP_7D = 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_7D.json'
const ERDDAP_1D = 'https://cwcgom.aoml.noaa.gov/erddap/griddap/noaa_aoml_atlantic_oceanwatch_AFAI_1D.json'
const ERDDAP_BASE = ERDDAP_7D // backward compat alias
const FETCH_TIMEOUT_MS = 60000 // Wider bounding boxes = more data, need more time
const FETCH_1D_TIMEOUT_MS = 15000 // 1D is a bonus — don't block on it
const NO_DATA_AFAI = 0.05 // If null / no detection = clean ocean
// Fraicheur satellite : le composite ERDDAP 7D se rafraichit ~1×/jour, donc un
// erddapTimestamp de 12-30h est NORMAL. Au-dela de ce seuil, c'est que la source
// (satellite ou serveur ERDDAP) ne se met plus a jour — le pipeline republie
// pourtant updatedAt=now a chaque run, donc SEUL ce flag derive du vrai timestamp
// satellite peut detecter le composite perime. 36h = 1.5 cycle manque.
const SAT_STALE_HOURS = 36

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

// Gating J+2→J+7 : écrit la prévision FULL dans <baseDir>/_private/forecast-full.json
// (+ .htaccess Deny) que seul forecast.php restitue après auth. Le fichier est
// COLOCALISÉ avec sargassum.json + forecast.php du même domaine → l'endpoint lit
// __DIR__/_private/forecast-full.json, pas besoin de déduire la région.
function writePrivateForecastFile(baseDir, privateForecasts, updatedAt) {
  const privDir = path.join(baseDir, '_private')
  fs.mkdirSync(privDir, { recursive: true })
  const htPath = path.join(privDir, '.htaccess')
  if (!fs.existsSync(htPath)) fs.writeFileSync(htPath, 'Require all denied\n', 'utf-8')
  fs.writeFileSync(
    path.join(privDir, 'forecast-full.json'),
    JSON.stringify({ updatedAt, weekly: privateForecasts }),
    'utf-8'
  )
}

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
  if (!Number.isFinite(raw)) return 0.05 // NaN/null/undefined → pas de donnée = clean (sinon NaN se propage dans toute la grille)
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
 * Fetch the 1-day AFAI composite (rapid change detection).
 * Same structure as 7D but shorter integration period → detects arrivals ~24h earlier.
 * Non-critical: returns null on any failure (used as bonus signal, never blocks pipeline).
 */
async function fetchErddapGrid1D(region) {
  const { latMin, latMax, lngMin, lngMax } = region
  const url = `${ERDDAP_1D}?AFAI[(last)][(${latMin}):(${latMax})][(${lngMin}):(${lngMax})]`
  const data = await safeFetch(url, FETCH_1D_TIMEOUT_MS)
  if (!data || !data.table) return null
  const table = data.table
  const colNames = table.columnNames
  const rows = table.rows
  if (!colNames || !rows || rows.length === 0) return null
  const latIdx = colNames.indexOf('latitude')
  const lngIdx = colNames.indexOf('longitude')
  const afaiIdx = colNames.indexOf('AFAI')
  if (latIdx < 0 || lngIdx < 0 || afaiIdx < 0) return null
  const points = rows.map(row => ({ latitude: row[latIdx], longitude: row[lngIdx], AFAI: row[afaiIdx] }))
  return { points, dataAgeHours: 12 } // assume ~12h since 1D composites are daily
}

/**
 * Compare 1D vs 7D AFAI for a beach to detect rapid changes.
 * Returns a correction factor: positive = recent arrival, negative = recent clearance.
 */
function compute1DCorrection(beach, grid7D, grid1D) {
  if (!grid1D || !grid1D.points || grid1D.points.length === 0) return 0
  if (!grid7D || !grid7D.points || grid7D.points.length === 0) return 0
  // Taille d'echantillon 1D minimale pour une correction a pleine force.
  // Pourquoi : le 2026-06-09, la grille 1D MQ n'avait que 58 pixels valides
  // sur toute la boite — chaque plage n'en attrapait que ~8 en zone nearby
  // (30 km), dont 4 satures au plafond capteur (raw 4e-3). avg1D≈0.29 vs
  // avg7D≈0.07 → correction +0.15 (le cap) appliquee partout : 9 plages ont
  // flippe clean→moderate alors que la base 7D (500-600 pixels/plage) disait
  // "propre". On pondere donc la correction par n1D/MIN_1D_SAMPLE : 8 pixels
  // bruites ne peuvent plus basculer toute l'ile.
  // NOTE : ce fix ne touche PAS aux seuils (0.15/0.40), ni a normalizeAfai,
  // ni au blend 70/30 — et n'ajoute AUCUN floor (interdit, cf feedback
  // forecast-floor-ban : ne JAMAIS re-ajouter de floor atlantic).
  const MIN_1D_SAMPLE = 20
  // Extract AFAI from both grids using nearby zone only (0-30km)
  // Retourne aussi n = nombre de pixels valides utilises (taille d'echantillon)
  function nearbyAvg(grid) {
    let sumW = 0, sumV = 0, n = 0
    for (const p of grid.points) {
      if (p.AFAI === null || p.AFAI === undefined) continue
      const dist = haversineKm(beach.lat, beach.lng, p.latitude, p.longitude)
      if (dist > NEARBY_RADIUS_KM) continue
      const w = 1 / (1 + dist)
      sumW += w; sumV += w * normalizeAfai(p.AFAI); n++
    }
    return { avg: sumW > 0 ? sumV / sumW : null, n }
  }
  const { avg: avg7D } = nearbyAvg(grid7D)
  const { avg: avg1D, n: n1D } = nearbyAvg(grid1D)
  if (avg7D === null || avg1D === null) return 0
  const diff = avg1D - avg7D
  // Only apply correction if the difference is significant (>0.10)
  if (Math.abs(diff) < 0.10) return 0
  // Cap correction to prevent wild swings: max ±0.15
  const cappedCorr = Math.max(-0.15, Math.min(0.15, diff * 0.7))
  // Ponderation par taille d'echantillon, appliquee APRES le cap, symetrique
  // (attenue aussi les corrections negatives) : peu de pixels = peu de confiance.
  const factor = Math.min(1, n1D / MIN_1D_SAMPLE)
  return cappedCorr * factor
}

// ── Sentinel-2 near-shore (signal correctif additif, FLAGGÉ) ──────────
// Produit par scripts/fetch-sentinel2.cjs (CDSE FAI 10-20m au ras de la côte),
// lu ici comme INPUT. Applique la MÊME philosophie que la correction 1D :
// additif, cappé, pondéré (couverture × fraîcheur), JAMAIS un blend/override.
// Activation PILOTÉE PAR LA DONNÉE : sentinel2-calibrate.cjs écrit
// sentinel2-calibration.json {active} quand le S2 a PROUVÉ qu'il colle au réel
// (accord ≥ seuil sur assez d'échantillons). Le pipeline lit ce flag → le S2
// s'active TOUT SEUL, sans édition de workflow. Overrides : SG_SENTINEL2=0 =
// kill-switch (force OFF), SG_SENTINEL2=1 = force ON (test). Zéro impact verdict
// tant que active=false. Honnêteté d'abord.
const S2_MAX_AGE_DAYS = 3      // au-delà, le passage S2 est trop vieux pour corriger le J+0
const S2_MIN_COVERAGE = 0.25   // sous 25% de pixels valides = trop nuageux, on ignore
const S2_MIN_DIFF = 0.10       // ne corrige que si l'écart est significatif (comme le 1D)

function sentinel2Active(dir) {
  if (process.env.SG_SENTINEL2 === '0') return false // kill-switch
  if (process.env.SG_SENTINEL2 === '1') return true  // force ON (test)
  try {
    const cal = JSON.parse(fs.readFileSync(path.join(dir, 'sentinel2-calibration.json'), 'utf-8'))
    return !!cal.active
  } catch (_) { return false }
}

function loadSentinel2Layer(dir) {
  if (!sentinel2Active(dir)) return null
  try {
    const p = path.join(dir, 'sentinel2-nearshore.json')
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (raw && raw.beaches && typeof raw.beaches === 'object') {
      console.log(`  Sentinel-2 layer: ${Object.keys(raw.beaches).length} plage(s) (source=${raw.source}, provisional=${!!raw.provisional})`)
      return raw.beaches
    }
  } catch (_) {
    console.log('  Sentinel-2 layer absent/illisible → correction S2 ignorée (no-op).')
  }
  return null
}

/**
 * Correction near-shore Sentinel-2 pour une plage. Miroir de compute1DCorrection :
 * diff = afaiLike(S2) - afaiSat(ERDDAP), cappé ±0.15, pondéré par la couverture
 * nuage-libre. Ne s'applique que si le passage S2 est frais (≤3j) et couvrant (≥25%).
 * Retourne 0 si désactivé, absent, périmé ou peu couvrant.
 */
function computeSentinel2Correction(beach, s2Layer, afaiSat) {
  if (!s2Layer) return 0
  const s = s2Layer[beach.id]
  if (!s || s.afaiLike == null) return 0
  if (s.coverage == null || s.coverage < S2_MIN_COVERAGE) return 0
  if (s.ageDays == null || s.ageDays > S2_MAX_AGE_DAYS) return 0
  const diff = s.afaiLike - afaiSat
  if (Math.abs(diff) < S2_MIN_DIFF) return 0
  // Gain 0.6 (plus prudent que le 1D à 0.7 car seuils FAI provisoires) puis
  // pondération par la couverture nuage-libre : peu de pixels = peu de confiance.
  const capped = Math.max(-0.15, Math.min(0.15, diff * 0.6))
  return capped * Math.min(1, s.coverage)
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

  // Bande "shore" 0-10km — NOUVELLES RÉGIONS UNIQUEMENT (mq/gp gardent leur
  // calibration backtestée 86% J+1 inchangée, byte-identique).
  // Pourquoi : pour 12 plages espacées de 3-8 km (Bávaro…), les disques de
  // 30 km se recouvrent à >85% et le signal CÔTIER se dilue dans ~2 800 km²
  // d'océan → toutes à 0.12 "clean" le 2026-06-09 alors qu'à 8 km Macao
  // lisait 0.178 et Uvero Alto 0.201 (= moderate). Diagnostic au pixel fait
  // (feedback_forecast_floor_ban) : on resserre l'ÉCHANTILLONNAGE, on ne
  // touche ni seuils ni normalizeAfai ni floors.
  const useShoreBand = !!(beach.island && beach.island !== 'mq' && beach.island !== 'gp')
  const SHORE_RADIUS_KM = 10

  const shoreValues = []   // 0-10km — l'échouage réel (nouvelles régions)
  const nearbyValues = []  // within 30km — direct threat
  const offshoreValues = [] // 30-100km east/NE — incoming threat

  for (const p of grid.points) {
    // Skip only literal null — negative AFAI is valid (means clean)
    if (p.AFAI === null || p.AFAI === undefined) continue

    const dist = haversineKm(beach.lat, beach.lng, p.latitude, p.longitude)
    if (dist > OFFSHORE_RADIUS_KM) continue

    const normalized = normalizeAfai(p.AFAI)

    if (useShoreBand && dist <= SHORE_RADIUS_KM) {
      // Pondération quadratique : les pixels collés à la plage dominent.
      shoreValues.push({ value: normalized, weight: 1 / ((1 + dist) * (1 + dist)), dist })
      continue
    }
    if (dist <= NEARBY_RADIUS_KM) {
      // Nearby zone: weight by inverse distance (closer = more relevant)
      const weight = 1 / (1 + dist)
      nearbyValues.push({ value: normalized, weight, dist })
    } else {
      // Offshore zone: only count if the point is in the "incoming" direction for this beach
      const bear = bearing(beach.lat, beach.lng, p.latitude, p.longitude)
      // Acceptance cone: 140° arc centered on coastNormal (where sargassum arrives FROM)
      // Default (east coast): accept 20-160°. South coast (coastNormal ~180): accept 110-250°.
      const cn = beach.coastNormal || 90 // default: faces east
      const halfCone = 70 // 70° each side of coastNormal
      let bearMin = cn - halfCone
      let bearMax = cn + halfCone
      // Normalize to 0-360
      if (bearMin < 0) bearMin += 360
      if (bearMax > 360) bearMax -= 360
      // Check if bearing is within the cone (handle wraparound)
      const inCone = bearMin < bearMax
        ? (bear >= bearMin && bear <= bearMax)
        : (bear >= bearMin || bear <= bearMax)
      if (inCone) {
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

  const shoreAvg = useShoreBand ? weightedAvg(shoreValues) : null
  const nearbyAvg = weightedAvg(nearbyValues)
  const offshoreAvg = weightedAvg(offshoreValues)

  let afai
  let method

  if (shoreAvg !== null) {
    // Nouvelles régions : la bande côtière domine (50%), le large complète.
    // Bandes manquantes → renormalisation sur les bandes disponibles.
    const parts = [[shoreAvg, 0.5], [nearbyAvg, 0.25], [offshoreAvg, 0.25]].filter(([v]) => v !== null)
    const wSum = parts.reduce((s, [, w]) => s + w, 0)
    afai = parts.reduce((s, [v, w]) => s + v * w, 0) / wSum
    method = `shore-${shoreValues.length}sh-${nearbyValues.length}near-${offshoreValues.length}off`
  } else if (nearbyAvg !== null && offshoreAvg !== null) {
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

  // Les pixels shore comptent dans la confiance comme du nearby (plus proches = plus fiables).
  const nearLikePts = shoreValues.length + nearbyValues.length
  const confidence = satelliteConfidence(method, nearLikePts, offshoreValues.length, dataAgeHours)
  return { afai, method, nearbyPts: nearLikePts, offshorePts: offshoreValues.length, confidence }
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
    let rawPeak = 0 // undecayed historical peak (for bypass threshold)

    for (const entry of history) {
      const daysAgo = (new Date(today) - new Date(entry.date)) / (1000 * 60 * 60 * 24)
      if (daysAgo <= 0 || daysAgo > WINDOW_DAYS) continue

      const beachEntry = entry.levels.find(l => l.id === level.id)
      if (!beachEntry || beachEntry.afai < 0.15) continue // ignore history with no beaching

      if (beachEntry.afai > rawPeak) rawPeak = beachEntry.afai

      // Exponential decay: value decreases by 50% every HALF_LIFE_DAYS
      const decayed = beachEntry.afai * Math.exp(-DECAY_LAMBDA * daysAgo)
      if (decayed > peakDecayed) {
        peakDecayed = decayed
        bestDaysAgo = daysAgo
      }
    }

    // If satellite shows clean (AFAI < 0.10) for N consecutive recent days,
    // trust the satellite — sargassum has dissipated, skip memory boost.
    // N scales with the historical peak: a beach at 0.78 (avoid) can't
    // physically clear in 2 days, so require more confirmation for higher
    // past contamination.
    //
    // BUG FIX (2026-04-11): clean satellite observations often read exactly
    // 0.05 (the CLEAN_BASELINE / NO_DATA sentinel). The previous check
    // `bl.afai <= 0.05 => continue` treated those as no-data and never
    // counted them, so memory-enhanced beaches never cleared even after
    // weeks of clean satellite. Now we count anything below 0.10 as a
    // clean day. ERDDAP outage remains rare — backup scraper catches it.
    const sortedRecent = history
      .filter(h => {
        const d = (new Date(today) - new Date(h.date)) / (1000 * 60 * 60 * 24)
        return d > 0 && d <= 10
      })
      .sort((a, b) => b.date.localeCompare(a.date))
    let consecutiveClean = 0
    for (const entry of sortedRecent) {
      const bl = entry.levels.find(l => l.id === level.id)
      if (!bl) break
      if (bl.afai >= 0.10) break    // actual sargassum detected — break streak
      consecutiveClean++            // clean reading (includes 0.05 baseline)
    }
    const requiredCleanDays = rawPeak >= 0.60 ? 6 : rawPeak >= 0.40 ? 5 : rawPeak >= 0.25 ? 4 : 3
    if (consecutiveClean >= requiredCleanDays) continue

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

// ── INDICE H2S (santé/air) : risque DÉRIVÉ de la sargasse accumulée en décomposition ──
// Additif + try/catch : ne casse JAMAIS la donnée core. Source unique = scripts/lib/h2s.cjs.
// ⚠️ risque dérivé, JAMAIS une mesure de gaz (aucun capteur terrain). REFONTE-MASTER §4A #4.
function applyH2SIndex(levels, dir) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const WINDOW_DAYS = 10 // fenêtre de récence pour les jours consécutifs (cf. boostBeachMemory)
    const { deriveH2S } = require('./lib/h2s.cjs')
    let history = []
    try { history = (JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf-8')).history) || [] } catch (_) {}
    let weather = {}
    try { const w = JSON.parse(fs.readFileSync(path.join(dir, 'beaches-weather.json'), 'utf-8')); weather = w.beaches || w || {} } catch (_) {}
    const recent = history
      .filter(h => { const d = (new Date(today) - new Date(h.date)) / 86400000; return d > 0 && d <= WINDOW_DAYS })
      .sort((a, b) => b.date.localeCompare(a.date))
    let tagged = 0
    for (const level of levels) {
      // consecDays = jours consécutifs récents à AFAI >= 0,15 (degré de décomposition)
      let consecDays = 0
      for (const e of recent) {
        const bl = (e.levels || []).find(l => l.id === level.id)
        if (!bl || bl.afai < 0.15) break
        consecDays++
      }
      if (consecDays === 0 && level.afai >= 0.15) consecDays = 1 // touchée aujourd'hui, historique muet
      const w = weather[level.id] || {}
      level.h2s = deriveH2S({
        mass: level.afai,                              // afai effectif (post-accumulation)
        consecDays,
        sheltered: !!level.sheltered,                  // optionnel (sinon false)
        windSpeed: (typeof w.windSpeed === 'number') ? w.windSpeed : null,
      })
      if (level.h2s.level !== 'low') tagged++
    }
    if (tagged > 0) console.log(`  H2S index: ${tagged} beach(es) at moderate/high air-risk`)
  } catch (e) {
    console.log('  [h2s] skipped (non-bloquant):', e.message)
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

// Centres meteo legacy (racine MQ/GP). Les regions passent leur propre centre.
const DEFAULT_METEO_CENTERS = { mq: [14.6, -61.0], gp: [16.2, -61.5] }

/**
 * Fetch regional wind data from Open-Meteo for drift estimation.
 * Returns { speed (km/h), dir (degrees, "from" convention) } for each island/region.
 * @param {object} [centers] - { islandOrRegionId: [lat, lng] } (defaut: MQ+GP legacy)
 * @param {string} [timezone] - timezone Open-Meteo (defaut: legacy America/Martinique)
 */
async function fetchRegionalWind(centers = DEFAULT_METEO_CENTERS, timezone = 'America/Martinique') {
  const wind = {}
  for (const [island, [lat, lng]] of Object.entries(centers)) {
    // Fetch current + 7-day hourly forecast (168 hours)
    // v3.1: extended for Beach Score engine — now also fetches cloud_cover, uv_index, temperature_2m, precipitation_probability
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
      + `&current=wind_speed_10m,wind_direction_10m,cloud_cover,temperature_2m,precipitation,uv_index`
      + `&hourly=wind_speed_10m,wind_direction_10m,cloud_cover,uv_index,temperature_2m,precipitation_probability`
      + `&forecast_days=7&timezone=${timezone}`
    const data = await safeFetch(url, 15000)
    if (data?.current) {
      wind[island] = {
        speed: Math.round(data.current.wind_speed_10m * 10) / 10,
        dir: Math.round(data.current.wind_direction_10m),
        cloud_cover: data.current.cloud_cover ?? null,
        temperature: data.current.temperature_2m ?? null,
        precipitation: data.current.precipitation ?? null,
        uv_index: data.current.uv_index ?? null,
      }
      // Parse hourly forecast (wind + weather for score forecast)
      if (data.hourly?.time?.length) {
        wind[island].hourly = data.hourly.time.map((t, i) => ({
          time: t,
          speed: data.hourly.wind_speed_10m[i] || 0,
          dir: data.hourly.wind_direction_10m[i] || 0,
          cloud_cover: data.hourly.cloud_cover?.[i] ?? null,
          uv_index: data.hourly.uv_index?.[i] ?? null,
          temperature: data.hourly.temperature_2m?.[i] ?? null,
          precip_prob: data.hourly.precipitation_probability?.[i] ?? null,
        }))
        console.log(`  Wind ${island.toUpperCase()}: ${wind[island].speed} km/h from ${wind[island].dir}° | cloud ${wind[island].cloud_cover}% | UV ${wind[island].uv_index} | ${wind[island].hourly.length}h forecast`)
      } else {
        console.log(`  Wind ${island.toUpperCase()}: ${wind[island].speed} km/h from ${wind[island].dir}° (no hourly forecast)`)
      }
    } else {
      // Fallback: typical trade wind (15 km/h from ENE), no hourly, neutral weather
      wind[island] = { speed: 15, dir: 75, hourly: null, cloud_cover: 40, temperature: 28, precipitation: 0, uv_index: 7 }
      console.log(`  Wind ${island.toUpperCase()}: fallback 15 km/h from 75° (trade wind + neutral weather)`)
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
 * Fetch real ocean current + wave data from Open-Meteo Marine API.
 * Returns { current: {speed (m/s), dir (degrees)}, waves: {height (m), dir, period (s)}, hourly: [...] }
 * per island/region. Falls back to hardcoded constants on failure.
 * @param {object} [centers] - { islandOrRegionId: [lat, lng] } (defaut: MQ+GP legacy)
 */
async function fetchMarineData(centers = DEFAULT_METEO_CENTERS) {
  const marine = {}
  for (const [island, [lat, lng]] of Object.entries(centers)) {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=ocean_current_velocity,ocean_current_direction,sea_surface_temperature&hourly=ocean_current_velocity,ocean_current_direction,wave_height,wave_direction,wave_period,sea_surface_temperature&forecast_days=3`
    const data = await safeFetch(url, 15000)
    if (data?.current?.ocean_current_velocity != null) {
      marine[island] = {
        current: {
          speed: data.current.ocean_current_velocity, // m/s
          dir: data.current.ocean_current_direction,  // degrees (direction current flows TO)
        },
        sst: data.current.sea_surface_temperature ?? null,  // °C — for beach scoring
        wave_height: data.hourly?.wave_height?.[0] ?? null, // m — representative wave for scoring
        hourly: data.hourly?.time?.map((t, i) => ({
          time: t,
          curSpeed: data.hourly.ocean_current_velocity[i] || 0,
          curDir: data.hourly.ocean_current_direction[i] || 0,
          waveH: data.hourly.wave_height?.[i] || 0,
          waveDir: data.hourly.wave_direction?.[i] || 0,
          wavePeriod: data.hourly.wave_period?.[i] || 0,
          sst: data.hourly.sea_surface_temperature?.[i] ?? null,
        })) || null,
      }
      console.log(`  Marine ${island.toUpperCase()}: current ${(marine[island].current.speed * 3.6).toFixed(1)} km/h @${marine[island].current.dir}°, SST ${marine[island].sst?.toFixed(1) ?? '?'}°C, wave ${marine[island].wave_height?.toFixed(1) ?? '?'}m`)
    } else {
      // Fallback: hardcoded Caribbean current + neutral SST/wave
      marine[island] = { current: { speed: 0.14, dir: 270 }, sst: 27, wave_height: 0.8, hourly: null }
      console.log(`  Marine ${island.toUpperCase()}: fallback 0.5 km/h @270°, SST 27°C, wave 0.8m (API unavailable)`)
    }
  }
  return marine
}

/**
 * Compute physical Stokes drift from wave parameters.
 * V_stokes ≈ (2π² × H²) / (T × wavelength), approximated as (2π × H² × f) / tanh(kd)
 * Simplified for deep water: V_stokes ≈ (π × H² × 2π) / (T² × g) × T = 2π² × H² / (g × T²) * (2π/T)
 * In practice for surface drift: V_stokes ≈ (H² × 2π²) / (T × λ) ≈ (H²/T) × 0.5 for typical ocean waves.
 * Returns speed in m/s, direction = wave propagation direction (where waves push).
 */
function stokesDriftFromWaves(waveH, waveDir, wavePeriod) {
  if (!waveH || !wavePeriod || wavePeriod < 1) return null
  // Deep-water Stokes drift: V_s = (2π²/g) × (H²/T³) × wavelength/2π ≈ (π × H²) / (g × T²) × (2π/T)
  // Simplified empirical formula validated for Caribbean swell: V_s ≈ 0.016 × H² / T
  const speed = 0.016 * (waveH ** 2) / wavePeriod // m/s
  // Waves push in the direction they propagate (waveDir = FROM direction in Open-Meteo → add 180 for push direction)
  // Actually Open-Meteo wave_direction = direction waves come FROM, so drift direction = waveDir (same as wind convention)
  const dir = (waveDir + 180) % 360 // direction of push
  return { speed, dir }
}

/**
 * Compute drift predictions for a bank.
 * Model: wave Stokes drift + real ocean current (Open-Meteo Marine).
 * Fallback: wind-based Stokes (2.5%) + hardcoded current if Marine API unavailable.
 */
function computeBankDrift(centroid, hull, windSpeed, windDir, island, hourlyWind, marineData, beachPool = BEACHES) {
  const toRad = d => d * Math.PI / 180
  const marine = marineData?.[island]

  // 1. Ocean current (real from API, or fallback)
  let curSpeedMs, curDir
  if (marine?.current?.speed != null) {
    curSpeedMs = marine.current.speed // m/s
    curDir = marine.current.dir
    // South Martinique eddy override: if bank is in the eddy zone AND API shows generic westward,
    // apply correction (the API resolution may miss the small eddy)
    if (centroid[0] < 14.5 && centroid[1] > -61.2 && centroid[1] < -60.7 && curDir > 250 && curDir < 290) {
      curSpeedMs *= 0.6; curDir = 330 // reduce speed + point NNW
    }
  } else {
    curSpeedMs = 0.14 // 0.5 km/h
    curDir = 270
    if (centroid[0] < 14.5 && centroid[1] > -61.2 && centroid[1] < -60.7) {
      curSpeedMs = 0.08; curDir = 330
    }
  }
  const curSpeed = curSpeedMs * 3.6 // convert m/s → km/h for drift calc

  // 2. Surface drift: Stokes from waves (preferred) or wind-based estimate
  let driftSpeed, driftBearing
  const firstHour = marine?.hourly?.[0]
  const stokesWave = firstHour ? stokesDriftFromWaves(firstHour.waveH, firstHour.waveDir, firstHour.wavePeriod) : null
  if (stokesWave && stokesWave.speed > 0.001) {
    driftSpeed = stokesWave.speed * 3.6 // m/s → km/h
    driftBearing = stokesWave.dir
  } else {
    // Fallback: wind-based Stokes (2.5% of wind speed)
    driftBearing = (windDir + 180) % 360
    driftSpeed = windSpeed * 0.025
  }

  const curBearing = curDir

  // Vector sum (bearing → N/E components)
  const totalN = driftSpeed * Math.cos(toRad(driftBearing)) + curSpeed * Math.cos(toRad(curBearing))
  const totalE = driftSpeed * Math.sin(toRad(driftBearing)) + curSpeed * Math.sin(toRad(curBearing))
  const speed = Math.round(Math.sqrt(totalN ** 2 + totalE ** 2) * 10) / 10
  const bear = Math.round((Math.atan2(totalE, totalN) * 180 / Math.PI + 360) % 360)

  // Displacement per hour in degrees
  const dLatH = totalN / 111.0
  const dLngH = totalE / (111.0 * Math.cos(toRad(centroid[0])))

  // Coast capping: compute max hours before hitting nearest coast
  // Project drift vector onto direction-to-nearest-beach, cap at 85%
  const coastBeaches = beachPool.filter(b => b.island === island)
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
  // Horizon étendu 24h → 72h (action #2, 22/06) : le forecast de courant Open-Meteo Marine couvre
  // 3 jours → on advecte les bancs jusqu'à 72h pour une vraie fenêtre d'arrivée MULTI-JOURS
  // (« ce banc atteint Sainte-Anne dans ~3 j »), pas juste 24h. Confiance décroissante (le courant
  // à 48-72h est incertain ; au-delà du marine 3j on retombe sur le vent 7j). arrivalSignalFromBanks
  // utilise l'horizon par jour (J1→24h, J2→48h, J3→72h), avec fallback 24h → archives anciennes inchangées.
  const confByHorizon = { 6: 75, 12: 55, 24: 35, 48: 22, 72: 14 }
  for (const h of [6, 12, 24, 48, 72]) {
    // Use forecast marine data (current + waves) if available, else fall back to wind
    const forecastWind = avgWindForHours(hourlyWind, 0, h)
    let useDLatH = dLatH, useDLngH = dLngH
    // Try hourly marine data for this time window (average current + Stokes from waves)
    const marineSlice = marine?.hourly?.slice(0, h)
    if (marineSlice?.length > 0) {
      // Average marine current + wave Stokes over the forecast window
      let sumCurN = 0, sumCurE = 0, sumStkN = 0, sumStkE = 0, n = 0
      for (const mh of marineSlice) {
        const cSpd = (mh.curSpeed || 0) * 3.6 // m/s → km/h
        const cDir = mh.curDir || curDir
        sumCurN += cSpd * Math.cos(toRad(cDir)); sumCurE += cSpd * Math.sin(toRad(cDir))
        const stk = stokesDriftFromWaves(mh.waveH, mh.waveDir, mh.wavePeriod)
        if (stk) { const s = stk.speed * 3.6; sumStkN += s * Math.cos(toRad(stk.dir)); sumStkE += s * Math.sin(toRad(stk.dir)) }
        n++
      }
      if (n > 0) {
        const fTotalN = sumCurN / n + sumStkN / n
        const fTotalE = sumCurE / n + sumStkE / n
        useDLatH = fTotalN / 111.0
        useDLngH = fTotalE / (111.0 * Math.cos(toRad(centroid[0])))
      }
    } else if (forecastWind) {
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
// ── Masque eau/terre dérivé de la grille ERDDAP ─────────────────────
// L'AFAI n'existe que sur l'eau : les pixels TERRE sont null dans le composite
// 7D. Les cellules non-null forment donc un masque "eau" à la résolution de la
// grille — utilisé pour clipper les hulls de bancs qui débordaient sur les îles
// (inflation 1.2 + pont convexe autour des caps + dérive vers la côte).
function buildWaterMask(grids) {
  const masks = []
  for (const grid of grids || []) {
    if (!grid || !grid.points || !grid.latitudes || grid.latitudes.length < 2 || !grid.longitudes || grid.longitudes.length < 2) continue
    const lat0 = grid.latitudes[0]
    const dLat = grid.latitudes[1] - grid.latitudes[0]
    const lng0 = grid.longitudes[0]
    const dLng = grid.longitudes[1] - grid.longitudes[0]
    const cells = new Set()
    for (const p of grid.points) {
      if (p.AFAI == null) continue
      cells.add(`${Math.round((p.latitude - lat0) / dLat)}:${Math.round((p.longitude - lng0) / dLng)}`)
    }
    masks.push({
      lat0, dLat, lng0, dLng, cells,
      latMin: Math.min(grid.latitudes[0], grid.latitudes[grid.latitudes.length - 1]),
      latMax: Math.max(grid.latitudes[0], grid.latitudes[grid.latitudes.length - 1]),
      lngMin: Math.min(grid.longitudes[0], grid.longitudes[grid.longitudes.length - 1]),
      lngMax: Math.max(grid.longitudes[0], grid.longitudes[grid.longitudes.length - 1]),
    })
  }
  if (!masks.length) return null
  return (lat, lng) => {
    let covered = false
    for (const m of masks) {
      if (lat < m.latMin || lat > m.latMax || lng < m.lngMin || lng > m.lngMax) continue
      covered = true
      if (m.cells.has(`${Math.round((lat - m.lat0) / m.dLat)}:${Math.round((lng - m.lng0) / m.dLng)}`)) return true
    }
    // Hors de toute grille : indéterminé → on considère eau (ne pas clipper)
    return covered ? false : true
  }
}

// Ramène chaque sommet de hull tombé sur la terre vers refPoint (centroïde
// ACTUEL du banc, toujours en eau — barycentre de pixels AFAI) par pas de 25%,
// max 8 pas. Garde la forme côté large, colle la bordure à la côte.
function clipHullToWater(hull, refPoint, isWater) {
  if (!isWater || !Array.isArray(hull)) return hull
  return hull.map(([lat, lng]) => {
    if (isWater(lat, lng)) return [lat, lng]
    let cur = [lat, lng]
    for (let s = 0; s < 8; s++) {
      cur = [cur[0] + (refPoint[0] - cur[0]) * 0.25, cur[1] + (refPoint[1] - cur[1]) * 0.25]
      if (isWater(cur[0], cur[1])) break
    }
    return [Math.round(cur[0] * 1000) / 1000, Math.round(cur[1] * 1000) / 1000]
  })
}

// regionCtx (optionnel) = { id, beaches } pour les nouvelles régions :
// island/vent/plages menacées résolus par région au lieu du split lat MQ/GP.
// regionCtx absent → comportement MQ/GP historique strictement inchangé.
// grids (optionnel) = grilles ERDDAP complètes pour le masque eau/terre.
async function buildSargassumBanks(gridPoints, dir, wind, marineData, regionCtx = null, grids = null) {
  if (!gridPoints || gridPoints.length < 3) {
    console.log('  Skipping banks: not enough grid points')
    return
  }

  // 1. Cluster
  const clusters0 = dbscan(gridPoints, 0.06, 3)
  // Décompose les clusters géants (bbox > 0.6°) en blocs de 0.3° — un hull
  // convexe PAR BLOC. Sans ça, le hull d'un cluster qui s'étend de part et
  // d'autre d'une île PONTE par-dessus la terre même avec tous ses sommets en
  // eau (formes qui recouvraient la Martinique, hulls 1.5-2°). Mêmes points,
  // même masse totale : décomposition purement géométrique, la détection
  // (DBSCAN/seuils) ne change pas.
  const SPLIT_BBOX = 0.6, SPLIT_CELL = 0.3
  const clusters = []
  for (const cluster of clusters0) {
    const lats = cluster.map(p => p[0]), lngs = cluster.map(p => p[1])
    if (Math.max(...lats) - Math.min(...lats) <= SPLIT_BBOX && Math.max(...lngs) - Math.min(...lngs) <= SPLIT_BBOX) {
      clusters.push(cluster)
      continue
    }
    const cells = new Map()
    for (const p of cluster) {
      const k = `${Math.floor(p[0] / SPLIT_CELL)}:${Math.floor(p[1] / SPLIT_CELL)}`
      if (!cells.has(k)) cells.set(k, [])
      cells.get(k).push(p)
    }
    for (const grp of cells.values()) if (grp.length >= 3) clusters.push(grp)
  }
  if (clusters.length !== clusters0.length) console.log(`  Split géants: ${clusters0.length} clusters → ${clusters.length} (blocs ${SPLIT_CELL}°)`)
  console.log(`  DBSCAN: ${clusters.length} banks from ${gridPoints.length} points`)
  const isWater = buildWaterMask(grids)

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
    const island = regionCtx ? regionCtx.id : (centroid[0] >= 15.5 ? 'gp' : 'mq')

    // Hull — clippé au masque eau (l'inflation et le pont convexe pouvaient
    // recouvrir la côte, ex: ouest Martinique)
    let hull = convexHull(cluster)
    hull = inflateHull(hull, centroid, 1.2)
    hull = clipHullToWater(hull, centroid, isWater)

    // Drift (uses forecast wind when available)
    const w = wind[island] || { speed: 15, dir: 75 }
    const beachPool = regionCtx ? regionCtx.beaches : BEACHES
    const drift = computeBankDrift(centroid, hull, w.speed, w.dir, island, w.hourly || null, marineData, beachPool)
    // Les hulls projetés (6h/12h/24h) dérivent vers la côte : même clip,
    // référence = centroïde ACTUEL (eau sûre, même si la projection est beached)
    if (isWater && drift && drift.predictions) {
      for (const tk of Object.keys(drift.predictions)) {
        const pr = drift.predictions[tk]
        if (pr && Array.isArray(pr.hull)) pr.hull = clipHullToWater(pr.hull, centroid, isWater)
      }
    }

    // Threatened beaches at each time step
    const threatens = {}
    for (const timeKey of ['now', '6h', '12h', '24h']) {
      const c = timeKey === 'now' ? centroid : drift.predictions[timeKey].centroid
      const threatened = beachPool
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
  const banks2 = regionCtx ? significant.slice(0, 15) : [...mqBanks, ...gpBanks]
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

// ── Niveaux par plage (partage racine MQ/GP + regions) ────────────

/**
 * Calcule les niveaux AFAI pour une liste de plages (echantillonnage grille
 * 7D + correction 1D). gridOf/grid1DOf resolvent la grille par plage: la
 * racine MQ+GP a deux grilles (une par ile), une region n'en a qu'une.
 */
function computeBeachLevels(beaches, gridOf, grid1DOf, s2Layer) {
  const levels = []
  for (const beach of beaches) {
    const grid = gridOf(beach)
    const grid1D = grid1DOf(beach)
    const result = extractBeachAfai(beach, grid)
    // Apply 1D rapid-change correction (detects recent arrivals/clearances ~24h before 7D)
    const correction1D = compute1DCorrection(beach, grid, grid1D)
    // Correction near-shore Sentinel-2 (additive, flaggée SG_SENTINEL2, appliquée
    // sur l'AFAI satellite AVANT le 1D pour rester dans l'espace normalisé). No-op
    // si le flag est OFF ou si aucun passage S2 frais/couvrant n'existe pour la plage.
    const correctionS2 = computeSentinel2Correction(beach, s2Layer, result.afai)
    const afaiRaw = result.afai + correction1D + correctionS2
    const afai = Math.round(Math.max(0, Math.min(1, afaiRaw)) * 100) / 100
    const status = statusFromAfai(afai)
    levels.push({
      id: beach.id, afai, status,
      confidence: result.confidence + (correction1D !== 0 ? 5 : 0) + (correctionS2 !== 0 ? 5 : 0), // multi-source boost
      source: 'erddap-satellite',
      sourceDetail: result.method + (correction1D !== 0 ? '+1D' : '') + (correctionS2 !== 0 ? '+S2' : ''),
    })
    console.log(`  ${beach.id}: AFAI=${afai.toFixed(2)} (${status}) [${result.method}${correction1D ? ' 1D:' + (correction1D > 0 ? '+' : '') + correction1D.toFixed(2) : ''}${correctionS2 ? ' S2:' + (correctionS2 > 0 ? '+' : '') + correctionS2.toFixed(2) : ''}] conf=${result.confidence}%`)
  }
  return levels
}

// ── MULTI-REGIONS ──────────────────────────────────────────────────
// Sorties par region: <out>/api/copernicus/<id>/sargassum.json (meme structure
// que la racine) + history.json (etat memoire NAMESPACE par region).
// - MQ/GP: reutilisent grilles/vent/marine/bancs deja fetches par la racine
//   (zero requete en plus). La sortie RACINE reste le contrat consomme par les
//   fronts MQ/GP — inchangee.
// - Nouvelles regions: grille ERDDAP propre sur une bbox de donnees elargie
//   vers le large + vent/marine sur region.center. Pas de clustering bancs en
//   v1 (forecast = persistance + vent, sans signal d'arrivee).

/**
 * Bbox de DONNEES pour une region: bbox d'affichage (region.bbox =
 * [lngMin, latMin, lngMax, latMax]) elargie vers le large, calquee sur les
 * boites legacy MQ/GP (~0.8 deg lat, 0.7 deg ouest, 1.2 deg est — zone
 * d'approche atlantique des sargasses).
 */
function dataBboxFor(region) {
  const [lngMin, latMin, lngMax, latMax] = region.bbox
  const r = v => Math.round(v * 100) / 100
  return {
    latMin: r(latMin - 0.8),
    latMax: r(latMax + 0.8),
    lngMin: r(lngMin - 0.7),
    lngMax: r(lngMax + 1.2),
  }
}

/**
 * Plages d'une region pour le pipeline:
 * - mq/gp: beaches-list.json filtre par island (ids mq###/gp###)
 * - nouvelles regions: region.beaches inline du JSON regional (ids pc001, ...)
 * Les statuts inline des JSON regionaux sont des PLACEHOLDERS — seuls
 * id/lat/lng (+ coast/coastNormal si presents) alimentent le calcul AFAI.
 */
function beachesForRegion(region) {
  let raw = []
  if (region.id === 'mq' || region.id === 'gp') {
    const listPath = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json')
    try {
      raw = JSON.parse(fs.readFileSync(listPath, 'utf-8')).filter(b => b.island === region.id)
    } catch (e) {
      console.warn(`  [${region.id}] beaches-list.json illisible: ${e.message}`)
    }
  } else if (Array.isArray(region.beaches)) {
    raw = region.beaches
  }
  return raw
    .filter(b => b && b.id && typeof b.lat === 'number' && typeof b.lng === 'number')
    .map(b => ({
      id: b.id,
      lat: b.lat,
      lng: b.lng,
      island: region.id,
      coast: b.coast || 'atlantic',     // defaut: exposee (ne cache pas un risque)
      coastNormal: b.coastNormal || 90, // defaut: face a l'est (alizes)
    }))
}

/**
 * Pipeline complet pour UNE region → <out>/api/copernicus/<id>/sargassum.json.
 * Meme structure que la sortie racine: { source, updatedAt, erddapTimestamp,
 * dataAgeMinutes, pipelineVersion, levels[], weekly{}, weather{}, scores{} }.
 */
async function runRegionPipeline(region, shared) {
  const regionDir = path.join(OUT_PUBLIC, 'api', 'copernicus', region.id)
  const beaches = beachesForRegion(region)
  if (!beaches.length) {
    console.log(`  [${region.id}] aucune plage definie — skip`)
    return
  }
  fs.mkdirSync(regionDir, { recursive: true })

  // 1. Grille + meteo: mq/gp reutilisent les fetches racine, les autres fetchent
  let grid, grid1D, windForecast, marineData, banks
  if (region.id === 'mq' || region.id === 'gp') {
    grid = region.id === 'mq' ? shared.mqGrid : shared.gpGrid
    grid1D = region.id === 'mq' ? shared.mqGrid1D : shared.gpGrid1D
    windForecast = shared.windForecast
    marineData = shared.marineData
    // Bancs fraichement recalcules par la racine (signal d'arrivee du forecast)
    try {
      const banksData = JSON.parse(fs.readFileSync(path.join(OUT_PUBLIC, 'api', 'copernicus', 'sargassum-banks.json'), 'utf-8'))
      banks = Array.isArray(banksData.banks) ? banksData.banks : []
    } catch (_) { banks = [] }
  } else {
    const bbox = dataBboxFor(region)
    const center = { [region.id]: [region.center.lat, region.center.lng] }
    console.log(`  [${region.id}] grille ERDDAP: lat [${bbox.latMin}, ${bbox.latMax}], lng [${bbox.lngMin}, ${bbox.lngMax}]`)
    ;[grid, grid1D, windForecast, marineData] = await Promise.all([
      fetchErddapGrid(bbox),
      fetchErddapGrid1D(bbox).catch(() => null),
      fetchRegionalWind(center, region.timezone || 'America/Martinique'),
      fetchMarineData(center),
    ])
    // Bancs du run précédent (max ~3-6h) pour le signal d'arrivée du forecast —
    // même approche que la racine MQ/GP; recalculés en fin de pipeline région.
    try {
      const banksData = JSON.parse(fs.readFileSync(path.join(regionDir, 'sargassum-banks.json'), 'utf-8'))
      banks = Array.isArray(banksData.banks) ? banksData.banks : []
      if (banks.length) console.log(`  [${region.id}] ${banks.length} bancs du run précédent (signal d'arrivée)`)
    } catch (_) { banks = [] }
  }

  // 2. Niveaux AFAI par plage (meme echantillonnage grille que la racine)
  const levels = computeBeachLevels(beaches, () => grid, () => grid1D)
  const rawLevels = levels.map(l => ({ id: l.id, afai: l.afai, status: l.status }))

  // 3. Beach memory — etat namespace par region (<regionDir>/history.json).
  // La racine MQ/GP garde son history.json historique (retro-compat).
  applyBeachAccumulation(levels, regionDir)
  applyH2SIndex(levels, regionDir)

  // 4. Forecast 7j (community reports: ids racine MQ/GP seulement)
  let historyEntries = []
  try {
    historyEntries = JSON.parse(fs.readFileSync(path.join(regionDir, 'history.json'), 'utf-8')).history || []
  } catch (_) {}
  const communityReports = (region.id === 'mq' || region.id === 'gp') ? (shared.communityReports || {}) : {}
  const weekly = buildHonestForecast(levels, windForecast, historyEntries, beaches, banks, communityReports, marineData)

  // 5. Weather snapshot + Beach Score (per-beach weather si dispo — ids mq###/gp###)
  const w = windForecast?.[region.id] || {}
  const m = marineData?.[region.id] || {}
  const weather = {
    [region.id]: {
      wind_speed: w.speed ?? null,
      cloud_cover: w.cloud_cover ?? null,
      uv_index: w.uv_index ?? null,
      air_temperature: w.temperature ?? null,
      precipitation: w.precipitation ?? null,
      sst: m.sst ?? null,
      wave_height: m.wave_height ?? null,
    },
  }
  let wxBeaches = {}
  try {
    const wxPath = path.join(__dirname, '..', 'public', 'api', 'weather', 'beaches-weather.json')
    wxBeaches = JSON.parse(fs.readFileSync(wxPath, 'utf-8')).beaches || {}
  } catch (_) {}
  const scores = {}
  const isl = weather[region.id]
  for (const beach of beaches) {
    const level = levels.find(l => l.id === beach.id)
    if (!level) continue
    const bw = wxBeaches[beach.id] || null
    const snap = {
      afai: level.afai,
      wind_speed: bw?.windSpeed ?? isl.wind_speed,
      cloud_cover: isl.cloud_cover,
      uv_index: bw?.uvMax ?? isl.uv_index,
      sst: bw?.sst ?? isl.sst,
      wave_height: bw?.waveHeight ?? isl.wave_height,
      tide_ratio: null,
    }
    // Raisons dans la langue de la région (mq/gp = fr → inchangé byte-à-byte).
    // Régions US (Floride) : raisons en unités impériales (ft/mph/°F).
    const result = computeScore(snap, region.primaryLang || 'fr', region.countryCode === 'US')
    level.score = result.score
    level.label = result.label
    level.color = result.color
    level.reason = result.reason
    level.breakdown = result.breakdown
    scores[beach.id] = result
  }

  // 6. Payload — MEME structure que la racine
  const updatedAt = new Date().toISOString()
  const erddapTimestamp = grid?.erddapTimestamp || null
  const dataAgeMinutes = erddapTimestamp
    ? Math.round((Date.now() - new Date(erddapTimestamp).getTime()) / 60000)
    : null
  const stale = dataAgeMinutes != null && dataAgeMinutes > SAT_STALE_HOURS * 60
  if (stale) {
    console.warn(`  ⚠️  [${region.id}] STALE: composite satellite ${Math.round(dataAgeMinutes / 60)}h (> ${SAT_STALE_HOURS}h)`)
  }
  // Gating J+2→J+7 : le JSON public ne sert que J+0/J+1 ; la série complète part
  // dans _private/forecast-full.json (servi par forecast.php après auth).
  const { publicWeekly, privateForecasts, truncated } = gateWeekly(weekly)
  const payload = {
    source: grid ? 'erddap-live' : 'erddap-fallback',
    updatedAt,
    erddapTimestamp,
    dataAgeMinutes,
    stale,
    pipelineVersion: '3.1',
    levels,
    weekly: publicWeekly,
    weather,
    scores,
    seasonOutlook: seasonOutlookFor(region.id, updatedAt),
  }
  if (!grid) payload.fallbackReason = 'erddap-unreachable' // mode degrade documente
  fs.writeFileSync(path.join(regionDir, 'sargassum.json'), JSON.stringify(payload), 'utf-8')
  writePrivateGuarded(region.id, regionDir, privateForecasts, truncated, levels, updatedAt)

  // 7. History regional (valeurs satellite BRUTES, comme la racine)
  updateHistory(regionDir, rawLevels)

  // 8. Grille heatmap + bancs régionaux (couche carte) — nouvelles régions
  // uniquement (MQ/GP : fichiers racine historiques). Même downsample et même
  // floor que la racine. prepare-ftp copie ces fichiers à la racine du domaine.
  if (region.id !== 'mq' && region.id !== 'gp' && grid && grid.points) {
    const gridPoints = []
    for (const p of grid.points) {
      if (p.AFAI == null || p.AFAI <= 0) continue
      const latIdx = grid.latitudes.indexOf(p.latitude)
      const lngIdx = grid.longitudes.indexOf(p.longitude)
      if (latIdx % 2 !== 0 || lngIdx % 2 !== 0) continue
      const norm = normalizeAfai(p.AFAI)
      if (norm < 0.06) continue
      gridPoints.push([
        Math.round(p.latitude * 1000) / 1000,
        Math.round(p.longitude * 1000) / 1000,
        Math.round(norm * 100) / 100,
      ])
    }
    fs.writeFileSync(
      path.join(regionDir, 'sargassum-grid.json'),
      JSON.stringify({ updatedAt, count: gridPoints.length, points: gridPoints }),
      'utf-8'
    )
    console.log(`  [${region.id}] grid: ${gridPoints.length} points (AFAI > 0)`)
    await buildSargassumBanks(gridPoints, regionDir, windForecast, marineData, { id: region.id, beaches }, [grid])
  }

  const clean = levels.filter(l => l.status === 'clean').length
  const moderate = levels.filter(l => l.status === 'moderate').length
  const avoid = levels.filter(l => l.status === 'avoid').length
  console.log(`  [${region.id}] ${path.join(regionDir, 'sargassum.json')} | ${levels.length} plages | ${clean} clean / ${moderate} moderate / ${avoid} avoid | source: ${payload.source}`)
}

// ── MAIN ───────────────────────────────────────────────────────────

async function main() {
  console.log('=== fetch-sargassum-live.cjs ===')
  console.log(`Date: ${new Date().toISOString()}`)
  console.log('Source: NOAA ERDDAP (7-day AFAI composite)')
  console.log('')

  // 1. Fetch grids for both regions (7D primary + 1D bonus for rapid change detection)
  console.log('[1/3] Fetching ERDDAP grids...')
  let mqGrid = null
  let gpGrid = null
  let mqGrid1D = null
  let gpGrid1D = null

  // Fetch 7D (primary) and 1D (bonus) in parallel
  const fetchPromises = []
  fetchPromises.push(
    (async () => { console.log('  -- Martinique 7D --'); mqGrid = await fetchErddapGrid(REGIONS.mq) })().catch(e => console.warn(`  MQ 7D failed: ${e.message}`)),
    (async () => { console.log('  -- Guadeloupe 7D --'); gpGrid = await fetchErddapGrid(REGIONS.gp) })().catch(e => console.warn(`  GP 7D failed: ${e.message}`)),
    (async () => { mqGrid1D = await fetchErddapGrid1D(REGIONS.mq) })().catch(() => {}),
    (async () => { gpGrid1D = await fetchErddapGrid1D(REGIONS.gp) })().catch(() => {}),
  )
  await Promise.all(fetchPromises)
  if (mqGrid1D || gpGrid1D) console.log(`  1D grids: MQ=${mqGrid1D ? mqGrid1D.points.length + 'pts' : 'n/a'} GP=${gpGrid1D ? gpGrid1D.points.length + 'pts' : 'n/a'}`)

  const mqFetched = mqGrid && mqGrid.points !== undefined
  const gpFetched = gpGrid && gpGrid.points !== undefined
  // EXIT-1 PAR RÉGION (moat/honnêteté) : si la grille ERDDAP manque pour MQ **OU** GP,
  // on sort AVANT d'écrire la racine. Sans grille, extractBeachAfai renvoie 0.05 =
  // 'clean' (no-data masqué en VERT) → publier ça = fausse carte verte avec horodatage
  // FRAIS. En sortant, la dernière donnée RÉELLE reste en ligne (âge affiché, honnête)
  // et le prochain run (4×/j) re-tente. Avant : on ne sortait que si MQ ET GP
  // échouaient → un échec mono-région publiait une demi-carte verte fabriquée.
  // (Une grille présente avec AFAI tout-null = océan réellement propre = donnée VALIDE,
  // ce n'est pas ce cas-ci : ici la grille est absente/non récupérée.)
  if (!mqFetched || !gpFetched) {
    const failed = [!mqFetched && 'MQ', !gpFetched && 'GP'].filter(Boolean).join(' + ')
    console.error(`ERROR: grille ERDDAP manquante pour ${failed} — exit 1 pour ne PAS publier de fausse carte "propre" (no-data masqué en clean). La donnée réelle précédente reste en ligne ; prochain run re-tente.`)
    process.exit(1)
  }
  // If grids were fetched but all values are null → no sargassum detected = all clean (this is valid data!)
  console.log(`  MQ grid: ${mqGrid ? mqGrid.points.length + ' points' : 'failed'} | GP grid: ${gpGrid ? gpGrid.points.length + ' points' : 'failed'}`)

  // 2. Extract AFAI for each beach
  console.log('')
  console.log('[2/3] Extracting beach AFAI values...')
  // Sentinel-2 near-shore : chargé une fois (no-op si SG_SENTINEL2 non set).
  const s2Layer = loadSentinel2Layer(path.join(OUT_PUBLIC, 'api', 'copernicus'))
  const levels = computeBeachLevels(
    BEACHES,
    beach => (beach.island === 'mq' ? mqGrid : gpGrid),
    beach => (beach.island === 'mq' ? mqGrid1D : gpGrid1D),
    s2Layer,
  )

  // 2b. Apply beach memory (accumulation decay from recent history)
  // IMPORTANT: save raw satellite levels BEFORE accumulation for history tracking
  const rawLevels = levels.map(l => ({ id: l.id, afai: l.afai, status: l.status }))

  const dir = path.join(OUT_PUBLIC, 'api', 'copernicus')
  fs.mkdirSync(dir, { recursive: true })

  console.log('')
  console.log('[2b] Applying beach memory (accumulation decay)...')
  applyBeachAccumulation(levels, dir)
  applyH2SIndex(levels, dir)

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

  // Fetch wind + marine data (currents + waves) for drift model
  console.log('  Fetching 7-day wind forecast + marine data...')
  const [windForecast, marineData] = await Promise.all([
    fetchRegionalWind(),
    fetchMarineData(),
  ])

  // v3: Load previous run's banks for arrival signal (forecast needs them)
  // Banks are recomputed later in step [5]; previous run's data is max 3h old.
  let previousBanks = []
  try {
    const banksPath = path.join(dir, 'sargassum-banks.json')
    const banksData = JSON.parse(fs.readFileSync(banksPath, 'utf-8'))
    if (Array.isArray(banksData.banks)) previousBanks = banksData.banks
    console.log(`  Loaded ${previousBanks.length} banks from previous run for arrival signal`)
  } catch (_) {
    console.log(`  No previous banks file (first run or missing) — forecast without arrival signal`)
  }

  // v3: Fetch community reports (48h aggregated) for Day 0/1 bias
  let communityReports = {}
  try {
    const url = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=beach_reports'
    const reportsData = await safeFetch(url, 10000)
    if (reportsData?.reports && typeof reportsData.reports === 'object') {
      communityReports = reportsData.reports
      const reportedBeaches = Object.keys(communityReports).length
      console.log(`  Community reports: ${reportedBeaches} beaches with recent reports`)
    }
  } catch (_) {
    console.log(`  Community reports unavailable (Apps Script down) — forecast without community bias`)
  }

  const updatedAt = new Date().toISOString()
  const erddapTimestamp = (mqGrid?.erddapTimestamp || gpGrid?.erddapTimestamp) || null
  const dataAgeMinutes = erddapTimestamp
    ? Math.round((Date.now() - new Date(erddapTimestamp).getTime()) / 60000)
    : null

  const weekly = buildHonestForecast(levels, windForecast, historyEntries, BEACHES, previousBanks, communityReports, marineData)

  // ── Beach Score 0-100 (v1) — year-round multi-factor ──
  // Build per-island weather snapshot (SST + waves from marine, wind/cloud/UV from Open-Meteo forecast)
  const weather = {}
  for (const island of ['mq', 'gp']) {
    const w = windForecast?.[island] || {}
    const m = marineData?.[island] || {}
    weather[island] = {
      wind_speed: w.speed ?? null,          // km/h
      cloud_cover: w.cloud_cover ?? null,   // %
      uv_index: w.uv_index ?? null,
      air_temperature: w.temperature ?? null, // °C
      precipitation: w.precipitation ?? null,
      sst: m.sst ?? null,                   // °C sea surface
      wave_height: m.wave_height ?? null,   // m
    }
  }
  console.log('')
  console.log('[3b] Computing Beach Score 0-100 (year-round)...')
  // Load per-beach weather written by fetch-beach-weather.cjs earlier in the
  // workflow. We match by nearest lat/lng because the 20-beach legacy BEACHES
  // array uses slug IDs while beaches-list.json uses mq###/gp### IDs.
  let perBeachWx = {}
  try {
    const wxPath = path.join(__dirname, '..', 'public', 'api', 'weather', 'beaches-weather.json')
    const wx = JSON.parse(fs.readFileSync(wxPath, 'utf-8'))
    const listPath = path.join(__dirname, '..', 'public', 'data', 'beaches-list.json')
    const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'))
    for (const b of BEACHES) {
      const sameIsland = list.filter(x => x.island === b.island)
      let best = null, bestD = Infinity
      for (const x of sameIsland) {
        const d = haversineKm(b.lat, b.lng, x.lat, x.lng)
        if (d < bestD) { bestD = d; best = x }
      }
      if (best && wx.beaches?.[best.id]) perBeachWx[b.id] = wx.beaches[best.id]
    }
    console.log(`  Per-beach weather resolved for ${Object.keys(perBeachWx).length}/${BEACHES.length} legacy beaches`)
  } catch (e) {
    console.log(`  Per-beach weather unavailable (${e.message}) — falling back to island snapshot`)
  }
  const scores = {}
  for (const beach of BEACHES) {
    const level = levels.find(l => l.id === beach.id)
    if (!level) continue
    const bw = perBeachWx[beach.id]
    const isl = weather[beach.island] || {}
    const snap = {
      afai: level.afai,
      wind_speed: bw?.windSpeed ?? isl.wind_speed,
      cloud_cover: isl.cloud_cover, // Marine API doesn't ship cloud; keep island
      uv_index: bw?.uvMax ?? isl.uv_index,
      sst: bw?.sst ?? isl.sst,
      wave_height: bw?.waveHeight ?? isl.wave_height,
      tide_ratio: null, // v2 will plug real tide
    }
    const result = computeScore(snap)
    level.score = result.score
    level.label = result.label
    level.color = result.color
    level.reason = result.reason
    level.breakdown = result.breakdown
    scores[beach.id] = result
    console.log(`  ${beach.id}: ${result.score}/100 · ${result.label} — ${result.reason}`)
  }

  // Fraicheur reelle = age du composite satellite, PAS de updatedAt (=now a chaque run).
  const stale = dataAgeMinutes != null && dataAgeMinutes > SAT_STALE_HOURS * 60
  if (stale) {
    console.warn(`  ⚠️  STALE: composite satellite ${Math.round(dataAgeMinutes / 60)}h (> ${SAT_STALE_HOURS}h) — ERDDAP ne se rafraichit plus, donnees republiees telles quelles`)
  }
  // Gating J+2→J+7 : payload public = J+0/J+1 seulement ; full → _private. On gate
  // une COPIE (publicWeekly) — `weekly` reste FULL pour l'archive append-only ci-dessous.
  const { publicWeekly, privateForecasts, truncated } = gateWeekly(weekly)
  const payload = {
    source: 'erddap-live',
    updatedAt,
    erddapTimestamp,
    dataAgeMinutes,
    stale,        // true => le composite satellite depasse SAT_STALE_HOURS (freshness check fiable)
    pipelineVersion: '3.1', // +Beach Score
    levels,
    weekly: publicWeekly,
    weather,  // per-island snapshot so client can re-compute scores for interpolated beaches
    scores,   // convenience map: beachId → {score, label, reason, breakdown}
    seasonOutlook: seasonOutlookFor('mq', updatedAt), // racine = contrat MQ/GP (lesser-antilles)
  }

  const outPath = path.join(dir, 'sargassum.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  writePrivateGuarded('root', dir, privateForecasts, truncated, levels, updatedAt)
  console.log(`OK: ${outPath}`)
  console.log(`   source: erddap-live | updatedAt: ${updatedAt.slice(0, 19)} | sat: ${erddapTimestamp ? erddapTimestamp.slice(0, 19) : 'n/a'}${stale ? ' [STALE]' : ''}`)

  // ── ARCHIVE APPEND-ONLY STRICTE (PHASE 0, plan 90j) ──────────────────────────
  // L'archive des prévisions DATÉES vs réalisé est le SEUL actif data NON-COPIABLE :
  // un concurrent re-traite les archives Copernicus publiques, mais PAS notre
  // track-record horodaté. Elle NE DOIT JAMAIS rouler — tout .slice()/cap ici = un
  // jour d'actif perdu à jamais (c'était le bug : .slice(-30) jetait l'historique,
  // d'où "le moat a 0 jour de capital accumulé"). 1 snapshot/jour, le dernier run
  // du jour gagne, accumulation perpétuelle.
  const archivePath = path.join(dir, 'forecast-archive.json')
  const todayDate = updatedAt.slice(0, 10)
  let archive = { snapshots: [] }
  try { archive = JSON.parse(fs.readFileSync(archivePath, 'utf-8')) } catch {}
  const _priorCount = (archive.snapshots || []).length
  // Remplace le snapshot du jour s'il existe (dernier run gagne), GARDE tout le reste.
  archive.snapshots = (archive.snapshots || []).filter(s => s.date !== todayDate)
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
  archive.snapshots.sort((a, b) => a.date.localeCompare(b.date))
  // GARDE-FOU append-only : on n'écrit JAMAIS moins de jours qu'avant (anti-troncature
  // accidentelle). Le merge ne peut que conserver (ou +1 jour neuf), jamais réduire.
  if (archive.snapshots.length >= _priorCount) {
    fs.writeFileSync(archivePath, JSON.stringify(archive), 'utf-8')
    console.log(`Forecast archive (append-only): ${archive.snapshots.length} jours cumulés`)
  } else {
    console.warn(`⚠ Forecast archive: refus d'écrire ${archive.snapshots.length} < ${_priorCount} jours (garde append-only)`)
  }

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
  await buildSargassumBanks(gridPoints, dir, windForecast, marineData, null, [mqGrid, gpGrid])

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

  // 6. Multi-regions: sorties par region (<out>/api/copernicus/<id>/sargassum.json)
  console.log('')
  console.log('[6/6] Pipelines par region (regions/*.json)...')
  const shared = { mqGrid, gpGrid, mqGrid1D, gpGrid1D, windForecast, marineData, communityReports }
  // getAllRegions() dans un try : un regions/*.json malforme ne doit pas faire
  // exit(1) apres l'ecriture des fichiers racine (le workflow declencherait le
  // scraper fallback et ecraserait la racine avec des donnees degradees).
  let _regions = []
  try { _regions = getAllRegions() } catch (err) {
    console.warn(`  regions/ illisible — sorties regionales sautees (racine deja ecrite): ${err.message}`)
  }
  for (const region of _regions) {
    try {
      await runRegionPipeline(region, shared)
    } catch (err) {
      // Une region en echec ne bloque ni la racine ni les autres regions
      console.warn(`  [${region.id}] pipeline regional en echec (non bloquant): ${err.message}`)
    }
  }
  console.log('Done.')
}

main().catch(err => {
  console.error('FATAL:', err.message || err)
  process.exit(1)
})

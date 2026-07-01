/**
 * fetch-sentinel2.cjs — SIGNAL CORRECTIF near-shore (PROTOTYPE, additif)
 *
 * Pourquoi : notre verdict repose sur le composite ERDDAP AFAI ~4 km (bon offshore,
 * grossier au ras de la côte). Sentinel-2 L2A (10-20 m, révisite ~5 j) donne une
 * lecture FINE de la zone d'échouage — exactement le trou confirmé face au moat
 * "verdict PAR PLAGE". Ce script ne REMPLACE jamais l'AFAI : il produit un signal
 * near-shore que le pipeline principal applique en CORRECTION additive cappée,
 * derrière le flag SG_SENTINEL2 (défaut OFF), au même titre que la correction 1D.
 *
 * Source : Copernicus Data Space Ecosystem (CDSE) — Sentinel Hub Statistical API.
 *   - Indice = FAI (Floating Algae Index) sur B04(665nm)/B08(842nm)/B11(1610nm).
 *   - Masque nuages/ombres/cirrus via la bande SCL (Scene Classification).
 *   - Sortie = moyenne FAI sur pixels EAU valides + fraction de couverture.
 *
 * ⚠️ HONNÊTETÉ / MOAT :
 *   - Les seuils FAI→afaiLike ci-dessous sont PROVISOIRES (calibration à faire vs
 *     /fiabilite/ backtest). Tant que non calibrés, le flag SG_SENTINEL2 reste OFF
 *     et ce signal NE touche PAS le verdict publié. Zéro fabrication.
 *   - Sans credentials CDSE, le script DÉGRADE proprement en no-op (écrit un layer
 *     vide valide, exit 0). Il ne bloque JAMAIS le pipeline.
 *
 * Auth (2 chemins, non lisibles en local — provisionnés en GH Actions) :
 *   1. OAuth client-credentials : SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET.
 *   2. Password grant CDSE      : CDSE_USERNAME / CDSE_PASSWORD (repli si le compte
 *      Copernicus est unifié avec COPERNICUS_USERNAME/PASSWORD).
 *
 * Sortie : public/api/copernicus/sentinel2-nearshore.json (INPUT interne du pipeline,
 *   PAS consommé par le front, PAS déployé en FTP → blast-radius minimal).
 *
 * Usage :
 *   node scripts/fetch-sentinel2.cjs           # run réel (no-op si pas de creds)
 *   node scripts/fetch-sentinel2.cjs --dry      # ne fait aucun appel réseau
 */
const fs = require('fs')
const path = require('path')

const DRY = process.argv.includes('--dry')

// Endpoints CDSE (publics, documentés).
const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
const STATS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/statistics'

const HTTP_TIMEOUT_MS = 20000 // Sentinel-2 = bonus ; on ne bloque pas le pipeline dessus.
const LOOKBACK_DAYS = 12      // fenêtre pour attraper un passage sans nuage (révisite ~5 j)
const BBOX_HALF_DEG = 0.02    // ~2,2 km de demi-côté autour de la plage (zone near-shore)
const RES_DEG = 0.00012       // ~13 m/pixel (proche natif 10 m S2)
const MIN_COVERAGE = 0.10     // sous 10% de pixels valides = trop nuageux, on ignore

// Plages cibles du PROTOTYPE : sous-ensemble MQ sud/est à fort signal (les plus
// consultées + où l'échouage est franc). coastNormal = direction (deg depuis N) vers
// laquelle la côte fait face = direction du LARGE. On décale la boîte d'échantillonnage
// de SEAWARD_OFFSET_KM dans cette direction pour couvrir l'EAU near-shore (zone
// d'échouage) au lieu de centrer sur le rivage (qui met moitié de terre dans la boîte).
const TARGET_BEACHES = [
  { id: 'les-salines', lat: 14.3959, lng: -60.8690, coastNormal: 180 },
  { id: 'sainte-anne', lat: 14.4305, lng: -60.8850, coastNormal: 170 },
  { id: 'pt-marin',    lat: 14.4511, lng: -60.8836, coastNormal: 160 },
  { id: 'diamant',     lat: 14.4758, lng: -61.0314, coastNormal: 210 },
  { id: 'tartane',     lat: 14.7507, lng: -60.9257, coastNormal: 80 },
]
const SEAWARD_OFFSET_KM = 1.5 // décalage du centre de la boîte vers le large

// ── FAI → afaiLike (0-1), MÊME échelle normalisée que normalizeAfai() côté ERDDAP ──
// FAI (réflectances) sur l'eau : ~0 = eau claire, >0 = végétation flottante ; les
// nappes de sargasses denses montent typiquement à 0.01-0.05. SEUILS PROVISOIRES,
// calqués sur les bornes AFAI (0.15 clean/moderate, 0.40 moderate/avoid) pour rester
// cohérent avec statusFromAfai(). À CALIBRER vs vérité terrain avant d'activer le flag.
function faiToAfaiLike(fai) {
  if (fai == null || Number.isNaN(fai)) return null
  if (fai <= 0.0) return 0.05      // eau claire (baseline, aligné NO_DATA_AFAI)
  if (fai <= 0.005) return 0.15    // trace / limite propre-modéré
  if (fai <= 0.015) return 0.40    // modéré / limite à-éviter
  if (fai <= 0.030) return 0.65
  return Math.min(1, 0.65 + (fai - 0.030) * 10) // nappes denses
}

// Evalscript Sentinel Hub : sort FAI (1 bande float) + dataMask (EAU uniquement).
// CORRECTION MASQUAGE : on ne garde QUE les pixels EAU (SCL == 6). Auparavant on
// gardait aussi végétation(4)/sol(5) → la boîte, centrée sur le rivage, comptait la
// verdure du littoral comme une "nappe d'algues" (5 plages sorties maxées le 26/06,
// contredit par ERDDAP). Les sargasses flottantes se détectent comme une ANOMALIE
// FAI positive AU-DESSUS de l'eau : water-only supprime le biais terre. Trade-off
// honnête : une nappe très dense classée par SCL en végétation(4) peut être manquée
// (biais conservateur = sous-alerte, préférable à une fausse alerte depuis la terre).
const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "fai", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  // FAI = NIR - [RED + (SWIR - RED) * (842-665)/(1610-665)]
  var k = (842.0 - 665.0) / (1610.0 - 665.0); // 0.1873
  var baseline = s.B04 + (s.B11 - s.B04) * k;
  var fai = s.B08 - baseline;
  // EAU uniquement (SCL 6). Exclut terre/végétation/sol/nuages/ombres/cirrus/nodata.
  var valid = (s.dataMask == 1 && s.SCL == 6) ? 1 : 0;
  return { fai: [fai], dataMask: [valid] };
}`

async function safeFetch(url, opts, timeoutMs) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(t)
    return res
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// Récupère un access-token CDSE. Essaie client-credentials puis password grant.
// Retourne null (sans throw) si aucun credential exploitable → no-op propre.
async function getCdseToken() {
  const cid = process.env.SENTINEL_HUB_CLIENT_ID
  const csecret = process.env.SENTINEL_HUB_CLIENT_SECRET
  const user = process.env.CDSE_USERNAME || process.env.COPERNICUS_USERNAME
  const pass = process.env.CDSE_PASSWORD || process.env.COPERNICUS_PASSWORD

  const attempts = []
  if (cid && csecret) {
    attempts.push({ grant_type: 'client_credentials', client_id: cid, client_secret: csecret })
  }
  if (user && pass) {
    attempts.push({ grant_type: 'password', client_id: 'cdse-public', username: user, password: pass })
  }
  if (!attempts.length) {
    console.log('Sentinel-2: aucun credential CDSE (SENTINEL_HUB_CLIENT_ID/SECRET ou CDSE_USERNAME/PASSWORD) → no-op.')
    return null
  }

  for (const body of attempts) {
    try {
      const res = await safeFetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
      }, HTTP_TIMEOUT_MS)
      if (res.ok) {
        const j = await res.json().catch(() => null)
        if (j && j.access_token) {
          console.log(`Sentinel-2: token CDSE obtenu (${body.grant_type}).`)
          return j.access_token
        }
      } else {
        const txt = await res.text().catch(() => '')
        console.warn(`Sentinel-2: token ${body.grant_type} → HTTP ${res.status} ${txt.slice(0, 120)}`)
      }
    } catch (e) {
      console.warn(`Sentinel-2: token ${body.grant_type} erreur: ${e.message || e}`)
    }
  }
  return null
}

// Interroge la Statistical API pour une plage → { fai, coverage, obsDate, nPixels } | null.
async function fetchBeachStats(token, beach) {
  const from = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10)
  const to = new Date().toISOString().slice(0, 10)
  // Centre décalé vers le large le long de coastNormal (direction face-à-la-mer) pour
  // maximiser les pixels EAU dans la boîte au lieu de la centrer sur le rivage.
  const cn = ((beach.coastNormal ?? 90) * Math.PI) / 180
  const dLat = (SEAWARD_OFFSET_KM * Math.cos(cn)) / 111
  const dLng = (SEAWARD_OFFSET_KM * Math.sin(cn)) / (111 * Math.cos((beach.lat * Math.PI) / 180))
  const cLat = beach.lat + dLat
  const cLng = beach.lng + dLng
  const bbox = [
    cLng - BBOX_HALF_DEG, cLat - BBOX_HALF_DEG,
    cLng + BBOX_HALF_DEG, cLat + BBOX_HALF_DEG,
  ]
  const payload = {
    input: {
      bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' } },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { mosaickingOrder: 'leastCC' } }],
    },
    aggregation: {
      timeRange: { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` },
      aggregationInterval: { of: 'P1D' },
      resx: RES_DEG,
      resy: RES_DEG,
      evalscript: EVALSCRIPT,
    },
    calculations: { fai: { statistics: { default: {} } } },
  }
  try {
    const res = await safeFetch(STATS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }, HTTP_TIMEOUT_MS)
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.warn(`  ${beach.id}: stats HTTP ${res.status} ${txt.slice(0, 120)}`)
      return null
    }
    const j = await res.json().catch(() => null)
    if (!j || !Array.isArray(j.data)) return null
    // Parcourt les intervalles ; garde le plus RÉCENT avec assez de pixels valides.
    let best = null
    for (const interval of j.data) {
      const stats = interval?.outputs?.fai?.bands?.B0?.stats
      if (!stats || !stats.sampleCount) continue
      const valid = stats.sampleCount - (stats.noDataCount || 0)
      const coverage = stats.sampleCount ? valid / stats.sampleCount : 0
      if (valid <= 0 || coverage < MIN_COVERAGE) continue
      const obsDate = interval.interval?.from?.slice(0, 10) || null
      if (!best || (obsDate && obsDate > best.obsDate)) {
        best = { fai: stats.mean, coverage: Math.round(coverage * 100) / 100, obsDate, nPixels: valid }
      }
    }
    return best
  } catch (e) {
    console.warn(`  ${beach.id}: stats erreur: ${e.message || e}`)
    return null
  }
}

function writeLayer(outDir, beaches, note) {
  fs.mkdirSync(outDir, { recursive: true })
  const payload = {
    source: 'sentinel2-cdse',
    provisional: true, // seuils FAI→afaiLike non calibrés ; flag pipeline OFF par défaut
    updatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    note: note || null,
    beaches, // { id: { fai, afaiLike, coverage, obsDate, ageDays, nPixels } }
  }
  const outPath = path.join(outDir, 'sentinel2-nearshore.json')
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8')
  console.log('OK:', outPath, '|', Object.keys(beaches).length, 'plage(s) avec signal')
  return outPath
}

async function main() {
  const outDir = process.env.SARG_OUT_DIR
    ? path.join(path.resolve(process.env.SARG_OUT_DIR), 'api', 'copernicus')
    : path.join(__dirname, '..', 'public', 'api', 'copernicus')

  if (DRY) {
    console.log('Sentinel-2: --dry → aucun appel réseau, écriture layer vide.')
    writeLayer(outDir, {}, 'dry-run')
    return
  }

  const token = await getCdseToken()
  if (!token) {
    // Pas de creds/token → no-op HONNÊTE : layer vide valide, exit 0, pipeline intact.
    writeLayer(outDir, {}, 'no-credentials')
    return
  }

  const beaches = {}
  const today = Date.now()
  for (const b of TARGET_BEACHES) {
    const s = await fetchBeachStats(token, b)
    if (!s) continue
    const afaiLike = faiToAfaiLike(s.fai)
    const ageDays = s.obsDate
      ? Math.round((today - new Date(s.obsDate + 'T12:00:00Z').getTime()) / 86400000)
      : null
    beaches[b.id] = {
      fai: Math.round(s.fai * 1e5) / 1e5,
      afaiLike,
      coverage: s.coverage,
      obsDate: s.obsDate,
      ageDays,
      nPixels: s.nPixels,
    }
    console.log(`  ${b.id}: FAI=${beaches[b.id].fai} → afaiLike=${afaiLike} cov=${s.coverage} obs=${s.obsDate} (${ageDays}j) n=${s.nPixels}`)
  }
  writeLayer(outDir, beaches, Object.keys(beaches).length ? null : 'no-valid-passes')
}

main().catch(err => {
  // Non-bloquant par contrat : on log et on sort 0 pour ne JAMAIS casser le pipeline.
  console.error('Sentinel-2 (non-bloquant):', err.message || err)
  try {
    const outDir = process.env.SARG_OUT_DIR
      ? path.join(path.resolve(process.env.SARG_OUT_DIR), 'api', 'copernicus')
      : path.join(__dirname, '..', 'public', 'api', 'copernicus')
    writeLayer(outDir, {}, 'error: ' + (err.message || String(err)))
  } catch (_) {}
  process.exit(0)
})

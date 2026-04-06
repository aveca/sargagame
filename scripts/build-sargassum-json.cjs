/**
 * Génère public/api/copernicus/sargassum.json pour déploiement FTP statique
 * (même structure que l'API /api/copernicus/sargassum)
 *
 * Pipeline v2.0: uses lib/forecast.cjs (honest model) + lib/confidence.cjs
 */
const fs = require('fs')
const path = require('path')
const { referenceConfidence } = require('./lib/confidence.cjs')
const { buildHonestForecast, statusFromAfai } = require('./lib/forecast.cjs')

const SARGASSUM_REF = [
  { id: "grande-anse",     afai: 0.11, status: "clean" }, { id: "anse-mitan",      afai: 0.17, status: "clean" },
  { id: "anse-noire",      afai: 0.08, status: "clean" }, { id: "tartane",         afai: 0.19, status: "clean" },
  { id: "anse-madame",     afai: 0.14, status: "clean" }, { id: "diamant",         afai: 0.42, status: "avoid" },
  { id: "pt-marin",        afai: 0.47, status: "avoid" }, { id: "sainte-anne",  afai: 0.78, status: "avoid" },
  { id: "les-salines",     afai: 0.82, status: "avoid" }, { id: "vauclin",         afai: 0.71, status: "avoid" },
  { id: "gp-grande-anse",  afai: 0.15, status: "clean" }, { id: "gp-malendure",    afai: 0.12, status: "clean" },
  { id: "gp-sainte-anne",  afai: 0.22, status: "moderate" }, { id: "gp-pt-chateaux",  afai: 0.38, status: "moderate" },
  { id: "gp-gosier",       afai: 0.18, status: "clean" }, { id: "gp-caravelle",    afai: 0.14, status: "clean" },
  { id: "gp-bas-du-fort",  afai: 0.35, status: "moderate" }, { id: "gp-deshaies",   afai: 0.11, status: "clean" },
  { id: "gp-moule",        afai: 0.44, status: "avoid" }, { id: "gp-vieux-fort", afai: 0.72, status: "avoid" },
]

const dir = path.join(__dirname, '..', 'public', 'api', 'copernicus')
fs.mkdirSync(dir, { recursive: true })
const outPath = path.join(dir, 'sargassum.json')

// Don't overwrite if sargassum.json already has live ERDDAP data
let existing = null
try {
  existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'))
} catch (_) {}

if (existing && existing.source === 'erddap-live') {
  console.log('OK: public/api/copernicus/sargassum.json (kept erddap-live data, not overwriting)')
} else {
  const refConf = referenceConfidence()
  const levels = SARGASSUM_REF.map(l => ({
    ...l,
    confidence: refConf,
    source: 'reference-fallback',
    sourceDetail: 'hardcoded-reference',
  }))

  // Load history if available
  let historyEntries = []
  try {
    const histPath = path.join(dir, 'history.json')
    const raw = JSON.parse(fs.readFileSync(histPath, 'utf-8'))
    historyEntries = raw.history || []
  } catch (_) {}

  const weekly = buildHonestForecast(levels, null, historyEntries, null)
  const payload = {
    source: 'reference',
    updatedAt: new Date().toISOString(),
    erddapTimestamp: null,
    dataAgeMinutes: null,
    pipelineVersion: '2.0',
    levels,
    weekly,
  }
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log('OK: public/api/copernicus/sargassum.json (reference fallback, pipeline v2.0)')
}

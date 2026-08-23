/**
 * Scraping Copernicus Marine de la journée :
 * - Appel API subset (Antilles, 7 derniers jours) avec copernicustxt.txt
 * - Met à jour public/api/copernicus/sargassum.json (niveaux plages + tendances 7j)
 * À lancer avant "vite build" pour déploiement FTP avec données du jour.
 *
 * Pipeline v2.0: uses lib/forecast.cjs (honest model) + lib/confidence.cjs
 */
const fs = require('fs')
const path = require('path')
const { referenceConfidence } = require('./lib/confidence.cjs')
const { buildHonestForecast, statusFromAfai } = require('./lib/forecast.cjs')

const BEACH_NAMES = {
  'grande-anse': 'Grande Anse d\'Arlet',
  'anse-mitan': 'Anse Mitan',
  'anse-noire': 'Anse Noire',
  'tartane': 'Tartane',
  'anse-madame': 'Anse Madame',
  'diamant': 'Le Diamant',
  'pt-marin': 'Pointe du Marin',
  'sainte-anne': 'Sainte-Anne (MQ)',
  'les-salines': 'Les Salines',
  'vauclin': 'Le Vauclin',
  'gp-grande-anse': 'Grande Anse (GP)',
  'gp-malendure': 'Malendure',
  'gp-sainte-anne': 'Sainte-Anne (GP)',
  'gp-pt-chateaux': 'Pointe des Châteaux',
  'gp-gosier': 'Le Gosier',
  'gp-caravelle': 'La Caravelle (GP)',
  'gp-bas-du-fort': 'Bas du Fort',
  'gp-deshaies': 'Deshaies',
  'gp-moule': 'Le Moule',
  'gp-vieux-fort': 'Vieux-Fort',
}

const SARGASSUM_REF = [
  { id: "grande-anse",     afai: 0.11, status: "clean" }, { id: "anse-mitan",      afai: 0.17, status: "moderate" },
  { id: "anse-noire",      afai: 0.08, status: "clean" }, { id: "tartane",         afai: 0.19, status: "moderate" },
  { id: "anse-madame",     afai: 0.14, status: "clean" }, { id: "diamant",         afai: 0.42, status: "avoid" },
  { id: "pt-marin",        afai: 0.47, status: "avoid" }, { id: "sainte-anne",  afai: 0.78, status: "avoid" },
  { id: "les-salines",     afai: 0.82, status: "avoid" }, { id: "vauclin",         afai: 0.71, status: "avoid" },
  { id: "gp-grande-anse",  afai: 0.15, status: "moderate" }, { id: "gp-malendure",    afai: 0.12, status: "clean" },
  { id: "gp-sainte-anne",  afai: 0.22, status: "moderate" }, { id: "gp-pt-chateaux",  afai: 0.38, status: "moderate" },
  { id: "gp-gosier",       afai: 0.18, status: "moderate" }, { id: "gp-caravelle",    afai: 0.14, status: "clean" },
  { id: "gp-bas-du-fort",  afai: 0.35, status: "moderate" }, { id: "gp-deshaies",   afai: 0.11, status: "clean" },
  { id: "gp-moule",        afai: 0.44, status: "avoid" }, { id: "gp-vieux-fort", afai: 0.72, status: "avoid" },
]

function getCopernicusCreds() {
  try {
    const p = path.resolve(__dirname, '..', 'copernicustxt.txt')
    const raw = fs.readFileSync(p, 'utf-8').trim()
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length >= 2) return { username: lines[0], password: lines[1] }
  } catch (_) {}
  return null
}

async function fetchCopernicusSubset(username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  const params = new URLSearchParams({
    dataset_id: 'MULTIOBS_GLO_BGC_SURFACE_NRT_015_016',
    minimum_longitude: '-62',
    maximum_longitude: '-60',
    minimum_latitude: '14',
    maximum_latitude: '17',
    start_datetime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end_datetime: new Date().toISOString().slice(0, 10),
  })
  const url = `https://www.app.marine.copernicus.eu/api/subset?${params}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  try {
    console.log('URL:', url)
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    console.log('HTTP status:', res.status, res.statusText)
    const contentType = res.headers.get('content-type') || ''
    if (res.ok) {
      if (contentType.includes('json')) {
        const data = await res.json().catch(() => null)
        if (data && Array.isArray(data.levels)) return { source: 'copernicus', levels: data.levels }
        if (data && (data.destination_url || data.output_url)) {
          console.log('API OK (destination_url reçue), pas de niveaux détaillés')
          return { source: 'copernicus', levels: null }
        }
        console.log('Réponse JSON inattendue:', JSON.stringify(data).slice(0, 200))
      } else {
        console.log('Réponse non-JSON (content-type:', contentType, ') — connexion API validée')
        return { source: 'copernicus', levels: null }
      }
    } else {
      const body = await res.text().catch(() => '')
      console.warn('HTTP erreur:', res.status, body.slice(0, 300))
    }
  } catch (e) {
    clearTimeout(timeout)
    console.warn('Copernicus API:', e.message || e)
  }
  return { source: 'reference', levels: null }
}

function getBeachUrl(beachId) {
  if (beachId.startsWith('gp-')) return 'https://sargasses-guadeloupe.com'
  return 'https://sargasses-martinique.com'
}

function buildNotificationMessage(change) {
  const name = BEACH_NAMES[change.beach] || change.beach
  if (change.to === 'clean') return `🟢 ${name} est maintenant propre !`
  if (change.to === 'avoid') return `🔴 Alerte sargasses : ${name} est à éviter aujourd'hui`
  if (change.to === 'moderate') return `🟡 ${name} : présence modérée de sargasses`
  return null
}

// OneSignal App IDs et clés séparés MQ / GP
const ONESIGNAL_APPS = {
  MQ: {
    appId: 'd628363e-efc7-4d27-8d1b-fa25fe3bacc9',
    envKey: 'ONESIGNAL_API_KEY_MQ',
  },
  GP: {
    appId: 'f9adee80-8909-48d3-8517-95f9f311d164',
    envKey: 'ONESIGNAL_API_KEY_GP',
  },
}

function getIsland(beachId) {
  return beachId.startsWith('gp-') ? 'GP' : 'MQ'
}

async function sendOneSignalNotification(change) {
  const island = getIsland(change.beach)
  const config = ONESIGNAL_APPS[island]
  const apiKey = process.env[config.envKey]
  if (!apiKey) {
    console.log(`OneSignal [${change.beach}]: pas de clé ${config.envKey}, notification ignorée`)
    return
  }
  const message = buildNotificationMessage(change)
  if (!message) return
  const url = getBeachUrl(change.beach)
  const body = {
    app_id: config.appId,
    included_segments: ['All'],
    contents: { en: message, fr: message },
    url,
  }
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    console.log(`OneSignal [${island}/${change.beach}]:`, res.status, data.id || JSON.stringify(data).slice(0, 120))
  } catch (e) {
    console.warn(`OneSignal [${island}/${change.beach}] erreur:`, e.message || e)
  }
}

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

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  historyData.history = historyData.history.filter(h => h.date >= cutoffStr)
  historyData.changes = historyData.changes.filter(c => c.date >= cutoffStr)

  fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf-8')
  console.log('History:', historyPath, '|', historyData.history.length, 'jours |', newChanges.length, 'changement(s) détecté(s)')

  return { newChanges, historyEntries: historyData.history }
}

async function main() {
  const creds = getCopernicusCreds()
  let source = 'reference'
  const refConf = referenceConfidence()
  let levels = SARGASSUM_REF.map(l => ({
    ...l,
    confidence: refConf,
    source: 'reference-fallback',
    sourceDetail: 'hardcoded-reference',
  }))

  if (creds) {
    console.log('Appel API Copernicus Marine (subset Antilles, 7 derniers jours)...')
    const result = await fetchCopernicusSubset(creds.username, creds.password)
    source = result.source
    if (result.levels && result.levels.length) {
      levels = result.levels.map(l => ({
        id: l.id,
        afai: Number(l.afai) || 0,
        status: l.status || statusFromAfai(Number(l.afai) || 0),
        confidence: 60, // Copernicus direct = moderate confidence
        source: 'copernicus',
        sourceDetail: 'api-subset',
      }))
      console.log('Données Copernicus reçues:', levels.length, 'plages')
    } else if (source === 'copernicus') {
      console.log('API OK, pas de niveaux détaillés → utilisation des données de référence avec source=copernicus')
    }
  } else {
    console.warn('Fichier copernicustxt.txt absent ou invalide → données de référence uniquement.')
  }

  const dir = path.join(__dirname, '..', 'public', 'api', 'copernicus')
  fs.mkdirSync(dir, { recursive: true })

  // Load history for satellite trend
  const { newChanges, historyEntries } = updateHistory(dir, levels)

  const updatedAt = new Date().toISOString()
  // No wind forecast available in fallback mode — satellite-only forecasts
  const weekly = buildHonestForecast(levels, null, historyEntries, null)
  const payload = {
    source,
    updatedAt,
    erddapTimestamp: null,
    dataAgeMinutes: null,
    pipelineVersion: '2.0',
    levels,
    weekly,
  }

  const outPath = path.join(dir, 'sargassum.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log('OK:', outPath)
  console.log('   source:', source, '| updatedAt:', updatedAt.slice(0, 19))

  // Notifications
  for (const change of newChanges) {
    // Only notify if confidence > 50 (don't push uncertain alerts)
    const level = levels.find(l => l.id === change.beach)
    if (level && level.confidence >= 50) {
      await sendOneSignalNotification(change)
    } else {
      console.log(`  Skipping notification for ${change.beach}: confidence ${level?.confidence || 0}% too low`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

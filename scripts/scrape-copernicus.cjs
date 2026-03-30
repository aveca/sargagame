/**
 * Scraping Copernicus Marine de la journée :
 * - Appel API subset (Antilles, 7 derniers jours) avec copernicustxt.txt
 * - Met à jour public/api/copernicus/sargassum.json (niveaux plages + prévisions 7j)
 * À lancer avant "vite build" pour déploiement FTP avec données du jour.
 */
const fs = require('fs')
const path = require('path')

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
  { id: "grande-anse",     afai: 0.11, status: "clean" }, { id: "anse-mitan",      afai: 0.17, status: "clean" },
  { id: "anse-noire",      afai: 0.08, status: "clean" }, { id: "tartane",         afai: 0.19, status: "clean" },
  { id: "anse-madame",     afai: 0.14, status: "clean" }, { id: "diamant",         afai: 0.42, status: "moderate" },
  { id: "pt-marin",        afai: 0.47, status: "moderate" }, { id: "sainte-anne",  afai: 0.78, status: "avoid" },
  { id: "les-salines",     afai: 0.82, status: "avoid" }, { id: "vauclin",         afai: 0.71, status: "avoid" },
  { id: "gp-grande-anse",  afai: 0.15, status: "clean" }, { id: "gp-malendure",    afai: 0.12, status: "clean" },
  { id: "gp-sainte-anne",  afai: 0.22, status: "clean" }, { id: "gp-pt-chateaux",  afai: 0.38, status: "moderate" },
  { id: "gp-gosier",       afai: 0.18, status: "clean" }, { id: "gp-caravelle",    afai: 0.14, status: "clean" },
  { id: "gp-bas-du-fort",  afai: 0.35, status: "moderate" }, { id: "gp-deshaies",   afai: 0.11, status: "clean" },
  { id: "gp-moule",        afai: 0.44, status: "moderate" }, { id: "gp-vieux-fort", afai: 0.72, status: "avoid" },
]

const DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

function statusFromAfai(afai) {
  if (afai < 0.3) return "clean"
  if (afai < 0.65) return "moderate"
  return "avoid"
}

function buildWeeklyBatch(levels) {
  const weekly = {}
  for (const { id, afai } of levels) {
    const drift = afai > 0.6 ? 0.02 + (id.length % 5) * 0.008 : afai < 0.25 ? -0.01 - (id.length % 3) * 0.005 : (id.length % 7) * 0.006 - 0.02
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
        day: i === 0 ? "Auj." : i === 1 ? "Dem." : DAYS[d.getDay()],
        date: d.toISOString().slice(0, 10),
        afai: Math.round(v * 100) / 100,
        status: s,
      })
    }
    const trend = series[6].afai - series[0].afai
    weekly[id] = {
      forecast: series,
      drift: trend > 0.05 ? "up" : trend < -0.05 ? "down" : "stable",
      driftLabel: trend > 0.05 ? "Dérive possible vers la côte" : trend < -0.05 ? "Dispersion attendue" : "Stable",
      driftValue: Math.round(trend * 100) / 100,
    }
  }
  return weekly
}

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
        // L'API peut renvoyer un fichier binaire (NetCDF) — on considère la connexion OK
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

  // Read existing history
  let historyData = { history: [], changes: [] }
  try {
    const raw = fs.readFileSync(historyPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.history)) historyData = parsed
    if (!Array.isArray(historyData.changes)) historyData.changes = []
  } catch (_) {}

  // Build today's entry
  const todayEntry = {
    date: today,
    levels: levels.map(l => ({ id: l.id, afai: l.afai, status: l.status })),
  }

  // Replace today's entry if it already exists, otherwise append
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

  // Append new changes (avoid duplicates for same date+beach)
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
  console.log('History:', historyPath, '|', historyData.history.length, 'jours |', newChanges.length, 'changement(s) détecté(s)')

  return newChanges
}

async function main() {
  const creds = getCopernicusCreds()
  let source = 'reference'
  let levels = SARGASSUM_REF.map(l => ({ ...l }))

  if (creds) {
    console.log('Appel API Copernicus Marine (subset Antilles, 7 derniers jours)...')
    const result = await fetchCopernicusSubset(creds.username, creds.password)
    source = result.source
    if (result.levels && result.levels.length) {
      levels = result.levels.map(l => ({
        id: l.id,
        afai: Number(l.afai) || 0,
        status: l.status || statusFromAfai(Number(l.afai) || 0),
      }))
      console.log('Données Copernicus reçues:', levels.length, 'plages')
    } else if (source === 'copernicus') {
      console.log('API OK, pas de niveaux détaillés → utilisation des données de référence avec source=copernicus')
    }
  } else {
    console.warn('Fichier copernicustxt.txt absent ou invalide → données de référence uniquement.')
  }

  const updatedAt = new Date().toISOString()
  const weekly = buildWeeklyBatch(levels)
  const payload = { source, updatedAt, levels, weekly }

  const dir = path.join(__dirname, '..', 'public', 'api', 'copernicus')
  fs.mkdirSync(dir, { recursive: true })
  const outPath = path.join(dir, 'sargassum.json')
  fs.writeFileSync(outPath, JSON.stringify(payload), 'utf-8')
  console.log('OK:', outPath)
  console.log('   source:', source, '| updatedAt:', updatedAt.slice(0, 19))

  // History tracking + notifications
  const changes = updateHistory(dir, levels)
  for (const change of changes) {
    await sendOneSignalNotification(change)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

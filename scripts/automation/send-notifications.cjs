/**
 * send-notifications.cjs
 *
 * Runs daily after scrape-copernicus.cjs.
 * Detects sargassum status changes and sends:
 *   1. Push notifications via OneSignal REST API (per island)
 *   2. Weekly email digest summary via Google Sheets webhook
 *
 * Never crashes — all errors are caught and logged.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

// ── Paths ────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..', '..')
const SARGASSUM_PATH = path.join(ROOT, 'public', 'api', 'copernicus', 'sargassum.json')
const HISTORY_PATH = path.join(ROOT, 'public', 'api', 'copernicus', 'history.json')
const LOG_PATH = path.join(__dirname, 'data', 'automation-log.json')

// ── Beach display names (matches scrape-copernicus.cjs) ──────
const BEACH_NAMES = {
  'grande-anse':    "Grande Anse d'Arlet",
  'anse-mitan':     'Anse Mitan',
  'anse-noire':     'Anse Noire',
  'tartane':        'Tartane',
  'anse-madame':    'Anse Madame',
  'diamant':        'Le Diamant',
  'pt-marin':       'Pointe du Marin',
  'sainte-anne':    'Sainte-Anne (MQ)',
  'les-salines':   'Les Salines',
  'vauclin':        'Le Vauclin',
  'gp-grande-anse': 'Grande Anse (GP)',
  'gp-malendure':   'Malendure',
  'gp-sainte-anne': 'Sainte-Anne (GP)',
  'gp-pt-chateaux': 'Pointe des Ch\u00e2teaux',
  'gp-gosier':      'Le Gosier',
  'gp-caravelle':   'La Caravelle (GP)',
  'gp-bas-du-fort': 'Bas du Fort',
  'gp-deshaies':    'Deshaies',
  'gp-moule':       'Le Moule',
  'gp-vieux-fort':  'Vieux-Fort',
}

// ── OneSignal config ─────────────────────────────────────────
const ONESIGNAL_APPS = {
  mq: {
    appId: 'd628363e-efc7-4d27-8d1b-fa25fe3bacc9',
    apiKey: process.env.ONESIGNAL_API_KEY_MQ || '',
    heading: 'Sargasses Martinique',
    url: 'https://sargasses-martinique.com/',
  },
  gp: {
    appId: 'f9adee80-8909-48d3-8517-95f9f311d164',
    apiKey: process.env.ONESIGNAL_API_KEY_GP || '',
    heading: 'Sargasses Guadeloupe',
    url: 'https://sargasses-guadeloupe.com/',
  },
}

// ── Multi-régions (regions/index.cjs) ────────────────────────
// mq/gp restent hardcodés ci-dessus (comportement legacy intact).
// Les autres régions sont chargées dynamiquement : appId depuis regions/<id>.json,
// apiKey depuis le secret ONESIGNAL_API_KEY_<ID_UPPER>.
let REGIONS = []
try {
  REGIONS = require(path.join(ROOT, 'regions', 'index.cjs')).getAllRegions()
} catch (e) {
  console.warn(`[WARN] regions/index.cjs illisible (${e.message}) — fallback mq/gp uniquement.`)
}

const REGION_NAMES = { mq: 'Martinique', gp: 'Guadeloupe' }
const REGION_LANGS = { mq: 'fr', gp: 'fr' }
const BEACH_PREFIX_TO_REGION = {} // ex: pc → puntacana (déduit de beaches[].id, jamais hardcodé)

for (const region of REGIONS) {
  if (region.id === 'mq' || region.id === 'gp') continue
  REGION_NAMES[region.id] = region.name
  REGION_LANGS[region.id] = region.primaryLang || 'en'
  for (const b of region.beaches || []) {
    if (!BEACH_NAMES[b.id]) BEACH_NAMES[b.id] = b.name
    const m = /^([a-z]+)(?=\d)/i.exec(b.id) // préfixe lettres suivi d'un chiffre: pc001 → pc
    if (m) BEACH_PREFIX_TO_REGION[m[1].toLowerCase()] = region.id
  }
  if (!region.onesignalAppId) continue
  ONESIGNAL_APPS[region.id] = {
    appId: region.onesignalAppId,
    apiKey: process.env[`ONESIGNAL_API_KEY_${region.id.toUpperCase()}`] || '',
    heading: (region.primaryLang === 'es' ? `Sargazo ${region.name}` : `Sargassum ${region.name}`),
    url: `https://${region.domain}/`,
  }
}

/** Langue des messages pour une région (mq/gp = fr, comportement actuel). */
function regionLang(islandId) {
  return REGION_LANGS[islandId] || 'fr'
}

let _notifiableRegions = null
/**
 * Régions à notifier : mq/gp TOUJOURS incluses (comportement legacy inchangé,
 * le no-key est géré dans sendPushNotification comme avant). Les autres régions
 * ne sont incluses que si leur API key est présente — sinon skip loggé une fois.
 */
function getNotifiableRegions() {
  if (_notifiableRegions) return _notifiableRegions
  const ids = ['mq', 'gp']
  for (const id of Object.keys(ONESIGNAL_APPS)) {
    if (id === 'mq' || id === 'gp') continue
    if (ONESIGNAL_APPS[id].apiKey) {
      ids.push(id)
    } else {
      console.log(`[skip] ${id}: pas de ONESIGNAL_API_KEY_${id.toUpperCase()}`)
    }
  }
  _notifiableRegions = ids
  return ids
}

/** Données sargassum d'une région. mq/gp = fichier racine legacy (inchangé). */
function readRegionSargassum(regionId, rootSargassum) {
  if (regionId === 'mq' || regionId === 'gp') return rootSargassum
  return readJSON(path.join(ROOT, 'public', 'api', 'copernicus', regionId, 'sargassum.json'))
}

/** History d'une nouvelle région (mq/gp utilisent HISTORY_PATH racine). */
function readRegionHistory(regionId) {
  return readJSON(path.join(ROOT, 'public', 'api', 'copernicus', regionId, 'history.json'))
}

// ── Google Sheets webhook ────────────────────────────────────
const SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec'

// ── Helpers ──────────────────────────────────────────────────

function readJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  } catch (e) {
    console.warn(`[WARN] Cannot read ${filepath}: ${e.message}`)
    return null
  }
}

function appendLog(entry) {
  try {
    const log = readJSON(LOG_PATH) || { runs: [] }
    log.runs.push({ timestamp: new Date().toISOString(), ...entry })
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2))
  } catch (e) {
    console.error(`[ERROR] Cannot write log: ${e.message}`)
  }
}

/**
 * Determine region from beach id:
 *   gp- prefix = GP (legacy), préfixe lettres+chiffre connu (pc001/fl001/rm001…)
 *   = région correspondante (déduit des regions/<id>.json), sinon MQ (legacy).
 */
function getIsland(beachId) {
  if (beachId.startsWith('gp-')) return 'gp'
  const m = /^([a-z]+)(?=\d)/i.exec(beachId)
  if (m) {
    const regionId = BEACH_PREFIX_TO_REGION[m[1].toLowerCase()]
    if (regionId) return regionId
  }
  return 'mq'
}

// ── i18n — messages par langue de région ─────────────────────
// fr = strings legacy mq/gp à l'identique (NE PAS modifier).
const I18N = {
  fr: {
    status: { clean: 'propre', moderate: 'modere', avoid: 'a eviter' },
    alertHeading: (brand) => `${brand} — Alerte`,
    alertMsg: (name, label) => `⚠️ ${name} passe en ${label}. Vois les alternatives sur la carte.`,
    goodNewsHeading: (name) => `${name} est propre ✅`,
    goodNewsMsg: (name) => `✅ ${name} est propre ! Parfait pour ce weekend.`,
    favAlertMsg: (prefix, name, label) => `${prefix}💔 Ta plage preférée ${name} vient de passer en ${label}. Vois les alternatives sur la carte.`,
    favGoodMsg: (prefix, name, label) => `${prefix}💚 ${name} est redevenue ${label} ! Ta plage préférée est OK.`,
    favHeadingTest: `[TEST] Ta plage préférée change`,
    favHeadingAlert: `Ta plage préférée change`,
    favHeadingGood: `Bonne nouvelle pour toi`,
    fcImproveOne: (name) => `☀️ ${name} sera propre demain ! Previsions satellite.`,
    fcImproveMany: (count, names, more) => `☀️ ${count} plages propres demain : ${names}${more}. Vois la carte.`,
    fcImproveHeading: 'Bonne nouvelle demain',
    fcDegradeOne: (name) => `⚠️ ${name} risque de se degrader demain. Verifie avant d'y aller.`,
    fcDegradeMany: (count, names, more) => `⚠️ ${count} plages a surveiller demain : ${names}${more}. Vois les alternatives.`,
    fcDegradeHeading: 'Prevision sargasses',
    weekendMsg: (count, islandName) => `🏖️ Ce weekend : ${count} plages propres en ${islandName}. Planifie ta sortie !`,
    weekendHeading: (islandName) => `Weekend en ${islandName}`,
    briefHeading: `Ton brief plages ☀️`,
    briefNoClean: (islandName) => `⚠️ Aujourd'hui en ${islandName}, aucune plage propre parmi les plus populaires. Verifie la carte avant de partir.`,
    // NB: reason vient du pipeline (texte FR) — inclus uniquement en fr.
    briefUnified: (name, islandName, score, label, reason, drive) => `☀️ ${name} ${islandName} — ${score}/100 ${label}. ${reason}.${typeof drive === 'number' ? ` (${drive} min)` : ''}`,
    briefWarnTomorrow: (label) => ` Attention : ${label} demain.`,
    briefDriftUp: ` Sargasses en approche.`,
    briefLegacyClean: (name, islandName, drive) => `☀️ Ta meilleure plage ${islandName} aujourd'hui : ${name}${typeof drive === 'number' ? ` (${drive} min)` : ''}. Propre.`,
    briefLegacyOther: (name, islandName, drive, label) => `☀️ ${name} reste le meilleur choix ${islandName} aujourd'hui (${typeof drive === 'number' ? `${drive} min, ` : ''}${label}).`,
    briefLegacyWarn: (label) => ` Attention : ${label} prevu demain.`,
    briefLegacyDrift: ` Sargasses en approche ces prochains jours.`,
    briefAlts: (n) => ` +${n} alternative(s) proche(s).`,
  },
  en: {
    status: { clean: 'clean', moderate: 'moderate', avoid: 'avoid' },
    alertHeading: (brand) => `${brand} — Alert`,
    alertMsg: (name, label) => `⚠️ ${name} is now ${label}. See alternatives on the map.`,
    goodNewsHeading: (name) => `${name} is clean ✅`,
    goodNewsMsg: (name) => `✅ ${name} is clean! Perfect for this weekend.`,
    favAlertMsg: (prefix, name, label) => `${prefix}💔 Your favorite beach ${name} just turned ${label}. See alternatives on the map.`,
    favGoodMsg: (prefix, name, label) => `${prefix}💚 ${name} is back to ${label}! Your favorite beach is OK.`,
    favHeadingTest: `[TEST] Your favorite beach changed`,
    favHeadingAlert: `Your favorite beach changed`,
    favHeadingGood: `Good news for you`,
    fcImproveOne: (name) => `☀️ ${name} will be clean tomorrow! Satellite forecast.`,
    fcImproveMany: (count, names, more) => `☀️ ${count} clean beaches tomorrow: ${names}${more}. See the map.`,
    fcImproveHeading: 'Good news tomorrow',
    fcDegradeOne: (name) => `⚠️ ${name} may worsen tomorrow. Check before you go.`,
    fcDegradeMany: (count, names, more) => `⚠️ ${count} beaches to watch tomorrow: ${names}${more}. See alternatives.`,
    fcDegradeHeading: 'Sargassum forecast',
    weekendMsg: (count, islandName) => `🏖️ This weekend: ${count} clean beaches in ${islandName}. Plan your trip!`,
    weekendHeading: (islandName) => `Weekend in ${islandName}`,
    briefHeading: `Your beach brief ☀️`,
    briefNoClean: (islandName) => `⚠️ Today in ${islandName}, none of the most popular beaches are clean. Check the map before heading out.`,
    briefUnified: (name, islandName, score, label, reason, drive) => `☀️ ${name} ${islandName} — ${score}/100 ${label}.${typeof drive === 'number' ? ` (${drive} min)` : ''}`,
    briefWarnTomorrow: (label) => ` Heads up: ${label} tomorrow.`,
    briefDriftUp: ` Sargassum approaching.`,
    briefLegacyClean: (name, islandName, drive) => `☀️ Your best ${islandName} beach today: ${name}${typeof drive === 'number' ? ` (${drive} min)` : ''}. Clean.`,
    briefLegacyOther: (name, islandName, drive, label) => `☀️ ${name} is still the best ${islandName} pick today (${typeof drive === 'number' ? `${drive} min, ` : ''}${label}).`,
    briefLegacyWarn: (label) => ` Heads up: ${label} expected tomorrow.`,
    briefLegacyDrift: ` Sargassum approaching in the coming days.`,
    briefAlts: (n) => ` +${n} nearby alternative(s).`,
  },
  es: {
    status: { clean: 'limpia', moderate: 'moderado', avoid: 'evitar' },
    alertHeading: (brand) => `${brand} — Alerta`,
    alertMsg: (name, label) => `⚠️ ${name} pasa a ${label}. Mira las alternativas en el mapa.`,
    goodNewsHeading: (name) => `${name} está limpia ✅`,
    goodNewsMsg: (name) => `✅ ${name} está limpia! Perfecta para este fin de semana.`,
    favAlertMsg: (prefix, name, label) => `${prefix}💔 Tu playa favorita ${name} acaba de pasar a ${label}. Mira las alternativas en el mapa.`,
    favGoodMsg: (prefix, name, label) => `${prefix}💚 ${name} vuelve a estar ${label}! Tu playa favorita está OK.`,
    favHeadingTest: `[TEST] Tu playa favorita cambia`,
    favHeadingAlert: `Tu playa favorita cambia`,
    favHeadingGood: `Buena noticia para ti`,
    fcImproveOne: (name) => `☀️ ${name} estará limpia mañana! Pronóstico satelital.`,
    fcImproveMany: (count, names, more) => `☀️ ${count} playas limpias mañana: ${names}${more}. Mira el mapa.`,
    fcImproveHeading: 'Buena noticia mañana',
    fcDegradeOne: (name) => `⚠️ ${name} podría empeorar mañana. Verifica antes de ir.`,
    fcDegradeMany: (count, names, more) => `⚠️ ${count} playas a vigilar mañana: ${names}${more}. Mira las alternativas.`,
    fcDegradeHeading: 'Pronóstico de sargazo',
    weekendMsg: (count, islandName) => `🏖️ Este fin de semana: ${count} playas limpias en ${islandName}. Planifica tu salida!`,
    weekendHeading: (islandName) => `Fin de semana en ${islandName}`,
    briefHeading: `Tu resumen de playas ☀️`,
    briefNoClean: (islandName) => `⚠️ Hoy en ${islandName}, ninguna playa limpia entre las más populares. Revisa el mapa antes de salir.`,
    briefUnified: (name, islandName, score, label, reason, drive) => `☀️ ${name} ${islandName} — ${score}/100 ${label}.${typeof drive === 'number' ? ` (${drive} min)` : ''}`,
    briefWarnTomorrow: (label) => ` Atención: ${label} mañana.`,
    briefDriftUp: ` Sargazo acercándose.`,
    briefLegacyClean: (name, islandName, drive) => `☀️ Tu mejor playa de ${islandName} hoy: ${name}${typeof drive === 'number' ? ` (${drive} min)` : ''}. Limpia.`,
    briefLegacyOther: (name, islandName, drive, label) => `☀️ ${name} sigue siendo la mejor opción en ${islandName} hoy (${typeof drive === 'number' ? `${drive} min, ` : ''}${label}).`,
    briefLegacyWarn: (label) => ` Atención: ${label} previsto mañana.`,
    briefLegacyDrift: ` Sargazo acercándose en los próximos días.`,
    briefAlts: (n) => ` +${n} alternativa(s) cercana(s).`,
  },
}

/** Human-readable status label, dans la langue de la région (défaut fr = legacy). */
function statusLabel(status, lang = 'fr') {
  const map = (I18N[lang] || I18N.fr).status
  return map[status] || status
}

/**
 * Compare current levels against the most recent history entry.
 * Returns { alerts: [...], goodNews: [...] }
 */
function detectChanges(currentLevels, history) {
  const alerts = []
  const goodNews = []

  // Get the most recent history entry (last in the array, but NOT today's)
  if (!history || !history.history || history.history.length === 0) {
    console.log('[INFO] No history data available — skipping change detection.')
    return { alerts, goodNews }
  }

  // Find the most recent entry that is NOT today
  const today = new Date().toISOString().slice(0, 10)
  const previousEntries = history.history.filter(h => h.date !== today)
  if (previousEntries.length === 0) {
    console.log('[INFO] No previous history entry found (only today) — skipping.')
    return { alerts, goodNews }
  }

  const previous = previousEntries[previousEntries.length - 1]
  const prevMap = {}
  for (const b of previous.levels) {
    prevMap[b.id] = b.status
  }

  for (const beach of currentLevels) {
    const prevStatus = prevMap[beach.id]
    if (!prevStatus) continue // new beach, no comparison

    // IMPORTANT: compare RAW satellite status, not memory-enhanced.
    // history.json stores raw satellite readings, while beach.status/beach.afai
    // may be memory-enhanced (accumulation decay model) for sheltered beaches.
    // Using memory-enhanced values here triggered false "clean -> moderate"
    // alerts every run for sainte-anne/les-salines/vauclin/gp-vieux-fort.
    const rawAfai = typeof beach.afaiSat === 'number' ? beach.afaiSat : beach.afai
    const curStatus = rawAfai < 0.15 ? 'clean' : rawAfai < 0.40 ? 'moderate' : 'avoid'
    if (prevStatus === curStatus) continue // no change

    const name = BEACH_NAMES[beach.id] || beach.id
    const island = getIsland(beach.id)

    // ALERT: clean -> moderate/avoid, or moderate -> avoid
    if (
      (prevStatus === 'clean' && (curStatus === 'moderate' || curStatus === 'avoid')) ||
      (prevStatus === 'moderate' && curStatus === 'avoid')
    ) {
      alerts.push({ id: beach.id, name, island, from: prevStatus, to: curStatus, afai: beach.afai })
    }

    // GOOD NEWS: avoid -> moderate/clean, or moderate -> clean
    if (
      (prevStatus === 'avoid' && (curStatus === 'moderate' || curStatus === 'clean')) ||
      (prevStatus === 'moderate' && curStatus === 'clean')
    ) {
      goodNews.push({ id: beach.id, name, island, from: prevStatus, to: curStatus, afai: beach.afai })
    }
  }

  return { alerts, goodNews }
}

/**
 * POST JSON via https. Returns a promise resolving to { status, body }.
 */
function httpsPost(url, body, headers) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url)
      const postData = JSON.stringify(body)

      const opts = {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        },
      }

      const req = https.request(opts, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })

      req.on('error', (e) => resolve({ status: 0, body: e.message }))
      req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
      req.write(postData)
      req.end()
    } catch (e) {
      resolve({ status: 0, body: e.message })
    }
  })
}

// ── OneSignal push notifications ─────────────────────────────

async function sendPushNotification(island, message, heading) {
  const config = ONESIGNAL_APPS[island]
  if (!config || !config.apiKey) {
    console.warn(`[WARN] No OneSignal API key for ${island} — skipping push.`)
    return { sent: false, reason: 'no-api-key' }
  }

  const payload = {
    app_id: config.appId,
    included_segments: ['Subscribed Users'],
    contents: { en: message, fr: message },
    headings: { en: heading || config.heading, fr: heading || config.heading },
    url: config.url,
  }

  console.log(`[PUSH] Sending to ${island.toUpperCase()}: "${message}"`)

  const result = await httpsPost(
    'https://onesignal.com/api/v1/notifications',
    payload,
    { Authorization: `Key ${config.apiKey}` }
  )

  if (result.status === 200 || result.status === 201) {
    console.log(`[PUSH] OK (${result.status})`)
    return { sent: true, status: result.status }
  } else {
    console.error(`[PUSH] Failed (${result.status}): ${result.body}`)
    return { sent: false, status: result.status, error: result.body }
  }
}

async function sendAllPushNotifications(alerts, goodNews) {
  const results = []

  for (const a of alerts) {
    const T = I18N[regionLang(a.island)] || I18N.fr
    const brand = (ONESIGNAL_APPS[a.island] && ONESIGNAL_APPS[a.island].heading) || ''
    const msg = T.alertMsg(a.name, statusLabel(a.to, regionLang(a.island)))
    const res = await sendPushNotification(a.island, msg, T.alertHeading(brand))
    results.push({ type: 'alert', beach: a.id, island: a.island, message: msg, ...res })
  }

  for (const g of goodNews) {
    const T = I18N[regionLang(g.island)] || I18N.fr
    const msg = T.goodNewsMsg(g.name)
    const res = await sendPushNotification(g.island, msg, T.goodNewsHeading(g.name))
    results.push({ type: 'good-news', beach: g.id, island: g.island, message: msg, ...res })
  }

  return results
}

// ── Proactive forecast push notifications ────────────────────

/**
 * Sends proactive push based on forecast data:
 *   1. "Clean tomorrow" — today moderate/avoid, tomorrow clean (conf > 40%)
 *   2. "Weekend outlook" — Friday only, count of clean beaches for Sat+Sun
 *   3. "Degradation incoming" — today clean, tomorrow moderate/avoid (conf > 40%)
 */
async function sendProactiveForecastPush(sargassum) {
  const results = []
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 5=Fri
  const MIN_CONFIDENCE = 40

  // Weekly data par région : mq/gp = fichier racine (legacy), autres = fichier région
  const regionWeekly = {}
  for (const island of getNotifiableRegions()) {
    const data = readRegionSargassum(island, sargassum)
    if (!data || !data.weekly) {
      console.log(`[FORECAST-PUSH] No weekly forecast data (${island}) — skipping.`)
      continue
    }
    regionWeekly[island] = data.weekly
  }

  // Group forecast improvements/degradations by region
  const improvements = {}
  const degradations = {}

  for (const [island, weekly] of Object.entries(regionWeekly)) {
    improvements[island] = []
    degradations[island] = []

    for (const [beachId, data] of Object.entries(weekly)) {
      if (getIsland(beachId) !== island) continue
      if (!data.forecast || data.forecast.length < 2) continue

      const today = data.forecast[0]
      const tomorrow = data.forecast[1]
      if (!today || !tomorrow || tomorrow.confidence < MIN_CONFIDENCE) continue

      const name = BEACH_NAMES[beachId] || beachId

      // Clean tomorrow (improvement)
      if (
        (today.status === 'moderate' || today.status === 'avoid') &&
        tomorrow.status === 'clean'
      ) {
        improvements[island].push(name)
      }

      // Degradation incoming
      if (
        today.status === 'clean' &&
        (tomorrow.status === 'moderate' || tomorrow.status === 'avoid')
      ) {
        degradations[island].push(name)
      }
    }
  }

  // Send "clean tomorrow" push (max 1 per region)
  for (const island of Object.keys(regionWeekly)) {
    const T = I18N[regionLang(island)] || I18N.fr

    if (improvements[island].length > 0) {
      const count = improvements[island].length
      const names = improvements[island].slice(0, 3).join(', ')
      const msg = count === 1
        ? T.fcImproveOne(names)
        : T.fcImproveMany(count, names, count > 3 ? '...' : '')
      const res = await sendPushNotification(island, msg, T.fcImproveHeading)
      results.push({ type: 'forecast-improvement', island, count, ...res })
    }

    if (degradations[island].length > 0) {
      const count = degradations[island].length
      const names = degradations[island].slice(0, 3).join(', ')
      const msg = count === 1
        ? T.fcDegradeOne(names)
        : T.fcDegradeMany(count, names, count > 3 ? '...' : '')
      const res = await sendPushNotification(island, msg, T.fcDegradeHeading)
      results.push({ type: 'forecast-degradation', island, count, ...res })
    }
  }

  // Friday: Weekend outlook push
  if (dayOfWeek === 5) {
    for (const [island, weekly] of Object.entries(regionWeekly)) {
      const T = I18N[regionLang(island)] || I18N.fr
      const islandName = REGION_NAMES[island] || island
      let cleanWeekend = 0

      for (const [beachId, data] of Object.entries(weekly)) {
        if (getIsland(beachId) !== island) continue
        if (!data.forecast || data.forecast.length < 3) continue

        // Check Saturday (index 1) and Sunday (index 2) — relative to Friday
        const sat = data.forecast[1]
        const sun = data.forecast[2]
        if (sat && sat.status === 'clean' && sun && sun.status === 'clean') {
          cleanWeekend++
        }
      }

      if (cleanWeekend > 0) {
        const msg = T.weekendMsg(cleanWeekend, islandName)
        const res = await sendPushNotification(island, msg, T.weekendHeading(islandName))
        results.push({ type: 'weekend-outlook', island, cleanWeekend, ...res })
      }
    }
  }

  return results
}

// ── Favorite alerts — segmented push per fav (F2) ────────────

/**
 * Send a segmented push for a single beach change, targeted at OneSignal
 * users who tagged `fav_<id>=1`. Pattern: Windy Premium custom alerts,
 * Surfline live wind, StormWatch+ personalized alerts.
 *
 * This runs IN ADDITION to the broadcast change push — users with the
 * favorite tag receive both, but the targeted one uses more personal copy.
 */
async function sendFavoriteAlert(beachChange, type, opts = {}) {
  const { isTest = false } = opts
  const config = ONESIGNAL_APPS[beachChange.island]
  if (!config || !config.apiKey) {
    return { sent: false, reason: 'no-api-key' }
  }
  const lang = regionLang(beachChange.island)
  const T = I18N[lang] || I18N.fr
  const label = statusLabel(beachChange.to, lang)
  const prefix = isTest ? '[TEST] ' : ''
  const msg = type === 'alert'
    ? T.favAlertMsg(prefix, beachChange.name, label)
    : T.favGoodMsg(prefix, beachChange.name, label)
  const heading = isTest
    ? T.favHeadingTest
    : (type === 'alert' ? T.favHeadingAlert : T.favHeadingGood)

  const payload = {
    app_id: config.appId,
    filters: [
      { field: 'tag', key: 'fav_' + beachChange.id, relation: '=', value: '1' },
    ],
    contents: { en: msg, fr: msg },
    headings: { en: heading, fr: heading },
    url: config.url,
  }

  console.log(`[FAV-ALERT] ${beachChange.island.toUpperCase()} ${type} fav_${beachChange.id}: ${msg}`)
  const result = await httpsPost(
    'https://onesignal.com/api/v1/notifications',
    payload,
    { Authorization: `Key ${config.apiKey}` }
  )
  if (result.status === 200 || result.status === 201) {
    // OneSignal returns {"id": "...", "recipients": 0} if no one matches the filter.
    // We treat 0-recipient as success but log it separately.
    let recipients = 0
    try { recipients = JSON.parse(result.body).recipients || 0 } catch {}
    console.log(`[FAV-ALERT] OK — ${recipients} recipient(s)`)
    return { sent: true, recipients, status: result.status }
  }
  console.error(`[FAV-ALERT] Failed (${result.status}): ${result.body}`)
  return { sent: false, status: result.status, error: result.body }
}

async function sendAllFavoriteAlerts(alerts, goodNews) {
  const results = []
  for (const a of alerts) {
    const r = await sendFavoriteAlert(a, 'alert')
    results.push({ type: 'fav-alert', beach: a.id, ...r })
  }
  for (const g of goodNews) {
    const r = await sendFavoriteAlert(g, 'good-news')
    results.push({ type: 'fav-good-news', beach: g.id, ...r })
  }
  return results
}

// ── Morning brief — daily personalized push (F3) ─────────────

/**
 * Featured beaches per island with drive time from main hub
 * (Fort-de-France for MQ, Pointe-a-Pitre for GP).
 * Used by the morning brief to pick a top "go-to" beach with context.
 */
const FEATURED_BEACHES = {
  mq: [
    { id: 'anse-mitan',   name: 'Anse Mitan',              drive: 18, kids: true },
    { id: 'anse-noire',   name: 'Anse Noire',              drive: 28, kids: true },
    { id: 'grande-anse',  name: "Grande Anse d'Arlet",     drive: 25, kids: true },
    { id: 'anse-madame',  name: 'Anse Madame',             drive: 12, kids: true },
    { id: 'tartane',      name: 'Tartane',                 drive: 30, kids: true },
    { id: 'diamant',      name: 'Le Diamant',              drive: 32, kids: false },
    { id: 'pt-marin',     name: 'Pointe du Marin',         drive: 42, kids: true },
    { id: 'sainte-anne',  name: 'Sainte-Anne (bourg)',     drive: 48, kids: true },
    { id: 'les-salines',  name: 'Plage des Salines',       drive: 52, kids: true },
    { id: 'vauclin',      name: 'Le Vauclin',              drive: 55, kids: true },
  ],
  gp: [
    { id: 'gp-bas-du-fort',  name: 'Bas du Fort',            drive: 12, kids: true },
    { id: 'gp-gosier',       name: 'Le Gosier',              drive: 15, kids: true },
    { id: 'gp-sainte-anne',  name: 'Sainte-Anne',            drive: 30, kids: true },
    { id: 'gp-caravelle',    name: 'La Caravelle',           drive: 32, kids: true },
    { id: 'gp-pt-chateaux',  name: 'Pointe des Ch\u00e2teaux',drive: 45, kids: false },
    { id: 'gp-grande-anse',  name: 'Grande Anse',            drive: 40, kids: true },
    { id: 'gp-deshaies',     name: 'Deshaies',               drive: 45, kids: true },
    { id: 'gp-malendure',    name: 'Malendure',              drive: 50, kids: true },
    { id: 'gp-moule',        name: 'Le Moule',               drive: 35, kids: true },
    { id: 'gp-vieux-fort',   name: 'Vieux-Fort',             drive: 55, kids: false },
  ],
}

// Régions dynamiques : featured = toutes les plages du regions/<id>.json
// (drive inconnu → null, ignoré dans le scoring et omis du message).
for (const region of REGIONS) {
  if (FEATURED_BEACHES[region.id]) continue
  if (!region.beaches || region.beaches.length === 0) continue
  FEATURED_BEACHES[region.id] = region.beaches.map(b => ({
    id: b.id,
    name: b.name,
    drive: null,
    kids: !!b.kids,
  }))
}

/**
 * Pick the top beach for morning brief on a given island.
 * Signals used (v2, 2026-04-10 — parity with DailyRecoStrip client):
 * • status today (clean/moderate/avoid) — primary
 * • AFAI continuous — rewards very clean waters
 * • forecast J+1 — penalty if degrading tomorrow
 * • drift trend — penalty if sargasses approaching
 * • confidence — dampens unreliable picks
 * • beach memory — persistent echouage penalty
 * • drive time from hub — proximity proxy (no user geoloc at cron time)
 * • amenities (kids)
 * Returns {top, alternatives, anyClean, degradingTomorrow}.
 */
function pickTopForBrief(sargassum, island) {
  const featured = FEATURED_BEACHES[island]
  if (!featured) return null
  const levelById = {}
  for (const lv of (sargassum.levels || [])) levelById[lv.id] = lv
  const weekly = sargassum.weekly || {}

  const scored = featured.map(b => {
    const lv = levelById[b.id]
    const wk = weekly[b.id]
    const fc1 = wk?.forecast?.[1]
    const drift = wk?.drift || null
    const conf = (wk?.forecast?.[0]?.confidence) || 60
    const status = lv?.status || 'unknown'
    let score = 0
    // 0. v3.1 unified Beach Score 0-100 (year-round) — primary signal when present
    if (typeof lv?.score === 'number') score += lv.score * 10
    // 1. Status today — legacy signal still contributes (less dominant now)
    if (status === 'clean') score += 1000
    else if (status === 'moderate') score += 400
    else if (status === 'avoid') score -= 500
    // 2. Continuous AFAI — rewards 0.05 over 0.14
    if (typeof lv?.afai === 'number') score -= lv.afai * 300
    // 3. Forecast J+1 — heavy penalty if tomorrow degrades
    if (fc1) {
      if (fc1.status === 'avoid') score -= 300
      else if (fc1.status === 'moderate') score -= 120
    }
    // 4. Drift trend
    if (drift === 'up') score -= 150
    else if (drift === 'down') score += 30
    // 5. Confidence dampener
    score = score * (0.6 + Math.min(conf, 100) / 250)
    // 6. Beach memory
    if (lv?.beachMemory) score -= 200
    // 7. Drive time from hub (régions dynamiques: drive=null → pas de pénalité)
    if (typeof b.drive === 'number') score -= b.drive * 1.5
    // 8. Amenities tie-breaker
    if (b.kids) score += 10
    return {
      ...b,
      status,
      afai: lv?.afai,
      beachMemory: lv?.beachMemory,
      forecastJ1: fc1?.status,
      drift,
      confidence: conf,
      unifiedScore: lv?.score,
      unifiedLabel: lv?.label,
      unifiedReason: lv?.reason,
      _score: Math.round(score * 10) / 10,
    }
  })
  scored.sort((a, b) => b._score - a._score)
  const cleanOnes = scored.filter(s => s.status === 'clean')
  return {
    top: scored[0],
    alternatives: scored.slice(1, 3),
    anyClean: cleanOnes.length > 0,
    cleanCount: cleanOnes.length,
    degradingTomorrow: scored[0]?.forecastJ1 && scored[0].forecastJ1 !== 'clean',
  }
}

/**
 * Build the morning brief message for one island.
 * Pattern: DayStart / Brella — short, actionable, one reco + context.
 * v2: includes forecast-tomorrow warning and drift-approaching flag.
 */
function buildBriefMessage(pick, islandName, lang = 'fr') {
  const T = I18N[lang] || I18N.fr
  if (!pick || !pick.top) return null
  const t = pick.top
  if (!pick.anyClean && typeof t.unifiedScore !== 'number') {
    return T.briefNoClean(islandName)
  }
  // v3.1: prefer unified 0-100 score + reason (year-round, works when all beaches clean)
  if (typeof t.unifiedScore === 'number' && t.unifiedScore >= 40) {
    // Strip trailing period if present — we add our own sentence structure
    const reason = (t.unifiedReason || '').replace(/\.\s*$/, '')
    let msg = T.briefUnified(t.name, islandName, t.unifiedScore, t.unifiedLabel || '', reason, t.drive)
    if (t.forecastJ1 && t.forecastJ1 !== 'clean') {
      msg += T.briefWarnTomorrow(statusLabel(t.forecastJ1, lang))
    } else if (t.drift === 'up') {
      msg += T.briefDriftUp
    }
    return msg
  }
  // Legacy fallback (score < 40 or missing)
  let hasWarning = false
  let msg = t.status === 'clean'
    ? T.briefLegacyClean(t.name, islandName, t.drive)
    : T.briefLegacyOther(t.name, islandName, t.drive, statusLabel(t.status, lang))
  if (t.forecastJ1 && t.forecastJ1 !== 'clean') {
    msg += T.briefLegacyWarn(statusLabel(t.forecastJ1, lang))
    hasWarning = true
  } else if (t.drift === 'up') {
    msg += T.briefLegacyDrift
    hasWarning = true
  }
  const cleanAlts = pick.alternatives.filter(a => a.status === 'clean').length
  if (cleanAlts > 0 && !hasWarning) {
    msg += T.briefAlts(cleanAlts)
  }
  return msg
}

/**
 * Send the morning brief push for both islands.
 * Called by CLI mode --morning-brief (GH Actions cron 7h57 Antilles = 11h57 UTC).
 */
async function sendMorningBriefPush(sargassum) {
  const results = []
  for (const island of getNotifiableRegions()) {
    const lang = regionLang(island)
    const islandName = REGION_NAMES[island] || island
    const data = readRegionSargassum(island, sargassum)
    if (!data || !data.levels) {
      console.log(`[MORNING-BRIEF] No data for ${island} — skipping.`)
      continue
    }
    const pick = pickTopForBrief(data, island)
    if (!pick || !pick.top) {
      console.log(`[MORNING-BRIEF] No pick for ${island} — skipping.`)
      continue
    }
    const msg = buildBriefMessage(pick, islandName, lang)
    if (!msg) continue
    const heading = (I18N[lang] || I18N.fr).briefHeading
    console.log(`[MORNING-BRIEF] ${island.toUpperCase()}: ${msg}`)
    const res = await sendPushNotification(island, msg, heading)
    results.push({
      type: 'morning-brief',
      island,
      topBeach: pick.top.id,
      topStatus: pick.top.status,
      cleanCount: pick.cleanCount,
      message: msg,
      ...res,
    })
  }
  return results
}

// ── Weekly email digest via Google Sheets webhook ────────────

async function sendWeeklyDigest(currentLevels, alerts, goodNews) {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = Sunday

  // Only send digest on Mondays (day 1)
  if (dayOfWeek !== 1) {
    console.log(`[DIGEST] Not Monday (day=${dayOfWeek}) — skipping weekly digest.`)
    return { sent: false, reason: 'not-monday' }
  }

  // Build summary text
  const mqBeaches = currentLevels.filter(b => !b.id.startsWith('gp-'))
  const gpBeaches = currentLevels.filter(b => b.id.startsWith('gp-'))

  const summarize = (beaches, label) => {
    const clean = beaches.filter(b => b.status === 'clean').length
    const moderate = beaches.filter(b => b.status === 'moderate').length
    const avoid = beaches.filter(b => b.status === 'avoid').length
    return `${label}: ${clean} propres, ${moderate} moderes, ${avoid} a eviter`
  }

  let digest = `Bilan sargasses du ${now.toISOString().slice(0, 10)}:\n`
  digest += summarize(mqBeaches, 'Martinique') + '\n'
  digest += summarize(gpBeaches, 'Guadeloupe') + '\n'

  if (alerts.length > 0) {
    digest += `\nAlertes: ${alerts.map(a => a.name).join(', ')}`
  }
  if (goodNews.length > 0) {
    digest += `\nBonnes nouvelles: ${goodNews.map(g => g.name).join(', ')}`
  }

  console.log(`[DIGEST] Sending weekly digest...`)

  // Send for MQ
  const resMQ = await httpsPost(SHEETS_WEBHOOK_URL, {
    email: 'WEEKLY_DIGEST',
    island: 'MQ',
    source: 'auto-notification',
    digest,
  })

  // Send for GP
  const resGP = await httpsPost(SHEETS_WEBHOOK_URL, {
    email: 'WEEKLY_DIGEST',
    island: 'GP',
    source: 'auto-notification',
    digest,
  })

  const ok = (resMQ.status === 200 || resMQ.status === 302) && (resGP.status === 200 || resGP.status === 302)
  if (ok) {
    console.log(`[DIGEST] Sent successfully.`)
  } else {
    console.warn(`[DIGEST] Partial/failed: MQ=${resMQ.status}, GP=${resGP.status}`)
  }

  return { sent: ok, mqStatus: resMQ.status, gpStatus: resGP.status }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const MODE_MORNING_BRIEF = argv.includes('--morning-brief')
  const MODE_TEST_FAV_IDX = argv.indexOf('--test-fav-alert')
  const MODE_TEST_FAV = MODE_TEST_FAV_IDX !== -1 ? argv[MODE_TEST_FAV_IDX + 1] : null
  const MODE_COUNT_SUBS = argv.includes('--count-subscribers')

  console.log('=== send-notifications.cjs ===')
  console.log(`Date: ${new Date().toISOString()}`)
  if (MODE_MORNING_BRIEF) console.log('Mode: --morning-brief (skip change detection + digest)')
  if (MODE_TEST_FAV) console.log(`Mode: --test-fav-alert ${MODE_TEST_FAV}`)
  if (MODE_COUNT_SUBS) console.log('Mode: --count-subscribers')

  // --count-subscribers: query OneSignal for messageable player counts per island.
  // Used to diagnose "is anybody actually subscribed to push?" without touching data.
  if (MODE_COUNT_SUBS) {
    for (const island of getNotifiableRegions()) {
      const cfg = ONESIGNAL_APPS[island]
      if (!cfg || !cfg.apiKey) {
        console.log(`[COUNT-SUBS] ${island.toUpperCase()}: no API key — skipping`)
        continue
      }
      const result = await new Promise((resolve) => {
        try {
          const opts = {
            hostname: 'onesignal.com', port: 443,
            path: `/api/v1/apps/${cfg.appId}`, method: 'GET',
            headers: { Authorization: `Key ${cfg.apiKey}` },
          }
          const req = https.request(opts, (r) => {
            let d = ''
            r.on('data', (c) => { d += c })
            r.on('end', () => resolve({ status: r.statusCode, body: d }))
          })
          req.on('error', (e) => resolve({ status: 0, body: e.message }))
          req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
          req.end()
        } catch (e) {
          resolve({ status: 0, body: e.message })
        }
      })
      if (result.status === 200) {
        try {
          const data = JSON.parse(result.body)
          console.log(`[COUNT-SUBS] ${island.toUpperCase()}: messageable=${data.messageable_players ?? '?'} total=${data.players ?? '?'}`)
        } catch (e) {
          console.log(`[COUNT-SUBS] ${island.toUpperCase()}: parse error — ${e.message}`)
        }
      } else {
        console.log(`[COUNT-SUBS] ${island.toUpperCase()}: HTTP ${result.status} — ${result.body.slice(0, 200)}`)
      }
    }
    return
  }

  // --test-fav-alert <beach-id>: sends a fake "your favorite changed" push
  // targeted at users tagged fav_<id>=1, without needing an actual status change
  // in the satellite data. Used to verify the F2 loop end-to-end on a real device.
  // The push copy is prefixed with [TEST] so accidental re-runs stay obvious.
  if (MODE_TEST_FAV) {
    const beachId = MODE_TEST_FAV
    const name = BEACH_NAMES[beachId] || beachId
    const island = getIsland(beachId)
    const beachChange = { id: beachId, name, island, from: 'clean', to: 'moderate', afai: 0.18 }
    console.log(`[TEST-FAV] Dispatching test fav alert: ${name} (${island}) clean -> moderate`)
    const res = await sendFavoriteAlert(beachChange, 'alert', { isTest: true })
    console.log(`[TEST-FAV] Result:`, JSON.stringify(res))
    appendLog({
      script: 'send-notifications',
      action: 'test-fav-alert',
      beach: beachId,
      island,
      result: res,
    })
    return
  }

  // 1. Read data
  const sargassum = readJSON(SARGASSUM_PATH)
  const history = readJSON(HISTORY_PATH)

  if (!sargassum || !sargassum.levels) {
    console.error('[ERROR] sargassum.json missing or invalid — aborting.')
    appendLog({ script: 'send-notifications', action: 'error', error: 'sargassum.json missing or invalid' })
    return
  }

  // Morning brief mode: send only the daily brief, nothing else
  if (MODE_MORNING_BRIEF) {
    try {
      const briefResults = await sendMorningBriefPush(sargassum)
      const sentCount = briefResults.filter(r => r.sent).length
      console.log(`[MORNING-BRIEF] Done. ${sentCount}/${briefResults.length} push(es) sent.`)
      appendLog({
        script: 'send-notifications',
        action: 'morning-brief',
        sent: sentCount,
        total: briefResults.length,
        details: briefResults,
      })
    } catch (e) {
      console.error(`[ERROR] Morning brief failed: ${e.message}`)
      appendLog({ script: 'send-notifications', action: 'morning-brief-error', error: e.message })
    }
    return
  }

  const currentLevels = sargassum.levels

  // 2. Detect changes (mq/gp = fichiers racine, comportement legacy inchangé)
  const { alerts, goodNews } = detectChanges(currentLevels, history)

  // 2b. Multi-régions : mêmes détections sur public/api/copernicus/<id>/
  // pour chaque nouvelle région avec API key (les autres sont [skip]).
  for (const regionId of getNotifiableRegions()) {
    if (regionId === 'mq' || regionId === 'gp') continue
    const rSarg = readRegionSargassum(regionId)
    if (!rSarg || !rSarg.levels) {
      console.warn(`[WARN] ${regionId}: sargassum.json manquant — change detection skip.`)
      continue
    }
    const rHistory = readRegionHistory(regionId)
    const rChanges = detectChanges(rSarg.levels, rHistory)
    alerts.push(...rChanges.alerts)
    goodNews.push(...rChanges.goodNews)
  }

  console.log(`[INFO] Changes detected: ${alerts.length} alerts, ${goodNews.length} good news`)

  if (alerts.length === 0 && goodNews.length === 0) {
    console.log('[INFO] No status changes — no push notifications to send.')
    appendLog({
      script: 'send-notifications',
      action: 'no-changes',
      alertCount: 0,
      goodNewsCount: 0,
    })
  } else {
    // 3. Send push notifications
    for (const a of alerts) {
      console.log(`  ALERT: ${a.name} (${a.island}) ${a.from} -> ${a.to}`)
    }
    for (const g of goodNews) {
      console.log(`  GOOD:  ${g.name} (${g.island}) ${g.from} -> ${g.to}`)
    }

    const pushResults = await sendAllPushNotifications(alerts, goodNews)

    const sentCount = pushResults.filter(r => r.sent).length
    const failedCount = pushResults.filter(r => !r.sent).length
    console.log(`[INFO] Push results: ${sentCount} sent, ${failedCount} failed`)

    // F2: ALSO send a targeted push per change, segmented on OneSignal tag fav_<id>=1.
    // Users who favorited the beach receive this in ADDITION to the broadcast.
    // OneSignal returns recipients=0 silently when no one matches → no spam.
    let favSent = 0, favRecipientsTotal = 0
    try {
      const favResults = await sendAllFavoriteAlerts(alerts, goodNews)
      favSent = favResults.filter(r => r.sent).length
      favRecipientsTotal = favResults.reduce((s, r) => s + (r.recipients || 0), 0)
      console.log(`[INFO] Favorite-targeted pushes: ${favSent} dispatched, ${favRecipientsTotal} recipient(s) total`)
    } catch (e) {
      console.error(`[ERROR] Favorite alerts failed: ${e.message}`)
    }

    appendLog({
      script: 'send-notifications',
      action: 'notifications-sent',
      alertCount: alerts.length,
      goodNewsCount: goodNews.length,
      pushSent: sentCount,
      pushFailed: failedCount,
      favPushDispatched: favSent,
      favRecipientsTotal,
      changes: [
        ...alerts.map(a => ({ type: 'alert', beach: a.id, from: a.from, to: a.to })),
        ...goodNews.map(g => ({ type: 'good-news', beach: g.id, from: g.from, to: g.to })),
      ],
    })
  }

  // 4. Proactive forecast push (clean tomorrow, weekend outlook, degradation warning)
  try {
    const forecastResults = await sendProactiveForecastPush(sargassum)
    const forecastSent = forecastResults.filter(r => r.sent).length
    if (forecastSent > 0) {
      console.log(`[FORECAST-PUSH] ${forecastSent} proactive push(es) sent`)
      appendLog({
        script: 'send-notifications',
        action: 'forecast-push-sent',
        count: forecastSent,
        details: forecastResults,
      })
    }
  } catch (e) {
    console.error(`[ERROR] Forecast push failed: ${e.message}`)
  }

  // 5. Weekly email digest (only on Mondays) — legacy MQ/GP uniquement :
  // on filtre les alertes des nouvelles régions pour ne pas polluer le digest.
  try {
    const legacyAlerts = alerts.filter(a => a.island === 'mq' || a.island === 'gp')
    const legacyGoodNews = goodNews.filter(g => g.island === 'mq' || g.island === 'gp')
    const digestResult = await sendWeeklyDigest(currentLevels, legacyAlerts, legacyGoodNews)
    if (digestResult.sent) {
      appendLog({
        script: 'send-notifications',
        action: 'weekly-digest-sent',
        mqStatus: digestResult.mqStatus,
        gpStatus: digestResult.gpStatus,
      })
    }
  } catch (e) {
    console.error(`[ERROR] Weekly digest failed: ${e.message}`)
  }

  console.log('[DONE] send-notifications.cjs complete.')
}

main().catch((e) => {
  console.error(`[FATAL] Unhandled error: ${e.message}`)
  console.error(e.stack)
  // Never exit with error code — continue-on-error in CI
  appendLog({ script: 'send-notifications', action: 'fatal-error', error: e.message })
})

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

/** Determine island from beach id: gp- prefix = GP, otherwise MQ */
function getIsland(beachId) {
  return beachId.startsWith('gp-') ? 'gp' : 'mq'
}

/** Human-readable status label in French */
function statusLabel(status) {
  if (status === 'clean') return 'propre'
  if (status === 'moderate') return 'modere'
  if (status === 'avoid') return 'a eviter'
  return status
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

    const curStatus = beach.status
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
    const msg = `\u26a0\ufe0f ${a.name} passe en ${statusLabel(a.to)}. Vois les alternatives sur la carte.`
    const res = await sendPushNotification(a.island, msg, `Sargasses ${a.island === 'gp' ? 'Guadeloupe' : 'Martinique'} \u2014 Alerte`)
    results.push({ type: 'alert', beach: a.id, island: a.island, message: msg, ...res })
  }

  for (const g of goodNews) {
    const msg = `\u2705 ${g.name} est propre ! Parfait pour ce weekend.`
    const res = await sendPushNotification(g.island, msg, `${g.name} est propre \u2705`)
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
  if (!sargassum.weekly) {
    console.log('[FORECAST-PUSH] No weekly forecast data — skipping.')
    return []
  }

  const results = []
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=Sun, 5=Fri
  const MIN_CONFIDENCE = 40

  // Group forecast improvements/degradations by island
  const improvements = { mq: [], gp: [] }
  const degradations = { mq: [], gp: [] }

  for (const [beachId, data] of Object.entries(sargassum.weekly)) {
    if (!data.forecast || data.forecast.length < 2) continue

    const today = data.forecast[0]
    const tomorrow = data.forecast[1]
    if (!today || !tomorrow || tomorrow.confidence < MIN_CONFIDENCE) continue

    const island = beachId.startsWith('gp-') ? 'gp' : 'mq'
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

  // Send "clean tomorrow" push (max 1 per island)
  for (const island of ['mq', 'gp']) {
    if (improvements[island].length > 0) {
      const count = improvements[island].length
      const names = improvements[island].slice(0, 3).join(', ')
      const msg = count === 1
        ? `\u2600\ufe0f ${names} sera propre demain ! Previsions satellite.`
        : `\u2600\ufe0f ${count} plages propres demain : ${names}${count > 3 ? '...' : ''}. Vois la carte.`
      const res = await sendPushNotification(island, msg, 'Bonne nouvelle demain')
      results.push({ type: 'forecast-improvement', island, count, ...res })
    }

    if (degradations[island].length > 0) {
      const count = degradations[island].length
      const names = degradations[island].slice(0, 3).join(', ')
      const msg = count === 1
        ? `\u26a0\ufe0f ${names} risque de se degrader demain. Verifie avant d'y aller.`
        : `\u26a0\ufe0f ${count} plages a surveiller demain : ${names}${count > 3 ? '...' : ''}. Vois les alternatives.`
      const res = await sendPushNotification(island, msg, 'Prevision sargasses')
      results.push({ type: 'forecast-degradation', island, count, ...res })
    }
  }

  // Friday: Weekend outlook push
  if (dayOfWeek === 5) {
    for (const island of ['mq', 'gp']) {
      const islandName = island === 'gp' ? 'Guadeloupe' : 'Martinique'
      let cleanWeekend = 0

      for (const [beachId, data] of Object.entries(sargassum.weekly)) {
        if ((beachId.startsWith('gp-') ? 'gp' : 'mq') !== island) continue
        if (!data.forecast || data.forecast.length < 3) continue

        // Check Saturday (index 1) and Sunday (index 2) — relative to Friday
        const sat = data.forecast[1]
        const sun = data.forecast[2]
        if (sat && sat.status === 'clean' && sun && sun.status === 'clean') {
          cleanWeekend++
        }
      }

      if (cleanWeekend > 0) {
        const msg = `\ud83c\udfd6\ufe0f Ce weekend : ${cleanWeekend} plages propres en ${islandName}. Planifie ta sortie !`
        const res = await sendPushNotification(island, msg, `Weekend en ${islandName}`)
        results.push({ type: 'weekend-outlook', island, cleanWeekend, ...res })
      }
    }
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
  console.log('=== send-notifications.cjs ===')
  console.log(`Date: ${new Date().toISOString()}`)

  // 1. Read data
  const sargassum = readJSON(SARGASSUM_PATH)
  const history = readJSON(HISTORY_PATH)

  if (!sargassum || !sargassum.levels) {
    console.error('[ERROR] sargassum.json missing or invalid — aborting.')
    appendLog({ script: 'send-notifications', action: 'error', error: 'sargassum.json missing or invalid' })
    return
  }

  const currentLevels = sargassum.levels

  // 2. Detect changes
  const { alerts, goodNews } = detectChanges(currentLevels, history)

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

    appendLog({
      script: 'send-notifications',
      action: 'notifications-sent',
      alertCount: alerts.length,
      goodNewsCount: goodNews.length,
      pushSent: sentCount,
      pushFailed: failedCount,
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

  // 5. Weekly email digest (only on Mondays)
  try {
    const digestResult = await sendWeeklyDigest(currentLevels, alerts, goodNews)
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

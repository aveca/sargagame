/**
 * push-winback.cjs — RÉ-ENGAGEMENT PUSH des dormants (le seul canal sans lifecycle).
 *
 * Pourquoi : l'email a une couche win-back complète, mais le push OneSignal est 100 %
 * event-driven (changement de statut / forecast). En saison calme une plage favorite
 * reste verte des semaines → zéro push → l'utilisateur ne rouvre plus → l'asset le plus
 * collant (la PWA installée) meurt. Ce script réveille les installés dormants.
 *
 * Cible = tag `sg_last_seen` (jour epoch entier, posé à chaque ouverture par
 * Sargasses_PROD.jsx). On pousse aux users dont sg_last_seen < aujourd'hui − DORMANT_DAYS.
 * (Pas de filtre premium : un premium dormant est AUSSI un bon rappel ; la copy est
 * value-first, jamais de fausse urgence.)
 *
 * HOLD/dry-run par DÉFAUT (doctrine maison) : n'ENVOIE QU'AVEC `--send`. Sinon imprime
 * ce qu'il enverrait. Cadence anti-spam : ≤1 push / région / CADENCE_DAYS (marqueur
 * data/push-winback-sent.json). Ne crashe jamais.
 *
 * Usage : `node scripts/automation/push-winback.cjs`         (dry-run)
 *         `node scripts/automation/push-winback.cjs --send`  (envoi réel, en CI)
 *
 * Secrets : ONESIGNAL_API_KEY_MQ / _GP (GH Actions). Absents → skip propre.
 */

const fs = require('fs')
const path = require('path')
const https = require('https')

const SEND = process.argv.includes('--send')
const DORMANT_DAYS = parseInt(process.env.WINBACK_DORMANT_DAYS || '12', 10) // ≥12 j sans ouvrir
const CADENCE_DAYS = parseInt(process.env.WINBACK_CADENCE_DAYS || '14', 10) // ≤1 push / 2 sem.
const MARKER_PATH = path.join(__dirname, 'data', 'push-winback-sent.json')

// Mirror de ONESIGNAL_APPS (send-notifications.cjs). Copy value-first, honnête (aucune
// affirmation « c'est propre » non vérifiée → moat) : on invite à VÉRIFIER, pas on promet.
const APPS = {
  mq: {
    appId: 'd628363e-efc7-4d27-8d1b-fa25fe3bacc9',
    apiKey: process.env.ONESIGNAL_API_KEY_MQ || '',
    heading: 'Sargasses Martinique',
    url: 'https://sargasses-martinique.com/',
    msg: 'La mer a peut-être changé depuis ta dernière visite — vois où elle est propre aujourd’hui.',
  },
  gp: {
    appId: 'f9adee80-8909-48d3-8517-95f9f311d164',
    apiKey: process.env.ONESIGNAL_API_KEY_GP || '',
    heading: 'Sargasses Guadeloupe',
    url: 'https://sargasses-guadeloupe.com/',
    msg: 'La mer a peut-être changé depuis ta dernière visite — vois où elle est propre aujourd’hui.',
  },
}

function httpsPost(url, body, headers) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url)
      const postData = JSON.stringify(body)
      const opts = {
        hostname: parsed.hostname, port: 443, path: parsed.pathname + parsed.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), ...headers },
      }
      const req = https.request(opts, (res) => {
        let data = ''
        res.on('data', (c) => { data += c })
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
      req.on('error', (e) => resolve({ status: 0, body: e.message }))
      req.setTimeout(15000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
      req.write(postData); req.end()
    } catch (e) { resolve({ status: 0, body: e.message }) }
  })
}

function readMarker() { try { return JSON.parse(fs.readFileSync(MARKER_PATH, 'utf8')) } catch (_) { return {} } }
function writeMarker(m) { try { fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true }); fs.writeFileSync(MARKER_PATH, JSON.stringify(m, null, 2)) } catch (_) {} }

async function main() {
  const todayDay = Math.floor(Date.now() / 86400000)
  const cutoff = todayDay - DORMANT_DAYS
  const marker = readMarker()
  const nowMs = Date.now()
  console.log(`[winback] mode=${SEND ? 'SEND' : 'DRY-RUN'} · dormant>=${DORMANT_DAYS}j (sg_last_seen<${cutoff}) · cadence=${CADENCE_DAYS}j`)

  for (const [id, cfg] of Object.entries(APPS)) {
    if (!cfg.apiKey) { console.log(`[winback] ${id.toUpperCase()} — pas de clé API → skip`); continue }
    const last = marker[id] ? Date.parse(marker[id]) : 0
    if (last && (nowMs - last) < CADENCE_DAYS * 86400000) {
      const daysAgo = Math.round((nowMs - last) / 86400000)
      console.log(`[winback] ${id.toUpperCase()} — dernier envoi il y a ${daysAgo}j < ${CADENCE_DAYS}j → skip (cadence)`) ; continue
    }
    // Filtre OneSignal : dormants uniquement. sg_last_seen est un entier (jour epoch).
    const payload = {
      app_id: cfg.appId,
      filters: [{ field: 'tag', key: 'sg_last_seen', relation: '<', value: String(cutoff) }],
      contents: { en: cfg.msg, fr: cfg.msg },
      headings: { en: cfg.heading, fr: cfg.heading },
      url: cfg.url,
    }
    if (!SEND) {
      console.log(`[winback] ${id.toUpperCase()} DRY-RUN — enverrait :`, JSON.stringify(payload.filters), `“${cfg.msg}”`)
      continue
    }
    const res = await httpsPost('https://onesignal.com/api/v1/notifications', payload, { Authorization: `Key ${cfg.apiKey}` })
    if (res.status === 200 || res.status === 201) {
      console.log(`[winback] ${id.toUpperCase()} OK (${res.status}) ${res.body}`)
      marker[id] = new Date(nowMs).toISOString()
      writeMarker(marker)
    } else {
      console.error(`[winback] ${id.toUpperCase()} ÉCHEC (${res.status}) ${res.body}`)
    }
  }
  console.log('[winback] terminé.')
}

main().catch((e) => { console.error('[winback] erreur non fatale :', e && e.message); process.exit(0) })

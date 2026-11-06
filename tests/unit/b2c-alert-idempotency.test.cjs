#!/usr/bin/env node
'use strict'
/**
 * P0.46 §6 — IDEMPOTENCE DURABLE des alertes B2C.
 *
 * Un abonné ne doit jamais recevoir deux fois la meme alerte pour la meme
 * observation satellite. Le marqueur de livraison est une LIGNE en base
 * (cle primaire subscription_id + observation_ts + beaches_hash) reclamee
 * de façon ATOMIQUE via public.sg_claim_b2c_alert_delivery(...).
 *
 * Ces tests n'utilisent QUE des fixtures :
 *   • aucun abonné réel, aucune donnée de production ;
 *   • aucun email réel : le `fetch` est intercepté en mode STRICT (tout hote
 *     hors allowlist — et tout provider d'email réel — fait ECHOUER le test) ;
 *   • aucun SMTP : le code du Worker ne contient aucune socket SMTP (garde
 *     statique) ;
 *   • public.b2c_alerts n'est JAMAIS écrit (le mock le refuse).
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  createEnv,
  jsonResponse,
  installStrictFetch,
  createB2cDeliveryMarkerStore
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const MIGRATION_PATH = path.join(__dirname, '..', '..', 'scripts', 'migrations', '005_b2c_alert_delivery_markers.sql')
const EMAIL_PATH = '/send-email.php'
const ALLOWED_HOSTS = ['supabase.test', 'sargasses-martinique.com']
const FORBIDDEN_EMAIL_HOSTS = [
  'api.resend.com',
  'api.sendpulse.com',
  'api.brevo.com',
  'api.namecheap.com',
  'email.smtp2go.com',
  'smtp.gmail.com',
  'smtp.office365.com'
]
let assertions = 0
function ok(condition, message) {
  assertions++
  assert.ok(condition, message)
  console.log('OK  ' + message)
}
function observationAt(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
}
function payload(overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: observationAt(5),
    updatedAt: new Date().toISOString(),
    stale: false,
    levels: [{ id: 'grande-anse', status: 'moderate' }],
    weekly: {
      'grande-anse': { forecast: [{ date: '2026-11-06', status: 'moderate' }, { date: '2026-11-07', status: 'high' }] }
    },
    ...overrides
  }
}
function subscriber(overrides = {}) {
  return {
    id: 'subscription-idem-1',
    email: 'traveler@example.com',
    region: 'mq',
    domain: 'sargasses-martinique.com',
    beaches: ['grande-anse'],
    status: 'active',
    unsubscribe_token: 'unsubscribe-test-token',
    ...overrides
  }
}
/**
 * Execute le cron planifie. Le faux marqueur de livraison rejoue la cle
 * primaire : `markerMode` permet de simuler une base indisponible.
 */
async function runCron(worker, subscriptions, dataPayload, options = {}) {
  const { env } = createEnv()
  const providerCalls = []
  const markerStore = options.markerStore || createB2cDeliveryMarkerStore()
  const markerMode = options.markerMode || 'ok'
  const backend = installStrictFetch(({ url, method, body }) => {
    if (url.startsWith('https://supabase.test/rest/v1/b2c_alerts')) {
      if (method !== 'GET') throw new Error('b2c_alerts must never be written by the alert engine: ' + method)
      return jsonResponse(subscriptions)
    }
    if (url.startsWith('https://supabase.test/rest/v1/rpc/sg_claim_b2c_alert_delivery')) {
      if (markerMode === 'missing') return jsonResponse({ error: 'function does not exist' }, 404)
      if (markerMode === 'error') return jsonResponse({ error: 'database unavailable' }, 500)
      const parsed = body ? JSON.parse(body) : {}
      return jsonResponse(markerStore.claim(parsed))
    }
    if (url.startsWith('https://supabase.test/rest/v1/b2c_alert_deliveries')) return jsonResponse([])
    if (url.startsWith('https://supabase.test/rest/v1/b2b_leads')) return jsonResponse([])
    if (url.endsWith('/api/copernicus/sargassum.json')) return jsonResponse(dataPayload)
    if (url.includes(EMAIL_PATH)) {
      providerCalls.push({ url, body })
      return jsonResponse({ success: true })
    }
    throw new Error('UNEXPECTED outbound request in B2C idempotency test: ' + method + ' ' + url)
  }, { allowedHosts: ALLOWED_HOSTS, forbiddenHosts: FORBIDDEN_EMAIL_HOSTS })
  try {
    const pending = []
    await worker.scheduled({ cron: '0 6,18 * * *' }, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)) } })
    await Promise.all(pending)
    return { providerCalls, markerStore }
  } finally {
    backend.restore()
  }
}
async function main() {
  const worker = (await import(pathToFileURL(WORKER_PATH).href)).default
  const workerSource = fs.readFileSync(WORKER_PATH, 'utf8')

  // ── Garde statique : aucun client SMTP / socket dans le Worker ────────────
  ok(!/require\(["']net["']\)|require\(["']tls["']\)|createConnection\(|node:net|node:tls/.test(workerSource),
    'the Worker contains no SMTP/socket client (only HTTP fetch providers)')
  ok(!/smtp:\/\//i.test(workerSource) && !/nodemailer/i.test(workerSource),
    'the Worker contains no SMTP transport (all providers are HTTP endpoints)')

  // ── 1. Deux executions de la MEME observation => UNE seule notification ───
  {
    const markerStore = createB2cDeliveryMarkerStore()
    const sameObservation = payload({ erddapTimestamp: observationAt(5) })
    const first = await runCron(worker, [subscriber()], sameObservation, { markerStore })
    const second = await runCron(worker, [subscriber()], sameObservation, { markerStore })
    ok(first.providerCalls.length === 1, 'first run sends exactly one notification')
    ok(second.providerCalls.length === 0, 'replaying the SAME observation sends zero additional notification (duplicate suppressed)')
    ok(markerStore.claims.length === 2, 'the delivery marker is claimed on both runs (the second claim is the duplicate)')
    ok(markerStore.claims[0].key === markerStore.claims[1].key, 'the duplicate is detected on the exact same (subscription, observation, beaches) key')
    ok(!markerStore.claims[0].p_subscription_id.includes('@'), 'the delivery marker stores no email address')
  }

  // ── 2. Une NOUVELLE observation => une nouvelle notification (autorisee) ──
  {
    const markerStore = createB2cDeliveryMarkerStore()
    await runCron(worker, [subscriber()], payload({ erddapTimestamp: observationAt(5) }), { markerStore })
    const second = await runCron(worker, [subscriber()], payload({ erddapTimestamp: observationAt(300) }), { markerStore })
    ok(second.providerCalls.length === 1, 'a NEW observation (still within the 900 min SLA) sends one new notification')
    ok(markerStore.keys.size === 2, 'each observation owns a distinct delivery marker')
  }

  // ── 3. Marqueur INDISPONIBLE => fail-closed, ZERO envoi ──────────────────
  {
    const errored = await runCron(worker, [subscriber()], payload(), { markerMode: 'error' })
    ok(errored.providerCalls.length === 0, 'a delivery-marker database error sends zero email (fail-closed)')
    const missing = await runCron(worker, [subscriber()], payload(), { markerMode: 'missing' })
    ok(missing.providerCalls.length === 0, 'a missing delivery-marker migration sends zero email (fail-closed, no duplicate possible)')
  }

  // ── 4. Le marqueur est exige AVANT l'envoi (pas de KV best-effort) ────────
  {
    const order = []
    const { env } = createEnv()
    const backend = installStrictFetch(({ url, method }) => {
      if (url.startsWith('https://supabase.test/rest/v1/b2c_alerts')) return jsonResponse([subscriber()])
      if (url.startsWith('https://supabase.test/rest/v1/rpc/sg_claim_b2c_alert_delivery')) {
        order.push('claim')
        return jsonResponse(true)
      }
      if (url.startsWith('https://supabase.test/rest/v1/b2c_alert_deliveries')) {
        order.push('mark')
        return jsonResponse([])
      }
      if (url.startsWith('https://supabase.test/rest/v1/b2b_leads')) return jsonResponse([])
      if (url.endsWith('/api/copernicus/sargassum.json')) return jsonResponse(payload())
      if (url.includes(EMAIL_PATH)) {
        order.push('email')
        return jsonResponse({ success: true })
      }
      throw new Error('UNEXPECTED outbound request: ' + method + ' ' + url)
    }, { allowedHosts: ALLOWED_HOSTS, forbiddenHosts: FORBIDDEN_EMAIL_HOSTS })
    try {
      const pending = []
      await worker.scheduled({ cron: '0 6,18 * * *' }, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)) } })
      await Promise.all(pending)
    } finally {
      backend.restore()
    }
    ok(order.indexOf('claim') < order.indexOf('email'), 'the durable delivery marker is claimed BEFORE the email is sent')
    ok(order.indexOf('claim') >= 0 && order.indexOf('email') >= 0, 'the run claimed a marker and sent the notification')
  }

  // ── 5. La migration preparee existe et reste NON APPLIQUEE ───────────────
  {
    ok(fs.existsSync(MIGRATION_PATH), 'the prepared delivery-marker migration exists')
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
    ok(/NON APPLIQU/i.test(sql), 'the migration is explicitly marked as NOT applied')
    ok(/ON CONFLICT \(subscription_id, observation_ts, beaches_hash\) DO NOTHING/.test(sql), 'the marker claim is atomic (ON CONFLICT DO NOTHING on the primary key)')
    ok(/CREATE TABLE IF NOT EXISTS public\.b2c_alert_deliveries/.test(sql), 'the delivery markers live in a dedicated table')
    ok(!/UPDATE\s+public\.b2c_alerts|DELETE\s+FROM\s+public\.b2c_alerts/i.test(sql), 'the migration never modifies the existing subscription records')
  }

  // ── 6. Le moteur d'alertes n'ecrit JAMAIS dans b2c_alerts ────────────────
  {
    const writes = []
    const { env } = createEnv()
    const backend = installStrictFetch(({ url, method }) => {
      if (url.startsWith('https://supabase.test/rest/v1/b2c_alerts')) {
        if (method !== 'GET') writes.push(method + ' ' + url)
        return jsonResponse([subscriber()])
      }
      if (url.startsWith('https://supabase.test/rest/v1/rpc/sg_claim_b2c_alert_delivery')) return jsonResponse(true)
      if (url.startsWith('https://supabase.test/rest/v1/b2c_alert_deliveries')) return jsonResponse([])
      if (url.startsWith('https://supabase.test/rest/v1/b2b_leads')) return jsonResponse([])
      if (url.endsWith('/api/copernicus/sargassum.json')) return jsonResponse(payload())
      if (url.includes(EMAIL_PATH)) return jsonResponse({ success: true })
      throw new Error('UNEXPECTED outbound request: ' + method + ' ' + url)
    }, { allowedHosts: ALLOWED_HOSTS, forbiddenHosts: FORBIDDEN_EMAIL_HOSTS })
    try {
      const pending = []
      await worker.scheduled({ cron: '0 6,18 * * *' }, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)) } })
      await Promise.all(pending)
    } finally {
      backend.restore()
    }
    ok(writes.length === 0, 'the alert engine performs zero write on the subscription table (b2c_alerts)')
  }

  console.log('\nB2C_ALERT_IDEMPOTENCY_TESTS PASS (' + assertions + ' assertions)')
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})

#!/usr/bin/env node
'use strict'
/**
 * B2C alert regression tests.
 * All email providers are mocked; no real subscriber data or email delivery is used.
 */
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  createEnv,
  jsonResponse,
  installFetch,
  installStrictFetch,
  createB2cDeliveryMarkerStore
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const EMAIL_PATH = '/send-email.php'
// Hotes INTERDITS : un test qui les touche doit ECHOUER (aucun email reel,
// aucun service externe ne doit etre contacte).
const FORBIDDEN_EMAIL_HOSTS = [
  'api.resend.com',
  'api.sendpulse.com',
  'api.brevo.com',
  'api.namecheap.com',
  'email.smtp2go.com',
  'smtp.gmail.com',
  'smtp.office365.com'
]
const ALLOWED_HOSTS = ['supabase.test', 'sargasses-martinique.com']
let assertions = 0
function ok(condition, message) {
  assertions++
  assert.ok(condition, message)
  console.log('OK  ' + message)
}
function freshPayload(overrides = {}) {
  return {
    source: 'erddap-live',
    erddapTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    stale: false,
    levels: [{ id: 'grande-anse', status: 'moderate' }],
    weekly: {
      'not-selected': { forecast: [{ date: '2026-11-06', status: 'avoid' }, { date: '2099-12-31', status: 'avoid' }] },
      'grande-anse': { forecast: [{ date: '2026-11-06', status: 'moderate' }, { date: '2026-11-07', status: 'high' }] }
    },
    ...overrides
  }
}
function subscriber(overrides = {}) {
  return {
    id: 'subscription-test-1',
    email: 'traveler@example.com',
    region: 'mq',
    domain: 'sargasses-martinique.com',
    beaches: ['grande-anse'],
    status: 'active',
    unsubscribe_token: 'unsubscribe-test-token',
    ...overrides
  }
}
async function runScheduled(worker, subscriptions, payload, options = {}) {
  const { env } = createEnv()
  const providerCalls = []
  const apiCalls = []
  const markerStore = options.markerStore || createB2cDeliveryMarkerStore()
  const markerMode = options.markerMode || 'ok' // ok | error | missing
  const backend = installStrictFetch(({ url, method, body }) => {
    if (url.startsWith('https://supabase.test/rest/v1/b2c_alerts')) {
      if (method !== 'GET') throw new Error('b2c_alerts must never be written by the alert engine: ' + method)
      return jsonResponse(subscriptions)
    }
    if (url.startsWith('https://supabase.test/rest/v1/rpc/sg_claim_b2c_alert_delivery')) {
      if (markerMode === 'missing') return jsonResponse({ error: 'function not found' }, 404)
      if (markerMode === 'error') return jsonResponse({ error: 'database unavailable' }, 500)
      const parsed = body ? JSON.parse(body) : {}
      return jsonResponse(markerStore.claim(parsed))
    }
    if (url.startsWith('https://supabase.test/rest/v1/b2c_alert_deliveries')) return jsonResponse([])
    if (url.startsWith('https://supabase.test/rest/v1/b2b_leads')) return jsonResponse([])
    if (url.endsWith('/api/copernicus/sargassum.json')) {
      apiCalls.push(url)
      return jsonResponse(payload)
    }
    if (url.includes(EMAIL_PATH)) {
      providerCalls.push({ url, body })
      return jsonResponse({ success: true })
    }
    throw new Error('UNEXPECTED outbound request in B2C alert test: ' + method + ' ' + url)
  }, { allowedHosts: ALLOWED_HOSTS, forbiddenHosts: FORBIDDEN_EMAIL_HOSTS })
  try {
    const pending = []
    await worker.scheduled({ cron: '0 6,18 * * *' }, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)) } })
    await Promise.all(pending)
    return { providerCalls, apiCalls, markerStore }
  } finally {
    backend.restore()
  }
}
async function main() {
  const worker = (await import(pathToFileURL(WORKER_PATH).href)).default

  // The current production table's active rows have empty or NULL beach arrays.
  {
    const rows = Array.from({ length: 234 }, (_, i) => subscriber({ id: 'active-' + i, beaches: [] }))
    const result = await runScheduled(worker, rows, freshPayload())
    ok(result.providerCalls.length === 0, '234 active subscribers with empty beach filters produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber({ beaches: null })], freshPayload())
    ok(result.providerCalls.length === 0, 'NULL beach filters produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber({ beaches: ['unknown-beach-id'] })], freshPayload())
    ok(result.providerCalls.length === 0, 'unknown beach IDs produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber({ region: null })], freshPayload())
    ok(result.providerCalls.length === 0, 'missing region produces zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({ stale: true }))
    ok(result.providerCalls.length === 0, 'stale observations produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({
      erddapTimestamp: new Date(Date.now() + 60 * 1000).toISOString()
    }))
    ok(result.providerCalls.length === 0, 'future observation timestamps produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({ erddapTimestamp: 'not-a-timestamp' }))
    ok(result.providerCalls.length === 0, 'invalid observation timestamps produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber({ domain: 'localhost', region: 'unknown' })], freshPayload())
    ok(result.providerCalls.length === 0, 'unknown region and localhost domain produce zero email-provider calls')
  }
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({
      levels: [{ id: 'grande-anse', status: 'clean' }]
    }))
    ok(result.providerCalls.length === 0, 'clean selected beaches produce zero email-provider calls')
  }
  // P0.46 §3 — seule une observation au NIVEAU DE PLAGE peut notifier :
  // une plage presente uniquement dans `weekly` (sans entree dans `levels`)
  // ne produit aucune alerte.
  {
    const result = await runScheduled(worker, [subscriber({ beaches: ['weekly-only-beach'] })], freshPayload({
      levels: [{ id: 'grande-anse', status: 'moderate' }],
      weekly: {
        'weekly-only-beach': { forecast: [{ date: '2026-11-07', status: 'avoid' }] },
        'grande-anse': { forecast: [{ date: '2026-11-07', status: 'moderate' }] }
      }
    }))
    ok(result.providerCalls.length === 0, 'a beach present only in weekly (no beach-level observation) produces zero email-provider calls')
  }
  // P0.46 §4 — `stale` absent => traite comme stale (fail-closed).
  {
    const payload = freshPayload()
    delete payload.stale
    const result = await runScheduled(worker, [subscriber()], payload)
    ok(result.providerCalls.length === 0, 'a payload without the stale flag produces zero email-provider calls')
  }
  // P0.46 §4 — `updatedAt` n'est JAMAIS un substitut de `erddapTimestamp`.
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({
      erddapTimestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      dataAgeMinutes: 1
    }))
    ok(result.providerCalls.length === 0, 'a fresh updatedAt/dataAgeMinutes never substitutes an old erddapTimestamp (zero email-provider calls)')
  }
  // P0.46 §4 — `dataAgeMinutes` stocke n'est JAMAIS un substitut non plus.
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload({ dataAgeMinutes: 999999 }))
    ok(result.providerCalls.length === 1, 'a fresh erddapTimestamp is authoritative even when the stored dataAgeMinutes is absurd')
  }
  {
    const result = await runScheduled(worker, [subscriber()], freshPayload())
    ok(result.providerCalls.length === 1, 'fresh observation and one exact selected beach alert produce exactly one mocked notification')
    const body = String(result.providerCalls[0].body || '')
    ok(body.includes('2026-11-07'), 'email forecast uses the weekly entry for the selected beach ID')
    ok(!body.includes('2099-12-31'), 'email forecast never falls back to the first unrelated weekly key')
  }
  {
    const { env } = createEnv()
    let scheduledWorkStarted = false
    const backend = installFetch(() => {
      scheduledWorkStarted = true
      return jsonResponse([])
    })
    try {
      const response = await worker.fetch(new Request('https://sargasses-martinique.com/_cron/b2c'), env, {
        waitUntil() { scheduledWorkStarted = true }
      })
      ok(response.status === 404, 'unauthenticated manual /_cron/b2c invocation is denied')
      ok(!scheduledWorkStarted, 'denied manual cron invocation performs no Supabase or email work')
    } finally {
      backend.restore()
    }
  }
  console.log('\\nB2C_ALERT_FAIL_CLOSED_TESTS PASS (' + assertions + ' assertions)')
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})

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
  installFetch
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const EMAIL_PATH = '/send-email.php'
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
async function runScheduled(worker, subscriptions, payload) {
  const { env } = createEnv()
  const providerCalls = []
  const apiCalls = []
  const backend = installFetch(({ url, method, body }) => {
    if (url.startsWith('https://supabase.test/rest/v1/b2c_alerts')) return jsonResponse(subscriptions)
    if (url.startsWith('https://supabase.test/rest/v1/b2b_leads')) return jsonResponse([])
    if (url.endsWith('/api/copernicus/sargassum.json')) {
      apiCalls.push(url)
      return jsonResponse(payload)
    }
    if (url.includes(EMAIL_PATH)) {
      providerCalls.push({ url, body })
      return jsonResponse({ success: true })
    }
    if (url.startsWith('https://api.resend.com/emails') || url.includes('sendpulse') || url.includes('brevo')) {
      providerCalls.push({ url, body })
      return jsonResponse({ success: true })
    }
    return jsonResponse({ error: 'unexpected test request' }, 404)
  })
  try {
    const pending = []
    await worker.scheduled({ cron: '0 6,18 * * *' }, env, { waitUntil(promise) { pending.push(Promise.resolve(promise)) } })
    await Promise.all(pending)
    return { providerCalls, apiCalls }
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

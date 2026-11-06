'use strict'

const assert = require('node:assert/strict')
const worker = require('../../workers/sg-payments/index.js')
const { createEnv, jsonResponse, installFetch } = require('./mollie-worker-harness.cjs')

function lead(overrides = {}) {
  return {
    id: 'lead-test-001',
    email: 'buyer@example.test',
    domain: 'sargazotulum.com',
    region: 'tulum',
    status: 'new',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    contacted_at: null,
    claimed_at: null,
    contact_attempts: 0,
    ...overrides
  }
}

function setup(options = {}) {
  const state = {
    lead: lead(options.lead),
    emails: [],
    failClaim: Boolean(options.failClaim),
    failPersist: Boolean(options.failPersist),
    providerSuccess: options.providerSuccess !== false
  }
  const fetcher = installFetch(async ({ url, method, body }) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'supabase.test' && parsed.pathname.endsWith('/b2b_leads')) {
      const statusFilter = parsed.searchParams.get('status') || ''
      if (method === 'GET') {
        if (statusFilter === 'eq.processing') {
          const claimFilter = parsed.searchParams.get('claimed_at') || ''
          const cutoff = claimFilter.startsWith('lt.') ? claimFilter.slice(3) : null
          const stale = state.lead.status === 'processing' && cutoff &&
            Date.parse(state.lead.claimed_at || '') < Date.parse(cutoff)
          return jsonResponse(stale ? [{ id: state.lead.id, claimed_at: state.lead.claimed_at }] : [])
        }
        if (statusFilter === 'eq.new') {
          return jsonResponse(state.lead.status === 'new' ? [state.lead] : [])
        }
      }
      if (method === 'PATCH') {
        const idFilter = parsed.searchParams.get('id') || ''
        if (idFilter !== 'eq.' + state.lead.id) return jsonResponse([], 200)
        const patch = JSON.parse(body || '{}')
        if (statusFilter === 'eq.new') {
          if (state.failClaim) return jsonResponse({ error: 'claim failed' }, 500)
          if (state.lead.status !== 'new') return jsonResponse([], 200)
          Object.assign(state.lead, patch)
          return jsonResponse([state.lead], 200)
        }
        if (statusFilter === 'eq.processing') {
          if (state.failPersist && patch.status === 'contacted') return jsonResponse({ error: 'persistence failed' }, 500)
          if (state.lead.status !== 'processing') return jsonResponse([], 200)
          const claimFilter = parsed.searchParams.get('claimed_at') || ''
          if (claimFilter.startsWith('eq.') && claimFilter.slice(3) !== state.lead.claimed_at) return jsonResponse([], 200)
          if (claimFilter.startsWith('lt.') && !(Date.parse(state.lead.claimed_at || '') < Date.parse(claimFilter.slice(3)))) return jsonResponse([], 200)
          Object.assign(state.lead, patch)
          return jsonResponse([state.lead], 200)
        }
      }
      return jsonResponse([], 200)
    }
    if (parsed.pathname.endsWith('/send-email.php')) {
      state.emails.push(JSON.parse(body || '{}'))
      return state.providerSuccess
        ? jsonResponse({ success: true }, 200)
        : jsonResponse({ success: false, error: 'provider rejected' }, 500)
    }
    return jsonResponse({}, 200)
  })
  return { state, fetcher }
}

async function runDrip(env) {
  const pending = []
  await worker.scheduled(
    { cron: '0 0 * * *' },
    env,
    { waitUntil(promise) { pending.push(Promise.resolve(promise)) } }
  )
  await Promise.all(pending)
}

async function captureLogs(fn) {
  const original = console.log
  const lines = []
  console.log = (...args) => lines.push(args.join(' '))
  try { await fn() } finally { console.log = original }
  return lines.join('\n')
}

async function main() {
  // Provider accepted: claim first, then contacted_at only after persistence.
  {
    const { state, fetcher } = setup()
    const { env } = createEnv()
    let logs
    try {
      logs = await captureLogs(() => runDrip(env))
    } finally {
      fetcher.restore()
    }
    assert.equal(state.emails.length, 1)
    assert.equal(state.lead.status, 'contacted')
    assert.ok(state.lead.contacted_at)
    assert.equal(state.lead.claimed_at, null)
    assert.equal(state.lead.contact_attempts, 1)
    assert.doesNotMatch(logs, /buyer@example\.test/i)
  }

  // Concurrent scheduled invocations can claim/send a lead only once.
  {
    const { state, fetcher } = setup()
    const env1 = createEnv().env
    const env2 = createEnv().env
    try {
      await Promise.all([runDrip(env1), runDrip(env2)])
    } finally {
      fetcher.restore()
    }
    assert.equal(state.emails.length, 1)
    assert.equal(state.lead.status, 'contacted')
  }

  // A provider rejection is not retried automatically; it requires review.
  {
    const { state, fetcher } = setup({ providerSuccess: false })
    const { env } = createEnv()
    try { await runDrip(env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 1)
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.lead.contacted_at, null)
    assert.equal(state.lead.claimed_at, null)
    assert.equal(state.lead.last_contact_error, 'provider_delivery_unconfirmed')
  }

  // If the provider accepted but DB persistence failed, keep the claim;
  // the next run must not resend, and stale claims become manual_review.
  {
    const { state, fetcher } = setup({ failPersist: true })
    const { env } = createEnv()
    try {
      await runDrip(env)
      assert.equal(state.lead.status, 'processing')
      assert.equal(state.emails.length, 1)
      await runDrip(env)
      assert.equal(state.emails.length, 1)
      state.lead.claimed_at = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      await runDrip(env)
    } finally {
      fetcher.restore()
    }
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.emails.length, 1)
  }

  // Failed atomic claim never reaches an email provider.
  {
    const { state, fetcher } = setup({ failClaim: true })
    const { env } = createEnv()
    try { await runDrip(env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 0)
    assert.equal(state.lead.status, 'new')
  }

  // A region/domain mismatch is quarantined instead of using a fallback domain.
  {
    const { state, fetcher } = setup({ lead: { domain: 'sargasses-martinique.com' } })
    const { env } = createEnv()
    try { await runDrip(env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 0)
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.lead.last_contact_error, 'unsupported_region_domain')
  }

  console.log('PASS: B2B drip atomic claim and durable contact state (6 scenarios)')
}

main().catch((error) => { console.error(error); process.exit(1) })

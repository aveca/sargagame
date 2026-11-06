'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
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
    fallbackCalls: 0,
    fallbackEmails: 0,
    ambiguousProvider: Boolean(options.ambiguousProvider),
    rejectNamecheap: Boolean(options.rejectNamecheap),
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
      if (state.ambiguousProvider) throw new TypeError('network timeout after provider acceptance')
      if (state.rejectNamecheap) return jsonResponse({ error: 'unauthorized' }, 401)
      return state.providerSuccess
        ? jsonResponse({ success: true }, 200)
        : jsonResponse({ success: false, error: 'provider response unavailable' }, 500)
    }
    if (parsed.hostname === 'api.sendpulse.com') {
      state.fallbackCalls++
      if (parsed.pathname.endsWith('/oauth/access_token')) return jsonResponse({ access_token: 'test-sendpulse-token' }, 200)
      if (parsed.pathname.endsWith('/smtp/emails')) {
        state.fallbackEmails++
        return jsonResponse({ success: true }, 200)
      }
    }
    return jsonResponse({}, 200)
  })
  return { state, fetcher }
}

async function runDrip(worker, env) {
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
  const worker = (await import(pathToFileURL(WORKER_PATH).href)).default
  // Provider accepted: claim first, then contacted_at only after persistence.
  {
    const { state, fetcher } = setup()
    const { env } = createEnv()
    let logs
    try {
      logs = await captureLogs(() => runDrip(worker, env))
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
      await Promise.all([runDrip(worker, env1), runDrip(worker, env2)])
    } finally {
      fetcher.restore()
    }
    assert.equal(state.emails.length, 1)
    assert.equal(state.lead.status, 'contacted')
  }

  // A provider 5xx is ambiguous: stop fallback and require manual review.
  {
    const { state, fetcher } = setup({ providerSuccess: false })
    const { env } = createEnv()
    try { await runDrip(worker, env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 1)
    assert.equal(state.fallbackCalls, 0)
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.lead.contacted_at, null)
    assert.equal(state.lead.claimed_at, null)
    assert.equal(state.lead.last_contact_error, 'provider_delivery_unconfirmed')
  }

  // A network timeout after the provider may have accepted must never trigger
  // a second provider. The lead is quarantined for manual reconciliation.
  {
    const { state, fetcher } = setup({ ambiguousProvider: true })
    const { env } = createEnv()
    try { await runDrip(worker, env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 1)
    assert.equal(state.fallbackCalls, 0)
    assert.equal(state.fallbackEmails, 0)
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.lead.contacted_at, null)
    assert.equal(state.lead.last_contact_error, 'provider_delivery_unconfirmed')
  }

  // An explicit 4xx rejection is safe to fail over to the next provider.
  {
    const { state, fetcher } = setup({ rejectNamecheap: true })
    const { env } = createEnv()
    try { await runDrip(worker, env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 1)
    assert.equal(state.fallbackCalls, 2)
    assert.equal(state.fallbackEmails, 1)
    assert.equal(state.lead.status, 'contacted')
    assert.ok(state.lead.contacted_at)
  }

  // If the provider accepted but DB persistence failed, keep the claim;
  // the next run must not resend, and stale claims become manual_review.
  {
    const { state, fetcher } = setup({ failPersist: true })
    const { env } = createEnv()
    try {
      await runDrip(worker, env)
      assert.equal(state.lead.status, 'processing')
      assert.equal(state.emails.length, 1)
      await runDrip(worker, env)
      assert.equal(state.emails.length, 1)
      state.lead.claimed_at = new Date(Date.now() - 31 * 60 * 1000).toISOString()
      await runDrip(worker, env)
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
    try { await runDrip(worker, env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 0)
    assert.equal(state.lead.status, 'new')
  }

  // A region/domain mismatch is quarantined instead of using a fallback domain.
  {
    const { state, fetcher } = setup({ lead: { domain: 'sargasses-martinique.com' } })
    const { env } = createEnv()
    try { await runDrip(worker, env) } finally { fetcher.restore() }
    assert.equal(state.emails.length, 0)
    assert.equal(state.lead.status, 'manual_review')
    assert.equal(state.lead.last_contact_error, 'unsupported_region_domain')
  }

  console.log('PASS: B2B drip atomic claim and durable contact state (6 scenarios)')
}

main().catch((error) => { console.error(error); process.exit(1) })

#!/usr/bin/env node
'use strict'
/**
 * p06-idempotency-review.test.cjs — P0.6 revue ciblée du mécanisme
 * d'idempotence de `workers/sg-payments/index.js`.
 *
 * La Worker RÉELLE est importée. Tous les appels Mollie/Supabase sont simulés.
 * Aucune transaction réelle, aucun secret réel.
 *
 * Scénarios couverts : doublon immédiat, +61s, +23h, retry après expiration,
 * concurrence, deux paiements distincts, panne KV, panne grant, interruption
 * grant/marqueur, remboursement, remboursement répété, paiement déjà attribué,
 * et reprise après échec de création Mollie (défaut P0.6).
 */

const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')
const {
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook,
  paidPayment,
  paidSubscription
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const WORKER_PATH = process.env.P06_WORKER_PATH || path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')

function createTtlKv(options = {}) {
  let clock = 0
  const store = new Map()
  for (const [key, value] of Object.entries(options.initial || {})) {
    store.set(key, { value, expiresAt: null })
  }
  const calls = []
  const namespace = {
    async get(key) {
      calls.push({ op: 'get', key })
      const rec = store.get(key)
      if (!rec) return null
      if (rec.expiresAt !== null && clock >= rec.expiresAt) { store.delete(key); return null }
      return rec.value
    },
    async put(key, value, opts) {
      calls.push({ op: 'put', key, value, opts })
      if (options.failPut && options.failPut(key)) throw new Error('KV put simulated failure')
      const ttl = opts && Number(opts.expirationTtl)
      store.set(key, { value, expiresAt: Number.isFinite(ttl) && ttl > 0 ? clock + ttl * 1000 : null })
    },
    async delete(key) {
      calls.push({ op: 'delete', key })
      if (options.failDelete && options.failDelete(key)) throw new Error('KV delete simulated failure')
      store.delete(key)
    }
  }
  return {
    namespace,
    calls,
    puts: () => calls.filter((c) => c.op === 'put'),
    deletes: () => calls.filter((c) => c.op === 'delete'),
    has(key) {
      const rec = store.get(key)
      if (!rec) return false
      if (rec.expiresAt !== null && clock >= rec.expiresAt) { store.delete(key); return false }
      return true
    },
    advance(ms) { clock += ms }
  }
}

function createEnv(kv) {
  return {
    MOLLIE_API_KEY: 'test_api_key',
    MOLLIE_WEBHOOK_SECRET: 'test_webhook_secret',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_service_key',
    NAMECHEAP_MAIL_TOKEN: 'test_namecheap_token',
    TRANSIENTS: kv.namespace
  }
}

function buildBackend(state = {}) {
  const grants = state.grants || []
  const rpcCalls = state.rpcCalls || []
  const patches = state.patches || []
  const created = []
  const unmocked = []
  const backend = installFetch(({ url, method, body }) => {
    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      state.mollieCreateAttempts = (state.mollieCreateAttempts || 0) + 1
      if (state.mollieCreateFailures > 0) {
        state.mollieCreateFailures--
        return jsonResponse({ detail: 'transient failure' }, 502)
      }
      const id = 'tr_created_' + (created.length + 1)
      created.push(id)
      return jsonResponse({ id, status: 'open', _links: { checkout: { href: 'https://pay/' + id } } }, 201)
    }
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      const id = url.split('/v2/payments/')[1]
      const p = (state.payments && state.payments[id]) || state.payment || paidPayment()
      return jsonResponse(p)
    }
    if (url.startsWith('https://api.mollie.com/v2/subscriptions/')) {
      return jsonResponse((state.subscriptions && state.subscriptions[url.split('/').pop()]) || state.subscription || paidSubscription())
    }
    if (url === 'https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant') {
      const args = JSON.parse(body || '{}')
      rpcCalls.push(args)
      if (state.rpcFailures > 0) {
        state.rpcFailures--
        return jsonResponse({ message: 'rpc failure' }, 500)
      }
      if (!grants.some((g) => g.payment_id === args.p_payment_id)) {
        grants.push({
          payment_id: args.p_payment_id,
          type: 'b2c_pass',
          pass: args.p_pass,
          email: args.p_email,
          currency: args.p_currency,
          expires_at: args.p_expires_at,
          granted_at: args.p_granted_at
        })
      }
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://supabase.test/rest/v1/payment_grants')) {
      if (method === 'GET') {
        const q = url.slice(url.indexOf('?'))
        const pid = /payment_id=eq\.([^&]+)/.exec(q)
        const sid = /subscription_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) =>
          (!pid || g.payment_id === decodeURIComponent(pid[1])) &&
          (!sid || g.subscription_id === decodeURIComponent(sid[1])))
        return jsonResponse(rows)
      }
      if (method === 'PATCH') { patches.push(JSON.parse(body || '{}')); return jsonResponse([], 200) }
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/sg_users')) {
      return method === 'GET' ? jsonResponse([]) : jsonResponse([{ id: 'user-1', email: 'v@example.com' }], 201)
    }
    if (url.startsWith('https://supabase.test/rest/v1/')) return jsonResponse([], 200)
    if (url.includes('/send-email.php')) return jsonResponse({ success: true })
    unmocked.push(`${method} ${url}`)
    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants, rpcCalls, patches, created, unmocked }
}

function nextgenBody(eventId, type, entityId, resource = 'payment') {
  return JSON.stringify({ resource, id: eventId, type, entityId })
}

async function runApi(worker, body, env) {
  const ctx = { waitUntil(p) { try { Promise.resolve(p).catch(() => {}) } catch (_) {} } }
  const res = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }), env, ctx)
  let json = null
  try { json = await res.clone().json() } catch (_) { json = null }
  return { status: res.status, json }
}

const CREATE_BODY = {
  action: 'create_payment', pass: 'p30', email: 'v@example.com', source: 'b2c', cents: 1499, cur: 'EUR'
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ── 1. Doublon immédiat ────────────────────────────────────────────────
  {
    const kv = createTtlKv(); const state = {}
    const { backend, grants, rpcCalls } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_dup_now', 'payment.paid', 'tr_dup_now')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 200 && a.json.granted === true, '1 : premier webhook honoré')
    t(b.status === 200 && b.json.duplicate === true, '1 : doublon immédiat détecté')
    t(grants.length === 1 && rpcCalls.length === 1, '1 : un seul grant, un seul RPC')
  }

  // ── 2. Doublon à +61 s ─────────────────────────────────────────────────
  {
    const kv = createTtlKv(); const state = {}
    const { backend, grants, rpcCalls } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_dup_61s', 'payment.paid', 'tr_dup_61s')
    await runWebhook(worker, mkWebhookRequest({ body }), env)
    kv.advance(61 * 1000)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(b.json.duplicate === true, '2 : doublon à +61 s détecté (marqueur webhook TTL 86400)')
    t(grants.length === 1 && rpcCalls.length === 1, '2 : toujours un seul grant')
  }

  // ── 3. Doublon à +23 h ─────────────────────────────────────────────────
  {
    const kv = createTtlKv(); const state = {}
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_dup_23h', 'payment.paid', 'tr_dup_23h')
    await runWebhook(worker, mkWebhookRequest({ body }), env)
    kv.advance(23 * 60 * 60 * 1000)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(b.json.duplicate === true, '3 : doublon à +23 h détecté')
    t(grants.length === 1, '3 : un seul grant')
  }

  // ── 4. Retry après expiration du marqueur webhook (24 h + 1 s) ─────────
  {
    const kv = createTtlKv(); const state = {}
    const { backend, grants, rpcCalls } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_after_ttl', 'payment.paid', 'tr_after_ttl')
    await runWebhook(worker, mkWebhookRequest({ body }), env)
    kv.advance(24 * 60 * 60 * 1000 + 1000)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(b.status === 200 && b.json.granted === true, '4 : retry après expiration -> traité (200 grant)')
    t(grants.length === 1, '4 : pas de second grant durable')
    t(rpcCalls.length === 1, '4 : pas de second RPC (marqueur pass encore valide)')
  }

  // ── 5. Deux notifications concurrentes du même paiement ────────────────
  {
    const kv = createTtlKv(); const state = {}
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_concurrent', 'payment.paid', 'tr_concurrent')
    const [a, b] = await Promise.all([
      runWebhook(worker, mkWebhookRequest({ body }), env),
      runWebhook(worker, mkWebhookRequest({ body }), env)
    ])
    backend.restore()
    t(a.status === 200 && b.status === 200, '5 : les deux notifications répondent 200')
    t(grants.length === 1, '5 : un seul grant malgré la concurrence (idempotence DB)')
  }

  // ── 6. Deux paiements différents du même utilisateur ───────────────────
  {
    const kv = createTtlKv(); const state = {
      payments: {
        tr_user_a: paidPayment({ id: 'tr_user_a' }),
        tr_user_b: paidPayment({ id: 'tr_user_b' })
      }
    }
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)
    await runWebhook(worker, mkWebhookRequest({ body: nextgenBody('evt_user_a', 'payment.paid', 'tr_user_a') }), env)
    await runWebhook(worker, mkWebhookRequest({ body: nextgenBody('evt_user_b', 'payment.paid', 'tr_user_b') }), env)
    backend.restore()
    t(grants.length === 2, '6 : deux paiements distincts -> deux grants')
    t(kv.has('mollie_evt_user_a') && kv.has('mollie_evt_user_b'), '6 : deux marqueurs distincts')
  }

  // ── 7. Échec d'écriture du marqueur KV (après grant) ───────────────────
  {
    const kv = createTtlKv({ failPut: (k) => k.startsWith('mollie_') })
    const state = {}
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_kv_fail', 'payment.paid', 'tr_kv_fail')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 200 && a.json.granted === true, '7 : le grant est délivré malgré l échec du marqueur KV')
    t(grants.length === 1, '7 : un seul grant')
    t(b.status === 200 && b.json.granted === true, '7 : le retry reste honoré (marqueur pass)')
    t(grants.length === 1, '7 : toujours un seul grant après retry')
  }

  // ── 8. Échec d'attribution du grant -> retry possible ──────────────────
  {
    const kv = createTtlKv(); const state = { rpcFailures: 1 }
    const { backend, grants, rpcCalls } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_grant_fail', 'payment.paid', 'tr_grant_fail')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const markerAfterFail = kv.has('mollie_evt_grant_fail')
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 500, '8 : échec du grant -> HTTP 500 (Mollie rejouera)')
    t(markerAfterFail === false, '8 : aucun marqueur posé après échec du grant')
    t(b.status === 200 && b.json.granted === true, '8 : le retry après rétablissement est honoré')
    t(grants.length === 1 && rpcCalls.length === 2, '8 : un grant final, deux tentatives RPC')
  }

  // ── 9. Remboursement puis remboursement répété ────────────────────────
  {
    const kv = createTtlKv({ initial: { mol_b2c_pass_tr_refund_p06: '{"pass":"p30"}' } })
    const state = { payment: paidPayment({ id: 'tr_refund_p06', status: 'refunded', metadata: { source: 'b2c', pass: 'p30', email: 'v@example.com' } }) }
    const { backend, patches } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_refund_p06', 'payment.refunded', 'tr_refund_p06')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 200 && a.json.revoked === true, '9 : remboursement traité')
    t(!kv.has('mol_b2c_pass_tr_refund_p06'), '9 : pass KV supprimé')
    t(b.json.duplicate === true, '9 : remboursement répété détecté comme doublon')
    t(patches.length === 1, '9 : un seul PATCH de révocation')
  }

  // ── 10. Annulation d'abonnement puis répétition ───────────────────────
  {
    const kv = createTtlKv({ initial: { mollie_grant_sub_p06: '{"plan":"pro_monthly"}' } })
    const state = { subscription: paidSubscription({ id: 'sub_p06', status: 'canceled' }) }
    const { backend, patches } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_cancel_p06', 'subscription.canceled', 'sub_p06', 'subscription')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const b = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 200 && a.json.revoked === true, '10 : annulation traitée')
    t(!kv.has('mollie_grant_sub_p06'), '10 : grant KV supprimé')
    t(b.json.duplicate === true, '10 : annulation répétée détectée comme doublon')
    t(patches.length === 1, '10 : un seul PATCH de révocation')
  }

  // ── 11. Paiement déjà attribué avant le retry ─────────────────────────
  {
    const kv = createTtlKv({ initial: { mol_b2c_pass_tr_already: '{"pass":"p30"}' } })
    const state = { payment: paidPayment({ id: 'tr_already' }), grants: [{ payment_id: 'tr_already', type: 'b2c_pass', pass: 'p30', email: 'voyageur@example.com', currency: 'EUR', expires_at: 'x', granted_at: 'y' }] }
    const { backend, grants, rpcCalls } = buildBackend(state)
    const env = createEnv(kv)
    const body = nextgenBody('evt_already', 'payment.paid', 'tr_already')
    const a = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(a.status === 200 && a.json.granted === true, '11 : paiement déjà attribué -> 200 granted')
    t(grants.length === 1, '11 : un seul grant durable')
    t(rpcCalls.length === 0, '11 : aucun nouvel appel RPC (short-circuit sur le marqueur pass)')
  }

  // ── 12. DÉFAUT P0.6 : échec de création Mollie bloque 24 h ────────────
  {
    const kv = createTtlKv()
    const state = { mollieCreateFailures: 1 }
    const { backend, created } = buildBackend(state)
    const env = createEnv(kv)
    const first = await runApi(worker, CREATE_BODY, env)
    const second = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    t(first.status === 500, '12 : premier essai -> 500 (Mollie indisponible)')
    t(second.status === 200 && second.json && second.json.paymentId,
      '12 : le retry doit être AUTORISÉ après un échec de création Mollie')
    t(created.length === 1, '12 : un seul paiement Mollie finalement créé')
    t(first.status !== 200, '12 : le premier essai n a créé aucun paiement')
  }

  console.log(`\nP06_IDEMPOTENCY_REVIEW PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })

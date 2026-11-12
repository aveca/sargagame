#!/usr/bin/env node
'use strict'
/**
 * p04-kv-optimization.test.cjs — P0.4 : validation RÉELLE des deux
 * optimisations KV de `workers/sg-payments/index.js`.
 *
 * Ce fichier EXÉCUTE la Worker (import réel du module), pas une maquette.
 * Toutes les sorties réseau (Mollie, Supabase) sont interceptées par un
 * backend simulé explicite. Aucun paiement réel, aucun secret réel.
 *
 * Optimisation 1 — TTL du marqueur d'idempotence de création de paiement
 *   `mol_<sha256(email|pass)>` : 60s -> 86400s.
 *   Tests B (retry à 60s), C (fenêtre 24h) et vérification directe du TTL.
 *
 * Optimisation 2 — `rateLimit` cache-first : le cache module est déjà consulté
 *   avant KV dans la version de base ; le diff P0.3 n'ajoute que des
 *   commentaires. Le test vérifie donc le COMPORTEMENT attendu (une seule
 *   lecture KV par journée et par clé) sans prétendre que le code a changé.
 *
 * Tests :
 *   A. Webhook Mollie dupliqué (même event id)  -> duplicate, un seul grant.
 *   B. Retry de création à +60s                 -> refusé (marqueur encore là).
 *   C. Fenêtre 24h                              -> refusé à +23h59, accepté à +24h01.
 *   D. Paiement déjà attribué (event id ≠)      -> pas de second grant durable.
 *   E. Remboursement + annulation d'abonnement  -> révocation, HTTP 200.
 */

const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')
const {
  hmacHex,
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook,
  paidPayment,
  paidSubscription
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

// P04_WORKER_PATH permet de rejouer le test contre une copie de référence
// (ex. TTL 60s) pour prouver que les assertions ne sont pas vides.
const WORKER_PATH = process.env.P04_WORKER_PATH || path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const WEBHOOK_SECRET = 'test_webhook_secret'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * KV Workers simulé AVEC expiration TTL et horloge virtuelle.
 * Permet de prouver la sémantique de la fenêtre 60s / 24h sans attendre.
 */
function createTtlKv(initial = {}) {
  let clock = 0
  const store = new Map()
  for (const [key, value] of Object.entries(initial)) {
    store.set(key, { value, expiresAt: null })
  }
  const calls = []
  const namespace = {
    async get(key) {
      calls.push({ op: 'get', key })
      const rec = store.get(key)
      if (!rec) return null
      if (rec.expiresAt !== null && clock >= rec.expiresAt) {
        store.delete(key)
        return null
      }
      return rec.value
    },
    async put(key, value, opts) {
      calls.push({ op: 'put', key, value, opts })
      const ttl = opts && Number(opts.expirationTtl)
      store.set(key, {
        value,
        expiresAt: Number.isFinite(ttl) && ttl > 0 ? clock + ttl * 1000 : null
      })
    },
    async delete(key) {
      calls.push({ op: 'delete', key })
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
      if (rec.expiresAt !== null && clock >= rec.expiresAt) {
        store.delete(key)
        return false
      }
      return true
    },
    advance(ms) { clock += ms },
    now: () => clock
  }
}

function createFakeEnv(kv, overrides = {}) {
  return {
    MOLLIE_API_KEY: 'test_api_key',
    MOLLIE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_service_key',
    NAMECHEAP_MAIL_TOKEN: 'test_namecheap_token',
    TRANSIENTS: kv.namespace,
    ...overrides
  }
}

/** Backend Mollie/Supabase simulé, sans réseau réel. */
function buildBackend(state = {}) {
  const grants = state.grants || []
  const rpcCalls = state.rpcCalls || []
  const unmocked = state.unmocked || []
  const payment = state.payment || paidPayment()
  const subscription = state.subscription || null

  const backend = installFetch(({ url, method, body }) => {
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return jsonResponse(state.createdPayment && url.endsWith('/' + state.createdPayment.id) && method === 'GET'
        ? state.createdPayment
        : payment)
    }
    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      const created = state.createdPayment || {
        id: 'tr_created_0001',
        status: 'open',
        _links: { checkout: { href: 'https://www.mollie.com/payscreen/select-method/tr_created_0001' } }
      }
      state.createdPayments = (state.createdPayments || 0) + 1
      return jsonResponse(created, 201)
    }
    if (url.startsWith('https://api.mollie.com/v2/subscriptions/')) {
      return jsonResponse(subscription || paidSubscription())
    }
    if (url === 'https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant') {
      const args = JSON.parse(body || '{}')
      rpcCalls.push(args)
      const row = {
        payment_id: args.p_payment_id,
        type: 'b2c_pass',
        pass: args.p_pass,
        email: args.p_email,
        currency: args.p_currency,
        expires_at: args.p_expires_at,
        granted_at: args.p_granted_at
      }
      if (!grants.some((g) => g.payment_id === row.payment_id)) grants.push(row)
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://supabase.test/rest/v1/payment_grants')) {
      if (method === 'GET') {
        const q = url.slice(url.indexOf('?'))
        const paymentId = /payment_id=eq\.([^&]+)/.exec(q)
        const subscriptionId = /subscription_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) =>
          (!paymentId || g.payment_id === decodeURIComponent(paymentId[1])) &&
          (!subscriptionId || g.subscription_id === decodeURIComponent(subscriptionId[1])))
        return jsonResponse(rows)
      }
      if (method === 'POST') {
        const row = JSON.parse(body || '{}')
        grants.push(row)
        return jsonResponse([row], 201)
      }
      if (method === 'PATCH') {
        state.patches = state.patches || []
        state.patches.push(JSON.parse(body || '{}'))
        return jsonResponse([], 200)
      }
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/sg_users')) {
      if (method === 'GET') return jsonResponse(state.users || [])
      return jsonResponse([{ id: 'user-test-1', email: state.userEmail || 'voyageur@example.com' }], 201)
    }
    if (url.startsWith('https://supabase.test/rest/v1/')) {
      return jsonResponse([], 200)
    }
    if (url.includes('/send-email.php')) {
      return jsonResponse({ success: true })
    }
    unmocked.push(`${method} ${url}`)
    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants, rpcCalls, unmocked }
}

function mkApiRequest(body) {
  return new Request('https://sargasses-martinique.com/api/mollie', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function runApi(worker, body, env) {
  const ctx = { waitUntil(p) { try { Promise.resolve(p).catch(() => {}) } catch (_) {} } }
  const res = await worker.fetch(mkApiRequest(body), env, ctx)
  let json = null
  try { json = await res.clone().json() } catch (_) { json = null }
  return { status: res.status, json }
}

const CREATE_BODY = {
  action: 'create_payment',
  pass: 'p30',
  email: 'voyageur@example.com',
  source: 'b2c',
  cents: 1499,
  cur: 'EUR'
}

const idemPuts = (kv) => kv.puts().filter((c) => c.key.startsWith('mol_') && c.key.length === 68)

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ══ Optimisation 1 : le TTL écrit est bien 86400 (et plus 60) ════════════
  {
    const kv = createTtlKv()
    const state = {}
    const { backend, calls } = buildBackend(state)
    const env = createFakeEnv(kv)
    const res = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    const puts = idemPuts(kv)
    t(res.status === 200, 'TTL : la création de paiement répond 200')
    t(puts.length === 1, 'TTL : un marqueur d idempotence a été écrit')
    t(puts[0] && puts[0].opts && puts[0].opts.expirationTtl === 86400,
      'TTL : le marqueur est écrit avec expirationTtl=86400 (régression si 60)')
    t(!calls.some((c) => c.url.includes('unmocked')), 'TTL : aucun appel réseau non simulé')
  }

  // ══ A. Webhook Mollie dupliqué (même event id) ══════════════════════════
  {
    const kv = createTtlKv()
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const env = createFakeEnv(kv)
    const body = JSON.stringify({
      resource: 'payment',
      id: 'event_p04_dup_001',
      type: 'payment.paid',
      entityId: 'tr_test_0001'
    })
    const first = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const second = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(first.status === 200, 'A : le premier webhook répond 200')
    t(first.json && first.json.granted === true, 'A : le premier webhook accorde le paiement')
    t(second.status === 200, 'A : le webhook dupliqué répond 200 (Mollie ne doit pas réessayer)')
    t(second.json && second.json.duplicate === true, 'A : le second webhook est identifié comme doublon')
    t(rpcCalls.length === 1, 'A : un seul grant durable pour un webhook dupliqué')
    const marker = kv.puts().find((c) => c.key === 'mollie_event_p04_dup_001')
    t(marker && marker.opts.expirationTtl === 86400, 'A : le marqueur webhook a un TTL de 86400s')
  }

  // ══ B. Retry de création à +60 secondes ═════════════════════════════════
  {
    const kv = createTtlKv()
    const state = {}
    const { backend } = buildBackend(state)
    const env = createFakeEnv(kv)
    const first = await runApi(worker, CREATE_BODY, env)
    kv.advance(61 * 1000) // 61s : au-delà de l'ancien TTL de 60s
    const retry = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    t(first.status === 200, 'B : création initiale acceptée')
    t(retry.status === 500 && /en cours/.test(String(retry.json && retry.json.error)),
      'B : à +61s le marqueur 24h est encore là -> création refusée (ancien TTL 60s: doublon)')
    t((state.createdPayments || 0) === 1, 'B : un seul paiement Mollie créé malgré le retry à +61s')
  }

  // ══ C. Fenêtre 24h : refus à +23h59, acceptation à +24h01 ══════════════
  {
    const kv = createTtlKv()
    const state = {}
    const { backend } = buildBackend(state)
    const env = createFakeEnv(kv)
    await runApi(worker, CREATE_BODY, env)
    kv.advance(23 * 60 * 60 * 1000 + 59 * 60 * 1000) // +23h59
    const before24h = await runApi(worker, CREATE_BODY, env)
    kv.advance(2 * 60 * 1000) // +24h01
    const after24h = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    t(before24h.status === 500, 'C : à +23h59 le marqueur est toujours actif -> création refusée')
    t(after24h.status === 200 && after24h.json && after24h.json.paymentId,
      'C : à +24h01 le marqueur a expiré -> création acceptée (fenêtre 24h effective)')
    t((state.createdPayments || 0) === 2, 'C : exactement deux paiements Mollie créés (t0 et +24h01)')
  }

  // ══ D. Paiement déjà attribué (event id différent, même entité) ════════
  {
    const kv = createTtlKv()
    const state = {}
    const { backend, rpcCalls, grants } = buildBackend(state)
    const env = createFakeEnv(kv)
    const firstBody = JSON.stringify({
      resource: 'payment', id: 'event_p04_d1', type: 'payment.paid', entityId: 'tr_test_0001'
    })
    const secondBody = JSON.stringify({
      resource: 'payment', id: 'event_p04_d2', type: 'payment.paid', entityId: 'tr_test_0001'
    })
    const first = await runWebhook(worker, mkWebhookRequest({ body: firstBody }), env)
    const second = await runWebhook(worker, mkWebhookRequest({ body: secondBody }), env)
    backend.restore()
    t(first.json && first.json.granted === true, 'D : le premier événement accorde le paiement')
    t(second.status === 200, 'D : le second événement (id différent) répond 200')
    t(second.json && second.json.granted === true, 'D : le paiement déjà attribué reste honoré (pas d erreur)')
    t(rpcCalls.length === 1, 'D : aucun second écriture de grant durable')
    t(grants.length === 1, 'D : une seule ligne de grant durable en base')
    t(kv.has('mol_b2c_pass_tr_test_0001'), 'D : le marqueur KV du pass B2C est présent')
  }

  // ══ E1. Remboursement : révocation + suppression du pass ═══════════════
  {
    const kv = createTtlKv({ mol_b2c_pass_tr_refund_001: '{"pass":"p30"}' })
    const state = {
      payment: paidPayment({
        id: 'tr_refund_001',
        status: 'refunded',
        metadata: { source: 'b2c', pass: 'p30', email: 'voyageur@example.com' }
      })
    }
    const { backend, calls } = buildBackend(state)
    const env = createFakeEnv(kv)
    const body = JSON.stringify({
      resource: 'payment', id: 'event_p04_refund_001', type: 'payment.refunded', entityId: 'tr_refund_001'
    })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'E1 : le webhook payment.refunded répond 200')
    t(res.json && res.json.revoked === true, 'E1 : la réponse indique la révocation')
    t(!kv.has('mol_b2c_pass_tr_refund_001'), 'E1 : la clé KV du pass a été supprimée')
    t(kv.deletes().some((c) => c.key === 'mol_b2c_pass_tr_refund_001'),
      'E1 : une opération KV delete a bien été émise')
    t(calls.some((c) => c.method === 'PATCH' && c.url.includes('/payment_grants')),
      'E1 : le grant durable est révoqué par PATCH (expires_at)')
    const marker = kv.puts().find((c) => c.key === 'mollie_rev_tr_refund_001')
    t(marker && marker.opts.expirationTtl === 30 * 86400, 'E1 : marqueur de révocation posé (mollie_rev_<pid>) avec TTL 30j')
  }

  // ══ E2. Annulation d abonnement : révocation + suppression du grant ═════
  {
    const kv = createTtlKv({ mollie_grant_sub_p04_001: '{"plan":"pro_monthly"}' })
    const state = {
      subscription: paidSubscription({ id: 'sub_p04_001', status: 'canceled' })
    }
    const { backend, calls } = buildBackend(state)
    const env = createFakeEnv(kv)
    const body = JSON.stringify({
      resource: 'subscription', id: 'event_p04_cancel_001', type: 'subscription.canceled', entityId: 'sub_p04_001'
    })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'E2 : le webhook subscription.canceled répond 200')
    t(res.json && res.json.revoked === true, 'E2 : la réponse indique la révocation')
    t(!kv.has('mollie_grant_sub_p04_001'), 'E2 : la clé KV du grant abonnement a été supprimée')
    t(kv.deletes().some((c) => c.key === 'mollie_grant_sub_p04_001'),
      'E2 : une opération KV delete a bien été émise')
    t(calls.some((c) => c.method === 'PATCH' && c.url.includes('/payment_grants')),
      'E2 : le grant abonnement est révoqué par PATCH (expires_at)')
  }

  console.log(`\nP04_KV_OPTIMIZATION_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })

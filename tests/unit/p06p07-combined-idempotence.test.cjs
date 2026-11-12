#!/usr/bin/env node
'use strict'
/**
 * p06p07-combined-idempotence.test.cjs — Tests COMBINES P0.6 + P0.7.
 *
 * P0.6 (create_payment) : TTL du marqueur d'idempotence `mol_<hash>` =
 *   86400s (24h), et suppression du marqueur en cas d'echec du POST Mollie
 *   pour autoriser le retry immediat.
 *
 * P0.7 (webhook) : namespaces separes `mollie_<pid>` (attribution/paye) vs
 *   `mollie_rev_<pid>` (revocation), de sorte qu'un remboursement/chargeback
 *   sur un paiement deja honore ne soit pas confondu avec un doublon.
 *
 * Scenarios combines :
 *   1. Paiement cree (P0.6) -> webhook paye (P0.7) -> marqueur mollie_<pid> pose.
 *   2. Webhook rembourse (P0.7) -> marqueur mollie_rev_<pid> pose, grant revoque.
 *   3. Rejeu du webhook paye APRES remboursement -> doublon (mollie_<pid>
 *      existe encore), pas de re-delivrance.
 *   4. Rejeu du webhook rembourse -> doublon (mollie_rev_<pid> existe), pas
 *      de double revocation.
 *   5. Echec POST Mollie (P0.6) -> marqueur supprime, retry autorise.
 *
 * La Worker REELLE est importee. Tous les appels Mollie/Supabase sont simules.
 * Aucun paiement reel, aucun secret reel.
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
  paidPayment
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const WEBHOOK_SECRET = 'test_webhook_secret'

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

/**
 * KV simule avec TTL et horloge virtuelle (idem P0.6).
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
      if (rec.expiresAt !== null && clock >= rec.expiresAt) { store.delete(key); return null }
      return rec.value
    },
    async put(key, value, opts) {
      calls.push({ op: 'put', key, value, opts })
      const ttl = opts && Number(opts.expirationTtl)
      store.set(key, { value, expiresAt: Number.isFinite(ttl) && ttl > 0 ? clock + ttl * 1000 : null })
    },
    async delete(key) {
      calls.push({ op: 'delete', key })
      store.delete(key)
    },
    advance(ms) { clock += ms },
    now: () => clock
  }
  return { namespace, calls, puts: () => calls.filter((c) => c.op === 'put'), deletes: () => calls.filter((c) => c.op === 'delete'), advance(ms) { clock += ms }, now: () => clock, has(key) { const rec = store.get(key); if (!rec) return false; if (rec.expiresAt !== null && clock >= rec.expiresAt) { store.delete(key); return false } return true } }
}

function createEnv(kv) {
  return {
    MOLLIE_API_KEY: 'test_api_key',
    MOLLIE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_service_key',
    NAMECHEAP_MAIL_TOKEN: 'test_namecheap_token',
    TRANSIENTS: kv.namespace
  }
}

function buildBackend(state = {}) {
  const grants = state.grants || []
  const unmocked = []
  const payment = state.payment || paidPayment({ id: state.paymentId || 'tr_combined_001', status: 'paid' })
  const backend = installFetch(({ url, method, body }) => {
    // Mollie : paiement (etat autoritaire)
    if (url === `https://api.mollie.com/v2/payments/${payment.id}` && method === 'GET') {
      return jsonResponse(payment)
    }
    // Mollie : creation de paiement (POST) — peut echouer si configure
    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      if (state.mollieCreateFailures > 0) {
        state.mollieCreateFailures--
        return jsonResponse({ detail: 'transient failure' }, 502)
      }
      state.createdPayments = (state.createdPayments || 0) + 1
      return jsonResponse({ id: 'tr_created_' + state.createdPayments, status: 'open', _links: { checkout: { href: 'https://pay/' + state.createdPayments } } }, 201)
    }
    // Supabase : payment_grants — RPC upsert puis lecture (mock realiste)
    if (url.startsWith('https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant')) {
      const args = JSON.parse(body || '{}')
      if (!grants.some((g) => g.payment_id === args.p_payment_id)) grants.push({
        payment_id: args.p_payment_id,
        type: 'b2c_pass',
        pass: args.p_pass,
        email: args.p_email,
        currency: args.p_currency,
        expires_at: args.p_expires_at,
        granted_at: args.p_granted_at,
        metadata: args.p_metadata
      })
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://supabase.test/rest/v1/payment_grants')) {
      if (method === 'GET') {
        const q = url.slice(url.indexOf('?'))
        const pid = /payment_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) => (!pid || g.payment_id === decodeURIComponent(pid[1])))
        return jsonResponse(rows)
      }
      if (method === 'PATCH') { return jsonResponse([], 200) }
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
  return { backend, calls: backend.calls, grants, unmocked }
}

function classicWebhook(id, event) {
  const body = `id=${encodeURIComponent(id)}&event=${encodeURIComponent(event)}`
  return mkWebhookRequest({ body, contentType: 'application/x-www-form-urlencoded' })
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
  action: 'create_payment', pass: 'p30', email: 'voyageur@example.com', source: 'b2c', cents: 1499, cur: 'EUR'
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // =========================================================================
  // 1. Paiement cree (P0.6) + webhook paye (P0.7) -> marqueur mollie_<pid>
  // =========================================================================
  {
    const kv = createTtlKv()
    const state = { paymentId: 'tr_comb_paid', payment: paidPayment({ id: 'tr_comb_paid', status: 'paid', amount: { value: '14.99', currency: 'EUR' } }) }
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)

    // 1a. Creation de paiement : marqueur d'idempotence avec TTL 86400 (P0.6)
    const resCreate = await runApi(worker, CREATE_BODY, env)
    const idemPuts = kv.puts().filter((c) => c.key.startsWith('mol_') && c.key.length === 68)
    t(resCreate.status === 200, '1a : creation de paiement reussie')
    t(idemPuts.length === 1, '1a : un marqueur d idempotence ecrit')
    t(idemPuts[0] && idemPuts[0].opts && idemPuts[0].opts.expirationTtl === 86400, '1a : TTL 86400s (P0.6, pas 60s)')

    // 1b. Webhook payment.paid -> grant + marqueur mollie_<pid> (P0.7)
    const resPaid = await runWebhook(worker, classicWebhook('tr_comb_paid', 'payment.paid'), env)
    backend.restore()
    t(resPaid.status === 200 && resPaid.json && resPaid.json.granted === true, '1b : webhook payment.paid accorde le paiement')
    t(kv.has(`mollie_tr_comb_paid`), '1b : marqueur mollie_<pid> pose (attribution)')
    t(grants.length === 1, '1b : un seul grant durable')
  }

  // =========================================================================
  // 2. Webhook rembourse (P0.7) -> marqueur mollie_rev_<pid>, grant revoque
  // =========================================================================
  {
    const kv = createTtlKv({ [`mollie_tr_comb_refund`]: '1', [`mol_b2c_pass_tr_comb_refund`]: '{"pass":"p30"}' })
    const state = {
      paymentId: 'tr_comb_refund',
      payment: paidPayment({ id: 'tr_comb_refund', status: 'paid', amount: { value: '14.99', currency: 'EUR' }, amountRefunded: { value: '14.99', currency: 'EUR' } }),
      grants: [{ payment_id: 'tr_comb_refund', type: 'b2c_pass', pass: 'p30', email: 'v@example.com', currency: 'EUR', expires_at: new Date(Date.now() - 86400000).toISOString(), granted_at: new Date(Date.now() - 8 * 86400000).toISOString() }]
    }
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)

    const res = await runWebhook(worker, classicWebhook('tr_comb_refund', 'payment.refunded'), env)
    backend.restore()
    t(res.status === 200 && res.json && res.json.revoked === true, '2 : payment.refunded => revoked true')
    t(kv.has(`mollie_rev_tr_comb_refund`), '2 : marqueur mollie_rev_<pid> pose (revocation, namespace separe)')
    t(kv.has(`mollie_tr_comb_refund`), '2 : marqueur mollie_<pid> conserve (pas de confusion avec doublon)')
    t(!kv.has('mol_b2c_pass_tr_comb_refund'), '2 : cle KV du pass supprimee')
    t(grants.some((g) => g.payment_id === 'tr_comb_refund' && g.expires_at && new Date(g.expires_at) <= Date.now() + 1000), '2 : grant B2C expire')
  }

  // =========================================================================
  // 3. Rejeu du webhook paye APRÈS remboursement -> doublon (pas de re-grant)
  // =========================================================================
  {
    const kv = createTtlKv({ [`mollie_tr_comb_replay`]: '1' })
    const state = {
      paymentId: 'tr_comb_replay',
      payment: paidPayment({ id: 'tr_comb_replay', status: 'refunded', amount: { value: '14.99', currency: 'EUR' }, amountRefunded: { value: '14.99', currency: 'EUR' } }),
      grants: [{ payment_id: 'tr_comb_replay', type: 'b2c_pass', pass: 'p30', email: 'v@example.com', currency: 'EUR', expires_at: new Date(Date.now() - 86400000).toISOString(), granted_at: new Date(Date.now() - 8 * 86400000).toISOString() }]
    }
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)

    const res = await runWebhook(worker, classicWebhook('tr_comb_replay', 'payment.paid'), env)
    backend.restore()
    const rpcCalls = backend.calls.filter((c) => c.url.includes('/rpc/sg_upsert_payment_grant'))
    t(res.status === 200 && res.json && res.json.duplicate === true, '3 : payment.paid rejoue apres remboursement => doublon (mollie_<pid> existe encore)')
    t(grants.length === 1, '3 : aucun nouveau grant apres rejeu')
    t(rpcCalls.length === 0, '3 : aucun appel RPC pour le rejeu (short-circuit sur le marqueur)')
  }

  // =========================================================================
  // 4. Rejeu du webhook rembourse -> doublon (pas de double revocation)
  // =========================================================================
  {
    const kv = createTtlKv({ [`mollie_rev_tr_comb_rev`]: '1' })
    const state = {
      paymentId: 'tr_comb_rev',
      payment: paidPayment({ id: 'tr_comb_rev', status: 'paid', amount: { value: '14.99', currency: 'EUR' }, amountRefunded: { value: '14.99', currency: 'EUR' } }),
      grants: [{ payment_id: 'tr_comb_rev', type: 'b2c_pass', pass: 'p30', email: 'v@example.com', currency: 'EUR', expires_at: new Date(Date.now() - 86400000).toISOString(), granted_at: new Date(Date.now() - 8 * 86400000).toISOString() }]
    }
    const { backend, grants } = buildBackend(state)
    const env = createEnv(kv)

    const res = await runWebhook(worker, classicWebhook('tr_comb_rev', 'payment.refunded'), env)
    backend.restore()
    t(res.status === 200 && res.json && res.json.duplicate === true, '4 : payment.refunded rejoue => doublon (mollie_rev_<pid> existe)')
    t(kv.puts().filter((c) => c.key === `mollie_rev_tr_comb_rev`).length === 0, '4 : aucun nouveau marqueur de revocation pose')
  }

  // =========================================================================
  // 5. P0.6 : Echec POST Mollie -> marqueur supprime, retry autorise
  // =========================================================================
  {
    const kv = createTtlKv()
    const state = { mollieCreateFailures: 1 }
    const { backend, created } = buildBackend(state)
    const env = createEnv(kv)

    const first = await runApi(worker, CREATE_BODY, env)
    const idemDeletes = kv.deletes().filter((c) => c.key.startsWith('mol_') && c.key.length === 68)
    const second = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    t(first.status === 500, '5 : premier essai -> 500 (Mollie indisponible)')
    t(idemDeletes.length === 1, '5 : marqueur d idempotence supprime apres echec (P0.6)')
    t(second.status === 200 && second.json && second.json.paymentId, '5 : retry autorise apres suppression du marqueur')
    t((state.createdPayments || 0) === 1, '5 : un seul paiement Mollie finalement cree')
  }

  // =========================================================================
  // 6. P0.6 : TTL 24h effective -> refus a +23h59, acceptation a +24h01
  // =========================================================================
  {
    const kv = createTtlKv()
    const state = {}
    const { backend } = buildBackend(state)
    const env = createEnv(kv)
    await runApi(worker, CREATE_BODY, env)
    kv.advance(23 * 60 * 60 * 1000 + 59 * 60 * 1000) // +23h59
    const before = await runApi(worker, CREATE_BODY, env)
    kv.advance(2 * 60 * 1000) // +24h01
    const after = await runApi(worker, CREATE_BODY, env)
    backend.restore()
    t(before.status === 500, '6 : a +23h59 le marqueur est encore actif -> refus')
    t(after.status === 200 && after.json && after.json.paymentId, '6 : a +24h01 le marqueur a expire -> acceptation')
    t((state.createdPayments || 0) === 2, '6 : exactement deux paiements crees')
  }

  console.log(`\nP06P07_COMBINED_IDEMPOTENCE TESTS PASS (${n} assertions)`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })

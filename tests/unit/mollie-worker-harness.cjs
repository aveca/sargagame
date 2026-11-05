'use strict'
/**
 * mollie-worker-harness.cjs — harnais de test shared pour la Worker
 * `workers/sg-payments/index.js` (mission P0.118 §5/§6/§7).
 *
 * Il fournit :
 *   - un KV Workers simule (get/put/delete) qui journalise les appels ;
 *   - une interception de `globalThis.fetch` qui journalise chaque appel
 *     (url, methode, corps) — c'est ce qui permet de prouver l'ORDRE
 *     « grant durable verifie AVANT marqueur KV » ;
 *   - un signeur HMAC-SHA256 (formes « hex nu » et « sha256=<hex> ») ;
 *   - un constructeur de requete webhook (Classique ou Next-gen).
 *
 * AucuneDonnee reelle n'est utilisee : les paiements sont des fixtures
 * explicites, jamais des paiements simules presentes comme reels.
 */

const crypto = require('node:crypto')

const WEBHOOK_SECRET = 'test_webhook_secret'

function hmacHex(secret, body) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

/** Compteur d ordre GLOBAL partage entre le journal KV et le journal fetch :
 *  permet de prouver que le grant durable est ecrit et verifie AVANT le
 *  marqueur KV (deux journaux distincts). */
let SEQ = 0
function nextSeq() { return ++SEQ }

function createKv(initial = {}) {
  const store = new Map(Object.entries(initial || {}))
  const calls = []
  return {
    store,
    calls,
    puts: () => calls.filter((c) => c.op === 'put'),
    has: (key) => store.has(key),
    namespace: {
      async get(key) {
        calls.push({ op: 'get', key, seq: nextSeq() })
        return store.has(key) ? store.get(key) : null
      },
      async put(key, value, opts) {
        calls.push({ op: 'put', key, value, opts, seq: nextSeq() })
        store.set(key, value)
      },
      async delete(key) {
        calls.push({ op: 'delete', key, seq: nextSeq() })
        store.delete(key)
      }
    }
  }
}

function createEnv(overrides = {}) {
  const kv = createKv(overrides.kvInitial)
  const env = {
    MOLLIE_API_KEY: 'test_api_key',
    MOLLIE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_KEY: 'test_service_key',
    NAMECHEAP_MAIL_TOKEN: 'test_namecheap_token',
    TRANSIENTS: kv.namespace,
    ...(overrides.env || {})
  }
  if (overrides.withoutNamecheap) delete env.NAMECHEAP_MAIL_TOKEN
  return { env, kv }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function installFetch(handler) {
  const calls = []
  const original = globalThis.fetch
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    const method = String(init.method || 'GET')
    const body = init.body == null ? null : String(init.body)
    const call = { url, method, body, headers: init.headers || {}, seq: nextSeq() }
    calls.push(call)
    return handler({ url, method, body, init, calls })
  }
  return {
    calls,
    restore() { globalThis.fetch = original }
  }
}

function mkWebhookRequest(options = {}) {
  const body = options.body == null ? '' : options.body
  const contentType = options.contentType || 'application/json'
  let signature = options.signature
  if (signature === undefined) {
    const hex = hmacHex(options.secret || WEBHOOK_SECRET, body)
    signature = options.signatureStyle === 'bare' ? hex : `sha256=${hex}`
  }
  const headers = { 'content-type': contentType }
  if (signature !== null) headers['X-Mollie-Signature'] = signature
  return new Request('https://sargasses-martinique.com/api/mollie-webhook', {
    method: 'POST',
    headers,
    body
  })
}

async function runWebhook(worker, request, env) {
  const ctx = {
    waitUntil(promise) {
      try { Promise.resolve(promise).catch(() => {}) } catch (_) { /* ignore */ }
    }
  }
  const response = await worker.fetch(request, env, ctx)
  let json = null
  try { json = await response.clone().json() } catch (_) { json = null }
  return { status: response.status, json }
}

/** Paiement B2C valide (fixture explicite, jamais un paiement reel). */
function paidPayment(overrides = {}) {
  return {
    id: 'tr_test_0001',
    mode: 'live',
    status: 'paid',
    paidAt: '2026-11-05T12:00:00.000Z',
    amount: { value: '14.99', currency: 'EUR' },
    metadata: { source: 'b2c', pass: 'p30', email: 'voyageur@example.com', user_id: 'user-1' },
    ...overrides
  }
}

function paidSubscription(overrides = {}) {
  return {
    id: 'sub_test_0001',
    mode: 'live',
    status: 'active',
    customerId: 'cst_test_0001',
    amount: { value: '79.00', currency: 'EUR' },
    metadata: { source: 'b2b_monthly', plan: 'pro_monthly' },
    ...overrides
  }
}

module.exports = {
  WEBHOOK_SECRET,
  hmacHex,
  createKv,
  createEnv,
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook,
  paidPayment,
  paidSubscription
}

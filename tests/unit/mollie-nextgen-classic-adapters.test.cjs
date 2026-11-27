#!/usr/bin/env node
'use strict'
/**
 * mollie-nextgen-classic-adapters.test.cjs — P0.118 §6 : adapters de webhook
 * Mollie Next-gen et Classique sur la Worker `workers/sg-payments/index.js`.
 *
 * DEFAUTS REELS DE LA VERSION LIVE (v381, 100 % du trafic, recuperée le
 * 2026-11-04) que ces tests verrouillent :
 *
 *  D1. Signature Next-gen rejetee : `verifyHmac` comparait la signature
 *      BRUTE. L'en-tete officiel Next-gen vaut "sha256=<hex>" => longueur
 *      differente => 403 sur TOUT webhook officiel.
 *  D2. Webhook Classique casse : le handler faisait `JSON.parse(raw)` sur un
 *      corps "application/x-www-form-urlencoded" => exception => 500, le
 *      paiement n'etait jamais honore.
 *  D3. Evenement inconnu marque comme traite : le fallback faisait
 *      `kv.put(markerKey)` pour TOUT type inconnu => un rejeu ulterieur
 *      etait perdu.
 *  D4. Statut lu dans le corps du webhook au lieu de l'API autoritative.
 *  D5. Identifiant d'evenement confondu avec l'identifiant d'entite
 *      (Next-gen : `id` = event_xxx, `entityId` = tr_xxx).
 *
 * Aucun paiement reel n'est utilise : toutes les fixtures sont explicites.
 */

const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')
const {
  WEBHOOK_SECRET,
  hmacHex,
  createEnv,
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook,
  paidPayment
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')

/**
 * Backend simule. Le RPC reproduit fidelement le comportement SQL attendu
 * (INSERT ... ON CONFLICT (payment_id) DO NOTHING) : il cree la ligne du
 * grant, ce qui permet de verifier que la lecture de controle la retrouve.
 */
function buildBackend(state = {}) {
  const grants = state.grants || []
  const rpcCalls = state.rpcCalls || []
  const unmocked = state.unmocked || []
  const payment = state.payment || paidPayment()
  const subscription = state.subscription || null

  const backend = installFetch(({ url, method, body }) => {
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      if (state.paymentHttpStatus && state.paymentHttpStatus !== 200) {
        return jsonResponse({ status: state.paymentHttpStatus, title: 'boom' }, state.paymentHttpStatus)
      }
      return jsonResponse(payment)
    }
    if (url.startsWith('https://api.mollie.com/v2/subscriptions/')) {
      return jsonResponse(subscription || { id: 'sub_x', status: 'active', customerId: 'cst_x', amount: { value: '79.00', currency: 'EUR' }, metadata: { plan: 'pro_monthly' } })
    }
    if (url === 'https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant') {
      const args = JSON.parse(body || '{}')
      rpcCalls.push(args)
      if (state.rpcFails) return jsonResponse({ message: 'rpc exploded' }, 500)
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
        if (state.grantReadFails) return jsonResponse({ message: 'read exploded' }, 500)
        const q = url.slice(url.indexOf('?'))
        const paymentId = /payment_id=eq\.([^&]+)/.exec(q)
        const subscriptionId = /subscription_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) =>
          (!paymentId || g.payment_id === decodeURIComponent(paymentId[1])) &&
          (!subscriptionId || g.subscription_id === decodeURIComponent(subscriptionId[1])))
        return jsonResponse(rows)
      }
      if (method === 'POST') {
        if (state.grantWriteFails) return jsonResponse({ message: 'write exploded' }, 500)
        const row = JSON.parse(body || '{}')
        grants.push(row)
        return jsonResponse([row], 201)
      }
      if (method === 'PATCH') return jsonResponse([], 200)
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/b2b_subscriptions')) {
      if (method === 'GET') return jsonResponse(state.b2bSubscriptions || [])
      return jsonResponse([JSON.parse(body || '{}')], 201)
    }
    if (url.startsWith('https://supabase.test/rest/v1/analytics_events')) {
      return new Response(null, { status: 204 })
    }
    if (url.includes('/send-email.php')) {
      state.namecheapCalls = (state.namecheapCalls || 0) + 1
      return jsonResponse({ success: true })
    }
    if (url.startsWith('https://api.resend.com/emails')) {
      state.resendCalls = (state.resendCalls || 0) + 1
      return new Response(null, { status: 200 })
    }
    unmocked.push(`${method} ${url}`)
    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants, rpcCalls, unmocked }
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ── D1 : signature Next-gen "sha256=<hex>" acceptee ──────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({
      resource: 'payment',
      id: 'event_nextgen_001',
      type: 'payment.paid',
      entityId: 'tr_nextgen_001'
    })
    const request = mkWebhookRequest({ body, contentType: 'application/json' })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 200, 'D1 : webhook Next-gen signe "sha256=..." accepte (la version live repondait 403)')
    t(res.json && res.json.granted === true, 'D1 : le paiement Next-gen est honore')
    t(rpcCalls.length === 1, 'D1 : le grant durable a ete ecrit via le RPC')
    t(kv.has('mollie_event_nextgen_001'), 'D1 : marqueur pose sur l IDENTIFIANT D EVENEMENT')
  }

  // ── D1bis : signature hex nue acceptee ───────────────────────────────────
  {
    const state = {}
    const { backend } = buildBackend(state)
    const { env } = createEnv()
    const body = 'id=tr_test_0001&event=payment.paid'
    const request = mkWebhookRequest({ body, contentType: 'application/x-www-form-urlencoded', signatureStyle: 'bare' })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 200, 'D1bis : signature Classique (hex nu) acceptee')
    t(res.json && res.json.granted === true, 'D1bis : le paiement Classique est honore')
  }

  // ── D1ter : signature invalide => 403 ────────────────────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_x', type: 'payment.paid', entityId: 'tr_x' })
    const request = mkWebhookRequest({ body, signature: 'sha256=' + '0'.repeat(64) })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 403, 'D1ter : signature invalide => 403')
    t(rpcCalls.length === 0, 'D1ter : aucun grant sur signature invalide')
    t(kv.puts().length === 0, 'D1ter : aucun marqueur KV sur signature invalide')
  }

  // ── D2 : webhook Classique (form-urlencoded) ─────────────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = 'id=tr_test_0001&event=payment.paid'
    const request = mkWebhookRequest({ body, contentType: 'application/x-www-form-urlencoded' })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 200, 'D2 : webhook Classique form-urlencoded traite (la version live levait une exception => 500)')
    t(res.json && res.json.granted === true, 'D2 : le webhook Classique honore le paiement')
    t(rpcCalls.length === 1, 'D2 : un seul grant durable pour le webhook Classique')
  }

  // ── D5 : identifiant d evenement != identifiant d entite ─────────────────
  {
    const state = {}
    const { backend, calls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({
      resource: 'payment',
      id: 'event_evt_999',
      type: 'payment.paid',
      entityId: 'tr_entity_999'
    })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    const mollieCalls = calls.filter((c) => c.url.includes('api.mollie.com/v2/payments/'))
    t(mollieCalls.length === 1 && mollieCalls[0].url.endsWith('/tr_entity_999'),
      'D5 : l entite recuperee est entityId (tr_...), pas l identifiant d evenement')
    t(!calls.some((c) => c.url.includes('event_evt_999')), 'D5 : l identifiant d evenement n est jamais utilise comme identifiant d entite')
    t(kv.has('mollie_event_evt_999'), 'D5 : marqueur d idempotence sur l identifiant D EVENEMENT')
    t(!kv.has('mollie_tr_entity_999'), 'D5 : aucun marqueur sur l identifiant d entite')
  }

  // ── D4 : le statut du corps du webhook est ignore ───────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({
      resource: 'payment',
      id: 'event_status_001',
      type: 'payment.paid',
      entityId: 'tr_test_0001',
      status: 'failed'
    })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.json && res.json.granted === true, 'D4 : le statut de l API autoritative l emporte sur celui du corps du webhook')
    t(rpcCalls.length === 1, 'D4 : un grant durable a ete cree')
  }

  // ── D4bis : le statut autoritaire "open" previent tout grant ────────────
  {
    const state = { payment: paidPayment({ status: 'open', paidAt: null }) }
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_open_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'D4bis : aucun grant si l etat autoritative n est pas paye')
    t(res.status === 409, 'D4bis : evenement "paye" contredit par l etat autoritaire => 409 (Mollie rejoue)')
    t(res.json && res.json.error === 'payment_not_settled_yet', 'D4bis : le motif est explicite dans la reponse')
    t(res.json && Array.isArray(res.json.reasons) && res.json.reasons.includes('not_paid'), 'D4bis : la raison not_paid est explicite')
    t(!kv.has('mollie_event_open_001'), 'D4bis : aucun marqueur "traite" (evenement rejouable)')
  }

  // ── D3 : evenement inconnu => aucun grant, aucun marqueur ───────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_unknown_001', type: 'payment.refunded_x', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 200, 'D3 : evenement inconnu => 200 (pas d erreur serveur)')
    t(rpcCalls.length === 0, 'D3 : evenement inconnu => aucun grant')
    t(!kv.has('mollie_event_unknown_001'), 'D3 : evenement inconnu => PAS de marqueur "traite" (rejeu conserve)')
    t(res.json && res.json.processed === false, 'D3 : la reponse indique processed=false')
  }

  // ── D3bis : ressource inconnue => aucun grant, aucun marqueur ────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'mandate', id: 'event_mandate_001', type: 'mandate.created', entityId: 'mdt_001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'D3bis : ressource inconnue => aucun grant')
    t(!kv.has('mollie_event_mandate_001'), 'D3bis : ressource inconnue => aucun marqueur')
  }

  // ── Mode test => aucun droit servi ──────────────────────────────────────
  {
    const state = { payment: paidPayment({ mode: 'test' }) }
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_test_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'MODE : un paiement en mode test ne cree aucun droit')
    t(!kv.has('mollie_event_test_001'), 'MODE : aucun marqueur sur un paiement en mode test')
    t(res.json && Array.isArray(res.json.reasons) && res.json.reasons.includes('not_live_mode'),
      'MODE : le motif not_live_mode est explicite dans la reponse')
  }

  // ── Montant incoherent => aucun droit ───────────────────────────────────
  {
    const state = { payment: paidPayment({ amount: { value: '1.00', currency: 'EUR' } }) }
    const { backend, rpcCalls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_amount_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'MONTANT : un montant qui ne correspond pas au tarif cree aucun droit')
    t(!kv.has('mollie_event_amount_001'), 'MONTANT : aucun marqueur sur un montant invalide')
  }

  // ── Devise inattendue => aucun droit ─────────────────────────────────────
  {
    const state = { payment: paidPayment({ amount: { value: '14.99', currency: 'GBP' } }) }
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_currency_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'DEVISE : une devise hors EUR/USD cree aucun droit')
    t(res.json && res.json.reasons && res.json.reasons.includes('currency_invalid'), 'DEVISE : le motif currency_invalid est explicite')
  }

  // ── SKU inconnu => aucun droit ───────────────────────────────────────────
  {
    const state = { payment: paidPayment({ metadata: { source: 'b2c', pass: 'p999', email: 'voyageur@example.com' } }) }
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_sku_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const request = mkWebhookRequest({ body })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(rpcCalls.length === 0, 'SKU : un SKU inconnu cree aucun droit')
    t(res.json && res.json.reasons && res.json.reasons.includes('invalid_sku'), 'SKU : le motif invalid_sku est explicite')
  }

  // ── Payload illisible => 400 ─────────────────────────────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const request = mkWebhookRequest({ body: 'pas-du-json' })
    const res = await runWebhook(worker, request, env)
    backend.restore()
    t(res.status === 400, 'PAYLOAD : un corps illisible => 400')
    t(rpcCalls.length === 0, 'PAYLOAD : aucun grant sur un corps illisible')
  }

  // ── Rejeu du meme evenement => idempotent ───────────────────────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_replay_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const first = await runWebhook(worker, mkWebhookRequest({ body }), env)
    const second = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(first.json && first.json.granted === true, 'REJEU : le premier appel honore le paiement')
    t(second.json && second.json.duplicate === true, 'REJEU : le rejeu est detecte comme doublon')
    t(rpcCalls.length === 1, 'REJEU : un seul appel au RPC (pas de double grant)')
  }

  console.log(`\nMOLLIE_ADAPTERS_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })

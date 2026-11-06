#!/usr/bin/env node
'use strict'
/**
 * mollie-durable-fulfillment.test.cjs — P0.118 §7 : fulfillment Mollie DURABLE
 * sur la Worker `workers/sg-payments/index.js`.
 *
 * REGLE VERROUILLE : le grant durable (RPC / ecriture Supabase) doit etre
 * ecrit ET VERIFIE AVANT tout marqueur KV. Un marqueur pose sans grant
 * durable = argent paye sans droit servi, et definitivement bloque (plus de
 * rejeu possible).
 *
 * DEFAUTS REELS DE LA VERSION LIVE (v381) que ces tests verrouillent :
 *  E1. `grantB2C` posait le marqueur KV AVANT l'ecriture Supabase, et
 *      l'ecriture elle-meme echouait silencieusement (helper `supa` qui
 *      renvoyait `null` sur erreur).
 *  E2. `grantB2C` POSTait des colonnes INEXISTANTES : `session_id` et
 *      `user_id` n'existent pas dans public.payment_grants
 *      (cf. supabase/schema.sql) => PostgREST 400 => aucun droit servi.
 *  E3. `grantB2B` posait aussi le jeton KV avant l'ecriture durable, sans
 *      verification.
 *  E4. La revocation B2B faisait `PATCH { status: "revoked" }` alors que
 *      `public.payment_grants` n'a PAS de colonne `status` => la revocation
 *      n'arrivait jamais.
 *  E5. `sendViaNamecheap` utilisait un bearer FIGE DANS LE CODE
 *      (`NAMECHEAP_BEARER = "sargagame-mail-2026"`).
 *
 * Aucun paiement reel n'est utilise : toutes les fixtures sont explicites.
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  createEnv,
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook,
  paidPayment,
  paidSubscription
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')
const WORKER_SRC = fs.readFileSync(WORKER_PATH, 'utf8')

function buildBackend(state = {}) {
  const grants = state.grants || []
  const rpcCalls = state.rpcCalls || []
  const writes = state.writes || []
  const unmocked = state.unmocked || []
  const payment = state.payment || paidPayment()
  const subscription = state.subscription || paidSubscription()

  const backend = installFetch(({ url, method, body }) => {
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return jsonResponse(payment)
    }
    if (url.startsWith('https://api.mollie.com/v2/subscriptions/')) {
      return jsonResponse(subscription)
    }
    if (url === 'https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant') {
      const args = JSON.parse(body || '{}')
      rpcCalls.push(args)
      if (state.rpcFails) return jsonResponse({ message: 'rpc exploded' }, 500)
      const row = {
        payment_id: args.p_payment_id,
        type: state.rpcWritesWrongType ? 'b2b_pro' : 'b2c_pass',
        pass: state.rpcWritesWrongPass ? 'season' : args.p_pass,
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
        writes.push({ method: 'POST', row })
        grants.push(row)
        return jsonResponse([row], 201)
      }
      if (method === 'PATCH') {
        const row = JSON.parse(body || '{}')
        writes.push({ method: 'PATCH', row, query: url.slice(url.indexOf('?')) })
        return jsonResponse([], 200)
      }
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/b2b_subscriptions')) {
      if (method === 'GET') return jsonResponse(state.b2bSubscriptions || [])
      const row = JSON.parse(body || '{}')
      const allowedColumns = new Set([
        'company_name', 'contact_email', 'region', 'plan',
        'mollie_customer_id', 'mollie_subscription_id',
        'status', 'created_at', 'widget_token'
      ])
      if (Object.keys(row).some((key) => !allowedColumns.has(key))) {
        return jsonResponse({ message: 'unknown b2b_subscriptions column' }, 400)
      }
      if (!['free', 'alert', 'dashboard', 'enterprise'].includes(row.plan)) {
        return jsonResponse({ message: 'b2b_subscriptions_plan_check_violation' }, 400)
      }
      writes.push({ method: 'POST_B2B_SUBSCRIPTIONS', row })
      return jsonResponse([{ id: 'b2b-subscription-test', ...row }], 201)
    }
    if (url.startsWith('https://supabase.test/rest/v1/analytics_events')) {
      return new Response(null, { status: 204 })
    }
    if (url.includes('/send-email.php')) {
      state.namecheapCalls = (state.namecheapCalls || 0) + 1
      state.namecheapAuth = (state.namecheapHeaders || (state.namecheapHeaders = {}))
      return jsonResponse({ success: true })
    }
    if (url.startsWith('https://api.resend.com/emails')) {
      state.resendCalls = (state.resendCalls || 0) + 1
      return new Response(null, { status: 200 })
    }
    unmocked.push(`${method} ${url}`)
    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants, rpcCalls, writes, unmocked }
}

function kvPut(kv, key) {
  return kv.calls.find((c) => c.op === 'put' && c.key === key) || null
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ── E2 + contrat RPC : exactement les 7 arguments attendus ───────────────
  {
    const state = {}
    const { backend, rpcCalls } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_rpc_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'RPC : le webhook repond 200')
    t(rpcCalls.length === 1, 'RPC : le RPC de grant est appele exactement une fois')
    const keys = Object.keys(rpcCalls[0] || {}).sort()
    const expected = ['p_currency', 'p_email', 'p_expires_at', 'p_granted_at', 'p_metadata', 'p_payment_id', 'p_pass'].sort()
    t(JSON.stringify(keys) === JSON.stringify(expected), 'RPC : les 7 arguments sont exactement p_payment_id/p_pass/p_email/p_currency/p_expires_at/p_granted_at/p_metadata')
    t(!keys.some((k) => /session|user/i.test(k)), 'RPC : aucune colonne session_id/user_id (elles n existent pas dans payment_grants)')
    t(rpcCalls[0].p_payment_id === 'tr_test_0001', 'RPC : p_payment_id est l identifiant de l ENTITE')
    t(rpcCalls[0].p_pass === 'p30', 'RPC : p_pass est le SKU')
    t(rpcCalls[0].p_currency === 'EUR', 'RPC : p_currency vient de l API autoritative')
    t(rpcCalls[0].p_metadata && rpcCalls[0].p_metadata.user_id === 'user-1', 'RPC : le user_id est conserve dans metadata (jsonb)')
    t(!WORKER_SRC.includes('session_id:'), 'SRC : aucune ecriture de session_id dans la Worker')
  }

  // ── E1 : ordre RPC -> verification -> marqueur KV ────────────────────────
  {
    const state = {}
    const { backend, calls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_order_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    const rpcSeq = calls.find((c) => c.url.includes('/rpc/sg_upsert_payment_grant')).seq
    const verifySeq = calls.find((c) => c.method === 'GET' && c.url.includes('/rest/v1/payment_grants')).seq
    const kvSeq = kvPut(kv, 'mol_b2c_pass_tr_test_0001').seq
    const markerSeq = kvPut(kv, 'mollie_event_order_001').seq
    t(verifySeq > rpcSeq, 'ORDRE : la verification du grant durable suit l ecriture RPC')
    t(kvSeq > verifySeq, 'ORDRE : le marqueur KV du pass est pose APRES la verification du grant durable')
    t(markerSeq > kvSeq, 'ORDRE : le marqueur d evenement est pose apres le marqueur de pass')
    t(res.json && res.json.granted === true, 'ORDRE : le webhook annonce un grant effectif')
  }

  // ── E1bis : echec du RPC => aucun marqueur KV, rejouable ─────────────────
  {
    const state = { rpcFails: true }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_rpcfail_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 500, 'RPC KO : le webhook repond 500 (Mollie rejoue)')
    t(!kv.has('mol_b2c_pass_tr_test_0001'), 'RPC KO : AUCUN marqueur de pass quand le grant durable echoue')
    t(!kv.has('mollie_event_rpcfail_001'), 'RPC KO : AUCUN marqueur d evenement quand le grant durable echoue')
  }

  // ── E1bis2 : echec de la verification => aucun marqueur KV ───────────────
  {
    const state = { grantReadFails: true }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_readfail_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 500, 'VERIF KO : le webhook repond 500 quand la lecture de controle echoue')
    t(!kv.has('mol_b2c_pass_tr_test_0001'), 'VERIF KO : aucun marqueur de pass')
    t(!kv.has('mollie_event_readfail_001'), 'VERIF KO : aucun marqueur d evenement')
  }

  // ── E1bis3 : grant durable incoherent => aucun marqueur KV ───────────────
  {
    const state = { rpcWritesWrongPass: true }
    const { backend } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_mismatch_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 500, 'VERIF INCOHERENTE : le webhook repond 500')
    t(!kv.has('mol_b2c_pass_tr_test_0001'), 'VERIF INCOHERENTE : aucun marqueur de pass')
    t(!kv.has('mollie_event_mismatch_001'), 'VERIF INCOHERENTE : aucun marqueur d evenement')
  }

  // ── E3 : B2B — colonnes reelles, ecriture durable avant le jeton KV ──────
  {
    const state = {}
    const { backend, calls, writes } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'subscription', id: 'event_sub_001', type: 'subscription.created', entityId: 'sub_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'B2B : le webhook abonnement repond 200')
    t(res.json && res.json.granted === true, 'B2B : le grant B2B est honore')
    const grantWrite = writes.find((w) => w.method === 'POST' && w.row.type === 'b2b_pro')
    t(!!grantWrite, 'B2B : une ligne durable payment_grants de type b2b_pro est ecrite')
    const cols = Object.keys(grantWrite.row).sort()
    const expectedCols = ['customer_id', 'expires_at', 'granted_at', 'metadata', 'plan', 'subscription_id', 'type']
    t(JSON.stringify(cols) === JSON.stringify(expectedCols),
      'B2B : les colonnes utilisees sont exactement celles de public.payment_grants (subscription_id/type/plan/customer_id/expires_at/granted_at/metadata)')
    t(grantWrite.row.subscription_id === 'sub_test_0001', 'B2B : subscription_id est l identifiant de l abonnement')
    t(grantWrite.row.plan === 'pro_monthly', 'B2B : plan est le plan reel')
    t(grantWrite.row.customer_id === 'cst_test_0001', 'B2B : customer_id est le customerId Mollie')
    const writeSeq = calls.find((c) => c.method === 'POST' && c.url.includes('/rest/v1/payment_grants')).seq
    const tokenSeq = kvPut(kv, 'mollie_grant_sub_test_0001').seq
    t(tokenSeq > writeSeq, 'B2B : le jeton KV d acces est pose APRES l ecriture du grant durable')
    t(!cols.includes('status'), 'B2B : aucune colonne `status` (inexistante) dans l ecriture B2B')
  }

  // ── E4 : revocation par expiration, jamais par `status` ─────────────────
  {
    const state = {}
    const { backend, writes } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'subscription', id: 'event_sub_cancel_001', type: 'subscription.canceled', entityId: 'sub_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'REVOCATION : le webhook repond 200')
    const patch = writes.find((w) => w.method === 'PATCH')
    t(!!patch, 'REVOCATION : une mise a jour de payment_grants est effectuee')
    t(patch && Object.keys(patch.row).length === 1 && patch.row.expires_at, 'REVOCATION : la revocation expire le grant (colonne reelle expires_at)')
    t(patch && !('status' in patch.row), 'REVOCATION : aucune colonne `status` (la version live ecrivait status=revoked, colonne inexistante)')
    t(patch && patch.query.includes('subscription_id=eq.sub_test_0001'), 'REVOCATION : la cible est le bon abonnement')
    t(kv.has('mollie_grant_sub_test_0001') === false, 'REVOCATION : le jeton KV d acces est supprime')
    t(!WORKER_SRC.includes('"revoked"'), 'SRC : la valeur "revoked" (colonne inexistante) a disparu de la Worker')
  }

  // ── E4bis : remboursement B2C => acces retire ────────────────────────────
  {
    const state = {}
    const { backend, writes, calls } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({ resource: 'payment', id: 'event_refund_001', type: 'payment.refunded', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 200, 'REMBOURSEMENT : le webhook repond 200')
    t(res.json && res.json.revoked === true, 'REMBOURSEMENT : le remboursement est explicitement signale')
    const patch = writes.find((w) => w.method === 'PATCH')
    t(!!patch && patch.row.expires_at, 'REMBOURSEMENT : le grant durable est expire')
    t(kv.calls.some((c) => c.op === 'delete' && c.key === 'mol_b2c_pass_tr_test_0001'), 'REMBOURSEMENT : la clef KV du pass est supprimee')
  }

  // ── E5 : no hardcoded Namecheap bearer; B2B onboarding fails closed without approved plan mapping ──
  {
    t(!WORKER_SRC.includes('NAMECHEAP_BEARER'), 'NAMECHEAP: no hardcoded bearer in Worker source')
    t(!/sargagame-mail-2026/.test(WORKER_SRC), 'NAMECHEAP: historical hardcoded token is absent')
    t(/env\\.NAMECHEAP_MAIL_TOKEN/.test(WORKER_SRC), 'NAMECHEAP: relay credential is read only from the secret binding')

    const state = {
      payment: paidPayment({ metadata: { source: 'b2b_subscription', email: 'hotel@example.com', plan: 'pro_monthly' } })
    }
    const { backend, calls } = buildBackend(state)
    const { env, kv } = createEnv({ withoutNamecheap: true, env: { RESEND_API_KEY: 'test_resend_key' } })
    const body = JSON.stringify({ resource: 'payment', id: 'event_mail_001', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 409, 'B2B onboarding: pro_monthly is rejected because it is absent from the live DB plan CHECK')
    t(res.json && res.json.reasons && res.json.reasons.includes('b2b_plan_schema_mismatch'), 'B2B onboarding: schema mismatch reason is explicit')
    t(!calls.some((c) => c.url.includes('/rest/v1/b2b_subscriptions')), 'B2B onboarding: no subscription DB write occurs before plan mapping approval')
    t(!calls.some((c) => c.url.includes('/send-email.php') || c.url.startsWith('https://api.resend.com/emails')), 'B2B onboarding: no email is sent before plan mapping approval')
    t(!kv.has('mollie_event_mail_001'), 'B2B onboarding: event is not marked processed; Mollie can retry after the contract is fixed')
  }

  // ── E5bis : Brief is also blocked; no price is selected ──
  {
    const state = {
      payment: paidPayment({ metadata: { source: 'b2b_subscription', email: 'hotel@example.com', plan: 'brief_monthly' } })
    }
    const { backend, calls } = buildBackend(state)
    const { env, kv } = createEnv({ env: { RESEND_API_KEY: 'test_resend_key' } })
    const body = JSON.stringify({ resource: 'payment', id: 'event_mail_002', type: 'payment.paid', entityId: 'tr_test_0001' })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    backend.restore()
    t(res.status === 409, 'B2B onboarding: brief_monthly is rejected without an approved DB mapping')
    t(res.json && res.json.reasons && res.json.reasons.includes('b2b_plan_schema_mismatch'), 'B2B onboarding: Brief schema mismatch is explicit')
    t(!calls.some((c) => c.url.includes('/rest/v1/b2b_subscriptions')), 'B2B onboarding: no DB write occurs for Brief')
    t(!calls.some((c) => c.url.includes('/send-email.php') || c.url.startsWith('https://api.resend.com/emails')), 'B2B onboarding: no email is sent for Brief')
    t(!kv.has('mollie_event_mail_002'), 'B2B onboarding: Brief event remains retryable')
  }

  // ── E6 : email recipient addresses are absent from Worker log templates ──
  {
    const sendStart = WORKER_SRC.indexOf('async function sendEmail')
    const sendEnd = WORKER_SRC.indexOf('__name(sendEmail', sendStart)
    const sendSource = WORKER_SRC.slice(sendStart, sendEnd)
    t(sendStart >= 0 && !sendSource.includes('${to}'), 'EMAIL LOGS: generic provider logs do not include recipients')
    const dripStart = WORKER_SRC.indexOf('async function runDripEmails')
    const dripEnd = WORKER_SRC.indexOf('__name(runDripEmails', dripStart)
    const dripSource = WORKER_SRC.slice(dripStart, dripEnd)
    t(dripStart >= 0 && !dripSource.includes('${lead.email}'), 'EMAIL LOGS: B2B drip logs do not include recipient addresses')
    const onboardingStart = WORKER_SRC.indexOf('async function grantOnboardingAuto')
    const onboardingEnd = WORKER_SRC.indexOf('__name(grantOnboardingAuto', onboardingStart)
    const onboardingSource = WORKER_SRC.slice(onboardingStart, onboardingEnd)
    t(onboardingStart >= 0 && !onboardingSource.includes('company_email'), 'B2B SCHEMA: nonexistent company_email column is absent')
    t(!onboardingSource.includes('domain:'), 'B2B SCHEMA: nonexistent domain column is absent')
  }
  console.log(`\nMOLLIE_DURABLE_FULFILLMENT_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })

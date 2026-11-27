#!/usr/bin/env node
'use strict'
/**
 * p0-pro-access-delivery.test.cjs — P0 « chemin argent » : LIVRAISON de l'accès
 * Pro après un paiement RÉELLEMENT payé.
 *
 * DEFAUT REEL (verrouillé par ce test) :
 *   le webhook Mollie créait le droit (grant durable + jeton KV) mais
 *   N'ENVOYAIT AUCUN email, et la page de retour ne contenait AUCUN lien
 *   jeton → un client qui payait 79 €/mois ne recevait aucun accès.
 *
 * Ce qui est verrouille ici :
 *   D1. un paiement Pro payé déclenche l'envoi d'UN email de livraison qui
 *       porte le lien `/pro/espace/?k=<jeton>` ;
 *   D2. le jeton livré est RÉELLEMENT exploitable (`/api/widget-token.php`
 *       renvoie `pro: true`) ;
 *   D3. idempotence : un rejeu du webhook (et un second evenement pour le
 *       meme paiement) n'envoie PAS de second email ;
 *   D4. la page de retour porte le lien jeton quand l'accès est active ;
 *   D5. un RENOUVELLEMENT ne cree PAS un second abonnement (sinon le client
 *       est debite 2x, 3x… par mois) ;
 *   D6. l'URL de webhook par defaut du PHP est joignable (404 corrige).
 *
 * Aucun paiement reel n'est utilise : fixtures explicites + fetch intercepté.
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
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

const ROOT = path.resolve(__dirname, '..', '..')
const WORKER_PATH = path.join(ROOT, 'workers', 'sg-payments', 'index.js')
const WORKER_SRC = fs.readFileSync(WORKER_PATH, 'utf8')
const PHP_SRC = fs.readFileSync(path.join(ROOT, 'public', 'api', 'mollie.php'), 'utf8')

const CUSTOMER_EMAIL = 'hotel-pro@example.com'

function proPayment(overrides = {}) {
  return {
    id: 'tr_pro_test_001',
    mode: 'live',
    status: 'paid',
    paidAt: '2026-11-11T10:00:00.000Z',
    amount: { value: '79.00', currency: 'EUR' },
    sequenceType: 'first',
    metadata: {
      source: 'b2b_espace_monthly',
      plan: 'pro_monthly',
      email: CUSTOMER_EMAIL,
      customerId: 'cst_pro_test_001',
      interval: '1 month',
    },
    ...overrides,
  }
}

function buildBackend(state = {}) {
  const grants = state.grants || []
  const writes = state.writes || []
  const emails = state.emails || []
  const subscriptions = state.subscriptions || []
  const payment = state.payment || proPayment()

  const backend = installFetch(({ url, method, body }) => {
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return jsonResponse(payment)
    }
    if (url.includes('/v2/customers/') && url.endsWith('/subscriptions')) {
      subscriptions.push({ url, method, body: body ? JSON.parse(body) : null })
      return jsonResponse({ id: 'sub_pro_test_001', status: 'active' })
    }
    if (url.startsWith('https://supabase.test/rest/v1/payment_grants')) {
      if (method === 'GET') {
        const q = url.slice(url.indexOf('?'))
        const subscriptionId = /subscription_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) =>
          !subscriptionId || g.subscription_id === decodeURIComponent(subscriptionId[1]))
        return jsonResponse(rows)
      }
      if (method === 'POST') {
        const row = JSON.parse(body || '{}')
        writes.push({ method: 'POST', row })
        grants.push(row)
        return jsonResponse([row], 201)
      }
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/analytics_events')) {
      return new Response(null, { status: 204 })
    }
    if (url.includes('/send-email.php')) {
      emails.push(JSON.parse(body || '{}'))
      return jsonResponse({ success: true })
    }
    if (url.startsWith('https://api.resend.com/emails')) {
      emails.push(JSON.parse(body || '{}'))
      return new Response(null, { status: 200 })
    }
    return jsonResponse({ error: 'unmocked' }, 404)
  })
  return { backend, calls: backend.calls, grants, writes, emails, subscriptions }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // ── D1 + D2 : paiement Pro payé => email de livraison avec jeton valide ──
  let deliveryToken = ''
  {
    const state = {}
    const { backend, calls, writes, emails, subscriptions } = buildBackend(state)
    const { env, kv } = createEnv()
    const body = JSON.stringify({
      resource: 'payment', id: 'event_pro_paid_001', type: 'payment.paid', entityId: 'tr_pro_test_001',
    })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    await settle()

    t(res.status === 200, 'D1 : le webhook d un paiement Pro payé repond 200')
    t(res.json && res.json.granted === true, 'D1 : le droit Pro est honore')

    const grantWrite = writes.find((w) => w.method === 'POST' && w.row.type === 'b2b_pro')
    t(!!grantWrite, 'D1 : une ligne durable payment_grants (b2b_pro) est ecrite')
    t(grantWrite && grantWrite.row.plan === 'pro_monthly', 'D1 : le plan ecrit est le plan REEL (pro_monthly)')
    t(grantWrite && grantWrite.row.subscription_id === 'tr_pro_test_001', 'D1 : l identifiant du paiement sert d id de grant')

    t(emails.length === 1, 'D1 : EXACTEMENT un email de livraison est envoye')
    const mail = emails[0] || {}
    t(mail.to === CUSTOMER_EMAIL, 'D1 : l email est adresse au client qui a paye')
    t(String(mail.subject || '').length > 0, 'D1 : l email a un objet')
    t(String(mail.html || '').includes('/pro/espace/?k='), 'D1 : l email porte le lien Espace Pro avec jeton')

    const m = /\/pro\/espace\/\?k=([A-Za-z0-9%._~+/=-]+)/.exec(String(mail.html || ''))
    t(!!m, 'D1 : le jeton est extractible du lien de livraison')
    deliveryToken = m ? decodeURIComponent(m[1]) : ''
    t(deliveryToken.length > 0, 'D2 : le jeton livre est non vide')

    // D2 : le jeton livre est REELLEMENT exploitable.
    const verify = await worker.fetch(
      new Request(`https://sargasses-martinique.com/api/widget-token.php?k=${encodeURIComponent(deliveryToken)}`),
      env,
      { waitUntil() {} }
    )
    const payload = await verify.json()
    t(payload && payload.pro === true, 'D2 : /api/widget-token.php confirme pro:true pour le jeton livre')

    // D5bis : le premier paiement cree EXACTEMENT un abonnement de suivi.
    t(subscriptions.length === 1, 'D5 : le premier paiement cree exactement UN abonnement de suivi')
    t(subscriptions[0] && subscriptions[0].url.includes('/v2/customers/cst_pro_test_001/subscriptions'),
      'D5 : l abonnement de suivi est cree pour le bon client')
    t(subscriptions[0] && subscriptions[0].body && subscriptions[0].body.amount.value === '79.00',
      'D5 : le montant de l abonnement provient de la grille (79.00), pas d un nombre invente')

    // ── D3 : rejeu du MEME evenement => aucun second email ─────────────────
    const before = emails.length
    const replay = await runWebhook(worker, mkWebhookRequest({ body }), env)
    await settle()
    t(replay.status === 200, 'D3 : le rejeu du webhook repond 200')
    t(replay.json && replay.json.duplicate === true, 'D3 : le rejeu est signale comme doublon')
    t(emails.length === before, 'D3 : le rejeu n envoie PAS de second email')

    // ── D3bis : AUTRE evenement pour le MEME paiement => pas plus d email ──
    const body2 = JSON.stringify({
      resource: 'payment', id: 'event_pro_paid_002', type: 'payment.paid', entityId: 'tr_pro_test_001',
    })
    const res2 = await runWebhook(worker, mkWebhookRequest({ body: body2 }), env)
    await settle()
    t(res2.status === 200, 'D3 : un second evenement pour le meme paiement repond 200')
    t(res2.json && res2.json.granted === true, 'D3 : le droit reste honore (idempotent)')
    t(emails.length === before, 'D3 : aucun second email de livraison pour le meme paiement')
    t(kv.has('mollie_pro_access_tr_pro_test_001'), 'D3 : le marqueur de livraison est pose')

    // ── D4 : la page de retour porte le lien jeton ─────────────────────────
    await kv.namespace.put('mol_return_ref_test_001', JSON.stringify({ paymentId: 'tr_pro_test_001' }))
    const ret = await worker.fetch(
      new Request('https://sargasses-martinique.com/api/mollie-return?ref=ref_test_001'),
      env,
      { waitUntil() {} }
    )
    const html = await ret.text()
    t(ret.status === 200, 'D4 : la page de retour repond 200')
    t(html.includes('/pro/espace/?k='), 'D4 : la page de retour porte le lien Espace Pro avec jeton')
    t(html.includes('Mon Espace Pro'), 'D4 : le bouton d acces Pro est presente')
    t(html.includes('accès Pro est actif'), 'D4 : la page de retour confirme que l accès est actif')
    backend.restore()
  }

  // ── D5 : un RENOUVELLEMENT ne cree PAS un second abonnement ─────────────
  {
    const state = {
      payment: proPayment({
        id: 'tr_pro_renew_002',
        sequenceType: 'recurring',
        metadata: {
          source: 'b2b_espace_monthly',
          plan: 'pro_monthly',
          email: CUSTOMER_EMAIL,
          customerId: 'cst_pro_test_001',
          interval: '1 month',
          firstPaymentId: 'tr_pro_test_001',
        },
      }),
    }
    const { backend, calls, subscriptions, emails } = buildBackend(state)
    const { env } = createEnv()
    const body = JSON.stringify({
      resource: 'payment', id: 'event_pro_renew_001', type: 'payment.paid', entityId: 'tr_pro_renew_002',
    })
    const res = await runWebhook(worker, mkWebhookRequest({ body }), env)
    await settle()
    backend.restore()
    t(res.status === 200, 'D5 : le webhook de renouvellement repond 200')
    t(res.json && res.json.granted === true, 'D5 : le renouvellement honore le droit (acces prolonge)')
    t(subscriptions.length === 0, 'D5 : AUCUN abonnement cree au renouvellement (pas de double debit)')
    t(!calls.some((c) => c.method === 'POST' && c.url.includes('/v2/customers/')), 'D5 : aucun appel de creation d abonnement')
    t(emails.length === 1, 'D5 : le renouvellement livre un email (jeton renouvele)')
  }

  // ── D6 : URL de webhook par defaut du PHP joignable ─────────────────────
  {
    t(!PHP_SRC.includes('/public/api/mollie-webhook.php'), 'D6 : plus aucune URL /public/api/mollie-webhook.php (404 en live)')
    const defaults = PHP_SRC.split(/\r?\n/).filter((l) => /webhookUrl\s*=/.test(l))
    t(defaults.length >= 2, 'D6 : les deux URL de webhook par defaut sont inspectees')
    t(defaults.every((l) => l.includes('/api/mollie-webhook.php')), 'D6 : les URL de webhook par defaut pointent sur /api/mollie-webhook.php')
  }

  // ── Garde-fous source (le code ne doit pas repasser derriere) ───────────
  {
    t(/async function deliverProAccessEmail/.test(WORKER_SRC), 'SRC : la fonction de livraison existe')
    t(/grantB2B[\s\S]{0,900}token:\s*existingToken/.test(WORKER_SRC), 'SRC : grantB2B rend le jeton existant')
    t(/const delivery = await deliverProAccessEmail/.test(WORKER_SRC), 'SRC : fulfillPaidPayment appelle la livraison')
    t(/accessToken = String\(result\.token \|\| ""\)/.test(WORKER_SRC), 'SRC : la page de retour recupere le jeton')
    t(/if \(metadata\?\.firstPaymentId\) return \{ created: false, reason: "renewal_payment" \}/.test(WORKER_SRC),
      'SRC : un renouvellement ne peut pas creer d abonnement')
    t(/mol_sub_cust_/.test(WORKER_SRC), 'SRC : le marqueur d abonnement est scope CLIENT + OFFRE')
  }

  console.log(`\nP0_PRO_ACCESS_DELIVERY_TESTS PASS (${n} assertions)`)
}

main().catch((error) => { console.error(error); process.exit(1) })

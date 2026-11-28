#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createEnv, jsonResponse, installFetch } = require('./mollie-worker-harness.cjs')
const { buildOffersPage } = require('../../scripts/lib/offers-page.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const SECRET = 'whsec_pro_self_serve'
const PAGES = [
  ['public/pro/pricing/index.html', 'Mensuel', 'Annuel', '79 €/mois', '690 €/an'],
  ['public/pro/en/pricing/index.html', 'Monthly', 'Annual', '$89/month', '$790/year'],
  ['public/pro/es/pricing/index.html', 'Mensual', 'Anual', '$89/mes', '$790/año']
]
const LINKS = {
  pro_monthly_eur: 'https://buy.stripe.com/4gM28rcQCeox7kd6Z2ebu06',
  pro_monthly_usd: 'https://buy.stripe.com/cNi4gzdUGbcl1ZTcjmebu07',
  pro_annual_eur: 'https://buy.stripe.com/cNifZhcQC1BL1ZTbfiebu08',
  pro_annual_usd: 'https://buy.stripe.com/cNi8wP4k6gwF33X4QUebu09'
}
const HOSTS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassummiami.com',
  'sargassumcancun.com',
  'sargassumpuntacana.com',
  'sargazotulum.com'
]

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

function sign(payload) {
  const ts = String(Math.floor(Date.now() / 1000))
  const hex = crypto.createHmac('sha256', SECRET).update(ts + '.' + payload, 'utf8').digest('hex')
  return 't=' + ts + ',v1=' + hex
}

function backend(state) {
  return installFetch(({ url, method, body }) => {
    state.calls.push({ url, method, body })
    if (url.endsWith('/rpc/sg_upsert_payment_grant')) return new Response(null, { status: 204 })
    if (url.includes('/payment_grants') && method === 'POST') {
      state.grants.push(JSON.parse(body || '{}'))
      return jsonResponse([], 201)
    }
    if (url.includes('/payment_grants') && method === 'GET') {
      const sid = /subscription_id=eq\.([^&]+)/.exec(url)
      const rows = state.grants.filter((g) => !sid || g.subscription_id === decodeURIComponent(sid[1]))
      return jsonResponse(rows)
    }
    if (url.includes('/analytics_events')) {
      state.analytics = state.analytics || []
      state.analytics.push(JSON.parse(body || '{}'))
      return new Response(null, { status: 201 })
    }
    if (url === 'https://api.resend.com/emails') {
      state.emails.push(JSON.parse(body || '{}'))
      return jsonResponse({ id: 're_test' }, 200)
    }
    if (url === 'https://api.stripe.com/v1/billing_portal/sessions') {
      state.portals.push(body)
      return jsonResponse({ url: 'https://billing.stripe.com/p/session/live_test' })
    }
    if (url.includes('api.mollie.com')) {
      state.mollie.push(url)
      return jsonResponse({ id: 'tr_no' }, 201)
    }
    return jsonResponse([])
  })
}

async function post(worker, env, event) {
  const raw = JSON.stringify(event)
  const res = await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sign(raw) },
    body: raw
  }), env, { waitUntil() {} })
  return { status: res.status, json: await res.json() }
}

function proEvent(id, objectId) {
  return {
    id,
    type: 'checkout.session.completed',
    livemode: true,
    data: {
      object: {
        id: objectId,
        payment_status: 'paid',
        amount_total: 7900,
        currency: 'eur',
        customer: 'cus_hotel_1',
        customer_details: { email: 'hotel@example.com' },
        metadata: { price_key: 'pro_monthly_eur' },
        subscription: 'sub_hotel_1'
      }
    }
  }
}

async function main() {
  const payJs = fs.readFileSync(path.join(ROOT, 'public/pro/pricing-pay.js'), 'utf8')
  for (const host of HOSTS) t(payJs.includes(host), 'devise selon le domaine ' + host)
  t(payJs.includes('data-usd') && payJs.includes('pricing_view') && payJs.includes('checkout_started'), 'les boutons choisissent le lien et mesurent le clic')

  for (const [rel, month, year, priceA, priceB] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    t(html.includes('>' + month + '<') && html.includes('>' + year + '<'), rel + ' : boutons ' + month + ' et ' + year)
    t(html.includes(priceA) && html.includes(priceB), rel + ' : prix affichés')
    for (const url of Object.values(LINKS)) t(html.includes(url), rel + ' : lien ' + url.slice(-6))
    t(/Après confirmation du paiement|After the payment is confirmed|Tras la confirmación del pago/.test(html), rel + ' : une ligne sur ce qui est livré et comment')
    t(html.includes('data-support') && html.includes('mailto:'), rel + ' : support par e-mail')
    t(!/essai 30|30-day trial|30-day free|prueba gratis|widget gratuit|free widget|widget gratuito|contactez-nous|rendez-vous/i.test(html), rel + ' : pas d\'essai, de widget offert ni de rendez-vous')
    t(html.indexOf('data-eur') < html.indexOf('data-sg-lead') || !html.includes('data-sg-lead'), rel + ' : le paiement n\'est pas derrière un formulaire')
  }

  const offers = buildOffersPage(JSON.parse(fs.readFileSync(path.join(ROOT, 'regions/mq.json'), 'utf8')), '2026-11-09T12:00:00Z')
  t(offers.indexOf('Mensuel') < offers.indexOf('data-sg-lead'), 'le formulaire B2B reste après les deux boutons')
  t(offers.includes(LINKS.pro_monthly_eur) && offers.includes(LINKS.pro_annual_eur), 'la page offres EUR mène aux deux liens Pro')
  t(!/essai|trial|prueba gratis|widget gratuit|widget gratuito|free widget/i.test(offers), 'la page offres ne promet pas un essai ni un widget offert')

  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'workers/sg-payments/index.js')).href)
  const state = { calls: [], grants: [], emails: [], portals: [], mollie: [], analytics: [] }
  const net = backend(state)
  const { env } = createEnv({ env: { STRIPE_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're_test_key' } })
  delete env.STRIPE_SECRET_KEY
  const tracked = await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'CTA_click', livemode: true, correlation_id: 'track_1', price_key: 'pro_monthly_eur' })
  }), env, { waitUntil() {} })
  t(tracked.status === 204, 'Stripe tracking endpoint accepts an allowlisted CTA event')
  t(state.analytics.some((row) => row.event === 'CTA_click' && row.params.hostname === 'sargasses-martinique.com'),
    'Stripe tracking stores the actual request hostname for regional attribution')
  const first = await post(worker, env, proEvent('evt_pro_1', 'cs_pro_1'))
  t(first.status === 200 && first.json.granted === true, 'abonnement Pro payé : accès accordé')
  t(state.emails.length === 1 && state.emails[0].html.includes('/widget/embed/?k='), 'e-mail Resend : accès et code du widget')
  t(state.emails[0].html.includes('répondez à cet e-mail'), 'sans clé secrète Stripe : résiliation par réponse à l\'e-mail')
  t(state.portals.length === 0 && state.mollie.length === 0, 'pas d\'appel au portail ni à Mollie')
  const again = await post(worker, env, proEvent('evt_pro_2', 'cs_pro_1'))
  t(again.status === 200 && state.emails.length === 1, 'le même accès n\'envoie pas un second e-mail')
  net.restore()

  const stateLive = { calls: [], grants: [], emails: [], portals: [], mollie: [] }
  const netLive = backend(stateLive)
  const live = createEnv({ env: { STRIPE_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're_test_key', STRIPE_SECRET_KEY: 'sk_live_example' } })
  const paid = await post(worker, live.env, proEvent('evt_pro_live', 'cs_pro_live'))
  t(paid.json.granted === true && stateLive.emails[0].html.includes('https://billing.stripe.com/p/session/live_test'), 'avec une clé live, l\'e-mail contient le portail client')
  t(!stateLive.emails[0].html.includes('sk_live_example'), 'la clé secrète ne part pas dans l\'e-mail')
  netLive.restore()

  const stateTest = { calls: [], grants: [], emails: [], portals: [], mollie: [] }
  const netTest = backend(stateTest)
  const testKey = createEnv({ env: { STRIPE_WEBHOOK_SECRET: SECRET, RESEND_API_KEY: 're_test_key', STRIPE_SECRET_KEY: 'sk_test_example' } })
  await post(worker, testKey.env, proEvent('evt_pro_testkey', 'cs_pro_testkey'))
  t(stateTest.portals.length === 0 && stateTest.emails[0].html.includes('répondez à cet e-mail'), 'une clé TEST n\'ouvre pas le portail')
  netTest.restore()

  console.log(n + ' checks')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

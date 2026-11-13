#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createEnv, jsonResponse, installFetch } = require('./mollie-worker-harness.cjs')
const { buildOffersPage } = require('../../scripts/lib/offers-page.cjs')
const { STRIPE_LIVE_LINKS } = require('../../scripts/lib/stripe-live-links.cjs')

const ROOT = path.resolve(__dirname, '..', '..')
const SECRET = 'whsec_test_signature_only'
const FLEET = [
  ['sargasses-martinique.com', 'mq', 'eur', ['7,99', '14,99', '24,99', '79', '690']],
  ['sargasses-guadeloupe.com', 'gp', 'eur', ['7,99', '14,99', '24,99', '79', '690']],
  ['sargassummiami.com', 'florida', 'usd', ['8.99', '16.99', '27.99', '89', '790']],
  ['sargassumpuntacana.com', 'puntacana', 'usd', ['8.99', '16.99', '27.99', '89', '790']],
  ['sargassumcancun.com', 'rivieramaya', 'usd', ['8.99', '16.99', '27.99', '89', '790']],
  ['sargazotulum.com', 'tulum', 'usd', ['8.99', '16.99', '27.99', '89', '790']]
]

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }

function sign(payload, secret = SECRET) {
  const ts = String(Math.floor(Date.now() / 1000))
  const hex = crypto.createHmac('sha256', secret).update(ts + '.' + payload, 'utf8').digest('hex')
  return { payload, header: 't=' + ts + ',v1=' + hex }
}

function backend() {
  const state = { grants: [], rpc: [], analytics: [], mollie: [] }
  const net = installFetch(({ url, method, body }) => {
    if (url.includes('api.mollie.com')) {
      state.mollie.push(url)
      return jsonResponse({ id: 'tr_should_not_exist' }, 201)
    }
    if (url.endsWith('/rpc/sg_upsert_payment_grant')) {
      const args = JSON.parse(body || '{}')
      state.rpc.push(args)
      if (!state.grants.some((g) => g.payment_id === args.p_payment_id)) {
        state.grants.push({
          payment_id: args.p_payment_id,
          type: 'b2c_pass',
          pass: args.p_pass,
          email: args.p_email,
          currency: args.p_currency,
          expires_at: args.p_expires_at
        })
      }
      return new Response(null, { status: 204 })
    }
    if (url.includes('/payment_grants')) {
      const q = url.includes('?') ? url.slice(url.indexOf('?')) : ''
      const pid = /payment_id=eq\.([^&]+)/.exec(q)
      const sid = /subscription_id=eq\.([^&]+)/.exec(q)
      if (method === 'POST') {
        state.grants.push(JSON.parse(body || '{}'))
        return jsonResponse([], 201)
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(body || '{}')
        for (const g of state.grants) {
          if (pid && g.payment_id === decodeURIComponent(pid[1])) Object.assign(g, patch)
          if (sid && g.subscription_id === decodeURIComponent(sid[1])) Object.assign(g, patch)
        }
        return jsonResponse([])
      }
      const rows = state.grants.filter((g) =>
        (!pid || g.payment_id === decodeURIComponent(pid[1])) &&
        (!sid || g.subscription_id === decodeURIComponent(sid[1])))
      return jsonResponse(rows)
    }
    if (url.includes('/analytics_events')) {
      state.analytics.push(JSON.parse(body || '{}'))
      return new Response(null, { status: 201 })
    }
    if (url.includes('/sg_users')) return jsonResponse([])
    return jsonResponse([])
  })
  return { state, restore: () => net.restore() }
}

function session(id, extra) {
  return Object.assign({
    id,
    payment_status: 'paid',
    amount_total: 799,
    currency: 'eur',
    client_reference_id: 'ord_' + id,
    customer_details: { email: 'voyageur@example.com' },
    metadata: { price_key: 'trip7_eur', brand: 'sargasses' },
    payment_intent: 'pi_' + id
  }, extra || {})
}

async function post(worker, env, event, opts = {}) {
  const raw = JSON.stringify(event)
  const signed = sign(opts.raw == null ? raw : opts.raw, opts.secret || SECRET)
  const res = await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': opts.header == null ? signed.header : opts.header },
    body: opts.raw == null ? raw : opts.raw
  }), env, { waitUntil() {} })
  let json = null
  try { json = await res.json() } catch (_) { json = null }
  return { status: res.status, json }
}

async function main() {
  const { default: worker } = await import(pathToFileURL(path.join(ROOT, 'workers/sg-payments/index.js')).href)
  const paySrc = fs.readFileSync(path.join(ROOT, 'workers/sg-payments/index.js'), 'utf8')
  const regional = fs.readFileSync(path.join(ROOT, 'workers/sargagame/index.js'), 'utf8')
  t(!paySrc.includes('sk_test') && !regional.includes('sk_test'), 'aucune clé TEST écrite dans les workers')
  t(/function stripeLiveSecret[\s\S]*sk_live_/.test(paySrc), 'le portail client n\'accepte qu\'une clé live')
  t(regional.includes('no_mollie_fallback') && !regional.includes('v2/payments",{method:"POST"'), 'le worker régional ne crée plus de paiement Mollie')

  const merci = fs.readFileSync(path.join(ROOT, 'public/merci/index.html'), 'utf8')
  t(merci.includes('Paiement en cours de confirmation'), '/merci affiche la confirmation tant que le serveur ne répond pas')
  t(!merci.includes('localStorage'), '/merci n\'écrit aucun accès local')
  t(merci.includes("state === 'paid'"), '/merci n\'ouvre l\'écran confirmé que sur l\'état serveur paid')

  {
    const { env } = createEnv({ env: { STRIPE_WEBHOOK_SECRET: SECRET, MOLLIE_API_KEY: 'test_should_not_be_used' } })
    const box = backend()
    for (const [host, , cur] of FLEET) {
      const cents = cur === 'eur' ? 799 : 899
      const res = await worker.fetch(new Request('https://' + host + '/api/mollie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://' + host },
        body: JSON.stringify({ action: 'create_payment', pass: 'trip7', cents, cur: cur.toUpperCase(), email: 'a@b.co' })
      }), env, { waitUntil() {} })
      const json = await res.json()
      t(res.status === 200 && json.provider === 'stripe_link' && String(json.checkoutUrl).includes('buy.stripe.com'), host + ' : lien Stripe ' + cur)
      t(String(json.checkoutUrl).includes('client_reference_id='), host + ' : identifiant de corrélation sur le lien')
    }
    const brief = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://sargasses-martinique.com' },
      body: JSON.stringify({ action: 'create_subscription', plan: 'brief_monthly', email: 'hotel@example.com' })
    }), env, { waitUntil() {} })
    const briefJson = await brief.json()
    t(brief.status === 503 && briefJson.reason === 'no_mollie_fallback', 'sans lien Stripe : erreur explicite, pas de repli')
    t(box.state.mollie.length === 0, 'aucun appel Mollie ni clé TEST sur le chemin public')
    box.restore()
  }

  for (const [domain, id, cur, prices] of FLEET) {
    const region = JSON.parse(fs.readFileSync(path.join(ROOT, 'regions', id + '.json'), 'utf8'))
    const html = buildOffersPage(region, '2026-11-09T12:00:00Z')
    t(html.includes('https://' + domain + '/offres/'), domain + ' : page offres canonique')
    for (const price of prices) t(html.includes(price), domain + ' : prix ' + price)
    const links = Object.values(STRIPE_LIVE_LINKS).filter((row) => row.currency === cur)
    for (const row of links) t(html.includes(row.url) || html.includes(row.url.split('/').pop()), domain + ' : lien ' + row.currency)
    t(html.includes('pricing_view') && html.includes('checkout_started') && html.includes('livemode:true'), domain + ' : événements pricing sans service tiers')
    t(!html.includes('api.mollie.com') && !html.includes('sk_test'), domain + ' : pas de repli Mollie ou TEST')
  }
  t(Object.keys(STRIPE_LIVE_LINKS).length === 10, 'dix liens et dix prix publics')

  const { env, kv } = createEnv({ env: { STRIPE_WEBHOOK_SECRET: SECRET } })
  const box = backend()
  const paid = { id: 'evt_paid', type: 'checkout.session.completed', livemode: true, data: { object: session('cs_paid') } }
  const raw = JSON.stringify(paid)
  const signed = sign(raw)
  const tampered = await post(worker, env, paid, { raw: raw + ' ', header: signed.header })
  t(tampered.status === 400 && tampered.json.error === 'invalid_signature', 'signature invalide sur le corps brut : 400')
  t(box.state.rpc.length === 0, 'signature invalide : aucun accès')

  const ok = await post(worker, env, paid)
  t(ok.status === 200 && ok.json.granted === true && ok.json.livemode === true, 'signature valide et paiement payé : accès accordé')
  const again = await post(worker, env, paid)
  t(again.status === 200 && again.json.duplicate === true && box.state.rpc.length === 1, 'événement en double : un seul accès')
  const stored = JSON.parse(kv.store.get('stripe_evt_evt_paid'))
  t(stored.livemode === true, 'livemode stocké sur l\'événement')
  const status = await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-status?session_id=cs_paid'), env, { waitUntil() {} })
  const statusJson = await status.json()
  t(statusJson.state === 'paid' && statusJson.livemode === true, 'le statut serveur confirme le paiement live')

  const unpaid = await post(worker, env, { id: 'evt_unpaid', type: 'checkout.session.completed', livemode: true, data: { object: session('cs_unpaid', { payment_status: 'unpaid' }) } })
  t(unpaid.json.granted === false && unpaid.json.reason === 'not_paid', 'paiement non payé : pas d\'accès')
  const delayed = await post(worker, env, { id: 'evt_async_ok', type: 'checkout.session.async_payment_succeeded', livemode: true, data: { object: session('cs_async', { payment_status: 'paid', payment_intent: 'pi_async', subscription: 'sub_async' }) } })
  t(delayed.json.granted === true, 'paiement différé réussi : accès accordé')
  const delayedFail = await post(worker, env, { id: 'evt_async_ko', type: 'checkout.session.async_payment_failed', livemode: true, data: { object: session('cs_async_ko', { payment_status: 'unpaid' }) } })
  t(delayedFail.json.granted === false && delayedFail.json.reason === 'payment_failed', 'paiement différé échoué : pas d\'accès')

  const refund = await post(worker, env, { id: 'evt_refund', type: 'charge.refunded', livemode: true, data: { object: { id: 'ch_refund', payment_intent: 'pi_cs_paid' } } })
  t(refund.json.ended === true, 'remboursement : accès retiré')
  const afterRefund = await (await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-status?session_id=cs_paid'), env, { waitUntil() {} })).json()
  t(afterRefund.state === 'ended', 'après remboursement le statut n\'est plus payé')
  const refundAgain = await post(worker, env, { id: 'evt_refund', type: 'charge.refunded', livemode: true, data: { object: { id: 'ch_refund', payment_intent: 'pi_cs_paid' } } })
  t(refundAgain.json.duplicate === true, 'remboursement rejoué : idempotent')

  const dispute = await post(worker, env, { id: 'evt_dispute', type: 'charge.dispute.created', livemode: true, data: { object: { id: 'dp_1', payment_intent: 'pi_async' } } })
  t(dispute.json.ended === true, 'litige : accès retiré')

  const sub = await post(worker, env, {
    id: 'evt_sub',
    type: 'customer.subscription.updated',
    livemode: true,
    data: { object: { id: 'sub_live', status: 'active', customer: 'cus_1', currency: 'eur', metadata: { price_key: 'pro_monthly_eur', email: 'hotel@example.com' }, items: { data: [{ price: { unit_amount: 7900, currency: 'eur' } }] } } }
  })
  t(sub.json.granted === true, 'abonnement actif : accès accordé')
  const invoiceFail = await post(worker, env, { id: 'evt_inv_fail', type: 'invoice.payment_failed', livemode: true, data: { object: { id: 'in_fail', status: 'open', customer_email: 'hotel@example.com' } } })
  t(invoiceFail.json.granted === false, 'facture impayée : pas d\'accès')
  const invoicePaid = await post(worker, env, { id: 'evt_inv_paid', type: 'invoice.paid', livemode: true, data: { object: { id: 'in_paid', status: 'paid', amount_paid: 799, currency: 'eur', customer_email: 'voyageur@example.com', metadata: { price_key: 'trip7_eur' } } } })
  t(invoicePaid.json.granted === true, 'facture payée : accès accordé')
  const deleted = await post(worker, env, { id: 'evt_sub_del', type: 'customer.subscription.deleted', livemode: true, data: { object: { id: 'sub_live', status: 'canceled' } } })
  t(deleted.json.ended === true, 'abonnement supprimé : accès retiré')

  const testMode = await post(worker, env, { id: 'evt_testmode', type: 'checkout.session.completed', livemode: false, data: { object: session('cs_testmode') } })
  t(testMode.json.granted === false && testMode.json.reason === 'not_live', 'événement TEST : aucun accès')
  const testStatus = await (await worker.fetch(new Request('https://sargasses-martinique.com/api/stripe-status?session_id=cs_testmode'), env, { waitUntil() {} })).json()
  t(testStatus.state === 'pending', 'une session TEST reste en confirmation')

  const names = box.state.analytics.map((row) => row.event)
  for (const name of ['payment_success', 'payment_failed', 'entitlement_granted', 'refund']) {
    t(names.includes(name), 'analytics webhook ' + name)
  }
  t(box.state.analytics.every((row) => row.params && typeof row.params.livemode === 'boolean' && row.params.correlation_id && !JSON.stringify(row.params).includes('@')), 'analytics : livemode et corrélation sans email')
  t(box.state.mollie.length === 0, 'le webhook n\'appelle pas Mollie')
  box.restore()

  console.log(n + ' checks')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

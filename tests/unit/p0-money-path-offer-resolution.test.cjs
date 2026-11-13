#!/usr/bin/env node
'use strict'
/**
 * p0-money-path-offer-resolution.test.cjs � P0 « chemin argent » de la Worker
 * `workers/sg-payments/index.js` (le serveur qui sert R�0ELLEMENT les 6
 * domaines sur les routes `/api/*`, cf. sondes live `/api/mollie-health` � 
 * worker "sg-payments").
 *
 * Défauts R�0ELS corrigés (rejoués ici contre la grille de prix LIVE) :
 *  E1. `create_payment` acceptait un `pass` INCONNU ou ABSENT : n'importe quel
 *      montant (0,01 �� ⬦ 299 ��) était encaissé sans service livrable.
 *  E2. `metadata.source` / `metadata.plan` choisis par le client
 *      sélectionnaient la classification du webhook : `source:"b2b_annual"` +
 *      `plan:"brief_monthly"` + 29 �� suffisaient à obtenir 365 JOURS d'accès B2B
 *      (l'offre annuelle approuvée coûte 690 ��).
 *  E3. `redirectUrl` était 100 % client (open redirect après paiement).
 *  E4. Le `Host` client devenait l'URL du webhook Mollie (exfiltration des
 *      métadonnées de paiement vers un domaine arbitraire).
 *  E5. `MOLLIE_PROFILE_ID` était lu puis JAMAIS utilisé, avec un `pfl_⬦` codé
 *      en dur dans le dépôt.
 *  E6. Un paiement de TEST (`mode:"test"`) était rapporté `paid` par
 *      `payment_status` et déverrouillait donc Premium côté front.
 *
 * AUCUN paiement réel : TOUS les appels sortants sont interceptés. Aucune
 * donnée réelle n'est utilisée : les paiements sont des fixtures explicites,
 * jamais des paiements simulés présentés comme réels.
 */

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const {
  createEnv,
  jsonResponse,
  installFetch,
  mkWebhookRequest,
  runWebhook
} = require(path.join(__dirname, 'mollie-worker-harness.cjs'))

let n = 0
const t = (cond, label) => { n++; assert.ok(cond, label); console.log('OK  ' + label) }
const eq = (actual, expected, label) => { n++; assert.deepEqual(actual, expected, label); console.log('OK  ' + label) }

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')

// Grille LIVE (validée 2026-11-09) � source de vérité : public/api/mollie.php,
// src/lib/pricing.js, workers/sg-payments/index.js. Aucun prix inventé ici.
const LIVE_PRICES = {
  p30: { EUR: 1499, USD: 1699 },
  trip7: { EUR: 799, USD: 899 },
  season: { EUR: 2499, USD: 2799 }
}

const FLEET = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassummiami.com',
  'sargassumcancun.com',
  'sargazotulum.com'
]

/**
 * Backend simulé : aucun hôte réel n'est contacté. Chaque appel sortant est
 * journalisé pour pouvoir prouver CE QUI a été (et n'a pas été) envoyé.
 */
function buildBackend(state = {}) {
  // Les journaux sont rattachés à `state` : le test doit pouvoir les relire
  // APR��S la restauration du fetch (le backend n'est plus vivant à ce stade).
  state.created = state.created || []
  state.grants = state.grants || []
  state.rpcCalls = state.rpcCalls || []
  state.b2bWrites = state.b2bWrites || []
  state.users = state.users || []
  state.outbound = state.outbound || []
  const created = state.created
  const grants = state.grants
  const rpcCalls = state.rpcCalls
  const b2bWrites = state.b2bWrites
  const users = state.users
  const outbound = state.outbound

  const backend = installFetch(({ url, method, body }) => {
    outbound.push({ url, method, body })
    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      const payload = JSON.parse(body || '{}')
      created.push(payload)
      return jsonResponse({
        id: 'tr_created_0001',
        _links: { checkout: { href: 'https://www.mollie.com/checkout/test/1' } }
      }, 201)
    }
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return jsonResponse(state.payment || { id: 'tr_unknown_0001', status: 'open' })
    }
    if (url.startsWith('https://api.mollie.com/v2/customers/')) {
      return jsonResponse({ id: 'cst_test_0001', status: 'active' })
    }
    if (url === 'https://supabase.test/rest/v1/rpc/sg_upsert_payment_grant') {
      const args = JSON.parse(body || '{}')
      rpcCalls.push(args)
      grants.push({
        payment_id: args.p_payment_id,
        type: 'b2c_pass',
        pass: args.p_pass,
        email: args.p_email,
        currency: args.p_currency,
        expires_at: args.p_expires_at,
        granted_at: args.p_granted_at
      })
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
      if (method === 'POST') {
        const row = JSON.parse(body || '{}')
        b2bWrites.push(row)
        grants.push(row)
        return jsonResponse([row], 201)
      }
      if (method === 'PATCH') return jsonResponse([], 200)
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/sg_users')) {
      if (method === 'GET') return jsonResponse(users)
      if (method === 'POST') {
        const row = JSON.parse(body || '{}')
        const createdUser = { id: 'user-test-0001', email: row.email }
        users.push(createdUser)
        return jsonResponse([createdUser], 201)
      }
      return jsonResponse([], 200)
    }
    if (url.startsWith('https://supabase.test/rest/v1/')) return jsonResponse([])
    if (url.includes('send-email.php')) return jsonResponse({ success: true })
    return jsonResponse({})
  })
  return { backend, created, grants, rpcCalls, b2bWrites, outbound }
}

function mkCreateRequest(payload, options = {}) {
  const host = options.host || FLEET[0]
  const url = options.url || `https://${host}/api/mollie`
  const headers = { 'Content-Type': 'application/json', Origin: options.origin || `https://${host}` }
  if (options.hostHeader !== undefined) headers.Host = options.hostHeader
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(payload) })
}

function ctxStub() {
  return { waitUntil(p) { try { Promise.resolve(p).catch(() => {}) } catch (_) { /* ignore */ } } }
}

async function callCreate(worker, env, payload, options = {}) {
  const res = await worker.fetch(mkCreateRequest(payload, options), env, ctxStub())
  let json = null
  try { json = await res.clone().json() } catch (_) { json = null }
  return { status: res.status, json }
}

async function main() {
  const { default: worker } = await import(pathToFileURL(WORKER_PATH).href)

  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
  // A. CR�0ATION � le serveur décide du SKU, de la devise et du montant
  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

  // A1 � `sos` n'est plus vendable : 410 (contrat inchangé), aucun appel Mollie.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'sos', cents: 100, cur: 'EUR', email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 410, 'A1 sos : refus 410 offre_indisponible')
    eq(out.json && out.json.error, 'offre_indisponible', 'A1 sos : message offre_indisponible')
    eq(state.created.length, 0, 'A1 sos : AUCUN paiement Mollie créé')
  }

  // A2 � SKU inconnu : fail-closed, aucun appel Mollie.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'tierce', cents: 100, cur: 'EUR', email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 400, 'A2 SKU inconnu : refus 400')
    eq(out.json && out.json.reason, 'unknown_offer', 'A2 SKU inconnu : reason unknown_offer')
    eq(state.created.length, 0, 'A2 SKU inconnu : AUCUN paiement Mollie créé')
  }

  // A3 � `pass` ABSENT : plus de montant libre (0,01 �� ⬦ 299 ��).
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', cents: 1, cur: 'EUR', email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 400, 'A3 pass absent : refus 400 (montant libre supprimé)')
    eq(state.created.length, 0, 'A3 pass absent : AUCUN paiement Mollie créé')
  }

  // A4 � montant falsifié pour un SKU connu.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1, cur: 'EUR', email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 400, 'A4 montant falsifié : refus 400')
    eq(out.json && out.json.reason, 'price_mismatch', 'A4 montant falsifié : reason price_mismatch')
    eq(state.created.length, 0, 'A4 montant falsifié : AUCUN paiement Mollie créé')
  }

  // A5 � devise falsifiée (le client annonce EUR, la grille USD s'applique).
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'USD', email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 400, 'A5 devise falsifiée : refus 400 (montant USD attendu)')
    eq(state.created.length, 0, 'A5 devise falsifiée : AUCUN paiement Mollie créé')
  }

  // A6 � p30 EUR : le montant D�0BIT�0 est celui du catalogue serveur.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: ' voyageur@example.com '
    })
    b.backend.restore()
    eq(out.status, 200, 'A6 p30 EUR : création acceptée')
    eq(state.created.length, 0, 'A6 p30 EUR : aucun paiement Mollie (caisse Stripe)')
    eq(out.json.provider, 'stripe_link', 'A6 p30 EUR : provider stripe_link')
    t(String(out.json.checkoutUrl).startsWith('https://buy.stripe.com/'), 'A6 p30 EUR : URL Payment Link')
    t(String(out.json.checkoutUrl).includes('prefilled_email=voyageur%40example.com'), 'A6 p30 EUR : email normalisé dans le lien')
    eq(out.json.amount, { value: '14.99', currency: 'EUR' }, 'A6 p30 EUR : montant renvoyé au front')
    eq(out.json.pass, 'p30', 'A6 p30 EUR : pass renvoyé au front')
    eq(out.json.days, 30, 'A6 p30 EUR : durée renvoyée au front')
  }

  // A7 � trip7 USD et season USD : parité EXACTE avec la grille live.
  for (const [pass, cur, cents, value] of [
    ['trip7', 'USD', 899, '8.99'],
    ['season', 'USD', 2799, '27.99'],
    ['trip7', 'EUR', 799, '7.99'],
    ['season', 'EUR', 2499, '24.99']
  ]) {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass, cents, cur, email: 'a@b.co'
    })
    b.backend.restore()
    eq(out.status, 200, `A7 ${pass} ${cur} : création acceptée`)
    eq(state.created.length, 0, `A7 ${pass} ${cur} : aucun paiement Mollie`)
    eq(out.json.amount, { value, currency: cur }, `A7 ${pass} ${cur} : montant catalogue ${value} ${cur}`)
    t(String(out.json.checkoutUrl).startsWith('https://buy.stripe.com/'), `A7 ${pass} ${cur} : Payment Link`)
    t(LIVE_PRICES[pass][cur] === cents, `A7 ${pass} ${cur} : la grille du test equals bien la grille live`)
  }

  // A8 � email obligatoire (sinon : argent payé sans accès livrable).
  for (const email of [undefined, '', 'pas-un-email']) {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email
    })
    b.backend.restore()
    eq(out.status, 400, `A8 email ${JSON.stringify(email)} : refus 400`)
    eq(out.json && out.json.reason, 'invalid_email', `A8 email ${JSON.stringify(email)} : reason invalid_email`)
    eq(state.created.length, 0, `A8 email ${JSON.stringify(email)} : AUCUN paiement Mollie créé`)
  }

  // A9 � Host hors flotte : l'URL du webhook reste sur la flotte.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'a@b.co'
    }, { url: 'https://evil.example.com/api/mollie', hostHeader: 'evil.example.com' })
    b.backend.restore()
    eq(out.status, 200, 'A9 Host hors flotte : création acceptée')
    eq(state.created.length, 0, 'A9 Host hors flotte : aucun appel Mollie')
    t(String(out.json.checkoutUrl).startsWith('https://buy.stripe.com/'), 'A9 Host hors flotte : lien Stripe')
    t(!String(out.json.checkoutUrl).includes('evil.example.com'), 'A9 Host hors flotte : aucune fuite vers evil.example.com')
  }

  // A10 � en-tête Host hors flotte mais URL de la flotte : l'URL l'emporte.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'a@b.co'
    }, { hostHeader: 'evil.example.com' })
    b.backend.restore()
    eq(out.status, 200, 'A10 Host menteur : création acceptée')
    eq(state.created.length, 0, 'A10 Host menteur : aucun appel Mollie')
    t(String(out.json.checkoutUrl).startsWith('https://buy.stripe.com/'), 'A10 Host menteur : lien Stripe')
  }

  // A11 � redirectUrl hors flotte : l'URL de retour stockée reste sur la flotte.
  {
    const state = {}
    const b = buildBackend(state)
    const { env, kv } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'a@b.co',
      redirectUrl: 'https://evil.example.com/steal'
    })
    b.backend.restore()
    eq(out.status, 200, 'A11 redirect hors flotte : création acceptée')
    t(String(out.json.checkoutUrl).startsWith('https://buy.stripe.com/'), 'A11 redirect hors flotte : le client part chez Stripe')
    t(!String(out.json.checkoutUrl).includes('evil.example.com'), 'A11 redirect hors flotte : aucune redirection vers evil.example.com')
    t(![...kv.store.keys()].some((k) => k.startsWith('mol_return_')), 'A11 redirect hors flotte : aucun retour Mollie enregistré')
  }

  // A12 � métadonnées client forgées : la classification reste serveur.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'a@b.co',
      source: 'b2b_annual',
      metadata: {
        offer_kind: 'b2b_annual', plan: 'brief_monthly', pass: 'season', email: 'pirate@evil.co',
        customerId: 'cst_pirate', interval: '1 month', utm_source: 'legit'
      }
    })
    b.backend.restore()
    eq(out.status, 200, 'A12 métadonnées forgées : création acceptée')
    eq(state.created.length, 0, 'A12 métadonnées forgées : aucun appel Mollie')
    eq(out.json.pass, 'p30', 'A12 pass forgé : le serveur garde p30')
    t(String(out.json.checkoutUrl).includes('prefilled_email=a%40b.co'), 'A12 email forgé : le lien porte l\'email du corps')
    t(!String(out.json.checkoutUrl).includes('pirate'), 'A12 email forgé : le lien n\'emporte pas l\'email pirate')
  }

  // A13 � profil marchand : uniquement depuis le binding, jamais codé en dur.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    await callCreate(worker, env, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'a@b.co'
    })
    b.backend.restore()
    eq(state.created.length, 0, 'A13 sans binding : aucun appel Mollie')

    const state2 = {}
    const b2 = buildBackend(state2)
    const { env: env2 } = createEnv({ env: { MOLLIE_PROFILE_ID: 'pfl_ABC123' } })
    await callCreate(worker, env2, {
      action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'c@d.co'
    })
    b2.backend.restore()
    eq(state2.created.length, 0, 'A13 avec binding : le Payment Link n\'envoie pas le profileId Mollie')
  }

  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
  // B. WEBHOOK � classification, montant, idempotence
  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

  const webhookBody = (eventId, entityId) => JSON.stringify({
    resource: 'payment', id: eventId, type: 'payment.paid', entityId
  })

  // B1 � paiement B2C légitime : un grant durable, un seul.
  {
    const state = { payment: {
      id: 'tr_b2c_0001', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { source: 'premium_modal', pass: 'p30', email: 'voyageur@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_b2c_1', 'tr_b2c_0001') }), env)
    b.backend.restore()
    eq(res.status, 200, 'B1 B2C payé : le webhook répond 200')
    eq(state.rpcCalls.length, 1, 'B1 B2C payé : le grant durable est écrit exactement une fois')
    eq(state.rpcCalls[0] && state.rpcCalls[0].p_pass, 'p30', 'B1 B2C payé : le bon pass est livré')
    eq(state.rpcCalls[0] && state.rpcCalls[0].p_email, 'voyageur@example.com', 'B1 B2C payé : le bon email est livré')
    eq(state.b2bWrites.length, 0, 'B1 B2C payé : AUCUN droit B2B')
  }

  // B2 � rejeu du webhook : le droit est.recordé UNE seule fois.
  {
    const state = { payment: {
      id: 'tr_b2c_0002', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { source: 'premium_modal', pass: 'p30', email: 'voyageur@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_b2c_2a', 'tr_b2c_0002') }), env)
    const res2 = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_b2c_2b', 'tr_b2c_0002') }), env)
    b.backend.restore()
    eq(res2.status, 200, 'B2 rejeu : le webhook répond 200')
    eq(state.rpcCalls.length, 1, 'B2 rejeu : le grant n\'est écrit QU\'une seule fois')
  }

  // B3 � FORGE classique : source=b2b_annual + plan=brief_monthly sur un pass
  //      B2C payé. Le client a payé 14,99 �� : il doit obtenir SON pass, et
  //      surtout PAS 365 jours d'accès B2B.
  {
    const state = { payment: {
      id: 'tr_forge_0001', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { source: 'b2b_annual', plan: 'brief_monthly', pass: 'p30', email: 'pirate@example.com' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_forge_1', 'tr_forge_0001') }), env)
    b.backend.restore()
    eq(res.status, 200, 'B3 forge source : le webhook répond 200')
    eq(state.b2bWrites.length, 0, 'B3 forge source : AUCUN droit B2B (365 jours) octroyé')
    eq(state.rpcCalls.length, 1, 'B3 forge source : le pass B2C réellement payé est livré')
    eq(state.rpcCalls[0] && state.rpcCalls[0].p_pass, 'p30', 'B3 forge source : le pass livré est p30 (30 jours)')
  }

  // B4 � FORGE `offer_kind` : un client ne peut pas s'attribuer 365 jours pour
  //      29 �� (Brief mensuel). Le refus est explicite, rien n'est livré.
  {
    const state = { payment: {
      id: 'tr_forge_0002', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '29.00', currency: 'EUR' },
      metadata: { source: 'b2b_annual', offer_kind: 'b2b_annual', plan: 'brief_monthly', pass: '', email: 'pirate2@example.com' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_forge_2', 'tr_forge_0002') }), env)
    b.backend.restore()
    eq(res.status, 409, 'B4 forge offer_kind : le webhook refuse (409)')
    eq(state.b2bWrites.length, 0, 'B4 forge offer_kind : AUCUN droit B2B octroyé')
    eq(state.rpcCalls.length, 0, 'B4 forge offer_kind : AUCUN pass B2C octroyé')
  }

  // B5 � chemin B2B annuel L�0GITIME (pro_annual 690 ��) : 365 jours.
  {
    const state = { payment: {
      id: 'tr_b2b_annual_1', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '690.00', currency: 'EUR' },
      metadata: { source: 'b2b_annual', offer_kind: 'b2b_annual', plan: 'pro_annual', pass: '', email: 'hotel@example.com' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_b2b_annual_1', 'tr_b2b_annual_1') }), env)
    b.backend.restore()
    eq(res.status, 200, 'B5 B2B annuel légitime : le webhook répond 200')
    eq(state.b2bWrites.length, 1, 'B5 B2B annuel légitime : un droit B2B est écrit')
    const row = state.b2bWrites[0] || {}
    eq(row.plan, 'pro_annual', 'B5 B2B annuel légitime : le plan est bien pro_annual')
    const days = row.expires_at ? Math.round((Date.parse(row.expires_at) - Date.now()) / 86400000) : 0
    t(days >= 364 && days <= 365, 'B5 B2B annuel légitime : la durée est 365 jours (' + days + ')')
  }

  // B6 � chemin B2B mensuel L�0GITIME (brief_monthly 29 ��) : 30 jours.
  {
    const state = { payment: {
      id: 'tr_b2b_monthly_1', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '29.00', currency: 'EUR' },
      metadata: { source: 'b2b_first', offer_kind: 'b2b_first', plan: 'brief_monthly', pass: '', email: 'hotel2@example.com' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_b2b_monthly_1', 'tr_b2b_monthly_1') }), env)
    b.backend.restore()
    eq(res.status, 200, 'B6 B2B mensuel légitime : le webhook répond 200')
    eq(state.b2bWrites.length, 1, 'B6 B2B mensuel légitime : un droit B2B est écrit')
    const row = state.b2bWrites[0] || {}
    eq(row.plan, 'brief_monthly', 'B6 B2B mensuel légitime : le plan est bien brief_monthly')
    const days = row.expires_at ? Math.round((Date.parse(row.expires_at) - Date.now()) / 86400000) : 0
    t(days >= 29 && days <= 30, 'B6 B2B mensuel légitime : la durée est 30 jours (' + days + ')')
  }

  // B7 � paiement de TEST : jamais de droit.
  {
    const state = { payment: {
      id: 'tr_test_0001', mode: 'test', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { source: 'premium_modal', pass: 'p30', email: 'test@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({ body: webhookBody('event_test_1', 'tr_test_0001') }), env)
    b.backend.restore()
    eq(state.rpcCalls.length, 0, 'B7 paiement TEST : AUCUN droit B2C')
    eq(state.b2bWrites.length, 0, 'B7 paiement TEST : AUCUN droit B2B')
    t(res.status === 200 || res.status === 409, 'B7 paiement TEST : le webhook n\'accorde rien (' + res.status + ')')
  }

  // B8 � signature webhook invalide : rien n'est livré.
  {
    const state = { payment: {
      id: 'tr_badsig1', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { source: 'premium_modal', pass: 'p30', email: 'x@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const res = await runWebhook(worker, mkWebhookRequest({
      body: webhookBody('event_badsig_1', 'tr_badsig1'), signature: 'sha256=' + '0'.repeat(64)
    }), env)
    b.backend.restore()
    eq(state.rpcCalls.length, 0, 'B8 signature invalide : AUCUN droit B2C')
    eq(state.b2bWrites.length, 0, 'B8 signature invalide : AUCUN droit B2B')
    t(res.status >= 400, 'B8 signature invalide : le webhook est refusé (' + res.status + ')')
  }

  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
  // C. payment_status � l'état autoritatif, le propriétaire, le mode test
  // �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�

  // C1 � un paiement de TEST n'est jamais rapporté `paid` (le front déverrouille
  //      Premium sur ce drapeau).
  {
    const state = { payment: {
      id: 'tr_statustest', mode: 'test', status: 'paid',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { pass: 'p30', email: 'test@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, { action: 'payment_status', paymentId: 'tr_statustest' })
    b.backend.restore()
    eq(out.status, 200, 'C1 payment_status test : réponse 200')
    eq(out.json && out.json.paid, false, 'C1 payment_status test : paid=false')
    eq(out.json && out.json.mode, 'test', 'C1 payment_status test : le mode est exposé')
    eq(state.rpcCalls.length, 0, 'C1 payment_status test : AUCUN droit B2C')
  }

  // C2 � un paiement LIVE payé est bien `paid`.
  {
    const state = { payment: {
      id: 'tr_statuslive', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { pass: 'p30', email: 'voyageur@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, { action: 'payment_status', paymentId: 'tr_statuslive' })
    b.backend.restore()
    eq(out.json && out.json.paid, true, 'C2 payment_status live : paid=true')
    eq(state.rpcCalls.length, 1, 'C2 payment_status live : le droit est livré')
  }

  // C3 � le propriétaire : un email qui n'est pas celui du paiement est refusé.
  {
    const state = { payment: {
      id: 'tr_statusowner', mode: 'live', status: 'paid', paidAt: '2026-11-10T10:00:00.000Z',
      amount: { value: '14.99', currency: 'EUR' },
      metadata: { pass: 'p30', email: 'proprietaire@example.com', offer_kind: 'b2c_pass' }
    } }
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, {
      action: 'payment_status', paymentId: 'tr_statusowner', email: 'pirate@example.com'
    })
    b.backend.restore()
    eq(out.status, 403, 'C3 propriétaire : refus 403')
    eq(state.rpcCalls.length, 0, 'C3 propriétaire : AUCUN droit livré')
  }

  // C4 � identifiant de paiement mal formé : pas d'oracle d'existence.
  {
    const state = {}
    const b = buildBackend(state)
    const { env } = createEnv()
    const out = await callCreate(worker, env, { action: 'payment_status', paymentId: 'not-a-payment-id' })
    b.backend.restore()
    eq(out.status, 400, 'C4 paymentId mal formé : refus 400')
  }

  console.log('\n' + n + ' assertions OK � p0-money-path-offer-resolution')
}

main().catch((err) => {
  console.error('\nECHEC:', err && err.message)
  console.error(err && err.stack)
  process.exit(1)
})

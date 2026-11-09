#!/usr/bin/env node
'use strict'
/**
 * p0-money-path-offer-resolution.test.cjs — P0 « chemin argent » de la Worker
 * `workers/sg-payments/index.js` (script qui sert reellement les 6 domaines
 * sur les routes /api/*, cf. sondes live `/api/mollie-health` -> worker
 * "sg-payments").
 *
 * DEFAUTS REELS PROUVES (avant correctif) :
 *  E1. `create_payment` court-circuitait l'allowlist des prix quand le `pass`
 *      etait INCONNU ou ABSENT : n'importe quel montant (0,01 € … 299 €) etait
 *      accepte et un vrai paiement Mollie etait cree.
 *  E2. `metadata.source` et `metadata.plan` venaient du CLIENT et
 *      selectionnaient la classification du webhook : `source:"b2b_annual"` +
 *      `plan:"brief_monthly"` + 29 € suffisaient a obtenir 365 JOURS d'acces
 *      B2B (l'offre annuelle approuvee coute 290/690/1990 €).
 *  E3. `redirectUrl` etait 100 % client : open redirect / phishing apres
 *      paiement, vers n'importe quel domaine.
 *  E4. Le `Host` client devenait l'URL du webhook Mollie : exfiltration des
 *      metadonnees de paiement vers un domaine arbitraire.
 *  E5. `MOLLIE_PROFILE_ID` etait lu puis JAMAIS utilise : les paiements
 *      n'etaient pas rattaches au profil marchand Sargasses.
 *  E6. Le SKU `sos` (1,00 EUR / 24 h, deja vendu par src/SOSPlage.jsx et
 *      deja tarife 1,00 EUR par public/api/mollie.php) etait ABSENT de
 *      l'allowlist : paiement encaisse, AUCUN acces livre (paid_no_grant).
 *  E7. `sargazotulum.com` (6e domaine) etait absent de ALLOWED_ORIGINS /
 *      ALLOWED_HOSTS.
 *  E8. `payment_status` ne distinguait pas un paiement Mollie de TEST : un
 *      paiement `mode:"test"` pouvait deverrouiller Premium cote navigateur.
 *
 * AUCUN paiement reel, AUCUN appel reseau reel, AUCUNE donnee client : le
 * `fetch` global est intercepte et toute destination non autorisee leve une
 * erreur. Les fixtures sont explicites et fictives.
 */

const assert = require('node:assert/strict')
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
const t = (cond, label) => {
  n++
  assert.ok(cond, label)
  console.log('OK  ' + label)
}

const WORKER_PATH = path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'index.js')

// ── Backend simulé ────────────────────────────────────────────────────────────
function buildBackend(state = {}) {
  const createCalls = state.createCalls || []
  const grants = state.grants || []
  const rpcCalls = state.rpcCalls || []
  const unmocked = state.unmocked || []

  const backend = installFetch(({ url, method, body }) => {
    if (url === 'https://api.mollie.com/v2/payments' && method === 'POST') {
      createCalls.push(JSON.parse(body || '{}'))
      return jsonResponse({
        id: 'tr_p0_money_path',
        _links: { checkout: { href: 'https://checkout.mollie.test/p0' } },
      })
    }
    if (url.startsWith('https://api.mollie.com/v2/payments/')) {
      return jsonResponse(state.payment)
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
        granted_at: args.p_granted_at,
      }
      if (!grants.some((g) => g.payment_id === row.payment_id)) grants.push(row)
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://supabase.test/rest/v1/payment_grants')) {
      if (method === 'GET') {
        const q = url.slice(url.indexOf('?'))
        const paymentId = /payment_id=eq\.([^&]+)/.exec(q)
        const rows = grants.filter((g) => !paymentId || g.payment_id === decodeURIComponent(paymentId[1]))
        return jsonResponse(rows)
      }
      if (method === 'POST') {
        const rows = state.grantWrites || []
        rows.push(JSON.parse(body || '{}'))
        state.grantWrites = rows
      }
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://supabase.test/rest/v1/sg_users')) {
      return jsonResponse([])
    }
    unmocked.push(url)
    throw new Error('UNEXPECTED outbound request: ' + method + ' ' + url)
  })
  return backend
}

async function createPayment(worker, env, body, opts = {}) {
  const headers = { 'content-type': 'application/json' }
  if (opts.origin) headers['Origin'] = opts.origin
  if (opts.host) headers['Host'] = opts.host
  const request = new Request(opts.url || 'https://sargasses-martinique.com/api/mollie.php', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const response = await worker.fetch(request, env, { waitUntil() {} })
  let json = null
  try { json = await response.clone().json() } catch (_) { json = null }
  return { status: response.status, json }
}

async function main() {
  const worker = (await import(pathToFileURL(WORKER_PATH).href)).default

  console.log('\n=== P0 money path — resolution serveur de l\'offre ===\n')

  // ── E1 : SKU inconnu / absent => refus, AUCUN paiement cree ────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const unknown = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30x', cents: 100, cur: 'EUR', email: 'x@example.com',
      })
      t(unknown.status === 400, 'SKU inconnu => HTTP 400')
      t(unknown.json && unknown.json.error === 'Prix invalide', 'SKU inconnu => message public "Prix invalide"')
      t(unknown.json && unknown.json.reason === 'unknown_offer', 'SKU inconnu => reason technique unknown_offer')

      const missing = await createPayment(worker, env, {
        action: 'create_payment', cents: 100, cur: 'EUR', email: 'x@example.com',
      })
      t(missing.status === 400 && missing.json.reason === 'unknown_offer', 'pass absent => HTTP 400 unknown_offer')

      const legacy = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p7', cents: 799, cur: 'EUR', email: 'x@example.com',
      })
      t(legacy.status === 400 && legacy.json.reason === 'unknown_offer', 'SKU historique p7 => toujours refuse')

      t(state.createCalls.length === 0, 'SKU inconnu/absent/p7 => 0 appel Mollie (aucun paiement cree)')
      t(state.unmocked.length === 0, 'aucune destination inattendue')
    } finally {
      backend.restore()
    }
  }

  // ── E1 bis : montant serveur = montant catalogue ───────────────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const under = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cents: 100, cur: 'EUR', email: 'x@example.com',
      })
      t(under.status === 400 && under.json.reason === 'price_mismatch', 'p30 a 1,00 EUR => HTTP 400 price_mismatch')

      const over = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cents: 99999, cur: 'EUR', email: 'x@example.com',
      })
      t(over.status === 400 && over.json.reason === 'price_mismatch', 'p30 a 999,99 EUR => HTTP 400 price_mismatch')

      const noAmount = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cur: 'EUR', email: 'x@example.com',
      })
      t(noAmount.status === 400 && noAmount.json.reason === 'amount_required', 'p30 sans montant => HTTP 400 amount_required')

      t(state.createCalls.length === 0, 'montant non conforme => 0 appel Mollie')
    } finally {
      backend.restore()
    }
  }

  // ── Catalogue : les 4 offres attendues, au prix canonique ─────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const cases = [
        { pass: 'p30', cents: 1499, cur: 'EUR', value: '14.99', currency: 'EUR' },
        { pass: 'trip7', cents: 499, cur: 'EUR', value: '4.99', currency: 'EUR' },
        { pass: 'season', cents: 1999, cur: 'EUR', value: '19.99', currency: 'EUR' },
        { pass: 'sos', cents: 100, cur: 'EUR', value: '1.00', currency: 'EUR' },
      ]
      for (const c of cases) {
        const r = await createPayment(worker, env, {
          action: 'create_payment', pass: c.pass, cents: c.cents, cur: c.cur, email: 'buyer@example.com',
        })
        t(r.status === 200, c.pass + ' creatible au prix canonique')
        const sent = state.createCalls[state.createCalls.length - 1]
        t(sent && sent.amount.value === c.value && sent.amount.currency === c.currency,
          c.pass + ' : montant debite = ' + c.value + ' ' + c.currency)
        t(sent && sent.metadata.pass === c.pass, c.pass + ' : metadata.pass = ' + c.pass)
      }
      t(state.createCalls.length === 4, '4 paiements crees (un par offre)')
    } finally {
      backend.restore()
    }
  }

  // ── E2 : le client ne peut plus selectionner le chemin B2B ─────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const r = await createPayment(worker, env, {
        action: 'create_payment',
        pass: 'p30',
        cents: 2900,
        cur: 'EUR',
        email: 'attacker@example.com',
        source: 'b2b_annual',
        metadata: { plan: 'brief_monthly', offer_kind: 'b2b_annual', pass: 'season' },
      })
      t(r.status === 400 && r.json.reason === 'price_mismatch',
        'source=b2b_annual + plan=brief_monthly + 29,00 EUR => refuse (price_mismatch)')
      t(state.createCalls.length === 0, 'escalade B2B 29 EUR => 0 paiement cree')

      const legit = await createPayment(worker, env, {
        action: 'create_payment',
        pass: 'p30',
        cents: 1499,
        cur: 'EUR',
        email: 'buyer@example.com',
        source: 'b2b_annual',
        metadata: { plan: 'brief_monthly', offer_kind: 'b2b_annual', beach: 'saline' },
      })
      t(legit.status === 200, 'une offre B2C au bon prix reste creatible')
      const sent = state.createCalls[state.createCalls.length - 1]
      t(sent && sent.metadata.offer_kind === 'b2c_pass', 'metadata.offer_kind impose par le serveur = b2c_pass')
      t(sent && !('plan' in sent.metadata), 'metadata.plan client supprime')
      t(sent && sent.metadata.source === 'b2b_annual', 'metadata.source conserve (attribution de canal, non classante)')
      t(sent && sent.metadata.beach === 'saline', 'metadata utile du client conserve')
      t(sent && sent.amount.value === '14.99', 'le montant debite reste celui du catalogue (14.99)')
    } finally {
      backend.restore()
    }
  }

  // ── E3 / E4 : redirectUrl et Host ──────────────────────────────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const evil = await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 499, cur: 'EUR', email: 'evil@example.com',
        redirectUrl: 'https://evil.example/steal',
      })
      t(evil.status === 200, 'redirection hors flotte : le paiement reste creatable')
      let sent = state.createCalls[state.createCalls.length - 1]
      t(sent && !sent.redirectUrl.includes('evil.example'), 'redirectUrl hors flotte ecarte')
      t(sent && sent.redirectUrl.startsWith('https://sargasses-martinique.com/'), 'redirectUrl de repli sur un domaine de la flotte')

      const fleet = await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 499, cur: 'EUR', email: 'tulum@example.com',
        redirectUrl: 'https://sargazotulum.com/?mollie_return=1',
      })
      t(fleet.status === 200, 'redirection sur le 6e domaine (Tulum) acceptee')
      sent = state.createCalls[state.createCalls.length - 1]
      t(sent && sent.redirectUrl === 'https://sargazotulum.com/?mollie_return=1', 'redirectUrl Tulum conservee')

      const spoof = await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 499, cur: 'EUR', email: 'spoof@example.com',
      }, { host: 'evil.example' })
      t(spoof.status === 200, 'Host usurpe : le paiement reste creatable')
      sent = state.createCalls[state.createCalls.length - 1]
      t(sent && !sent.webhookUrl.includes('evil.example'), 'webhookUrl jamais sur un Host usurpe')
      t(sent && sent.webhookUrl === 'https://sargasses-martinique.com/api/mollie-webhook', 'webhookUrl sur un domaine de la flotte')
    } finally {
      backend.restore()
    }
  }

  // ── E5 : profil marchand ───────────────────────────────────────────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    try {
      const { env } = createEnv({ env: { MOLLIE_PROFILE_ID: 'pfl_t8KCk4Cm2C' } })
      await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 499, cur: 'EUR', email: 'buyer@example.com',
      })
      const withProfile = state.createCalls[state.createCalls.length - 1]
      t(withProfile && withProfile.profileId === 'pfl_t8KCk4Cm2C', 'MOLLIE_PROFILE_ID utilise (profil marchand rattache)')

      const state2 = { createCalls: [], unmocked: [] }
      const backend2 = buildBackend(state2)
      const { env: env2 } = createEnv({ env: { MOLLIE_PROFILE_ID: 'valeur-bidon' } })
      await createPayment(worker, env2, {
        action: 'create_payment', pass: 'trip7', cents: 499, cur: 'EUR', email: 'buyer@example.com',
      })
      const noProfile = state2.createCalls[state2.createCalls.length - 1]
      t(noProfile && !('profileId' in noProfile), 'profil mal forme => aucun profileId envoye')
      backend2.restore()
    } finally {
      backend.restore()
    }
  }

  // ── Devises : USD (base + surcharge de saison) et offres non vendues ───────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const usdTrip = await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 599, cur: 'USD', email: 'buyer@example.com',
      })
      t(usdTrip.status === 200, 'Trip Pass USD a 5,99 $ reste creatable (offre existante)')
      let sent = state.createCalls[state.createCalls.length - 1]
      t(sent && sent.amount.value === '5.99' && sent.amount.currency === 'USD', 'Trip Pass USD : 5.99 USD')

      const usdTripBad = await createPayment(worker, env, {
        action: 'create_payment', pass: 'trip7', cents: 100, cur: 'USD', email: 'buyer@example.com',
      })
      t(usdTripBad.status === 400 && usdTripBad.json.reason === 'price_mismatch', 'Trip Pass USD a 1,00 $ => refuse')

      const seasonUsd = await createPayment(worker, env, {
        action: 'create_payment', pass: 'season', cents: 1499, cur: 'USD', email: 'buyer@example.com',
      })
      t(seasonUsd.status === 400 && seasonUsd.json.reason === 'price_mismatch', 'Pass Saison USD (non vendu) => refuse')

      const sosUsd = await createPayment(worker, env, {
        action: 'create_payment', pass: 'sos', cents: 100, cur: 'USD', email: '',
      })
      t(sosUsd.status === 400 && sosUsd.json.reason === 'price_mismatch', 'SOS USD (non vendu) => refuse')

      const p30Usd = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cents: 1199, cur: 'USD', email: 'buyer@example.com',
      })
      t(p30Usd.status === 200, 'Pass 30 j USD creatable au prix de base (11,99 $)')
      sent = state.createCalls[state.createCalls.length - 1]
      const month = new Date().getMonth() + 1
      const expected = month >= 6 && month <= 11 ? '13.79' : '11.99'
      t(sent && sent.amount.value === expected,
        'Pass 30 j USD : montant EFFECTIF = ' + expected + ' (surcharge de saison appliquee par le serveur)')
    } finally {
      backend.restore()
    }
  }

  // ── Email : obligatoire hors SOS (sinon argent paye sans acces livre) ─────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const noEmail = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: '',
      })
      t(noEmail.status === 400 && noEmail.json.reason === 'invalid_email',
        'pass achetable sans email => HTTP 400 invalid_email')
      t(state.createCalls.length === 0, 'pass achetable sans email => 0 paiement cree')

      const badEmail = await createPayment(worker, env, {
        action: 'create_payment', pass: 'p30', cents: 1499, cur: 'EUR', email: 'pas-un-email',
      })
      t(badEmail.status === 400 && badEmail.json.reason === 'invalid_email',
        'pass achetable avec email mal forme => HTTP 400 invalid_email')

      const sosNoEmail = await createPayment(worker, env, {
        action: 'create_payment', pass: 'sos', cents: 100, cur: 'eur', email: '',
        source: 'sos_plage',
        metadata: { beach: 'saline', beachName: 'Saline' },
        redirectUrl: 'https://sargasses-martinique.com/?mollie_return=1',
      })
      t(sosNoEmail.status === 200, 'SOS (offre sans email) : paiement cree avec email vide')
      const sosSent = state.createCalls[state.createCalls.length - 1]
      t(sosSent && sosSent.metadata.email === '', 'SOS : metadata.email vide (offre sans email)')
      t(sosSent && sosSent.metadata.beach === 'saline', 'SOS : metadata beach conserve')
      t(sosSent && sosSent.amount.value === '1.00' && sosSent.amount.currency === 'EUR', 'SOS : 1.00 EUR debite')
    } finally {
      backend.restore()
    }
  }

  // ── Contrat de reponse : montant EFFECTIF renvoye au client ───────────────
  {
    const state = { createCalls: [], unmocked: [] }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const r = await createPayment(worker, env, {
        action: 'create_payment', pass: 'season', cents: 1999, cur: 'EUR', email: 'buyer@example.com',
      })
      t(r.status === 200, 'saison EUR : paiement cree')
      t(r.json && r.json.amount && r.json.amount.value === '19.99' && r.json.amount.currency === 'EUR',
        'reponse : montant EFFECTIF renvoye (mesure sg_price_mismatch du front)')
      t(r.json && r.json.pass === 'season', 'reponse : SKU renvoye')
      t(r.json && r.json.days === 210, 'reponse : duree du pass renvoyee')
      t(r.json && /^tr_.+$/.test(String(r.json.paymentId || '')), 'reponse : paymentId renvoye')
    } finally {
      backend.restore()
    }
  }

  // ── E8 : payment_status distingue le mode TEST ─────────────────────────────
  {
    const state = { unmocked: [] }
    state.payment = { id: 'tr_test_mode', mode: 'test', status: 'paid', paidAt: '2026-11-08T10:00:00Z', amount: { value: '14.99', currency: 'EUR' } }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const r = await createPayment(worker, env, { action: 'payment_status', paymentId: 'tr_test_mode' })
      t(r.status === 200, 'payment_status : HTTP 200')
      t(r.json && r.json.paid === false, 'paiement Mollie de TEST => paid=false (aucun Premium)')
      t(r.json && r.json.mode === 'test', 'payment_status expose le mode du paiement')

      state.payment = { id: 'tr_live_mode', mode: 'live', status: 'paid', paidAt: '2026-11-08T10:00:00Z', amount: { value: '14.99', currency: 'EUR' } }
      const live = await createPayment(worker, env, { action: 'payment_status', paymentId: 'tr_live_mode' })
      t(live.json && live.json.paid === true, 'paiement Mollie LIVE paye => paid=true')
    } finally {
      backend.restore()
    }
  }

  // ── E6 : le webhook delivre bien l'accent SOS (1 EUR / 24 h) ───────────────
  {
    const state = {
      grants: [],
      rpcCalls: [],
      unmocked: [],
      payment: {
        id: 'tr_sos_fixture',
        mode: 'live',
        status: 'paid',
        paidAt: '2026-11-08T10:00:00Z',
        amount: { value: '1.00', currency: 'EUR' },
        metadata: { source: 'sos_plage', offer_kind: 'b2c_pass', pass: 'sos', email: '', lang: 'fr' },
      },
    }
    const backend = buildBackend(state)
    const { env, kv } = createEnv()
    try {
      const request = mkWebhookRequest({
        body: JSON.stringify({ id: 'event_sos_fixture', type: 'payment.paid', resource: 'payment', entityId: 'tr_sos_fixture' }),
      })
      const result = await runWebhook(worker, request, env)
      t(result.status === 200, 'webhook SOS : HTTP 200')
      t(result.json && result.json.granted === true, 'webhook SOS : acces DELIVRE (granted=true)')
      t(result.json && result.json.kind === 'b2c_pass', 'webhook SOS : grant de type b2c_pass')
      t(state.rpcCalls.length === 1, 'webhook SOS : 1 ecriture du grant durable')
      t(state.rpcCalls[0] && state.rpcCalls[0].p_pass === 'sos', 'webhook SOS : grant sur le SKU sos')
      t(state.rpcCalls[0] && state.rpcCalls[0].p_email === '', 'webhook SOS : email vide accepte (offre sans email)')
      const days = state.rpcCalls[0]
        ? Math.round((new Date(state.rpcCalls[0].p_expires_at).getTime() - Date.now()) / 86400000)
        : -1
      t(days === 1, 'webhook SOS : duree du grant = 1 jour (24 h)')
      t(kv.has('mol_b2c_pass_tr_sos_fixture'), 'webhook SOS : jeton d\'acces pose en KV')
    } finally {
      backend.restore()
    }
  }

  // ── E2 bis : un paiement b2b_annual forge NE delivre aucun acces ───────────
  {
    const state = {
      grants: [],
      rpcCalls: [],
      unmocked: [],
      payment: {
        id: 'tr_forged_b2b',
        mode: 'live',
        status: 'paid',
        paidAt: '2026-11-08T10:00:00Z',
        amount: { value: '29.00', currency: 'EUR' },
        metadata: { source: 'b2b_annual', plan: 'brief_monthly', pass: '', email: 'attacker@example.com' },
      },
    }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const request = mkWebhookRequest({
        body: JSON.stringify({ id: 'event_forged_b2b', type: 'payment.paid', resource: 'payment', entityId: 'tr_forged_b2b' }),
      })
      const result = await runWebhook(worker, request, env)
      t(result.status === 409, 'webhook forge : HTTP 409 (non honore, evenement REJOUABLE — fail-closed)')
      t(result.json && result.json.granted !== true, 'webhook forge : AUCUN acces delivre (granted != true)')
      t(result.json && result.json.error === 'payment_not_settled_yet', 'webhook forge : refus explicite')
      t(result.json && Array.isArray(result.json.reasons) && result.json.reasons.length > 0,
        'webhook forge : raison de refus exposee')
      t(!result.json || result.json.processed !== true, 'webhook forge : evenement NON marque comme traite (rejeu possible)')
      t(state.rpcCalls.length === 0, 'webhook forge : 0 ecriture de grant (RPC)')
      t((state.grantWrites || []).length === 0, 'webhook forge : 0 ecriture de grant B2B (payment_grants)')
      t(state.grants.length === 0, 'webhook forge : 0 ligne de droit')
    } finally {
      backend.restore()
    }
  }

  // ── Non-regression : un abonnement B2B ne livre JAMAIS un pass B2C ─────────
  // `create_subscription` ecrit source=b2b_monthly|b2b_concierge et SUPPRIME
  // offer_kind/pass/email. Le live classait ces evenements
  // `b2b_subscription_only` -> refus explicite `unsupported_source`.
  {
    for (const source of ['b2b_monthly', 'b2b_concierge']) {
      const state = {
        grants: [],
        rpcCalls: [],
        unmocked: [],
        payment: {
          id: 'tr_sub_' + source,
          mode: 'live',
          status: 'paid',
          paidAt: '2026-11-08T10:00:00Z',
          amount: { value: '29.00', currency: 'EUR' },
          metadata: { source, plan: 'pro_monthly', pass: '', email: 'hotel@example.com' },
        },
      }
      const backend = buildBackend(state)
      const { env } = createEnv()
      try {
        const request = mkWebhookRequest({
          body: JSON.stringify({
            id: 'event_' + source,
            type: 'payment.paid',
            resource: 'payment',
            entityId: 'tr_sub_' + source,
          }),
        })
        const result = await runWebhook(worker, request, env)
        t(result.status === 409, 'webhook ' + source + ' : HTTP 409 (refus fail-closed)')
        t(result.json && result.json.granted !== true, 'webhook ' + source + ' : AUCUN acces B2C livre')
        t(result.json && Array.isArray(result.json.reasons) && result.json.reasons.indexOf('unsupported_source') !== -1,
          'webhook ' + source + ' : refus explicite unsupported_source (semantique live preservee)')
        t(state.rpcCalls.length === 0, 'webhook ' + source + ' : 0 ecriture de grant (RPC)')
        t((state.grantWrites || []).length === 0, 'webhook ' + source + ' : 0 ecriture de grant B2B (payment_grants)')
        t(state.grants.length === 0, 'webhook ' + source + ' : 0 ligne de droit')
      } finally {
        backend.restore()
      }
    }
  }

  // ── Devise non vendue : le webhook refuse aussi (pas de 210 j en USD) ─────
  {
    const state = {
      grants: [],
      rpcCalls: [],
      unmocked: [],
      payment: {
        id: 'tr_season_usd',
        mode: 'live',
        status: 'paid',
        paidAt: '2026-11-08T10:00:00Z',
        amount: { value: '19.99', currency: 'USD' },
        metadata: { source: 'b2c', offer_kind: 'b2c_pass', pass: 'season', email: 'buyer@example.com' },
      },
    }
    const backend = buildBackend(state)
    const { env } = createEnv()
    try {
      const request = mkWebhookRequest({
        body: JSON.stringify({ id: 'event_season_usd', type: 'payment.paid', resource: 'payment', entityId: 'tr_season_usd' }),
      })
      const result = await runWebhook(worker, request, env)
      t(result.status === 409, 'webhook season USD (offre non vendue) : HTTP 409')
      t(state.rpcCalls.length === 0, 'webhook season USD : 0 grant (pas de 210 jours en USD)')
    } finally {
      backend.restore()
    }
  }

  console.log('\nP0 MONEY PATH — ' + n + ' assertions PASS\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

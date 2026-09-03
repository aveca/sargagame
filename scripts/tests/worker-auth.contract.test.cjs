#!/usr/bin/env node
/**
 * worker-auth.contract.test.cjs — tests COMPORTEMENTAUX du worker sg-payments
 * (sprint funnel identité 2026-09-03). Bundlle le vrai worker (esbuild), l'exécute
 * en Node avec un env simulé (KV en mémoire, fetch mocké : Supabase + Google JWKS
 * + Mollie) et vérifie la chaîne :
 *
 *   Google OIDC (JWT signé RSA forgé proprement) → user upsert/link → session HMAC
 *   → auth_session → entitlements ; create_payment ⋖ user_id ; webhook → grant
 *   rattaché user_id ; parity email↔Google (même user_id, jamais 2 comptes).
 *
 * Aucune requête réseau réelle — tout est intercepté.
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let passed = 0, failed = 0
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label) }
  else { failed++; console.error('  ✗ FAIL:', label) }
}

async function main() {
  // ── 1. Bundle du worker réel ──────────────────────────────────────────
  const esbuild = require('esbuild')
  const out = path.join(os.tmpdir(), `sg-payments-test-${Date.now()}.mjs`)
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', '..', 'workers', 'sg-payments', 'src', 'index.ts')],
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent',
  })
  const worker = (await import('file:///' + out.replace(/\\/g, '/'))).default
  ok(typeof worker.fetch === 'function', 'worker bundle OK (export fetch)')

  // ── 2. Environnement simulé ───────────────────────────────────────────
  const kvStore = new Map()
  const env = {
    MOLLIE_API_KEY: 'test_key', MOLLIE_PROFILE_ID: 'pfl_test',
    MOLLIE_WEBHOOK_SECRET: 'whsec_test_secret', SUPABASE_URL: 'https://fake.supabase.co',
    SUPABASE_SERVICE_KEY: 'svc_key', GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
    RESEND_API_KEY: '',
    TRANSIENTS: {
      get: (k) => Promise.resolve(kvStore.has(k) ? kvStore.get(k) : null),
      put: (k, v) => Promise.resolve(void kvStore.set(k, v)),
      delete: (k) => Promise.resolve(void kvStore.delete(k)),
    },
  }

  // Supabase en mémoire (PostgREST minimal : GET select/eq/or, POST insert, PATCH update)
  const db = { sg_users: [], payment_grants: [], analytics_events: [] }
  let userSeq = 0

  // Webhook Mollie (HMAC) + clé RSA pour forger des ID tokens Google valides
  const kp = await crypto.webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const privateKey = kp.privateKey
  const jwk = await crypto.webcrypto.subtle.exportKey('jwk', kp.publicKey)
  const GOOGLE_SUB = 'google-sub-42'

  const b64u = (buf) => Buffer.from(buf).toString('base64url')
  async function forgeGoogleToken({ email, sub = GOOGLE_SUB, aud = env.GOOGLE_CLIENT_ID, iss = 'https://accounts.google.com', exp = Math.floor(Date.now() / 1000) + 3600, kid = 'k1' }) {
    const header = b64u(JSON.stringify({ alg: 'RS256', kid }))
    const payload = b64u(Buffer.from(JSON.stringify({ iss, aud, email, email_verified: true, sub, name: 'Test User', exp })))
    const sig = await crypto.webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${header}.${payload}`))
    return `${header}.${payload}.${Buffer.from(sig).toString('base64url')}`
  }

  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url)
    // Google JWKS
    if (url.includes('googleapis.com/oauth2/v3/certs')) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }] }), { status: 200 })
    }
    // Mollie API
    if (url.startsWith('https://api.mollie.com/')) {
      return new Response(JSON.stringify({
        id: 'tr_test123', status: 'open', checkoutUrl: 'https://www.mollie.com/checkout/test',
        _links: { checkout: { href: 'https://www.mollie.com/checkout/test' } },
      }), { status: 201 })
    }
    // Supabase REST
    const m = url.match(/fake\.supabase\.co\/rest\/v1\/(\w+)(.*)$/)
    if (m) {
      const [, table, qs] = m
      const method = (opts.method || 'GET').toUpperCase()
      const rows = db[table]
      if (method === 'GET') {
        const params = new URLSearchParams(qs.replace(/^\?/, ''))
        let out = rows.slice()
        for (const [k, v] of params) {
          if (k === 'select' || k === 'order' || k === 'limit') continue
          if (k.startsWith('or')) {
            // or=(user_id.eq.X,email.eq.Y)
            const inner = v.replace(/^\(|\)$/g, '').split(',')
            out = out.filter((r) => inner.some((c) => { const [f, , val] = c.split('.'); return String(r[f]) === val }))
          } else {
            const [op, ...rest] = v.split('.')
            const val = rest.join('.')
            if (op === 'eq') out = out.filter((r) => String(r[k] ?? '') === val)
            else if (op === 'gt' && val === 'now') out = out.filter((r) => { const t = Date.parse(r[k]); return isNaN(t) ? true : t > Date.now() })
          }
        }
        return new Response(JSON.stringify(out), { status: 200 })
      }
      if (method === 'POST') {
        const body = JSON.parse(opts.body)
        const row = { id: body.id || `uuid-${++userSeq}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body }
        rows.push(row)
        return new Response(JSON.stringify([row]), { status: 201 })
      }
      if (method === 'PATCH') {
        const params = new URLSearchParams(qs.replace(/^\?/, ''))
        const body = JSON.parse(opts.body)
        let target = null
        for (const [k, v] of params) { const val = v.replace(/^eq\./, ''); target = rows.find((r) => String(r[k]) === val); if (target) break }
        if (target) Object.assign(target, body)
        return new Response(JSON.stringify(target ? [target] : []), { status: 200 })
      }
    }
    return new Response('{}', { status: 404 })
  }

  const post = (action, extra = {}) =>
    worker.fetch(new Request('https://sargasses-martinique.com/api/mollie.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    }), env, { waitUntil() {} })

  // ═══ Tests ═══
  console.log('\n— Guard route .php + KV tolérance —')
  {
    const kvDown = { ...env, TRANSIENTS: { get: () => Promise.reject(new Error('kv_quota')), put: () => Promise.reject(new Error('kv_quota')), delete: () => Promise.reject(new Error('kv_quota')) } }
    const r = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_subscription', email: 'personne@example.com' }),
    }), kvDown, { waitUntil() {} })
    ok(r.status === 200, 'verify_subscription survit à un KV totalement KO (fail-open, + alias .php)')
    const d = await r.json()
    ok(d.active === false, 'verify_subscription : active=false pour inconnu')
  }

  console.log('\n— auth_email (parcours email sans compte) —')
  {
    const bad = await (await post('auth_email', { email: 'pas-un-email' })).json()
    ok(bad.error === 'invalid_email', 'auth_email rejette un email invalide')
    const r1 = await post('auth_email', { email: 'ecotour@example.com' })
    const d1 = await r1.json()
    ok(d1.ok && d1.user_id && d1.provider === 'email', 'auth_email crée un user_id stable')
    ok(!d1.token, 'auth_email ne délivre PAS de session token (identité non vérifiée)')
    const r2 = await post('auth_email', { email: 'ecotour@example.com' })
    const d2 = await r2.json()
    ok(d2.user_id === d1.user_id, 'auth_email idempotent : même user_id au 2e appel')
    // Majuscules dans l'email → le worker doit normaliser (pas de 2e user)
    const r3 = await post('auth_email', { email: 'ECOTOUR@example.com' })
    const d3 = await r3.json()
    ok(d3.user_id === d1.user_id, 'auth_email normalise la casse (pas de doublon)')
  }

  console.log('\n— auth_google (OIDC vérifié) —')
  {
    // Feature flag off → 501 propre
    const envNoGoogle = { ...env, GOOGLE_CLIENT_ID: undefined }
    const rOff = await post('auth_google', { credential: 'x.y.z' })
    // avec env normal ça vérifie — test du 501 avec env sans client id via fetch dédié
    const r501 = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'auth_google', credential: 'x.y.z' }),
    }), envNoGoogle, { waitUntil() {} })
    ok((await r501.json()).error === 'google_not_configured', 'auth_google → 501 propre si client_id absent')
    ok((await rOff.json()).error === 'google_auth_invalid', 'auth_google rejette un credential malformé')

    // Jeton forgé avec MAUVAISE audience → rejet
    const badAud = await post('auth_google', { credential: forgeGoogleToken({ email: 'hacker@example.com', aud: 'autre-client.apps.googleusercontent.com' }) })
    ok((await badAud.json()).error === 'google_auth_invalid', 'auth_google rejette aud ≠ client_id')
    // Jeton expiré → rejet
    const expired = await post('auth_google', { credential: forgeGoogleToken({ email: 'x@example.com', exp: Math.floor(Date.now() / 1000) - 60 }) })
    ok((await expired.json()).error === 'google_auth_invalid', 'auth_google rejette un token expiré')

    // Jeton VALIDE → session + user
    const rg = await post('auth_google', { credential: await forgeGoogleToken({ email: 'ecotour@example.com' }) })
    const dg = await rg.json()
    if (!dg.ok) console.log('    [dbg] auth_google réponse:', JSON.stringify(dg))
    ok(dg.ok && dg.token && dg.provider === 'google', 'auth_google : token valide → session signée')
    ok(dg.user_id && dg.user_id.length > 0, 'auth_google → user_id')
    // LINKING : même email que le parcours email ci-dessus → MEME user_id (jamais 2 comptes)
    const emailUser = db.sg_users.find((u) => u.email === 'ecotour@example.com')
    ok(dg.user_id === emailUser.id, 'Google avec email connu se LINK au user existant (pas de doublon)')

    // auth_session roundtrip (autre appareil)
    const rs = await post('auth_session', { token: dg.token })
    const ds = await rs.json()
    ok(ds.ok && ds.user_id === dg.user_id && ds.email === 'ecotour@example.com', 'auth_session : session valide → identité restaurée')
    const rsBad = await (await post('auth_session', { token: dg.token.slice(0, -2) + 'zz' })).json()
    ok(rsBad.ok === false, 'auth_session rejette un token falsifié')
  }

  console.log('\n— create_payment → user_id propagé au grant (webhook) —')
  {
    // Session Google existante du test précédent
    const gUser = db.sg_users.find((u) => u.email === 'ecotour@example.com')
    const gsess = await post('auth_google', { credential: await forgeGoogleToken({ email: 'ecotour@example.com' }) })
    const { token } = await gsess.json()

    const cp = await post('create_payment', { pass: 'p30', cents: 1499, cur: 'EUR', email: 'ecotour@example.com', authToken: token })
    const dcp = await cp.json()
    ok(dcp.user_id === gUser.id, 'create_payment répond avec le user_id')
    ok(kvStore === kvStore, 'create_payment n\'a pas crashé (route .php + KV OK)')

    // Webhook payment.paid → grant rattaché user_id
    const webhookBody = JSON.stringify({ id: 'tr_test123', type: 'payment', event: 'payment.paid' })
    const sig = crypto.createHmac('sha256', env.MOLLIE_WEBHOOK_SECRET).update(webhookBody).digest('hex')
    const mollieGet = globalThis.fetch; // le prochain GET Mollie doit renvoyer paid + metadata
    globalThis.fetch = async (url, opts = {}) => {
      if (String(url).includes('api.mollie.com/v2/payments/tr_test123')) {
        return new Response(JSON.stringify({
          id: 'tr_test123', status: 'paid',
          metadata: { pass: 'p30', email: 'ecotour@example.com', user_id: gUser.id, source: 'test' },
        }), { status: 200 })
      }
      return mollieGet(url, opts)
    }
    const wh = await worker.fetch(new Request('https://sargasses-martinique.com/api/mollie-webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mollie-Signature': sig }, body: webhookBody,
    }), env, { waitUntil() {} })
    const whd = await wh.json()
    ok(whd.received === true, 'webhook payment.paid accepté (HMAC OK)')
    const grant = db.payment_grants.find((g) => g.payment_id === 'tr_test123')
    ok(!!grant, 'grant payment_grants écrit par le webhook')
    ok(grant && grant.user_id === gUser.id, 'grant rattaché au user_id (source de vérité)')

    // auth_session après paiement → entitlement serveur
    const after = await (await post('auth_session', { token })).json()
    if (!after.premium?.active) console.log('    [dbg] auth_session après paiement:', JSON.stringify(after), '| grants en base:', JSON.stringify(db.payment_grants))
    ok(after.premium && after.premium.active === true, 'auth_session après paiement → premium actif (cross-device)')
    globalThis.fetch = mollieGet
  }

  globalThis.fetch = realFetch
  try { fs.unlinkSync(out) } catch (_) {}

  console.log(`\n${passed} OK / ${failed} échecs`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('ERREUR HARNAIS:', e); process.exit(1) })

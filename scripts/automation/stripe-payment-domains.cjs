#!/usr/bin/env node
/**
 * stripe-payment-domains.cjs — Enregistre + valide les 5 domaines comme
 * "payment method domains" Stripe (requis pour Apple Pay / Google Pay / Link
 * dans Embedded Checkout & Elements).
 *
 * Prérequis : public/.well-known/apple-developer-merchantid-domain-association
 * DÉPLOYÉ et servi en HTTPS sur chaque domaine (la validation Stripe va le
 * chercher). Idempotent : re-créer un domaine existant le renvoie tel quel,
 * re-valider est sans effet de bord.
 *
 * Usage : node scripts/automation/stripe-payment-domains.cjs
 *   (STRIPE_SECRET_KEY via env ou .env à la racine)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

function loadKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
    const m = env.match(/^STRIPE_SECRET_KEY=(.+)$/m)
    if (m) return m[1].trim()
  } catch (_) {}
  console.error('✗ STRIPE_SECRET_KEY introuvable (env ou .env)')
  process.exit(1)
}
const SK = loadKey()

const DOMAINS = [
  'sargasses-martinique.com',
  'sargasses-guadeloupe.com',
  'sargassumpuntacana.com',
  'sargassummiami.com',
  'sargassumcancun.com',
]

function api(method, p, params) {
  return new Promise((resolve, reject) => {
    const body = params ? new URLSearchParams(params).toString() : ''
    const req = https.request({
      host: 'api.stripe.com', path: '/v1' + p, method,
      auth: SK + ':',
      headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {},
    }, r => {
      let d = ''
      r.on('data', c => d += c)
      r.on('end', () => {
        try { resolve(JSON.parse(d)) } catch (e) { reject(new Error('bad json: ' + d.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const fmt = s => s?.status === 'active' ? '✅ active' : `⚠ ${s?.status || '?'}${s?.status_details?.error_message ? ' — ' + s.status_details.error_message : ''}`

;(async () => {
  // Liste existante pour l'idempotence
  const existing = await api('GET', '/payment_method_domains?limit=100')
  const byName = Object.fromEntries((existing.data || []).map(d => [d.domain_name, d]))

  for (const domain of DOMAINS) {
    let pmd = byName[domain]
    if (!pmd) {
      pmd = await api('POST', '/payment_method_domains', { domain_name: domain })
      if (pmd.error) { console.log(`${domain}: ✗ ${pmd.error.message}`); continue }
    }
    // (Re)valide — Stripe va chercher le fichier .well-known en HTTPS
    const v = await api('POST', `/payment_method_domains/${pmd.id}/validate`)
    const final = v.error ? pmd : v
    console.log(`${domain}:`)
    console.log(`  apple_pay:  ${fmt(final.apple_pay)}`)
    console.log(`  google_pay: ${fmt(final.google_pay)}`)
    console.log(`  link:       ${fmt(final.link)}`)
    if (v.error) console.log(`  (validate: ${v.error.message})`)
  }
})().catch(e => { console.error('✗', e.message); process.exit(1) })

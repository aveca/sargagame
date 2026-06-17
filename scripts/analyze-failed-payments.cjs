#!/usr/bin/env node
/**
 * analyze-failed-payments.cjs — Radiographie (lecture seule) des paiements qui
 * N'ABOUTISSENT PAS : checkout sessions non payées, PaymentIntents échoués,
 * abonnements incomplete / incomplete_expired / past_due / canceled.
 *
 * Objectif : transformer « plein de paiements bloqués » en KPI exploitable —
 * combien, pourquoi, dans quelle région, combien d'€/$ laissés sur la table,
 * et combien sont RÉCUPÉRABLES (vs fraude / vrai abandon).
 *
 * RGPD : emails JAMAIS imprimés ni écrits (hash8 only). Lecture seule — ne crée,
 * ne modifie, n'envoie rien.
 *
 * Usage :
 *   node scripts/analyze-failed-payments.cjs              # 90 jours
 *   node scripts/analyze-failed-payments.cjs --days=30
 *   node scripts/analyze-failed-payments.cjs --json       # sortie machine (KPI)
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const args = process.argv.slice(2)
const DAYS = Number((args.find(a => a.startsWith('--days=')) || '--days=90').split('=')[1]) || 90
const AS_JSON = args.includes('--json')

const KEY = (() => {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY.trim()
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    const m = env.match(/STRIPE_SECRET_KEY=([^\r\n]+)/)
    return m ? m[1].trim() : null
  } catch { return null }
})()
if (!KEY) { console.error('STRIPE_SECRET_KEY introuvable (.env ou env).'); process.exit(1) }
const MODE = KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE'
const hash8 = e => crypto.createHash('sha256').update(String(e).trim().toLowerCase()).digest('hex').slice(0, 8)
const FRAUD = new Set(['fraudulent', 'stolen_card', 'lost_card', 'pickup_card'])

async function stripe(pathname) {
  const res = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    headers: { Authorization: `Basic ${Buffer.from(KEY + ':').toString('base64')}` },
  })
  const json = await res.json()
  if (json.error) throw new Error(`Stripe ${pathname}: ${json.error.message}`)
  return json
}
async function listAll(base, cap = 1000) {
  let url = base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`
  const out = []
  while (out.length < cap) {
    const pg = await stripe(url)
    out.push(...pg.data)
    if (!pg.has_more) break
    url = (base.includes('?') ? `${base}&limit=100` : `${base}?limit=100`) + `&starting_after=${pg.data[pg.data.length - 1].id}`
  }
  return out
}
const cutoff = Math.floor((Date.now() - DAYS * 864e5) / 1000)
const fmt = (amt, cur) => `${(amt / 100).toFixed(2)} ${String(cur || '').toUpperCase()}`
const inc = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n }
const money = (obj, cur, amt) => { obj[cur] = Math.round(((obj[cur] || 0) + amt)) }

async function main() {
  const result = {
    mode: MODE, windowDays: DAYS, generatedAt: new Date().toISOString(),
    checkout: { total: 0, unpaid: 0, byReason: {}, byRegion: {}, lostByCurrency: {}, recoverable: 0, withEmail: 0 },
    subscriptions: { byStatus: {}, lostFirstPaymentByCurrency: {} },
    paymentIntents: { failed: 0, byDeclineCode: {}, lostByCurrency: {} },
  }

  // ---- 1. Checkout sessions (la porte d'entrée USD : trip pass one-time) ----
  const sessions = await listAll(`checkout/sessions?created[gte]=${cutoff}`)
  result.checkout.total = sessions.length
  const piCache = {}
  for (const s of sessions) {
    if (s.payment_status === 'paid') continue
    if (s.status === 'open') continue // encore ouverte, pas un échec (souvent juste expirée plus tard)
    result.checkout.unpaid++
    const region = s.metadata?.island || 'unknown'
    inc(result.checkout.byRegion, region)
    const email = s.customer_details?.email || s.customer_email
    if (email) result.checkout.withEmail++
    // Motif via PaymentIntent
    let reason = 'abandoned' // pas de PI = jamais saisi de carte
    if (s.payment_intent) {
      try {
        const pi = piCache[s.payment_intent] || (piCache[s.payment_intent] = await stripe(`payment_intents/${s.payment_intent}`))
        if (pi.status === 'requires_action') reason = 'action_3ds'
        else if (pi.last_payment_error) reason = FRAUD.has(pi.last_payment_error.decline_code) ? 'fraud' : 'declined'
        else if (pi.status === 'canceled') reason = 'canceled'
      } catch {}
    }
    inc(result.checkout.byReason, reason)
    if (s.amount_total) money(result.checkout.lostByCurrency, s.currency, s.amount_total)
    // Récupérable = a un email, motif non-fraude, et pas un sub déjà actif (approx ici : email présent + reason récupérable)
    if (email && reason !== 'fraud') result.checkout.recoverable++
  }

  // ---- 2. Subscriptions (EUR mensuel MQ/GP) : incomplete = 1er paiement raté ----
  const subs = await listAll('subscriptions?status=all')
  for (const s of subs) {
    if (s.created < cutoff && !['incomplete', 'incomplete_expired'].includes(s.status)) {
      // on garde quand même incomplete hors-fenêtre rare ; sinon skip vieux
    }
    inc(result.subscriptions.byStatus, s.status)
    if (['incomplete', 'incomplete_expired'].includes(s.status)) {
      const pl = s.plan || s.items?.data?.[0]?.plan || {}
      if (pl.amount) money(result.subscriptions.lostFirstPaymentByCurrency, s.currency, pl.amount)
    }
  }

  // ---- 3. PaymentIntents échoués (vue motifs banque, toutes sources) ----
  const pis = await listAll(`payment_intents?created[gte]=${cutoff}`)
  for (const pi of pis) {
    const failed = pi.status === 'canceled' || (pi.last_payment_error && pi.status === 'requires_payment_method')
    if (!failed) continue
    result.paymentIntents.failed++
    const code = pi.last_payment_error?.decline_code || pi.last_payment_error?.code || pi.cancellation_reason || pi.status
    inc(result.paymentIntents.byDeclineCode, code)
    if (pi.amount) money(result.paymentIntents.lostByCurrency, pi.currency, pi.amount)
  }

  if (AS_JSON) { console.log(JSON.stringify(result, null, 2)); return }

  // ---- Rapport humain ----
  const L = []
  L.push(`=== PAIEMENTS NON ABOUTIS — MODE ${MODE} — fenêtre ${DAYS}j ===\n`)
  L.push(`CHECKOUT SESSIONS (porte trip-pass USD + EUR)`)
  L.push(`  Total créées : ${result.checkout.total} | non payées (fermées/expirées) : ${result.checkout.unpaid}`)
  L.push(`  Avec email (joignables) : ${result.checkout.withEmail} | récupérables (email + non-fraude) : ${result.checkout.recoverable}`)
  L.push(`  Par motif : ${JSON.stringify(result.checkout.byReason)}`)
  L.push(`  Par région : ${JSON.stringify(result.checkout.byRegion)}`)
  L.push(`  $/€ laissés sur la table : ${Object.entries(result.checkout.lostByCurrency).map(([c, a]) => fmt(a, c)).join(' · ') || '—'}`)
  L.push(``)
  L.push(`ABONNEMENTS (EUR mensuel MQ/GP)`)
  L.push(`  Par statut : ${JSON.stringify(result.subscriptions.byStatus)}`)
  L.push(`  1er paiement raté (incomplete*) : ${Object.entries(result.subscriptions.lostFirstPaymentByCurrency).map(([c, a]) => fmt(a, c)).join(' · ') || '—'}`)
  L.push(``)
  L.push(`PAYMENT INTENTS ÉCHOUÉS (motifs banque, toutes sources)`)
  L.push(`  Total échoués : ${result.paymentIntents.failed}`)
  L.push(`  Par code : ${JSON.stringify(result.paymentIntents.byDeclineCode)}`)
  L.push(`  $/€ tentés et refusés : ${Object.entries(result.paymentIntents.lostByCurrency).map(([c, a]) => fmt(a, c)).join(' · ') || '—'}`)
  L.push(``)
  // Lecture business
  const r = result.checkout.byReason
  const recov = result.checkout.recoverable
  L.push(`LECTURE`)
  L.push(`  • Récupérables par relance (email + motif récupérable) : ${recov}`)
  if (r.declined) L.push(`  • ${r.declined} carte(s) refusée(s) → email "réessaie avec une autre carte"`)
  if (r.action_3ds) L.push(`  • ${r.action_3ds} bloqué(s) 3DS → email "confirme avec ta banque"`)
  if (r.abandoned) L.push(`  • ${r.abandoned} abandon(s) avant carte → email "ta carte des plages t'attend" / friction checkout`)
  if (r.fraud) L.push(`  • ${r.fraud} flag(s) fraude → NE PAS relancer`)
  console.log(L.join('\n'))
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })

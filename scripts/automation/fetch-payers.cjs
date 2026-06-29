#!/usr/bin/env node
/**
 * Fetch Payers — construit le SEGMENT « clients payants » pour relances ciblées.
 *
 * Croise, via le service account (GOOGLE_SERVICE_ACCOUNT_JSON), trois onglets du
 * Google Sheet :
 *   • `payments`            (date, session_id, email, amount, currency, status, island)
 *   • `subscription_events` (date, event_type, object_id, email, customer, subscription, amount, currency, island)
 *   • `emails`              (date, email, island, source, unsubscribed)  → pour exclure les désabos
 * + `data/bounced-emails.json` (hashes) → exclut les emails en erreur (RGPD).
 *
 * Sortie : data/payers.json — la liste ENVOYABLE des payeurs (déjà filtrée des
 * désabonnés et des bounces), chaque entrée taguée d'un statut dérivé :
 *   active   → abo en cours (dernier event = paiement réussi)
 *   past_due → dernier event = échec de paiement (dunning)
 *   canceled → abo résilié (win-back possible)
 *   paid     → paiement unique / pass one-time (pas d'abo) — reste un client
 * + optedIn (présent dans `emails` et non désabonné) pour distinguer marketing vs
 *   simple legitimate-interest sur un client.
 *
 * LECTURE SEULE (aucune écriture Sheet, aucun envoi). N'ENVOIE RIEN : c'est
 * relance-payers.cjs qui consomme ce fichier. Sans GOOGLE_SERVICE_ACCOUNT_JSON,
 * le script skip proprement (comme fetch-subscribers.cjs).
 *
 * Usage: node scripts/automation/fetch-payers.cjs
 */
const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const { emailHash } = require('./lib/email-hash.cjs')

const SHEET_ID = '1LrpJeILNGIccCVn7AzZrEiLPr8ALTp20F5b1ihHC9FQ'
const OUT_PATH = path.join(__dirname, 'data', 'payers.json')
const BOUNCED_PATH = path.join(__dirname, 'data', 'bounced-emails.json')

const RANGES = {
  payments: 'payments!A:G',
  subs: 'subscription_events!A:I',
  emails: 'emails!A:E',
}

const norm = (e) => String(e || '').trim().toLowerCase()
const isEmail = (e) => norm(e).includes('@')

async function readRange(sheets, range) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range })
    return res.data.values || []
  } catch (e) {
    console.log(`  (onglet ${range} illisible: ${e.message})`)
    return []
  }
}

// Dernier event d'abo l'emporte pour le statut (trié par date ISO croissante).
function statusFromEvent(type) {
  if (type === 'customer.subscription.deleted') return 'canceled'
  if (type === 'invoice.payment_failed') return 'past_due'
  if (type === 'invoice.payment_succeeded' || type === 'checkout.session.completed') return 'active'
  return null
}

async function main() {
  console.log('=== Fetch Payers (segment clients payants) ===')

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) {
    console.log('GOOGLE_SERVICE_ACCOUNT_JSON not set — skipping.')
    return
  }
  let auth
  try {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
  } catch (e) {
    console.log('Failed to parse service account:', e.message)
    return
  }
  const sheets = google.sheets({ version: 'v4', auth })

  const [payRows, subRows, emailRows] = await Promise.all([
    readRange(sheets, RANGES.payments),
    readRange(sheets, RANGES.subs),
    readRange(sheets, RANGES.emails),
  ])

  // 1) Base : tout email présent dans `payments` (un paiement = un client).
  const payers = new Map() // email -> { email, island, status, lastPaid, lastEvent, source }
  for (const r of payRows.slice(1)) {
    const email = norm(r[2])
    if (!isEmail(email)) continue
    const status = (r[5] || '').toLowerCase()
    if (status && status !== 'paid' && status !== 'active' && status !== 'completed') continue // ignore failed/pending isolés
    const island = (r[6] || 'MQ').toUpperCase()
    const date = r[0] || ''
    const prev = payers.get(email)
    if (!prev || date > prev.lastPaid) {
      payers.set(email, { email, island, status: 'paid', lastPaid: date, lastEvent: '', source: 'payment' })
    }
  }

  // 2) Overlay statut d'abo depuis subscription_events (le plus récent gagne).
  const latestSubEvt = new Map() // email -> { date, type, island }
  for (const r of subRows.slice(1)) {
    const email = norm(r[3])
    if (!isEmail(email)) continue
    const date = r[0] || ''
    const type = r[1] || ''
    const island = (r[8] || '').toUpperCase()
    const prev = latestSubEvt.get(email)
    if (!prev || date > prev.date) latestSubEvt.set(email, { date, type, island })
  }
  for (const [email, evt] of latestSubEvt) {
    const st = statusFromEvent(evt.type)
    const cur = payers.get(email) || { email, island: evt.island || 'MQ', status: 'paid', lastPaid: '', source: 'subscription' }
    if (st) cur.status = st
    cur.lastEvent = evt.date
    if (evt.island) cur.island = evt.island
    payers.set(email, cur)
  }

  // 3) Désabonnés (depuis `emails`, col E = unsubscribed) + optedIn.
  const unsub = new Set()
  const optedIn = new Set()
  for (const r of emailRows.slice(1)) {
    const email = norm(r[1])
    if (!isEmail(email)) continue
    if ((r[4] || '').toString().toLowerCase() === 'yes') unsub.add(email)
    else optedIn.add(email)
  }

  // 4) Bounces (hashes — RGPD).
  let bounced = new Set()
  try {
    bounced = new Set(JSON.parse(fs.readFileSync(BOUNCED_PATH, 'utf-8'))
      .map(e => String(e).includes('@') ? emailHash(e) : e))
  } catch {}

  // 5) Segment final = payeurs, MOINS désabonnés, MOINS bounces. Tag optedIn.
  const out = []
  let droppedUnsub = 0, droppedBounce = 0
  for (const p of payers.values()) {
    if (unsub.has(p.email)) { droppedUnsub++; continue }
    if (bounced.has(emailHash(p.email))) { droppedBounce++; continue }
    out.push({ ...p, optedIn: optedIn.has(p.email) })
  }
  out.sort((a, b) => (b.lastPaid || b.lastEvent || '').localeCompare(a.lastPaid || a.lastEvent || ''))

  const byStatus = out.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {})
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify({ updatedAt: new Date().toISOString(), count: out.length, byStatus, payers: out }, null, 2) + '\n')
  console.log(`Saved ${out.length} payeurs → ${path.relative(path.join(__dirname, '..', '..'), OUT_PATH)}`)
  console.log(`  par statut: ${JSON.stringify(byStatus)} | exclus: ${droppedUnsub} désabo, ${droppedBounce} bounce`)
}

main()

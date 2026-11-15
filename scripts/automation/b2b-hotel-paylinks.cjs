#!/usr/bin/env node
/**
 * b2b-hotel-paylinks.cjs — Crée des LIENS DE PAIEMENT Mollie PAR HÔTEL avec attribution.
 * Phase 8 — Vente directe aux hôtels.
 *
 * Usage:
 *   node scripts/automation/b2b-hotel-paylinks.cjs <hotel_id>           # crée le lien pour un hôtel
 *   node scripts/automation/b2b-hotel-paylinks.cjs --all                # crée les liens pour tous les contacts sans lien
 *   node scripts/automation/b2b-hotel-paylinks.cjs --all --dry          # dry-run, n'affiche que ce qui serait fait
 *
 * Crée un payment Mollie (v2/payments) avec metadata {hotel_id, prospect_id, offer_type, source:'b2b_annual', email}
 * pour que le webhook puisse attribuer le paiement à l'établissement (pas de lien générique sans identification).
 *
 * Le checkout URL retourné est le lien à inclure dans l'email de prospection à l'hôtel.
 *
 * Stocke le mapping hotel_id → {checkoutUrl, mollie_payment_id, offer_type, amount} dans
 * scripts/automation/data/b2b-sales-tracking.json (registre des 12 colonnes de suivi).
 *
 * Idempotent : un hôtel déjà équipé d'un lien de paiement n'est pas recréé.
 *
 * Clé : env MOLLIE_API_KEY (secret CI) — sinon fallback api/mollie-config.php (local).
 * Clé TEST (test_) → liens en mode test (pas de vrai argent).
 */

const fs = require('fs')
const path = require('path')

const CONTACTS_PATH = path.join(__dirname, 'data', 'b2b-contacts-unified.json')
const TRACKING_PATH = path.join(__dirname, 'data', 'b2b-sales-tracking.json')
const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const ALL = args.includes('--all')
// 1er argument non-flag = hôtel ciblé (slug/nom ou email)
const TARGET = args.find(a => !a.startsWith('--'))

const REDIRECT = 'https://sargasses-martinique.com/?pro_paid=1'
const WEBHOOK = 'https://sargasses-martinique.com/api/mollie-webhook.php'

// Offres annuelles (source unique : CLAUDE.md Pricing)
// Mensuel récurrent : pro_monthly 79€ / brief_monthly 29€ (géré par mollie.php create_subscription)
// Annuel prépayé : pro_annual 690€ / brief_annual 290€ (payment link one-off)
const OFFERS = {
  pro_annual:   { value: '690.00', currency: 'EUR', label: 'Sargasses Pro — Abonnement annuel (hôtel)',   interval: null },
  brief_annual: { value: '290.00', currency: 'EUR', label: 'Sargasses Brief — Abonnement annuel (hôtel)', interval: null },
}
const DEFAULT_OFFER = 'pro_annual'

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'hotel'
}

function loadKey() {
  if (process.env.MOLLIE_API_KEY) return process.env.MOLLIE_API_KEY.trim()
  // fallback local : api/mollie-config.php
  for (const p of ['public/api/mollie-config.php', 'martinique-ftp/api/mollie-config.php']) {
    try {
      const t = fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8')
      const m = t.match(/'api_key'\s*=>\s*['"]([^'"]+)['"]/)
      if (m && !m[1].includes('REPLACE')) return m[1]
    } catch {}
  }
  return null
}

function loadContacts() {
  try { return JSON.parse(fs.readFileSync(CONTACTS_PATH, 'utf8')).contacts || [] } catch { return [] }
}

function loadTracking() {
  try { return JSON.parse(fs.readFileSync(TRACKING_PATH, 'utf8')) } catch {
    return { _note: '', updatedAt: '', version: 1, entries: [] }
  }
}
function saveTracking(d) {
  fs.mkdirSync(path.dirname(TRACKING_PATH), { recursive: true })
  fs.writeFileSync(TRACKING_PATH, JSON.stringify(d, null, 2))
}

function findEntryByHotel(tracking, hotelId) {
  return d.entries.findIndex(e => e.hotel_id === hotelId)
}

function offerForContact(contact) {
  // Par défaut Pro annuel. Les territoire/mairies peuvent être orientés vers brief si petit budget.
  // L'offre peut être surchargée par un champ `offer` dans le contact.
  return contact.offer || DEFAULT_OFFER
}

// Créer un payment Mollie avec metadata d'attribution hôtel (Phase 8)
async function createHotelPayment(key, contact, offerKey) {
  const offer = OFFERS[offerKey]
  if (!offer) throw new Error(`Offre inconnue: ${offerKey}`)

  const hotelId = slugify(contact.name)
  const metadata = {
    source: 'b2b_annual',
    hotel_id: hotelId,
    prospect_id: contact.email ? slugify(contact.email.split('@')[0]) : hotelId,
    offer_type: offerKey,
    email: contact.email || '',
    name: contact.name || '',
    island: contact.island || '',
  }

  const body = {
    amount: { currency: offer.currency, value: offer.value },
    description: `${offer.label} — ${contact.name} (${contact.town}, ${contact.island})`,
    redirectUrl: REDIRECT,
    webhookUrl: WEBHOOK,
    metadata,
  }

  if (DRY) {
    console.log(`  [DRY] ${hotelId} → ${offerKey} ${offer.value} ${offer.currency} (metadata=${JSON.stringify(metadata)})`)
    return { id: 'dry_' + hotelId, url: REDIRECT + '?dry=1', value: offer.value, metadata }
  }

  const res = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((j && j.detail) || `HTTP ${res.status}`)
  const checkoutUrl = j._links && j._links.checkout && j._links.checkout.href
  if (!checkoutUrl) throw new Error('no checkout URL in response')
  return { id: j.id, url: checkoutUrl, value: offer.value, currency: offer.currency, metadata }
}

async function main() {
  console.log('=== B2B Hotel payment links (Phase 8) ===')
  const key = loadKey()
  if (!key) { console.log('MOLLIE_API_KEY absent — no-op.'); return }
  if (key.startsWith('test_')) console.log('⚠️  clé TEST (test_) — liens en mode test (pas de vrai argent).')

  const contacts = loadContacts()
  const tracking = loadTracking()
  tracking.entries = tracking.entries || []
  tracking.updatedAt = new Date().toISOString()

  // Sélection des contacts à traiter
  let targets = contacts
  if (TARGET) {
    const t = TARGET.toLowerCase()
    targets = contacts.filter(c =>
      slugify(c.name) === t ||
      c.email.toLowerCase() === t ||
      c.name.toLowerCase().includes(t)
    )
    if (targets.length === 0) {
      console.log(`Aucun hôtel trouvé pour "${TARGET}". Exemples d'ids valides:`)
      contacts.slice(0, 5).forEach(c => console.log(`  - ${slugify(c.name)} (${c.email})`))
      process.exit(1)
    }
  } else if (!ALL) {
    // Par défaut : uniquement les contacts sans lien déjà créé
    const equipped = new Set(tracking.entries.map(e => e.hotel_id))
    targets = contacts.filter(c => !equipped.has(slugify(c.name)))
    console.log(`${targets.length} hôtels sans lien de paiement (sur ${contacts.length} contacts). Passez --all pour forcer la recréation.`)
  }

  let created = 0, skipped = 0, errors = 0
  for (const contact of targets) {
    const hotelId = slugify(contact.name)
    const existing = tracking.entries.find(e => e.hotel_id === hotelId)
    if (existing) {
      console.log(`  = ${hotelId} déjà équipé (${existing.offer_type} ${existing.amount} ${existing.currency})`)
      skipped++
      continue
    }
    if (!contact.email) {
      console.log(`  x ${hotelId} pas d'email — saut`)
      errors++
      continue
    }
    const offerKey = offerForContact(contact)
    try {
      const payment = await createHotelPayment(key, contact, offerKey)
      const entry = {
        hotel_id: hotelId,
        hotel: contact.name,
        contact: contact.name,
        email: contact.email,
        island: contact.island || '',
        town: contact.town || '',
        offer_type: offerKey,
        offer_name: OFFERS[offerKey].label,
        amount: payment.value,
        currency: payment.currency,
        payment_link: payment.url,
        mollie_payment_id: payment.id,
        mollie_subscription_id: null,
        email_sent: { sent: false, at: null },
        clicked: { clicked: false, at: null },
        checkout_started: { started: false, at: null },
        payment_confirmed: { confirmed: false, at: null, amount_cents: null },
        subscription_active: { active: false, at: null },
        premium_activated: { activated: false, at: null },
        revenue_cents: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: payment.metadata,
      }
      tracking.entries.push(entry)
      saveTracking(tracking)
      created++
      console.log(`  + ${hotelId} → ${payment.url} (${offerKey} ${payment.value} ${payment.currency})`)
    } catch (e) {
      errors++
      console.log(`  x ${hotelId}: ${e.message}`)
    }
  }

  console.log(`\nRésultat: ${created} créés, ${skipped} déjà équipés, ${errors} erreurs.`)
  console.log(`Registre: ${TRACKING_PATH}`)
}
main().catch(e => { console.error(e); process.exit(1) })

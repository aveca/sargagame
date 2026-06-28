#!/usr/bin/env node
/**
 * b2b-funnel — TRACKE chaque prospect/client B2B à travers le funnel et calcule la
 * prochaine action, pour les GUIDER (demande fondateur). Source de vérité unique :
 * agrège tous les signaux par hash d'email (RGPD : aucun email en clair persisté).
 *
 * Signaux (selon dispo) :
 *   - découvert   : présent dans b2b-enriched.json (liste cible)
 *   - contacté    : b2b-cold-sent.json (c0/c4) ou widget-converted-sent.json
 *   - cliqué      : stats widget/visites avec token &b= (si SG_STATS_KEY dispo)   [hook]
 *   - lead/essai  : subscribers.json source b2b_* (a soumis son email sur l'offre)
 *   - payé        : API Mollie (MOLLIE_API_KEY) — paiement trouvé pour cet email
 *
 * Sortie : data/b2b-funnel.json (par hash : stage, dates, source, nextAction) + résumé
 * console (compteurs par étape). Read-only / idempotent ; tourne dans le pipeline.
 *
 *   node scripts/automation/b2b-funnel.cjs
 */
const fs = require('fs')
const path = require('path')
const { emailHash } = require('./lib/email-hash.cjs')

const D = path.join(__dirname, 'data')
const OUT = path.join(D, 'b2b-funnel.json')
function load(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fb } }
function save(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2)) }
function daysSince(iso) { const t = Date.parse(iso); return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000) }

async function molliePaidEmails() {
  const key = process.env.MOLLIE_API_KEY
  if (!key) return null // signal non dispo
  const paid = new Set()
  try {
    let url = 'https://api.mollie.com/v2/payments?limit=250'
    for (let pg = 0; pg < 8 && url; pg++) {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + key } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j._embedded) break
      for (const p of j._embedded.payments || []) {
        if (p.status === 'paid') {
          const em = (p.metadata && (p.metadata.email || p.metadata.customerEmail)) || (p.details && p.details.consumerAccount) || ''
          if (String(em).includes('@')) paid.add(emailHash(em))
        }
      }
      url = (j._links && j._links.next && j._links.next.href) || null
    }
  } catch { return null }
  return paid
}

async function main() {
  console.log('=== B2B funnel tracker ===')
  const enriched = (load(path.join(D, 'b2b-enriched.json'), { contacts: [] }).contacts) || []
  const cold = load(path.join(D, 'b2b-cold-sent.json'), {})
  const widgetSent = load(path.join(D, 'widget-converted-sent.json'), {})
  const subs = load(path.join(D, 'subscribers.json'), []) // absent en sandbox → []
  const paid = await molliePaidEmails() // Set|null

  // hash → meta lisible (nom, île) depuis la liste enrichie + widget-contacts
  const meta = {}
  for (const c of enriched) if (c.email) meta[emailHash(c.email)] = { name: c.name, island: c.island, source: 'enriched' }
  const wc = (load(path.join(D, 'widget-contacts.json'), { contacts: {} }).contacts) || {}
  for (const w of Object.values(wc)) if (w.email) meta[emailHash(w.email)] = { name: w.name, island: w.island, source: 'widget' }

  // leads B2B (subscribers) → hash
  const leadHashes = new Set()
  for (const s of (Array.isArray(subs) ? subs : [])) {
    if (s && s.email && /^b2b_/.test(s.source || '')) leadHashes.add(emailHash(s.email))
  }

  // Univers = tous les hash connus
  const universe = new Set([...Object.keys(meta), ...Object.keys(cold).filter(k => k !== '_meta'), ...Object.keys(widgetSent), ...leadHashes, ...(paid || [])])

  const funnel = {}
  const counts = { discovered: 0, contacted: 0, lead: 0, paid: 0 }
  for (const h of universe) {
    const m = meta[h] || {}
    const c = cold[h] || null
    const w = widgetSent[h] || null
    const isLead = leadHashes.has(h)
    const isPaid = paid ? paid.has(h) : false
    const contactedAt = (c && c.c0) || (w && w.date) || null
    let stage, nextAction
    if (isPaid) { stage = 'paid'; nextAction = 'onboarding + relance renouvellement' }
    else if (isLead) { stage = 'lead'; nextAction = 'pousser la conversion (drip b13 → lien de paiement)' }
    else if (c || w) {
      stage = 'contacted'
      const age = contactedAt ? daysSince(contactedAt) : null
      if (c && !c.c4 && age != null && age >= 4) nextAction = 'relance c4 (auto)'
      else if (age != null && age >= 14) nextAction = 'sans réponse 14j → requalifier / pause'
      else nextAction = 'attendre / relance programmée'
    } else { stage = 'discovered'; nextAction = 'à contacter (prospection auto)' }
    counts[stage]++
    funnel[h] = { stage, name: m.name || null, island: m.island || null, contactedAt, isLead, isPaid, nextAction }
  }

  const out = {
    updatedAt: new Date().toISOString(),
    signals: { paidSignal: paid ? 'mollie' : 'absent (pas de MOLLIE_API_KEY)', leadsSignal: (Array.isArray(subs) && subs.length) ? 'subscribers' : 'absent', clickSignal: 'à brancher (token &b + stats)' },
    counts,
    funnel,
  }
  save(OUT, out)
  console.log('Funnel:', JSON.stringify(counts))
  console.log(`Univers: ${universe.size} prospects · paid signal: ${out.signals.paidSignal}`)
}
main().catch(e => { console.error(e); process.exit(1) })

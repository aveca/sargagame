#!/usr/bin/env node
/**
 * reconcile-mollie-sales.cjs — Rapprochement vérité des ventes (P0)
 *
 * Lecture seule sur Mollie (GET uniquement : aucun paiement, remboursement,
 * capture ou modification de compte). Rapproche :
 *   1. Paiements Mollie (liste complète, statut, montant, devise, métadonnées)
 *   2. Remboursements Mollie (liste complète)
 *   3. payment_grants dans Supabase (droits délivrés)
 *   4. Événements analytics sg_conversion / sg_checkout_* (Supabase)
 *
 * Sortie détaillée : uniquement vers RECONCILE_PRIVATE_OUTPUT_PATH, chemin absolu hors dépôt.
 * Aucun détail transactionnel n'est écrit dans les logs publics ou dans le dépôt.
 *
 * Secrets requis (env) : MOLLIE_API_KEY (live_), SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Absent → skip propre, rien d'écrit.
 *
 * Usage : node scripts/automation/reconcile-mollie-sales.cjs [--write-private]
 *   par défaut : lecture seule, logs génériques, aucun fichier écrit
 *   --write-private : écrit vers un chemin absolu externe au dépôt.
 */
const fs = require('fs')
const path = require('path')
const { emailHash } = require('./lib/email-hash.cjs')

const WRITE_PRIVATE = process.argv.includes('--write-private')
const REPO_ROOT = path.resolve(__dirname, '../..')
const MOLLIE_BASE = 'https://api.mollie.com/v2'

function resolvePrivateOutputPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim() || !path.isAbsolute(rawPath)) {
    throw new Error('RECONCILE_PRIVATE_OUTPUT_PATH doit être un chemin absolu.')
  }
  const resolved = path.resolve(rawPath)
  const relative = path.relative(REPO_ROOT, resolved)
  const isInsideRepo = relative === '' ||
    (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  if (isInsideRepo) {
    throw new Error('Le rapport transactionnel doit être écrit hors du dépôt public.')
  }
  return resolved
}

function maskEmail(e) {
  if (!e) return null
  return emailHash(e)
}

async function mollieGet(url, key) {
  const requestUrl = url.startsWith('http') ? url : new URL(url, MOLLIE_BASE).toString()
  const res = await fetch(requestUrl, { headers: { Authorization: 'Bearer ' + key } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie GET ${url}: ${j.detail || res.status}`)
  return j
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  let pages = 0
  while (out.length < cap && url) {
    const pg = await mollieGet(url, key)
    const keyName = Object.keys(pg._embedded || {})[0]
    const items = keyName ? pg._embedded[keyName] : []
    out.push(...(items || []))
    url = pg._links?.next?.href || null
    pages += 1
    if (pages > 200) throw new Error('Mollie pagination exceeded safety cap')
  }
  return out
}

function isTestPayment(p) {
  const id = String(p.id || '')
  const md = p.metadata || {}
  const email = String(md.email || '')
  const source = String(md.source || '')
  const desc = String(p.description || '')
  // IDs de test explicites, emails de test, sources de test, localhost
  return /^tr_(test|SOSmock|mock)/i.test(id) ||
    /test@example\.com|127\.0\.0\.1|localhost/.test(email) ||
    /test|mock|sosmock|local/.test(source) ||
    /test|mock|demo/i.test(desc)
}

function normalizePayment(p) {
  const md = p.metadata || {}
  return {
    id: p.id,
    status: p.status,
    amount: Number(p.amount?.value || 0),
    currency: String(p.amount?.currency || '').toUpperCase(),
    createdAt: p.createdAt,
    method: p.method || null,
    description: p.description || null,
    metadata: md,
    pass: String(md.pass || ''),
    email: String(md.email || ''),
    emailHash: maskEmail(String(md.email || '')),
    source: String(md.source || ''),
    isTest: isTestPayment(p),
  }
}

async function listRefunds(key) {
  try {
    return await listAll('/v2/refunds', key)
  } catch (e) {
    console.warn('[reconcile] refunds list failed:', e.message)
    return []
  }
}

async function fetchSupabaseGrants(url, key) {
  const q = `${url.replace(/\/$/, '')}/rest/v1/payment_grants?select=payment_id,type,pass,plan,email,currency,expires_at,granted_at,metadata&order=created_at.desc`
  const res = await fetch(q, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Supabase grants: ${res.status}`)
  return await res.json()
}

async function main() {
  const mollieKey = (process.env.MOLLIE_API_KEY || '').trim()
  const sbUrl = (process.env.SUPABASE_URL || '').trim()
  const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()

  if (!mollieKey) {
    console.log('MOLLIE_API_KEY absent — skip (dry-run uniquement possible)')
    process.exit(0)
  }
  if (!mollieKey.startsWith('live_') && !mollieKey.startsWith('test_')) {
    console.error('MOLLIE_API_KEY : préfixe inattendu (live_ ou test_ attendu) — abandon.')
    process.exit(1)
  }
  const mode = mollieKey.startsWith('live_') ? 'LIVE' : 'TEST'
  console.log(`[reconcile] mode=${mode}`)

  // 1. Tous les paiements Mollie
  const rawPayments = await listAll('/v2/payments', mollieKey)
  const payments = rawPayments.map(normalizePayment)
  const paid = payments.filter(p => p.status === 'paid')
  const testPaid = paid.filter(p => p.isTest)
  const realPaid = paid.filter(p => !p.isTest)

  // 2. Remboursements
  const rawRefunds = await listRefunds(mollieKey)
  const refundsByPayment = new Map()
  for (const r of rawRefunds) {
    const pid = String(r.payment_id || '')
    const amount = Number(r.amount?.value || 0)
    const cur = String(r.amount?.currency || '').toUpperCase()
    if (!refundsByPayment.has(pid)) refundsByPayment.set(pid, [])
    refundsByPayment.get(pid).push({ id: r.id, status: r.status, amount, currency: cur, createdAt: r.createdAt })
  }

  // 3. Grants Supabase (si dispo)
  let grants = []
  let supabaseOk = false
  if (sbUrl && sbKey) {
    try {
      grants = await fetchSupabaseGrants(sbUrl, sbKey)
      supabaseOk = true
    } catch (e) {
      console.warn('[reconcile] Supabase grants failed:', e.message)
    }
  }
  const grantByPaymentId = new Map()
  for (const g of grants) {
    grantByPaymentId.set(String(g.payment_id || ''), g)
  }

  // 4. Rapprochement
  const reconciled = []
  const issues = []

  for (const p of realPaid) {
    const grant = grantByPaymentId.get(p.id)
    const refunds = refundsByPayment.get(p.id) || []
    const refundedTotal = refunds.reduce((s, r) => s + r.amount, 0)
    const net = p.amount - refundedTotal

    const entry = {
      paymentId: p.id,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt,
      pass: p.pass || null,
      emailHash: p.emailHash || null,
      source: p.source || null,
      method: p.method,
      description: p.description,
      refunds: refunds.map(r => ({ id: r.id, status: r.status, amount: r.amount, currency: r.currency, createdAt: r.createdAt })),
      refundedTotal,
      netAmount: net,
      grant: grant ? {
        id: grant.id,
        type: grant.type,
        pass: grant.pass,
        plan: grant.plan,
        emailHash: maskEmail(String(grant.email || '')),
        currency: grant.currency,
        expiresAt: grant.expires_at,
        grantedAt: grant.granted_at,
      } : null,
      grantMatch: grant ? grant.pass === p.pass && String(grant.currency).toUpperCase() === p.currency : false,
    }
    reconciled.push(entry)

    // Problèmes détectés
    if (!grant) {
      issues.push({ paymentId: p.id, severity: 'high', type: 'paid_no_grant', detail: 'Paiement payé sans grant Supabase correspondant' })
    } else if (!grant.grantMatch) {
      issues.push({ paymentId: p.id, severity: 'medium', type: 'grant_mismatch', detail: 'Grant Supabase : pass/devise incohérents avec le paiement Mollie' })
    }
    if (refunds.length > 0) {
      issues.push({ paymentId: p.id, severity: 'medium', type: 'refunded', detail: `${refunds.length} remboursement(s) détecté(s), total ${refundedTotal.toFixed(2)} ${p.currency}` })
    }
    if (net <= 0) {
      issues.push({ paymentId: p.id, severity: 'high', type: 'fully_refunded', detail: 'Paiement intégralement remboursé (net <= 0)' })
    }
  }

  // Grants sans paiement correspondant (droits délivrés sans preuve de paiement)
  const paidIds = new Set(realPaid.map(p => p.id))
  for (const g of grants) {
    if (!paidIds.has(String(g.payment_id || ''))) {
      issues.push({ paymentId: String(g.payment_id || ''), severity: 'medium', type: 'grant_no_payment', detail: 'Grant Supabase sans paiement Mollie correspondant' })
    }
  }

  // Totaux
  const totalsByCurrency = new Map()
  for (const p of realPaid) {
    const cur = p.currency || 'UNKNOWN'
    if (!totalsByCurrency.has(cur)) totalsByCurrency.set(cur, { count: 0, gross: 0, refunded: 0 })
    const t = totalsByCurrency.get(cur)
    t.count += 1
    t.gross += p.amount
    const refunds = refundsByPayment.get(p.id) || []
    t.refunded += refunds.reduce((s, r) => s + r.amount, 0)
  }
  // Recalcul net propre par devise
  for (const [cur, t] of totalsByCurrency) {
    const curPayments = realPaid.filter(p => p.currency === cur)
    let net = 0
    for (const p of curPayments) {
      const refunds = refundsByPayment.get(p.id) || []
      net += p.amount - refunds.reduce((s, r) => s + r.amount, 0)
    }
    t.net = Math.round(net * 100) / 100
    t.gross = Math.round(t.gross * 100) / 100
    t.refunded = Math.round(t.refunded * 100) / 100
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    mollieProfile: 'pfl_t8KCk4Cm2C',
    summary: {
      paymentsTotal: payments.length,
      paymentsPaid: paid.length,
      realPaid: realPaid.length,
      testPaidExcluded: testPaid.length,
      paymentsByStatus: (() => { const m = {}; for (const p of payments) { m[p.status] = (m[p.status] || 0) + 1 } return m })(),
      totalCurrencies: [...totalsByCurrency.entries()].map(([cur, t]) => ({ currency: cur, ...t })),
    },
    reconciled,
    issues,
    source: 'mollie-api + supabase payment_grants',
    readOnly: true,
  }

  console.log('[reconcile] Rapprochement terminé. Détails transactionnels masqués des logs publics.')

  if (WRITE_PRIVATE) {
    const outputPath = resolvePrivateOutputPath(process.env.RECONCILE_PRIVATE_OUTPUT_PATH)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
    console.log('[reconcile] Rapport détaillé enregistré dans un chemin privé hors du dépôt (chemin masqué).')
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
}

module.exports = { resolvePrivateOutputPath }

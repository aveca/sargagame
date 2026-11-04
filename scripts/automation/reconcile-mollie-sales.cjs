#!/usr/bin/env node
'use strict'

/**
 * reconcile-mollie-sales.cjs — Rapprochement financier en lecture seule.
 *
 * GET uniquement sur Mollie et Supabase. Exécution locale uniquement :
 * aucune workflow GitHub ne doit publier des identifiants de paiement,
 * hashes email ou montants dans les logs publics.
 *
 * Usage:
 *   node scripts/automation/reconcile-mollie-sales.cjs
 *   node scripts/automation/reconcile-mollie-sales.cjs --private-report
 *
 * --private-report écrit le détail sous os.tmpdir() (ou dans
 * SARGAGAME_PRIVATE_REPORT_PATH), jamais dans le dépôt.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { emailHash } = require('./lib/email-hash.cjs')

const REPO_ROOT = path.resolve(__dirname, '../..')
const PRIVATE_OUTPUT = path.resolve(
  process.env.SARGAGAME_PRIVATE_REPORT_PATH ||
  path.join(os.tmpdir(), 'sargagame-reconcile-sales.json')
)
const PRIVATE_REPORT = process.argv.includes('--private-report')
const MOLLIE_BASE = 'https://api.mollie.com/v2'

function assertPrivateOutput(filePath) {
  const relative = path.relative(REPO_ROOT, filePath)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Refusing to write a financial report inside the public repository.')
  }
}

function maskEmail(email) {
  return email ? emailHash(email) : null
}

async function mollieGet(url, key) {
  const requestUrl = url.startsWith('http') ? url : new URL(url, MOLLIE_BASE).toString()
  const response = await fetch(requestUrl, { headers: { Authorization: 'Bearer ' + key } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Mollie GET failed: HTTP ${response.status}`)
  return body
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  let pages = 0
  while (out.length < cap && url) {
    const page = await mollieGet(url, key)
    const embedded = page._embedded || {}
    const items = embedded.payments || embedded.refunds || Object.values(embedded)[0] || []
    out.push(...items)
    url = page._links?.next?.href || null
    pages += 1
    if (pages > 200) throw new Error('Mollie pagination exceeded safety cap')
  }
  return out.slice(0, cap)
}

function isTestPayment(payment) {
  const id = String(payment.id || '')
  const metadata = payment.metadata || {}
  const email = String(metadata.email || '')
  const source = String(metadata.source || '')
  const description = String(payment.description || '')
  return /^tr_(test|SOSmock|mock)/i.test(id) ||
    /test@example\.com|127\.0\.0\.1|localhost/i.test(email) ||
    /test|mock|sosmock|local/i.test(source) ||
    /test|mock|demo/i.test(description)
}

function normalizePayment(payment) {
  const metadata = payment.metadata || {}
  return {
    id: payment.id,
    status: payment.status,
    amount: Number(payment.amount?.value || 0),
    currency: String(payment.amount?.currency || '').toUpperCase(),
    createdAt: payment.createdAt,
    method: payment.method || null,
    description: payment.description || null,
    pass: String(metadata.pass || ''),
    emailHash: maskEmail(String(metadata.email || '')),
    source: String(metadata.source || ''),
    isTest: isTestPayment(payment),
  }
}

async function listRefundsForPayments(payments, key) {
  const refunds = []
  for (const payment of payments) {
    const pathForPayment = `/v2/payments/${encodeURIComponent(payment.id)}/refunds`
    const items = await listAll(pathForPayment, key)
    for (const refund of items) {
      refunds.push({ ...refund, paymentId: refund.paymentId || payment.id })
    }
  }
  return refunds
}

async function fetchSupabaseGrants(url, key) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/payment_grants?select=payment_id,type,pass,plan,currency,expires_at,granted_at&order=created_at.desc`
  const response = await fetch(endpoint, {
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Supabase grants GET failed: HTTP ${response.status}`)
  return await response.json()
}

function money(value) {
  return Math.round(value * 100) / 100
}

async function main() {
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    throw new Error('This financial reconciliation is local-only; do not run it in public CI.')
  }
  if (process.argv.includes('--send')) {
    throw new Error('The public --send mode is removed. Use --private-report for an OS-temporary private file.')
  }

  const mollieKey = (process.env.MOLLIE_API_KEY || '').trim()
  const sbUrl = (process.env.SUPABASE_URL || '').trim()
  const sbKey = (process.env.SUPABASE_SERVICE_KEY || '').trim()
  if (!mollieKey || !sbUrl || !sbKey) {
    throw new Error('MOLLIE_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_KEY are all required; refusing a partial reconciliation.')
  }
  if (!mollieKey.startsWith('live_') && !mollieKey.startsWith('test_')) {
    throw new Error('MOLLIE_API_KEY prefix is not recognized; no API request was made.')
  }

  const mode = mollieKey.startsWith('live_') ? 'LIVE' : 'TEST'
  const rawPayments = await listAll('/v2/payments', mollieKey)
  const payments = rawPayments.map(normalizePayment)
  const paid = payments.filter(payment => payment.status === 'paid')
  const testPaid = paid.filter(payment => payment.isTest)
  const realPaid = paid.filter(payment => !payment.isTest)

  // Mollie lists refunds per payment, not through a global /v2/refunds collection.
  const rawRefunds = await listRefundsForPayments(realPaid, mollieKey)
  const refundsByPayment = new Map()
  for (const refund of rawRefunds) {
    const paymentId = String(refund.paymentId || '')
    if (!refundsByPayment.has(paymentId)) refundsByPayment.set(paymentId, [])
    refundsByPayment.get(paymentId).push({
      id: refund.id,
      status: refund.status,
      amount: Number(refund.amount?.value || 0),
      currency: String(refund.amount?.currency || '').toUpperCase(),
      createdAt: refund.createdAt,
    })
  }

  // A missing/failed Supabase read is fatal: it must never be reported as zero grants.
  const grants = await fetchSupabaseGrants(sbUrl, sbKey)
  const grantByPaymentId = new Map(grants.map(grant => [String(grant.payment_id || ''), grant]))
  const reconciled = []
  const issues = []

  for (const payment of realPaid) {
    const grant = grantByPaymentId.get(payment.id)
    const refunds = refundsByPayment.get(payment.id) || []
    const refundedTotal = refunds
      .filter(refund => refund.status === 'refunded')
      .reduce((sum, refund) => sum + refund.amount, 0)
    const pendingRefundTotal = refunds
      .filter(refund => ['queued', 'pending', 'processing'].includes(refund.status))
      .reduce((sum, refund) => sum + refund.amount, 0)
    const netAmount = payment.amount - refundedTotal
    const entry = {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      createdAt: payment.createdAt,
      pass: payment.pass || null,
      emailHash: payment.emailHash,
      source: payment.source || null,
      method: payment.method,
      description: payment.description,
      refunds,
      refundedTotal: money(refundedTotal),
      pendingRefundTotal: money(pendingRefundTotal),
      netAmount: money(netAmount),
      grant: grant ? {
        id: grant.id,
        type: grant.type,
        pass: grant.pass,
        plan: grant.plan,
        currency: grant.currency,
        expiresAt: grant.expires_at,
        grantedAt: grant.granted_at,
      } : null,
      grantMatch: Boolean(grant) &&
        grant.pass === payment.pass &&
        String(grant.currency || '').toUpperCase() === payment.currency,
    }
    reconciled.push(entry)

    if (!grant) {
      issues.push({ severity: 'high', type: 'paid_no_grant', paymentId: payment.id })
    } else if (!entry.grantMatch) {
      issues.push({ severity: 'medium', type: 'grant_mismatch', paymentId: payment.id })
    }
    if (refunds.length) {
      issues.push({ severity: 'medium', type: 'refunds_present', paymentId: payment.id })
    }
    if (netAmount <= 0) {
      issues.push({ severity: 'high', type: 'fully_refunded', paymentId: payment.id })
    }
  }

  const paidIds = new Set(realPaid.map(payment => payment.id))
  for (const grant of grants) {
    if (!paidIds.has(String(grant.payment_id || ''))) {
      issues.push({ severity: 'medium', type: 'grant_no_payment' })
    }
  }

  const totalsByCurrency = new Map()
  for (const payment of realPaid) {
    const currency = payment.currency || 'UNKNOWN'
    if (!totalsByCurrency.has(currency)) {
      totalsByCurrency.set(currency, { count: 0, gross: 0, refunded: 0, pendingRefunds: 0 })
    }
    const total = totalsByCurrency.get(currency)
    total.count += 1
    total.gross += payment.amount
    const refunds = refundsByPayment.get(payment.id) || []
    total.refunded += refunds
      .filter(refund => refund.status === 'refunded')
      .reduce((sum, refund) => sum + refund.amount, 0)
    total.pendingRefunds += refunds
      .filter(refund => ['queued', 'pending', 'processing'].includes(refund.status))
      .reduce((sum, refund) => sum + refund.amount, 0)
  }
  for (const total of totalsByCurrency.values()) {
    total.gross = money(total.gross)
    total.refunded = money(total.refunded)
    total.pendingRefunds = money(total.pendingRefunds)
    total.net = money(total.gross - total.refunded)
  }

  const issueCounts = issues.reduce((counts, issue) => {
    counts[issue.type] = (counts[issue.type] || 0) + 1
    return counts
  }, {})
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode,
    summary: {
      paymentsTotal: payments.length,
      paymentsPaid: paid.length,
      realPaid: realPaid.length,
      testPaidExcluded: testPaid.length,
      paymentsByStatus: payments.reduce((counts, payment) => {
        counts[payment.status] = (counts[payment.status] || 0) + 1
        return counts
      }, {}),
      grantsTotal: grants.length,
      refundsTotal: rawRefunds.length,
      issuesByType: issueCounts,
      totalCurrencies: [...totalsByCurrency.entries()].map(([currency, total]) => ({ currency, ...total })),
    },
    reconciled,
    issues,
    source: 'mollie-api + supabase payment_grants',
    readOnly: true,
  }

  console.log(`[reconcile] mode=${mode}`)
  console.log(`Payments: ${payments.length}; paid: ${paid.length}; test excluded: ${testPaid.length}; real paid: ${realPaid.length}`)
  console.log(`Supabase grants read: ${grants.length}; refunds read: ${rawRefunds.length}`)
  for (const [currency, total] of totalsByCurrency) {
    console.log(`${currency}: count=${total.count}, gross=${total.gross.toFixed(2)}, confirmed refunds=${total.refunded.toFixed(2)}, pending refunds=${total.pendingRefunds.toFixed(2)}, net=${total.net.toFixed(2)}`)
  }
  console.log(`Issues: ${issues.length} (${Object.entries(issueCounts).map(([type, count]) => `${type}=${count}`).join(', ') || 'none'})`)

  if (PRIVATE_REPORT) {
    assertPrivateOutput(PRIVATE_OUTPUT)
    fs.mkdirSync(path.dirname(PRIVATE_OUTPUT), { recursive: true, mode: 0o700 })
    fs.writeFileSync(PRIVATE_OUTPUT, JSON.stringify(report, null, 2), { mode: 0o600 })
    console.log(`Private report written outside repository: ${path.basename(PRIVATE_OUTPUT)}`)
  }
}

main().catch(error => {
  console.error('Reconciliation failed:', error.message)
  process.exitCode = 1
})

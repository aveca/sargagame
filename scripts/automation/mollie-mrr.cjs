#!/usr/bin/env node
/**
 * mollie-mrr.cjs — MRR tracker MOLLIE EXCLUSIF
 *
 * Lit l'API Mollie et calcule :
 *   - MRR (Monthly Recurring Revenue) depuis les abonnements actifs
 *   - Revenue B2C passes (one-time) du mois en cours
 *   - Revenue B2B annualisé (prorata mensuel)
 *   - Total lead -> payé (taux de conversion)
 *   - Nombre de clients payants Mollie
 *
 * Sortie : scripts/automation/data/mollie-mrr.json
 *
 * Usage :
 *   node scripts/automation/mollie-mrr.cjs           # lit depuis l'API
 *   node scripts/automation/mollie-mrr.cjs --send    # écrit le rapport
 *
 * Secrets : MOLLIE_API_KEY (GH Actions). Absent → skip propre.
 */
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, 'data', 'mollie-mrr.json')
const SEND = process.argv.includes('--send')
const MOLLIE_API_BASE = new URL('https://api.mollie.com/v2/')

function resolveMollieApiUrl(input) {
  let url
  try { url = new URL(input, MOLLIE_API_BASE) } catch (_) {
    throw new Error('Invalid Mollie API URL')
  }
  if (url.origin !== MOLLIE_API_BASE.origin || !url.pathname.startsWith('/v2/')) {
    throw new Error('Refusing Mollie request outside https://api.mollie.com/v2/')
  }
  return url.toString()
}

async function mollieGet(url, key) {
  const requestUrl = resolveMollieApiUrl(url)
  const res = await fetch(requestUrl, { headers: { Authorization: 'Bearer ' + key } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie ${url}: ${j.detail || res.status}`)
  return j
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  while (out.length < cap && url) {
    const pg = await mollieGet(url, key)
    const items = pg._embedded ? pg._embedded[Object.keys(pg._embedded)[0]] : []
    out.push(...(items || []))
    url = pg._links?.next?.href || null
  }
  return out
}


/**
 * List payments created since an ISO cutoff.
 *
 * Mollie v2 payment listing supports cursor pagination (from/next), not a
 * createdFrom date query parameter. Results are requested newest-first; once
 * a page crosses the cutoff, older pages cannot contain in-window payments.
 * Fail closed on malformed dates or an unexpectedly long pagination chain so
 * the report is never silently published with partial payment totals.
 */
async function listPaymentsSince(startIso, key, maxPages = 100) {
  const cutoff = Date.parse(startIso)
  if (!Number.isFinite(cutoff)) throw new Error('Invalid Mollie payment cutoff')
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('Invalid Mollie payment pagination page limit')
  }

  const out = []
  let url = 'payments?limit=250&sort=desc'
  let pages = 0

  while (url) {
    if (pages >= maxPages) {
      throw new Error(`Mollie payments pagination exceeded ${maxPages} pages before reaching cutoff`)
    }

    const page = await mollieGet(url, key)
    const items = page?._embedded?.payments
    if (!Array.isArray(items)) {
      throw new Error('Mollie payments response is missing _embedded.payments')
    }
    pages += 1
    if (items.length === 0) break

    let previousCreatedAt = Infinity
    let crossedCutoff = false
    for (const payment of items) {
      const createdAt = Date.parse(payment?.createdAt)
      if (!Number.isFinite(createdAt)) {
        throw new Error(`Mollie payment ${payment?.id || '(unknown)'} has an invalid createdAt`)
      }
      if (createdAt > previousCreatedAt) {
        throw new Error('Mollie payments are not ordered newest-first')
      }
      previousCreatedAt = createdAt

      if (createdAt >= cutoff) {
        if (crossedCutoff) {
          throw new Error('Mollie payments crossed the cutoff out of order')
        }
        out.push(payment)
      } else {
        crossedCutoff = true
      }
    }

    if (crossedCutoff) break

    if (!page._links || !Object.prototype.hasOwnProperty.call(page._links, 'next')) {
      throw new Error('Mollie payments response is missing _links.next')
    }
    const next = page._links.next
    if (next !== null && (!next || typeof next.href !== 'string' || !next.href)) {
      throw new Error('Mollie payments response has an invalid next pagination link')
    }
    url = next === null ? null : next.href
  }

  return out
}


function normalizeCurrency(amount) {
  const currency = typeof amount?.currency === 'string'
    ? amount.currency.trim().toUpperCase()
    : ''
  return /^[A-Z]{3}$/.test(currency) ? currency : 'UNKNOWN'
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

/**
 * Keep financial totals separated by Mollie transaction currency.
 * Legacy *_eur fields are EUR-only; no implicit FX conversion is performed.
 */
function calculateMollieMetrics(activeSubs = [], paid = []) {
  const groups = new Map()
  const ensureCurrency = currency => {
    if (!groups.has(currency)) {
      groups.set(currency, {
        subscriptions: 0,
        passes_month: 0,
        b2b_month: 0,
        revenue_month: 0,
        payments: 0,
      })
    }
    return groups.get(currency)
  }

  // Keep the legacy EUR-only fields present even when there is no EUR activity.
  ensureCurrency('EUR')

  for (const subscription of activeSubs) {
    const amount = Number.parseFloat(subscription.amount?.value || '0')
    if (!Number.isFinite(amount)) continue

    const interval = String(subscription.interval || '1 month').toLowerCase()
    const monthlyAmount = interval.includes('12') || interval.includes('year')
      ? amount / 12
      : amount
    ensureCurrency(normalizeCurrency(subscription.amount)).subscriptions += monthlyAmount
  }

  for (const payment of paid) {
    const amount = Number.parseFloat(payment.amount?.value || '0')
    if (!Number.isFinite(amount)) continue

    const group = ensureCurrency(normalizeCurrency(payment.amount))
    group.payments += 1
    group.revenue_month += amount

    if ((payment.metadata?.pass || '').startsWith('p') ||
        (payment.metadata?.plan || '').startsWith('pass')) {
      group.passes_month += amount
    }

    const description = (payment.description || '').toLowerCase()
    if (description.includes('pro') || description.includes('brief')) {
      group.b2b_month += amount
    }
  }

  const byCurrency = {}
  for (const [currency, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    byCurrency[currency] = {
      subscriptions: roundMoney(group.subscriptions),
      passes_month: roundMoney(group.passes_month),
      b2b_month: roundMoney(group.b2b_month),
      total: roundMoney(group.subscriptions + group.b2b_month / 12),
      revenue_month: roundMoney(group.revenue_month),
      payments: group.payments,
    }
  }

  const eur = byCurrency.EUR
  const currencyBreakdown = {}
  const revenueByCurrency = {}
  for (const [currency, totals] of Object.entries(byCurrency)) {
    if (totals.payments === 0) continue
    currencyBreakdown[currency] = {
      count: totals.payments,
      total_amount: totals.revenue_month,
    }
    revenueByCurrency[currency] = totals.revenue_month
  }

  return {
    mrr: {
      // Backward-compatible EUR fields now contain EUR transactions only.
      total_eur: eur.total,
      subscriptions_eur: eur.subscriptions,
      passes_month_eur: eur.passes_month,
      b2b_month_eur: eur.b2b_month,
      by_currency: byCurrency,
    },
    payments_this_month: paid.length,
    revenue_this_month_eur: eur.revenue_month,
    revenue_this_month_by_currency: revenueByCurrency,
    currency_breakdown: currencyBreakdown,
  }
}

async function main() {
  const key = (process.env.MOLLIE_API_KEY || '').trim()
  if (!key) { console.log('MOLLIE_API_KEY absent — skip'); process.exit(0) }

  console.log('=== Mollie MRR Tracker ===')

  // 1. Abonnements actifs (subscriptions)
  // Note: Mollie subscriptions sont liées à des customers.
  // On liste les customers puis leurs subs.
  const customers = await listAll('customers?limit=250', key)
  let activeSubs = []
  for (const c of customers) {
    try {
      const subs = await listAll(`customers/${c.id}/subscriptions?limit=250`, key)
      activeSubs.push(...subs.filter(s => s.status === 'active' || s.status === 'pending'))
    } catch {}
  }

  // 2. Paiements du mois en cours
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const payments = await listPaymentsSince(monthStart, key)
  const paid = payments.filter(p => p.status === 'paid')

  // 3. Calculs séparés par devise (aucune conversion FX implicite).
  const metrics = calculateMollieMetrics(activeSubs, paid)

  const uniquePayers = new Set()
  const uniquePayersAll = new Set()
  for (const s of activeSubs) { if (s.customerId) uniquePayers.add(s.customerId) }
  for (const p of paid) { if (p.customerId) uniquePayersAll.add(p.customerId) }

  const report = {
    schema_version: 2,
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    source: 'mollie-api',
    mrr: metrics.mrr,
    // Clients
    customers: {
      active_subs: activeSubs.length,
      paid_this_month: paid.length,
      unique_payers_all: uniquePayersAll.size,
    },
    // Paiements du mois : les champs EUR sont EUR-only ; les autres devises restent séparées.
    payments_this_month: metrics.payments_this_month,
    revenue_this_month_eur: metrics.revenue_this_month_eur,
    revenue_this_month_by_currency: metrics.revenue_this_month_by_currency,
    currency_breakdown: metrics.currency_breakdown,
  }

  // Lire l'historique et append
  let history = []
  if (fs.existsSync(OUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
      history = existing.history || []
    } catch {}
  }

  // Éviter les doublons du jour
  const today = now.toISOString().split('T')[0]
  history = history.filter(h => h.date !== today)
  history.push({
    schema_version: 2,
    date: today,
    mrr: report.mrr,
    customers: report.customers,
    revenue: report.revenue_this_month_eur,
    revenue_by_currency: report.revenue_this_month_by_currency,
  })
  // Garder 90 jours
  history.sort((a, b) => a.date.localeCompare(b.date))
  if (history.length > 90) history = history.slice(-90)

  report.history = history
  // Ignore pre-v2 history: its EUR-labelled totals mixed raw EUR and USD amounts.
  const versionedHistory = history.filter(entry => entry.schema_version === 2)
  const historicalMrr = (currency, days) => {
    if (versionedHistory.length < days) return null
    const entry = versionedHistory[versionedHistory.length - days]
    return entry.mrr?.by_currency?.[currency]?.total ?? 0
  }
  report.trend = versionedHistory.length >= 2 ? {
    mrr_7d: historicalMrr('EUR', 7),
    mrr_30d: historicalMrr('EUR', 30),
    current: report.mrr.total_eur,
    by_currency: Object.fromEntries(
      Object.entries(report.mrr.by_currency).map(([currency, totals]) => [currency, {
        mrr_7d: historicalMrr(currency, 7),
        mrr_30d: historicalMrr(currency, 30),
        current: totals.total,
      }])
    ),
  } : null

  console.log(`\n📊 Mollie MRR EUR (EUR uniquement): €${report.mrr.total_eur}`)
  console.log(`   Abonnements EUR: €${report.mrr.subscriptions_eur} (${report.customers.active_subs} actifs au total)`)
  console.log(`   Passes B2C EUR ce mois: €${report.mrr.passes_month_eur}`)
  console.log(`   B2B EUR ce mois: €${report.mrr.b2b_month_eur}`)
  console.log(`   Revenu EUR ce mois: €${report.revenue_this_month_eur}`)
  for (const [currency, totals] of Object.entries(report.mrr.by_currency)) {
    if (currency === 'EUR') continue
    console.log(`   MRR ${currency} (non converti): ${totals.total}`)
  }
  for (const [currency, revenue] of Object.entries(report.revenue_this_month_by_currency)) {
    if (currency === 'EUR') continue
    console.log(`   Revenu ${currency} ce mois (non converti): ${revenue}`)
  }
  console.log(`   Paiements ce mois: ${report.payments_this_month}`)
  console.log(`   Période MRR v2: ${versionedHistory.length} jours`)

  // Target €1000 — EUR only; USD and unknown currencies are not converted.
  const target = 1000
  const pct = Math.round((report.mrr.total_eur / target) * 10000) / 100
  console.log(`\n🎯 Cible EUR €${target}/mois: ${pct}% atteint`)
  console.log(`   Il reste €${Math.round((target - report.mrr.total_eur) * 100) / 100} à générer en EUR`)

  if (SEND) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
    console.log(`\nRapport écrit → ${path.relative(process.cwd(), OUT_PATH)}`)
  }
}

if (require.main === module) {
  main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })
}

module.exports = { resolveMollieApiUrl, mollieGet, listAll, listPaymentsSince, normalizeCurrency, calculateMollieMetrics }

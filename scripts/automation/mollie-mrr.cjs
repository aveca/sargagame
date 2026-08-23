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

async function mollieGet(url, key) {
  const base = 'https://api.mollie.com/v2/'
  const fullUrl = url.startsWith('http') ? url : base + url
  const res = await fetch(fullUrl, { headers: { Authorization: 'Bearer ' + key } })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mollie ${fullUrl}: ${j.detail || res.status}`)
  return j
}

async function listAll(basePath, key, cap = 500) {
  const out = []
  let url = basePath
  while (out.length < cap && url) {
    const pg = await mollieGet(url, key)
    const items = pg._embedded ? pg._embedded[Object.keys(pg._embedded)[0]] : []
    out.push(...(items || []))
    url = pg._links?.next?.href ? pg._links.next.href.replace('https://api.mollie.com/v2/', '') : null
  }
  return out
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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const payments = await listAll(`payments?limit=250&createdFrom=${encodeURIComponent(monthStart)}`, key)
  const paid = payments.filter(p => p.status === 'paid')

  // 3. Calculs
  const monthlySubMRR = activeSubs.reduce((sum, s) => {
    const amount = parseFloat(s.amount?.value || '0')
    const interval = s.interval || '1 month'
    // Annualize monthly, then divide by 12
    if (interval.includes('12') || interval.includes('year')) return sum + (amount / 12)
    return sum + amount
  }, 0)

  const monthlyPassRevenue = paid
    .filter(p => (p.metadata?.pass || '').startsWith('p') || (p.metadata?.plan || '').startsWith('pass'))
    .reduce((sum, p) => sum + parseFloat(p.amount?.value || '0'), 0)

  const monthlyB2BRevenue = paid
    .filter(p => (p.description || '').toLowerCase().includes('pro') || (p.description || '').toLowerCase().includes('brief'))
    .reduce((sum, p) => sum + parseFloat(p.amount?.value || '0'), 0)

  const totalMRR = monthlySubMRR + (monthlyB2BRevenue / 12) // annualized B2B one-time

  const uniquePayers = new Set()
  const uniquePayersAll = new Set()
  for (const s of activeSubs) { if (s.customerId) uniquePayers.add(s.customerId) }
  for (const p of paid) { if (p.customerId) uniquePayersAll.add(p.customerId) }

  const report = {
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),
    source: 'mollie-api',
    // MRR core
    mrr: {
      total_eur: Math.round(totalMRR * 100) / 100,
      subscriptions_eur: Math.round(monthlySubMRR * 100) / 100,
      passes_month_eur: Math.round(monthlyPassRevenue * 100) / 100,
      b2b_month_eur: Math.round(monthlyB2BRevenue * 100) / 100,
    },
    // Clients
    customers: {
      active_subs: activeSubs.length,
      paid_this_month: paid.length,
      unique_payers_all: uniquePayersAll.size,
    },
    // Paiements du mois
    payments_this_month: paid.length,
    revenue_this_month_eur: Math.round(paid.reduce((s, p) => s + parseFloat(p.amount?.value || '0'), 0) * 100) / 100,
    currency_breakdown: {},
  }

  // Currency breakdown
  const byCurrency = {}
  for (const p of paid) {
    const c = p.amount?.currency || 'EUR'
    if (!byCurrency[c]) byCurrency[c] = { count: 0, total: 0 }
    byCurrency[c].count++
    byCurrency[c].total += parseFloat(p.amount?.value || '0')
  }
  for (const [c, v] of Object.entries(byCurrency)) {
    report.currency_breakdown[c] = { count: v.count, total_eur: Math.round(v.total * 100) / 100 }
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
  history.push({ date: today, mrr: report.mrr, customers: report.customers, revenue: report.revenue_this_month_eur })
  // Garder 90 jours
  history.sort((a, b) => a.date.localeCompare(b.date))
  if (history.length > 90) history = history.slice(-90)

  report.history = history
  report.trend = history.length >= 2 ? {
    mrr_7d: history.length >= 7 ? history.slice(-7)[0].mrr.total_eur : null,
    mrr_30d: history.length >= 30 ? history[history.length - 30].mrr.total_eur : null,
    current: report.mrr.total_eur,
  } : null

  console.log(`\n📊 Mollie MRR: €${report.mrr.total_eur}`)
  console.log(`   Abonnements: €${report.mrr.subscriptions_eur} (${report.customers.active_subs} actifs)`)
  console.log(`   Passes B2C ce mois: €${report.mrr.passes_month_eur} (${report.payments_this_month} paiements)`)
  console.log(`   B2B ce mois: €${report.mrr.b2b_month_eur}`)
  console.log(`   Paiements ce mois: ${report.payments_this_month} · Revenu: €${report.revenue_this_month_eur}`)
  console.log(`   Période MRR: ${history.length} jours`)

  // Target €1000
  const target = 1000
  const pct = Math.round((report.mrr.total_eur / target) * 10000) / 100
  console.log(`\n🎯 Target €${target}/mois: ${pct}% atteint`)
  console.log(`   Il reste €${Math.round((target - report.mrr.total_eur) * 100) / 100} à générer`)

  if (SEND) {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2))
    console.log(`\nRapport écrit → ${path.relative(process.cwd(), OUT_PATH)}`)
  }
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })

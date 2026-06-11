#!/usr/bin/env node
/**
 * Daily Stats Check — reads metrics from Apps Script backend
 * and logs them for monitoring. Run after each ERDDAP update.
 *
 * Reads from: Apps Script ?action=stats
 * Writes to:  scripts/automation/data/daily-metrics.json
 */
const fs = require('fs')
const path = require('path')
const https = require('https')

const STATS_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=stats'
const FUNNEL_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=funnel'
const METRICS_PATH = path.join(__dirname, 'data', 'daily-metrics.json')
const SARG_PATH = path.join(__dirname, '../../public/api/copernicus/sargassum.json')

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      // Follow redirects (Apps Script returns 302)
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch { resolve(null) }
      })
    })
    req.on('error', () => resolve(null))
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
  })
}

// Vérité Stripe (lecture seule) — payments_real du funnel est connu MENTEUR
// (réconciliations 2026-06-10/11 : 15 réels vs 1 affiché). La clé NE VA PAS
// en CI (secret à pouvoirs d'écriture) : ce bloc ne s'exécute que là où .env
// existe (sessions locales + crons command center) → points de vérité
// périodiques dans la série, null sur les runs CI.
async function stripeTruth() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8')
    const key = (env.match(/STRIPE_SECRET_KEY=([^\r\n]+)/) || [])[1]
    if (!key) return null
    const get = p => new Promise((res, rej) => {
      https.get({ host: 'api.stripe.com', path: p, headers: { Authorization: 'Bearer ' + key } }, r => {
        let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)) } catch (e) { rej(e) } })
      }).on('error', rej)
    })
    const act = await get('/v1/subscriptions?status=active&limit=100')
    const pd = await get('/v1/subscriptions?status=past_due&limit=100')
    const mrr = {}
    for (const s of act.data || []) {
      const pl = s.plan || s.items?.data?.[0]?.plan || {}
      const m = (pl.interval === 'year' ? (pl.amount || 0) / 12 : (pl.amount || 0)) / 100
      mrr[s.currency] = Math.round(((mrr[s.currency] || 0) + m) * 100) / 100
    }
    return {
      active: (act.data || []).length,
      mrr,
      pastDue: (pd.data || []).length,
      cancelScheduled: (act.data || []).filter(s => s.cancel_at_period_end).length,
    }
  } catch { return null }
}

async function main() {
  console.log('=== Daily Stats Check ===')
  const now = new Date()

  // 1. Fetch stats from Apps Script
  console.log('Fetching stats from Apps Script...')
  const stats = await fetchJSON(STATS_URL)

  if (!stats || stats.error) {
    console.log('Could not fetch stats:', stats?.error || 'no response')
    console.log('(Apps Script may not be deployed yet)')
  } else {
    console.log(`Payments: ${stats.payments} (${stats.revenue} EUR)`)
    console.log(`Emails: ${stats.emails}`)
    console.log(`Feedbacks: ${stats.feedbacks} (avg rating: ${stats.avgRating})`)
    console.log(`Emails sent: ${stats.emailsSent}`)
  }

  // 1b. Série funnel complète (KPI « en série » — user 2026-06-11). Source :
  // endpoint funnel (mêmes compteurs que la session-startup). ⚠️ payments_real
  // est connu TROMPEUR (réconciliation Stripe 2026-06-10 : 15 réels vs 1 affiché)
  // — stocké pour l'historique, la vérité paiements reste Stripe (clé locale).
  console.log('Fetching funnel from Apps Script...')
  const funnel = await fetchJSON(FUNNEL_URL)
  if (funnel && !funnel.error) {
    console.log(`Funnel: ${funnel.session_start} sessions | ${funnel.premium_modal_open} modals | ${funnel.premium_modal_cta} CTA | ${funnel.checkout_redirect} redirects | ${funnel.email_submit} emails`)
  }

  // 2. Check pipeline freshness
  let pipelineOk = false
  try {
    const sarg = JSON.parse(fs.readFileSync(SARG_PATH, 'utf-8'))
    const age = (now - new Date(sarg.updatedAt)) / 3600000 // hours
    pipelineOk = age < 12
    console.log(`Pipeline: ${sarg.source} | age: ${age.toFixed(1)}h | ${pipelineOk ? 'OK' : 'STALE'}`)
  } catch { console.log('Pipeline: no sargassum.json found') }

  // 3. Save daily snapshot
  const dataDir = path.join(__dirname, 'data')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

  let metrics = []
  try { metrics = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf-8')) } catch {}

  const today = now.toISOString().slice(0, 10)
  // Le point de vérité Stripe vient des runs LOCAUX (clé absente en CI) : si la
  // row du jour en a déjà un, le run CI suivant ne doit pas l'écraser par null.
  const prevToday = metrics.find(r => r.date === today)
  // Upsert by date: drop any prior same-day rows so the last write of the day wins.
  // Without this, 4x/day crons + local runs bloat the file (90-day cap = ~15 real days)
  // and trend detection below would compare same-day dups instead of day-over-day.
  metrics = metrics.filter(r => r.date !== today)
  metrics.push({
    date: today,
    time: now.toISOString(),
    payments: stats?.payments || null,
    revenue: stats?.revenue || null,
    emails: stats?.emails || null,
    feedbacks: stats?.feedbacks || null,
    avgRating: stats?.avgRating || null,
    pipelineOk,
    // Série funnel (cumuls Apps Script — les DELTAS jour-à-jour font la série)
    funnel: funnel && !funnel.error ? {
      sessions: funnel.session_start ?? null,
      lockClicks: funnel.forecast_lock_click ?? null,
      modalOpens: funnel.premium_modal_open ?? null,
      modalCta: funnel.premium_modal_cta ?? null,
      sampleStarts: funnel.sample_start ?? null,
      emailSubmits: funnel.email_submit ?? null,
      checkoutRedirects: funnel.checkout_redirect ?? null,
      conversions: funnel.conversion ?? null,
      paymentsReal: funnel.payments_real ?? null, // ⚠️ trompeur, cf. memory
      revenueReal: funnel.revenue_real ?? null,
      rates: funnel.rates || null,
    } : null,
    // Vérité Stripe (runs locaux seulement — préservée si le run courant n'a pas la clé)
    stripe: (await stripeTruth()) || prevToday?.stripe || null,
  })

  // Keep last 90 days
  if (metrics.length > 90) metrics = metrics.slice(-90)
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2), 'utf-8')
  console.log(`Metrics saved (${metrics.length} days)`)

  // 4. Trend detection — compare today vs last entry from a prior date
  const curr = metrics[metrics.length - 1]
  const prev = [...metrics].reverse().find(r => r.date !== curr.date)
  if (prev) {
    if (prev.payments != null && curr.payments != null && curr.payments > prev.payments) {
      console.log(`NEW PAYMENT DETECTED: ${prev.payments} -> ${curr.payments}`)
    }
    if (prev.emails != null && curr.emails != null && curr.emails > prev.emails) {
      console.log(`NEW EMAIL SIGNUP: ${prev.emails} -> ${curr.emails} (+${curr.emails - prev.emails})`)
    }
    if (prev.feedbacks != null && curr.feedbacks != null && curr.feedbacks > prev.feedbacks) {
      console.log(`NEW FEEDBACK: ${prev.feedbacks} -> ${curr.feedbacks}`)
    }
  }

  console.log('Done.')
}

main().catch(e => console.error(e))

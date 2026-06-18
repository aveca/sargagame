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
const EMAIL_STATS_URL = 'https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec?action=email_stats'
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
    // Attribution par source — metadata.source est posé par create-checkout.php
    // (front : utm_source=email → openPremium → source 'deeplink_email' ; 'nav',
    // 'alertes_landing'… pour les autres surfaces). Les subs antérieurs au checkout
    // on-site (Payment Links legacy) n'ont pas de source → '(none)'. C'est la mesure
    // « combien rapporte l'email » : ce KPI démarre à 0 et se remplit dès qu'une
    // vente vient d'un clic mail (B, 2026-06-17). emailAttributed = floor (MRR en €,
    // les passes one-time ne sont pas comptés ici — c'est de l'abonnement seulement).
    const bySource = {}
    let emailActive = 0, emailMrrEur = 0
    for (const s of act.data || []) {
      const pl = s.plan || s.items?.data?.[0]?.plan || {}
      const m = (pl.interval === 'year' ? (pl.amount || 0) / 12 : (pl.amount || 0)) / 100
      mrr[s.currency] = Math.round(((mrr[s.currency] || 0) + m) * 100) / 100
      const src = (s.metadata && s.metadata.source) || '(none)'
      if (!bySource[src]) bySource[src] = { active: 0, mrrEur: 0 }
      bySource[src].active++
      if (s.currency === 'eur') bySource[src].mrrEur = Math.round((bySource[src].mrrEur + m) * 100) / 100
      if (/email/i.test(src)) { emailActive++; if (s.currency === 'eur') emailMrrEur = Math.round((emailMrrEur + m) * 100) / 100 }
    }
    // KPI checkout 30j roulants — abandon = revenu sur la table + signal friction.
    // Audit 2026-06-17 : le « plein de paiements bloqués » = SURTOUT de l'abandon de
    // checkout hébergé (Payment Links USD trip-pass + sub EUR legacy), PAS des cartes
    // refusées (≈10-12 PaymentIntents/30j seulement). On suit donc le TAUX DE
    // COMPLÉTION dans la durée. status=open = session encore vivante → ignorée ;
    // fermée/expirée non payée = abandon réel. Détail par motif/région : voir
    // scripts/analyze-failed-payments.cjs (on-demand). Échec/erreur → bloc null,
    // carry-forward dans main().
    let checkout = null
    try {
      const since = Math.floor((Date.now() - 30 * 864e5) / 1000)
      const base = `/v1/checkout/sessions?created%5Bgte%5D=${since}&limit=100`
      const sess = []
      let url = base
      for (let i = 0; i < 12; i++) {
        const pg = await get(url)
        if (!pg || !pg.data) break
        sess.push(...pg.data)
        if (!pg.has_more) break
        url = `${base}&starting_after=${pg.data[pg.data.length - 1].id}`
      }
      let reached = 0, paid = 0, recoverable = 0
      const lostCents = {}
      for (const x of sess) {
        if (x.status === 'open') continue // encore ouverte → pas (encore) un abandon
        reached++
        if (x.payment_status === 'paid') { paid++; continue }
        if (x.customer_details?.email || x.customer_email) recoverable++ // joignable → cart-recovery
        if (x.amount_total) lostCents[x.currency] = Math.round((lostCents[x.currency] || 0) + x.amount_total)
      }
      checkout = {
        windowDays: 30, reached, paid,
        completionRate: reached ? Math.round((paid / reached) * 1000) / 10 : null,
        recoverable, lostCents,
      }
    } catch {}
    return {
      active: (act.data || []).length,
      mrr,
      pastDue: (pd.data || []).length,
      cancelScheduled: (act.data || []).filter(s => s.cancel_at_period_end).length,
      checkout,
      bySource,
      emailAttributed: { active: emailActive, mrrEur: emailMrrEur },
    }
  } catch { return null }
}

// GA4 (sessions/users de la VEILLE — journée complète, stable) — uniquement là
// où GOOGLE_SERVICE_ACCOUNT_JSON existe (runs CI). Champ préservé sur les runs
// sans credentials, même mécanique que le point Stripe (#27 série KPI).
async function ga4Yesterday() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null
  try {
    const { getAnalyticsData } = require('./lib/google-auth.cjs')
    const analyticsdata = getAnalyticsData()
    if (!analyticsdata) return null
    const out = { date: new Date(Date.now() - 864e5).toISOString().slice(0, 10) }
    for (const [k, pid] of [['mq', process.env.GA4_PROPERTY_ID_MQ], ['gp', process.env.GA4_PROPERTY_ID_GP]]) {
      if (!pid) continue
      const res = await analyticsdata.properties.runReport({
        property: `properties/${pid}`,
        requestBody: {
          dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
          metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        },
      })
      const row = res.data.rows && res.data.rows[0]
      out[k] = row ? { sessions: Number(row.metricValues[0].value), users: Number(row.metricValues[1].value) } : { sessions: 0, users: 0 }
    }
    return (out.mq || out.gp) ? out : null
  } catch (e) { console.log('GA4 series skip:', String(e.message).slice(0, 80)); return null }
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

  // 1c. Engagement email (opens/clicks/bounces) — cumuls Resend via Apps Script.
  // Jamais persisté jusqu'ici (check-email-status.cjs les jetait dans les logs CI).
  // On les met EN SÉRIE : les deltas jour-à-jour = activité réelle de lecture/clic
  // (B, 2026-06-17 — répondre à « qu'est-ce que l'email rapporte »).
  console.log('Fetching email engagement from Apps Script...')
  const emailStats = await fetchJSON(EMAIL_STATS_URL)
  if (emailStats && !emailStats.error && emailStats.counts) {
    const c = emailStats.counts, r = emailStats.rates || {}
    console.log(`Email: ${c.opened}/${c.delivered} ouverts (${r.open ?? '–'}%) | ${c.clicked} clics (${r.click ?? '–'}%) | ${c.bounced} bounces`)
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
  // Carry-forward anti-trous : quand une source échoue (fetch null/timeout/302),
  // on NE clobber PAS par null — on garde la dernière valeur connue (run plus tôt
  // aujourd'hui en priorité, sinon jour précédent). Sans ça, un run raté plus tard
  // dans la journée écrasait un run réussi (upsert « last write wins ») → trous
  // permanents sur des jours clos (ex. 06-12 funnel, 06-13 stripe, 06-17 stats).
  const priorRows = metrics.slice() // snapshot AVANT l'upsert (inclut les runs du jour)
  const lastKnown = (field) => {
    for (let i = priorRows.length - 1; i >= 0; i--) {
      if (priorRows[i][field] != null) return priorRows[i][field]
    }
    return null
  }
  // Upsert by date: drop any prior same-day rows so the last write of the day wins.
  // Without this, 4x/day crons + local runs bloat the file (90-day cap = ~15 real days)
  // and trend detection below would compare same-day dups instead of day-over-day.
  metrics = metrics.filter(r => r.date !== today)
  const statsOk = stats && !stats.error // fetch réussi → on prend la valeur live (0 inclus)
  metrics.push({
    date: today,
    time: now.toISOString(),
    payments: statsOk ? (stats.payments ?? null) : lastKnown('payments'),
    revenue: statsOk ? (stats.revenue ?? null) : lastKnown('revenue'),
    emails: statsOk ? (stats.emails ?? null) : lastKnown('emails'),
    feedbacks: statsOk ? (stats.feedbacks ?? null) : lastKnown('feedbacks'),
    avgRating: statsOk ? (stats.avgRating ?? null) : lastKnown('avgRating'),
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
    } : lastKnown('funnel'),
    // Engagement email (cumuls Resend) — carry-forward si le fetch échoue
    email: emailStats && !emailStats.error && emailStats.counts ? {
      sent: emailStats.counts.sent ?? null,
      delivered: emailStats.counts.delivered ?? null,
      opened: emailStats.counts.opened ?? null,
      clicked: emailStats.counts.clicked ?? null,
      bounced: emailStats.counts.bounced ?? null,
      openRate: emailStats.rates?.open ?? null,
      clickRate: emailStats.rates?.click ?? null,
    } : lastKnown('email'),
    // Vérité Stripe (runs locaux seulement) — carry-forward dernière valeur connue
    stripe: (await stripeTruth()) || lastKnown('stripe'),
    // GA4 veille (runs CI seulement) — carry-forward dernière valeur connue
    ga4: (await ga4Yesterday()) || lastKnown('ga4'),
  })

  // Keep last 90 days
  if (metrics.length > 90) metrics = metrics.slice(-90)
  fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics, null, 2), 'utf-8')
  console.log(`Metrics saved (${metrics.length} days)`)

  // 4. Trend detection — compare today vs last entry from a prior date
  const curr = metrics[metrics.length - 1]
  const prev = [...metrics].reverse().find(r => r.date !== curr.date)
  // KPI checkout (abandon / complétion) — visible chaque run
  const co = curr.stripe?.checkout
  if (co) {
    const lost = Object.entries(co.lostCents || {}).map(([c, n]) => `${(n / 100).toFixed(2)} ${c.toUpperCase()}`).join(' · ') || '—'
    // NB: ne couvre QUE le checkout hébergé (Payment Links — USD trip-pass + sub EUR
    // legacy). Les conversions on-site (subscribe/pay_once) ne créent PAS de session
    // → invisibles ici. Ce n'est donc PAS le taux de conversion global, c'est le
    // taux d'abandon sur la page Stripe hébergée (signal friction USD surtout).
    console.log(`Checkout HÉBERGÉ (Payment Links) 30j: ${co.paid}/${co.reached} payés-sur-page (${co.completionRate ?? '–'}%) | ${co.recoverable} joignables | sur la table: ${lost}`)
    const prevCo = prev?.stripe?.checkout
    if (prevCo?.completionRate != null && co.completionRate != null && co.completionRate < prevCo.completionRate - 5) {
      console.log(`⚠️  COMPLÉTION PAYMENT-LINK EN BAISSE: ${prevCo.completionRate}% -> ${co.completionRate}% (friction page hébergée ? voir scripts/analyze-failed-payments.cjs)`)
    }
  }
  // KPI ATTRIBUTION EMAIL (« qu'est-ce que l'email rapporte » — B). Démarre à 0,
  // se remplit dès qu'une vente porte une source *email*. Détail : scripts/automation/email-roi.cjs
  const att = curr.stripe?.emailAttributed
  if (att) {
    console.log(`Email attribué: ${att.active} abonné(s) actifs · €${att.mrrEur}/mois (source=*email* dans Stripe)`)
    if (att.active === 0) console.log('  (encore 0 — normal : l\'attribution démarre au déploiement, les 15 abonnés actuels sont pré-on-site sans source)')
  }
  // Delta engagement email (clics ouverts depuis le dernier point connu)
  const em = curr.email, pe = prev?.email
  if (em && pe && em.clicked != null && pe.clicked != null && em.clicked > pe.clicked) {
    console.log(`Email clics: ${pe.clicked} -> ${em.clicked} (+${em.clicked - pe.clicked}) | ouverts +${(em.opened ?? 0) - (pe.opened ?? 0)}`)
  }
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

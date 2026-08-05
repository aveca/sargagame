/**
 * funnel-daily-report.cjs — RAPPORT MATINAL FUNNEL
 *
 * Interroge Supabase analytics_events (24h glissantes), agrège les 6 étapes
 * du funnel et génère un rapport texte imprimé en stdout + JSON structuré.
 *
 * Funnel complet :
 *   map_open → beach_open → verdict → paywall → cta → checkout → conversion
 *
 * Usage : node scripts/automation/funnel-daily-report.cjs
 * Env   : SUPABASE_SERVICE_KEY (GH secret), SUPABASE_URL (optionnel).
 *
 * Sortie : scripts/automation/data/funnel-daily-report.json
 *          stdout : rapport formaté pour GitHub Actions summary / Slack
 */

const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rswdmjtdzrucqzzukfmd.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUT_PATH = path.join(__dirname, 'data', 'funnel-daily-report.json')
const PAGE = 1000

// Funnel steps dans l'ordre (top → bottom)
const FUNNEL_STEPS = [
  { key: 'map_open',          label: 'Map opened',       icon: '🗺️' },
  { key: 'beach_open',        label: 'Beach selected',   icon: '🏖️' },
  { key: 'verdict_scan_view', label: 'Verdict viewed',   icon: '📊' },
  { key: 'premium_modal_open',label: 'Paywall seen',     icon: '🔒' },
  { key: 'premium_modal_cta', label: 'CTA (modal)',      icon: '👆' },
  { key: 'pass_cta',          label: 'CTA (pass)',       icon: '👆' },
  { key: 'checkout_redirect', label: 'Checkout clicked', icon: '💳' },
  { key: 'conversion',        label: 'Paid',             icon: '✅' },
]

function svcHeaders(extra) {
  return Object.assign({ apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY }, extra || {})
}

async function fetchAll(cutoffIso) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `select=event,island,ts&ts=gte.${encodeURIComponent(cutoffIso)}&order=ts.asc`
    let res
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events?${q}`, {
        headers: svcHeaders({ Range: `${from}-${from + PAGE - 1}` }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) { console.error('[funnel-report] fetch error:', e && e.message); break }
    if (!res.ok) { console.error(`[funnel-report] HTTP ${res.status}: ${await res.text().catch(() => '')}`); break }
    const batch = await res.json().catch(() => [])
    if (!Array.isArray(batch) || !batch.length) break
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  return rows
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : 0 }

function computeReport(rows) {
  // Comptage par step
  const counts = {}
  for (const s of FUNNEL_STEPS) counts[s.key] = 0
  for (const r of rows) {
    const evt = String(r.event || '')
    if (counts[evt] !== undefined) counts[evt]++
    // pass_cta + premium_modal_cta = CTA total
  }

  // Agrégation CTA = pass_cta + premium_modal_cta
  const ctaTotal = counts.premium_modal_cta + counts.pass_cta

  // Taux de conversion entre étapes consécutives
  const steps = FUNNEL_STEPS.map((s, i) => {
    const count = s.key === 'premium_modal_cta' || s.key === 'pass_cta' ? undefined : counts[s.key]
    return { ...s, count }
  })

  // Remplacer les 2 lignes CTA par une seule
  const funnelView = [
    { key: 'map_open',          label: 'Map opened',       icon: '🗺️', count: counts.map_open },
    { key: 'beach_open',        label: 'Beach selected',   icon: '🏖️', count: counts.beach_open },
    { key: 'verdict_scan_view', label: 'Verdict viewed',   icon: '📊', count: counts.verdict_scan_view },
    { key: 'premium_modal_open',label: 'Paywall seen',     icon: '🔒', count: counts.premium_modal_open },
    { key: 'cta',               label: 'CTA clicked',      icon: '👆', count: ctaTotal },
    { key: 'checkout_redirect', label: 'Checkout clicked', icon: '💳', count: counts.checkout_redirect },
    { key: 'conversion',        label: 'Paid',             icon: '✅', count: counts.conversion },
  ]

  // Taux de conversion étape→étape
  const rates = []
  for (let i = 1; i < funnelView.length; i++) {
    const from = funnelView[i - 1]
    const to = funnelView[i]
    rates.push({
      from: from.label,
      to: to.label,
      rate: pct(to.count, from.count),
    })
  }

  // Taux global (top→bottom)
  const globalRate = pct(counts.conversion, counts.map_open)

  // Engagement events (diagnostic)
  const ENGAGEMENT_EVENTS = ['verdict_expand', 'forecast_view', 'paywall_view', 'payment_failed']
  const engagement = {}
  for (const k of ENGAGEMENT_EVENTS) engagement[k] = 0
  for (const r of rows) {
    const evt = String(r.event || '').replace(/^sg_/, '')
    if (engagement[evt] !== undefined) engagement[evt]++
  }

  // Par île
  const byIsland = {}
  for (const r of rows) {
    const isl = (r.island || 'MQ').toUpperCase()
    const evt = String(r.event || '')
    if (counts[evt] !== undefined) {
      byIsland[isl] = byIsland[isl] || {}
      byIsland[isl][evt] = (byIsland[isl][evt] || 0) + 1
    }
  }

  return { funnel: funnelView, rates, global_rate: globalRate, counts, cta_total: ctaTotal, engagement, by_island: byIsland }
}

function formatReport(report, windowHours) {
  const lines = []
  const now = new Date()
  lines.push(`📊 Funnel Report — ${now.toISOString().slice(0, 10)}`)
  lines.push(`   Window: ${windowHours}h · Source: Supabase analytics_events`)
  lines.push('')

  // Funnel vertical
  lines.push('  Funnel (visitors → paid):')
  lines.push('  ─────────────────────────')
  const maxCount = Math.max(...report.funnel.map(s => s.count), 1)
  for (const step of report.funnel) {
    const barLen = Math.round((step.count / maxCount) * 25)
    const bar = '█'.repeat(barLen) + '░'.repeat(25 - barLen)
    lines.push(`  ${step.icon} ${step.label.padEnd(18)} ${String(step.count).padStart(6)}  ${bar}`)
  }
  lines.push('')

  // Taux étape→étape
  lines.push('  Conversion step→step:')
  lines.push('  ─────────────────────')
  for (const r of report.rates) {
    const arrow = r.rate >= 50 ? '🟢' : r.rate >= 20 ? '🟡' : '🔴'
    lines.push(`  ${arrow} ${r.from} → ${r.to}: ${r.rate}%`)
  }
  lines.push('')

  // Taux global
  lines.push(`  🎯 Global: map_open → paid = ${report.global_rate}%`)
  lines.push('')

  // Engagement events (diagnostic)
  lines.push('  📈 Engagement (diagnostic):')
  lines.push('  ───────────────────────────')
  const eng = report.engagement || {}
  lines.push(`    Verdict expanded:   ${eng.verdict_expand || 0}`)
  lines.push(`    Forecast viewed:    ${eng.forecast_view || 0}`)
  lines.push(`    Paywall viewed:     ${eng.paywall_view || 0}`)
  lines.push(`    Payment failed:     ${eng.payment_failed || 0}`)
  lines.push('')

  // Par île
  const islands = Object.keys(report.by_island).sort()
  if (islands.length > 1) {
    lines.push('  By island:')
    for (const isl of islands) {
      const data = report.by_island[isl]
      const total = data.conversion || 0
      lines.push(`    ${isl}: ${total} paid (map: ${data.map_open || 0}, paywall: ${data.premium_modal_open || 0})`)
    }
    lines.push('')
  }

  // Diagnosis hints
  lines.push('  💡 Diagnosis:')
  if (report.funnel[0].count === 0) {
    lines.push('    ⚠️ No map_open events — check frontend tracking or analytics config')
  } else if (report.rates.length > 0 && report.rates[0].rate < 30) {
    lines.push(`    ⚠️ Low map→beach (${report.rates[0].rate}%) — UX friction on map?`)
  } else if (report.rates.length > 2 && report.rates[2].rate < 10) {
    lines.push(`    ⚠️ Low verdict→paywall (${report.rates[2].rate}%) — verdict not compelling enough?`)
  } else if (report.rates.length > 4 && report.rates[4].rate < 5) {
    lines.push(`    ⚠️ Low checkout→paid (${report.rates[4].rate}%) — payment friction?`)
  } else {
    lines.push('    ✅ Funnel looks healthy — monitor daily for drift')
  }

  return lines.join('\n')
}

async function main() {
  if (!SERVICE_KEY) { console.log('[funnel-report] SUPABASE_SERVICE_KEY manquant — skip.'); return }

  const windowHours = 24
  const cutoff = new Date(Date.now() - windowHours * 3600 * 1000).toISOString()
  const rows = await fetchAll(cutoff)
  const report = computeReport(rows)

  // Save JSON
  const output = { window_hours: windowHours, since: cutoff, total_events: rows.length, ...report }
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
    fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2))
  } catch (e) { console.error('[funnel-report] write error:', e && e.message) }

  // Print formatted report
  console.log(formatReport(report, windowHours))
  console.log(`\n[funnel-report] ${rows.length} events → ${OUT_PATH}`)
}

main().catch((e) => { console.error('[funnel-report] erreur non fatale:', e && e.message); process.exit(0) })

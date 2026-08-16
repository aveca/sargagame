#!/usr/bin/env node
/**
 * verdict-pw-variant.cjs — PAYWALL A/B VERDICT
 *
 * Reads funnel-daily-report.json + daily-metrics.json
 * Produces a verdict: KEEP_COMIC | FORCE_WORLD | INCONCLUSIVE
 *
 * Usage: node scripts/automation/verdict-pw-variant.cjs
 * Output: stdout verdict + scripts/automation/data/pw-verdict.json
 */

const fs = require('fs')
const path = require('path')

const FUNNEL_PATH = path.join(__dirname, 'data', 'funnel-daily-report.json')
const METRICS_PATH = path.join(__dirname, 'data', 'daily-metrics.json')
const OUT_PATH = path.join(__dirname, 'data', 'pw-verdict.json')

function loadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function getLatestMetrics(metrics) {
  if (!Array.isArray(metrics) || !metrics.length) return null
  return metrics[metrics.length - 1]
}

function computeVerdict() {
  const funnel = loadJSON(FUNNEL_PATH)
  const metrics = loadJSON(METRICS_PATH)

  if (!funnel && !metrics) {
    return { verdict: 'INCONCLUSIVE', reason: 'No data files found', data: {} }
  }

  const latestMetrics = getLatestMetrics(metrics)
  const funnelCounts = funnel?.counts || {}
  const funnelRates = funnel?.rates || []

  // Key metrics
  const paywallSeen = funnelCounts.premium_modal_open || 0
  const ctaClicked = funnelCounts.cta_total || (funnelCounts.premium_modal_cta || 0) + (funnelCounts.pass_cta || 0)
  const conversions = funnelCounts.conversion || 0

  const molliePaidEUR = latestMetrics?.mollie?.paid?.EUR?.count || 0
  const molliePaidUSD = latestMetrics?.mollie?.paid?.USD?.count || 0
  const mollieTotalEUR = latestMetrics?.mollie?.paid?.EUR?.total || 0
  const mollieTotalUSD = latestMetrics?.mollie?.paid?.USD?.total || 0
  const totalPaid = molliePaidEUR + molliePaidUSD
  const totalRevenue = mollieTotalEUR + mollieTotalUSD

  const stripeMRR = latestMetrics?.stripe?.mrr?.eur || 0
  const stripeActive = latestMetrics?.stripe?.active || 0

  // Conversion rates
  const modalToCTA = paywallSeen > 0 ? Math.round((ctaClicked / paywallSeen) * 1000) / 10 : 0
  const ctaToCheckout = funnelCounts.checkout_redirect || 0
  const ctaToPaid = ctaClicked > 0 ? Math.round((conversions / ctaClicked) * 1000) / 10 : 0

  // pw_style tracking status
  const pwStyleEvents = funnel?.engagement?.pw_style_shown || 0
  const hasPWStyleTracking = pwStyleEvents > 0

  // Verdict logic
  let verdict = 'INCONCLUSIVE'
  let reason = ''

  if (!hasPWStyleTracking && paywallSeen > 0) {
    // No A/B tracking yet — can't compare variants
    verdict = 'INCONCLUSIVE'
    reason = `pw_style tracking not active (0 events tracked). pw_style is not in AB_FREEZE_MAP — defaults to "world" always. Need to add pw_style to analytics events.`
  } else if (paywallSeen < 50) {
    verdict = 'INCONCLUSIVE'
    reason = `Insufficient data: ${paywallSeen} paywall views (need 50+ for statistical significance)`
  } else if (modalToCTA < 1) {
    verdict = 'FORCE_WORLD'
    reason = `Very low CTA rate (${modalToCTA}%). Paywall not compelling enough. Consider simplifying to World variant.`
  } else if (totalPaid === 0 && ctaClicked > 5) {
    verdict = 'FORCE_WORLD'
    reason = `CTA clicks (${ctaClicked}) but zero payments. Checkout friction too high.`
  } else if (modalToCTA >= 5 && totalPaid > 0) {
    verdict = 'KEEP_COMIC'
    reason = `Healthy CTA rate (${modalToCTA}%) with ${totalPaid} payments. Comic variant performing well.`
  } else {
    verdict = 'INCONCLUSIVE'
    reason = `Mixed signals: CTA=${modalToCTA}%, paid=${totalPaid}. Need more data.`
  }

  const data = {
    timestamp: new Date().toISOString(),
    funnel: {
      paywall_seen: paywallSeen,
      cta_clicked: ctaClicked,
      conversions,
      modal_to_cta_pct: modalToCTA,
      cta_to_paid_pct: ctaToPaid,
    },
    revenue: {
      mollie_paid_total: totalPaid,
      mollie_revenue_eur: mollieTotalEUR,
      mollie_revenue_usd: mollieTotalUSD,
      stripe_mrr_eur: stripeMRR,
      stripe_active: stripeActive,
    },
    ab_test: {
      pw_style_tracking: hasPWStyleTracking,
      pw_style_events: pwStyleEvents,
      current_variant: 'world (default, not in AB_FREEZE_MAP)',
    },
  }

  return { verdict, reason, data }
}

function formatVerdict(result) {
  const lines = []
  const icon = result.verdict === 'KEEP_COMIC' ? '🟢' : result.verdict === 'FORCE_WORLD' ? '🔴' : '🟡'
  lines.push(`${icon} PAYWALL VERDICT: ${result.verdict}`)
  lines.push(`   ${result.reason}`)
  lines.push('')
  lines.push('   Data:')
  lines.push(`     Paywall views:   ${result.data.funnel?.paywall_seen || 0}`)
  lines.push(`     CTA clicks:      ${result.data.funnel?.cta_clicked || 0}`)
  lines.push(`     Conversions:     ${result.data.funnel?.conversions || 0}`)
  lines.push(`     Modal→CTA:       ${result.data.funnel?.modal_to_cta_pct || 0}%`)
  lines.push(`     Mollie paid:     ${result.data.revenue?.mollie_paid_total || 0}`)
  lines.push(`     Revenue EUR:     €${result.data.revenue?.mollie_revenue_eur || 0}`)
  lines.push(`     Revenue USD:     $${result.data.revenue?.mollie_revenue_usd || 0}`)
  lines.push(`     Stripe MRR:      €${result.data.revenue?.stripe_mrr_eur || 0}`)
  lines.push(`     Stripe active:   ${result.data.revenue?.stripe_active || 0}`)
  lines.push('')
  lines.push(`   AB test: pw_style tracking = ${result.data.ab_test?.pw_style_tracking ? 'ACTIVE' : 'NOT ACTIVE'}`)
  lines.push(`   Current variant: ${result.data.ab_test?.current_variant}`)
  return lines.join('\n')
}

// Main
const result = computeVerdict()
console.log(formatVerdict(result))

try {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2))
  console.log(`\n[verdict] → ${OUT_PATH}`)
} catch (e) { console.error('[verdict] write error:', e.message) }

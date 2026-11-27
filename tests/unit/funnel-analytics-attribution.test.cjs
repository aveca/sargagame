const assert = require('node:assert/strict')
const {
  classifyAnalyticsHost,
  normalizeEvent,
  parseEventParams,
} = require('../../scripts/automation/funnel-analytics-classification.cjs')
const { computeFunnel } = require('../../scripts/automation/funnel-from-supabase.cjs')
const { computeReport, formatReport } = require('../../scripts/automation/funnel-daily-report.cjs')

function row(event, island, hostname, sid) {
  return { event, island, ts: '2026-10-30T05:00:00Z', params: { hostname, sid } }
}

async function main() {
  assert.equal(normalizeEvent('sg_conversion'), 'conversion')
  assert.equal(normalizeEvent('conversion'), 'conversion')

  assert.equal(classifyAnalyticsHost({ hostname: 'sargazotulum.com' }, 'tu').hostClass, 'production')
  assert.equal(classifyAnalyticsHost({ hostname: 'https://www.sargazotulum.com/path' }, 'tu').region, 'tulum')
  assert.equal(classifyAnalyticsHost({ hostname: 'sargagame-tulum.pages.dev' }, 'tu').hostClass, 'production')
  assert.equal(classifyAnalyticsHost({ hostname: '127.0.0.1' }, 'mq').hostClass, 'local_test')
  assert.equal(classifyAnalyticsHost({ hostname: 'preview.sargagame-tulum.pages.dev' }, 'tu').hostClass, 'preview')
  assert.equal(classifyAnalyticsHost({}, 'tu').hostClass, 'unknown_host')

  const nested = parseEventParams({ d: JSON.stringify({ hostname: 'sargazotulum.com', sid: 'nested-session' }) })
  assert.equal(classifyAnalyticsHost(nested, 'tu').hostClass, 'production')

  const rows = [
    row('sg_conversion', 'mq', 'sargasses-martinique.com', 'prod-mq'),
    row('sg_pass_cta', 'tu', 'sargagame-tulum.pages.dev', 'prod-tu'),
    row('sg_conversion', 'mq', '127.0.0.1', 'mock-local'),
    row('sg_conversion', 'tu', null, 'legacy-unattributed'),
    row('sg_conversion', 'rm', 'preview.sargagame-rivieramaya.pages.dev', 'preview-session'),
  ]

  const snapshot = computeFunnel(rows)
  assert.equal(snapshot.counts.conversion, 1, 'only production-attributed conversion events enter counts')
  assert.equal(snapshot.observed_counts.conversion, 4, 'all observed conversion events remain visible')
  assert.equal(snapshot.unverified_counts.conversion, 3, 'local, preview and missing-host conversions are excluded')
  assert.equal(snapshot.counts.pass_cta, 1)
  assert.equal(snapshot.data_quality.verified_production_rows, 2)
  assert.equal(snapshot.data_quality.local_test_rows, 1)
  assert.equal(snapshot.data_quality.preview_rows, 1)
  assert.equal(snapshot.data_quality.unknown_host_rows, 1)
  assert.equal(snapshot.distinct_sessions_by_region.tulum, 1)
  assert.equal(snapshot.observed_distinct_sessions_by_region.tulum, 2)
  assert.equal(snapshot.by_host['sargagame-tulum.pages.dev'].pass_cta, 1)

  const dailyRows = [
    row('sg_map_open', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_beach_open', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_premium_modal_open', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_pass_cta', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_checkout_started', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_conversion', 'tu', '127.0.0.1', 'tulum-mock'),
    row('sg_conversion', 'tu', null, 'tulum-unknown'),
    row('sg_conversion', 'tu', 'sargazotulum.com', 'tulum-prod'),
    row('sg_sos_checkout_paid', 'tu', '127.0.0.1', 'tulum-mock'),
  ]

  const report = computeReport(dailyRows)
  assert.equal(report.counts.map_open, 1)
  assert.equal(report.counts.beach_open, 1)
  assert.equal(report.counts.premium_modal_open, 1)
  assert.equal(report.counts.pass_cta, 1)
  assert.equal(report.counts.conversion, 1)
  assert.equal(report.observed_counts.conversion, 3)
  assert.equal(report.unverified_counts.conversion, 2)
  assert.equal(report.engagement.checkout_started, 1)
  assert.equal(report.engagement.sos_checkout_paid, 0, 'local SOS mock must not be shown as production')
  assert.equal(report.observed_engagement.sos_checkout_paid, 1)
  assert.equal(report.data_quality.local_test_rows, 2)
  assert.equal(report.data_quality.unknown_host_rows, 1)
  assert.equal(report.by_island.TULUM.conversion, 1)
  assert.equal(report.unverified_by_island.TULUM.conversion, 2)

  const formatted = formatReport(report, 24)
  assert.match(formatted, /conversion event \(not payment proof\)/i)
  assert.match(formatted, /unknown-host=1/)
  assert.match(formatted, /On-site checkout started: 1/)

  console.log('PASS: production-only funnel attribution; local, preview and unknown hosts remain excluded and observable')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

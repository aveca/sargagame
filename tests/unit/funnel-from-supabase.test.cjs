#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const {
  FUNNEL_KEYS,
  parseEventParams,
  normalizeHost,
  normalizeRegion,
  sessionIdFromParams,
  computeFunnel,
} = require('../../scripts/automation/funnel-from-supabase.cjs')

assert.ok(FUNNEL_KEYS.includes('checkout_started'), 'on-site checkout starts must be aggregated')
assert.ok(FUNNEL_KEYS.includes('payment_failed'), 'payment failures must be aggregated')
assert.ok(FUNNEL_KEYS.includes('sos_checkout_start'), 'SOS checkout starts must be aggregated')

assert.equal(normalizeHost('https://WWW.SARGAZOTULUM.COM/path?q=1'), 'sargazotulum.com')
assert.equal(normalizeRegion('MQ'), 'mq')
assert.equal(normalizeRegion('sargassumcancun.com'), 'rivieramaya')
assert.equal(normalizeRegion('MQ', { hostname: 'www.sargazotulum.com' }), 'tulum')
assert.equal(normalizeRegion('unknown', { d: '{"region":"puntacana","sid":"pc-1"}' }), 'puntacana')
assert.equal(sessionIdFromParams({ d: '{"sid":"session-42","region":"tulum"}' }), 'session-42')
assert.deepEqual(parseEventParams({ d: '{"sid":"s-1","region":"tulum"}', hostname: 'sargazotulum.com' }).sid, 's-1')

const rows = [
  { event: 'sg_premium_modal_open', island: 'RIVIERAMAYA', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-1","region":"rivieramaya"}' } },
  { event: 'sg_pass_cta', island: 'rivieramaya', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-1","region":"rivieramaya"}' } },
  { event: 'sg_pass_cta', island: 'RIVIERAMAYA', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-2","region":"rivieramaya"}' } },
  { event: 'sg_checkout_started', island: 'RIVIERAMAYA', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-1","region":"rivieramaya"}' } },
  { event: 'sg_checkout_started', island: 'sargassumcancun.com', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-2","region":"rivieramaya"}' } },
  { event: 'sg_conversion', island: 'rivieramaya', params: { hostname: 'sargassumcancun.com', d: '{"sid":"rm-2","region":"rivieramaya"}' } },
  { event: 'sg_session', island: 'tulum', params: { d: '{"sid":"tu-1","region":"tulum"}' } },
  { event: 'sg_payment_failed', island: 'tulum', params: { hostname: 'sargazotulum.com', d: '{"sid":"tu-1","region":"tulum"}' } },
  { event: 'sg_sos_checkout_start', island: 'GP', params: { hostname: 'sargasses-guadeloupe.com', d: '{"sid":"gp-1","region":"gp"}' } },
]

const result = computeFunnel(rows)
assert.equal(result.counts.checkout_started, 2)
assert.equal(result.counts.conversion, 1)
assert.equal(result.counts.payment_failed, 1)
assert.equal(result.counts.sos_checkout_start, 1)
assert.equal(result.cta_total, 2)
assert.equal(result.rates.cta_to_checkout_started, 100)
assert.equal(result.rates.checkout_started_to_conversion, 50)
assert.equal(result.by_region.rivieramaya.checkout_started, 2)
assert.equal(result.by_host['sargassumcancun.com'].checkout_started, 2)
assert.equal(result.by_island.RIVIERAMAYA.checkout_started, 2)
assert.equal(result.distinct_sessions_by_region.rivieramaya, 2)
assert.equal(result.distinct_sessions_by_region.tulum, 1)
assert.equal(result.distinct_sessions_by_host['sargassumcancun.com'], 2)

console.log('PASS: checkout_started is counted as the cross-provider on-site funnel entry')
console.log('PASS: domain aliases, region casing and embedded session payloads normalize correctly')
console.log('PASS: funnel output exposes region, hostname and distinct-session dimensions')

#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const {
  EXCLUDED_SYNTHETIC_IDS,
  parseContentRange,
  fetchAll,
  compute,
  buildSnapshot,
} = require('../../scripts/automation/funnel-b2b-from-supabase.cjs')

assert.deepEqual([...EXCLUDED_SYNTHETIC_IDS].sort(), [488769, 488770])
assert.deepEqual(parseContentRange('0-1/3'), { start: 0, end: 1, total: 3 })
assert.deepEqual(parseContentRange('*/0'), { start: null, end: null, total: 0 })
assert.throws(() => parseContentRange('invalid'), /Content-Range/)

const rows = [
  { id: 488769, event: 'b2b_trial_to_paid', island: null, params: { plan: 'pro_monthly' } },
  { id: 488770, event: 'b2b_trial_to_paid', island: null, params: { plan: 'pro_annual' } },
  { id: 101, event: 'b2b_trial_started', island: 'MQ', params: {} },
  { id: 102, event: 'b2b_trial_to_paid', island: null, params: { plan: 'pro_monthly' } },
  { id: 103, event: 'b2b_widget_activated', island: 'rivieramaya', params: {} },
]

const computed = compute(rows)
assert.deepEqual(computed.counts, { trials: 1, activated: 1, paid: 1, rejected: 0 })
assert.equal(computed.excluded_synthetic_rows, 2)
assert.equal(computed.rates.trial_to_paid, 100)
assert.equal(computed.paid_by_plan.pro_monthly, 1)
assert.equal(computed.paid_by_plan.pro_annual, undefined)
assert.equal(computed.by_island.MQ.paid, 0)
assert.equal(computed.by_island.UNKNOWN.paid, 1)
assert.equal(computed.by_island.RIVIERAMAYA.activated, 1)
assert.equal(computed.by_island.MQ.trials, 1)

const snapshot = buildSnapshot(rows, '2026-11-04T00:00:00.000Z', 90)
assert.equal(snapshot.total_rows, 5)
assert.equal(snapshot.included_rows, 3)
assert.equal(snapshot.excluded_synthetic_rows, 2)
assert.equal(snapshot.counts.paid, 1)

async function testPagination() {
  const pages = [
    {
      range: '0-1/3',
      rows: [
        { id: 1, event: 'b2b_trial_started', island: 'MQ', params: {}, ts: '2026-11-01T00:00:00Z' },
        { id: 2, event: 'b2b_trial_started', island: 'MQ', params: {}, ts: '2026-11-02T00:00:00Z' },
      ],
    },
    {
      range: '2-2/3',
      rows: [
        { id: 3, event: 'b2b_trial_to_paid', island: 'MQ', params: { plan: 'pro_monthly' }, ts: '2026-11-03T00:00:00Z' },
      ],
    },
  ]
  const calls = []
  const fetched = await fetchAll('2026-10-01T00:00:00.000Z', {
    serviceKey: 'test-service-key',
    supabaseUrl: 'https://example.supabase.co',
    pageSize: 2,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      const page = pages[calls.length - 1]
      return new Response(JSON.stringify(page.rows), {
        status: 200,
        headers: { 'Content-Range': page.range },
      })
    },
  })
  assert.equal(fetched.length, 3)
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /select=id%2Cevent%2Cparams%2Cisland%2Cts/)
  assert.equal(calls[0].options.headers.Range, '0-1')
  assert.equal(calls[1].options.headers.Range, '2-3')
  assert.equal(calls[0].options.headers.Prefer, 'count=exact')
}

async function testFailClosed() {
  await assert.rejects(
    fetchAll('2026-10-01T00:00:00.000Z', {
      serviceKey: 'test',
      fetchImpl: async () => { throw new Error('network down') },
    }),
    /fetch failed.*network down/
  )

  await assert.rejects(
    fetchAll('2026-10-01T00:00:00.000Z', {
      serviceKey: 'test',
      fetchImpl: async () => new Response('upstream error', { status: 500 }),
    }),
    /HTTP failure.*500/
  )

  await assert.rejects(
    fetchAll('2026-10-01T00:00:00.000Z', {
      serviceKey: 'test',
      fetchImpl: async () => new Response('not-json', {
        status: 200,
        headers: { 'Content-Range': '0-0/1' },
      }),
    }),
    /invalid JSON/
  )

  await assert.rejects(
    fetchAll('2026-10-01T00:00:00.000Z', {
      serviceKey: 'test',
      fetchImpl: async () => new Response('[]', { status: 200 }),
    }),
    /Content-Range/
  )

  await assert.rejects(
    fetchAll('2026-10-01T00:00:00.000Z', {
      serviceKey: 'test',
      fetchImpl: async () => new Response(JSON.stringify([{ id: 'bad' }]), {
        status: 200,
        headers: { 'Content-Range': '0-0/1' },
      }),
    }),
    /valid numeric id/
  )

  assert.throws(() => compute([{ event: 'b2b_trial_to_paid', island: null, params: {} }]), /valid numeric id/)
}

testPagination()
  .then(testFailClosed)
  .then(() => console.log('PASS: synthetic CI conversions are excluded and unknown regions are not attributed to MQ'))
  .then(() => console.log('PASS: Supabase pagination is complete and all network/HTTP/JSON failures fail closed'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

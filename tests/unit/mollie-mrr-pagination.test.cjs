#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { listPaymentsSince } = require('../../scripts/automation/mollie-mrr.cjs')

async function main() {
  const originalFetch = global.fetch
  const calls = []
  const nextUrl = 'https://api.mollie.com/v2/payments?from=tr_page_1&limit=250&sort=desc'

  try {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      if (calls.length === 1) {
        return {
          ok: true,
          json: async () => ({
            _embedded: {
              payments: [
                { id: 'tr_new_1', createdAt: '2026-11-01T12:00:00Z' },
                { id: 'tr_new_2', createdAt: '2026-11-01T00:00:00Z' },
              ],
            },
            _links: { next: { href: nextUrl } },
          }),
        }
      }
      if (calls.length === 2) {
        return {
          ok: true,
          json: async () => ({
            _embedded: {
              payments: [
                { id: 'tr_boundary', createdAt: '2026-11-01T00:00:00.000Z' },
                { id: 'tr_old', createdAt: '2026-10-31T23:59:59.999Z' },
              ],
            },
            _links: {
              next: { href: 'https://api.mollie.com/v2/payments?from=tr_old&limit=250&sort=desc' },
            },
          }),
        }
      }
      throw new Error('Unexpected network call')
    }

    const payments = await listPaymentsSince('2026-11-01T00:00:00.000Z', 'test_mollie_key')
    assert.deepEqual(payments.map(payment => payment.id), [
      'tr_new_1', 'tr_new_2', 'tr_boundary',
    ], 'the exact month boundary is included and older payments are excluded')
    assert.equal(calls.length, 2, 'pagination stops as soon as the cutoff is crossed')
    assert.equal(
      calls[0].url,
      'https://api.mollie.com/v2/payments?limit=250&sort=desc',
      'the first request uses only documented Mollie list parameters',
    )
    assert.equal(calls[0].url.includes('createdFrom'), false)
    assert.equal(calls[1].url, nextUrl, 'Mollie next links are followed as cursor URLs')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test_mollie_key')
    assert.equal(calls[1].options.headers.Authorization, 'Bearer test_mollie_key')

    const invalidCalls = []
    global.fetch = async url => {
      invalidCalls.push(String(url))
      return {
        ok: true,
        json: async () => ({
          _embedded: { payments: [{ id: 'tr_bad', createdAt: 'not-a-date' }] },
          _links: { next: null },
        }),
      }
    }
    await assert.rejects(
      listPaymentsSince('2026-11-01T00:00:00.000Z', 'test_mollie_key'),
      /invalid createdAt/,
    )
    assert.equal(invalidCalls.length, 1, 'invalid dates fail before a partial report can be returned')

    const cappedCalls = []
    global.fetch = async url => {
      cappedCalls.push(String(url))
      return {
        ok: true,
        json: async () => ({
          _embedded: { payments: [{ id: 'tr_recent', createdAt: '2026-11-02T00:00:00Z' }] },
          _links: { next: { href: nextUrl } },
        }),
      }
    }
    await assert.rejects(
      listPaymentsSince('2026-11-01T00:00:00.000Z', 'test_mollie_key', 1),
      /pagination exceeded 1 pages/,
    )
    assert.equal(cappedCalls.length, 1, 'the safety cap fails closed without requesting another page')

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        _embedded: { payments: [{ id: 'tr_missing_next', createdAt: '2026-11-02T00:00:00Z' }] },
      }),
    })
    await assert.rejects(
      listPaymentsSince('2026-11-01T00:00:00.000Z', 'test_mollie_key'),
      /missing _links.next/,
    )

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        _embedded: {
          payments: [
            { id: 'tr_newer', createdAt: '2026-11-02T00:00:00Z' },
            { id: 'tr_older', createdAt: '2026-11-03T00:00:00Z' },
          ],
        },
        _links: { next: null },
      }),
    })
    await assert.rejects(
      listPaymentsSince('2026-11-01T00:00:00.000Z', 'test_mollie_key'),
      /not ordered newest-first/,
    )

    await assert.rejects(
      listPaymentsSince('not-a-date', 'test_mollie_key'),
      /Invalid Mollie payment cutoff/,
    )
  } finally {
    global.fetch = originalFetch
  }

  console.log('MOLLIE_MRR_PAGINATION_TESTS PASS (14 assertions)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

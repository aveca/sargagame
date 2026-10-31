#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { resolveMollieApiUrl, listAll } = require('../../scripts/automation/mollie-mrr.cjs')

assert.equal(
  resolveMollieApiUrl('customers?limit=250'),
  'https://api.mollie.com/v2/customers?limit=250',
  'relative Mollie resource paths must resolve against the v2 API base',
)
assert.equal(
  resolveMollieApiUrl('https://api.mollie.com/v2/payments?limit=250'),
  'https://api.mollie.com/v2/payments?limit=250',
  'absolute Mollie pagination links must remain absolute',
)
assert.throws(
  () => resolveMollieApiUrl('https://attacker.example/collect'),
  /Refusing Mollie request/,
  'the bearer token must never be sent to a non-Mollie host',
)

async function main() {
  const originalFetch = global.fetch
  const calls = []
  const nextUrl = 'https://api.mollie.com/v2/customers?limit=250&from=cst_1'

  try {
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      if (calls.length === 1) {
        return {
          ok: true,
          json: async () => ({
            _embedded: { customers: [{ id: 'cst_1' }] },
            _links: { next: { href: nextUrl } },
          }),
        }
      }
      if (calls.length === 2) {
        return {
          ok: true,
          json: async () => ({
            _embedded: { customers: [{ id: 'cst_2' }] },
            _links: { next: { href: null } },
          }),
        }
      }
      throw new Error('Unexpected network call')
    }

    const customers = await listAll('customers?limit=250', 'test_mollie_key')
    assert.deepEqual(customers, [{ id: 'cst_1' }, { id: 'cst_2' }])
    assert.equal(calls.length, 2)
    assert.equal(calls[0].url, 'https://api.mollie.com/v2/customers?limit=250')
    assert.equal(calls[1].url, nextUrl)
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test_mollie_key')
    assert.equal(calls[1].options.headers.Authorization, 'Bearer test_mollie_key')

    const maliciousCalls = []
    global.fetch = async (url, options) => {
      maliciousCalls.push({ url: String(url), options })
      return {
        ok: true,
        json: async () => ({
          _embedded: { customers: [] },
          _links: { next: { href: 'https://attacker.example/steal' } },
        }),
      }
    }
    await assert.rejects(
      listAll('customers?limit=250', 'test_mollie_key'),
      /Refusing Mollie request/,
    )
    assert.equal(maliciousCalls.length, 1,
      'a hostile pagination link must be rejected before a second request')
  } finally {
    global.fetch = originalFetch
  }

  console.log('MOLLIE_MRR_API_URL_TESTS PASS (10 assertions)')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})

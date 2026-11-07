#!/usr/bin/env node
'use strict'

// P0 B2B API retirement: these legacy internal endpoints must never reach
// Supabase or mutate prospect/concierge/payment state from public requests.
const assert = require('node:assert/strict')

async function main() {
  const worker = (await import('../../workers/sg-payments/index.js')).default
  const originalFetch = global.fetch
  let outboundCalls = 0
  global.fetch = async () => {
    outboundCalls++
    throw new Error('Unexpected outbound request from retired endpoint')
  }

  try {
    for (const path of ['/api/b2b-prospects.php', '/api/b2b-concierge.php']) {
      for (const method of ['GET', 'POST', 'PATCH']) {
        const init = { method, headers: { 'Content-Type': 'application/json' } }
        if (method !== 'GET') init.body = JSON.stringify({
          name: 'must-not-persist',
          action: 'payment_confirmed',
          payment_confirmed: true,
          status: 'completed'
        })
        const response = await worker.fetch(
          new Request('https://sargasses-martinique.com' + path, init),
          {},
          { waitUntil() {} }
        )
        assert.equal(response.status, 410, path + ' ' + method + ' must be retired')
        assert.deepEqual(await response.json(), { error: 'endpoint_retired' })
        assert.equal(response.headers.get('cache-control'), 'no-store')
      }
    }
    assert.equal(outboundCalls, 0, 'retired endpoints must not call Supabase, Mollie, or other services')
    console.log('P0 B2B API retirement: 6 requests denied; 0 outbound calls')
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

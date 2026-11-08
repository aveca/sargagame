#!/usr/bin/env node
'use strict'

// P0 B2B sibling API retirement (#1368): the four sibling service-role routes
// (contacts / events / scores / forecast-delivery) must never read or mutate
// internal B2B tables from a public request.
//
// Why this matters: `supa()` uses SUPABASE_SERVICE_KEY (service_role), which
// bypasses the RLS enabled by migration 008. The retired handler exposed
// anonymous `select=*` reads (PII in `b2b_contacts`) plus arbitrary POST/PATCH
// writes on all four tables.
//
// The test is fully offline and deterministic: no credentials, no network, no
// database row is ever read or written.
const assert = require('node:assert/strict')

const RETIRED_PATHS = [
  '/api/b2b-contacts.php',
  '/api/b2b-events.php',
  '/api/b2b-scores.php',
  '/api/b2b-forecast-delivery.php',
]

async function main() {
  const worker = (await import('../../workers/sg-payments/index.js')).default
  const originalFetch = global.fetch
  let outboundCalls = 0
  global.fetch = async () => {
    outboundCalls++
    throw new Error('Unexpected outbound request from retired endpoint')
  }

  try {
    for (const path of RETIRED_PATHS) {
      for (const method of ['GET', 'POST', 'PATCH']) {
        const init = { method, headers: { 'Content-Type': 'application/json' } }
        if (method !== 'GET') {
          init.body = JSON.stringify({
            name: 'must-not-persist',
            email: 'must-not-persist@example.invalid',
            status: 'completed',
            payment_confirmed: true,
            score: 100
          })
        }
        const url = 'https://sargasses-martinique.com' + path + (method === 'PATCH' ? '?id=must-not-persist' : '')
        const response = await worker.fetch(
          new Request(url, init),
          {},
          { waitUntil() {} }
        )

        assert.equal(response.status, 410, path + ' ' + method + ' must be retired')
        assert.deepEqual(await response.json(), { error: 'endpoint_retired' }, path + ' ' + method + ' must fail closed')
        assert.equal(response.headers.get('cache-control'), 'no-store', path + ' ' + method + ' must not be cached')
        assert.equal(
          response.headers.get('access-control-allow-origin'),
          null,
          path + ' ' + method + ' must not expose a CORS allow-origin header'
        )
        assert.equal(
          response.headers.get('access-control-allow-credentials'),
          null,
          path + ' ' + method + ' must not expose CORS credentials'
        )
      }
    }

    assert.equal(outboundCalls, 0, 'retired endpoints must not call Supabase, Mollie, or any other service')
    console.log('P0 B2B sibling API retirement: 12 requests denied (4 routes x GET/POST/PATCH); 0 outbound calls')
  } finally {
    global.fetch = originalFetch
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

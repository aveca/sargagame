#!/usr/bin/env node
'use strict'

// Security regression test: six legacy B2B service-role endpoints must fail closed.
const assert = require('node:assert/strict')

const RETIRED_PATHS = [
  '/api/b2b-prospects.php',
  '/api/b2b-concierge.php',
  '/api/b2b-contacts.php',
  '/api/b2b-events.php',
  '/api/b2b-scores.php',
  '/api/b2b-forecast-delivery.php',
]

async function main() {
  const worker = (await import('../../workers/sg-payments/index.js')).default
  const originalFetch = global.fetch
  let outboundCalls = 0
  global.fetch = async () => { outboundCalls++; throw new Error('Unexpected outbound request') }
  try {
    for (const path of RETIRED_PATHS) {
      for (const method of ['GET', 'POST', 'PATCH']) {
        const init = { method, headers: { 'Content-Type': 'application/json' } }
        if (method !== 'GET') init.body = JSON.stringify({ email: 'must-not-persist@example.invalid', payment_confirmed: true, status: 'completed', score: 100 })
        const response = await worker.fetch(new Request('https://sargasses-martinique.com' + path + (method === 'PATCH' ? '?id=not-real' : ''), init), {}, { waitUntil() {} })
        assert.equal(response.status, 410, path + ' ' + method)
        assert.deepEqual(await response.json(), { error: 'endpoint_retired' })
        assert.equal(response.headers.get('cache-control'), 'no-store')
        assert.equal(response.headers.get('access-control-allow-origin'), null)
        assert.equal(response.headers.get('access-control-allow-credentials'), null)
      }
    }
    assert.equal(outboundCalls, 0, 'retired endpoints must not make outbound service calls')
    console.log('P0 B2B legacy API retirement: 18 requests denied (6 routes x GET/POST/PATCH); 0 outbound calls')
  } finally { global.fetch = originalFetch }
}
main().catch((error) => { console.error(error); process.exit(1) })

#!/usr/bin/env node
'use strict'

const assert = require('assert')
const { resolveLiveProof, liveProof } = require('../../scripts/automation/lib/b2b-segment.cjs')
const { buildC0 } = require('../../scripts/automation/b2b-cold-outreach.cjs')

const freshRegionalRecord = {
  freshness: { stale: false },
  regions: ['mq'],
  window: { from: '2026-10-01', to: '2026-10-31' },
  byRegime: { calm: { cleanReliabilityPct: 97, cleanSamples: 120 } },
  overall: { statusHitRatePct: 99 }
}

assert.deepStrictEqual(resolveLiveProof(freshRegionalRecord, 'mq'), {
  pct: 97, n: 120, from: '2026-10-01', to: '2026-10-31', region: 'mq'
})
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, freshness: { stale: true } }, 'mq'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, freshness: {} }, 'mq'), null)
assert.strictEqual(resolveLiveProof(freshRegionalRecord, 'gp'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, regions: ['mq', 'gp'] }, 'mq'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, byRegime: {} }, 'mq'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, byRegime: { calm: { cleanReliabilityPct: 101, cleanSamples: 120 } } }, 'mq'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, byRegime: { calm: { cleanReliabilityPct: 97, cleanSamples: 0 } } }, 'mq'), null)
assert.strictEqual(resolveLiveProof({ ...freshRegionalRecord, byRegime: { calm: { cleanReliabilityPct: null, cleanSamples: 120 } } }, 'mq'), null)

// Current main record is stale and aggregates MQ+GP: it must not be reused for either market.
assert.strictEqual(liveProof('mq'), null)
assert.strictEqual(liveProof('gp'), null)
assert.strictEqual(liveProof('florida'), null)

const generated = buildC0({
  email: 'reservations@example.com',
  name: 'Example Hotel',
  town: 'Miami Beach',
  island: 'florida',
  url: 'https://example.com'
}, 'test-prospect')
assert.match(generated.html, /No reliability rate is quoted in this message/)
assert.doesNotMatch(generated.html, /~?76\s*%|~?79\s*%|99\s*%/)
assert.doesNotMatch(generated.html, /audited daily|audité chaque jour|se audita cada día/i)

console.log('PASS b2b outreach proof is fresh, complete and single-region only')

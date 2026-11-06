'use strict'

const assert = require('node:assert/strict')
const { resolvePublicAccuracy } = require('../../scripts/lib/regional-track-record.cjs')

function validRecord(overrides = {}) {
  return {
    regions: ['mq', 'gp'],
    window: { from: '2026-10-01', to: '2026-10-31' },
    sampleSize: 200,
    freshness: { stale: false },
    byHorizon: [
      { day: 1, hitRatePct: 84, pairs: 100 },
      { day: 3, hitRatePct: 71, pairs: 80 },
    ],
    overall: { afaiMAE: 0.14 },
    byRegime: {
      calm: {
        cleanReliabilityPct: 98,
        cleanSamples: 150,
        falseAlarmRatePct: 2,
        alertReliabilityPct: 25,
        alertSamples: 4,
      },
    },
    ...overrides,
  }
}

const fresh = resolvePublicAccuracy(validRecord(), 'mq')
assert.equal(fresh.available, true)
assert.equal(fresh.reason, null)
assert.deepEqual(fresh.scopeRegions, ['mq', 'gp'])
assert.equal(fresh.regimes.calm.cleanReliabilityPct, 98)
assert.equal(fresh.regimes.calm.cleanSamples, 150)
assert.equal(fresh.regimes.calm.alertReliabilityPct, 25)

const uncovered = resolvePublicAccuracy(validRecord(), 'florida')
assert.equal(uncovered.available, false)
assert.equal(uncovered.reason, 'region-not-covered')
assert.deepEqual(uncovered.regimes, {})

const stale = resolvePublicAccuracy(validRecord({ freshness: { stale: true } }), 'mq')
assert.equal(stale.available, false)
assert.equal(stale.reason, 'stale')
assert.deepEqual(stale.regimes, {})

const missingFreshness = resolvePublicAccuracy(validRecord({ freshness: undefined }), 'mq')
assert.equal(missingFreshness.available, false)
assert.equal(missingFreshness.reason, 'stale')

const incomplete = resolvePublicAccuracy(validRecord({
  byHorizon: [{ day: 1, hitRatePct: 84, pairs: 100 }],
}), 'mq')
assert.equal(incomplete.available, false)
assert.equal(incomplete.reason, 'incomplete-record')
assert.deepEqual(incomplete.regimes, {})

console.log('PASS: public accuracy requires a fresh record, declared region scope and complete horizons')

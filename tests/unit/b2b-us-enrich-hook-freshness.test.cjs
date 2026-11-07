#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const { makeHook } = require('../../scripts/automation/b2b-us-enrich.cjs')

const regions = ['florida', 'puntacana', 'rivieramaya']
const samples = [0, 0.25, 0.5, 0.75]
const unsupportedClaims = /\b(?:this morning|right now|today|live|real[- ]time|every 6 hours|four times a day|4 times a day|daily|day by day|all-clear|clean today|overnight)\b/i

const originalRandom = Math.random
try {
  for (const region of regions) {
    for (const sample of samples) {
      Math.random = () => sample
      const hook = makeHook(region, 'Test Beach', 'Test Hotel')
      assert.match(hook, /latest published observation/i, region + ': hook identifies a published observation')
      assert.match(hook, /timestamp and confidence|timestamp,? and confidence/i, region + ': hook requires timestamp and confidence')
      assert.match(hook, /Test Beach/, region + ': hook remains beach-personalised')
      assert.match(hook, /Test Hotel/, region + ': hook remains hotel-personalised')
      assert.doesNotMatch(hook, unsupportedClaims, region + ': hook must not promise a live status or fixed cadence')
    }
  }

  Math.random = () => 0
  const fallback = makeHook('unknown-region', 'Test Beach', 'Test Hotel')
  assert.match(fallback, /latest published observation/i, 'fallback describes a published observation')
  assert.match(fallback, /timestamp and confidence/i, 'fallback includes timestamp and confidence')
  assert.doesNotMatch(fallback, unsupportedClaims, 'fallback must not promise a live status or fixed cadence')
} finally {
  Math.random = originalRandom
}

console.log('B2B_US_ENRICH_HOOK_FRESHNESS PASS (12 regional variants + fallback)')

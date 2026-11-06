'use strict'

const assert = require('node:assert/strict')

async function main() {
  const { getObservationFreshness, MAX_OBSERVATION_AGE_MINUTES } =
    await import('../../src/observation-freshness.js')
  const now = Date.parse('2026-11-06T10:00:00.000Z')
  const atAge = minutes => new Date(now - minutes * 60000).toISOString()

  assert.equal(MAX_OBSERVATION_AGE_MINUTES, 900)
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(900) }, now).fresh, true)
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(901) }, now).fresh, false)
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(30), dataAgeMinutes: 901 }, now).fresh, false)
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(30), stale: true }, now).fresh, false)
  assert.equal(getObservationFreshness({ updatedAt: new Date(now).toISOString() }, now).reason, 'unknown')
  assert.equal(getObservationFreshness({ erddapTimestamp: 'invalid', updatedAt: new Date(now).toISOString() }, now).reason, 'unknown')
  assert.equal(getObservationFreshness({ erddapTimestamp: new Date(now + 60000).toISOString() }, now).reason, 'unknown')
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(1200), dataAgeMinutes: 5 }, now).fresh, false)
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(5), dataAgeMinutes: 'bad' }, now).reason, 'unknown')

  console.log('PASS observation freshness: 900/901 boundary, stale flags, invalid/future timestamps, no updatedAt fallback')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

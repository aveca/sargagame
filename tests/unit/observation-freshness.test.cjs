'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')

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

  const component = fs.readFileSync(require('node:path').resolve(__dirname, '../../src/BeachSheet.jsx'), 'utf8')
  assert.match(component, /if\(!hasTrustedObservation\)return null/, 'stale observations must suppress the forecast')
  assert.match(component, /data-testid="stale-observation-notice"/, 'stale observations must show a warning')
  assert.match(component, /hasTrustedObservation&&<StorySection delay=\{\.15\}/, 'the paid SOS report must be hidden without fresh observations')
  assert.match(component, /showSOS && hasTrustedObservation/, 'the SOS checkout modal must not open after freshness is lost')
  assert.doesNotMatch(component, /sargData\?\.erddapTimestamp\s*\|\|\s*sargData\?\.updatedAt/, 'publication time must not substitute for observation time')

  console.log('PASS observation freshness and buyer safety: stale/unknown data suppresses verdict, forecast and SOS purchase')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

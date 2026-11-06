'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const now = Date.parse('2026-11-06T10:00:00.000Z')

async function main() {
  const { getObservationFreshness, MAX_OBSERVATION_AGE_MINUTES } =
    await import('../../src/observation-freshness.js')

  assert.equal(MAX_OBSERVATION_AGE_MINUTES, 900)

  const atAge = minutes => new Date(now - minutes * 60000).toISOString()
  assert.deepEqual(
    getObservationFreshness({ erddapTimestamp: atAge(900) }, now),
    { fresh: true, reason: 'fresh', ageMinutes: 900 },
    'the exact 900-minute boundary remains usable'
  )
  assert.equal(getObservationFreshness({ erddapTimestamp: atAge(901) }, now).fresh, false,
    'observations older than the 900-minute SLA must be paused')
  assert.equal(getObservationFreshness({
    erddapTimestamp: atAge(30), dataAgeMinutes: 901
  }, now).fresh, false, 'a stale declared age must override a newer timestamp')
  assert.equal(getObservationFreshness({
    erddapTimestamp: atAge(30), stale: true
  }, now).fresh, false, 'an explicit stale flag must fail closed')
  assert.equal(getObservationFreshness({
    updatedAt: new Date(now).toISOString()
  }, now).reason, 'unknown', 'publication time must never replace the source observation timestamp')
  assert.equal(getObservationFreshness({
    erddapTimestamp: 'not-a-date', updatedAt: new Date(now).toISOString()
  }, now).reason, 'unknown', 'an invalid observation timestamp must fail closed')
  assert.equal(getObservationFreshness({
    erddapTimestamp: new Date(now + 60000).toISOString()
  }, now).reason, 'unknown', 'future timestamps must fail closed')
  assert.equal(getObservationFreshness({
    erddapTimestamp: atAge(1200), dataAgeMinutes: 5
  }, now).fresh, false, 'the older of the source timestamp and declared age must govern')

  const component = fs.readFileSync(path.join(ROOT, 'src', 'BeachSheet.jsx'), 'utf8')
  assert.match(component, /getObservationFreshness\(sargData\)/)
  assert.match(component, /hasScore=hasTrustedObservation&&/)
  assert.match(component, /if\(!hasTrustedObservation\)return null/,
    'stale or unknown observations must suppress the forecast')
  assert.match(component, /data-testid="stale-observation-notice"/,
    'stale or unknown observations must show an explicit notice')
  assert.doesNotMatch(component, /sargData\?\.erddapTimestamp\s*\|\|\s*sargData\?\.updatedAt/,
    'updatedAt must not be used as a freshness fallback')

  console.log('PASS: stale/unknown satellite observations suppress score, verdict and forecast')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

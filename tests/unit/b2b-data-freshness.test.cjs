'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const freshness = require('../../public/b2b-data-freshness.js')

const now = Date.parse('2026-10-30T13:26:57.000Z')
const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString()
const old = new Date(now - 4405 * 60 * 1000).toISOString()

assert.equal(freshness.getObservationFreshness({ erddapTimestamp: recent, updatedAt: new Date(now).toISOString(), stale: false }, 'en', now).status, 'fresh')
const republishedOld = freshness.getObservationFreshness({ erddapTimestamp: old, updatedAt: new Date(now).toISOString(), stale: false }, 'fr', now)
assert.equal(republishedOld.status, 'stale', 'recent republication must not make an old observation fresh')
assert.equal(Math.round(republishedOld.ageMs / 60000), 4405)
assert.match(republishedOld.label, /ancienne/)
assert.equal(freshness.getObservationFreshness({ updatedAt: new Date(now).toISOString(), stale: false }, 'en', now).status, 'unknown')
assert.equal(freshness.getObservationFreshness({ erddapTimestamp: new Date(now + 60000).toISOString(), stale: false }, 'fr', now).status, 'unknown')
assert.equal(freshness.getObservationFreshness({ erddapTimestamp: recent, stale: true }, 'en', now).status, 'stale')

const freshRecord = {
  generatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
  freshness: { stale: false },
  regions: ['mq', 'gp'],
  window: { from: '2026-10-01', to: '2026-10-30' },
  sampleSize: 2205,
  overall: { statusHitRatePct: 99 }
}
assert.equal(freshness.getTrackRecordState(freshRecord, 'mq', now).available, true)
assert.equal(freshness.getTrackRecordState(freshRecord, 'MQ', now).scopeLabel, 'MQ + GP')
assert.equal(freshness.getTrackRecordState(freshRecord, 'tulum', now).reason, 'region-not-covered')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, freshness: { stale: true } }, 'mq', now).reason, 'stale-record')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: new Date(now - 37 * 60 * 60 * 1000).toISOString() }, 'mq', now).reason, 'expired-record')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: new Date(now + 60000).toISOString() }, 'mq', now).reason, 'invalid-generated-at')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: undefined }, 'mq', now).reason, 'invalid-generated-at')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, sampleSize: 0 }, 'mq', now).reason, 'incomplete-record')

const root = path.resolve(__dirname, '../..')
const pages = [
  ['public/pro/hotels/index.html', 'fr'],
  ['public/pro/en/hotels/index.html', 'en'],
  ['public/pro/collectivites/index.html', 'fr'],
  ['public/pro/en/collectivites/index.html', 'en']
]
for (const [relative, locale] of pages) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8')
  assert.ok(html.includes('/b2b-data-freshness.js'), relative + ' must load the shared freshness contract')
  assert.ok(html.includes("getTrackRecordState(d,'mq')"), relative + ' must gate the record on region and freshness')
  assert.ok(html.includes("getObservationFreshness(data,'"+locale+"')"), relative + ' must use the ERDDAP timestamp helper')
  assert.doesNotMatch(html, /70\s*%\s*(?:de justesse|accuracy)|76\s*%\s*(?:to|à)\s*79\s*%|4×\s*\/\s*(?:jour|day)/i, relative + ' must not publish unsupported accuracy or sampling claims')
}
const pricing = fs.readFileSync(path.join(root, 'public/pro/pricing/index.html'), 'utf8')
assert.doesNotMatch(pricing, /4×\s*\/\s*jour|4×\s*\/\s*day/i, 'pricing page must not promise four AFAI observations per day')
assert.ok(pricing.includes('79 €/mois') && pricing.includes('690 €/an'), 'existing canonical Pro prices must remain unchanged')
const api = fs.readFileSync(path.join(root, 'public/api/index.html'), 'utf8')
assert.ok(api.includes('Alternate Floating Algae Index'), 'API docs must use the verified AFAI expansion')
assert.doesNotMatch(api, /Algae Floating Area Index/, 'API docs must not use the incorrect AFAI expansion')

console.log('PASS: B2B observation freshness, scoped track-record gating, source cadence copy and canonical pricing invariance')

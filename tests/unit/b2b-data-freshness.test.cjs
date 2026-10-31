'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const helperSource = fs.readFileSync(path.join(__dirname, '../../public/b2b-data-freshness.js'), 'utf8')
const helperWindow = {}
vm.runInNewContext(helperSource, { window: helperWindow })
const freshness = helperWindow.SargagameB2BFreshness
assert.ok(freshness && typeof freshness.getObservationFreshness === 'function', 'browser helper must expose its public contract')

const now = Date.parse('2026-10-30T13:26:57.000Z')
const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString()
const old = new Date(now - 4405 * 60 * 1000).toISOString()

assert.equal(freshness.getObservationFreshness({ erddapTimestamp: recent, updatedAt: new Date(now).toISOString(), stale: false }, 'en', now).status, 'fresh')
const republishedOld = freshness.getObservationFreshness({ erddapTimestamp: old, updatedAt: new Date(now).toISOString(), stale: false }, 'fr', now)
assert.equal(republishedOld.status, 'stale', 'recent republication must not make an old observation fresh')
assert.equal(Math.round(republishedOld.ageMs / 60000), 4405)
const exactThreshold = freshness.getObservationFreshness({ erddapTimestamp: new Date(now - 36 * 60 * 60 * 1000).toISOString(), stale: false }, 'en', now)
assert.equal(exactThreshold.status, 'stale', 'the exact 36-hour boundary must be stale')
assert.match(republishedOld.label, /ancienne/)
const spanishOld = freshness.getObservationFreshness({ erddapTimestamp: old, updatedAt: new Date(now).toISOString(), stale: false }, 'es', now)
assert.equal(spanishOld.status, 'stale')
assert.match(spanishOld.label, /antigua/)
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
assert.equal(freshness.getTrackRecordState({ ...freshRecord, freshness: undefined }, 'mq', now).reason, 'stale-record')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: new Date(now - 37 * 60 * 60 * 1000).toISOString() }, 'mq', now).reason, 'expired-record')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: new Date(now + 60000).toISOString() }, 'mq', now).reason, 'invalid-generated-at')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, generatedAt: undefined }, 'mq', now).reason, 'invalid-generated-at')
assert.equal(freshness.getTrackRecordState({ ...freshRecord, sampleSize: 0 }, 'mq', now).reason, 'incomplete-record')

const root = path.resolve(__dirname, '../..')
const pages = [
  ['public/pro/hotels/index.html', 'fr'],
  ['public/pro/en/hotels/index.html', 'en'],
  ['public/pro/es/hotels/index.html', 'es'],
  ['public/pro/collectivites/index.html', 'fr'],
  ['public/pro/en/collectivites/index.html', 'en'],
  ['public/pro/es/collectivites/index.html', 'es']
]
for (const [relative, locale] of pages) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8')
  assert.ok(html.includes('/b2b-data-freshness.js'), relative + ' must load the shared freshness contract')
  assert.ok(html.includes("getTrackRecordState(d,'mq')"), relative + ' must gate the record on region and freshness')
  assert.ok(html.includes("getObservationFreshness(data,'"+locale+"')"), relative + ' must use the ERDDAP timestamp helper')
  assert.match(html, /class="freshpill is-unknown"/, relative + ' must start in an unknown state before the observation is checked')
  assert.doesNotMatch(html, /70\s*%\s*(?:de justesse|accuracy|de acierto)|76\s*%\s*(?:to|à|a)\s*79\s*%|4×\s*\/\s*(?:jour|day|día)|live conditions badge|live demo|live snapshot|demo en vivo|datos reales, al instante/i, relative + ' must not publish unsupported accuracy, sampling or live-data claims')
}
const pricingPages = [
  { path: 'public/pro/pricing/index.html', prices: ['79 €/mois', '690 €/an'] },
  { path: 'public/pro/en/pricing/index.html', prices: ['$89/month', '$790/year'] },
  { path: 'public/pro/es/pricing/index.html', prices: ['$89/mes', '$790/año'] }
]
for (const item of pricingPages) {
  const pricing = fs.readFileSync(path.join(root, item.path), 'utf8')
  assert.ok(pricing.includes('/b2b-data-freshness.js'), item.path + ' must load the shared freshness contract')
  assert.ok(pricing.includes("getTrackRecordState(d, 'mq')"), item.path + ' must scope the public record to MQ')
  assert.doesNotMatch(pricing, /Fiabilité publiée et auditée|4×\s*\/\s*jour|4×\s*\/\s*day|4×\s*\/\s*día/i, item.path + ' must not publish stale proof or promise four AFAI observations per day')
  assert.ok(item.prices.every(price => pricing.includes(price)), item.path + ' must preserve its existing prices without selecting a new offer')
}

const api = fs.readFileSync(path.join(root, 'public/api/index.html'), 'utf8')
assert.ok(api.includes('Alternate Floating Algae Index'), 'API docs must use the verified AFAI expansion')
assert.doesNotMatch(api, /Algae Floating Area Index/, 'API docs must not use the incorrect AFAI expansion')

console.log('PASS: six B2B locales, observation freshness, scoped track-record gating, source cadence copy and canonical pricing invariance')

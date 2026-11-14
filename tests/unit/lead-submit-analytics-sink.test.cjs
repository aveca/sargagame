#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const app = fs.readFileSync(path.join(root, 'src/Sargasses_PROD.jsx'), 'utf8')
const start = app.indexOf('export function submitLead(email,source){')
const end = app.indexOf('// ── ENGAGEMENT CONTINU', start)
assert.ok(start >= 0 && end > start, 'submitLead must remain a discoverable source function')

const functionSource = app.slice(start, end).replace('export function submitLead', 'function submitLead')
const makeSubmitLead = (options = {}) => {
  const calls = { beacon: [], fetch: [], analytics: [] }
  const host = options.host || 'sargasses-martinique.com'
  const navigatorMock = options.noBeacon ? {} : {
    sendBeacon(url, body) {
      calls.beacon.push({ url, body })
      if (options.beaconThrows) throw new Error('simulated sendBeacon failure')
      return options.beaconResult
    }
  }
  const fetchMock = (url, init) => {
    calls.fetch.push({ url, init })
    return Promise.resolve({ ok: true })
  }
  const analyticsMock = (event, params, island) => {
    calls.analytics.push({ event, params, island })
  }
  const submit = new Function(
    'IS_NEW_REGION', 'REGION', 'window', 'navigator', 'APPS_SCRIPT_URL', 'fetch', 'logAnalyticsEvent',
    functionSource + '\nreturn submitLead;'
  )(
    Boolean(options.isNewRegion),
    { id: options.regionId || 'florida' },
    { location: { hostname: host } },
    navigatorMock,
    'https://example.test/apps-script',
    fetchMock,
    analyticsMock
  )
  return { submit, calls }
}

function assertLeadSink(calls, expectedIsland) {
  assert.equal(calls.analytics.length, 1, 'Supabase funnel sink must run exactly once')
  assert.equal(calls.analytics[0].event, 'sg_email_submit')
  assert.equal(calls.analytics[0].island, expectedIsland)
  assert.deepEqual(calls.analytics[0].params, { source: 'b2b_pro', island: expectedIsland })
  assert.equal(Object.hasOwn(calls.analytics[0].params, 'email'), false, 'email must not enter analytics params')
}

{
  const { submit, calls } = makeSubmitLead({ host: 'sargasses-guadeloupe.com', beaconResult: true })
  submit('hotel@example.test', 'b2b_pro')
  assert.equal(calls.beacon.length, 1)
  assert.equal(calls.fetch.length, 0, 'successful sendBeacon must not duplicate the Apps Script lead')
  assert.equal(JSON.parse(calls.beacon[0].body).email, 'hotel@example.test')
  assertLeadSink(calls, 'GP')
}

{
  const { submit, calls } = makeSubmitLead({ host: 'sargasses-martinique.com', beaconResult: false })
  submit('hotel@example.test', 'b2b_pro')
  assert.equal(calls.beacon.length, 1)
  assert.equal(calls.fetch.length, 1, 'failed sendBeacon must use the keepalive fetch fallback')
  assertLeadSink(calls, 'MQ')
}

{
  const { submit, calls } = makeSubmitLead({ host: 'sargazotulum.com', isNewRegion: true, regionId: 'tulum', beaconThrows: true })
  submit('hotel@example.test', 'b2b_pro')
  assert.equal(calls.beacon.length, 1)
  assert.equal(calls.fetch.length, 1, 'throwing sendBeacon must use the keepalive fetch fallback')
  assertLeadSink(calls, 'TULUM')
}

{
  const { submit, calls } = makeSubmitLead({ host: 'sargassummiami.com', isNewRegion: true, regionId: 'florida', noBeacon: true })
  submit('hotel@example.test', 'b2b_pro')
  assert.equal(calls.beacon.length, 0)
  assert.equal(calls.fetch.length, 1, 'missing sendBeacon must use the keepalive fetch fallback')
  assertLeadSink(calls, 'FLORIDA')
}

console.log('PASS: lead funnel event is persisted when sendBeacon succeeds')
console.log('PASS: keepalive fetch fallback preserves the lead and funnel event')
console.log('PASS: region attribution works for GP, MQ and new USD regions')
console.log('PASS: email remains excluded from analytics payload')

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
  // Miroir fidèle du stockage local navigateur (clé `sg_email` lue par
  // PremiumModal et par la page /premium/ pour le pré-remplissage).
  const storage = {}
  const storageMock = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v) },
    removeItem: (k) => { delete storage[k] },
  }
  const submit = new Function(
    'IS_NEW_REGION', 'REGION', 'window', 'navigator', 'APPS_SCRIPT_URL', 'fetch', 'logAnalyticsEvent',
    functionSource + '\nreturn submitLead;'
  )(
    Boolean(options.isNewRegion),
    { id: options.regionId || 'florida' },
    options.noWindowStorage ? { location: { hostname: host } } : { location: { hostname: host }, localStorage: storageMock },
    navigatorMock,
    'https://example.test/apps-script',
    fetchMock,
    analyticsMock
  )
  return { submit, calls, storage }
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

// ── MÉMOIRE LOCALE `sg_email` (pré-remplissage du paiement) ─────────────────
// L'email capturé est mémorisé normalisé (trim + minuscules) sous `sg_email` :
// c'est la clé que lit PremiumModal (defaultValue) et la page /premium/. Ce
// test verrouille le raccourcissement du parcours visiteur → paiement SANS
// toucher au pipeline (aucun appel réseau, aucun événement en plus).
{
  const { submit, storage } = makeSubmitLead({ host: 'sargasses-martinique.com', beaconResult: true })
  submit('  Hotel@Example.TEST ', 'map_world')
  assert.equal(storage.sg_email, 'hotel@example.test', 'captured email must be stored normalized for payment prefill')
}
{
  // Sandbox / navigation privée sans localStorage → la capture doit survivre
  // (aucune exception) et le reste du tunnel doit tourner à l'identique.
  const { submit, calls } = makeSubmitLead({ host: 'sargasses-martinique.com', beaconResult: true, noWindowStorage: true })
  submit('hotel@example.test', 'map_world')
  assert.equal(calls.analytics.length, 1, 'missing window.localStorage must not break the lead funnel')
  assert.equal(calls.beacon.length, 1, 'missing window.localStorage must not break the Apps Script sink')
}
{
  // Un email vide ne doit JAMAIS écraser une valeur déjà présente.
  const { submit, storage } = makeSubmitLead({ host: 'sargasses-martinique.com', beaconResult: true })
  submit('keeper@example.test', 'chasse')
  submit('', 'chasse')
  assert.equal(storage.sg_email, 'keeper@example.test', 'an empty capture must not erase a stored email')
}

console.log('PASS: lead funnel event is persisted when sendBeacon succeeds')
console.log('PASS: keepalive fetch fallback preserves the lead and funnel event')
console.log('PASS: region attribution works for GP, MQ and new USD regions')
console.log('PASS: email remains excluded from analytics payload')
console.log('PASS: captured email is stored normalized for payment prefill')
console.log('PASS: a missing window.localStorage never breaks the lead funnel')
console.log('PASS: an empty capture never erases an already stored email')

'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(__dirname, '../../src/SargaChat.jsx'),
  'utf8'
)

assert.match(
  source,
  /const dataFresh12h=sargData\?\.source==="erddap-live"&&sargData\?\.stale===false&&isSatelliteFresh12h\(sargData\)/,
  'current chat decisions require an explicit live source, stale=false and a fresh ERDDAP observation'
)

const whereStart = source.indexOf('if(k==="where"){')
const tomorrowStart = source.indexOf('if(k==="tomorrow"){', whereStart)
const premiumStart = source.indexOf('if(k==="premium")', tomorrowStart)
assert.ok(whereStart >= 0 && tomorrowStart > whereStart && premiumStart > tomorrowStart,
  'where and tomorrow answer branches exist')
const whereBlock = source.slice(whereStart, tomorrowStart)
const tomorrowBlock = source.slice(tomorrowStart, premiumStart)

assert.ok(whereBlock.indexOf('if(!dataFresh12h)') >= 0 &&
  whereBlock.indexOf('if(!dataFresh12h)') < whereBlock.indexOf('if(cleans.length)'),
  'stale/unknown data returns before clean beaches or scores are read')
assert.match(whereBlock, /not recent or verified enough|pas assez récente ou vérifiée|no puedo recomendar una playa/,
  'where fallback is localized and refuses a current recommendation')
assert.match(whereBlock, /chips:\[\{k:"root"/,
  'stale where fallback does not send the visitor to a beach or a purchase CTA')

assert.ok(tomorrowBlock.indexOf('if(!dataFresh12h)') >= 0 &&
  tomorrowBlock.indexOf('if(!dataFresh12h)') < tomorrowBlock.indexOf('const wk=sargData?.weekly'),
  'stale/unknown data returns before weekly forecast data is read')
assert.match(tomorrowBlock, /old or unverified observation|observation ancienne ou non vérifiée|observación antigua o no verificada/,
  'tomorrow fallback is localized and does not invent a forecast')
assert.match(tomorrowBlock, /chips:\[\{k:"root"/,
  'stale tomorrow fallback does not upsell an unverified forecast')

const trustStart = source.indexOf('if(k==="trust")')
const trustEnd = source.indexOf('return null', trustStart)
assert.ok(trustStart >= 0 && trustEnd > trustStart, 'trust answer exists')
const trustBlock = source.slice(trustStart, trustEnd)
assert.doesNotMatch(trustBlock, /4×\/jour|4×\/day|4 veces al día|four times a day/,
  'trust copy no longer claims an unsupported satellite refresh cadence')
assert.match(trustBlock, /heure affichée est celle de l'observation|displayed time is the observation time|hora mostrada corresponde a la observación/,
  'trust copy distinguishes observation time from publication time')

assert.match(source, /Pas de statut actuel/)
assert.match(source, /No current status/)
assert.match(source, /Sin estado actual/)

;(async () => {
  const { isSatelliteFresh12h } = await import('../../src/lib/format-freshness.mjs')
  const now = Date.parse('2026-10-30T18:30:00.000Z')
  const oldObservation = {
    source: 'erddap-live',
    stale: false,
    erddapTimestamp: '2026-10-27T12:00:00Z',
    updatedAt: '2026-10-30T18:29:00Z'
  }
  assert.equal(isSatelliteFresh12h(oldObservation, now), false,
    'a recent pipeline publication cannot make a 78-hour observation current')
  assert.equal(isSatelliteFresh12h({
    source: 'erddap-live',
    stale: false,
    erddapTimestamp: new Date(now - 3 * 3600000).toISOString()
  }, now), true, 'a recent ERDDAP observation remains eligible for current chat answers')
  console.log('SARGA_CHAT_FRESHNESS_GATE_TESTS PASS')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

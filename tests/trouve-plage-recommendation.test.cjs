#!/usr/bin/env node
'use strict'
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')

async function main() {
  const { getBeachRecommendation, isObservationFresh, matchesRegion, haversineKm } =
    await import(pathToFileURL(path.join(__dirname, '../src/lib/trouve-plage-recommendation.js')).href)

  const now = Date.parse('2026-10-12T12:00:00Z')
  const freshAt = '2026-10-12T10:30:00Z'
  const beaches = [
    { id: 'mq001', island: 'mq', name: 'Plage A', status: 'moderate', score: 72, lat: 14.4, lng: -60.9 },
    { id: 'mq002', island: 'mq', name: 'Plage B', status: 'clean', score: 84, lat: 14.42, lng: -60.88 },
    { id: 'mq003', island: 'mq', name: 'Plage C', status: 'avoid', score: 24, lat: 14.43, lng: -60.87 },
    { id: 'gp001', island: 'gp', name: 'Guadeloupe', status: 'clean', score: 99, lat: 16.2, lng: -61.5 }
  ]

  assert.equal(isObservationFresh(freshAt, now).fresh, true)
  assert.equal(isObservationFresh('2026-10-11T20:00:00Z', now).reason, 'stale')
  assert.equal(isObservationFresh(null, now).reason, 'missing')
  assert.equal(isObservationFresh('2026-10-12T13:00:00Z', now).reason, 'future')
  assert.equal(matchesRegion(beaches[0], 'mq'), true)
  assert.equal(matchesRegion(beaches[3], 'mq'), false)
  assert.ok(haversineKm(14.4, -60.9, 14.42, -60.88) < 5)

  const best = getBeachRecommendation({ beaches, observationAt: freshAt, now, regionId: 'mq' })
  assert.equal(best.state, 'recommended')
  assert.equal(best.chosen.id, 'mq002', 'clean status and the real score drive the recommendation')
  assert.equal(best.alt.id, 'mq001', 'Plan B is a distinct eligible beach')

  const explicitAvoid = getBeachRecommendation({ beaches, observationAt: freshAt, now, regionId: 'mq', manualId: 'mq003' })
  assert.equal(explicitAvoid.state, 'selected')
  assert.equal(explicitAvoid.selectedIsAvoid, true)
  assert.equal(explicitAvoid.alt.id, 'mq002')

  assert.equal(getBeachRecommendation({ beaches, observationAt: null, now, regionId: 'mq' }).state, 'no_observation')
  assert.equal(getBeachRecommendation({ beaches, observationAt: '2026-10-10T00:00:00Z', now, regionId: 'mq' }).state, 'stale')
  assert.equal(getBeachRecommendation({ beaches, observationAt: freshAt, now, regionId: 'mq', position: {latitude: 0, longitude: 0} }).state, 'no_nearby_beaches')
  assert.equal(getBeachRecommendation({ beaches, observationAt: freshAt, now, regionId: 'tulum' }).state, 'no_regional_beaches')

  console.log('OK — recommendation: freshness gate, region isolation, ranking, plan B, explicit avoid choice, distance')
}
main().catch(err => { console.error(err); process.exit(1) })

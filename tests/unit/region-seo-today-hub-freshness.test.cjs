const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  buildTodayHubState,
  getPublishableTodayRows,
  formatSatelliteObservationLabel,
} = require('../../scripts/lib/region-seo-pages.cjs')

const now = Date.parse('2026-11-02T05:00:00Z')
const beaches = [
  { id: 'low', name: 'Low score', slug: 'low', lv: { status: 'clean', score: 61, afai: 0.08 } },
  { id: 'high', name: 'High score', slug: 'high', lv: { status: 'clean', score: 91, afai: 0.04 } },
  { id: 'invalid', name: 'Invalid status', slug: 'invalid', lv: { status: 'unknown', score: 99, afai: 0.01 } },
]

const staleData = {
  source: 'erddap-live',
  erddapTimestamp: '2026-10-27T12:00:00Z',
  dataAgeMinutes: 1772,
  stale: false,
}
const staleEs = buildTodayHubState({ regionName: 'Florida', beaches, data: staleData, lang: 'es', now })
assert.equal(staleEs.rows.length, 0, 'stale observation must not produce a current beach ranking')
assert.match(staleEs.title, /estado actual no disponible/i)
assert.match(staleEs.desc, /No se publica una clasificación actual/i)
assert.match(staleEs.unavailableMessage, /observación satelital está retrasada/i)
assert.doesNotMatch(staleEs.title, /hoy|en vivo|live/i)
assert.doesNotMatch(staleEs.intro, /puntuación.*\b(?:61|91)\b/i)

const staleEn = buildTodayHubState({ regionName: 'Florida', beaches, data: staleData, lang: 'en', now })
assert.equal(staleEn.rows.length, 0)
assert.match(staleEn.title, /current status unavailable/i)
assert.match(staleEn.unavailableMessage, /satellite observation is delayed/i)

const staleLabel = formatSatelliteObservationLabel(staleData, 'es', now)
assert.match(staleLabel, /2026-10-27/)
assert.match(staleLabel, /retrasada/i)

const freshData = {
  source: 'erddap-live',
  erddapTimestamp: new Date(now - 60 * 60_000).toISOString(),
  stale: false,
}
const freshEs = buildTodayHubState({ regionName: 'Florida', beaches, data: freshData, lang: 'es', now })
assert.deepEqual(freshEs.rows.map(row => row.beach.id), ['high', 'low'], 'fresh rows remain sorted by validated score')
assert.deepEqual(freshEs.rows.map(row => row.decision.status), ['clean', 'clean'])
assert.match(freshEs.title, /últimas observaciones/i)
assert.match(freshEs.desc, /hora y la confianza/i)
assert.doesNotMatch(freshEs.desc, /4 veces al día|en vivo/i)

const underSlaData = { ...freshData, erddapTimestamp: new Date(now - 899 * 60_000).toISOString() }
assert.equal(getPublishableTodayRows(beaches, underSlaData, now).length, 2, '899 minutes remains within the 900-minute SLA')
const atSlaData = { ...freshData, erddapTimestamp: new Date(now - 900 * 60_000).toISOString() }
assert.equal(getPublishableTodayRows(beaches, atSlaData, now).length, 0, '900 minutes is delayed at the inclusive SLA boundary')

for (const invalidData of [
  { source: 'erddap-live', erddapTimestamp: new Date(now + 60_000).toISOString(), stale: false },
  { source: 'erddap-live', erddapTimestamp: 'not-a-date', stale: false },
  { source: 'other-source', erddapTimestamp: freshData.erddapTimestamp, stale: false },
  { source: 'erddap-live', erddapTimestamp: freshData.erddapTimestamp, stale: true },
]) {
  assert.equal(getPublishableTodayRows(beaches, invalidData, now).length, 0, 'unknown/future/non-live/stale source must fail closed')
}

const generator = fs.readFileSync(path.resolve(__dirname, '../../scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /const todayState = buildTodayHubState/)
assert.match(generator, /todayState\.rows\.map/)
assert.match(generator, /formatSatelliteObservationLabel\(data, lang, now\)/)
assert.match(generator, /slug: p\.today\.slug, title: todayTitle, desc: todayState\.desc/)
assert.match(generator, /kind: 'today', sm: \{ daily: true, priority: '0\.9' \}/)
assert.match(generator, /latest beach observations in \$\{region\.name\}/i)

console.log('PASS: regional today hubs publish only fresh, verified beach decisions (EN/ES)')

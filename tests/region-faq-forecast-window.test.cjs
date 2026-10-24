const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { resolveNextArrival } = require('../scripts/lib/region-seo-pages.cjs')

const source = fs.readFileSync(path.resolve(__dirname, '../scripts/lib/region-seo-pages.cjs'), 'utf8')
const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const daysEs = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

const noneEn = resolveNextArrival({
  noneTemplate: 'No significant arrival is indicated for {beach}.',
  riskTemplate: 'Risk at {beach} on {day} ({date}).',
  beachName: 'Daytona Beach',
  hit: null,
  lang: 'en',
  daysFull: daysEn,
})
assert.equal(noneEn, 'No significant arrival is indicated for Daytona Beach.')
assert.doesNotMatch(noneEn, /\{beach\}|\{day\}|\{date\}/)

const riskEn = resolveNextArrival({
  noneTemplate: 'No significant arrival is indicated for {beach}.',
  riskTemplate: 'Risk at {beach} on {day} ({date}).',
  beachName: 'Daytona Beach',
  hit: { date: '2026-10-27' },
  lang: 'en',
  daysFull: daysEn,
})
assert.match(riskEn, /Daytona Beach/)
assert.match(riskEn, /Tuesday/)
assert.doesNotMatch(riskEn, /\{beach\}|\{day\}|\{date\}/)

const noneEs = resolveNextArrival({
  noneTemplate: 'No se indica una llegada significativa para {beach}.',
  riskTemplate: 'Riesgo en {beach} el {day} ({date}).',
  beachName: 'Playa del Carmen',
  hit: null,
  lang: 'es',
  daysFull: daysEs,
})
assert.equal(noneEs, 'No se indica una llegada significativa para Playa del Carmen.')

const invalidDate = resolveNextArrival({
  noneTemplate: 'No arrival is indicated for {beach}.',
  riskTemplate: 'Risk at {beach} on {day} ({date}).',
  beachName: 'Daytona Beach',
  hit: { date: 'not-a-date' },
  lang: 'en',
  daysFull: daysEn,
})
assert.equal(invalidDate, 'No arrival is indicated for Daytona Beach.')

assert.ok(source.includes('Available forecast for {beach}: {forecastLine}. The number of days shown depends on available forecast data.'))
assert.ok(source.includes('Pronóstico disponible para {beach}: {forecastLine}. El número de días mostrados depende de los datos de pronóstico disponibles.'))
assert.ok(!source.includes('The full 7-day outlook for {beach}'))
assert.ok(!source.includes('El pronóstico completo de 7 días para {beach}'))
assert.ok(!source.includes('No significant sargassum arrival is forecast at {beach} over the next 7 days'))
assert.ok(!source.includes('No se pronostica ninguna llegada significativa de sargazo a {beach} en los próximos 7 días'))

console.log('region FAQ forecast-window: all assertions passed')

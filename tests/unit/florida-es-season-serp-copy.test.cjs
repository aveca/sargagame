'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const content = JSON.parse(fs.readFileSync(
  path.join(root, 'regions/seo-content/florida.es.json'),
  'utf8',
))
const season = content.pages && content.pages.season

assert.ok(season, 'Florida Spanish season page remains configured')
assert.equal(season.slug, 'temporada-sargazo-florida', 'canonical route slug is preserved')
assert.match(season.title, /temporada de sargazo en miami y florida/i, 'title matches the observed Miami and Florida seasonal search intent')
assert.match(season.title, /2026/, 'title retains the current season year')
assert.ok(season.title.length <= 60, 'title remains within the selected SERP length budget')
assert.ok(season.desc.length <= 158, 'meta description remains within the selected SERP length budget')
assert.match(season.desc, /meses de mayor actividad/i, 'description reflects the page month-by-month content')
assert.match(season.desc, /Miami.*Cayos.*Golfo/i, 'description names the regional comparisons actually covered')
assert.match(season.desc, /última observación/i, 'description points visitors to the latest published observation')
assert.doesNotMatch(season.desc, /seguimiento satelital diario|4 veces al día|actualizado a diario/i, 'description does not promise an unsupported update cadence')
assert.match(season.h1, /Florida.*Mes por Mes|Mes por Mes.*Florida/i, 'visible heading remains aligned with the route intent')

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /slug: p\.season\.slug, title: p\.season\.title, desc: p\.season\.desc/, 'regional generator consumes the tested title and description')

console.log('FLORIDA_ES_SEASON_SERP_COPY PASS (route, intent, freshness, length, generator)')

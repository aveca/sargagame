'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const content = JSON.parse(fs.readFileSync(
  path.join(root, 'regions/seo-content/florida.json'),
  'utf8',
))
const season = content.pages && content.pages.season

assert.ok(season, 'Florida English season page remains configured')
assert.equal(season.slug, 'sargassum-season-florida', 'canonical route slug is preserved')
assert.match(season.title, /Florida Sargassum Season 2026/i, 'title remains aligned with the English season route')
assert.ok(season.title.length <= 60, 'title remains within the selected SERP length budget')
assert.ok(season.desc.length <= 158, 'meta description remains within the selected SERP length budget')
assert.match(season.desc, /usually runs May–August/i, 'description answers the seasonal timing query')
assert.match(season.desc, /Keys.*southeast coast/i, 'description preserves the regional comparison covered by the page')
assert.match(season.desc, /latest beach observations/i, 'description directs visitors to the latest published evidence')
assert.doesNotMatch(season.desc, /daily satellite tracking|4\s*[×x]\s*(?:a day|daily|per day)|updated daily/i, 'description does not promise an unsupported refresh cadence')

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /slug: p\.season\.slug, title: p\.season\.title, desc: p\.season\.desc/, 'regional generator consumes the tested title and description')

console.log('FLORIDA_EN_SEASON_SERP_COPY PASS (route, intent, freshness, length, generator)')

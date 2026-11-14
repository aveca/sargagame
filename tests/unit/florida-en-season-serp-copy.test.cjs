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
assert.equal(season.h1, 'Sargassum Season in Florida — 2026 Month-by-Month', 'visible H1 remains unchanged')
assert.equal(season.title, 'When Is Sargassum Season in Florida? 2026 Guide', 'title matches the high-intent question query')
assert.ok(season.title.length <= 60, 'title remains within the selected SERP length budget')
assert.equal(
  season.desc,
  "Florida's sargassum season usually runs May–August, with heavier arrivals in the Keys and southeast coast. See the month-by-month pattern before booking.",
  'description answers the seasonal intent using the page’s existing seasonal content',
)
assert.ok(season.desc.length <= 158, 'meta description remains within the selected SERP length budget')
assert.doesNotMatch(season.desc, /latest beach observations|live|updated daily|4x|4×/i, 'description makes no unsupported live or refresh-cadence promise')

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /slug: p\.season\.slug, title: p\.season\.title, desc: p\.season\.desc/, 'regional generator consumes the tested title and description')

console.log('FLORIDA_EN_SEASON_SERP_COPY PASS (route, query intent, freshness wording, length, generator)')

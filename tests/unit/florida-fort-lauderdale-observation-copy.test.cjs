'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const source = JSON.parse(fs.readFileSync(
  path.join(root, 'regions/seo-content/florida.json'),
  'utf8',
))
const page = source.extraPages.find(item => item.slug === 'fort-lauderdale-sargassum-today')

assert.ok(page, 'Fort Lauderdale long-tail route remains present')
assert.equal(page.lang, 'en', 'route remains English')
assert.equal(page.slug, 'fort-lauderdale-sargassum-today', 'public route is unchanged')
assert.equal(page.priority, '0.7', 'SEO priority is preserved')
assert.equal(page.daily, true, 'daily sitemap cadence metadata is preserved')

const copy = [
  page.title,
  page.desc,
  page.h1,
  page.intro,
  ...page.sections.flatMap(section => [section.h2, section.text]),
  ...page.faq.flatMap(item => [item.q, item.a]),
].join('\n')

const unsupportedCadence = [
  /\b(?:4|four)\s*(?:×|x)?\s*(?:times\s+(?:a|per)\s+day|times\s+daily|daily|per day)\b/i,
  /\b(?:refreshed|updated)\s+4\s*(?:×|x)?\s*(?:daily|times\s+(?:a|per)\s+day)\b/i,
  /\bfour\s+times\s+(?:a|per)\s+day\b/i,
]
const unsupportedLiveClaims = [
  /\blive\s+(?:map|status|beach score|satellite)\b/i,
  /\bupdated\s+today\b/i,
  /\brefreshed\s+today\b/i,
  /\bsame-day\s+read\b/i,
  /\bclean\s+right\s+now\b/i,
  /\bnear-certain\s+win\b/i,
  /\bcurrent status today\b/i,
  /\bevery (?:few|three|four) hours\b/i,
]

for (const pattern of unsupportedCadence) {
  assert.doesNotMatch(copy, pattern, 'page must not promise a fixed satellite refresh cadence')
}
for (const pattern of unsupportedLiveClaims) {
  assert.doesNotMatch(copy, pattern, 'page must not imply a continuous/live or guaranteed current reading')
}

assert.match(copy, /latest published observation/i, 'page directs visitors to the latest published observation')
assert.match(copy, /observation time/i, 'page tells visitors to inspect observation time')
assert.match(copy, /confidence/i, 'page tells visitors to inspect confidence')
assert.match(copy, /USF AFAI/i, 'page names the actual AFAI product')
assert.match(copy, /NOAA\/AOML ERDDAP/i, 'page identifies the distribution endpoint')
assert.doesNotMatch(copy, /Copernicus/i, 'page does not claim an unverified Copernicus input')
assert.match(copy, /no fixed refresh schedule is guaranteed/i, 'page explicitly rejects a fixed refresh schedule')
assert.match(copy, /withholds a current verdict/i, 'delayed data cannot support a current verdict')
assert.match(copy, /only when.*pass freshness/i, 'current status is conditional on freshness validation')
assert.match(copy, /7-day outlook appears only when/i, 'forecast is conditional on validated inputs')
assert.match(copy, /days 4–7.*trend, not a guarantee/i, 'longer forecast horizon is described as a trend')
assert.match(copy, /does not measure hydrogen sulfide/i, 'page does not imply an air-quality or H2S sensor')
assert.match(copy, /(?:cannot confirm|does not confirm).*?(?:raked|removed).*sand/i, 'satellite observations are not presented as proof of beach cleanup')

const generator = fs.readFileSync(path.join(root, 'scripts/lib/region-seo-pages.cjs'), 'utf8')
assert.match(generator, /content\.extraPages/, 'regional SEO generator still consumes extraPages')
assert.match(generator, /sm: \{ daily: !!e\.daily, priority: e\.priority \|\| '0\.6' \}/, 'sitemap daily/priority metadata remains driven by the unchanged route fields')
assert.match(generator, /const canonical = `https:\/\/\$\{domain\}\$\{pathname\}`/, 'generated page canonical remains self-referential')

console.log('FLORIDA_FORT_LAUDERDALE_OBSERVATION_COPY PASS (route, cadence, freshness, forecast, H2S, canonical)')

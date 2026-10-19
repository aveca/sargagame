'use strict'
const assert = require('node:assert/strict')
const { enforceRegionHomeSeo } = require('../scripts/lib/region-home-seo.cjs')

const langs = {
  emittedLangs: region => region.id === 'rivieramaya' ? ['es', 'en'] : ['en'],
  langPrefix: (region, lang) => lang === region.primaryLang ? '' : '/' + lang,
}
const source = '<!doctype html><html lang="en"><head>\n' +
  '<link rel="canonical" href="https://sargasses-martinique.com/" />\n' +
  '<link rel="alternate" hreflang="fr" href="https://sargasses-martinique.com/" />\n' +
  '<meta property="og:url" content="https://sargasses-martinique.com/" />\n' +
  '<title>Regional home</title></head><body><a href="https://sargasses-martinique.com/">Network link remains</a></body></html>'

const florida = { id: 'florida', domain: 'sargassummiami.com', primaryLang: 'en' }
const fl = enforceRegionHomeSeo(source, florida, langs)
assert.match(fl, /rel="canonical" href="https:\/\/sargassummiami\.com\/"/)
assert.match(fl, /hreflang="en" href="https:\/\/sargassummiami\.com\/"/)
assert.match(fl, /hreflang="x-default" href="https:\/\/sargassummiami\.com\/"/)
assert.doesNotMatch(fl, /rel="canonical" href="https:\/\/sargasses-martinique\.com/)
assert.match(fl, /<a href="https:\/\/sargasses-martinique\.com\/">Network link remains<\/a>/)

const tulum = { id: 'rivieramaya', domain: 'sargassumcancun.com', primaryLang: 'es' }
const es = enforceRegionHomeSeo(source, tulum, langs)
assert.match(es, /hreflang="es" href="https:\/\/sargassumcancun\.com\/"/)
assert.match(es, /hreflang="en" href="https:\/\/sargassumcancun\.com\/en\/"/)
assert.match(es, /hreflang="x-default" href="https:\/\/sargassumcancun\.com\/"/)
assert.equal((es.match(/rel="canonical"/g) || []).length, 1)
assert.throws(() => enforceRegionHomeSeo(source.replace('Regional home', '\uFFFD'), florida, langs), /U\+FFFD/)
console.log('region-home-seo: assertions passed')

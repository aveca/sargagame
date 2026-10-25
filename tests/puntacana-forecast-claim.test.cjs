const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = path.join(__dirname, '..', 'regions', 'seo-content', 'puntacana.json')
const region = JSON.parse(fs.readFileSync(source, 'utf8'))
const faq = region.faq.find((item) => item.q === 'Can sargassum really be forecast 7 days ahead?')

assert.ok(faq, 'Punta Cana 7-day forecast FAQ must remain available')
assert.doesNotMatch(
  faq.a,
  /only beach-by-beach 7-day sargassum forecast published for Punta Cana/i,
  'Do not make an unverified exclusive-market claim'
)
assert.match(faq.a, /recalculated as new satellite data becomes available/i)
assert.match(faq.a, /measured accuracy openly on the methodology page/i)

console.log('Punta Cana forecast claim: OK')

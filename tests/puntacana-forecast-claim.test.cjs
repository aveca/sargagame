const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = path.join(__dirname, '..', 'regions', 'seo-content', 'puntacana.json')
const region = JSON.parse(fs.readFileSync(source, 'utf8'))
const faq = region.faq.find((item) => item.q === 'Can sargassum really be forecast 7 days ahead?')
const reliabilityFaq = region.faq.find((item) => item.q === 'How reliable is the sargassum data on this site?')
const allContent = JSON.stringify(region)

assert.ok(faq, 'Punta Cana 7-day forecast FAQ must remain available')
assert.doesNotMatch(
  faq.a,
  /only beach-by-beach 7-day sargassum forecast published for Punta Cana/i,
  'Do not make an unverified exclusive-market claim'
)
assert.match(faq.a, /recalculated as new satellite data becomes available/i)
assert.match(faq.a, /measured accuracy openly on the methodology page/i)

assert.ok(reliabilityFaq, 'Punta Cana data reliability FAQ must remain available')
assert.match(reliabilityFaq.a, /community beach reports are not currently used to adjust Punta Cana readings/i)
assert.doesNotMatch(
  allContent,
  /(?:blend in on-the-ground reports from beachgoers|community reports from beachgoers correct the satellite view|combined with reports from people actually standing on the sand)/i,
  'Do not claim community-report corrections for Punta Cana when the data pipeline does not enable them for this region'
)
assert.match(region.pages.forecast.method, /community beach reports are not currently used to adjust Punta Cana readings/i)
assert.match(region.pages.map.intro, /community beach reports are not currently used to adjust Punta Cana readings/i)

console.log('Punta Cana forecast claim: OK')

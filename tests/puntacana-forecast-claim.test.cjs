const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = path.join(__dirname, '..', 'regions', 'seo-content', 'puntacana.json')
const region = JSON.parse(fs.readFileSync(source, 'utf8'))
const faq = region.faq.find((item) => item.q === 'Can sargassum really be forecast 7 days ahead?')
const reliabilityFaq = region.faq.find((item) => item.q === 'How reliable is the sargassum data on this site?')
const allContent = JSON.stringify(region)

assert.doesNotMatch(
  allContent,
  /3\.5-day/i,
  'Do not present an unvalidated 3.5-day beach-persistence half-life as an established fact'
)
assert.match(
  region.pages.forecast.method,
  /persistence is described qualitatively rather than as a measured cleanup time/i,
  'Explain beach persistence cautiously without promising a fixed cleanup time'
)

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


const spanishSource = path.join(__dirname, '..', 'regions', 'seo-content', 'puntacana.es.json')
const spanishRegion = JSON.parse(fs.readFileSync(spanishSource, 'utf8'))
const spanishContent = JSON.stringify(spanishRegion)
const spanishReliabilityFaq = spanishRegion.faq.find((item) => item.q === '¿Qué tan confiables son los datos de sargazo de este sitio?')
const spanishForecastFaq = spanishRegion.faq.find((item) => item.q === '¿De verdad se puede pronosticar el sargazo con 7 días de anticipación?')

assert.ok(spanishReliabilityFaq, 'Spanish Punta Cana reliability FAQ must remain available')
assert.ok(spanishForecastFaq, 'Spanish Punta Cana forecast FAQ must remain available')
assert.match(spanishReliabilityFaq.a, /los reportes comunitarios de playa no se utilizan actualmente para ajustar las lecturas de Punta Cana/i)
assert.match(spanishRegion.pages.forecast.method, /los reportes comunitarios no se utilizan actualmente para ajustar las lecturas de Punta Cana/i)
assert.match(spanishRegion.pages.map.intro, /los reportes comunitarios no se utilizan actualmente para ajustar las lecturas de Punta Cana/i)
assert.doesNotMatch(
  spanishContent,
  /reportes de bañistas en la playa|reportes de la comunidad corrigen la vista satelital|reportes de gente que está parada en la arena|vida media de (?:unos )?3\.5 días|único pronóstico de sargazo a 7 días playa por playa publicado para Punta Cana/i,
  'Spanish Punta Cana copy must not claim community-report corrections, unvalidated beach half-life, or unverified forecast exclusivity'
)

console.log('Punta Cana forecast claim: OK')

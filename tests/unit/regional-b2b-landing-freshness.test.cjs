'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const pages = [
  {
    path: 'public/pro/en/sargassum-forecast-miami-hotels/index.html',
    endpoint: '/api/copernicus/florida/sargassum.json',
    region: 'florida',
    locale: 'en',
    canonical: 'https://sargasses-martinique.com/pro/en/sargassum-forecast-miami-hotels/',
    alternates: ['hreflang="en"', 'hreflang="x-default"'],
    demo: true,
    destination: 'https://sargassummiami.com'
  },
  {
    path: 'public/pro/en/sargassum-forecast-cancun-hotels/index.html',
    endpoint: '/api/copernicus/rivieramaya/sargassum.json',
    region: 'rivieramaya',
    locale: 'en',
    canonical: 'https://sargasses-martinique.com/pro/en/sargassum-forecast-cancun-hotels/',
    alternates: ['hreflang="en"', 'hreflang="es"', 'hreflang="x-default"'],
    demo: false,
    destination: 'https://sargassumcancun.com'
  },
  {
    path: 'public/pro/en/sargassum-forecast-punta-cana-hotels/index.html',
    endpoint: '/api/copernicus/puntacana/sargassum.json',
    region: 'puntacana',
    locale: 'en',
    canonical: 'https://sargasses-martinique.com/pro/en/sargassum-forecast-punta-cana-hotels/',
    alternates: ['hreflang="en"', 'hreflang="es"', 'hreflang="x-default"'],
    demo: true,
    destination: 'https://sargassumpuntacana.com'
  },
  {
    path: 'public/pro/es/pronostico-sargazo-cancun-hoteles/index.html',
    endpoint: '/api/copernicus/rivieramaya/sargassum.json',
    region: 'rivieramaya',
    locale: 'es',
    canonical: 'https://sargasses-martinique.com/pro/es/pronostico-sargazo-cancun-hoteles/',
    alternates: ['hreflang="en"', 'hreflang="es"', 'hreflang="x-default"'],
    demo: true,
    destination: 'https://sargassumcancun.com'
  },
  {
    path: 'public/pro/es/pronostico-sargazo-punta-cana-hoteles/index.html',
    endpoint: '/api/copernicus/puntacana/sargassum.json',
    region: 'puntacana',
    locale: 'es',
    canonical: 'https://sargasses-martinique.com/pro/es/pronostico-sargazo-punta-cana-hoteles/',
    alternates: ['hreflang="en"', 'hreflang="es"', 'hreflang="x-default"'],
    demo: false,
    destination: 'https://sargassumpuntacana.com'
  }
]

for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page.path), 'utf8')
  assert.ok(html.includes('<script src="/b2b-data-freshness.js"></script>'), page.path + ': shared freshness helper missing')
  assert.ok(html.includes("window.SargagameB2BFreshness.getObservationFreshness(data, '" + page.locale + "')"), page.path + ': locale helper not wired')
  assert.ok(html.includes('class="freshpill is-unknown" id="freshpill"'), page.path + ': pill must start unknown')
  assert.ok(html.includes('.freshpill.is-stale .pulse') && html.includes('.freshpill.is-unknown .pulse'), page.path + ': stale/unknown visual states missing')
  assert.ok(html.includes("getObservationFreshness(d)"), page.path + ': API response not checked through shared helper')
  assert.ok(html.includes("fetch('" + page.endpoint + "')"), page.path + ': wrong regional observation endpoint')
  assert.ok(html.includes("getTrackRecordState(d, TRACK_RECORD_REGION)"), page.path + ': track record must use the shared freshness contract')
  assert.ok(html.includes("var TRACK_RECORD_REGION = '" + page.region + "'"), page.path + ': track record must be scoped to its regional market')
  assert.ok(html.includes('b.island === TRACK_RECORD_REGION'), page.path + ': track record beach rows must be region-filtered')
  assert.ok(html.includes('d.byRegion && d.byRegion[TRACK_RECORD_REGION]'), page.path + ': only an explicit regional aggregate may populate the headline percentage')
  assert.ok(!html.includes('d.overall.statusHitRatePct'), page.path + ': global hit rate must not be presented as this market\'s accuracy')
  assert.ok(html.includes('NOAA/AOML Atlantic OceanWatch'), page.path + ': satellite source attribution must match the NOAA/AOML ERDDAP dataset')
  assert.doesNotMatch(html, /Copernicus\s*\/\s*ERDDAP|Copernicus satellite data|Datos Copernicus|datos satelitales Copernicus/i, page.path + ': incorrect Copernicus source attribution remains')
  assert.doesNotMatch(html, /(?:~\s*)?76\s*%/i, page.path + ': unsupported 76% reliability claim remains')
  assert.doesNotMatch(html, /reliability published and audited daily|reliability figure[^<]{0,120}audit(?:ed)? (?:every day|daily)|fiabilidad[^<]{0,160}auditada (?:cada día|a diario)|fiabilidad[^<]{0,160}auditamos cada día/i, page.path + ': unsupported daily-audit claim remains')
  assert.ok(html.includes(page.locale === 'es' ? 'No hay un historial de fiabilidad vigente' : 'No current, region-specific reliability record'), page.path + ': localized no-record fallback missing')
  assert.ok(!html.includes("fetch('/api/copernicus/sargassum.json')"), page.path + ': must not use the Martinique root payload for another market')
  assert.ok(!html.includes('relTime(d.updatedAt)'), page.path + ': updatedAt must not drive freshness')
  assert.ok(!/refreshed 4× a day|actualizados 4× al día|actualizados varias veces al día/i.test(html), page.path + ': unsupported fixed cadence remains')
  assert.ok(!/live-conditions badge|condiciones en vivo|real state of every monitored beach, right now|real state of your beachfront|estado real de su frente de mar|en vivo ahora/i.test(html), page.path + ': unsupported current-status copy remains')
  assert.ok(/latest published satellite observation|última observación satelital publicada/i.test(html), page.path + ': transparent observation wording missing')
  assert.ok(html.includes('href="' + page.canonical + '"'), page.path + ': canonical changed or missing')
  for (const alternate of page.alternates) assert.ok(html.includes(alternate), page.path + ': missing ' + alternate)
  assert.ok(html.includes(page.destination), page.path + ': regional map destination changed')
  assert.ok(html.includes('id="b2b-form"'), page.path + ': B2B lead form missing')

  if (page.demo) {
    assert.ok(html.includes("freshness.status === 'fresh'"), page.path + ': verdict is not freshness-gated')
    assert.ok(html.includes(page.locale === 'es' ? 'ESTADO NO DISPONIBLE' : 'STATUS WITHHELD'), page.path + ': withheld state missing')
    assert.ok(html.includes('decisionValid && pick.score'), page.path + ': score is not freshness-gated')
  }
}

console.log('REGIONAL_B2B_LANDING_FRESHNESS_TESTS PASS (' + pages.length + ' pages)')

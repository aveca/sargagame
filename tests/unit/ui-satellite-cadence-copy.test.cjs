'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const files = [
  'src/PremiumModal.jsx',
  'src/PassOffer.jsx',
  'src/PaidOnboarding.jsx',
  'src/WelcomePoste.jsx',
  'src/ArenaOnboarding.jsx',
  'src/BeachSheet.jsx',
  'public/a-propos/index.html',
  'public/404.html',
  'public/weekend.html',
  'scripts/lib/localize-404.cjs',
  'scripts/automation/B2B_OFFER.md',
  'src/WorldMapView.jsx',
  'src/WeekHub.jsx',
  'src/StoryScenes.jsx',
  'public/pro/es/plan-sargazo-municipios/index.html',
  'public/for-hotels/index.html',
  'public/jeu/index.html',
  'scripts/automation/welcome-email.cjs',
  'scripts/automation/email-weekend.cjs',
  'regions/seo-content/puntacana.json',
  'regions/seo-content/puntacana.es.json',
  'regions/seo-content/florida.json',
  'regions/seo-content/florida.es.json',
  'regions/seo-content/rivieramaya.json',
  'regions/seo-content/rivieramaya.en.json',
  'regions/seo-content/tulum.json',
  'regions/seo-content/tulum.en.json',
  'regions/tulum.json',
  'regions/rivieramaya.json',
]
const unsupportedCadence = [
  /(?:4×|4x)\s*(?:daily|a day|per day|\/\s*day|al\s+d[ií]a|\/\s*d[ií]a|par\s+jour|\/\s*jour)/i,
  /\b(?:four|4)\s+times\s+(?:a|per)\s+day\b/i,
  /\b(?:cuatro|4)\s+veces\s+al\s+d[ií]a\b/i,
]
for (const relativePath of files) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
  // Strip comments so execution-frequency documentation (e.g. a job running 4x/day)
  // is not confused with a customer-facing promise about satellite observations.
  const customerCopy = relativePath.endsWith('.cjs')
    ? source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    : source
  for (const pattern of unsupportedCadence) {
    assert.doesNotMatch(customerCopy, pattern, `${relativePath} must not promise a fixed satellite-observation cadence`)
  }
  assert.doesNotMatch(customerCopy, /3\.5-day\s+(?:persistence\s+)?half-life|vida media de 3[,.]5 días|semivida de 3[,.]5 días|demi-vie de 3[,.]5 jours/i,
    `${relativePath} must not publish an unsupported fixed half-life for beached material`)
  assert.doesNotMatch(customerCopy, /Copernicus and NOAA satellites|Copernicus\/NOAA AFAI|Copernicus satellite imagery|satélites de Copernicus y la NOAA/i,
    `${relativePath} must identify NOAA/AOML ERDDAP as the AFAI distribution source`)
}
const worldMap = fs.readFileSync(path.join(ROOT, 'src/WorldMapView.jsx'), 'utf8')
const weekHub = fs.readFileSync(path.join(ROOT, 'src/WeekHub.jsx'), 'utf8')
const storyScenes = fs.readFileSync(path.join(ROOT, 'src/StoryScenes.jsx'), 'utf8')
const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.js'), 'utf8')
const municipality = fs.readFileSync(path.join(ROOT, 'public/pro/es/plan-sargazo-municipios/index.html'), 'utf8')
assert.doesNotMatch(worldMap + weekHub + storyScenes, /76\s*[-–]\s*79\s*%/i,
  'the UI must not hard-code a regional accuracy percentage')
assert.doesNotMatch(storyScenes, /__REL[^\n]*:\s*79\b/,
  'StoryScenes must not fall back to a hard-coded 79%')
assert.ok(viteConfig.includes('resolvePublicAccuracy') && viteConfig.includes('track-record.json'),
  'Vite must derive accuracy from the fresh, region-scoped public track record')
assert.ok(weekHub.includes('d?.freshness?.stale === false') && weekHub.includes('d.regions.includes(regionId)'),
  'WeekHub must require a fresh record that covers the current region')
assert.ok(municipality.includes('d.freshness.stale===false') && municipality.includes("scope.includes('mq') && scope.includes('gp')"),
  'the municipal page must require a fresh MQ+GP record')
assert.doesNotMatch(municipality, /d\.overall\.statusHitRatePct/,
  'the municipal page must not fall back to an unscoped global accuracy rate')

const about = fs.readFileSync(path.join(ROOT, 'public/a-propos/index.html'), 'utf8')
assert.ok(about.includes('NOAA/AOML ERDDAP'), 'About page must identify the verified AFAI distribution source')
assert.ok(about.includes('USF Optical Oceanography Laboratory'), 'About page must identify the source laboratory')
assert.doesNotMatch(about, /MODIS|Résolution 1 km|Copernicus \(ESA\)/i, 'About page must not publish unsupported AFAI sensor or resolution attribution')

console.log('PASS: 29 product, regional SEO and outbound surfaces use source-scoped freshness and validation language')

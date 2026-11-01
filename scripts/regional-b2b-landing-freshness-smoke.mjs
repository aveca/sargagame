import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = '/tmp/regional-b2b-landing-freshness'
const pages = [
  { path: '/pro/en/sargassum-forecast-miami-hotels/', endpoint: '/api/copernicus/florida/sargassum.json', locale: 'en', region: 'florida', demo: true },
  { path: '/pro/en/sargassum-forecast-cancun-hotels/', endpoint: '/api/copernicus/rivieramaya/sargassum.json', locale: 'en', region: 'rivieramaya', demo: false },
  { path: '/pro/en/sargassum-forecast-punta-cana-hotels/', endpoint: '/api/copernicus/puntacana/sargassum.json', locale: 'en', region: 'puntacana', demo: true },
  { path: '/pro/es/pronostico-sargazo-cancun-hoteles/', endpoint: '/api/copernicus/rivieramaya/sargassum.json', locale: 'es', region: 'rivieramaya', demo: true },
  { path: '/pro/es/pronostico-sargazo-punta-cana-hoteles/', endpoint: '/api/copernicus/puntacana/sargassum.json', locale: 'es', region: 'puntacana', demo: false }
]
const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
]


function publicTrackRecordSnapshot() {
  return {
    generatedAt: '2026-10-28T17:29:56.731Z',
    freshness: { stale: false },
    regions: ['mq', 'gp'],
    window: { from: '2026-10-08', to: '2026-10-28' },
    sampleSize: 2205,
    overall: { statusHitRatePct: 99 },
    byBeach: [{ id: 'anse-mitan', name: 'Anse Mitan', island: 'mq', samples: 105, hitRatePct: 100 }]
  }
}
function regionalTrackRecord(region, stale = false) {
  const now = Date.now()
  return {
    generatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    freshness: { stale },
    regions: [region],
    window: { from: '2026-10-01', to: '2026-11-01' },
    sampleSize: 40,
    byRegion: { [region]: { statusHitRatePct: 90 } },
    byBeach: [
      { id: 'mq-control', name: 'French Antilles control', island: 'mq', samples: 105, hitRatePct: 99 },
      { id: 'region-low', name: 'Regional demo beach — lower', island: region, samples: 20, hitRatePct: 88 },
      { id: 'region-high', name: 'Regional demo beach — higher', island: region, samples: 20, hitRatePct: 92 }
    ]
  }
}
async function waitForTrackRecord(page, available) {
  await page.waitForFunction(expected => {
    const table = document.getElementById('tr-table')
    const headline = document.getElementById('tr-headline')
    if (!table || !headline) return false
    if (expected) return !table.hidden
    return table.hidden && !/Checking|Comprobando/.test(headline.textContent)
  }, available, { timeout: 10000 })
}
async function assertTrackRecordWithheld(page, locale) {
  assert.equal((await page.locator('#tr-clean').textContent()).trim(), '—')
  assert.equal(await page.locator('#tr-table').isVisible(), false)
  const headline = (await page.locator('#tr-headline').textContent()).trim()
  assert.match(headline, locale === 'es' ? /No hay un historial de fiabilidad vigente/ : /No current, region-specific reliability record/)
}
function observationPayload(ageHours, source = 'erddap-live') {
  const now = Date.now()
  return {
    source,
    updatedAt: new Date(now).toISOString(),
    erddapTimestamp: new Date(now - ageHours * 60 * 60 * 1000).toISOString(),
    dataAgeMinutes: 1,
    stale: false,
    levels: [{ id: 'demo-beach', status: 'clean', score: 92 }]
  }
}

async function waitForPill(page, state) {
  await page.waitForFunction(expected => {
    const pill = document.getElementById('freshpill')
    if (!pill) return false
    if (expected === 'stale') return pill.classList.contains('is-stale')
    if (expected === 'unknown') return pill.classList.contains('is-unknown')
    return !pill.classList.contains('is-stale') && !pill.classList.contains('is-unknown')
  }, state, { timeout: 10000 })
}

async function assertWithheld(page, locale) {
  const verdict = (await page.locator('#d-verdict').textContent()).trim()
  assert.equal(verdict, locale === 'es' ? 'ESTADO NO DISPONIBLE' : 'STATUS WITHHELD')
  assert.equal((await page.locator('#d-score').textContent()).trim(), '')
}

await fs.mkdir(outputDir, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const item of pages) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      let currentPayload = observationPayload(48)
      let currentTrackRecord = publicTrackRecordSnapshot()

      let observedEndpoint = null
      await page.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/copernicus/') && url.pathname.endsWith('/sargassum.json')) observedEndpoint = url.pathname
      })
      await page.route('**' + item.endpoint, route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentPayload) })
      )
      await page.route('**/api/copernicus/sargassum.json', route =>
        route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'wrong regional endpoint' }) })
      )
      await page.route('**/api/copernicus/track-record.json', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentTrackRecord) })
      )

      await page.goto(baseUrl + item.path, { waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'stale')
      await waitForTrackRecord(page, false)
      await assertTrackRecordWithheld(page, item.locale)
      assert.equal(observedEndpoint, item.endpoint, item.path + ': page fetched the wrong regional payload')
      if (item.demo) await assertWithheld(page, item.locale)
      const slug = item.path.replaceAll('/', '-').replace(/^-|-$/g, '')
      const size = viewport.width + 'x' + viewport.height
      await page.screenshot({ path: path.join(outputDir, slug + '-' + size + '-stale.png'), fullPage: true })

      currentTrackRecord = regionalTrackRecord(item.region, false)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'stale')
      await waitForTrackRecord(page, true)
      assert.equal((await page.locator('#tr-clean').textContent()).trim(), '90%')
      assert.equal(await page.locator('#tr-body tr').count(), 2)
      assert.equal((await page.locator('#tr-body tr:first-child td:first-child').textContent()).trim(), 'Regional demo beach — lower')
      assert.equal((await page.locator('#tr-body').textContent()).includes('French Antilles control'), false)

      currentTrackRecord = regionalTrackRecord(item.region, true)
      currentPayload = observationPayload(2)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'fresh')
      await waitForTrackRecord(page, false)
      await assertTrackRecordWithheld(page, item.locale)
      if (item.demo) {
        const verdict = (await page.locator('#d-verdict').textContent()).trim()
        assert.ok(verdict && verdict !== 'STATUS WITHHELD' && verdict !== 'ESTADO NO DISPONIBLE', item.path + ': fresh verdict missing')
        assert.match((await page.locator('#d-score').textContent()).trim(), /92\/100/, item.path + ': fresh score missing')
      }
      await page.screenshot({ path: path.join(outputDir, slug + '-' + size + '-fresh.png'), fullPage: true })

      currentPayload = observationPayload(2, 'reference')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'unknown')
      await waitForTrackRecord(page, false)
      await assertTrackRecordWithheld(page, item.locale)
      if (item.demo) await assertWithheld(page, item.locale)

      await context.close()
      console.log('PASS ' + item.path + ' @ ' + size + ' (stale/fresh/non-LIVE)')
    }
  }
} finally {
  await browser.close()
}
console.log('REGIONAL_B2B_LANDING_FRESHNESS_BROWSER_PASS (' + pages.length + ' pages × ' + viewports.length + ' viewports)')

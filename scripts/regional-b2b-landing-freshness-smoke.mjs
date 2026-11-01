import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:4173'
const outputDir = '/tmp/regional-b2b-landing-freshness'
const pages = [
  { path: '/pro/en/sargassum-forecast-miami-hotels/', locale: 'en', demo: true },
  { path: '/pro/en/sargassum-forecast-cancun-hotels/', locale: 'en', demo: false },
  { path: '/pro/en/sargassum-forecast-punta-cana-hotels/', locale: 'en', demo: true },
  { path: '/pro/es/pronostico-sargazo-cancun-hoteles/', locale: 'es', demo: true },
  { path: '/pro/es/pronostico-sargazo-punta-cana-hoteles/', locale: 'es', demo: false }
]
const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 }
]

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

      await page.route('**/api/copernicus/sargassum.json', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(currentPayload) })
      )
      await page.route('**/api/copernicus/track-record.json', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
      )

      await page.goto(baseUrl + item.path, { waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'stale')
      if (item.demo) await assertWithheld(page, item.locale)
      const slug = item.path.replaceAll('/', '-').replace(/^-|-$/g, '')
      const size = viewport.width + 'x' + viewport.height
      await page.screenshot({ path: path.join(outputDir, slug + '-' + size + '-stale.png'), fullPage: true })

      currentPayload = observationPayload(2)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'fresh')
      if (item.demo) {
        const verdict = (await page.locator('#d-verdict').textContent()).trim()
        assert.ok(verdict && verdict !== 'STATUS WITHHELD' && verdict !== 'ESTADO NO DISPONIBLE', item.path + ': fresh verdict missing')
        assert.match((await page.locator('#d-score').textContent()).trim(), /92\/100/, item.path + ': fresh score missing')
      }
      await page.screenshot({ path: path.join(outputDir, slug + '-' + size + '-fresh.png'), fullPage: true })

      currentPayload = observationPayload(2, 'reference')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPill(page, 'unknown')
      if (item.demo) await assertWithheld(page, item.locale)

      await context.close()
      console.log('PASS ' + item.path + ' @ ' + size + ' (stale/fresh/non-LIVE)')
    }
  }
} finally {
  await browser.close()
}
console.log('REGIONAL_B2B_LANDING_FRESHNESS_BROWSER_PASS (' + pages.length + ' pages × ' + viewports.length + ' viewports)')

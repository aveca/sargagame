'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require('playwright')

const ORIGIN = process.env.SMOKE_BASE || 'http://127.0.0.1:4173'
const OUT = '/tmp/beach-sheet-fallback-freshness'
const PATH = '/plages/anse-caritan/?beachfallback=1'

async function openState(browser, ageHours, viewport, label) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  let intercepted = false

  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('sg_hero_seen', '1')
      localStorage.setItem('sg_map_intro_v1', '1')
      localStorage.setItem('sg_island', 'mq')
    } catch (_) {}
  })

  await page.route('**/api/copernicus/sargassum.json*', async route => {
    const response = await route.fetch()
    const payload = await response.json()
    const now = Date.now()
    payload.source = 'erddap-live'
    payload.stale = false
    payload.erddapTimestamp = new Date(now - ageHours * 3600000).toISOString()
    payload.updatedAt = new Date(now - 60000).toISOString()
    payload.dataAgeMinutes = 1
    intercepted = true
    await route.fulfill({ response, body: JSON.stringify(payload) })
  })

  await page.goto(ORIGIN + PATH, { waitUntil: 'domcontentloaded', timeout: 25000 })
  const selector = '[data-testid="beach-sheet-fallback-current"], [data-testid="beach-sheet-fallback-stale"]'
  await page.waitForSelector(selector, { timeout: 25000 })
  await page.waitForTimeout(350)

  assert.equal(intercepted, true, 'satellite API fixture must be intercepted')
  assert.deepEqual(errors, [], 'no browser runtime errors')
  const stale = ageHours >= 12
  if (stale) {
    assert.equal(await page.locator('[data-testid="beach-sheet-fallback-stale"]').count(), 1,
      'stale observation must render the fail-closed fallback')
    assert.equal(await page.locator('[data-testid="beach-sheet-fallback-current"]').count(), 0,
      'stale observation must not render the normal decision UI')
    const freshness = await page.locator('[data-testid="beach-sheet-fallback-freshness"]').innerText()
    assert.match(freshness, /historique, pas un verdict actuel/,
      'the real observation age must be shown instead of the recent updatedAt')
    assert.match(await page.locator('[data-testid="beach-sheet-fallback-verdict"]').innerText(), /À VÉRIFIER/,
      'stale fallback must not show a clean/moderate/avoid verdict')
    assert.match(await page.locator('[data-testid="beach-sheet-fallback-score-paused"]').innerText(), /score.*suspendus/i,
      'score and forecast must be explicitly paused')
  } else {
    assert.equal(await page.locator('[data-testid="beach-sheet-fallback-current"]').count(), 1,
      'fresh observation must preserve the normal fallback')
    assert.equal(await page.locator('[data-testid="beach-sheet-fallback-stale"]').count(), 0,
      'fresh observation must not show the stale fallback')
  }

  await page.screenshot({
    path: OUT + '/' + label + '-' + viewport.width + 'x' + viewport.height + '.png',
    fullPage: true
  })

  if (stale) {
    await page.locator('[data-testid="beach-sheet-fallback-close"]').click()
    await page.waitForFunction(() => !document.querySelector('[data-testid="beach-sheet-fallback-stale"]'), null, { timeout: 5000 })
  }
  await context.close()
  console.log('[' + label + ' ' + viewport.width + 'x' + viewport.height + '] PASS')
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await openState(browser, 1, viewport, 'fresh-before')
    await openState(browser, 48, viewport, 'stale-after')
  }
  await browser.close()
  console.log('BEACH_SHEET_FALLBACK_FRESHNESS_SMOKE PASS')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})

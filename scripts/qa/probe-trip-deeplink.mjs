/* probe-trip-deeplink.mjs — prouve que /?trip=1 ouvre le TripPlanner
   (tunnel ACQUISITION → PLAN, 2026-09-25C). Preview only, lecture seule. */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
await p.goto(BASE + '/?trip=1', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(4000)
const trip = await p.evaluate(() => {
  const el = [...document.querySelectorAll('[role="dialog"]')].find(d => /séjour|estancia|stay/i.test(d.getAttribute('aria-label') || ''))
    || document.querySelector('[data-testid="trip-stay-strip"]')
  return el ? el.outerHTML.slice(0, 220) : null
})
console.log('TRIP_OPEN', trip ? 'YES' : 'NO')
if (!trip) { process.exit(1) }
await b.close()

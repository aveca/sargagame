/* probe-perfect-trip-shots.mjs — 2 captures QA visuelles (home + snorkel). */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="plan-card"]', { timeout: 20000 })
await p.waitForTimeout(1200)
await p.screenshot({ path: process.env.TEMP + '\\pt-home.png' })
await p.locator('[data-testid="intent-snorkel"]').evaluate(el => el.click())
await p.waitForTimeout(1000)
await p.screenshot({ path: process.env.TEMP + '\\pt-snorkel.png' })
console.log('SHOTS_OK', process.env.TEMP + '\\pt-home.png', process.env.TEMP + '\\pt-snorkel.png')
await b.close()

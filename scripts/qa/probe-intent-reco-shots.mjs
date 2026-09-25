/* probe-intent-reco-shots.mjs — 2 captures: home + intent selected (reco strip). */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 })
await p.waitForTimeout(2000)
await p.locator('[data-testid="intent-snorkel"]').evaluate(el => el.click())
await p.waitForTimeout(1300)
await p.evaluate(() => { const el = document.querySelector('[data-testid="intent-reco"]'); el && el.scrollIntoView({ block: 'start' }) })
await p.waitForTimeout(600)
await p.screenshot({ path: process.env.TEMP + '\\pt-reco.png' })
console.log('reco exists:', await p.locator('[data-testid="intent-reco"]').count())
await b.close()

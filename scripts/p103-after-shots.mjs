import { chromium, devices } from 'playwright'
import fs from 'node:fs'
const OUT = 'tests/ux-recordings/p1-03-after'
fs.mkdirSync(OUT, { recursive: true })
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['iPhone 12'], serviceWorkers: 'block' })
const p = await ctx.newPage()
// 1) preview fiche strip (SVG locks)
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.waitForSelector('.sg-maplabel', { state: 'attached', timeout: 45000 })
await p.locator('.sg-maplabel[role="button"]').first().click({ force: true })
await p.waitForTimeout(2500)
await p.locator('.lc-detail-fc-row').first().scrollIntoViewIfNeeded().catch(() => {})
await p.waitForTimeout(600)
await p.screenshot({ path: OUT + '/AFTER-preview-fcstrip.png' })
// 2) click strip → paywall
await p.locator('.lc-detail-fc-row').first().click({ force: true })
await p.waitForTimeout(2000)
await p.screenshot({ path: OUT + '/AFTER-preview-lock-paywall.png' })
// 3) /previsions/ landing + lock + beat
await p.goto(BASE + '/previsions/?prev_az=1', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.waitForTimeout(8000)
await p.locator('.fc-bar').first().scrollIntoViewIfNeeded().catch(() => {})
await p.waitForTimeout(700)
await p.screenshot({ path: OUT + '/AFTER-previsions-chart-lock.png' })
const lock = p.locator('div[role="button"][tabindex="0"][aria-label*="prévision"]').first()
if (await lock.isVisible().catch(() => false)) {
  await lock.click({ position: { x: 40, y: 40 } })
  await p.waitForTimeout(1200)
  await p.screenshot({ path: OUT + '/AFTER-previsions-beat.png' })
  console.log('beat visible:', await p.locator('.pw-beat-in').isVisible())
}
await b.close()
console.log('AFTER screenshots OK →', OUT)

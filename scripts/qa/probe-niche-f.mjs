/* probe-niche-f.mjs — captures F : reco-why, MER marine, savoir-sources.
   Usage : node scripts/qa/probe-niche-f.mjs (preview 4173 requis) */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = fs.mkdtempSync(os.tmpdir() + '\\sg-nichef-')
console.log('OUT', OUT)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 120)))
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
await p.getByRole('button', { name: /Refuser/i }).click().catch(() => {})
await p.waitForTimeout(1000)

// intent snorkel → reco + why
await p.locator('[data-testid="intent-snorkel"]').first().click().catch(() => {})
await p.waitForTimeout(1200)
await p.evaluate(() => window.scrollTo(0, 1100)).catch(() => {})
await p.waitForTimeout(600)
await p.screenshot({ path: OUT + '/reco-why.png' })

// ouvrir la reco → experience → MER + savoir
await p.locator('[data-testid="intent-reco-open"]').first().click().catch(() => {})
await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(1200)
for (const id of ['bx-mer', 'bx-savoir']) {
  await p.evaluate((sel) => {
    const el = document.getElementById(sel)
    if (el) { el.scrollIntoView({ block: 'start' }); el.querySelector('button')?.click() }
  }, id).catch(() => {})
  await p.waitForTimeout(2500)
  await p.screenshot({ path: OUT + `/${id}.png` }).catch(() => {})
}
console.log('ERRORS=' + JSON.stringify(errs))
await b.close()
console.log('DONE', OUT)

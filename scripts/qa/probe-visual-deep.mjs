/* probe-visual-deep.mjs — captures E : surfaces SCROLLÉES après dismiss cookies.
   Usage : PREVIEW_URL=http://localhost:4173 node scripts/qa/probe-visual-deep.mjs */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = fs.mkdtempSync(os.tmpdir() + '\\sg-deep-')
console.log('OUT', OUT)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
// cookies : refuser pour dégager la vue
await p.getByRole('button', { name: /Refuser/i }).click().catch(() => {})
await p.waitForTimeout(1200)

// 1. home : focus + plan (scroll médian)
await p.evaluate(() => window.scrollTo(0, 900))
await p.waitForTimeout(900)
await p.screenshot({ path: OUT + '/home-focus.png' })
// 2. home : plan du jour + pourquoi
await p.evaluate(() => window.scrollTo(0, 1900))
await p.waitForTimeout(700)
await p.screenshot({ path: OUT + '/home-plan.png' })
// ouvrir le details pourquoi s'il existe
await p.locator('[data-testid="plan-why"] summary').first().click().catch(() => {})
await p.waitForTimeout(400)
await p.screenshot({ path: OUT + '/home-plan-why.png' })

// 3. liste plages (photos BeachCard)
await p.locator('[data-testid="xp-all"]').first().click().catch(() => {})
await p.waitForSelector('[data-testid="xp-plages"]', { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(1000)
await p.screenshot({ path: OUT + '/plages-list.png' })

// 4. experience : ouvrir 1re carte
await p.locator('[data-testid="xp-open"]').first().click().catch(() => {})
await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 }).catch(() => {})
await p.waitForTimeout(1400)
await p.screenshot({ path: OUT + '/bx-hero.png' })
// scroll vers savoir/prox/faq
for (const id of ['bx-savoir', 'bx-prox', 'bx-faq']) {
  await p.evaluate((sel) => {
    const el = document.getElementById(sel)
    if (el) { el.scrollIntoView({ block: 'start' }); el.querySelector('button')?.click() }
  }, id).catch(() => {})
  await p.waitForTimeout(600)
  await p.screenshot({ path: OUT + `/${id}.png` }).catch(() => {})
}

// 5. trip planner
await p.goto(BASE + '/?trip=1', { waitUntil: 'load', timeout: 60000 }).catch(() => {})
await p.waitForTimeout(2000)
await p.screenshot({ path: OUT + '/trip.png' })

const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 100)))
console.log('ERRORS_CHECK done')
await b.close()
console.log('DONE', OUT)

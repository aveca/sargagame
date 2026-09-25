/* probe-cine-i.mjs — QA visuelle I : hero ciné, facteurs, compare, séquence, trip.
   Usage : node scripts/qa/probe-cine-i.mjs (preview 4173 requis) */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = fs.mkdtempSync(os.tmpdir() + '\\sg-cine-')
console.log('OUT', OUT)

const shots = async (width, tag) => {
  const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width < 768, hasTouch: width < 768 })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)))
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
  await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
  await p.getByRole('button', { name: /Refuser/i }).click().catch(() => {})
  await p.waitForTimeout(1500)
  const cine = await p.locator('[data-testid="cine-hero"]').count()
  console.log(tag, 'cine-hero:', cine)
  await p.screenshot({ path: OUT + `/home-${tag}.png` })
  // compare : 2 favoris → compare sheet
  await p.locator('[data-testid="xp-all"]').first().click().catch(() => {})
  await p.waitForSelector('[data-testid="xp-plages"]', { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(800)
  const cards = p.locator('[data-testid="xp-beach-card"]')
  const n = Math.min(2, await cards.count())
  for (let i = 0; i < n; i++) {
    await cards.nth(i).locator('button[title="comparer"]').click().catch(() => {})
    await p.waitForTimeout(300)
  }
  await p.screenshot({ path: OUT + `/compare-${tag}.png` })
  const synth = await p.locator('[data-testid="xp-compare-synth"]').count().catch(() => 0)
  console.log(tag, 'compare-synth:', synth)
  console.log(tag, 'ERRORS=' + JSON.stringify(errs))
  await ctx.close()
}

const b = await chromium.launch()
await shots(390, '390')
await shots(1440, '1440')
await b.close()
console.log('DONE', OUT)

/* probe-photo-h2.mjs — QA visuelle H via recherche UI (cross-island safe). */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = fs.mkdtempSync(os.tmpdir() + '\\sg-photoh2-')
console.log('OUT', OUT)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 120)))
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
await p.getByRole('button', { name: /Refuser/i }).click().catch(() => {})
await p.waitForTimeout(800)

for (const [q, tag] of [['Deshaies', 'gp024'], ['Clugny', 'gp027'], ['Desirade', 'gp119']]) {
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 }).catch(() => {})
  await p.waitForSelector('[data-testid="xp-home"]', { timeout: 25000 }).catch(() => {})
  await p.locator('[data-testid="xp-all"]').first().click().catch(() => {})
  await p.waitForSelector('[data-testid="xp-plages"]', { timeout: 15000 }).catch(() => {})
  await p.locator('[data-testid="xp-plages-search"]').first().fill(q).catch(() => {})
  await p.waitForTimeout(900)
  await p.locator(`[data-beach="${tag}"] [data-testid="xp-open"]`).first().click().catch(() => {})
  await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(1800)
  const hasPhoto = await p.evaluate(() => !!document.querySelector('img.bx-media-img'))
  const heroName = await p.evaluate(() => document.querySelector('.bx-name')?.textContent || 'NONE')
  console.log(tag, 'beach:', heroName, '| hero-photo:', hasPhoto)
  await p.screenshot({ path: OUT + `/bx-${tag}.png` })
}
console.log('ERRORS=' + JSON.stringify(errs))
await b.close()
console.log('DONE', OUT)

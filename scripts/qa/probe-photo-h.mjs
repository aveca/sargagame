/* probe-photo-h.mjs — QA visuelle H : quarantine (scene fallback) + upgrade gp027.
   Usage : node scripts/qa/probe-photo-h.mjs (preview 4173 requis) */
import { chromium } from 'playwright'
import fs from 'fs'
import os from 'os'

const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = fs.mkdtempSync(os.tmpdir() + '\\sg-photoh-')
console.log('OUT', OUT)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(String(e).slice(0, 120)))

for (const id of ['gp119', 'gp027', 'gp024']) {
  await p.goto(BASE + `/?exp=${id}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {})
  await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const hasPhoto = await p.evaluate(() => !!document.querySelector('img.bx-media-img'))
  console.log(id, 'hero-photo:', hasPhoto)
  await p.screenshot({ path: OUT + `/bx-${id}.png` })
}
console.log('ERRORS=' + JSON.stringify(errs))
await b.close()
console.log('DONE', OUT)

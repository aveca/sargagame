/* probe-perfect-trip-prod.mjs — QA prod post-deploy 2026-09-24B :
   la Home live montre les 5 intentions + Plan du jour (données réelles).
   LECTURE SEULE contre la prod. */
import { chromium } from 'playwright'
const BASE = process.env.PROD_BASE || 'https://sargasses-martinique.com'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message.slice(0, 160)))
p.on('console', m => { if (m.type() === 'error' && !/CSP|Refused to connect/.test(m.text())) errs.push(m.text().slice(0, 160)) })
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 })
await p.waitForTimeout(2500)
const chips = await p.evaluate(() => [...document.querySelectorAll('button[data-testid^="intent-"]')].map(el => el.getAttribute('data-testid')))
const plan = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="plan-card"]')
  return el ? { beach: el.getAttribute('data-beach'), img: !!el.querySelector('img') } : null
})
console.log('CHIPS', JSON.stringify(chips))
console.log('PLAN', JSON.stringify(plan))
console.log('ERRORS', JSON.stringify(errs.slice(0, 6)))
await b.close()

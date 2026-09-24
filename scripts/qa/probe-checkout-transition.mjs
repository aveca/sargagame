/* probe-checkout-transition.mjs — pourquoi le checkout n'a pas transform dans
   computed transition. Lecture seule (QA recovery 2026-09-24). */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const b = await chromium.launch()
import { devices } from 'playwright'
const p = await (await b.newContext({ ...devices['iPhone 12'], browserName: undefined })).newPage()
console.log('reducedMotion matches:', await p.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(2500)
await p.locator('[data-testid="xp-best-open"]').first().click().catch(() => {})
await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 })
await p.waitForTimeout(1000)
await p.locator('[data-testid="exp-premium-cta"]').first().click().catch(async () => p.locator('[data-testid="exp-premium-cta"]').first().click({ force: true }))
await p.waitForSelector('.sg-modal-panel, .pww-wrap', { timeout: 15000 })
await p.waitForTimeout(900)
await p.evaluate(() => {
  const visibles = [...document.querySelectorAll('.sg-modal-panel .sg-passcard-hero, .pww-wrap .sg-passcard-hero')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height })
  visibles.forEach(el => el.click())
})
await p.waitForTimeout(1500)
const out = await p.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.getAttribute('aria-label') || '').match(/Paiement|checkout|Pago/))
  if (!d) return { found: false }
  const cs = getComputedStyle(d)
  return { found: true, transition: cs.transition, transitionProperty: cs.transitionProperty, rm: window.matchMedia('(prefers-reduced-motion: reduce)').matches }
})
console.log('OUT', JSON.stringify(out, null, 1))
await b.close()

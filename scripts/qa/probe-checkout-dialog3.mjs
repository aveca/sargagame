/* probe-checkout-dialog3.mjs — compte et invalide les .sg-passcard-hero
   visibles/cachés au clic. Lecture seule (QA recovery 2026-09-24). */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const EXP = '[data-testid="bx-experience"]'
const PANEL = '.sg-modal-panel, .pww-wrap'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))
p.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 120)) })

await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(2500)
await p.locator('[data-testid="xp-best-open"]').first().click({ timeout: 10000 }).catch(async () => p.locator('[data-testid="xp-best-open"]').first().click({ force: true }))
await p.waitForSelector(EXP, { timeout: 15000 })
await p.waitForTimeout(1000)
await p.locator('[data-testid="exp-premium-cta"]').first().click({ timeout: 10000 }).catch(async () => p.locator('[data-testid="exp-premium-cta"]').first().click({ force: true }))
await p.waitForSelector(PANEL, { timeout: 15000 })
await p.waitForTimeout(900)

const heroes = await p.evaluate(() => {
  return [...document.querySelectorAll('.sg-passcard-hero')].map((el, i) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      i, tag: el.tagName, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      visible: !!(r.width && r.height) && cs.visibility !== 'hidden' && cs.display !== 'none',
      inPanel: !!el.closest('.sg-modal-panel, .pww-wrap'),
      panelClass: (el.closest('.sg-modal-panel, .pww-wrap') || {}).className || null,
      text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 60),
    }
  })
})
console.log('HEROES', JSON.stringify(heroes, null, 1))

// Clic programmatique sur CHAQUE hero "visible dans panel"
const res = await p.evaluate(() => {
  const visibles = [...document.querySelectorAll('.sg-modal-panel .sg-passcard-hero, .pww-wrap .sg-passcard-hero')]
    .filter(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width && r.height && cs.display !== 'none' })
  visibles.forEach(el => el.click())
  return { clicked: visibles.length }
})
console.log('CLICKED', JSON.stringify(res))
await p.waitForTimeout(1500)
const d = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map(x => x.getAttribute('aria-label')))
console.log('DIALOGS@final', JSON.stringify(d))
await b.close()

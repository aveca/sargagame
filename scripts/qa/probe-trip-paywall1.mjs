/* probe-trip-paywall1.mjs — pourquoi isVisible('.sg-modal-panel') renvoie false
   alors que l'ARIA snapshot montre le paywall ouvert (recovery 2026-09-24). */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const EXP = '[data-testid="bx-experience"]'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 200)))

await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(2500)
await p.locator('[data-testid="xp-best-open"]').first().click()
await p.waitForSelector(EXP, { timeout: 15000 })
await p.waitForTimeout(1000)
await p.locator('[data-testid="exp-trip-open"]').first().click()
await p.waitForSelector('[data-testid="trip-premium-cta"]', { timeout: 12000 })

const sample = () => p.evaluate(() => {
  return [...document.querySelectorAll('.sg-modal-panel, .pww-wrap')].map(el => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      cls: String(el.className).slice(0, 40),
      rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      opacity: cs.opacity, visibility: cs.visibility, display: cs.display,
      anim: el.getAnimations().map(a => a.playState).join(','),
    }
  })
})
const domClick = () => p.evaluate(() => { const el = document.querySelector('[data-testid="trip-premium-cta"]'); el.click(); return true })

await domClick()
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(700)
  const s = await sample()
  const pwLoc = p.locator('.sg-modal-panel, .pww-wrap').first()
  console.log(`t=${(i + 1) * 700}ms`, 'pw.isVisible()=', await pwLoc.isVisible().catch(() => 'ERR'), JSON.stringify(s))
}
await b.close()

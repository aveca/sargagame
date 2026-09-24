/* probe-journey-chips.mjs — diagnostic ponctuel (QA recovery 2026-09-24) :
   pourquoi les chips jour (exp-day-chip / trip-stay-chip) sont à 0 dans le
   parcours Journey ? Interroge le build preview (4173), ouvre l'expérience
   « J'y vais → » et rapporte : rail présent, chips, forecast dispo (beachData),
   erreurs console. AUCUN changement produit — lecture seule. */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
const errs = []
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)))

await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(2500)
await p.locator('[data-testid="xp-best-open"]').first().click()
await p.waitForSelector('[data-testid="bx-experience"]', { timeout: 15000 })
await p.waitForTimeout(1500)

const report = await p.evaluate(() => {
  const rail = document.querySelector('[data-testid="exp-journey-rail"]')
  const chips = document.querySelectorAll('[data-testid="exp-day-chip"]').length
  const strip = document.querySelector('[data-testid="trip-stay-strip"]')
  const expName = document.querySelector('[data-testid="bx-experience"] .bx-name')
  return {
    rail: !!rail,
    railHtml: rail ? rail.innerHTML.slice(0, 300) : null,
    chips,
    strip: !!strip,
    expName: expName ? expName.textContent : null,
    fcLocal: (() => { try { return JSON.parse(localStorage.getItem('sg_active_beach_fc_debug') || 'null') } catch (_) { return null } })(),
  }
})
console.log('REPORT', JSON.stringify(report, null, 1))
console.log('ERRORS', JSON.stringify(errs.slice(0, 8)))
await b.close()

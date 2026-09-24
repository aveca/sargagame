/* probe-trip-premium-reopen.mjs — replique le test « trip + premium, fermeture
   propre » qui échoue (CI + local, recovery 2026-09-24) : après fermeture du
   paywall, le 2e tap exp-premium-cta ne rouvre pas le paywall. Lecture seule. */
import { chromium } from 'playwright'
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173'
const EXP = '[data-testid="bx-experience"]'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 240)))
p.on('console', m => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 160)) })

const dialogs = async tag => {
  const d = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"], .sg-modal-panel, .pww-wrap')].map(x => (x.getAttribute('aria-label') || x.className || '').toString().slice(0, 50)))
  console.log('DIALOGS@' + tag, JSON.stringify(d))
}

await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 })
await p.waitForTimeout(2500)
await p.locator('[data-testid="xp-best-open"]').first().click()
await p.waitForSelector(EXP, { timeout: 15000 })
await p.waitForTimeout(1000)
await p.locator('[data-testid="exp-trip-open"]').first().click()
await p.waitForSelector('[data-testid="trip-premium-cta"]', { timeout: 12000 })
await p.locator('[data-testid="trip-premium-cta"]').first().click()
const paywall = p.locator('.sg-modal-panel, .pww-wrap').first()
let pw = await paywall.isVisible({ timeout: 12000 }).catch(() => false)
console.log('paywall #1 visible:', pw)
if (!pw) {
  await p.waitForTimeout(1500)
  await p.locator('[data-testid="trip-premium-cta"]').first().click().catch(() => {})
  pw = await paywall.isVisible({ timeout: 12000 }).catch(() => false)
  console.log('paywall #1 bis visible:', pw)
}
await dialogs('paywall1')

// fermer via "Plus tard"
const closeR = await p.locator('.sg-modal-panel button, .pww-wrap button').filter({ hasText: /Plus tard|Later|Más tarde/ }).first().click().catch(e => { console.log('close click ERR', String(e).slice(0, 120)) })
await p.waitForTimeout(900)
await dialogs('afterClose')
console.log('EXP count:', await p.locator(EXP).count())

// état du CTA exp-premium avant 2e tap
const ctaState = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="exp-premium-cta"]')
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const top = document.elementFromPoint(cx, cy)
  return { found: true, x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height), topAtPoint: top ? (top.getAttribute('data-testid') || top.tagName + '.' + String(top.className).slice(0, 40)) : null }
})
// Stabilité de l'élément sur 2 s (Playwright exige « stable » avant clic)
const stab = await p.evaluate(async () => {
  const el = document.querySelector('[data-testid="exp-premium-cta"]')
  let firstEl = el
  const boxes = []
  for (let i = 0; i < 10; i++) {
    const cur = document.querySelector('[data-testid="exp-premium-cta"]')
    const r = cur.getBoundingClientRect()
    boxes.push(`${Math.round(r.x)},${Math.round(r.y)}${cur === firstEl ? '' : ' RESET'}`)
    await new Promise(r2 => setTimeout(r2, 200))
  }
  return { sameElement: null, boxes }
})
console.log('STABILITY:', JSON.stringify(stab.boxes))
const anims = await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').map(a => { try { return (a.effect.target.getAttribute && (a.effect.target.getAttribute('data-testid') || a.effect.target.className || a.effect.target.tagName)) + ' | ' + (a.animationName || '') } catch (_) { return 'anon' } }))
console.log('RUNNING ANIMS:', JSON.stringify(anims.slice(0, 12)))
// tentative : scrollIntoView + click
await p.evaluate(() => document.querySelector('[data-testid="exp-premium-cta"]').scrollIntoView({ block: 'center' }))
await p.waitForTimeout(600)
// Chemin utilisateur réel : on ferme la toast (exit-nudge, duration 9 s) via son ✕,
// puis on déroule pour placer le CTA AU-DESSUS de la barre sticky (.bx-sticky).
const xBtn = p.locator('.sg-toast-host .sg-toast__x').first()
if (await xBtn.isVisible().catch(() => false)) { await xBtn.click(); await p.waitForTimeout(400) }
await p.evaluate(() => document.querySelector('[data-testid="exp-premium-cta"]').scrollIntoView({ block: 'end' }))
await p.waitForTimeout(400)
const hit = await p.evaluate(() => {
  const el = document.querySelector('[data-testid="exp-premium-cta"]')
  const r = el.getBoundingClientRect()
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const top = document.elementFromPoint(cx, cy)
  return {
    rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
    topAtCenter: top ? (top.getAttribute?.('data-testid') || top.tagName + '.' + String(top.className).slice(0, 60)) : 'OUT_OF_VIEW',
    centerIsSelfOrChild: top ? (top === el || el.contains(top)) : false,
  }
})
console.log('HIT-TEST-2:', JSON.stringify(hit, null, 1))
// Clic DOM PUR (élimine toute physique pointeur) : si ça n'ouvre pas le
// paywall, c'est le PRODUIT qui est cassé (CTA muet), pas un recouvrement.
console.log('dom click:', await p.evaluate(() => {
  const el = document.querySelector('[data-testid="exp-premium-cta"]')
  if (!el) return 'ABSENT'
  el.click()
  return 'clicked'
}))
await p.waitForTimeout(1500)
console.log('paywall #2 après DOM click:', await paywall.isVisible().catch(() => false))
await dialogs('afterDomClick')
await p.waitForTimeout(1500)
console.log('paywall #2 post-scroll visible:', await paywall.isVisible().catch(() => false))
await b.close()

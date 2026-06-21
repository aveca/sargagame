#!/usr/bin/env node
// Verify the Stage 2 bake: zoom sharpness + the tap-pin->open-beach funnel still works.
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://127.0.0.1:4182/'
;(async () => {
  const b = await chromium.launch({ headless: false, args: ['--force-color-profile=srgb'] })
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const p = await c.newPage()
  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  const sel = 'svg[role="img"]'
  let ok = await p.waitForSelector(sel, { timeout: 9000 }).then(() => 1).catch(() => 0)
  if (!ok) { const x = await p.$('[aria-label*="archipel" i]'); if (x) await x.click().catch(()=>{}); await p.waitForSelector(sel, { timeout: 6000 }).catch(() => {}) }
  await p.waitForTimeout(2200)

  // --- zoom sharpness: wheel-zoom in hard, screenshot ---
  await p.mouse.move(195, 360)
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(40) }
  await p.waitForTimeout(600)
  await p.screenshot({ path: 'scripts/perf/bake-zoom.png', timeout: 6000 }).catch(() => {})

  // reset zoom out
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 120); await p.waitForTimeout(30) }
  await p.waitForTimeout(800)

  // --- funnel: count pins, click one, detect the beach sheet opening ---
  const before = await p.evaluate(() => ({
    pins: document.querySelectorAll('svg[role="img"] g[style*="pointer"]').length,
    bodyLen: (document.body.innerText || '').length,
  }))
  // click a pin <g> (live SVG, onClick -> selectBeach + onOpenBeach)
  const pin = await p.$('svg[role="img"] g[style*="pointer"]')
  let clicked = false
  if (pin) { await pin.click({ timeout: 3000 }).catch(() => {}); clicked = true }
  await p.waitForTimeout(1500)
  await p.screenshot({ path: 'scripts/perf/bake-funnel.png', timeout: 6000 }).catch(() => {})
  const after = await p.evaluate(() => ({
    bodyLen: (document.body.innerText || '').length,
    // the "Voir la plage" CTA appears in WorldMapView after a pin tap (selected set)
    cta: !!Array.from(document.querySelectorAll('button,a')).find(e => /voir la plage|open beach|ver la playa/i.test(e.textContent || '')),
  }))
  console.log(JSON.stringify({ pinsFound: before.pins, clicked, bodyBefore: before.bodyLen, bodyAfter: after.bodyLen, ctaOrSheetChanged: after.cta || after.bodyLen !== before.bodyLen }, null, 2))
  await b.close()
})().catch(e => { console.error(e.message); process.exit(1) })

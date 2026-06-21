#!/usr/bin/env node
// At-rest screenshot of the map (visual sanity after a perf change).
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://127.0.0.1:4180/'
const OUT = process.argv[3] || 'scripts/perf/map-shot.png'
;(async () => {
  const b = await chromium.launch({ headless: false, args: ['--force-color-profile=srgb'] })
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const p = await c.newPage()
  await p.goto(URL, { waitUntil: 'domcontentloaded' })
  const sel = 'svg[viewBox="0 0 800 600"]'
  let ok = await p.waitForSelector(sel, { timeout: 9000 }).then(() => 1).catch(() => 0)
  if (!ok) { const x = await p.$('[aria-label*="archipel" i]'); if (x) await x.click().catch(() => {}); await p.waitForSelector(sel, { timeout: 6000 }).catch(() => {}) }
  await p.waitForTimeout(2200)
  await p.screenshot({ path: OUT, timeout: 6000 }).catch(e => console.log('shot skipped', e.message))
  console.log('saved', OUT)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })

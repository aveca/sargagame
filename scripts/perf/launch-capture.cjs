#!/usr/bin/env node
// Capture the launch sequence at tight intervals to catch a transient "wrong map" flash.
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://127.0.0.1:4180/'
const SHOTS = [200, 450, 750, 1100, 1600, 2400, 3200]
;(async () => {
  const b = await chromium.launch({ headless: false, args: ['--force-color-profile=srgb'] })
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const p = await c.newPage()
  const t0 = Date.now()
  await p.goto(URL, { waitUntil: 'commit' })
  let i = 0
  for (const at of SHOTS) {
    const wait = at - (Date.now() - t0)
    if (wait > 0) await p.waitForTimeout(wait)
    await p.screenshot({ path: `scripts/perf/launch-${String(++i).padStart(2,'0')}-${at}ms.png`, timeout: 4000 }).catch(() => {})
  }
  console.log('captured', SHOTS.length, 'frames')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })

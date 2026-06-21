#!/usr/bin/env node
/**
 * Map pan/zoom FPS harness — real browser, mobile-emulated, CPU-throttled.
 *
 * Why a custom script (not the app preview / headless): a continuous rAF map
 * makes the preview time out, and HEADLESS throttles rAF to ~1fps → useless FPS.
 * So: chromium HEADED, mobile viewport, CDP CPU throttle (4x ≈ mid-range phone,
 * 6x ≈ low-end), force srgb so Windows high-contrast doesn't leak into the run.
 *
 * It drives a scripted zoom+pan over the WorldMapView SVG and collects per-frame
 * rAF intervals → median / p95 / jank% (>16.7ms) / longest / approx FPS. Run it
 * BEFORE and AFTER a change to prove the delta on the exact hot path.
 *
 * Usage: node scripts/perf/measure-map-fps.cjs [url] [label]
 *   CPU=6 DUR=3000 node scripts/perf/measure-map-fps.cjs http://localhost:5173/ before
 */
const { chromium } = require('playwright')

const URL = process.argv[2] || 'http://localhost:5173/'
const LABEL = process.argv[3] || 'run'
const CPU = Number(process.env.CPU || 4)
const DUR = Number(process.env.DUR || 2600)
const OUT = `scripts/perf/fps-${LABEL}.png`

function stats(xs) {
  const s = xs.slice().sort((a, b) => a - b)
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const jank = xs.filter(d => d > 16.7).length / xs.length * 100
  return {
    frames: xs.length,
    fps: +(1000 / mean).toFixed(1),
    medianMs: +q(0.5).toFixed(1),
    p95Ms: +q(0.95).toFixed(1),
    maxMs: +Math.max(...xs).toFixed(1),
    jankPct: +jank.toFixed(1),
  }
}

async function main() {
  // SW=1 forces software rasterization (SwiftShader) so GPU-bound costs (SVG blur,
  // mix-blend, circle fill-rate) become measurable CPU cost — the only faithful local
  // proxy for a weak mobile GPU on a desktop with a strong GPU. Pair with CPU=6.
  const args = ['--force-color-profile=srgb', '--disable-features=CalculateNativeWinOcclusion']
  if (process.env.SW === '1') args.push('--disable-gpu', '--disable-gpu-compositing')
  const browser = await chromium.launch({ headless: false, args })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    forcedColors: 'none',
  })
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU })

  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  // Find the world map SVG. If it isn't auto-open, try the archipel FAB.
  const SEL = 'svg[viewBox="0 0 800 600"]'
  let ok = await page.waitForSelector(SEL, { timeout: 9000 }).then(() => true).catch(() => false)
  if (!ok) {
    // try to open the map (FAB / any control labelled like the map)
    for (const name of [/archipel/i, /carte/i, /map/i]) {
      const b = await page.$(`[aria-label*="${name.source}" i]`).catch(() => null)
      if (b) { await b.click().catch(() => {}); break }
    }
    ok = await page.waitForSelector(SEL, { timeout: 6000 }).then(() => true).catch(() => false)
  }
  if (!ok) {
    await page.screenshot({ path: OUT, timeout: 6000 }).catch(() => {})
    console.error(`Map SVG not found. Saved ${OUT} to inspect the current screen.`)
    await browser.close(); process.exit(2)
  }
  await page.waitForTimeout(1500) // let outline + grid land + paint settle

  // frame collector
  await page.evaluate(() => {
    window.__f = []; window.__on = true
    let last = performance.now()
    const tick = t => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(tick) }
    requestAnimationFrame(t => { last = t; requestAnimationFrame(tick) })
  })

  const cx = 195, cy = 430
  await page.mouse.move(cx, cy)
  const t0 = Date.now()
  let dir = -1
  while (Date.now() - t0 < DUR) {
    await page.mouse.wheel(0, dir * 120)           // zoom in/out
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 45, cy + 35, { steps: 5 }) // pan
    await page.mouse.move(cx, cy, { steps: 3 })
    await page.mouse.up()
    dir *= -1
    await page.waitForTimeout(30)
  }
  const frames = await page.evaluate(() => { window.__on = false; return window.__f })
  await page.screenshot({ path: OUT })
  await browser.close()

  // drop first 5 warmup frames
  const usable = frames.slice(5).filter(d => d > 0 && d < 1000)
  const r = stats(usable)
  console.log(`\n=== Map FPS [${LABEL}] — CPU throttle ${CPU}x, ${DUR}ms zoom+pan, 390x844@3x ===`)
  console.log(`FPS (mean)   : ${r.fps}`)
  console.log(`frame median : ${r.medianMs} ms   (60fps budget = 16.7)`)
  console.log(`frame p95    : ${r.p95Ms} ms`)
  console.log(`frame max    : ${r.maxMs} ms`)
  console.log(`jank (>16.7) : ${r.jankPct}% of ${r.frames} frames`)
  console.log(`screenshot   : ${OUT}`)
  console.log(`JSON ${JSON.stringify({ label: LABEL, cpu: CPU, ...r })}`)
}

main().catch(e => { console.error(e); process.exit(1) })

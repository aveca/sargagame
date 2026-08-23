#!/usr/bin/env node
/**
 * Map paint/raster WORK harness (CDP tracing) — the faithful metric.
 *
 * rAF FPS is useless here: a vsync-capped desktop shows the same FPS whether a
 * frame's work is 2ms or 14ms, as long as it fits the refresh budget. The thing
 * that actually bites a weak mobile GPU is the RASTER WORK per frame. So we run
 * software raster (--disable-gpu → raster on CPU = measurable) and sum the
 * duration of Paint/RasterTask/Composite trace events over a fixed zoom+pan.
 * Lower total raster µs = less work shipped to the GPU on a real phone.
 *
 * Usage: SW is forced on. node scripts/perf/measure-map-paint.cjs [url] [label]
 */
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://127.0.0.1:4180/'
const LABEL = process.argv[3] || 'run'
const DUR = Number(process.env.DUR || 3000)

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--force-color-profile=srgb', '--disable-gpu', '--disable-gpu-compositing'],
  })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, colorScheme: 'dark',
  })
  const page = await context.newPage()
  await page.goto(URL, { waitUntil: 'domcontentloaded' })

  const SEL = 'svg[role="img"]' // the VISIBLE map svg (not the hidden bake svg, same viewBox)
  let ok = await page.waitForSelector(SEL, { timeout: 9000 }).then(() => true).catch(() => false)
  if (!ok) {
    const b = await page.$('[aria-label*="archipel" i]').catch(() => null)
    if (b) await b.click().catch(() => {})
    ok = await page.waitForSelector(SEL, { timeout: 6000 }).then(() => true).catch(() => false)
  }
  if (!ok) { console.error('map not found'); await browser.close(); process.exit(2) }
  await page.waitForTimeout(1500)

  const client = await context.newCDPSession(page)
  const events = []
  client.on('Tracing.dataCollected', e => { if (e.value) events.push(...e.value) })
  await client.send('Tracing.start', {
    categories: 'disabled-by-default-devtools.timeline,blink,cc,gpu',
    transferMode: 'ReportEvents',
  })

  const cx = 195, cy = 430
  await page.mouse.move(cx, cy)
  const t0 = Date.now(); let dir = -1
  while (Date.now() - t0 < DUR) {
    await page.mouse.wheel(0, dir * 120)
    await page.mouse.move(cx, cy); await page.mouse.down()
    await page.mouse.move(cx + 45, cy + 35, { steps: 5 })
    await page.mouse.move(cx, cy, { steps: 3 }); await page.mouse.up()
    dir *= -1; await page.waitForTimeout(30)
  }
  await client.send('Tracing.end')
  await new Promise(res => client.once('Tracing.tracingComplete', res))
  await browser.close()

  const buckets = {}
  let frames = 0
  for (const ev of events) {
    if (ev.name === 'DrawFrame' || ev.name === 'BeginFrame') frames++
    if (!ev.dur) continue
    for (const key of ['RasterTask', 'Rasterize', 'Paint', 'UpdateLayer', 'Layerize', 'ImageDecodeTask', 'Composite']) {
      if (ev.name === key || ev.name === 'CompositeLayers') { buckets[key === 'CompositeLayers' ? 'Composite' : key] = (buckets[key] || 0) + ev.dur; break }
    }
  }
  const ms = us => +(us / 1000).toFixed(1)
  const raster = (buckets.RasterTask || 0) + (buckets.Rasterize || 0)
  const paint = buckets.Paint || 0
  const composite = buckets.Composite || 0
  const total = raster + paint + composite
  console.log(`\n=== Map PAINT WORK [${LABEL}] — software raster, ${DUR}ms zoom+pan ===`)
  console.log(`RasterTask total : ${ms(raster)} ms`)
  console.log(`Paint total      : ${ms(paint)} ms`)
  console.log(`Composite total  : ${ms(composite)} ms`)
  console.log(`TOTAL paint work : ${ms(total)} ms   (lower = less work for a real mobile GPU)`)
  console.log(`JSON ${JSON.stringify({ label: LABEL, rasterMs: ms(raster), paintMs: ms(paint), compositeMs: ms(composite), totalMs: ms(total) })}`)
}
main().catch(e => { console.error(e); process.exit(1) })

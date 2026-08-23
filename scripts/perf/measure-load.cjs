#!/usr/bin/env node
/**
 * Cold-load trace — what actually makes the app slow to load on mobile 4G.
 *
 * CDP-throttled Slow-4G + 4x CPU, prod build. Reports: First Contentful Paint,
 * DOMContentLoaded, time-to-map-visible, total bytes on the wire, and the request
 * waterfall (biggest / latest-finishing on the critical path). This is the missing
 * measurement — we'd only measured pan/zoom raster, not load.
 *
 * Usage: node scripts/perf/measure-load.cjs [url]
 */
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://127.0.0.1:4185/'

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const client = await ctx.newCDPSession(page)
  // Slow 4G (~1.6 Mbps down, 150ms RTT) + 4x CPU
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8),
    uploadThroughput: Math.round(0.75 * 1024 * 1024 / 8),
    latency: 150,
  })
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  const reqs = []
  page.on('response', async r => {
    try {
      const h = r.headers()
      const len = Number(h['content-length'] || 0)
      reqs.push({ url: r.url(), status: r.status(), type: r.request().resourceType(), len })
    } catch (_) {}
  })

  const t0 = Date.now()
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const tDCL = Date.now() - t0

  // map visible?
  let tMap = null
  try { await page.waitForSelector('svg[role="img"]', { timeout: 30000 }); tMap = Date.now() - t0 } catch (_) {}
  await page.waitForTimeout(500)

  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')
    const nav = performance.getEntriesByType('navigation')[0] || {}
    return { fcp: fcp ? Math.round(fcp.startTime) : null, domInteractive: Math.round(nav.domInteractive || 0), loadEnd: Math.round(nav.loadEventEnd || 0) }
  })
  await browser.close()

  // transferred bytes by type
  const byType = {}
  let total = 0
  for (const r of reqs) { byType[r.type] = (byType[r.type] || 0) + r.len; total += r.len }
  const kb = n => (n / 1024).toFixed(1) + 'KB'

  console.log(`\n=== COLD LOAD [Slow-4G + 4x CPU] ${URL} ===`)
  console.log(`First Contentful Paint : ${paint.fcp != null ? paint.fcp + ' ms' : 'n/a'}`)
  console.log(`DOM interactive        : ${paint.domInteractive} ms`)
  console.log(`DOMContentLoaded (wall): ${tDCL} ms`)
  console.log(`map SVG visible        : ${tMap != null ? tMap + ' ms' : 'NOT within 30s'}`)
  console.log(`load event             : ${paint.loadEnd} ms`)
  console.log(`\n--- bytes on the wire (content-length) ---`)
  console.log(`TOTAL: ${kb(total)} across ${reqs.length} requests`)
  for (const [t, b] of Object.entries(byType).sort((a, b2) => b2[1] - a[1])) console.log(`  ${t.padEnd(10)} ${kb(b)}`)
  console.log(`\n--- 10 biggest requests ---`)
  reqs.sort((a, b) => b.len - a.len).slice(0, 10).forEach(r => console.log(`  ${kb(r.len).padStart(9)}  ${r.type.padEnd(8)} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 60)}`))
}
main().catch(e => { console.error(e); process.exit(1) })

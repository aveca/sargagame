#!/usr/bin/env node
/**
 * Full load audit — the REAL waterfall (CDP encodedDataLength = bytes on the wire),
 * first-party vs third-party, by type, sorted by finish time. Answers: are we loading
 * stuff we don't need? What's on the critical path? What's third-party we could defer?
 */
const { chromium } = require('playwright')
const TARGET = process.argv[2] || 'http://127.0.0.1:4188/'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const client = await ctx.newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: Math.round(0.75 * 1024 * 1024 / 8), latency: 150 })
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const reqs = {}
  client.on('Network.requestWillBeSent', e => { reqs[e.requestId] = { url: e.request.url, type: e.type } })
  client.on('Network.responseReceived', e => { if (reqs[e.requestId]) { reqs[e.requestId].status = e.response.status; reqs[e.requestId].fromCache = e.response.fromDiskCache } })
  client.on('Network.loadingFinished', e => { const r = reqs[e.requestId]; if (r) { r.bytes = e.encodedDataLength || 0; r.done = true } })

  await page.goto(TARGET, { waitUntil: 'load', timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(3500) // let lazy chunks + 3rd-party analytics settle
  await browser.close()

  const host = new URL(TARGET).host
  const is3p = u => { try { const h = new URL(u).host; return h !== host } catch { return false } }
  const kb = n => (n / 1024).toFixed(1)
  const all = Object.values(reqs).filter(r => r.done)
  let total = 0, t3p = 0
  const byType = {}, parties = { first: 0, third: 0 }
  for (const r of all) { total += r.bytes; const tp = is3p(r.url); if (tp) t3p += r.bytes; byType[r.type] = (byType[r.type] || 0) + r.bytes; parties[tp ? 'third' : 'first'] += r.bytes }

  console.log(`\n=== LOAD AUDIT ${TARGET} (Slow-4G + 4x CPU) ===`)
  console.log(`requests: ${all.length} | TOTAL on wire: ${kb(total)} KB`)
  console.log(`  first-party: ${kb(parties.first)} KB | third-party: ${kb(parties.third)} KB`)
  console.log(`\n--- by type ---`)
  for (const [t, b] of Object.entries(byType).sort((a, b2) => b2[1] - a[1])) console.log(`  ${t.padEnd(12)} ${kb(b).padStart(8)} KB`)
  console.log(`\n--- THIRD-PARTY (candidates to defer/drop) ---`)
  all.filter(r => is3p(r.url)).sort((a, b) => b.bytes - a.bytes).forEach(r => console.log(`  ${kb(r.bytes).padStart(8)} KB  ${r.type.padEnd(8)} ${r.url.slice(0, 70)}`))
  console.log(`\n--- 15 biggest requests (any) ---`)
  all.sort((a, b) => b.bytes - a.bytes).slice(0, 15).forEach(r => console.log(`  ${kb(r.bytes).padStart(8)} KB  ${r.type.padEnd(8)} ${(is3p(r.url) ? '[3p] ' : '     ') + r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 58)}`))
}
main().catch(e => { console.error(e); process.exit(1) })

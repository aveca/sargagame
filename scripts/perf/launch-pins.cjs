#!/usr/bin/env node
// Tally pin colors (green/yellow/red/grey) over the first ~2.5s of launch — is the
// "all green then correct" real on the live build, and is it green or grey initially?
const { chromium } = require('playwright')
const URL = process.argv[2] || 'https://sargasses-martinique.com/'
;(async () => {
  const b = await chromium.launch({ headless: true })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  const client = await ctx.newCDPSession(p)
  await client.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: Math.round(1.6 * 1024 * 1024 / 8), uploadThroughput: 100000, latency: 150 })
  await p.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await p.waitForSelector('svg[role="img"]', { timeout: 20000 }).catch(() => {})
  const t0 = Date.now()
  const samples = []
  for (let i = 0; i < 16; i++) {
    const tally = await p.evaluate(() => {
      const els = [...document.querySelectorAll('svg[role="img"] path, svg[role="img"] circle')]
      const t = { green: 0, yellow: 0, red: 0, grey: 0 }
      for (const e of els) {
        const f = e.getAttribute('fill') || ''
        if (/wmPinClean/.test(f) || f === '#27c46b') t.green++
        else if (/wmPinMod/.test(f) || f === '#ffd23f') t.yellow++
        else if (/wmPinAvoid/.test(f) || f === '#e8322a') t.red++
        else if (f === '#9aa0a8') t.grey++
      }
      return t
    }).catch(() => null)
    if (tally) samples.push({ ms: Date.now() - t0, ...tally })
    await p.waitForTimeout(170)
  }
  console.log(JSON.stringify(samples))
  await b.close()
})().catch(e => { console.error(e.message); process.exit(1) })

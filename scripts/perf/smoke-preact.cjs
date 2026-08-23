#!/usr/bin/env node
/**
 * Preact compat smoke — does the app actually WORK on preact/compat (not just build)?
 * Checks: app renders (not blank), map appears, tap pin -> beach sheet opens, paywall
 * (?paywall=1) renders + Stripe Elements iframe loads, ZERO console/page errors.
 * A clean pass = Preact compat is safe for home/map/funnel (real-payment edge still untested).
 */
const { chromium } = require('playwright')
const BASE = process.argv[2] || 'http://127.0.0.1:4187'

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const p = await ctx.newPage()
  const errs = []
  p.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 160)) })
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message.slice(0, 200)))
  return { p, errs }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] })
  const out = {}

  // --- Flow 1: home + map + tap pin -> sheet ---
  {
    const { p, errs } = await newPage(browser)
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const rootFilled = await p.waitForFunction(() => (document.getElementById('root')?.innerHTML || '').length > 500, { timeout: 15000 }).then(() => true).catch(() => false)
    const mapUp = await p.waitForSelector('svg[role="img"]', { timeout: 15000 }).then(() => true).catch(() => false)
    await p.waitForTimeout(2000)
    const before = await p.evaluate(() => (document.body.innerText || '').length)
    let sheetOpened = false
    const pin = await p.$('svg[role="img"] g[style*="pointer"]')
    if (pin) { await pin.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(1500); const after = await p.evaluate(() => (document.body.innerText || '').length); sheetOpened = after !== before }
    await p.screenshot({ path: 'scripts/perf/smoke-home.png', timeout: 6000 }).catch(() => {})
    out.flow1 = { rootFilled, mapUp, sheetOpened, errors: errs.slice(0, 6) }
    await p.context().close()
  }

  // --- Flow 2: paywall (?paywall=1) + Stripe ---
  {
    const { p, errs } = await newPage(browser)
    await p.goto(BASE + '/?paywall=1', { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(4000)
    const paywall = await p.evaluate(() => {
      const t = (document.body.innerText || '')
      return { hasPayText: /premium|veilleur|débloqu|alerte|mensuel|annuel|€|\/mois/i.test(t), bodyLen: t.length, stripeIframe: !!document.querySelector('iframe[src*="stripe"], iframe[name*="stripe" i], iframe[title*="Secure" i]') }
    })
    await p.screenshot({ path: 'scripts/perf/smoke-paywall.png', timeout: 6000 }).catch(() => {})
    out.flow2 = { ...paywall, errors: errs.slice(0, 6) }
    await p.context().close()
  }

  await browser.close()
  console.log(JSON.stringify(out, null, 2))
}
main().catch(e => { console.error(e); process.exit(1) })

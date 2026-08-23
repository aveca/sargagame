#!/usr/bin/env node
// One-shot DOM probe: what's on screen on load? find the map selector / what to click.
const { chromium } = require('playwright')
const URL = process.argv[2] || 'http://localhost:5173/'
;(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--force-color-profile=srgb'] })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const page = await ctx.newPage()
  const logs = []
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 200)))
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`.slice(0, 300)))
  page.on('requestfailed', r => logs.push(`[reqfail] ${r.url().slice(0, 80)} — ${r.failure()?.errorText}`))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const rootLen = await page.evaluate(() => (document.getElementById('root')?.innerHTML || '').length)
  console.log('root innerHTML length:', rootLen)
  console.log('--- console/errors (first 20) ---')
  console.log(logs.slice(0, 20).join('\n') || '(none)')
  console.log('--- DOM ---')
  const dump = await page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')].map(s => s.getAttribute('viewBox') || '(no viewBox)')
    const clickables = [...document.querySelectorAll('button,[role="button"],[aria-label]')]
      .map(b => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40))
      .filter(Boolean).slice(0, 30)
    return {
      title: document.title,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
      svgCount: svgs.length, viewBoxes: svgs.slice(0, 12), clickables,
    }
  })
  console.log(JSON.stringify(dump, null, 2))
  await page.screenshot({ path: 'scripts/perf/probe.png', timeout: 4000 }).catch(e => console.log('screenshot skipped:', e.message))
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })

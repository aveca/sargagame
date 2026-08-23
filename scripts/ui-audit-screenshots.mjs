/**
 * scripts/ui-audit-screenshots.mjs
 * Self-contained UI/UX audit — starts its own server, screenshots all screens
 * Run: node scripts/ui-audit-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import http from 'http'

const PORT = 4199
const BASE_URL = `http://localhost:${PORT}`
const OUT_DIR = join(process.cwd(), 'tests', 'ui-audit-screenshots')
mkdirSync(OUT_DIR, { recursive: true })

const IPHONE = {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
}
const DESKTOP = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
}

let shotN = 0
async function shot(page, name) {
  shotN++
  const fn = `${String(shotN).padStart(2,'0')}_${name}.png`
  await page.screenshot({ path: join(OUT_DIR, fn), fullPage: false })
  console.log(`  ✓ ${fn}`)
  return fn
}

async function startServer() {
  console.log(`Starting vite preview on :${PORT}...`)
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(), stdio: 'pipe', shell: true,
  })
  srv.stderr.on('data', () => {}) // suppress noise
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((res, rej) => {
        http.get(BASE_URL, r => { r.resume(); res() }).on('error', rej)
      })
      console.log('Server ready.\n')
      return srv
    } catch { await new Promise(r => setTimeout(r, 500)) }
  }
  throw new Error('Server failed to start')
}

async function main() {
  const server = await startServer()
  const browser = await chromium.launch({ headless: true })
  const all = []

  try {
    // ═══ PHASE 1: MAP DEFAULT (all viewports) ═══
    console.log('═══ PHASE 1: MAP DEFAULT ═══')
    for (const [label, cfg] of [['320x640', {viewport:{width:320,height:640}}], ['375x667', {viewport:{width:375,height:667}}], ['390x844', IPHONE], ['430x932', {viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true}], ['768x1024', {viewport:{width:768,height:1024}}], ['1280x800', {viewport:{width:1280,height:800}}], ['1440x900', DESKTOP]]) {
      const ctx = await browser.newContext({ ...cfg, userAgent: cfg.viewport.width < 768 ? IPHONE.userAgent : undefined })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      all.push(await shot(page, `MAP_${label}`))
      const pins = await page.locator('.sg-maplabel').count()
      const nav = await page.locator('nav.sg-bottom-nav').isVisible().catch(() => false)
      console.log(`    pins=${pins} nav=${nav}`)
      await ctx.close()
    }

    // ═══ PHASE 2: BEACH DETAIL ═══
    console.log('\n═══ PHASE 2: BEACH DETAIL ═══')
    for (const [label, cfg] of [['390x844', IPHONE], ['1440x900', DESKTOP]]) {
      const ctx = await browser.newContext({ ...cfg, userAgent: cfg.viewport.width < 768 ? IPHONE.userAgent : undefined })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      // Click first visible pin
      const clicked = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.sg-maplabel')].find(e => getComputedStyle(e).visibility !== 'hidden')
        if (el) { el.click(); return true } return false
      })
      if (clicked) {
        await page.waitForTimeout(2000)
        all.push(await shot(page, `BEACH_CLICKED_${label}`))
        await page.waitForSelector('.lc-detail, .sheet', { timeout: 10000 }).catch(() => {})
        await page.waitForTimeout(1500)
        all.push(await shot(page, `BEACH_DETAIL_${label}`))
        const txt = await page.locator('.lc-detail, .sheet').first().textContent().catch(() => '')
        console.log(`    detail length: ${txt.length} chars, has score: ${/\d+\/100|\d+%/.test(txt)}`)
      }
      await ctx.close()
    }

    // ═══ PHASE 3: PAYWALL ═══
    console.log('\n═══ PHASE 3: PAYWALL ═══')
    for (const [label, cfg] of [['390x844', IPHONE], ['1440x900', DESKTOP]]) {
      const ctx = await browser.newContext({ ...cfg, userAgent: cfg.viewport.width < 768 ? IPHONE.userAgent : undefined })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      await page.goto(BASE_URL + '/?frustration=0&paywall=1', { waitUntil: 'load', timeout: 30000 })
      await page.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(3000)
      all.push(await shot(page, `PAYWALL_${label}`))
      const modal = await page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first().isVisible().catch(() => false)
      console.log(`    modal visible: ${modal}`)
      if (modal) {
        const txt = await page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first().textContent().catch(() => '')
        console.log(`    has price: ${txt.includes('€') || txt.includes('$')}, has CTA: ${/premium|commencer|unlock/i.test(txt)}`)
      }
      await ctx.close()
    }

    // ═══ PHASE 4: NAVIGATION ═══
    console.log('\n═══ PHASE 4: NAVIGATION ═══')
    for (const [label, cfg] of [['390x844', IPHONE], ['1440x900', DESKTOP]]) {
      const ctx = await browser.newContext({ ...cfg, userAgent: cfg.viewport.width < 768 ? IPHONE.userAgent : undefined })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      // List tab
      const listTab = page.locator('nav.sg-bottom-nav button').nth(1)
      if (await listTab.isVisible().catch(() => false)) {
        await listTab.click()
        await page.waitForTimeout(1500)
        all.push(await shot(page, `NAV_LIST_${label}`))
      }
      // Back to map
      const mapTab = page.locator('nav.sg-bottom-nav button').nth(0)
      if (await mapTab.isVisible().catch(() => false)) {
        await mapTab.click()
        await page.waitForTimeout(1500)
        all.push(await shot(page, `NAV_MAP_${label}`))
      }
      await ctx.close()
    }

    // ═══ PHASE 5: THEMES ═══
    console.log('\n═══ PHASE 5: THEMES ═══')
    for (const theme of ['soft', 'comic', 'sticker']) {
      const ctx = await browser.newContext({ ...IPHONE, userAgent: IPHONE.userAgent })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      await page.goto(BASE_URL + `/?theme=${theme}`, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      all.push(await shot(page, `THEME_${theme.toUpperCase()}`))
      await ctx.close()
    }

    // ═══ PHASE 6: DEEP LINKS ═══
    console.log('\n═══ PHASE 6: DEEP LINKS ═══')
    for (const [name, q] of [['BRIEF', '?brief=1'], ['VEILLEUR', '?veille=1'], ['DEMO', '?demo=1']]) {
      const ctx = await browser.newContext({ ...IPHONE, userAgent: IPHONE.userAgent })
      const page = await ctx.newPage()
      page.on('pageerror', () => {})
      try {
        await page.goto(BASE_URL + '/' + q, { waitUntil: 'load', timeout: 20000 })
        await page.waitForTimeout(3000)
        all.push(await shot(page, `DEEP_${name}`))
      } catch (e) { console.log(`  ⚠ ${name}: ${e.message.slice(0, 60)}`) }
      await ctx.close()
    }

    // ═══ PHASE 7: LOADING STATE ═══
    console.log('\n═══ PHASE 7: LOADING STATE ═══')
    const ctx7 = await browser.newContext({ ...IPHONE, userAgent: IPHONE.userAgent })
    const page7 = await ctx7.newPage()
    page7.on('pageerror', () => {})
    await page7.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page7.waitForTimeout(300)
    all.push(await shot(page7, 'LOADING_SKELETON'))
    await page7.waitForTimeout(4000)
    all.push(await shot(page7, 'LOADED_READY'))
    await ctx7.close()

    // ═══ SUMMARY ═══
    console.log(`\n═══ DONE: ${all.length} screenshots in ${OUT_DIR} ═══`)
  } finally {
    await browser.close()
    server.kill()
  }
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })

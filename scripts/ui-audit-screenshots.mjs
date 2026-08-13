/**
 * scripts/ui-audit-screenshots.mjs
 * Comprehensive UI/UX audit — screenshots of all screens/states
 * Run: node scripts/ui-audit-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { execSync, spawn } from 'child_process'

// Start our own preview server to avoid lifecycle issues
const PORT = 4199
const BASE_URL = process.env.PREVIEW_URL || `http://localhost:${PORT}`
const OUT_DIR = join(process.cwd(), 'tests', 'ui-audit-screenshots')

mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORTS = {
  mobile_s: { width: 320, height: 640, label: '320x640' },
  mobile: { width: 375, height: 667, label: '375x667' },
  iphone12: { width: 390, height: 844, label: '390x844' },
  iphone14: { width: 430, height: 932, label: '430x932' },
  tablet: { width: 768, height: 1024, label: '768x1024' },
  laptop: { width: 1280, height: 800, label: '1280x800' },
  desktop: { width: 1440, height: 900, label: '1440x900' },
}

async function screenshot(page, name, vp) {
  const filename = `${name}_${vp.label}.png`
  await page.screenshot({ path: join(OUT_DIR, filename), fullPage: false })
  console.log(`  ✓ ${filename}`)
  return filename
}

async function waitAndScreenshot(page, name, vp, waitMs = 2000) {
  await page.waitForTimeout(waitMs)
  return screenshot(page, name, vp)
}

async function run() {
  // Start preview server
  console.log(`Starting preview server on port ${PORT}...`)
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
  })
  server.stdout.on('data', d => process.stdout.write(d))
  server.stderr.on('data', d => process.stderr.write(d))

  // Wait for server to be ready
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      const http = await import('http')
      await new Promise((resolve, reject) => {
        http.get(BASE_URL + '/', r => { r.resume(); resolve() }).on('error', reject)
      })
      ready = true
      console.log('Server ready!')
      break
    } catch {
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  if (!ready) {
    console.error('Server failed to start')
    server.kill()
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const results = []

  // ── Phase 1: Landing / Map default ──
  console.log('\n═══ PHASE 1: LANDING & MAP ═══')
  for (const [vpKey, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : undefined,
      deviceScaleFactor: vp.width < 768 ? 2 : 1,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    })
    const page = await ctx.newPage()

    // Suppress JS errors for cleaner audit
    page.on('pageerror', () => {})
    
    // Auto-dismiss cookie banner to unblock navigation
    await page.evaluate(() => {
      try {
        const btn = document.querySelector('.sg-cookie-banner button:last-child');
        if (btn) btn.click();
      } catch (_) {}
    });

    // 1. Landing / Map default
    await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(3000)
    results.push(await screenshot(page, 'MAP_DEFAULT', vp))

    // Check for map labels
    const pinCount = await page.locator('.sg-maplabel').count()
    console.log(`  Map pins visible: ${pinCount}`)

    // 2. Check bottom nav
    const bottomNav = await page.locator('nav.sg-bottom-nav').isVisible().catch(() => false)
    console.log(`  Bottom nav visible: ${bottomNav}`)

    await ctx.close()
  }

  // ── Phase 2: Beach selection & detail ──
  console.log('\n═══ PHASE 2: BEACH SELECTION & DETAIL ═══')
  for (const vpKey of ['iphone12', 'desktop']) {
    const vp = VIEWPORTS[vpKey]
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : undefined,
      deviceScaleFactor: vp.width < 768 ? 2 : 1,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    })
    const page = await ctx.newPage()
    page.on('pageerror', () => {})

    await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(3000)

    // Click first visible map pin
    const clicked = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.sg-maplabel')]
      const visible = labels.find(el => getComputedStyle(el).visibility !== 'hidden')
      if (visible) { (visible).click(); return true }
      return false
    })
    console.log(`  Clicked map pin: ${clicked}`)

    if (clicked) {
      await page.waitForTimeout(2000)
      results.push(await screenshot(page, 'BEACH_SELECTED', vp))

      // Wait for beach sheet to appear
      await page.waitForSelector('.lc-detail, .sheet', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(1500)
      results.push(await screenshot(page, 'BEACH_DETAIL', vp))

      // Check beach detail content
      const detailText = await page.locator('.lc-detail, .sheet').first().textContent().catch(() => '')
      console.log(`  Beach detail length: ${detailText.length} chars`)
      console.log(`  Contains score: ${detailText.match(/\d+\/100|\d+%/)?.[0] || 'none'}`)
    }

    await ctx.close()
  }

  // ── Phase 3: Paywall ──
  console.log('\n═══ PHASE 3: PAYWALL / PREMIUM ═══')
  for (const vpKey of ['iphone12', 'desktop']) {
    const vp = VIEWPORTS[vpKey]
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : undefined,
      deviceScaleFactor: vp.width < 768 ? 2 : 1,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    })
    const page = await ctx.newPage()
    page.on('pageerror', () => {})

    // Direct paywall deep link
    await page.goto(BASE_URL + '/?frustration=0&paywall=1', { waitUntil: 'load', timeout: 60000 })
    await page.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(3000)
    results.push(await screenshot(page, 'PAYWALL_WORLD', vp))

    // Check paywall content
    const modal = page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap').first()
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`  Paywall modal visible: ${modalVisible}`)

    if (modalVisible) {
      const modalText = await modal.textContent().catch(() => '')
      console.log(`  Paywall text length: ${modalText.length}`)
      console.log(`  Contains price: ${modalText.includes('€') || modalText.includes('$')}`)
      console.log(`  Contains CTA: ${modalText.includes('Premium') || modalText.includes('Commencer') || modalText.includes('Unlock')}`)
    }

    await ctx.close()
  }

  // ── Phase 4: Bottom nav tabs ──
  console.log('\n═══ PHASE 4: NAVIGATION TABS ═══')
  for (const vpKey of ['iphone12', 'desktop']) {
    const vp = VIEWPORTS[vpKey]
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.width < 768
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : undefined,
      deviceScaleFactor: vp.width < 768 ? 2 : 1,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    })
    const page = await ctx.newPage()
    page.on('pageerror', () => {})

    await page.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(3000)

    // Click "Plages" tab
    const listTab = page.locator('nav.sg-bottom-nav button').nth(1)
    if (await listTab.isVisible().catch(() => false)) {
      await listTab.click()
      await page.waitForTimeout(1500)
      results.push(await screenshot(page, 'NAV_LIST_VIEW', vp))
    }

    // Click "Map" tab back
    const mapTab = page.locator('nav.sg-bottom-nav button').nth(0)
    if (await mapTab.isVisible().catch(() => false)) {
      await mapTab.click()
      await page.waitForTimeout(1500)
      results.push(await screenshot(page, 'NAV_MAP_RETURN', vp))
    }

    await ctx.close()
  }

  // ── Phase 5: Feature flags / variants ──
  console.log('\n═══ PHASE 5: FEATURE FLAGS & VARIANTS ═══')
  const variants = [
    { name: 'WELCOME_POSTE', query: '?poste=1' },
    { name: 'NO_FOG', query: '?fog=0' },
    { name: 'THEME_SOFT', query: '?theme=soft' },
    { name: 'THEME_COMIC', query: '?theme=comic' },
    { name: 'THEME_STICKER', query: '?theme=sticker' },
  ]

  const vp = VIEWPORTS.iphone12
  for (const variant of variants) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await ctx.newPage()
    page.on('pageerror', () => {})

    await page.goto(BASE_URL + '/' + variant.query, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(3000)
    results.push(await screenshot(page, variant.name, vp))

    await ctx.close()
  }

  // ── Phase 6: Deep links ──
  console.log('\n═══ PHASE 6: DEEP LINKS ═══')
  const deepLinks = [
    { name: 'BRIEF_MATIN', query: '?brief=1' },
    { name: 'VEILLEUR_REPOND', query: '?veille=1' },
    { name: 'DEMO_REEL', query: '?demo=1' },
    { name: 'FIABILITE', query: '/fiabilite/' },
  ]

  for (const link of deepLinks) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await ctx.newPage()
    page.on('pageerror', () => {})

    try {
      await page.goto(BASE_URL + link.query, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      results.push(await screenshot(page, link.name, vp))
    } catch (e) {
      console.log(`  ⚠ ${link.name}: ${e.message.slice(0, 80)}`)
    }

    await ctx.close()
  }

  // ── Phase 7: Loading & error states ──
  console.log('\n═══ PHASE 7: LOADING & ERROR STATES ═══')
  const ctx7 = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page7 = await ctx7.newPage()
  page7.on('pageerror', () => {})

  // Capture initial loading state
  await page7.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page7.waitForTimeout(500)
  results.push(await screenshot(page7, 'LOADING_INITIAL', vp))
  await page7.waitForTimeout(4000)
  results.push(await screenshot(page7, 'LOADED_MAP', vp))

  await ctx7.close()

  // ── Phase 8: Desktop-specific — wider paywall, FABs ──
  console.log('\n═══ PHASE 8: DESKTOP-SPECIFIC ═══')
  const ctx8 = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const page8 = await ctx8.newPage()
  page8.on('pageerror', () => {})

  await page8.goto(BASE_URL + '/', { waitUntil: 'load', timeout: 60000 })
  await page8.waitForTimeout(3000)
  results.push(await screenshot(page8, 'DESKTOP_MAP', VIEWPORTS.desktop))

  // Desktop paywall
  await page8.goto(BASE_URL + '/?frustration=0&paywall=1', { waitUntil: 'load', timeout: 60000 })
  await page8.waitForFunction(() => !window.location.search.includes('paywall=1'), {}, { timeout: 15000 }).catch(() => {})
  await page8.waitForTimeout(3000)
  results.push(await screenshot(page8, 'DESKTOP_PAYWALL', VIEWPORTS.desktop))

  await ctx8.close()

  // ── Summary ──
  console.log('\n═══ AUDIT SUMMARY ═══')
  console.log(`Total screenshots: ${results.length}`)
  console.log(`Output directory: ${OUT_DIR}`)
  console.log('\nFiles:')
  results.forEach(f => console.log(`  ${f}`))

  await browser.close()
  server.kill()
  return results
}

run().catch(e => {
  console.error('Audit failed:', e)
  process.exit(1)
})

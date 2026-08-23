// P1-03 baseline + validation runner (BEFORE/AFTER)
// Usage: node scripts/p103-baseline.mjs <tag> [--desktop-only] [--mobile-only]
// Captures journey A-K on iPhone 12 (390x844 DPR2 touch) + desktop 1920x1080.
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const TAG = process.argv[2] || 'before'
const BASE = process.env.PREVIEW_URL || 'http://localhost:4173'
const OUT = path.resolve('tests/ux-recordings', `p1-03-${TAG}`)
fs.mkdirSync(OUT, { recursive: true })

const report = { tag: TAG, t: new Date().toISOString(), cases: {}, consoleErrors: [] }

async function dismissCookies(page) {
  const acc = page.locator('button:has-text("Accepter"), button:has-text("Accept"), button:has-text("Aceptar")').first()
  if (await acc.isVisible({ timeout: 3000 }).catch(() => false)) { await acc.click(); await page.waitForTimeout(400) }
}

async function openBeachFiche(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.sg-maplabel', { state: 'attached', timeout: 40000 })
  await dismissCookies(page)
  const label = page.locator('.sg-maplabel[role="button"]').first()
  const pin = page.locator('[data-beach]').first()
  const target = await pin.count() ? pin : label
  await target.click({ force: true })
  await page.waitForTimeout(2500)
  // Fiche complète → contient ForecastChart (le preview ChasseHome CTA va direct au paywall)
  const fullBtn = page.locator('button.lc-detail-go').first()
  if (await fullBtn.isVisible({ timeout: 4000 }).catch(() => false)) { await fullBtn.click(); await page.waitForTimeout(1500) }
}

async function journey(page, label) {
  const errs = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
  const r = { errs }

  // A. fiche plage
  await openBeachFiche(page)
  await page.screenshot({ path: path.join(OUT, `${label}-A-fiche.png`) })

  // B. ouvrir prévisions (scroll to forecast chart / assert visible)
  const fcTitle = page.locator('text=/PRÉVISION 7 JOURS|7-DAY FORECAST|PRONÓSTICO/i').first()
  r.forecastSection = await fcTitle.isVisible({ timeout: 8000 }).catch(() => false)

  // Find ForecastChart bars (.fc-bar) — inside BeachSheet vs /previsions landing
  const bars = page.locator('.fc-bar')
  r.barCount = await bars.count().catch(() => 0)

  // C. jours visibles
  if (r.barCount) {
    await bars.first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, `${label}-C-previsions.png`) })
  }

  // C. jours visibles (fiche = .bsc-bar ; ForecastChart = .fc-bar)
  const bscBars = page.locator('.bsc-bar')
  r.bscBarCount = await bscBars.count().catch(() => 0)
  // lock fiche = bouton overlay aria-label "Débloquer les prévisions"
  const ficheLock = page.locator('button[aria-label*="prévisions"], button[aria-label*="Unlock forecast"], button[aria-label*="Desbloquear"]').first()
  r.ficheLockVisible = await ficheLock.isVisible({ timeout: 3000 }).catch(() => false)
  if (r.ficheLockVisible) {
    await ficheLock.scrollIntoViewIfNeeded().catch(() => {})
    await page.screenshot({ path: path.join(OUT, `${label}-D-lock-fiche.png`) })
    r.ficheLockBox = await ficheLock.boundingBox().catch(() => null)
    r.ficheLockOpacity = await ficheLock.evaluate(e => getComputedStyle(e).opacity).catch(() => null)
    await ficheLock.click().catch(() => {})
    await page.waitForTimeout(1500)
    r.fichePaywallOpen = await page.locator('[role="dialog"][aria-modal="true"], .sg-v2-paywall-panel').first().isVisible().catch(() => false)
    await page.screenshot({ path: path.join(OUT, `${label}-F-fiche-afterlock.png`) })
    // fermer paywall si ouvert
    const pwClose = page.locator('[role="dialog"] button[aria-label*="Fermer"], [role="dialog"] button[aria-label*="Close"]').first()
    if (await pwClose.isVisible({ timeout: 2000 }).catch(() => false)) { await pwClose.click(); await page.waitForTimeout(600) }
  }

  // D/E. jour verrouillé + clic lock overlay "control"
  const lockZone = page.locator('div[role="button"][tabindex="0"]').filter({ hasText: /Débloquer|Unlock|Desbloquear/ }).first()
  r.lockCount = await page.locator('div[role="button"]').count()
  const lockVisible = await lockZone.isVisible({ timeout: 4000 }).catch(() => false)
  r.lockVisible = lockVisible
  if (lockVisible) {
    await lockZone.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, `${label}-D-lock.png`) })
    // consent etat
    r.consent = await page.evaluate(() => { try { return localStorage.getItem('sg_cookie_consent') } catch (_) { return null } })
    // E1 clic
    await lockZone.click({ position: { x: 30, y: 30 } }).catch(e => { r.clickErr = String(e).slice(0, 160) })
    await page.waitForTimeout(1200)
    // F. beat ouvert ?
    r.beatOpenAfterClick = await page.locator('.pw-beat-in').isVisible().catch(() => false)
    await page.screenshot({ path: path.join(OUT, `${label}-F-after-lock-click.png`) })
    // hauteur clickable zone
    const bb = await lockZone.boundingBox().catch(() => null)
    r.lockBox = bb
    // G. retour (beat = inline, pas de retour; tester re-clic)
    await lockZone.click({ position: { x: 40, y: 40 } }).catch(() => {})
    await page.waitForTimeout(600)
    r.beatStillStable = await page.locator('.pw-beat-in').count()
  }

  // teaser strip
  const strip = page.locator('div[role="button"]').filter({ hasText: /Jours suivants|Next days|Próximos días/ }).first()
  r.stripVisible = await strip.isVisible({ timeout: 3000 }).catch(() => false)
  if (r.stripVisible) {
    await strip.click().catch(() => {})
    await page.waitForTimeout(800)
    r.beatAfterStrip = await page.locator('.pw-beat-in').isVisible().catch(() => false)
  }

  // clavier Enter/Space sur la lock zone
  if (lockVisible) {
    await lockZone.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    r.beatAfterEnter = await page.locator('.pw-beat-in').isVisible().catch(() => false)
    await page.keyboard.press(' ')
    await page.waitForTimeout(600)
    r.beatAfterSpace = await page.locator('.pw-beat-in').isVisible().catch(() => false)
  }

  // aria/a11y du lock
  if (lockVisible) {
    r.lockAria = await lockZone.getAttribute('aria-label').catch(() => null)
    r.lockRole = await lockZone.getAttribute('role').catch(() => null)
  }

  // I/J/K. fraîcheur data
  r.freshness = await page.evaluate(async () => {
    try {
      const d = await (await fetch('/api/copernicus/sargassum.json')).json()
      const h = (Date.now() - new Date(d.updatedAt).getTime()) / 3.6e6
      return { updatedAt: d.updatedAt, stale: d.stale, ageH: Math.round(h * 10) / 10 }
    } catch (e) { return { err: String(e) } }
  })

  // H. changement de plage
  const close = page.locator('button[aria-label*="Fermer"], button[aria-label*="Close"]').first()
  if (await close.isVisible({ timeout: 3000 }).catch(() => false)) {
    await close.click(); await page.waitForTimeout(800)
    const pins = page.locator('.sg-maplabel[role="button"]')
    if (await pins.count() > 1) { await pins.nth(2).click({ force: true }); await page.waitForTimeout(2000) }
    await page.screenshot({ path: path.join(OUT, `${label}-H-autre-plage.png`) })
    r.secondBeachBars = await page.locator('.fc-bar').count().catch(() => 0)
  }

  // V. variante /previsions/ (ForecastChart + openLock + pwBeat)
  await page.goto(BASE + '/previsions/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)
  await dismissCookies(page)
  const fcBars2 = await page.locator('.fc-bar').count()
  r.prevBars = fcBars2
  if (fcBars2 > 0) {
    await page.locator('.fc-bar').first().scrollIntoViewIfNeeded().catch(() => {})
    const lockZone2 = page.locator('div[role="button"][tabindex="0"]').filter({ hasText: /Débloquer|Unlock|Desbloquear/ }).first()
    r.prevLockVisible = await lockZone2.isVisible({ timeout: 4000 }).catch(() => false)
    await page.screenshot({ path: path.join(OUT, `${label}-V-previsions-landing.png`) })
    if (r.prevLockVisible) {
      r.prevLockAria = await lockZone2.getAttribute('aria-label')
      // 1) clic zone verrouillée
      await lockZone2.click({ position: { x: 40, y: 40 } })
      await page.waitForTimeout(900)
      r.prevBeatAfterClick = await page.locator('.pw-beat-in').isVisible().catch(() => false)
      await page.screenshot({ path: path.join(OUT, `${label}-V-beat-after-click.png`) })
      // 2) teaser strip
      const strip2 = page.locator('div[role="button"]').filter({ hasText: /Jours suivants|Next days|Próximos días/ }).first()
      r.prevStripVisible = await strip2.isVisible().catch(() => false)
      // 3) clavier
      await lockZone2.focus()
      await page.keyboard.press('Enter'); await page.waitForTimeout(500)
      r.prevBeatAfterEnter = await page.locator('.pw-beat-in').isVisible().catch(() => false)
      // CTA du beat → paywall ?
      if (r.prevBeatAfterClick || r.prevBeatAfterEnter) {
        const cta = page.locator('.pw-beat-in button').first()
        if (await cta.isVisible().catch(() => false)) {
          await cta.click(); await page.waitForTimeout(1500)
          r.beatCtaToPaywall = await page.locator('[role="dialog"], .sg-v2-paywall-panel, [class*="paywall"], [class*="sg-modal"]').first().isVisible().catch(() => false)
          await page.screenshot({ path: path.join(OUT, `${label}-V-beat-cta-paywall.png`) })
        }
      }
    }
  }

  // safe-area / clipping check on the lock zone (horizontal overflow)
  r.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
  report.cases[label] = r
}

const browser = await chromium.launch()
const onlyDesk = process.argv.includes('--desktop-only')
const onlyMob = process.argv.includes('--mobile-only')

if (!onlyDesk) {
  const ctx = await browser.newContext({ ...devices['iPhone 12'], userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' })
  const page = await ctx.newPage()
  await journey(page, 'mobile')
  await ctx.close()
}
if (!onlyMob) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await ctx.newPage()
  await journey(page, 'desktop')
  await ctx.close()
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 1).slice(0, 4000))
console.log('OUT:', OUT)

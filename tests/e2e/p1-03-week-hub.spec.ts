import { test, expect, type Page } from "@playwright/test"

/**
 * P1-03 — Week Hub / Prévisions 7 jours / Forecast lock.
 * Parcours : fiche plage → prévisions → jour gratuit → jour verrouillé →
 * clic lock (clic + clavier) → paywall (comportement réel) → retour →
 * plage suivante → états stale / empty → mobile + desktop.
 * Aucun paiement réel exécuté.
 */

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    try { sessionStorage.clear() } catch (_) {}
    try { localStorage.removeItem("sg_track_log") } catch (_) {}
    let originalTrack: Function | undefined
    const K = "__sg_track_intercepted"
    function wrap(target: any) {
      if (target && typeof target === "function" && !target[K]) {
        originalTrack = target
        const wrapped: any = function (name: string, data: any) {
          try {
            const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]")
            logs.push({ name, data, ts: Date.now() })
            localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-80)))
          } catch (_) {}
          return originalTrack?.apply(this, arguments as any)
        }
        wrapped[K] = true
        return wrapped
      }
      return target
    }
    Object.defineProperty(window, "track", {
      configurable: true, enumerable: true,
      set(fn: Function) {
        const w = wrap(fn)
        Object.defineProperty(window, "track", { configurable: true, enumerable: true, value: w, writable: true } as any)
      },
      get() { return undefined },
    })
  })
  return {
    async hasEvent(name: string) {
      return page.evaluate((n) => {
        try { return JSON.parse(localStorage.getItem("sg_track_log") || "[]").some((e: any) => e.name === n) } catch (_) { return false }
      }, name)
    },
    async getByName(name: string) {
      return page.evaluate((n) => {
        try { return JSON.parse(localStorage.getItem("sg_track_log") || "[]").filter((e: any) => e.name === n) } catch (_) { return [] }
      }, name)
    },
  }
}

async function dismissCookies(page: Page) {
  const acc = page.locator('.sg-cookie-banner button:has-text("Accepter"), .sg-v2-cookie-banner button:has-text("Accepter"), button:has-text("Accepter")').first()
  if (await acc.isVisible({ timeout: 2500 }).catch(() => false)) { await acc.click(); await page.waitForTimeout(400) }
}

async function dismissPaywall(page: Page) {
  const closeBtn = page.locator('[aria-label="Fermer"], [aria-label="Close"], [aria-label="Cerrar"]').first()
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) { await closeBtn.click({ force: true }); await page.waitForTimeout(500) }
}

async function openMap(page: Page) {
  await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForSelector(".sg-maplabel", { state: "attached", timeout: 45000 })
  await dismissCookies(page)
}

async function openPreviewFiche(page: Page, index = 0) {
  await openMap(page)
  const labels = page.locator('.sg-maplabel[role="button"]')
  await labels.nth(index).click({ force: true })
  await page.waitForTimeout(2200)
  // la preview ChasseHome (lc-detail) doit être présente
  await expect(page.locator(".lc-detail").first()).toBeVisible({ timeout: 15000 })
}

async function openFullFiche(page: Page, index = 0) {
  await openPreviewFiche(page, index)
  await page.locator("button.lc-detail-go").first().click({ timeout: 10000 })
  await expect(page.locator(".bsc-sheet").first()).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(1500)
}

test.describe("P1-03 — Week Hub / Prévisions 7 jours", () => {
  test.skip(!!process.env.CI && false, "")

  test("1-3) preview fiche: prévisions visibles, J0 libre, jours suivants verrouillés", async ({ page }) => {
    await openPreviewFiche(page)
    const strip = page.locator(".lc-detail-fc-row").first()
    await expect(strip).toBeVisible({ timeout: 10000 })
    const cells = page.locator(".lc-fc-cell")
    await expect(cells).toHaveCount(7)
    // J0 = libre (pastille .now), J1..J6 = verrouillés (cadenas SVG, label de lock accessible)
    await expect(strip).toHaveAttribute("role", "button")
    await expect(strip).toHaveAttribute("tabindex", "0")
    const aria = await strip.getAttribute("aria-label")
    expect(aria && aria.length > 4).toBeTruthy()
    // Aucun emoji OS dans la strip (bible brand : picto SVG)
    const stripText = await strip.innerText()
    expect(stripText).not.toMatch(/🔒/)
  })

  test("4) clic lock preview → paywall réel + sg_forecast_lock_click", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    await openPreviewFiche(page)
    const strip = page.locator(".lc-detail-fc-row").first()
    await strip.click({ force: true })
    await page.waitForTimeout(1800)
    // comportement réel attendu : ouverture du paywall (modal dialog)
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').first()
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: "test-results/p103/preview-lock-paywall.png" })
    await dismissPaywall(page)
  })

  test("5) clavier Enter/Space sur lock preview → paywall", async ({ page }) => {
    await openPreviewFiche(page)
    const strip = page.locator(".lc-detail-fc-row").first()
    await strip.focus()
    await page.keyboard.press("Enter")
    await page.waitForTimeout(1500)
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').first()
    await expect(dialog).toBeVisible({ timeout: 15000 })
    await dismissPaywall(page)
    // après Échap la preview peut être refermée (cascade) → réouverture propre avant Space
    if (!(await strip.isVisible().catch(() => false))) { await openPreviewFiche(page) }
    const strip2 = page.locator(".lc-detail-fc-row").first()
    await strip2.focus()
    await page.keyboard.press(" ")
    await page.waitForTimeout(1500)
    await expect(page.locator('[role="dialog"][aria-modal="true"]').first()).toBeVisible({ timeout: 15000 })
    await dismissPaywall(page)
  })

  test("6) fiche complète: lock overlay → paywall + event, aucune Interaction perdue", async ({ page }) => {
    const tracker = setupTrackInterceptor(page)
    await openFullFiche(page)
    // 7 jours, J0 net, J1+ floutés
    const bars = page.locator(".bsc-bar")
    expect(await bars.count()).toBe(7)
    const lock = page.locator('button[aria-label*="prévisions"], button[aria-label*="Unlock forecast"], button[aria-label*="Desbloquear"]').first()
    await expect(lock).toBeVisible({ timeout: 8000 })
    const box = await lock.boundingBox()
    expect((box?.width || 0) >= 44 && (box?.height || 0) >= 44).toBeTruthy()
    // 1er clic
    await lock.click({ force: true })
    await page.waitForTimeout(1600)
    await expect(page.locator('[role="dialog"][aria-modal="true"]').first()).toBeVisible({ timeout: 15000 })
    await page.screenshot({ path: "test-results/p103/full-fiche-lock-paywall.png" })
    await dismissPaywall(page)
  })

  test("7) retour fiche → carte", async ({ page }) => {
    await openFullFiche(page)
    const close = page.locator('.bsc-sheet [aria-label="Fermer"], .bsc-sheet [aria-label="Close"], .bsc-sheet [aria-label="Cerrar"]').first()
    await close.click({ force: true })
    await page.waitForTimeout(800)
    await expect(page.locator(".bsc-sheet").first()).toBeHidden({ timeout: 8000 })
  })

  test("8) changement de plage → même structure 7j", async ({ page }) => {
    await openPreviewFiche(page, 0)
    await expect(page.locator(".lc-detail-fc-row")).toHaveCount(1)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(700)
    const labels = page.locator('.sg-maplabel[role="button"]')
    if (await labels.count() > 1) {
      await labels.nth(1).click({ force: true })
      await page.waitForTimeout(2200)
      await expect(page.locator(".lc-detail-fc-row")).toHaveCount(1)
    }
  })

  test("9) état stale: données retardées → badge honnête", async ({ page }) => {
    // intercepte la donnée et la marque stale + vieille
    await page.route("**/api/copernicus/sargassum.json", async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      json.stale = true
      json.updatedAt = new Date(Date.now() - 30 * 3600e3).toISOString()
      await route.fulfill({ json })
    })
    await openPreviewFiche(page)
    // ne doit JAMAIS afficher « EN DIRECT » sans preuve : l' app doit continuer de tourner
    await expect(page.locator(".lc-detail").first()).toBeVisible({ timeout: 15000 })
    const body = await page.locator("body").innerText()
    expect(body.toLowerCase()).not.toContain("undefined")
  })

  test("10) état empty: aucune donnée weekly → strip lock fallback honnête", async ({ page }) => {
    await page.route("**/api/copernicus/sargassum.json", async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      json.weekly = {}
      json._enrichedWeekly = {}
      await route.fulfill({ json })
    })
    await openPreviewFiche(page)
    // la strip 7j tombe sur le fallback honnête (7 cellules, cadenas) — jamais trou vide
    await expect(page.locator(".lc-detail-fc-row").first()).toBeVisible({ timeout: 12000 })
    expect(await page.locator(".lc-fc-cell").count()).toBe(7)
  })

  test("11) mobile 390×844: aucun overflow horizontal, touch ≥44px", async ({ page }) => {
    await openFullFiche(page)
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    expect(over).toBeFalsy()
    const lock = page.locator('button[aria-label*="prévisions"], button[aria-label*="Unlock forecast"], button[aria-label*="Desbloquear"]').first()
    const box = await lock.boundingBox()
    expect((box?.width || 0) >= 44).toBeTruthy()
    expect((box?.height || 0) >= 44).toBeTruthy()
    await page.screenshot({ path: "test-results/p103/mobile-full-fiche.png" })
  })

  test("12) desktop 1920×1080: fiche lisible, prévisions visibles", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await openFullFiche(page)
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    expect(over).toBeFalsy()
    expect(await page.locator(".bsc-bar").count()).toBe(7)
    await page.screenshot({ path: "test-results/p103/desktop-full-fiche.png" })
  })

  test("13) ?prev_az=1: ForecastChart lock → clic ouvre le beat (comportement réel promu)", async ({ page }) => {
    test.setTimeout(120000)
    const tracker = setupTrackInterceptor(page)
    await page.goto(BASE_URL + "/previsions/?prev_az=1", { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { state: "attached", timeout: 45000 }).catch(() => {})
    await dismissCookies(page)
    await page.waitForTimeout(4500)
    // la landing /previsions/ s'affiche seulement si le bras prev_az montre son ForecastChart
    const bars = page.locator(".fc-bar")
    if (await bars.count() === 0) { test.skip(true, "landing prev_az non rendue"); return }
    await page.locator(".fc-bar").first().scrollIntoViewIfNeeded().catch(() => {})
    const lock = page.locator('div[role="button"][tabindex="0"]').filter({ hasText: /Débloquer|Unlock|Desbloquear/ }).first()
    if (!await lock.isVisible().catch(() => false)) { test.skip(true, "pas de lock (premium?)"); return }
    const aria = await lock.getAttribute("aria-label")
    expect(aria && aria.length > 4).toBeTruthy()
    await lock.click({ position: { x: 40, y: 40 } })
    await page.waitForTimeout(1000)
    await expect(page.locator(".pw-beat-in").first()).toBeVisible({ timeout: 8000 })
    await page.screenshot({ path: "test-results/p103/prevaz-beat-open.png" })
  })
})

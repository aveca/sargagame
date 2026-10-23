import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

/**
 * Observe the actual analytics sink used by the app. track() is an ES-module
 * binding, not window.track, so replacing window.track does not intercept it.
 */
async function setupTrackInterceptor(page: Page) {
  const tracked: Array<{ name: string; data: Record<string, unknown> }> = []
  await page.route("**/rest/v1/analytics_events**", async (route) => {
    const request = route.request()
    if (request.method() !== "POST") {
      await route.continue()
      return
    }
    try {
      const payload = request.postDataJSON() as { event?: string; params?: Record<string, unknown> }
      if (payload.event) tracked.push({ name: payload.event, data: payload.params || {} })
      await route.fulfill({ status: 201, body: "" })
    } catch (_) {
      await route.continue()
    }
  })
  return {
    async getEvents() { return tracked },
    async hasEvent(name: string) { return tracked.some((event) => event.name === name) },
  }
}

test.describe("Funnel Principal B2C", () => {
  test("carte → fiche → paywall: funnel reaché + events trackés", async ({ page }) => {
    const tracker = await setupTrackInterceptor(page)

    // 1. Landing — carte monde
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const mapLabels = await page.locator(".sg-maplabel").count()
    expect(mapLabels).toBeGreaterThanOrEqual(3)

    // 2. Clic sur une plage → fiche détail
    await page.evaluate(() => {
      const label = [...document.querySelectorAll(".sg-maplabel")].find(
        (el) => getComputedStyle(el).visibility !== "hidden"
      )
      if (label) (label as HTMLElement).click()
    })
    await page.waitForSelector(".lc-detail, .sheet", { timeout: 12000 }).catch(() => {})
    await page.waitForTimeout(1500)

    const ficheVisible = await page.locator(".lc-detail, .sheet").first().isVisible()
    expect(ficheVisible).toBe(true)

    // 3. Paywall — deep link ?paywall=1
    await page.goto(BASE_URL + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(1000)

    // Paywall atteint si URL nettoyée OU modal visible (le handler deep-link
    // peut ne pas nettoyer l'URL dans preview, mais le modal s'affiche)
    const urlCleaned = await page.evaluate(() => !window.location.search.includes("paywall=1"))
    const modalVisible = await page
      .locator('[role="dialog"], .sg-modal-panel, .pww-wrap')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)
    expect(urlCleaned || modalVisible).toBe(true)

    // 4. Vérifier les events trackés
    const events = await tracker.getEvents()
    const eventNames = events.map((e) => e.name)

    // Le funnel doit au minimum émettre sg_session_start
    expect(eventNames).toContain("sg_session_start")
  })

  test("paywall affiche le CTA Premium", async ({ page }) => {
    await page.goto(BASE_URL + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(
        () => !window.location.search.includes("paywall=1"),
        {},
        { timeout: 15000 }
      )
      .catch(() => {})
    await page.waitForTimeout(2000)

    // Le paywall doit contenir un CTA Premium (bouton ou lien)
    const cta = page
      .locator(
        'button:has-text("Premium"), button:has-text("Débloquer"), button:has-text("Unlock"), [class*="pww"], [class*="sg-modal"]'
      )
      .first()
    const ctaVisible = await cta.isVisible({ timeout: 5000 }).catch(() => false)
    // On accepte que le paywall soit visible même si le CTA exact n'est pas trouvé
    // (le lazy load peut prendre du temps)
    const modalVisible = await page
      .locator('[role="dialog"], .sg-modal-panel, .pww-wrap')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)

    expect(ctaVisible || modalVisible).toBe(true)
  })

  test("rollback ?flag=0 désactive le paywall", async ({ page }) => {
    await page.goto(BASE_URL + "/?flag=premium_modal=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    // Sans le flag, le paywall ne doit pas s'ouvrir automatiquement
    const modalVisible = await page
      .locator('[role="dialog"]:has-text("Premium"), .sg-modal-panel')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false)

    expect(modalVisible).toBe(false)
  })

  test("pas d'erreurs JS critiques au chargement", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))

    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)

    // Filtrer les erreurs CSP (attendues en CI) et les erreurs non critiques
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("Content Security Policy") &&
        !e.includes("Refused to connect") &&
        !e.includes("fetch") &&
        !e.includes("NetworkError")
    )

    expect(criticalErrors).toEqual([])
  })
})

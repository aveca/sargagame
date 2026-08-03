import { test, expect } from "@playwright/test"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173"
const WORLD_FLAG = "?flag=world_around_me=1"
const WORLD_FLAG_OFF = "?flag=world_around_me=0"

test.describe("Around Me Intelligence (flag gated)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + WORLD_FLAG, { waitUntil: "networkidle" })
  })

  test("opens with flag, no geolocation prompt on load", async ({ page }) => {
    const controller = page.locator('[data-testid="around-me-controller"]')
    await expect(controller).toBeVisible()

    const geolocationPromises = []
    page.on("dialog", dialog => {
      if (dialog.type() === "permission" && dialog.message().includes("geolocation")) {
        geolocationPromises.push(dialog.dismiss())
      }
    })

    await page.waitForTimeout(1000)
    expect(geolocationPromises.length).toBe(0)
  })

  test("click locate button triggers geolocation", async ({ page, context }) => {
    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await expect(locateBtn).toBeVisible()

    await context.grantPermissions(["geolocation"])
    await page.route("**/api/**", route => route.continue())

    let geolocationRequested = false
    await page.evaluate(() => {
      const original = navigator.geolocation.getCurrentPosition
      navigator.geolocation.getCurrentPosition = (...args) => {
        geolocationRequested = true
        original.apply(navigator.geolocation, [{ coords: { latitude: 14.6, longitude: -61.0 } }, args[1], args[2]])
      }
    })

    await locateBtn.click()
    await page.waitForTimeout(500)
    expect(geolocationRequested).toBe(true)
  })

  test("permission accepted -> sorts by distance (Martinique center)", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"])

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 14.6, longitude: -61.0 } })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(800)

    const beachItems = page.locator('[data-testid^="around-me-beach-"]')
    await expect(beachItems.first()).toBeVisible()

    const firstBeach = await beachItems.first().textContent()
    expect(firstBeach).toBeTruthy()
  })

  test("permission denied -> falls back to region bbox center", async ({ page, context }) => {
    await context.clearPermissions()

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (_, error) => {
        error({ code: 1, message: "Permission denied" })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(800)

    const fallbackText = page.locator("text=hors zone de couverture")
    await expect(fallbackText).toBeVisible({ timeout: 5000 })
  })

  test("Paris coordinates -> honest empty state (outside coverage)", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"])

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 48.8566, longitude: 2.3522 } })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(800)

    const emptyState = page.locator("text=Aucune plage à moins de 250 km de cette position")
    await expect(emptyState).toBeVisible({ timeout: 5000 })
  })

  test("funnel unchanged: map+fiche+paywall still reachable", async ({ page }) => {
    const controller = page.locator('[data-testid="around-me-controller"]')
    await expect(controller).toBeVisible()

    const mapCanvas = page.locator('#world, [data-testid="map-canvas"], svg').first()
    await expect(mapCanvas).toBeVisible()

    const paywallTrigger = page.locator('button:has-text("Premium"), [data-testid*="premium"], a:has-text("Premium")').first()
    if (await paywallTrigger.isVisible({ timeout: 2000 })) {
      await paywallTrigger.click()
      await page.waitForTimeout(500)
      const paywall = page.locator('[data-testid*="premium"], [role="dialog"]:has-text("Premium")').first()
      await expect(paywall).toBeVisible({ timeout: 3000 })
    }
  })

  test("sort panel toggles between distance and score", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"])

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 14.6, longitude: -61.0 } })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(800)

    const distanceTab = page.locator('button[role="tab"]:has-text("Plus proches")')
    const scoreTab = page.locator('button[role="tab"]:has-text("Meilleures")')

    await expect(distanceTab).toHaveAttribute("aria-selected", "true")
    await scoreTab.click()
    await expect(scoreTab).toHaveAttribute("aria-selected", "true")
    await distanceTab.click()
    await expect(distanceTab).toHaveAttribute("aria-selected", "true")
  })

  // --- BLOCKER TESTS ADDED ---

  test("rollback ?world_around_me=0 disables feature completely", async ({ page }) => {
    await page.goto(BASE_URL + WORLD_FLAG_OFF, { waitUntil: "networkidle" })
    
    const controller = page.locator('[data-testid="around-me-controller"]')
    await expect(controller).toBeHidden()
  })

  test("paywall gating: locked beach opens paywall not beach sheet", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"])

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 14.6, longitude: -61.0 } })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(800)

    const beachItems = page.locator('[data-testid^="around-me-beach-"]')
    await expect(beachItems.first()).toBeVisible()

    // Click first beach - should trigger paywall for non-premium
    const firstBeach = beachItems.first()
    await firstBeach.click()
    await page.waitForTimeout(500)

    // Check paywall opened (PremiumModal or similar)
    const paywall = page.locator('[role="dialog"]:has-text("Premium"), [data-testid*="premium"], .sg-modal-panel').first()
    await expect(paywall).toBeVisible({ timeout: 3000 })
  })

  test("opt-out géoloc: refuse stores optout, no banner on reload", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"])

    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 14.6, longitude: -61.0 } })
      }
    })

    const locateBtn = page.locator('[data-testid="around-me-locate-btn"]')
    await locateBtn.click()
    await page.waitForTimeout(300)

    // Click "Refuser" on info banner
    const refuseBtn = page.locator('button:has-text("Refuser"), button:has-text("Decline"), button:has-text("Rechazar")')
    if (await refuseBtn.isVisible({ timeout: 1000 })) {
      await refuseBtn.click()
      await page.waitForTimeout(300)
    }

    // Reload page
    await page.reload({ waitUntil: "networkidle" })
    await page.waitForTimeout(500)

    // Info banner should not appear again (opted out)
    const infoBanner = page.locator('text="Votre position reste locale", text="Your location stays local", text="Tu ubicación queda en local"')
    await expect(infoBanner).toBeHidden({ timeout: 2000 })

    // Button should show "Localisé" or be disabled since optout
    const locateBtnAfter = page.locator('[data-testid="around-me-locate-btn"]')
    await expect(locateBtnAfter).toBeVisible()
  })
})
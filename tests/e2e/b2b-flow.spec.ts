import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

test.describe("B2B Pro Flow", () => {
  test("pro pricing page loads with CTA buttons", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    const body = await page.locator("body").textContent()
    const hasProContent =
      body.includes("Pro") ||
      body.includes("pro") ||
      body.includes("Hôtel") ||
      body.includes("Hotel") ||
      body.includes("business")
    expect(hasProContent).toBe(true)

    const ctaButtons = page.locator(
      'button:has-text("Contacter"), button:has-text("Contact"), button:has-text("Essai"), button:has-text("Trial"), button:has-text("Démo"), button:has-text("Demo"), a:has-text("Contacter"), a:has-text("Contact"), a:has-text("Essai"), a:has-text("Trial")'
    )
    const ctaCount = await ctaButtons.count()
    expect(ctaCount).toBeGreaterThanOrEqual(1)
  })

  test("trial form accepts email and submits", async ({ page }) => {
    await page.goto(BASE_URL + "/pro/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    const emailInput = page
      .locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"], input[name="email"]')
      .first()
    const hasEmailInput = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasEmailInput) {
      await emailInput.fill("test-b2b@example.com")

      const submitBtn = page
        .locator(
          'button[type="submit"], button:has-text("Envoyer"), button:has-text("Submit"), button:has-text("Envía"), button:has-text("Envoyer mon email")'
        )
        .first()
      const hasSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)

      if (hasSubmit) {
        await submitBtn.click()
        await page.waitForTimeout(1500)

        const confirmation = page.locator(
          'text=/merci|thank|gracias|confirmé|confirmed|envoyé|sent/i'
        )
        const confirmationVisible = await confirmation.isVisible({ timeout: 5000 }).catch(() => false)
        expect(confirmationVisible).toBe(true)
      }
    }
  })

  test("no horizontal scroll on /pro/ at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(BASE_URL + "/pro/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})

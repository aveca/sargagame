import { test, expect, type Page } from "@playwright/test"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

async function openPaidPaywall(page: Page) {
  await page.goto(BASE_URL + "/?paywall=1&pay=mollie&pay_capture=0&pwcomic=1", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  const modal = page.locator('[role="dialog"], .pww-wrap').first()
  await expect(modal).toBeVisible({ timeout: 15000 })

  const cta = page.locator(".pww-gobtn").first()
  await expect(cta).toBeVisible({ timeout: 10000 })
  await cta.click()

  const email = page.locator('input[type="email"][aria-label*="E-mail"], input[type="email"]').first()
  await expect(email).toBeVisible({ timeout: 10000 })
  await email.fill("qa@example.com")

  const payButton = page.locator("button.sg-paygold").first()
  await expect(payButton).toBeVisible({ timeout: 15000 })
  return payButton
}

test.describe("Funnel payant — Mollie mocked", () => {
  test("verdict/paywall → checkout Mollie est atteignable sans transaction réelle", async ({ page }) => {
    let createCheckoutBody: Record<string, unknown> | null = null

    await page.route("**/api/mollie.php", async (route) => {
      const request = route.request()
      if (request.method() === "POST") {
        try {
          const body = request.postDataJSON() as Record<string, unknown>
          if (body.action === "create_subscription" || body.action === "create_payment") {
            createCheckoutBody = body
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({
                paymentId: "pay_test_playwright",
                checkoutUrl: "https://www.mollie.com/checkout/test-playwright",
              }),
            })
            return
          }
        } catch (_) {}
      }
      await route.continue()
    })

    const payButton = await openPaidPaywall(page)

    await page.route("https://www.mollie.com/checkout/test-playwright", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Mollie mock checkout</title><p>Mock checkout</p>",
      })
    })

    const requestPromise = page.waitForRequest((request) => {
      if (!request.url().includes("/api/mollie.php") || request.method() !== "POST") return false
      try {
        const body = request.postDataJSON() as Record<string, unknown>
        return body.action === "create_subscription" || body.action === "create_payment"
      } catch {
        return false
      }
    }, { timeout: 15000 })

    await payButton.click()
    await requestPromise

    expect(createCheckoutBody).not.toBeNull()
    expect(["create_subscription", "create_payment"]).toContain(createCheckoutBody?.action)

    await expect(page).toHaveURL("https://www.mollie.com/checkout/test-playwright", { timeout: 10000 })
  })

  test("un échec Mollie reste visible et ne devient pas un faux succès", async ({ page }) => {
    await page.route("**/api/mollie.php", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Payment failed" }),
        })
        return
      }
      await route.continue()
    })

    const payButton = await openPaidPaywall(page)
    await payButton.click()

    const alert = page.locator('[role="alert"]').first()
    await expect(alert).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Paiement impossible|Payment failed|Pago imposible/i).first()).toBeVisible()
  })
})

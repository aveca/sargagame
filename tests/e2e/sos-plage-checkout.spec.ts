import { test, expect } from "@playwright/test"

const BASE_URL = (process.env.PREVIEW_URL || "http://127.0.0.1:4173").replace(/\/$/, "")
const PAYMENT_ID = "tr_SOSmock20261029"

test.describe("SOS Plage — modal and payment funnel (Mollie mocked)", () => {
  test("modal renders semantic HTML in a centered, bounded panel", async ({ page }, testInfo) => {
    await page.goto(BASE_URL + "/?sos=1", { waitUntil: "domcontentloaded", timeout: 60000 })

    const panel = page.locator('[data-sos-plage="true"]')
    await expect(panel).toBeVisible({ timeout: 20000 })
    await expect(panel).toHaveAttribute("role", "dialog")
    await expect(panel).toHaveAttribute("aria-modal", "true")

    const title = page.locator("#sos-plage-title")
    await expect(title).toContainText("demain")
    expect(await title.innerText()).not.toContain("<span")

    const benefits = page.locator('[data-testid="sos-benefits"]')
    await expect(benefits).toBeVisible()
    expect(await benefits.innerText()).not.toContain("<br")

    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    expect(rect!.width).toBeLessThanOrEqual(640)
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.y).toBeGreaterThanOrEqual(0)

    const cta = page.locator("#sos-plage-cta")
    await expect(cta).toBeVisible()
    const ctaRect = await cta.boundingBox()
    expect(ctaRect?.height ?? 0).toBeGreaterThanOrEqual(48)

    await page.screenshot({ path: testInfo.outputPath("sos-plage-modal.png"), fullPage: true })
  })

  test("checkout persists context and the Mollie return unlocks the SOS pass", async ({ page }) => {
    let createPaymentBody: any = null

    await page.route("**/api/mollie", async route => {
      createPaymentBody = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkoutUrl: BASE_URL + "/__mollie_checkout_mock",
          paymentId: PAYMENT_ID,
        }),
      })
    })
    await page.route("**/__mollie_checkout_mock", async route => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Mock Mollie checkout</title><main>Mock checkout — no real payment</main>",
      })
    })

    await page.goto(BASE_URL + "/?sos=1", { waitUntil: "domcontentloaded", timeout: 60000 })
    const selector = page.locator('[data-sos-plage="true"] select')
    await expect(selector).toBeVisible({ timeout: 20000 })
    await selector.selectOption("mq001")

    await page.locator("#sos-plage-cta").click()
    await page.waitForURL("**/__mollie_checkout_mock", { timeout: 15000 })

    expect(createPaymentBody).toMatchObject({
      action: "create_payment",
      pass: "sos",
      cents: 100,
      cur: "eur",
      source: "sos_plage",
    })
    expect(createPaymentBody.redirectUrl).toBe(BASE_URL + "/?mollie_return=1")
    expect(createPaymentBody.metadata.beach).toBe("mq001")

    const pending = await page.evaluate(() => ({
      session: JSON.parse(sessionStorage.getItem("sg_mollie_pending") || "null"),
      local: JSON.parse(localStorage.getItem("sg_mollie_pending") || "null"),
    }))
    for (const context of [pending.session, pending.local]) {
      expect(context).toMatchObject({
        paymentId: PAYMENT_ID,
        pass: "sos",
        days: 1,
        source: "sos_plage",
        beachId: "mq001",
      })
    }

    await page.route("**/api/mollie.php", async route => {
      const body = route.request().postDataJSON()
      if (body.action === "payment_status") {
        expect(body.paymentId).toBe(PAYMENT_ID)
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ paid: true, status: "paid", paymentId: PAYMENT_ID, granted: true }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(BASE_URL + "/?mollie_return=1", { waitUntil: "domcontentloaded", timeout: 60000 })
    await expect.poll(
      () => page.evaluate(() => Number(localStorage.getItem("sg_premium_pass_end") || 0)),
      { timeout: 15000 },
    ).toBeGreaterThan(Date.now())
    await expect.poll(
      () => page.evaluate(() => localStorage.getItem("sg_mollie_done_tr_SOSmock20261029")),
      { timeout: 15000 },
    ).toBe("1")
    await expect.poll(
      () => page.evaluate(() => localStorage.getItem("sg_mollie_pending")),
      { timeout: 15000 },
    ).toBeNull()
  })
})

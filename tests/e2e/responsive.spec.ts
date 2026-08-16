import { test, expect } from "@playwright/test"
import { selectors } from "../utils/selectors"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

test.describe("Responsive Layouts", () => {
  test("map loads with visible pins", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const mapLabels = await page.locator(".sg-maplabel").count()
    expect(mapLabels).toBeGreaterThanOrEqual(3)
  })

  test("BottomNav visible", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const nav = page.locator(selectors.bottomNav).first()
    await expect(nav).toBeVisible({ timeout: 5000 })
  })

  test("no horizontal scroll", async ({ page }) => {
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2000)

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})

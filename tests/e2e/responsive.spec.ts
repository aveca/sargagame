import { test, expect } from "@playwright/test"
import { selectors } from "../utils/selectors"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

const viewports = [
  { name: "Mobile", width: 390, height: 844, isMobile: true },
  { name: "Tablet", width: 768, height: 1024, isMobile: false },
  { name: "Desktop", width: 1440, height: 900, isMobile: false },
]

test.describe("Responsive Layouts", () => {
  for (const vp of viewports) {
    test.describe(`${vp.name} (${vp.width}×${vp.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height })
      })

      test("map loads with visible pins", async ({ page }) => {
        await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
        await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
        await page.waitForTimeout(2000)

        const mapLabels = await page.locator(".sg-maplabel").count()
        expect(mapLabels).toBeGreaterThanOrEqual(3)
      })

      test("BottomNav visible on mobile, hidden on tablet/desktop", async ({ page }) => {
        await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
        await page.waitForSelector(".sg-maplabel", { timeout: 30000 }).catch(() => {})
        await page.waitForTimeout(2000)

        const nav = page.locator(selectors.bottomNav).first()
        const navVisible = await nav.isVisible({ timeout: 3000 }).catch(() => false)

        if (vp.isMobile) {
          expect(navVisible).toBe(true)
        } else {
          expect(navVisible).toBe(false)
        }
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
  }
})

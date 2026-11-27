import { test, expect } from "@playwright/test"
import { stubFreshSatellite } from "./helpers/satellite-freshness"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const VIEWPORTS = [320, 375, 390, 430]
const ROUTES = ["/", "/recherche/", "/offres/", "/sargasses-pres-de-moi/"]

test.describe("PWA mobile installable (SARG-MOBILE-PWA-EXPERIENCE-20261126)", () => {
  for (const width of VIEWPORTS) {
    test(`aucun debordement horizontal a ${width}px (accueil + parcours)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 })
      await stubFreshSatellite(page)
      for (const route of ROUTES) {
        await page.goto(BASE_URL + route, { waitUntil: "load", timeout: 60000 })
        await page.waitForTimeout(1200)
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScroll: document.body.scrollWidth,
        }))
        expect(
          metrics.scrollWidth,
          `debordement horizontal sur ${route} a ${width}px`
        ).toBeLessThanOrEqual(metrics.clientWidth + 1)
        expect(metrics.bodyScroll).toBeLessThanOrEqual(metrics.clientWidth + 1)
      }
    })
  }

  test("CTA principal : cible tactile >= 44px a 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 820 })
    await stubFreshSatellite(page)
    await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 })
    const cta = page.locator('[data-testid="cta-trouve-ta-plage"]')
    await expect(cta).toBeVisible({ timeout: 30000 })
    const box = await cta.boundingBox()
    expect(box, "CTA sans boite englobante").not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test("manifest + icones + raccourcis servis en 200", async ({ request }) => {
    const res = await request.get(BASE_URL + "/manifest.json")
    expect(res.status()).toBe(200)
    const manifest = await res.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(1)
    for (const icon of manifest.icons) {
      const r = await request.get(BASE_URL + icon.src)
      expect(r.status(), `icone ${icon.src}`).toBe(200)
      expect(r.headers()["content-type"]).toContain(icon.type.split("/")[0])
    }
    for (const shortcut of manifest.shortcuts) {
      const r = await request.get(BASE_URL + shortcut.url)
      expect(r.status(), `raccourci ${shortcut.url}`).toBe(200)
    }
  })

  // La coquille service worker (enregistrement + hors-ligne) est testee dans
  // `mobile-pwa-service-worker.spec.ts` : le projet `mobile-chromium` est en
  // realite WebKit (device iPhone 12) et le WebKit embarque par Playwright ne
  // supporte pas les service workers. Les parcours iOS restent couverts ici
  // (rendu, debordement, cible tactile).
})
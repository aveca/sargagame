import { test, expect } from "@playwright/test"

/**
 * MASTER TAKEOVER (2026-09-22) — parcours assemblé par défaut.
 *
 * 1. HOME par défaut = décision (xp-home) — ?homefirst=0 = carte (rollback).
 * 2. BEACH → TRIP : la fiche propose « Planifier mon séjour » → overlay.
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"

test.describe("Takeover — nouveau default", () => {
  test("HOME par défaut affiche la décision du jour (sans clic d'onglet)", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const home = page.locator('[data-testid="xp-home"]')
    await expect(home).toBeVisible({ timeout: 15000 })
    // Decision content visible : meilleur choix ou badge de situation
    const text = (await home.innerText()).replace(/\s+/g, " ")
    expect(text.length).toBeGreaterThan(60)
  })

  test("rollback ?homefirst=0 → carte vue d'abord", async ({ page }) => {
    await page.goto(BASE + "/?homefirst=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const home = page.locator('[data-testid="xp-home"]')
    await page.waitForTimeout(1500)
    expect(await home.count()).toBe(0)
  })

  test("HOME → BEACH → TRIP : la fiche mène au séjour", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const home = page.locator('[data-testid="xp-home"]')
    await expect(home).toBeVisible({ timeout: 15000 })
    const best = page.locator('[data-testid="xp-best-open"], [data-testid="xp-open"]').first()
    await best.click()
    await page.waitForTimeout(1800)
    // Fiche = takeover BeachExperience (bx-experience, défaut 2026-09-23) ou
    // variantes fiches legacy (bsc-sheet/lc-detail/sheet) — même définition que ux-smoke.
    const fiche = page.locator('.bsc-sheet, .lc-detail, .sheet, [data-testid="bx-experience"]').first()
    await expect(fiche).toBeVisible({ timeout: 10000 })
    const trip = page.locator('button:has-text("Planifier mon séjour"), button:has-text("Plan my stay"), button:has-text("Planificar mi estancia"), [data-testid="exp-trip-open"]').first()
    if (await trip.count()) {
      await trip.scrollIntoViewIfNeeded().catch(() => {})
      await trip.click()
      await page.waitForTimeout(1200)
      const overlay = page.locator('[role="dialog"][aria-modal="true"]').last()
      expect(await overlay.isVisible({ timeout: 6000 }).catch(() => false)).toBe(true)
    } else {
      throw new Error("entrée trip absente de la fiche")
    }
  })
})

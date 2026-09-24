import { test, expect } from "@playwright/test"

/**
 * HOME WOW « LE POULS DE LA MER » (2026-09-24) — workstream home/discovery.
 * 1. Home = ligne de balises réelle (drag → focus → fiche), données live.
 * 2. Rollback ?sgwow=0 → ancien home, aucun rail.
 * 3. Chips statut = seek de la ligne.
 * 4. Desktop 1440 : rail pleine largeur, focus + trip côte à côte.
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"

async function waitHome(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
  await page.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 })
  await page.waitForTimeout(2500)
}

test.describe("HOME WOW — ligne de balises", () => {
  test("rail visible, buoys réels, focus → fiche via CTA", async ({ page }) => {
    await waitHome(page)
    const rail = page.locator('[data-testid="wow-rail"]')
    await expect(rail).toBeVisible({ timeout: 10000 })
    const buoys = page.locator('[data-testid="wow-buoy"]')
    expect(await buoys.count()).toBeGreaterThanOrEqual(3)
    // La carte focus = la bouée centrée (même beach id)
    const focus = page.locator('[data-testid="wow-focus"]')
    await expect(focus).toBeVisible()
    const focusBeach = await focus.getAttribute("data-beach")
    expect(focusBeach).toBeTruthy()
    const activeBuoy = page.locator('[data-testid="wow-buoy"][data-on="1"]')
    await expect(activeBuoy).toHaveCount(1)
    // Cliquer une autre bouée → le focus change (INTERACTION, pas animation)
    const other = page.locator('[data-testid="wow-buoy"]:not([data-on="1"])').nth(2)
    const otherId = await other.getAttribute("data-beach")
    if (otherId && otherId !== focusBeach) {
      await other.click()
      await expect(focus).toHaveAttribute("data-beach", otherId, { timeout: 4000 })
    }
    // ACTION : le CTA or ouvre la fiche (funnel inchangé)
    await page.locator('[data-testid="xp-best-open"]').first().click()
    await page.waitForTimeout(1800)
    const fiche = page.locator('.bsc-sheet, .lc-detail, .sheet, [data-testid="bx-experience"]').first()
    await expect(fiche).toBeVisible({ timeout: 10000 })
  })

  test("chips statut = seek de la ligne", async ({ page }) => {
    await waitHome(page)
    const before = await page.locator('[data-testid="wow-focus"]').getAttribute("data-beach")
    const chip = page.locator('[data-testid="wow-seek-avoid"], [data-testid="wow-seek-mod"]').first()
    if (await chip.count()) {
      await chip.click()
      await page.waitForTimeout(900)
      const after = await page.locator('[data-testid="wow-focus"]').getAttribute("data-beach")
      expect(after).not.toBe(before)
    }
  })

  test("rollback ?sgwow=0 → ancien home, zéro rail", async ({ page }) => {
    await page.goto(BASE + "/?sgwow=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector('[data-testid="xp-home"]', { timeout: 20000 })
    await page.waitForTimeout(1500)
    expect(await page.locator('[data-testid="wow-rail"]').count()).toBe(0)
    await expect(page.locator('[data-testid="xp-best-open"], [data-testid="xp-best-more"]').first()).toBeVisible({ timeout: 8000 })
  })
})

test.describe("HOME WOW — desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test("grille 2 colonnes : rail pleine largeur, focus + entrées côte à côte", async ({ page }) => {
    await waitHome(page)
    await expect(page.locator('[data-testid="wow-rail"]')).toBeVisible({ timeout: 10000 })
    const railBox = await page.locator('[data-testid="wow-rail"]').boundingBox()
    const focusBox = await page.locator(".wow-focuswrap").boundingBox()
    const tripBox = await page.locator(".wow-tripwrap").boundingBox()
    expect(railBox.width).toBeGreaterThan(900)
    expect(Math.abs(focusBox.y - tripBox.y)).toBeLessThan(60) // même rangée
    expect(focusBox.x).toBeLessThan(tripBox.x)
  })
})

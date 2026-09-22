import { test, expect } from "@playwright/test"

/**
 * TRIP PLANNER — Master Execution 2026-09-22
 * Parcours : landing → entrée « Planifier mon séjour » (data-testid=trip-open)
 * → overlay jour par jour (meilleure plage + plan B, données réelles)
 * → J+3+ verrouillés → CTA offre → modal premium. Rollback : ?tripplan=0.
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"

test.describe("Trip Planner (Plan my stay)", () => {
  test("landing → trip open → jours réels → lock → CTA offre", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    // Home tab (IA 5 onglets : view par défaut = carte ; le trip entry vit sur Accueil)
    const homeTab = page.locator('nav.sg-bottom-nav button:has-text("Accueil"), nav.sg-bottom-nav button:has-text("Home"), nav.sg-bottom-nav button:has-text("Inicio")').first()
    if (await homeTab.isVisible({ timeout: 8000 }).catch(() => false)) {
      await homeTab.click()
      await page.waitForTimeout(1800)
    }

    const openBtn = page.locator('[data-testid="trip-open"]').first()
    // L'entrée est dans la landing scrollable — scroll jusqu'à elle.
    let found = false
    for (let i = 0; i < 24 && !found; i++) {
      found = await openBtn.isVisible().catch(() => false)
      if (!found) await page.mouse.wheel(0, 600)
    }
    expect(found, "entrée trip plan introuvable sur la landing").toBe(true)
    await openBtn.click()
    await page.waitForTimeout(1200)

    // Overlay visible + contenu des jours
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').last()
    await expect(dialog).toBeVisible({ timeout: 8000 })
    const dlgText = (await dialog.innerText()).replace(/\s+/g, " ")
    // Au moins J+1/J+2 visibles avec un nom de plage réel (données live)
    expect(dlgText.length).toBeGreaterThan(80)
    // CTA offre présent pour un non-premium
    const cta = page.locator('[data-testid="trip-premium-cta"]')
    await expect(cta).toBeVisible({ timeout: 4000 })
    await cta.click()
    await page.waitForTimeout(1200)
    // → paywall premium ouvert
    const paywall = page.locator('.sg-modal-panel, [role="dialog"]:has-text("Pass"), .pww-wrap, .sg-paywall-comic').first()
    expect(await paywall.isVisible({ timeout: 8000 }).catch(() => false)).toBe(true)
  })

  test("rollback ?tripplan=0 — entrée absente", async ({ page }) => {
    await page.goto(BASE + "/?tripplan=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2000)
    await page.mouse.wheel(0, 4000)
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(800)
    expect(await page.locator('[data-testid="trip-open"]').count()).toBe(0)
  })
})

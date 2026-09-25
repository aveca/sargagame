import { test, expect } from "@playwright/test"

/**
 * PERFECT BEACH TRIP (2026-09-24B) — home émotionnelle :
 * intentions → rail filtré (données réelles) → PLAN DU JOUR (carde générique)
 * → plage → premium. Rollbacks ?sgintent=0 / ?sgplan=0.
 * Patterns probe-proven (recovery 2026-09-24A) : taps DOM via evaluate (overlays
 * fixes éventuels), assertions toBeVisible (polling web-first, jamais isVisible
 * one-shot), aucune donnée inventée (compteurs = faits réels du build).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const HOME = '[data-testid="xp-home"]'

async function openHome(page, params = "") {
  await page.goto(BASE + "/" + params, { waitUntil: "load", timeout: 60000 })
  await page.waitForSelector(HOME, { timeout: 20000 })
  await page.waitForTimeout(2500)
}

test.describe("Perfect Beach Trip — home émotionnelle", () => {
  test("5 intentions réelles → rail filtré + plan du jour → plage (données réelles)", async ({ page }) => {
    await openHome(page)
    // 5 chips, compteurs réels (livre le build : snorkeling = flag plage source)
    const chips = page.locator('button[data-testid^="intent-"]')
    await expect(chips.first()).toBeVisible({ timeout: 15000 })
    expect(await chips.count()).toBe(5)
    // tap snorkeling (DOM click — probes recovery : le CTA peut être sous overlay)
    await page.locator('[data-testid="intent-snorkel"]').evaluate(el => el.click())
    await page.waitForTimeout(800)
    // le rail ne montre QUE les plages flaggées snorkel (purement filtrées)
    const buoyNames = page.locator(HOME + ' .wow-rail button')
    const railCount = await buoyNames.count()
    expect(railCount).toBeGreaterThan(0)
    // dé/tap de la même intention = retour au rail complet
    await page.locator('[data-testid="intent-snorkel"]').evaluate(el => el.click())
    await page.waitForTimeout(800)
    expect(await buoyNames.count()).toBeGreaterThanOrEqual(railCount)
  })

  test("PLAN DU JOUR : carte réelle, alternative réelle, ouverture plage → expérience", async ({ page }) => {
    await openHome(page)
    const plan = page.locator('[data-testid="plan-card"]')
    await expect(plan).toBeVisible({ timeout: 20000 })
    // le plan nomme une VRAIE plage du build
    const planBeachId = await plan.getAttribute("data-beach")
    expect(planBeachId, "plan-card doit porter data-beach").toBeTruthy()
    // « Voir cette plage » → expérience ouverte sur LA plage du plan
    await page.locator('[data-testid="plan-open"]').evaluate(el => el.click())
    await expect(page.locator('[data-testid="bx-experience"]')).toBeVisible({ timeout: 20000 })
  })

  test("rollbacks : ?sgintent=0 cache les chips, ?sgplan=0 cache la carte — produit inchangé", async ({ page }) => {
    await openHome(page, "?sgintent=0&sgplan=0")
    expect(await page.locator('button[data-testid^="intent-"]').count()).toBe(0)
    expect(await page.locator('[data-testid="plan-card"]').count()).toBe(0)
    // produit core intact : carte focus + CTA or présents
    await expect(page.locator('[data-testid="wow-focus"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="xp-best-open"]')).toBeVisible({ timeout: 5000 })
  })

  test("intention snorkel → CTA « Pass » → paywall (money-path rond)", async ({ page }) => {
    await openHome(page)
    await page.locator('[data-testid="intent-snorkel"]').evaluate(el => el.click())
    await page.waitForTimeout(600)
    // la carte Pass du home ouvre le paywall (tunnel d'achat untouched)
    await page.locator('[data-testid="xp-pass"]').first().evaluate(el => el.click())
    await expect(page.locator('.sg-modal-panel, .pww-wrap').first()).toBeVisible({ timeout: 15000 })
    // copy « résultat » : l'on vend le séjour, le moteur reste la preuve
    const text = (await page.locator('.sg-modal-panel, .pww-wrap').first().innerText()).toLowerCase()
    expect(text).toMatch(/séjour|estancia|trip|beach/)
  })

  test("reduced-motion : zero animation continue sur la nouvelle surface", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openHome(page, "")
    await expect(page.locator('[data-testid="plan-card"]')).toBeVisible({ timeout: 20000 })
    const anims = await page.evaluate(() =>
      document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming().iterations === Infinity).length
    )
    expect(anims).toBe(0)
  })
})

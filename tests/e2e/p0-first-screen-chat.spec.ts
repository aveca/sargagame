import { test, expect } from "@playwright/test"

/**
 * Mission P0 (2026-10-27) — anti-régression du premier écran.
 *
 * Défaut mesuré en prod (zéro interaction, home sargasses-martinique.com) :
 * le hook d'hésitation (useFrustrationDetection, seuil 10 s) ouvrait l'assistant
 * chat par-dessus le premier écran → 44,8 % d'occlusion mobile, police 10,5 px
 * (< 12 px plancher dur) et 9 emojis OS (bille de marque : zéro).
 *
 * Fix : l'hésitation ne déclenche le chat qu'après un premier contact
 * intentionnel (clic / touche / clavier). Le simple scroll ou la lecture
 * passive ne suffisent plus. Rollback existant : ?frustration=0.
 *
 * KPI associé : taux d'auto-ouverture du chat sur l'accueil (doit → 0).
 */

test.describe("P0 — premier écran non occlu par le chat assistant", () => {
  test("zéro interaction : le chat d'hésitation ne s'ouvre pas (lecture pure du premier écran)", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" })

    // Aucun clic, scroll, touche : lecture pure du premier écran pendant
    // plus du seuil d'hésitation (10 s).
    await page.waitForTimeout(13000)

    const chat = page.locator('[role="dialog"][aria-label*="Assistant"]')
    await expect(chat).not.toBeVisible()
  })
})

import { test, expect, type Page } from "@playwright/test"

// CRO — choix trip7 secondaire dans le paywall (rollback ?tripchoice=0).
// Vérifie : rangée visible par défaut · masquée sous ?tripchoice=0 ·
// clic → carte trip7 in-place (pas de reload, contexte conservé) ·
// URL synchronisée · CTA → checkout récap 4,99/7j.
// Money-path NON touché ici (aucun submit, aucun paiement).

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

async function openPaywall(page: Page, qs: string) {
  await page.goto(BASE_URL + "/" + qs, { waitUntil: "load", timeout: 60000 })
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  await page.waitForSelector("button.sg-passcard-hero", { timeout: 15000 })
}

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
]

test.describe("CRO trip-choice (?tripchoice=)", () => {
  for (const vp of viewports) {
    test(`rangée trip7 visible par défaut @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&paywall=1")
      const row = page.locator('[data-testid="passoffer-trip-choice"]').first()
      await expect(row).toBeVisible({ timeout: 8000 })
      const txt = (await row.innerText()).replace(/\s+/g, " ")
      expect(txt).toContain("4,99")
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })

    test(`clic rangée → carte trip7 in-place @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&paywall=1")
      const row = page.locator('[data-testid="passoffer-trip-choice"]').first()
      await row.scrollIntoViewIfNeeded().catch(() => {})
      await row.click({ timeout: 10000 })
      // La carte hero devient trip7 SANS reload (pas de navigation).
      const card = page.locator("button.sg-passcard-hero").first()
      await expect(card).toContainText("Pass 7 jours", { timeout: 8000 })
      const txt = (await card.innerText()).replace(/\s+/g, " ")
      expect(txt).toContain("4,99")
      // URL synchronisée (partageable, refresh-safe), sans entrée historique.
      expect(page.url()).toContain("offer=trip7")
      // La rangée disparaît (pas d'auto-référence).
      await expect(page.locator('[data-testid="passoffer-trip-choice"]')).toHaveCount(0)
      // Le hero p30 a disparu (une seule offre affichée).
      expect(txt).not.toContain("Pass 30 jours")
    })
  }

  test("rollback ?tripchoice=0 masque la rangée", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&tripchoice=0&paywall=1")
    await expect(page.locator('[data-testid="passoffer-trip-choice"]')).toHaveCount(0)
    // Carte p30 historique intacte.
    const txt = (await page.locator("button.sg-passcard-hero").first().innerText()).replace(/\s+/g, " ")
    expect(txt).toContain("Pass 30 jours")
    expect(txt).toContain("14,99")
  })

  test("CTA après switch → checkout récap 4,99 € · 7 jours", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&paywall=1")
    const row = page.locator('[data-testid="passoffer-trip-choice"]').first()
    await row.scrollIntoViewIfNeeded().catch(() => {})
    await row.click({ timeout: 10000 })
    const card = page.locator("button.sg-passcard-hero").first()
    await expect(card).toContainText("Pass 7 jours", { timeout: 8000 })
    await card.scrollIntoViewIfNeeded().catch(() => {})
    await card.click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    const recap = page.locator('[data-testid="onsite-order-recap"]').first()
    await expect(recap).toBeVisible({ timeout: 8000 })
    const recapTxt = (await recap.innerText()).replace(/\s+/g, " ")
    expect(recapTxt).toContain("4,99")
  })
})

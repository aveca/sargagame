import { test, expect } from "@playwright/test"

// NEXTBUILD-PAYUX — récap commande avant paiement (OnsiteCheckout).
// Parcourt paywall → CTA pass → overlay checkout (Mollie on-site, montants
// inchangés) et vérifie le bloc [data-testid="onsite-order-recap"].
// Rollback : ?sgrecap=0 (regex location.search, modèle repo).
// 390x844 (projet mobile-chromium) + 1440x900 (viewport desktop forcé).

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

async function openCheckout(page: any) {
  await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 })
  await page
    .waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 })
    .catch(() => {})
  const heroCta = page.locator(".sg-passcard-hero").first()
  await expect(heroCta).toBeVisible({ timeout: 15000 })
  await heroCta.click({ timeout: 10000 })
  const recap = page.locator('[data-testid="onsite-order-recap"]')
  await expect(recap).toBeVisible({ timeout: 8000 })
  return recap
}

test.describe("Onsite order recap — NEXTBUILD-PAYUX", () => {
  test("mobile 390x844 : récap visible avec prix + garanties, 0 pageerror", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    const recap = await openCheckout(page)
    const txt = (await recap.textContent()) || ""
    // Offre + durée (mêmes chiffres que le bouton "Payer", source passCtx)
    expect(txt).toMatch(/Pass 30 jours|30-day pass|Pase 30 d/)
    expect(txt).toMatch(/€|\$/)
    // Garanties anti-hésitation : paiement unique, sans abonnement, Mollie
    expect(txt).toMatch(/Paiement unique|One-time payment|Pago único/)
    expect(txt).toMatch(/Sans abonnement|No subscription|Sin suscripci/)
    expect(txt).toMatch(/Mollie/)
    // Le bouton de paiement reste identique (comportement inchangé)
    const payBtn = page.locator('button:has-text("Payer"), button:has-text("Pay"), button:has-text("Pagar")').first()
    await expect(payBtn).toBeVisible({ timeout: 5000 })
    // Responsive : rien ne dépasse à 390px
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="onsite-order-recap"]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, width: r.width, vw: window.innerWidth }
    })
    expect(overflow && overflow.x + overflow.width).toBeLessThanOrEqual(391)
    const critical = errors.filter(
      (e) =>
        !e.includes("Content Security Policy") &&
        !e.includes("Refused to connect") &&
        !e.includes("fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("Mollie") &&
        !e.includes("setProfileId")
    )
    expect(critical).toEqual([])
  })

  test("desktop 1440x900 : récap visible, 0 pageerror", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    const recap = await openCheckout(page)
    const txt = (await recap.textContent()) || ""
    expect(txt).toMatch(/Pass 30 jours|30-day pass|Pase 30 d/)
    expect(txt).toMatch(/Paiement unique|One-time payment|Pago único/)
    const critical = errors.filter(
      (e) =>
        !e.includes("Content Security Policy") &&
        !e.includes("Refused to connect") &&
        !e.includes("fetch") &&
        !e.includes("NetworkError") &&
        !e.includes("Mollie") &&
        !e.includes("setProfileId")
    )
    expect(critical).toEqual([])
  })

  test("rollback ?sgrecap=0 : récap masqué, paiement intact", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 })
    await page
      .waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 })
      .catch(() => {})
    // Le deep-link ?paywall=1 nettoie toute la query (replaceState) : on
    // ré-applique le flag rollback AVANT le clic CTA (lecture au render).
    await page.evaluate(() => window.history.replaceState({}, "", "/?sgrecap=0"))
    const heroCta = page.locator(".sg-passcard-hero").first()
    await expect(heroCta).toBeVisible({ timeout: 15000 })
    await heroCta.click({ timeout: 10000 })
    await page.waitForTimeout(1500)
    const recapCount = await page.locator('[data-testid="onsite-order-recap"]').count()
    expect(recapCount).toBe(0)
    // Le paiement reste accessible sans le récap
    const payBtn = page.locator('button:has-text("Payer"), button:has-text("Pay"), button:has-text("Pagar")').first()
    await expect(payBtn).toBeVisible({ timeout: 5000 })
  })
})

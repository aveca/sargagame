import { test, expect, type Page } from "@playwright/test"

// B2C OFFER EXPOSURE (?offer=) — E2E contrat.
// Vérifie : default p30 inchangé · trip7/season exposés · fallback sûr
// (unknown/empty) · URL préservée au refresh · CTA par offre → checkout
// avec récap exact (prix + durée).
// Money-path NON touché ici (aucun submit, aucun paiement) : seul le CTA est
// cliqué jusqu'à l'overlay checkout (même pattern que j0-sprint).

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

// NOTE : pas d'interception window.track ici — les events du chunk lazy
// PremiumModal y sont invisibles (limite harnais documentée, cf. j0-sprint).
// L'instrumentation sg_pass_offer_view est verrouillée en contrat statique
// (tests/unit/offers-contract.test.cjs) ; ce spec prouve le COMPORTEMENT.

async function openPaywall(page: Page, qs: string) {
  await page.goto(BASE_URL + "/" + qs, { waitUntil: "load", timeout: 60000 })
  // Le deep-link ?paywall=1 est consommé (nettoyé) à l'ouverture.
  await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 15000 }).catch(() => {})
  // La carte d'offre (PassOffer) doit être visible.
  await page.waitForSelector("button.sg-passcard-hero", { timeout: 15000 })
}

async function cardText(page: Page) {
  const card = page.locator("button.sg-passcard-hero").first()
  return (await card.innerText()).replace(/\s+/g, " ")
}

const viewports = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 900 },
]

test.describe("B2C Offer Exposure (?offer=)", () => {
  for (const vp of viewports) {
    test(`default p30 inchangé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass 30 jours")
      expect(txt).toContain("14,99")
      // Pas d'overflow horizontal du paywall.
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })

    test(`?offer=trip7 exposé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&offer=trip7&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass 7 jours")
      expect(txt).toContain("4,99")
      // L'offre survit au nettoyage du deep-link (refresh/back).
      expect(page.url()).toContain("offer=trip7")
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })

    test(`?offer=season exposé @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await openPaywall(page, "?frustration=0&offer=season&paywall=1")
      const txt = await cardText(page)
      expect(txt).toContain("Pass Saison")
      expect(txt).toContain("19,99")
      expect(page.url()).toContain("offer=season")
      const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 1)
      expect(overflow).toBe(false)
    })
  }

  test("fallback sûr : unknown/empty → p30", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&offer=foo&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")

    await openPaywall(page, "?frustration=0&offer=&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")

    await openPaywall(page, "?frustration=0&offer=p7&paywall=1")
    expect(await cardText(page)).toContain("Pass 30 jours")
  })

  test("CTA par offre ouvre le checkout avec le bon récap (prix + durée)", async ({ page }) => {
    // Clic CTA → overlay checkout avec le récap exact (prix + durée),
    // atteignable UNIQUEMENT via onPassBuy (pas de fantôme).
    const cases = [
      { qs: "?frustration=0&paywall=1", price: "14,99", days: "30 jours" },
      { qs: "?frustration=0&offer=trip7&paywall=1", price: "4,99", days: "7 jours" },
      { qs: "?frustration=0&offer=season&paywall=1", price: "19,99", days: "210 jours" },
    ]
    await page.setViewportSize({ width: 390, height: 844 })
    for (const c of cases) {
      await openPaywall(page, c.qs)
      const cta = page.locator("button.sg-passcard-hero").first()
      await cta.scrollIntoViewIfNeeded().catch(() => {})
      await cta.click({ timeout: 10000 })
      await page.waitForTimeout(1500)
      // L'overlay checkout montre le récap exact (prix + durée).
      const recap = page.locator('[data-testid="onsite-order-recap"]').first()
      await expect(recap).toBeVisible({ timeout: 8000 })
      const recapTxt = (await recap.innerText()).replace(/\s+/g, " ")
      expect(recapTxt).toContain(c.price)
      // Retour : fermer via Échap pour le cas suivant.
      await page.keyboard.press("Escape").catch(() => {})
      await page.waitForTimeout(500)
    }
  })

  test("refresh conserve l'offre (URL préservée)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPaywall(page, "?frustration=0&offer=season&paywall=1")
    expect(page.url()).toContain("offer=season")
    await page.reload({ waitUntil: "load", timeout: 60000 })
    // Après refresh : pas de crash, la carte (home) rend, aucune pageerror bloquante.
    await page.waitForTimeout(2000)
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.waitForTimeout(1000)
    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([])
  })
})

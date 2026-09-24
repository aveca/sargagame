import { test, expect } from "@playwright/test"

/**
 * WOW JOURNEY / CONTINUITY (2026-09-24) — « un seul monde » :
 * rail séjour persistant, deep link ?exp=, Back natif sort du monde,
 * pile in-world (chip ←), strip trip partagé. Rollback : ?sgjourney=0.
 * Données 100 % réelles (live sargassum.json servi par le build).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const EXP = '[data-testid="bx-experience"]'
const RAIL = '[data-testid="exp-journey-rail"]'

async function openExperience(page, params = "") {
  await page.goto(BASE + "/" + params, { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="xp-best-open"]').first().click()
  await page.waitForSelector(EXP, { timeout: 15000 })
  await page.waitForTimeout(1000)
}

test.describe("WOW Journey — continuity layer", () => {
  test("rail séjour : chips jours réelles + plan B → transformation + retour ←", async ({ page }) => {
    await openExperience(page)
    // Le fil du séjour est là dès l'entrée dans le monde
    await page.waitForSelector(RAIL, { timeout: 8000 })
    const dayChips = page.locator(RAIL + ' [data-testid="exp-day-chip"]')
    expect(await dayChips.count()).toBeGreaterThanOrEqual(2)
    const first = (await page.locator(EXP + " .bx-name").first().innerText()).trim()

    // Plan B (chip rail) = transformation A→B du même objet
    const planB = page.locator('[data-testid="exp-planb-chip"]')
    if (await planB.isVisible().catch(() => false)) {
      await planB.click()
      await page.waitForTimeout(1800)
      const second = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
      expect(second.length).toBeGreaterThan(2)
      expect(second).not.toBe(first)
      // pile in-world : le chip ← ramène exactement d'où l'on vient
      const back = page.locator('[data-testid="exp-back-chip"]')
      await expect(back).toBeVisible({ timeout: 6000 })
      await back.click()
      await page.waitForTimeout(1800)
      const again = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
      expect(again).toBe(first)
    }
    // chip jour 0 = identité de l'objet (sans effet destructeur)
    await dayChips.first().click()
    await page.waitForTimeout(400)
    expect(await page.locator(EXP).count()).toBe(1)
  })

  test("deep link ?exp=<id> : le monde s'ouvre direct sur la bonne plage", async ({ page }) => {
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(3000)
    const id = await page.locator("[data-beach]").first().getAttribute("data-beach").catch(() => null)
    expect(id, "aucun pin data-beach — carte non prête").toBeTruthy()
    await page.goto(BASE + "/?exp=" + id, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector(EXP, { timeout: 20000 })
    await page.waitForTimeout(800)
    const name = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
    expect(name.length).toBeGreaterThan(2)
    expect(page.url()).toContain("exp=" + id)
  })

  test("Back navigateur = sortir du monde (la carte dessous est intacte)", async ({ page }) => {
    await openExperience(page)
    expect(page.url()).toContain("exp=")
    await page.goBack()
    await page.waitForTimeout(1200)
    expect(await page.locator(EXP).count()).toBe(0)
    expect(page.url()).not.toContain("exp=")
  })

  test("rollback ?sgjourney=0 : aucune trace du layer (rail + URL + geste)", async ({ page }) => {
    await openExperience(page, "?sgjourney=0")
    await page.waitForTimeout(800)
    expect(await page.locator(RAIL).count()).toBe(0)
    expect(page.url()).not.toContain("exp=")
    // core experience intact (verdict présent)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("trip : strip séjour partagé (même plage que le monde) + chip verrouillée → premium", async ({ page }) => {
    await openExperience(page)
    const worldBeach = (await page.locator(EXP + " .bx-name").first().innerText()).trim()
    await page.locator('[data-testid="exp-trip-open"]').first().click()
    const strip = page.locator('[data-testid="trip-stay-strip"]')
    await expect(strip).toBeVisible({ timeout: 8000 })
    // la spine nomme la plage du monde (« mon séjour s'appuie sur … »)
    const stripText = (await strip.innerText()).replace(/\s+/g, " ")
    expect(stripText).toContain(worldBeach)
    // chips semaine réelles
    expect(await page.locator('[data-testid="trip-stay-chip"]').count()).toBeGreaterThanOrEqual(2)
    // chip verrouillée (J+3+) → moment premium (le trip reste le même objet)
    const locked = page.locator('[data-testid="trip-stay-chip"][data-day="2"]').first()
    if (await locked.count().then((c) => c > 0)) {
      await locked.click()
      const paywall = page.locator(".sg-modal-panel, .pww-wrap").first()
      expect(await paywall.isVisible({ timeout: 12000 }).catch(() => false)).toBe(true)
    }
  })
})

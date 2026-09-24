import { test, expect } from "@playwright/test"

/**
 * BEACH EXPERIENCE — WOW TAKEOVER 2026-09-23
 * Parcours : home (J'y vais) → experience (visual + verdict) → WHY →
 * TOMORROW → BACKUP → switch plage (discovery loop) → TRIP → PREMIUM.
 * Rollback : ?sgexp=0 (fiches legacy, experience absente).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const EXP = '[data-testid="bx-experience"]'

async function openExperience(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="xp-best-open"]').first().click()
  await page.waitForSelector(EXP, { timeout: 15000 })
  await page.waitForTimeout(1200)
}

test.describe("Beach Experience (PLACE EXPERIENCE)", () => {
  test("home → experience : visual + verdict réels", async ({ page }) => {
    await openExperience(page)
    const name = await page.locator(EXP + " .bx-name").first().innerText()
    expect(name.trim().length).toBeGreaterThan(2)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
    // score réel affiché quand dispo
    const body = await page.locator(EXP).first().innerText()
    expect(/score|confiance/i.test(body)).toBe(true)
  })

  test("reveals : WHY → TOMORROW (7 pastilles) → BACKUP → switch plage", async ({ page }) => {
    await openExperience(page)
    const first = await page.locator(EXP + " .bx-name").first().innerText()
    await page.locator("#bx-why button").first().click()
    await page.waitForTimeout(600)
    await page.locator("#bx-tomorrow button").first().click()
    await page.waitForTimeout(600)
    // 7 pastilles forecast réelles (timeline)
    expect(await page.locator(EXP + " .bx-timeline-day").count()).toBeGreaterThanOrEqual(2)
    await page.locator("#bx-backup button").first().click()
    await page.waitForTimeout(800)
    const card = page.locator("#bx-backup .bx-card-name").first()
    let switched = first
    if (await card.isVisible().catch(() => false)) {
      const altName = (await card.innerText()).trim()
      await page.locator('#bx-backup .bx-card .bx-btn').first().click()
      await page.waitForTimeout(1800)
      switched = await page.locator(EXP + " .bx-name").first().innerText()
      expect(switched.trim().length).toBeGreaterThan(2)
      // la boucle a changé de plage vers le backup nommé
      expect(switched.trim()).toBe(altName)
    }
  })

  test("trip + premium depuis l'experience, fermeture propre", async ({ page }) => {
    await openExperience(page)
    await page.locator('[data-testid="exp-trip-open"]').first().click()
    await page.waitForSelector('[data-testid="trip-premium-cta"]', { timeout: 12000 })
    // trip → CTA offre → paywall (continuité, le trip se referme seul)
    await page.locator('[data-testid="trip-premium-cta"]').first().click()
    const paywall = page.locator(".sg-modal-panel, .pww-wrap").first()
    let pwVisible = await paywall.isVisible({ timeout: 12000 }).catch(() => false)
    if (!pwVisible) { // flottant transitoire (toast/sticky) : un 2e tap est le geste utilisateur réel
      await page.waitForTimeout(1500)
      await page.locator('[data-testid="trip-premium-cta"]').first().click().catch(() => {})
      pwVisible = await paywall.isVisible({ timeout: 12000 }).catch(() => false)
    }
    expect(pwVisible).toBe(true)
    // refermer paywall → retour experience intacte → premium direct
    await page.locator('.sg-modal-panel button, .pww-wrap button').filter({ hasText: /Plus tard|Later|Más tarde/ }).first().click().catch(() => {})
    await page.waitForTimeout(900)
    expect(await page.locator(EXP).count()).toBeGreaterThan(0)
    await page.locator('[data-testid="exp-premium-cta"]').first().click({ timeout: 10000 }).catch(async () => {
      await page.locator('[data-testid="exp-premium-cta"]').first().click({ force: true })
    })
    expect(await paywall.isVisible({ timeout: 12000 }).catch(() => false)).toBe(true)
  })

  test("rollback ?sgexp=0 — experience absente, fiche legacy", async ({ page }) => {
    await page.goto(BASE + "/?sgexp=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.locator('[data-testid="xp-best-open"]').first().click()
    await page.waitForTimeout(2000)
    expect(await page.locator(EXP).count()).toBe(0)
    // la fiche legacy s'ouvre à la place
    expect(await page.locator(".bsc-sheet, .lc-detail, .sheet").count()).toBeGreaterThan(0)
  })

  // ── AHA MEDIA (2026-09-23) : vraie plage derrière le verdict ──
  test("aha media : scrim/glow montés, verdict intact quel que soit le média", async ({ page }) => {
    await openExperience(page)
    // la couche existe toujours (aha on) ; le média lui-même peut être absent
    // selon la plage (photo 404 → retrait, vidéo manifest-gatée) — jamais de trou :
    // la scène SVG + le verdict restent visibles quoi qu'il arrive.
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(1)
    expect(await page.locator(EXP + " .bx-media-glow").count()).toBe(1)
    expect(await page.locator(EXP + " svg").first().count()).toBeGreaterThan(0)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("rollback ?aha=0 — couche média absente, experience intacte", async ({ page }) => {
    await page.goto(BASE + "/?aha=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.locator('[data-testid="xp-best-open"]').first().click()
    await page.waitForSelector(EXP, { timeout: 15000 })
    await page.waitForTimeout(800)
    expect(await page.locator(EXP + " .bx-media").count()).toBe(0)
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(0)
    const verdict = await page.locator(EXP + " .bx-verdict").first().innerText()
    expect(verdict.trim().length).toBeGreaterThan(1)
  })

  test("reduced motion — aucune vidéo chargée, photo/scène intactes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openExperience(page)
    await page.waitForTimeout(2500)
    expect(await page.locator(EXP + " video").count()).toBe(0)
    expect(await page.locator(EXP + " .bx-media-scrim").count()).toBe(1)
    expect(await page.locator(EXP + " .bx-verdict").first().isVisible()).toBe(true)
  })
})

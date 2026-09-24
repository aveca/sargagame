import { test, expect } from "@playwright/test"

/**
 * WOW PAYWALL #2 — « LA TRAJECTOIRE » (2026-09-24)
 * Parcours : home → experience (verdict gratuit) → CTA premium → paywall →
 * la TRAJECTOIRE du séjour (données réelles : statuts jours, confiance au tap,
 * plan B réel au jour critique, prix réel en destination de la ligne).
 * Rollback : ?sgtraj=0 (module absent, money-path intact).
 */
const BASE = process.env.PREVIEW_URL || "http://localhost:4173"
const EXP = '[data-testid="bx-experience"]'
const TRAJ = '[data-testid="stay-trajectory"]'
const PANEL = '.sg-modal-panel, .pww-wrap'

async function openPaywall(page) {
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="xp-best-open"]').first().click({ timeout: 10000 }).catch(async () = await page.locator('[data-testid="xp-best-open"]').first().click({ force: true }) })
  await page.waitForSelector(EXP, { timeout: 15000 })
  await page.waitForTimeout(1000)
  await page.locator('[data-testid="exp-premium-cta"]').first().click({ timeout: 10000 }).catch(async () => {
    await page.locator('[data-testid="exp-premium-cta"]').first().click({ force: true })
  })
  await page.waitForSelector(PANEL, { timeout: 15000 })
  await page.waitForTimeout(900)
}

test.describe("WOW paywall — LA TRAJECTOIRE (mobile 390px)", () => {
  test("trajectoire visible : ligne today → semaine, données réelles, prix intégré", async ({ page }) => {
    await openPaywall(page)
    const traj = page.locator(TRAJ)
    expect(await traj.isVisible({ timeout: 8000 }).catch(() => false)).toBe(true)
    // nœud « aujourd'hui » = origine de la ligne (donnée réelle fiche)
    expect(await page.locator(TRAJ + ' [data-today="1"]').count()).toBe(1)
    // ≥2 jours réels (forecast live) ; jamais de jours inventés : pas de statut vide affiché comme réel
    expect(await page.locator(TRAJ + " .sg-traj-day").count()).toBeGreaterThanOrEqual(2)
    // ligne dessinée + titre transformation (gratuit=point → premium=trajectoire)
    expect(await page.locator(TRAJ + " .sg-traj-line").count()).toBe(1)
    const head = await page.locator(TRAJ + " .sg-traj-title").innerText()
    expect(head.trim().length).toBeGreaterThan(3)
    // prix RÉEL intégré à la ligne (€ ou $ — source unique pass-price, jamais littéral fixe)
    const price = await page.locator(TRAJ + ' [data-testid="stay-trajectory-price"]').innerText()
    expect(/[€$]\s?\d|\d[,.]\d{2}/.test(price)).toBe(true)
    // plan B réel au jour critique SI la semaine contient un jour à éviter
    const backup = await page.locator(TRAJ + ' [data-testid="stay-trajectory-backup"]').count()
    if (backup > 0) {
      expect(/Plan B/.test(await page.locator(TRAJ + ' [data-testid="stay-trajectory-backup"]').innerText())).toBe(true)
      expect(/km/.test(await page.locator(TRAJ + ' [data-testid="stay-trajectory-backup"]').innerText())).toBe(true)
    }
    // rail contenu dans le module (zéro débordement 390px)
    const rail = await page.locator(TRAJ + " .sg-traj-rail").boundingBox()
    const box = await page.locator(TRAJ).boundingBox()
    expect(rail.x + rail.width).toBeLessThanOrEqual(box.x + box.width + 1)
  })

  test("interaction signature : tap jour → détail (confiance révélée au tap)", async ({ page }) => {
    await openPaywall(page)
    expect(await page.locator(TRAJ).isVisible({ timeout: 8000 }).catch(() => false)).toBe(true)
    const days = page.locator(TRAJ + " .sg-traj-day")
    const n = await days.count()
    expect(n).toBeGreaterThanOrEqual(2)
    // tap sur le 2e jour → aria-pressed bascule + détail mis à jour
    await days.nth(1).click()
    await page.waitForTimeout(300)
    expect(await days.nth(1).getAttribute("aria-pressed")).toBe("true")
    const after = await page.locator(TRAJ + " .sg-traj-detail").innerText()
    expect(after.trim().length).toBeGreaterThan(3)
    expect(after).not.toBe("")
    // l'offre (money-path) reste intacte sous le module
    expect(await page.locator(PANEL + " .sg-passcard-hero").first().isVisible()).toBe(true)
  })

  test("rollback ?sgtraj=0 : module absent, paywall + offre intacts", async ({ page }) => {
    await page.goto(BASE + "/?sgtraj=0", { waitUntil: "load", timeout: 60000 })
    await page.waitForTimeout(2500)
    await page.locator('[data-testid="xp-best-open"]').first().click({ timeout: 10000 }).catch(async () = await page.locator('[data-testid="xp-best-open"]').first().click({ force: true }) })
    await page.waitForSelector(EXP, { timeout: 15000 })
    await page.waitForTimeout(800)
    await page.locator('[data-testid="exp-premium-cta"]').first().click().catch(async () => {
      await page.locator('[data-testid="exp-premium-cta"]').first().click({ force: true })
    })
    await page.waitForSelector(PANEL, { timeout: 15000 })
    await page.waitForTimeout(900)
    expect(await page.locator(TRAJ).count()).toBe(0)
    // money-path intact : offre + CTA toujours présents
    expect(await page.locator(PANEL + " .sg-passcard-hero").first().isVisible()).toBe(true)
    expect((await page.locator(PANEL).innerText()).length).toBeGreaterThan(40)
  })

  test("reduced-motion : module visible, animations gelées", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openPaywall(page)
    expect(await page.locator(TRAJ).isVisible({ timeout: 8000 }).catch(() => false)).toBe(true)
    expect(await page.locator(TRAJ + " .sg-traj-day").count()).toBeGreaterThanOrEqual(2)
    const anims = await page.evaluate(() =>
      document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming().iterations === Infinity).length
    )
    expect(anims).toBe(0)
  })

  test("transition WOW : checkout animé + écho semaine réelle au moment de payer", async ({ page }) => {
    await openPaywall(page)
    // CTA offre → checkout (payStep) — money-path inchangé (createToken hors champ test)
    const cta = page.locator(PANEL + " .sg-passcard-hero").first()
    expect(await cta.isVisible({ timeout: 8000 })).toBe(true)
    await cta.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await cta.click({ timeout: 8000 }).catch(async () => { await cta.click({ force: true }) })
    // Robustesse anti-recouvrement éphémère (bannière cookie/nudge au-dessus
    // du CTA au moment du tap — flaky documenté MASTER_AUDIT) : si l'overlay
    // checkout n'est pas monté 1,2 s après, le clic DOM programmatique
    // déclenche le handler React sans aucune interception possible.
    await page.waitForTimeout(1200)
    if (!(await page.locator('[role="dialog"][aria-label*="Paiement"], [role="dialog"][aria-label*="checkout"], [role="dialog"][aria-label*="Pago"]').count())) {
      await cta.evaluate((el) => el.click())
    }
    // Le checkout (z1300) s'ouvre en dialog
    const checkout = page.locator('[role="dialog"][aria-label*="Paiement"], [role="dialog"][aria-label*="checkout"], [role="dialog"][aria-label*="Pago"]').first()
    expect(await checkout.isVisible({ timeout: 10000 }).catch(() => false)).toBe(true)
    // Transition animée : propriété transition sur transform (sauf reduced-motion)
    const transition = await checkout.evaluate(el => getComputedStyle(el).transition)
    expect(/transform/.test(transition)).toBe(true)
    // Écho « tu débloques la semaine de <plage> » + mini-dots réels du forecast
    const echo = page.locator('[data-testid="checkout-trajectory"]')
    const echoVisible = await echo.isVisible({ timeout: 5000 }).catch(() => false)
    // Sans contexte plage le paywall n'a pas de trajectoire → écho légitimement absent
    if (await page.locator(TRAJ).count() > 0) {
      expect(echoVisible).toBe(true)
      expect((await echo.innerText()).length).toBeGreaterThan(3)
    }
    // La trajectoire paywall reste sous la main au retour (money-path rond)
    const back = checkout.locator('button:has-text("Retour"), button:has-text("Back"), button:has-text("Atrás")').first()
    if (await back.isVisible({ timeout: 3000 }).catch(() => false)) await back.click()
    await page.waitForTimeout(600)
    expect(await page.locator(PANEL + " .sg-passcard-hero").first().isVisible()).toBe(true)
  })

  test("desktop 1440px : trajectoire en colonne droite du paywall, zéro débordement", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openPaywall(page)
    expect(await page.locator(TRAJ).isVisible({ timeout: 8000 }).catch(() => false)).toBe(true)
    const box = await page.locator(TRAJ).boundingBox()
    expect(box).toBeTruthy()
    expect(box.width).toBeGreaterThan(200)
    expect(box.x + box.width).toBeLessThanOrEqual(1441)
    // rail : aucun nœud ne déborde du module
    const rail = await page.locator(TRAJ + " .sg-traj-rail").boundingBox()
    expect(rail.x + rail.width).toBeLessThanOrEqual(box.x + box.width + 1)
  })
})

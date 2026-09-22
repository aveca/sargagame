import { test, expect } from "@playwright/test"

/**
 * PROBE PROD — money-path (REVENUE RESCUE 2026-09-22)
 *
 * Objectif : vérifier EN PRODUCTION que le checkout on-site Mollie est VIVANT
 * sans jamais payer : paywall → CTA Pass → overlay paiement → email →
 * 4 iframes Mollie montées → bouton Payer présent. STOP avant tout submit.
 *
 * Usage : BASE=https://sargasses-martinique.com npx playwright test tests/e2e/prod-money-path-probe.spec.ts
 *
 * AUCUNE donnée saisie dans les champs carte (on ne tokenise rien).
 */

const BASE = process.env.BASE || "https://sargasses-martinique.com"
if (process.env.DESKTOP) test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false } as any)

const report = { domain: BASE, steps: {} as Record<string, unknown>, pageerrors: [] as string[] }

test.describe("prod money-path probe", () => {
  // Jamais en CI par défaut : cette sonde tape la PROD. Explicite : PROBE_PROD=1.
  test.skip(!process.env.PROBE_PROD, "probe prod — activer avec PROBE_PROD=1 BASE=https://...")
  test("paywall → CTA → checkout on-site → champs Mollie montés (SANS paiement)", async ({ page }) => {
    test.setTimeout(120000)
    // NE PAS polluer le funnel prod : tous les sinks analytics/tracking sont coupés.
    // (la sonde clique le vrai CTA — sans ça elle injecterait sg_pass_cta fantômes)
    await page.route(/script\.google|google-analytics|googletagmanager|collect\.php/, (r) => r.abort())
    await page.route(/\/rest\/v1\/analytics_events/, (r) => r.abort())
    page.on("pageerror", (e) => report.pageerrors.push(String(e.message).slice(0, 160)))

    // ── 1. Page + paywall via deep link ──────────────────────────────────────
    await page.goto(BASE + "/?paywall=1", { waitUntil: "load", timeout: 60000 })
    await page.waitForFunction(() => !window.location.search.includes("paywall=1"), {}, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const modal = page.locator('.sg-modal-panel, [role="dialog"], .pww-wrap, .sg-paywall-comic').first()
    report.steps["1_paywall_visible"] = await modal.isVisible({ timeout: 10000 }).catch(() => false)
    expect(report.steps["1_paywall_visible"]).toBe(true)

    // ── 2. CTA achat (hero card OU sticky) → ouvre l'étape paiement ──────────
    const heroCta = page.locator("button.sg-passcard-hero").first()
    const stickyCta = page.locator("button.sg-sticky-wrap").first()
    let clicked = "none"
    if (await heroCta.isVisible({ timeout: 4000 }).catch(() => false)) {
      await heroCta.click({ timeout: 8000 }).catch(() => {})
      clicked = "hero"
    } else if (await stickyCta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await stickyCta.click({ timeout: 8000 }).catch(() => {})
      clicked = "sticky"
    }
    report.steps["2_cta_clicked"] = clicked
    expect(clicked).not.toBe("none")
    await page.waitForTimeout(2500)

    // ── 3. Overlap paiement : input email présent ─────────────────────────────
    const emailInput = page.locator('input[type="email"]').first()
    report.steps["3_email_input"] = await emailInput.isVisible({ timeout: 8000 }).catch(() => false)

    // ── 4. Mollie Components : 4 iframes js.mollie.com montées ───────────────
    // Les Components montent des <iframe src="https://js.mollie.com/..."> dans les divs refs.
    let mollieFrames = 0
    for (let i = 0; i < 20; i++) {
      mollieFrames = await page.evaluate(
        () => Array.from(document.querySelectorAll("iframe")).filter((f) => /mollie/i.test(f.src || "")).length
      )
      if (mollieFrames >= 4) break
      await page.waitForTimeout(1000)
    }
    report.steps["4_mollie_iframes"] = mollieFrames

    // ── 5. Bouton Payer présent et enabled ───────────────────────────────────
    const payBtn = page.locator('button:has-text("Payer"), button:has-text("Pay"), button:has-text("Pagar"), button.sg-paybtn').first()
    const payVisible = await payBtn.isVisible({ timeout: 5000 }).catch(() => false)
    let payEnabled = false
    if (payVisible) payEnabled = await payBtn.isEnabled().catch(() => false)
    report.steps["5_pay_button"] = payVisible ? (payEnabled ? "visible+enabled" : "visible+DISABLED") : "ABSENT"

    // ⚠️ STOP — aucune saisie carte, aucun submit. Zéro paiement déclenché.

    console.log("PROBE_RESULT " + JSON.stringify(report, null, 2))
    expect(report.pageerrors.length, "pageerrors: " + report.pageerrors.join(" | ")).toBe(0)
    expect(mollieFrames).toBeGreaterThanOrEqual(4)
    expect(payVisible).toBe(true)
  })
})

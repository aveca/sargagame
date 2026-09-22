/**
 * PAYUX #1 — Retour paiement Mollie échoué/annulé (?payment_failed=1).
 * Le paywall doit rouvrir AVEC un message d'échec honnête (aucun débit),
 * statut mappé, dismissible, email préservé. Rollback ?payfailmsg=0.
 * Aucune mécanique financière : affichage seul.
 */
import { test, expect } from '@playwright/test'

const PAYWALL = '.sg-modal-panel'

async function waitPaywallOpen(page: any) {
  await page.waitForSelector(PAYWALL, { timeout: 20000 })
  await page.waitForTimeout(800)
}

test('retour canceled : bannière échec visible, honnête, dismissible dans le paywall', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e: any) => errors.push(String(e)))
  await page.goto('/?payment_failed=1&status=canceled&email=qa-check@sargasses-martinique.com', { waitUntil: 'domcontentloaded' })
  await waitPaywallOpen(page)
  const banner = page.locator('[data-testid="payment-retry-banner"]')
  await expect(banner).toBeVisible({ timeout: 8000 })
  await expect(banner).toHaveAttribute('role', 'alert')
  await expect(banner).toContainText('annulé')
  await expect(banner).toContainText('aucun montant débité')
  // visible dans le viewport mobile (rien hors-écran)
  const box = await banner.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  // email préservé (reliquat du retry) dans le champ paywall
  const emailInput = page.locator(`${PAYWALL} input[type="email"]`).first()
  await expect(emailInput).toHaveValue('qa-check@sargasses-martinique.com')
  // dismiss : bannière partie + contexte sessionStorage effacé
  await banner.locator('button').click()
  await expect(banner).toHaveCount(0)
  const ctx = await page.evaluate(() => sessionStorage.getItem('sg_payment_retry'))
  expect(ctx).toBeNull()
  expect(errors.length).toBe(0)
})

test('retour failed : message adapté (refusé), pas de fausse promesse', async ({ page }) => {
  await page.goto('/?payment_failed=1&status=failed', { waitUntil: 'domcontentloaded' })
  await waitPaywallOpen(page)
  const banner = page.locator('[data-testid="payment-retry-banner"]')
  await expect(banner).toBeVisible({ timeout: 8000 })
  const txt = await banner.textContent()
  expect(txt).toContain("n'a pas abouti")
  expect(txt).toContain('aucun montant débité')
})

test('retour expired : message session expirée', async ({ page }) => {
  await page.goto('/?payment_failed=1&status=expired', { waitUntil: 'domcontentloaded' })
  await waitPaywallOpen(page)
  const banner = page.locator('[data-testid="payment-retry-banner"]')
  await expect(banner).toBeVisible({ timeout: 8000 })
  await expect(banner).toContainText('expiré')
})

test('paywall normal (sans payment_failed) : aucune bannière', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first()
  if (await tab.count()) await tab.click({ timeout: 15000 })
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000 })
  await waitPaywallOpen(page)
  await expect(page.locator('[data-testid="payment-retry-banner"]')).toHaveCount(0)
})

test('rollback ?payfailmsg=0 : contexte non écrit, bannière absente (comportement historique)', async ({ page }) => {
  await page.goto('/?payment_failed=1&status=canceled&payfailmsg=0', { waitUntil: 'domcontentloaded' })
  await waitPaywallOpen(page)
  await expect(page.locator('[data-testid="payment-retry-banner"]')).toHaveCount(0)
  const ctx = await page.evaluate(() => sessionStorage.getItem('sg_payment_retry'))
  expect(ctx).toBeNull() // rollback = écriture du contexte elle-même désactivée
})

import { test, expect } from '@playwright/test'

// Sticky/hero CTA promise parity (E1-align, 2026-09-22).
// Défaut : sticky buy = même promesse que le hero (« prévision 7 jours » + prix).
// Rollback ?sgcta=0 : ancien libellé (« plages propres » + prix).
// Ouverture via BottomNav (le deep-link ?paywall=1 nettoie la query — limite
// documentée partagée par tous les flags).

test.use({ serviceWorkers: 'block' })

async function openPaywall(page: any, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first()
  if (await tab.count()) await tab.click({ timeout: 15000, force: true })
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000, force: true })
  await page.waitForSelector('.sg-modal-panel', { timeout: 15000 })
  await page.waitForTimeout(1200)
}

test.describe('Sticky CTA E1 parity', () => {
  test('défaut : sticky promet la prévision 7 jours + prix', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e)))
    await openPaywall(page, '/')
    const sticky = page.locator('.sg-sticky-buy')
    await expect(sticky).toBeVisible({ timeout: 15000 })
    await expect(sticky).toContainText(/prévision 7 jours|7-day forecast|pronóstico 7 días/)
    await expect(sticky).toContainText(/14,99|14\.99/)
    // Hero et sticky : une seule promesse
    await expect(page.locator('.sg-modal-panel').locator('button:has-text("Voir la prévision 7 jours")').first()).toBeVisible()
    // Sticky toujours cliquable → checkout (même chaîne buy)
    await sticky.click({ timeout: 10000, force: true })
    await page.waitForTimeout(1500)
    expect(errors.length).toBe(0)
  })

  test('rollback ?sgcta=0 : ancien libellé sticky, prix intact', async ({ page }) => {
    await openPaywall(page, '/?sgcta=0')
    const sticky = page.locator('.sg-sticky-buy')
    await expect(sticky).toBeVisible({ timeout: 15000 })
    await expect(sticky).toContainText(/plages propres|See clean beaches|playas limpias/)
    await expect(sticky).toContainText(/14,99|14\.99/)
  })
})

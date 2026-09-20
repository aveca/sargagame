import { test, expect } from '@playwright/test'

// A13 J+1 PORT dans ChasseDetail (2026-09-20, miroir BeachSheetComic PR #691).
// Chemin LIVE : pins carte → onMapBeach → ChasseDetail (.lc-detail).
// - défaut : J+1 débloqué + badge INCLUS, tap J+1 sans paywall, J+2 verrouillé
// - ?j1_free=0 : J+1 reverrouillé (rollback)
// Données réelles : série 7 j du pipeline (sargData.weekly) — jamais inventée.

test.use({ serviceWorkers: 'block' })

const CELL = '.lc-detail-fc-row .lc-fc-cell'

// Ouvre une plage COUVERTE (strip réel avec cellules teaser) via un vrai pin carte.
// Retourne après ouverture de ChasseDetail sur une plage couverte.
async function openCoveredBeach(page: any) {
  await page.waitForSelector('[data-sg-labels-ready]', { timeout: 30000 })
  const labels = page.locator('.sg-maplabel:visible')
  const n = await labels.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < Math.min(n, 8); i++) {
    await labels.nth(i).click({ timeout: 10000 })
    await page.waitForSelector('.lc-detail', { timeout: 15000 }).catch(() => null)
    if ((await page.locator('.lc-detail').count()) === 0) continue
    // Strip réel = cellules teaser présentes (fallback honnête = lock partout, sans teaser)
    if ((await page.locator(`${CELL}.teaser`).count()) > 0) return
    await page.locator('.lc-detail-x').click()
    await page.waitForTimeout(500)
  }
  throw new Error('aucune plage couverte trouvée parmi les pins visibles')
}

test.describe('ChasseDetail A13 J+1', () => {
  test('défaut : J+1 INCLUS cliquable sans paywall, J+2 verrouillé', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e).slice(0, 150)))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await openCoveredBeach(page)

    const j1 = page.locator(CELL).nth(1)
    // J+1 débloqué : statut réel coloré, pas de cadenas
    await expect(j1).toHaveClass(/s-(ok|mod|bad)/, { timeout: 10000 })
    expect(await j1.locator('svg').count()).toBe(0)
    // Badge INCLUS visible
    await expect(page.locator('.lc-fc-inclus').first()).toContainText(/INCLUS|INCLUDED|INCLUIDO/)

    // Tap J+1 → PAS de paywall, fiche intacte
    await j1.click()
    await page.waitForTimeout(800)
    expect(await page.locator('.sg-modal-panel').count()).toBe(0)
    await expect(page.locator('.lc-detail')).toBeVisible()

    // J+2 reste verrouillé (teaser + cadenas)
    const j2 = page.locator(CELL).nth(2)
    await expect(j2).toHaveClass(/teaser/)
    expect(await j2.locator('svg').count()).toBeGreaterThan(0)

    // CTA premium intact
    await expect(page.locator('button:has-text("VOIR LES 7 PROCHAINS JOURS")').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('rollback ?j1_free=0 : J+1 reverrouillé', async ({ page }) => {
    await page.goto('/?j1_free=0', { waitUntil: 'domcontentloaded' })
    await openCoveredBeach(page)

    const j1 = page.locator(CELL).nth(1)
    await expect(j1).toHaveClass(/teaser/, { timeout: 10000 })
    expect(await j1.locator('svg').count()).toBeGreaterThan(0)
    expect(await page.locator('.lc-fc-inclus').count()).toBe(0)
  })
})

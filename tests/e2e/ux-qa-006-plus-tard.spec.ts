import { test, expect, Page } from '@playwright/test'

// UX-QA-006 — « Plus tard » inopérant sur desktop (MASTER_AUDIT P2).
// Scénario historique runs/20260916T2132Z-run1 (UX-D-002) : desktop 1440×900,
// fiche plage → CTA « VOIR LES 7 PROCHAINS JOURS » → paywall world → clic
// « Plus tard » → le dialog restait visible dans l'ARIA (×, lui, fonctionnait).
// Contrat : les DEUX sorties (« Plus tard » + ×) ferment réellement le dialog,
// desktop ET mobile. Aucun clic achat, 0 pageerror.

test.use({ serviceWorkers: 'block' })

const DIALOG = '.sg-modal-panel[role="dialog"]'

async function openPaywallFromBeach(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-sg-labels-ready]', { timeout: 40000 })
  const labels = page.locator('.sg-maplabel:visible')
  const n = await labels.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < Math.min(n, 8); i++) {
    await labels.nth(i).click({ timeout: 8000 })
    await page.waitForSelector('.lc-detail', { timeout: 12000 }).catch(() => null)
    if ((await page.locator('.lc-detail').count()) > 0) break
  }
  await expect(page.locator('.lc-detail')).toBeVisible()
  // CTA premium de la fiche → le paywall world (pw_style gelé « world »)
  await page.locator('.lc-detail button:has-text("VOIR LES 7 PROCHAINS JOURS")').first().click()
  await page.waitForSelector(DIALOG, { timeout: 15000 })
  await expect(page.locator(DIALOG)).toBeVisible()
}

async function expectDialogGone(page: Page) {
  await expect(page.locator(DIALOG)).toHaveCount(0, { timeout: 3000 })
  await expect(page.getByRole('dialog', { name: /prévisions premium|premium forecast|pronóstico premium/i })).toHaveCount(0)
}

test.describe('UX-QA-006 desktop 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false })

  test('« Plus tard » ferme réellement le dialog premium (hors ARIA + DOM)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
    await openPaywallFromBeach(page)

    // Diagnostic d'interception : qu'est-ce qui reçoit le clic au centre du bouton ?
    const hit = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /plus tard/i.test(b.textContent || ''))
      if (!btn) return { found: false }
      const r = btn.getBoundingClientRect()
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {
        found: true,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        hitIsButton: el === btn || btn.contains(el),
        hitTag: el ? `${el.tagName}.${(el.className && String(el.className).slice(0, 60)) || ''}` : null,
      }
    })
    console.log('UX-QA-006 hit-test:', JSON.stringify(hit))
    expect(hit.found).toBe(true)

    await page.getByRole('button', { name: 'Plus tard' }).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
    expect(errors).toEqual([])
  })

  test('desktop : × ferme aussi (régression croisée)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
    await openPaywallFromBeach(page)
    await page.locator(`${DIALOG} [aria-label="Fermer"], ${DIALOG} [aria-label="Close"], ${DIALOG} [aria-label="Cerrar"]`).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
    expect(errors).toEqual([])
  })

  test('desktop : reopen → « Plus tard » → refermé (idempotent)', async ({ page }) => {
    await openPaywallFromBeach(page)
    await page.getByRole('button', { name: 'Plus tard' }).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
    // Reopen via le même chemin produit (event canonique)
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('sg_open_paywall')))
    await page.waitForSelector(DIALOG, { timeout: 15000 })
    await page.getByRole('button', { name: 'Plus tard' }).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
  })
})

test.describe('UX-QA-006 mobile 390×844 (inchangé)', () => {
  test('mobile : « Plus tard » ferme réellement le dialog', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
    await openPaywallFromBeach(page)
    await page.getByRole('button', { name: 'Plus tard' }).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
    expect(errors).toEqual([])
  })

  // Couvre par transparence UX-QA-005 (× intercepté par la fiche, mobile) —
  // post-fix UX-R2-003 (a1585b563) le × doit être cliquable au-dessus de la fiche.
  test('mobile : × ferme aussi au-dessus de la fiche (UX-QA-005)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
    await openPaywallFromBeach(page)
    await page.locator(`${DIALOG} [aria-label="Fermer"], ${DIALOG} [aria-label="Close"], ${DIALOG} [aria-label="Cerrar"]`).first().click()
    await page.waitForTimeout(1000)
    await expectDialogGone(page)
    expect(errors).toEqual([])
  })
})

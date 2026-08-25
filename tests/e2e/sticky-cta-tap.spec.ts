import { test, expect } from '@playwright/test'

// P1 2026-08-25 — Barre sticky PassOffer : AVANT, seuls ~30 % de la surface étaient
// cliquables (bouton « Voir le prix ») ; le reste (texte + badges) était une zone
// morte qui recouvrait le CTA « Commencer maintenant » sur mobile → taps morts sur
// le CTA money. Fix : la barre entière est un <button onClick={buy}>.
// Rollback produit : ?nosticky=0 (masque la barre, comportement pré-fix).

async function tapStickyZone(page, xFrac: number, yFrac: number) {
  const sticky = page.locator('.sg-v2-pass-offer .sg-sticky')
  await expect(sticky).toBeVisible()
  await expect(sticky).toHaveRole('button')
  await sticky.scrollIntoViewIfNeeded()
  await page.waitForTimeout(500) // animation sgStickyIn .4s + layout sticky
  const box = await sticky.boundingBox()
  expect(box).toBeTruthy()
  const vp = page.viewportSize()!
  const x = Math.min(vp.width - 2, Math.max(2, box!.x + box!.width * xFrac))
  const y = Math.min(vp.height - 2, Math.max(2, box!.y + box!.height * yFrac))
  await page.touchscreen.tap(x, y)
}

test.describe('Sticky CTA — surface de tap complète (money path)', () => {
  test('tap sur la zone texte de la barre sticky → ouvre le checkout', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'accepted') } catch (_) {} })
    await page.goto('/?paywall=1')
    await expect(page.locator('.sg-v2-pass-offer')).toBeVisible({ timeout: 20000 })
    await tapStickyZone(page, 0.15, 0.5)
    const checkout = page.locator('div[aria-label="Paiement sécurisé"]')
    await expect(checkout).toBeVisible({ timeout: 10000 })
    await expect(checkout.locator('h3')).toContainText(/pass 30 jours/i)
  })

  test('tap sur la zone badges (droite) de la barre sticky → ouvre le checkout', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent', 'accepted') } catch (_) {} })
    await page.goto('/?paywall=1')
    await expect(page.locator('.sg-v2-pass-offer')).toBeVisible({ timeout: 20000 })
    await tapStickyZone(page, 0.92, 0.75)
    await expect(page.locator('div[aria-label="Paiement sécurisé"]')).toBeVisible({ timeout: 10000 })
  })
})

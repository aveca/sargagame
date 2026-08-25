import { test, expect } from '@playwright/test'

// P1 2026-08-25 — Pay button dead click sans consentement (priority #2 dead/rage clicks + #3 funnel)
// BEFORE: bouton "Payer 14,99 €" disabled si case 14j non cochée → tap mort, aucun feedback → rage/abandon
// AFTER : bouton reste enabled (disabled only payBusy) → tap déclenche doSubscribe → payError "Coche la case..."
// Rollback produit : ?frustration=0 désactive le hook, mais ce fix est UI pas hook

async function openCheckout(page) {
  await page.addInitScript(() => { try { localStorage.setItem('sg_cookie_consent','accepted'); } catch(e){} });
  await page.goto('/?paywall=1');
  await expect(page.locator('.sg-v2-pass-offer')).toBeVisible({ timeout: 20000 });
  const sticky = page.locator('.sg-v2-pass-offer .sg-sticky');
  await sticky.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const box = await sticky.boundingBox();
  const vp = page.viewportSize()!;
  const x = Math.min(vp.width-2, Math.max(2, box!.x + box!.width*0.5));
  const y = Math.min(vp.height-2, Math.max(2, box!.y + box!.height*0.5));
  await page.touchscreen.tap(x,y);
  const checkout = page.locator('div[aria-label="Paiement sécurisé"]');
  await expect(checkout).toBeVisible({ timeout: 10000 });
  return checkout;
}

test.describe('Pay consent dead-click — feedback au lieu de mort', () => {
  test('tap Payer sans cocher la case → erreur guidée au lieu de dead click', async ({ page }) => {
    const checkout = await openCheckout(page);
    // Consent pas coché par défaut
    const consent = checkout.locator('input[type="checkbox"]');
    await expect(consent).toBeVisible();
    await expect(consent).not.toBeChecked();
    const payBtn = checkout.locator('button').filter({ hasText: /^Payer/ }).first();
    await expect(payBtn).toBeVisible();
    // AFTER fix: bouton reste cliquable (disabled false) malgré aria-disabled (avant: disabled true = dead click)
    await expect(payBtn).not.toHaveAttribute('disabled');
    await expect(payBtn).toHaveAttribute('aria-disabled', 'true');
    // Remplir email pour passer la garde email et atteindre la garde consent
    const email = checkout.locator('input[type="email"]');
    await email.fill('test@example.com');
    await payBtn.click({ force:true });
    const alert = checkout.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toContainText(/Coche la case|Tick the box|Marca la casilla/i);
  });

  test('tap Payer après avoir coché → pas d\'erreur consent', async ({ page }) => {
    const checkout = await openCheckout(page);
    const consent = checkout.locator('input[type="checkbox"]');
    await consent.check({ force:true });
    await expect(consent).toBeChecked();
    const payBtn = checkout.locator('button').filter({ hasText: /^Payer/ }).first();
    await expect(payBtn).toBeVisible();
    await expect(payBtn).not.toHaveAttribute('disabled');
    await expect(payBtn).not.toHaveAttribute('aria-disabled', 'true');
    // Remplir email minimal pour passer la garde email (sinon autre erreur)
    const email = checkout.locator('input[type="email"]');
    await email.fill('test@example.com');
    await payBtn.click({ force:true });
    // Ne doit PAS afficher l'erreur consent — peut afficher autre erreur (carte vide) mais pas consent
    await page.waitForTimeout(800);
    const alert = checkout.locator('[role="alert"]');
    if (await alert.isVisible().catch(()=>false)) {
      const txt = await alert.textContent();
      expect(txt).not.toMatch(/Coche la case|Tick the box|Marca la casilla/i);
    }
  });
});

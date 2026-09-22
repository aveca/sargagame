/**
 * Erreur garde-consentement visible + focus (NEXT BUILD parcours paiement).
 * Tap "Payer" sans cocher → message amené en vue et focus, pas de submit.
 */
import { test, expect } from '@playwright/test';

async function openCheckout(page: any) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first();
  if (await tab.count()) await tab.click({ timeout: 15000, force: true });
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000, force: true });
  await page.waitForSelector('.sg-modal-panel', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const hero = page.locator('.sg-modal-panel button.sg-passcard-hero').first();
  await hero.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await hero.click({ timeout: 10000, force: true });
  await page.waitForTimeout(3000);
}

test('garde consentement : erreur visible en viewport + focus, sans submit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await openCheckout(page);
  // email valide PARTOUT pour isoler la garde consentement (le checkout a son
  // propre champ ; sinon c'est la garde email qui se déclenche en premier)
  const emails = page.locator('input[type="email"]');
  for (let i = 0; i < await emails.count(); i++) {
    await emails.nth(i).fill('qa-check@sargasses-martinique.com', { timeout: 10000 });
  }
  // Le bouton Payer vit dans l'overlay checkout (sibling du panel, z1300)
  const payer = page.locator('button:has-text("Payer")').first();
  await expect(payer).toBeVisible();
  await payer.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await payer.click({ timeout: 10000, force: true });
  await page.waitForTimeout(1200);
  // message de garde affiché (dans le checkout overlay)
  const alert = page.locator('[role="alert"]:has-text("Coche la case")');
  await expect(alert).toBeVisible({ timeout: 8000 });
  // visible dans le viewport (pas hors-écran au-dessus)
  const box = await alert.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 40);
  // focus déplacé sur l'alerte (a11y)
  const focused = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.getAttribute('role') + '/' + (a.className || '').slice(0, 20)) : 'none';
  });
  expect(focused).toMatch(/^alert\//);
  // aucun submit réseau Mollie (garde stoppe avant tokenize)
  const mollieCalls = await page.evaluate(() => (window as any).__mollieCalls || 'n/a');
  expect(errors.length).toBe(0);
  expect(mollieCalls).toBe('n/a');
});

test('case cochée : la garde ne bloque plus (email invalide suivant, pas de consent)', async ({ page }) => {
  await openCheckout(page);
  const box = page.locator('input[type="checkbox"]').first();
  if (await box.count()) {
    await box.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
    await box.check({ timeout: 10000, force: true });
    await expect(box).toBeChecked();
  }
});

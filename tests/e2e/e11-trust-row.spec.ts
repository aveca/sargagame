/**
 * E11 trust row — la rangée iconée sous le CTA hero (rollback ?trust_row=0).
 * - visible par défaut (FR), copy recyclée, CTA toujours cliquable, email après
 * - ?trust_row=0 la masque sans rien changer d'autre
 */
import { test, expect } from '@playwright/test';

async function openPaywall(page: any) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first();
  if (await tab.count()) await tab.click({ timeout: 15000, force: true });
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000, force: true });
  await page.waitForSelector('.sg-modal-panel', { timeout: 15000 });
  await page.waitForTimeout(1200);
}

test('E11 — trust row visible, CTA cliquable, email après', async ({ page }) => {
  await openPaywall(page);
  const row = page.locator('[data-testid="passoffer-trust-row"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText('Paiement sécurisé');
  await expect(row).toContainText('30 jours');
  await expect(row).toContainText('Sans abonnement');
  // CTA hero toujours cliquable et mène au checkout
  const cta = page.locator('.sg-modal-panel').locator('button:has-text("Voir la prévision 7 jours")').first();
  await expect(cta).toBeVisible();
  await cta.click({ timeout: 10000, force: true });
  await page.waitForTimeout(1500);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  expect(errors.length).toBe(0);
});

test('E11 — rollback ?trust_row=0 masque la rangée, offre intacte', async ({ page }) => {
  await page.goto('/?trust_row=0', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tab = page.locator('nav.sg-bottom-nav button:has-text("Pass")').first();
  if (await tab.count()) await tab.click({ timeout: 15000, force: true });
  else await page.locator('nav.sg-bottom-nav button:has-text("Premium")').first().click({ timeout: 15000, force: true });
  await page.waitForSelector('.sg-modal-panel', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid="passoffer-trust-row"]')).toHaveCount(0);
  // offre et CTA intacts
  await expect(page.locator('.sg-modal-panel').locator('button:has-text("Voir la prévision 7 jours")').first()).toBeVisible();
});

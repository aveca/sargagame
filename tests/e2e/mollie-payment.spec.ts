import { test, expect } from '@playwright/test';

/*
  Test Mollie payment flow — smoke (no real payment).
  Verifies: paywall open → checkout overlay → Mollie iframes present.
  Mollie script is lazy-loaded on checkout open, not at page load.
*/

test('mollie-payment-flow-smoke', async ({ page }) => {
  // 1. Load the map page
  await page.goto('https://sargagame.pages.dev/', { waitUntil: 'networkidle' });

  // 2. Accept cookie consent if banner present
  const consentBtn = page.locator('button:has-text("Accepter"), button:has-text("OK")').first();
  if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await consentBtn.click();
    await page.waitForTimeout(500);
  }

  // 3. Open paywall via Premium tab in BottomNav
  const premiumTab = page.locator('.sg-bottom-nav').getByText('Premium');
  await expect(premiumTab).toBeVisible({ timeout: 5000 });
  await premiumTab.click();
  await page.waitForTimeout(1500);

  // 4. Verify paywall modal appeared (dialog, paywall panel, or pass card)
  const paywall = page.locator('[role="dialog"], .sg-modal-panel, .sg-paywall-world, .sg-paywall-comic, button:has-text("Pass 30 jours")').first();
  await expect(paywall).toBeVisible({ timeout: 5000 });

  // 5. Click the CTA to open checkout overlay
  const cta = page.locator('button:has-text("Payer"), button:has-text("Commencer"), button:has-text("Activer")').first();
  if (await cta.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cta.click();
    await page.waitForTimeout(2000);
  }

  // 6. Verify Mollie script is loaded (lazy, after checkout opens)
  const mollieScript = page.locator('script[src*="js.mollie.com"]');
  await expect(mollieScript).toBeAttached({ timeout: 8000 });

  // 7. Verify Mollie card iframes present (4 card fields + 1 controller)
  const mollieFrames = page.locator('iframe[src*="mollie"]');
  const frameCount = await mollieFrames.count();
  expect(frameCount).toBeGreaterThanOrEqual(4);

  // 8. Screenshot for visual verification (no real payment submitted)
  await page.screenshot({ path: 'tests/e2e/screenshots/mollie-payment-smoke.png', fullPage: true });

  console.log(`Smoke test complete: Mollie loaded, ${frameCount} iframes present.`);
});

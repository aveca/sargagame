import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"

/*
  Test Mollie payment flow — smoke (no real payment).
  Verifies: paywall open → checkout overlay → Mollie iframes present.
  Mollie script is lazy-loaded on checkout open, not at page load.
*/

// Helper: wait for visible map labels
async function waitForVisibleMapLabel(page: any, timeout = 30000) {
  await page.waitForSelector('[data-sg-labels-ready]', { timeout }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('.sg-maplabel[role="button"]')
    return Array.from(els).some(el => {
      const style = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return style.visibility === 'visible' && rect.width > 0 && rect.height > 0
    })
  }, { timeout })
}

test('mollie-payment-flow-smoke', async ({ page }) => {
  // Clear LeadCapture to prevent banner from intercepting clicks
  // Also clear sg_seen to allow paywall to open
  await page.addInitScript(() => {
    localStorage.setItem("sg_lead_dismissed", String(Date.now()))
    localStorage.setItem("sg_lead_session_start", String(Date.now()))
    localStorage.setItem("sg_lead_scroll_count", "0")
    localStorage.removeItem("sg_seen")
    localStorage.removeItem("sg_track_log")
  })
  
  // 1. Load the map page with paywall deep link
  await page.goto(BASE_URL + '/?frustration=0&paywall=1', { waitUntil: 'networkidle' });
  await waitForVisibleMapLabel(page)

  // 2. Accept cookie consent if banner present
  const consentBtn = page.locator('button:has-text("Accepter"), button:has-text("OK")').first();
  if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await consentBtn.click();
    await page.waitForTimeout(500);
  }

  // 3. Wait for paywall to open (handler cleans URL) - with shorter timeout
  await page
    .waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      {},
      { timeout: 5000 }
    )
    .catch(() => {})
  await page.waitForTimeout(2000)

  // 4. Verify paywall modal appeared (dialog, paywall panel, or pass card)
  const paywall = page.locator('[role="dialog"], .sg-modal-panel, .sg-paywall-world, .sg-paywall-comic, button:has-text("Pass 30 jours")').first();
  await expect(paywall).toBeVisible({ timeout: 10000 });

  // 5. Click the CTA to open checkout overlay (exclude Google Pay button)
  const cta = page.locator('button:has-text("Payer"):not([aria-label*="Google"]), button:has-text("Commencer"), button:has-text("Activer")').first();
  if (await cta.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Use evaluate to click directly, bypassing viewport checks
    await cta.evaluate(el => el.click())
    await page.waitForTimeout(5000);
  }

  // 6. Verify Mollie script is loaded (lazy, after checkout opens)
  const mollieScript = page.locator('script[src*="js.mollie.com"]');
  await expect(mollieScript).toBeAttached({ timeout: 15000 });

  // 7. Verify Mollie card iframes present (at least 1 indicates Mollie loaded)
  const mollieFrames = page.locator('iframe[src*="mollie"]');
  await expect(mollieFrames.first()).toBeAttached({ timeout: 10000 })
  const frameCount = await mollieFrames.count();
  expect(frameCount).toBeGreaterThanOrEqual(1); // At least 1 iframe indicates Mollie loaded

  // 8. Screenshot for visual verification (no real payment submitted)
  await page.screenshot({ path: 'tests/e2e/screenshots/mollie-payment-smoke.png', fullPage: true });

  console.log(`Smoke test complete: Mollie loaded, ${frameCount} iframes present.`);
});
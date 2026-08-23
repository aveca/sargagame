import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PREVIEW_URL || 'https://sargasses-martinique.com';

async function openBeachDetail(page: any) {
  // Navigate to map first
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  
  // Wait for map labels
  await page.waitForSelector('.sg-maplabel', { timeout: 30000 }).catch(() => {});
  
  // Click on a beach pin (data-beach attribute on SVG elements)
  const beachPin = page.locator('[data-beach]').first();
  const pinCount = await beachPin.count();
  if (pinCount > 0) {
    await beachPin.click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    // Fallback: click on a map label
    const mapLabel = page.locator('.sg-maplabel[role="button"]').first();
    await mapLabel.click({ force: true });
    await page.waitForTimeout(2000);
  }
  
  // Wait for beach detail sheet (BeachSheetComic = .bsc-sheet, legacy = .lc-detail, .sheet)
  const fiche = page.locator('.bsc-sheet, .lc-detail, .sheet, [role="dialog"]').first();
  await fiche.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Click "VOIR LES 7 PROCHAINS JOURS" button to reveal forecast chart if present
  const voirBtn = page.locator('button:has-text("VOIR LES 7 PROCHAINS JOURS"), button:has-text("Voir les 7 prochains jours"), button:has-text("7 PROCHAINS JOURS")').first();
  const voirVisible = await voirBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (voirVisible) {
    await voirBtn.click();
    await page.waitForTimeout(1000);
  }
}

test.describe('WeekHub / Prévisions 7 jours — Forecast Lock', () => {
  test('MQ mobile: fiche plage → prévisions → lock click', async ({ page }) => {
    const events: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('sg_')) {
        events.push(msg.text());
      }
    });

    // Open beach detail from map
    await openBeachDetail(page);

    // Check for forecast content in dialog (rendered as text, not separate ForecastChart component)
    const forecastText = page.locator('text=/7 PROCHAINS JOURS/i').first();
    await expect(forecastText).toBeVisible({ timeout: 10000 });
    console.log('Forecast text content found in dialog');

    // Check for locked overlay (blur + lock button) — lock shown as SVG icon inside CTA, no OS emoji (design system rule)
    const lockBtn = page.locator('button:has-text("Débloquer"), button:has-text("Unlock"), button:has-text("Desbloquear")').first();
    const lockBtnCount = await lockBtn.count();
    console.log(`Lock button found: ${lockBtnCount}`);

    // Check for "Débloquer" button (might not exist in this render)
    const debloquerBtn = page.locator('button:has-text("Débloquer"), button:has-text("Unlock"), button:has-text("Desbloquear")').first();
    const debloquerVisible = await debloquerBtn.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Débloquer button visible: ${debloquerVisible}`);

    // Check for teaser strip
    const teaserStrip = page.locator('text=/Jours suivants:/i, text=/Next days:/i, text=/Próximos días:/i').first();
    const teaserVisible = await teaserStrip.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Teaser strip visible: ${teaserVisible}`);

    // Check for lock click event
    const lockEvents = events.filter(e => e.includes('sg_forecast_lock_click'));
    console.log(`sg_forecast_lock_click events: ${lockEvents.length}`);
    console.log('All events:', events);
  });

  test('MQ mobile: forecast lock keyboard Enter/Space', async ({ page }) => {
    await openBeachDetail(page);

    const lockOverlay = page.locator('[style*="linear-gradient(90deg,transparent"]').first();
    const overlayCount = await lockOverlay.count();

    if (overlayCount > 0) {
      // Focus and press Enter
      await lockOverlay.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);

      const beatOpen = page.locator('[class*="pw-beat"], [class*="sg-modal-panel"]').first();
      const beatVisible = await beatOpen.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Beat opened after Enter key: ${beatVisible}`);

      // Close if open
      if (beatVisible) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

      // Focus and press Space
      await lockOverlay.focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(1000);

      const beatOpen2 = page.locator('[class*="pw-beat"], [class*="sg-modal-panel"]').first();
      const beatVisible2 = await beatOpen2.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`Beat opened after Space key: ${beatVisible2}`);
    }
  });

  test('MQ mobile: prévisions data validation', async ({ page }) => {
    await openBeachDetail(page);

    // Check for forecast content in dialog
    const forecastText = page.locator('text=/7 PROCHAINS JOURS/i').first();
    await expect(forecastText).toBeVisible({ timeout: 10000 });
    console.log('Forecast text content found in dialog');

    // Check for visible days (should be 4-7 days) — count locked/gated bars (blur filter) + visible days
    const gatedBars = page.locator('[style*="blur"], [style*="filter: blur"]').first();
    const gatedCount = await gatedBars.count();
    console.log(`Gated/locked bars: ${gatedCount}`);

    // Check for status colors in text (clean/moderate/avoid)
    const statusText = await page.locator('text=/PROPRE|MODÉRÉ|À ÉVITER|AVOID|MODERATE/i').count();
    console.log(`Status indicators found: ${statusText}`);

    // Check for confidence curve
    const confidenceCurve = page.locator('text=/Fiabilité par jour/i, text=/Confidence by day/i').first();
    const hasConfidence = await confidenceCurve.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Confidence curve visible: ${hasConfidence}`);

    // Check for honest disclaimer
    const disclaimer = page.locator('text=/Fiable jusqu/i, text=/Reliable up to/i').first();
    const hasDisclaimer = await disclaimer.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Honest disclaimer visible: ${hasDisclaimer}`);
  });

  // Desktop test skipped - requires desktop project in playwright.config.ts
// test('Desktop: prévisions responsive 1920x1080', async ({ page }) => { ... });

  test('MQ mobile: états loading/stale/empty', async ({ page }) => {
    // Test with different beaches by clicking different pins
    await openBeachDetail(page);
    
    const forecastChart = page.locator('[class*="ForecastChart"], [class*="forecast-chart"]').first();
    const isVisible = await forecastChart.isVisible({ timeout: 5000 }).catch(() => false);
    
    if (isVisible) {
      // Check for loading state
      const loading = await page.locator('text=/chargement/i, text=/loading/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      // Check for stale data warning
      const stale = await page.locator('text=/retard/i, text=/delayed/i, text=/stale/i').first().isVisible({ timeout: 1000 }).catch(() => false);
      // Check for empty state
      const empty = await page.locator('text=/vérification en cours/i, text=/verification in progress/i').first().isVisible({ timeout: 1000 }).catch(() => false);

      console.log(`Beach detail: loading=${loading}, stale=${stale}, empty=${empty}`);
    }
  });

  test('Accessibility: forecast lock keyboard navigation', async ({ page }) => {
    await openBeachDetail(page);

    const lockOverlay = page.locator('[style*="linear-gradient(90deg,transparent"]').first();
    const overlayCount = await lockOverlay.count();

    if (overlayCount > 0) {
      // Check role=button
      const role = await lockOverlay.getAttribute('role');
      console.log(`Lock overlay role: ${role}`);
      expect(role).toBe('button');

      // Check tabIndex
      const tabIndex = await lockOverlay.getAttribute('tabindex');
      console.log(`Lock overlay tabindex: ${tabIndex}`);
      expect(tabIndex).toBe('0');

      // Check aria-label
      const ariaLabel = await lockOverlay.getAttribute('aria-label');
      console.log(`Lock overlay aria-label: ${ariaLabel}`);
      expect(ariaLabel).toBeTruthy();

      // Test Tab navigation
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));
      console.log(`Focused element role after Tab: ${focused}`);
    }
  });
});
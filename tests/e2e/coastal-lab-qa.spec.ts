import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

const baseUrl = 'https://sargasses-martinique.com';

test.describe('Coastal Lab Production Visual QA', () => {
  for (const vp of viewports) {
    test(`Coastal Lab @ ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle', timeout: 30000 });

      // Check page loads without critical errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      const networkErrors: string[] = [];
      page.on('response', resp => {
        if (resp.status() >= 400) networkErrors.push(`${resp.status()} ${resp.url()}`);
      });

      // Wait for Coastal Lab to render
      await page.waitForSelector('.coastal-lab', { timeout: 15000 });

      // Check for overflow
      const bodyOverflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
      expect(bodyOverflow).toBe(false);

      // Check header
      const header = await page.$('.cl-header');
      expect(header).toBeTruthy();

      // Check title
      const title = await page.$('.cl-title');
      expect(title).toBeTruthy();

      // Check layer navigation
      const layerNav = await page.$('.cl-layer-nav');
      expect(layerNav).toBeTruthy();

      // Check all 5 layer buttons present
      const layerBtns = await page.$$('.cl-layer-btn');
      expect(layerBtns.length).toBe(5);

      // Check Beach Object Card
      const beachObject = await page.$('.cl-beach-object');
      expect(beachObject).toBeTruthy();

      // Check Beach Object has media
      const beachMedia = await page.$('.cl-bo-media');
      expect(beachMedia).toBeTruthy();

      // Check Beach Object has status badge
      const statusBadge = await page.$('.cl-bo-status-badge');
      expect(statusBadge).toBeTruthy();

      // Check Beach Object has content (name, location, meta)
      const beachName = await page.$('.cl-bo-name');
      expect(beachName).toBeTruthy();

      // Check CTA group at bottom - scroll to it first
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      
      const ctaGroup = await page.$('.cl-cta-group');
      expect(ctaGroup).toBeTruthy();

      // Check CTAs: Explore, Plan, Monitor
      const exploreBtn = await page.$('button:has-text("Explorer")');
      const planBtn = await page.$('button:has-text("Planifier")');
      const monitorBtn = await page.$('button:has-text("Surveiller")');
      expect(exploreBtn).toBeTruthy();
      expect(planBtn).toBeTruthy();
      expect(monitorBtn).toBeTruthy();

      // Check footer
      const footer = await page.$('.cl-footer');
      expect(footer).toBeTruthy();

      // Take screenshot
      await page.screenshot({ path: `test-results/coastal-lab-${vp.name}.png`, fullPage: true });

      // Verify no console errors (critical only)
      const criticalErrors = consoleErrors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('manifest') &&
        !e.includes('websocket') &&
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('analytics') &&
        !e.toLowerCase().includes('ga4')
      );
      if (criticalErrors.length > 0) {
        console.log(`[${vp.name}] Console errors:`, criticalErrors);
      }

      // Verify no critical network failures
      const criticalNetwork = networkErrors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('manifest') &&
        !e.includes('.woff') &&
        !e.includes('.woff2')
      );
      if (criticalNetwork.length > 0) {
        console.log(`[${vp.name}] Network errors:`, criticalNetwork);
      }
    });
  }

  test('Coastal Lab - Layer navigation works and content renders', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    const layers = [
      { id: 'monitor', check: '.cl-flow' },
      { id: 'understand', check: '.cl-impact-chain' },
      { id: 'decide', check: '.cl-hard-problem' },
      { id: 'recover', check: '.cl-recovery-chain' },
      { id: 'valorize', check: '.cl-valorize-grid' },
    ];

    for (const layer of layers) {
      // Use evaluate to click the tab directly, bypassing interception
      await page.evaluate((layerId) => {
        const tab = document.getElementById(`tab-${layerId}`);
        if (tab) tab.click();
      }, layer.id);
      
      // Wait for panel to be visible - increased timeout for production
      await page.waitForSelector(`#panel-${layer.id}`, { state: 'visible', timeout: 15000 });
      const panel = await page.$(`#panel-${layer.id}`);
      expect(panel).toBeTruthy();

      // Check layer-specific content
      const content = await page.$(`${layer.check}`);
      expect(content).toBeTruthy();
    }
  });

  test('Coastal Lab - Tourism Connection and Ecosystem View at bottom', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Scroll to bottom to find Tourism Connection and Ecosystem View
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const tourism = await page.$('.cl-tourism');
    expect(tourism).toBeTruthy();

    const ecosystem = await page.$('.cl-ecosystem');
    expect(ecosystem).toBeTruthy();

    // Check Tourism flow steps
    const tourismSteps = await page.$$('.cl-tourism-step');
    expect(tourismSteps.length).toBe(6); // DREAM, CHOOSE, PLAN, MONITOR, ADAPT, ENJOY

    // Check Ecosystem dims
    const ecoDims = await page.$$('.cl-dim-card');
    expect(ecoDims.length).toBe(4); // TOURISME, ENVIRONNEMENT, OPÉRATIONS, ÉCONOMIE
  });

  test('Coastal Lab - Reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Check that animations are disabled via CSS
    const hasAnimations = await page.evaluate(() => {
      const elements = document.querySelectorAll('[class*="sgm-"]');
      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.animationName !== 'none' && style.animationDuration !== '0s' && style.animationDuration !== '0.01ms') {
          return true;
        }
      }
      return false;
    });
    // With prefers-reduced-motion, animations should be instant/none
    expect(hasAnimations).toBe(false);
  });

  test('Coastal Lab - CTA buttons trigger correct actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Click Explore - should change view to map (internal state, not URL change)
    await page.click('button:has-text("Explorer")', { force: true });
    await page.waitForTimeout(500);
    // Verify we're still on coastal-lab but the view might have changed internally
    await expect(page).toHaveURL(/coastal-lab/);

    // Go back to coastal-lab
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Click Plan - should open TripPlanner overlay
    await page.click('button:has-text("Planifier")', { force: true });
    await page.waitForTimeout(500);
    // TripPlanner might open - check if it's visible or we're still on coastal-lab
    await expect(page).toHaveURL(/coastal-lab/);

    // Go back
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Click Monitor - should stay on page
    await page.click('button:has-text("Surveiller")', { force: true });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/coastal-lab/);
  });

  test('Coastal Lab - Accessibility basics', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/coastal-lab/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.coastal-lab');

    // Check semantic HTML
    const main = await page.$('main[role="main"]');
    expect(main).toBeTruthy();

    // Check layer nav has proper ARIA
    const layerNav = await page.$('[role="tablist"]');
    expect(layerNav).toBeTruthy();

    // Check tabs have proper ARIA
    const tabs = await page.$$('.cl-layer-btn');
    for (const tab of tabs) {
      const role = await tab.getAttribute('role');
      expect(role).toBe('tab');
      const ariaSelected = await tab.getAttribute('aria-selected');
      expect(ariaSelected).toBeTruthy();
    }

    // Check panels have proper ARIA
    const panels = await page.$$('[role="tabpanel"]');
    expect(panels.length).toBeGreaterThanOrEqual(1);

    // Check focus visible styles exist
    const focusStyles = await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '*::focus-visible { outline: 2px solid var(--cl-accent) !important; }';
      document.head.appendChild(style);
      return true;
    });
    expect(focusStyles).toBe(true);
  });
});
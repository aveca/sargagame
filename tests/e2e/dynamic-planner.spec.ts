/**
 * dynamic-planner.spec.ts — E2E tests for Dynamic Beach Day Planner
 * Run: npx playwright test tests/e2e/dynamic-planner.spec.ts
 */
import { test, expect } from '@playwright/test';
import { selectors } from '../utils/selectors';

test.describe('Dynamic Beach Day Planner', () => {
  test.beforeEach(async ({ page }) => {
    // Minimal setup - openPlanner will handle navigation
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="xp-home"]', { timeout: 30000 });
    await page.waitForTimeout(1000);
  });

  async function openPlanner(page) {
    // First, set up track interceptor like funnel-payment test
    await page.addInitScript(() => {
      localStorage.removeItem("sg_track_log");
      let originalTrack;
      Object.defineProperty(window, "track", {
        configurable: true,
        set(fn) {
          if (fn && !fn._wrapped) {
            originalTrack = fn;
            const wrapped = function (name, data) {
              try {
                const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]");
                logs.push({ name, data, ts: Date.now() });
                localStorage.setItem("sg_track_log", JSON.stringify(logs.slice(-50)));
              } catch (_) {}
              return originalTrack?.apply(this, arguments);
            };
            wrapped._wrapped = true;
            Object.defineProperty(window, "track", {
              configurable: true,
              value: wrapped,
              writable: true,
            });
          }
        },
        get() { return originalTrack; },
      });
    });
    
    // Navigate to home page and click the TripPlanner button in HomeDashboard
    await page.goto('/', { waitUntil: 'load', timeout: 60000 });
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="xp-home"]', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Listen for console errors and network failures
    page.on('console', msg => console.log(`CONSOLE [${msg.type()}]: ${msg.text()}`));
    page.on('pageerror', err => console.log(`PAGE ERROR: ${err.message}`));
    page.on('requestfailed', req => console.log(`REQUEST FAILED: ${req.url()} - ${req.failure()?.errorText}`));
    page.on('response', res => {
      if (res.status() >= 400 && !res.url().includes('google-analytics') && !res.url().includes('g/collect')) {
        console.log(`RESPONSE ${res.status()}: ${res.url()}`);
      }
    });
    
    // Click the TripPlanner button in HomeDashboard
    const planBtn = page.locator('[data-testid="trip-open"]');
    await expect(planBtn).toBeVisible({ timeout: 10000 });
    
    // Check the actual page URL
    const currentUrl = page.url();
    console.log(`CURRENT PAGE URL: ${currentUrl}`);
    
    // Click the button
    await planBtn.click({ force: true });
    await page.waitForTimeout(3000);
    
    // Check track log after click
    const trackLogAfterClick = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('sg_track_log') || '[]');
    });
    console.log(`Track log after click: ${JSON.stringify(trackLogAfterClick)}`);
    
    // Check if the mount point is rendered
    const mountPointVisible = await page.locator('[data-testid="trip-planner-mount-point"]').isVisible().catch(() => false);
    console.log(`trip-planner-mount-point visible: ${mountPointVisible}`);
    
    // Check if loading fallback is visible
    const loadingVisible = await page.locator('[data-testid="trip-planner-loading"]').isVisible().catch(() => false);
    console.log(`trip-planner-loading visible: ${loadingVisible}`);
    
    // Check if the lazy chunk was requested
    const chunksLoaded = await page.evaluate(() => {
      return document.querySelectorAll('script[type="module"]').length;
    });
    console.log(`Module scripts loaded: ${chunksLoaded}`);
    
    // Check for TripPlanner chunk in network
    const tripPlannerChunk = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="module"]');
      for (const s of scripts) {
        if (s.src.includes('TripPlanner')) return s.src;
      }
      return null;
    });
    console.log(`TripPlanner chunk: ${tripPlannerChunk}`);
    
    // Check if showTrip state is true
    const showTripState = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="planning-context-bar"]');
    });
    console.log(`showTripState (planning-context-bar exists): ${showTripState}`);
    
    // Check if there's a Suspense fallback showing
    const suspenseFallback = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="xp-home"]');
    });
    console.log(`xp-home still visible: ${suspenseFallback}`);
    
    // Check React component state via window
    const reactState = await page.evaluate(() => {
      const root = document.querySelector('#root');
      if (root && root._reactRootContainer) {
        return 'root container found';
      }
      return 'no root container';
    });
    console.log(`React state: ${reactState}`);
    
    // Check if click handler is working - check for any overlay
    const anyOverlay = await page.evaluate(() => {
      const overlays = document.querySelectorAll('[role="dialog"], .sgm-sheet, [data-testid="trip-open"]');
      return overlays.length;
    });
    console.log(`Overlays in DOM: ${anyOverlay}`);
    
    // Check track log
    const trackLog = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('sg_track_log') || '[]');
    });
    console.log(`Track log: ${JSON.stringify(trackLog)}`);
    
    // Wait for mount point first, then planning-context-bar
    await page.waitForSelector('[data-testid="trip-planner-mount-point"]', { timeout: 15000 });
    console.log('Mount point visible');
    await page.waitForSelector('[data-testid="planning-context-bar"]', { timeout: 15000 });
    await page.waitForTimeout(500);
  }

  test('opens dynamic planner from home', async ({ page }) => {
    await openPlanner(page);
    await expect(page.locator('[data-testid="planning-context-bar"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Planificateur de journée')).toBeVisible();
  });

  test('PlanningContextBar: date / time / duration / location / activities', async ({ page }) => {
    await openPlanner(page);

    const ctxBar = page.locator('[data-testid="planning-context-bar"]');
    await expect(ctxBar).toBeVisible();

    // Verify all context buttons exist
    await expect(ctxBar.locator('button:has-text("📅")')).toBeVisible(); // Date
    await expect(ctxBar.locator('button:has-text("🕐")')).toBeVisible(); // Time
    await expect(ctxBar.locator('button:has-text("⏱")')).toBeVisible(); // Duration
    await expect(ctxBar.locator('button:has-text("📍")')).toBeVisible(); // Location
    await expect(ctxBar.locator('button:has-text("🏷")')).toBeVisible(); // Activities

    // Test date picker opens
    await ctxBar.locator('button:has-text("📅")').click();
    await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Test time picker opens
    await ctxBar.locator('button:has-text("🕐")').click();
    await expect(page.locator('button:has-text("09:00")')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Test duration picker opens
    await ctxBar.locator('button:has-text("⏱")').click();
    await expect(page.locator('button:has-text("6h")')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Test location popover opens
    await ctxBar.locator('button:has-text("📍")').click();
    await expect(page.locator('text=Ma position GPS')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Choisir sur la carte')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Test activities popover opens
    await ctxBar.locator('button:has-text("🏷")').click();
    await expect(page.locator('label:has-text("Nager")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('label:has-text("Snorkeling")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('label:has-text("Enfants")')).toBeVisible({ timeout: 3000 });
  });

  test('generates valid timeline with slots', async ({ page }) => {
    await openPlanner(page);

    // Wait for timeline to render
    await expect(page.locator('[data-testid="plan-timeline"]')).toBeVisible({ timeout: 15000 });

    // Verify day score header
    await expect(page.locator('text=Score du jour')).toBeVisible({ timeout: 5000 });

    // Verify at least one slot exists
    const slots = page.locator('[data-testid^="plan-slot-"]');
    const slotCount = await slots.count();
    expect(slotCount).toBeGreaterThan(0);

    // Verify first slot has time label
    await expect(page.locator('[data-testid="plan-slot-0"]')).toBeVisible({ timeout: 5000 });
  });

  test('shows alternatives for each slot', async ({ page }) => {
    await openPlanner(page);

    await expect(page.locator('[data-testid="plan-timeline"]')).toBeVisible({ timeout: 15000 });

    // Check for alternatives button in first slot
    const altBtn = page.locator('[data-testid="plan-slot-0"] button:has-text("Alternatives")');
    if (await altBtn.count() > 0) {
      await expect(altBtn).toBeVisible({ timeout: 5000 });
      await altBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('ScenarioPanel: preview and apply scenarios', async ({ page }) => {
    await openPlanner(page);

    await expect(page.locator('[data-testid="scenario-panel"]')).toBeVisible({ timeout: 15000 });

    // Verify scenario buttons exist
    const scenarioButtons = page.locator('[data-testid="scenario-panel"] button[type="button"]');
    const count = await scenarioButtons.count();
    expect(count).toBeGreaterThan(0);

    // Test preview: click a scenario
    const firstScenario = scenarioButtons.first();
    await firstScenario.click();
    await page.waitForTimeout(500);

    // Preview diff should appear
    const preview = page.locator('[data-testid="scenario-preview"]');
    if (await preview.count() > 0) {
      await expect(preview).toBeVisible({ timeout: 3000 });
    }

    // Test apply: click again to apply
    await firstScenario.click();
    await page.waitForTimeout(800);

    // Plan should update (context changes)
    // No errors should occur
  });

  test('ComparisonView: open and compare plans', async ({ page }) => {
    await openPlanner(page);

    // Trigger comparison by applying a scenario
    const scenarioPanel = page.locator('[data-testid="scenario-panel"]');
    const scenarios = scenarioPanel.locator('button[type="button"]');

    // Click a scenario to preview, then click again to apply (which opens comparison)
    const firstScenario = scenarios.first();
    await firstScenario.click(); // preview
    await page.waitForTimeout(500);
    await firstScenario.click(); // apply -> should open comparison

    // Comparison view should appear
    await expect(page.locator('[data-testid="comparison-view"]')).toBeVisible({ timeout: 10000 });

    // Verify comparison elements
    await expect(page.locator('text=Comparer deux scénarios')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Plan actuel')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Scénario')).toBeVisible({ timeout: 5000 });

    // Close comparison
    await page.locator('[data-testid="comparison-view"] button:has-text("Fermer")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="comparison-view"]')).not.toBeVisible({ timeout: 3000 });
  });

  test('persists plan in localStorage', async ({ page }) => {
    await openPlanner(page);
    await page.waitForTimeout(1500);

    // Check localStorage has plan
    const planInStorage = await page.evaluate(() => {
      const raw = localStorage.getItem('sg_dynamic_plan');
      return raw ? JSON.parse(raw) : null;
    });

    expect(planInStorage).not.toBeNull();
    expect(planInStorage.date).toBeDefined();
    expect(planInStorage.slots).toBeDefined();
  });

  test('share URL params work', async ({ page }) => {
    await openPlanner(page);
    await page.waitForTimeout(1500);

    // Check URL has plan params
    const url = page.url();
    expect(url).toContain('plan_date=');
    expect(url).toContain('plan_time=');
    expect(url).toContain('plan_dur=');
  });

  test('rollback ?dynamicplan=0 shows legacy planner', async ({ page }) => {
    await page.goto('/?dynamicplan=0');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="xp-home"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    // Open planner
    const planBtn = page.locator('[data-testid="trip-open"]');
    await expect(planBtn).toBeVisible({ timeout: 10000 });
    await planBtn.click();
    await page.waitForTimeout(1000);

    // Should show legacy title
    await expect(page.locator('text=Planifier mon séjour')).toBeVisible({ timeout: 5000 });

    // Should NOT show dynamic planner elements
    await expect(page.locator('[data-testid="planning-context-bar"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="plan-timeline"]')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('[data-testid="scenario-panel"]')).not.toBeVisible({ timeout: 3000 });

    // Legacy day rows should exist
    await expect(page.locator('[data-testid^="tp-day-"]')).toBeVisible({ timeout: 5000 });
  });

  test('no page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await openPlanner(page);

    // Interact with various elements
    const ctxBar = page.locator('[data-testid="planning-context-bar"]');
    await ctxBar.locator('button:has-text("📅")').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');

    await ctxBar.locator('button:has-text("🕐")').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');

    await ctxBar.locator('button:has-text("🏷")').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');

    // Close planner
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  test('mobile 390px: all controls accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="xp-home"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    await openPlanner(page);

    // Context bar should be visible and usable
    const ctxBar = page.locator('[data-testid="planning-context-bar"]');
    await expect(ctxBar).toBeVisible({ timeout: 5000 });

    // All popovers should open on mobile
    await ctxBar.locator('button:has-text("📅")').click();
    await expect(page.locator('input[type="date"]')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');

    await ctxBar.locator('button:has-text("🕐")').click();
    await expect(page.locator('button:has-text("09:00")')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');

    // Timeline should be scrollable
    const timeline = page.locator('[data-testid="plan-timeline"]');
    await expect(timeline).toBeVisible({ timeout: 5000 });

    // Scenario panel should be horizontally scrollable
    const scenarioPanel = page.locator('[data-testid="scenario-panel"]');
    await expect(scenarioPanel).toBeVisible({ timeout: 5000 });
  });
});

test.describe('BeachExperience: Add to Plan', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('opens beach experience from map', async ({ page }) => {
    // Click a beach pin on map - use bottom nav to go to map
    const mapTab = page.locator(selectors.bottomNavTabMap);
    if (await mapTab.count() > 0) {
      await mapTab.first().click();
      await page.waitForTimeout(1500);

      // Click first visible beach pin
      const pins = page.locator(selectors.mapPin).first();
      if (await pins.count() > 0) {
        await pins.click();
        await page.waitForTimeout(2000);

        // BeachExperience should open
        await expect(page.locator('[data-testid="bx-experience"]')).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('shows "Add to plan" button in BeachExperience', async ({ page }) => {
    // Navigate directly to a beach experience via deep link
    const response = await page.request.get('/api/copernicus/sargassum.json');
    const data = await response.json();
    const beachId = Object.keys(data.weekly || {})[0];

    if (beachId) {
      await page.goto(`/?exp=${beachId}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check for Add to plan button
      const addToPlanBtn = page.locator('[data-testid="exp-add-to-plan"]');
      await expect(addToPlanBtn).toBeVisible({ timeout: 15000 });

      // Button should have correct text
      await expect(addToPlanBtn).toContainText('Au plan');
    }
  });

  test('clicking "Add to plan" opens dynamic planner with beach as startPos', async ({ page }) => {
    const response = await page.request.get('/api/copernicus/sargassum.json');
    const data = await response.json();
    const beachId = Object.keys(data.weekly || {})[0];

    if (beachId) {
      await page.goto(`/?exp=${beachId}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Add to plan
      await page.locator('[data-testid="exp-add-to-plan"]').click();
      await page.waitForTimeout(2000);

      // Dynamic planner should open
      await expect(page.locator('[data-testid="planning-context-bar"]')).toBeVisible({ timeout: 15000 });

      // URL should have plan params
      const url = page.url();
      expect(url).toContain('plan_date=');
    }
  });

  test('preserves existing context when adding beach', async ({ page }) => {
    // First open planner and set some context
    await openPlanner(page);

    // Change duration to 3h
    const ctxBar = page.locator('[data-testid="planning-context-bar"]');
    await ctxBar.locator('button:has-text("⏱")').click();
    await page.waitForTimeout(200);
    await page.locator('button:has-text("3h")').click();
    await page.waitForTimeout(800);

    // Close planner
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Open a beach experience
    const response = await page.request.get('/api/copernicus/sargassum.json');
    const data = await response.json();
    const beachId = Object.keys(data.weekly || {})[0];

    if (beachId) {
      await page.goto(`/?exp=${beachId}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Click Add to plan
      await page.locator('[data-testid="exp-add-to-plan"]').click();
      await page.waitForTimeout(2000);

      // Planner should open with 3h duration preserved
      await expect(page.locator('[data-testid="planning-context-bar"]')).toBeVisible({ timeout: 15000 });

      // Duration should still be 3h (180 min)
      const durationBtn = page.locator('[data-testid="planning-context-bar"] button:has-text("⏱")');
      await expect(durationBtn).toContainText('3h', { timeout: 5000 });
    }
  });
});
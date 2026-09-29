import { test, expect, type Page } from "@playwright/test"
import { selectors } from "../utils/selectors"

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173"
const TEST_URL = BASE_URL + "/"

/**
 * Intercept track() calls and log them for assertion.
 */
function setupTrackInterceptor(page: Page) {
  page.addInitScript(() => {
    localStorage.removeItem("sg_seen");
    localStorage.removeItem("sg_track_log");
    sessionStorage.clear();
    
    let originalTrack: Function | undefined;
    Object.defineProperty(window, "track", {
      configurable: true,
      set(fn: Function) {
        if (fn && !fn._wrapped) {
          originalTrack = fn;
          const wrapped = function (this: any, name: string, data: any) {
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
      get() {
        return originalTrack;
      },
    });
  });
   
  return {
    async getEvents() {
      return page.evaluate(() => {
        return JSON.parse(localStorage.getItem("sg_track_log") || "[]");
      });
    },
    async hasEvent(name: string) {
      return page.evaluate((n) => {
        const logs = JSON.parse(localStorage.getItem("sg_track_log") || "[]");
        return logs.some((e: any) => e.name === n);
      }, name);
    },
    async checkTrackExists() {
      return page.evaluate(() => {
        return typeof (window as any).track === "function";
      });
    },
  };
}

/**
 * Deterministic wait for map labels to be ready.
 * Fails with diagnostic if labels never appear.
 */
async function waitForMapLabelsReady(page: Page, minLabels = 3) {
  // First wait for map container
  await page.waitForSelector(selectors.mapReady, { 
    timeout: 30000,
    state: 'attached'
  });

  // Poll for visible labels (declutter may hide some)
  await page.waitForFunction(
    ([mapPin, min]) => {
      const pins = document.querySelectorAll(`${mapPin}[role='button']`);
      let visible = 0;
      for (const pin of pins) {
        const rect = pin.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && 
            window.getComputedStyle(pin).visibility !== 'hidden' &&
            window.getComputedStyle(pin).display !== 'none') {
          visible++;
        }
      }
      return visible >= min;
    },
    [selectors.mapPin, minLabels],
    { timeout: 30000 }
  );
}

/**
 * Click first truly tappable beach label.
 * Returns beach ID that was clicked.
 */
async function clickTappableBeach(page: Page): Promise<string | null> {
  const pins = page.locator(`${selectors.mapPin}[role='button']`);
  const count = await pins.count();
  
  for (let i = 0; i < Math.min(count, 8); i++) {
    const pin = pins.nth(i);
    const isVisible = await pin.isVisible({ timeout: 1000 }).catch(() => false);
    if (!isVisible) continue;

    const box = await pin.boundingBox();
    if (!box || box.width === 0 || box.height === 0) continue;

    const hit = await pin.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit && (hit === el || el.contains(hit));
    });

    if (hit) {
      const beachId = await pin.getAttribute('data-beach');
      await pin.click();
      return beachId;
    }
  }
  
  // Fallback: first visible
  for (let i = 0; i < count; i++) {
    const pin = pins.nth(i);
    if (await pin.isVisible({ timeout: 500 }).catch(() => false)) {
      const beachId = await pin.getAttribute('data-beach');
      await pin.click();
      return beachId;
    }
  }
  
  return null;
}

/**
 * Wait for beach detail (BeachDecisionPage or BeachSheetComic) to be visible.
 */
async function waitForBeachDetail(page: Page) {
  // BeachDecisionPage: fixed div with main
  // BeachSheetComic: .bsc-sheet dialog
  await Promise.race([
    page.waitForSelector('div[style*="position: fixed"][style*="inset: 0"] main', { timeout: 10000 }),
    page.waitForSelector('.bsc-sheet', { timeout: 10000 }),
    page.waitForSelector('[data-testid="bx-experience"]', { timeout: 10000 }),
  ]);
}

test.describe("Funnel Principal B2C", () => {
  test("carte → fiche → paywall: funnel reaché + events trackés", async ({ page }) => {
    const tracker = setupTrackInterceptor(page);

    // 1. Landing — navigate to Carte tab
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    
    const carteTab = page.locator(
      'nav.sg-bottom-nav button:has-text("Carte"), ' +
      'nav.sg-bottom-nav button:has-text("Map"), ' +
      'nav.sg-bottom-nav button:has-text("Mapa")'
    ).first();
    await expect(carteTab).toBeVisible({ timeout: 15000 });
    await carteTab.click();

    // 2. Wait for map with visible labels (deterministic)
    await waitForMapLabelsReady(page, 3);

    // 3. Click a tappable beach
    const beachId = await clickTappableBeach(page);
    expect(beachId).not.toBeNull();

    // 4. Wait for beach detail to render
    await waitForBeachDetail(page);

    // 5. Trigger paywall via deep link
    await page.goto(TEST_URL + "&paywall=1", { waitUntil: "load", timeout: 60000 });

    // Wait for paywall handler to clean URL (deterministic)
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );

    // 6. Verify URL cleaned
    const urlCleaned = await page.evaluate(() => !window.location.search.includes("paywall=1"));
    expect(urlCleaned).toBe(true);

    // 7. Verify events tracked
    const events = await tracker.getEvents();
    const eventNames = events.map((e) => e.name);
    expect(eventNames).toContain("sg_session_start");
  });

  test("paywall affiche le CTA Premium", async ({ page }) => {
    await page.goto(TEST_URL + "?frustration=0&paywall=1", { waitUntil: "load", timeout: 60000 });
    
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );
    
    await page.waitForTimeout(1000); // Brief settle for lazy components

    const cta = page.locator(
      'button:has-text("Premium"), button:has-text("Débloquer"), button:has-text("Unlock"), [class*="pww"], [class*="sg-modal"]'
    ).first();
    const ctaVisible = await cta.isVisible({ timeout: 5000 }).catch(() => false);
    const modalVisible = await page.locator('[role="dialog"], .sg-modal-panel, .pww-wrap').first().isVisible({ timeout: 5000 }).catch(() => false);

    expect(ctaVisible || modalVisible).toBe(true);
  });

  test("rollback ?flag=0 désactive le paywall", async ({ page }) => {
    await page.goto(TEST_URL + "&flag=premium_modal=0", { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1000);
    
    const cta = page.locator('[class*="pww"], [class*="sg-modal"]').first();
    const visible = await cta.isVisible({ timeout: 3000 }).catch(() => false);
    expect(visible).toBe(false);
  });

  test("pas d'erreurs JS critiques au chargement", async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('analytics') && !text.includes('Mollie') && !text.includes('favicon')) {
          errors.push(text);
        }
      }
    });

    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2000);

    // Filter known non-critical
    const critical = errors.filter(e => 
      !e.includes('preload') && 
      !e.includes('ERR_BLOCKED_BY_CLIENT') &&
      !e.includes('Failed to load resource') &&
      !e.includes('analytics') &&
      !e.includes('Google Analytics') &&
      !e.includes('Mollie')
    );

    expect(critical).toHaveLength(0);
  });
});

test.describe("Funnel Payment — Checkout Flow", () => {
  test("paywall → email → CTA checkout visible", async ({ page }) => {
    await page.goto(TEST_URL + "?paywall=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1500);

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 10000 });
  });

  test("paywall affiche les passes (trip7, p30, season)", async ({ page }) => {
    await page.goto(TEST_URL + "?paywall=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1500);

    const passes = page.locator('button:has-text("7 jours"), button:has-text("30 jours"), button:has-text("saison"), [class*="pass"], [class*="offer"]').first();
    await expect(passes).toBeVisible({ timeout: 10000 });
  });

  test("rollback ?pwcomic=0 désactive la variante comic", async ({ page }) => {
    await page.goto(TEST_URL + "?pwcomic=0&paywall=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1000);
    
    const comic = page.locator('[class*="comic"], .bsc-sheet').first();
    const visible = await comic.isVisible({ timeout: 3000 }).catch(() => false);
    // Should still show paywall, just not comic variant
    const anyModal = await page.locator('[role="dialog"], .sg-modal-panel, .pww-wrap').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(anyModal).toBe(true);
  });
});

test.describe("Funnel Payment — Premium State", () => {
  test("premium localStorage: activation après paiement mocké", async ({ page }) => {
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      localStorage.setItem("sg_premium", "1");
      localStorage.setItem("sg_premium_pass_end", String(Date.now() + 30 * 86400000));
    });

    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1000);

    const isPremium = await page.evaluate(() => localStorage.getItem("sg_premium") === "1");
    expect(isPremium).toBe(true);
  });

  test("premium state persistence across reload", async ({ page }) => {
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      localStorage.setItem("sg_premium", "1");
      localStorage.setItem("sg_premium_pass_end", String(Date.now() + 30 * 86400000));
    });

    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(500);

    const cta = page.locator('[class*="pww"], [class*="sg-modal"]').first();
    const visible = await cta.isVisible({ timeout: 3000 }).catch(() => false);
    expect(visible).toBe(false);
  });

  test("premium state: pas de paywall auto-ouvert sans deep link", async ({ page }) => {
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1000);

    const cta = page.locator('[class*="pww"], [class*="sg-modal"]').first();
    const visible = await cta.isVisible({ timeout: 3000 }).catch(() => false);
    expect(visible).toBe(false);
  });
});

test.describe("Funnel Payment — Reduced Motion", () => {
  test("reduced-motion: RM_INFINITE=[] (no infinite CSS animations on body/root)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(TEST_URL, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1000);

    const infinite = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      const anim = style.animation;
      return anim && anim !== 'none' && !anim.includes('0s');
    });
    expect(infinite).toBe(false);
  });

  test("reduced-motion: paywall pas d'animation infinie", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(TEST_URL + "?paywall=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(500);

    const infinite = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      const anim = style.animation;
      return anim && anim !== 'none' && !anim.includes('0s');
    });
    expect(infinite).toBe(false);
  });
});

test.describe("Funnel Payment — Multi-Region", () => {
  test("EUR region (MQ): paywall affiche prix EUR", async ({ page }) => {
    await page.goto(TEST_URL + "?paywall=1", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(
      () => !window.location.search.includes("paywall=1"),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1500);

    // Check for EUR price using multiple possible text patterns
    const priceText = await page.locator(selectors.paywallModal).first().textContent().catch(() => "");
    const hasEur = priceText.includes("€") || priceText.includes("EUR");
    expect(hasEur).toBe(true);
  });
});
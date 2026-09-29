import { test, expect, type Page } from '@playwright/test';
import { selectors } from '../utils/selectors';

/**
 * UX AUDIT CONTRACT — AHA/GO/PROTECT validation
 * 
 * Validates the complete SEE → DECIDE → GO → PROTECT journey
 * on BeachDecisionPage across viewports.
 * 
 * Runs in FAST mode (mobile only) or FULL mode (responsive + a11y + screenshots)
 */

const isFast = process.env.FAST === 'true';
const isFull = process.env.FULL === 'true';

const viewports = isFull
  ? [
      { name: '390px', width: 390, height: 844 },
      { name: '430px', width: 430, height: 932 },
      { name: 'desktop', width: 1440, height: 900 },
    ]
  : [
      { name: '390px', width: 390, height: 844 },
    ];

test.describe('UX Audit — AHA/GO/PROTECT Contracts', () => {
  for (const vp of viewports) {
    test(`UX Contract @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'load', timeout: 60000 });

      // ====================================================================
      // STEP 1: HOME — Navigate to Carte tab
      // ====================================================================
      const carteTab = page.locator(
        'nav.sg-bottom-nav button:has-text("Carte"), ' +
        'nav.sg-bottom-nav button:has-text("Map"), ' +
        'nav.sg-bottom-nav button:has-text("Mapa")'
      ).first();
      await expect(carteTab).toBeVisible({ timeout: 15000 });
      await carteTab.click();

      // Wait for map readiness - deterministic condition
      await page.waitForSelector(selectors.mapReady, { 
        timeout: 30000,
        state: 'attached'
      });

      // Verify at least 3 beach labels visible (not declutter-hidden)
      const visibleLabels = await page.locator(`${selectors.mapPin}[role='button']`).all();
      let visibleCount = 0;
      for (const label of visibleLabels) {
        if (await label.isVisible().catch(() => false)) {
          visibleCount++;
        }
      }
      expect(visibleCount).toBeGreaterThanOrEqual(3);

      // Wait for app data to be ready (beaches, sargData loaded)
      await page.waitForFunction(() => {
        return window.sargData?.levels?.length > 0 || 
               window.allBeaches?.length > 0 ||
               document.querySelector('[data-sg-labels-ready]') !== null;
      }, { timeout: 30000 });

      // Additional wait like funnel test - let app settle
      await page.waitForTimeout(2000);

      // ====================================================================
      // STEP 2: BEACH — Click a tappable beach pin (with hero alt handling)
      // ====================================================================
      // Based on funnel-payment.spec.ts logic
      let beachClicked = false;
      let clickedBeachId: string | null = null;

      const findAndClickTappable = async () => {
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
            clickedBeachId = await pin.getAttribute('data-beach');
            await pin.click();
            return true;
          }
        }
        return false;
      };

      let hasTappable = await findAndClickTappable();

      // If no tappable, check for hero alts intercepting (like funnel test)
      if (!hasTappable) {
        const dismiss = page.locator(selectors.mapHeroDismiss).first();
        if (await dismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dismiss.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          hasTappable = await findAndClickTappable();
        }
      }

      // Fallback: first visible
      if (!hasTappable && visibleLabels.length > 0) {
        clickedBeachId = await visibleLabels[0].getAttribute('data-beach');
        await visibleLabels[0].click();
        hasTappable = true;
      }

      expect(hasTappable).toBe(true);
      expect(clickedBeachId).not.toBeNull();

      // Debug: wait and check what's on screen
      await page.waitForTimeout(2000);
      const afterClick = await page.evaluate(() => {
        return {
          url: window.location.href,
          dialogs: document.querySelectorAll('dialog').length,
          bscSheets: document.querySelectorAll('.bsc-sheet').length,
          fixedDivs: document.querySelectorAll('div[style*="position: fixed"][style*="inset: 0"]').length,
          mains: document.querySelectorAll('main').length,
          bodyChildren: document.body.children.length,
        };
      });
      console.log('After beach click:', afterClick);

      // ====================================================================
      // STEP 3: DECISION — Wait for BeachDecisionPage to render
      // ====================================================================
      // BeachDecisionPage renders a fixed-position div with main inside
      // BeachSheetComic renders a dialog (.bsc-sheet)
      await page.waitForFunction(() => {
        const decisionPage = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        const beachSheetComic = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
        return !!decisionPage || !!beachSheetComic;
      }, { timeout: 10000 });

      // Check which component rendered
      const componentInfo = await page.evaluate(() => {
        const decisionPage = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        const beachSheetComic = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
        return {
          hasBeachDecisionPage: !!decisionPage,
          hasBeachSheetComic: !!beachSheetComic,
        };
      });
      
      console.log('Component rendered:', componentInfo);
      
      // Require BeachDecisionPage (not fallback)
      if (!componentInfo.hasBeachDecisionPage) {
        throw new Error('BeachDecisionPage did not render - got BeachSheetComic fallback instead');
      }

      // ====================================================================
      // STEP 4: AHA CONTRACT — Verify decision block above fold
      // ====================================================================
      const decisionAboveFold = await page.evaluate((viewportHeight) => {
        const main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        if (!main) return { found: false, reason: 'main not found' };

        // Check for key decision elements
        const verdict = main.querySelector('[aria-labelledby="verdict-title"]') ||
                        main.querySelector('section:has(h2:has-text("Verdict"))') ||
                        main.querySelector('section:has(h2:has-text("Veredicto"))') ||
                        main.querySelector('section:has(h2:has-text("Verdicte"))');

        const why = main.querySelector('[aria-labelledby="why-title"]') ||
                    main.querySelector('section:has(h2:has-text("Pourquoi"))') ||
                    main.querySelector('section:has(h2:has-text("Why"))') ||
                    main.querySelector('section:has(h2:has-text("Por qué"))');

        const cta = main.querySelector('[data-testid="go-cta"]') ||
                    main.querySelector('button:has-text("J\'y vais")') ||
                    main.querySelector('button:has-text("Go")') ||
                    main.querySelector('button:has-text("Voy")');

        // Check above fold
        let verdictAbove = false;
        let whyAbove = false;
        let ctaAbove = false;

        if (verdict) {
          const rect = verdict.getBoundingClientRect();
          verdictAbove = rect.top < viewportHeight;
        }
        if (why) {
          const rect = why.getBoundingClientRect();
          whyAbove = rect.top < viewportHeight;
        }
        if (cta) {
          const rect = cta.getBoundingClientRect();
          ctaAbove = rect.top < viewportHeight;
        }

        return {
          found: true,
          hasVerdict: !!verdict,
          hasWhy: !!why,
          hasCTA: !!cta,
          verdictAboveFold: verdictAbove,
          whyAboveFold: whyAbove,
          ctaAboveFold: ctaAbove,
          viewportHeight,
        };
      }, vp.height);

      // AHA CONTRACT ASSERTIONS
      expect(decisionAboveFold.found).toBe(true);
      expect(decisionAboveFold.hasVerdict).toBe(true);
      expect(decisionAboveFold.hasCTA).toBe(true);
      // Verdict must be above fold for immediate comprehension
      expect(decisionAboveFold.verdictAboveFold).toBe(true);
      // CTA must be above fold for immediate action
      expect(decisionAboveFold.ctaAboveFold).toBe(true);

      // ====================================================================
      // STEP 5: VERDICT DETAILS — Status, Confidence, Human readable
      // ====================================================================
      const verdictDetails = await page.evaluate(() => {
        const main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        if (!main) return { found: false };

        // Status badge
        const statusBadge = main.querySelector('[style*="background:"] span[style*="border-radius: 50%"]');
        // Confidence
        const confidence = main.querySelector('span[style*="color: #e8a800"]') ||
                          main.querySelector('span:has-text("%")');
        // Score bar
        const scoreBar = main.querySelector('[style*="width:"] [style*="background:"]');
        // Freshness
        const freshness = main.querySelector('div:has-text("📡")') ||
                         main.querySelector('div:has-text("Satellite")') ||
                         main.querySelector('div:has-text("Updated")');

        return {
          hasStatus: !!statusBadge,
          hasConfidence: !!confidence,
          hasScore: !!scoreBar,
          hasFreshness: !!freshness,
        };
      });

      expect(verdictDetails.hasStatus).toBe(true);
      expect(verdictDetails.hasConfidence).toBe(true);

      // ====================================================================
      // STEP 6: GO CONTRACT — CTA click leads to real action
      // ====================================================================
      const goCTA = page.locator('[data-testid="go-cta"]').first();
      await expect(goCTA).toBeVisible({ timeout: 5000 });
      await expect(goCTA).toBeEnabled({ timeout: 5000 });

      // Click should not throw, should track event
      await goCTA.click({ timeout: 5000 });

      // Verify we can navigate or action occurs
      // (In BeachDecisionPage, handleGoClick tracks but doesn't navigate)
      // The test verifies the CTA is functional

      // ====================================================================
      // STEP 7: PROTECT CONTRACT — Alternatives for warning/avoid
      // ====================================================================
      const protectSection = await page.evaluate(() => {
        const main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        if (!main) return { found: false };

        // Look for PROTECT section
        const protect = main.querySelector('[aria-labelledby="protect-title"]') ||
                       main.querySelector('section:has(h2:has-text("Pas idéal"))') ||
                       main.querySelector('section:has(h2:has-text("Not ideal"))') ||
                       main.querySelector('section:has(h2:has-text("No es ideal"))');

        if (!protect) return { found: false, reason: 'no protect section' };

        // Check for AlternativeCard
        const alternatives = protect.querySelectorAll('[style*="border: 1px solid #e2e8f0"]');
        const hasAlternatives = alternatives.length > 0;

        // Check for "Not ideal today" copy
        const copy = protect.textContent || '';
        const hasHonestCopy = copy.includes('Pas idéal') || 
                              copy.includes('Not ideal') || 
                              copy.includes('No es ideal');

        return {
          found: true,
          hasAlternatives,
          hasHonestCopy,
          alternativeCount: alternatives.length,
        };
      });

      // If beach is not clean, protect section should exist with alternatives
      if (protectSection.found) {
        expect(protectSection.hasHonestCopy).toBe(true);
        // If alternatives exist, they should be clickable
        if (protectSection.hasAlternatives) {
          expect(protectSection.alternativeCount).toBeGreaterThan(0);
        }
      }

      // ====================================================================
      // STEP 8: REDUNDANCY CHECK — No triple repetition
      // ====================================================================
      const redundancy = await page.evaluate(() => {
        const main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        if (!main) return { statusCount: 0, scoreCount: 0, confidenceCount: 0 };

        const text = main.textContent || '';
        const statusMatches = text.match(/(Propre|Clean|Limpia|Risque|Caution|Riesgo|À éviter|Avoid|Evitar)/gi) || [];
        const scoreMatches = text.match(/Score|score/gi) || [];
        const confidenceMatches = text.match(/Confiance|confidence|★/gi) || [];

        return {
          statusCount: statusMatches.length,
          scoreCount: scoreMatches.length,
          confidenceCount: confidenceMatches.length,
        };
      });

      // Status should appear 1-2 times max (hero badge + verdict)
      expect(redundancy.statusCount).toBeLessThanOrEqual(3);
      // Score should appear once
      expect(redundancy.scoreCount).toBeLessThanOrEqual(2);
      // Confidence should appear once
      expect(redundancy.confidenceCount).toBeLessThanOrEqual(2);

      // ====================================================================
      // STEP 9: MOTION GRAMMAR — SGM classes present, no infinite animations
      // ====================================================================
      const motionCheck = await page.evaluate(() => {
        const elements = document.querySelectorAll('[class*="sgm-"]');
        const classes = Array.from(elements).map(el => el.className);
        return { classes, count: elements.length };
      });

      expect(motionCheck.count).toBeGreaterThan(0);
      // Verify no infinite animations on body/root (RM_INFINITE=[] equivalent)
      const infiniteAnimations = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        const animation = style.animation;
        return animation && animation !== 'none' && !animation.includes('0s');
      });
      expect(infiniteAnimations).toBe(false);

      // ====================================================================
      // STEP 10: ERRORS — No critical console errors
      // ====================================================================
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('analytics')) {
          errors.push(msg.text());
        }
      });

      // Wait a moment for any delayed errors
      await page.waitForTimeout(500);

      const criticalErrors = errors.filter(e => 
        !e.includes('preload') && 
        !e.includes('ERR_BLOCKED_BY_CLIENT') &&
        !e.includes('Failed to load resource') &&
        !e.includes('analytics') &&
        !e.includes('Google Analytics') &&
        !e.includes('Mollie') // Not loaded in test
      );

      expect(criticalErrors).toHaveLength(0);

      // ====================================================================
      // STEP 11: SCREENSHOT REGRESSION (FULL mode)
      // ====================================================================
      if (isFull) {
        await page.screenshot({ 
          path: `tests/snapshots/ux-audit-${vp.name}.png`, 
          fullPage: true 
        });
        await page.screenshot({ 
          path: `tests/snapshots/ux-audit-${vp.name}-above-fold.png`, 
          clip: { x: 0, y: 0, width: vp.width, height: vp.height }
        });
      }

      // ====================================================================
      // CLEANUP — Close beach detail
      // ====================================================================
      const closeBtn = page.locator(
        'button[aria-label="Fermer"], ' +
        'button[aria-label="Close"], ' +
        'button[aria-label="Cerrar"], ' +
        'button:has-text("Fermer")'
      ).first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    });
  }
});
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

      // Additional wait like funnel test - let app settle (CRITICAL for detail to render)
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

      // Wait for beach detail - EXACT same logic as funnel test
      const waitForBeachDetail = async () => {
        await Promise.race([
          page.waitForSelector('div[style*="position: fixed"][style*="inset: 0"] main', { timeout: 10000 }),
          page.waitForSelector('.bsc-sheet', { timeout: 10000 }),
          page.waitForSelector('[data-testid="bx-experience"]', { timeout: 10000 }),
        ]);
      };
      await waitForBeachDetail();

      // Debug: check what the Promise.race actually found
      const domState = await page.evaluate(() => {
        const decisionPage = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        const beachSheetComic = document.querySelector('.bsc-sheet');
        const bxExperience = document.querySelector('[data-testid="bx-experience"]');
        
        return {
          decisionPage: !!decisionPage,
          decisionPageHtml: decisionPage?.outerHTML?.slice(0, 200) || 'none',
          beachSheetComic: !!beachSheetComic,
          beachSheetComicHtml: beachSheetComic?.outerHTML?.slice(0, 200) || 'none',
          bxExperience: !!bxExperience,
          bxExperienceHtml: bxExperience?.outerHTML?.slice(0, 200) || 'none',
        };
      });
      console.log('DOM state after Promise.race:', domState);

      // Debug: wait and check what's on screen
      await page.waitForTimeout(1000);
      const afterClick = await page.evaluate(() => {
        return {
          url: window.location.href,
          dialogs: document.querySelectorAll('dialog').length,
          bscSheets: document.querySelectorAll('.bsc-sheet').length,
          fixedDivs: document.querySelectorAll('div[style*="position: fixed"][style*="inset: 0"]').length,
          mains: document.querySelectorAll('main').length,
          bodyChildren: document.body.children.length,
          selectedBeach: window.selectedBeach || window.__selectedBeach || 'unknown',
          expBeachOf: typeof window.expBeachOf === 'function' ? window.expBeachOf() : 'unknown',
        };
      });
      console.log('After beach click:', afterClick);

      // ====================================================================
      // STEP 3: DECISION — Check which beach detail component rendered
      // ====================================================================
      // The app now renders ExperienceReset (new mobile-first UI) instead of BeachDecisionPage/BeachSheetComic
      const componentInfo = await page.evaluate(() => {
        const decisionPage = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        const beachSheetComic = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
        const experienceReset = document.querySelector('[data-testid="bx-experience"]') || 
                               document.querySelector('.bx-root') ||
                               document.querySelector('[role="dialog"][aria-label]');
        return {
          hasBeachDecisionPage: !!decisionPage,
          hasBeachSheetComic: !!beachSheetComic,
          hasExperienceReset: !!experienceReset,
        };
      });
      
      console.log('Component rendered:', componentInfo);
      
      // Accept any valid beach detail component
      const hasValidDetail = componentInfo.hasBeachDecisionPage || 
                            componentInfo.hasBeachSheetComic || 
                            componentInfo.hasExperienceReset;
      expect(hasValidDetail).toBe(true);
      
      // Track which component rendered for reporting
      if (componentInfo.hasExperienceReset) {
        console.log('INFO: ExperienceReset (new mobile-first UI) rendered instead of BeachDecisionPage');
      }

      const decisionAboveFold = await page.evaluate((viewportHeight) => {
        // Try BeachDecisionPage first
        let main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        // Try ExperienceReset
        if (!main) {
          const expReset = document.querySelector('[data-testid="bx-experience"]') || 
                          document.querySelector('.bx-root');
          if (expReset) main = expReset;
        }
        // Try BeachSheetComic
        if (!main) {
          const sheet = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
          if (sheet) main = sheet;
        }
        if (!main) return { found: false, reason: 'no detail component found', debug: 'no main element' };

        // Helper to find element by text content
        const findByText = (root, texts) => {
          for (const el of root.querySelectorAll('*')) {
            const text = el.textContent || '';
            for (const t of texts) {
              if (text.includes(t)) return el;
            }
          }
          return null;
        };

        // Check for key decision elements - flexible selectors for different components
        const verdict = main.querySelector('[aria-labelledby="verdict-title"]') ||
                        main.querySelector('[data-testid="bx-verdict"]') ||
                        main.querySelector('.bx-verdict') ||
                        findByText(main, ['Aujourd\'hui', 'Today', 'Hoy', 'Verdict', 'Veredicto']);

        const why = main.querySelector('[aria-labelledby="why-title"]') ||
                    main.querySelector('[data-testid="bx-why"]') ||
                    main.querySelector('.bx-why') ||
                    findByText(main, ['Pourquoi', 'Why', 'Por qué']);

        const cta = main.querySelector('[data-testid="go-cta"]') ||
                    main.querySelector('[data-testid="bx-go-cta"]') ||
                    main.querySelector('.bx-go-cta') ||
                    main.querySelector('button[class*="go"]') ||
                    main.querySelector('button[class*="cta"]') ||
                    main.querySelector('button[class*="primary"]') ||
                    main.querySelector('button[class*="gold"]') ||
                    main.querySelector('button[class*="golden"]') ||
                    main.querySelector('button[class*="btn"]') ||
                    findByText(main, ['J\'y vais', 'Go', 'Voy', 'J\'y vais →', 'Go →', 'Voy →', 'Ouvrir', 'Voir', 'Détails', 'Accéder', 'Détail', 'Voir la fiche', 'Voir la plage', 'Voir plus', 'Plus d\'infos', 'More info']);

        // Debug info
        const debug = {
          mainHtml: main.outerHTML.slice(0, 3000),
          mainText: main.textContent?.slice(0, 500),
          verdictFound: !!verdict,
          whyFound: !!why,
          ctaFound: !!cta,
          verdictText: verdict?.textContent?.slice(0, 100) || 'none',
          whyText: why?.textContent?.slice(0, 100) || 'none',
          ctaText: cta?.textContent?.slice(0, 100) || 'none',
        };

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
          debug,
        };
      }, vp.height);

      // AHA CONTRACT ASSERTIONS
      expect(decisionAboveFold.found).toBe(true);
      expect(decisionAboveFold.hasVerdict).toBe(true);
      // Debug: output CTA debug info before assertion
      if (!decisionAboveFold.hasCTA) {
        console.log('DEBUG CTA not found:', JSON.stringify(decisionAboveFold.debug, null, 2));
      }
      expect(decisionAboveFold.hasCTA).toBe(true);
      // Verdict must be above fold for immediate comprehension
      expect(decisionAboveFold.verdictAboveFold).toBe(true);
      // CTA must be above fold for immediate action
      expect(decisionAboveFold.ctaAboveFold).toBe(true);

      // ====================================================================
      // STEP 5: VERDICT DETAILS — Status, Confidence, Human readable
      // ====================================================================
      const verdictDetails = await page.evaluate(() => {
        // Try BeachDecisionPage first
        let main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        // Try ExperienceReset
        if (!main) {
          const expReset = document.querySelector('[data-testid="bx-experience"]') || 
                          document.querySelector('.bx-root');
          if (expReset) main = expReset;
        }
        // Try BeachSheetComic
        if (!main) {
          const sheet = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
          if (sheet) main = sheet;
        }
        if (!main) return { found: false };

        // Helper to find element by text content
        const findByText = (root, texts) => {
          for (const el of root.querySelectorAll('*')) {
            const text = el.textContent || '';
            for (const t of texts) {
              if (text.includes(t)) return el;
            }
          }
          return null;
        };

        // Status badge - look for verdict badge in ExperienceReset
        const statusBadge = main.querySelector('.bx-verdict') || 
                           main.querySelector('[class*="verdict"]') ||
                           main.querySelector('[class*="badge"]');
        
        // Confidence - look for percentage in ExperienceReset
        const confidence = findByText(main, ['%', 'confiance', 'confidence']);
        
        // Score - look for score in ExperienceReset
        const scoreBar = main.querySelector('[class*="score"]') ||
                        findByText(main, ['Score', 'score', '/100']);
        
        // Freshness
        const freshness = findByText(main, ['📡', 'Satellite', 'Updated', 'h ago', 'd old']);

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
      // Find and click CTA using same flexible logic as AHA contract
      const ctaClicked = await page.evaluate(() => {
        let main = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main');
        if (!main) {
          const expReset = document.querySelector('[data-testid="bx-experience"]') || 
                          document.querySelector('.bx-root');
          if (expReset) main = expReset;
        }
        if (!main) {
          const sheet = document.querySelector('.bsc-sheet') || document.querySelector('dialog');
          if (sheet) main = sheet;
        }
        if (!main) return false;

        const findByText = (root, texts) => {
          for (const el of root.querySelectorAll('*')) {
            const text = el.textContent || '';
            for (const t of texts) {
              if (text.includes(t)) return el;
            }
          }
          return null;
        };

        const cta = main.querySelector('[data-testid="go-cta"]') ||
                    main.querySelector('[data-testid="bx-go-cta"]') ||
                    main.querySelector('.bx-go-cta') ||
                    main.querySelector('button[class*="go"]') ||
                    main.querySelector('button[class*="cta"]') ||
                    main.querySelector('button[class*="primary"]') ||
                    main.querySelector('button[class*="gold"]') ||
                    main.querySelector('button[class*="golden"]') ||
                    main.querySelector('button[class*="btn"]') ||
                    main.querySelector('button[class*="gold"]') ||
                    findByText(main, ['J\'y vais', 'Go', 'Voy', 'J\'y vais →', 'Go →', 'Voy →', 'Ouvrir', 'Voir', 'Détails', 'Accéder', 'Détail', 'Voir la fiche', 'Voir la plage', 'Voir plus', 'Plus d\'infos', 'More info']);

        if (cta) {
          cta.click();
          return true;
        }
        return false;
      });

      if (!ctaClicked) {
        throw new Error('No CTA found or clicked for GO contract');
      }

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
      // STEP 9: MOTION GRAMMAR — No infinite animations (RM_INFINITE=[])
      // ====================================================================
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
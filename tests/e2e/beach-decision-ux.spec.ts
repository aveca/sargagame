import { test, expect, type Page } from "@playwright/test";
import { selectors } from "../utils/selectors";

const BASE_URL = process.env.PREVIEW_URL || "http://localhost:4173";

test.describe("BeachDecisionPage UX Audit", () => {
  const viewports = [
    { name: "390px", width: 390, height: 844 },
    { name: "375px", width: 375, height: 812 },
    { name: "430px", width: 430, height: 932 },
    { name: "desktop", width: 1440, height: 900 }
  ];

  for (const vp of viewports) {
    test(`BeachDecisionPage visual audit @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL + "/", { waitUntil: "load", timeout: 60000 });
      
      // Navigate to Carte tab
      const carteTab = page.locator('nav.sg-bottom-nav button:has-text("Carte"), nav.sg-bottom-nav button:has-text("Map"), nav.sg-bottom-nav button:has-text("Mapa")').first();
      await expect(carteTab).toBeVisible({ timeout: 15000 });
      await carteTab.click();
      await page.waitForTimeout(2000);
      
      // Wait for map
      await page.waitForSelector(selectors.mapReady, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      
      // Find and click a tappable beach pin
      const pins = page.locator(`${selectors.mapPin}[role='button']`);
      const count = await pins.count();
      let clicked = false;
      
      for (let i = 0; i < Math.min(count, 5); i++) {
        const pin = pins.nth(i);
        const isVisible = await pin.isVisible().catch(() => false);
        if (isVisible) {
          const box = await pin.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            const hit = await pin.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return hit && (hit === el || el.contains(hit));
            });
            if (hit) {
              await pin.click();
              clicked = true;
              break;
            }
          }
        }
      }
      
      if (!clicked && count > 0) {
        await pins.first().click();
        clicked = true;
      }
      
      expect(clicked).toBe(true);
      await page.waitForTimeout(1500);
      
      // Check which beach detail component rendered
      const componentType = await page.evaluate(() => {
        // BeachDecisionPage: fixed div with main inside
        const decisionPage = document.querySelector('div[style*="position: fixed"][style*="inset: 0"] main') ||
                            document.querySelector('main');
        // BeachSheetComic: dialog or .bsc-sheet
        const beachSheetComic = document.querySelector('.bsc-sheet') || 
                               document.querySelector('dialog') ||
                               document.querySelector('[role="dialog"]');
        const beachSheet = document.querySelector('.sheet') || 
                          document.querySelector('.lc-detail');
        
        // Also check for any fixed overlay
        const fixedOverlays = document.querySelectorAll('div[style*="position: fixed"][style*="inset: 0"]');
        
        return {
          hasBeachDecisionPage: !!decisionPage,
          hasBeachSheetComic: !!beachSheetComic,
          hasBeachSheet: !!beachSheet,
          fixedOverlayCount: fixedOverlays.length,
          url: window.location.href,
          JOURNEY_OFF: new URLSearchParams(window.location.search).has('sgjourney'),
          mainCount: document.querySelectorAll('main').length
        };
      });
      
      console.log(`\n=== ${vp.name} Component Detection ===`);
      console.log(JSON.stringify(componentType, null, 2));
      
      // Screenshot regardless
      await page.screenshot({ 
        path: `tests/ux-recordings/beach-decision-${vp.name}.png`, 
        fullPage: true 
      });
      
      // Screenshot above fold only
      await page.screenshot({ 
        path: `tests/ux-recordings/beach-decision-${vp.name}-above-fold.png`, 
        clip: { x: 0, y: 0, width: vp.width, height: vp.height }
      });
      
      // If BeachDecisionPage is rendered, analyze it
      if (componentType.hasBeachDecisionPage) {
        const aboveFold = await page.evaluate((viewportHeight) => {
          const main = document.querySelector('main');
          if (!main) return { found: false };
          
          const sections = main.querySelectorAll('section');
          const viewportH = viewportHeight;
          let aboveFoldContent = [];
          
          for (const section of sections) {
            const rect = section.getBoundingClientRect();
            if (rect.top < viewportH) {
              aboveFoldContent.push({
                tag: section.tagName,
                classes: section.className,
                text: section.textContent?.slice(0, 150) || '',
                top: rect.top,
                height: rect.height
              });
            }
          }
          
          const verdict = document.querySelector('[aria-labelledby="verdict-title"]') || 
                         document.querySelector('section:has(h2:has-text("Verdict"))') ||
                         document.querySelector('section:has(h2:has-text("Verdicto"))');
          
          const why = document.querySelector('[aria-labelledby="why-title"]') ||
                     document.querySelector('section:has(h2:has-text("Pourquoi"))') ||
                     document.querySelector('section:has(h2:has-text("Why"))');
          
          const cta = document.querySelector('[data-testid="go-cta"]');
          
          return {
            found: true,
            sectionsAboveFold: aboveFoldContent.length,
            totalSections: sections.length,
            aboveFoldContent,
            hasVerdictAboveFold: !!verdict,
            hasWhyAboveFold: !!why,
            hasCTAAboveFold: !!cta,
            viewportHeight: viewportH
          };
        }, vp.height);
        
        console.log(`\n=== ${vp.name} Above Fold Analysis ===`);
        console.log(JSON.stringify(aboveFold, null, 2));
        
        // Check for redundancy
        const redundancy = await page.evaluate(() => {
          const main = document.querySelector('main');
          if (!main) return { statusCount: 0, scoreCount: 0, confidenceCount: 0 };
          
          const text = main.textContent || '';
          const statusMatches = text.match(/(Propre|Clean|Limpia|Risque|Caution|Riesgo|À éviter|Avoid|Evitar)/gi) || [];
          const scoreMatches = text.match(/Score|score/gi) || [];
          const confidenceMatches = text.match(/Confiance|confidence|★/gi) || [];
          
          return {
            statusCount: statusMatches.length,
            scoreCount: scoreMatches.length,
            confidenceCount: confidenceMatches.length
          };
        });
        
        console.log(`Redundancy check:`, redundancy);
        
        // Check for sgm motion classes
        const motions = await page.evaluate(() => {
          const elements = document.querySelectorAll('[class*="sgm-"]');
          return Array.from(elements).map(el => el.className);
        });
        console.log(`Motion classes found:`, motions);
      }
      
      // Close beach detail - works for both components
      const closeBtn = page.locator('button[aria-label="Fermer"], button[aria-label="Close"], button[aria-label="Cerrar"], button:has-text("Fermer")').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    });
  }
});
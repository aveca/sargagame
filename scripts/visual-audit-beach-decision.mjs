import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT_DIR = 'tests/ux-recordings/beach-decision-audit';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function auditBeachDecision() {
  const browser = await chromium.launch({ headless: false });
  const viewports = [
    { name: '390px', width: 390, height: 844 },
    { name: '375px', width: 375, height: 812 },
    { name: '430px', width: 430, height: 932 },
    { name: 'desktop', width: 1440, height: 900 }
  ];

  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', e => errors.push({ type: 'pageerror', message: e.message }));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ type: 'console', message: msg.text() });
  });

  for (const vp of viewports) {
    console.log(`\n=== Auditing ${vp.name} (${vp.width}x${vp.height}) ===`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    
    // Navigate to home first
    await page.goto('http://localhost:8799', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Find and click a beach pin
    const pins = await page.locator('[data-beach]').all();
    console.log(`Found ${pins.length} beach pins`);
    
    if (pins.length > 0) {
      // Click first clean beach if possible, otherwise first pin
      let clicked = false;
      for (const pin of pins.slice(0, 5)) {
        const beachId = await pin.getAttribute('data-beach');
        if (beachId) {
          await pin.click();
          clicked = true;
          console.log(`Clicked beach: ${beachId}`);
          break;
        }
      }
      
      if (!clicked && pins.length > 0) {
        await pins[0].click();
        console.log('Clicked first available pin');
      }
      
      await page.waitForTimeout(1500);
      
      // Wait for BeachDecisionPage to appear
      try {
        await page.waitForSelector('main', { timeout: 5000 });
      } catch (e) {
        console.log('No main element found, checking for BeachDecisionPage...');
      }
      
      // Take screenshot
      const screenshotPath = path.join(OUT_DIR, `beach-decision-${vp.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved: ${screenshotPath}`);
      
      // Check above-fold content
      const aboveFold = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (!main) return { found: false };
        const rect = main.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
        const items = main.querySelectorAll('section, div[style*="border"]');
        return {
          found: true,
          visibleHeight,
          viewportHeight,
          sectionCount: items.length,
          firstSectionText: items[0]?.textContent?.slice(0, 200) || ''
        };
      });
      console.log('Above fold:', aboveFold);
      
      // Close beach detail
      const closeBtn = page.locator('button[aria-label="Fermer"], button[aria-label="Close"], button[aria-label="Cerrar"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }
    
    // Also test list view
    await page.goto('http://localhost:8799', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);
    
    // Switch to list view if possible
    const listBtn = page.locator('[data-testid="xp-all"], button:has-text("Plages"), button:has-text("Beaches")').first();
    if (await listBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await listBtn.click();
      await page.waitForTimeout(1000);
      
      const listItems = await page.locator('[data-testid="xp-beach-card"], .beach-card, article').all();
      if (listItems.length > 0) {
        await listItems[0].click();
        await page.waitForTimeout(1500);
        
        const listScreenshot = path.join(OUT_DIR, `beach-decision-list-${vp.name}.png`);
        await page.screenshot({ path: listScreenshot, fullPage: true });
        console.log(`List view screenshot: ${listScreenshot}`);
      }
    }
  }

  await browser.close();
  
  // Save errors
  fs.writeFileSync(path.join(OUT_DIR, 'errors.json'), JSON.stringify(errors, null, 2));
  console.log('\n=== Errors ===');
  console.log(JSON.stringify(errors, null, 2));
}

auditBeachDecision().catch(console.error);
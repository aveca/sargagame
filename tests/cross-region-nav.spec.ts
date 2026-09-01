import { test, expect } from '@playwright/test';

const REGIONS = [
  { code: 'mq', domain: 'https://sargasses-martinique.com', name: 'Martinique', expectedBeaches: 53 },
  { code: 'gp', domain: 'https://sargasses-guadeloupe.com', name: 'Guadeloupe', expectedBeaches: 83 },
  { code: 'fl', domain: 'https://sargassummiami.com', name: 'Florida/Miami', expectedBeaches: 53 },
  { code: 'pc', domain: 'https://sargassumpuntacana.com', name: 'Punta Cana', expectedBeaches: 53 },
  { code: 'rm', domain: 'https://sargassumcancun.com', name: 'Cancun/Riviera Maya', expectedBeaches: 53 },
  { code: 'tl', domain: 'https://sargazotulum.com', name: 'Tulum', expectedBeaches: 53 },
];

const OTHER_REGIONS = REGIONS.filter(r => r.code !== 'mq');

test.describe('Cross-Region Navigation & Data Specificity', () => {
  
  test('Cross-region nav exists on all domains', async ({ page }) => {
    for (const region of REGIONS) {
      await page.goto(region.domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Check for cross-region navigation (could be in header, footer, or bottom nav)
      const crossNavSelectors = [
        '[data-testid="cross-region-nav"]',
        '.cross-region-nav',
        'nav[aria-label*="region" i]',
        'footer a[href*="sargasses"]',
        'header a[href*="sargasses"]',
        '.region-selector',
        '[data-region-switcher]',
        'a[href*="sargasses-guadeloupe"]',
        'a[href*="sargassummiami"]',
        'a[href*="sargassumpuntacana"]',
        'a[href*="sargassumcancun"]',
        'a[href*="sargazotulum"]',
      ];
      
      let found = false;
      for (const selector of crossNavSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`✓ ${region.code}: Cross-region nav found via "${selector}" (${count} elements)`);
          found = true;
          break;
        }
      }
      
      if (!found) {
        // Check bottom nav for region links
        const bottomNavLinks = await page.locator('.sg-bottom-nav a, .bottom-nav a, nav[role="navigation"] a').all();
        for (const link of bottomNavLinks) {
          const href = await link.getAttribute('href');
          if (href && REGIONS.some(r => href.includes(r.domain.replace('https://', '')))) {
            console.log(`✓ ${region.code}: Cross-region link found in bottom nav: ${href}`);
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        console.log(`⚠ ${region.code}: NO cross-region navigation found`);
      }
      
      // Screenshot for evidence
      await page.screenshot({ path: `tests/cross-region-screenshots/${region.code}-homepage.png`, fullPage: true });
    }
  });

  test('Cross-region links navigate to correct domains', async ({ page }) => {
    for (const sourceRegion of REGIONS) {
      await page.goto(sourceRegion.domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Find all links to other regions
      const allLinks = await page.locator('a[href]').all();
      
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (!href) continue;
        
        // Check if it's a cross-region link
        const targetRegion = REGIONS.find(r => href.includes(r.domain.replace('https://', '')));
        if (targetRegion && targetRegion.code !== sourceRegion.code) {
          console.log(`Testing: ${sourceRegion.code} → ${targetRegion.code} (${href})`);
          
          // Click and verify navigation
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
            link.click({ force: true })
          ]);
          
          // Verify we landed on the correct domain
          const currentUrl = page.url();
          expect(currentUrl).toContain(targetRegion.domain.replace('https://', ''));
          
          console.log(`✓ ${sourceRegion.code} → ${targetRegion.code}: Landed on ${currentUrl}`);
          
          // Go back to source for next link
          await page.goBack({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('Data specificity - each region shows its own data', async ({ page }) => {
    const results = [];
    
    for (const region of REGIONS) {
      await page.goto(region.domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Check region name displayed
      const pageText = await page.locator('body').innerText();
      const regionNameFound = pageText.toLowerCase().includes(region.name.toLowerCase()) ||
                              pageText.toLowerCase().includes(region.code.toLowerCase());
      
      // Check beach count in list view
      await page.click('[data-testid="list-view-toggle"], button:has-text("Liste"), button:has-text("List")').catch(() => {});
      await page.waitForTimeout(1000);
      
      const listItems = await page.locator('[data-testid="beach-item"], .beach-item, .beach-card, li:has-text("Plage")').count();
      
      // Check map center (approximate)
      const mapContainer = page.locator('#map, .map-container, [data-testid="map"]').first();
      const mapBox = await mapContainer.boundingBox().catch(() => null);
      
      // Check for region-specific content (beach names)
      const beachNames = await page.locator('[data-testid="beach-name"], .beach-name, h3, h4').allInnerTexts();
      const regionSpecificBeaches = beachNames.filter(name => 
        name.toLowerCase().includes(region.name.toLowerCase().split('/')[0].trim().toLowerCase()) ||
        (region.code === 'mq' && name.toLowerCase().includes('martinique')) ||
        (region.code === 'gp' && name.toLowerCase().includes('guadeloupe')) ||
        (region.code === 'fl' && (name.toLowerCase().includes('miami') || name.toLowerCase().includes('florida'))) ||
        (region.code === 'pc' && name.toLowerCase().includes('punta cana')) ||
        (region.code === 'rm' && (name.toLowerCase().includes('cancun') || name.toLowerCase().includes('riviera'))) ||
        (region.code === 'tl' && name.toLowerCase().includes('tulum'))
      );
      
      results.push({
        domain: region.domain,
        code: region.code,
        name: region.name,
        regionNameFound,
        beachCount: listItems,
        expectedBeaches: region.expectedBeaches,
        regionSpecificBeachNames: regionSpecificBeaches.length,
        mapLoaded: !!mapBox
      });
      
      console.log(`\n${region.code} (${region.name}):`);
      console.log(`  Region name in page: ${regionNameFound ? '✓' : '✗'}`);
      console.log(`  Beach count: ${listItems} (expected: ${region.expectedBeaches})`);
      console.log(`  Region-specific beach names: ${regionSpecificBeaches.length}`);
      console.log(`  Map loaded: ${!!mapBox ? '✓' : '✗'}`);
    }
    
    console.log('\n=== DATA SPECIFICITY SUMMARY ===');
    for (const r of results) {
      const score = (r.regionNameFound ? 2 : 0) + (r.beachCount > 0 ? 2 : 0) + (r.regionSpecificBeachNames > 0 ? 2 : 0) + (r.mapLoaded ? 2 : 0) + (r.beachCount === r.expectedBeaches ? 2 : 0);
      console.log(`${r.code}: ${score}/10 - Beaches: ${r.beachCount}/${r.expectedBeaches}, Region-specific: ${r.regionSpecificBeachNames}, Map: ${r.mapLoaded}`);
    }
  });

  test('_redirects - SPA fallback returns 200', async ({ page }) => {
    for (const region of REGIONS) {
      // Test non-existent route (SPA fallback)
      const response = await page.goto(`${region.domain}/n-importe-quoi`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      expect(response?.status()).toBe(200);
      console.log(`✓ ${region.code}: /n-importe-quoi → ${response?.status()}`);
      
      // Test valid beach route
      const response2 = await page.goto(`${region.domain}/beach/test`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      expect(response2?.status()).toBe(200);
      console.log(`✓ ${region.code}: /beach/test → ${response2?.status()}`);
      
      // Test API health
      const apiResponse = await page.request.get(`${region.domain}/api/health`);
      expect(apiResponse.status()).toBe(200);
      console.log(`✓ ${region.code}: /api/health → ${apiResponse.status()}`);
    }
  });

  test('Branding consistency across regions', async ({ page }) => {
    const brandingResults = [];
    
    for (const region of REGIONS) {
      await page.goto(region.domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Check project name in title
      const title = await page.title();
      
      // Check logo
      const logo = await page.locator('img[alt*="logo" i], img[alt*="sarga" i], .logo img, header img').first().getAttribute('src').catch(() => null);
      
      // Check primary color (CSS variable or computed style)
      const primaryColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || getComputedStyle(document.body).getPropertyValue('color').trim());
      
      // Check font family
      const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      
      // Check navigation structure
      const navItems = await page.locator('nav a, .bottom-nav a, header a').allInnerTexts();
      
      brandingResults.push({
        code: region.code,
        title,
        logo,
        primaryColor,
        fontFamily,
        navItemsCount: navItems.length,
        navItems: navItems.slice(0, 5)
      });
      
      console.log(`\n${region.code} Branding:`);
      console.log(`  Title: ${title}`);
      console.log(`  Logo: ${logo ? '✓' : '✗'}`);
      console.log(`  Primary color: ${primaryColor}`);
      console.log(`  Font: ${fontFamily}`);
      console.log(`  Nav items: ${navItemsCount}`);
    }
    
    console.log('\n=== BRANDING CONSISTENCY ===');
    const first = brandingResults[0];
    for (const r of brandingResults) {
      const consistent = r.primaryColor === first.primaryColor && r.fontFamily === first.fontFamily;
      console.log(`${r.code}: ${consistent ? '✓ CONSISTENT' : '⚠ DIFFERS'} - Color: ${r.primaryColor}, Font: ${r.fontFamily}`);
    }
  });

  test('Language selector (if present)', async ({ page }) => {
    for (const region of REGIONS) {
      await page.goto(region.domain, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Look for language selector
      const langSelectors = [
        '[data-testid="language-selector"]',
        '.language-selector',
        'select[name="lang"]',
        'button:has-text("FR")',
        'button:has-text("EN")',
        'button:has-text("ES")',
        '[aria-label*="language" i]',
        '.lang-switcher'
      ];
      
      let found = false;
      for (const selector of langSelectors) {
        const el = page.locator(selector).first();
        if (await el.count() > 0) {
          found = true;
          console.log(`\n${region.code}: Language selector found (${selector})`);
          
          // Test FR
          await page.click('button:has-text("FR"), option[value="fr"]').catch(() => {});
          await page.waitForTimeout(500);
          const frText = await page.locator('body').innerText();
          console.log(`  FR: ${frText.substring(0, 100)}...`);
          
          // Test EN
          await page.click('button:has-text("EN"), option[value="en"]').catch(() => {});
          await page.waitForTimeout(500);
          const enText = await page.locator('body').innerText();
          console.log(`  EN: ${enText.substring(0, 100)}...`);
          
          // Test ES
          await page.click('button:has-text("ES"), option[value="es"]').catch(() => {});
          await page.waitForTimeout(500);
          const esText = await page.locator('body').innerText();
          console.log(`  ES: ${esText.substring(0, 100)}...`);
          
          break;
        }
      }
      
      if (!found) {
        console.log(`${region.code}: No language selector found`);
      }
    }
  });
});
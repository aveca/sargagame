import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const DIR = 'C:\\Users\\user\\Documents\\Backup\\sargagame\\screenshots-audit';
await mkdir(DIR, { recursive: true });

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '1440', width: 1440, height: 900 },
];

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    userAgent: vp.name === '390'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    isMobile: vp.name === '390',
    hasTouch: vp.name === '390',
    deviceScaleFactor: vp.name === '390' ? 2 : 1,
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log(`\n=== VIEWPORT ${vp.name} ===`);

  // 1. Default map
  console.log('1. Loading map...');
  await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(5000); // wait for React mount and data fetch
  await page.screenshot({ path: `${DIR}/MAP_DEFAULT_${vp.name}.png`, fullPage: false });
  console.log('   MAP_DEFAULT captured');

  // Check if React mounted
  const rootContent = await page.evaluate(() => {
    const root = document.getElementById('root');
    return { exists: !!root, childCount: root?.children.length || 0, height: root?.offsetHeight || 0 };
  });
  console.log(`   Root: ${JSON.stringify(rootContent)}`);

  // 2. Check for specific elements
  const navCount = await page.$$eval('nav, [role="navigation"], [data-testid*="nav"], .sg-bottom-nav, [class*="bottom-nav"]', els => els.length);
  console.log(`   Nav elements found: ${navCount}`);

  // 3. Look for SVG/map elements
  const svgCount = await page.$$eval('svg', els => els.length);
  console.log(`   SVG elements: ${svgCount}`);

  // 4. Check for beach pins
  const pinCount = await page.$$eval('[data-beach], .beach-pin, [class*="pin"], circle[r]', els => els.length);
  console.log(`   Pin-like elements: ${pinCount}`);

  // 5. Try to find and click a beach using evaluate
  console.log('2. Trying to click on map area...');
  try {
    // First, let's see what's in the DOM
    const bodyHTML = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML.substring(0, 500) : 'NO ROOT';
    });
    console.log(`   Root HTML start: ${bodyHTML.substring(0, 200)}...`);

    // Click in the center of the map area
    await page.mouse.click(vp.width / 2, vp.height / 2 - 50);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${DIR}/MAP_CLICKED_${vp.name}.png`, fullPage: false });
    console.log('   MAP_CLICKED captured');
  } catch(e) { console.log('   Click error:', e.message); }

  // 6. Check for premium/paywall via bottom nav
  console.log('3. Looking for bottom nav...');
  const navButtons = await page.$$eval('button, [role="tab"], a[href]', els => {
    return els.filter(el => {
      const txt = (el.textContent || '').toLowerCase();
      return txt.includes('plage') || txt.includes('premium') || txt.includes('carte');
    }).slice(0, 5).map(el => ({tag: el.tagName, text: el.textContent?.trim().substring(0, 30), id: el.id, className: el.className?.toString().substring(0, 50)}));
  });
  console.log(`   Nav buttons found: ${JSON.stringify(navButtons)}`);

  // 7. Navigate to list view
  console.log('4. Navigating to list view...');
  try {
    await page.goto('http://localhost:4173/?view=list', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/LIST_VIEW_${vp.name}.png`, fullPage: false });
    console.log('   LIST_VIEW captured');
  } catch(e) { console.log('   List view error:', e.message); }

  // 8. Navigate to paywall
  console.log('5. Opening paywall...');
  try {
    await page.goto('http://localhost:4173/?paywall=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/PAYWALL_${vp.name}.png`, fullPage: false });
    console.log('   PAYWALL captured');
  } catch(e) { console.log('   Paywall error:', e.message); }

  // 9. Premium modal
  console.log('6. Premium modal...');
  try {
    await page.goto('http://localhost:4173/?premium=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/PREMIUM_MODAL_${vp.name}.png`, fullPage: false });
    console.log('   PREMIUM_MODAL captured');
  } catch(e) { console.log('   Premium modal error:', e.message); }

  // 10. Beach interactive
  console.log('7. Beach interaction...');
  try {
    await page.goto('http://localhost:4173/?beach=les-salines', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/BEACH_INTERACTIVE_${vp.name}.png`, fullPage: false });
    console.log('   BEACH_INTERACTIVE captured');
  } catch(e) { console.log('   Beach error:', e.message); }

  // 11. Archipel view
  console.log('8. Archipel view...');
  try {
    await page.goto('http://localhost:4173/?archipel=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/ARCHIPEL_${vp.name}.png`, fullPage: false });
    console.log('   ARCHIPEL captured');
  } catch(e) { console.log('   Archipel error:', e.message); }

  // 12. Hero landing
  console.log('9. Hero landing...');
  try {
    await page.goto('http://localhost:4173/?hero=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/HERO_LANDING_${vp.name}.png`, fullPage: false });
    console.log('   HERO_LANDING captured');
  } catch(e) { console.log('   Hero error:', e.message); }

  // 13. SargaChat
  console.log('10. SargaChat...');
  try {
    await page.goto('http://localhost:4173/?chat=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/SARGACHAT_${vp.name}.png`, fullPage: false });
    console.log('   SARGACHAT captured');
  } catch(e) { console.log('   SargaChat error:', e.message); }

  // 14. Scroll full page on map
  console.log('11. Full map scroll...');
  try {
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/MAP_FULL_${vp.name}.png`, fullPage: true });
    console.log('   MAP_FULL captured');
  } catch(e) { console.log('   Full map error:', e.message); }

  // 15. Hero variant
  console.log('12. Hero az...');
  try {
    await page.goto('http://localhost:4173/?prev_az=1', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${DIR}/HERO_AZ_${vp.name}.png`, fullPage: false });
    console.log('   HERO_AZ captured');
  } catch(e) { console.log('   Hero AZ error:', e.message); }

  // 16. Map full
  console.log('13. Map with controls...');
  try {
    await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(4000);
    // Hover on the map to see any hover effects
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${DIR}/MAP_HOVER_${vp.name}.png`, fullPage: false });
    console.log('   MAP_HOVER captured');
  } catch(e) { console.log('   Map hover error:', e.message); }

  // 17. Check console errors
  if (errors.length > 0) {
    const uniqueErrors = [...new Set(errors)];
    console.log(`\nJS ERRORS (${errors.length} total, ${uniqueErrors.length} unique):`);
    uniqueErrors.forEach(e => console.log(`  - ${e.substring(0, 200)}`));
  } else {
    console.log('\nNo JS errors detected.');
  }

  await context.close();
}

await browser.close();
console.log('\n=== AUDIT COMPLETE ===');

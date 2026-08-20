import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:4174';
const AUDIT_DIR = resolve(import.meta.dirname, '..', 'audit');

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' };

async function ss(page, dir, name) {
  const folder = resolve(AUDIT_DIR, dir);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: resolve(folder, `${name}-mobile.png`), fullPage: false });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ...MOBILE, viewport: { width: MOBILE.width, height: MOBILE.height } });
const page = await ctx.newPage();

// Test 1: CORRECT slug - /plages/plage-des-salines/
console.log('=== TEST 1: /plages/plage-des-salines/ (correct slug) ===');
await page.goto(`${BASE}/plages/plage-des-salines/`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(4000);

// Dismiss cookies
try {
  const accept = await page.$('button:has-text("Accepter")');
  if (accept && await accept.isVisible()) await accept.click();
} catch(e) {}
await page.waitForTimeout(500);

const state1 = await page.evaluate(() => {
  const h = document.querySelector('h1, h2');
  const dialogs = document.querySelectorAll('[role="dialog"], [class*="sheet"], [class*="detail"]');
  const visibleDialogs = Array.from(dialogs).filter(d => d.offsetParent !== null || getComputedStyle(d).display !== 'none');
  return {
    heading: h?.textContent?.trim(),
    url: window.location.pathname,
    dialogCount: visibleDialogs.length,
    dialogTexts: visibleDialogs.map(d => d.textContent?.slice(0, 100)),
    bodyPreview: document.body?.textContent?.slice(0, 200)
  };
});
console.log('Result:', JSON.stringify(state1, null, 2));
await ss(page, 'audit-fix', '01-correct-slug');

// Test 2: Another correct slug - /plages/grande-anse-d-arlet/
console.log('\n=== TEST 2: /plages/grande-anse-d-arlet/ ===');
await page.goto(`${BASE}/plages/grande-anse-d-arlet/`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(4000);
const state2 = await page.evaluate(() => {
  const h = document.querySelector('h1, h2');
  return { heading: h?.textContent?.trim(), url: window.location.pathname };
});
console.log('Result:', JSON.stringify(state2));
await ss(page, 'audit-fix', '02-grande-anse');

// Test 3: Wrong slug - /plages/les-salines-martinique/
console.log('\n=== TEST 3: /plages/les-salines-martinique/ (wrong slug) ===');
await page.goto(`${BASE}/plages/les-salines-martinique/`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(4000);
const state3 = await page.evaluate(() => {
  const h = document.querySelector('h1, h2');
  return { heading: h?.textContent?.trim(), url: window.location.pathname };
});
console.log('Result:', JSON.stringify(state3));
await ss(page, 'audit-fix', '03-wrong-slug');

// Test 4: Verify beach sheet actually opens (check for sheet/dialog)
console.log('\n=== TEST 4: Verify sheet opens on correct slug ===');
await page.goto(`${BASE}/plages/plage-des-salines/`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(5000);
const sheetCheck = await page.evaluate(() => {
  // Check all elements that could be a beach sheet
  const allEls = document.querySelectorAll('*');
  const sheetCandidates = [];
  for (const el of allEls) {
    const cls = el.className?.toString() || '';
    const text = el.textContent?.slice(0, 50) || '';
    if ((cls.includes('sheet') || cls.includes('detail') || cls.includes('beach') || cls.includes('comic')) 
        && el.offsetParent !== null 
        && text.length > 10) {
      sheetCandidates.push({ class: cls.slice(0, 60), text: text.slice(0, 80), tag: el.tagName });
    }
  }
  return sheetCandidates.slice(0, 5);
});
console.log('Sheet candidates:', JSON.stringify(sheetCheck, null, 2));

// Also check if selectedBeach state is set
const selectedBeach = await page.evaluate(() => {
  // Try to read React state
  const root = document.getElementById('root');
  return root ? 'root exists' : 'no root';
});
console.log('Root check:', selectedBeach);

await ctx.close();
await browser.close();

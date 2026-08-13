import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const DIR = 'C:\\Users\\user\\Documents\\Backup\\sargagame\\screenshots-audit';
await mkdir(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});

const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

async function shoot(name, opts = {}) {
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: opts.fullPage || false });
  console.log(`  ✓ ${name}`);
}

async function settle(ms = 2000) {
  await page.waitForTimeout(ms);
}

console.log('\n=== INTERACTIVE FLOW AUDIT (390px) ===\n');

// 1. Load map
console.log('1. Load map');
await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 30000 });
await settle(5000);
await shoot('F01_MAP_LOAD');

// 2. Dismiss cookie banner
console.log('2. Dismiss cookie banner');
try {
  await page.click('button:has-text("Refuser")', { force: true, timeout: 5000 });
  await settle(1000);
  await shoot('F02_COOKIE_DISMISSED');
} catch(e) { console.log('   Cookie banner not found'); }

// 3. Click on bottom nav "Plages" tab
console.log('3. Click bottom nav Plages');
try {
  await page.click('button:has-text("Plages")', { force: true, timeout: 5000 });
  await settle(2000);
  await shoot('F03_LIST_VIEW');
} catch(e) { console.log('   Plages nav error:', e.message.substring(0, 100)); }

// 4. Check if list view actually opened by looking for beach cards
const listCards = await page.$$eval('[class*="beach"]', els => els.length);
console.log(`   Beach-like elements: ${listCards}`);

// 5. Go back to map
console.log('4. Back to map');
try {
  await page.click('button:has-text("Carte")', { force: true, timeout: 5000 });
  await settle(2000);
  await shoot('F04_MAP_AGAIN');
} catch(e) { console.log('   Map nav error:', e.message.substring(0, 100)); }

// 6. Click on a beach marker on the map (try "Plage des Salines" area)
console.log('5. Click on beach marker');
try {
  // The Salines marker is at the bottom of the island - click at approximately (490, 750) on the map
  // But the position depends on viewport. Let's try clicking on a green pin area
  const pins = await page.$$('svg circle, [data-beach]');
  console.log(`   SVG pins found: ${pins.length}`);
  // Click on the first visible pin
  if (pins.length > 0) {
    const box = await pins[0].boundingBox();
    console.log(`   First pin box: ${JSON.stringify(box)}`);
    if (box) {
      await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
      await settle(3000);
      await shoot('F05_BEACH_PIN_CLICKED');
    }
  }
} catch(e) { console.log('   Beach click error:', e.message.substring(0, 100)); }

// 7. Try clicking on "Plage des Salines" label text
console.log('6. Click Plage des Salines label');
try {
  await page.click('text=/Plage des Salines/i', { force: true, timeout: 5000 });
  await settle(3000);
  await shoot('F06_SALINES_LABEL_CLICKED');
} catch(e) { console.log('   Label click error:', e.message.substring(0, 100)); }

// 8. Try clicking on the Veilleur (satellite mascot) in the corner
console.log('7. Click Veilleur mascot');
try {
  // The satellite mascot is visible in the top-right area
  await page.mouse.click(340, 400);
  await settle(2000);
  await shoot('F07_VEILLEUR_CLICK');
} catch(e) { console.log('   Veilleur error:', e.message.substring(0, 100)); }

// 9. Try clicking "Voir la carte" CTA from hero
console.log('8. Direct hero view');
await page.goto('http://localhost:4173/?hero=1', { waitUntil: 'load', timeout: 15000 });
await settle(4000);
await shoot('F08_HERO_LANDING');

// 10. Click "JE VEUX" or email signup
console.log('9. Email signup on hero');
try {
  await page.fill('input[type="email"], input[placeholder*="email"]', 'test@example.com');
  await settle(500);
  await shoot('F09_HERO_EMAIL_FILLED');
  // Click JE VEUX button
  await page.click('button:has-text("JE VEUX")', { force: true, timeout: 5000 });
  await settle(2000);
  await shoot('F10_HERO_AFTER_SUBMIT');
} catch(e) { console.log('   Email signup error:', e.message.substring(0, 100)); }

// 11. Click "Voir la carte" from hero
console.log('10. Click Voir la carte');
try {
  await page.click('text=/Voir la carte/i', { force: true, timeout: 5000 });
  await settle(3000);
  await shoot('F11_HERO_TO_MAP');
} catch(e) { console.log('   Voir la carte error:', e.message.substring(0, 100)); }

// 12. Try to open Premium tab
console.log('11. Open Premium tab');
await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 15000 });
await settle(4000);
try {
  await page.click('button:has-text("Premium")', { force: true, timeout: 5000 });
  await settle(3000);
  await shoot('F12_PREMIUM_OPEN');
} catch(e) { console.log('   Premium tab error:', e.message.substring(0, 100)); }

// 13. Scroll paywall to see all content
console.log('12. Scroll paywall');
try {
  await page.evaluate(() => {
    const sheet = document.querySelector('.sg-modal-panel, [role="dialog"]');
    if (sheet) sheet.scrollTop = 500;
  });
  await settle(1000);
  await shoot('F13_PAYWALL_SCROLLED');
} catch(e) { console.log('   Scroll error:', e.message.substring(0, 100)); }

// 14. Click CTA in paywall (Commencer maintenant)
console.log('13. Click paywall CTA');
try {
  await page.click('button:has-text("Commencer maintenant")', { force: true, timeout: 5000 });
  await settle(3000);
  await shoot('F14_ONSITE_CHECKOUT');
} catch(e) { console.log('   CTA error:', e.message.substring(0, 100)); }

// 15. Check what's in the checkout
console.log('14. Check checkout content');
try {
  const iframes = await page.$$('iframe');
  console.log(`   iframes in checkout: ${iframes.length}`);
  const emailInputs = await page.$$('input[type="email"]');
  console.log(`   email inputs: ${emailInputs.length}`);
} catch(e) { console.log('   Checkout check error:', e.message.substring(0, 100)); }

// 16. Try to find account/access button
console.log('15. Access account');
try {
  await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 15000 });
  await settle(4000);
  // Click the profile icon (person icon in top-right)
  const profileBtn = await page.$('[aria-label*="ccès"], [aria-label*="ccount"], button:has(svg circle)');
  if (profileBtn) {
    await profileBtn.click({ force: true });
    await settle(2000);
    await shoot('F16_ACCOUNT_SHEET');
  }
} catch(e) { console.log('   Account error:', e.message.substring(0, 100)); }

// 17. Check SargaChat
console.log('16. SargaChat');
await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 15000 });
await settle(4000);
try {
  // SargaChat FAB is on the map
  const chatBtn = await page.$('button[aria-label*="Sarga"], [data-testid*="chat"]');
  if (chatBtn) {
    await chatBtn.click({ force: true });
    await settle(2000);
    await shoot('F17_SARGACHAT');
  }
} catch(e) { console.log('   SargaChat error:', e.message.substring(0, 100)); }

// 18. Check search
console.log('17. Search');
try {
  await page.fill('input[type="search"], [placeholder*="herch"]', 'saline');
  await settle(1000);
  await shoot('F18_SEARCH');
} catch(e) { console.log('   Search error:', e.message.substring(0, 100)); }

// JS errors
if (errors.length > 0) {
  const uniqueErrors = [...new Set(errors)];
  console.log(`\nJS ERRORS (${errors.length} total, ${uniqueErrors.length} unique):`);
  uniqueErrors.forEach(e => console.log(`  - ${e.substring(0, 200)}`));
} else {
  console.log('\n✅ No JS errors!');
}

await context.close();
await browser.close();
console.log('\n=== INTERACTIVE FLOW COMPLETE ===');

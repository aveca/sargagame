import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const BASE = 'http://localhost:4174';
const AUDIT_DIR = resolve(import.meta.dirname, '..', 'audit');
const findings = [];

function log(msg) { console.log(`[AUDIT] ${msg}`); }
function finding(severity, screen, desc, details = '') {
  findings.push({ severity, screen, desc, details, time: new Date().toISOString() });
  log(`[${severity}] ${screen}: ${desc}`);
}

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' };
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

async function ss(page, dir, name, vp) {
  const folder = resolve(AUDIT_DIR, dir);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  const suffix = vp.isMobile ? 'mobile' : 'desktop';
  const path = resolve(folder, `${name}-${suffix}.png`);
  await page.screenshot({ path, fullPage: false });
  log(`SS: ${dir}/${name}-${suffix}.png`);
}

async function dismissCookies(page) {
  try {
    const accept = await page.$('button:has-text("Accepter")');
    if (accept && await accept.isVisible()) {
      await accept.click();
      await page.waitForTimeout(500);
      log('Cookie banner dismissed');
    }
  } catch(e) {}
}

async function getComputedColor(page, selector) {
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, fontSize: s.fontSize };
  }, selector);
}

async function auditFullFlow(vp, label) {
  log(`\n========== FULL FLOW AUDIT: ${label} ==========`);

  const ctx = await browser.newContext({ ...vp, viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();

  // Track all console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // === 1. HOME / MAP ===
  log('\n--- 1. HOME / MAP ---');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await dismissCookies(page);
  await ss(page, 'audit-deep', '01-home', vp);

  // Check critical elements
  const title = await page.textContent('h1, h2, [class*="title"]').catch(() => 'N/A');
  log(`Title: ${title?.slice(0, 60)}`);

  // Check map pins
  const pins = await page.$$('circle, [class*="pin"], [class*="beach"]');
  log(`Map pins found: ${pins.length}`);

  // Check trust badges
  const badges = await page.$$eval('[class*="badge"], [class*="seg"]', els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.length < 50)
  );
  log(`Trust badges: ${JSON.stringify(badges.slice(0, 5))}`);

  // Check data freshness
  const freshEl = await page.$('[class*="fresh"], [class*="stale"], [class*="retard"]');
  const freshText = freshEl ? await freshEl.textContent() : 'N/A';
  log(`Data freshness: ${freshText}`);

  // Check BottomNav
  const navButtons = await page.$$eval('nav button, [class*="bottom-nav"] button', els =>
    els.map(e => ({ text: e.textContent?.trim(), visible: e.offsetParent !== null }))
  );
  log(`BottomNav: ${JSON.stringify(navButtons)}`);

  // === 2. CLICK A BEACH PIN ===
  log('\n--- 2. CLICK BEACH PIN ---');
  // Find a clickable pin on the map
  const mapArea = await page.$('svg, canvas, [class*="map"]');
  if (mapArea) {
    const box = await mapArea.boundingBox();
    if (box) {
      // Click roughly in the center of Martinique (where pins should be)
      const clickX = box.x + box.width * 0.5;
      const clickY = box.y + box.height * 0.6;
      log(`Clicking map at (${clickX}, ${clickY})`);
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(1500);
      await ss(page, 'audit-deep', '02-after-pin-click', vp);

      // Check if a detail sheet opened
      const sheet = await page.$('[class*="sheet"], [class*="detail"], [class*="beach-card"], [role="dialog"]');
      log(`Detail sheet opened: ${!!sheet}`);
      if (sheet) {
        const sheetText = await sheet.textContent().catch(() => '');
        log(`Sheet content preview: ${sheetText?.slice(0, 200)}`);
      }
    }
  }

  // === 3. DEEP LINK BEACH DETAIL ===
  log('\n--- 3. DEEP LINK: /plages/les-salines-martinique/ ---');
  await page.goto(`${BASE}/plages/les-salines-martinique/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await dismissCookies(page);
  await ss(page, 'audit-deep', '03-beach-deeplink', vp);

  // Check if beach detail loaded
  const beachTitle = await page.$eval('h1, h2, [class*="beach-name"], [class*="title"]', el => el.textContent).catch(() => 'N/A');
  log(`Beach detail title: ${beachTitle?.slice(0, 80)}`);

  // Check URL
  const url = page.url();
  log(`Current URL: ${url}`);

  // === 4. PREMIUM / PAYWALL ===
  log('\n--- 4. PAYWALL ---');
  await page.goto(`${BASE}/?paywall=1`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await dismissCookies(page);
  await ss(page, 'audit-deep', '04-paywall', vp);

  // Check paywall content
  const paywallText = await page.textContent('[class*="modal"], [class*="paywall"], [role="dialog"]').catch(() => '');
  log(`Paywall text: ${paywallText?.slice(0, 300)}`);

  // Check CTA button
  const ctaBtn = await page.$('button:has-text("Commencer"), button:has-text("Voir le prix"), button:has-text("Payer")');
  if (ctaBtn) {
    const ctaText = await ctaBtn.textContent();
    log(`CTA: "${ctaText?.trim()}"`);
    const ctaColor = await getComputedColor(page, 'button:has-text("Commencer"), button:has-text("Voir le prix")');
    log(`CTA style: ${JSON.stringify(ctaColor)}`);
  }

  // Check email input
  const emailInput = await page.$('input[type="email"], input[placeholder*="email"]');
  log(`Email input: ${!!emailInput}`);

  // Check pricing display
  const priceText = await page.$$eval('[class*="price"], [class*="amount"]', els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.includes('€'))
  );
  log(`Prices displayed: ${JSON.stringify(priceText)}`);

  // === 5. CLICK CTA -> CHECKOUT ===
  log('\n--- 5. CTA CLICK -> CHECKOUT ---');
  if (ctaBtn) {
    await ctaBtn.click();
    await page.waitForTimeout(2000);
    await ss(page, 'audit-deep', '05-checkout-overlay', vp);

    // Check if Mollie overlay appeared
    const mollieFrame = await page.$('iframe[src*="mollie"], [class*="checkout"], [class*="onsite"]');
    log(`Mollie checkout overlay: ${!!mollieFrame}`);

    // Check card fields
    const cardFields = await page.$$('iframe');
    log(`Iframes (Mollie card fields): ${cardFields.length}`);

    // Check if email is still visible
    const emailStillVisible = await page.$('input[type="email"]');
    log(`Email input in checkout: ${!!emailStillVisible}`);
  }

  // === 6. LIST VIEW ===
  log('\n--- 6. LIST VIEW ---');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await dismissCookies(page);

  // Click "Plages" tab
  const plagesTab = await page.$('button:has-text("Plages")');
  if (plagesTab) {
    await plagesTab.click();
    await page.waitForTimeout(1500);
    await ss(page, 'audit-deep', '06-list-view', vp);

    // Check list items
    const listItems = await page.$$('[class*="beach-item"], [class*="list-item"], [class*="card"]');
    log(`List items: ${listItems.length}`);
  } else {
    log('Plages tab not found');
    finding('P1', 'list', 'Plages tab not found in BottomNav');
  }

  // === 7. FIABILITÉ PAGE ===
  log('\n--- 7. FIABILITÉ ---');
  await page.goto(`${BASE}/fiabilite/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  await ss(page, 'audit-deep', '07-fiabilite', vp);

  const fiabTitle = await page.$eval('h1, h2', el => el.textContent).catch(() => 'N/A');
  log(`Fiabilité title: ${fiabTitle?.slice(0, 80)}`);

  // Check reliability percentages
  const percentages = await page.$$eval('[class*="stat"], [class*="percent"], [class*="number"]', els =>
    els.map(e => e.textContent?.trim()).filter(t => t && t.includes('%'))
  );
  log(`Reliability stats: ${JSON.stringify(percentages.slice(0, 5))}`);

  // === 8. GP REGION (hostname test) ===
  log('\n--- 8. GP REGION CHECK ---');
  // Since GP shares the same build, the app detects via hostname
  // We can check the code for GP-specific behavior
  const regionCheck = await page.evaluate(() => {
    const hostname = window.location.hostname;
    const isGP = hostname.includes('guadeloupe');
    const isNewRegion = typeof IS_NEW_REGION !== 'undefined' ? IS_NEW_REGION : 'unknown';
    return { hostname, isGP, isNewRegion };
  });
  log(`Region detection: ${JSON.stringify(regionCheck)}`);

  // === 9. RESPONSIVE: rotation test ===
  log('\n--- 9. ROTATION TEST ---');
  await page.setViewportSize({ width: 844, height: 390 }); // landscape
  await page.waitForTimeout(1000);
  await ss(page, 'audit-deep', '09-landscape', vp);

  // Check if UI adapted
  const bottomNavVisible = await page.$eval('nav, [class*="bottom-nav"]', el => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }).catch(() => false);
  log(`BottomNav in landscape: ${bottomNavVisible}`);

  // Reset to portrait
  await page.setViewportSize({ width: 390, height: 844 });

  // === 10. CONSOLE ERRORS SUMMARY ===
  log('\n--- 10. CONSOLE ERRORS ---');
  log(`Total console errors: ${consoleErrors.length}`);
  consoleErrors.forEach(e => {
    finding('P2', 'console', `JS error: ${e.slice(0, 120)}`);
  });

  await ctx.close();
}

// Run audit
const browser = await chromium.launch({ headless: true });

await auditFullFlow(MOBILE, 'MOBILE-390x844');
await auditFullFlow(DESKTOP, 'DESKTOP-1440x900');

await browser.close();

// Write findings
const findingsPath = resolve(AUDIT_DIR, 'findings', 'deep-audit-findings.json');
writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
log(`\n\nFindings written: ${findings.length}`);
log(`P0: ${findings.filter(f => f.severity === 'P0').length}`);
log(`P1: ${findings.filter(f => f.severity === 'P1').length}`);
log(`P2: ${findings.filter(f => f.severity === 'P2').length}`);

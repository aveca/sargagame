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

async function ss(page, dir, name) {
  const folder = resolve(AUDIT_DIR, dir);
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  const path = resolve(folder, `${name}-mobile.png`);
  await page.screenshot({ path, fullPage: false });
  log(`SS: ${dir}/${name}-mobile.png`);
}

async function dismissCookies(page) {
  try {
    const accept = await page.$('button:has-text("Accepter")');
    if (accept && await accept.isVisible()) { await accept.click(); await page.waitForTimeout(500); }
  } catch(e) {}
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...MOBILE, viewport: { width: MOBILE.width, height: MOBILE.height } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(err.message));

// === 1. HOME ===
log('--- 1. HOME ---');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);
await dismissCookies(page);
await ss(page, 'audit-deep', '01-home');

// Check freshness badge
const freshnessText = await page.evaluate(() => {
  const els = document.querySelectorAll('[class*="fresh"], [class*="stale"], [class*="retard"]');
  return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
});
log(`Freshness: ${JSON.stringify(freshnessText)}`);

// === 2. CLICK BEACH PIN (use SVG coordinates) ===
log('--- 2. CLICK PIN ---');
// The SVG map pins are in the middle area of the viewport
// Martinique is roughly centered in the map area
const svgEl = await page.$('svg');
if (svgEl) {
  const box = await svgEl.boundingBox();
  log(`SVG map bounds: ${JSON.stringify(box)}`);
  if (box) {
    // Click on a pin area (roughly where Plage des Salines would be — south of Martinique)
    const x = box.x + box.width * 0.55;
    const y = box.y + box.height * 0.75;
    log(`Clicking at (${x.toFixed(0)}, ${y.toFixed(0)})`);
    await page.mouse.click(x, y);
    await page.waitForTimeout(2000);
    await ss(page, 'audit-deep', '02-pin-click');

    // Check what appeared
    const sheetVisible = await page.evaluate(() => {
      const sheets = document.querySelectorAll('[class*="sheet"], [class*="detail"], [role="dialog"], [class*="comic"]');
      return Array.from(sheets).map(e => ({
        class: e.className?.toString().slice(0, 80),
        visible: e.offsetParent !== null || getComputedStyle(e).display !== 'none',
        text: e.textContent?.slice(0, 100)
      })).filter(s => s.visible);
    });
    log(`Sheets after click: ${JSON.stringify(sheetVisible.slice(0, 3))}`);
  }
} else {
  log('No SVG found — trying canvas');
  const canvas = await page.$('canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6);
    await page.waitForTimeout(2000);
    await ss(page, 'audit-deep', '02-pin-click');
  }
}

// === 3. DEEP LINK ===
log('--- 3. DEEP LINK ---');
await page.goto(`${BASE}/plages/les-salines-martinique/`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(4000);
await dismissCookies(page);
await ss(page, 'audit-deep', '03-deeplink');

const dlState = await page.evaluate(() => {
  // Check if beach detail is showing
  const h = document.querySelector('h1, h2');
  const url = window.location.pathname;
  const bodyText = document.body?.textContent?.slice(0, 300);
  return { heading: h?.textContent?.trim(), url, bodyPreview: bodyText };
});
log(`Deep link state: heading="${dlState.heading}" url="${dlState.url}"`);
if (!dlState.heading?.toLowerCase().includes('salines') && !dlState.heading?.toLowerCase().includes('plage')) {
  finding('P1', 'beach-deeplink', `Deep link /plages/les-salines-martinique/ did NOT open beach detail`, `heading="${dlState.heading}"`);
}

// === 4. PAYWALL ===
log('--- 4. PAYWALL ---');
await page.goto(`${BASE}/?paywall=1`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
await dismissCookies(page);
await ss(page, 'audit-deep', '04-paywall');

const pwState = await page.evaluate(() => {
  const modal = document.querySelector('[role="dialog"], [class*="modal"]');
  const emailInput = document.querySelector('input[type="email"], input[placeholder*="email"]');
  const ctaBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Commencer'));
  const price = Array.from(document.querySelectorAll('*')).find(e => e.textContent?.includes('14,99') && e.children.length === 0);
  return {
    modalPresent: !!modal,
    emailInput: !!emailInput,
    ctaButton: ctaBtn ? ctaBtn.textContent?.trim().slice(0, 60) : null,
    priceVisible: !!price,
    priceText: price?.textContent?.trim()
  };
});
log(`Paywall state: ${JSON.stringify(pwState)}`);

// === 5. CLICK CTA -> CHECKOUT ===
log('--- 5. CTA -> CHECKOUT ---');
const ctaBtn = await page.locator('button', { hasText: 'Commencer' }).first();
if (await ctaBtn.isVisible().catch(() => false)) {
  await ctaBtn.click();
  await page.waitForTimeout(2000);
  await ss(page, 'audit-deep', '05-checkout');

  const checkoutState = await page.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    const cardInputs = document.querySelectorAll('input[name*="card"], input[autocomplete*="cc-"]');
    const emailInput = document.querySelector('input[type="email"]');
    const consentCheckbox = document.querySelector('input[type="checkbox"]');
    return {
      iframeCount: iframes.length,
      iframeSrcs: Array.from(iframes).map(f => f.src?.slice(0, 80)),
      cardInputs: cardInputs.length,
      emailInputStillVisible: !!emailInput,
      consentCheckbox: !!consentCheckbox
    };
  });
  log(`Checkout state: ${JSON.stringify(checkoutState)}`);

  // Check for Mollie components
  const mollieReady = await page.evaluate(() => {
    return typeof window.Mollie !== 'undefined' || document.querySelector('[class*="mollie"]') !== null;
  });
  log(`Mollie SDK loaded: ${mollieReady}`);
} else {
  log('CTA "Commencer" not found');
  finding('P0', 'paywall', 'CTA "Commencer maintenant" not found in paywall');
}

// === 6. ERRORS SUMMARY ===
log('--- ERRORS ---');
log(`Console errors: ${consoleErrors.length}`);
consoleErrors.forEach(e => finding('P2', 'console', e.slice(0, 120)));

// === 7. CHECK STALE DATA ===
log('--- 7. STALE DATA ---');
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);
const staleBadge = await page.evaluate(() => {
  const el = document.querySelector('[class*="fresh"]');
  return el ? { text: el.textContent, classes: el.className } : null;
});
log(`Stale badge: ${JSON.stringify(staleBadge)}`);

// Check sargassum.json freshness
const apiResp = await page.evaluate(async () => {
  try {
    const r = await fetch('/api/copernicus/sargassum.json');
    const d = await r.json();
    return {
      source: d.source,
      updatedAt: d.updatedAt,
      erddapTimestamp: d.erddapTimestamp,
      stale: d.stale,
      ageHours: d.updatedAt ? ((Date.now() - new Date(d.updatedAt).getTime()) / 3.6e6).toFixed(1) : 'n/a'
    };
  } catch(e) { return { error: e.message }; }
});
log(`Pipeline data: ${JSON.stringify(apiResp)}`);
if (apiResp.ageHours && parseFloat(apiResp.ageHours) > 24) {
  finding('P1', 'pipeline', `Pipeline data is ${apiResp.ageHours}h old (>24h threshold)`, JSON.stringify(apiResp));
}

await context.close();
await browser.close();

// Write findings
const findingsPath = resolve(AUDIT_DIR, 'findings', 'deep-audit-findings.json');
writeFileSync(findingsPath, JSON.stringify(findings, null, 2));
log(`\n\nFindings: ${findings.length}`);
log(`P0: ${findings.filter(f => f.severity === 'P0').length}`);
log(`P1: ${findings.filter(f => f.severity === 'P1').length}`);
log(`P2: ${findings.filter(f => f.severity === 'P2').length}`);
findings.forEach(f => log(`  [${f.severity}] ${f.screen}: ${f.desc}`));

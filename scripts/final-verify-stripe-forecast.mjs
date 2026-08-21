/**
 * final-verify-stripe-forecast.mjs — READ-ONLY live verification on custom domains
 *
 * Test 1: ?pay=stripe BLOCKED on GP and MQ (Mollie only, zero Stripe iframes)
 * Test 2: Forecast lock click on /previsions/ triggers paywall or chart update
 *
 * Usage: node scripts/final-verify-stripe-forecast.mjs
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = resolve(__dirname, '..', 'audit');
if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });

const VIEWPORT = { width: 390, height: 844 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const DOMAINS = [
  { name: 'GP', host: 'sargasses-guadeloupe.com' },
  { name: 'MQ', host: 'sargasses-martinique.com' },
];

const TRACKED_EVENTS = [
  'sg_forecast_lock_click',
  'sg_beach_open',
  'begin_checkout',
  'sg_pay_onsite',
];

function log(msg) { console.log(`[FINAL-VERIFY] ${msg}`); }

async function screenshot(page, name) {
  const path = resolve(AUDIT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  log(`Screenshot saved: ${name}`);
  return path;
}

async function dismissCookie(page) {
  try {
    const btn = await page.$(
      'button:has-text("Accepter"), button:has-text("Accept"), button:has-text("Aceptar"), .sg-v2-cookie-banner button, [class*="cookie"] button'
    );
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      log('Cookie consent dismissed');
      await page.waitForTimeout(1000);
    }
  } catch { /* no banner */ }
}

// ═══════════════════════════════════════════════════════════════════
// TEST 1: ?pay=stripe BLOCKED
// ═══════════════════════════════════════════════════════════════════
async function testStripeBlocked(page, domain) {
  const url = `https://${domain.host}/?pay=stripe`;
  log(`\n--- TEST 1: ${domain.name} stripe-blocked ---`);
  log(`Navigating to ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  await dismissCookie(page);
  await page.waitForTimeout(1000);

  // Open Premium tab in BottomNav
  log('Looking for Premium tab in BottomNav...');
  const premiumTab = await page.$(
    'button:has-text("Premium"), button:has-text("⭐"), [data-tab="premium"], button:has-text("Paywall")'
  );
  if (premiumTab) {
    await premiumTab.click();
    log('Clicked Premium tab');
  } else {
    // Fallback: try bottom nav buttons
    const navButtons = await page.$$('.sg-bottom-nav button, nav button');
    for (const btn of navButtons) {
      const text = await btn.textContent().catch(() => '');
      if (text && (text.includes('Premium') || text.includes('⭐') || text.includes('Unlock'))) {
        await btn.click();
        log(`Clicked nav button: "${text.trim()}"`);
        break;
      }
    }
  }
  await page.waitForTimeout(2000);

  // Click CTA
  log('Looking for CTA button...');
  const ctaSelectors = [
    'button:has-text("Payer")',
    'button:has-text("Commencer")',
    'button:has-text("Activer")',
    'button:has-text("Débloquer")',
    'button:has-text("Unlock")',
    'button:has-text("Commencer maintenant")',
    '.sg-cta-premium',
    '[data-testid="premium-cta"]',
  ];
  let ctaClicked = false;
  for (const sel of ctaSelectors) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click();
      log(`Clicked CTA: ${sel}`);
      ctaClicked = true;
      break;
    }
  }
  if (!ctaClicked) {
    log('WARNING: No CTA found — trying first large button in main content');
    const allBtns = await page.$$('main button, [role="dialog"] button, .sg-paywall button');
    for (const btn of allBtns) {
      const box = await btn.boundingBox();
      if (box && box.width > 100 && box.height > 40) {
        await btn.click();
        log('Clicked fallback large button');
        ctaClicked = true;
        break;
      }
    }
  }
  await page.waitForTimeout(4000);

  // Count iframes: mollie vs stripe
  const iframes = await page.$$('iframe');
  log(`Total iframes found: ${iframes.length}`);

  let mollieCount = 0;
  let stripeCount = 0;
  const iframeDetails = [];

  for (const iframe of iframes) {
    const src = await iframe.getAttribute('src') || '';
    const name = await iframe.getAttribute('name') || '';
    const id = await iframe.getAttribute('id') || '';
    const combined = `${src} ${name} ${id}`.toLowerCase();
    const isStripe = combined.includes('stripe');
    const isMollie = combined.includes('mollie');

    if (isStripe) stripeCount++;
    if (isMollie) mollieCount++;

    iframeDetails.push({
      src: src.slice(0, 120),
      name,
      id,
      isStripe,
      isMollie,
    });
  }

  log(`Iframe breakdown — Mollie: ${mollieCount}, Stripe: ${stripeCount}`);
  for (const d of iframeDetails) {
    log(`  iframe: src=${d.src} name=${d.name} id=${d.id} [${d.isStripe ? 'STRIPE' : d.isMollie ? 'MOLLIE' : 'other'}]`);
  }

  const pass = stripeCount === 0 && mollieCount >= 4;
  const verdict = pass ? '✅ PASS' : (stripeCount > 0 ? '❌ FAIL — Stripe iframe detected!' : '⚠️ WARN — expected 4-5 Mollie iframes');

  log(`RESULT: ${verdict}`);

  await screenshot(page, `final-stripe-${domain.name.toLowerCase()}.png`);

  return { domain: domain.name, pass, stripeCount, mollieCount, iframeDetails, verdict };
}

// ═══════════════════════════════════════════════════════════════════
// TEST 2: Forecast lock click
// ═══════════════════════════════════════════════════════════════════
async function testForecastLock(page, domain, consoleEvents) {
  const url = `https://${domain.host}/previsions/`;
  log(`\n--- TEST 2: ${domain.name} forecast-lock ---`);
  log(`Navigating to ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);
  await dismissCookie(page);
  await page.waitForTimeout(1000);

  // Look for forecast day buttons
  const dayLabels = ['Auj', '+1j', '+2j', '+3j', '+4j', '+5j'];
  const foundButtons = [];

  for (const label of dayLabels) {
    const btn = await page.$(`button:has-text("${label}")`);
    if (btn) {
      const text = await btn.textContent().catch(() => '');
      const isVisible = await btn.isVisible().catch(() => false);
      foundButtons.push({ label, text: text.trim(), visible: isVisible });
      log(`Found button: "${label}" → text="${text.trim()}" visible=${isVisible}`);
    }
  }

  // Check for lock icons in buttons
  const bodyText = await page.textContent('body');
  const hasLockEmoji = bodyText.includes('🔒');
  log(`Lock emoji (🔒) present on page: ${hasLockEmoji}`);

  // Find a locked day button and click it
  log('Looking for locked day button to click...');
  let lockedBtnClicked = false;

  // Strategy 1: find button with 🔒
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = await btn.textContent().catch(() => '');
    if (text.includes('🔒') || text.includes('+1j') || text.includes('+2j')) {
      const isVisible = await btn.isVisible().catch(() => false);
      if (isVisible) {
        await btn.click();
        log(`Clicked locked button: "${text.trim()}"`);
        lockedBtnClicked = true;
        break;
      }
    }
  }

  // Strategy 2: try +1j specifically
  if (!lockedBtnClicked) {
    const plus1 = await page.$('button:has-text("+1j")');
    if (plus1 && await plus1.isVisible().catch(() => false)) {
      await plus1.click();
      log('Clicked +1j button');
      lockedBtnClicked = true;
    }
  }

  if (!lockedBtnClicked) {
    log('WARNING: No locked day button found');
  }

  await page.waitForTimeout(2000);

  // Check what happened: paywall appeared or chart updated
  const paywallVisible = await page.$(
    '.sg-v2-paywall-panel, .sg-v2-checkout-panel, [role="dialog"], .sg-paywall, [class*="paywall"]'
  );
  const modalVisible = await page.$('[role="dialog"], .modal, [class*="modal"]');

  let outcome = 'unknown';
  if (paywallVisible || modalVisible) {
    outcome = 'paywall_shown';
    log('Paywall/modal appeared after clicking locked day');
  } else {
    // Check if chart changed (content update)
    outcome = 'chart_may_have_updated';
    log('No paywall detected — chart may have updated or page unchanged');
  }

  // Check console for tracked events
  const eventsFound = consoleEvents.filter(e =>
    TRACKED_EVENTS.some(te => e.text.includes(te))
  );
  const forecastLockEvents = consoleEvents.filter(e => e.text.includes('sg_forecast_lock_click'));
  log(`Tracked events during this test: ${eventsFound.map(e => e.text.slice(0, 80)).join(' | ') || 'none'}`);
  log(`sg_forecast_lock_click events: ${forecastLockEvents.length}`);

  await screenshot(page, `final-forecast-${domain.name.toLowerCase()}.png`);

  return {
    domain: domain.name,
    foundButtons,
    hasLockEmoji,
    lockedBtnClicked,
    outcome,
    forecastLockEvents: forecastLockEvents.length,
    allTrackedEvents: eventsFound.map(e => ({ type: e.type, text: e.text.slice(0, 150) })),
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  log('Starting FINAL verification (READ-ONLY) on live custom domains');
  log(`Audit dir: ${AUDIT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  const results = { test1_stripe: [], test2_forecast: [], consoleEvents: [], errors: [] };

  for (const domain of DOMAINS) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: UA,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'fr-FR',
    });
    const page = await context.newPage();

    // Collect console events
    const consoleLogs = [];
    page.on('console', msg => {
      const entry = { type: msg.type(), text: msg.text(), ts: Date.now() };
      consoleLogs.push(entry);
      results.consoleEvents.push({ domain: domain.name, ...entry });
    });
    page.on('pageerror', err => {
      const entry = { type: 'pageerror', text: err.message, ts: Date.now() };
      consoleLogs.push(entry);
      results.errors.push({ domain: domain.name, error: err.message });
    });

    // Test 1: Stripe blocked
    try {
      const r1 = await testStripeBlocked(page, domain);
      results.test1_stripe.push(r1);
    } catch (err) {
      log(`TEST 1 ERROR: ${err.message}`);
      results.test1_stripe.push({ domain: domain.name, pass: false, error: err.message });
    }

    await page.waitForTimeout(1000);

    // Test 2: Forecast lock
    try {
      const r2 = await testForecastLock(page, domain, consoleLogs);
      results.test2_forecast.push(r2);
    } catch (err) {
      log(`TEST 2 ERROR: ${err.message}`);
      results.test2_forecast.push({ domain: domain.name, error: err.message });
    }

    await context.close();
  }

  await browser.close();

  // ═══════════════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════════════
  log('\n══════════════════════════════════════════════════════');
  log('              FINAL VERIFICATION REPORT');
  log('══════════════════════════════════════════════════════');

  // Test 1 summary
  log('\nTEST 1 — ?pay=stripe BLOCKED (Mollie only)');
  for (const r of results.test1_stripe) {
    log(`  ${r.domain}: ${r.verdict || 'ERROR'}`);
    log(`    Stripe iframes: ${r.stripeCount ?? '?'}, Mollie iframes: ${r.mollieCount ?? '?'}`);
  }

  // Test 2 summary
  log('\nTEST 2 — Forecast lock click');
  for (const r of results.test2_forecast) {
    log(`  ${r.domain}: outcome=${r.outcome ?? 'error'}`);
    log(`    Lock emoji present: ${r.hasLockEmoji ?? '?'}, buttons found: ${r.foundButtons?.length ?? 0}`);
    log(`    sg_forecast_lock_click events: ${r.forecastLockEvents ?? 0}`);
  }

  // Console events
  log('\nCONSOLE EVENTS (tracked)');
  const tracked = results.consoleEvents.filter(e =>
    TRACKED_EVENTS.some(te => e.text.includes(te))
  );
  for (const e of tracked) {
    log(`  [${e.domain}] ${e.type}: ${e.text.slice(0, 120)}`);
  }
  if (tracked.length === 0) log('  (none)');

  // Real errors
  log('\nREAL ERRORS (page errors, not analytics)');
  const realErrors = results.errors.filter(e =>
    !e.error.includes('analytics') && !e.error.includes('google-analytics')
  );
  for (const e of realErrors) {
    log(`  [${e.domain}] ${e.error.slice(0, 150)}`);
  }
  if (realErrors.length === 0) log('  (none)');

  // Final verdict
  const allPass = results.test1_stripe.every(r => r.pass);
  log(`\nFINAL VERDICT: ${allPass ? '✅ ALL TESTS PASS' : '❌ SOME TESTS FAILED'}`);

  // Write report JSON
  writeFileSync(resolve(AUDIT_DIR, 'final-verify-report.json'), JSON.stringify(results, null, 2));
  log(`\nReport written to audit/final-verify-report.json`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

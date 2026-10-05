// Browser smoke test — Playwright integration demo
// Run: node scripts/run-tests.cjs (discovered automatically)
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to live site
  await page.goto('https://sargasses-martinique.com', { waitUntil: 'domcontentloaded' });

  // Capture title
  const title = await page.title();
  const url = page.url();

  // Full page screenshot (desktop)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'browser-smoke-desktop.png', fullPage: true });

  // Mobile viewport screenshot
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: 'browser-smoke-mobile.png', fullPage: true });

  // Tablet viewport screenshot
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ path: 'browser-smoke-tablet.png', fullPage: true });

  // Capture console logs
  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push({ type: msg.type(), text: msg.text() }));

  // Wait for network idle
  await page.waitForLoadState('networkidle');

  await browser.close();

  // Output results
  console.log('=== BROWSER SMOKE TEST ===');
  console.log('Title:', title);
  console.log('URL:', url);
  console.log('Console events:', consoleLogs.length);
  console.log('Screenshots: browser-smoke-desktop.png, browser-smoke-mobile.png, browser-smoke-tablet.png');
  console.log('=== END ===');

  process.exit(0);
})().catch((e) => {
  console.error('Browser smoke test failed:', e.message);
  process.exit(1);
});
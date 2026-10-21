
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

const issues = [];
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) issues.push(msg.text()); });
page.on('pageerror', err => {
  const msg = err.message || String(err);
  if (!BENIGN_PAGE_ERRORS.has(msg)) issues.push(msg);
});

  try {
    await page.goto('http://localhost:4173/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#root', { timeout: 10000 }).catch(() => {});

    const shotDir = path.join('C:\\Users\\user\\Documents\\GitHub\\sargagame\\.ai\\autopilot\\observations\\screenshots', 'visual-qa');
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, 'current---mobile-1792558903389.png');
    await page.screenshot({ path: shotPath, fullPage: true });

    console.log(JSON.stringify({ route: '/', viewport: 'mobile', label: 'current', path: shotPath, issues }));
  } catch (e) {
    console.log(JSON.stringify({ route: '/', viewport: 'mobile', label: 'current', error: e.message }));
  } finally {
    await browser.close();
  }
})();

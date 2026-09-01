const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const domains = [
  { id: 'MQ', url: 'https://sargasses-martinique.com', name: 'martinique' },
  { id: 'GP', url: 'https://sargasses-guadeloupe.com', name: 'guadeloupe' },
  { id: 'Cancun', url: 'https://sargassumcancun.com', name: 'cancun' },
  { id: 'Tulum', url: 'https://sargazotulum.com', name: 'tulum' },
  { id: 'PC', url: 'https://sargassumpuntacana.com', name: 'puntacana' },
  { id: 'Miami', url: 'https://sargassummiami.com', name: 'miami' },
];

const outDir = path.join(__dirname, '..', 'tmp', 'ux-s16');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const d of domains) {
    console.log(`\n=== ${d.id} ${d.url} ===`);
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    });
    const page = await ctx.newPage();
    try {
      // Home
      await page.goto(d.url + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);
      const homePath = path.join(outDir, `${d.id}-home-mobile.png`);
      await page.screenshot({ path: homePath, fullPage: false });
      console.log(` home ${homePath}`);

      // Check for horizontal scroll
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const mapEl = await page.$('svg');
      const hasMap = !!mapEl;
      const regionNav = await page.evaluate(() => !!document.body.innerHTML.includes('RegionNav') || !!document.querySelector('[class*="region"]'));
      console.log(`  scrollX:${scrollX} hasMap:${hasMap}`);

      // Try to open a beach fiche - click first beach pin/label
      try {
        const beachHandle = await page.$('[data-beach]');
        if (beachHandle) {
          await beachHandle.click({ force: true });
          await page.waitForTimeout(1500);
          const fichePath = path.join(outDir, `${d.id}-fiche-mobile.png`);
          await page.screenshot({ path: fichePath, fullPage: false });
          console.log(` fiche ${fichePath}`);
        } else {
          // fallback click center
          await page.mouse.click(195, 350);
          await page.waitForTimeout(1500);
          const fichePath = path.join(outDir, `${d.id}-fiche-mobile.png`);
          await page.screenshot({ path: fichePath, fullPage: false });
          console.log(` fiche fallback ${fichePath}`);
        }
      } catch(e){ console.log(' fiche err', e.message); }

      // /b2b
      await page.goto(d.url + '/b2b', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const b2bPath = path.join(outDir, `${d.id}-b2b-mobile.png`);
      await page.screenshot({ path: b2bPath, fullPage: true });
      console.log(` b2b ${b2bPath}`);

      // /widget - try /widget or /widget?token
      await page.goto(d.url + '/widget', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
      const widgetPath = path.join(outDir, `${d.id}-widget-mobile.png`);
      await page.screenshot({ path: widgetPath, fullPage: false });
      console.log(` widget ${widgetPath}`);

      // Lead banner - back to home and wait 16s
      await page.goto(d.url + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(16000);
      const leadPath = path.join(outDir, `${d.id}-lead-mobile.png`);
      await page.screenshot({ path: leadPath, fullPage: false });
      const leadVisible = await page.evaluate(() => !!document.body.innerHTML.includes('alertes plage') || !!document.body.innerHTML.includes('Alerte'));
      console.log(` lead visible:${leadVisible} ${leadPath}`);

      results.push({ id: d.id, scrollX, hasMap, leadVisible });
    } catch (e) {
      console.error(` ${d.id} error`, e.message);
    }
    await ctx.close();
  }

  // Desktop for MQ
  console.log(`\n=== Desktop 1920x1080 MQ ===`);
  const dCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const dPage = await dCtx.newPage();
  await dPage.goto('https://sargasses-martinique.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dPage.waitForTimeout(4000);
  await dPage.screenshot({ path: path.join(outDir, 'MQ-home-desktop.png'), fullPage: false });
  console.log(' desktop home MQ');
  await dPage.goto('https://sargasses-martinique.com/b2b', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await dPage.waitForTimeout(2000);
  await dPage.screenshot({ path: path.join(outDir, 'MQ-b2b-desktop.png'), fullPage: true });
  console.log(' desktop b2b MQ');
  const dScroll = await dPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(' desktop scrollX', dScroll);
  await dCtx.close();
  await browser.close();
  console.log('\nResults', JSON.stringify(results, null, 2));
  console.log(`\nScreenshots in ${outDir}`);
})();

const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('https://sargassummiami.com/beaches/miami-beach/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);
  console.log('final url:', page.url());
  await page.screenshot({ path: path.join(__dirname, 'mobile-4-deeplink-miamibeach.png'), timeout: 15000 }).catch(e => console.log('snapfail', e.message.split('\n')[0]));
  const txt = await page.evaluate(() => document.body.innerText.slice(0, 1200));
  console.log(txt);
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

/* Check tile loading + paywall via Premium dock (mobile) */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const tiles = { ok: 0, fail: 0, urls: new Set(), errs: [] };
  page.on('response', r => {
    const u = r.url();
    if (/arcgis|tile|basemap|openstreetmap|cartocdn/i.test(u)) {
      tiles.urls.add(u.split('/').slice(2, 3)[0]);
      if (r.status() >= 400) { tiles.fail++; tiles.errs.push(r.status() + ' ' + u.slice(0, 120)); }
      else tiles.ok++;
    }
  });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/arcgis|tile|basemap/i.test(u)) { tiles.fail++; tiles.errs.push('FAILED ' + (r.failure() || {}).errorText + ' ' + u.slice(0, 120)); }
  });
  await page.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(15000);
  console.log('tile hosts:', [...tiles.urls].join(', '));
  console.log('tiles ok:', tiles.ok, 'fail:', tiles.fail);
  console.log(tiles.errs.slice(0, 10).join('\n'));
  await page.screenshot({ path: path.join(OUT, 'mobile-home-15s.png'), timeout: 15000 }).catch(e => console.log('snapfail', e.message.split('\n')[0]));

  // Open Premium via dock
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, [role="button"], div')];
    const t = els.filter(el => /Premium/.test((el.innerText || '').trim()) && (el.innerText || '').trim().length < 12);
    if (t.length) t[t.length - 1].click();
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(OUT, 'mobile-3-paywall.png'), timeout: 15000 }).catch(e => console.log('snapfail pw', e.message.split('\n')[0]));
  fs.writeFileSync(path.join(OUT, 'mobile-3-paywall.txt'), await page.evaluate(() => document.body.innerText.slice(0, 8000)));
  console.log('PAYWALL TEXT START >>>');
  console.log(await page.evaluate(() => {
    const m = [...document.querySelectorAll('div')].find(d => /Premium|trial|\$9\.99|\$|month/i.test(d.innerText || '') && d.getBoundingClientRect().height > 300 && d.getBoundingClientRect().y >= 0);
    return m ? m.innerText.slice(0, 2500) : '(no modal text found)';
  }));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

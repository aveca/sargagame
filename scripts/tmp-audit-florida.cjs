/* Audit jetable — desktop pass sargassummiami.com 1440x900 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'tmp-audit-fl');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);

  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), animations: 'disabled', caret: 'hide', timeout: 15000 }).then(() => console.log('SNAP', n)).catch(e => console.log('snapfail', n, e.message.split('\n')[0]));

  await shot('desktop-1-home');
  fs.writeFileSync(path.join(OUT, 'desktop-1-home.txt'), await page.evaluate(() => document.body.innerText.slice(0, 6000)));

  // click marker closest to center
  const markers = await page.$$('.leaflet-marker-icon');
  console.log('markers:', markers.length);
  let best = null, bestD = 1e9;
  for (const m of markers) {
    const b = await m.boundingBox(); if (!b) continue;
    const d = Math.abs(b.x + b.width / 2 - 720) + Math.abs(b.y + b.height / 2 - 450);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) {
    await page.mouse.click(best.x + best.width / 2, best.y + best.height / 2);
    await page.waitForTimeout(3000);
    await shot('desktop-2-beach-sheet');
    fs.writeFileSync(path.join(OUT, 'desktop-2-beach-sheet.txt'), await page.evaluate(() => document.body.innerText.slice(0, 8000)));
  }

  // scroll the sheet to the paywall CTA and click "UNLOCK FORECAST"
  try {
    const clicked = await page.evaluate(() => {
      const cands = [...document.querySelectorAll('button, a, [role="button"], div')];
      const hit = cands.find(el => /UNLOCK FORECAST|Unlock with free trial/i.test(el.innerText || '') && el.children.length < 4);
      if (!hit) return null;
      hit.scrollIntoView({ block: 'center' });
      return hit.innerText.slice(0, 50);
    });
    console.log('unlock found:', JSON.stringify(clicked));
    await page.waitForTimeout(800);
    if (clicked) {
      await page.evaluate(() => {
        const cands = [...document.querySelectorAll('button, a, [role="button"], div')];
        const hit = cands.find(el => /UNLOCK FORECAST|Unlock with free trial/i.test(el.innerText || '') && el.children.length < 4);
        hit && hit.click();
      });
      await page.waitForTimeout(3500);
      await shot('desktop-3-paywall');
      fs.writeFileSync(path.join(OUT, 'desktop-3-paywall.txt'), await page.evaluate(() => document.body.innerText.slice(0, 8000)));
    }
  } catch (e) { console.log('unlock fail', e.message); }

  // Beaches tab (dock)
  try {
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, [role="button"], div')];
      const t = els.find(el => (el.innerText || '').trim() === 'Beaches');
      t && t.click();
    });
    await page.waitForTimeout(2000);
    await shot('desktop-4-beaches-list');
    fs.writeFileSync(path.join(OUT, 'desktop-4-beaches-list.txt'), await page.evaluate(() => document.body.innerText.slice(0, 6000)));
  } catch (e) { console.log('beaches tab fail', e.message); }

  if (errors.length) fs.writeFileSync(path.join(OUT, 'desktop-errors.txt'), errors.join('\n'));
  console.log('js errors:', errors.length);
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

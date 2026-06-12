/* Desktop pass 2 — sheet element shot + paywall via dock + unlock CTA destination */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('https://sargassummiami.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT, 'desktop-1b-home-12s.png'), animations: 'disabled', timeout: 20000 }).catch(e => console.log('snap1 fail', e.message.split('\n')[0]));

  // click marker near center
  const markers = await page.$$('.leaflet-marker-icon');
  let best = null, bestD = 1e9;
  for (const m of markers) {
    const b = await m.boundingBox(); if (!b) continue;
    const d = Math.abs(b.x + b.width / 2 - 720) + Math.abs(b.y + b.height / 2 - 450);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) {
    await page.mouse.click(best.x + best.width / 2, best.y + best.height / 2);
    await page.waitForTimeout(3000);
    const sheet = await page.$('.sheet');
    if (sheet) {
      await sheet.screenshot({ path: path.join(OUT, 'desktop-2b-sheet.png'), animations: 'disabled', timeout: 20000 }).catch(e => console.log('sheet snap fail', e.message.split('\n')[0]));
      fs.writeFileSync(path.join(OUT, 'desktop-2b-sheet.txt'), await sheet.innerText());
      const box = await sheet.boundingBox();
      console.log('sheet box:', JSON.stringify(box));
    } else console.log('no .sheet element');
  }

  // What does "UNLOCK FORECAST" do? watch for navigation/popup
  const navs = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
  ctx.on('page', p => navs.push('POPUP: ' + p.url()));
  try {
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a, [role="button"], div')];
      const hit = els.find(el => /UNLOCK FORECAST/i.test(el.innerText || '') && el.children.length < 5);
      hit && hit.click();
    });
    await page.waitForTimeout(4000);
    console.log('after UNLOCK click, url:', page.url(), 'navs:', JSON.stringify(navs));
    await page.screenshot({ path: path.join(OUT, 'desktop-3b-after-unlock.png'), animations: 'disabled', timeout: 20000 }).catch(e => console.log('snap3 fail', e.message.split('\n')[0]));
    fs.writeFileSync(path.join(OUT, 'desktop-3b-after-unlock.txt'), await page.evaluate(() => document.body.innerText.slice(0, 8000)).catch(() => '(ctx destroyed)'));
  } catch (e) { console.log('unlock err', e.message.split('\n')[0]); }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

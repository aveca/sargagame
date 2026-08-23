/** Debug : pourquoi la fiche ne s'ouvre pas dans mon repro alors que smoke OK ? */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4173';
const b = await chromium.launch();

async function run(label, acceptCookies) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  if (acceptCookies) { try { await p.getByRole('button', { name: /accept|tout|ok/i }).first().click({ timeout: 4000 }); console.log(label, 'cookies accepted'); } catch (e) { console.log(label, 'no accept btn', e.message.slice(0, 60)); } }
  await p.waitForFunction(() => document.querySelectorAll('.sg-maplabel').length >= 3, { timeout: 30000 });
  // état des overlays avant clic
  const pre = await p.evaluate(() => ({
    banner: !!document.querySelector('#sg-cookie-banner,[class*="cookie"]'),
    journal: !!document.querySelector('[class*="whatsnew"],[class*="journal"]'),
    dialogs: [...document.querySelectorAll('[role="dialog"]')].map(d => d.getAttribute('aria-label') || d.className.slice(0, 40)),
    topZ: (() => { let best = null, bz = -1; for (const el of document.querySelectorAll('body *')) { const z = parseInt(getComputedStyle(el).zIndex); if (!Number.isNaN(z) && z > bz && z < 10000) { const r = el.getBoundingClientRect(); if (r.width > 50 && r.height > 50) { bz = z; best = el.className?.toString?.().slice(0, 50); } } } return { z: bz, cls: best }; })(),
  }));
  console.log(label, 'PRE=' + JSON.stringify(pre));
  await p.evaluate(() => {
    const l = [...document.querySelectorAll('.sg-maplabel')].find(el => getComputedStyle(el).visibility !== 'hidden');
    if (l) l.click();
  });
  await p.waitForTimeout(4000);
  const post = await p.evaluate(() => ({
    bsc: !!document.querySelector('.bsc-sheet'),
    sheet: !!document.querySelector('.sheet'),
    lcdetail: !!document.querySelector('.lc-detail'),
    bodyLen: document.body.innerText.length,
    firstText: document.body.innerText.slice(0, 120).replace(/\n/g, ' | '),
  }));
  console.log(label, 'POST=' + JSON.stringify(post));
  await p.screenshot({ path: process.env.TEMP + `/opencode/dbg-${label}.png` });
  await ctx.close();
}

await run('A-avec-cookies', true);
await run('B-sans-cookies', false);
await b.close();

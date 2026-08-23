/** Repro ciblé : ouverture fiche (clic JS), CTA paywall, BottomNav targets. */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4173';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
try { await p.getByRole('button', { name: /accept|tout|ok/i }).first().click({ timeout: 4000 }); } catch {}
await p.waitForFunction(() => document.querySelectorAll('.sg-maplabel').length >= 3, { timeout: 30000 });

// Fiche via clic JS (même pattern que ux-smoke)
let ficheOk = false;
try {
  await p.evaluate(() => {
    const l = [...document.querySelectorAll('.sg-maplabel')].find(el => getComputedStyle(el).visibility !== 'hidden');
    if (l) l.click();
  });
  await p.waitForSelector('.bsc-sheet', { timeout: 12000 });
  await p.waitForTimeout(1500);
  ficheOk = true;
} catch (e) { console.log('FICHE_ERR', e.message.slice(0, 100)); }
console.log('FICHE_OPEN=' + ficheOk);

if (ficheOk) {
  // Lister les boutons visibles de la fiche (trouver le CTA verdict)
  const btns = await p.evaluate(() => {
    const f = document.querySelector('.bsc-sheet');
    return [...f.querySelectorAll('button')].map(x => ({
      t: (x.innerText || x.getAttribute('aria-label') || '').slice(0, 60),
      w: Math.round(x.getBoundingClientRect().width),
      h: Math.round(x.getBoundingClientRect().height),
    })).filter(x => x.t);
  });
  console.log('BSC_BTNS=' + JSON.stringify(btns.slice(0, 12)));

  // Chercher CTA paywall
  const ctaFound = await p.evaluate(() => {
    const f = document.querySelector('.bsc-sheet');
    const cand = [...f.querySelectorAll('button')].find(x => /7 jours|débloquer|pass|premium|accéder/i.test(x.innerText));
    if (cand) { cand.click(); return cand.innerText.slice(0, 50); }
    return null;
  });
  console.log('CTA_CLICKED=' + JSON.stringify(ctaFound));
  await p.waitForTimeout(2000);
  const pwOpen = await p.evaluate(() => !!document.querySelector('[class*="sg-modal"], [class*="premium"], [role="dialog"]'));
  console.log('PAYWALL_OPEN=' + pwOpen);
  if (pwOpen) {
    // focus trap : 12 tabs puis où est le focus ?
    for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
    const focusInfo = await p.evaluate(() => {
      const el = document.activeElement;
      const modal = el && el.closest('[class*="sg-modal"], [class*="premium"], [role="dialog"]');
      return { tag: el?.tagName, modalInside: !!modal };
    });
    console.log('FOCUS_AFTER_12TAB=' + JSON.stringify(focusInfo));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    const closed = await p.evaluate(() => !document.querySelector('[class*="sg-modal"] .bsc-sheet'));
    console.log('PW_ESC_CLOSE=' + closed);
  }
}

// BottomNav
const nav = await p.evaluate(() => {
  const els = document.querySelectorAll('[class*="bottomnav"] button, [class*="bottom-nav"] button, [data-testid*="nav"] button');
  return [...els].map(el => {
    const r = el.getBoundingClientRect();
    return { t: (el.innerText || el.getAttribute('aria-label') || '?').slice(0, 20), min: Math.round(Math.min(r.width, r.height)) };
  });
});
console.log('BOTTOMNAV=' + JSON.stringify(nav));
await b.close();

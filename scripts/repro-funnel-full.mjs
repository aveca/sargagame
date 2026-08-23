/** Repro funnel complet mobile : comic fiche → CTA 7 jours → paywall → trap/Escape → fiche complète → bsc. */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4173';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
});
const p = await ctx.newPage();
p.setDefaultTimeout(20000);
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 150)));
p.on('console', m => { if (m.type() === 'error' && !/CSP|Refused|violates|mollie/i.test(m.text())) errs.push(m.text().slice(0, 150)); });

await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
try { await p.getByRole('button', { name: /accept|tout|ok/i }).first().click({ timeout: 4000 }); } catch {}
await p.waitForFunction(() => document.querySelectorAll('.sg-maplabel').length >= 3, { timeout: 30000 });

await p.evaluate(() => {
  const l = [...document.querySelectorAll('.sg-maplabel')].find(el => getComputedStyle(el).visibility !== 'hidden');
  if (l) l.click();
});
await p.waitForSelector('.lc-detail', { timeout: 12000 });
console.log('STEP1 fiche comic OK');

// CTA 7 jours
const cta = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('.lc-detail button, [class*="lcd"] button')].find(x => /7 prochains jours|7 jours/i.test(x.innerText));
  if (btn) { btn.click(); return btn.innerText.slice(0, 40); }
  return null;
});
console.log('STEP2 CTA clicked=' + JSON.stringify(cta));
await p.waitForTimeout(2200);

const pw = await p.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  const premium = document.querySelector('[class*="premium"], [class*="sg-modal"]');
  return { dlg: dlg ? (dlg.getAttribute('aria-label') || dlg.className.slice(0, 60)) : null, premium: premium ? premium.className.slice(0, 60) : null };
});
console.log('STEP3 paywall=' + JSON.stringify(pw));

if (pw.dlg || pw.premium) {
  // focus initial
  const f0 = await p.evaluate(() => { const el = document.activeElement; return el ? el.tagName + '.' + (el.className || '').toString().slice(0, 30) : 'none'; });
  console.log('STEP4 focus initial=' + f0);
  for (let i = 0; i < 15; i++) await p.keyboard.press('Tab');
  const f1 = await p.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, insideModal: !!(el && el.closest('[class*="sg-modal"],[class*="premium"],[role="dialog"]')) };
  });
  console.log('STEP5 focus après 15 tabs=' + JSON.stringify(f1));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  const closed = await p.evaluate(() => !document.querySelector('[role="dialog"][aria-modal="true"]') && !document.querySelector('[class*="sg-modal"] [class*="world"], [class*="sg-modal"] [class*="comic"]'));
  console.log('STEP6 Escape ferme paywall=' + closed);
}

// Fiche complète → bsc-sheet
await p.waitForTimeout(500);
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /fiche complète/i.test(x.innerText));
  if (btn) btn.click();
});
try { await p.waitForSelector('.bsc-sheet', { timeout: 8000 }); console.log('STEP7 fiche complète → bsc-sheet OK'); }
catch { console.log('STEP7 fiche complète → PAS de bsc-sheet'); }
const bscState = await p.evaluate(() => {
  const s = document.querySelector('.bsc-sheet');
  if (!s) return null;
  return { len: s.innerText.length, hasVerdict: /propre|à surveiller|éviter/i.test(s.innerText), hasForecast: /demain|7 j|prévision/i.test(s.innerText) };
});
console.log('STEP8 bsc=' + JSON.stringify(bscState));
console.log('ERRORS=' + JSON.stringify(errs.slice(0, 5)));
await p.screenshot({ path: process.env.TEMP + '/opencode/funnel-full.png' });
await b.close();

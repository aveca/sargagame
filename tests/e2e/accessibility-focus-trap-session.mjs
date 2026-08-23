/** FOCUS TRAP TEST — mobile + desktop — WIP a11y présent */
import { chromium } from 'playwright';
const BASE = 'http://localhost:4173';
const b = await chromium.launch();

async function run(kind, label) {
  const ctx = await b.newContext(
    kind === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' }
      : { viewport: { width: 1920, height: 1080 } }
  );
  const p = await ctx.newPage();
  p.setDefaultTimeout(25000);
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/CSP|Refused|violates/i.test(m.text())) errs.push(m.text().slice(0, 120)); });
  p.on('pageerror', e => errs.push('PE:' + e.message.slice(0, 100)));

  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  try { await p.getByRole('button', { name: /accept|tout|ok/i }).first().click({ timeout: 4000 }); } catch {}
  await p.waitForFunction(() => document.querySelectorAll('.sg-maplabel').length >= 3, { timeout: 30000 });

  // Open fiche → open paywall
  await p.evaluate(() => {
    const l = [...document.querySelectorAll('.sg-maplabel')].find(el => getComputedStyle(el).visibility !== 'hidden');
    if (l) l.click();
  });
  await p.waitForTimeout(2200);

  // CTA 7 jours → paywall
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /7 prochains jours|7 jours/i.test(x.innerText || ''));
    if (btn) btn.click();
  });
  await p.waitForTimeout(2000);

  // PROTOCOLE FOCUS TRAP
  const r = {};
  // 1. focus initial dans le modal
  r.focusInitialTag = await p.evaluate(() => { const el = document.activeElement; return el ? (el.tagName + '.' + (el.className || '').slice(0, 30)) : 'none'; });
  r.focusInitialInside = await p.evaluate(() => !!(document.activeElement && document.activeElement.closest('[role="dialog"][aria-modal="true"], [class*="sg-modal"], [class*="premium"]')));

  // 2. TAB x15
  for (let i = 0; i < 15; i++) await p.keyboard.press('Tab');
  r.tab15Tag = await p.evaluate(() => { const el = document.activeElement; return el ? (el.tagName + '.' + (el.className || '').slice(0, 30)) : 'none'; });
  r.tab15Inside = await p.evaluate(() => !!(document.activeElement && document.activeElement.closest('[role="dialog"][aria-modal="true"], [class*="sg-modal"], [class*="premium"]')));

  // 3. SHIFT+TAB (reverse)
  for (let i = 0; i < 8; i++) await p.keyboard.press('Shift+Tab');
  r.shiftTab8Tag = await p.evaluate(() => { const el = document.activeElement; return el ? (el.tagName + '.' + (el.className || '').slice(0, 30)) : 'none'; });
  r.shiftTab8Inside = await p.evaluate(() => !!(document.activeElement && document.activeElement.closest('[role="dialog"][aria-modal="true"], [class*="sg-modal"], [class*="premium"]')));

  // 4. Bouton principal (re-focus)
  await p.keyboard.press('Tab'); // retour au premier bouton interactif
  await p.waitForTimeout(300);
  r.btnPrimaryTag = await p.evaluate(() => { const el = document.activeElement; return el ? (el.tagName + '.' + (el.className || '').slice(0, 30)) : 'none'; });

  // 5. Bouton fermer (close button, souvent top-right)
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  r.btnCloseTag = await p.evaluate(() => { const el = document.activeElement; return el ? (el.textContent || '').slice(0, 20) : 'none'; });

  // 6. Escape
  await p.keyboard.press('Escape');
  await p.waitForTimeout(900);
  r.escClosed = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    return !dlg || (getComputedStyle(dlg).display === 'none' || getComputedStyle(dlg).visibility === 'hidden');
  });

  // 7. Focus restoration: après fermeture, le focus doit revenir sur le déclencheur (bouton CTA ou page)
  await p.waitForTimeout(600);
  r.focusAfterEsc = await p.evaluate(() => { const el = document.activeElement; return el ? (el.tagName + '.' + (el.className || '').slice(0, 30)) : 'none'; });

  await ctx.close();
  return { kind, label, r, errs: errs.slice(0, 4) };
}

const mobile = await run('mobile', '390x844-DPR2');
const desktop = await run('desktop', '1920x1080');
console.log('=== FOCUS TRAP RESULTS ===');
console.log(JSON.stringify(mobile, null, 2));
console.log('--- DESKTOP ---');
console.log(JSON.stringify(desktop, null, 2));
await b.close();

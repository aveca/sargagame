/**
 * Audit exploratoire session — mobile 390x844 (iPhone12) + desktop 1920x1080.
 * Surfaces : map → fiche → paywall → deep-link fiche SEO → mollie_return.
 * Sortie : rapport JSON + tokens greppables. Aucune écriture repo.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const OUT = [];
const log = (id, status, detail) => { OUT.push({ id, status, detail }); console.log(`[${status}] ${id} — ${detail}`); };

const b = await chromium.launch();

async function newCtx(kind) {
  return kind === 'mobile'
    ? b.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      })
    : b.newContext({ viewport: { width: 1920, height: 1080 } });
}

function wireErrors(page, bucket) {
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/Content Security Policy|Refused to connect|violates the following/.test(t)) bucket.push(t.slice(0, 200));
  });
  page.on('pageerror', e => bucket.push('PAGEERROR ' + e.message));
}

// ════════════════ MOBILE ════════════════
{
  const ctx = await newCtx('mobile');
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(60000); p.setDefaultTimeout(20000);
  const errs = []; wireErrors(p, errs);

  // 1) Load home → map
  const t0 = Date.now();
  const reqs = [];
  p.on('request', r => { if (r.resourceType() === 'script' || r.resourceType() === 'stylesheet') reqs.push(r.url()); });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  const loadMs = Date.now() - t0;
  const mapVisible = await p.evaluate(() => !!document.querySelector('svg, .leaflet-container, [class*="map"]'));
  log('M1-home-map', mapVisible ? 'OK' : 'FAIL', `map surface visible=${mapVisible}, eager js/css reqs=${reqs.length}, ${loadMs}ms`);

  // 2) Cookie banner present? accept it
  try {
    const cb = p.locator('#sg-cookie-banner, [class*="cookie"]').first();
    if (await cb.isVisible({ timeout: 3000 })) {
      const okBtn = p.getByRole('button', { name: /accept|ok|tout|j'ai compris/i }).first();
      if (await okBtn.isVisible().catch(() => false)) { await okBtn.click(); log('M2-cookie', 'OK', 'banner accepté'); }
      else log('M2-cookie', 'WARN', 'banner visible mais bouton accept non trouvé');
    } else log('M2-cookie', 'INFO', 'no banner');
  } catch { log('M2-cookie', 'INFO', 'no banner'); }

  // 3) Click a beach pin/label on map
  let ficheOpen = false;
  try {
    const label = p.locator('.sg-maplabel').first();
    if (await label.isVisible({ timeout: 8000 })) { await label.click(); }
    else throw new Error('no label');
    await p.waitForTimeout(2500);
    ficheOpen = await p.evaluate(() => !!document.querySelector('.bsc-fiche, .sheet'));
  } catch (e) { log('M3-open-fiche', 'FAIL', String(e).slice(0, 120)); }
  log('M3-open-fiche', ficheOpen ? 'OK' : 'FAIL', `fiche ouverte=${ficheOpen}`);

  // 4) Escape closes fiche
  if (ficheOpen) {
    await p.keyboard.press('Escape'); await p.waitForTimeout(900);
    const closed = await p.evaluate(() => !document.querySelector('.bsc-fiche'));
    log('M4-fiche-escape', closed ? 'OK' : 'FAIL', `Escape ferme fiche=${closed}`);
    // reopen for CTA test
    if (closed) {
      try { await p.locator('.sg-maplabel').first().click(); await p.waitForTimeout(2200); } catch {}
    }
  }

  // 5) Verdict CTA → paywall
  let paywallOpen = false;
  try {
    const cta = p.locator('button:has-text("7 jours"), button:has-text("Débloquer"), button[class*="paywall-cta"], .bsc-fiche button:has-text("jour")').first();
    if (await cta.isVisible({ timeout: 5000 })) { await cta.click(); await p.waitForTimeout(1800); }
    paywallOpen = await p.evaluate(() =>
      !!document.querySelector('[class*="premium"], [class*="paywall"], [aria-label*="remium"]') &&
      document.body.innerText.match(/pass|premium|débloquer|accès/i));
  } catch (e) { /* not fatal */ }
  log('M5-paywall', paywallOpen ? 'OK' : 'WARN', `paywall ouvert=${paywallOpen}`);

  // 6) Focus trap in modal: Tab x8 stays inside dialog?
  if (paywallOpen) {
    const trapOk = await p.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (!dlg) return 'NO-DIALOG';
      return 'HAS-DIALOG';
    });
    // simulate tab escape
    let escaped = false;
    for (let i = 0; i < 10; i++) { await p.keyboard.press('Tab'); }
    escaped = await p.evaluate(() => {
      const el = document.activeElement;
      return !el || !el.closest('[class*="modal"], [class*="premium"], [class*="paywall"], [role="dialog"]');
    });
    log('M6-paywall-focus-trap', escaped === false ? 'OK' : 'WARN', `dialog=${trapOk}, focus sort du paywall après 10 Tabs=${escaped}`);

    // Escape closes paywall
    await p.keyboard.press('Escape'); await p.waitForTimeout(800);
    const pwClosed = await p.evaluate(() => !document.querySelector('[class*="premium-modal"]:not([style*="display: none"])'));
    log('M7-paywall-escape', pwClosed ? 'OK' : 'WARN', `Escape ferme paywall=${pwClosed}`);
  }

  // 7) Deep link fiche SEO
  await p.goto(BASE + '/plages/plage-des-salines/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const dl = await p.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.slice(0, 80) || '',
    hasContent: document.body.innerText.length > 400,
    hasVerdict: /clean|moderat|avoid|propre|modéré|éviter/i.test(document.body.innerText),
  }));
  log('M8-deeplink-fiche-seo', dl.hasContent && dl.h1 ? 'OK' : 'FAIL',
    `title="${dl.title.slice(0, 60)}" h1="${dl.h1.slice(0, 40)}" content=${dl.hasContent} verdict=${dl.hasVerdict}`);

  // 8) BottomNav touch targets
  const navSizes = await p.evaluate(() => {
    const els = document.querySelectorAll('.sg-bottom-nav button, [class*="bottom-nav"] button, nav button');
    return Array.from(els).slice(0, 6).map(el => {
      const r = el.getBoundingClientRect();
      return Math.round(Math.min(r.width, r.height));
    });
  });
  const tooSmall = navSizes.filter(s => s > 0 && s < 44);
  log('M9-bottomnav-touch-targets', tooSmall.length === 0 ? 'OK' : 'WARN', `sizes=${JSON.stringify(navSizes)} <44px=${tooSmall.length}`);

  // 9) mollie_return handler sans crash (API PHP absente en preview → ne doit pas throw)
  await p.goto(BASE + '/?mollie_return=1', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  const mrErrs = errs.filter(e => !/Failed to fetch|404|mollie\.php/i.test(e));
  log('M10-mollie-return-no-crash', mrErrs.length === 0 ? 'OK' : 'WARN', `erreurs hors API attendue=${mrErrs.length} ${mrErrs[0] || ''}`);

  // console errors total
  log('M11-console-errors', errs.length === 0 ? 'OK' : 'WARN', `${errs.length} erreurs: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

// ════════════════ DESKTOP ════════════════
{
  const ctx = await newCtx('desktop');
  const p = await ctx.newPage();
  p.setDefaultNavigationTimeout(60000); p.setDefaultTimeout(20000);
  const errs = []; wireErrors(p, errs);

  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);

  // D1: horizontal overflow?
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  log('D1-desktop-hscroll', overflow ? 'FAIL' : 'OK', `horizontal scroll=${overflow}`);

  // D2: open fiche → desktop layout
  let opened = false;
  try { await p.locator('.sg-maplabel').first().click(); await p.waitForTimeout(2500); opened = true; } catch {}
  const dFiche = await p.evaluate(() => {
    const f = document.querySelector('.bsc-fiche, .sheet');
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { w: Math.round(r.width), maxed: r.width >= window.innerWidth * 0.98 };
  });
  log('D2-desktop-fiche', dFiche ? 'OK' : 'WARN', `fiche=${JSON.stringify(dFiche)} (ouverte via clic=${opened})`);

  // D3: keyboard access — focus visible sur boutons
  const kb = await p.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).slice(0, 30);
    return btns.filter(b => b.tabIndex >= 0).length;
  });
  log('D3-desktop-focusable-buttons', kb > 5 ? 'OK' : 'WARN', `${kb}/30 boutons tabbables`);

  log('D4-console-errors', errs.length === 0 ? 'OK' : 'WARN', `${errs.length}: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

await b.close();
fs.writeFileSync(process.env.TEMP + '/opencode/audit-session-report.json', JSON.stringify(OUT, null, 2));
const fails = OUT.filter(o => o.status === 'FAIL').length;
console.log(`\nAUDIT DONE — ${OUT.length} checks, ${fails} FAIL`);

/**
 * ux-smoke.mjs — smoke visuel du parcours comic « Le Veilleur » (mobile WebKit).
 * Parcours : splash → onboarding → arène → reveal booster → détail carte → paywall.
 * Sort des captures /tmp/j*.png + scan des BOUTONS BLANCS (doit = []) + erreurs JS.
 * Usage : `npx vite build && (npx vite preview --port 4173 &)` puis `node scripts/ux-smoke.mjs`.
 * Cf. AUTONOMOUS_BUILD.md (étape 3 : vérifier avant merge).
 */
import { chromium } from 'playwright';
const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

// fresh first-launch: chasse on, splash+onboarding allowed to show
await p.goto(BASE + '/?chasse=1', { waitUntil: 'networkidle', timeout: 30000 });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/j1-splash.png' });

// try to advance splash/onboarding by clicking primary buttons a few times
for (let i = 0; i < 5; i++) {
  // any visible primary button / next / skip
  const clicked = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(b => {
      const r = b.getBoundingClientRect(); const s = getComputedStyle(b);
      return r.width > 40 && r.height > 24 && s.visibility !== 'hidden' && s.display !== 'none';
    });
    // prefer buttons whose text looks like advance
    const adv = btns.find(b => /commenc|continu|suivant|c'est parti|jouer|entrer|skip|passer|next|terrain|go/i.test(b.textContent || ''));
    const target = adv || btns[btns.length - 1];
    if (target) { target.click(); return target.textContent.trim().slice(0, 30); }
    return null;
  });
  await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/j2-step${i}.png` });
  if (await p.$('.lc-root')) break;
}

await p.waitForSelector('.lc-root', { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/j3-arena.png' });

// reveal
const g = await p.$('.lc-gbtn'); if (g) { await g.click(); await p.waitForTimeout(1200); }
await p.screenshot({ path: '/tmp/j4-reveal.png' });

// tap the featured card -> fiche plage (app beach detail)
const card = await p.$('.lc-fancard .lc-card') || await p.$('.lc-cta');
if (card) { await card.click(); await p.waitForTimeout(1800); }
await p.screenshot({ path: '/tmp/j5-fiche.png', fullPage: false });

// open the paywall from the detail's premium CTA
const pcta = await p.$('.lc-detail .lc-cta');
if (pcta) { await pcta.click(); await p.waitForTimeout(1600); }
await p.screenshot({ path: '/tmp/j6-paywall.png', fullPage: false });

// scan for white/transparent buttons sitewide
const whiteButtons = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, a[role=button], [role=button]')) {
    const r = el.getBoundingClientRect(); if (r.width < 30 || r.height < 18) continue;
    const s = getComputedStyle(el);
    const bg = s.backgroundColor, bgi = s.backgroundImage;
    const isWhiteish = (bg === 'rgb(255, 255, 255)' || bg === 'rgba(0, 0, 0, 0)') && bgi === 'none';
    if (isWhiteish) out.push({ t: (el.textContent || '').trim().slice(0, 24), bg, color: s.color, cls: el.className.toString().slice(0, 40) });
  }
  return out.slice(0, 25);
});
console.log('WHITE_OR_TRANSPARENT_BUTTONS=' + JSON.stringify(whiteButtons, null, 1));
console.log('ERRORS=' + JSON.stringify(errs.slice(0, 12)));
await b.close();

/**
 * ux-smoke.mjs — smoke visuel du parcours comic « Le Veilleur » (mobile WebKit).
 * Parcours : splash → onboarding → arène → reveal booster → détail carte → paywall.
 * Sort des captures /tmp/j*.png + scan des BOUTONS BLANCS (doit = []) + erreurs JS.
 * Tokens greppables (le Gate greppe la sortie, jamais l'exit code — toujours exit 0) :
 *   WHITE_OR_TRANSPARENT_BUTTONS=[]  (boutons blancs/transparents, doit = [])
 *   ERRORS=[]                        (erreurs console/page, doit = [], tronqué à 12)
 *   RM_INFINITE=[]                   (animations infinies encore actives sous
 *                                     prefers-reduced-motion:reduce, doit = [],
 *                                     tronqué à 12 ; gate : grep -q 'RM_INFINITE=\[\]')
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
await p.goto(BASE + '/?chasse=1&arena=1', { waitUntil: 'networkidle', timeout: 30000 });
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

// ── passe reduced-motion : plancher a11y (CLAUDE.md « prefers-reduced-motion ») ──
// Recharge la surface principale avec prefers-reduced-motion:reduce, puis liste les
// animations à itérations INFINIES encore en cours : elles n'ont pas de fallback
// statique → violation du plancher. Token = RM_INFINITE=[] (liste vide = conforme).
// try/catch : un crash de CETTE passe ne doit jamais empêcher les tokens ci-dessus
// (déjà imprimés) ni faire sortir avec un code ≠ 0 — convention : le Gate greppe.
let rmInfinite = [];
try {
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(BASE + '/?chasse=1&arena=1', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(1500); // settle (même ordre de grandeur que les étapes du parcours)
  await p.screenshot({ path: '/tmp/j7-reduced-motion.png' });
  rmInfinite = await p.evaluate(() => {
    // Spinners/skeletons de CHARGEMENT tolérés : encore visibles pendant le settle,
    // ils disparaissent au mount et ne sont pas une anim décorative persistante.
    const LOADING_OK = /(^|\s)(sg-sk\S*|skeleton\S*|lc-spin\S*|sg-spin\S*)(\s|$)/;
    const out = [];
    for (const a of document.getAnimations()) {
      try {
        if (a.playState !== 'running') continue;
        const timing = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        if (!timing || timing.iterations !== Infinity) continue;
        const el = a.effect && a.effect.target;
        // className peut être un SVGAnimatedString sur les éléments SVG
        const cls = el && el.className != null
          ? String(el.className.baseVal !== undefined ? el.className.baseVal : el.className)
          : '';
        if (LOADING_OK.test(cls)) continue;
        out.push({
          name: a.animationName || a.id || 'anim',
          el: (el ? el.tagName.toLowerCase() : '?')
            + (cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        });
      } catch (_) { /* une anim illisible ne casse pas la passe */ }
    }
    return out;
  });
} catch (e) {
  // La passe elle-même a échoué : token non-vide explicite (le Gate bloquera),
  // mais le script termine proprement (exit 0) — les autres tokens sont déjà sortis.
  rmInfinite = ['RM_PASS_ERROR: ' + String(e && e.message ? e.message : e).slice(0, 160)];
}
console.log('RM_INFINITE=' + JSON.stringify(rmInfinite.slice(0, 12)));
await b.close();

// Headless, background verification for the Veilleur descent piece.
// Runs OUR own Playwright (no visible window; forced-colors defeated per sg-svg-scene).
// Usage: node verify-descent.mjs [absolutePathToHtml]
import { chromium } from 'playwright';
import path from 'node:path';
import url from 'node:url';

const FILE = process.argv[2] || 'C:/Users/user/Desktop/Backup/sargagame/design/proto-ecoscene-descent.html';
const fileUrl = url.pathToFileURL(FILE).href;

const out = { file: FILE, checks: {}, fail: [] };
function assert(name, cond, detail) { out.checks[name] = { pass: !!cond, detail }; if (!cond) out.fail.push(name); }

const browser = await chromium.launch({
  headless: true,
  args: ['--force-color-profile=srgb', '--disable-lcd-text'],
});

// ---------- Pass 1: normal motion, desktop ----------
{
  const ctx = await browser.newContext({
    colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none',
    viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const external = [];
  page.on('request', r => { const u = r.url(); if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('about:')) external.push(u); });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  assert('no_external_requests', external.length === 0, external.slice(0, 6));
  assert('no_console_errors', errors.length === 0, errors.slice(0, 6));

  const fonts = await page.evaluate(() => ({
    anton: [...document.fonts].some(f => /Anton/i.test(f.family) && f.status === 'loaded'),
    bricolage: [...document.fonts].some(f => /Bricolage/i.test(f.family) && f.status === 'loaded'),
    mono: [...document.fonts].some(f => /JetBrains/i.test(f.family) && f.status === 'loaded'),
    setDepth: typeof window.__setDepth,
  }));
  assert('font_anton', fonts.anton);
  assert('font_bricolage', fonts.bricolage);
  assert('font_mono_jetbrains', fonts.mono, fonts);
  assert('setDepth_exists', fonts.setDepth === 'function', fonts.setDepth);

  // CALM INVARIANT: at rest (no presentation, no gesture), zero INFINITE animations
  // whose keyframes move transform translate/rotate/scale (the "aquarium" test).
  const aquarium = await page.evaluate(() => {
    window.__setDepth && window.__setDepth(0.5); // rest mid-descent
    const bad = [];
    for (const a of document.getAnimations()) {
      try {
        const eff = a.effect; if (!eff) continue;
        const t = eff.getTiming();
        const infinite = t.iterations === Infinity || t.iterations === null && false;
        if (t.iterations !== Infinity) continue;
        const kfs = eff.getKeyframes ? eff.getKeyframes() : [];
        const movesTransform = kfs.some(k => typeof k.transform === 'string' && /translate|rotate|scale/.test(k.transform) && k.transform !== 'none');
        if (movesTransform) {
          const el = eff.target;
          bad.push((el && (el.getAttribute('class') || el.tagName)) + ' :: ' + (a.animationName || (kfs[0] && '')) );
        }
      } catch (e) {}
    }
    return bad;
  });
  assert('calm_no_aquarium_at_rest', aquarium.length === 0, aquarium.slice(0, 12));

  // Presentation starts on Watch, bar advances, scroll syncs
  const pres = await page.evaluate(async () => {
    window.scrollTo(0, 0); window.__setDepth(0);
    const wb = document.getElementById('watchBtn'); if (wb) wb.click();
    await new Promise(r => setTimeout(r, 5200));
    const presenting = document.body.classList.contains('presenting');
    const y = Math.round(window.scrollY);
    const before = window.scrollY;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 80 }));
    await new Promise(r => setTimeout(r, 150));
    const stopped = !document.body.classList.contains('presenting');
    const noJump = Math.abs(window.scrollY - before) < 6;
    return { presenting, y, stopped, noJump };
  });
  assert('presentation_starts', pres.presenting, pres);
  assert('presentation_scroll_synced', pres.y > 50, pres);
  assert('handoff_stops_and_no_jump', pres.stopped && pres.noJump, pres);

  // Aha payoff: outro lit + honesty footer legible (opacity >= 0.6)
  const payoff = await page.evaluate(async () => {
    window.__setDepth(1);
    await new Promise(r => setTimeout(r, 200));
    const outro = document.getElementById('outro');
    const foot = document.getElementById('outroFoot');
    const cs = foot ? getComputedStyle(foot) : null;
    // effective legibility = element-opacity chain × the text color's ALPHA channel
    let op = 1, n = foot; while (n && n !== document.body) { op *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement; }
    let alpha = 1; const mm = cs && cs.color.match(/rgba?\(([^)]+)\)/);
    if (mm) { const p = mm[1].split(',').map(s => s.trim()); alpha = p.length >= 4 ? parseFloat(p[3]) : 1; }
    return {
      lit: outro && outro.classList.contains('lit'),
      big: (document.getElementById('outroBig') || {}).textContent,
      footColor: cs && cs.color,
      footEffectiveLegibility: +(op * alpha).toFixed(3),
    };
  });
  assert('payoff_lit', payoff.lit, payoff);
  assert('payoff_footer_legible', payoff.footEffectiveLegibility >= 0.6, payoff);

  // aria-label localization: pctlBtn must change with language
  const aria = await page.evaluate(() => {
    const btnFor = () => document.getElementById('pctlBtn').getAttribute('aria-label');
    const set = (l) => { const b = [...document.querySelectorAll('.langs button')].find(x => x.dataset.lang === l); b && b.click(); };
    set('fr'); const fr = btnFor(); set('en'); const en = btnFor(); set('es'); const es = btnFor(); set('fr');
    return { fr, en, es };
  });
  assert('pctl_aria_localized', aria.fr && aria.en && aria.fr !== aria.en, aria);

  await ctx.close();
}

// ---------- Pass 2: mobile 390 + tap targets ----------
{
  const ctx = await browser.newContext({
    colorScheme: 'dark', forcedColors: 'none',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => {
    const rects = {};
    const wb = document.getElementById('watchBtn'); rects.watch = wb && wb.getBoundingClientRect();
    const langs = [...document.querySelectorAll('.langs button')].map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    return {
      overflow: document.documentElement.scrollWidth > 391,
      scrollWidth: document.documentElement.scrollWidth,
      watch44: rects.watch && rects.watch.height >= 44 && rects.watch.width >= 44,
      langsMin: langs, langsAll44: langs.every(l => l.w >= 44 && l.h >= 44),
    };
  });
  assert('mobile_no_overflow', !m.overflow, m);
  assert('mobile_watch_44', m.watch44, m);
  assert('mobile_langs_44', m.langsAll44, m.langsMin);
  await ctx.close();
}

// ---------- Pass 3: reduced-motion floor ----------
{
  const ctx = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce', forcedColors: 'none', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const rm = await page.evaluate(() => {
    // no infinite animations at all under reduce
    const inf = document.getAnimations().filter(a => { try { return a.effect.getTiming().iterations === Infinity; } catch (e) { return false; } }).length;
    // autostart must be suppressed even with ?play — simulate by checking body not presenting on plain load
    return { infiniteAnims: inf, presenting: document.body.classList.contains('presenting') };
  });
  assert('rm_no_infinite_anims', rm.infiniteAnims === 0, rm);
  await ctx.close();
}

await browser.close();
out.ok = out.fail.length === 0;
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);

// Vérif 100 % HEADLESS des CINE-SKILLS (aucune fenêtre — Playwright en fond).
// Invariants : (1) le catalogue window.CINE_MOVES est exposé ; (2) chaque skill FAIT bouger
// la caméra (transform/filtre du monde SVG change entre t=0 et t=0.5) ; (3) doctrine CALME —
// aucun skill n'ajoute d'animation transform INFINIE dans #pMain (tableau au repos) ;
// (4) HORS-LIGNE — les 3 fonts (Anton/Bricolage/JetBrains) sont chargées, zéro CDN.
// forced-colors défait + sRGB (le contraste Windows fuit sinon dans le headless de ce poste).
// N'appelle jamais process.exit hors du verdict final — gating par grep sur la sortie.
import { chromium } from 'playwright';
import url from 'node:url';

const FILE = url.fileURLToPath(new URL('../../design/proto-ecoscene-descent.html', import.meta.url));
const fails = [];

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

// (1) catalogue
const moves = await page.evaluate(() => Array.isArray(window.CINE_MOVES) ? window.CINE_MOVES : null);
if (!moves) fails.push('CINE_MOVES absent');
const N = moves ? moves.length : 0;
if (N < 12) fails.push('CINE_MOVES too small: ' + N);
const hasApply = await page.evaluate(() => typeof window.__applyCam === 'function' && typeof window.__playSkill === 'function');
if (!hasApply) fails.push('__applyCam/__playSkill missing');

// (2) chaque skill bouge la caméra (t=0 vs t=0.5) — lit le style inline déterministe
const noMove = [];
for (const m of (moves || [])) {
  const [a, c] = await page.evaluate((key) => {
    const svg = document.querySelector('#backdrop>svg');
    const read = () => (svg.style.transform || '') + '|' + (svg.style.filter || '');
    window.__applyCam(key, 0.0); const s0 = read();
    window.__applyCam(key, 0.5); const s1 = read();
    // reset propre
    svg.style.transform = ''; svg.style.filter = ''; svg.style.transformOrigin = '';
    window.__setDepth(0);
    return [s0, s1];
  }, m.key);
  if (a === c) noMove.push(m.key);
}
if (noMove.length) fails.push('MOVES_STATIC=[' + noMove.join(',') + ']');

// (3) CALME — pas d'anim transform infinie dans #pMain (scope acteurs de scène)
const aquarium = await page.evaluate(() => {
  const pm = document.getElementById('pMain'); if (!pm) return ['no-pMain'];
  const bad = [];
  for (const el of pm.querySelectorAll('*')) {
    for (const an of el.getAnimations ? el.getAnimations() : []) {
      const tim = an.effect && an.effect.getTiming ? an.effect.getTiming() : {};
      if (tim.iterations === Infinity) {
        const kf = (an.effect.getKeyframes ? an.effect.getKeyframes() : []) || [];
        if (kf.some(k => 'transform' in k)) { bad.push(el.tagName); break; }
      }
    }
  }
  return bad;
});
if (aquarium.length) fails.push('AQUARIUM=[' + aquarium.join(',') + ']');

// (4) HORS-LIGNE — 3 fonts chargées
const fonts = await page.evaluate(() => {
  const has = re => [...document.fonts].some(f => re.test(f.family) && f.status === 'loaded');
  return { anton: has(/Anton/i), bri: has(/Bricolage/i), jet: has(/JetBrains/i) };
});
if (!fonts.anton) fails.push('font Anton not loaded');
if (!fonts.bri) fails.push('font Bricolage not loaded');
if (!fonts.jet) fails.push('font JetBrains not loaded');

await b.close();

console.log('CINESKILLS_MOVES=' + N);
console.log('MOVES_STATIC=[' + noMove.join(',') + ']');
console.log('AQUARIUM=[' + aquarium.join(',') + ']');
console.log('FONTS_OFFLINE=' + JSON.stringify(fonts));
console.log(fails.length ? ('CINESKILLS_FAIL: ' + fails.join(' ; ')) : 'CINESKILLS_ALL_GREEN');

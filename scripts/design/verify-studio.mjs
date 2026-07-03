// Vérif 100 % HEADLESS du STUDIO « Skill → Clip » (Playwright en fond, aucune fenêtre).
// Invariants : (1) generateClip/__camAt/__STUDIO_WM exposés ; (2) la génération vidéo GRATUITE
// 100 % navigateur (canvas.captureStream + MediaRecorder) produit un vrai .webm (blob>0) pour
// plusieurs skills (depth + caméra + blur) ; (3) GARDE-FOU MOAT : le filigrane ne contient
// AUCUN chiffre, AUCUN mot temporel (live/aujourd'hui/now…) — l'asset est de l'ambiance, jamais
// une mesure ; (4) HORS-LIGNE : fonts chargées, zéro CDN. N'appelle pas process.exit hors verdict.
import { chromium } from 'playwright';
import url from 'node:url';

const FILE = url.fileURLToPath(new URL('../../design/proto-ecoscene-descent.html', import.meta.url));
const fails = [];
const TEMPORAL = /(aujourd'?hui|en\s*direct|live|maintenant|à l'instant|today|right now|\bnow\b|ahora|en\s*vivo|hoy)/i;

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const ctx = await b.newContext({ colorScheme: 'dark', forcedColors: 'none', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

// (1) hooks présents
const hooks = await page.evaluate(() => ({
  gen: typeof window.generateClip === 'function',
  cam: typeof window.__camAt === 'function',
  wm: window.__STUDIO_WM && typeof window.__STUDIO_WM === 'object' ? window.__STUDIO_WM : null,
}));
if (!hooks.gen) fails.push('generateClip missing');
if (!hooks.cam) fails.push('__camAt missing');
if (!hooks.wm) fails.push('__STUDIO_WM missing');

// (3) garde-fou moat : filigrane sans chiffre ni mot temporel (fr/en/es)
const wmBad = [];
for (const [lang, s] of Object.entries(hooks.wm || {})) {
  if (/\d/.test(s)) wmBad.push(lang + ':digit');
  if (TEMPORAL.test(s)) wmBad.push(lang + ':temporal');
}
if (wmBad.length) fails.push('WM_DIRTY=[' + wmBad.join(',') + ']');

// (2) génération réelle .webm pour plusieurs skills (depth / caméra / blur)
const gen = {};
for (const key of ['descent', 'orbit', 'rack_focus']) {
  const r = await page.evaluate(async (k) => {
    try { return await window.generateClip(k, { ratio: '9x16', noDownload: true, maxMs: 900, fps: 24 }); }
    catch (e) { return { err: String(e) }; }
  }, key);
  gen[key] = r && r.bytes ? r.bytes : 0;
  if (!r || !r.bytes || r.bytes <= 0) fails.push('GEN_FAIL:' + key + (r && r.err ? '(' + r.err + ')' : ''));
}

// scene reset après génération (caméra au repos = tableau)
const resetOk = await page.evaluate(() => {
  const svg = document.querySelector('#backdrop>svg');
  return (svg.style.transform || '') === '' && (svg.style.filter || '') === '';
});
if (!resetOk) fails.push('CAM_NOT_RESET');

// (4) hors-ligne
const fonts = await page.evaluate(() => {
  const has = re => [...document.fonts].some(f => re.test(f.family) && f.status === 'loaded');
  return { anton: has(/Anton/i), bri: has(/Bricolage/i), jet: has(/JetBrains/i) };
});
if (!fonts.anton || !fonts.bri || !fonts.jet) fails.push('fonts not all loaded: ' + JSON.stringify(fonts));

await b.close();

console.log('STUDIO_HOOKS=' + JSON.stringify(hooks.wm ? { gen: hooks.gen, cam: hooks.cam, wm: true } : hooks));
console.log('WM_STRINGS=' + JSON.stringify(hooks.wm));
console.log('GEN_BYTES=' + JSON.stringify(gen));
console.log('CAM_RESET=' + resetOk);
console.log('FONTS_OFFLINE=' + JSON.stringify(fonts));
console.log(fails.length ? ('STUDIO_FAIL: ' + fails.join(' ; ')) : 'STUDIO_ALL_GREEN');

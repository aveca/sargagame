// Rend la descente « LE FILM DU MATIN » en vraie .mp4 — 100 % LOCAL, ZÉRO-IA :
// Playwright headless shoote les calques SVG image par image (déterministe, pas de
// rAF throttlé) → ffmpeg encode. Seule voie vidéo autorisée (doctrine : jamais d'IA).
//
// Usage : node scripts/design/render-descent-mp4.mjs [ratio] [fps]
//   ratio = 9x16 (défaut, social) | 16x9 (paysage)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const FILE = 'C:/Users/user/Desktop/Backup/sargagame/design/proto-ecoscene-descent.html';
const ratio = process.argv[2] || '9x16';
const FPS = +(process.argv[3] || 30);
const OUTDIR = 'C:/Users/user/Desktop/Backup/sargagame/scripts/video/out';
const TMP = path.join(process.env.TEMP || '/tmp', 'descent-frames-' + ratio);

// viewport CSS (mobile look) × dsr → pixels pairs
const V = ratio === '16x9'
  ? { w: 768, h: 432, dsr: 2.5, px: 1920, py: 1080 }
  : { w: 432, h: 768, dsr: 2.5, px: 1080, py: 1920 };

// Barème de rendu (plus serré que la présentation live → clip social ~27 s)
const N = 7, CP_A = 0.09, CP_B = 0.90;
const STOPS = [0]; for (let i = 0; i < N; i++) STOPS.push(CP_A + (i / (N - 1)) * (CP_B - CP_A)); STOPS.push(1);
const HOLD = [1600, 1700, 1600, 2000, 1800, 1600, 2600, 1800, 3600];
const MOVE = 1100;
const easeIO = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const ph = []; let t = 0;
for (let i = 0; i < STOPS.length; i++) { ph.push({ t0: t, t1: t + HOLD[i], hold: true, d: STOPS[i] }); t += HOLD[i]; if (i < STOPS.length - 1) { ph.push({ t0: t, t1: t + MOVE, hold: false, a: STOPS[i], b: STOPS[i + 1] }); t += MOVE; } }
const TOTAL = t;
const dAt = ms => { if (ms >= TOTAL) return 1; for (const p of ph) { if (ms < p.t1) { if (p.hold) return p.d; return p.a + (p.b - p.a) * easeIO((ms - p.t0) / (p.t1 - p.t0)); } } return 1; };

fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUTDIR, { recursive: true });
const frames = Math.round(TOTAL / 1000 * FPS);
console.log(`[render] ${ratio} ${V.px}×${V.py} @${FPS}fps · ${(TOTAL / 1000).toFixed(1)}s · ${frames} frames`);

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dsr });
const page = await ctx.newPage();
await page.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => { document.body.classList.add('presenting'); });
// clip = FILM : on masque les contrôles interactifs (pas du contenu). On garde la marque,
// le HUD (scrubber) et le letterbox.
await page.addStyleTag({ content: '.pctl,.langs{display:none!important}' });
await page.waitForTimeout(600); // laisse le letterbox s'ouvrir

let prevD = 0;
for (let f = 0; f < frames; f++) {
  const d = dAt(f / FPS * 1000);
  const vel = Math.max(-1, Math.min(1, (d - prevD) * FPS * 1.1)); prevD = d;
  await page.evaluate(([dd, vv]) => { window.__setDepth(dd); document.documentElement.style.setProperty('--vel', String(vv)); }, [d, vel]);
  await page.screenshot({ path: path.join(TMP, 'f' + String(f).padStart(5, '0') + '.png') });
  if (f % 60 === 0) process.stdout.write(`  ${f}/${frames}\r`);
}
await b.close();
console.log(`\n[encode] ffmpeg → mp4…`);

const out = path.join(OUTDIR, `descent-film-du-matin-${ratio}.mp4`);
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
  '-movflags', '+faststart', out], { stdio: 'ignore' });
fs.rmSync(TMP, { recursive: true, force: true });
const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log(`✓ ${out} — ${mb} Mo`);

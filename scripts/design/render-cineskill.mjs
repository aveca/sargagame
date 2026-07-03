// Rend UN cine-skill en vraie .mp4 — 100 % LOCAL, ZÉRO-IA. C'est LA réponse à Higgsfield :
// Playwright headless shoote le monde SVG image par image en pilotant window.__applyCam(skill,t)
// (déterministe) → ffmpeg encode. Illimité, 0 crédit, on-brand, on-moat.
//
// Usage : node scripts/design/render-cineskill.mjs [skill] [ratio] [fps]
//   skill = clé de window.CINE_MOVES (défaut 'descent') · liste affichée si clé inconnue
//   ratio = 9x16 (défaut, social) | 16x9 (paysage)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const FILE = url.fileURLToPath(new URL('../../design/proto-ecoscene-descent.html', import.meta.url));
const OUTDIR = url.fileURLToPath(new URL('../../scripts/video/out', import.meta.url));
const skill = process.argv[2] || 'descent';
const ratio = process.argv[3] || '9x16';
const FPS = +(process.argv[4] || 30);
const TMP = path.join(process.env.TEMP || '/tmp', 'cineskill-frames-' + skill + '-' + ratio);

const V = ratio === '16x9'
  ? { w: 768, h: 432, dsr: 2.5, px: 1920, py: 1080 }
  : { w: 432, h: 768, dsr: 2.5, px: 1080, py: 1920 };

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dsr });
const page = await ctx.newPage();
await page.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);

const moves = await page.evaluate(() => window.CINE_MOVES);
const m = moves.find(x => x.key === skill);
if (!m) { console.error('skill inconnu « ' + skill + ' ». Choix : ' + moves.map(x => x.key).join(', ')); await b.close(); process.exit(1); }

// clip = FILM : letterbox ciné, on masque toute UI interactive (garde la marque + le monde).
await page.addStyleTag({ content: '.pctl,.langs,#skills,.intro,.hud,.copy,.chrome-r{display:none!important} .lbT,.lbB{height:clamp(30px,9vh,92px)!important;transition:none!important}' });
await page.waitForTimeout(300);

// barème : preroll (pose t0) + rampe (durée du skill) + postroll (pose t1)
const PRE = 500, RAMP = m.dur, POST = 800, TOTAL = PRE + RAMP + POST;
const frames = Math.round(TOTAL / 1000 * FPS);
const tAt = ms => ms < PRE ? 0 : ms > PRE + RAMP ? 1 : (ms - PRE) / RAMP;

fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUTDIR, { recursive: true });
console.log(`[render] cine-skill « ${skill} » ${ratio} ${V.px}×${V.py} @${FPS}fps · ${(TOTAL / 1000).toFixed(1)}s · ${frames} frames`);

for (let f = 0; f < frames; f++) {
  await page.evaluate(([k, t]) => window.__applyCam(k, t), [skill, tAt(f / FPS * 1000)]);
  await page.screenshot({ path: path.join(TMP, 'f' + String(f).padStart(5, '0') + '.png') });
  if (f % 60 === 0) process.stdout.write(`  ${f}/${frames}\r`);
}
await b.close();
console.log(`\n[encode] ffmpeg → mp4…`);

const out = path.join(OUTDIR, `cineskill-${skill}-${ratio}.mp4`);
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
  '-movflags', '+faststart', out], { stdio: 'ignore' });
fs.rmSync(TMP, { recursive: true, force: true });
const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log(`✓ ${out} — ${mb} Mo`);

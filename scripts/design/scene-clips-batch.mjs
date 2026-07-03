// SCENE-CLIPS — l'automation "petites vidéos, sujets DIVERS" (1-3 s micro + 5-10 s court).
// Le SUJET = une vraie plage (buildHeroSvg de scene-svg.cjs → SVG distinct par plage : 9 archétypes,
// 4 phases, statut réel). La caméra documentaire (Ken Burns/pan/tilt/reveal) ajoute le mouvement.
// → chaque clip = un sujet différent, honnête, on-brand. ZÉRO IA, ffmpeg only. Filigrane honnête gravé.
// Idempotent, capé (--limit), filtrable ; manifest data-driven pour la galerie.
//
// Usage : node scripts/design/scene-clips-batch.mjs [--island mq,gp] [--beaches N]
//   [--phases golden,day,dawn,night] [--durations micro,short] [--ratios 9x16,16x9]
//   [--limit N] [--force] [--no-gif]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
const { buildHeroSvg, archetypeOf } = require('../lib/scene-svg.cjs');
const ROOT = url.fileURLToPath(new URL('../../', import.meta.url));
const HARNESS = path.join(ROOT, 'design', 'scene-player.html');
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'beaches-list.json'), 'utf8'));
const OUTDIR = path.join(ROOT, 'public', 'scene-atlas');
const TMPROOT = path.join(process.env.TEMP || '/tmp', 'scene-clips-frames');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const ISLANDS = arg('--island', 'mq,gp').split(',').filter(Boolean);
const NBEACH = +arg('--beaches', '0') || Infinity;
const PHASES = arg('--phases', 'golden').split(',').filter(Boolean);
const DURATIONS = arg('--durations', 'micro,short').split(',').filter(Boolean);
const RATIOS = arg('--ratios', '9x16').split(',').filter(Boolean);
const LIMIT = +arg('--limit', '0') || Infinity;
const FORCE = has('--force');
const NOGIF = has('--no-gif');

const DUR = { micro: { ms: 2500, pre: 200, post: 300 }, short: { ms: 7000, pre: 400, post: 700 } };
const MICRO_MOVES = ['kenburns_in', 'kenburns_out', 'drift_right'];
const SHORT_MOVES = ['pan_right', 'tilt_down', 'reveal', 'pan_left', 'kenburns_in'];
const DOMAIN = { mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com', florida: 'sargassummiami.com', puntacana: 'sargassumpuntacana.com', rivieramaya: 'sargassumcancun.com' };
const V = r => r === '16x9' ? { w: 800, h: 450, dsr: 2, gifw: 640 } : { w: 432, h: 768, dsr: 2, gifw: 480 };
const FPS = 30;

fs.mkdirSync(OUTDIR, { recursive: true });

// sélection qui MAXIMISE la diversité d'archétypes (round-robin par archétype) puis cap N
function pickBeaches(island) {
  const pool = BEACHES.filter(b => (b.island || b.region) === island);
  const byArch = {};
  for (const b of pool) { const a = archetypeOf(b); (byArch[a] = byArch[a] || []).push(b); }
  const buckets = Object.values(byArch).map(l => l.slice());
  const out = [];
  while (out.length < pool.length) { let progressed = false; for (const bk of buckets) { if (bk.length) { out.push(bk.shift()); progressed = true; } } if (!progressed) break; }
  return out;
}

let plan = [];
for (const island of ISLANDS) {
  const beaches = pickBeaches(island).slice(0, NBEACH);
  for (const beach of beaches) for (const phase of PHASES) for (const duration of DURATIONS) for (const ratio of RATIOS)
    plan.push({ beach, island, phase, duration, ratio });
}

const easeIO = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const manifestPath = path.join(OUTDIR, 'manifest.json');
let manifest = []; try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { }
const keyOf = (id, ph, du, ra) => `${id}-${ph}-${du}-${ra}`;
const seen = new Set(manifest.map(e => keyOf(e.id, e.phase, e.duration, e.ratio)));

const moveFor = (job, idx) => (job.duration === 'micro' ? MICRO_MOVES : SHORT_MOVES)[idx % (job.duration === 'micro' ? MICRO_MOVES.length : SHORT_MOVES.length)];
const entryOf = (job, base, move) => ({
  id: job.beach.id, name: job.beach.name, commune: job.beach.commune || null, island: job.island,
  archetype: archetypeOf(job.beach), phase: job.phase, status: job.beach.status || 'clean',
  duration: job.duration, sec: Math.round((DUR[job.duration].ms + DUR[job.duration].pre + DUR[job.duration].post) / 100) / 10,
  ratio: job.ratio, move, mp4: base + '.mp4', gif: NOGIF ? null : base + '.gif', poster: base + '.png',
  domain: DOMAIN[job.island] || null,
});

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
let made = 0, skipped = 0, failed = 0;
console.log(`[scene-clips] plan=${plan.length} · islands=${ISLANDS} · phases=${PHASES} · durations=${DURATIONS} · ratios=${RATIOS} · limit=${LIMIT === Infinity ? '∞' : LIMIT}`);

// groupé par ratio (une page/viewport par ratio ; on swap la scène par clip → rapide)
for (const ratio of RATIOS) {
  const jobs = plan.filter(j => j.ratio === ratio);
  if (!jobs.length) continue;
  const v = V(ratio);
  const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dsr });
  const page = await ctx.newPage();
  await page.goto(url.pathToFileURL(HARNESS).href, { waitUntil: 'load' });
  // letterbox + filigrane honnête (DOM, pas innerHTML) — mis en place une fois par ratio
  await page.evaluate(() => {
    document.querySelectorAll('.lb').forEach(l => { l.style.height = 'clamp(26px,8vh,84px)'; });
    const w = document.createElement('div'); w.id = 'wm';
    w.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 16px calc(env(safe-area-inset-bottom,0px) + 14px);pointer-events:none;font-family:system-ui,sans-serif';
    const t1 = document.createElement('div'); t1.id = 'wm1'; t1.textContent = 'LE VEILLEUR';
    t1.style.cssText = 'font:800 clamp(14px,4.4vw,21px)/1 Impact,Haettenschweiler,system-ui,sans-serif;letter-spacing:.03em;color:#FFE47A;text-shadow:0 2px 10px rgba(0,0,0,.75)';
    const t2 = document.createElement('div'); t2.id = 'wm2';
    t2.style.cssText = 'font:700 clamp(9px,2.7vw,12px)/1.3 system-ui;color:rgba(255,255,255,.9);margin-top:4px;text-shadow:0 1px 6px rgba(0,0,0,.85)';
    w.appendChild(t1); w.appendChild(t2); document.body.appendChild(w);
  });
  const WM = await page.evaluate(() => window.__STUDIO_WM.fr);

  let idx = 0;
  for (const job of jobs) {
    if (made >= LIMIT) break;
    idx++;
    const base = keyOf(job.beach.id, job.phase, job.duration, job.ratio);
    const mp4 = path.join(OUTDIR, base + '.mp4');
    const move = moveFor(job, idx);
    if (!FORCE && fs.existsSync(mp4)) { if (!seen.has(base)) { manifest.push(entryOf(job, base, move)); seen.add(base); } skipped++; continue; }

    const svg = buildHeroSvg(job.beach, {}, {}, { phase: job.phase });
    const ok = await page.evaluate((s) => window.__setScene(s), svg);
    if (!ok) { console.log(`  ✗ ${base} (SVG invalide)`); failed++; continue; }
    await page.evaluate(([wm, dom]) => { document.getElementById('wm2').textContent = wm + ' · ' + dom; }, [WM, DOMAIN[job.island] || 'sargasses.com']);

    const d = DUR[job.duration], TOTAL = d.pre + d.ms + d.post, frames = Math.round(TOTAL / 1000 * FPS);
    const TMP = path.join(TMPROOT, base); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
    for (let f = 0; f < frames; f++) {
      const ms = f / FPS * 1000, t = ms < d.pre ? 0 : ms > d.pre + d.ms ? 1 : easeIO((ms - d.pre) / d.ms);
      await page.evaluate(([m, tt]) => window.__applyCam(m, tt), [move, t]);
      await page.screenshot({ path: path.join(TMP, 'f' + String(f).padStart(5, '0') + '.png') });
    }
    fs.copyFileSync(path.join(TMP, 'f' + String(Math.round(frames * 0.5)).padStart(5, '0') + '.png'), path.join(OUTDIR, base + '.png'));
    execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
    if (!NOGIF) {
      const pal = path.join(TMP, 'pal.png');
      execFileSync('ffmpeg', ['-y', '-i', path.join(TMP, 'f%05d.png'), '-vf', `fps=12,scale=${v.gifw}:-1:flags=lanczos,palettegen=stats_mode=diff`, pal], { stdio: 'ignore' });
      execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'), '-i', pal, '-lavfi', `fps=12,scale=${v.gifw}:-1:flags=lanczos,paletteuse=dither=bayer:bayer_scale=3`, path.join(OUTDIR, base + '.gif')], { stdio: 'ignore' });
    }
    fs.rmSync(TMP, { recursive: true, force: true });

    if (!seen.has(base)) { manifest.push(entryOf(job, base, move)); seen.add(base); }
    else { const i = manifest.findIndex(e => keyOf(e.id, e.phase, e.duration, e.ratio) === base); if (i > -1) manifest[i] = entryOf(job, base, move); }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    made++;
    process.stdout.write(`  ✓ ${base}  [${entryOf(job, base, move).archetype} · ${move}]  (${made} made / ${skipped} skip / ${failed} fail)\n`);
  }
  await ctx.close();
}
await b.close();
fs.rmSync(TMPROOT, { recursive: true, force: true });
manifest.sort((a, c) => (a.island + a.id + a.duration).localeCompare(c.island + c.id + c.duration));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[scene-clips] DONE — made ${made}, skipped ${skipped}, failed ${failed}, manifest=${manifest.length} → public/scene-atlas/manifest.json`);

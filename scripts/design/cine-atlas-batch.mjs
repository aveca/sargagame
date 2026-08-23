// CINÉ-ATLAS — l'usine à clips zéro-IA qui SCALE (la réponse "100 vidéos comme eux").
// Enumère skill × ratio × région → shoote les frames UNE fois (Playwright headless pilote
// window.__applyCam), puis ffmpeg encode mp4 + gif + poster depuis les MÊMES frames.
// 100 % LOCAL/CI, ZÉRO IA, ZÉRO crédit. Filigrane HONNÊTE gravé (aucun chiffre/date/mot temporel).
// Idempotent (skip si le mp4 existe), capé (--limit), filtrable. Emet un manifest data-driven que
// la galerie consomme → un nouveau clip = un changement de DATA, pas de code.
//
// Usage : node scripts/design/cine-atlas-batch.mjs [--ratios 9x16,16x9] [--regions mq,gp,...]
//                [--skills push_in,orbit] [--limit N] [--force] [--no-gif]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const FILE = url.fileURLToPath(new URL('../../design/proto-ecoscene-descent.html', import.meta.url));
const OUTDIR = url.fileURLToPath(new URL('../../public/cine-atlas', import.meta.url));
const TMPROOT = path.join(process.env.TEMP || '/tmp', 'cine-atlas-frames');

// ---- args ----
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const RATIOS = arg('--ratios', '9x16,16x9').split(',').filter(Boolean);
const REGIONS = arg('--regions', 'mq').split(',').filter(Boolean);
const SKILLFILTER = arg('--skills', '').split(',').filter(Boolean);
const LIMIT = +arg('--limit', '0') || Infinity;
const FORCE = has('--force');
const NOGIF = has('--no-gif');
const FPS = 30;

const REGION_DOMAIN = {
  mq: 'sargasses-martinique.com', gp: 'sargasses-guadeloupe.com',
  florida: 'sargassummiami.com', puntacana: 'sargassumpuntacana.com',
  rivieramaya: 'sargassumcancun.com', barbados: 'sargasses-caraibes.com',
};
const V = r => r === '16x9'
  ? { w: 768, h: 432, dsr: 2, gifw: 640 }
  : { w: 432, h: 768, dsr: 2, gifw: 480 };

fs.mkdirSync(OUTDIR, { recursive: true });

const b = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });

// lit le catalogue de skills + le filigrane honnête DEPUIS la page (source unique)
const boot = await b.newContext({ viewport: { width: 400, height: 800 }, forcedColors: 'none', colorScheme: 'dark' });
const bp = await boot.newPage();
await bp.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
const MOVES = await bp.evaluate(() => window.CINE_MOVES);
const WM = await bp.evaluate(() => window.__STUDIO_WM);
await boot.close();

let skills = MOVES.map(m => m.key);
if (SKILLFILTER.length) skills = skills.filter(k => SKILLFILTER.includes(k));

// plan = région × ratio × skill (jusqu'à 6×2×12 = 144 → dépasse 100)
const plan = [];
for (const region of REGIONS) for (const ratio of RATIOS) for (const skill of skills) plan.push({ region, ratio, skill });

const easeIO = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const manifestPath = path.join(OUTDIR, 'manifest.json');
let manifest = [];
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { }
const mkey = e => `${e.skill}-${e.ratio}-${e.region}`;
const seen = new Set(manifest.map(mkey));

const entry = (job, base) => {
  const m = MOVES.find(x => x.key === job.skill);
  const sec = Math.round((500 + Math.max(m.dur, 5000) + 800) / 100) / 10;
  return {
    skill: job.skill, ratio: job.ratio, region: job.region, sec, hf: m.hf,
    labels: { fr: m.fr, en: m.en, es: m.es },
    mp4: base + '.mp4', gif: NOGIF ? null : base + '.gif', poster: base + '.png',
    domain: REGION_DOMAIN[job.region] || null,
  };
};

let made = 0, skipped = 0;
console.log(`[cine-atlas] plan=${plan.length} clips · ratios=${RATIOS} · regions=${REGIONS} · skills=${skills.length} · limit=${LIMIT === Infinity ? '∞' : LIMIT}`);

for (const job of plan) {
  if (made >= LIMIT) break;
  const base = mkey(job);
  const mp4 = path.join(OUTDIR, base + '.mp4');
  if (!FORCE && fs.existsSync(mp4)) { if (!seen.has(base)) { manifest.push(entry(job, base)); seen.add(base); } skipped++; continue; }

  const m = MOVES.find(x => x.key === job.skill);
  const v = V(job.ratio);
  const PRE = 500, RAMP = Math.max(m.dur, 5000), POST = 800, TOTAL = PRE + RAMP + POST; // ≥5 s garanti
  const frames = Math.round(TOTAL / 1000 * FPS);
  const TMP = path.join(TMPROOT, base); fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });

  const ctx = await b.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dsr });
  const page = await ctx.newPage();
  await page.goto(url.pathToFileURL(FILE).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.pctl,.langs,#skills,.intro,.hud,.copy,.chrome-r,.skbtn{display:none!important} .lbT,.lbB{height:clamp(30px,9vh,92px)!important;transition:none!important}' });
  // filigrane HONNÊTE gravé (DOM, pas innerHTML) — 0 chiffre / 0 date / 0 mot temporel (garde-fou moat)
  await page.evaluate(({ line, dom }) => {
    document.body.classList.add('presenting');
    const w = document.createElement('div');
    w.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:60;padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 16px);pointer-events:none;font-family:"Bricolage Grotesque",system-ui,sans-serif';
    const t1 = document.createElement('div');
    t1.style.cssText = 'font:800 clamp(15px,4.5vw,22px)/1 "Anton",sans-serif;letter-spacing:.02em;color:#FFE47A;text-shadow:0 2px 10px rgba(0,0,0,.7)';
    t1.textContent = 'LE VEILLEUR';
    const t2 = document.createElement('div');
    t2.style.cssText = 'font:700 clamp(9px,2.7vw,12px)/1.3 system-ui;color:rgba(255,255,255,.9);margin-top:4px;text-shadow:0 1px 6px rgba(0,0,0,.8)';
    t2.textContent = line + ' · ' + dom;
    w.appendChild(t1); w.appendChild(t2);
    document.body.appendChild(w);
  }, { line: WM.fr, dom: REGION_DOMAIN[job.region] || 'sargasses.com' });
  await page.waitForTimeout(350);

  for (let f = 0; f < frames; f++) {
    const ms = f / FPS * 1000;
    const t = ms < PRE ? 0 : ms > PRE + RAMP ? 1 : easeIO((ms - PRE) / RAMP);
    await page.evaluate(([k, tt]) => window.__applyCam(k, tt), [job.skill, t]);
    await page.screenshot({ path: path.join(TMP, 'f' + String(f).padStart(5, '0') + '.png') });
  }
  await ctx.close();

  // poster = frame ~mi-parcours ; mp4 + gif depuis les MÊMES frames (shoot-once)
  fs.copyFileSync(path.join(TMP, 'f' + String(Math.round(frames * 0.42)).padStart(5, '0') + '.png'), path.join(OUTDIR, base + '.png'));
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'medium', '-movflags', '+faststart', mp4], { stdio: 'ignore' });
  if (!NOGIF) {
    const pal = path.join(TMP, 'pal.png');
    execFileSync('ffmpeg', ['-y', '-i', path.join(TMP, 'f%05d.png'), '-vf', `fps=12,scale=${v.gifw}:-1:flags=lanczos,palettegen=stats_mode=diff`, pal], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.png'), '-i', pal,
      '-lavfi', `fps=12,scale=${v.gifw}:-1:flags=lanczos,paletteuse=dither=bayer:bayer_scale=3`, path.join(OUTDIR, base + '.gif')], { stdio: 'ignore' });
  }
  fs.rmSync(TMP, { recursive: true, force: true });

  if (!seen.has(base)) { manifest.push(entry(job, base)); seen.add(base); }
  else { const i = manifest.findIndex(e => mkey(e) === base); if (i > -1) manifest[i] = entry(job, base); }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  made++;
  process.stdout.write(`  ✓ ${base}  (${made} made / ${skipped} skipped)\n`);
}
await b.close();
fs.rmSync(TMPROOT, { recursive: true, force: true });

manifest.sort((a, c) => (a.region + a.ratio + a.skill).localeCompare(c.region + c.ratio + c.skill));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[cine-atlas] DONE — made ${made}, skipped ${skipped}, manifest=${manifest.length} entries → public/cine-atlas/manifest.json`);

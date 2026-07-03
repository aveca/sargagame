// RENDER-FILM-3MIN — le clip cinématique ~3 min "Le Veilleur", 100 % SVG-motion, ZÉRO IA, ZÉRO crédit.
// Verdict panel adverse 2026-07-03 (7-1 SVG_CINEMATIC) : on livre le film DEMANDÉ (caméra drone,
// personnages, scènes, storytelling, musique) sans jamais fabriquer un faux réel — un rendu photo-
// réaliste d'une plage nommée se lit comme une observation satellite = fabrication = tue le moat.
// Sujets = vraies plages via buildHeroSvg (9 archétypes, statut/phase). Caméra = window.__applyCam
// (dolly/pan/tilt/reveal). Transitions = xfade ffmpeg 0.4 s (jamais cut sec). Musique = bed ambiant
// 100 % synthétisé ffmpeg (anoisesrc + nappe sinus), légal, gratuit, offline. Filigrane honnête gravé.
//
// GARDE-FOUS MOAT (non négociables, vérifiés par verify-film-3min.mjs) :
//   - lv = {} passé à buildHeroSvg → AUCUN chiffre/score live gravé dans une scène (ambiance seule).
//   - ZÉRO import IA/GPU (Higgsfield/depthflow/generate_*) — SVG + ffmpeg only.
//   - filigrane "ILLUSTRATION — le verdict réel vit sur la page" gravé en permanence.
//   - les seuls chiffres autorisés vivent dans les CARTONS (offre/prix) — jamais dans la scène.
//   - Le Veilleur regarde la MER, jamais le spectateur (propriété de buildHeroSvg).
//
// Usage : node scripts/design/render-film-3min.mjs [--ratio 9x16|16x9] [--scale 1] [--fps 24]
//   [--beats N] [--out public/films/veilleur-3min-9x16.mp4] [--no-audio]
//   --scale <f> : multiplie toutes les durées de plan (0.15 = smoke rapide ; 1 = master 3 min).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const FFSTDIO = process.env.FFDEBUG ? 'inherit' : 'ignore';
const require = createRequire(import.meta.url);
const { buildHeroSvg, archetypeOf } = require('../lib/scene-svg.cjs');
const ROOT = url.fileURLToPath(new URL('../../', import.meta.url));
const HARNESS = path.join(ROOT, 'design', 'scene-player.html');
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'beaches-list.json'), 'utf8'));

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = k => process.argv.includes(k);
const RATIO = arg('--ratio', '9x16');
const SCALE = +arg('--scale', '1') || 1;
const FPS = +arg('--fps', '24') || 24;
const NBEATS = +arg('--beats', '0') || Infinity;
const NOAUDIO = has('--no-audio');
const OUT = path.resolve(ROOT, arg('--out', `public/films/veilleur-3min-${RATIO}.mp4`));
const V = RATIO === '16x9' ? { w: 800, h: 450, dsr: 2 } : { w: 432, h: 768, dsr: 2 };
const XFADE = 0.4; // s — jamais un cut sec (anti-diaporama)

// ── Résolution des sujets : vraie plage par nom (île mq), repli archétype, repli 1re plage. ──
const MQ = BEACHES.filter(b => (b.island || b.region) === 'mq');
const pick = (nameHint, arch) => {
  if (nameHint) { const m = MQ.find(b => (b.name || '').toLowerCase().includes(nameHint.toLowerCase())); if (m) return m; }
  if (arch) { const m = MQ.find(b => archetypeOf(b) === arch); if (m) return m; }
  return MQ[0];
};

// ── STORYBOARD = colonne vertébrale 6 temps (design/STORY/04) → ~180 s à scale=1. ──
// carton : texte gravé dans la couche TITRE (autorisée) ; JAMAIS dans la scène. move : caméra.
const STORY = [
  { beach: pick('Salines', 'OPEN_SHORE'), phase: 'golden', move: 'kenburns_in', ms: 8000, title: 'LE VEILLEUR', sub: 'un film — mesuré au satellite, pas deviné' },
  { beach: pick('Salines', 'OPEN_SHORE'), phase: 'golden', move: 'kenburns_in', ms: 26000, cap: 'Tu regardes Les Salines.\nDemain soir, le vent tourne.' },
  { beach: pick('Anse Mitan', 'SHELTERED_BAY'), phase: 'dawn', move: 'tilt_down', ms: 28000, cap: 'Chaque matin, Le Veilleur regarde la mer pour toi.' },
  { beach: pick('Diamant', 'ICONIC_ROCK'), phase: 'golden', move: 'reveal', ms: 28000, cap: 'Le verdict du matin, gratuit — et les trois criques propres les plus proches.' },
  { beach: pick('Caravelle', 'CLIFF_HEADLAND'), phase: 'day', move: 'pan_right', ms: 24000, cap: 'Personne n’aime découvrir les algues une fois la serviette posée.' },
  { beach: pick('Anse Noire', 'VOLCANIC_BLACK'), phase: 'golden', move: 'reveal', ms: 24000, cap: 'Deviens le copain qui ne se trompe jamais de crique.' },
  { beach: pick('Grande Anse', 'OPEN_SHORE'), phase: 'golden', move: 'pan_left', ms: 24000, title: 'MESURÉ AU SATELLITE,\nPAS DEVINÉ', sub: 'on se trompe parfois — on l’écrit, sur /fiabilite/' },
  { beach: pick('Salines', 'OPEN_SHORE'), phase: 'golden', move: 'kenburns_out', ms: 10000, title: 'PASS — PAIEMENT UNIQUE', sub: 'dès 7,99 € · il regarde la mer, jamais vos clients' },
].slice(0, NBEATS);

const easeIO = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const PRE = 300, POST = 500; // hold début/fin (ms) pour respirer avant/après le mouvement

const TMP = path.join(process.env.TEMP || '/tmp', 'veilleur-film', RATIO);
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

console.log(`[film] ratio=${RATIO} ${V.w}x${V.h}@${V.dsr}x · fps=${FPS} · scale=${SCALE} · beats=${STORY.length} · out=${path.relative(ROOT, OUT)}`);

const browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
const ctx = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'no-preference', forcedColors: 'none', viewport: { width: V.w, height: V.h }, deviceScaleFactor: V.dsr });
const page = await ctx.newPage();
await page.goto(url.pathToFileURL(HARNESS).href, { waitUntil: 'load' });

// letterbox cinéma + filigrane honnête + couches carton/sous-titre (DOM createElement, jamais innerHTML)
await page.evaluate(() => {
  document.querySelectorAll('.lb').forEach(l => { l.style.height = 'clamp(30px,9vh,96px)'; });
  const mk = (parent, tag, css, id) => { const e = document.createElement(tag); if (id) e.id = id; if (css) e.style.cssText = css; parent.appendChild(e); return e; };
  // filigrane honnête (bas gauche)
  const wm = mk(document.body, 'div', 'position:fixed;left:0;right:0;bottom:0;z-index:60;padding:14px 18px calc(env(safe-area-inset-bottom,0px) + 16px);pointer-events:none;font-family:system-ui,sans-serif;text-align:left');
  const w1 = mk(wm, 'div', 'font:800 clamp(15px,4.6vw,22px)/1 Anton,Impact,Haettenschweiler,system-ui,sans-serif;letter-spacing:.03em;color:#FFE47A;text-shadow:0 2px 10px rgba(0,0,0,.8)');
  w1.textContent = 'LE VEILLEUR';
  mk(wm, 'div', 'font:700 clamp(9px,2.7vw,12px)/1.3 system-ui;color:rgba(255,255,255,.9);margin-top:4px;text-shadow:0 1px 6px rgba(0,0,0,.85)', 'wm2');
  // sous-titre / carton (lower third, au-dessus du filigrane)
  const cap = mk(document.body, 'div', 'position:fixed;left:0;right:0;bottom:14%;z-index:55;padding:0 8%;text-align:center;pointer-events:none;opacity:0;transition:opacity .5s ease', 'cap');
  mk(cap, 'div', "display:inline-block;font:700 clamp(17px,5.4vw,30px)/1.28 'Bricolage Grotesque',system-ui,sans-serif;color:#FFF;background:rgba(10,10,12,.34);padding:.5em .8em;border-radius:12px;text-shadow:0 2px 14px rgba(0,0,0,.9);white-space:pre-line", 'capt');
  // carte-titre (centre)
  const ti = mk(document.body, 'div', 'position:fixed;inset:0;z-index:56;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none;opacity:0;transition:opacity .6s ease', 'title');
  mk(ti, 'div', "font:800 clamp(30px,10vw,76px)/1.02 Anton,Impact,Haettenschweiler,'Arial Narrow',system-ui,sans-serif;letter-spacing:.01em;color:#FFC72C;text-shadow:0 4px 24px rgba(0,0,0,.85);white-space:pre-line", 'titt');
  mk(ti, 'div', "margin-top:.7em;font:700 clamp(12px,3.4vw,20px)/1.35 'Bricolage Grotesque',system-ui,sans-serif;color:rgba(255,255,255,.94);text-shadow:0 2px 12px rgba(0,0,0,.9);white-space:pre-line", 'tits');
});
const WM = await page.evaluate(() => window.__STUDIO_WM.fr);
await page.evaluate(w => { document.getElementById('wm2').textContent = w + ' · sargasses-martinique.com'; }, WM);

// ── rendu plan par plan → segment mp4 ──
const segs = [];
let heroPoster = null;
for (let i = 0; i < STORY.length; i++) {
  const s = STORY[i];
  const ms = Math.max(1200, Math.round(s.ms * SCALE));
  const svg = buildHeroSvg(s.beach, {}, {}, { phase: s.phase }); // lv={} → zéro chiffre dans la scène
  const ok = await page.evaluate(v => window.__setScene(v), svg);
  if (!ok) { console.log(`  ✗ beat ${i} (${s.beach && s.beach.name}) SVG invalide`); continue; }
  // couches texte du plan (textContent only)
  await page.evaluate(([cap, title, sub]) => {
    document.getElementById('capt').textContent = cap || '';
    document.getElementById('cap').style.opacity = cap ? '1' : '0';
    document.getElementById('titt').textContent = title || '';
    document.getElementById('tits').textContent = sub || '';
    document.getElementById('title').style.opacity = title ? '1' : '0';
  }, [s.cap || '', s.title || '', s.sub || '']);

  const TOTAL = PRE + ms + POST, frames = Math.round(TOTAL / 1000 * FPS);
  const segDir = path.join(TMP, 'b' + i); fs.mkdirSync(segDir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const t0 = f / FPS * 1000;
    const t = t0 < PRE ? 0 : t0 > PRE + ms ? 1 : easeIO((t0 - PRE) / ms);
    await page.evaluate(([m, tt]) => window.__applyCam(m, tt), [s.move, t]);
    await page.screenshot({ path: path.join(segDir, 'f' + String(f).padStart(5, '0') + '.png') });
  }
  // poster = mi-plan d'un plan de scène (sans carton), pour prefers-reduced-motion
  if (!heroPoster && s.cap && !s.title) heroPoster = path.join(segDir, 'f' + String(Math.round(frames * 0.5)).padStart(5, '0') + '.png');

  const seg = path.join(TMP, `seg${i}.mp4`);
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(segDir, 'f%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'veryfast', '-r', String(FPS), seg], { stdio: FFSTDIO });
  segs.push({ seg, dur: TOTAL / 1000 });
  process.stdout.write(`  ✓ beat ${i}  ${s.beach.name} · ${s.move} · ${(TOTAL / 1000).toFixed(1)}s (${frames}f)\n`);
}
await ctx.close();
await browser.close();

if (!segs.length) { console.error('[film] AUCUN segment rendu'); process.exit(1); }

// poster PNG (reduced-motion) à côté du mp4
if (heroPoster && fs.existsSync(heroPoster)) fs.copyFileSync(heroPoster, OUT.replace(/\.mp4$/, '.poster.png'));

// ── concat xfade 0.4 s (jamais un cut sec) ──
const filmNoAudio = path.join(TMP, 'film_noaudio.mp4');
if (segs.length === 1) {
  fs.copyFileSync(segs[0].seg, filmNoAudio);
} else {
  const inputs = segs.flatMap(s => ['-i', s.seg]);
  let chain = '', prev = '[0:v]', cum = segs[0].dur;
  for (let i = 1; i < segs.length; i++) {
    const out = i === segs.length - 1 ? '[v]' : `[v${i}]`;
    const offset = (cum - XFADE).toFixed(3);
    chain += `${prev}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset}${out};`;
    prev = out; cum += segs[i].dur - XFADE;
  }
  execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', chain.replace(/;$/, ''),
    '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', filmNoAudio], { stdio: FFSTDIO });
}
const totalDur = segs.reduce((a, s) => a + s.dur, 0) - XFADE * (segs.length - 1);

// ── bed audio ambiant 100 % synthétisé (anoisesrc "air marin" + nappe sinus La mineur), légal/offline ──
if (NOAUDIO) {
  fs.copyFileSync(filmNoAudio, OUT);
} else {
  const D = totalDur.toFixed(2);
  const fin = Math.min(4, totalDur * 0.15).toFixed(2);          // fondu d'entrée adaptatif
  const fout = Math.min(5, totalDur * 0.2);                     // fondu de sortie adaptatif
  const stout = Math.max(0.05, totalDur - fout).toFixed(2);     // départ du fondu de sortie (jamais négatif)
  const bed = path.join(TMP, 'bed.wav');
  execFileSync('ffmpeg', ['-y',
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.05:duration=${D}`,
    '-f', 'lavfi', '-i', `sine=frequency=110:duration=${D}`,
    '-f', 'lavfi', '-i', `sine=frequency=164.81:duration=${D}`,
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${D}`,
    '-filter_complex',
    '[0]lowpass=f=680,volume=0.9[air];[1]volume=0.06[a];[2]volume=0.045[b];[3]volume=0.035[c];' +
    '[air][a][b][c]amix=inputs=4:normalize=0,tremolo=f=0.12:d=0.5,aecho=0.8:0.7:420|900:0.32|0.18,' +
    `lowpass=f=1600,afade=t=in:st=0:d=${fin},afade=t=out:st=${stout}:d=${fout.toFixed(2)},loudnorm=I=-18:TP=-1.5[out]`,
    '-map', '[out]', '-c:a', 'pcm_s16le', bed], { stdio: FFSTDIO });
  execFileSync('ffmpeg', ['-y', '-i', filmNoAudio, '-i', bed, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], { stdio: FFSTDIO });
}

fs.rmSync(TMP, { recursive: true, force: true });
const mb = (fs.statSync(OUT).size / 1e6).toFixed(1);
console.log(`[film] DONE — ${path.relative(ROOT, OUT)} · ${totalDur.toFixed(1)}s · ${mb} Mo · ${segs.length} plans`);
console.log(`[film] poster: ${path.relative(ROOT, OUT.replace(/\.mp4$/, '.poster.png'))}`);

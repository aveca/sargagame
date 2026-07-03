// VERIFY-FILM-3MIN — le GATE moat du film "Le Veilleur" (exigé par le refuter du panel 2026-07-03).
// Ne fait confiance à AUCUN storyboard : il RE-RENDER les scènes et GREP la sortie réelle.
// Sort non-zéro à la moindre violation → gate CI/cron. Pur (fs only, zéro subprocess).
//
// Vérifie :
//   1. buildHeroSvg (notre usage lv={}) ne PEINT jamais de chiffre ni de mot temporel dans une SCÈNE
//      (aucun <text>/<tspan> avec [0-9] ou live/today/aujourd'hui/demain/…) — 9 archétypes × 4 phases.
//   2. render-film-3min.mjs : ZÉRO import IA/GPU (higgsfield/depthflow/comfy/ltx/wan/generate_/musicgen) ;
//      filigrane honnête référencé (__STUDIO_WM/ILLUSTRATION) ; buildHeroSvg appelé avec lv={} (jamais un score).
//   3. Cartons/titres du storyboard : aucun mot banni (03-MOTIF-KIT) ; tout % de fiabilité doit être hedgé.
//   4. (option) --poster <png> : présence du poster reduced-motion. (Durée = vérifiée par ffprobe en Bash,
//      hors script — un chemin utilisateur dans un subprocess fait sur-réagir le garde-fou sécurité.)
//
// Usage : node scripts/design/verify-film-3min.mjs [--poster public/films/veilleur-3min-9x16.poster.png]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const require = createRequire(import.meta.url);
const { buildHeroSvg, archetypeOf } = require('../lib/scene-svg.cjs');
const ROOT = url.fileURLToPath(new URL('../../', import.meta.url));
const BEACHES = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'beaches-list.json'), 'utf8'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const fails = [];
const TEMPORAL = /(en\s*direct|\blive\b|\btoday\b|\bnow\b|aujourd|\bhier\b|\bdemain\b|maintenant|ce\s*matin|ce\s*soir)/i;
const textNodes = svg => {
  const out = [];
  const re = /<(?:text|tspan)\b[^>]*>([\s\S]*?)<\/(?:text|tspan)>/gi;
  let m; while ((m = re.exec(svg))) { const t = m[1].replace(/<[^>]*>/g, '').trim(); if (t) out.push(t); }
  return out;
};

// ── 1. Invariant scène : aucun chiffre/mot temporel gravé (9 archétypes × 4 phases, lv={}) ──
const byArch = {};
for (const b of BEACHES) { const a = archetypeOf(b); if (!byArch[a]) byArch[a] = b; }
const PHASES = ['golden', 'dawn', 'day', 'night'];
let sceneChecks = 0;
for (const [arch, beach] of Object.entries(byArch)) {
  for (const phase of PHASES) {
    let svg; try { svg = buildHeroSvg(beach, {}, {}, { phase }); } catch (e) { fails.push(`buildHeroSvg a jeté (${arch}/${phase}): ${e.message}`); continue; }
    sceneChecks++;
    for (const t of textNodes(svg)) {
      if (/[0-9]/.test(t)) fails.push(`CHIFFRE gravé dans la scène ${arch}/${phase}: "${t.slice(0, 60)}"`);
      if (TEMPORAL.test(t)) fails.push(`MOT TEMPOREL gravé dans la scène ${arch}/${phase}: "${t.slice(0, 60)}"`);
    }
  }
}

// ── 2 & 3. Garde-fous SOURCE de render-film-3min.mjs ──
const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'design', 'render-film-3min.mjs'), 'utf8');
// on IGNORE les commentaires (le garde-fou lui-même NOMME ces termes pour se documenter) :
// seul le CODE est scanné → un import/require/appel IA réel est attrapé, une mention en prose non.
const CODE = SRC.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const AI = /(higgsfield|depthflow|comfy|\bltx\b|\bwan\b|generate_(image|video|speech|motion)|stable-?audio|musicgen)/i;
const aiHit = CODE.match(AI);
if (aiHit) fails.push(`RÉF IA/GPU détectée dans le CODE de render-film-3min.mjs (interdit): ${aiHit[0]}`);
if (!/__STUDIO_WM|ILLUSTRATION/.test(SRC)) fails.push('Filigrane honnête (__STUDIO_WM/ILLUSTRATION) absent de render-film-3min.mjs');
if (!/buildHeroSvg\(\s*[a-zA-Z0-9_.]+\s*,\s*\{\}\s*,/.test(SRC)) fails.push('buildHeroSvg n\'est PAS appelé avec lv={} — un score pourrait entrer dans la scène');

// cartons/titres : mots bannis + % non hedgé (on scanne les chaînes cap/title/sub du storyboard)
const BANNED = [/essai\s+gratuit/i, /sans\s+carte/i, /100\s*%\s*pr[ée]cis/i, /surveillance/i, /pr[ée]visions?\s+parfaites?/i];
const capStrings = [...SRC.matchAll(/(?:cap|title|sub):\s*'([^']*)'/g)].map(m => m[1]);
for (const c of capStrings) {
  for (const b of BANNED) if (b.test(c)) fails.push(`MOT BANNI dans un carton: "${c.slice(0, 50)}"`);
  const pct = c.match(/(\d{2,3})\s*%/);
  if (pct && !/(saison|r[ée]gimes?|fiabilit|comparais|\/fiabilite)/i.test(c)) fails.push(`% de fiabilité NON hedgé dans un carton: "${c.slice(0, 50)}"`);
}

// ── 4. (option) poster reduced-motion présent ──
const posterArg = arg('--poster', '');
if (posterArg) {
  const poster = path.resolve(ROOT, posterArg);
  if (!fs.existsSync(poster)) fails.push(`poster reduced-motion absent: ${posterArg}`);
  else console.log(`[verify-film] poster reduced-motion: OK (${path.basename(poster)})`);
}

console.log(`[verify-film] scènes vérifiées: ${sceneChecks} (9 archétypes × 4 phases) · cartons scannés: ${capStrings.length}`);
if (fails.length) {
  console.error(`\n✗ FILM_MOAT_FAIL — ${fails.length} violation(s):`);
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('\n✓ FILM_MOAT_ALL_GREEN — scène sans chiffre/date, zéro import IA, filigrane présent, cartons propres.');

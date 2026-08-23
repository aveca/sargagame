#!/usr/bin/env node
/**
 * Génère 100 "clips" statiques (design/scale-clips/scale-NNN.html) — la descente
 * d'ÉCHELLE D'OBSERVATION (pas le funnel marché de gen-floor-clips.cjs) : du satellite
 * jusqu'aux roches, en passant par les moyens de transport qui amènent quelqu'un
 * jusqu'à la plage. 10 sous-paliers par vantage, altitude/profondeur interpolée.
 *
 * Narration = même moat que design/proto-ecoscene-descent.html (orbite→abysse,
 * "on mesure, on n'invente pas" ; palette STOPS reprise à l'identique de ce proto).
 * Les 10 vantages sont un remplacement plus concret des 7 strates du proto (le
 * "SURFACE" unique y devient 5 approches — bateau/voiture/moto/vélo/piéton — pour
 * coller à un vrai trajet visiteur ; "pleine eau" est retirée au profit de cette
 * granularité de surface).
 *
 * Bibliothèque design, HORS FUNNEL, pas déployée, pas importée par l'app.
 * `node scripts/design/gen-scale-clips.cjs` régénère tout.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', 'design', 'scale-clips');
const SUBFLOORS_PER_TIER = 10;

// ---- source unique : 10 vantages, altitude(+)/profondeur(−) en mètres, purement
// illustratif (pas une donnée mesurée — seule sargassum.json fait foi pour le verdict).
const TIERS = [
  { name: 'SATELLITE', value: 700000, label: '700 km', eyebrow: 'D’ici-haut',
    line: 'Un œil calme au-dessus de l’Atlantique. Il mesure, il n’invente pas.' },
  { name: 'AVION', value: 10000, label: '10 000 m', eyebrow: 'Vue de hublot',
    line: 'Le contour des courants se devine déjà, à l’œil nu.' },
  { name: 'BATEAU', value: 3, label: 'surface', eyebrow: 'La ligne d’horizon',
    line: 'La houle sous la coque — la première vraie texture de la mer du jour.' },
  { name: 'VOITURE', value: 0, label: 'surface', eyebrow: 'La route du littoral',
    line: 'Une plage, puis une autre. Chacune a sa propre histoire aujourd’hui.' },
  { name: 'MOTO', value: 0, label: 'surface', eyebrow: 'Sans vitre entre vous et l’air',
    line: 'L’odeur du sel arrive avant même de voir l’eau.' },
  { name: 'VÉLO', value: 0, label: 'surface', eyebrow: 'Au rythme du sable',
    line: 'Le vent qui tourne, on le sent dans les mollets avant de le voir sur la carte.' },
  { name: 'PIÉTON', value: 0, label: 'surface', eyebrow: 'Là où vous posez la serviette',
    line: 'La mer d’aujourd’hui : propre, ou pas. La seule question qui compte.',
    cta: 'Voir ma plage — gratuit', href: 'https://sargasses-martinique.com/' },
  { name: 'ANIMAUX', value: -6, label: '−6 m', eyebrow: 'La vie du bord',
    line: 'Une tortue, un banc de poissons — ils nagent dans la donnée, ils ne la lisent pas.' },
  { name: 'VÉGÉTAUX · ALGUES', value: -1, label: 'en dérive, surface', eyebrow: 'Ce qu’on traque',
    line: 'Les radeaux dérivent avec le courant — les repérer avant l’échouage, c’est tout le métier.' },
  { name: 'MINÉRAUX · ROCHES', value: -25, label: '−25 m', eyebrow: 'Jusqu’aux roches',
    line: 'Là où la mesure s’arrête. On ne promet rien qu’on ne voit pas.' },
];

// ---- palette orbite → abysse — reprise à l'identique de design/proto-ecoscene-descent.html
// (mêmes STOPS, même fonction colorAt) pour rester dans le même langage visuel.
const STOPS = [
  [0, '#050912'], [.10, '#12203a'], [.17, '#3a3a63'], [.24, '#a86a3e'], [.30, '#F2B05E'],
  [.35, '#C97E3A'], [.44, '#1A5852'], [.60, '#155A5A'], [.80, '#0B2230'], [1, '#030a12'],
];
function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
function toHex([r, g, b]) { return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function colorAt(ratio) {
  ratio = Math.min(1, Math.max(0, ratio));
  let i = 0;
  while (i < STOPS.length - 2 && ratio > STOPS[i + 1][0]) i++;
  const [r0, c0] = STOPS[i], [r1, c1] = STOPS[i + 1];
  const t = r1 === r0 ? 0 : (ratio - r0) / (r1 - r0);
  const a = hex(c0), b = hex(c1);
  return toHex(a.map((v, k) => v + (b[k] - v) * t));
}

// ---- construit les 100 sous-paliers (10 par vantage). ratio = index global (0..1)
// — la teinte progresse en continu sur les 100 clips, indépendamment des valeurs
// d'altitude/profondeur affichées (qui, elles, oscillent : bateau→piéton restent
// "surface", végétaux remonte après animaux — c'est honnête, pas une trajectoire
// linéaire réelle).
function buildFloors() {
  const floors = [];
  let prevValue = TIERS[0].value;
  TIERS.forEach((tier) => {
    for (let s = 1; s <= SUBFLOORS_PER_TIER; s++) {
      const value = Math.round(prevValue + (tier.value - prevValue) * (s / SUBFLOORS_PER_TIER));
      floors.push({ n: floors.length + 1, tier, sub: s, value });
    }
    prevValue = tier.value;
  });
  floors.forEach((f, i) => { f.ratio = i / (floors.length - 1); });
  return floors;
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmtValue(tier, value) {
  if (tier.label === 'surface' || tier.label === 'en dérive, surface') return tier.label;
  if (Math.abs(value) >= 1000) return `${value > 0 ? '+' : '−'}${Math.round(Math.abs(value) / 1000).toLocaleString('fr-FR')} km`;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} m`;
}

function render(floor) {
  const { n, tier, sub, ratio } = floor;
  const top = colorAt(ratio);
  const bot = colorAt(Math.min(1, ratio + 0.14));
  const idx3 = String(n).padStart(3, '0');
  const isSky = ratio < 0.28; // satellite/avion : ciel/espace → étoiles, pas bulles
  const valueLabel = fmtValue(tier, floor.value);

  const actionHtml = tier.cta
    ? `<a class="cta" href="${esc(tier.href)}">${esc(tier.cta)}<span class="ar">→</span></a>`
    : '';

  const particles = isSky
    ? [
        { l: '14%', t: '18%', sz: 2, d: '-1s' }, { l: '30%', t: '32%', sz: 1.6, d: '-3.4s' },
        { l: '68%', t: '14%', sz: 2.2, d: '-.6s' }, { l: '82%', t: '40%', sz: 1.4, d: '-5s' },
        { l: '50%', t: '24%', sz: 1.8, d: '-2.1s' }, { l: '90%', t: '20%', sz: 1.5, d: '-4s' },
      ].map(p => `<div class="star" style="left:${p.l};top:${p.t};width:${p.sz}px;height:${p.sz}px;animation-delay:${p.d}"></div>`).join('\n      ')
    : [
        { l: '12%', dx: '10px', dur: '9s', dl: '-1s', sz: 7 }, { l: '26%', dx: '-8px', dur: '7s', dl: '-3.4s', sz: 4 },
        { l: '70%', dx: '6px', dur: '10.5s', dl: '-.6s', sz: 6 }, { l: '84%', dx: '-6px', dur: '8.2s', dl: '-5s', sz: 5 },
        { l: '50%', dx: '4px', dur: '6.5s', dl: '-2.1s', sz: 3 },
      ].map(p => `<div class="bub" style="left:${p.l};width:${p.sz}px;height:${p.sz}px;--dx:${p.dx};animation-duration:${p.dur};animation-delay:${p.dl}"></div>`).join('\n      ');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Le Veilleur — vantage ${n}/100 · ${esc(tier.name)} (clip design)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
/* clip généré — voir scripts/design/gen-scale-clips.cjs. Bibliothèque design, hors funnel. */
:root{
  --top:${top}; --bot:${bot};
  --gold:#E8A800; --goldL:#FFC72C; --goldS:#FFE47A;
  --tealL:#1EC8B0;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
html,body{height:100%;overflow:hidden}
body{background:linear-gradient(180deg,var(--top),var(--bot) 70%,#02060a);color:#EAF7F4;
  font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.anton{font-family:'Anton',"Haettenschweiler","Arial Narrow Bold","Impact",system-ui,sans-serif;
  font-weight:400;letter-spacing:-.01em;text-transform:uppercase}
.mono{font-family:'JetBrains Mono',monospace}

#stage{position:fixed;inset:0;display:flex;flex-direction:column}
.chrome{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 18px}
.wm{font-family:'Anton',sans-serif;font-size:15px;color:#fff;letter-spacing:-.01em;text-shadow:0 1px 8px rgba(0,0,0,.6)}
.wm b{display:block;margin-top:2px;font:700 8.5px/1 "Bricolage Grotesque";letter-spacing:.14em;
  text-transform:uppercase;color:rgba(255,216,132,.8)}
.tag{font:700 9px/1 'JetBrains Mono';letter-spacing:.06em;color:rgba(234,247,244,.55);text-align:right}

.emblem-wrap{display:flex;justify-content:center;padding-top:6px}
.emblem{width:44px;height:56px;color:var(--goldL)}
.em-ant{stroke:currentColor;stroke-width:2.4;stroke-linecap:round;fill:none}
.em-body{fill:rgba(16,38,34,.9)}
.em-ring{stroke:currentColor;stroke-width:2.6;fill:none}
.em-lens{fill:#0a2b2b}
.em-iris{fill:var(--goldL)}
@media (prefers-reduced-motion:no-preference){
  .emblem{animation:breathe 6.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
}

main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:6px 22px;gap:8px}
.eyebrow{font:800 10.5px/1.3 "Bricolage Grotesque";letter-spacing:.18em;text-transform:uppercase;
  color:rgba(255,216,132,.85);text-shadow:0 1px 6px rgba(0,0,0,.5)}
.altitude{font:700 15px/1 'JetBrains Mono';color:var(--tealL);text-shadow:0 1px 6px rgba(0,0,0,.6)}
.tiername{font-size:clamp(30px,10vw,54px);line-height:.98;color:#fff;text-shadow:0 3px 22px rgba(0,0,0,.55);margin:2px 0}
.value{font:700 16px/1.4 "Bricolage Grotesque";color:#fff;max-width:32ch;text-shadow:0 1px 8px rgba(0,0,0,.4)}
.cta{display:inline-flex;align-items:center;gap:9px;margin-top:10px;text-decoration:none;cursor:pointer;
  border:2px solid #0D0D0D;border-radius:13px;padding:13px 20px;color:#0D0D0D;
  background:linear-gradient(135deg,var(--goldS),var(--goldL) 45%,var(--gold));
  box-shadow:5px 5px 0 rgba(0,0,0,.45);font:800 15px/1 "Bricolage Grotesque"}

/* bulles ascendantes (surface et dessous) — boucle CSS pure */
.bub{position:absolute;bottom:-6%;border-radius:50%;background:rgba(255,255,255,.16);pointer-events:none}
@media (prefers-reduced-motion:no-preference){
  .bub{animation:rise linear infinite}
  @keyframes rise{0%{transform:translate(0,0);opacity:0}8%{opacity:.5}92%{opacity:.35}100%{transform:translate(var(--dx,6px),-112vh);opacity:0}}
}
/* étoiles (satellite/avion) — scintillement doux, jamais de mouvement de position */
.star{position:absolute;border-radius:50%;background:#fff;pointer-events:none;opacity:.5}
@media (prefers-reduced-motion:no-preference){
  .star{animation:twinkle 3.2s ease-in-out infinite}
  @keyframes twinkle{0%,100%{opacity:.25}50%{opacity:.9}}
}

.foot{text-align:center;padding:10px 16px 14px;font:600 9.5px/1.4 "Bricolage Grotesque";color:rgba(234,247,244,.42)}

@media (prefers-reduced-motion:reduce){ .bub,.star{display:none} }
</style>
</head>
<body>

<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">
Le Veilleur — vantage ${n} sur 100, ${esc(tier.name)}, ${esc(valueLabel)}.
</h1>

<div id="stage">
  <div class="chrome">
    <div class="wm">LE VEILLEUR<b>Bibliothèque design · descente d’échelle</b></div>
    <div class="tag">${idx3}/100</div>
  </div>

  ${particles}

  <main>
    <div class="emblem-wrap">
      <svg class="emblem" viewBox="0 0 46 58" aria-hidden="true">
        <line class="em-ant" x1="23" y1="6" x2="23" y2="16"/>
        <circle class="em-iris" cx="23" cy="6" r="3.4"/>
        <path class="em-body" d="M23 16 C33 16 39 23 39 31 C39 42 32 50 23 50 C14 50 7 42 7 31 C7 23 13 16 23 16 Z"/>
        <circle class="em-lens" cx="23" cy="33" r="12"/>
        <circle class="em-ring" cx="23" cy="33" r="12"/>
        <circle class="em-iris" cx="23" cy="36" r="4.6"/>
      </svg>
    </div>
    <div class="eyebrow">Vantage ${sub}/10 · ${esc(tier.eyebrow)}</div>
    <div class="altitude">${esc(valueLabel)}</div>
    <h2 class="tiername anton">${esc(tier.name)}</h2>
    <p class="value">${esc(tier.line)}</p>
    ${actionHtml}
  </main>

  <div class="foot">Clip ${n}/100 · pièce de bibliothèque design, hors funnel, pas déployée · verdict 100&nbsp;% donnée mesurée, l’argent ne touche jamais la mesure</div>
</div>
</body>
</html>
`;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const floors = buildFloors();
  if (floors.length !== 100) throw new Error(`expected 100 floors, got ${floors.length}`);

  const rows = [];
  floors.forEach((floor) => {
    const html = render(floor);
    const filename = `scale-${String(floor.n).padStart(3, '0')}.html`;
    fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf-8');
    rows.push({ file: filename, ...floor });
  });

  const indexHtml = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Le Veilleur — 100 clips descente d’échelle (bibliothèque design)</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0f14;color:#eaf7f4;margin:0;padding:24px}
h1{font-size:18px} p{opacity:.7;font-size:13px;max-width:62ch}
table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}
td,th{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
a{color:#ffc72c;text-decoration:none} a:hover{text-decoration:underline}
</style></head><body>
<h1>100 clips descente d’échelle — bibliothèque design</h1>
<p>Générés par <code>scripts/design/gen-scale-clips.cjs</code> : 10 vantages (satellite → avion →
bateau → voiture → moto → vélo → piéton → animaux → végétaux/algues → minéraux/roches), 10
sous-paliers chacun. Même moat que
<a href="../proto-ecoscene-descent.html">proto-ecoscene-descent.html</a> ("on mesure, on n'invente
pas"). Hors funnel, pas déployé. Distinct des <a href="../floor-clips/index.html">100 clips
paliers marché</a> (taxonomie business, pas la même chose).</p>
<table><tr><th>#</th><th>Vantage</th><th>Sous-palier</th><th>Altitude/profondeur</th></tr>
${rows.map(r => `<tr><td>${String(r.n).padStart(3, '0')}</td><td><a href="scale-${String(r.n).padStart(3, '0')}.html">${esc(r.tier.name)}</a></td><td>${r.sub}/10</td><td>${esc(fmtValue(r.tier, r.value))}</td></tr>`).join('\n')}
</table>
</body></html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf-8');

  console.log(`OK: ${floors.length} clips written to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main();

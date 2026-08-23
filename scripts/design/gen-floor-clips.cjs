#!/usr/bin/env node
/**
 * Génère 100 "clips" statiques (design/floor-clips/floor-NNN.html) — un par
 * sous-palier de profondeur, 10 sous-paliers par palier de design/proto-descente-marches.html.
 *
 * DONNÉES = source unique : les 10 TIERS + copy FR de design/proto-descente-marches.html,
 * figées par docs/BIG_MARKETS.md. On ne réinvente ni prix ni marché ici — seule la
 * profondeur (m) varie à l'intérieur de chaque palier, en 10 pas linéaires.
 * Chaque clip est un template auto-jouant (aucun scroll requis), pas de rAF JS
 * (CSS keyframes uniquement), reduced-motion = plancher dur.
 *
 * Sortie : design/floor-clips/ — bibliothèque design, HORS FUNNEL, pas déployée,
 * pas importée par l'app. `node scripts/design/gen-floor-clips.cjs` régénère tout.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '..', 'design', 'floor-clips');

// ---- source unique : cf. design/proto-descente-marches.html (TIERS + COPY.fr) ----
const TIERS = [
  { name: 'SABLE',     kind: 'live',    depth: 0,    href: 'https://sargasses-martinique.com/' },
  { name: 'RÉCIF',     kind: 'live',    depth: 40,   href: 'https://sargasses-martinique.com/pro/espace/' },
  { name: 'DIGUE',     kind: 'live',    depth: 120,  href: 'https://sargasses-martinique.com/pro/' },
  { name: 'AMARRE',    kind: 'horizon', depth: 400 },
  { name: 'BAROMÈTRE', kind: 'horizon', depth: 900 },
  { name: 'SILLAGE',   kind: 'horizon', depth: 1500 },
  { name: 'FILET',     kind: 'horizon', depth: 2400 },
  { name: 'COURANT',   kind: 'horizon', depth: 3500 },
  { name: 'PRISME',    kind: 'pilot',   depth: 4800 },
  { name: 'ABYSSE',    kind: 'horizon', depth: 6000 },
];
const COPY = [
  { market: 'B2C · voyageurs', value: 'Votre plage aujourd’hui : mer propre ou pas.', line: 'Le verdict du jour, gratuit. Pass séjour dès 7,99 €.', prices: ['7,99 €'], cta: 'Voir ma plage — gratuit' },
  { market: 'Hôtels & clubs de plage', value: 'L’état de vos plages sur votre site, daté.', line: '79 €/mois ou 690 €/an · essai 30 j sans carte.', prices: ['79 €/mois', '690 €/an'], cta: 'Essayer 30 jours' },
  { market: 'Mairies & offices de tourisme', value: 'Toute la commune, baie par baie.', line: '199 €/mois ou 1 990 €/an · self-serve.', prices: ['199 €/mois', '1 990 €/an'], cta: 'Ouvrir Territoire' },
  { market: 'Immobilier côtier', value: 'Lire l’exposition d’un rivage dans le temps.', line: 'Pas encore mesuré → pas encore promis.' },
  { market: 'Assurance / réassurance', value: 'Le risque côtier daté existe dans nos données.', line: 'On ne le vendra jamais à qui parie contre la plage — l’argent ne touche pas le verdict.' },
  { market: 'Croisière, ports, maritime', value: 'Des fenêtres d’escale « mer propre ».', line: 'Le jour où la donnée les tiendra sans détour.' },
  { market: 'Pêche & aquaculture', value: 'L’algue avant qu’elle n’étouffe l’eau.', line: 'Une piste qu’on garde à l’œil, pas une facture.' },
  { market: 'Énergie & dessalement', value: 'Anticiper le biofouling aux prises d’eau.', line: 'Le jour où on le mesurera vraiment.' },
  { market: 'Licence data / API', value: 'Notre satellite brut + prévision, en API.', line: 'En chantier — pour qui veut la source, pas l’app.' },
  { market: 'Climat · spatial · souverain · défense', value: 'Un jumeau vivant des côtes du monde.', line: 'La direction où la sonde regarde — pas une porte ouverte aujourd’hui.' },
];

const BADGE = { live: { ck: '✓', label: 'Live' }, pilot: { ck: '◐', label: 'En chantier' }, horizon: { ck: '○', label: 'Horizon' } };
const SUBFLOORS_PER_TIER = 10;
const MAXDEPTH = 6000;

// ---- interpolation couleur : mêmes 7 stops "ocean" que proto-descente-marches.html ----
const OCEAN_STOPS = [
  [0,    '#F2B05E'], [.05, '#FFD884'], [.14, '#C97E3A'], [.30, '#1A5852'],
  [.55,  '#155A5A'], [.78, '#0B2230'], [1,   '#08251F'],
];
function hex(c){ c=c.replace('#',''); return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]; }
function toHex([r,g,b]){ return '#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''); }
function colorAt(ratio){
  ratio = Math.min(1, Math.max(0, ratio));
  let i = 0;
  while (i < OCEAN_STOPS.length - 2 && ratio > OCEAN_STOPS[i+1][0]) i++;
  const [r0, c0] = OCEAN_STOPS[i], [r1, c1] = OCEAN_STOPS[i+1];
  const t = r1 === r0 ? 0 : (ratio - r0) / (r1 - r0);
  const a = hex(c0), b = hex(c1);
  return toHex(a.map((v, k) => v + (b[k] - v) * t));
}

// ---- construit les 100 sous-paliers (10 par palier, profondeur interpolée) ----
function buildFloors() {
  const floors = [];
  let prevDepth = 0;
  TIERS.forEach((tier, ti) => {
    const copy = COPY[ti];
    for (let s = 1; s <= SUBFLOORS_PER_TIER; s++) {
      const depth = Math.round(prevDepth + (tier.depth - prevDepth) * (s / SUBFLOORS_PER_TIER));
      floors.push({
        n: floors.length + 1, tier, copy, sub: s, depth,
        ratio: depth / MAXDEPTH,
      });
    }
    prevDepth = tier.depth;
  });
  return floors;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function priceSpans(text, prices) {
  if (!prices || !prices.length) return esc(text);
  let rest = text, out = '';
  while (rest.length) {
    let best = -1, tok = null;
    for (const p of prices) { const k = rest.indexOf(p); if (k !== -1 && (best === -1 || k < best)) { best = k; tok = p; } }
    if (best === -1) { out += esc(rest); break; }
    if (best > 0) out += esc(rest.slice(0, best));
    out += `<span class="price">${esc(tok)}</span>`;
    rest = rest.slice(best + tok.length);
  }
  return out;
}

function render(floor) {
  const { n, tier, copy, sub, depth, ratio } = floor;
  const badge = BADGE[tier.kind];
  const top = colorAt(ratio);
  const bot = colorAt(Math.min(1, ratio + 0.16));
  const idx3 = String(n).padStart(3, '0');

  let actionHtml;
  if (tier.kind === 'live') {
    actionHtml = `<p class="tierline">${priceSpans(copy.line, copy.prices)}</p>
      <a class="cta" href="${esc(tier.href)}">${esc(copy.cta)}<span class="ar">→</span></a>`;
  } else if (tier.kind === 'pilot') {
    actionHtml = `<p class="tierline">${esc(copy.line)}</p>
      <div class="pilotnote"><span class="d"></span>${esc(badge.label)} — aucun accès à vendre aujourd’hui</div>`;
  } else {
    actionHtml = `<div class="wall"><span class="wl">Pourquoi on n’y va pas</span><span class="wt">${esc(copy.line)}</span></div>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Le Veilleur — palier ${n}/100 · ${esc(tier.name)} (clip design)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
/* clip généré — voir scripts/design/gen-floor-clips.cjs. Bibliothèque design, hors funnel. */
:root{
  --top:${top}; --bot:${bot};
  --gold:#E8A800; --goldL:#FFC72C; --goldS:#FFE47A;
  --ink:#0D0D0D; --paper:#FDFCF7;
  --green:#22C55E; --amber:#B87A00; --coral:#E8522A; --teal:#009E8E; --tealL:#1EC8B0;
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

/* halo ambient au centre (satellite/oeil) */
.emblem-wrap{display:flex;justify-content:center;padding-top:6px}
.emblem{width:44px;height:56px;color:var(--goldL)}
.tier-pilot .emblem{color:var(--tealL)}
.tier-horizon .emblem{color:rgba(234,247,244,.55);opacity:.6}
.em-ant{stroke:currentColor;stroke-width:2.4;stroke-linecap:round;fill:none}
.em-body{fill:rgba(16,38,34,.9)}
.em-ring{stroke:currentColor;stroke-width:2.6;fill:none}
.em-lens{fill:#0a2b2b}
.em-iris{fill:var(--goldL)}
.tier-pilot .em-iris{fill:var(--tealL)}
.tier-horizon .em-iris{fill:none;stroke:rgba(234,247,244,.4);stroke-width:1.2}
@media (prefers-reduced-motion:no-preference){
  .emblem{animation:breathe 6.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
}

main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:6px 22px;gap:8px}
.eyebrow{font:800 10.5px/1.3 "Bricolage Grotesque";letter-spacing:.18em;text-transform:uppercase;
  color:rgba(255,216,132,.85);text-shadow:0 1px 6px rgba(0,0,0,.5)}
.depth{font:700 15px/1 'JetBrains Mono';color:var(--tealL);text-shadow:0 1px 6px rgba(0,0,0,.6)}
.tiername{font-size:clamp(38px,13vw,68px);line-height:.92;color:#fff;text-shadow:0 3px 22px rgba(0,0,0,.55);margin:2px 0}
.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;
  font:800 11px/1 "Bricolage Grotesque";letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px}
.badge.live{background:rgba(34,197,94,.16);color:#5be79a;border:1px solid rgba(34,197,94,.5)}
.badge.pilot{background:rgba(30,200,176,.16);color:var(--tealL);border:1px solid rgba(30,200,176,.5)}
.badge.horizon{background:rgba(234,247,244,.1);color:rgba(234,247,244,.85);border:1px solid rgba(234,247,244,.32)}
.market{font:700 12px/1.3 "Bricolage Grotesque";color:rgba(234,247,244,.75);letter-spacing:.02em}
.value{font:700 16px/1.4 "Bricolage Grotesque";color:#fff;max-width:30ch;text-shadow:0 1px 8px rgba(0,0,0,.4)}

.tierline{font:600 13.5px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.85);max-width:32ch}
.tierline .price{color:var(--goldS);font-weight:800}
.cta{display:inline-flex;align-items:center;gap:9px;margin-top:6px;text-decoration:none;cursor:pointer;
  border:2px solid var(--ink);border-radius:13px;padding:13px 20px;color:var(--ink);
  background:linear-gradient(135deg,var(--goldS),var(--goldL) 45%,var(--gold));
  box-shadow:5px 5px 0 rgba(0,0,0,.45);font:800 15px/1 "Bricolage Grotesque"}
.pilotnote{margin-top:4px;display:inline-flex;align-items:center;gap:8px;font:700 12px/1.3 "Bricolage Grotesque";color:var(--tealL)}
.pilotnote .d{width:8px;height:8px;border-radius:50%;background:var(--tealL)}
.wall{margin-top:6px;border-left:3px solid rgba(232,82,42,.55);padding:2px 0 2px 12px;max-width:30ch;text-align:left}
.wall .wl{display:block;font:800 9.5px/1 "Bricolage Grotesque";letter-spacing:.16em;text-transform:uppercase;color:var(--coral);margin-bottom:5px;opacity:.9}
.wall .wt{font:600 13px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.9)}

/* bulles ascendantes — physique de flottabilité, boucle CSS pure */
.bub{position:absolute;bottom:-6%;border-radius:50%;background:rgba(255,255,255,.16);pointer-events:none}
@media (prefers-reduced-motion:no-preference){
  .bub{animation:rise linear infinite}
  @keyframes rise{0%{transform:translate(0,0);opacity:0}8%{opacity:.5}92%{opacity:.35}100%{transform:translate(var(--dx,6px),-112vh);opacity:0}}
}

.foot{text-align:center;padding:10px 16px 14px;font:600 9.5px/1.4 "Bricolage Grotesque";color:rgba(234,247,244,.42)}

@media (prefers-reduced-motion:reduce){ .bub{display:none} }
</style>
</head>
<body class="tier-${tier.kind}">

<h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">
Le Veilleur — palier ${n} sur 100, ${esc(tier.name)}, profondeur ${depth} mètres, ${esc(copy.market)}.
</h1>

<div id="stage">
  <div class="chrome">
    <div class="wm">LE VEILLEUR<b>Bibliothèque design · clip palier</b></div>
    <div class="tag">${idx3}/100</div>
  </div>

  <div class="bub" style="left:12%;width:7px;height:7px;--dx:10px;animation-duration:9s;animation-delay:-1s"></div>
  <div class="bub" style="left:26%;width:4px;height:4px;--dx:-8px;animation-duration:7s;animation-delay:-3.4s"></div>
  <div class="bub" style="left:70%;width:6px;height:6px;--dx:6px;animation-duration:10.5s;animation-delay:-.6s"></div>
  <div class="bub" style="left:84%;width:5px;height:5px;--dx:-6px;animation-duration:8.2s;animation-delay:-5s"></div>
  <div class="bub" style="left:50%;width:3px;height:3px;--dx:4px;animation-duration:6.5s;animation-delay:-2.1s"></div>

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
    <div class="eyebrow">Palier ${sub}/10 · ${esc(tier.name)}</div>
    <div class="depth">−${depth.toLocaleString('fr-FR')} m</div>
    <h2 class="tiername anton">${esc(tier.name)}</h2>
    <span class="badge ${tier.kind}"><span class="ck">${badge.ck}</span> ${esc(badge.label)}</span>
    <div class="market">${esc(copy.market)}</div>
    <p class="value">${esc(copy.value)}</p>
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
    const filename = `floor-${String(floor.n).padStart(3, '0')}.html`;
    fs.writeFileSync(path.join(OUT_DIR, filename), html, 'utf-8');
    rows.push({ file: filename, ...floor });
  });

  const indexHtml = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Le Veilleur — 100 clips paliers (bibliothèque design)</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0f14;color:#eaf7f4;margin:0;padding:24px}
h1{font-size:18px} p{opacity:.7;font-size:13px;max-width:60ch}
table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}
td,th{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
a{color:#ffc72c;text-decoration:none} a:hover{text-decoration:underline}
.k-live{color:#5be79a}.k-pilot{color:#1ec8b0}.k-horizon{color:rgba(234,247,244,.6)}
</style></head><body>
<h1>100 clips paliers — bibliothèque design</h1>
<p>Générés par <code>scripts/design/gen-floor-clips.cjs</code> à partir des 10 paliers de
<a href="../proto-descente-marches.html">proto-descente-marches.html</a> (10 sous-paliers chacun,
profondeur interpolée). Hors funnel, pas déployé. Copy/pricing = source unique, jamais réinventés ici.</p>
<table><tr><th>#</th><th>Palier</th><th>Sous-palier</th><th>Profondeur</th><th>Statut</th><th>Marché</th></tr>
${rows.map(r => `<tr><td>${String(r.n).padStart(3, '0')}</td><td><a href="${r.n === undefined ? '' : `floor-${String(r.n).padStart(3, '0')}.html`}">${esc(r.tier.name)}</a></td><td>${r.sub}/10</td><td>−${r.depth} m</td><td class="k-${r.tier.kind}">${r.tier.kind}</td><td>${esc(r.copy.market)}</td></tr>`).join('\n')}
</table>
</body></html>
`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf-8');

  console.log(`OK: ${floors.length} clips written to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

main();

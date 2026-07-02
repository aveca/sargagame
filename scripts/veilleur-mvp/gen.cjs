#!/usr/bin/env node
/* ============================================================
   Génère les 10 landing MVPs « LE VEILLEUR · COMICS GROUP ».
   1 entité (marché) = 1 page : édite markets.json → régénère.
   Fond vidéo ambiant partagé (assets/bg-reel.mp4) + vibe
   ALÉATOIRE seedée par le slug (teinte de grade + décalage de
   départ) → chaque page a une ambiance différente, toutes les
   « sets » vivent dans la même vidéo. Verdict = EXEMPLE marqué.
   Sortie : public/veilleur-mvp/<slug>/index.html + index galerie.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'public', 'veilleur-mvp');

const template = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');
const markets = JSON.parse(fs.readFileSync(path.join(HERE, 'markets.json'), 'utf8'));
const VeilleurCard = require('./card.cjs'); // moteur d'assets partagé (design API)

/* ---- vibes (grade en soft-light) + hash seedé ---- */
const VIBES = [
  'rgba(255,178,46,.45)',   // golden hour
  'rgba(22,185,201,.42)',   // teal lagoon
  'rgba(232,82,42,.34)',    // coral dusk
  'rgba(120,90,200,.40)',   // violet dusk
  'rgba(95,191,160,.42)',   // green vybz
  'rgba(255,120,60,.36)',   // amber sunset
];
function hash(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---- starburst comic (points de polygone, partagés) ---- */
function burst(cx, cy, spikes, rO, rI) {
  const p = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    const r = (i % 2) ? rI : rO;
    p.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1));
  }
  return p.join(' ');
}
const BURST_POINTS = burst(110, 110, 12, 108, 74);   // fond logo (viewBox 220x220)
const BURST_POINTS_STK = burst(110, 80, 11, 76, 50); // sticker (viewBox 220x160)

/* ---- i18n ---- */
const COPY = {
  fr: {
    strap: 'COMICS GROUP',
    tagline: 'ON REGARDE LA MER POUR VOUS.',
    cta: 'Voir ma plage — gratuit',
    live: 'LIVE · AUJOURD’HUI',
    honestyMain: 'MESURÉ',
    honestySub: '100% SATELLITE · 0% DEVINÉ',
    mascotAria: 'La sonde Le Veilleur regarde la mer.',
    verdict: { clean: 'MER PROPRE ✓', moderate: 'PRÉSENCE MODÉRÉE', algae: 'ALGUES AUJOURD’HUI ⚠' },
    ono: { clean: 'AU TOP!', moderate: 'MOUAIS', algae: 'OULA!' },
    planb: 'où aller plutôt →',
    vnote: ['Exemple. Le ', 'verdict du jour', ' — daté, mesuré au satellite — est en direct sur l’app.'],
    title: m => `${m.market} — sargasses aujourd’hui | Le Veilleur`,
    desc: m => `Le verdict sargasses de ${m.market} (${m.region}), chaque jour. Mesuré au satellite, pas deviné.`,
  },
  en: {
    strap: 'COMICS GROUP',
    tagline: 'WE WATCH THE SEA FOR YOU.',
    cta: 'See my beach — free',
    live: 'LIVE · TODAY',
    honestyMain: 'MEASURED',
    honestySub: '100% SATELLITE · 0% GUESSED',
    mascotAria: 'The Veilleur probe watches the sea.',
    verdict: { clean: 'CLEAN WATER ✓', moderate: 'MODERATE PRESENCE', algae: 'SARGASSUM TODAY ⚠' },
    ono: { clean: 'CLEAR!', moderate: 'SO-SO', algae: 'HEADS UP' },
    planb: 'where to go instead →',
    vnote: ['Example. The ', 'verdict of the day', ' — dated, satellite-measured — is live in the app.'],
    title: m => `${m.market} — sargassum today | Le Veilleur`,
    desc: m => `The sargassum verdict for ${m.market} (${m.region}), every day. Measured by satellite, not guessed.`,
  },
  es: {
    strap: 'COMICS GROUP',
    tagline: 'MIRAMOS EL MAR POR TI.',
    cta: 'Ver mi playa — gratis',
    live: 'LIVE · HOY',
    honestyMain: 'MEDIDO',
    honestySub: '100% SATÉLITE · 0% ADIVINADO',
    mascotAria: 'La sonda Le Veilleur mira el mar.',
    verdict: { clean: 'AGUA LIMPIA ✓', moderate: 'PRESENCIA MODERADA', algae: 'SARGAZO HOY ⚠' },
    ono: { clean: 'LIMPIO!', moderate: 'REGULAR', algae: 'OJO!' },
    planb: 'a dónde ir mejor →',
    vnote: ['Ejemplo. El ', 'veredicto del día', ' — fechado, medido por satélite — está en vivo en la app.'],
    title: m => `${m.market} — sargazo hoy | Le Veilleur`,
    desc: m => `El veredicto de sargazo de ${m.market} (${m.region}), cada día. Medido por satélite, no adivinado.`,
  },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(m, i) {
  const c = COPY[m.lang] || COPY.fr;
  const h = hash(m.slug);
  const vibeIdx = h % VIBES.length;
  const vibe = VIBES[vibeIdx];
  const offset = (h % 110) / 10;                 // 0.0 .. 10.9 s de la vidéo ~13s
  const vnote = `${esc(c.vnote[0])}<b>${esc(c.vnote[1])}</b>${esc(c.vnote[2])}`;
  const planb = m.verdict === 'algae'
    ? `<a class="planb" href="${esc(m.href)}">${esc(c.planb)}</a>`
    : '';
  const repl = {
    SLUG: m.slug,
    LANG: m.lang,
    TITLE: esc(c.title(m)),
    META_DESC: esc(c.desc(m)),
    STRAP_COMICS: esc(c.strap),
    N: String(i + 1).padStart(2, '0'),
    MARKET: esc(m.market),
    MARKET_UPPER: esc(m.market.toUpperCase()),
    TAGLINE: esc(c.tagline),
    CTA: esc(c.cta),
    HREF: esc(m.href),
    HONESTY_MAIN: esc(c.honestyMain),
    HONESTY_SUB: esc(c.honestySub),
    MASCOT_ARIA: esc(c.mascotAria),
    LIVE_LABEL: esc(c.live),
    VERDICT_CLASS: m.verdict,
    VERDICT_LABEL: esc(c.verdict[m.verdict]),
    PLANB_BLOCK: planb,
    VNOTE: vnote,
    VIBE_TINT: vibe,
    VIBE_OFFSET: offset.toFixed(1),
    BURST_POINTS: BURST_POINTS,
    BURST_POINTS_STK: BURST_POINTS_STK,
    ONO: esc((c.ono && c.ono[m.verdict]) || ''),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in repl ? repl[k] : ''));
}

/* ---- écrire les 10 pages ---- */
fs.mkdirSync(path.join(OUT, 'assets', 'cards'), { recursive: true });
const cards = [];
markets.forEach((m, i) => {
  const html = render(m, i);
  const dir = path.join(OUT, m.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  // asset image de marque (partage/OG) via le moteur — data -> asset
  const vibeKey = VeilleurCard.vibeKeys[hash(m.slug) % VIBES.length];
  const cardSvg = VeilleurCard.build({ n: i + 1, market: m.market, region: m.region, state: m.verdict, lang: m.lang, vibe: vibeKey, animate: false });
  fs.writeFileSync(path.join(OUT, 'assets', 'cards', m.slug + '.svg'), cardSvg, 'utf8');
  cards.push({ slug: m.slug, market: m.market, region: m.region, verdict: m.verdict });
  console.log(`  ✓ ${m.slug}/index.html + card  (${m.lang}, ${m.verdict})`);
});

// sync du moteur vers le Studio (aperçu live côté navigateur)
const STUDIO = path.join(ROOT, 'public', 'veilleur-studio');
fs.mkdirSync(STUDIO, { recursive: true });
fs.copyFileSync(path.join(HERE, 'card.cjs'), path.join(STUDIO, 'card.js'));
console.log('  ✓ veilleur-studio/card.js synced');

/* ---- galerie index ---- */
const chip = { clean: '#127c3b', moderate: '#B87A00', algae: '#E8522A' };
const cardHtml = cards.map((c, i) => `
    <a class="card" href="${c.slug}/">
      <span class="n mono">N°${String(i + 1).padStart(2, '0')}</span>
      <span class="mk">${esc(c.market)}</span>
      <span class="rg">${esc(c.region)}</span>
      <span class="vd" style="color:${chip[c.verdict]}">● ${c.verdict}</span>
    </a>`).join('');

const index = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LE VEILLEUR · COMICS GROUP — 10 landing MVPs</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d0f;color:#EAF7F4;font-family:'Bricolage Grotesque',system-ui,sans-serif;padding:40px 22px 80px}
  .hd{max-width:1100px;margin:0 auto 26px}
  .hd .wm{font-family:'Anton',sans-serif;font-size:clamp(30px,6vw,58px);color:#FFC72C;-webkit-text-stroke:2px #0d0d0f;text-transform:uppercase;letter-spacing:1px;
    text-shadow:3px 3px 0 #0b3a36}
  .hd .sub{font:800 12px/1 "Bricolage Grotesque";letter-spacing:6px;color:#5FBFA0;margin-top:6px}
  .grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .card{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:#fff;background:#15151b;
    border:2px solid #2a2a34;border-radius:12px;padding:18px 16px;transition:border-color .15s,transform .15s}
  .card:hover{border-color:#FFC72C;transform:translateY(-3px)}
  .card .n{font:700 11px/1 'JetBrains Mono';color:#5FBFA0;letter-spacing:2px}
  .card .mk{font-family:'Anton',sans-serif;font-size:26px;text-transform:uppercase;line-height:1;margin-top:6px}
  .card .rg{font:600 12px/1 "Bricolage Grotesque";color:rgba(234,247,244,.6)}
  .card .vd{font:800 11px/1 "Bricolage Grotesque";text-transform:uppercase;letter-spacing:.5px;margin-top:8px}
  .foot{max-width:1100px;margin:26px auto 0;font:600 11px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.4)}
</style></head>
<body>
  <div class="hd"><div class="wm">LE VEILLEUR</div><div class="sub">COMICS GROUP · 10 LANDING MVPS</div></div>
  <div class="grid">${cardHtml}
  </div>
  <p class="foot">Fond vidéo ambiant partagé, vibe aléatoire seedée par marché. Verdict = exemple marqué, la donnée du jour est en direct sur l’app. Généré par scripts/veilleur-mvp/gen.cjs.</p>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), index, 'utf8');
console.log(`\nGenerated ${cards.length} landings + index at public/veilleur-mvp/`);

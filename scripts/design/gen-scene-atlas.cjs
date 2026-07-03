#!/usr/bin/env node
// Génère la galerie « Ciné-Atlas · Les Plages » (SUJETS divers) depuis le manifest scene-clips.
// Chaque carte = une VRAIE plage (sujet distinct) × durée (micro 1-3s / court 5-10s). 100 % data-driven.
// Sortie = design/scene-atlas/index.html. Médias dans public/scene-atlas/ (gitignorés, produits en CI/local).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'public', 'scene-atlas', 'manifest.json');
const OUTDIR = path.join(ROOT, 'design', 'scene-atlas');
const MEDIA = '../../public/scene-atlas/';

let items = [];
try { items = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { console.error("manifest absent — lance d'abord scene-clips-batch.mjs"); process.exit(1); }

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const islands = [...new Set(items.map(i => i.island))].sort();
const durations = [...new Set(items.map(i => i.duration))].sort();
const durLabel = d => d === 'micro' ? 'micro · 1-3s' : d === 'short' ? 'court · 5-10s' : d;
const archLabel = a => ({ ICONIC_ROCK: 'Rocher', CLIFF_HEADLAND: 'Falaise', REEF_ISLET: 'Îlet', MARINA_URBAN: 'Marina', VOLCANIC_BLACK: 'Sable noir', RIVER_MANGROVE: 'Mangrove', SHELTERED_BAY: 'Baie', OPEN_SHORE: 'Grand large', MORNE_COAST: 'Morne' }[a] || a);

const card = it => {
  const b = it.mp4.replace(/\.mp4$/, '');
  return `<figure class="card" data-island="${esc(it.island)}" data-duration="${esc(it.duration)}" tabindex="0">
    <div class="frame">
      <video class="clip" preload="none" muted loop playsinline poster="${MEDIA}${esc(it.poster)}">
        <source src="${MEDIA}${esc(it.mp4)}" type="video/mp4">
      </video>
      <span class="badge">${esc(it.island.toUpperCase())} · ${esc(it.duration === 'micro' ? 'micro' : 'court')}</span>
    </div>
    <figcaption>
      <span class="nm">${esc(it.name)}</span>
      <span class="loc">${esc(it.commune || '')}</span>
      <span class="hf">${esc(archLabel(it.archetype))} · ${esc(it.move)}</span>
      <span class="meta">${esc(it.sec)}s · SVG→ffmpeg · 0 IA</span>
      <span class="dl"><a href="${MEDIA}${esc(it.mp4)}" download>mp4</a>${it.gif ? ` · <a href="${MEDIA}${esc(it.gif)}" download>gif</a>` : ''}</span>
    </figcaption>
  </figure>`;
};

const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ciné-Atlas · Les Plages — Le Veilleur</title>
<style>
:root{--ink:#0D0D0D;--gold:#E8A800;--goldL:#FFC72C;--goldS:#FFE47A;--teal:#009E8E;--tealL:#1EC8B0;--bg:#070f14}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(120% 90% at 50% -10%,#123 0%,var(--bg) 60%) fixed;color:#eaf7f4;
  font:600 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
header{padding:34px 22px 18px;max-width:1180px;margin:0 auto}
.wm{font:700 11px/1 system-ui;letter-spacing:.24em;color:var(--tealL);text-transform:uppercase}
h1{font:400 clamp(34px,8vw,64px)/.94 'Anton',Impact,'Haettenschweiler',sans-serif;letter-spacing:-.01em;
  text-transform:uppercase;margin:.12em 0 .1em;color:#fff}
.sub{font:600 14.5px/1.5 system-ui;color:rgba(234,247,244,.82);max-width:60ch}
.sub b{color:var(--goldS)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 2px}
.bar .cnt{font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--goldS);letter-spacing:.02em}
.seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.seg button{-webkit-appearance:none;appearance:none;cursor:pointer;background:rgba(255,255,255,.06);
  border:1px solid rgba(30,200,176,.35);color:#eaf7f4;border-radius:9px;min-height:38px;padding:0 12px;
  font:800 12px/1 system-ui;letter-spacing:.02em}
.seg button[aria-pressed="true"]{background:linear-gradient(135deg,var(--goldS),var(--goldL));color:#1a2b26;border-color:transparent}
main{max-width:1180px;margin:0 auto;padding:14px 22px 60px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.card{margin:0;background:#0c1620;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;
  box-shadow:0 8px 24px rgba(0,0,0,.35);transition:transform .12s ease,border-color .12s ease}
.card:hover,.card:focus-within{transform:translateY(-3px);border-color:rgba(30,200,176,.6);outline:none}
.frame{position:relative;aspect-ratio:9/16;background:#01060c}
.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;left:8px;font:800 9.5px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;
  color:#1a2b26;background:var(--goldS);border-radius:6px;padding:4px 7px}
figcaption{padding:11px 12px 13px;display:flex;flex-direction:column;gap:2px}
.nm{font:400 18px/1.02 'Anton',Impact,sans-serif;letter-spacing:.01em;text-transform:uppercase;color:#fff}
.loc{font:700 10.5px/1.2 system-ui;color:rgba(234,247,244,.62)}
.hf{font:700 10px/1.2 ui-monospace,Menlo,Consolas,monospace;color:var(--tealL);opacity:.85;margin-top:3px}
.meta{font:700 9.5px/1.2 ui-monospace,Menlo,Consolas,monospace;color:rgba(234,247,244,.5)}
.dl{font:800 11px/1 system-ui;margin-top:6px}
.dl a{color:var(--goldL);text-decoration:none;border-bottom:1px solid rgba(255,199,44,.4)}
.foot{max-width:1180px;margin:0 auto;padding:0 22px 48px;color:rgba(234,247,244,.6);font:600 12.5px/1.6 system-ui}
.foot b{color:var(--goldS)}
@media (prefers-reduced-motion:reduce){.card{transition:none}}
</style></head>
<body>
<header>
  <div class="wm">Le Veilleur · Comics Group</div>
  <h1>Ciné-Atlas · Les Plages</h1>
  <p class="sub">Des <b>petites vidéos sur des sujets DIVERS</b> — chaque carte est une <b>vraie plage</b>, rendue en
  golden-hour SVG (9 archétypes, statut réel). Deux formats : <b>micro 1-3 s</b> (loops / accents UI) et
  <b>court 5-10 s</b> (hero / social). <b>100 % gratuit · zéro IA · zéro crédit.</b> Illustration d'ambiance —
  le verdict réel, mesuré au satellite, vit sur la page.</p>
  <div class="bar">
    <span class="cnt" id="cnt"></span>
    <span class="seg" id="fIsland" role="group" aria-label="Île"></span>
    <span class="seg" id="fDur" role="group" aria-label="Durée"></span>
  </div>
</header>
<main><div class="grid" id="grid">
${items.map(card).join('\n')}
</div></main>
<p class="foot"><b>${items.length} clips</b> · usine <code>scripts/design/scene-clips-batch.mjs</code> (sujets = plages, idempotente, capée)
· galerie <code>scripts/design/gen-scene-atlas.cjs</code> · médias <code>public/scene-atlas/</code> (local ou CI).
Le verdict reste 100 % ERDDAP ; l'argent ne le touche jamais.</p>
<script>
(function(){
  var grid=document.getElementById('grid'), cards=[].slice.call(grid.children);
  cards.forEach(function(c){
    var v=c.querySelector('video'); if(!v)return;
    var play=function(){ if(matchMedia('(prefers-reduced-motion:reduce)').matches)return; v.play().catch(function(){}); };
    var stop=function(){ try{v.pause();}catch(e){} };
    c.addEventListener('mouseenter',play); c.addEventListener('mouseleave',stop);
    c.addEventListener('focus',play); c.addEventListener('blur',stop);
    c.addEventListener('click',function(){ v.paused?play():stop(); });
  });
  var islands=${JSON.stringify(islands)}, durations=${JSON.stringify(durations)};
  var durLab=${JSON.stringify(Object.fromEntries(durations.map(d => [d, durLabel(d)])))};
  var state={island:'all',duration:'all'};
  function seg(host,vals,key,labeler){
    var mk=function(val,lab){var b=document.createElement('button');b.textContent=lab;b.setAttribute('aria-pressed',String(state[key]===val));
      b.addEventListener('click',function(){state[key]=val;[].forEach.call(host.children,function(x){x.setAttribute('aria-pressed','false');});b.setAttribute('aria-pressed','true');apply();});host.appendChild(b);};
    mk('all','Tout'); vals.forEach(function(v){mk(v,labeler?labeler(v):v.toUpperCase());});
  }
  seg(document.getElementById('fIsland'),islands,'island',null);
  seg(document.getElementById('fDur'),durations,'duration',function(d){return durLab[d]||d;});
  function apply(){
    var n=0;
    cards.forEach(function(c){
      var ok=(state.island==='all'||c.dataset.island===state.island)&&(state.duration==='all'||c.dataset.duration===state.duration);
      c.style.display=ok?'':'none'; if(ok)n++;
    });
    document.getElementById('cnt').textContent=n+' clips';
  }
  apply();
})();
</script>
</body></html>`;

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html);
console.log(`[scene-atlas] galerie → design/scene-atlas/index.html (${items.length} clips)`);

#!/usr/bin/env node
// Génère la GALERIE « Ciné-Atlas » (l'UI produit qui SCALE) depuis le manifest de l'usine.
// 100 % data-driven : un nouveau clip dans le manifest = une carte de plus, ZÉRO code à toucher.
// Sortie = design/cine-atlas/index.html (hors-funnel ; les médias vivent dans public/cine-atlas/,
// gitignorés, produits par cine-atlas-batch.mjs en local ou en CI). Offline, on-brand Le Veilleur.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'public', 'cine-atlas', 'manifest.json');
const OUTDIR = path.join(ROOT, 'design', 'cine-atlas');
const MEDIA = '../../public/cine-atlas/'; // relatif depuis design/cine-atlas/index.html

let items = [];
try { items = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { console.error('manifest absent — lance d\'abord cine-atlas-batch.mjs'); process.exit(1); }

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const regions = [...new Set(items.map(i => i.region))].sort();
const ratios = [...new Set(items.map(i => i.ratio))].sort();

const card = it => {
  const b = it.mp4.replace(/\.mp4$/, '');
  const cls = 'card r' + it.ratio.replace('x', '_');
  return `<figure class="${cls}" data-region="${esc(it.region)}" data-ratio="${esc(it.ratio)}" tabindex="0">
    <div class="frame">
      <video class="clip" preload="none" muted loop playsinline poster="${MEDIA}${esc(it.poster)}">
        <source src="${MEDIA}${esc(it.mp4)}" type="video/mp4">
      </video>
      <span class="badge">${esc(it.region.toUpperCase())} · ${esc(it.ratio)}</span>
    </div>
    <figcaption>
      <span class="nm" data-fr="${esc(it.labels.fr)}" data-en="${esc(it.labels.en)}" data-es="${esc(it.labels.es)}">${esc(it.labels.fr)}</span>
      <span class="hf">≈ ${esc(it.hf)}</span>
      <span class="meta">${esc(it.sec)}s · SVG→ffmpeg · 0 IA</span>
      <span class="dl"><a href="${MEDIA}${esc(it.mp4)}" download>mp4</a>${it.gif ? ` · <a href="${MEDIA}${esc(it.gif)}" download>gif</a>` : ''}</span>
    </figcaption>
  </figure>`;
};

const html = `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ciné-Atlas — Le Veilleur</title>
<style>
:root{--ink:#0D0D0D;--gold:#E8A800;--goldL:#FFC72C;--goldS:#FFE47A;--teal:#009E8E;--tealL:#1EC8B0;--bg:#070f14}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(120% 90% at 50% -10%,#123 0%,var(--bg) 60%) fixed;color:#eaf7f4;
  font:600 15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
header{padding:34px 22px 18px;max-width:1180px;margin:0 auto}
.wm{font:700 11px/1 system-ui;letter-spacing:.24em;color:var(--tealL);text-transform:uppercase}
h1{font:400 clamp(38px,9vw,74px)/.92 'Anton',Impact,'Haettenschweiler',sans-serif;letter-spacing:-.01em;
  text-transform:uppercase;margin:.12em 0 .1em;color:#fff}
.sub{font:600 14.5px/1.5 system-ui;color:rgba(234,247,244,.82);max-width:56ch}
.sub b{color:var(--goldS)}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 2px}
.bar .cnt{font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--goldS);letter-spacing:.02em}
.seg{display:inline-flex;gap:6px;flex-wrap:wrap}
.seg button{-webkit-appearance:none;appearance:none;cursor:pointer;background:rgba(255,255,255,.06);
  border:1px solid rgba(30,200,176,.35);color:#eaf7f4;border-radius:9px;min-height:38px;padding:0 12px;
  font:800 12px/1 system-ui;letter-spacing:.02em}
.seg button[aria-pressed="true"]{background:linear-gradient(135deg,var(--goldS),var(--goldL));color:#1a2b26;border-color:transparent}
.langs button{min-height:38px}
main{max-width:1180px;margin:0 auto;padding:14px 22px 60px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.card{margin:0;background:#0c1620;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden;
  box-shadow:0 8px 24px rgba(0,0,0,.35);transition:transform .12s ease,border-color .12s ease}
.card:hover,.card:focus-within{transform:translateY(-3px);border-color:rgba(30,200,176,.6);outline:none}
.frame{position:relative;aspect-ratio:9/16;background:#01060c}
.card.r16_9 .frame{aspect-ratio:16/9}
.clip{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.badge{position:absolute;top:8px;left:8px;font:800 9.5px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;
  color:#1a2b26;background:var(--goldS);border-radius:6px;padding:4px 7px}
figcaption{padding:11px 12px 13px;display:flex;flex-direction:column;gap:3px}
.nm{font:400 17px/1 'Anton',Impact,sans-serif;letter-spacing:.01em;text-transform:uppercase;color:#fff}
.hf{font:700 10px/1.2 ui-monospace,Menlo,Consolas,monospace;color:var(--tealL);opacity:.85}
.meta{font:700 9.5px/1.2 ui-monospace,Menlo,Consolas,monospace;color:rgba(234,247,244,.55);margin-top:2px}
.dl{font:800 11px/1 system-ui;margin-top:6px}
.dl a{color:var(--goldL);text-decoration:none;border-bottom:1px solid rgba(255,199,44,.4)}
.foot{max-width:1180px;margin:0 auto;padding:0 22px 48px;color:rgba(234,247,244,.6);font:600 12.5px/1.6 system-ui}
.foot b{color:var(--goldS)}
@media (prefers-reduced-motion:reduce){.card{transition:none}}
</style></head>
<body>
<header>
  <div class="wm">Le Veilleur · Comics Group</div>
  <h1>Ciné-Atlas</h1>
  <p class="sub">Le catalogue de <b>clips ciné on-brand</b> — mouvements de caméra maison joués sur nos scènes SVG,
  rendus <b>SVG→ffmpeg</b>. <b>100 % gratuit · zéro IA · zéro crédit.</b> Là où les autres facturent des crédits IA,
  on scale le volume à coût marginal nul. <b>Illustration d'ambiance</b> — le verdict réel, mesuré au satellite, vit sur la page.</p>
  <div class="bar">
    <span class="cnt" id="cnt"></span>
    <span class="seg" id="fRegion" role="group" aria-label="Région"></span>
    <span class="seg" id="fRatio" role="group" aria-label="Format"></span>
    <span class="seg langs" id="fLang" role="group" aria-label="Langue">
      <button data-lang="fr" aria-pressed="true">FR</button><button data-lang="en" aria-pressed="false">EN</button><button data-lang="es" aria-pressed="false">ES</button>
    </span>
  </div>
</header>
<main><div class="grid" id="grid">
${items.map(card).join('\n')}
</div></main>
<p class="foot"><b>${items.length} clips</b> · usine <code>scripts/design/cine-atlas-batch.mjs</code> (idempotent, capé, <code>--regions/--ratios/--skills/--limit</code>)
· galerie régénérée par <code>scripts/design/gen-cine-atlas.cjs</code> · médias dans <code>public/cine-atlas/</code> (produits en local ou CI).
Le verdict reste 100 % ERDDAP ; l'argent ne le touche jamais.</p>
<script>
(function(){
  var grid=document.getElementById('grid'), cards=[].slice.call(grid.children);
  // hover/tap = play ; leave = pause (léger : preload=none, jamais 100 vidéos qui tournent)
  cards.forEach(function(c){
    var v=c.querySelector('video'); if(!v)return;
    var play=function(){ if(matchMedia('(prefers-reduced-motion:reduce)').matches)return; v.play().catch(function(){}); };
    var stop=function(){ try{v.pause();}catch(e){} };
    c.addEventListener('mouseenter',play); c.addEventListener('mouseleave',stop);
    c.addEventListener('focus',play); c.addEventListener('blur',stop);
    c.addEventListener('click',function(){ v.paused?play():stop(); });
  });
  // filtres région / ratio
  var regions=${JSON.stringify(regions)}, ratios=${JSON.stringify(ratios)};
  var state={region:'all',ratio:'all',lang:'fr'};
  function seg(host,vals,key){
    var mk=function(val,lab){var b=document.createElement('button');b.textContent=lab;b.setAttribute('aria-pressed',String(state[key]===val));
      b.addEventListener('click',function(){state[key]=val;[].forEach.call(host.children,function(x){x.setAttribute('aria-pressed','false');});b.setAttribute('aria-pressed','true');apply();});host.appendChild(b);};
    mk('all','Tout'); vals.forEach(function(v){mk(v,v.toUpperCase());});
  }
  seg(document.getElementById('fRegion'),regions,'region');
  seg(document.getElementById('fRatio'),ratios,'ratio');
  function apply(){
    var n=0;
    cards.forEach(function(c){
      var ok=(state.region==='all'||c.dataset.region===state.region)&&(state.ratio==='all'||c.dataset.ratio===state.ratio);
      c.style.display=ok?'':'none'; if(ok)n++;
    });
    document.getElementById('cnt').textContent=n+' clips';
  }
  document.getElementById('fLang').addEventListener('click',function(e){
    var btn=e.target.closest('button'); if(!btn)return; state.lang=btn.dataset.lang;
    [].forEach.call(this.children,function(x){x.setAttribute('aria-pressed',String(x===btn));});
    document.documentElement.lang=state.lang;
    cards.forEach(function(c){var nm=c.querySelector('.nm'); if(nm&&nm.dataset[state.lang])nm.textContent=nm.dataset[state.lang];});
  });
  apply();
})();
</script>
</body></html>`;

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'index.html'), html);
console.log(`[cine-atlas] galerie → design/cine-atlas/index.html (${items.length} clips)`);

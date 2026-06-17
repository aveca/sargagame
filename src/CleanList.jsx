/**
 * CleanList — /plages-sans-sargasses/ (bras A/B `clean_list`)
 * Port du design VALIDÉ design/proto-planb-clean-nearby.html en page FAR plein-écran.
 *
 * Architecture du port :
 *   - CSS + markup SVG du proto portés ~1:1, montés en Shadow DOM
 *   - Le moteur d'animation 1 rAF (Veilleur, yole, reflets) adapté du proto
 *   - Cartes construites en createElement (jamais innerHTML)
 *   - Données réelles depuis rankBeaches filtré clean
 *
 * Additif : control = app/carte générique intacte. Override ?clean_list=1/0.
 */
import React,{useRef,useEffect} from "react"

/* ====================================================================
   CSS — porté du proto (design/proto-planb-clean-nearby.html)
   Adapté full-screen : z-index couvre l'app, fond #0a1620
   ==================================================================== */
const CL_CSS = `
:host{all:initial;position:fixed;inset:0;z-index:1050;overflow:hidden;
  font-family:"Bricolage Grotesque",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  color:#0D0D0D;background:#0a1620}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.anton{font-family:Anton,Impact,"Haettenschweiler","Arial Narrow",sans-serif;
  letter-spacing:-.02em;text-transform:uppercase}

#scene{position:absolute;inset:0;width:100%;height:100%}

#planb{
  position:absolute;left:0;right:0;bottom:0;
  padding:14px clamp(12px,4vw,28px) max(14px,env(safe-area-inset-bottom));
  background:linear-gradient(180deg,rgba(8,21,18,0) 0%,rgba(8,21,18,.55) 32%,rgba(7,18,15,.92) 100%);
  pointer-events:none}
#planb>*{pointer-events:auto}

.pb-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px}
.pb-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#009E8E;
  display:flex;align-items:center;gap:7px}
.pb-title{margin:2px 0 0;font-size:clamp(20px,5.2vw,26px);line-height:1.02;color:#fff}
.pb-title em{font-style:normal;color:#FFC72C}
.pb-sub{font-size:12px;color:rgba(255,255,255,.62);margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pb-live{display:inline-flex;align-items:center;gap:5px;color:#1EC8B0;font-weight:700}
.pb-live b{width:6px;height:6px;border-radius:50%;background:#1EC8B0;display:inline-block}

.pb-rail{display:flex;gap:11px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding:2px 2px 4px;margin:0 -2px;scrollbar-width:none;-webkit-overflow-scrolling:touch;
  overscroll-behavior:contain}
.pb-rail::-webkit-scrollbar{display:none}

.card{flex:0 0 auto;width:172px;scroll-snap-align:start;cursor:pointer;
  background:#FFFFFF;border:1px solid rgba(13,13,13,.10);border-radius:16px;overflow:hidden;
  box-shadow:0 6px 18px rgba(0,0,0,.22);text-align:left;font-family:inherit;padding:0;
  transition:transform .18s ease, box-shadow .18s ease;will-change:transform}
.card:hover,.card:focus-visible{transform:translateY(-3px);box-shadow:0 12px 26px rgba(0,0,0,.30);outline:none}
.card:active{transform:translateY(-1px) scale(.99)}
.card.is-best{width:188px;border-color:rgba(255,199,44,.55);box-shadow:0 8px 22px rgba(232,168,0,.30)}

.thumb{position:relative;height:90px;overflow:hidden}
.thumb svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.badge{position:absolute;top:8px;left:8px;font-size:10px;font-weight:800;letter-spacing:.04em;
  padding:3px 8px;border-radius:999px;color:#06231d;background:#22C55E}
.ribbon{position:absolute;top:0;right:0;background:#E8A800;color:#2a1c00;font-size:9.5px;font-weight:800;
  letter-spacing:.08em;padding:3px 9px;border-bottom-left-radius:10px;text-transform:uppercase}

.body{padding:9px 11px 11px}
.bname{font-size:14px;font-weight:800;color:#0D0D0D;line-height:1.1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bplace{font-size:11px;color:#686868;margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brow{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.bdist{font-size:11px;font-weight:700;color:#009E8E;display:flex;align-items:center;gap:4px}
.bdist.nodist{color:#B87A00}
.bscore{display:flex;align-items:baseline;gap:2px}
.bscore .n{font-size:17px;font-weight:800;color:#0D0D0D}
.bscore .d{font-size:10px;color:#686868}
.conf{font-size:10px;color:#686868;margin-top:6px;display:flex;align-items:center;gap:5px}
.conf .bar{flex:1;height:3px;border-radius:2px;background:rgba(13,13,13,.10);overflow:hidden}
.conf .bar>i{display:block;height:100%;background:#009E8E;border-radius:2px}

.card.more{width:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.30);color:#fff;
  box-shadow:none;padding:12px}
.card.more:hover{background:rgba(255,255,255,.12)}
.card.more .mi{width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(255,255,255,.5);
  display:flex;align-items:center;justify-content:center;font-size:16px}
.card.more span{font-size:11px;font-weight:700;text-align:center;line-height:1.15}

@media (prefers-reduced-motion: reduce){
  .card{transition:none}
}
`


/* ═══════════════════════════════════════════════════════════════════════
   SCENE SVG MARKUP — porté du proto, byte-identique
   ═══════════════════════════════════════════════════════════════════════ */
const SCENE_MARKUP = `<svg id="scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="clSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0B2230"/><stop offset=".42" stop-color="#155A5A"/>
      <stop offset=".72" stop-color="#C97E3A"/><stop offset="1" stop-color="#F2B05E"/>
    </linearGradient>
    <linearGradient id="clSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1A5852"/><stop offset="1" stop-color="#08251F"/>
    </linearGradient>
    <radialGradient id="clSunG" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFF3CE"/><stop offset=".5" stop-color="#FFD884"/>
      <stop offset="1" stop-color="#FFD884" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="clHaze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a3a1e" stop-opacity="0"/><stop offset="1" stop-color="#1C1712"/>
    </linearGradient>
    <filter id="clSoft"><feGaussianBlur stdDeviation="1.1"/></filter>
  </defs>

  <rect width="800" height="600" fill="url(#clSky)"/>
  <circle cx="560" cy="232" r="120" fill="url(#clSunG)"/>
  <circle cx="560" cy="232" r="38" fill="#FFF1C4"/>

  <path d="M0,308 Q120,286 240,300 T520,296 Q640,290 800,302 L800,330 L0,330 Z" fill="#0d3330" opacity=".55"/>

  <rect y="318" width="800" height="170" fill="url(#clSea)"/>
  <g id="clReflect" opacity=".7">
    <rect x="540" y="324" width="40" height="3" rx="1.5" fill="#FFD884" opacity=".8"/>
    <rect x="536" y="338" width="48" height="3" rx="1.5" fill="#FFD884" opacity=".6"/>
    <rect x="544" y="354" width="34" height="3" rx="1.5" fill="#FFD884" opacity=".5"/>
    <rect x="532" y="372" width="56" height="4" rx="2" fill="#FFD884" opacity=".4"/>
  </g>

  <g id="clSarg" opacity=".92">
    <path d="M0,470 Q90,452 200,464 Q320,476 430,460 L460,500 Q300,512 140,506 Q60,504 0,510 Z" fill="#3a3f22"/>
    <path d="M0,486 Q120,472 260,484 Q360,492 470,482 L470,520 L0,520 Z" fill="#2c3019"/>
  </g>

  <rect y="500" width="800" height="100" fill="#1C1712"/>
  <rect y="488" width="800" height="40" fill="url(#clHaze)"/>
  <path d="M0,500 Q200,490 400,500 T800,500 L800,506 L0,506 Z" fill="#FFD884" opacity=".35"/>

  <g id="clYole" transform="translate(300,408)">
    <g id="clYoleRock">
      <path d="M-30,4 Q0,22 30,4 L24,12 Q0,24 -24,12 Z" fill="#0b3b38"/>
      <path d="M-30,4 Q0,18 30,4 L30,2 Q0,14 -30,2 Z" fill="#13514c"/>
      <rect x="-26" y="-2" width="52" height="4" rx="2" fill="#E8522A"/>
      <rect x="-26" y="-6" width="52" height="4" rx="2" fill="#FFC72C"/>
      <rect x="-26" y="-10" width="52" height="4" rx="2" fill="#009E8E"/>
      <line x1="0" y1="-10" x2="0" y2="-40" stroke="#5b4a2a" stroke-width="2.4"/>
      <path d="M0,-40 L18,-16 L0,-16 Z" fill="#FBF3DC" opacity=".92"/>
    </g>
  </g>

  <g id="clVeilleur" transform="translate(610,150)">
    <g id="clVBody">
      <g opacity=".95">
        <rect x="-78" y="-9" width="48" height="20" rx="3" fill="#0e3b46"/>
        <rect x="-78" y="-9" width="48" height="20" rx="3" fill="none" stroke="#1EC8B0" stroke-width="1" opacity=".5"/>
        <line x1="-62" y1="-9" x2="-62" y2="11" stroke="#08252b" stroke-width="1"/>
        <line x1="-46" y1="-9" x2="-46" y2="11" stroke="#08252b" stroke-width="1"/>
        <rect x="30" y="-9" width="48" height="20" rx="3" fill="#0e3b46"/>
        <rect x="30" y="-9" width="48" height="20" rx="3" fill="none" stroke="#1EC8B0" stroke-width="1" opacity=".5"/>
        <line x1="46" y1="-9" x2="46" y2="11" stroke="#08252b" stroke-width="1"/>
        <line x1="62" y1="-9" x2="62" y2="11" stroke="#08252b" stroke-width="1"/>
      </g>
      <rect x="-26" y="-20" width="52" height="42" rx="11" fill="#10434b"/>
      <rect x="-26" y="-20" width="52" height="42" rx="11" fill="none" stroke="#1EC8B0" stroke-width="1.4" opacity=".55"/>
      <g transform="translate(0,2)">
        <circle r="13" fill="#0c2f33"/>
        <circle r="8.5" fill="#1EC8B0"/>
        <circle r="4" fill="#06231d"/>
        <circle cx="-2.5" cy="-2.5" r="1.6" fill="#Eafff9" opacity=".9"/>
      </g>
      <line x1="0" y1="-20" x2="0" y2="-34" stroke="#1EC8B0" stroke-width="2"/>
      <circle cx="0" cy="-34" r="2.6" fill="#FFC72C"/>
    </g>
    <g id="clBeam" opacity=".5">
      <path id="clBeamPath" d="M0,14 L-46,150 L46,150 Z" fill="#1EC8B0" opacity=".16" filter="url(#clSoft)"/>
    </g>
  </g>
</svg>`


/* ═══════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
function _t(lang,fr,en,es){return lang==="en"?en:lang==="es"?es:fr}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function thumbSVG(seed){var rnd=mulberry(seed);var palms=seed%3===0?2:(seed%2===0?1:0);var p="";for(var i=0;i<palms;i++){var px=30+Math.floor(rnd()*120),py=44+Math.floor(rnd()*6);p+='<g transform="translate('+px+','+py+')">'+'<path d="M0,0 q-2,-14 -1,-26" stroke="#13514c" stroke-width="3" fill="none"/>'+'<path d="M-1,-26 q-12,-2 -20,4 M-1,-26 q12,-2 20,4 M-1,-26 q-6,-9 -14,-12 M-1,-26 q6,-9 14,-12" stroke="#1a6b5f" stroke-width="2.4" fill="none" stroke-linecap="round"/>'+'</g>';}return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172 90" preserveAspectRatio="xMidYMid slice">'+'<defs><linearGradient id="ct'+seed+'" x1="0" y1="0" x2="0" y2="1">'+'<stop offset="0" stop-color="#9bd9cf"/><stop offset="1" stop-color="#1EC8B0"/></linearGradient></defs>'+'<rect width="172" height="90" fill="#FFE9B0"/>'+'<circle cx="132" cy="22" r="13" fill="#FFF1C4"/>'+'<rect y="34" width="172" height="34" fill="url(#ct'+seed+')"/>'+'<rect y="33" width="172" height="2" fill="#fff" opacity=".5"/>'+'<path d="M0,62 Q86,56 172,62 L172,90 L0,90 Z" fill="#F2D9A0"/>'+p+'</svg>'}
function fmtFreshness(ts,lang){var h=(Date.now()-ts)/3.6e6;if(h<12)return _t(lang,"EN DIRECT - il y a "+Math.max(1,Math.round(h))+" h","LIVE - "+Math.max(1,Math.round(h))+"h ago","EN VIVO - hace "+Math.max(1,Math.round(h))+" h");return _t(lang,"vérification en cours...","checking...","verificando...")}
function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n}
function svgNode(s){return(new DOMParser()).parseFromString(s,"image/svg+xml").documentElement}
function buildCard(b,i,lang,geo,onOpen){var best=i===0;var card=el("button","card"+(best?" is-best":""));card.setAttribute("aria-label",b.name+" "+b.commune+", "+_t(lang,"propre, score","clean, score","limpia, score")+" "+b.score+" /100");var thumb=el("div","thumb");thumb.appendChild(svgNode(thumbSVG(b._seed||(b.id.charCodeAt(0)||1))));thumb.appendChild(el("span","badge",_t(lang,"PROPRE","CLEAN","LIMPIA")));if(best)thumb.appendChild(el("span","ribbon",_t(lang,"le + sûr","safest","más segura")));card.appendChild(thumb);var body=el("div","body");body.appendChild(el("div","bname",b.name));body.appendChild(el("div","bplace",b.commune+(b.kids?" - "+_t(lang,"enfants ok","kids ok","niños ok"):"")));var row=el("div","brow");var distVal=geo&&b._dist!=null?_t(lang,"vers ","to ","hasta ")+b._dist.toFixed(0)+" km":_t(lang,"env. ","about ","aprox. ")+(b.drive?b.drive+" min":"");var dist=el("span","bdist"+(geo?"":" nodist"),distVal);var sc=el("span","bscore");sc.appendChild(el("span","n",String(b.score!=null?b.score:"—")));sc.appendChild(el("span","d","/100"));row.appendChild(dist);row.appendChild(sc);body.appendChild(row);var confVal=b._conf!=null?b._conf:60;var conf=el("div","conf");conf.appendChild(el("span",null,_t(lang,"fiabilité","reliability","fiabilidad")));var bar=el("span","bar");var fill=el("i");fill.style.width=confVal+"%";bar.appendChild(fill);conf.appendChild(bar);conf.appendChild(el("b",null,confVal+"%"));body.appendChild(conf);card.appendChild(body);card.addEventListener("click",function(){onOpen(b)});return card}


/* ====================================================================
   INIT ENGINE — monte scene + rail dans shadow root, 1 rAF
   ==================================================================== */
export function initCleanList(SR, HOST, opts){
  var cleaners=[];
  function on(el,ev,fn,o){el.addEventListener(ev,fn,o);cleaners.push(function(){el.removeEventListener(ev,fn,o);});}
  var dead=false,rafId=0;
  var LANG=opts.lang||"fr";
  var CLEAN=opts.cleanBeaches||[];
  var UPDATED_AT=opts.updatedAt||null;
  var GEO=opts.userPos!=null;
  var H=opts.hooks||{};
  function track(n,p){if(!dead&&H.track)try{H.track(n,p||{});}catch(e){}}
  function onOpenBeach(b){if(!dead&&H.onOpenBeach)H.onOpenBeach(b);}
  function onShowMap(){if(!dead&&H.onShowMap)H.onShowMap();}

  var beam=SR.getElementById("clBeam");
  var vBody=SR.getElementById("clVBody");
  var yoleRock=SR.getElementById("clYoleRock");
  var reflect=SR.getElementById("clReflect");

  function render(){
    var rail=SR.getElementById("clRail");if(!rail)return;
    while(rail.firstChild)rail.removeChild(rail.firstChild);
    var kicker=SR.getElementById("clKicker");
    if(kicker)kicker.textContent=_t(LANG,"Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy");
    var liveTxt=SR.getElementById("clLiveTxt");
    if(liveTxt&&UPDATED_AT)liveTxt.textContent=fmtFreshness(new Date(UPDATED_AT).getTime(),LANG);
    var title=SR.getElementById("clTitle");
    if(title){while(title.firstChild)title.removeChild(title.firstChild);
      title.appendChild(document.createTextNode(_t(LANG,"Le meilleur choix : ","Best picks: ","Lo mejor: ")));
      var em=document.createElement("em");em.textContent=_t(LANG,CLEAN.length+" plages propres",CLEAN.length+" clean beaches",CLEAN.length+" playas limpias");title.appendChild(em);}
    CLEAN.forEach(function(b,i){rail.appendChild(buildCard(b,i,LANG,GEO,onOpenBeach));});
    var more=el("button","card more");
    var mi=el("div","mi","🗺");more.appendChild(mi);
    more.appendChild(el("span",null,_t(LANG,"Toutes sur la carte","All on the map","Todas en el mapa")));
    more.addEventListener("click",function(){onShowMap()});rail.appendChild(more);
  }

  var RM=matchMedia("(prefers-reduced-motion:reduce)").matches;
  var running=false;
  function wake(){if(RM||dead||running)return;running=true;rafId=requestAnimationFrame(loop);}
  function loop(ts){if(dead||RM){running=false;return}var t=ts/1000;vBody.setAttribute("transform","scale("+(1+Math.sin(t*0.7)*0.012)+")");beam.setAttribute("transform","rotate("+(Math.sin(t*0.28)*10)+")");reflect.setAttribute("transform","translate(0,"+(Math.sin(t*0.5)*1.2)+")");yoleRock.setAttribute("transform","rotate("+(Math.sin(t*0.45)*2.2)+")");rafId=requestAnimationFrame(loop);}
  function applyRM(){if(RM){cancelAnimationFrame(rafId);running=false;vBody.setAttribute("transform","scale(1)");beam.setAttribute("transform","rotate(-6)");yoleRock.setAttribute("transform","rotate(0)");reflect.setAttribute("transform","translate(0,0)");}else{wake();}}
  on(document,"visibilitychange",function(){if(document.hidden){cancelAnimationFrame(rafId);running=false;}else applyRM();});
  render();applyRM();
  return{teardown:function(){if(dead)return;dead=true;cancelAnimationFrame(rafId);running=false;for(var i=0;i<cleaners.length;i++)try{cleaners[i]()}catch(e){}},
    update:function(n){if(dead)return;if(n.lang)LANG=n.lang;if(n.cleanBeaches)CLEAN=n.cleanBeaches;if(n.updatedAt)UPDATED_AT=n.updatedAt;GEO=n.userPos!=null;render();}};
}


/* ═══════════════════════════════════════════════════════════════════════
   COMPOSANT REACT — hôte shadow + cycle de vie
   Props: lang, sargData, cleanBeaches, userPos, onOpenBeach, onShowMap, track
   ═══════════════════════════════════════════════════════════════════════ */
export default function CleanList(props){
  const {lang,sargData,cleanBeaches,userPos,onOpenBeach,onShowMap,track}=props;
  const hostRef=useRef(null);
  const engRef=useRef(null);
  const cbRef=useRef({});
  cbRef.current={onOpenBeach,onShowMap,track};

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const SR=host.shadowRoot||host.attachShadow({mode:"open"});
    while(SR.firstChild)SR.removeChild(SR.firstChild);
    const styleEl=document.createElement("style");styleEl.textContent=CL_CSS;SR.appendChild(styleEl);
    SR.appendChild(document.createRange().createContextualFragment(SCENE_MARKUP));
    var planb=document.createElement("section");planb.id="planb";
    planb.setAttribute("aria-label",_t(lang,"Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy"));
    planb.innerHTML=['<div class="pb-head"><div>','<div class="pb-kicker"><span id="clKicker"></span></div>','<h2 class="pb-title anton" id="clTitle"></h2>','<div class="pb-sub"><span class="pb-live"><b></b><span id="clLiveTxt"></span></span></div>','</div></div>','<div class="pb-rail" id="clRail"></div>'].join("");
    SR.appendChild(planb);
    const hooks={track:(n,p)=>{try{cbRef.current.track&&cbRef.current.track(n,p);}catch(e){}},onOpenBeach:(b)=>{try{cbRef.current.onOpenBeach&&cbRef.current.onOpenBeach(b);}catch(e){}},onShowMap:()=>{try{cbRef.current.onShowMap&&cbRef.current.onShowMap();}catch(e){}}};
    let eng=null;
    try{eng=initCleanList(SR,host,{lang:lang||"fr",cleanBeaches:cleanBeaches||[],updatedAt:sargData&&(sargData.updatedAt||sargData.erddapTimestamp),userPos:userPos,hooks:hooks});}catch(e){if(typeof console!=="undefined")console.error("CleanList init:",e);}
    engRef.current=eng;
    return()=>{try{eng&&eng.teardown();}catch(e){}engRef.current=null;try{while(SR.firstChild)SR.removeChild(SR.firstChild);}catch(e){}};
  },[]);

  useEffect(()=>{if(engRef.current)engRef.current.update({lang:lang||"fr",cleanBeaches:cleanBeaches||[],updatedAt:sargData&&(sargData.updatedAt||sargData.erddapTimestamp),userPos:userPos});},[lang,cleanBeaches&&cleanBeaches.length,cleanBeaches&&cleanBeaches.map(b=>b&&b.id+"_"+b.score).join(","),sargData&&(sargData.updatedAt||sargData.erddapTimestamp),userPos&&userPos.lat]);

  return React.createElement("div",{ref:hostRef,role:"dialog","aria-label":_t(lang,"Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy"),style:{position:"absolute",inset:0,zIndex:1050,overflow:"hidden",background:"#0a1620"}});
}


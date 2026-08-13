import{A as T,d as _,y as H,g as Q}from"./react-vendor-CLzekduW.js";const U=[{slug:"baignade-ideale",titleMq:"Plages parfaites pour la baignade aujourd’hui — Martinique",titleGp:"Plages parfaites pour la baignade aujourd’hui — Guadeloupe",h1Mq:"Les meilleures plages pour la baignade aujourd’hui en Martinique",h1Gp:"Les meilleures plages pour la baignade aujourd’hui en Guadeloupe",intro:"Ces plages combinent aujourd’hui un état sargasses propre, une mer calme et une eau chaude. Idéal pour une sortie en famille, un bain prolongé ou des vacanciers peu habitués aux courants caribbean.",filter:(e,t)=>e.status==="clean"&&t&&t.condition==="calm",fallback:"Aucune plage ne réunit aujourd’hui les trois critères idéaux (propre + mer calme + eau chaude). Consultez la carte pour identifier le meilleur compromis du moment."},{slug:"mer-calme",titleMq:"Plages avec mer calme aujourd’hui — Martinique",titleGp:"Plages avec mer calme aujourd’hui — Guadeloupe",h1Mq:"Plages avec mer calme en Martinique aujourd’hui",h1Gp:"Plages avec mer calme en Guadeloupe aujourd’hui",intro:"Données marines Open-Meteo mises à jour quotidiennement. Une mer calme (vagues inférieures à 0,8 m) facilite la baignade avec de jeunes enfants, le snorkeling et le paddle. Les conditions peuvent changer rapidement : vérifiez la fiche détaillée de chaque plage avant de partir.",filter:(e,t)=>t&&(t.condition==="calm"||t.waveHeight!=null&&t.waveHeight<.8),fallback:"Aucune plage ne présente une mer calme aujourd’hui. La houle est généralisée — optez plutôt pour des spots abrités côte sous-le-vent."},{slug:"mer-agitee",titleMq:"Plages avec mer agitée aujourd’hui — Martinique (surf, bodyboard)",titleGp:"Plages avec mer agitée aujourd’hui — Guadeloupe (surf, bodyboard)",h1Mq:"Plages avec mer agitée en Martinique aujourd’hui",h1Gp:"Plages avec mer agitée en Guadeloupe aujourd’hui",intro:"Pour les surfeurs, bodyboarders et longboarders qui cherchent de la vague. Mais attention : ces conditions sont déconseillées aux enfants et aux baigneurs occasionnels. Vérifiez le drapeau de baignade sur place.",filter:(e,t)=>t&&(t.condition==="rough"||t.waveHeight!=null&&t.waveHeight>=1.5),fallback:"Aucune plage n’affiche une mer agitée aujourd’hui. Conditions très plates — revenez demain."},{slug:"uv-fort",titleMq:"Plages avec UV très fort aujourd’hui — Martinique (protégez-vous)",titleGp:"Plages avec UV très fort aujourd’hui — Guadeloupe (protégez-vous)",h1Mq:"Indice UV très fort aujourd’hui en Martinique",h1Gp:"Indice UV très fort aujourd’hui en Guadeloupe",intro:"Un indice UV supérieur ou égal à 9 correspond à un risque très élevé de coup de soleil en moins de 15 minutes sans protection. Évitez l’exposition entre 11 h et 15 h, utilisez un écran solaire SPF 50, portez chapeau et t-shirt anti-UV pour les enfants.",filter:(e,t)=>t&&t.uvMax!=null&&t.uvMax>=9,fallback:"L’indice UV est modéré partout aujourd’hui — conditions plus souples pour la journée à la plage."},{slug:"plages-enfants",titleMq:"Plages adaptées aux enfants aujourd’hui — Martinique",titleGp:"Plages adaptées aux enfants aujourd’hui — Guadeloupe",h1Mq:"Plages idéales pour les enfants en Martinique aujourd’hui",h1Gp:"Plages idéales pour les enfants en Guadeloupe aujourd’hui",intro:"Sélection de plages adaptées aux enfants : eau peu profonde, mer calme et sans sargasses. Parfait pour que les plus petits s'amusent en toute sécurité sous surveillance.",filter:(e,t)=>e.status==="clean"&&e.kids&&t&&(t.condition==="calm"||t.waveHeight!=null&&t.waveHeight<.8),fallback:"Aucune plage adaptée aux enfants et propre n’est disponible aujourd’hui. Privilégiez les piscines ou les anses très abritées."},{slug:"snorkeling",titleMq:"Meilleurs spots de snorkeling aujourd’hui — Martinique",titleGp:"Meilleurs spots de snorkeling aujourd’hui — Guadeloupe",h1Mq:"Où faire du snorkeling en Martinique aujourd’hui",h1Gp:"Où faire du snorkeling en Guadeloupe aujourd’hui",intro:"Découvrez la richesse des fonds marins antillais. Ces spots de snorkeling (racks rocheux, herbiers, barrière de corail) combinent aujourd’hui une eau propre et une mer peu agitée pour une visibilité optimale.",filter:(e,t)=>e.status==="clean"&&e.snorkel&&t&&(t.condition==="calm"||t.waveHeight!=null&&t.waveHeight<1),fallback:"Aucun spot de snorkeling avec une bonne visibilité et sans sargasses n’est disponible aujourd’hui. La mer peut être agitée ou trouble."}],N=`
:host{all:initial;position:fixed;inset:0;z-index:1050;overflow:hidden;
  font-family:"Bricolage Grotesque",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  color:#0D0D0D;background:#190c2c}
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
.pb-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#E8A800;
  display:flex;align-items:center;gap:7px}
.pb-title{margin:2px 0 0;font-size:clamp(18px,4.8vw,24px);line-height:1.05;color:#fff}
.pb-title em{font-style:normal;color:#FFC72C}
.pb-sub{font-size:12px;color:rgba(255,255,255,.62);margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pb-live{display:inline-flex;align-items:center;gap:5px;color:#1c7fb0;font-weight:700}
.pb-live b{width:6px;height:6px;border-radius:50%;background:#1c7fb0;display:inline-block}

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
.badge.avoid{color:#ffffff;background:#e8522a}
.badge.mod{color:#06231d;background:#FFC72C}
.ribbon{position:absolute;top:0;right:0;background:#E8A800;color:#2a1c00;font-size:9.5px;font-weight:800;
  letter-spacing:.08em;padding:3px 9px;border-bottom-left-radius:10px;text-transform:uppercase}

.body{padding:9px 11px 11px}
.bname{font-size:14px;font-weight:800;color:#0D0D0D;line-height:1.1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bplace{font-size:11px;color:#686868;margin-top:1px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brow{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
.bdist{font-size:11px;font-weight:700;color:#156a96;display:flex;align-items:center;gap:4px}
.bdist.nodist{color:#B87A00}
.bscore{display:flex;align-items:baseline;gap:2px}
.bscore .n{font-size:17px;font-weight:800;color:#0D0D0D}
.bscore .d{font-size:10px;color:#686868}
.bweather{font-size:10.5px;color:#555;margin-top:6px;font-weight:500;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.card.more{width:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.30);color:#fff;
  box-shadow:none;padding:12px}
.card.more:hover{background:rgba(255,255,255,.12)}
.card.more .mi{width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(255,255,255,.5);
  display:flex;align-items:center;justify-content:center;font-size:16px}
.card.more span{font-size:11px;font-weight:700;text-align:center;line-height:1.15}

.back-btn{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.12);
  border-radius:12px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;gap:6px;transition:background .15s}
.back-btn:hover{background:rgba(255,255,255,.16)}

@media (prefers-reduced-motion: reduce){
  .card{transition:none}
}
`,Z=`<svg id="scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="clSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2e1a5e"/><stop offset=".42" stop-color="#6a2f9e"/>
      <stop offset=".72" stop-color="#C97E3A"/><stop offset="1" stop-color="#F2B05E"/>
    </linearGradient>
    <linearGradient id="clSea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1A5852"/><stop offset="1" stop-color="#190c2c"/>
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
      <rect x="-26" y="-10" width="52" height="4" rx="2" fill="#156a96"/>
      <line x1="0" y1="-10" x2="0" y2="-40" stroke="#5b4a2a" stroke-width="2.4"/>
      <path d="M0,-40 L18,-16 L0,-16 Z" fill="#FBF3DC" opacity=".92"/>
    </g>
  </g>

  <g id="clVeilleur" transform="translate(610,150)">
    <g id="clVBody">
      <g opacity=".95">
        <rect x="-78" y="-9" width="48" height="20" rx="3" fill="#0e3b46"/>
        <rect x="-78" y="-9" width="48" height="20" rx="3" fill="none" stroke="#1c7fb0" stroke-width="1" opacity=".5"/>
        <line x1="-62" y1="-9" x2="-62" y2="11" stroke="#08252b" stroke-width="1"/>
        <line x1="-46" y1="-9" x2="-46" y2="11" stroke="#08252b" stroke-width="1"/>
        <rect x="30" y="-9" width="48" height="20" rx="3" fill="#0e3b46"/>
        <rect x="30" y="-9" width="48" height="20" rx="3" fill="none" stroke="#1c7fb0" stroke-width="1" opacity=".5"/>
        <line x1="46" y1="-9" x2="46" y2="11" stroke="#08252b" stroke-width="1"/>
        <line x1="62" y1="-9" x2="62" y2="11" stroke="#08252b" stroke-width="1"/>
      </g>
      <rect x="-26" y="-20" width="52" height="42" rx="11" fill="#10434b"/>
      <rect x="-26" y="-20" width="52" height="42" rx="11" fill="none" stroke="#1c7fb0" stroke-width="1.4" opacity=".55"/>
      <g transform="translate(0,2)">
        <circle r="13" fill="#0c2f33"/>
        <circle r="8.5" fill="#1c7fb0"/>
        <circle r="4" fill="#06231d"/>
        <circle cx="-2.5" cy="-2.5" r="1.6" fill="#Eafff9" opacity=".9"/>
      </g>
      <line x1="0" y1="-20" x2="0" y2="-34" stroke="#1c7fb0" stroke-width="2"/>
      <circle cx="0" cy="-34" r="2.6" fill="#FFC72C"/>
    </g>
    <g id="clBeam" opacity=".5">
      <path id="clBeamPath" d="M0,14 L-46,150 L46,150 Z" fill="#1c7fb0" opacity=".16" filter="url(#clSoft)"/>
    </g>
  </g>
</svg>`;function c(e,t,i,a){return e==="en"?i:e==="es"?a:t}function Y(e){return function(){e|=0,e=e+1831565813|0;var t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function $(e){for(var t=Y(e),i=e%3===0?2:e%2===0?1:0,a="",b=0;b<i;b++){var h=30+Math.floor(t()*120),f=44+Math.floor(t()*6);a+='<g transform="translate('+h+","+f+')"><path d="M0,0 q-2,-14 -1,-26" stroke="#13514c" stroke-width="3" fill="none"/><path d="M-1,-26 q-12,-2 -20,4 M-1,-26 q12,-2 20,4 M-1,-26 q-6,-9 -14,-12 M-1,-26 q6,-9 14,-12" stroke="#1a6b5f" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>'}return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ct'+e+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9bd9cf"/><stop offset="1" stop-color="#1c7fb0"/></linearGradient></defs><rect width="172" height="90" fill="#FFE9B0"/><circle cx="132" cy="22" r="13" fill="#FFF1C4"/><rect y="34" width="172" height="34" fill="url(#ct'+e+')"/><rect y="33" width="172" height="2" fill="#fff" opacity=".5"/><path d="M0,62 Q86,56 172,62 L172,90 L0,90 Z" fill="#F2D9A0"/>'+a+"</svg>"}function K(e,t){var i=(Date.now()-e)/36e5;return i<12?c(t,"EN DIRECT - il y a "+Math.max(1,Math.round(i))+" h","LIVE - "+Math.max(1,Math.round(i))+"h ago","EN VIVO - hace "+Math.max(1,Math.round(i))+" h"):c(t,"vérification en cours...","checking...","verificando...")}function u(e,t,i){var a=document.createElement(e);return t&&(a.className=t),i!=null&&(a.textContent=i),a}function W(e){return new DOMParser().parseFromString(e,"image/svg+xml").documentElement}function J(e,t,i,a,b,h){var f=t===0,d=u("button","card"+(f?" is-best":"")),C={clean:c(i,"PROPRE","CLEAN","LIMPIA"),moderate:c(i,"MODÉRÉ","MODERATE","MODERADO"),avoid:c(i,"À ÉVITER","AVOID","EVITAR")};d.setAttribute("aria-label",e.name+" "+e.commune+", score "+e.score+" /100");var x=u("div","thumb");x.appendChild(W($(e._seed||e.id.charCodeAt(0)||1)));var k=e.status==="avoid"?"badge avoid":e.status==="moderate"?"badge mod":"badge";x.appendChild(u("span",k,C[e.status]||C.clean)),f&&x.appendChild(u("span","ribbon",c(i,"le + sûr","safest","más segura"))),d.appendChild(x);var g=u("div","body");g.appendChild(u("div","bname",e.name)),g.appendChild(u("div","bplace",e.commune+(e.kids?" - "+c(i,"enfants ok","kids ok","niños ok"):"")));var l=u("div","brow"),v=a&&e._dist!=null?c(i,"vers ","to ","hasta ")+e._dist.toFixed(0)+" km":c(i,"env. ","about ","aprox. ")+(e.drive?e.drive+" min":""),E=u("span","bdist"+(a?"":" nodist"),v),s=u("span","bscore");s.appendChild(u("span","n",String(e.score!=null?e.score:"—"))),s.appendChild(u("span","d","/100")),l.appendChild(E),l.appendChild(s),g.appendChild(l);var n=h||{},y=[];n.waveHeight!=null&&y.push(`🌊 ${n.waveHeight}m`),n.sst!=null&&y.push(`🌡️ ${n.sst}°C`),n.uvMax!=null&&y.push(`☀️ UV ${n.uvMax}`);var M=y.join(" · ")||c(i,"météo agréable","pleasant weather","clima agradable");return g.appendChild(u("div","bweather",M)),d.addEventListener("click",function(){b(e)}),d}function X(e,t,i){var a=[];function b(r,o,L,B){r.addEventListener(o,L,B),a.push(function(){r.removeEventListener(o,L,B)})}var h=!1,f=0,d=i.lang||"fr",C=i.beaches||[],x=i.weather||{},k=i.updatedAt||null,g=i.userPos!=null,l=i.hooks||{},v=i.slug||"hub",E=i.island||"mq",s=e.getElementById("clBeam"),n=e.getElementById("clVBody"),y=e.getElementById("clYoleRock"),M=e.getElementById("clReflect");function G(){var r=e.getElementById("clRail");if(r){for(;r.firstChild;)r.removeChild(r.firstChild);var o=U.find(A=>A.slug===v),L=e.getElementById("clKicker");L&&(L.textContent=o?c(d,"Conditions de baignade","Bathing conditions","Condiciones de baño"):c(d,"Toutes les conditions","All conditions","Todas las condiciones"));var B=e.getElementById("clLiveTxt");B&&k&&(B.textContent=K(new Date(k).getTime(),d));var F=e.getElementById("clTitle");if(F){for(;F.firstChild;)F.removeChild(F.firstChild);if(o){var V=E==="gp"?o.h1Gp:o.h1Mq;F.appendChild(document.createTextNode(V))}else F.appendChild(document.createTextNode(c(d,"Sélecteur de conditions","Conditions Selector","Selector de condiciones")))}var I=e.querySelector(".pb-sub");if(I&&o){var w=e.getElementById("clIntroPara");w?w.textContent=o.intro:(w=u("p","intro-p",o.intro),w.id="clIntroPara",w.style.color="rgba(255,255,255,.72)",w.style.fontSize="13px",w.style.margin="4px 0 10px",w.style.lineHeight="1.4",I.parentNode.insertBefore(w,I.nextSibling))}var P=[];if(o&&(P=C.filter(A=>o.filter(A,x[A.id]))),P.length>0)P.forEach(function(A,R){r.appendChild(J(A,R,d,g,l.onOpenBeach,x[A.id]))});else{var D=u("div","empty-msg",o?o.fallback:c(d,"Sélectionnez un filtre dans le menu","Select a filter in the menu","Seleccione un filtro en el menú"));D.style.color="rgba(255,255,255,.5)",D.style.fontSize="13.5px",D.style.padding="20px 10px",r.appendChild(D)}var z=u("button","card more"),O=u("div","mi","🗺️");z.appendChild(O),z.appendChild(u("span",null,c(d,"Toutes sur la carte","All on the map","Todas en el mapa"))),z.addEventListener("click",function(){l.onShowMap()}),r.appendChild(z)}}var j=matchMedia("(prefers-reduced-motion:reduce)").matches,m=!1;function p(){j||h||m||(m=!0,f=requestAnimationFrame(q))}function q(r){if(h||j){m=!1;return}var o=r/1e3;n.setAttribute("transform","scale("+(1+Math.sin(o*.7)*.012)+")"),s.setAttribute("transform","rotate("+Math.sin(o*.28)*10+")"),M.setAttribute("transform","translate(0,"+Math.sin(o*.5)*1.2+")"),y.setAttribute("transform","rotate("+Math.sin(o*.45)*2.2+")"),f=requestAnimationFrame(q)}function S(){j?(cancelAnimationFrame(f),m=!1,n.setAttribute("transform","scale(1)"),s.setAttribute("transform","rotate(-6)"),y.setAttribute("transform","rotate(0)"),M.setAttribute("transform","translate(0,0)")):p()}return b(document,"visibilitychange",function(){document.hidden?(cancelAnimationFrame(f),m=!1):S()}),G(),S(),{teardown:function(){if(!h){h=!0,cancelAnimationFrame(f),m=!1;for(var r=0;r<a.length;r++)try{a[r]()}catch{}}},update:function(r){h||(r.lang&&(d=r.lang),r.beaches&&(C=r.beaches),r.weather&&(x=r.weather),r.updatedAt&&(k=r.updatedAt),g=r.userPos!=null,r.slug&&(v=r.slug),r.island&&(E=r.island),G())}}}function te(e){const{lang:t,sargData:i,allBeaches:a,beachesWeather:b,userPos:h,onOpenBeach:f,onShowMap:d,onPremium:C,track:x}=e,k=T(null),g=T(null),l=T({});l.current={onOpenBeach:f,onShowMap:d,onPremium:C,track:x};const[v,E]=_(()=>{try{const s=window.location.pathname.match(/^\/conditions\/(.+)\/?$/);return s?s[1].replace(/\/$/,""):"hub"}catch{return"hub"}});return H(()=>{const s=k.current;if(!s)return;const n=s.shadowRoot||s.attachShadow({mode:"open"});for(;n.firstChild;)n.removeChild(n.firstChild);const y=document.createElement("style");y.textContent=N,n.appendChild(y),n.appendChild(document.createRange().createContextualFragment(Z));var M=document.createElement("section");M.id="planb",M.innerHTML=['<div class="pb-head">',"  <div>",'    <div class="pb-kicker" style="display:flex;align-items:center;gap:10px">','      <button id="clBackBtn" class="back-btn">← Home</button>','      <span id="clKicker"></span>',"    </div>",'    <h2 class="pb-title anton" id="clTitle"></h2>','    <div class="pb-sub"><span class="pb-live"><b></b><span id="clLiveTxt"></span></span></div>',"  </div>","</div>",'<div class="pb-rail" id="clRail"></div>'].join(""),n.appendChild(M);const G=n.getElementById("clBackBtn");G&&G.addEventListener("click",()=>{try{l.current.onShowMap&&l.current.onShowMap()}catch{}});const j={track:(p,q)=>{try{l.current.track&&l.current.track(p,q)}catch{}},onOpenBeach:p=>{try{l.current.onOpenBeach&&l.current.onOpenBeach(p)}catch{}},onShowMap:()=>{try{l.current.onShowMap&&l.current.onShowMap()}catch{}}};let m=null;try{const p=a&&a[0]?a[0].island:"mq";m=X(n,s,{lang:t||"fr",beaches:a||[],weather:b||{},updatedAt:i&&(i.updatedAt||i.erddapTimestamp),userPos:h,hooks:j,slug:v,island:p})}catch(p){console.error("Conditions init failed:",p)}g.current=m;try{l.current.track&&l.current.track("sg_conditions_view",{slug:v})}catch{}return()=>{try{m&&m.teardown()}catch{}g.current=null;try{for(;n.firstChild;)n.removeChild(n.firstChild)}catch{}}},[v]),H(()=>{g.current&&g.current.update({lang:t||"fr",beaches:a||[],weather:b||{},updatedAt:i&&(i.updatedAt||i.erddapTimestamp),userPos:h,slug:v,island:a&&a[0]?a[0].island:"mq"})},[t,a==null?void 0:a.length,a==null?void 0:a.map(s=>s.id+"_"+s.status).join(","),b,i,h,v]),Q.createElement("div",{ref:k,role:"dialog","aria-label":t==="es"?"Condiciones de las playas":t==="en"?"Beach conditions":"Conditions des plages",style:{position:"absolute",inset:0,zIndex:1050,overflow:"hidden",background:"#190c2c"}})}export{te as default,X as initConditions};

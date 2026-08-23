import{A as B,y as z,g as P}from"./react-vendor-CLzekduW.js";const Q=`
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
.pb-kicker{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#156a96;
  display:flex;align-items:center;gap:7px}
.pb-title{margin:2px 0 0;font-size:clamp(20px,5.2vw,26px);line-height:1.02;color:#fff}
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
.conf{font-size:10px;color:#686868;margin-top:6px;display:flex;align-items:center;gap:5px}
.conf .bar{flex:1;height:3px;border-radius:2px;background:rgba(13,13,13,.10);overflow:hidden}
.conf .bar>i{display:block;height:100%;background:#156a96;border-radius:2px}

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
`,O=`<svg id="scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
</svg>`;function l(e,i,t,a){return e==="en"?t:e==="es"?a:i}function V(e){return function(){e|=0,e=e+1831565813|0;var i=Math.imul(e^e>>>15,1|e);return i=i+Math.imul(i^i>>>7,61|i)^i,((i^i>>>14)>>>0)/4294967296}}function _(e){for(var i=V(e),t=e%3===0?2:e%2===0?1:0,a="",g=0;g<t;g++){var c=30+Math.floor(i()*120),s=44+Math.floor(i()*6);a+='<g transform="translate('+c+","+s+')"><path d="M0,0 q-2,-14 -1,-26" stroke="#13514c" stroke-width="3" fill="none"/><path d="M-1,-26 q-12,-2 -20,4 M-1,-26 q12,-2 20,4 M-1,-26 q-6,-9 -14,-12 M-1,-26 q6,-9 14,-12" stroke="#1a6b5f" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>'}return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="ct'+e+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9bd9cf"/><stop offset="1" stop-color="#1c7fb0"/></linearGradient></defs><rect width="172" height="90" fill="#FFE9B0"/><circle cx="132" cy="22" r="13" fill="#FFF1C4"/><rect y="34" width="172" height="34" fill="url(#ct'+e+')"/><rect y="33" width="172" height="2" fill="#fff" opacity=".5"/><path d="M0,62 Q86,56 172,62 L172,90 L0,90 Z" fill="#F2D9A0"/>'+a+"</svg>"}function j(e,i){var t=(Date.now()-e)/36e5;return t<12?l(i,"MESURÉ - il y a "+Math.max(1,Math.round(t))+" h","MEASURED - "+Math.max(1,Math.round(t))+"h ago","MEDIDO - hace "+Math.max(1,Math.round(t))+" h"):t<36?l(i,"mesuré il y a "+Math.round(t)+" h","measured "+Math.round(t)+"h ago","medido hace "+Math.round(t)+" h"):l(i,"donnée en retard ("+Math.round(t/24)+" j)","data delayed ("+Math.round(t/24)+"d)","dato en retraso ("+Math.round(t/24)+" d)")}function o(e,i,t){var a=document.createElement(e);return i&&(a.className=i),t!=null&&(a.textContent=t),a}function Z(e){return new DOMParser().parseFromString(e,"image/svg+xml").documentElement}function q(e,i,t,a,g){var c=i===0,s=o("button","card"+(c?" is-best":""));s.setAttribute("aria-label",e.name+" "+e.commune+", "+l(t,"propre, score","clean, score","limpia, score")+" "+e.score+" /100");var p=o("div","thumb");p.appendChild(Z(_(e._seed||e.id.charCodeAt(0)||1))),p.appendChild(o("span","badge",l(t,"PROPRE","CLEAN","LIMPIA"))),c&&p.appendChild(o("span","ribbon",l(t,"le + sûr","safest","más segura"))),s.appendChild(p);var h=o("div","body");h.appendChild(o("div","bname",e.name)),h.appendChild(o("div","bplace",e.commune+(e.kids?" - "+l(t,"enfants ok","kids ok","niños ok"):"")));var f=o("div","brow"),u=a&&e._dist!=null?l(t,"vers ","to ","hasta ")+e._dist.toFixed(0)+" km":l(t,"env. ","about ","aprox. ")+(e.drive?e.drive+" min":""),d=o("span","bdist"+(a?"":" nodist"),u),n=o("span","bscore");n.appendChild(o("span","n",String(e.score!=null?e.score:"—"))),n.appendChild(o("span","d","/100")),f.appendChild(d),f.appendChild(n),h.appendChild(f);var w=e._conf!=null?e._conf:60,x=o("div","conf");x.appendChild(o("span",null,l(t,"fiabilité","reliability","fiabilidad")));var C=o("span","bar"),y=o("i");return y.style.width=w+"%",C.appendChild(y),x.appendChild(C),x.appendChild(o("b",null,w+"%")),h.appendChild(x),s.appendChild(h),s.addEventListener("click",function(){g(e)}),s}function N(e,i,t){var a=[];function g(r,b,F,v){r.addEventListener(b,F,v),a.push(function(){r.removeEventListener(b,F,v)})}var c=!1,s=0,p=t.lang||"fr",h=t.cleanBeaches||[],f=t.updatedAt||null,u=t.userPos!=null,d=t.hooks||{};function n(r){!c&&d.onOpenBeach&&d.onOpenBeach(r)}function w(){!c&&d.onShowMap&&d.onShowMap()}var x=e.getElementById("clBeam"),C=e.getElementById("clVBody"),y=e.getElementById("clYoleRock"),m=e.getElementById("clReflect");function M(){var r=e.getElementById("clRail");if(r){for(;r.firstChild;)r.removeChild(r.firstChild);var b=e.getElementById("clKicker");b&&(b.textContent=l(p,"Ton plan B du matin","Your morning plan B","Tu plan B de la mañana"));var F=e.getElementById("clLiveTxt");F&&f&&(F.textContent=j(new Date(f).getTime(),p));var v=e.getElementById("clTitle");if(v){for(;v.firstChild;)v.removeChild(v.firstChild);v.appendChild(document.createTextNode(l(p,"Vérifiées ce matin : ","Verified this morning: ","Verificadas esta mañana: ")));var S=document.createElement("em");S.textContent=l(p,h.length+" plages propres",h.length+" clean beaches",h.length+" playas limpias"),v.appendChild(S)}h.forEach(function(R,I){r.appendChild(q(R,I,p,u,n))});var E=o("button","card more"),G=o("div","mi","🗺");E.appendChild(G),E.appendChild(o("span",null,l(p,"Voir toute la côte","See the whole coast","Ver toda la costa"))),E.addEventListener("click",function(){w()}),r.appendChild(E)}}var A=matchMedia("(prefers-reduced-motion:reduce)").matches,k=!1;function T(){A||c||k||(k=!0,s=requestAnimationFrame(L))}function L(r){if(c||A){k=!1;return}var b=r/1e3;C.setAttribute("transform","scale("+(1+Math.sin(b*.7)*.012)+")"),x.setAttribute("transform","rotate("+Math.sin(b*.28)*10+")"),m.setAttribute("transform","translate(0,"+Math.sin(b*.5)*1.2+")"),y.setAttribute("transform","rotate("+Math.sin(b*.45)*2.2+")"),s=requestAnimationFrame(L)}function D(){A?(cancelAnimationFrame(s),k=!1,C.setAttribute("transform","scale(1)"),x.setAttribute("transform","rotate(-6)"),y.setAttribute("transform","rotate(0)"),m.setAttribute("transform","translate(0,0)")):T()}return g(document,"visibilitychange",function(){document.hidden?(cancelAnimationFrame(s),k=!1):D()}),M(),D(),{teardown:function(){if(!c){c=!0,cancelAnimationFrame(s),k=!1;for(var r=0;r<a.length;r++)try{a[r]()}catch{}}},update:function(r){c||(r.lang&&(p=r.lang),r.cleanBeaches&&(h=r.cleanBeaches),r.updatedAt&&(f=r.updatedAt),u=r.userPos!=null,M())}}}function H(e){const{lang:i,sargData:t,cleanBeaches:a,userPos:g,onOpenBeach:c,onShowMap:s,track:p}=e,h=B(null),f=B(null),u=B({});return u.current={onOpenBeach:c,onShowMap:s,track:p},z(()=>{const d=h.current;if(!d)return;const n=d.shadowRoot||d.attachShadow({mode:"open"});for(;n.firstChild;)n.removeChild(n.firstChild);const w=document.createElement("style");w.textContent=Q,n.appendChild(w),n.appendChild(document.createRange().createContextualFragment(O));var x=document.createElement("section");x.id="planb",x.setAttribute("aria-label",l(i,"Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy")),x.innerHTML=['<div class="pb-head"><div>','<div class="pb-kicker"><span id="clKicker"></span></div>','<h2 class="pb-title anton" id="clTitle"></h2>','<div class="pb-sub"><span class="pb-live"><b></b><span id="clLiveTxt"></span></span></div>',"</div></div>",'<div class="pb-rail" id="clRail"></div>'].join(""),n.appendChild(x);const C={track:(m,M)=>{try{u.current.track&&u.current.track(m,M)}catch{}},onOpenBeach:m=>{try{u.current.onOpenBeach&&u.current.onOpenBeach(m)}catch{}},onShowMap:()=>{try{u.current.onShowMap&&u.current.onShowMap()}catch{}}};let y=null;try{y=N(n,d,{lang:i||"fr",cleanBeaches:a||[],updatedAt:t&&(t.updatedAt||t.erddapTimestamp),userPos:g,hooks:C})}catch(m){typeof console<"u"&&console.error("CleanList init:",m)}return f.current=y,()=>{try{y&&y.teardown()}catch{}f.current=null;try{for(;n.firstChild;)n.removeChild(n.firstChild)}catch{}}},[]),z(()=>{f.current&&f.current.update({lang:i||"fr",cleanBeaches:a||[],updatedAt:t&&(t.updatedAt||t.erddapTimestamp),userPos:g})},[i,a&&a.length,a&&a.map(d=>d&&d.id+"_"+d.score).join(","),t&&(t.updatedAt||t.erddapTimestamp),g&&g.lat]),P.createElement("div",{ref:h,role:"dialog","aria-label":l(i,"Plages propres aujourd'hui","Clean beaches today","Playas limpias hoy"),style:{position:"absolute",inset:0,zIndex:1050,overflow:"hidden",background:"#190c2c"}})}export{H as default,N as initCleanList};

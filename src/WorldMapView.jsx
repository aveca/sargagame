/**
 * WorldMapView — Carte SVG monde golden-hour
 * Port du proto design/proto-map-v2.html en React.
 * A/B `map_world` (variant) — control = ArchipelView (intact).
 * Region-aware : charge /data/region-outlines/<island>.json.
 * 5 régions : mq · gp · florida · puntacana · rivieramaya
 *
 * Props : beaches, island, updatedAt, lang, onOpenBeach, onPremium,
 *         onClose, rootMode, track
 */
import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react"
import { COAST_ZONES } from "../scripts/lib/coast-zones.cjs"

// Hub prévision premium « Ma semaine » — lazy (hors budget eager) ; ouvert au tap sur l'encart digest.
const LazyWeekHub = React.lazy(()=>import("./WeekHub"))


const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }
const INK = "#0d0b14"
// Monde GTA : chrome en verre sombre (glass) + boutons primaires or (cohérence hero).
const GLASS = { background:"rgba(20,11,32,.46)", border:"1px solid rgba(255,255,255,.22)", boxShadow:"0 8px 26px rgba(0,0,0,.42)", backdropFilter:"blur(11px)", WebkitBackdropFilter:"blur(11px)" }
const GOLD  = { background:"linear-gradient(180deg,#ffe07a,#ffb338)", border:"1px solid rgba(0,0,0,.18)", boxShadow:"0 8px 22px rgba(255,150,60,.45)" }
const STATUS_LBL = {
  clean:    ["Propre","Clean","Limpia"],
  moderate: ["Modéré","Moderate","Moderado"],
  avoid:    ["À éviter","Avoid","Evitar"],
}
// Plages à labelliser sur MQ (sous-chaînes)
const MQ_NAMED = ["Salines","Diamant","Tartane","Dufour","Anse Mitan","Anse Noire","Caravelle"]
const DAY_LBL  = [
  ["Auj","Today","Hoy"],
  ["+1j","+1d","+1d"],["+2j","+2d","+2d"],
  ["+3j","+3d","+3d"],["+4j","+4d","+4d"],["+5j","+5d","+5d"],
]

function ti(lang, arr){ return lang==="en"?arr[1]:lang==="es"?arr[2]:arr[0] }
function _t(lang, fr, en, es){ return lang==="es"?es:lang==="en"?en:fr }

function fmtFresh(updatedAt){
  try{
    const h=(Date.now()-new Date(updatedAt).getTime())/3.6e6
    if(h<1) return `${Math.round(h*60)} min`
    if(h<24) return `${h.toFixed(0)} h`
    return `${Math.round(h/24)} j`
  }catch(_){ return "···" }
}
// Honnêteté fraîcheur : si l'image satellite a >36h, Le Veilleur l'avoue (flag STALE)
// au lieu de faire semblant de tout voir en direct (Story Bible : « quand le Veilleur ne voit pas »).
function isStale(updatedAt){
  try{ return (Date.now()-new Date(updatedAt).getTime())/3.6e6 >= 36 }catch(_){ return false }
}

// Distance grand-cercle (km) entre 2 plages {lat,lng} — pour « où aller plutôt » (plan B).
function haversineKm(a, b){
  if(a==null||b==null||a.lat==null||a.lng==null||b.lat==null||b.lng==null) return Infinity
  const R=6371, toR=x=>x*Math.PI/180
  const dLat=toR(b.lat-a.lat), dLng=toR(b.lng-a.lng)
  const s=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)))
}

// Couleur antenne Veilleur selon proportion propres
function vantColor(beachList, day){
  // Compte parmi les statuts CONNUS uniquement : tant que rien n'est chargé, œil NEUTRE (gris),
  // sinon on flasherait vert ou rouge à tort pendant le loading.
  const known=beachList.filter(b=>{const s=b.days[day];return s==="clean"||s==="moderate"||s==="avoid"})
  const n=known.length; if(!n) return "#9aa0a8"
  const c=known.filter(b=>b.days[day]==="clean").length
  return c/n>=.6?"#22C55E":c/n>=.35?"#B87A00":"#E8522A"
}

// ── Splat de sargasse : blob comic seedé, lissé (quadratique par milieux). Déterministe
// (seed ← position) → le `d` est stable, donc bakable comme attribut statique. ────────────
function _rng(seed){ let s=((seed%233280)+233280)%233280; return ()=> (s=(s*9301+49297)%233280)/233280 }
function _splatPath(cx,cy,r,seed,N,jag){
  N=N||9; jag=jag==null?0.7:jag; const rand=_rng(seed), pts=[]
  for(let i=0;i<N;i++){ const a=(i/N)*Math.PI*2, rr=r*(1-jag*0.5+rand()*jag); pts.push([cx+Math.cos(a)*rr, cy+Math.sin(a)*rr]) }
  let d=`M${((pts[0][0]+pts[N-1][0])/2).toFixed(1)} ${((pts[0][1]+pts[N-1][1])/2).toFixed(1)}`
  for(let i=0;i<N;i++){ const p=pts[i], n=pts[(i+1)%N]
    d+=`Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0]+n[0])/2).toFixed(1)} ${((p[1]+n[1])/2).toFixed(1)}` }
  return d+"Z"
}

// ── EFFET D'ÉCHOUAGE "Le Grand Splat" (gagnant jury wapon6g69 + 5 greffes), porté du proto
// design/proto-sarga-beaching-wow.html. Couche LIVE au-dessus du monde baké, à un point de plage
// (ax,ay) PRÉVU touché. Construit des nœuds SVG impératifs dans `layer` → renvoie {render(t),frozen()}.
// Pas de pin (le pin de la carte sert de verdict). Banc dérive du large → s'écrase (anticipation)
// → EXPLOSE (splat pop overshoot + onde concentrique + speed-lines + écume + spray dont une partie
// s'absorbe le long du rivage) → dépôt figé incliné le long de la côte (halftone révélé) → fade → reboucle.
// STRICTEMENT transform+opacity (zéro filtre/blur, zéro mutation de 'd' par frame). seed → déterministe.
const _NSV="http://www.w3.org/2000/svg"
const _e=(n,a)=>{const x=document.createElementNS(_NSV,n);for(const k in a)x.setAttribute(k,a[k]);return x}
const _clmp=(v,a,b)=>v<a?a:v>b?b:v
const _ease=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2
const _eOut=p=>1-Math.pow(1-p,3)
function _spawnBeaching(layer, ax, ay, cx, cy, S, seed, eta){
  const oa=Math.atan2(ay-cy, ax-cx)                 // "vers le large" (depuis le centre de l'île)
  const ox=ax+Math.cos(oa)*130, oy=ay+Math.sin(oa)*130
  const ta=oa+Math.PI/2, TANx=Math.cos(ta), TANy=Math.sin(ta)   // tangente du rivage
  const SKx=-Math.cos(oa), SKy=-Math.sin(oa)        // vers la terre (absorption)
  const coastDeg=(ta*180/Math.PI).toFixed(1)
  // BANC
  const bank=_e("g",{}); { const R=22*S, sil=_splatPath(0,0,R,seed,11,0.55)
    bank.appendChild(_e("path",{d:sil,fill:INK,opacity:".3",transform:"translate(2 3)"}))
    bank.appendChild(_e("path",{d:sil,fill:"url(#wmSarg)",stroke:INK,"stroke-width":2*S,"stroke-linejoin":"round"}))
    bank.appendChild(_e("path",{d:_splatPath(-R*0.22,-R*0.28,R*0.5,seed+3,7,0.5),fill:"#FFE9A8",opacity:".5"})) }
  // DÉPÔT (+ halftone révélé)
  const dep=_e("g",{opacity:"0"}); let depHt
  { const R=32*S, sil=_splatPath(0,0,R,seed,13,0.78)
    dep.appendChild(_e("path",{d:sil,fill:INK,opacity:".26",transform:"translate(2 3)"}))
    dep.appendChild(_e("path",{d:sil,fill:"url(#wmSarg)",stroke:INK,"stroke-width":2.2*S,"stroke-linejoin":"round"}))
    const rl=_rng(seed*7+3)
    for(let i=0;i<2;i++){const a=(0.15+rl()*0.7)*Math.PI, len=R*(0.9+rl()*0.6)
      dep.appendChild(_e("path",{d:_splatPath(Math.cos(a)*len,Math.abs(Math.sin(a))*len*0.7+R*0.3,(8+rl()*7)*S,seed*13+i*5,7,0.7),fill:"url(#wmSarg)",stroke:INK,"stroke-width":1.4*S,"stroke-linejoin":"round"}))}
    const rd=_rng(seed*11+2)
    for(let i=0;i<3;i++){dep.appendChild(_e("path",{d:_splatPath((rd()-.5)*R*1.1,(rd()-.5)*R*0.9,R*(0.18+rd()*0.12),seed*17+i*9,7,0.6),fill:"#5d5a1e",opacity:".5"}))}
    depHt=_e("path",{d:sil,fill:"url(#wmSargHalf)",opacity:"0"}); dep.appendChild(depHt)
    dep.appendChild(_e("path",{d:_splatPath(-R*0.28,-R*0.34,R*0.42,seed+5,8,0.5),fill:"#FFE9A8",opacity:".45"})) }
  // ÉCUME
  const foam=_e("g",{opacity:"0"}); { const r=40*S
    foam.appendChild(_e("path",{d:_splatPath(0,4*S,r,seed+1,12,0.6),fill:"none",stroke:"#eafcff","stroke-width":6*S,opacity:".9","stroke-linejoin":"round"}))
    const rf=_rng(seed*3+4)
    for(let i=0;i<5;i++){const a=(i/5)*6.28+rf()*0.4, rr=(46+rf()*16)*S
      foam.appendChild(_e("circle",{cx:(Math.cos(a)*rr).toFixed(1),cy:(Math.sin(a)*rr*0.7+6*S).toFixed(1),r:((2+rf()*2)*S).toFixed(1),fill:"#fff",opacity:".85"}))} }
  // ONDE concentrique
  const ripple=_e("g",{opacity:"0"})
  ripple.appendChild(_e("path",{d:_splatPath(0,0,28*S,seed+9,14,0.18),fill:"none",stroke:INK,"stroke-width":2.6*S,opacity:".7"}))
  ripple.appendChild(_e("path",{d:_splatPath(0,0,28*S,seed+9,14,0.18),fill:"none",stroke:"#FFE9A8","stroke-width":1.3*S,opacity:".9"}))
  // SPEED-LINES
  const lineG=_e("g",{}), lines=[]; { const rl=_rng(seed+99)
    for(let i=0;i<6;i++){const a=(i/6)*6.28+rl()*0.25
      const ln=_e("line",{x1:(Math.cos(a)*26*S).toFixed(1),y1:(Math.sin(a)*26*S).toFixed(1),x2:(Math.cos(a)*(62+rl()*30)*S).toFixed(1),y2:(Math.sin(a)*(62+rl()*30)*S).toFixed(1),stroke:"#FFE9A8","stroke-width":(2.4*S).toFixed(1),"stroke-linecap":"round",opacity:"0"})
      lineG.appendChild(ln); lines.push(ln)} }
  // GOUTTES : 4 tangente (absorb) + 3 splash
  const dropG=_e("g",{}), drops=[]
  { for(let i=0;i<4;i++){const sd=seed+i*37+11, rand=_rng(sd), L=(i/3-0.5)*2, dist=(40+Math.abs(L)*90)*S
      const tx=ax+TANx*L*dist+SKx*(Math.abs(L)*9*S), ty=ay+TANy*L*dist+SKy*(Math.abs(L)*9*S)
      const g=_e("g",{opacity:"0"}); g.appendChild(_e("path",{d:_splatPath(0,0,(2.4+rand()*3)*S,sd,7,0.55),fill:"url(#wmSarg)",stroke:INK,"stroke-width":1*S,"stroke-linejoin":"round"})); dropG.appendChild(g)
      drops.push({g,type:"shore",tx,ty,delay:Math.abs(L)*0.06,rot:(rand()*2-1)*120})}
    for(let i=0;i<3;i++){const sd=seed+i*53+200, rand=_rng(sd), ang=-2.5+rand()*1.9, spd=(80+rand()*120)*S
      const g=_e("g",{opacity:"0"}); g.appendChild(_e("path",{d:_splatPath(0,0,(2.2+rand()*3)*S,sd,7,0.55),fill:"url(#wmSarg)",stroke:INK,"stroke-width":1*S,"stroke-linejoin":"round"})); dropG.appendChild(g)
      drops.push({g,type:"splash",vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,delay:rand()*0.05,rot:(rand()*2-1)*180})} }
  dep.setAttribute("transform",`translate(${ax} ${ay})`); foam.setAttribute("transform",`translate(${ax} ${ay})`)
  ripple.setAttribute("transform",`translate(${ax} ${ay})`); lineG.setAttribute("transform",`translate(${ax} ${ay})`)
  layer.appendChild(dep); layer.appendChild(foam); layer.appendChild(ripple); layer.appendChild(dropG); layer.appendChild(bank); layer.appendChild(lineG)
  // BADGE « J+N » (ETA arrivée, action #2) — SANS FOND (préférence fondateur 22/06) : juste le texte,
  // contour encre (paint-order:stroke) → lisible sur n'importe quel fond, pas de panneau. Or = à venir
  // (J+1..3), corail = déjà là (J+0 « AUJ »). Pop à l'impact, persiste avec le dépôt. eta=null → pas de badge.
  let badge=null
  if(eta!=null){
    const label=eta<=0?"AUJ":"J+"+eta, col=eta<=0?"#E8522A":"#FFC72C"
    badge=_e("g",{opacity:"0"})
    // taille FIXE (pas ×S) : c'est un LABEL, il doit rester lisible même à la vue régionale où le
    // splat est petit. Léger fond-ombre encre derrière (2e text décalé) pour décoller du fond.
    const sh=_e("text",{x:0,y:2,"text-anchor":"middle","font-family":"'AntonLC','Anton',sans-serif","font-weight":"400","font-size":"34",fill:INK,opacity:".35"}); sh.textContent=label; badge.appendChild(sh)
    const txt=_e("text",{x:0,y:0,"text-anchor":"middle","font-family":"'AntonLC','Anton',sans-serif","font-weight":"400","font-size":"34",fill:col,stroke:INK,"stroke-width":"4.5","paint-order":"stroke","stroke-linejoin":"round"})
    txt.textContent=label
    badge.appendChild(txt)
    layer.appendChild(badge)
  }
  const BY=ay-38 // position du badge (au-dessus de l'impact), décalage fixe
  const T_AP=1.10,T_IM=1.18,T_SE=1.55,T_FA=3.05,T_LP=3.35
  function render(t){
    if(t<T_IM){ const p=_ease(_clmp(t/T_AP,0,1)), x=ox+(ax-ox)*p, y=oy+(ay-oy)*p, sc=0.7+p*0.55
      const sq=t>T_AP?1+(t-T_AP)/(T_IM-T_AP)*0.7:1, bob=Math.sin(t*5)*4*S*(1-p)
      bank.setAttribute("transform",`translate(${x.toFixed(1)} ${(y+bob).toFixed(1)}) scale(${(sc*sq).toFixed(3)} ${(sc/sq).toFixed(3)})`)
      bank.setAttribute("opacity",t>T_AP?(1-(t-T_AP)/(T_IM-T_AP)).toFixed(2):"1")
    } else bank.setAttribute("opacity","0")
    if(t>=T_IM){ const pg=_clmp((t-T_IM)/(T_SE-T_IM),0,1), sc=(0.25+_eOut(pg)*0.75)*(1+0.12*Math.sin(pg*Math.PI))
      let op=1; if(t>T_FA) op=_clmp(1-(t-T_FA)/(T_LP-T_FA),0,1)
      dep.setAttribute("transform",`translate(${ax} ${ay}) rotate(${coastDeg}) scale(${sc.toFixed(3)})`)
      dep.setAttribute("opacity",op.toFixed(2)); depHt.setAttribute("opacity",(_eOut(pg)*0.34*op).toFixed(2))
    } else dep.setAttribute("opacity","0")
    { const dt=t-T_IM; let lp=dt<0?0:dt<0.05?dt/0.05:dt<0.30?1-(dt-0.05)/0.25:0; lp=_clmp(lp,0,1)
      lineG.setAttribute("transform",`translate(${ax} ${ay}) scale(${(0.6+lp*0.6).toFixed(3)})`)
      for(const ln of lines) ln.setAttribute("opacity",(lp*0.9).toFixed(2)) }
    { const dt=t-T_IM, rp=dt<0||dt>0.26?0:1-dt/0.26, rsc=1+_eOut(_clmp(dt/0.26,0,1))*3
      ripple.setAttribute("transform",`translate(${ax} ${ay}) scale(${rsc.toFixed(3)})`); ripple.setAttribute("opacity",_clmp(rp,0,1).toFixed(2)) }
    { const dt=t-T_IM; let fp=dt<0?0:dt<0.5?Math.sin((dt/0.5)*Math.PI*0.9):0; fp=_clmp(fp,0,1)
      foam.setAttribute("transform",`translate(${ax} ${ay}) scale(${(0.5+_eOut(_clmp(dt/0.5,0,1))*0.9).toFixed(3)})`); foam.setAttribute("opacity",fp.toFixed(2)) }
    { const dt=t-T_IM
      for(const d of drops){ const lt=dt-d.delay
        if(lt<0||lt>0.9){ d.g.setAttribute("opacity","0"); continue }
        if(d.type==="shore"){ const fly=_eOut(_clmp(lt/0.34,0,1)), x=ax+(d.tx-ax)*fly, y=ay+(d.ty-ay)*fly, ab=_clmp((lt-0.55)/0.3,0,1)
          d.g.setAttribute("transform",`translate(${x.toFixed(1)} ${(y+ab*4*S).toFixed(1)}) scale(${(_clmp(1-lt*0.45,0.4,1)*(1-ab*0.55)).toFixed(2)}) rotate(${(d.rot*fly).toFixed(0)})`)
          d.g.setAttribute("opacity",_clmp(ab<1?1-ab:0,0,1).toFixed(2))
        } else { const x=ax+d.vx*lt, y=ay+d.vy*lt+320*S*lt*lt, op=lt<0.6?1:1-(lt-0.6)/0.25
          d.g.setAttribute("transform",`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${_clmp(1-lt*0.5,0.4,1).toFixed(2)}) rotate(${(d.rot*lt).toFixed(0)})`)
          d.g.setAttribute("opacity",_clmp(op,0,1).toFixed(2)) } } }
    if(badge){ const dt=t-T_IM; let bp=dt<0?0:dt<0.25?dt/0.25:1; if(t>T_FA) bp*=_clmp(1-(t-T_FA)/(T_LP-T_FA),0,1)
      const bs=0.5+_eOut(_clmp(dt/0.3,0,1))*0.5
      badge.setAttribute("transform",`translate(${ax} ${BY}) scale(${bs.toFixed(3)})`); badge.setAttribute("opacity",bp.toFixed(2)) }
  }
  function frozen(){
    bank.setAttribute("opacity","0"); ripple.setAttribute("opacity","0")
    for(const ln of lines) ln.setAttribute("opacity","0"); for(const d of drops) d.g.setAttribute("opacity","0")
    dep.setAttribute("transform",`translate(${ax} ${ay}) rotate(${coastDeg}) scale(1)`); dep.setAttribute("opacity","1"); depHt.setAttribute("opacity","0.34")
    if(badge){ badge.setAttribute("transform",`translate(${ax} ${BY}) scale(1)`); badge.setAttribute("opacity","1") }
    foam.setAttribute("transform",`translate(${ax} ${ay}) scale(1.1)`); foam.setAttribute("opacity",".3")
  }
  return {render, frozen}
}

// Ellipses de relief (Martinique uniquement)
const MQ_RELIEF = [[14.79,-61.10,24],[14.74,-61.10,18],[14.70,-61.07,20],[14.52,-61.06,15],[14.47,-60.92,12]]

export default function WorldMapView({
  beaches, island, updatedAt, lang, onOpenBeach, onPremium, onClose, rootMode, track, initialZone, warm, onCaptureEmail, arrivals, topInset=0, onOpenPro, isPremium=false, forecastByBeach=null, onShare=null, seasonOutlook=null,
}){
  // Entrée B2B discrète sur la carte (découvrabilité Pro). Rollback : ?promap=0.
  const proMapOff = (()=>{try{return /[?&]promap=0/.test(window.location.search)}catch(_){return false}})()
  // Prévision 7j sur la carte = bénéfice Premium n°1 (le « waouh » qui retire les
  // cadenas pour un client payant). Rollback : ?mapforecast=0 → revient au teaser
  // verrouillé pour TOUT le monde. La donnée affichée reste 100% RÉELLE (forecastByBeach,
  // composite ERDDAP+forecast) ou absente (pin gris) — JAMAIS fabriquée (loi du moat).
  const mapForecastOff = (()=>{try{return /[?&]mapforecast=0/.test(window.location.search)}catch(_){return false}})()
  const mapPremium = !!isPremium && !mapForecastOff
  const [premiumHint, setPremiumHint] = useState(false)
  // Mode « dérive Premium » sur les jours futurs : échouage en BOUCLE (sensation
  // d'arrivée continue) + halo qui pulse sur les plages prévues touchées + badge
  // « touchée J+N » + sens de dérive. Tout piloté par la donnée RÉELLE (days[day]/drift/
  // firstHit) — jamais de trajectoire inventée. Rollback : ?mapdrift=0 → retombe sur
  // l'échouage once+fade + pins statiques (= comportement gratuit/aujourd'hui).
  const mapDriftOff = (()=>{try{return /[?&]mapdrift=0/.test(window.location.search)}catch(_){return false}})()
  // « La Frise » (panel UX 2026-06-30) : prévision 7j GLANCEABLE sans slider — frise
  // 6 cases dans le tooltip de la plage tapée + badge « bascule J+N » ambiant sur les
  // pins. Supprime les 2 bannières superposées + le hint « fais glisser ». Le slider
  // reste câblé mais OPTIONNEL. Rollback : ?mapfrise=0 → ancien comportement (slider
  // primaire + 2 bannières). Donnée 100% réelle (days/conf/firstHit/drift), 0 fabrication.
  const mapFriseOff = (()=>{try{return /[?&]mapfrise=0/.test(window.location.search)}catch(_){return false}})()
  const friseOn = mapPremium && !mapFriseOff
  // Couche DÉCISION — « où aller plutôt » (plan B, loi anti-cul-de-sac) : si la plage
  // tapée est moderate/avoid le jour AFFICHÉ, on propose la plage PROPRE la plus proche
  // (haversine), tapable. Basé sur le statut du jour VISIBLE uniquement (gratuit = figé
  // J0 = data publique, zéro fuite de prévision premium). Rollback : ?mapdecide=0.
  const mapDecideOff = (()=>{try{return /[?&]mapdecide=0/.test(window.location.search)}catch(_){return false}})()
  // Carte partageable (boucle virale, growth) : bouton « partager ma plage » sur la plage
  // sélectionnée → carte canvas golden-hour spoiler-free (réutilise shareBeachCard du parent,
  // navigator.share natif). Rollback : ?mapshare=0.
  const mapShareOff = (()=>{try{return /[?&]mapshare=0/.test(window.location.search)}catch(_){return false}})()
  // (Swipe-to-scrub retiré 2026-06-30 : conflit avec le pan de la carte, confirmé fondateur.)
  // Hub « Ma semaine » (« La Vigie », panel 2026-06-30) : l'encart digest devient tapable ->
  // ouvre le hub prévision premium (lazy). Rollback : ?weekhub=0 (l'encart redevient un simple
  // résumé non cliquable, état actuel exact) ; ?weekhubseason=0 masque le seul BLOC 5 planner.
  const weekhubOff = (()=>{try{return /[?&]weekhub=0/.test(window.location.search)}catch(_){return false}})()
  const weekhubSeasonOff = (()=>{try{return /[?&]weekhubseason=0/.test(window.location.search)}catch(_){return false}})()
  const [showHub, setShowHub] = useState(false)
  const digestBtnRef = useRef(null) // restauration du focus à la fermeture du hub
  // Aperçu vendeur B2B : ?preview_name=<hôtel> → carte « Partenaire (aperçu) » flottante,
  // pour montrer à un hôtelier (depuis /pro/espace/) comment il apparaîtra. L'argent ne
  // touche JAMAIS le verdict — encart `sponsored`/aperçu, le verdict reste 100% data.
  const previewHotel = (()=>{try{const m=window.location.search.match(/[?&]preview_name=([^&]+)/);return m?decodeURIComponent(m[1]).replace(/[<>]/g,"").slice(0,48):null}catch(_){return null}})()
  const wrapRef    = useRef(null)
  const worldRef   = useRef(null)  // <g id="world"> — transform mis à jour en RAF
  const camRef     = useRef({ tx:0, ty:0, k:1 })
  const rafRef     = useRef(0)
  const animRef    = useRef(0)
  const ptrsRef    = useRef({})
  const pinchRef   = useRef(null)
  const lastTapRef = useRef(0)
  const tagTimerRef= useRef(null)
  const hintTimerRef= useRef(null)  // hint Premium one-shot au déverrouillage du scrub
  const reduceRef  = useRef(false)
  const labelLayerRef = useRef(null)
  const bakeRef    = useRef(null)  // <svg> source du monde statique → rasterisé en bitmap (Stage 2)
  const bakedObjUrlRef = useRef(null)  // objectURL du PNG baké (toBlob) → à révoquer (anti-leak)
  const fxRef      = useRef(null)  // couche live des effets d'échouage (au-dessus du monde baké)
  const fieldRef   = useRef(null)  // couche live du champ de sargasses au large (dérive lente)
  const audioRef   = useRef(null)  // AudioContext (lazy, débloqué au 1er geste)
  const audioUnlockedRef = useRef(false)
  const mutedRef   = useRef(false)
  const [muted, setMuted] = useState(false)
  const [soundReplay, setSoundReplay] = useState(0) // bump au 1er geste → rejoue l'échouage AVEC le son

  // Débloque l'AudioContext (les navigateurs le tiennent « suspended » tant qu'aucun geste
  // utilisateur) — à appeler depuis un handler de geste. Idempotent.
  const ensureAudio = useCallback(()=>{
    try{
      if(!audioRef.current){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null; audioRef.current=new AC() }
      if(audioRef.current.state==="suspended") audioRef.current.resume()
    }catch(_){ return null }
    return audioRef.current
  },[])

  // « BOUMP / SHROUMP » d'échouage : thump grave (sine 155→56 Hz) + lavage de bruit filtré
  // (la sargasse qui s'étale sur le sable). 100 % synthétisé WebAudio — zéro asset, zéro IA.
  // Gaté : audio débloqué (geste) + pas mute + pas reduced-motion. Doux, one-shot, non bloquant.
  const playBoump = useCallback((strength=1)=>{
    if(mutedRef.current||reduceRef.current) return
    const ac=audioRef.current
    if(!ac||ac.state!=="running") return
    try{
      const now=ac.currentTime, s=Math.max(.4,Math.min(1.3,strength))
      const o=ac.createOscillator(), g=ac.createGain()
      o.type="sine"; o.frequency.setValueAtTime(155,now); o.frequency.exponentialRampToValueAtTime(56,now+.19)
      g.gain.setValueAtTime(.0001,now); g.gain.exponentialRampToValueAtTime(.22*s,now+.015); g.gain.exponentialRampToValueAtTime(.0001,now+.33)
      o.connect(g); g.connect(ac.destination); o.start(now); o.stop(now+.35)
      const dur=.26, n=Math.floor(ac.sampleRate*dur), buf=ac.createBuffer(1,n,ac.sampleRate), ch=buf.getChannelData(0)
      for(let i=0;i<n;i++){ const t=i/n; ch[i]=(Math.random()*2-1)*(1-t)*(1-t) } // bruit décroissant = « shhh »
      const ns=ac.createBufferSource(); ns.buffer=buf
      const bp=ac.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=820; bp.Q.value=.7
      const ng=ac.createGain(); ng.gain.setValueAtTime(.0001,now); ng.gain.exponentialRampToValueAtTime(.17*s,now+.03); ng.gain.exponentialRampToValueAtTime(.0001,now+.28)
      ns.connect(bp); bp.connect(ng); ng.connect(ac.destination); ns.start(now); ns.stop(now+.3)
    }catch(_){}
  },[])

  const [outline, setOutline]   = useState(null)
  const [bakedUrl, setBakedUrl] = useState(null)  // PNG data-URL du monde statique baké (GPU-composité)
  const [pinTier,  setPinTier]  = useState({})    // id→'dot'|'full' : déclutter des pins denses (zoom-aware)
  const [loadErr, setLoadErr]   = useState(false)
  const [day,     setDay]       = useState(0)
  const [selected, setSelected] = useState(null)  // beach object enrichi
  const [tagPos,  setTagPos]    = useState(null)  // {x,y} screen pixels
  const [query,   setQuery]     = useState("")    // P7 — recherche plage par nom

  // Capture email SUR LA CARTE — la carte SVG est la vue d'accueil validée en prod, donc
  // la surface PAR DÉFAUT (décision fondateur 21/06 : capture = surface par défaut). Mêmes
  // clés que le hero (sg_email / sg_hero_email_dismiss) → capter/rejeter ici vaut partout.
  // L'email remonte via onCaptureEmail → submitLead (pipe résilient sendBeacon, levier #1).
  const [emailVal,   setEmailVal]    = useState("")
  const [emailSent,  setEmailSent]   = useState(false)
  const [emailHidden,setEmailHidden] = useState(()=>{
    try{ return !!localStorage.getItem("sg_email")||!!localStorage.getItem("sg_hero_email_dismiss") }catch{ return false }
  })
  const submitMapEmail = ()=>{
    if(!emailVal||!emailVal.includes("@")) return
    try{ localStorage.setItem("sg_email",emailVal) }catch(_){}
    try{ onCaptureEmail&&onCaptureEmail(emailVal) }catch(_){}
    try{ track&&track("sg_map_email_submit",{island}) }catch(_){}
    setEmailSent(true)
  }

  // prefers-reduced-motion
  useEffect(()=>{
    try{ reduceRef.current=window.matchMedia("(prefers-reduced-motion:reduce)").matches }catch(_){}
  },[])

  // Charge le contour côtier régional
  useEffect(()=>{
    setOutline(null); setLoadErr(false); setSelected(null); setTagPos(null)
    fetch(`/data/region-outlines/${island}.json`)
      .then(r=>r.json()).then(setOutline)
      .catch(()=>setLoadErr(true))
  },[island])

  // Grille satellite AFAI (la matière sur l'eau) — pour la dessiner sur la carte SVG.
  const[afaiGrid,setAfaiGrid]=useState(null)
  useEffect(()=>{
    fetch("/api/copernicus/sargassum-grid.json").then(r=>r.json())
      .then(d=>{if(d&&d.points&&d.points.length)setAfaiGrid(d)}).catch(()=>{})
  },[])

  // toVB(lat,lng) → [vx,vy] dans l'espace viewBox 800×600
  const toVB = useMemo(()=>{
    if(!outline) return null
    const{proj,bbox}=outline
    return(lat,lng)=>[
      proj.offX+(lng-bbox.minLng)*proj.kx*proj.sc,
      proj.offY+(bbox.maxLat-lat)*proj.sc,
    ]
  },[outline])

  // Liste des plages enrichies : position viewBox + prévision RÉELLE J0-J5.
  // days[0] = statut du jour autoritatif (b.status, avec override communautaire).
  // days[1..5] = prévision RÉELLE (forecastByBeach, composite ERDDAP+forecast) si
  // disponible, sinon `null` → pin gris « donnée non disponible » (loi du moat :
  // jamais de couleur fabriquée). Ces jours ne sont LUS que par un Premium ayant
  // déverrouillé le scrub → zéro régression pour le gratuit (figé à J0).
  const beachList = useMemo(()=>{
    if(!toVB) return []
    const isEUR = island==="mq"||island==="gp"
    return(beaches||[])
      .filter(b=>b&&b.lat!=null&&b.lng!=null&&(isEUR?b.island===island:true))
      .map(b=>{
        const[vx,vy]=toVB(b.lat,b.lng)
        const entry=forecastByBeach&&forecastByBeach[b.id]
        const fc=entry&&entry.d // série jour-par-jour [{st,c,date}]
        const days=[b.status||null]
        const conf=[null]
        // PERSISTANCE (décision fondateur 2026-06-30) : un jour sans prévision NE reste
        // PLUS gris muet — on reporte le dernier statut connu (« on s'attend à la même
        // chose »), avec une CONFIANCE BASSE explicite (point creux/pointillé dans la
        // frise + 'indicatif'). C'est une vraie méthode (persistance, comme forecast.cjs),
        // PAS une invention : on n'affiche jamais un statut tiré du néant, seulement la
        // continuité de la mesure du jour, dégradée honnêtement avec l'horizon.
        for(let d=1;d<6;d++){
          const cell=fc&&fc[d]
          let st=cell&&cell.st?cell.st:null
          let cf=cell&&cell.c!=null?cell.c:null
          if(st==null){ st=days[d-1]; if(st!=null) cf=Math.max(8,Math.round((conf[d-1]!=null?conf[d-1]:35)*0.78)) } // report + confiance qui décroît
          days.push(st)
          conf.push(cf)
        }
        // Premier jour d'échouage prévu (réel) : index du 1er 'avoid' dans la série,
        // sinon arrivalDay du signal d'arrivée. Sert au badge « touchée J+N ».
        let firstHit=null
        for(let d=0;d<days.length;d++){ if(days[d]==="avoid"){ firstHit=d; break } }
        if(firstHit==null&&entry&&entry.arrivalDay!=null&&entry.arrivalDay>=1&&entry.arrivalDay<6) firstHit=entry.arrivalDay
        return{...b,vx,vy,days,conf,fc:fc||null,drift:(entry&&entry.drift)||null,firstHit}
      })
  },[beaches,island,toVB,forecastByBeach])

  // Couche sargasses : points satellite AFAI projetés sur la scène SVG, colorés par
  // intensité. Même filtre île que la carte Leaflet (split lat 15.5 = grille Caraïbe
  // partagée MQ/GP). Seuil 0.10 = on ne dessine QUE le sargasse réel (la mer propre
  // reste propre, pas de voile vert parasite). Filtre viewport = on jette les points
  // hors-écran (la grille couvre toute la Caraïbe).
  // Champ de sargasses NEARSHORE (donnée satellite AFAI) pour la couche LIVE, en vue ÎLE (k=1).
  // Seuil 0.10. Cull SERRÉ-ÎLE : on ne montre QUE le sargasse PROCHE de la côte/île — pas les bancs
  // au large « inutiles » (fondateur 22/06 soir). `near` = LOD détaillé. Cap = anti-clutter.
  const sargCells = useMemo(()=>{
    if(!toVB||!afaiGrid||!afaiGrid.points) return []
    const isMQGP=island==="mq"||island==="gp"
    const pts=isMQGP?afaiGrid.points.filter(p=>island==="gp"?p[0]>=15.5:p[0]<15.5):afaiGrid.points
    const out=[]
    for(const[lat,lng,afai]of pts){
      if(afai<0.10) continue
      const[vx,vy]=toVB(lat,lng)
      if(vx<-60||vx>860||vy<-60||vy>660) continue // serré-île : nearshore only, pas les bancs au large
      out.push({vx,vy,afai, near:Math.hypot(vx-400,vy-300)<240, seed:Math.round(vx*7+vy*13)})
    }
    out.sort((a,b)=>b.afai-a.afai)
    return out.slice(0,48)
  },[afaiGrid,island,toVB])

  // P7 — recherche : plages dont le nom matche la requête (max 6).
  const matches = useMemo(()=>{
    const lq=query.trim().toLowerCase()
    if(!lq) return []
    return beachList.filter(b=>(b.name||"").toLowerCase().includes(lq)).slice(0,6)
  },[query,beachList])

  // IDs des plages affichant un label
  const labeledIds = useMemo(()=>{
    const ids=new Set()
    if(!beachList.length) return ids
    // PRIORITÉ (fondateur 22/06) : montrer par leur NOM les plages PAS VERTES (jaune=modéré /
    // rouge=à éviter) — ce sont elles qui comptent (où il y a/va avoir de la sargasse). Le
    // déclutter priorise déjà avoid>moderate>clean, donc ces noms gagnent l'affichage.
    beachList.forEach(b=>{ const st=b.days[day]; if(st==="moderate"||st==="avoid") ids.add(b.id) })
    // + quelques repères clairs pour l'orientation (plages nommées / échantillon réparti).
    if(island==="mq"){
      beachList.forEach(b=>{ if(MQ_NAMED.some(n=>(b.name||"").includes(n))) ids.add(b.id) })
    } else {
      const step=Math.max(1,Math.ceil(beachList.length/8))
      beachList.forEach((b,i)=>{ if(i%step===0) ids.add(b.id) })
    }
    return ids
  },[beachList,island,day])

  // Ellipses de relief en coordonnées viewBox (MQ only)
  const reliefEls = useMemo(()=>{
    if(!toVB||island!=="mq") return []
    return MQ_RELIEF.map(([lat,lng,rx])=>{ const[vx,vy]=toVB(lat,lng); return{vx,vy,rx} })
  },[toVB,island])

  // ─── BAKE (Stage 2) : le monde STATIQUE (côte floutée + sargasses + relief + yole) est
  // rasterisé UNE fois en PNG 2.5×, puis affiché comme <image> GPU-composité. Pendant pan/zoom
  // le navigateur ne fait que translater/scaler une texture → zéro re-raster du flou/des cercles
  // (le coût/frame qui ramait sur GPU mobile). Les pins restent SVG vivants (funnel + couleur du
  // jour). Échec (taint canvas / sérialisation) → bakedUrl=null → fallback SVG live (Stage 1).
  useEffect(()=>{
    const svg=bakeRef.current
    if(!svg||!outline){ setBakedUrl(null); return }
    let cancelled=false, idle=null
    const S=2.5, W=Math.round(800*S), H=Math.round(600*S)
    // Le bake (sérialisation SVG + Image decode + drawImage 2.5× + toDataURL PNG) est un GROS
    // bloc main-thread — profilé comme le hotspot n°1 du mount (~282 ms non-throttlé, ~1 s sous
    // 4× CPU mobile). On le DIFFÈRE à l'idle : le SVG live (Stage 1) peint et reste interactif
    // d'abord (= le fallback bakedUrl=null déjà en place), puis le bake se fait HORS fenêtre
    // critique et swappe la texture GPU. Rendu final + optim pan/zoom inchangés ; seul le TIMING
    // change → LCP/TTI/TBT améliorés. Échec/annulation → on reste sur le SVG live (zéro régression).
    const runBake=()=>{
      if(cancelled) return
      let xml
      try{ xml=new XMLSerializer().serializeToString(svg) }catch(_){ return }
      xml=xml.replace('<svg ',`<svg width="${W}" height="${H}" `) // viewBox 800×600 reste → raster net 2.5×
      const img=new Image()
      img.onload=()=>{
        if(cancelled) return
        try{
          const cv=document.createElement('canvas'); cv.width=W; cv.height=H
          cv.getContext('2d').drawImage(img,0,0,W,H)
          // toBlob (ASYNC, encode PNG hors-thread principal) au lieu de toDataURL (SYNCHRONE,
          // bloquait ~2,2 s sous 4× CPU = le hotspot du mount). Même image → objectURL au lieu
          // de data-URL (qu'on révoque pour éviter la fuite mémoire). Échec → fallback SVG live.
          cv.toBlob(blob=>{
            if(cancelled){ return }
            if(!blob){ setBakedUrl(null); return }
            const url=URL.createObjectURL(blob)
            if(cancelled){ URL.revokeObjectURL(url); return }
            if(bakedObjUrlRef.current) URL.revokeObjectURL(bakedObjUrlRef.current)
            bakedObjUrlRef.current=url
            setBakedUrl(url)
          },'image/png')
        }catch(_){ if(!cancelled) setBakedUrl(null) }
      }
      img.onerror=()=>{ if(!cancelled) setBakedUrl(null) }
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml)
    }
    if(typeof requestIdleCallback==="function") idle=requestIdleCallback(runBake,{timeout:2000})
    else idle=setTimeout(runBake,300)
    return ()=>{ cancelled=true; try{ (typeof cancelIdleCallback==="function"?cancelIdleCallback:clearTimeout)(idle) }catch(_){} }
  },[outline,reliefEls,island])  // le champ sargasses n'est plus baké → retiré des deps

  // Révoque l'objectURL du PNG baké au démontage (anti-leak mémoire).
  useEffect(()=>()=>{ if(bakedObjUrlRef.current){ try{ URL.revokeObjectURL(bakedObjUrlRef.current) }catch(_){} bakedObjUrlRef.current=null } },[])

  // ─── CAMÉRA ────────────────────────────────────────────────────────────────
  // Vue par défaut = ÎLE GRANDE et centrée (décision fondateur 22/06 soir : la vue régionale
  // rapetissait trop l'île + montrait des bancs au large « inutiles » → on revient à l'île pleine).
  const K_MIN=0.85, K_MAX=5.0

  const clampCam=useCallback(()=>{
    const c=camRef.current
    c.k=Math.max(K_MIN,Math.min(K_MAX,c.k))
    const m=200
    c.tx=Math.max(400-800*c.k+m,Math.min(m,c.tx))
    c.ty=Math.max(300-600*c.k+m,Math.min(m,c.ty))
  },[])

  // Déclutter screen-space : empêche les labels de se chevaucher (noms + verdicts
  // empilés type « Anse Mitan/Anse Dufour » illisibles). Priorité : plage
  // sélectionnée > pire statut (avoid>moderate>clean) > nord→sud.
  // COÛTEUX : lit offsetWidth/Height → force un reflow. On le SORT du chemin chaud
  // du pan/zoom : writeCam ne fait que repositionner (zéro lecture layout) à chaque
  // frame, et le déclutter ne tourne qu'AU REPOS (débounce 90ms après le dernier
  // geste). Sans ça, sur mobile (Safari) le pan saccadait ET les noms clignotaient
  // frame à frame (recalcul de visibility chaque RAF) → ressenti « carte buggée ».
  const declutterRef=useRef(0)
  const declutter=useCallback(()=>{
    const layer=labelLayerRef.current; if(!layer) return
    const els=layer.querySelectorAll('[data-vx]')
    const RANK={avoid:0,moderate:1,clean:2}
    const boxes=[]
    els.forEach(el=>{
      const w=el.offsetWidth, h=el.offsetHeight
      const L=parseFloat(el.style.left)||0, T=parseFloat(el.style.top)||0
      boxes.push({el, sel:el.dataset.sel==='1', rank:RANK[el.dataset.status]??3,
        vy:parseFloat(el.dataset.vy)||0,
        l:L-w/2-4, r:L+w/2+4, t:T-h-4, b:T+4})
    })
    boxes.sort((a,b)=> a.sel!==b.sel ? (a.sel?-1:1) : (a.rank!==b.rank ? a.rank-b.rank : a.vy-b.vy))
    const kept=[]
    boxes.forEach(bx=>{
      const hit=kept.some(k=> !(bx.r<k.l||bx.l>k.r||bx.b<k.t||bx.t>k.b))
      if(hit){ bx.el.style.visibility='hidden' }
      else { bx.el.style.visibility='visible'; kept.push(bx) }
    })
  },[])
  // Déclutter des PINS (bugs « pins superposés / noms illisibles ») : dans un cluster dense au zoom
  // courant, on garde les prioritaires (sélectionné > score) en pin entier, les autres deviennent un
  // petit POINT cliquable. Recalc AU REPOS (jamais pendant le geste). Zoom in → le seuil viewBox
  // rétrécit → les points redeviennent des pins entiers (séparation géographique).
  const recomputeTiers=useCallback(()=>{
    const el=wrapRef.current
    if(!el||!beachList.length){ setPinTier({}); return }
    const k=camRef.current.k
    const s=Math.min(el.clientWidth/800,el.clientHeight/600)||0.5
    const minVB=34/Math.max(0.0001,k*s) // 34px de séparation écran mini entre 2 pins entiers
    const order=[...beachList].sort((a,b)=>
      ((b.id===selected?.id?1e6:0)+(b.score||0))-((a.id===selected?.id?1e6:0)+(a.score||0)))
    const placed=[], tier={}
    for(const b of order){
      let close=false
      for(const p of placed){ const dx=p.vx-b.vx, dy=p.vy-b.vy; if(dx*dx+dy*dy<minVB*minVB){ close=true; break } }
      if(close) tier[b.id]='dot'; else { tier[b.id]='full'; placed.push(b) }
    }
    setPinTier(tier)
  },[beachList,selected])
  const scheduleDeclutter=useCallback(()=>{
    if(declutterRef.current) clearTimeout(declutterRef.current)
    declutterRef.current=setTimeout(()=>{ declutterRef.current=0; recomputeTiers(); declutter() },90)
  },[declutter,recomputeTiers])
  // Recalc aussi quand données/sélection changent (positions prêtes la frame d'après).
  useEffect(()=>{ const id=requestAnimationFrame(()=>recomputeTiers()); return ()=>cancelAnimationFrame(id) },[recomputeTiers])

  // ── EFFET D'ÉCHOUAGE (live, GATÉ RÉALISME) : seules les plages PRÉVUES touchées (statut `avoid`
  // au jour affiché) voient un banc s'échouer ; plages propres/modérées = rien (jamais de fausse
  // éclaboussure). Couche au-dessus du monde baké, animée par UN rAF dédié, plafonnée à 4 effets,
  // reduced-motion = pose figée, pause onglet caché. Calme (0 avoid) = ZÉRO rAF (tableau, pas
  // aquarium). Override debug `?beachfx=1` (force les 3 pires plages quand tout est propre).
  useEffect(()=>{
    const layer=fxRef.current
    if(!layer||!beachList.length) return
    while(layer.firstChild) layer.removeChild(layer.firstChild)
    let cx=0,cy=0; for(const b of beachList){cx+=b.vx;cy+=b.vy}; cx/=beachList.length; cy/=beachList.length
    const force=(()=>{try{return /[?&]beachfx=1/.test(window.location.search)}catch(_){return false}})()
    const arr=b=>arrivals&&arrivals[b.id]
    // GATE RÉALISME : plage `avoid` au jour affiché OU arrivée prévue (arrivalDetected). Jamais de
    // fausse éclaboussure sur une plage propre.
    let hits=beachList.filter(b=>b.days[day]==="avoid" || (day===0 && arr(b)))
    if(force&&!hits.length) hits=[...beachList].sort((a,b)=>(a.score||99)-(b.score||99)).slice(0,3)
    const sevOf=b=>(b.days[day]==="avoid"?1:0)+(((arr(b)&&arr(b).s)||0)*6)
    hits=hits.sort((a,b)=>sevOf(b)-sevOf(a)).slice(0,4) // les plus sévères d'abord, cap 4
    if(!hits.length) return
    // PLAY-ONCE-puis-FADE (fondateur 22/06 soir : le dépôt + badge qui RESTENT « gâchent un peu » →
    // l'échouage joue UNE fois, départ décalé, puis DISPARAÎT entièrement en fondu : il ne reste rien
    // sur la carte (le pin rouge porte le statut). Rejoue seulement au changement de donnée/jour. Quand
    // tout est joué+fadé → le rAF s'éteint (0 % CPU, carte propre). Badge « J+N » = ETA, transitoire.
    const CYCLE=3.35 // durée d'un échouage : banc → splat → dépôt → FADE complet (plus rien à la fin)
    // PREMIUM jour futur : échouage en BOUCLE (arrivée continue) au lieu de once+fade.
    // Délai mort (GAP) entre cycles + période DÉSYNCHRONISÉE par plage → pas de pop
    // collectif (la carte respire). Le gratuit/aujourd'hui garde once+fade (loopMode=false).
    const loopMode = mapPremium && day>=1 && !mapDriftOff
    const GAP=1.15
    const insts=hits.map((b,i)=>{
      const a=arr(b)
      // En loopMode (premium futur), on SUPPRIME le badge ETA natif de l'échouage
      // (eta=null) : il se répétait/chevauchait en boucle (« AUJ AUJ » illisible). Le
      // badge propre « touchée +Nj » sur le pin (firstHit) porte l'info, c'est plus net.
      const eta=loopMode?null:(force?(i+1):(a?a.d:(b.days[day]==="avoid"?0:null))) // 0=déjà là, 1-3=jour prévu, null=aucun
      const inst=_spawnBeaching(layer,b.vx,b.vy,cx,cy,0.85,Math.round(b.vx*7+b.vy*13)+i*131,eta)
      const strength=Math.min(1.3,.72+(((a&&a.s)||0)*3.5)+(b.days[day]==="avoid"?.28:0)) // + sévère = boump + fort
      return {inst,delay:i*0.55,settled:false,boumped:false,strength,period:CYCLE+GAP+(i%3)*0.4}
    })
    if(reduceRef.current){ insts.forEach(o=>o.inst.render(CYCLE)); return ()=>{ while(layer.firstChild) layer.removeChild(layer.firstChild) } } // reduced = rien (fadé), le pin suffit
    let raf=0,t0=0
    const loop=tms=>{ if(!t0)t0=tms; const t=(tms-t0)/1000; let active=false
      for(const o of insts){ if(o.settled) continue
        if(loopMode){
          // BOUCLE : phase locale (modulo période), délai mort = rien affiché (render(CYCLE) = fadé).
          const lt=t-o.delay
          if(lt<0){ active=true; continue }
          const ph=lt%o.period
          o.inst.render(ph<CYCLE?ph:CYCLE)
          if(!o.boumped && lt>=1.18 && lt<o.period){ o.boumped=true; playBoump(o.strength) } // 1 seul boump (1er cycle)
          active=true
          continue
        }
        const lt=t-o.delay
        if(lt<CYCLE){ o.inst.render(Math.max(0,lt)); active=true // joue jusqu'au fondu complet
          if(!o.boumped && lt>=1.18){ o.boumped=true; playBoump(o.strength) } // SON « boump » pile à l'impact (T_IM)
        }
        else { o.inst.render(CYCLE); o.settled=true } // joué + fadé : plus rien, ne rejoue plus
      }
      if(active) raf=requestAnimationFrame(loop); else raf=0 // tout fadé → rAF éteint (carte propre)
    }
    raf=requestAnimationFrame(loop)
    const onVis=()=>{ if(document.hidden){ if(raf){cancelAnimationFrame(raf);raf=0} }
      else if(!raf && (loopMode || insts.some(o=>!o.settled))){ t0=0; insts.forEach(o=>{o.boumped=true}); raf=requestAnimationFrame(loop) } }
    document.addEventListener("visibilitychange",onVis)
    return ()=>{ if(raf)cancelAnimationFrame(raf); document.removeEventListener("visibilitychange",onVis); while(layer.firstChild) layer.removeChild(layer.firstChild) }
  },[beachList,day,soundReplay,mapPremium,mapDriftOff]) // eslint-disable-line

  // ── CHAMP DE SARGASSES AU LARGE (live, dérive LENTE) : les vraies cellules satellite rendues en
  // bancs comic (LOD near/far), qui dérivent doucement vers l'O/N-O (courant Caraïbe) avec WRAP
  // per-cellule (champ toujours peuplé, sans couture). Clippé à la mer. reduced-motion = figé. Un
  // seul rAF, pause onglet caché. La matière au large EXISTE même si aucune plage ne vire au rouge.
  useEffect(()=>{
    const layer=fieldRef.current
    if(!layer) return
    while(layer.firstChild) layer.removeChild(layer.firstChild)
    if(!sargCells.length) return
    const isMobile=(()=>{try{return window.matchMedia("(pointer:coarse)").matches||Math.min(window.innerWidth,window.innerHeight)<540}catch(_){return false}})()
    // far d'abord (derrière), near ensuite (devant) ; cap mobile plus bas
    const cells=[...sargCells].sort((a,b)=>(a.near?1:0)-(b.near?1:0)).slice(0, isMobile?24:42)
    const nodes=cells.map(c=>{
      const near=c.near, R=(near?14:11)+c.afai*(near?34:22)  // taille pour la vue ÎLE (k=1)
      const sil=_splatPath(0,0,R,c.seed,near?11:8,near?0.7:0.5)
      const g=_e("g",{})
      g.appendChild(_e("path",{d:sil,fill:INK,opacity:near?".26":".16",transform:"translate(1.5 2.5)"}))
      g.appendChild(_e("path",{d:sil,fill:"url(#wmSarg)",stroke:INK,"stroke-width":near?1.4:1,"stroke-linejoin":"round",opacity:Math.min(.95,(near?.62:.4)+c.afai*1.1).toFixed(2)}))
      if(near){ const rd=_rng(c.seed*11+2)
        for(let i=0;i<2;i++) g.appendChild(_e("path",{d:_splatPath((rd()-.5)*R,(rd()-.5)*R*0.8,R*0.3,c.seed*9+i*7,7,0.6),fill:"#5d5a1e",opacity:".5"}))
        g.appendChild(_e("path",{d:sil,fill:"url(#wmSargHalf)",opacity:".28"}))
        g.appendChild(_e("path",{d:_splatPath(-R*0.2,-R*0.26,R*0.5,c.seed+3,7,0.5),fill:"#FFE9A8",opacity:".42"})) }
      layer.appendChild(g)
      return {g, bx:c.vx, by:c.vy, seed:c.seed}
    })
    const reduced=reduceRef.current
    // DÉRIVE = sway lent autour de la position RÉELLE de chaque cellule (honnête, jamais de couture),
    // mais NON-RÉPÉTITIF : somme de sinus à périodes INCOMMENSURABLES (ratios irrationnels φ/√2/√3) →
    // jamais deux états identiques (fini la boucle ~35s perceptible = « lassant »). Amplitude faible,
    // chaque cellule déphasée par son seed. (Fix répétition fondateur 22/06.)
    // DÉRIVE PAR JOUR FUTUR (premium) : le banc au large NE reste plus figé quand on
    // scrube les jours. On projette sa position dans la direction RÉELLE du courant
    // Caraïbe (O/N-O, déjà la dérive du champ) — estimation physique (« les radeaux
    // continuent de dériver »), pas une trajectoire inventée. ~7px/jour, subtil.
    // Confiance basse assumée (cf. frise). Jour 0 / gratuit → 0 décalage.
    const dd=(mapPremium&&!mapDriftOff&&day>=1)?day:0
    const DX=-6.6*dd, DY=-3.2*dd
    // En mode premium-scrub (jour futur), on CALME le sway sinusoïdal continu (×0.28) :
    // le déplacement O/N-O par jour suffit à montrer le mouvement, le sway permanent
    // faisait « écran de veille » (revue product-design). Au repos (J0) : sway normal.
    const swayK=dd>0?0.28:1
    const place=(n,t)=>{
      if(reduced){ n.g.setAttribute("transform",`translate(${(n.bx+DX).toFixed(1)} ${(n.by+DY).toFixed(1)})`); return }
      const ph=n.seed*0.137
      const sx=(Math.sin(t*0.061+ph)*7 + Math.sin(t*0.0987+ph*1.31)*4 + Math.sin(t*0.1473+ph*0.71)*2.4)*swayK
      const sy=(Math.sin(t*0.047+ph*1.1)*3.4 + Math.sin(t*0.0814+ph*0.53)*2.1)*swayK
      n.g.setAttribute("transform",`translate(${(n.bx+sx+DX).toFixed(1)} ${(n.by+sy+DY).toFixed(1)})`)
    }
    if(reduced){ nodes.forEach(n=>place(n,0)); return ()=>{ while(layer.firstChild) layer.removeChild(layer.firstChild) } }
    let raf=0
    const loop=tms=>{ const t=tms/1000; for(const n of nodes) place(n,t); raf=requestAnimationFrame(loop) }
    raf=requestAnimationFrame(loop)
    const onVis=()=>{ if(document.hidden){ if(raf){cancelAnimationFrame(raf);raf=0} } else if(!raf){ raf=requestAnimationFrame(loop) } }
    document.addEventListener("visibilitychange",onVis)
    return ()=>{ if(raf)cancelAnimationFrame(raf); document.removeEventListener("visibilitychange",onVis); while(layer.firstChild) layer.removeChild(layer.firstChild) }
  },[sargCells,day,mapPremium,mapDriftOff]) // eslint-disable-line

  const writeCam=useCallback(()=>{
    const g=worldRef.current; if(!g) return
    const{tx,ty,k}=camRef.current
    g.setAttribute("transform",`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})`)
    const layer=labelLayerRef.current; if(!layer) return
    const r=wrapRef.current?.getBoundingClientRect(); if(!r) return
    const s=Math.min(r.width/800,r.height/600)
    const ox=(r.width-800*s)/2, oy=(r.height-600*s)/2
    const els=layer.querySelectorAll('[data-vx]')
    els.forEach(el=>{
      const vx=parseFloat(el.dataset.vx), vy=parseFloat(el.dataset.vy)
      el.style.left=(ox+(vx*k+tx)*s).toFixed(1)+'px'
      el.style.top=(oy+(vy*k+ty)*s).toFixed(1)+'px'
    })
    scheduleDeclutter()
  },[scheduleDeclutter])

  const schedule=useCallback(()=>{
    if(rafRef.current) return
    rafRef.current=requestAnimationFrame(()=>{ rafRef.current=0; writeCam() })
  },[writeCam])

  // Écran → viewBox (avant transform monde)
  const toSvg=useCallback((cx,cy)=>{
    const r=wrapRef.current?.getBoundingClientRect(); if(!r) return[0,0]
    const s=Math.min(r.width/800,r.height/600)
    const ox=(r.width-800*s)/2, oy=(r.height-600*s)/2
    return[(cx-r.left-ox)/s,(cy-r.top-oy)/s]
  },[])

  // ViewBox beach → pixels écran (après transform monde courant)
  const worldToScreen=useCallback((vx,vy)=>{
    const r=wrapRef.current?.getBoundingClientRect(); if(!r) return[0,0]
    const s=Math.min(r.width/800,r.height/600)
    const ox=(r.width-800*s)/2, oy=(r.height-600*s)/2
    const c=camRef.current
    return[r.left+ox+(vx*c.k+c.tx)*s, r.top+oy+(vy*c.k+c.ty)*s]
  },[])

  const flyTo=useCallback((vx,vy,k)=>{
    const tk=Math.max(K_MIN,Math.min(K_MAX,k))
    const ttx=400-vx*tk, tty=300-vy*tk
    if(reduceRef.current){ camRef.current={tx:ttx,ty:tty,k:tk}; clampCam(); writeCam(); return }
    const s0={...camRef.current}, t0=performance.now(), D=720
    if(animRef.current) cancelAnimationFrame(animRef.current)
    const step=t=>{
      const p=Math.min(1,(t-t0)/D)
      const e=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2
      camRef.current.tx=s0.tx+(ttx-s0.tx)*e
      camRef.current.ty=s0.ty+(tty-s0.ty)*e
      camRef.current.k =s0.k +(tk -s0.k )*e
      clampCam(); writeCam()
      if(p<1) animRef.current=requestAnimationFrame(step)
    }
    animRef.current=requestAnimationFrame(step)
  },[clampCam,writeCam])

  // Caméra initiale : centre de la bbox de l'outline ou de la zone
  useEffect(()=>{
    if(!outline) return
    const{proj,bbox}=outline
    let centered = false
    if(initialZone && beachList.length){
      const zoneObj = (COAST_ZONES[island] || []).find(z => z.slug === initialZone)
      if(zoneObj){
        const zoneBeaches = beachList.filter(b => zoneObj.communes.includes(b.commune))
        if(zoneBeaches.length){
          let avgVx = 0, avgVy = 0
          for(const b of zoneBeaches){
            avgVx += b.vx
            avgVy += b.vy
          }
          avgVx /= zoneBeaches.length
          avgVy /= zoneBeaches.length
          
          const tk = 2.0
          camRef.current = {
            tx: 400 - avgVx * tk,
            ty: 300 - avgVy * tk,
            k: tk
          }
          clampCam()
          writeCam()
          centered = true
          try { track && track("sg_zone_click", { zone: initialZone }) } catch(_) {}
        }
      }
    }
    if(!centered){
      // Vue par défaut = ÎLE GRANDE, centrée (k=1) — fondateur 22/06 soir.
      const cx=proj.offX+((bbox.minLng+bbox.maxLng)/2-bbox.minLng)*proj.kx*proj.sc
      const cy=proj.offY+(bbox.maxLat-(bbox.minLat+bbox.maxLat)/2)*proj.sc
      camRef.current={tx:400-cx,ty:300-cy,k:1}; clampCam(); writeCam()
      try{ track&&track("sg_archipel_open",{source:"map_world",island}) }catch(_){}
    }
  },[outline, initialZone, beachList]) // eslint-disable-line


  // ─── POINTEURS : pan / zoom / pinch ────────────────────────────────────────
  useEffect(()=>{
    const el=wrapRef.current; if(!el||!outline) return
    let moved=false

    const onDown=e=>{
      // 1er geste utilisateur : débloque l'AudioContext (exigence navigateurs) + rejoue l'échouage
      // UNE fois AVEC le son (à l'ouverture il a joué muet, audio verrouillé). Ensuite : plus de
      // re-trigger (le drapeau reste). C'est le « shroump » d'arrivée quand l'utilisateur engage.
      ensureAudio()
      if(!audioUnlockedRef.current){ audioUnlockedRef.current=true; setSoundReplay(n=>n+1) }
      // Tap sur un contrôle chrome (CTA « Voir la plage », tooltip, dock) : ne PAS le
      // traiter comme un pan (sinon le jitter du doigt déselectionne + capture le pointeur
      // et vole le clic au bouton → fiche jamais ouverte). Laisse l'événement au bouton.
      if(e.target&&e.target.closest&&e.target.closest('[data-vmui]')) return
      moved=false
      ptrsRef.current[e.pointerId]={x:e.clientX,y:e.clientY}
      const nptr=Object.keys(ptrsRef.current).length
      if(nptr===2){
        const pts=Object.values(ptrsRef.current)
        pinchRef.current={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),k0:camRef.current.k}
        try{ e.currentTarget.setPointerCapture(e.pointerId) }catch(_){}
      }
    }
    const onMove=e=>{
      // Survol souris (aucun bouton enfoncé) = JAMAIS un pan. Purge toute entrée pointeur
      // résiduelle (ex. gesture relâchée sur le chrome) → corrige « la carte suit le
      // curseur / se dirige vers la zone survolée, sans clic ».
      if(e.pointerType==="mouse"&&e.buttons===0){
        if(ptrsRef.current[e.pointerId]){delete ptrsRef.current[e.pointerId];if(Object.keys(ptrsRef.current).length<2)pinchRef.current=null}
        return
      }
      if(!ptrsRef.current[e.pointerId]) return
      const prev=ptrsRef.current[e.pointerId]
      ptrsRef.current[e.pointerId]={x:e.clientX,y:e.clientY}
      const pts=Object.values(ptrsRef.current)
      if(pts.length>=2&&pinchRef.current){
        const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)
        const mx=(pts[0].x+pts[1].x)/2, my=(pts[0].y+pts[1].y)/2
        if(pinchRef.current.d>0){
          const s=toSvg(mx,my), c=camRef.current
          const wx=(s[0]-c.tx)/c.k, wy=(s[1]-c.ty)/c.k
          c.k=Math.max(K_MIN,Math.min(K_MAX,pinchRef.current.k0*d/pinchRef.current.d))
          c.tx=s[0]-wx*c.k; c.ty=s[1]-wy*c.k; clampCam()
        }
        moved=true; schedule(); return
      }
      const dx=e.clientX-prev.x, dy=e.clientY-prev.y
      if(Math.abs(dx)+Math.abs(dy)>2){
        if(!moved){
          // Setpointer capture SEULEMENT au premier vrai mouvement (piège pointer-capture/click)
          try{ e.currentTarget.setPointerCapture(e.pointerId) }catch(_){}
          setSelected(null); setTagPos(null)
        }
        moved=true
        const r=el.getBoundingClientRect()
        const s=Math.min(r.width/800,r.height/600)
        camRef.current.tx+=dx/s; camRef.current.ty+=dy/s
        clampCam(); schedule()
      }
    }
    const onUp=e=>{
      // TOUJOURS nettoyer le suivi du pointeur, même relâché sur un contrôle chrome —
      // sinon l'entrée ptrsRef survit et le survol suivant pan la carte (bug survol-pan).
      const wasMoved=moved
      delete ptrsRef.current[e.pointerId]
      if(Object.keys(ptrsRef.current).length<2) pinchRef.current=null
      // Sur un contrôle chrome (CTA « Voir la plage », dock, capture…) : pas de double-tap
      // zoom ni de vol de clic — mais le nettoyage ci-dessus a déjà eu lieu.
      if(e.target&&e.target.closest&&e.target.closest('[data-vmui]')) return
      // Double-tap zoom UNIQUEMENT sur un vrai pointerup. onUp est AUSSI appelé par onLeave
      // (pointerleave) et par pointercancel : sortir du viewport par un COIN déclenchait
      // alors un faux « tap » → double-tap fantôme = bascule zoom au simple survol.
      // (Bug coin fondateur 22/06, confirmé par MutationObserver : hover → scale 2.5↔0.85.)
      if(e.type!=="pointerup") return
      if(!wasMoved){
        // Double-tap = bascule zoom
        const now=Date.now()
        if(now-lastTapRef.current<300){
          const s=toSvg(e.clientX,e.clientY), c=camRef.current
          const f=c.k<2?2.5/c.k:K_MIN/c.k
          const wx=(s[0]-c.tx)/c.k, wy=(s[1]-c.ty)/c.k
          c.k=Math.max(K_MIN,Math.min(K_MAX,c.k*f))
          c.tx=s[0]-wx*c.k; c.ty=s[1]-wy*c.k; clampCam(); writeCam()
        }
        lastTapRef.current=now
      }
    }
    const onLeave=e=>{ if(e.pointerType==="mouse") onUp(e) }
    const onWheel=e=>{
      e.preventDefault()
      const c=camRef.current
      // BUG TRACKPAD (fondateur 22/06) : un scroll deux-doigts (deltaMode pixel, petits
      // deltas, sans ctrl) déclenchait un ZOOM vers le curseur → « place le curseur dans
      // un coin et la carte zoome/se décale ». Désormais : pinch (ctrlKey) ou molette
      // souris (deltas par lignes / amples ≥50) = ZOOM vers le curseur ; scroll trackpad
      // = PAN naturel de la carte (zéro zoom involontaire).
      const zoomIntent=e.ctrlKey||e.deltaMode!==0||Math.abs(e.deltaY)>=50
      if(zoomIntent){
        const f=e.deltaY<0?1.12:1/1.12
        // ANCRE LE ZOOM AU CENTRE DE L'ÉCRAN, PAS AU CURSEUR (fondateur 22/06, vérifié via
        // event-listener live : un scroll avec le curseur dans un coin fait BONDIR la carte
        // de ~1300px vers ce coin). Zoom au centre = zoom sur place, zéro décalage parasite.
        const r=el.getBoundingClientRect()
        const s=toSvg(r.left+r.width/2, r.top+r.height/2)
        const wx=(s[0]-c.tx)/c.k, wy=(s[1]-c.ty)/c.k
        c.k=Math.max(K_MIN,Math.min(K_MAX,c.k*f))
        c.tx=s[0]-wx*c.k; c.ty=s[1]-wy*c.k; clampCam(); schedule()
      }else{
        const r=el.getBoundingClientRect()
        const sc=Math.min(r.width/800,r.height/600)||1
        c.tx-=e.deltaX/sc; c.ty-=e.deltaY/sc; clampCam(); schedule()
      }
    }
    el.addEventListener("pointerdown",onDown)
    el.addEventListener("pointermove",onMove)
    el.addEventListener("pointerup",onUp)
    el.addEventListener("pointercancel",onUp)
    el.addEventListener("pointerleave",onLeave)
    el.addEventListener("wheel",onWheel,{passive:false})
    return()=>{
      el.removeEventListener("pointerdown",onDown)
      el.removeEventListener("pointermove",onMove)
      el.removeEventListener("pointerup",onUp)
      el.removeEventListener("pointercancel",onUp)
      el.removeEventListener("pointerleave",onLeave)
      el.removeEventListener("wheel",onWheel)
    }
  },[outline,schedule,clampCam,writeCam,toSvg]) // setSelected/setTagPos sont stables

  // Nettoyage RAF + timers au démontage
  useEffect(()=>()=>{
    if(animRef.current)  cancelAnimationFrame(animRef.current)
    if(rafRef.current)   cancelAnimationFrame(rafRef.current)
    if(tagTimerRef.current) clearTimeout(tagTimerRef.current)
    if(declutterRef.current) clearTimeout(declutterRef.current)
  },[])

  // ─── SÉLECTION PLAGE ───────────────────────────────────────────────────────
  const selectBeach=useCallback(b=>{
    setSelected(b)
    flyTo(b.vx,b.vy,3.0)
    if(tagTimerRef.current) clearTimeout(tagTimerRef.current)
    tagTimerRef.current=setTimeout(()=>{
      const[sx,sy]=worldToScreen(b.vx,b.vy)
      setTagPos({x:sx,y:sy})
    },750)
    try{ track&&track("sg_archipel_tap",{beach_id:b.id,status:b.status,source:"map_world"}) }catch(_){}
  },[flyTo,worldToScreen,track])

  // Le CTA « Voir la plage » ouvre la fiche au pointerdown (réactivité tactile +
  // capture de la plage avant déselection). onClick reste pour le CLAVIER
  // (Enter/Space → click sans pointer event). Sans garde, un tap déclenche
  // pointerdown PUIS click → double ouverture. Ce ref ignore le click qui suit
  // de près un pointerdown ; un click clavier (pas de pointerdown récent) passe.
  const lastPtrOpenRef=useRef(0)
  const openBeach=useCallback(()=>{
    if(!selected) return
    if(Date.now()-lastPtrOpenRef.current < 700) return // déjà ouvert par le pointerdown
    onOpenBeach&&onOpenBeach(selected)
  },[selected,onOpenBeach])

  const nearMe=useCallback(()=>{
    const c=beachList.find(b=>b.days[day]==="clean") // inconnu ≠ propre : ne pas filer sur une plage non chargée
    if(c) selectBeach(c)
    try{ track&&track("sg_map_near_me",{island}) }catch(_){}
  },[beachList,day,selectBeach,track,island])

  // « Où aller plutôt » (plan B) — plage PROPRE la plus proche de la plage tapée, le jour
  // affiché. Calcul pur sur lat/lng réels (haversine), zéro fabrication. Null si la plage
  // tapée n'est pas moderate/avoid, ou si aucune plage propre connue ailleurs.
  const planB = useMemo(()=>{
    if(mapDecideOff||!selected) return null
    const st=selected.days&&selected.days[day]
    if(st!=="moderate"&&st!=="avoid") return null
    if(selected.lat==null||selected.lng==null) return null
    let best=null,bestD=Infinity
    for(const b of beachList){
      if(b.id===selected.id||b.days[day]!=="clean") continue
      const d=haversineKm(selected,b)
      if(d<bestD){bestD=d;best=b}
    }
    return best?{beach:best,km:bestD}:null
  },[mapDecideOff,selected,day,beachList])

  // Partage de la plage sélectionnée — délègue à shareBeachCard (parent). Forecast = 3 jours
  // (statut + libellé), statut du jour = days[0]. Spoiler-free, data réelle.
  const onShareSel=useCallback(()=>{
    if(!onShare||!selected) return
    try{
      const fc=[0,1,2].map(d=>({status:(selected.days&&selected.days[d])||"unknown",day:ti(lang,DAY_LBL[d])}))
      onShare({name:selected.name,status:(selected.days&&selected.days[0])||"unknown",score:selected.score},lang,fc)
      try{track&&track("sg_map_share",{island})}catch(_){}
    }catch(_){}
  },[onShare,selected,lang,track,island])

  // Verdict « ma semaine » (Premium) — agrégat île sur days[0..5], calcul PUR (zéro
  // fabrication) : meilleur jour (max plages propres CONNUES) + « valeur sûre » = la plage
  // propre le plus de jours. Glanceable, 1 carte, affichée seulement hors sélection (pas
  // de superposition avec le tooltip). Rollback ?mapdecide=0 (couche décision).
  const weekDigest = useMemo(()=>{
    if(mapDecideOff||!mapPremium||!beachList.length) return null
    const D=[0,1,2,3,4,5]
    let bestDay=-1,bestN=-1
    D.forEach(d=>{
      const known=beachList.filter(b=>{const s=b.days[d];return s==="clean"||s==="moderate"||s==="avoid"}).length
      if(!known) return
      const n=beachList.filter(b=>b.days[d]==="clean").length
      if(n>bestN){bestN=n;bestDay=d}
    })
    if(bestDay<0) return null
    let safe=null,safeK=-1
    for(const b of beachList){
      const k=D.filter(d=>b.days[d]==="clean").length
      if(k>safeK){safeK=k;safe=b}
    }
    // Saison calme valorisée : quasi tout vert sur la semaine + zéro « à éviter » → on
    // retourne le « creux » en bénéfice (la valeur du Veilleur = l'alerte à la bascule),
    // au lieu de laisser le premium penser « tout est vert, pourquoi j'ai payé ».
    let cells=0,cleanCells=0,anyAvoid=false
    for(const b of beachList){ for(const d of D){ const s=b.days[d]
      if(s==="clean"||s==="moderate"||s==="avoid"){ cells++; if(s==="clean")cleanCells++; if(s==="avoid")anyAvoid=true } } }
    const calm = cells>0 && !anyAvoid && cleanCells/cells>=0.9
    return {bestDay,bestN,safe:safeK>=2?safe:null,safeK,calm}
  },[mapDecideOff,mapPremium,beachList])

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if(loadErr) return null  // laisse l'ArchipelView control se montrer (ErrBound parent)

  const noAnim   = reduceRef.current
  // Animation Premium « dérive » sur jour futur : halo qui pulse sur les plages prévues
  // touchées (respecte reduced-motion via !noAnim). Les marqueurs INFO (badge J+N, sens
  // de dérive) restent affichés même en reduced-motion (statiques) = info, pas animation.
  const driftFuture = mapPremium && day>=1 && !mapDriftOff && !noAnim
  const regionName= outline?.name||(island==="mq"?"Martinique":island==="gp"?"Guadeloupe":island)
  const cleanCnt  = beachList.filter(b=>b.days[day]==="clean").length // inconnu ≠ propre (anti-flash)
  const dayLbl    = day===0?_t(lang,"aujourd'hui","today","hoy"):_t(lang,`dans ${day}j`,`in ${day}d`,`en ${day}d`)
  const vant      = vantColor(beachList,day)

  // Defs partagés (gradients + 2 filtres flous) — rendus à l'identique dans le SVG de bake ET le
  // SVG visible. IDs dupliqués mais définitions identiques → url(#id) résout pareil, inoffensif.
  const mapDefs = (
    <defs>
      <radialGradient id="wmPhalo" cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#FFE6A8" stopOpacity=".55"/>
        <stop offset="1" stopColor="#FFE6A8" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="wmLand" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#74D89E"/><stop offset=".3" stopColor="#41BE7B"/>
        <stop offset=".62" stopColor="#2BAE66"/><stop offset="1" stopColor="#157F49"/>
      </linearGradient>
      <linearGradient id="wmWarm" x1="1" y1="0" x2=".2" y2="1">
        <stop offset="0" stopColor="#FFD27A" stopOpacity=".55"/>
        <stop offset=".4" stopColor="#F0A23A" stopOpacity=".14"/>
        <stop offset="1" stopColor="#C97E3A" stopOpacity="0"/>
      </linearGradient>
      <linearGradient id="wmSand" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFEFC4"/><stop offset="1" stopColor="#F4D38C"/>
      </linearGradient>
      <linearGradient id="wmPinClean" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5FDD93"/><stop offset="1" stopColor="#1E9E54"/>
      </linearGradient>
      <linearGradient id="wmPinMod" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFD25A"/><stop offset="1" stopColor="#E0941A"/>
      </linearGradient>
      <linearGradient id="wmPinAvoid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FF7A4D"/><stop offset="1" stopColor="#C8351A"/>
      </linearGradient>
      <linearGradient id="wmSailR" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF6A3D"/><stop offset="1" stopColor="#D8431F"/>
      </linearGradient>
      <linearGradient id="wmSailY" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFD45A"/><stop offset="1" stopColor="#F0A81E"/>
      </linearGradient>
      {/* Banc de sargasses — splat comic/BD golden-brown (encre + reflet + halftone). Chaud sur
          la mer golden-hour, lit sur violet/magenta. Baké avec le monde statique → 0 coût/frame. */}
      <radialGradient id="wmSarg" cx="40%" cy="34%" r="68%">
        <stop offset="0" stopColor="#E3B743"/><stop offset=".5" stopColor="#B08A2A"/><stop offset="1" stopColor="#7C6A22"/>
      </radialGradient>
      <pattern id="wmSargHalf" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" fill="#2c2a12" opacity=".4"/>
      </pattern>
      <filter id="wmSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="wmShlw" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
      {/* Masque MER (greffe honnêteté) : rect viewBox MOINS l'île (evenodd) → le champ de sargasses
          au large est clippé à l'eau, JAMAIS posé sur la terre. */}
      {outline&&<clipPath id="wmSeaClip"><path d={"M-200 -200H1000V1200H-200Z "+outline.path} fillRule="evenodd" clipRule="evenodd"/></clipPath>}
    </defs>
  )

  // Monde STATIQUE (ne dépend PAS du jour) : vagues + côte + sargasses + relief + yole. Source du
  // bake ET fallback live tant que le bitmap n'est pas prêt.
  const staticWorld = (
    <>
      {/* Vagues océan décoratives (traits d'écume comic) */}
      <g stroke="#bfeee8" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".14">
        <path d="M40 250 q60 -16 120 -4"/><path d="M70 340 q70 -18 140 -2"/>
        <path d="M30 430 q66 -16 130 -2"/>
        <path d="M520 120 q60 -14 120 0"/><path d="M600 470 q70 -16 130 -2"/>
        <path d="M560 540 q66 -16 130 -2"/>
      </g>
      {/* Contour côtier — couches mer → île ink comic */}
      {outline&&<g>
        <path d={outline.path} fill="none" stroke="#46c8bd" strokeWidth="30" strokeOpacity=".42" filter="url(#wmShlw)"/>
        <path d={outline.path} fill="none" stroke="#a8f0e0" strokeWidth="10" strokeOpacity=".42"/>
        <path d={outline.path} fill="#062033" opacity=".5" filter="url(#wmSoft)" transform="translate(7 13)"/>
        <path d={outline.path} fill="none" stroke="#FFE6A8" strokeWidth="7" strokeOpacity=".38"/>
        <path d={outline.path} fill="url(#wmSand)" stroke="none"/>
        <path d={outline.path} fill="url(#wmLand)" stroke="none" transform="scale(.985)" style={{transformOrigin:"328px 300px"}}/>
        <path d={outline.path} fill="url(#wmWarm)" opacity=".9" transform="scale(.985)" style={{transformOrigin:"328px 300px"}}/>
        <path d={outline.path} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round"/>
      </g>}
      {/* (Le champ de sargasses n'est PLUS baké ici : il est devenu une couche LIVE qui dérive
          lentement au large — voir <g ref={fieldRef}>. Le bake ne garde que l'île + relief + yole.) */}
      {/* Relief Martinique — collines comic */}
      {reliefEls.map(({vx,vy,rx},i)=>(
        <g key={i}>
          <ellipse cx={vx} cy={vy} rx={rx} ry={rx*0.66} fill="#2c5a26" opacity=".5"/>
          <path d={`M${(vx-rx*.72).toFixed(1)} ${(vy+rx*.18).toFixed(1)} Q${vx.toFixed(1)} ${(vy-rx*.78).toFixed(1)} ${(vx+rx*.72).toFixed(1)} ${(vy+rx*.18).toFixed(1)}`}
            stroke="#bfe07a" strokeWidth="2" fill="none" opacity=".55" strokeLinecap="round"/>
          <path d={`M${(vx-rx*.4).toFixed(1)} ${(vy+rx*.05).toFixed(1)} Q${(vx-rx*.05).toFixed(1)} ${(vy-rx*.5).toFixed(1)} ${(vx+rx*.35).toFixed(1)} ${(vy+rx*.02).toFixed(1)}`}
            stroke="#1d4a1c" strokeWidth="1.4" fill="none" opacity=".4" strokeLinecap="round"/>
        </g>
      ))}
      {/* Yole */}
      <g transform="translate(150 470) scale(.58)" opacity=".95">
        <ellipse cx="0" cy="26" rx="46" ry="6" fill="#06201c" opacity=".5"/>
        <g>
          <line x1="-2" y1="4" x2="-2" y2="-64" stroke="#241608" strokeWidth="3"/>
          <path d="M-2 -62 L-2 -6 L42 -6 Z" fill="url(#wmSailR)"/>
          <path d="M-2 -44 L-2 -6 L28 -6 Z" fill="url(#wmSailY)"/>
          <path d="M-4 -52 L-4 -8 L-32 -8 Z" fill="#1c7fb0" opacity=".94"/>
        </g>
        <path d="M-46 4 Q0 24 46 4 Q40 14 32 16 L-32 16 Q-40 14 -46 4 Z" fill="#0f5d54"/>
        <path d="M-46 4 Q0 18 46 4" fill="none" stroke="#B87A00" strokeWidth="1.6" strokeOpacity=".6"/>
      </g>
    </>
  )

  return(
    <div ref={wrapRef} className="sg-onink-scope" style={{
      // Safari : inset:0 atteint le vrai bas (au-dessus de la toolbar) → on le garde.
      // iOS standalone SEULEMENT (html.sg-standalone, cf. script index.html) : inset:0
      // clippe au layout viewport (~852) plus court que l'écran réel (896) → bande vide
      // en bas. On force alors la hauteur MESURÉE --sg-vh (= screen.height) pour que le
      // fond de carte descende au bord physique.
      position:"fixed",zIndex:1020,overflow:"hidden",touchAction:"none",userSelect:"none",
      ...((typeof document!=="undefined"&&document.documentElement.classList.contains("sg-standalone"))
        ?{top:0,left:0,right:0,bottom:"auto",width:"100%",height:"var(--sg-vh,100%)"}
        :{inset:0}),
      // forced-color-adjust HÉRITE → préserve les VRAIES couleurs golden-hour de TOUTE la
      // carte (fond + CTA dorés + dots de statut) même si le système force les couleurs
      // (thème contraste Windows / filtre couleur / forced-colors navigateur). Sans ça,
      // les fonds inline (#FFC72C…) étaient remappés en blanc système → boutons/scène délavés
      // (rapport fondateur 18/06). Justifié : la couleur PORTE le sens (statut vert/ambre/corail).
      forcedColorAdjust:"none",
      // A/B `map_warm` : variante golden-hour DIRECTIONNELLE — soleil chaud haut-droite →
      // ombre froide bas-gauche (lumière d'heure dorée crédible, nettement distincte du control
      // teal plat). N'affecte QUE le fond (mer) ; dots statut (#22C55E/#E8A800/#E8522A) + labels
      // vivent sur la terre (dégradé propre) → contraste préservé. Bas profond = dots lisibles.
      // Control = base teal froide (inchangée, ci-dessous).
      background: warm
        // MONDE GTA SUNSET (cohérence avec le hero) : mer-coucher-de-soleil violet→magenta
        // →orange, soleil chaud haut-droite. Remplace l'ancienne mer bleu-teal comic.
        ? "radial-gradient(110% 80% at 80% 4%, rgba(255,214,140,.6), rgba(255,140,80,.26) 34%, transparent 62%), radial-gradient(130% 110% at 6% 116%, rgba(42,21,80,.7), rgba(58,28,90,.28) 42%, transparent 62%), linear-gradient(166deg,#ff8a4d 0%,#ff7a4d 18%,#8a4a8e 40%,#6a2f9e 60%,#3e2470 82%,#2e1a5e 100%)"
        : "radial-gradient(130% 70% at 76% 4%, rgba(255,224,160,.16), transparent 48%), linear-gradient(162deg,#3aa6c4 0%,#1c6f93 40%,#103f63 72%,#0b2e4d 100%)",
    }}>
      <style>{`
        @keyframes wmSun{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        @keyframes wmHalo{0%,100%{opacity:.45}50%{opacity:.8}}
        @keyframes wmAvoidPulse{0%{opacity:.55;transform:scale(.7)}70%{opacity:0;transform:scale(1.9)}100%{opacity:0;transform:scale(1.9)}}
        @keyframes wmPulse{0%{box-shadow:0 0 0 0 rgba(232,50,42,.55)}70%{box-shadow:0 0 0 9px rgba(232,50,42,0)}100%{box-shadow:0 0 0 0 rgba(232,50,42,0)}}
        @keyframes wmSlide{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>

      {/* Bande horizon doré (heure dorée sur la mer) */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:"40%",pointerEvents:"none",zIndex:0,
        background:"linear-gradient(180deg,rgba(255,178,103,.5) 0%,rgba(255,138,61,.24) 34%,rgba(255,138,61,.08) 60%,transparent 100%)",
        mixBlendMode:"screen"}}/>

      {/* Soleil — disque chaud top-right (le « soleil » d'heure dorée) */}
      <div style={{position:"absolute",top:"-7%",right:"4%",width:130,height:130,borderRadius:"50%",
        pointerEvents:"none",zIndex:0,
        background:"radial-gradient(circle at 50% 50%, rgba(255,238,210,.96), rgba(255,178,103,.9) 38%, rgba(255,138,61,.45) 62%, transparent 74%)",
        animation:noAnim?"none":"wmSun 11s ease-in-out infinite"}}/>
      {/* Halo soleil large */}
      {!noAnim&&<div style={{position:"absolute",top:"-22%",right:"-12%",width:"80%",height:"58%",
        pointerEvents:"none",zIndex:0,
        background:"radial-gradient(closest-side, rgba(255,236,190,.40), rgba(255,210,130,.16) 48%, transparent 74%)",
        animation:"wmSun 11s ease-in-out infinite"}}/>}

      {/* Sun-glitter scintillement sur la mer (reflet doré du soleil) */}
      <div style={{position:"absolute",top:"6%",right:"2%",width:"46%",height:"60%",
        pointerEvents:"none",zIndex:0,opacity:.5,mixBlendMode:"screen",
        background:"radial-gradient(60% 40% at 78% 16%, rgba(255,224,160,.5), transparent 70%)"}}/>
      {/* Colonne de reflet solaire descendant sur la mer */}
      <div style={{position:"absolute",top:"4%",right:"14%",width:"22%",height:"66%",
        pointerEvents:"none",zIndex:0,opacity:.42,mixBlendMode:"screen",
        background:"radial-gradient(40% 100% at 50% 0%, rgba(255,228,168,.7), rgba(255,210,140,.18) 46%, transparent 78%)"}}/>

      {/* Halftone comic (points subtils, profondeur d'encre douce) */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,opacity:.10,
        backgroundImage:"radial-gradient(rgba(8,30,50,.9) 1px, transparent 1.3px)",
        backgroundSize:"7px 7px"}}/>

      {/* Dégradé bas (veil — profondeur GTA violet bas-gauche) */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
        background:"linear-gradient(200deg,rgba(42,21,80,0) 46%,rgba(26,12,46,.5) 100%)"}}/>
      {/* Grain film (cohérence monde GTA / hero) — SANS mix-blend : un overlay blend au-dessus
          du SVG recompose toute la pile à CHAQUE frame de pan/zoom (cher sur GPU mobile). Texture
          statique conservée en alpha normal. */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:3,opacity:.05,
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,backgroundSize:"cover"}}/>

      {/* SVG SOURCE DU BAKE (caché 0×0) — rendu une fois, sérialisé+rasterisé par l'effet bake.
          Hors caméra → jamais transformé ni repeint pendant le geste. */}
      <div aria-hidden="true" style={{position:"absolute",width:0,height:0,overflow:"hidden",pointerEvents:"none"}}>
        <svg ref={bakeRef} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
          {mapDefs}
          {staticWorld}
        </svg>
      </div>

      {/* ── SVG monde ──────────────────────────────────────────────────────── */}
      <svg
        style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",zIndex:1,touchAction:"none"}}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={_t(lang,`Carte ${regionName} — chaque plage, son verdict du matin. Déplace, zoome, touche une plage.`,`${regionName} map — every beach, its morning verdict. Pan, zoom, tap a beach.`,`Mapa ${regionName} — cada playa, su veredicto de la mañana. Desplaza, zoom, toca una playa.`)}
        onClick={()=>{ setSelected(null); setTagPos(null) }}
      >
        {mapDefs}

        {/* Monde — transform caméra appliqué ici via ref. (will-change retiré : sur GPU mobile
            faible il met la mémoire sous pression et n'aide pas le pinch-zoom ; la vraie promo
            couche = le bake raster du Stage 2.) */}
        <g ref={worldRef}>
          {/* Monde statique : bitmap baké (GPU-composité, scalé par la caméra) si prêt ;
              sinon SVG live en fallback (zéro flash : la côte s'affiche tout de suite). */}
          {bakedUrl
            ? <image href={bakedUrl} x="0" y="0" width="800" height="600" preserveAspectRatio="none" style={{pointerEvents:"none"}}/>
            : staticWorld}

          {/* Champ de sargasses au large — couche LIVE qui dérive LENTEMENT (peuplée impérativement).
              Clippée à la mer (jamais sur l'île). Sous les effets d'échouage + pins. Reste visible
              pendant le pan/zoom (les masquer au geste = sargasses qui « disparaissent » = raté UX). */}
          <g ref={fieldRef} clipPath="url(#wmSeaClip)" aria-hidden="true" style={{pointerEvents:"none"}}/>

          {/* Couche LIVE des effets d'échouage (peuplée impérativement par l'effet beaching).
              Sous les pins → le pin rouge `avoid` de la plage coiffe son dépôt = le verdict.
              Reste visible pendant le geste (ne PAS masquer : les sargasses ne doivent jamais
              disparaître quand on interagit). */}
          <g ref={fxRef} aria-hidden="true" style={{pointerEvents:"none"}}/>

          {/* Pins plages — marqueurs comic teardrop ink-outline */}
          {beachList.map(b=>{
            const st=b.days[day] // null tant que le statut n'est pas chargé → pin GRIS, pas vert
            const isSel=selected?.id===b.id
            // Rétrogradé en point dans un cluster dense (sauf le sélectionné) → petit point cliquable,
            // hit-zone élargie, pas de label. Tap → ouvre la fiche (funnel préservé).
            if(pinTier[b.id]==="dot"&&!isSel){
              const dotCol=st==="clean"?"#22C55E":st==="moderate"?"#B87A00":st==="avoid"?"#E8522A":"#9aa0a8"
              return(
                <g key={b.id} transform={`translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`} style={{cursor:"pointer"}}
                  onClick={e=>{ e.stopPropagation(); selectBeach(b); if(onOpenBeach){ try{track&&track("sg_beach_open",{from:"map_dot"})}catch(_){}; onOpenBeach(b) } }}>
                  <circle r="8" fill="transparent"/>
                  <circle r="3.2" fill={dotCol} stroke={INK} strokeWidth="1"/>
                </g>
              )
            }
            const fill=st==="clean"?"url(#wmPinClean)":st==="moderate"?"url(#wmPinMod)":st==="avoid"?"url(#wmPinAvoid)":"#9aa0a8"
            const s=isSel?1.18:1
            return(
              <g key={b.id}
                transform={`translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`}
                style={{cursor:"pointer"}}
                onClick={e=>{ e.stopPropagation();
                  // Tap pin → OUVRE la fiche directement (chemin tactile fiable : le pin est
                  // dans le SVG qui reçoit le touch ; le CTA « Voir la plage » en couche chrome
                  // n'était pas tapable au doigt → funnel cassé, fix P0 audit). La couleur du
                  // pin indique déjà le statut, pas besoin d'aperçu intermédiaire.
                  selectBeach(b)
                  if(onOpenBeach){ try{track&&track("sg_beach_open",{from:"map_pin"})}catch(_){}; onOpenBeach(b) }
                }}>
                {/* halo doux pour les propres / pulsation sélection */}
                {(!noAnim&&st==="clean")&&<circle r="13" cy="-9" fill="url(#wmPhalo)"
                  style={{animation:"wmHalo 3.6s ease-in-out infinite"}}/>}
                {/* PREMIUM — anneau « à éviter » du jour AFFICHÉ : UNIQUEMENT sur le pin
                    SÉLECTIONNÉ (1 à l'écran) — l'anneau pulsant sur N pins faisait « gadget »
                    (revue product-design). Le pin rouge porte déjà le statut ; le badge
                    « bascule J+N » reste le seul signal d'ambiance. Pulse si anim, pointillé
                    statique si reduced-motion (a11y). */}
                {mapPremium&&st==="avoid"&&day>=1&&isSel&&(
                  noAnim
                    ? <circle r="11" cy="-9" fill="none" stroke="#E8522A" strokeWidth="2" strokeDasharray="3 2.4" aria-hidden="true"/>
                    : <circle r="11" cy="-9" fill="none" stroke="#E8522A" strokeWidth="2"
                        style={{transformBox:"fill-box",transformOrigin:"center",animation:"wmAvoidPulse 1.9s ease-out infinite",animationDelay:`${((Math.abs(b.vx*7+b.vy*13))%900)/1000}s`}} aria-hidden="true"/>
                )}
                {/* PREMIUM — badge d'AMBIANCE « bascule J+N » : on lit d'un coup d'œil, sans rien taper,
                    quelles plages basculent et quand. Corail (imminent) / pâle+petit (horizon lointain) /
                    ✓ vert UNIQUEMENT si la semaine entière est mesurée ET propre (jamais sur données
                    partielles). En rollback ?mapfrise=0 → ancien badge or « +Nj ». */}
                {mapPremium&&(()=>{
                  if(mapFriseOff){
                    if(b.firstHit==null||b.firstHit<1)return null
                    return(<g transform="translate(0 -31)" aria-hidden="true">
                      <rect x="-14" y="-7" width="28" height="13.5" rx="6.75" fill="#FFC72C" stroke={INK} strokeWidth="1.4"/>
                      <text x="0" y="2.7" textAnchor="middle" fontSize="8" fontWeight="800" fill="#0d0b14" fontFamily="'Bricolage Grotesque',system-ui,sans-serif">{ti(lang,DAY_LBL[b.firstHit])}</text>
                    </g>)
                  }
                  if(b.firstHit!=null&&b.firstHit>=1){
                    const far=b.firstHit>=4, w=far?25:28
                    return(<g transform="translate(0 -31)" aria-label={`${_t(lang,"bascule","flips","cambia")} ${ti(lang,DAY_LBL[b.firstHit])}`}>
                      <rect x={-w/2} y="-7" width={w} height="13.5" rx="6.75" fill={far?"#F2A57A":"#E8522A"} stroke={INK} strokeWidth="1.4"/>
                      <text x="0" y="2.7" textAnchor="middle" fontSize={far?7:8} fontWeight="800" fill="#fff" fontFamily="'Bricolage Grotesque',system-ui,sans-serif">{ti(lang,DAY_LBL[b.firstHit])}</text>
                    </g>)
                  }
                  // Pas de badge « ✓ propre » d'ambiance : en saison calme ce serait sur quasi tous
                  // les pins (clutter). Le pin vert = propre aujourd'hui ; la frise (au tap) montre
                  // la semaine propre complète. On ne marque QUE ce qui mérite l'attention (bascule).
                  return null
                })()}
                {/* ombre au sol */}
                <ellipse cx="0" cy="1" rx={5*s} ry={2*s} fill="#062033" opacity=".4"/>
                {/* corps teardrop : pointe en bas (cy=0), bulbe au-dessus */}
                <g transform={`scale(${s})`} style={{transition:"transform .16s cubic-bezier(.34,1.56,.64,1)"}}>
                  <path d="M0 0 C-5.4 -7 -8 -10.4 -8 -14.4 A8 8 0 1 1 8 -14.4 C8 -10.4 5.4 -7 0 0 Z"
                    fill={fill} stroke={INK} strokeWidth="1.6" strokeLinejoin="round"/>
                  {/* reflet lumineux (volume comic) */}
                  <ellipse cx="-2.6" cy="-17" rx="2.4" ry="3.2" fill="#fff" opacity=".5"/>
                  {/* score visible quand sélectionné, sinon trou blanc */}
                  {isSel&&b.score!=null
                    ? <text x="0" y="-11.4" textAnchor="middle"
                        fontSize="8.5" fontWeight="800" fill={INK}
                        fontFamily="'AntonLC','Anton',sans-serif">{Math.round(b.score)}</text>
                    : <circle cx="0" cy="-14.4" r="3" fill="#fff" stroke={INK} strokeWidth=".7"/>}
                </g>
              </g>
            )
          })}

        </g>

        {/* Veilleur satellite — canonique comic, hors du monde, ne zoome pas, veille la mer */}
        <g transform="translate(666 44) scale(.84)" opacity=".95" aria-hidden="true">
          <circle cx="60" cy="60" r="46" fill="url(#wmPhalo)"/>
          {/* panneaux solaires comic ink */}
          <g stroke="#0d0b14" strokeWidth="2.5">
            <rect x="2"   y="50" width="30" height="20" rx="3" fill="#5b3a8e" transform="rotate(-8 17 60)"/>
            <rect x="88"  y="50" width="30" height="20" rx="3" fill="#5b3a8e" transform="rotate(8 103 60)"/>
            <line x1="32" y1="60" x2="46" y2="60"/><line x1="88" y1="60" x2="74" y2="60"/>
          </g>
          {/* corps crème */}
          <circle cx="60" cy="63" r="34" fill="#fdf6e3" stroke="#0d0b14" strokeWidth="3"/>
          {/* antenne + boule jaune */}
          <line x1="60" y1="29" x2="60" y2="14" stroke="#0d0b14" strokeWidth="3"/>
          <circle cx="60" cy="11" r="5" fill="#ffd23f" stroke="#0d0b14" strokeWidth="2"/>
          {/* œil amical + iris selon humeur */}
          <circle cx="60" cy="63" r="20" fill="#0d0b14"/>
          <circle cx="60" cy="63" r="14" fill={vant}/>
          <circle cx="60" cy="63" r="6"  fill="#0d0b14"/>
          <circle cx="55" cy="58" r="2.5" fill="#fff"/>
          {/* sourcil + sourire */}
          <path d="M44 47 Q60 41 76 47" stroke="#0d0b14" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M50 89 Q60 95 70 89" stroke="#0d0b14" strokeWidth="3" fill="none" strokeLinecap="round"/>
        </g>
      </svg>

      {/* Labels plages — couche HTML screen-space (hors transform SVG → taille pixel constante) */}
      <div ref={labelLayerRef} style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:5,overflow:"hidden"}}>
        {beachList.filter(b=>labeledIds.has(b.id)).map(b=>{
          const st=b.days[day]
          const col=STATUS_C[st]||"#888"
          const li=lang==="en"?1:lang==="es"?2:0
          return(
            <div key={b.id}
              data-vx={b.vx}
              data-vy={b.vy}
              data-status={st}
              data-sel={selected?.id===b.id?"1":"0"}
              style={{
                position:"absolute",left:0,top:0,
                transform:"translate(-50%,-100%)",
                paddingBottom:8,
                textAlign:"center",
                whiteSpace:"nowrap",
              }}>
              <div style={{
                font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
                color:"#fff",
                textShadow:`1px 1px 0 ${INK},0 0 5px ${INK},0 0 9px rgba(13,11,20,.65)`,
              }}>{b.name}</div>
              <div style={{
                font:"800 9px/1 'Bricolage Grotesque',system-ui,sans-serif",
                letterSpacing:".05em",
                textTransform:"uppercase",
                color:col,
                marginTop:2,
                textShadow:`1px 1px 0 ${INK},0 0 4px ${INK}`,
              }}>{STATUS_LBL[st]?.[li]}</div>
            </div>
          )
        })}
      </div>

      {/* ══ CHROME HTML ══════════════════════════════════════════════════════════ */}
      {/* data-vmui : le handler de pan (onDown) ignore les pointeurs qui démarrent ici,
          sinon un tap "tremblé" (>2px) sur un bouton (ex. « Voir la plage ») est traité
          comme un pan → setSelected(null) + setPointerCapture volent le clic au bouton
          → la fiche ne s'ouvrait jamais au doigt (P0 audit). */}
      <div data-vmui="1" style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:10}}>

        {/* Barre top */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"calc(12px + env(safe-area-inset-top)) 16px 12px",
          maxWidth:560,margin:"0 auto",
        }}>
          {/* Pill EN DIRECT */}
          <div style={{
            display:"inline-flex",alignItems:"center",gap:7,pointerEvents:"auto",
            whiteSpace:"nowrap",flexShrink:0,
            padding:"6px 12px 6px 10px",borderRadius:999,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,
          }}>
            <div style={{
              width:8,height:8,borderRadius:"50%",background:"#009E8E",border:`1.5px solid ${INK}`,
              animation:noAnim?"none":"wmPulse 2.4s ease-out infinite",
            }}/>
            <span style={{font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",letterSpacing:".06em",textTransform:"uppercase",color:INK}}>{updatedAt&&isStale(updatedAt)?_t(lang,"DONNÉE EN RETARD","DATA DELAYED","DATO EN RETRASO"):_t(lang,"EN DIRECT","LIVE","EN VIVO")}</span>
            <span style={{font:"700 11px/1 'JetBrains Mono',monospace",color:updatedAt&&isStale(updatedAt)?"#B87A00":"#00786C",marginLeft:2}}>
              {updatedAt?_t(lang,`il y a ${fmtFresh(updatedAt)}`,`${fmtFresh(updatedAt)} ago`,`hace ${fmtFresh(updatedAt)}`):"···"}
            </span>
            {/* Companion edit line 1193: background:updatedAt&&isStale(updatedAt)?"#B87A00":"#009E8E" */}
          </div>
          {/* P7 — Recherche plage par nom (carte-monde) */}
          <div style={{position:"relative",flex:1,minWidth:0,margin:"0 8px",maxWidth:260,pointerEvents:"auto"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#fdf6e3",border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:10,padding:"6px 10px"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" style={{opacity:.5,flexShrink:0}}><circle cx="10" cy="10" r="6.5"/><path d="m20 20-5-5"/></svg>
              <input value={query} onChange={e=>setQuery(e.target.value)}
                placeholder={_t(lang,"Chercher…","Search…","Buscar…")}
                /* font-size 16px OBLIGATOIRE : iOS Safari zoome la page dès qu'un <input>
                   focus a un font-size < 16px, et NE réinitialise PAS ce zoom quand l'overlay
                   plein écran (ChasseDetail, position:fixed) s'ouvre au clic d'un résultat →
                   fiche « zoomée »/décalée, interface cassée. Garder ≥16px. */
                style={{flex:1,minWidth:0,background:"none",border:"none",outline:"none",font:"700 16px/1 'Bricolage Grotesque',system-ui,sans-serif",color:INK}}/>
              {query&&<button onClick={()=>setQuery("")} aria-label="clear" style={{background:"none",border:"none",color:INK,opacity:.5,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>✕</button>}
            </div>
            {matches.length>0&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,background:"#fdf6e3",border:`2.5px solid ${INK}`,boxShadow:`3px 4px 0 ${INK}`,borderRadius:12,overflow:"hidden",zIndex:20}}>
                {matches.map(b=>(
                  <button key={b.id} onClick={()=>{try{track&&track("sg_map_search_open",{id:b.id})}catch(_){}; setQuery(""); onOpenBeach&&onOpenBeach(b)}}
                    style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",background:"none",border:"none",borderBottom:"1px solid rgba(13,11,20,.12)",padding:"9px 11px",cursor:"pointer",font:"700 12.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif",color:INK}}>
                    <span style={{width:9,height:9,borderRadius:"50%",background:STATUS_C[b.status]||"#9aa0a8",flexShrink:0}}/>
                    <span style={{flex:1}}>{b.name}</span>
                    {b.commune&&<span style={{opacity:.5,fontWeight:600,fontSize:11}}>{b.commune}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Fermer (hors rootMode) */}
          {!rootMode&&<button onClick={onClose} style={{
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,
            background:"#fdf6e3",
            color:INK,font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
            padding:"8px 12px",borderRadius:10,cursor:"pointer",pointerEvents:"auto",
          }}>✕</button>}
        </div>

        {/* H1 + jauge */}
        <div style={{
          position:"absolute",top:topInset?(topInset+58)+"px":"calc(58px + env(safe-area-inset-top))",
          left:0,right:0,maxWidth:560,margin:"0 auto",padding:"0 18px",pointerEvents:"none",
        }}>
          <h2 style={{
            fontFamily:"'AntonLC','Anton',sans-serif",
            fontWeight:400,letterSpacing:"-.01em",textTransform:"uppercase",
            fontSize:"clamp(24px,6.4vw,32px)",lineHeight:.96,color:"#fff",
            textShadow:`2px 2px 0 ${INK},0 3px 14px rgba(0,0,0,.45)`,margin:0,
          }}>
            {regionName} <span style={{color:"#ffd23f"}}>{dayLbl}</span>
          </h2>
          <div style={{
            marginTop:9,display:"inline-flex",alignItems:"center",gap:9,pointerEvents:"auto",
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:12,padding:"8px 13px",
          }}>
            <div style={{width:104,height:8,borderRadius:5,background:"#fff",border:`2px solid ${INK}`,overflow:"hidden"}}>
              <div style={{
                height:"100%",background:"linear-gradient(90deg,#22C55E,#B87A00)",transition:"width .4s ease",
                width:beachList.length?Math.round(cleanCnt/beachList.length*100)+"%":"0%",
              }}/>
            </div>
            <span style={{font:"700 12.5px/1 'Bricolage Grotesque',system-ui,sans-serif",color:INK}}>
              <b style={{fontFamily:"'AntonLC','Anton',sans-serif",fontWeight:400,color:"#177A42"}}>{cleanCnt}</b> {_t(lang,`plages propres ${dayLbl}`,`clean beaches ${dayLbl}`,`playas limpias ${dayLbl}`)}
            </span>
          </div>

          {/* Capture email — sticker compact, VISIBLE PAR DÉFAUT sur la carte, dismissable 1×.
              Style aligné sur les overlays carte (#fdf6e3 + bord INK + ombre comic). */}
          {!emailHidden&&!emailSent&&(
            <div onPointerDown={e=>{try{e.stopPropagation()}catch(_){}}}
              style={{
                marginTop:9,display:"flex",alignItems:"center",gap:7,pointerEvents:"auto",
                maxWidth:360,background:"#fdf6e3",
                border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:12,padding:"7px 9px",
              }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" style={{flexShrink:0}}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              <input type="email" inputMode="email" autoComplete="email"
                value={emailVal} onChange={e=>setEmailVal(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")submitMapEmail()}}
                placeholder={_t(lang,"ton@email — verdict gratuit","your@email — free verdict","tu@email — veredicto gratis")}
                style={{flex:1,minWidth:0,background:"#fff",border:`2px solid ${INK}`,borderRadius:8,
                  padding:"6px 9px",font:"700 16px/1 'Bricolage Grotesque',system-ui,sans-serif",color:INK,outline:"none"}}/>
              <button onClick={submitMapEmail} disabled={!emailVal||!emailVal.includes("@")}
                style={{flexShrink:0,border:`2px solid ${INK}`,
                  background:(emailVal&&emailVal.includes("@"))?"#ffd23f":"rgba(13,11,20,.08)",
                  color:INK,font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
                  padding:"7px 11px",borderRadius:8,cursor:(emailVal&&emailVal.includes("@"))?"pointer":"not-allowed"}}>OK</button>
              <button onClick={()=>{try{localStorage.setItem("sg_hero_email_dismiss","1")}catch(_){}; setEmailHidden(true); try{track&&track("sg_map_email_dismiss",{})}catch(_){}}}
                aria-label={_t(lang,"Fermer","Close","Cerrar")}
                style={{flexShrink:0,background:"none",border:"none",color:INK,opacity:.5,
                  fontSize:16,lineHeight:1,cursor:"pointer",padding:"0 2px"}}>×</button>
            </div>
          )}
          {emailSent&&(
            <div style={{
              marginTop:9,display:"inline-flex",alignItems:"center",gap:7,pointerEvents:"auto",
              background:"#fdf6e3",border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:12,padding:"8px 12px",
            }}>
              <span style={{fontSize:14}}>✅</span>
              <span style={{font:"800 12px/1.2 'Bricolage Grotesque',system-ui,sans-serif",color:"#177A42"}}>
                {_t(lang,"C'est fait. Le verdict du matin t'attend demain — mesuré, pas deviné.","Done. The morning verdict lands tomorrow — measured, not guessed.","Listo. El veredicto de la mañana llega mañana — medido, no adivinado.")}
              </span>
            </div>
          )}
        </div>

        {/* Aperçu vendeur B2B : carte « Partenaire (aperçu) » flottante (depuis /pro/espace/,
            ?preview_name=). Montre à l'hôtelier son futur encart. Verdict = 100% data, intact. */}
        {previewHotel&&(
          <div style={{position:"absolute",left:"50%",top:"min(33%, 300px)",transform:"translateX(-50%)",
            width:"calc(100% - 40px)",maxWidth:380,pointerEvents:"auto",
            background:"#fff",border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:14,padding:"12px 14px",
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
              <span style={{font:"800 8.5px/1 'Bricolage Grotesque'",letterSpacing:".09em",textTransform:"uppercase",color:"#7a7320",background:"#fbf2c4",border:`1px solid ${INK}`,borderRadius:4,padding:"2px 6px"}}>{_t(lang,"Partenaire","Partner","Socio")}</span>
              <span style={{font:"800 8.5px/1 'Bricolage Grotesque'",letterSpacing:".06em",textTransform:"uppercase",color:"#b4540a"}}>{_t(lang,"aperçu","preview","vista previa")}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:11}}>
              <span style={{flex:"0 0 auto",width:42,height:42,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,background:"#f1ede2",border:`1.5px solid ${INK}`}}>🏨</span>
              <div style={{flex:"1 1 auto",minWidth:0}}>
                <div style={{font:"800 14px/1.2 'Bricolage Grotesque'",color:"#1a1726",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{previewHotel}</div>
                <div style={{font:"600 11px/1.35 'Bricolage Grotesque'",color:"#6b6b75",marginTop:2}}>{_t(lang,"Votre encart, sur la fiche de votre plage. Le verdict reste 100 % data.","Your spot, on your beach's page. The verdict stays 100% data.","Tu marca, en la ficha de tu playa. El veredicto sigue 100 % datos.")}</div>
              </div>
            </div>
          </div>
        )}

        {/* Légende */}
        <div style={{
          position:"absolute",left:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          display:"flex",flexDirection:"column",gap:5,pointerEvents:"none",
        }}>
          {[["#22C55E",_t(lang,"Propre","Clean","Limpia")],
            ["#B87A00",_t(lang,"Modéré","Moderate","Moderado")],
            ["#E8522A",_t(lang,"À éviter","Avoid","Evitar")]].map(([c,l])=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:7,
              font:"700 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
              color:"#fff",textShadow:`0 1px 0 ${INK},0 0 4px ${INK}`}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c,border:`1.5px solid ${INK}`}}/>{l}
            </div>
          ))}
          {!proMapOff&&onOpenPro&&(
            <button className="sg-mapchip" onClick={()=>{try{track&&track("sg_b2b_open",{source:"map_legend"})}catch(_){}; onOpenPro()}}
              style={{pointerEvents:"auto",marginTop:6,display:"inline-flex",alignItems:"center",gap:5,
                cursor:"pointer",textAlign:"left",
                // Pastille sombre OPAQUE + texte blanc plein → lisible quel que soit
                // le fond de carte (solide, pas de semi-transparence qui laisse passer le sombre).
                background:"#190c2c",border:`1.5px solid rgba(255,255,255,.28)`,borderRadius:999,
                padding:"4px 10px",
                font:"800 10.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif",
                color:"#fdfcf7",textShadow:"0 1px 2px rgba(0,0,0,.55)"}}>
              <span aria-hidden="true">🏨</span>{_t(lang,"Vous gérez un hôtel ?","Run a hotel?","¿Gestionas un hotel?")}
            </button>
          )}
        </div>

        {/* Bouton Près de moi — TEXTE BLANC sur pastille SOMBRE OPAQUE (recette FAB,
            prouvée sur cette carte). Le texte ne peut JAMAIS virer noir-illisible :
            la couleur EST blanche, indépendante du fond de pastille (le crème ne
            peignait pas de façon fiable sur iOS → texte ink sur carte sombre = noir). */}
        <button className="sg-mapchip" style={{
          position:"absolute",right:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          pointerEvents:"auto",display:"inline-flex",alignItems:"center",gap:7,
          background:"#190c2c",
          color:"#fdfcf7",border:`2.5px solid ${INK}`,font:"800 12.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
          padding:"11px 14px",borderRadius:999,cursor:"pointer",textShadow:"0 1px 2px rgba(0,0,0,.55)",
          boxShadow:`3px 3px 0 ${INK}`,
        }} onClick={nearMe}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#009E8E" stroke="#fdfcf7" strokeWidth="1.8" style={{flexShrink:0}}><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.6" fill="#fdfcf7" stroke="none"/></svg> {_t(lang,"Une plage propre près de moi","A clean beach near me","Una playa limpia cerca")}
        </button>

        {/* Bouton son d'échouage (mute/unmute) — son ON par défaut, débloqué au 1er geste */}
        <button aria-label={muted?_t(lang,"Activer le son d'échouage","Enable beaching sound","Activar sonido"):_t(lang,"Couper le son d'échouage","Mute beaching sound","Silenciar")}
          onClick={()=>{ const m=!muted; setMuted(m); mutedRef.current=m; if(!m){ ensureAudio(); playBoump(.9) } }}
          style={{
            position:"absolute",right:16,bottom:"calc(124px + env(safe-area-inset-bottom))",
            pointerEvents:"auto",width:42,height:42,display:"inline-flex",alignItems:"center",justifyContent:"center",
            background:"#fdf6e3",color:INK,border:`2.5px solid ${INK}`,fontSize:17,
            borderRadius:999,cursor:"pointer",boxShadow:`3px 3px 0 ${INK}`,
          }}>{muted?<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>}</button>

        {/* Partager ma plage (carte virale golden-hour) — sur la plage sélectionnée, au-dessus
            du mute dans la pile droite. Pastille encre + picto blanc (recette sg-mapchip,
            lisible garanti). Rollback ?mapshare=0. */}
        {selected&&onShare&&!mapShareOff&&(
          <button className="sg-mapchip" aria-label={_t(lang,"Partager ma plage","Share my beach","Compartir mi playa")}
            onClick={onShareSel}
            style={{
              position:"absolute",right:16,bottom:"calc(176px + env(safe-area-inset-bottom))",
              pointerEvents:"auto",width:42,height:42,display:"inline-flex",alignItems:"center",justifyContent:"center",
              cursor:"pointer",
            }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fdfcf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>
          </button>
        )}

        {/* Scrub jours — Gratuit : J0 libre · J1-5 verrouillés → Premium.
            Premium (mapPremium) : 6 jours déverrouillés, prévision RÉELLE par plage,
            ZÉRO cadenas. C'est LE bénéfice premium visible sur la home (la carte). */}
        <div style={{
          position:"absolute",left:0,right:0,bottom:"calc(120px + env(safe-area-inset-bottom))",
          display:"flex",flexDirection:"column",alignItems:"center",gap:7,pointerEvents:"none",
        }}>
          {/* DÉCISION — verdict « ma semaine » (Premium, hors sélection pour ne pas se
              superposer au tooltip). Agrégat île RÉEL : meilleur jour + valeur sûre. */}
          {weekDigest&&!selected&&(
            <button ref={digestBtnRef} type="button"
              aria-haspopup={weekhubOff?undefined:"dialog"} aria-expanded={weekhubOff?undefined:showHub}
              aria-label={weekhubOff?undefined:_t(lang,"Ouvrir le hub prévision de ta semaine","Open your week forecast hub","Abrir tu centro de pronóstico")}
              onClick={weekhubOff?undefined:()=>{setShowHub(true);try{track&&track("sg_weekhub_open_cta",{island})}catch(_){}}}
              style={{
              WebkitAppearance:"none",appearance:"none",font:"inherit",
              pointerEvents:weekhubOff?"none":"auto",cursor:weekhubOff?"default":"pointer",
              maxWidth:300,textAlign:"center",
              background:"#eafaf1",color:INK,border:`2px solid ${INK}`,boxShadow:`2px 2px 0 ${INK}`,
              borderRadius:12,padding:"6px 12px",position:"relative",
              fontWeight:800,fontSize:11,lineHeight:1.25,fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
            }}>
              {weekDigest.calm?(
                <>
                  <div>{_t(lang,
                    "🌴 Toute ta semaine au vert",
                    "🌴 Your whole week is green",
                    "🌴 Toda tu semana en verde")}</div>
                  <div style={{font:"700 9px/1.2 'Bricolage Grotesque',system-ui,sans-serif",opacity:.82,marginTop:2}}>{_t(lang,
                    "On surveille pour toi — alerte à la seconde où ça bascule.",
                    "We watch for you — alerted the second it shifts.",
                    "Vigilamos por ti — aviso en cuanto cambie.")}</div>
                </>
              ):(<>
                <div>{_t(lang,
                  `📅 Ta semaine — meilleur jour ${ti(lang,DAY_LBL[weekDigest.bestDay])} : ${weekDigest.bestN} plage${weekDigest.bestN>1?"s":""} propre${weekDigest.bestN>1?"s":""}`,
                  `📅 Your week — best day ${ti(lang,DAY_LBL[weekDigest.bestDay])}: ${weekDigest.bestN} clean beach${weekDigest.bestN>1?"es":""}`,
                  `📅 Tu semana — mejor día ${ti(lang,DAY_LBL[weekDigest.bestDay])}: ${weekDigest.bestN} playa${weekDigest.bestN>1?"s":""} limpia${weekDigest.bestN>1?"s":""}`)}</div>
                {weekDigest.safe&&<div style={{font:"700 9px/1.2 'Bricolage Grotesque',system-ui,sans-serif",opacity:.82,marginTop:2}}>{_t(lang,
                  `Valeur sûre : ${weekDigest.safe.name} — propre ${weekDigest.safeK}/6 j`,
                  `Safe bet: ${weekDigest.safe.name} — clean ${weekDigest.safeK}/6 d`,
                  `Apuesta segura: ${weekDigest.safe.name} — limpia ${weekDigest.safeK}/6 d`)}</div>}
              </>)}
              {!weekhubOff&&<span aria-hidden="true" style={{position:"absolute",top:3,right:6,font:"800 9px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#0a7d33"}}>↗</span>}
            </button>
          )}
          {/* Bandeau confiance (Premium, jour futur sélectionné) — honnêteté : date réelle +
              tier de confiance décroissant (J+5 = faible), « mesuré au satellite ». */}
          {/* Bannières d'origine — UNIQUEMENT en rollback ?mapfrise=0 (sinon l'info vit dans la frise) */}
          {mapPremium&&mapFriseOff&&day>=1&&(()=>{
            const far=day>=4
            const hitCount=beachList.filter(b=>b.days[day]==="avoid").length
            const hitStr=hitCount>0
              ? _t(lang,`${hitCount} ${hitCount>1?"plages touchées":"plage touchée"}`,`${hitCount} ${hitCount>1?"beaches hit":"beach hit"}`,`${hitCount} ${hitCount>1?"playas afectadas":"playa afectada"}`)
              : _t(lang,"aucune plage touchée prévue","no beaches forecast hit","ninguna playa afectada prevista")
            const dateStr=(()=>{try{const c=beachList.find(b=>b.fc&&b.fc[day]&&b.fc[day].date);const ds=c&&c.fc[day].date;if(!ds)return null;const dt=new Date(ds);return dt.toLocaleDateString(lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR",{weekday:"short",day:"numeric",month:"short"})}catch(_){return null}})()
            return(
              <div role="status" style={{
                pointerEvents:"none",maxWidth:340,textAlign:"center",
                background:far?"#fff3e0":"#eafaf1",color:INK,
                border:`2px solid ${INK}`,boxShadow:`2px 2px 0 ${INK}`,borderRadius:12,
                padding:"6px 12px",font:"700 11px/1.35 'Bricolage Grotesque',system-ui,sans-serif",
              }}>
                <b style={{fontWeight:800}}>{_t(lang,"Prévu","Forecast","Previsto")} {ti(lang,DAY_LBL[day])}{dateStr?` · ${dateStr}`:""} · {hitStr}</b><br/>
                {far
                  ? _t(lang,"Fin de semaine : on lit la tendance, pas encore la certitude. On affine chaque matin.","End of week: we read the trend, not yet certainty. We sharpen it each morning.","Fin de semana: leemos la tendencia, aún no la certeza. La afinamos cada mañana.")
                  : _t(lang,"Confiance forte sur ces jours — 76 à 79 % de justesse selon la saison.","Strong confidence on these days — 76-79% accuracy by season.","Confianza alta en estos días — 76-79 % de acierto según temporada.")}
              </div>
            )
          })()}
          {/* Hint Premium one-shot — UNIQUEMENT en rollback ?mapfrise=0 (plus de slider à expliquer) */}
          {mapPremium&&mapFriseOff&&premiumHint&&(
            <div role="status" style={{
              pointerEvents:"none",maxWidth:300,textAlign:"center",
              background:"#FFC72C",color:"#0d0b14",
              border:`2px solid ${INK}`,boxShadow:`2px 2px 0 ${INK}`,borderRadius:12,
              padding:"6px 12px",font:"800 11px/1.3 'Bricolage Grotesque',system-ui,sans-serif",
            }}>
              ⭐ {_t(lang,"Premium actif — fais glisser les jours, la prévision est à toi.","Premium active — slide through the days, the forecast is yours.","Premium activo — desliza los días, el pronóstico es tuyo.")}
            </div>
          )}
          <div style={{
            pointerEvents:"auto",display:"flex",gap:4,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:999,padding:4,
          }}>
            {DAY_LBL.map((lbl,i)=>{
              const locked = i>=1 && !mapPremium
              return(
              <button key={i} aria-label={ti(lang,lbl)+(locked?" 🔒":"")} style={{
                WebkitAppearance:"none",appearance:"none",
                border:day===i?`2px solid ${INK}`:"2px solid transparent",position:"relative",
                background:day===i?"#ff7a2f":(mapPremium&&i>=1?"rgba(255,199,44,.18)":"transparent"),
                color:INK,
                font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
                padding:"7px 10px",borderRadius:999,cursor:"pointer",
              }} onClick={()=>{
                if(locked){ try{track&&track("sg_map_scrub_locked",{day:i})}catch(_){}; onPremium&&onPremium("map_scrub_forecast"); return }
                setDay(i)
                if(i>=1&&mapPremium&&mapFriseOff){ setPremiumHint(true); try{clearTimeout(hintTimerRef.current)}catch(_){}; hintTimerRef.current=setTimeout(()=>setPremiumHint(false),3200) }
                try{track&&track("sg_map_scrub",{day:i,island,premium:!!mapPremium})}catch(_){}
              }}>
                {ti(lang,lbl)}
                {locked&&<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.6" style={{position:"absolute",top:1,right:2}}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>}
                {/* Confiance par jour (premium déverrouillé) : plein J0-2 · demi J3 · pointillé J4-5
                    → l'utilisateur SAIT quand il entre en zone « tendance » (honnêteté, revue design). */}
                {mapPremium&&!locked&&i>=1&&(()=>{const tier=i>=4?"low":i===3?"med":"high";return(
                  <span aria-hidden="true" style={{display:"block",width:4,height:4,borderRadius:"50%",margin:"3px auto 0",boxSizing:"border-box",
                    background:tier==="high"?INK:"transparent",
                    backgroundImage:tier==="med"?`linear-gradient(90deg,${INK} 0 50%,transparent 50% 100%)`:"none",
                    border:tier==="low"?`1px dotted ${INK}`:tier==="med"?`1px solid ${INK}`:"none"}}/>
                )})()}
              </button>
            )})}
          </div>
        </div>

        {/* Dock bas — label « Carte » inerte (cursor:default, sans onClick) RETIRÉ :
            on est déjà sur la carte, il ne servait à rien (retour fondateur). On ne garde
            que le ✕ Fermer, et SEULEMENT hors rootMode (en rootMode la carte EST l'app). */}
        {!rootMode&&<div style={{
          position:"absolute",left:0,right:0,bottom:"calc(16px + env(safe-area-inset-bottom))",
          display:"flex",justifyContent:"center",pointerEvents:"none",
        }}>
          <div style={{
            pointerEvents:"auto",display:"flex",gap:3,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:999,padding:5,
          }}>
            <button onClick={onClose} style={{
              display:"flex",alignItems:"center",gap:6,border:`2px solid ${INK}`,
              background:"#ffd23f",color:INK,
              font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
              padding:"8px 14px",borderRadius:999,cursor:"pointer",
            }}>✕ {_t(lang,"Fermer","Close","Cerrar")}</button>
          </div>
        </div>}

        {/* Tooltip plage sélectionnée */}
        {selected&&tagPos&&(
          <div style={{
            position:"absolute",left:tagPos.x,top:tagPos.y-14,
            transform:"translate(-50%,-100%)",
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:12,padding:"8px 11px",
            pointerEvents:"none",whiteSpace:"nowrap",
          }}>
            <div style={{font:"400 14px/1.1 'AntonLC','Anton',sans-serif",letterSpacing:".01em",color:INK}}>{selected.name}</div>
            <div style={{font:"800 10.5px/1 'Bricolage Grotesque',system-ui,sans-serif",letterSpacing:".04em",
              textTransform:"uppercase",marginTop:4,display:"flex",alignItems:"center",gap:5,color:INK}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:STATUS_C[selected.days[day]]||"#9aa0a8",border:`1.5px solid ${INK}`}}/>
              <span>{ti(lang,STATUS_LBL[selected.days[day]]||["—","—","—"])}</span>
            </div>
            {selected.commune&&<div style={{font:"700 10px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#6b6478",marginTop:4}}>{selected.commune}</div>}
            {/* ── LA FRISE (Premium) : 7 jours d'un coup d'œil, sans slider. Statut RÉEL par jour
                (gris hachuré si non mesuré, jamais inventé) + point de confiance (plein/demi/creux
                pointillé en horizon lointain) + 🚩 sur le jour de bascule + sens de dérive. ── */}
            {friseOn&&selected.days&&(
              <div role="group" aria-label={_t(lang,`Prévision 7 jours ${selected.name}`,`7-day forecast ${selected.name}`,`Pronóstico 7 días ${selected.name}`)}
                style={{marginTop:8,display:"flex",alignItems:"flex-start",gap:3}}>
                {[0,1,2,3,4,5].map(d=>{
                  const st=selected.days[d]
                  const isHit=d===selected.firstHit
                  const bg=st?STATUS_C[st]:null
                  const cf=selected.conf?selected.conf[d]:null
                  const tier=cf==null?null:(d>=4?"low":cf>=55?"high":cf>=38?"med":"low")
                  const lbl=ti(lang,DAY_LBL[d])
                  const stLbl=ti(lang,STATUS_LBL[st]||["—","—","—"])
                  return(
                    <div key={d} role="img" aria-label={`${lbl} · ${stLbl}${tier==="low"?" · "+_t(lang,"indicatif","indicative","indicativo"):""}`}
                      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,width:17,position:"relative"}}>
                      {isHit&&<span aria-hidden="true" style={{position:"absolute",top:-9,fontSize:8,lineHeight:1}}>🚩</span>}
                      <span style={{font:"800 7px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#6b6478",marginTop:isHit?3:0}}>{lbl}</span>
                      <div style={{width:15,height:15,borderRadius:4,boxSizing:"border-box",
                        background:bg||"#efe9da",
                        backgroundImage:bg?"none":"repeating-linear-gradient(45deg,#d2ccbd 0 3px,#efe9da 3px 6px)",
                        border:`${st==="avoid"?2.4:1.4}px solid ${INK}`,
                        boxShadow:isHit?`0 0 0 1.6px #FFC72C`:"none"}}/>
                      <span aria-hidden="true" style={{width:5,height:5,borderRadius:"50%",boxSizing:"border-box",
                        background:tier==="high"?INK:"transparent",
                        backgroundImage:tier==="med"?`linear-gradient(90deg,${INK} 0 50%,transparent 50% 100%)`:"none",
                        border:tier==="low"?`1px dotted ${INK}`:tier==="med"?`1px solid ${INK}`:tier?"none":"none",
                        opacity:tier?1:0}}/>
                    </div>
                  )
                })}
                {(selected.drift==="up"||selected.drift==="down")&&(
                  <span aria-label={selected.drift==="up"?_t(lang,"le banc se rapproche","bank approaching","el banco se acerca"):_t(lang,"le banc se disperse","bank dispersing","el banco se dispersa")}
                    style={{font:"800 12px/1 'Bricolage Grotesque',system-ui,sans-serif",color:selected.drift==="up"?"#E8522A":"#22C55E",marginLeft:2,marginTop:8}}>{selected.drift==="up"?"↗":"↘"}</span>
                )}
              </div>
            )}
            {friseOn&&<div style={{font:"700 7.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif",color:"#6b6478",marginTop:5,maxWidth:160,whiteSpace:"normal"}}>{_t(lang,"Confiance forte J0-J2, tendance au-delà — 76 à 79 % de justesse selon la saison.","Strong confidence days 0-2, trend after — 76-79% accuracy by season.","Confianza alta días 0-2, tendencia después — 76-79 % de acierto según temporada.")}</div>}
            {/* DÉCISION — « où aller plutôt » (plan B, loi anti-cul-de-sac). Tapable :
                sélectionne la plage propre la plus proche. pointerEvents:auto (le tooltip
                est en pointerEvents:none). Vert = « vas-y », data réelle. */}
            {planB&&(()=>{
              const km=planB.km<1?_t(lang,"< 1 km","< 1 km","< 1 km"):`${Math.round(planB.km)} km`
              return(
                <button onClick={(e)=>{try{e.stopPropagation()}catch(_){}; selectBeach(planB.beach); try{track&&track("sg_map_planb",{island})}catch(_){}}}
                  style={{pointerEvents:"auto",cursor:"pointer",marginTop:7,display:"flex",alignItems:"center",gap:5,
                    background:"#0f5132",color:"#eafaf0",border:`2px solid ${INK}`,borderRadius:999,padding:"5px 9px",
                    textAlign:"left",whiteSpace:"normal",maxWidth:172,
                    font:"800 9.5px/1.15 'Bricolage Grotesque',system-ui,sans-serif",boxShadow:`2px 2px 0 ${INK}`}}>
                  <span aria-hidden="true" style={{fontSize:12,flexShrink:0}}>→</span>
                  <span>{_t(lang,`Plutôt ${planB.beach.name} · ${km}, propre`,`Better: ${planB.beach.name} · ${km}, clean`,`Mejor: ${planB.beach.name} · ${km}, limpia`)}</span>
                </button>
              )
            })()}
          </div>
        )}

        {/* CTA Voir la plage — ouvre la fiche dès le pointerdown, en capturant la plage
            sélectionnée AVANT toute déselection par la couche carte (fix P0 tap au doigt). */}
        {selected&&(
          <button className="sg-mapcta" onClick={openBeach}
            onPointerDown={(e)=>{ try{e.stopPropagation()}catch(_){}; const sb=selected; if(sb&&onOpenBeach){ lastPtrOpenRef.current=Date.now(); try{track&&track("sg_beach_open",{from:"map_cta"})}catch(_){}; onOpenBeach(sb) } }}
            style={{
            position:"absolute",left:"50%",bottom:"calc(176px + env(safe-area-inset-bottom))",
            transform:"translateX(-50%)",pointerEvents:"auto",touchAction:"manipulation",
            display:"inline-flex",alignItems:"center",gap:8,
            // Fond/texte forcés en CSS (.sg-mapcta) pour battre le skin de thème qui
            // strippait le gradient or → texte noir illisible sur carte sombre (rapport
            // fondateur). Pastille encre + bordure or + TEXTE BLANC = lisible garanti.
            color:"#fdfcf7",
            font:"800 13.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
            padding:"13px 18px",borderRadius:999,cursor:"pointer",
            animation:"wmSlide .25s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            {_t(lang,"Voir la plage","Open beach","Ver la playa")} <span style={{fontWeight:800}}>→</span>
          </button>
        )}

        {/* HUB « Ma semaine » (La Vigie) — lazy, monté seulement à l'ouverture (tap encart digest).
            Restaure le focus sur l'encart à la fermeture (a11y). Flag ?weekhub=0. */}
        {showHub && !weekhubOff && (
          <Suspense fallback={null}>
            <LazyWeekHub
              lang={lang} beachList={beachList} weekDigest={weekDigest} updatedAt={updatedAt}
              reliableHorizon={3} pos={null} seasonOff={weekhubSeasonOff} seasonOutlook={seasonOutlook} track={track}
              onClose={()=>{ setShowHub(false); try{ digestBtnRef.current && digestBtnRef.current.focus() }catch(_){} }}
              onSelectBeach={(b)=>{ setShowHub(false); try{ selectBeach(b) }catch(_){} }}
              onPickDay={(d)=>{ setShowHub(false); try{ setDay(d) }catch(_){} }}
              onPlannerOptin={(meta)=>{ try{ const em=localStorage.getItem("sg_email"); if(em&&onCaptureEmail) onCaptureEmail(em) }catch(_){}; try{ track&&track("sg_weekhub_planner",meta||{}) }catch(_){} }}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}

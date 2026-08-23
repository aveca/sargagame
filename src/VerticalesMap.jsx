import React,{useState,useEffect,useRef,useCallback} from "react"
import {useSwipeClose} from "./useSwipeClose"

/* ============================================================
   LES 10 POSTES DU VEILLEUR — « Jusqu'où on descend »
   FUSION (02/07) : les 10 verticales/marchés portés DANS l'app
   (design/proto-descente-marches.html) + la SCÈNE ÉCOSYSTÈME
   INTERACTIVE (design/proto-ecoscene-descent.html) comme MONDE
   VIVANT derrière. On descend à travers ce que le satellite veille :
   orbite → ciel → surface (yole) → lagon (tortue) → pleine eau (raie)
   → RADEAUX DE SARGASSE (le sujet) → fond marin. 3 plans parallaxe,
   interpolation couleur orbite→golden-hour→abysse, satellite qui
   recule. Sémantique : les LIVE (Sable/Récif/Digue) surplombent l'eau
   claire golden-hour (mesurable) ; les HORIZON s'enfoncent dans le noir
   « où la mesure s'arrête » → le gradient écologique = le gradient
   d'honnêteté (docs/BIG_MARKETS.md). L'argent ne touche jamais le verdict.

   Moteur : backdrop fixe + 3 plans pilotés par le scroll du scroller,
   1 seul rAF demand-driven (lissage + pause visibilitychange), zéro
   setState/frame (HUD/caméra en impératif via refs). reduced-motion =
   plancher dur. Overlay lazy (hors budget eager), rollback ?verticals=0.
   Actions in-app par PROPS (chunk propre) : onSeeMyBeach/onOpenPro/onWaitlist.
   ============================================================ */

/* ---- 10 verticales : profondeur (métaphore de plongée) FIGÉE par palier ---- */
const TIERS=[
  {id:"sable",   name:"SABLE",     kind:"live",    depth:"−0 m",    depthM:0},
  {id:"recif",   name:"RÉCIF",     kind:"live",    depth:"−40 m",   depthM:40},
  {id:"digue",   name:"DIGUE",     kind:"pilot",   depth:"−120 m",  depthM:120},
  {id:"amarre",  name:"AMARRE",    kind:"horizon", depth:"−400 m",  depthM:400},
  {id:"barometre",name:"BAROMÈTRE",kind:"horizon", depth:"−900 m",  depthM:900},
  {id:"sillage", name:"SILLAGE",   kind:"horizon", depth:"−1500 m", depthM:1500},
  {id:"filet",   name:"FILET",     kind:"horizon", depth:"−2400 m", depthM:2400},
  {id:"courant", name:"COURANT",   kind:"horizon", depth:"−3500 m", depthM:3500},
  {id:"prisme",  name:"PRISME",    kind:"pilot",   depth:"−4800 m", depthM:4800},
  {id:"abysse",  name:"ABYSSE",    kind:"horizon", depth:"−6000 m", depthM:6000},
]

/* Copy i18n — reprise 1:1 du proto panel-approuvé. Aucun prix/CTA hors LIVE.
   Le champ `line` d'un HORIZON est le MUR (« pourquoi on n'y va pas »). */
const COPY={
  fr:{
    eyebrow:"La profondeur de la mer = la profondeur du marché",
    headline:"JUSQU'OÙ ON DESCEND",
    lede:"On descend à travers tout ce que le satellite veille — le ciel, votre plage, la pleine eau, les radeaux de sargasses, jusqu'aux roches. On n'éclaire que ce qu'on sait mesurer.",
    scroll:"Descendez",
    badgeLive:"Live", badgePilot:"En chantier", badgeHorizon:"Horizon", wallLabel:"Pourquoi on n'y va pas",
    pilotNote:"aucun accès à vendre aujourd'hui", surface:"Surface",
    waitlist:"Prévenez-moi", waitPlaceholder:"votre email", waitDone:"C'est noté — on vous préviendra.",
    sig:"Il regarde la mer, jamais vos clients.",
    sig2:"On s'arrête où finit la mesure. C'est ça, le moat.",
    exit:"Voir ma plage — gratuit", exitSub:"Vous gérez un rivage ? → Espace pro",
    foot:"Le verdict reste 100 % donnée mesurée, l'argent ne touche jamais la mesure. Les paliers sous la ligne de flottaison ne sont ni vendus ni promis tant qu'on ne sait pas les mesurer.",
    tiers:[
      {market:"B2C · voyageurs",              value:"Votre plage aujourd'hui : mer propre ou pas.",   line:"Le verdict du jour, gratuit. Pass séjour dès 7,99 €.", prices:["7,99 €"], cta:"Voir ma plage — gratuit"},
      {market:"Hôtels & clubs de plage",       value:"L'état de vos plages sur votre site, daté.",     line:"79 €/mois ou 690 €/an · essai 30 j sans carte.", prices:["79 €/mois","690 €/an"], cta:"Essayer 30 jours"},
      {market:"Mairies & offices de tourisme", value:"Toute la commune, baie par baie.",               line:"L'accès Territoire self-serve se met en place — dites-nous où vous en êtes.", note:"accès self-serve en préparation"},
      {market:"Immobilier côtier",             value:"Lire l'exposition d'un rivage dans le temps.",   line:"Pas encore mesuré → pas encore promis."},
      {market:"Assurance / réassurance",       value:"Le risque côtier daté existe dans nos données.", line:"On ne le vendra jamais à qui parie contre la plage — l'argent ne touche pas le verdict."},
      {market:"Croisière, ports, maritime",    value:"Des fenêtres d'escale « mer propre ».",          line:"Le jour où la donnée les tiendra sans détour."},
      {market:"Pêche & aquaculture",           value:"L'algue avant qu'elle n'étouffe l'eau.",         line:"Une piste qu'on garde à l'œil, pas une facture."},
      {market:"Énergie & dessalement",         value:"Anticiper le biofouling aux prises d'eau.",      line:"Le jour où on le mesurera vraiment."},
      {market:"Licence data / API",            value:"Notre satellite brut + prévision, en API.",      line:"En chantier — pour qui veut la source, pas l'app."},
      {market:"Climat · spatial · souverain · défense", value:"Un jumeau vivant des côtes du monde.",  line:"La direction où la sonde regarde — pas une porte ouverte aujourd'hui."},
    ],
  },
  en:{
    eyebrow:"How deep the sea goes = how deep the market goes",
    headline:"HOW DEEP WE GO",
    lede:"We descend through everything the satellite watches — the sky, your beach, the open water, the sargassum rafts, down to the rocks. We only light up what we can measure.",
    scroll:"Descend",
    badgeLive:"Live", badgePilot:"In progress", badgeHorizon:"On the horizon", wallLabel:"Why we don't go there",
    pilotNote:"no access on sale today", surface:"Surface",
    waitlist:"Notify me", waitPlaceholder:"your email", waitDone:"Noted — we'll let you know.",
    sig:"He watches the sea, never your guests.",
    sig2:"We stop where measurement ends. That's the moat.",
    exit:"See my beach — free", exitSub:"You manage a shore? → Pro space",
    foot:"The verdict stays 100% measured data, money never touches the measurement. The tiers below the waterline are neither sold nor promised until we can measure them.",
    tiers:[
      {market:"B2C · travellers",             value:"Your beach today: clean water or not.",           line:"Today's verdict, free. Trip pass from $5.99.", prices:["$5.99"], cta:"See my beach — free"},
      {market:"Hotels & beach clubs",         value:"Your beaches' status on your own site, dated.",   line:"$89/mo or $790/yr · 30-day trial, no card.", prices:["$89/mo","$790/yr"], cta:"Start 30 days"},
      {market:"Town halls & tourism offices", value:"The whole town, bay by bay.",                     line:"Self-serve Territory access is being built — tell us where you stand.", note:"self-serve access in the works"},
      {market:"Coastal real estate",          value:"Read a shore's exposure over time.",              line:"Not measured yet → not promised yet."},
      {market:"Insurance / reinsurance",      value:"Dated coastal risk exists in our data.",          line:"We'll never sell it to anyone betting against the beach — money never touches the verdict."},
      {market:"Cruise, ports, maritime",      value:"'Clean water' port-call windows.",                line:"The day the data holds them without a caveat."},
      {market:"Fisheries & aquaculture",      value:"The algae before it smothers the water.",         line:"A lead we keep an eye on, not an invoice."},
      {market:"Energy & desalination",        value:"Anticipate biofouling at water intakes.",         line:"The day we truly measure it."},
      {market:"Data licence / API",           value:"Our raw satellite + forecast, as an API.",        line:"In progress — for whoever wants the source, not the app."},
      {market:"Climate · space · sovereign · defense", value:"A living twin of the world's coasts.",   line:"The direction the probe looks — not an open door today."},
    ],
  },
  es:{
    eyebrow:"Lo hondo del mar = lo hondo del mercado",
    headline:"HASTA DÓNDE BAJAMOS",
    lede:"Bajamos a través de todo lo que el satélite vigila — el cielo, tu playa, el agua abierta, los sargazos, hasta las rocas. Solo iluminamos lo que sabemos medir.",
    scroll:"Desciende",
    badgeLive:"Live", badgePilot:"En curso", badgeHorizon:"En el horizonte", wallLabel:"Por qué no vamos ahí",
    pilotNote:"ningún acceso a la venta hoy", surface:"Superficie",
    waitlist:"Avísame", waitPlaceholder:"tu email", waitDone:"Anotado — te avisaremos.",
    sig:"Mira el mar, nunca a tus clientes.",
    sig2:"Nos detenemos donde acaba la medición. Ese es el moat.",
    exit:"Ver mi playa — gratis", exitSub:"¿Gestionas una costa? → Espacio pro",
    foot:"El veredicto sigue siendo 100 % dato medido, el dinero nunca toca la medición. Los niveles bajo la línea de flotación no se venden ni se prometen hasta que sepamos medirlos.",
    tiers:[
      {market:"B2C · viajeros",               value:"Tu playa hoy: agua limpia o no.",                 line:"El veredicto del día, gratis. Pase desde 5,99 $.", prices:["5,99 $"], cta:"Ver mi playa — gratis"},
      {market:"Hoteles y clubes de playa",    value:"El estado de tus playas en tu propia web, fechado.", line:"89 $/mes o 790 $/año · prueba 30 días sin tarjeta.", prices:["89 $/mes","790 $/año"], cta:"Probar 30 días"},
      {market:"Ayuntamientos y turismo",      value:"Todo el municipio, bahía por bahía.",             line:"El acceso Territorio en autoservicio se está creando — cuéntanos tu caso.", note:"acceso autoservicio en preparación"},
      {market:"Inmobiliario costero",         value:"Leer la exposición de una costa en el tiempo.",   line:"Aún no medido → aún no prometido."},
      {market:"Seguros / reaseguros",         value:"El riesgo costero fechado existe en nuestros datos.", line:"Nunca se lo venderemos a quien apuesta contra la playa — el dinero no toca el veredicto."},
      {market:"Cruceros, puertos, marítimo",  value:"Ventanas de escala con « mar limpio ».",          line:"El día que el dato las sostenga sin rodeos."},
      {market:"Pesca y acuicultura",          value:"El alga antes de que ahogue el agua.",            line:"Una pista que vigilamos, no una factura."},
      {market:"Energía y desalinización",     value:"Anticipar el biofouling en las tomas de agua.",   line:"El día que lo midamos de verdad."},
      {market:"Licencia de datos / API",      value:"Nuestro satélite en bruto + pronóstico, como API.", line:"En construcción — para quien quiere la fuente, no la app."},
      {market:"Clima · espacio · soberano · defensa", value:"Un gemelo vivo de las costas del mundo.", line:"La dirección que mira la sonda — no una puerta abierta hoy."},
    ],
  },
}

/* ============================================================
   MOTEUR DE SCÈNE (porté de proto-ecoscene-descent.html)
   ============================================================ */
const SVGNS="http://www.w3.org/2000/svg"
function E(tag,attrs){const e=document.createElementNS(SVGNS,tag);if(attrs)for(const k in attrs)e.setAttribute(k,attrs[k]);return e}
function G(attrs){return E("g",attrs)}

/* palette orbite → abysse (interpolée sur la progression caméra cp).
   Golden-hour décalé tôt (cp .12-.30) → coïncide avec les LIVE lumineux. */
const STOPS=[[0,"#050912"],[.05,"#12203a"],[.09,"#33345e"],[.14,"#a86a3e"],[.19,"#F2B05E"],
  [.27,"#C97E3A"],[.37,"#1A5852"],[.55,"#155A5A"],[.78,"#0B2230"],[1,"#030a12"]]
function hx(c){c=c.replace("#","");return[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]}
function toHx(a){return"#"+a.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("")}
function colorAt(r){r=Math.min(1,Math.max(0,r));let i=0;while(i<STOPS.length-2&&r>STOPS[i+1][0])i++
  const a=STOPS[i],b=STOPS[i+1],t=b[0]===a[0]?0:(r-a[0])/(b[0]-a[0]),A=hx(a[1]),B=hx(b[1])
  return toHx(A.map((v,k)=>v+(B[k]-v)*t))}

const N=7, T=3120, GAP=520, Y0=300
function worldY(i){return Y0+i*GAP}
const CP_A=0.04, CP_B=0.93
function cpOf(d){return Math.min(1,Math.max(0,(d-CP_A)/(CP_B-CP_A)))}
function clamp01(v){return v<0?0:v>1?1:v}
function bell(x,c,w){const t=(x-c)/w;return Math.max(0,1-t*t)}

/* --- plans particules --- */
function buildFar(pFar){
  pFar.replaceChildren()
  const pg=G({fill:"#bfeee6"})
  for(let i=0;i<34;i++){const y=120+i*130+(i%3)*40;const c=E("circle",{cx:(i*149%780)+12,cy:y,r:1+(i%3)*.5,opacity:.26});c.setAttribute("class","vm-twk");c.style.animationDelay=(i%6)*.7+"s";pg.appendChild(c)}
  pFar.appendChild(pg)
}
function buildNear(pNear){
  pNear.replaceChildren()
  const bg=G({fill:"rgba(255,255,255,.16)"})
  for(let i=0;i<26;i++){const c=E("circle",{cx:(i*211%800),cy:220+i*150,r:2+(i%4)});c.setAttribute("class","vm-twk");c.style.animationDelay=(i%5)*.6+"s";c.setAttribute("opacity",.28);bg.appendChild(c)}
  pNear.appendChild(bg)
}
/* --- 7 acteurs, chacun centré à worldY(i) --- */
function actorOrbit(y){
  const g=G({transform:"translate(0,"+y+")"})
  const st=[[120,40,1.3],[300,10,1],[520,60,1.4],[640,120,1],[210,180,1.1],[430,150,1.2],[700,30,1],[70,120,1.1],[560,220,.9],[360,90,1],[160,240,1],[740,200,1.1]]
  const starG=G({fill:"#fff"})
  st.forEach(s=>{const c=E("circle",{cx:s[0],cy:s[1],r:s[2]});c.setAttribute("class","vm-twk");c.style.animationDelay=(s[0]%5)*.4+"s";starG.appendChild(c)})
  g.appendChild(starG)
  g.appendChild(E("path",{d:"M-40 250 Q400 120 840 250 L840 420 L-40 420 Z",fill:"#0b2f4a",opacity:.6}))
  g.appendChild(E("path",{d:"M-40 250 Q400 120 840 250",fill:"none",stroke:"#7fd0ff","stroke-width":2,"stroke-opacity":.55}))
  g.appendChild(E("path",{d:"M-40 246 Q400 116 840 246",fill:"none",stroke:"#FFE47A","stroke-width":5,"stroke-opacity":.28,filter:"url(#vmSoft)"}))
  return g
}
function actorSky(y){
  const g=G({transform:"translate(0,"+y+")"})
  g.appendChild(E("circle",{cx:610,cy:120,r:180,fill:"url(#vmGlow)",opacity:.8}))
  ;[[210,120,84,20,.72],[540,180,104,26,.6],[380,66,60,15,.5],[110,206,66,17,.5]].forEach(c=>{
    const cl=G({opacity:c[4]})
    cl.appendChild(E("ellipse",{cx:c[0],cy:c[1],rx:c[2],ry:c[3],fill:"#FFE7C6"}))
    cl.appendChild(E("ellipse",{cx:c[0]-c[2]*.45,cy:c[1]+c[3]*.35,rx:c[2]*.6,ry:c[3]*.85,fill:"#FFDCA8"}))
    cl.appendChild(E("ellipse",{cx:c[0]+c[2]*.4,cy:c[1]+c[3]*.3,rx:c[2]*.5,ry:c[3]*.8,fill:"#FFF0D8"}))
    g.appendChild(cl)
  })
  const pl=G({opacity:.85,transform:"translate(160,86)"})
  pl.appendChild(E("line",{x1:-74,y1:2,x2:0,y2:0,stroke:"#EAF7F4","stroke-width":1.5,"stroke-opacity":.32}))
  pl.appendChild(E("path",{d:"M0 0 l12 2 l-2 -6 l5 1 l4 5 l8 1 l-8 2 l-4 5 l-5 1 l2 -6 z",fill:"#0f2126"}))
  g.appendChild(pl)
  ;[[300,150],[336,160],[372,152]].forEach(b=>{
    g.appendChild(E("path",{d:"M"+b[0]+" "+b[1]+" q6 -6 12 0 q6 -6 12 0",fill:"none",stroke:"#0f2126","stroke-width":2,"stroke-linecap":"round","stroke-opacity":.55}))
  })
  return g
}
function actorSurface(y){
  const g=G({transform:"translate(0,"+y+")"})
  g.appendChild(E("rect",{x:-40,y:176,width:880,height:8,fill:"#FFE47A",opacity:.3}))
  ;[-20,60,700,760].forEach((rx,i)=>{g.appendChild(E("ellipse",{cx:rx+80,cy:206+i*12,rx:74,ry:3,fill:"#FFE47A",opacity:.16}))})
  const rf=G({});[300,340,470,520,560,600,640].forEach((x,i)=>{const l=E("line",{x1:x,y1:178,x2:x,y2:178+16+(i%2)*8,stroke:"#FFF3D6","stroke-width":2,"stroke-linecap":"round"});l.setAttribute("opacity",.5);l.setAttribute("class","vm-twk");l.style.animationDelay=i*.45+"s";rf.appendChild(l)})
  g.appendChild(rf)
  const boatPos=G({transform:"translate(408,150) scale(1.3)"})
  const boat=G({class:"vm-drift"})
  boat.appendChild(E("path",{d:"M-56 0 Q0 6 56 0 L44 20 Q0 30 -44 20 Z",fill:"url(#vmHull)",stroke:"#7a3f12","stroke-width":2}))
  boat.appendChild(E("rect",{x:-52,y:-4,width:104,height:5,rx:2,fill:"#E8522A"}))
  boat.appendChild(E("rect",{x:-52,y:2,width:104,height:4,rx:2,fill:"#1E7f52",opacity:.9}))
  boat.appendChild(E("line",{x1:6,y1:2,x2:6,y2:-64,stroke:"#6b4a2a","stroke-width":3}))
  boat.appendChild(E("path",{d:"M6 -62 L58 -6 L6 -6 Z",fill:"url(#vmSail)",stroke:"#e9c46a","stroke-width":1.5}))
  boat.appendChild(E("path",{d:"M4 -60 L-30 -8 L4 -8 Z",fill:"#FFF3D6",opacity:.85}))
  boat.appendChild(E("path",{d:"M-40 24 Q0 30 40 24 L30 40 Q0 46 -30 40 Z",fill:"#C9772B",opacity:.22}))
  boatPos.appendChild(boat);g.appendChild(boatPos)
  return g
}
function actorLagoon(y){
  const g=G({transform:"translate(0,"+y+")"})
  g.appendChild(E("path",{d:"M-40 320 Q400 300 840 330 L840 420 L-40 420 Z",fill:"#1f6b62",opacity:.4}))
  const sg=G({});[120,150,175,205,235,640,670,700,730].forEach((x,i)=>{
    const p=E("path",{d:"M"+x+" 340 C "+(x-6)+" 310 "+(x+6)+" 300 "+(x-3)+" 268,",fill:"none",stroke:i%2?"#3e6a2a":"#4a7d30","stroke-width":5,"stroke-linecap":"round"})
    p.setAttribute("class",i%2?"vm-sway":"vm-sway2");sg.appendChild(p)})
  g.appendChild(sg)
  const tuPos=G({transform:"translate(400,210) scale(1.3)"})
  const tu=G({class:"vm-glide"})
  tu.appendChild(E("ellipse",{cx:0,cy:0,rx:34,ry:24,fill:"#2f6b4e",stroke:"#173a2c","stroke-width":2}))
  tu.appendChild(E("path",{d:"M-16 -8 L0 -14 L16 -8 L10 6 L-10 6 Z",fill:"#3f8a63",opacity:.8}))
  tu.appendChild(E("circle",{cx:-30,cy:-6,r:8,fill:"#2f6b4e",stroke:"#173a2c","stroke-width":1.6}))
  tu.appendChild(E("circle",{cx:-33,cy:-8,r:1.6,fill:"#04120c"}))
  tu.appendChild(E("path",{d:"M22 -18 q16 -6 22 4",fill:"none",stroke:"#2f6b4e","stroke-width":7,"stroke-linecap":"round"}))
  tu.appendChild(E("path",{d:"M18 18 q14 8 24 2",fill:"none",stroke:"#2f6b4e","stroke-width":6,"stroke-linecap":"round"}))
  tuPos.appendChild(tu);g.appendChild(tuPos)
  ;[[180,120],[220,132],[600,180]].forEach(f=>{
    const fi=G({transform:"translate("+f[0]+","+f[1]+")"})
    fi.appendChild(E("path",{d:"M0 0 q10 -6 22 0 q-10 6 -22 0 z",fill:"#1EC8B0"}))
    fi.appendChild(E("path",{d:"M0 0 l-8 -5 l2 5 l-2 5 z",fill:"#0f8f7e"}))
    g.appendChild(fi)
  })
  return g
}
function actorOpen(y){
  const g=G({transform:"translate(0,"+y+")"})
  const rayPos=G({transform:"translate(392,160) scale(1.22)"})
  const ray=G({class:"vm-glide"})
  ray.appendChild(E("path",{d:"M0 0 C -60 -26 -96 -8 -120 6 C -80 10 -40 14 0 10 C 40 14 80 10 120 6 C 96 -8 60 -26 0 0 Z",fill:"#0e2c34",stroke:"#0a1f26","stroke-width":2,opacity:.92}))
  ray.appendChild(E("path",{d:"M-20 -8 q-14 -10 -26 -6",fill:"none",stroke:"#0e2c34","stroke-width":4,"stroke-linecap":"round"}))
  ray.appendChild(E("path",{d:"M20 -8 q14 -10 26 -6",fill:"none",stroke:"#0e2c34","stroke-width":4,"stroke-linecap":"round"}))
  ray.appendChild(E("line",{x1:0,y1:8,x2:0,y2:70,stroke:"#0e2c34","stroke-width":2}))
  ray.appendChild(E("ellipse",{cx:0,cy:0,rx:60,ry:6,fill:"#1EC8B0",opacity:.1}))
  rayPos.appendChild(ray);g.appendChild(rayPos)
  const pk=G({fill:"#1EC8B0"})
  for(let i=0;i<16;i++){const c=E("circle",{cx:(i*151%780)+10,cy:40+i*20,r:1.4+(i%3)*.5,opacity:.5});c.setAttribute("class","vm-twk");c.style.animationDelay=(i%5)*.6+"s";pk.appendChild(c)}
  g.appendChild(pk)
  return g
}
function actorSarg(y){
  const g=G({transform:"translate(0,"+y+")"})
  function raft(cx,cy,s,op){
    const outer=G({transform:"translate("+cx+","+cy+") scale("+s+")",opacity:op})
    const r=G({class:"vm-drift"})
    r.appendChild(E("path",{d:"M-70 0 C -70 -14 -50 -20 -30 -16 C -14 -24 14 -24 30 -16 C 52 -22 74 -12 70 4 C 74 16 52 22 30 18 C 12 26 -14 26 -30 18 C -52 22 -72 14 -70 0 Z",fill:"var(--sarg)",stroke:"#5c4a1e","stroke-width":2}))
    ;[[-40,-2,10],[0,-6,12],[34,0,11],[-14,8,8],[20,10,9]].forEach(l=>{r.appendChild(E("ellipse",{cx:l[0],cy:l[1],rx:l[2],ry:l[2]*.7,fill:"#6f5a24",opacity:.85}))})
    ;[[-30,-4],[-6,-10],[16,-6],[38,-2],[-16,6],[6,8],[28,6]].forEach(b=>{r.appendChild(E("circle",{cx:b[0],cy:b[1],r:2.4,fill:"#c9a94e"}))})
    r.appendChild(E("path",{d:"M-30 16 q-4 18 4 30",fill:"none",stroke:"#6f5a24","stroke-width":3,"stroke-linecap":"round"}))
    r.appendChild(E("path",{d:"M20 18 q6 16 -2 28",fill:"none",stroke:"#6f5a24","stroke-width":3,"stroke-linecap":"round"}))
    outer.appendChild(r);return outer
  }
  g.appendChild(raft(400,150,1.9,.97))
  g.appendChild(raft(150,86,.72,.72))
  g.appendChild(raft(662,118,.86,.8))
  g.appendChild(raft(560,300,.6,.56))
  const bb=G({fill:"rgba(255,255,255,.2)"});[386,430,150,662].forEach((x,i)=>{const c=E("circle",{cx:x,cy:150+i*8,r:2+(i%2)});c.setAttribute("class","vm-twk");c.style.animationDelay=i*.5+"s";bb.appendChild(c)})
  g.appendChild(bb)
  return g
}
function actorSeabed(y){
  const g=G({transform:"translate(0,"+y+")"})
  g.appendChild(E("path",{d:"M-40 250 Q400 220 840 260 L840 420 L-40 420 Z",fill:"#0b201d"}))
  const rk=G({fill:"#152f2b",stroke:"rgba(255,216,132,.22)","stroke-width":1.5,"stroke-linejoin":"round"})
  rk.appendChild(E("path",{d:"M40 300 L90 250 L150 292 L150 330 L40 330 Z"}))
  rk.appendChild(E("path",{d:"M250 320 L280 262 L360 258 L400 320 Z"}))
  rk.appendChild(E("path",{d:"M520 316 L560 268 L640 256 L700 316 Z"}))
  g.appendChild(rk)
  ;[110,340,610,660].forEach((x,i)=>{const p=E("path",{d:"M"+x+" 300 C "+(x-5)+" 276 "+(x+5)+" 270 "+(x-2)+" 244",fill:"none",stroke:"#2c4a24","stroke-width":4,"stroke-linecap":"round"});p.setAttribute("class",i%2?"vm-sway":"vm-sway2");g.appendChild(p)})
  ;[[95,288,"#FFE47A"],[300,300,"#1EC8B0"],[560,296,"#FFE47A"],[200,318,"#1EC8B0"]].forEach((m,i)=>{const c=E("circle",{cx:m[0],cy:m[1],r:2.4,fill:m[2]});c.setAttribute("class","vm-twk");c.style.animationDelay=i*.9+"s";g.appendChild(c)})
  return g
}
const ACTORS=[actorOrbit,actorSky,actorSurface,actorLagoon,actorOpen,actorSarg,actorSeabed]
const FOCAL=[315,130,150,210,160,150,300]
function buildMain(pMain){pMain.replaceChildren();for(let i=0;i<N;i++)pMain.appendChild(ACTORS[i](worldY(i)-FOCAL[i]))}

/* enrobe les tokens prix dans <span class=vm-price> (zéro innerHTML) */
function PricedLine({text,prices}){
  if(!prices||!prices.length)return <>{text}</>
  const parts=[];let rest=text,key=0
  while(rest.length){
    let best=-1,tok=null
    for(const p of prices){const k=rest.indexOf(p);if(k!==-1&&(best===-1||k<best)){best=k;tok=p}}
    if(best===-1){parts.push(<React.Fragment key={key++}>{rest}</React.Fragment>);break}
    if(best>0)parts.push(<React.Fragment key={key++}>{rest.slice(0,best)}</React.Fragment>)
    parts.push(<span className="vm-price" key={key++}>{tok}</span>)
    rest=rest.slice(best+tok.length)
  }
  return <>{parts}</>
}
function Emblem(){
  return(
    <svg className="vm-emblem" viewBox="0 0 46 58" aria-hidden="true">
      <line className="vm-em-ant" x1="23" y1="6" x2="23" y2="16"/>
      <circle className="vm-em-antdot" cx="23" cy="6" r="3.4"/>
      <path className="vm-em-body" d="M23 16 C33 16 39 23 39 31 C39 42 32 50 23 50 C14 50 7 42 7 31 C7 23 13 16 23 16 Z"/>
      <circle className="vm-em-lens" cx="23" cy="33" r="12"/>
      <circle className="vm-em-ring" cx="23" cy="33" r="12"/>
      <circle className="vm-em-iris" cx="23" cy="36" r="4.6"/>
    </svg>
  )
}

/* capture email honnête « prévenez-moi » — état LOCAL par tier (plusieurs PILOT possibles) */
function WaitlistForm({L,onSubmit}){
  const [email,setEmail]=useState("")
  const [sent,setSent]=useState(false)
  const submit=e=>{
    e&&e.preventDefault()
    const em=(email||"").trim()
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return
    try{onSubmit&&onSubmit(em)}catch(_){}
    setSent(true)
  }
  if(sent)return <p className="vm-waitdone">✓ {L.waitDone}</p>
  return(
    <form className="vm-wait" onSubmit={submit}>
      <input type="email" inputMode="email" autoComplete="email" className="vm-input"
        value={email} onChange={e=>setEmail(e.target.value)}
        placeholder={L.waitPlaceholder} aria-label={L.waitPlaceholder}/>
      <button type="submit" className="vm-send vm-send">{L.waitlist}<span className="vm-ar">→</span></button>
    </form>
  )
}

export default function VerticalesMap({lang="fr",track,onClose,onSeeMyBeach,onOpenPro,onWaitlist}){
  const L=COPY[lang]||COPY.fr
  const t=(fr,en,es)=>lang==="es"?es:lang==="en"?en:fr
  const reduce=(()=>{try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){return false}})()

  const sw=useSwipeClose(()=>onClose&&onClose(),{guardInput:true,threshold:70})
  const rootRef=sw.ref
  const closeRef=useRef(null)
  // refs scène (mutés en impératif dans le rAF — zéro setState/frame)
  const pMainRef=useRef(null),pFarRef=useRef(null),pNearRef=useRef(null)
  const satRef=useRef(null),sunwashRef=useRef(null),godraysRef=useRef(null),bgRef=useRef(null)
  const hudDepthRef=useRef(null),hudTierRef=useRef(null)
  const tierCentersRef=useRef([]),lastTierRef=useRef(-1),scMaxRef=useRef(0),scHRef=useRef(0)
  const pxRef=useRef(0),pyRef=useRef(0),pxtRef=useRef(0),pytRef=useRef(0)

  const [onIdx,setOnIdx]=useState(()=>reduce?TIERS.map((_,i)=>i):[])

  const emit=useCallback((ev,p)=>{try{track&&track(ev,p||{})}catch(_){}},[track])
  // vue = UNIQUE émetteur (pas de double-comptage avec le FAB) ; source dérivée de l'URL
  useEffect(()=>{
    const src=(()=>{try{return /[?&]verticals=1/.test(window.location.search)?"deeplink":"fab"}catch(_){return"fab"}})()
    emit("sg_verticales_view",{lang,source:src})
  },[]) // eslint-disable-line

  // construire la scène une fois (DOM impératif : port fidèle des acteurs validés)
  useEffect(()=>{
    try{
      if(pFarRef.current)buildFar(pFarRef.current)
      if(pMainRef.current)buildMain(pMainRef.current)
      if(pNearRef.current)buildNear(pNearRef.current)
    }catch(_){}
  },[])

  // Échap + focus (piégé léger) + restauration
  useEffect(()=>{
    const prev=typeof document!=="undefined"?document.activeElement:null
    try{closeRef.current&&closeRef.current.focus()}catch(_){}
    const onKey=e=>{
      if(e.key==="Escape"){onClose&&onClose();return}
      if(e.key==="Tab"&&rootRef.current){
        const f=rootRef.current.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')
        if(!f.length)return
        const first=f[0],last=f[f.length-1]
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener("keydown",onKey)
    return()=>{document.removeEventListener("keydown",onKey);try{prev&&prev.focus&&prev.focus()}catch(_){}}
  },[onClose]) // eslint-disable-line

  // rendu impératif d'une frame : couleur + caméra parallaxe + satellite + ambiance + HUD
  const renderScene=useCallback((d)=>{
    const sc=rootRef.current;if(!sc)return
    const cp=cpOf(d)
    sc.style.setProperty("--vmd",d.toFixed(4))
    sc.style.setProperty("--vmtop",colorAt(cp))
    sc.style.setProperty("--vmbot",colorAt(Math.min(1,cp+0.14)))
    const camY=cp*T
    const px=pxRef.current,py=pyRef.current
    if(pMainRef.current)pMainRef.current.setAttribute("transform","translate(0,"+(-camY).toFixed(1)+")")
    if(pFarRef.current)pFarRef.current.setAttribute("transform","translate("+(px*-6).toFixed(1)+","+((-camY*0.55)+py*-4).toFixed(1)+")")
    if(pNearRef.current)pNearRef.current.setAttribute("transform","translate("+(px*16).toFixed(1)+","+((-camY*1.35)+py*12).toFixed(1)+")")
    if(satRef.current){
      const ss=(1-cp*0.46).toFixed(3),sy=(112+cp*72).toFixed(1)
      satRef.current.setAttribute("transform","translate("+(400+px*10).toFixed(1)+","+sy+") scale("+ss+")")
      satRef.current.setAttribute("opacity",(1-cp*0.6).toFixed(3))
    }
    if(sunwashRef.current)sunwashRef.current.setAttribute("opacity",(bell(cp,0.30,0.26)*0.85).toFixed(3))
    if(godraysRef.current)godraysRef.current.setAttribute("opacity",(bell(cp,0.60,0.34)*0.8).toFixed(3))
    // HUD : palier MARCHÉ le plus centré. mid dérivé du scroll lissé `d` + cache
    // (scMax/scH) → AUCUNE lecture DOM ici après l'écriture de --vmd (zéro reflow forcé/frame).
    const centers=tierCentersRef.current
    if(centers.length){
      const mid=d*scMaxRef.current+scHRef.current/2
      let idx=0,bestd=Infinity
      for(let i=0;i<centers.length;i++){const dd=Math.abs(centers[i]-mid);if(dd<bestd){bestd=dd;idx=i}}
      if(idx!==lastTierRef.current){
        lastTierRef.current=idx
        if(hudDepthRef.current)hudDepthRef.current.textContent="−"+TIERS[idx].depthM.toLocaleString(lang==="fr"?"fr-FR":lang==="es"?"es-ES":"en-US")+" m"
        if(hudTierRef.current)hudTierRef.current.textContent=d<0.015?L.surface:TIERS[idx].name
      }
    }
  },[lang,L.surface]) // eslint-disable-line

  // moteur : 1 rAF demand-driven (scroll + pointeur), pause visibilitychange
  useEffect(()=>{
    const sc=rootRef.current;if(!sc)return
    // cache des centres de paliers (une fois monté + au resize)
    const measure=()=>{
      try{
        tierCentersRef.current=[...sc.querySelectorAll(".vm-tier")].map(el=>el.offsetTop+el.offsetHeight/2)
        scMaxRef.current=Math.max(0,sc.scrollHeight-sc.clientHeight);scHRef.current=sc.clientHeight
      }catch(_){tierCentersRef.current=[]}
    }
    measure()
    if(reduce){renderScene(0.34);return} // plancher : surface golden-hour centrée, zéro anim/rAF
    let raf=0,tgt=0,cur=0,need=true,paused=false
    const read=()=>{const max=sc.scrollHeight-sc.clientHeight;scMaxRef.current=max>0?max:0;scHRef.current=sc.clientHeight;tgt=max>0?clamp01(sc.scrollTop/max):0}
    const step=()=>{
      if(paused){raf=0;return}
      let work=false
      if(need){read();need=false;work=true}
      if(Math.abs(pxtRef.current-pxRef.current)>0.002||Math.abs(pytRef.current-pyRef.current)>0.002){
        pxRef.current+=(pxtRef.current-pxRef.current)*0.08;pyRef.current+=(pytRef.current-pyRef.current)*0.08;work=true}
      const diff=tgt-cur
      if(Math.abs(diff)>0.0004){cur+=diff*0.15;work=true}else if(work){cur=tgt}
      if(work)renderScene(cur)
      raf=work?requestAnimationFrame(step):0
    }
    const wake=()=>{if(!raf&&!paused)raf=requestAnimationFrame(step)}
    const onScroll=()=>{need=true;wake()}
    const onResize=()=>{measure();need=true;wake()}
    const onPointer=e=>{pxtRef.current=(e.clientX/window.innerWidth-0.5)*2;pytRef.current=(e.clientY/window.innerHeight-0.5)*2;wake()}
    const onVis=()=>{paused=document.hidden;if(!paused){need=true;wake()}}
    read();cur=tgt;renderScene(cur);wake()
    sc.addEventListener("scroll",onScroll,{passive:true})
    window.addEventListener("resize",onResize,{passive:true})
    window.addEventListener("pointermove",onPointer,{passive:true})
    document.addEventListener("visibilitychange",onVis)
    return()=>{sc.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onResize);window.removeEventListener("pointermove",onPointer);document.removeEventListener("visibilitychange",onVis);if(raf)cancelAnimationFrame(raf)}
  },[reduce,renderScene]) // eslint-disable-line

  // révélation des paliers (IntersectionObserver ; reduced-motion = tous visibles)
  useEffect(()=>{
    if(reduce)return
    const sc=rootRef.current;if(!sc)return
    const io=new IntersectionObserver(entries=>{
      let add=null
      entries.forEach(en=>{if(en.isIntersecting){const i=+en.target.getAttribute("data-i");if(!isNaN(i)){add=add||[];add.push(i)}}})
      if(add)setOnIdx(prev=>{const s=new Set(prev);add.forEach(i=>s.add(i));return[...s]})
    },{root:sc,rootMargin:"-24% 0px -24% 0px",threshold:0.01})
    sc.querySelectorAll(".vm-tier").forEach(s=>io.observe(s))
    return()=>io.disconnect()
  },[reduce]) // eslint-disable-line

  const doAction=(tier,fn)=>{emit("sg_verticales_tap",{tier,lang});fn&&fn()}
  // ferme sur tap d'une zone de FOND (racine/contenu/section/intro/outro), jamais une carte/CTA/HUD/chrome.
  // Un scroll-drag ne déclenche pas onClick → sûr sur mobile. 4e voie de sortie (doctrine).
  const onBackdrop=e=>{
    const el=e.target
    if(!el||!el.classList)return
    if(el.closest&&(el.closest(".vm-card")||el.closest(".vm-chrome")||el.closest(".vm-hud")))return
    if(el===rootRef.current||el.classList.contains("vm-content")||el.classList.contains("vm-tier")||el.classList.contains("vm-intro")||el.classList.contains("vm-outro"))onClose&&onClose()
  }

  return(
    <div ref={rootRef} className="sg-onink-scope vm-root" data-sg-live="1"
      role="dialog" aria-modal="true"
      aria-label={t("Les 10 postes du Veilleur — jusqu'où on descend","The Watcher's 10 posts — how deep we go","Los 10 puestos del Vigía — hasta dónde bajamos")}
      onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}
      onClick={onBackdrop}
      style={reduce?{"--vmd":0.34}:undefined}>
      <style>{VM_CSS}</style>

      {/* ---------- MONDE VIVANT (backdrop fixe, hors gestes) ---------- */}
      <div className="vm-bg" ref={bgRef} aria-hidden="true">
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="vmSunR" gradientUnits="userSpaceOnUse" cx="560" cy="300" r="360">
              <stop offset="0" stopColor="#fff3d6"/><stop offset=".4" stopColor="#ffc187" stopOpacity=".55"/><stop offset="1" stopColor="#ff944a" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="vmRayG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFE9B8" stopOpacity=".5"/><stop offset="1" stopColor="#CFF4FF" stopOpacity="0"/>
            </linearGradient>
            <radialGradient id="vmLens" cx="38%" cy="32%" r="72%"><stop offset="0" stopColor="#CFF4FF"/><stop offset=".34" stopColor="#16b9c9"/><stop offset="1" stopColor="#052b2b"/></radialGradient>
            <radialGradient id="vmIrisG" cx="42%" cy="38%" r="62%"><stop offset="0" stopColor="#0a3a39"/><stop offset="1" stopColor="#03100f"/></radialGradient>
            <linearGradient id="vmPanel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b4763"/><stop offset="1" stopColor="#0B2230"/></linearGradient>
            <linearGradient id="vmBodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3c38"/><stop offset=".55" stopColor="#102622"/><stop offset="1" stopColor="#0A1714"/></linearGradient>
            <radialGradient id="vmHaloG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#1EC8B0" stopOpacity=".45"/><stop offset=".5" stopColor="#1EC8B0" stopOpacity=".14"/><stop offset="1" stopColor="#1EC8B0" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="vmBeamGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFD884" stopOpacity=".4"/><stop offset=".7" stopColor="#1EC8B0" stopOpacity=".1"/><stop offset="1" stopColor="#1EC8B0" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="vmHull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4C542"/><stop offset="1" stopColor="#C9772B"/></linearGradient>
            <linearGradient id="vmSail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF3D6"/><stop offset="1" stopColor="#FFD884"/></linearGradient>
            <radialGradient id="vmGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE47A" stopOpacity=".8"/><stop offset="1" stopColor="#FFE47A" stopOpacity="0"/></radialGradient>
            <filter id="vmSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
            <radialGradient id="vmVigG" cx="50%" cy="46%" r="72%">
              <stop offset=".5" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".9"/>
            </radialGradient>
          </defs>
          <rect ref={sunwashRef} x="0" y="0" width="800" height="600" fill="url(#vmSunR)" opacity="0"/>
          <g ref={pFarRef}/>
          <g ref={pMainRef}/>
          <g className="vm-godrays" ref={godraysRef} opacity="0">
            <polygon className="vm-ray" points="180,-60 250,-60 210,660 70,660" fill="url(#vmRayG)"/>
            <polygon className="vm-ray" points="430,-60 476,-60 476,660 356,660" fill="url(#vmRayG)" opacity=".7"/>
            <polygon className="vm-ray" points="600,-60 662,-60 730,660 566,660" fill="url(#vmRayG)" opacity=".8"/>
          </g>
          <g ref={pNearRef}/>
          <rect className="vm-vig" x="0" y="0" width="800" height="600" fill="url(#vmVigG)"/>
          {/* LE VEILLEUR — satellite persistant, capteur vers la MER, recule en profondeur */}
          <g ref={satRef} className="vm-sat" transform="translate(400,112)">
            <g className="vm-satAnim">
              <circle cx="0" cy="0" r="120" fill="url(#vmHaloG)" filter="url(#vmSoft)"/>
              <polygon points="0,26 -62,230 62,230" fill="url(#vmBeamGrad)" opacity=".5"/>
              <g transform="scale(1.05)">
                <rect x="-86" y="-8" width="56" height="30" rx="3" fill="url(#vmPanel)" transform="rotate(-7 -58 7)"/>
                <rect x="30" y="-8" width="56" height="30" rx="3" fill="url(#vmPanel)" transform="rotate(7 58 7)"/>
                <rect x="-32" y="2" width="64" height="6" rx="3" fill="#0e2622"/>
                <path d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z" fill="url(#vmBodyG)" stroke="#FFD884" strokeWidth="1.3" strokeOpacity=".5"/>
                <circle cx="0" cy="8" r="22" fill="url(#vmLens)"/>
                <circle cx="0" cy="8" r="22" fill="none" stroke="#E8A800" strokeWidth="3"/>
                <circle cx="0" cy="12" r="8" fill="url(#vmIrisG)"/>
                <circle cx="-3" cy="9" r="2.8" fill="#fff7e2"/>
                <line x1="0" y1="-30" x2="0" y2="-46" stroke="#0e2622" strokeWidth="3"/>
                <circle cx="0" cy="-49" r="4.4" fill="#22C55E"/>
              </g>
            </g>
          </g>
        </svg>
      </div>

      {/* ---------- CHROME : marque + fermer ---------- */}
      <div className="vm-chrome">
        <div className="vm-brand"><span className="vm-wm">LE VEILLEUR</span><span className="vm-lib">{t("Les 10 postes","The 10 posts","Los 10 puestos")}</span></div>
        <button ref={closeRef} type="button" className="vm-close vm-close" onClick={()=>onClose&&onClose()}
          aria-label={t("Fermer","Close","Cerrar")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>
        </button>
      </div>

      {/* ---------- HUD profondeur (jauge de plongée) ---------- */}
      <div className="vm-hud" aria-hidden="true">
        <div className="vm-depthlab" ref={hudDepthRef}>−0 m</div>
        <div className="vm-track"><div className="vm-fill"/><div className="vm-knob"/></div>
        <div className="vm-tierlab" ref={hudTierRef}>{L.surface}</div>
      </div>

      {/* ---------- FLUX ---------- */}
      <div className="vm-content">
        <section className="vm-intro">
          <div className="vm-eyebrow">{L.eyebrow}</div>
          <h1 className="vm-h1">{L.headline}</h1>
          <p className="vm-lede">{L.lede}</p>
          <div className="vm-scrollhint"><span className="vm-scrolllab">{L.scroll}</span><span className="vm-chev"/></div>
        </section>

        {TIERS.map((tier,i)=>{
          const c=L.tiers[i]
          const on=reduce||onIdx.indexOf(i)!==-1
          return(
            <section key={tier.id} data-i={i} className={"vm-tier vm-"+tier.kind+(on?" on":"")}>
              <div className="vm-card">
                <div className="vm-metarow">
                  <span className="vm-tierno">{(i+1<10?"0":"")+(i+1)}</span>
                  <span className={"vm-badge vm-"+tier.kind}>
                    {tier.kind==="live"?"✓ "+L.badgeLive:tier.kind==="pilot"?"◐ "+L.badgePilot:"○ "+L.badgeHorizon}
                  </span>
                  <span className="vm-market">{c.market}</span>
                </div>
                <div className="vm-tierhead"><Emblem/><div className="vm-tiername">{tier.name}</div></div>
                <p className="vm-tiervalue">{c.value}</p>

                {tier.kind==="live"&&<>
                  <p className="vm-tierline"><PricedLine text={c.line} prices={c.prices}/></p>
                  <a className="vm-cta vm-cta"
                    href={tier.id==="recif"?"/pro/espace/":"/"}
                    onClick={e=>{
                      e.preventDefault()
                      if(tier.id==="recif")doAction("recif",()=>onOpenPro&&onOpenPro("verticales_recif"))
                      else doAction("sable",onSeeMyBeach)
                    }}>
                    {c.cta}<span className="vm-ar">→</span>
                  </a>
                </>}

                {tier.kind==="pilot"&&<>
                  <p className="vm-tierline">{c.line}</p>
                  <WaitlistForm L={L} onSubmit={(em)=>{emit("sg_verticales_waitlist",{tier:tier.id,lang});try{onWaitlist&&onWaitlist(em,tier.id)}catch(_){}}}/>
                  <div className="vm-pilotnote"><span className="vm-dot"/>{L.badgePilot} — {c.note||L.pilotNote}</div>
                </>}

                {tier.kind==="horizon"&&(
                  <div className="vm-wall"><span className="vm-wl">{L.wallLabel}</span><span className="vm-wt">{c.line}</span></div>
                )}
              </div>
              <div className="vm-depthtag">{tier.depth}</div>
            </section>
          )
        })}

        <section className="vm-outro">
          <div className="vm-sig">{L.sig}</div>
          <div className="vm-sig2">{L.sig2}</div>
          <a className="vm-cta vm-cta vm-exit" href="/" onClick={e=>{e.preventDefault();doAction("outro",onSeeMyBeach)}}>{L.exit}<span className="vm-ar">→</span></a>
          <div className="vm-exitsub"><a className="vm-sublink" href="/pro/espace/" onClick={e=>{e.preventDefault();doAction("outro_pro",()=>onOpenPro&&onOpenPro("verticales_outro"))}}>{L.exitSub}</a></div>
          <p className="vm-footnote">{L.foot}</p>
        </section>
      </div>
    </div>
  )
}

/* ============================================================
   CSS scoped — préfixé .vm-root. Racine .sg-onink-scope → le skin
   .theme-comic button est neutralisé (unset) ; les 2 <button>
   (fermer/envoyer) re-spécifiés en triple-classe (0,3,1) + !important.
   CTA = <a> (skin-free). --vmd (0..1) = scroll ; --vmtop/--vmbot =
   couleur caméra (backdrop) écrite par le rAF.
   ============================================================ */
const VM_CSS=`
.vm-root{position:fixed;inset:0;z-index:1050;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  background:#02060A;color:#EAF7F4;--vmd:0;--vmtop:#050912;--vmbot:#12203a;--sarg:#9c7b34;
  font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.vm-root *{box-sizing:border-box}

/* monde vivant (backdrop fixe, hors gestes) — gradient piloté par la caméra */
.vm-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;
  background:linear-gradient(180deg,var(--vmtop),var(--vmbot) 62%,#01060c)}
.vm-bg>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.vm-vig{opacity:calc(var(--vmd)*.5 + .12)}

/* ambient DOUX seulement (doctrine calme) — gated no-preference */
@media (prefers-reduced-motion:no-preference){
  .vm-root .vm-satAnim{animation:vmBreathe 7.5s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes vmBreathe{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-4px) rotate(-1.1deg)}}
  .vm-root .vm-ray{animation:vmRayShimmer 15s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:top}
  @keyframes vmRayShimmer{0%{opacity:.45}100%{opacity:.9}}
  /* scintillement LENT + amplitude réduite (doctrine calme : tableau, pas aquarium ;
     jamais de pulse rapide / dip proche de 0 sur beaucoup de nœuds) */
  .vm-root .vm-twk{animation:vmTwk 10s ease-in-out infinite;transform-box:fill-box}
  @keyframes vmTwk{0%,100%{opacity:.4}50%{opacity:.85}}
  .vm-root .vm-sway{animation:vmSway 8s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center}
  .vm-root .vm-sway2{animation:vmSway 10s ease-in-out infinite .7s;transform-box:fill-box;transform-origin:bottom center}
  @keyframes vmSway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
  .vm-root .vm-drift{animation:vmDrift 13s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes vmDrift{0%,100%{transform:translate(0,0) rotate(-.6deg)}50%{transform:translate(6px,-3px) rotate(.6deg)}}
  .vm-root .vm-glide{animation:vmGlide 16s ease-in-out infinite;transform-box:fill-box}
  @keyframes vmGlide{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-6px)}}
  .vm-root .vm-chev{animation:vmBob 1.8s ease-in-out infinite}
  @keyframes vmBob{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(3px,3px)}}
}

/* chrome */
.vm-chrome{position:fixed;top:0;left:0;right:0;z-index:1060;display:flex;justify-content:space-between;align-items:flex-start;
  padding:calc(10px + env(safe-area-inset-top)) 14px 10px;pointer-events:none;gap:10px}
.vm-brand{pointer-events:auto}
.vm-wm{font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-size:18px;color:#fff;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 1px 8px rgba(0,0,0,.55);display:block}
.vm-lib{display:block;margin-top:3px;font:700 9px/1 "Bricolage Grotesque";letter-spacing:.14em;text-transform:uppercase;color:rgba(255,216,132,.85)}
.vm-root button.vm-close.vm-close{pointer-events:auto;width:44px;height:44px;min-width:44px;border-radius:50%!important;
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  background:rgba(8,18,16,.66)!important;border:1.5px solid rgba(255,255,255,.28)!important;color:#fff!important;
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,.4)!important;text-shadow:none!important}
.vm-root button.vm-close.vm-close:active{transform:scale(.94)}

/* HUD */
.vm-hud{position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:1055;pointer-events:none;
  display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.vm-depthlab{font:700 12px/1 'JetBrains Mono',monospace;color:#1EC8B0;text-shadow:0 1px 5px #000;text-align:right}
.vm-track{position:relative;width:6px;height:min(42vh,320px);border-radius:6px;overflow:hidden;
  background:linear-gradient(180deg,rgba(255,216,132,.4),rgba(30,200,176,.28) 40%,rgba(3,16,28,.6))}
.vm-fill{position:absolute;left:0;right:0;top:0;border-radius:6px;height:calc(var(--vmd) * 100%);
  background:linear-gradient(180deg,#FFE47A,#1EC8B0);box-shadow:0 0 10px rgba(30,200,176,.6)}
.vm-knob{position:absolute;left:50%;transform:translate(-50%,-50%);top:calc(var(--vmd) * 100%);
  width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(3,16,28,.7),0 0 10px #1EC8B0}
.vm-tierlab{font:800 10px/1.1 "Bricolage Grotesque";letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.85);text-shadow:0 1px 5px #000;max-width:88px;text-align:right}
@media (max-width:520px){.vm-tierlab{display:none}}

/* flux */
.vm-content{position:relative;z-index:10}
.vm-intro{max-width:600px;margin:0 auto;padding:0 20px;min-height:100svh;display:flex;flex-direction:column;justify-content:center}
.vm-eyebrow{font:800 11px/1.3 "Bricolage Grotesque";letter-spacing:.2em;text-transform:uppercase;color:#1EC8B0;margin-bottom:12px;text-shadow:0 1px 6px rgba(0,0,0,.6)}
.vm-h1{font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-weight:400;letter-spacing:-.02em;text-transform:uppercase;
  font-size:clamp(38px,12vw,80px);line-height:.9;color:#fff;margin:0 0 18px;text-shadow:0 3px 26px rgba(0,0,0,.55);max-width:11ch}
.vm-lede{font:600 15px/1.55 "Bricolage Grotesque";color:rgba(255,255,255,.88);max-width:44ch;text-shadow:0 1px 10px rgba(0,0,0,.6);margin-bottom:24px}
.vm-scrollhint{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.75)}
.vm-scrolllab{font:800 10px/1 "Bricolage Grotesque";letter-spacing:.2em;text-transform:uppercase}
.vm-chev{width:15px;height:15px;border-right:2px solid rgba(255,255,255,.8);border-bottom:2px solid rgba(255,255,255,.8);transform:rotate(45deg)}

.vm-tier{max-width:600px;margin:0 auto;padding:36px 20px;min-height:88svh;display:flex;align-items:center;position:relative}
/* HORIZON = marchés qu'on ne poursuit PAS → passage rapide, pas 6 écrans pleins morts
   (revue adverse : trough d'attention sur les KILL). Compacts, la discipline reste (chaque
   mur nommé), mais on "descend vite" au lieu de s'y attarder. */
.vm-tier.vm-horizon{min-height:auto;padding-top:26px;padding-bottom:26px}
.vm-card{position:relative;width:100%;border-radius:16px;padding:22px 22px 24px;opacity:.28;transform:translateY(26px) scale(.985);
  transition:opacity .5s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.vm-tier.on .vm-card{opacity:1;transform:none}
.vm-tier.vm-live .vm-card{background:#FDFCF7;color:#0D0D0D;border:2.5px solid #0D0D0D;box-shadow:4px 4px 0 #0D0D0D}
.vm-tier.vm-pilot .vm-card{background:#FDFCF7;color:#0D0D0D;border:2.5px solid #0D0D0D;box-shadow:4px 4px 0 rgba(13,13,13,.55)}
.vm-tier.vm-horizon .vm-card{background:rgba(6,20,28,.62);color:rgba(234,247,244,.9);border:2px dashed rgba(158,180,176,.5);
  -webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px);opacity:.72;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.vm-tier.vm-horizon.on .vm-card{opacity:.9}

.vm-metarow{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px}
.vm-tierno{font:700 12px/1 'JetBrains Mono',monospace;opacity:.55}
.vm-tier.vm-horizon .vm-tierno{color:#EAF7F4}
.vm-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font:800 10.5px/1 "Bricolage Grotesque";letter-spacing:.05em;text-transform:uppercase}
.vm-badge.vm-live{background:rgba(34,197,94,.14);color:#127c3b;border:1px solid rgba(34,197,94,.5)}
.vm-badge.vm-pilot{background:rgba(184,122,0,.14);color:#B87A00;border:1px solid rgba(184,122,0,.5)}
.vm-badge.vm-horizon{background:rgba(158,180,176,.16);color:#EAF7F4;border:1px solid rgba(158,180,176,.45)}
.vm-market{font:700 12px/1.2 "Bricolage Grotesque";letter-spacing:.02em;opacity:.7}
.vm-tier.vm-horizon .vm-market{color:#EAF7F4;opacity:.7}

.vm-tierhead{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.vm-emblem{flex:0 0 44px;width:44px;height:56px}
.vm-tiername{font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-weight:400;letter-spacing:-.01em;text-transform:uppercase;font-size:clamp(28px,8vw,44px);line-height:.92}
.vm-tier.vm-live .vm-tiername,.vm-tier.vm-pilot .vm-tiername{color:#0D0D0D}
.vm-tier.vm-horizon .vm-tiername{color:transparent;-webkit-text-stroke:1.4px rgba(234,247,244,.62)}

.vm-tiervalue{font:700 17px/1.35 "Bricolage Grotesque";margin-bottom:8px}
.vm-tier.vm-horizon .vm-tiervalue{color:rgba(234,247,244,.94);font-weight:600}
.vm-tierline{font:600 13.5px/1.5 "Bricolage Grotesque";opacity:.82}
.vm-tier.vm-live .vm-tierline,.vm-tier.vm-pilot .vm-tierline{color:#3a3a3a;opacity:1}
.vm-price{color:#0D0D0D;font-weight:800}

/* emblème par registre */
.vm-em-ant{stroke:currentColor;stroke-width:2.4;stroke-linecap:round}
.vm-em-body{fill:rgba(16,38,34,.9)}
.vm-em-lens{fill:#0a2b2b}.vm-em-iris{fill:#02100f}
.vm-tier.vm-live .vm-emblem{color:#FFC72C}
.vm-tier.vm-live .vm-em-ring{stroke:#FFC72C;stroke-width:3;fill:none}
.vm-tier.vm-live .vm-em-antdot{fill:#22C55E}
.vm-tier.vm-live .vm-em-lens{fill:#0a3a39}.vm-tier.vm-live .vm-em-iris{fill:#1EC8B0}
.vm-tier.vm-pilot .vm-emblem{color:#1EC8B0}
.vm-tier.vm-pilot .vm-em-ring{stroke:#009E8E;stroke-width:2.4;fill:none;opacity:.7}
.vm-tier.vm-pilot .vm-em-antdot{fill:#B87A00}.vm-tier.vm-pilot .vm-em-iris{fill:#0a3a39}
.vm-tier.vm-horizon .vm-emblem{color:rgba(158,180,176,.55);opacity:.65}
.vm-tier.vm-horizon .vm-em-body{fill:none;stroke:rgba(158,180,176,.5);stroke-width:1.4;stroke-dasharray:4 4}
.vm-tier.vm-horizon .vm-em-ring{stroke:rgba(158,180,176,.5);stroke-width:1.4;fill:none;stroke-dasharray:4 4}
.vm-tier.vm-horizon .vm-em-lens{fill:rgba(11,34,48,.3)}.vm-tier.vm-horizon .vm-em-iris{fill:none}
.vm-tier.vm-horizon .vm-em-antdot{fill:none;stroke:rgba(158,180,176,.45);stroke-width:1.2}

/* le mur horizon (pourquoi on n'y va pas) — jamais cliquable, jamais une offre */
.vm-wall{margin-top:14px;border-left:3px solid rgba(232,82,42,.6);padding:4px 0 4px 12px;pointer-events:none}
.vm-wl{display:block;font:800 9.5px/1 "Bricolage Grotesque";letter-spacing:.16em;text-transform:uppercase;color:#FF7A55;margin-bottom:6px;opacity:.95}
.vm-wt{font:600 13.5px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.94)}

/* CTA = <a> (skin-free) */
.vm-root a.vm-cta{display:inline-flex;align-items:center;gap:9px;margin-top:16px;text-decoration:none;cursor:pointer;
  border:2px solid #0D0D0D;border-radius:13px;padding:13px 18px;color:#0D0D0D;
  background:linear-gradient(135deg,#FFE47A,#FFC72C 45%,#E8A800);box-shadow:6px 6px 0 #0D0D0D;
  font:800 15px/1 "Bricolage Grotesque";letter-spacing:.005em;transition:transform .12s ease,box-shadow .12s ease}
.vm-root a.vm-cta:active{transform:translate(2px,2px);box-shadow:3px 3px 0 #0D0D0D}
.vm-ar{font-weight:800}

/* PILOT : capture email honnête (« prévenez-moi ») */
.vm-wait{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.vm-input{flex:1;min-width:150px;border:2px solid #0D0D0D;border-radius:11px;padding:12px 13px;font:600 14px/1 "Bricolage Grotesque";color:#0D0D0D;background:#fff}
.vm-input::placeholder{color:#7a7a7a}
.vm-root button.vm-send.vm-send{display:inline-flex;align-items:center;gap:7px;cursor:pointer;
  border:2px solid #0D0D0D!important;border-radius:11px!important;padding:12px 15px;color:#0D0D0D!important;
  background:linear-gradient(135deg,#FFE47A,#FFC72C 45%,#E8A800)!important;box-shadow:3px 3px 0 #0D0D0D!important;
  font:800 14px/1 "Bricolage Grotesque"!important;text-shadow:none!important}
.vm-root button.vm-send.vm-send:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #0D0D0D!important}
.vm-waitdone{margin-top:14px;font:800 14px/1.4 "Bricolage Grotesque";color:#127c3b}
.vm-pilotnote{margin-top:12px;display:inline-flex;align-items:center;gap:8px;font:700 12px/1.3 "Bricolage Grotesque";color:#B87A00}
.vm-pilotnote .vm-dot{width:8px;height:8px;border-radius:50%;background:#B87A00}

.vm-depthtag{position:absolute;right:2px;top:50%;transform:translateY(-50%);writing-mode:vertical-rl;font:700 11px/1 'JetBrains Mono',monospace;color:rgba(255,255,255,.5);letter-spacing:.1em}
@media (max-width:520px){.vm-depthtag{display:none}}

/* outro */
.vm-outro{max-width:600px;margin:0 auto;padding:60px 20px calc(90px + env(safe-area-inset-bottom));min-height:100svh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.vm-sig{max-width:22ch;font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-size:clamp(24px,6.4vw,38px);line-height:1.02;color:#fff;text-transform:uppercase;letter-spacing:-.01em;margin-bottom:12px;text-shadow:0 2px 20px rgba(0,0,0,.6)}
.vm-sig2{max-width:34ch;font:600 14px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.75);margin-bottom:28px}
.vm-root a.vm-exit{margin-top:0;padding:16px 24px;font-size:17px}
.vm-exitsub{margin-top:16px}
.vm-root a.vm-sublink{display:inline-flex;align-items:center;justify-content:center;min-height:44px;font:800 13px/1 "Bricolage Grotesque";color:#1EC8B0;cursor:pointer;
  text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;text-decoration-color:rgba(30,200,176,.45)}
.vm-footnote{margin-top:36px;font:600 11px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.45);max-width:40ch}

@media (prefers-reduced-motion:reduce){
  .vm-card{opacity:1!important;transform:none!important;transition:none!important}
  .vm-chev{animation:none!important}
}
`

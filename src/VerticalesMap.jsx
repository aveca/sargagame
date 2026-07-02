import React,{useState,useEffect,useRef,useCallback} from "react"
import {useSwipeClose} from "./useSwipeClose"

/* ============================================================
   LES 10 POSTES DU VEILLEUR — « Jusqu'où on descend »
   Port LIVE (dans l'app, plus dans design/) de la scène de vision
   design/proto-descente-marches.html. La profondeur de la mer =
   la profondeur du marché, MAIS le sujet réel est la DISCIPLINE :
   on n'éclaire (or) + on ne propose une action QUE sur ce qu'on
   vend honnêtement aujourd'hui (Sable/Récif/Digue). Prisme = PILOT
   (« prévenez-moi », pas de faux CTA/prix). Les 6 marchés tués par
   le panel docs/BIG_MARKETS.md (immo/assurance/croisière/pêche/
   énergie/souverain) = HORIZON : silhouette éteinte, mur « pourquoi
   on n'y va pas », ZÉRO or / ZÉRO prix / ZÉRO CTA. Le moat encodé
   dans le pixel : l'argent ne touche jamais le verdict, et on
   s'arrête où finit la mesure.

   Classification FIGÉE par docs/BIG_MARKETS.md — ne pas re-litiger
   sans re-panel. Overlay lazy (hors budget eager), rollback ?verticals=0.
   Actions branchées in-app par PROPS (aucun import du monolithe →
   chunk propre, zéro circulaire) : onSeeMyBeach / onOpenPro / onWaitlist.
   ============================================================ */

/* profondeur (métaphore de plongée) FIGÉE par palier — cf. proto */
const TIERS=[
  {id:"sable",   name:"SABLE",     kind:"live",    depth:"−0 m",    depthM:0},
  {id:"recif",   name:"RÉCIF",     kind:"live",    depth:"−40 m",   depthM:40},
  {id:"digue",   name:"DIGUE",     kind:"live",    depth:"−120 m",  depthM:120},
  {id:"amarre",  name:"AMARRE",    kind:"horizon", depth:"−400 m",  depthM:400},
  {id:"barometre",name:"BAROMÈTRE",kind:"horizon", depth:"−900 m",  depthM:900},
  {id:"sillage", name:"SILLAGE",   kind:"horizon", depth:"−1500 m", depthM:1500},
  {id:"filet",   name:"FILET",     kind:"horizon", depth:"−2400 m", depthM:2400},
  {id:"courant", name:"COURANT",   kind:"horizon", depth:"−3500 m", depthM:3500},
  {id:"prisme",  name:"PRISME",    kind:"pilot",   depth:"−4800 m", depthM:4800},
  {id:"abysse",  name:"ABYSSE",    kind:"horizon", depth:"−6000 m", depthM:6000},
]
const MAXDEPTH=6000

/* Copy i18n — reprise 1:1 du proto panel-approuvé. Aucun prix/CTA hors LIVE.
   Le champ `line` d'un HORIZON est le MUR (« pourquoi on n'y va pas »). */
const COPY={
  fr:{
    eyebrow:"La profondeur de la mer = la profondeur du marché",
    headline:"JUSQU'OÙ ON DESCEND",
    lede:"On regarde la même mer — mais on n'éclaire que ce qu'on sait mesurer. Plus bas, plus net : votre plage, votre rivage, votre commune. Sous la ligne de flottaison, c'est le cap, pas le catalogue.",
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
      {market:"Mairies & offices de tourisme", value:"Toute la commune, baie par baie.",               line:"199 €/mois ou 1 990 €/an · self-serve.", prices:["199 €/mois","1 990 €/an"], cta:"Ouvrir Territoire"},
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
    lede:"We look at the same sea — but we only light up what we can measure. Deeper, sharper: your beach, your shore, your town. Below the waterline, it's the heading, not the catalogue.",
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
      {market:"Town halls & tourism offices", value:"The whole town, bay by bay.",                     line:"$249/mo · self-serve.", prices:["$249/mo"], cta:"Open Territory"},
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
    lede:"Miramos el mismo mar — pero solo iluminamos lo que sabemos medir. Más abajo, más nítido: tu playa, tu costa, tu municipio. Bajo la línea de flotación, es el rumbo, no el catálogo.",
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
      {market:"Ayuntamientos y turismo",      value:"Todo el municipio, bahía por bahía.",             line:"249 $/mes · autoservicio.", prices:["249 $/mes"], cta:"Abrir Territorio"},
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

/* enrobe les tokens prix dans <span class=vm-price> (mise en avant, zéro innerHTML) */
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

/* emblème Veilleur par palier (couleur = registre, pilotée par le CSS scoped) */
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

export default function VerticalesMap({lang="fr",track,onClose,onSeeMyBeach,onOpenPro,onWaitlist}){
  const L=COPY[lang]||COPY.fr
  const t=(fr,en,es)=>lang==="es"?es:lang==="en"?en:fr
  const reduce=(()=>{try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){return false}})()

  const sw=useSwipeClose(()=>onClose&&onClose(),{guardInput:true,threshold:70})
  const rootRef=sw.ref
  const closeRef=useRef(null)
  const [depth,setDepth]=useState(reduce?0.12:0)     // 0..1 profondeur lissée
  const [waitSent,setWaitSent]=useState(false)
  const [waitEmail,setWaitEmail]=useState("")

  const emit=useCallback((ev,p)=>{try{track&&track(ev,p||{})}catch(_){}},[track])

  // impression (1×)
  useEffect(()=>{emit("sg_verticales_view",{lang})},[]) // eslint-disable-line

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

  // Moteur profondeur : scroll du scroller → --vmd lissé (rAF coalescé).
  // reduced-motion = plancher dur (profondeur figée, aucun listener).
  useEffect(()=>{
    if(reduce)return
    const sc=rootRef.current;if(!sc)return
    let raf=0,tgt=0,cur=0
    const read=()=>{const max=sc.scrollHeight-sc.clientHeight;tgt=max>0?Math.min(1,Math.max(0,sc.scrollTop/max)):0}
    const step=()=>{
      const d=tgt-cur
      if(Math.abs(d)>0.0006){cur+=d*0.18;sc.style.setProperty("--vmd",cur.toFixed(4));setDepth(cur);raf=requestAnimationFrame(step)}
      else{cur=tgt;sc.style.setProperty("--vmd",cur.toFixed(4));setDepth(cur);raf=0}
    }
    const onScroll=()=>{read();if(!raf)raf=requestAnimationFrame(step)}
    read();cur=tgt;sc.style.setProperty("--vmd",cur.toFixed(4));setDepth(cur)
    sc.addEventListener("scroll",onScroll,{passive:true})
    return()=>{sc.removeEventListener("scroll",onScroll);if(raf)cancelAnimationFrame(raf)}
  },[reduce]) // eslint-disable-line

  // Révélation des paliers (IntersectionObserver ; reduced-motion = tous visibles)
  const [onIdx,setOnIdx]=useState(()=>reduce?TIERS.map((_,i)=>i):[])
  useEffect(()=>{
    if(reduce)return
    const sc=rootRef.current;if(!sc)return
    const io=new IntersectionObserver(entries=>{
      let add=null
      entries.forEach(en=>{if(en.isIntersecting){const i=+en.target.getAttribute("data-i");if(!isNaN(i)){add=add||[];add.push(i)}}})
      if(add)setOnIdx(prev=>{const s=new Set(prev);add.forEach(i=>s.add(i));return[...s]})
    },{root:sc,rootMargin:"-26% 0px -26% 0px",threshold:0.01})
    sc.querySelectorAll(".vm-tier").forEach(s=>io.observe(s))
    return()=>io.disconnect()
  },[reduce]) // eslint-disable-line

  const doAction=(tier,fn)=>{emit("sg_verticales_tap",{tier,lang});fn&&fn()}
  const submitWait=e=>{
    e&&e.preventDefault()
    const em=(waitEmail||"").trim()
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return
    try{onWaitlist&&onWaitlist(em)}catch(_){}
    emit("sg_verticales_waitlist",{lang})
    setWaitSent(true)
  }

  const curTier=depth<0.02?L.surface:(TIERS[Math.min(TIERS.length-1,Math.floor(depth*TIERS.length+0.001))].name)
  const curM=Math.round(depth*MAXDEPTH/10)*10

  return(
    <div ref={rootRef} className="sg-onink-scope vm-root" data-sg-live="1"
      role="dialog" aria-modal="true"
      aria-label={t("Les 10 postes du Veilleur — jusqu'où on descend","The Watcher's 10 posts — how deep we go","Los 10 puestos del Vigía — hasta dónde bajamos")}
      onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}
      style={reduce?{"--vmd":0.12}:undefined}>
      <style>{VM_CSS}</style>

      {/* ---------- BACKDROP OCÉAN (fixe, hors gestes) ---------- */}
      <div className="vm-bg" aria-hidden="true">
        <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="vmOcean" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F2B05E"/><stop offset=".05" stopColor="#FFD884"/>
              <stop offset=".14" stopColor="#C97E3A"/><stop offset=".30" stopColor="#1A5852"/>
              <stop offset=".55" stopColor="#155A5A"/><stop offset=".78" stopColor="#0B2230"/>
              <stop offset="1" stopColor="#08251F"/>
            </linearGradient>
            <linearGradient id="vmDeep" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#03101C"/><stop offset=".6" stopColor="#020A12"/><stop offset="1" stopColor="#01060C"/>
            </linearGradient>
            <radialGradient id="vmVig" cx="50%" cy="42%" r="72%">
              <stop offset=".45" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".85"/>
            </radialGradient>
            <radialGradient id="vmSun" gradientUnits="userSpaceOnUse" cx="560" cy="70" r="220">
              <stop offset="0" stopColor="#fdf6e3"/><stop offset=".45" stopColor="#ffc187" stopOpacity=".6"/><stop offset="1" stopColor="#ff944a" stopOpacity="0"/>
            </radialGradient>
            <linearGradient id="vmRay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFE9B8" stopOpacity=".5"/><stop offset="1" stopColor="#FFE9B8" stopOpacity="0"/>
            </linearGradient>
            <radialGradient id="vmLens" cx="38%" cy="32%" r="72%"><stop offset="0" stopColor="#CFF4FF"/><stop offset=".34" stopColor="#16b9c9"/><stop offset="1" stopColor="#052b2b"/></radialGradient>
            <linearGradient id="vmPanel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b4763"/><stop offset="1" stopColor="#0B2230"/></linearGradient>
            <linearGradient id="vmBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3c38"/><stop offset=".55" stopColor="#102622"/><stop offset="1" stopColor="#0A1714"/></linearGradient>
            <radialGradient id="vmHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#1EC8B0" stopOpacity=".5"/><stop offset=".5" stopColor="#1EC8B0" stopOpacity=".16"/><stop offset="1" stopColor="#1EC8B0" stopOpacity="0"/>
            </radialGradient>
            <filter id="vmSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
          </defs>
          <rect x="0" y="0" width="800" height="600" fill="url(#vmOcean)"/>
          <circle className="vm-sun" cx="560" cy="70" r="220" fill="url(#vmSun)"/>
          <g className="vm-rays">
            <polygon points="180,-40 260,-40 200,640 60,640" fill="url(#vmRay)"/>
            <polygon points="420,-40 470,-40 470,640 350,640" fill="url(#vmRay)" opacity=".7"/>
            <polygon points="600,-40 660,-40 720,640 560,640" fill="url(#vmRay)" opacity=".8"/>
          </g>
          <rect className="vm-deepen" x="0" y="0" width="800" height="600" fill="url(#vmDeep)"/>
          <rect className="vm-vignette" x="0" y="0" width="800" height="600" fill="url(#vmVig)"/>
          {/* LA SONDE — Veilleur, capteur vers la mer (bas) */}
          <g className="vm-sonde">
            <g className="vm-sonde-anim">
              <circle cx="0" cy="0" r="120" fill="url(#vmHalo)" filter="url(#vmSoft)"/>
              <g transform="scale(1.05)">
                <rect x="-86" y="-8" width="56" height="30" rx="3" fill="url(#vmPanel)" transform="rotate(-7 -58 7)"/>
                <rect x="30" y="-8" width="56" height="30" rx="3" fill="url(#vmPanel)" transform="rotate(7 58 7)"/>
                <path d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z" fill="url(#vmBody)" stroke="#FFD884" strokeWidth="1.3" strokeOpacity=".5"/>
                <circle cx="0" cy="8" r="22" fill="url(#vmLens)"/>
                <circle cx="0" cy="8" r="22" fill="none" stroke="#E8A800" strokeWidth="3"/>
                <circle cx="0" cy="12" r="8" fill="#03100f"/>
                <circle cx="-3" cy="9" r="2.8" fill="#fff7e2"/>
                <line x1="0" y1="-30" x2="0" y2="-46" stroke="#0e2622" strokeWidth="3"/>
                <circle cx="0" cy="-49" r="4.6" fill="#22C55E"/>
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

      {/* ---------- HUD profondeur (jauge de plongée = la métaphore) ---------- */}
      <div className="vm-hud" aria-hidden="true">
        <div className="vm-depthlab">−{curM.toLocaleString(lang==="fr"?"fr-FR":lang==="es"?"es-ES":"en-US")} m</div>
        <div className="vm-track"><div className="vm-fill"/><div className="vm-knob"/></div>
        <div className="vm-tierlab">{curTier}</div>
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
                    href={tier.id==="digue"?"/pro/":tier.id==="recif"?"/pro/espace/":"/"}
                    onClick={e=>{
                      e.preventDefault()
                      if(tier.id==="sable")doAction("sable",onSeeMyBeach)
                      else if(tier.id==="recif")doAction("recif",()=>onOpenPro&&onOpenPro("verticales_recif"))
                      else doAction("digue",()=>{try{if(typeof window!=="undefined")window.location.assign("/pro/")}catch(_){}})
                    }}>
                    {c.cta}<span className="vm-ar">→</span>
                  </a>
                </>}

                {tier.kind==="pilot"&&<>
                  <p className="vm-tierline">{c.line}</p>
                  {!waitSent?(
                    <form className="vm-wait" onSubmit={submitWait}>
                      <input type="email" inputMode="email" autoComplete="email" className="vm-input"
                        value={waitEmail} onChange={e=>setWaitEmail(e.target.value)}
                        placeholder={L.waitPlaceholder} aria-label={L.waitPlaceholder}/>
                      <button type="submit" className="vm-send vm-send">{L.waitlist}<span className="vm-ar">→</span></button>
                    </form>
                  ):(
                    <p className="vm-waitdone">✓ {L.waitDone}</p>
                  )}
                  <div className="vm-pilotnote"><span className="vm-dot"/>{L.badgePilot} — {L.pilotNote}</div>
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
   CSS scoped — toutes les règles préfixées .vm-root. Racine en
   .sg-onink-scope → le skin .theme-comic button est neutralisé
   (unset) ; les 2 vrais <button> (fermer/envoyer) sont RE-SPÉCIFIÉS
   en triple-classe (.vm-root button.vm-x.vm-x = 0,3,1) pour battre
   .theme-comic .sg-onink-scope button (0,2,1). Les CTA sont des <a>
   (non ciblés par le skin button/[role=button]).
   --vmd (0..1) = profondeur, écrite par le rAF sur le scroller.
   ============================================================ */
const VM_CSS=`
.vm-root{position:fixed;inset:0;z-index:1050;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  background:#02060A;color:#EAF7F4;--vmd:0;
  font-family:"Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
.vm-root *{box-sizing:border-box}

/* backdrop océan fixe (hors gestes) */
.vm-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:#F2B05E}
.vm-bg>svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.vm-deepen{opacity:calc(var(--vmd) * .94)}
.vm-vignette{opacity:calc(var(--vmd) * .55)}
.vm-rays{opacity:calc(1 - var(--vmd) * 1.7)}
.vm-sonde{transform:translate(400px, calc(150px + var(--vmd) * 70px)) scale(calc(1 - var(--vmd) * .3))}

@media (prefers-reduced-motion:no-preference){
  .vm-root .vm-sonde-anim{animation:vmBreathe 7s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes vmBreathe{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-4px) rotate(-1.2deg)}}
  .vm-root .vm-sun{animation:vmSunB 11s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes vmSunB{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
  .vm-root .vm-chev{animation:vmBob 1.8s ease-in-out infinite}
  @keyframes vmBob{0%,100%{transform:rotate(45deg) translate(0,0)}50%{transform:rotate(45deg) translate(3px,3px)}}
}

/* chrome */
.vm-chrome{position:fixed;top:0;left:0;right:0;z-index:1060;display:flex;justify-content:space-between;align-items:flex-start;
  padding:calc(10px + env(safe-area-inset-top)) 14px 10px;pointer-events:none;gap:10px}
.vm-brand{pointer-events:auto}
.vm-wm{font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-size:18px;color:#fff;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 1px 8px rgba(0,0,0,.5);display:block}
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
.vm-lede{font:600 15px/1.55 "Bricolage Grotesque";color:rgba(255,255,255,.85);max-width:44ch;text-shadow:0 1px 10px rgba(0,0,0,.5);margin-bottom:24px}
.vm-scrollhint{display:flex;align-items:center;gap:9px;color:rgba(255,255,255,.75)}
.vm-scrolllab{font:800 10px/1 "Bricolage Grotesque";letter-spacing:.2em;text-transform:uppercase}
.vm-chev{width:15px;height:15px;border-right:2px solid rgba(255,255,255,.8);border-bottom:2px solid rgba(255,255,255,.8);transform:rotate(45deg)}

.vm-tier{max-width:600px;margin:0 auto;padding:36px 20px;min-height:88svh;display:flex;align-items:center;position:relative}
.vm-card{position:relative;width:100%;border-radius:16px;padding:22px 22px 24px;opacity:.28;transform:translateY(26px) scale(.985);
  transition:opacity .5s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.vm-tier.on .vm-card{opacity:1;transform:none}
.vm-tier.vm-live .vm-card{background:#FDFCF7;color:#0D0D0D;border:2.5px solid #0D0D0D;box-shadow:4px 4px 0 #0D0D0D}
.vm-tier.vm-pilot .vm-card{background:#FDFCF7;color:#0D0D0D;border:2.5px solid #0D0D0D;box-shadow:4px 4px 0 rgba(13,13,13,.55)}
.vm-tier.vm-horizon .vm-card{background:rgba(11,34,48,.34);color:rgba(234,247,244,.9);border:2px dashed rgba(158,180,176,.5);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:.62}
.vm-tier.vm-horizon.on .vm-card{opacity:.82}

.vm-metarow{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px}
.vm-tierno{font:700 12px/1 'JetBrains Mono',monospace;opacity:.55}
.vm-tier.vm-horizon .vm-tierno{color:#EAF7F4}
.vm-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font:800 10.5px/1 "Bricolage Grotesque";letter-spacing:.05em;text-transform:uppercase}
.vm-badge.vm-live{background:rgba(34,197,94,.14);color:#127c3b;border:1px solid rgba(34,197,94,.5)}
.vm-badge.vm-pilot{background:rgba(184,122,0,.14);color:#B87A00;border:1px solid rgba(184,122,0,.5)}
.vm-badge.vm-horizon{background:rgba(158,180,176,.14);color:#EAF7F4;border:1px solid rgba(158,180,176,.4)}
.vm-market{font:700 12px/1.2 "Bricolage Grotesque";letter-spacing:.02em;opacity:.7}
.vm-tier.vm-horizon .vm-market{color:#EAF7F4;opacity:.65}

.vm-tierhead{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.vm-emblem{flex:0 0 44px;width:44px;height:56px}
.vm-tiername{font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-weight:400;letter-spacing:-.01em;text-transform:uppercase;font-size:clamp(28px,8vw,44px);line-height:.92}
.vm-tier.vm-live .vm-tiername,.vm-tier.vm-pilot .vm-tiername{color:#0D0D0D}
.vm-tier.vm-horizon .vm-tiername{color:transparent;-webkit-text-stroke:1.4px rgba(234,247,244,.6)}

.vm-tiervalue{font:700 17px/1.35 "Bricolage Grotesque";margin-bottom:8px}
.vm-tier.vm-horizon .vm-tiervalue{color:rgba(234,247,244,.92);font-weight:600}
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
.vm-tier.vm-horizon .vm-emblem{color:rgba(158,180,176,.5);opacity:.6}
.vm-tier.vm-horizon .vm-em-body{fill:none;stroke:rgba(158,180,176,.45);stroke-width:1.4;stroke-dasharray:4 4}
.vm-tier.vm-horizon .vm-em-ring{stroke:rgba(158,180,176,.45);stroke-width:1.4;fill:none;stroke-dasharray:4 4}
.vm-tier.vm-horizon .vm-em-lens{fill:rgba(11,34,48,.3)}.vm-tier.vm-horizon .vm-em-iris{fill:none}
.vm-tier.vm-horizon .vm-em-antdot{fill:none;stroke:rgba(158,180,176,.4);stroke-width:1.2}

/* le mur horizon (pourquoi on n'y va pas) — jamais cliquable, jamais une offre */
.vm-wall{margin-top:14px;border-left:3px solid rgba(232,82,42,.55);padding:4px 0 4px 12px;pointer-events:none}
.vm-wl{display:block;font:800 9.5px/1 "Bricolage Grotesque";letter-spacing:.16em;text-transform:uppercase;color:#E8522A;margin-bottom:6px;opacity:.85}
.vm-wt{font:600 13.5px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.9)}

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

.vm-depthtag{position:absolute;right:2px;top:50%;transform:translateY(-50%);writing-mode:vertical-rl;font:700 11px/1 'JetBrains Mono',monospace;color:rgba(255,255,255,.42);letter-spacing:.1em}
@media (max-width:520px){.vm-depthtag{display:none}}

/* outro */
.vm-outro{max-width:600px;margin:0 auto;padding:60px 20px calc(90px + env(safe-area-inset-bottom));min-height:100svh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.vm-sig{max-width:22ch;font-family:'Anton',"Arial Narrow",system-ui,sans-serif;font-size:clamp(24px,6.4vw,38px);line-height:1.02;color:#fff;text-transform:uppercase;letter-spacing:-.01em;margin-bottom:12px;text-shadow:0 2px 20px rgba(0,0,0,.6)}
.vm-sig2{max-width:34ch;font:600 14px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.72);margin-bottom:28px}
.vm-root a.vm-exit{margin-top:0;padding:16px 24px;font-size:17px}
.vm-exitsub{margin-top:16px}
.vm-root a.vm-sublink{font:800 13px/1 "Bricolage Grotesque";color:#1EC8B0;text-decoration:none;border-bottom:1px solid rgba(30,200,176,.4);padding-bottom:2px;cursor:pointer}
.vm-footnote{margin-top:36px;font:600 11px/1.5 "Bricolage Grotesque";color:rgba(234,247,244,.42);max-width:40ch}

@media (prefers-reduced-motion:reduce){
  .vm-card{opacity:1!important;transform:none!important;transition:none!important}
  .vm-chev{animation:none!important}
}
`

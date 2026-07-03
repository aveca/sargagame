import React,{useState,useEffect,useRef,useCallback} from "react"
import {createPortal} from "react-dom"
import {useSwipeClose} from "./useSwipeClose"

/* ============================================================
   LE BRIEF DU MATIN — le payload premium rendu tangible
   Port fidèle de design/proto-veilleur-brief-matin.html (forge 02/07,
   vérifié navigateur). Surface = le brief quotidien que Le Veilleur
   livre pour TA plage au lever du jour : verdict (couleur+FORME+MOT),
   score, « aujourd'hui », « ton meilleur jour », santé H₂S HEDGÉE,
   Plan-B (anti-cul-de-sac) si non-propre, freshness RÉELLE, fiabilité
   hedgée, 1 CTA positif → openPremium. Sert §2 « Hero perso (H1 daté) »
   + §4A #1 (verdict aujourd'hui) + #6 (Le Veilleur personnel / alerte).

   Moteur repris du proto-veilleur-clip-v2 : Le Veilleur veille la MER
   (rassure ≠ surveille), 1 SEUL rAF demand-driven, pause visibilitychange,
   humeur data-driven (couleur + forme + posture, snap couleur marque),
   reduced-motion = plancher dur (tableau figé lisible). 100 % DATA-DRIVEN
   via la prop `data` {beach,region,score,status,bestDay,h2s,planB,ageHours}
   — 0 fabrication. Lazy (chunk propre, hors budget eager). Rollback ?brief=0.

   Lois mobile : createPortal(document.body) hors couche gestes carte +
   sg-onink-scope + useSwipeClose + 4 voies de sortie (✕ ≥44px / Échap /
   backdrop / swipe-down) + focus-trap + restauration. L'argent ne touche
   jamais le verdict : verdict 100 % data, CTA = porte openPremium.
   ============================================================ */

const VCOL={clean:"#22C55E",moderate:"#B87A00",avoid:"#E8522A"}

/* forme SVG du statut (couleur + FORME + mot, jamais couleur seule) */
function VerdictForm({status}){
  if(status==="clean")return(
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M2.5 8 l3.2 3.4 L12.5 4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>)
  if(status==="avoid")return(
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M3.4 3.4 L11.6 11.6 M11.6 3.4 L3.4 11.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>)
  /* modéré : demi-disque encre (chip ambre) */
  return(
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="5.4" fill="none" stroke="#0D0D0D" strokeWidth="1.6"/>
      <path d="M7.5 2.1 a5.4 5.4 0 0 1 0 10.8 z" fill="#0D0D0D"/>
    </svg>)
}

const STR={
  fr:{live:"EN TEMPS RÉEL",eb:"LE BRIEF DU MATIN",today:"AUJOURD'HUI",best:"TON MEILLEUR JOUR",h2s:"SANTÉ · H₂S",
      planb:"PLUTÔT, AUJOURD'HUI",hedge:"Indice dérivé — pas une mesure de gaz, aucun capteur.",
      rel:"Fiabilité « mer propre » 76 % à 79 % selon la saison. ",relL:"On publie nos erreurs →",
      cta:"Réveille-moi quand ça change →",ctaDone:"tu seras prévenu·e le premier",
      fresh:h=>"Mesuré au satellite il y a "+h+" h",checking:"vérification en cours",close:"Fermer",
      verd:{clean:"PROPRE",moderate:"MODÉRÉ",avoid:"À ÉVITER"},
      say:{clean:"Mer propre — vas-y l'esprit tranquille.",moderate:"Quelques dépôts possibles — regarde avant de poser la serviette.",avoid:"Sargasses attendues — mieux vaut une autre crique."}},
  en:{live:"REAL-TIME",eb:"THE MORNING BRIEF",today:"TODAY",best:"YOUR BEST DAY",h2s:"HEALTH · H₂S",
      planb:"BETTER, TODAY",hedge:"Derived index — not a gas reading, no sensor.",
      rel:"“Clean sea” reliability 76% to 79% by season. ",relL:"We publish our misses →",
      cta:"Wake me when it changes →",ctaDone:"you'll be the first to know",
      fresh:h=>"Satellite-measured "+h+" h ago",checking:"data check in progress",close:"Close",
      verd:{clean:"CLEAN",moderate:"MODERATE",avoid:"AVOID"},
      say:{clean:"Clean sea — go with peace of mind.",moderate:"Some deposits possible — check before you settle in.",avoid:"Sargassum expected — pick another cove."}},
  es:{live:"EN TIEMPO REAL",eb:"EL PARTE DE LA MAÑANA",today:"HOY",best:"TU MEJOR DÍA",h2s:"SALUD · H₂S",
      planb:"MEJOR, HOY",hedge:"Índice derivado — no es una medición de gas, sin sensor.",
      rel:"Fiabilidad “mar limpio” 76% a 79% según la temporada. ",relL:"Publicamos nuestros errores →",
      cta:"Avísame cuando cambie →",ctaDone:"serás el primero en saberlo",
      fresh:h=>"Medido por satélite hace "+h+" h",checking:"verificación en curso",close:"Cerrar",
      verd:{clean:"LIMPIO",moderate:"MODERADO",avoid:"EVITAR"},
      say:{clean:"Mar limpio — ve con tranquilidad.",moderate:"Posibles depósitos — mira antes de instalarte.",avoid:"Sargazo previsto — elige otra cala."}}
}

/* humeurs (couleur + forme + posture) branchées sur le VRAI statut */
const MOODS={
  calm:  {mood:"#1FB6A6",halo:"#1FB6A6",dot:"#22C55E",irisR:7.4,pose:0, lift:0, browLift:-1, lidTop:.08, lidBot:.24, beam:0},
  scan:  {mood:"#FFC72C",halo:"#E8A800",dot:"#FFC72C",irisR:9.2,pose:4, lift:0, browLift:1.4, lidTop:.26, lidBot:0,  beam:1},
  alert: {mood:"#E8522A",halo:"#E8522A",dot:"#E8522A",irisR:10, pose:-3,lift:-5,browLift:3,  lidTop:-.16,lidBot:-.16,beam:.2}
}

function pick(v,lang){if(v==null)return null;if(typeof v==="string")return v;return v[lang]||v.fr||v.en||null}

export default function BriefMatin({data,lang="fr",onClose,onPremium,onReliability,track}){
  const L=STR[lang]||STR.fr
  const reduce=(()=>{try{return matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){return false}})()

  const sw=useSwipeClose(()=>onClose&&onClose(),{guardInput:false,threshold:70})
  const rootRef=sw.ref
  const closeRef=useRef(null)
  const [ctaDone,setCtaDone]=useState(false)

  const D=data||{}
  const st=(D.status==="avoid"||D.status==="moderate"||D.status==="clean")?D.status:"moderate"
  const verdict=VCOL[st]||"#B87A00"
  const showPlanB=(st==="avoid"||st==="moderate")&&D.planB
  const ageH=D.ageHours

  /* refs scène (mutés en impératif dans le rAF — zéro setState/frame) */
  const svgRef=useRef(null),pMidRef=useRef(null),pFrontRef=useRef(null)
  const gPoseRef=useRef(null),gLifeRef=useRef(null),gIrisRef=useRef(null)
  const irisRef=useRef(null),irisTintRef=useRef(null),pupilRef=useRef(null),catchBRef=useRef(null)
  const lidTopRef=useRef(null),lidBotRef=useRef(null),browRef=useRef(null),haloRef=useRef(null)
  const beamGRef=useRef(null),beamRef=useRef(null),scanRingRef=useRef(null),raftRef=useRef(null),antRef=useRef(null)
  const moodTargetRef=useRef(st==="clean"?"calm":st==="moderate"?"scan":"alert")

  const emit=useCallback((ev,p)=>{try{track&&track(ev,p||{})}catch(_){}},[track])

  /* liseré verdict + couleur de statut sur la racine scopée (jamais documentElement) */
  useEffect(()=>{
    const r=rootRef.current;if(!r)return
    r.style.setProperty("--verdict",verdict)
    moodTargetRef.current=st==="clean"?"calm":st==="moderate"?"scan":"alert"
  },[verdict,st]) // eslint-disable-line

  /* vue = unique émetteur */
  useEffect(()=>{
    const src=(()=>{try{return /[?&]brief=1/.test(window.location.search)?"deeplink":"entry"}catch(_){return"entry"}})()
    emit("sg_brief_view",{lang,status:st,source:src})
  },[]) // eslint-disable-line

  /* Échap + focus (piégé léger) + restauration */
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

  /* ============================================================
     MOTEUR — 1 rAF demand-driven, pause visibilitychange
     Le Veilleur veille la MER (regard revient à l'eau ~1s), humeur
     data-driven (snap couleur marque), reduced-motion = plancher dur.
     ============================================================ */
  useEffect(()=>{
    const svg=svgRef.current,root=rootRef.current;if(!svg||!root)return
    const $=r=>r&&r.current
    const iris=$(irisRef),irisTint=$(irisTintRef),pupil=$(pupilRef),catchB=$(catchBRef),
      lidTop=$(lidTopRef),lidBot=$(lidBotRef),brow=$(browRef),halo=$(haloRef),beamG=$(beamGRef),
      beam=$(beamRef),scanRing=$(scanRingRef),raft=$(raftRef),ant=$(antRef),gIris=$(gIrisRef),
      gPose=$(gPoseRef),gLife=$(gLifeRef),pMid=$(pMidRef),pFront=$(pFrontRef)

    const EYE={x:400,y:193}
    const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>v<a?a:(v>b?b:v)
    const easeInOut=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2
    const hx=c=>{c=c.replace("#","");return[parseInt(c.substr(0,2),16),parseInt(c.substr(2,2),16),parseInt(c.substr(4,2),16)]}
    const mix=(a,b,t)=>{const A=hx(a),B=hx(b);return"rgb("+Math.round(lerp(A[0],B[0],t))+","+Math.round(lerp(A[1],B[1],t))+","+Math.round(lerp(A[2],B[2],t))+")"}
    const toVB=(cx2,cy2)=>{const r=svg.getBoundingClientRect(),sc=Math.max(r.width/800,r.height/600),dw=800*sc,dh=600*sc,ox=(r.width-dw)/2,oy=(r.height-dh)/2;return{x:(cx2-r.left-ox)/sc,y:(cy2-r.top-oy)/sc}}
    const getCss=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim();return v||"#1FB6A6"}
    const toHex=c=>{c=(c||"").trim();if(c[0]==="#")return c.length===4?"#"+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:c;const m=c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);if(m)return"#"+[1,2,3].map(i=>("0"+parseInt(m[i]).toString(16)).slice(-2)).join("");return"#1FB6A6"}
    const mixCss=(cur,tg,t)=>mix(toHex(cur),toHex(tg),t)
    const clone=o=>{const n={};for(const k in o)n[k]=o[k];return n}
    const rs=root.style
    const now=()=>performance.now(),t0=now()

    let M=clone(MOODS[moodTargetRef.current]||MOODS.scan)
    let curMood=moodTargetRef.current
    const MT=()=>MOODS[moodTargetRef.current]||MOODS.scan

    let tx=EYE.x,ty=430,cx=EYE.x,cy=430,pointerActive=false,lastInput=-1
    let blinkStart=-1,blinkDur=180,nextBlink=now()+2600,raftK=0,introDone=reduce
    const rand=(a,b)=>a+Math.random()*(b-a)
    const setLids=blink=>{
      const cy0=4,kT=clamp(M.lidTop+blink,-.4,1),kB=clamp(M.lidBot+blink,-.4,1)
      const cpT=lerp(-20,cy0+1,kT),cpB=lerp(28,cy0-1,kB)
      lidTop&&lidTop.setAttribute("d","M-22 "+cy0+" Q0 "+cpT+" 22 "+cy0+" L22 -22 L-22 -22 Z")
      lidBot&&lidBot.setAttribute("d","M-22 "+cy0+" Q0 "+cpB+" 22 "+cy0+" L22 30 L-22 30 Z")
    }
    const introProg=()=>clamp((now()-t0)/3200,0,1)

    function paintStatic(){
      const m=MOODS[curMood]||MOODS.scan
      M=clone(m)
      rs.setProperty("--mood",m.mood);rs.setProperty("--moodHalo",m.halo);rs.setProperty("--moodDot",m.dot)
      iris&&iris.setAttribute("r",m.irisR);irisTint&&irisTint.setAttribute("r",m.irisR);pupil&&pupil.setAttribute("r",(m.irisR*.42).toFixed(2))
      setLids(0);brow&&brow.setAttribute("d","M-15 -19 Q0 "+(-25+m.browLift)+" 15 -19")
      halo&&halo.setAttribute("opacity",".5");beam&&beam.setAttribute("opacity","0");scanRing&&scanRing.setAttribute("opacity","0")
      gIris&&gIris.setAttribute("transform","translate(0 1.5)")
      raft&&raft.setAttribute("transform",curMood==="alert"?"translate(496 420) scale(1.32)":"translate(566 400) scale(1)")
    }

    if(reduce){curMood=moodTargetRef.current;paintStatic();return}

    let paused=false,raf=0
    const wake=()=>{if(!paused&&!raf)raf=requestAnimationFrame(tick)}
    function tick(){
      raf=0;if(paused)return;const t=now(),ms=.02,target=MT()
      curMood=moodTargetRef.current
      M.irisR=lerp(M.irisR,target.irisR,ms);M.pose=lerp(M.pose,target.pose,ms);M.lift=lerp(M.lift,target.lift,ms)
      M.browLift=lerp(M.browLift,target.browLift,ms);M.lidTop=lerp(M.lidTop,target.lidTop,ms);M.lidBot=lerp(M.lidBot,target.lidBot,ms);M.beam=lerp(M.beam,target.beam,ms)
      rs.setProperty("--mood",mixCss(getCss("--mood"),target.mood,ms))
      rs.setProperty("--moodHalo",mixCss(getCss("--moodHalo"),target.halo,ms))
      rs.setProperty("--moodDot",mixCss(getCss("--moodDot"),target.dot,ms))
      if(Math.abs(M.irisR-target.irisR)<0.06){rs.setProperty("--mood",target.mood);rs.setProperty("--moodHalo",target.halo);rs.setProperty("--moodDot",target.dot)} // snap couleur marque

      iris&&iris.setAttribute("r",M.irisR.toFixed(2));irisTint&&irisTint.setAttribute("r",M.irisR.toFixed(2));pupil&&pupil.setAttribute("r",(M.irisR*.42).toFixed(2))

      /* regard : suit le pointeur brièvement puis REVIENT à la mer */
      if(!(pointerActive&&t-lastInput<1100)){tx=lerp(tx,EYE.x,.02);ty=lerp(ty,430,.02)}
      cx=lerp(cx,tx,.08);cy=lerp(cy,ty,.08)
      const ex=clamp((cx-EYE.x)/44,-4,4),ey=clamp((cy-EYE.y)/58,-3,4)
      gIris&&gIris.setAttribute("transform","translate("+ex.toFixed(2)+" "+ey.toFixed(2)+")")
      catchB&&catchB.setAttribute("cx",(3.4+ex*.7).toFixed(2));catchB&&catchB.setAttribute("cy",(2.6+ey*.7).toFixed(2))

      const breathe=Math.sin(t/3300)*1.8,floatR=Math.sin(t/5500)*.6
      gLife&&gLife.setAttribute("transform","translate(0 "+breathe.toFixed(2)+") rotate("+floatR.toFixed(3)+")")
      gPose&&gPose.setAttribute("transform","translate("+EYE.x.toFixed(1)+" "+(188+M.lift).toFixed(1)+") rotate("+(M.pose+floatR*.3).toFixed(2)+")")

      let blinkK=0
      if(blinkStart>0){const bt=(t-blinkStart)/blinkDur;if(bt>=1)blinkStart=-1;else blinkK=bt<.5?easeInOut(bt*2):easeInOut((1-bt)*2)}
      if(t>nextBlink&&blinkStart<0){blinkStart=now();blinkDur=180;nextBlink=t+rand(3200,6500)}
      setLids(blinkK)
      brow&&brow.setAttribute("d","M-15 "+(-19+M.browLift*.2).toFixed(2)+" Q0 "+(-25+M.browLift).toFixed(2)+" 15 "+(-19+M.browLift*.2).toFixed(2))
      halo&&halo.setAttribute("opacity",(.42+.1*Math.sin(t/3300)).toFixed(3))

      /* beam : sweep signature une fois au load, puis 0..1 selon humeur (scan) */
      const introT=introProg();let sweep=0,sweepOp=0
      if(introT<1&&!introDone){if(introT>.32){const s=clamp((introT-.32)/.68,0,1);sweep=-14+26*easeInOut(s);sweepOp=Math.sin(s*Math.PI)*.9}}
      else introDone=true
      let ang=Math.atan2(cy-EYE.y,cx-EYE.x)*180/Math.PI-90;ang=clamp(ang,-26,26);if(!introDone)ang=sweep
      beamG&&beamG.setAttribute("transform","translate("+EYE.x+" "+EYE.y+") rotate("+ang.toFixed(2)+")")
      const bOp=introDone?M.beam*.8:Math.max(sweepOp,M.beam*.8)
      beam&&beam.setAttribute("opacity",bOp.toFixed(3))
      const hitX=EYE.x+Math.tan(clamp(ang,-26,26)*Math.PI/180)*(348-EYE.y)
      scanRing&&scanRing.setAttribute("cx",clamp(hitX,40,760));scanRing&&scanRing.setAttribute("opacity",(bOp*.6).toFixed(3))
      ant&&ant.setAttribute("opacity",M.beam>.4?(0.8+0.2*Math.abs(Math.sin(t/1700))).toFixed(2):"1")

      /* radeau : approche/grossit UNIQUEMENT en alerte (incident = data, non bloquant) */
      raftK=lerp(raftK,curMood==="alert"?1:0,.015)
      raft&&raft.setAttribute("transform","translate("+(566-raftK*70).toFixed(1)+" "+(400+raftK*20).toFixed(1)+") scale("+(1+raftK*.32).toFixed(3)+")")

      /* parallaxe légère (input only) — sinon TABLEAU au repos */
      if(pointerActive){
        const ndx=cx-400,ndy=cy-300
        pMid&&pMid.setAttribute("transform","translate("+clamp(-ndx*.012,-6,6).toFixed(2)+" "+clamp(-ndy*.010,-4,4).toFixed(2)+")")
        pFront&&pFront.setAttribute("transform","translate("+clamp(-ndx*.028,-9,9).toFixed(2)+" "+clamp(-ndy*.018,-6,6).toFixed(2)+")")
      }
      raf=requestAnimationFrame(tick)
    }
    const onMove=e=>{const p=toVB(e.clientX,e.clientY);tx=p.x;ty=p.y;pointerActive=true;lastInput=now();wake()}
    const onVis=()=>{paused=document.hidden;if(!paused&&!raf)raf=requestAnimationFrame(tick)}
    window.addEventListener("pointermove",onMove,{passive:true})
    document.addEventListener("visibilitychange",onVis)
    raf=requestAnimationFrame(tick)
    return()=>{window.removeEventListener("pointermove",onMove);document.removeEventListener("visibilitychange",onVis);if(raf)cancelAnimationFrame(raf)}
  },[reduce]) // eslint-disable-line

  /* date locale — jamais un timestamp figé */
  const todayStr=(()=>{try{const loc=lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR";return new Date().toLocaleDateString(loc,{weekday:"short",day:"numeric",month:"short"})}catch(_){return""}})()
  const freshTxt=(ageH==null)?"—":(ageH>12?L.checking:L.fresh(Math.round(ageH)))

  const onCta=()=>{
    emit("sg_brief_cta",{lang,status:st})
    if(onPremium){onPremium("brief_morning",{beach:D.beach,status:st});return}
    setCtaDone(true);setTimeout(()=>setCtaDone(false),1700)
  }
  const onRel=e=>{e.preventDefault();emit("sg_brief_reliability",{lang});onReliability&&onReliability()}
  const cycleLang=()=>{/* affichage courant seulement — la langue app pilote le vrai i18n */}

  /* ferme sur tap d'une zone de FOND (jamais une carte/CTA/chrome) */
  const onBackdrop=e=>{
    const el=e.target;if(!el||!el.classList)return
    if(el.closest&&(el.closest(".bm-brief")||el.closest(".bm-top")))return
    if(el===rootRef.current||el.classList.contains("bm-stage")||el.classList.contains("bm-scrim"))onClose&&onClose()
  }

  const node=(
    <div ref={rootRef} className="sg-onink-scope bm-root" data-sg-live="1"
      role="dialog" aria-modal="true"
      aria-label={lang==="es"?"El parte de la mañana":lang==="en"?"The morning brief":"Le brief du matin"}
      onTouchStart={sw.onTouchStart} onTouchMove={sw.onTouchMove} onTouchEnd={sw.onTouchEnd}
      onClick={onBackdrop}
      style={{"--verdict":verdict}}>
      <style>{BM_CSS}</style>

      <div className="bm-stage">
        <svg ref={svgRef} className="bm-scene" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          aria-label="Le Veilleur veille la mer au lever du jour et prépare le brief du matin">
          <defs>
            <linearGradient id="bmSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0B2230"/><stop offset=".42" stopColor="#155A5A"/>
              <stop offset=".74" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/>
            </linearGradient>
            <linearGradient id="bmWarm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a2a18" stopOpacity="0"/>
              <stop offset=".6" stopColor="#C97E3A" stopOpacity=".22"/>
              <stop offset="1" stopColor="#F2B05E" stopOpacity=".46"/>
            </linearGradient>
            <linearGradient id="bmSea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1A5852"/><stop offset=".55" stopColor="#0f3b34"/><stop offset="1" stopColor="#08251F"/>
            </linearGradient>
            <radialGradient id="bmSunG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFF6E0"/><stop offset=".48" stopColor="#FFD884"/><stop offset="1" stopColor="#F2B05E" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="bmBeamGrad" cx="50%" cy="0%" r="100%">
              <stop offset="0" stopColor="#FFD884" stopOpacity=".5"/><stop offset=".7" stopColor="#FFD884" stopOpacity=".12"/><stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="bmLens" cx="38%" cy="32%" r="72%">
              <stop offset="0" stopColor="#CFF4FF"/><stop offset=".34" stopColor="#16b9c9"/><stop offset="1" stopColor="#052b2b"/>
            </radialGradient>
            <radialGradient id="bmIrisG" cx="42%" cy="38%" r="62%"><stop offset="0" stopColor="#0a3a39"/><stop offset="1" stopColor="#03100f"/></radialGradient>
            <linearGradient id="bmPanel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1b4763"/><stop offset="1" stopColor="#0B2230"/></linearGradient>
            <linearGradient id="bmBodyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3c38"/><stop offset=".55" stopColor="#102622"/><stop offset="1" stopColor="#0A1714"/></linearGradient>
            <radialGradient id="bmHaloG" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="var(--moodHalo)" stopOpacity=".5"/><stop offset=".5" stopColor="var(--moodHalo)" stopOpacity=".16"/><stop offset="1" stopColor="var(--moodHalo)" stopOpacity="0"/>
            </radialGradient>
            <filter id="bmSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
          </defs>

          {/* PLAN ARRIÈRE */}
          <g>
            <rect x="-40" y="-40" width="880" height="380" fill="url(#bmSky)"/>
            <rect x="-40" y="-40" width="880" height="380" fill="url(#bmWarm)"/>
            <circle className="bm-sunGlow" cx="612" cy="196" r="120" fill="url(#bmSunG)"/>
            <circle cx="612" cy="196" r="42" fill="#FFF7E2"/>
            <g className="bm-cloud" opacity=".38"><ellipse cx="200" cy="112" rx="122" ry="10" fill="#10333E"/><ellipse cx="264" cy="124" rx="66" ry="6" fill="#10333E" opacity=".7"/></g>
            <path d="M700 126 q7 -6 14 0 q7 -6 14 0" fill="none" stroke="#0B2230" strokeWidth="2.2" strokeLinecap="round" opacity=".5"/>
          </g>

          {/* PLAN MÉDIAN */}
          <g ref={pMidRef}>
            <path d="M40 318 q70 -32 150 -28 q60 3 96 28 Z" fill="#0a2a2c" opacity=".5"/>
            <path d="M560 320 q56 -20 120 -18 q48 2 84 18 Z" fill="#0a2a2c" opacity=".36"/>
            <rect x="-40" y="316" width="880" height="320" fill="url(#bmSea)"/>
            <g opacity=".9">
              <ellipse cx="612" cy="340" rx="76" ry="6" fill="#FFD884" opacity=".44"/>
              <ellipse cx="600" cy="356" rx="56" ry="5" fill="#FFD884" opacity=".38"/>
              <ellipse cx="585" cy="374" rx="42" ry="4.5" fill="#FFD884" opacity=".31"/>
              <ellipse cx="565" cy="394" rx="30" ry="4" fill="#FFD884" opacity=".24"/>
            </g>
            <g stroke="#0c302b" strokeWidth="2" strokeLinecap="round" opacity=".45">
              <line x1="80" y1="380" x2="170" y2="380"/><line x1="240" y1="418" x2="330" y2="418"/><line x1="430" y1="452" x2="540" y2="452"/>
            </g>
          </g>

          {/* PLAN AVANT + Le Veilleur */}
          <g ref={pFrontRef}>
            <g ref={beamGRef}><polygon ref={beamRef} points="0,0 -66,190 66,190" fill="url(#bmBeamGrad)" opacity="0"/></g>
            <ellipse ref={scanRingRef} cx="300" cy="348" rx="38" ry="7" fill="none" stroke="#FFD884" strokeWidth="2" opacity="0"/>

            {/* radeau de sargasses (approche/grossit en alerte — l'incident vient de la data) */}
            <g ref={raftRef} transform="translate(566 400)" opacity=".92">
              <ellipse cx="0" cy="0" rx="40" ry="9" fill="#3a4a1e"/><ellipse cx="-19" cy="-4" rx="16" ry="6" fill="#4d6326"/>
              <ellipse cx="15" cy="3" rx="14" ry="5" fill="#2f3d18"/><ellipse cx="-2" cy="5" rx="21" ry="5" fill="#56702c"/>
            </g>

            <circle ref={haloRef} cx="300" cy="188" r="112" fill="url(#bmHaloG)" filter="url(#bmSoft)" opacity=".5"/>

            <g ref={gPoseRef} transform="translate(400 188)">
              <g ref={gLifeRef}>
                <g transform="scale(1.34)">
                  <g>
                    <rect x="-86" y="-8" width="56" height="30" rx="3" fill="url(#bmPanel)" transform="rotate(-7 -58 7)"/>
                    <rect x="30" y="-8" width="56" height="30" rx="3" fill="url(#bmPanel)" transform="rotate(7 58 7)"/>
                    <g stroke="#2f7390" strokeWidth="1" opacity=".6">
                      <line x1="-72" y1="-6" x2="-72" y2="24"/><line x1="-55" y1="-6" x2="-55" y2="24"/><line x1="-40" y1="-6" x2="-40" y2="24"/>
                      <line x1="44" y1="-6" x2="44" y2="24"/><line x1="61" y1="-6" x2="61" y2="24"/><line x1="76" y1="-6" x2="76" y2="24"/>
                    </g>
                  </g>
                  <rect x="-32" y="2" width="64" height="6" rx="3" fill="#0e2622"/>
                  <path d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z"
                    fill="url(#bmBodyG)" stroke="#FFD884" strokeWidth="1.3" strokeOpacity=".5"/>
                  <path d="M26 -16 C33 -10 33 22 22 32" fill="none" stroke="#FFD884" strokeWidth="2.4" strokeOpacity=".55" strokeLinecap="round"/>
                  <circle cx="0" cy="4" r="22" fill="url(#bmLens)"/>
                  <circle ref={irisTintRef} cx="0" cy="4" r="22" fill="var(--mood)" opacity=".42"/>
                  <circle cx="0" cy="4" r="22" fill="none" stroke="#E8A800" strokeWidth="3"/>
                  <circle cx="0" cy="4" r="16.5" fill="none" stroke="#E8A800" strokeWidth="1.1" strokeOpacity=".5"/>
                  <g ref={gIrisRef} transform="translate(0 0)">
                    <circle ref={irisRef} cx="0" cy="0" r="8" fill="url(#bmIrisG)"/>
                    <circle cx="0" cy="0" r="8" fill="var(--mood)" opacity=".55"/>
                    <circle ref={pupilRef} cx="0" cy="0" r="3.4" fill="#02100f"/>
                    <circle cx="-3" cy="-3.4" r="2.8" fill="#fff7e2"/>
                    <circle ref={catchBRef} cx="3.4" cy="2.6" r="1.3" fill="#dff6ff" opacity=".85"/>
                  </g>
                  <path ref={lidTopRef} d="M-22 4 Q0 -20 22 4 L22 -20 L-22 -20 Z" fill="url(#bmBodyG)"/>
                  <path ref={lidBotRef} d="M-22 4 Q0 28 22 4 L22 28 L-22 28 Z" fill="url(#bmBodyG)"/>
                  <circle cx="0" cy="4" r="22.2" fill="none" stroke="url(#bmBodyG)" strokeWidth="6"/>
                  <circle cx="0" cy="4" r="22" fill="none" stroke="#E8A800" strokeWidth="3"/>
                  <path ref={browRef} d="M-15 -19 Q0 -25 15 -19" fill="none" stroke="#0a1f1c" strokeWidth="3.4" strokeLinecap="round" opacity=".9"/>
                  <line x1="0" y1="-30" x2="0" y2="-46" stroke="#0e2622" strokeWidth="3"/>
                  <circle ref={antRef} cx="0" cy="-49" r="4.6" fill="var(--moodDot)"/>
                </g>
              </g>
            </g>
          </g>
        </svg>

        <div className="bm-scrim"></div>

        <div className="bm-top">
          <span className="bm-live"><i></i> <span>{L.live}</span></span>
          <span className="bm-wm">Sargasses</span>
          <button ref={closeRef} className="bm-x bm-x" onClick={()=>onClose&&onClose()} aria-label={L.close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>
          </button>
        </div>

        {/* LA CARTE BRIEF */}
        <div className="bm-briefwrap">
          <section className="bm-brief" aria-live="polite">
            <div className="bm-eyebrow"><span>{L.eb}</span><span className="bm-datel">{(D.region||"—")+" · "+todayStr}</span></div>
            <h1 className="bm-btitle">{(D.beach||"—").toUpperCase()}</h1>

            <div className="bm-verdrow">
              <span className={"bm-vchip"+(st==="moderate"?" bm-amberc":"")} style={{background:verdict}}>
                <VerdictForm status={st}/>
                <span style={{color:st==="moderate"?"#0D0D0D":"#fff"}}>{L.verd[st]||"—"}</span>
              </span>
              <span className="bm-vscore"><b>{D.score==null?"—":Math.round(D.score)}</b><span>/100</span></span>
            </div>

            <div className="bm-rows">
              <div className="bm-row">
                <span className="bm-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg></span>
                <div className="bm-tx"><div className="bm-k">{L.today}</div><div className="bm-v">{L.say[st]||"—"}</div></div>
              </div>
              <div className="bm-row">
                <span className="bm-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/><path d="M9 14l2 2 4-4"/></svg></span>
                <div className="bm-tx"><div className="bm-k">{L.best}</div><div className="bm-v"><em>{pick(D.bestDay,lang)||"—"}</em></div></div>
              </div>
              <div className="bm-row">
                <span className="bm-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-1.6.8-3.4 1.8-5"/><path d="M9 15a3 3 0 0 0 5 1.7"/></svg></span>
                <div className="bm-tx"><div className="bm-k">{L.h2s}</div><div className="bm-v">{pick(D.h2s,lang)||"—"}</div><div className="bm-hedge">{L.hedge}</div></div>
              </div>
              {showPlanB&&(
                <div className="bm-row" id="bm-rowPlanb">
                  <span className="bm-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h13M12 5l7 7-7 7"/><circle cx="4" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg></span>
                  <div className="bm-tx"><div className="bm-k">{L.planb}</div><div className="bm-v"><em>{pick(D.planB,lang)}</em></div></div>
                </div>
              )}
            </div>

            <div className="bm-footline">
              <span className="bm-fresh"><i></i> <span>{freshTxt}</span></span>
              <span className="bm-rel">{L.rel}<a href="#" onClick={onRel}>{L.relL}</a></span>
            </div>

            <button className="bm-cta bm-cta" onClick={onCta}>{ctaDone?("✓ "+L.ctaDone):L.cta}</button>
          </section>
        </div>
      </div>
    </div>
  )
  if(typeof document==="undefined")return null
  return createPortal(node,document.body)
}

/* ============================================================
   CSS scopé — préfixé .bm-root. Racine .sg-onink-scope → le skin
   theme-comic forcerait les <button> ; on les re-spécifie en
   .bm-root <tag>.bm-x.bm-x / .bm-cta.bm-cta (0,3,x) + !important
   pour battre .theme-comic .sg-onink-scope button{…!important} (0,2,1).
   Palette paper/ink en DUR (jamais var(--sg-*) — tokens comic inertes).
   ============================================================ */
const BM_CSS=`
.bm-root{position:fixed;inset:0;z-index:4200;background:#06140f;color:#fff;
  font-family:"Bricolage Grotesque",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;overscroll-behavior:none;--verdict:#22C55E;--mood:#1FB6A6;--moodHalo:#1FB6A6;--moodDot:#22C55E}
.bm-stage{position:absolute;inset:0;overflow:hidden}
.bm-scene{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
@keyframes bmcloud{from{transform:translateX(0)}to{transform:translateX(54px)}}
@keyframes bmsun{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.8;transform:scale(1.045)}}
.bm-cloud{animation:bmcloud 138s linear infinite alternate;transform-box:fill-box}
.bm-sunGlow{animation:bmsun 11s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.bm-scrim{position:absolute;left:0;right:0;bottom:0;height:64%;pointer-events:none;
  background:linear-gradient(to top,rgba(4,16,11,.72) 0%,rgba(4,16,11,.30) 46%,rgba(4,16,11,0) 100%)}
.bm-top{position:absolute;top:0;left:0;right:0;padding:max(14px,env(safe-area-inset-top)) 16px 14px;display:flex;align-items:center;gap:10px;pointer-events:none}
.bm-live{pointer-events:auto;display:inline-flex;align-items:center;gap:7px;background:rgba(8,20,15,.42);border:1px solid rgba(255,216,132,.28);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);padding:6px 11px;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:.06em}
.bm-live i{width:8px;height:8px;border-radius:50%;background:var(--moodDot)}
.bm-wm{font-family:"Anton","Haettenschweiler","Arial Narrow Bold","Impact",system-ui,sans-serif;font-size:15px;letter-spacing:.04em;opacity:.92;text-transform:uppercase}
.bm-root button.bm-x.bm-x{pointer-events:auto;margin-left:auto;cursor:pointer;display:grid;place-items:center;
  width:44px;height:44px;min-height:44px;border-radius:100px;color:#fff!important;
  border:1px solid rgba(255,216,132,.28)!important;background:rgba(8,20,15,.5)!important;box-shadow:none!important;
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);padding:0!important}
.bm-briefwrap{position:absolute;left:0;right:0;bottom:0;padding:0 14px max(16px,env(safe-area-inset-bottom)) 14px;display:flex;justify-content:center;pointer-events:none}
.bm-brief{pointer-events:auto;width:100%;max-width:440px;background:#FDFCF7;color:#0D0D0D;
  border:2.5px solid #0D0D0D;border-radius:18px;box-shadow:4px 4px 0 #0D0D0D;padding:15px 16px 16px;position:relative}
.bm-brief::before{content:"";position:absolute;left:-2.5px;right:-2.5px;top:-2.5px;height:6px;border-radius:18px 18px 0 0;background:var(--verdict)}
.bm-eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.14em;color:#5A5A5A;text-transform:uppercase;margin:4px 0 2px}
.bm-datel{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#5A5A5A;letter-spacing:.02em}
.bm-btitle{font-family:"Anton","Haettenschweiler","Arial Narrow Bold","Impact",system-ui,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:-.01em;line-height:.94;font-size:clamp(26px,7.6vw,36px);margin:2px 0 0;color:#0D0D0D}
.bm-verdrow{display:flex;align-items:center;gap:10px;margin:11px 0 6px}
.bm-vchip{display:inline-flex;align-items:center;gap:7px;color:#fff;border:2px solid #0D0D0D;border-radius:100px;padding:6px 12px;font-weight:800;font-size:14px;box-shadow:2px 2px 0 #0D0D0D}
.bm-vchip svg{display:block}
.bm-vscore{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;font-size:15px;margin-left:auto;color:#0D0D0D}
.bm-vscore b{font-size:20px}
.bm-vscore span{color:#5A5A5A;font-size:12px}
.bm-rows{display:flex;flex-direction:column;gap:2px;margin-top:8px;border-top:1.5px dashed rgba(13,13,13,.18);padding-top:9px}
.bm-row{display:flex;align-items:flex-start;gap:10px;padding:5px 0}
.bm-row .bm-ic{flex:0 0 26px;height:26px;display:grid;place-items:center;color:#0D0D0D}
.bm-row .bm-tx{flex:1;min-width:0}
.bm-row .bm-k{font-size:11px;font-weight:800;letter-spacing:.06em;color:#5A5A5A;text-transform:uppercase}
.bm-row .bm-v{font-size:15px;line-height:1.35;font-weight:600;color:#0D0D0D}
.bm-row .bm-v em{font-style:normal;font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}
.bm-hedge{font-size:11.5px;color:#5A5A5A;line-height:1.3;margin-top:1px}
#bm-rowPlanb .bm-v em{color:#009E8E}
.bm-footline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:11px;padding-top:9px;border-top:1.5px dashed rgba(13,13,13,.18)}
.bm-fresh{display:inline-flex;align-items:center;gap:6px;font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#5A5A5A}
.bm-fresh i{width:7px;height:7px;border-radius:50%;background:#009E8E}
.bm-rel{font-size:11px;color:#5A5A5A;line-height:1.3;flex:1;min-width:150px}
.bm-rel a{color:#009E8E;font-weight:700;text-decoration:underline;text-underline-offset:2px}
.bm-root a.bm-rel,.bm-rel a{cursor:pointer}
.bm-root button.bm-cta.bm-cta{display:block;width:100%;margin-top:12px;border:2.5px solid #0D0D0D!important;cursor:pointer;
  font-family:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;font-weight:800;font-size:16px;color:#1a1300!important;min-height:48px;padding:12px 18px;border-radius:100px;
  background:linear-gradient(158deg,#FFE47A 0%,#FFC72C 42%,#E89400 100%)!important;box-shadow:4px 4px 0 #0D0D0D!important;
  transition:transform .14s cubic-bezier(.175,.885,.32,1.275),box-shadow .2s ease}
.bm-root button.bm-cta.bm-cta:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #0D0D0D!important}
@media (min-width:740px){.bm-brief{max-width:460px}}
@keyframes bmCardIn{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes bmTopIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
.bm-brief{animation:bmCardIn 1.05s cubic-bezier(.22,1,.36,1) .35s both}
.bm-top{animation:bmTopIn 1s ease .15s both}
@media (prefers-reduced-motion:reduce){
  .bm-scene *{animation:none!important}
  .bm-cloud,.bm-sunGlow{animation:none!important}
  .bm-brief,.bm-top{animation:none!important;opacity:1!important;transform:none!important}
  .bm-root button.bm-cta.bm-cta{transition:none!important}
}
`

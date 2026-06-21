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
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { COAST_ZONES } from "../scripts/lib/coast-zones.cjs"


const STATUS_C = { clean: "#27c46b", moderate: "#ffd23f", avoid: "#e8322a" }
const INK = "#0d0b14"
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

// Couleur antenne Veilleur selon proportion propres
function vantColor(beachList, day){
  const n=beachList.length; if(!n) return "#27c46b"
  const c=beachList.filter(b=>(b.days[day]||"clean")==="clean").length
  return c/n>=.6?"#27c46b":c/n>=.35?"#ffd23f":"#e8322a"
}

// Ellipses de relief (Martinique uniquement)
const MQ_RELIEF = [[14.79,-61.10,24],[14.74,-61.10,18],[14.70,-61.07,20],[14.52,-61.06,15],[14.47,-60.92,12]]

export default function WorldMapView({
  beaches, island, updatedAt, lang, onOpenBeach, onPremium, onClose, rootMode, track, initialZone, warm,
}){
  const wrapRef    = useRef(null)
  const worldRef   = useRef(null)  // <g id="world"> — transform mis à jour en RAF
  const camRef     = useRef({ tx:0, ty:0, k:1 })
  const rafRef     = useRef(0)
  const animRef    = useRef(0)
  const ptrsRef    = useRef({})
  const pinchRef   = useRef(null)
  const lastTapRef = useRef(0)
  const tagTimerRef= useRef(null)
  const reduceRef  = useRef(false)
  const labelLayerRef = useRef(null)

  const [outline, setOutline]   = useState(null)
  const [loadErr, setLoadErr]   = useState(false)
  const [day,     setDay]       = useState(0)
  const [selected, setSelected] = useState(null)  // beach object enrichi
  const [tagPos,  setTagPos]    = useState(null)  // {x,y} screen pixels

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

  // toVB(lat,lng) → [vx,vy] dans l'espace viewBox 800×600
  const toVB = useMemo(()=>{
    if(!outline) return null
    const{proj,bbox}=outline
    return(lat,lng)=>[
      proj.offX+(lng-bbox.minLng)*proj.kx*proj.sc,
      proj.offY+(bbox.maxLat-lat)*proj.sc,
    ]
  },[outline])

  // Liste des plages enrichies : position viewBox + prévisions mock J0-J5
  const beachList = useMemo(()=>{
    if(!toVB) return []
    const isEUR = island==="mq"||island==="gp"
    return(beaches||[])
      .filter(b=>b&&b.lat!=null&&b.lng!=null&&(isEUR?b.island===island:true))
      .map(b=>{
        const[vx,vy]=toVB(b.lat,b.lng)
        const seed=(b.id||b.name||"x").split("").reduce((a,c)=>a+c.charCodeAt(0),0)
        const days=[b.status||"clean"]
        for(let d=1;d<6;d++){
          const r=((seed*9301+d*49297)%233280)/233280
          days.push(r<.62?"clean":r<.86?"moderate":"avoid")
        }
        return{...b,vx,vy,days}
      })
  },[beaches,island,toVB])

  // IDs des plages affichant un label
  const labeledIds = useMemo(()=>{
    const ids=new Set()
    if(!beachList.length) return ids
    if(island==="mq"){
      beachList.forEach(b=>{ if(MQ_NAMED.some(n=>(b.name||"").includes(n))) ids.add(b.id) })
    } else {
      const step=Math.max(1,Math.ceil(beachList.length/8))
      beachList.forEach((b,i)=>{ if(i%step===0) ids.add(b.id) })
    }
    return ids
  },[beachList,island])

  // Ellipses de relief en coordonnées viewBox (MQ only)
  const reliefEls = useMemo(()=>{
    if(!toVB||island!=="mq") return []
    return MQ_RELIEF.map(([lat,lng,rx])=>{ const[vx,vy]=toVB(lat,lng); return{vx,vy,rx} })
  },[toVB,island])

  // ─── CAMÉRA ────────────────────────────────────────────────────────────────
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
        l:L-w/2-2, r:L+w/2+2, t:T-h-2, b:T+2})
    })
    boxes.sort((a,b)=> a.sel!==b.sel ? (a.sel?-1:1) : (a.rank!==b.rank ? a.rank-b.rank : a.vy-b.vy))
    const kept=[]
    boxes.forEach(bx=>{
      const hit=kept.some(k=> !(bx.r<k.l||bx.l>k.r||bx.b<k.t||bx.t>k.b))
      if(hit){ bx.el.style.visibility='hidden' }
      else { bx.el.style.visibility='visible'; kept.push(bx) }
    })
  },[])
  const scheduleDeclutter=useCallback(()=>{
    if(declutterRef.current) clearTimeout(declutterRef.current)
    declutterRef.current=setTimeout(()=>{ declutterRef.current=0; declutter() },90)
  },[declutter])

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
      moved=false
      ptrsRef.current[e.pointerId]={x:e.clientX,y:e.clientY}
      if(Object.keys(ptrsRef.current).length===2){
        const pts=Object.values(ptrsRef.current)
        pinchRef.current={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),k0:camRef.current.k}
        try{ e.currentTarget.setPointerCapture(e.pointerId) }catch(_){}
      }
    }
    const onMove=e=>{
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
      const wasMoved=moved
      delete ptrsRef.current[e.pointerId]
      if(Object.keys(ptrsRef.current).length<2) pinchRef.current=null
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
      const f=e.deltaY<0?1.12:1/1.12
      const s=toSvg(e.clientX,e.clientY), c=camRef.current
      const wx=(s[0]-c.tx)/c.k, wy=(s[1]-c.ty)/c.k
      c.k=Math.max(K_MIN,Math.min(K_MAX,c.k*f))
      c.tx=s[0]-wx*c.k; c.ty=s[1]-wy*c.k; clampCam(); schedule()
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

  const openBeach=useCallback(()=>{
    if(!selected) return
    onOpenBeach&&onOpenBeach(selected)
  },[selected,onOpenBeach])

  const nearMe=useCallback(()=>{
    const c=beachList.find(b=>(b.days[day]||"clean")==="clean")
    if(c) selectBeach(c)
    try{ track&&track("sg_map_near_me",{island}) }catch(_){}
  },[beachList,day,selectBeach,track,island])

  // ─── RENDER ────────────────────────────────────────────────────────────────
  if(loadErr) return null  // laisse l'ArchipelView control se montrer (ErrBound parent)

  const noAnim   = reduceRef.current
  const regionName= outline?.name||(island==="mq"?"Martinique":island==="gp"?"Guadeloupe":island)
  const cleanCnt  = beachList.filter(b=>(b.days[day]||"clean")==="clean").length
  const dayLbl    = day===0?_t(lang,"aujourd'hui","today","hoy"):_t(lang,`dans ${day}j`,`in ${day}d`,`en ${day}d`)
  const vant      = vantColor(beachList,day)

  return(
    <div ref={wrapRef} style={{
      position:"fixed",inset:0,zIndex:1020,overflow:"hidden",touchAction:"none",userSelect:"none",
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
        // Golden-hour SEA : soleil chaud ambre haut-droite → horizon doré → mer bleu-teal
        // profonde bas-gauche. Lecture « eau » nette (bleu/teal) + chaleur d'heure dorée.
        ? "radial-gradient(108% 78% at 82% -6%, rgba(255,206,120,.62), rgba(240,158,70,.30) 30%, rgba(214,118,52,.06) 52%, transparent 66%), radial-gradient(130% 110% at 4% 118%, rgba(6,28,46,.78), rgba(8,40,58,.32) 40%, transparent 60%), linear-gradient(162deg,#3aa6c4 0%,#2487a9 22%,#1c6f93 44%,#15577d 66%,#103f63 84%,#0b2e4d 100%)"
        : "radial-gradient(130% 70% at 76% 4%, rgba(255,224,160,.16), transparent 48%), linear-gradient(162deg,#3aa6c4 0%,#1c6f93 40%,#103f63 72%,#0b2e4d 100%)",
    }}>
      <style>{`
        @keyframes wmSun{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        @keyframes wmHalo{0%,100%{opacity:.45}50%{opacity:.8}}
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

      {/* Dégradé bas (veil — profondeur de mer froide bas-gauche) */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
        background:"linear-gradient(200deg,rgba(11,46,77,0) 48%,rgba(7,26,46,.42) 100%)"}}/>

      {/* ── SVG monde ──────────────────────────────────────────────────────── */}
      <svg
        style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",zIndex:1,touchAction:"none"}}
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={_t(lang,`Carte ${regionName} — déplace, zoome, touche une plage`,`${regionName} map — pan, zoom, tap a beach`,`Mapa ${regionName} — desplaza, zoom, toca playa`)}
        onClick={()=>{ setSelected(null); setTagPos(null) }}
      >
        <defs>
          <radialGradient id="wmPhalo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFE6A8" stopOpacity=".55"/>
            <stop offset="1" stopColor="#FFE6A8" stopOpacity="0"/>
          </radialGradient>
          {/* Terre : vert tropical lumineux haut-droite (soleil) → vert profond + sable côtier */}
          <linearGradient id="wmLand" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6fe39a"/><stop offset=".26" stopColor="#3fd07e"/>
            <stop offset=".58" stopColor="#27c46b"/><stop offset="1" stopColor="#1c8f4e"/>
          </linearGradient>
          {/* Overlay chaud d'heure dorée sur la terre (côté soleil) */}
          <linearGradient id="wmWarm" x1="1" y1="0" x2=".2" y2="1">
            <stop offset="0" stopColor="#FFD27A" stopOpacity=".55"/>
            <stop offset=".4" stopColor="#F0A23A" stopOpacity=".14"/>
            <stop offset="1" stopColor="#C97E3A" stopOpacity="0"/>
          </linearGradient>
          {/* Liseré de sable / plage clair en bordure d'île */}
          <linearGradient id="wmSand" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFEFC4"/><stop offset="1" stopColor="#F4D38C"/>
          </linearGradient>
          {/* Pin teardrop dégradés par statut */}
          <linearGradient id="wmPinClean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5BE38A"/><stop offset="1" stopColor="#1FA34D"/>
          </linearGradient>
          <linearGradient id="wmPinMod" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFC53D"/><stop offset="1" stopColor="#D88A00"/>
          </linearGradient>
          <linearGradient id="wmPinAvoid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FF7A4D"/><stop offset="1" stopColor="#C93A18"/>
          </linearGradient>
          <linearGradient id="wmSailR" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF6A3D"/><stop offset="1" stopColor="#D8431F"/>
          </linearGradient>
          <linearGradient id="wmSailY" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFD45A"/><stop offset="1" stopColor="#F0A81E"/>
          </linearGradient>
          <filter id="wmRim"  x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
          <filter id="wmSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
          <filter id="wmShlw" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="12"/></filter>
          <filter id="wmShl2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>
        </defs>

        {/* Monde — transform caméra appliqué ici via ref */}
        <g ref={worldRef}>
          {/* Vagues océan décoratives (traits d'écume comic) */}
          <g stroke="#bfeee8" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".14">
            <path d="M40 250 q60 -16 120 -4"/><path d="M70 340 q70 -18 140 -2"/>
            <path d="M30 430 q66 -16 130 -2"/>
            <path d="M520 120 q60 -14 120 0"/><path d="M600 470 q70 -16 130 -2"/>
            <path d="M560 540 q66 -16 130 -2"/>
          </g>

          {/* Contour côtier — couches mer → île ink comic */}
          {outline&&<>
            {/* eau peu profonde lointaine (lagon turquoise large) */}
            <path d={outline.path} fill="none" stroke="#46c8bd" strokeWidth="30" strokeOpacity=".42" filter="url(#wmShlw)"/>
            {/* eau peu profonde proche (turquoise clair lagon) */}
            <path d={outline.path} fill="none" stroke="#a8f0e0" strokeWidth="12" strokeOpacity=".58" filter="url(#wmShl2)"/>
            {/* ombre portée profonde de l'île */}
            <path d={outline.path} fill="#062033" opacity=".5" filter="url(#wmSoft)" transform="translate(7 13)"/>
            {/* halo rim doré (heure dorée léchant la côte) */}
            <path d={outline.path} fill="none" stroke="#FFE6A8" strokeWidth="7" strokeOpacity=".5" filter="url(#wmRim)"/>
            {/* liseré de sable (plage claire) sous l'encre */}
            <path d={outline.path} fill="url(#wmSand)" stroke="none"/>
            {/* île solide verte */}
            <path d={outline.path} fill="url(#wmLand)" stroke="none" transform="scale(.985)" style={{transformOrigin:"328px 300px"}}/>
            {/* overlay chaud (lumière dorée côté soleil) */}
            <path d={outline.path} fill="url(#wmWarm)" opacity=".9" transform="scale(.985)" style={{transformOrigin:"328px 300px"}}/>
            {/* CONTOUR ENCRE comic épais — fait POPPER l'île sur la mer */}
            <path d={outline.path} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round"/>
          </>}

          {/* Relief Martinique — collines comic (ombre verte + crête ensoleillée) */}
          {reliefEls.map(({vx,vy,rx},i)=>(
            <g key={i}>
              {/* versant ombre */}
              <ellipse cx={vx} cy={vy} rx={rx} ry={rx*0.66} fill="#2c5a26" opacity=".5"/>
              {/* crête éclairée par le soleil */}
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
              <path d="M-4 -52 L-4 -8 L-32 -8 Z" fill="#1EC8B0" opacity=".94"/>
            </g>
            <path d="M-46 4 Q0 24 46 4 Q40 14 32 16 L-32 16 Q-40 14 -46 4 Z" fill="#0f5d54"/>
            <path d="M-46 4 Q0 18 46 4" fill="none" stroke="#FFD884" strokeWidth="1.6" strokeOpacity=".6"/>
          </g>

          {/* Pins plages — marqueurs comic teardrop ink-outline */}
          {beachList.map(b=>{
            const st=b.days[day]||"clean"
            const isSel=selected?.id===b.id
            const fill=st==="clean"?"url(#wmPinClean)":st==="moderate"?"url(#wmPinMod)":"url(#wmPinAvoid)"
            const s=isSel?1.18:1
            return(
              <g key={b.id}
                transform={`translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`}
                style={{cursor:"pointer"}}
                onClick={e=>{ e.stopPropagation(); selectBeach(b) }}>
                {/* halo doux pour les propres / pulsation sélection */}
                {(!noAnim&&st==="clean")&&<circle r="13" cy="-9" fill="url(#wmPhalo)"
                  style={{animation:"wmHalo 3.6s ease-in-out infinite"}}/>}
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
            <rect x="2"   y="50" width="30" height="20" rx="3" fill="#27a9e3" transform="rotate(-8 17 60)"/>
            <rect x="88"  y="50" width="30" height="20" rx="3" fill="#27a9e3" transform="rotate(8 103 60)"/>
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
          const st=b.days[day]||"clean"
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
                font:"800 11px/1 'Comic Neue',system-ui,sans-serif",
                color:"#fff",
                textShadow:`1px 1px 0 ${INK},0 0 5px ${INK},0 0 9px rgba(13,11,20,.65)`,
              }}>{b.name}</div>
              <div style={{
                font:"800 9px/1 'Comic Neue',system-ui,sans-serif",
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
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:10}}>

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
            padding:"6px 12px 6px 10px",borderRadius:999,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,
          }}>
            <div style={{
              width:8,height:8,borderRadius:"50%",background:"#e8322a",border:`1.5px solid ${INK}`,
              animation:noAnim?"none":"wmPulse 2.4s ease-out infinite",
            }}/>
            <span style={{font:"800 11px/1 'Comic Neue',system-ui,sans-serif",letterSpacing:".06em",textTransform:"uppercase",color:INK}}>{_t(lang,"EN DIRECT","LIVE","EN VIVO")}</span>
            <span style={{font:"700 11px/1 'JetBrains Mono',monospace",color:"#1c8f4e",marginLeft:2}}>
              {updatedAt?_t(lang,`il y a ${fmtFresh(updatedAt)}`,`${fmtFresh(updatedAt)} ago`,`hace ${fmtFresh(updatedAt)}`):"···"}
            </span>
          </div>
          {/* Fermer (hors rootMode) */}
          {!rootMode&&<button onClick={onClose} style={{
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,
            background:"#fdf6e3",
            color:INK,font:"800 12px/1 'Comic Neue',system-ui,sans-serif",
            padding:"8px 12px",borderRadius:10,cursor:"pointer",pointerEvents:"auto",
          }}>✕</button>}
        </div>

        {/* H1 + jauge */}
        <div style={{
          position:"absolute",top:"calc(58px + env(safe-area-inset-top))",
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
                height:"100%",background:"linear-gradient(90deg,#27c46b,#ffd23f)",transition:"width .4s ease",
                width:beachList.length?Math.round(cleanCnt/beachList.length*100)+"%":"0%",
              }}/>
            </div>
            <span style={{font:"700 12.5px/1 'Comic Neue',system-ui,sans-serif",color:INK}}>
              <b style={{fontFamily:"'AntonLC','Anton',sans-serif",fontWeight:400,color:"#1c8f4e"}}>{cleanCnt}</b> {_t(lang,"plages propres","clean beaches","playas limpias")}
            </span>
          </div>
        </div>

        {/* Légende */}
        <div style={{
          position:"absolute",left:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          display:"flex",flexDirection:"column",gap:5,pointerEvents:"none",
        }}>
          {[["#27c46b",_t(lang,"Propre","Clean","Limpia")],
            ["#ffd23f",_t(lang,"Modéré","Moderate","Moderado")],
            ["#e8322a",_t(lang,"À éviter","Avoid","Evitar")]].map(([c,l])=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:7,
              font:"700 10.5px/1 'Comic Neue',system-ui,sans-serif",
              color:"#fff",textShadow:`0 1px 0 ${INK},0 0 4px ${INK}`}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c,border:`1.5px solid ${INK}`}}/>{l}
            </div>
          ))}
        </div>

        {/* Bouton Près de moi */}
        <button style={{
          position:"absolute",right:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          pointerEvents:"auto",display:"inline-flex",alignItems:"center",gap:7,
          background:"#fdf6e3",
          color:INK,border:`2.5px solid ${INK}`,font:"800 12.5px/1 'Comic Neue',system-ui,sans-serif",
          padding:"11px 14px",borderRadius:999,cursor:"pointer",
          boxShadow:`3px 3px 0 ${INK}`,
        }} onClick={nearMe}>
          📍 {_t(lang,"Près de moi","Near me","Cerca de mí")}
        </button>

        {/* Scrub jours (J0 libre · J1-5 → Premium) */}
        <div style={{
          position:"absolute",left:0,right:0,bottom:"calc(120px + env(safe-area-inset-bottom))",
          display:"flex",justifyContent:"center",pointerEvents:"none",
        }}>
          <div style={{
            pointerEvents:"auto",display:"flex",gap:4,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:999,padding:4,
          }}>
            {DAY_LBL.map((lbl,i)=>(
              <button key={i} style={{
                border:day===i?`2px solid ${INK}`:"2px solid transparent",position:"relative",
                background:day===i?"#ffd23f":"transparent",
                color:INK,
                font:"800 11px/1 'Comic Neue',system-ui,sans-serif",
                padding:"7px 10px",borderRadius:999,cursor:"pointer",
              }} onClick={()=>{
                if(i>=1){ try{track&&track("sg_map_scrub_locked",{day:i})}catch(_){}; onPremium&&onPremium("map_scrub_forecast"); return }
                setDay(i)
                try{track&&track("sg_map_scrub",{day:i,island})}catch(_){}
              }}>
                {ti(lang,lbl)}
                {i>=1&&<span style={{fontSize:8,position:"absolute",top:1,right:2}}>🔒</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Dock bas */}
        <div style={{
          position:"absolute",left:0,right:0,bottom:"calc(16px + env(safe-area-inset-bottom))",
          display:"flex",justifyContent:"center",pointerEvents:"none",
        }}>
          <div style={{
            pointerEvents:"auto",display:"flex",gap:3,
            background:"#fdf6e3",
            border:`2.5px solid ${INK}`,boxShadow:`3px 3px 0 ${INK}`,borderRadius:999,padding:5,
          }}>
            <button style={{
              display:"flex",alignItems:"center",gap:6,border:`2px solid ${INK}`,
              background:"#ffd23f",color:INK,
              font:"800 12px/1 'Comic Neue',system-ui,sans-serif",
              padding:"8px 14px",borderRadius:999,cursor:"default",
            }}>🗺️ {_t(lang,"Carte","Map","Mapa")}</button>
            {!rootMode&&<button onClick={onClose} style={{
              display:"flex",alignItems:"center",gap:6,border:"2px solid transparent",
              background:"transparent",color:INK,
              font:"800 12px/1 'Comic Neue',system-ui,sans-serif",
              padding:"8px 14px",borderRadius:999,cursor:"pointer",
            }}>✕ {_t(lang,"Fermer","Close","Cerrar")}</button>}
          </div>
        </div>

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
            <div style={{font:"800 10.5px/1 'Comic Neue',system-ui,sans-serif",letterSpacing:".04em",
              textTransform:"uppercase",marginTop:4,display:"flex",alignItems:"center",gap:5,color:INK}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:STATUS_C[selected.days[day]||"clean"],border:`1.5px solid ${INK}`}}/>
              <span>{ti(lang,STATUS_LBL[selected.days[day]||"clean"]||["—","—","—"])}</span>
            </div>
            {selected.commune&&<div style={{font:"700 10px/1 'Comic Neue',system-ui,sans-serif",color:"#6b6478",marginTop:4}}>{selected.commune}</div>}
          </div>
        )}

        {/* CTA Voir la plage */}
        {selected&&(
          <button onClick={openBeach} style={{
            position:"absolute",left:"50%",bottom:"calc(176px + env(safe-area-inset-bottom))",
            transform:"translateX(-50%)",pointerEvents:"auto",
            display:"inline-flex",alignItems:"center",gap:8,
            background:"linear-gradient(180deg,#FFE07A,#FFC72C)",
            color:INK,border:`2.5px solid ${INK}`,
            font:"800 13.5px/1 'Comic Neue',system-ui,sans-serif",
            padding:"13px 18px",borderRadius:999,
            boxShadow:`4px 4px 0 ${INK}`,cursor:"pointer",
            animation:"wmSlide .25s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            {_t(lang,"Voir la plage","Open beach","Ver la playa")} <span style={{fontWeight:800}}>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

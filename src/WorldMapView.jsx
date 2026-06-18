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


const STATUS_C = { clean: "#22C55E", moderate: "#E8A800", avoid: "#E8522A" }
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
  const n=beachList.length; if(!n) return "#22C55E"
  const c=beachList.filter(b=>(b.days[day]||"clean")==="clean").length
  return c/n>=.6?"#22C55E":c/n>=.35?"#E8A800":"#E8522A"
}

// Ellipses de relief (Martinique uniquement)
const MQ_RELIEF = [[14.79,-61.10,24],[14.74,-61.10,18],[14.70,-61.07,20],[14.52,-61.06,15],[14.47,-60.92,12]]

export default function WorldMapView({
  beaches, island, updatedAt, lang, onOpenBeach, onPremium, onClose, rootMode, track, initialZone,
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
    // Déclutter screen-space : empêche les labels de se chevaucher (noms + verdicts
    // empilés type « Anse Mitan/Anse Dufour » illisibles). Priorité : plage
    // sélectionnée > pire statut (avoid>moderate>clean) > nord→sud. Au zoom, les
    // positions s'écartent → les labels masqués réapparaissent (recalcul chaque RAF).
    // visibility (pas display) pour rester mesurable et réversible frame à frame.
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
      background:"radial-gradient(130% 70% at 76% 4%, rgba(255,224,160,.16), transparent 48%), linear-gradient(158deg,#1f6157 0%,#114440 44%,#072019 100%)",
    }}>
      <style>{`
        @keyframes wmSun{0%,100%{opacity:.9;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
        @keyframes wmHalo{0%,100%{opacity:.45}50%{opacity:.8}}
        @keyframes wmPulse{0%{box-shadow:0 0 0 0 rgba(232,82,42,.55)}70%{box-shadow:0 0 0 9px rgba(232,82,42,0)}100%{box-shadow:0 0 0 0 rgba(232,82,42,0)}}
        @keyframes wmSlide{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      `}</style>

      {/* Lumière soleil top-right */}
      {!noAnim&&<div style={{position:"absolute",top:"-16%",right:"-10%",width:"82%",height:"64%",
        pointerEvents:"none",zIndex:0,
        background:"radial-gradient(closest-side, rgba(255,243,214,.52), rgba(255,216,132,.22) 46%, transparent 72%)",
        animation:"wmSun 11s ease-in-out infinite"}}/>}

      {/* Dégradé bas (veil) */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
        background:"linear-gradient(180deg,rgba(7,18,15,0) 50%,rgba(7,18,15,.30) 100%)"}}/>

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
          <linearGradient id="wmLand" x1="0" y1="0" x2=".8" y2="1">
            <stop offset="0" stopColor="#37471f"/><stop offset=".22" stopColor="#2c3b1c"/>
            <stop offset=".62" stopColor="#1b2a18"/><stop offset="1" stopColor="#111b13"/>
          </linearGradient>
          <linearGradient id="wmWarm" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E8A23A" stopOpacity=".34"/>
            <stop offset=".42" stopColor="#C97E3A" stopOpacity="0"/>
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
          {/* Grille océan décorative */}
          <g stroke="#5FD3C9" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".05">
            <path d="M40 250 q60 -16 120 -4"/><path d="M70 340 q70 -18 140 -2"/>
            <path d="M520 120 q60 -14 120 0"/><path d="M600 470 q70 -16 130 -2"/>
          </g>

          {/* Contour côtier — toutes les couches du proto */}
          {outline&&<>
            {/* eau peu profonde lointaine */}
            <path d={outline.path} fill="none" stroke="#3fb9ad" strokeWidth="26" strokeOpacity=".32" filter="url(#wmShlw)"/>
            {/* eau peu profonde proche */}
            <path d={outline.path} fill="none" stroke="#9aead9" strokeWidth="10" strokeOpacity=".5"  filter="url(#wmShl2)"/>
            {/* ombre portée */}
            <path d={outline.path} fill="#03110d" opacity=".5" filter="url(#wmSoft)" transform="translate(6 11)"/>
            {/* rim doré */}
            <path d={outline.path} fill="none" stroke="#FFE6A8" strokeWidth="6" strokeOpacity=".55" filter="url(#wmRim)"/>
            {/* île solide */}
            <path d={outline.path} fill="url(#wmLand)" stroke="#FFE6A8" strokeWidth="1.5" strokeOpacity=".9"/>
            {/* overlay chaud */}
            <path d={outline.path} fill="url(#wmWarm)" opacity=".85"/>
          </>}

          {/* Relief Martinique */}
          {reliefEls.map(({vx,vy,rx},i)=>(
            <g key={i}>
              <ellipse cx={vx} cy={vy} rx={rx} ry={rx*0.66} fill="#0c1710" opacity=".42"/>
              <path d={`M${(vx-rx*.6).toFixed(1)} ${(vy-rx*.2).toFixed(1)} Q${vx.toFixed(1)} ${(vy-rx*.7).toFixed(1)} ${(vx+rx*.6).toFixed(1)} ${(vy-rx*.2).toFixed(1)}`}
                stroke="#46582c" strokeWidth="1.4" fill="none" opacity=".3"/>
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

          {/* Pins plages */}
          {beachList.map(b=>{
            const st=b.days[day]||"clean"
            const isSel=selected?.id===b.id
            return(
              <g key={b.id}
                transform={`translate(${b.vx.toFixed(1)} ${b.vy.toFixed(1)})`}
                style={{cursor:"pointer"}}
                onClick={e=>{ e.stopPropagation(); selectBeach(b) }}>
                {!noAnim&&<circle r="13" fill="url(#wmPhalo)"
                  style={{animation:"wmHalo 3.6s ease-in-out infinite"}}/>}
                <circle r={isSel?8:6} fill={STATUS_C[st]||"#888"} stroke="#06121A" strokeWidth="1.3"
                  style={{transition:"r .15s cubic-bezier(.34,1.56,.64,1)"}}/>
                {st==="clean"&&<circle r={isSel?8:6} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1"/>}
              </g>
            )
          })}

        </g>

        {/* Veilleur satellite — hors du monde, ne zoome pas, veille la mer */}
        <g transform="translate(726 104) scale(.46)" opacity=".95" aria-hidden="true">
          <circle cx="0" cy="0" r="42" fill="url(#wmPhalo)"/>
          <rect x="-58" y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(-8 -41 4)"/>
          <rect x="24"  y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(8 41 4)"/>
          <path d="M0 -22 C14 -22 22 -14 22 2 C22 18 14 30 0 30 C-14 30 -22 18 -22 2 C-22 -14 -14 -22 0 -22 Z"
            fill="#102622" stroke="#FFD884" strokeWidth="1.1" strokeOpacity=".5"/>
          <circle cx="0" cy="4" r="15" fill="#0d3a39"/>
          <circle cx="0" cy="4" r="15" fill="none" stroke="#E8A800" strokeWidth="2.4"/>
          <ellipse cx="0" cy="9" rx="15" ry="9" fill="#102622"/>
          <circle cx="2" cy="3" r="5.4" fill="#0a3a39"/>
          <circle cx="0.5" cy="1.2" r="2" fill="#cff4ff"/>
          <line x1="0" y1="-22" x2="0" y2="-34" stroke="#0e2622" strokeWidth="2.4"/>
          <circle cx="0" cy="-36" r="3.4" fill={vant}/>
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
                font:"800 11px/1 'Bricolage Grotesque',system-ui,sans-serif",
                color:"#EAF7F4",
                textShadow:"0 1px 0 rgba(3,17,15,.95),0 0 5px rgba(3,17,15,.9),0 0 9px rgba(3,17,15,.65)",
              }}>{b.name}</div>
              <div style={{
                font:"700 9px/1 'Bricolage Grotesque',system-ui,sans-serif",
                letterSpacing:".05em",
                textTransform:"uppercase",
                color:col,
                marginTop:2,
                textShadow:"0 1px 0 rgba(3,17,15,.95),0 0 4px rgba(3,17,15,.85)",
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
            background:"rgba(8,18,16,.5)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.14)",
          }}>
            <div style={{
              width:8,height:8,borderRadius:"50%",background:"#E8522A",
              animation:noAnim?"none":"wmPulse 2.4s ease-out infinite",
            }}/>
            <span style={{font:"800 11px/1 'Bricolage Grotesque',sans-serif",letterSpacing:".08em",textTransform:"uppercase",color:"#fff"}}>EN DIRECT</span>
            <span style={{font:"700 11px/1 'JetBrains Mono',monospace",color:"#5FD3C9",marginLeft:2}}>
              {updatedAt?`il y a ${fmtFresh(updatedAt)}`:"···"}
            </span>
          </div>
          {/* Fermer (hors rootMode) */}
          {!rootMode&&<button onClick={onClose} style={{
            border:"1px solid rgba(255,255,255,.14)",
            background:"rgba(8,18,16,.5)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            color:"#EAF7F4",font:"800 12px/1 'Bricolage Grotesque',sans-serif",
            padding:"8px 12px",borderRadius:9,cursor:"pointer",pointerEvents:"auto",
          }}>✕</button>}
        </div>

        {/* H1 + jauge */}
        <div style={{
          position:"absolute",top:"calc(58px + env(safe-area-inset-top))",
          left:0,right:0,maxWidth:560,margin:"0 auto",padding:"0 18px",pointerEvents:"none",
        }}>
          <h2 style={{
            fontFamily:"'Anton','Haettenschweiler','Arial Narrow Bold',Impact,sans-serif",
            fontWeight:400,letterSpacing:"-.01em",textTransform:"uppercase",
            fontSize:"clamp(24px,6.4vw,32px)",lineHeight:.96,color:"#fff",
            textShadow:"0 2px 18px rgba(0,0,0,.5)",margin:0,
          }}>
            {regionName} <span style={{color:"#FFE47A"}}>{dayLbl}</span>
          </h2>
          <div style={{
            marginTop:9,display:"inline-flex",alignItems:"center",gap:9,pointerEvents:"auto",
            background:"rgba(8,18,16,.42)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",
            border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"8px 13px",
          }}>
            <div style={{width:104,height:7,borderRadius:4,background:"rgba(255,255,255,.14)",overflow:"hidden"}}>
              <div style={{
                height:"100%",background:"linear-gradient(90deg,#22C55E,#FFC72C)",borderRadius:4,transition:"width .4s ease",
                width:beachList.length?Math.round(cleanCnt/beachList.length*100)+"%":"0%",
              }}/>
            </div>
            <span style={{font:"700 12.5px/1 'Bricolage Grotesque',sans-serif",color:"#fff"}}>
              <b style={{color:"#FFE47A"}}>{cleanCnt}</b> {_t(lang,"plages propres","clean beaches","playas limpias")}
            </span>
          </div>
        </div>

        {/* Légende */}
        <div style={{
          position:"absolute",left:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          display:"flex",flexDirection:"column",gap:5,pointerEvents:"none",
        }}>
          {[["#22C55E",_t(lang,"Propre","Clean","Limpia")],
            ["#E8A800",_t(lang,"Modéré","Moderate","Moderado")],
            ["#E8522A",_t(lang,"À éviter","Avoid","Evitar")]].map(([c,l])=>(
            <div key={c} style={{display:"flex",alignItems:"center",gap:7,
              font:"700 10.5px/1 'Bricolage Grotesque',sans-serif",
              color:"rgba(255,255,255,.8)",textShadow:"0 1px 4px #000"}}>
              <div style={{width:9,height:9,borderRadius:"50%",background:c}}/>{l}
            </div>
          ))}
        </div>

        {/* Bouton Près de moi */}
        <button style={{
          position:"absolute",right:16,bottom:"calc(74px + env(safe-area-inset-bottom))",
          pointerEvents:"auto",display:"inline-flex",alignItems:"center",gap:7,
          background:"linear-gradient(135deg,#FFE47A,#FFC72C 45%,#E8A800)",
          color:"#16241f",border:0,font:"800 12.5px/1 'Bricolage Grotesque',sans-serif",
          padding:"11px 14px",borderRadius:999,cursor:"pointer",
          boxShadow:"0 8px 22px rgba(232,168,0,.34)",
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
            background:"rgba(8,18,16,.6)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.12)",borderRadius:999,padding:4,
          }}>
            {DAY_LBL.map((lbl,i)=>(
              <button key={i} style={{
                border:0,position:"relative",
                background:day===i?"#FFC72C":"transparent",
                color:day===i?"#16241f":"rgba(255,255,255,.75)",
                font:"800 11px/1 'Bricolage Grotesque',sans-serif",
                padding:"8px 11px",borderRadius:999,cursor:"pointer",
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
            background:"rgba(8,18,16,.62)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
            border:"1px solid rgba(255,255,255,.12)",borderRadius:999,padding:5,
          }}>
            <button style={{
              display:"flex",alignItems:"center",gap:6,border:0,
              background:"#FFC72C",color:"#16241f",
              font:"800 12px/1 'Bricolage Grotesque',sans-serif",
              padding:"9px 15px",borderRadius:999,cursor:"default",
            }}>🗺️ {_t(lang,"Carte","Map","Mapa")}</button>
            {!rootMode&&<button onClick={onClose} style={{
              display:"flex",alignItems:"center",gap:6,border:0,
              background:"transparent",color:"rgba(255,255,255,.7)",
              font:"800 12px/1 'Bricolage Grotesque',sans-serif",
              padding:"9px 15px",borderRadius:999,cursor:"pointer",
            }}>✕ {_t(lang,"Fermer","Close","Cerrar")}</button>}
          </div>
        </div>

        {/* Tooltip plage sélectionnée */}
        {selected&&tagPos&&(
          <div style={{
            position:"absolute",left:tagPos.x,top:tagPos.y-14,
            transform:"translate(-50%,-100%)",
            background:"rgba(8,18,16,.86)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",
            border:"1px solid rgba(255,255,255,.14)",borderRadius:12,padding:"8px 11px",
            pointerEvents:"none",whiteSpace:"nowrap",
          }}>
            <div style={{font:"800 12.5px/1.1 'Bricolage Grotesque',sans-serif",color:"#fff"}}>{selected.name}</div>
            <div style={{font:"800 10.5px/1 'Bricolage Grotesque',sans-serif",letterSpacing:".04em",
              textTransform:"uppercase",marginTop:4,display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:STATUS_C[selected.days[day]||"clean"]}}/>
              <span>{ti(lang,STATUS_LBL[selected.days[day]||"clean"]||["—","—","—"])}</span>
            </div>
            {selected.commune&&<div style={{font:"700 10px/1 'JetBrains Mono',monospace",color:"#9DB4B0",marginTop:4}}>{selected.commune}</div>}
          </div>
        )}

        {/* CTA Voir la plage */}
        {selected&&(
          <button onClick={openBeach} style={{
            position:"absolute",left:"50%",bottom:"calc(176px + env(safe-area-inset-bottom))",
            transform:"translateX(-50%)",pointerEvents:"auto",
            display:"inline-flex",alignItems:"center",gap:8,
            background:"linear-gradient(135deg,#FFE47A,#FFC72C 42%,#E8A800)",
            color:"#16241f",border:0,
            font:"800 13.5px/1 'Bricolage Grotesque',sans-serif",
            padding:"13px 18px",borderRadius:999,
            boxShadow:"0 10px 28px rgba(232,168,0,.4)",cursor:"pointer",
            animation:"wmSlide .25s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            {_t(lang,"Voir la plage","Open beach","Ver la playa")} <span style={{fontWeight:800}}>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

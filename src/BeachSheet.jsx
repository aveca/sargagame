/**
 * BeachSheet — scroll-driven cinematic story experience for the beach detail.
 *
 * ADDITIVE standalone component. Wraps the full beach detail in a scroll-driven
 * story format with IntersectionObserver reveals, golden-hour hero scene,
 * animated score counter, verdict reveal, forecast bars, plan B, and CTA.
 *
 * Props mirror the existing BeachSheet contract. Uses useSwipeClose for
 * swipe-to-dismiss. All existing logic (verdict, forecast, alerts, planB,
 * premium flow) is preserved.
 *
 * Scroll story sections sit between the hero and the existing detail content.
 * Each section triggers animation once on first reveal via IntersectionObserver.
 * prefers-reduced-motion: all transitions skipped, content shown immediately.
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useSwipeClose } from "./useSwipeClose.js"
import { _t, fcDay, Veilleur, COMIC, moodFromStatus } from "./Sargasses_PROD.jsx"

/* ── Inline helpers (mirrors from Sargasses_PROD to avoid circular dep) ── */
function moodFromScore(score){return typeof score!=="number"?"scan":score>=70?"serein":score>=40?"vigilant":"alerte"}
function verdictMeta(status,lang){
  const M={
    clean:{color:"#22C55E",emoji:"😎",verb:_t(lang,"Vas-y","Go","Adelante")},
    moderate:{color:"#B87A00",emoji:"😐",verb:_t(lang,"Prudence","Careful","Cuidado")},
    avoid:{color:"#E8522A",emoji:"🚫",verb:_t(lang,"Pas aujourd'hui","Not today","Hoy no")},
  }
  return M[status]||{color:"#1c7fb0",emoji:"🛰️",verb:_t(lang,"Le veilleur scanne","Scanning","Escaneando")}
}
function comicStatusColor(st){return st==="clean"?COMIC.clean:st==="moderate"?COMIC.moderate:st==="avoid"?COMIC.avoid:COMIC.loading}
function stLabel(status,lang){const S={clean:{fr:"PROPRE",en:"CLEAN",es:"LIMPIA"},moderate:{fr:"MODÉRÉ",en:"MODERATE",es:"MODERADA"},avoid:{fr:"À ÉVITER",en:"AVOID",es:"EVITAR"}};return (S[status]||{fr:"…",en:"…",es:"…"})[lang]||(S[status]||{fr:"…"})["fr"]}
function stLabelLong(status,lang){const S={clean:{fr:"Baignade OK",en:"Safe to swim",es:"Baño OK"},moderate:{fr:"À vérifier",en:"Check first",es:"A verificar"},avoid:{fr:"Évite l'eau",en:"Skip the swim",es:"Evita el agua"}};return (S[status]||{fr:"…",en:"…",es:"…"})[lang]||(S[status]||{fr:"…"})["fr"]}
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,p=Math.PI/180,x=(lat2-lat1)*p,y=(lon2-lon1)*p,h=Math.sin(x/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(y/2)**2
  return 2*R*Math.asin(Math.sqrt(Math.min(1,h)))
}
function nearestCleanAlt(beach,allBeaches){
  if(!beach||!allBeaches||!allBeaches.length||beach.lat==null)return null
  const cand=allBeaches.filter(b=>b.id!==beach.id&&b.island===beach.island&&b.lat!=null&&b.status==="clean")
  let best=null,bd=1e9
  for(const b of cand){const d=haversineKm(beach.lat,beach.lng,b.lat,b.lng);if(d<bd){bd=d;best=b}}
  return best
}
function forecastColor(status){return status==="clean"?"#22C55E":status==="moderate"?"#F59E0B":status==="avoid"?"#E8522A":"#5A5A5A"}
function forecastLabel(status,lang){return status==="clean"?_t(lang,"Calme","Calm","Calma"):status==="moderate"?_t(lang,"Surveiller","Watch","Vigilar"):status==="avoid"?_t(lang,"Éviter","Avoid","Evitar"):"-"}

/* ── Golden-hour tokens (subset of SCENE_TOKENS) ── */
const GH={
  dawn:  {sky:["#141B33","#3A4A6B","#B86E7E","#F2A968"],seaT:"#235862",seaB:"#0A2630",sun:"set",glit:"#F2A968",rim:"#F2A968"},
  day:   {sky:["#1A6FA8","#3E9BC4","#7BC8D8","#AEE0E6"],seaT:"#15706A",seaB:"#0B3A34",sun:"high",glit:"#FDFCF7",rim:"#FFFFFF"},
  golden:{sky:["#0B2230","#155A5A","#C97E3A","#F2B05E"],seaT:"#1A5852",seaB:"#08251F",sun:"set",glit:"#FFD884",rim:"#FFD884"},
  night: {sky:["#040B16","#0A1B2E","#10303B","#16424A"],seaT:"#0A2E2E",seaB:"#04140F",sun:"moon",glit:"#9ADCD4",rim:"#9ADCD4"},
}
function heroPhase(){try{const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}catch(_){return "golden"}}
function waterTint(seaT,afai){const a=typeof afai==="number"?afai:0.2,inten=Math.max(0,Math.min(1,(a-0.15)/0.63));return inten<=0.03?seaT:_mixHex(seaT,"#6E5A1E",inten*0.55)}
function _mixHex(a,b,k){a=a.replace("#","");b=b.replace("#","");const p=(s,i)=>parseInt(s.slice(i,i+2),16),m=x=>("0"+Math.round(x).toString(16)).slice(-2);return "#"+m(p(a,0)+(p(b,0)-p(a,0))*k)+m(p(a,2)+(p(b,2)-p(a,2))*k)+m(p(a,4)+(p(b,4)-p(a,4))*k)}

/* ── Simplified golden-hour maritime SVG scene ── */
function BeachHeroScene({beach}){
  const ph=heroPhase()
  const t=GH[ph]||GH.golden
  const afai=typeof beach?.afai==="number"?beach.afai:0.2
  const status=beach?.status||"clean"
  const sandColor=ph==="day"?"#C9A86A":"#1C1712"
  return(
    <div aria-hidden="true" style={{position:"absolute",inset:0,overflow:"hidden"}}>
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}}>
        <defs>
          <linearGradient id="bssSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={t.sky[0]}/><stop offset=".52" stopColor={t.sky[1]}/><stop offset=".84" stopColor={t.sky[2]}/><stop offset="1" stopColor={t.sky[3]}/></linearGradient>
          <linearGradient id="bssSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={waterTint(t.seaT,afai)}/><stop offset="1" stopColor={t.seaB}/></linearGradient>
        </defs>
        <rect width="800" height="380" fill="url(#bssSky)"/>
        {t.sun==="set"&&<><circle cx="400" cy="330" r="140" fill={t.glit} opacity=".06"/><circle cx="400" cy="330" r="72" fill={t.glit} opacity=".10"/><path d="M330 332 a70 70 0 0 1 140 0 Z" fill={t.glit} opacity=".88"/></>}
        {t.sun==="high"&&<><circle cx="300" cy="98" r="52" fill="#FDFCF7" opacity=".18"/><circle cx="300" cy="98" r="30" fill="#FFF4D6"/></>}
        {t.sun==="set"&&<g>{[-52,-26,0,26,52].map((a,i)=>(<path key={i} d="M400 330 L390 150 L410 150 Z" fill={t.glit} opacity=".08" transform={"rotate("+a+" 400 330)"}/>))}</g>}
        {t.sun==="high"&&<g>{[-46,-22,2,26,50].map((a,i)=>(<path key={i} d="M300 98 L291 300 L309 300 Z" fill="#FFF4D6" opacity=".07" transform={"rotate("+a+" 300 98)"}/>))}</g>}
        {t.sun==="moon"&&<><circle cx="320" cy="96" r="40" fill="#9ADCD4" opacity=".06"/><circle cx="320" cy="96" r="20" fill="#E6F2EF"/><circle cx="313" cy="90" r="3.6" fill="#C2D8D2" opacity=".6"/></>}
        {ph==="night"&&[[90,60],[220,90],[380,50],[540,82],[680,56],[150,150],[470,140],[620,120]].map((s,i)=>(<circle key={i} cx={s[0]} cy={s[1]} r="1.1" fill="#fff" opacity=".4"/>))}
        <rect x="-40" y="340" width="880" height="180" fill="url(#bssSea)"/>
        <line x1="-40" y1="372" x2="840" y2="372" stroke={t.glit} strokeWidth="2" strokeDasharray="3 13" opacity=".45"/>
        <line x1="-40" y1="408" x2="840" y2="408" stroke={t.glit} strokeWidth="1.6" strokeDasharray="2 19" opacity=".26"/>
        {status==="avoid"&&<g><ellipse cx="320" cy="396" rx="28" ry="9" fill="#6b4a12" opacity=".8"/><ellipse cx="480" cy="402" rx="24" ry="8" fill="#7a5c14" opacity=".7"/><ellipse cx="280" cy="410" rx="18" ry="6" fill="#5d400e" opacity=".6"/></g>}
        {status==="moderate"&&<g><circle cx="310" cy="390" r="3" fill="#FFC72C" opacity=".7"/><circle cx="360" cy="394" r="2.6" fill="#FFC72C" opacity=".7"/><circle cx="420" cy="392" r="2.8" fill="#FFC72C" opacity=".7"/></g>}
        {status==="clean"&&<g><circle cx="372" cy="408" r="6" fill="#0D2B26" opacity=".7"/><path d="M360 414 q12 -8 24 0" stroke="#0D2B26" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".7"/></g>}
        <path d="M-40 490 Q200 454 430 468 Q640 478 840 520 L840 620 L-40 620 Z" fill={sandColor}/>
        <path d="M-40 490 Q200 454 430 468 Q640 478 840 520" fill="none" stroke={t.rim} strokeWidth="2" opacity=".25"/>
      </svg>
    </div>
  )
}

/* ── useReveal — IntersectionObserver trigger, one-shot on first reveal ── */
function useReveal(opts={}){
  const ref=useRef(null)
  const [revealed,setRevealed]=useState(false)
  useEffect(()=>{
    const el=ref.current
    if(!el)return
    let reduce=false
    try{reduce=window.matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){}
    if(reduce){setRevealed(true);return}
    const obs=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){setRevealed(true);obs.unobserve(el)}
    },{threshold:0.18,...opts})
    obs.observe(el)
    return()=>obs.disconnect()
  },[])
  return [ref,revealed]
}

/* ── StorySection — scroll-reveal wrapper ── */
function StorySection({children,delay=0,className="",style={}}){
  const [ref,revealed]=useReveal()
  return(
    <div ref={ref} className={"bs-story-section "+(revealed?"bs-revealed":"")+" "+className}
      style={{
        minHeight:"100svh",display:"flex",flexDirection:"column",justifyContent:"center",
        padding:"40px 20px",boxSizing:"border-box",position:"relative",
        opacity:0,transform:"translateY(40px)",transition:"opacity .8s cubic-bezier(.22,1,.36,1) "+(delay+.1)+"s, transform .8s cubic-bezier(.22,1,.36,1) "+(delay+.1)+"s",
        ...(revealed?{opacity:1,transform:"translateY(0)"}:{}),
        ...style
      }}>
      {children}
    </div>
  )
}

/* ── AnimatedScore — count-up 0→target on reveal ── */
function AnimatedScore({target,duration=1500,size=64}){
  const ref=useRef(null)
  const [revealed,setRevealed]=useState(false)
  const [value,setValue]=useState(0)
  useEffect(()=>{
    const el=ref.current
    if(!el)return
    let reduce=false
    try{reduce=window.matchMedia("(prefers-reduced-motion:reduce)").matches}catch(_){}
    if(reduce){setRevealed(true);setValue(target);return}
    const obs=new IntersectionObserver(([entry])=>{
      if(entry.isIntersecting){setRevealed(true);obs.unobserve(el)}
    },{threshold:0.3})
    obs.observe(el)
    return()=>obs.disconnect()
  },[target])
  useEffect(()=>{
    if(!revealed||!target)return
    let raf,start=null
    const tick=t=>{if(start==null)start=t;const p=Math.min(1,(t-start)/duration);const e=1-Math.pow(1-p,3);setValue(Math.round(target*e));if(p<1)raf=requestAnimationFrame(tick)}
    raf=requestAnimationFrame(tick)
    return()=>{try{cancelAnimationFrame(raf)}catch(_){}}
  },[revealed,target,duration])
  const vm=verdictMeta(target>=70?"clean":target>=40?"moderate":"avoid","fr")
  const circumference=2*Math.PI*44
  const pct=Math.min(100,value)
  return(
    <div ref={ref} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
      <div style={{position:"relative",width:size*1.6,height:size*1.6}}>
        <svg width={size*1.6} height={size*1.6} viewBox="0 0 120 120" style={{transform:"rotate(-90deg)"}}>
          <circle cx="60" cy="60" r="44" fill="none" stroke={COMIC.ink+"18"} strokeWidth="6"/>
          <circle cx="60" cy="60" r="44" fill="none" stroke={vm.color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${circumference}`} strokeDashoffset={revealed?circumference*(1-pct/100):circumference}
            style={{transition:"stroke-dashoffset 1.8s cubic-bezier(.22,1,.36,1)"}}/>
        </svg>
        <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontFamily:"'JetBrains Mono',ui-monospace,monospace",fontWeight:700,fontSize:size*.55,lineHeight:1,color:COMIC.ink,fontVariantNumeric:"tabular-nums",letterSpacing:"-1px"}}>{value}</span>
          <span style={{fontSize:size*.15,color:COMIC.sub,fontWeight:700,letterSpacing:".5px"}}>/100</span>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:vm.color,flexShrink:0}}/>
        <span style={{font:"800 13px/1 'Bricolage Grotesque'",color:COMIC.ink,textTransform:"uppercase",letterSpacing:".3px"}}>{stLabel(target>=70?"clean":target>=40?"moderate":"avoid","fr")}</span>
      </div>
    </div>
  )
}

/* ── Forecast bar ── */
function ForecastBar({day,status,index,lang="fr",gated=false,onUnlock}){
  const [ref,revealed]=useReveal()
  const pct=status==="clean"?90:status==="moderate"?50:status==="avoid"?20:0
  const col=forecastColor(status)
  return(
    <div ref={ref} style={{display:"flex",alignItems:"center",gap:10,width:"100%",position:"relative"}}>
      <span style={{font:"700 11px/1 'Bricolage Grotesque'",color:COMIC.sub,minWidth:28,textAlign:"right"}}>{day||"·"}</span>
      <div style={{flex:1,height:28,borderRadius:8,background:COMIC.ink+"0d",border:`2px solid ${COMIC.ink}`,overflow:"hidden",position:"relative",filter:gated?"blur(3px)":"none",opacity:gated?.65:1}}>
        <div style={{height:"100%",borderRadius:6,background:col,width:revealed?pct+"%":"0%",transition:"width 1s cubic-bezier(.22,1,.36,1) "+(index*.12)+"s"}}/>
        {gated&&(
          <div onClick={onUnlock} style={{
            position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
            background:"rgba(13,17,23,0.7)",cursor:"pointer",zIndex:2,
            borderRadius:6
          }}>
            <span style={{
              font:"700 10px/1 'Bricolage Grotesque'",color:"#FFC72C",textTransform:"uppercase",
              letterSpacing:".5px",background:"rgba(13,17,23,0.9)",padding:"2px 8px",borderRadius:4
            }}>
              🔒 {_t(lang,"Plan Alert €29/mo","Plan Alert €29/mo","Plan Alerta €29/mes")}
            </span>
          </div>
        )}
      </div>
      <span style={{font:"700 10px/1 'Bricolage Grotesque'",color:COMIC.sub,minWidth:48,textAlign:"left",opacity:.7}}>{forecastLabel(status,lang)}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — BeachSheet component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function BeachSheet({
  beach,onClose,favorites,onToggleFav,lang="fr",allBeaches=[],onBeachClick,
  onPremiumClick,isPremium=false,sargData,userPos,forecast:forecastProp,
  track:trackProp,communityReports={},onRequestGeo,onEnsureAlerts
}){
  const v2Enabled=(()=>{try{return !/[?&]sguxv2=0(?:&|$)/.test(window.location.search)}catch(_){return true}})()
  const trk=(n,p)=>{try{(trackProp||window.track||console.log)(n,p)}catch(_){}}
  const swipe=useSwipeClose(()=>onClose&&onClose(),{threshold:70,guardInput:true})
  const closingRef=useRef(false)
  const hasScore=typeof beach?.score==="number"
  const status=beach?.status||"_loading"
  const vmeta=verdictMeta(status,lang)
  const satAge=(()=>{try{const ts=sargData?.erddapTimestamp||sargData?.updatedAt;if(!ts)return null;const h=(Date.now()-new Date(ts).getTime())/3.6e6;return h>=0&&h<240?h:null}catch(_){return null}})()
  const satLabel=satAge==null?_t(lang,"Satellite récent","Recent satellite","Satélite reciente")
    :satAge<1?_t(lang,"Satellite il y a <1 h","Satellite <1h ago","Satélite hace <1 h")
    :_t(lang,`Satellite il y a ${Math.round(satAge)} h`,`Satellite ${Math.round(satAge)}h ago`,`Satélite hace ${Math.round(satAge)} h`)
  const distKm=(()=>{try{if(!userPos||!beach)return null;return haversineKm(userPos.lat,userPos.lng,beach.lat,beach.lng)}catch(_){return null}})()
  const locLine=[beach?.commune||null,distKm!=null?_t(lang,`à ${Math.round(distKm)} km`,`${Math.round(distKm)} km away`,`a ${Math.round(distKm)} km`):null].filter(Boolean).join(" · ")

  // Forecast
  const forecast=useMemo(()=>{
    if(forecastProp&&forecastProp.length)return forecastProp
    if(!beach)return null
    const w=sargData?.weekly?.[beach.id]||sargData?._enrichedWeekly?.[`_interp_${beach.id}`]||null
    return w?.forecast||null
  },[beach?.id,sargData,forecastProp])

  const fcDays=(forecast||[]).slice(0,7)
  const planB=useMemo(()=>{
    if(!beach||!allBeaches||status==="clean"||status==="_loading")return[]
    return allBeaches.filter(b=>b.id!==beach.id&&b.island===beach.island&&b.status==="clean")
      .map(b=>({...b,_d:haversineKm(beach.lat,beach.lng,b.lat,b.lng)}))
      .filter(b=>b._d<=60).sort((a,b)=>a._d-b._d).slice(0,3)
  },[beach?.id,allBeaches,status])
  const alt=useMemo(()=>nearestCleanAlt(beach,allBeaches),[beach?.id,allBeaches])

  const fave=favorites&&favorites.includes(beach?.id)

  // CTA — clair pour l'utilisateur non-premium : "Débloquer 7 jours" (intent = prévisions),
  // narratif pour premium : "Mes alertes" (la porte convertie devient l'usage).
  // Avant : "Activer mon alerte" pour tous → camouflait le paywall (plainte fondateur
  // 2026-08-11 : « je comprends pas ce qu'il faut faire, je suis perdu »).
  const ctaLabel=isPremium?_t(lang,"Mes alertes","My alerts","Mis alertas"):_t(lang,"Débloquer 7 jours","Unlock 7 days","Desbloquear 7 días")
  const onCTA=()=>{trk("sg_beach_cta",{beach_id:beach?.id,status,premium:!!isPremium});if(isPremium){try{onEnsureAlerts&&onEnsureAlerts()}catch(_){};onClose&&onClose()}else{onPremiumClick&&onPremiumClick("beach_sheet")}}

  const requestClose=()=>{
    if(closingRef.current)return;closingRef.current=true
    try{if(swipe.ref.current)swipe.ref.current.style.transition="transform .26s cubic-bezier(.4,0,1,1)";if(swipe.ref.current)swipe.ref.current.style.transform="translateY(102%)"}catch(_){}
    setTimeout(()=>{closingRef.current=false;onClose&&onClose()},260)
  }
  useEffect(()=>{const h=e=>{if(e.key==="Escape")requestClose()};document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h)},[])

  if(!beach)return null

  return(
    <>
      <style>{`
        @keyframes bsFade{from{opacity:0}to{opacity:1}}
        @keyframes bsUp{from{transform:translateY(102%)}to{transform:translateY(0)}}
        @keyframes bsPop{0%{transform:scale(.82);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes bsChip{0%{transform:scale(.55) translateY(8px);opacity:0}65%{transform:scale(1.08) translateY(0)}100%{transform:scale(1);opacity:1}}
        @keyframes bsRow{0%{transform:translateX(-14px);opacity:0}100%{transform:translateX(0);opacity:1}}
        @keyframes bsGlow{0%,100%{opacity:.5}50%{opacity:1}}
        @keyframes bsPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        .bs-card{background:${COMIC.cream};border:3px solid ${COMIC.ink};border-radius:16px;box-shadow:3px 3px 0 ${COMIC.ink}}
        .bs-chip{font:800 12px/1 'Bricolage Grotesque',sans-serif;color:${COMIC.ink};background:#fff;border:2.5px solid ${COMIC.ink};border-radius:999px;padding:7px 11px;display:inline-flex;align-items:center;gap:6px}
        .bs-gobtn{width:100%;text-align:center;font:800 17px/1 'Bricolage Grotesque',sans-serif;padding:16px;border-radius:16px;border:3px solid ${COMIC.ink};box-shadow:3px 3px 0 ${COMIC.ink};background:${COMIC.gold};color:${COMIC.ink};cursor:pointer;transition:transform .08s ease}
        .bs-gobtn:active{transform:translate(3px,3px);box-shadow:0 0 0 ${COMIC.ink}}
        .bs-sheet button{-webkit-appearance:none;appearance:none;font-family:inherit}
        @media (prefers-reduced-motion:reduce){
          .bs-story-section{opacity:1!important;transform:none!important;transition:none!important}
          .bs-reveal-anim{animation:none!important}
        }
      `}</style>

      {/* Backdrop */}
      <div onClick={requestClose}
        style={{position:"fixed",inset:0,zIndex:"var(--z-backdrop)",background:"rgba(11,7,22,.46)",backdropFilter:"blur(1.5px)",WebkitBackdropFilter:"blur(1.5px)",animation:"bsFade .25s ease both"}}/>

      {/* Sheet */}
      <div ref={swipe.ref} onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}
        className={"bs-sheet"+(v2Enabled?" sg-v2-beach-sheet":"")}
        style={{position:"fixed",left:0,right:0,bottom:0,zIndex:"var(--z-sheet)",maxHeight:"92svh",overflowY:"auto",overflowX:"hidden",
          background:COMIC.cream,backgroundImage:`radial-gradient(${COMIC.ink}0d 1.3px,transparent 1.5px)`,backgroundSize:"11px 11px",
          borderTop:`4px solid ${COMIC.ink}`,borderRadius:"26px 26px 0 0",boxShadow:"0 -12px 44px rgba(0,0,0,.42)",
          WebkitOverflowScrolling:"touch",animation:"bsUp .42s cubic-bezier(.16,1,.3,1) both",fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>

        {/* Grip */}
        <div style={{width:44,height:5,borderRadius:5,background:COMIC.ink,opacity:.32,margin:"2px auto 8px"}}/>

        {/* Close */}
        <button onClick={requestClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
          style={{position:"absolute",top:12,right:12,width:44,height:44,borderRadius:"50%",border:`2.5px solid ${COMIC.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${COMIC.ink}`,color:COMIC.ink,cursor:"pointer",lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>

        {/* ── HERO: golden-hour scene + beach name ── */}
        <div className={v2Enabled?"sg-v2-beach-hero":undefined} style={{position:"relative",height:"min(480px,46svh)",overflow:"hidden",borderRadius:"0 0 26px 26px",margin:"-10px -16px 0"}}>
          <BeachHeroScene beach={beach}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, rgba(0,0,0,.12) 0%, transparent 35%, transparent 50%, rgba(0,0,0,.5) 100%)"}}/>
          <div style={{position:"absolute",top:"38%",left:0,right:0,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
            <Veilleur mood={moodFromScore(beach.score)} size={72}/>
          </div>
          <div style={{position:"absolute",bottom:20,left:20,right:20,zIndex:1}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(28px,8vw,42px)",lineHeight:.92,color:"#fff",textTransform:"uppercase",letterSpacing:"-.3px",textShadow:"0 2px 16px rgba(0,0,0,.5)",wordBreak:"break-word"}}>{beach.name}</div>
            {locLine&&<div style={{font:"700 12px/1.2 'Bricolage Grotesque'",color:"rgba(255,255,255,.75)",marginTop:6,display:"flex",alignItems:"center",gap:5,textShadow:"0 1px 8px rgba(0,0,0,.4)"}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>{locLine}
            </div>}
          </div>
          <div style={{position:"absolute",top:16,left:16,display:"flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:100,background:"rgba(0,0,0,.3)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,.12)"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:vmeta.color,flexShrink:0}}/>
            <span style={{font:"700 11px/1 'Bricolage Grotesque'",color:"#fff",letterSpacing:".3px"}}>{stLabel(status,lang)}</span>
          </div>
        </div>

        {/* ── STORY SECTIONS (scroll-driven reveals) ── */}
        <div style={{padding:"0 0 4px"}}>
          {/* #1 — Score reveal */}
          <StorySection delay={0}>
            <div style={{textAlign:"center",maxWidth:360,margin:"0 auto"}}>
              <div style={{font:"800 10px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".16em",textTransform:"uppercase",marginBottom:16}}>{_t(lang,"INDICE DU JOUR","TODAY'S SCORE","ÍNDICE DE HOY")}</div>
              {hasScore
                ? <AnimatedScore target={beach.score}/>
                : <div style={{width:100,height:100,borderRadius:"50%",border:`4px solid ${COMIC.ink}`,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,color:COMIC.sub}}>…</div>}
              <div style={{font:"600 13px/1.5 'Bricolage Grotesque'",color:COMIC.sub,marginTop:12,maxWidth:280,margin:"12px auto 0"}}>
                {beach.scoreReason||_t(lang,"Mesuré au satellite, pas deviné.","Measured by satellite, not guessed.","Medido por satélite, no adivinado.")}
              </div>
            </div>
          </StorySection>

          {/* #2 — Verdict reveal */}
          <StorySection delay={.1} style={{padding:"40px 24px"}}>
            <div style={{
              background:vmeta.color,border:`3px solid ${COMIC.ink}`,borderRadius:20,boxShadow:`5px 5px 0 ${COMIC.ink}`,
              padding:"24px 20px",textAlign:"center",position:"relative",overflow:"hidden",maxWidth:400,margin:"0 auto",width:"100%",boxSizing:"border-box"
            }}>
              <div style={{position:"absolute",top:"-50%",left:"-20%",width:"140%",height:"200%",
                background:`radial-gradient(ellipse at 50% 50%, rgba(255,255,255,.18) 0%, transparent 60%)`,pointerEvents:"none"}}/>
              <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}>
                {status==="clean" ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={status==="avoid"?"#fff":COMIC.ink} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M5 13l4 4L19 7"/></svg>
                : status==="avoid" ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true" style={{flexShrink:0}}><path d="M6 6l12 12M18 6 6 18"/></svg>
                : status==="moderate" ? <svg width="48" height="48" viewBox="0 0 24 24" aria-hidden="true" style={{flexShrink:0}}><circle cx="12" cy="12" r="9" fill="none" stroke={COMIC.ink} strokeWidth="2.6"/><path d="M12 3a9 9 0 0 0 0 18z" fill={COMIC.ink}/></svg>
                : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={COMIC.ink} strokeWidth="2.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>}
              </div>
              <div style={{fontFamily:"'Bricolage Grotesque',sans-serif",fontWeight:800,fontSize:"clamp(28px,7vw,40px)",lineHeight:.95,color:status==="avoid"?"#fff":COMIC.ink,textTransform:"uppercase",letterSpacing:"-.3px"}}>{vmeta.verb}</div>
              <div style={{font:"700 14px/1.2 'Bricolage Grotesque'",color:status==="avoid"?"rgba(255,255,255,.82)":COMIC.ink,opacity:.85,marginTop:8,textTransform:"uppercase",letterSpacing:".4px"}}>{stLabelLong(status,lang)}</div>
              <div style={{font:"700 11px/1 'Bricolage Grotesque'",color:status==="avoid"?"rgba(255,255,255,.65)":COMIC.ink,opacity:.7,marginTop:6}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h0"/></svg>
                  {satLabel}
                </span>
              </div>
            </div>
            {/* Trust note */}
            <div style={{textAlign:"center",marginTop:12,font:"600 11px/1.4 'Bricolage Grotesque'",color:COMIC.sub,maxWidth:360,margin:"12px auto 0"}}>
              {_t(lang,"Le verdict est 100 % data satellite. L'argent ne l'influence jamais.","The verdict is 100% satellite data. Money never touches it.","El veredicto es 100 % datos satelitales. El dinero nunca lo influye.")}
            </div>
          </StorySection>

          {/* #3 — Forecast 7j */}
          <StorySection delay={.2}>
            <div style={{maxWidth:420,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
              <div style={{font:"800 10px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".16em",textTransform:"uppercase",marginBottom:20,textAlign:"center"}}>{_t(lang,"PRÉVISION 7 JOURS","7-DAY FORECAST","PRONÓSTICO 7 DÍAS")}</div>
              {fcDays.length>0
                ? <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {fcDays.map((d,i)=>{
                      const dayLabel=i===0?_t(lang,"Auj","Now","Hoy"):fcDay(d,lang)
                      const gated=!isPremium&&i>=2
                      return <ForecastBar key={i} day={dayLabel} status={d.status||"_loading"} index={i} lang={lang} gated={gated} onUnlock={()=>{trk("sg_paywall_forecast_click",{beach_id:beach?.id,day:i});onCTA()}}/>
                    })}
                  </div>
                : <div style={{textAlign:"center",padding:20,color:COMIC.sub,font:"600 13px/1.4 'Bricolage Grotesque'"}}>
                    {_t(lang,"Prévision en cours de chargement…","Forecast loading…","Cargando pronóstico…")}
                  </div>}
              {!isPremium&&fcDays.length>0&&(
                <div style={{textAlign:"center",marginTop:16}}>
                  <button onClick={onCTA} className="bs-gobtn" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 24px",width:"auto",fontSize:15}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                    {_t(lang,"Débloquer les 7 jours","Unlock 7 days","Desbloquear 7 días")}
                  </button>
                </div>
              )}
            </div>
          </StorySection>

          {/* #4 — Plan B (only if avoid/moderate) */}
          {(status==="avoid"||status==="moderate")&&planB.length>0&&(
            <StorySection delay={.3}>
              <div style={{maxWidth:420,margin:"0 auto",width:"100%",boxSizing:"border-box"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",marginBottom:20}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COMIC.clean} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22V12"/><path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z"/></svg>
                  <span style={{font:"800 12px/1 'Bricolage Grotesque'",color:COMIC.ink,letterSpacing:".3px"}}>{_t(lang,"PLUTÔT ALLER ICI","GO HERE INSTEAD","MEJOR VE AQUÍ")}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {planB.slice(0,3).map((b,i)=>(
                    <button key={b.id} onClick={()=>{trk("sg_planb_pick",{from:beach.id,to:b.id,rank:i});onBeachClick&&onBeachClick(b)}}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:14,border:`2.5px solid ${COMIC.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${COMIC.ink}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left",width:"100%"}}>
                      <div style={{width:48,height:48,borderRadius:10,background:`linear-gradient(135deg,#155A5A,#1A5852)`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12c2-2 4-3 6-3s4 1 6 3c2 2 4 3 6 3"/><path d="M2 17c2-1.5 4-2 6-2s4 .5 6 2c2 1.5 4 2 6 2"/><path d="M2 7c2 1 4 1.5 6 1.5S12 7 14 6c2-1 4-1 6 0"/></svg>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{font:"800 14px/1.2 'Bricolage Grotesque'",color:COMIC.ink}}>{b.name}</div>
                        <div style={{font:"600 11px/1 'Bricolage Grotesque'",color:COMIC.sub,marginTop:3}}>
                          {Math.round(b._d)} km · {stLabel("clean",lang)}
                        </div>
                      </div>
                      <span style={{font:"800 13px/1 'Bricolage Grotesque'",color:COMIC.sub,flexShrink:0}}>→</span>
                    </button>
                  ))}
                </div>
              </div>
            </StorySection>
          )}

          {/* #5 — CTA Story section */}
          <StorySection delay={.4} style={{padding:"30px 20px 60px"}}>
            <div style={{textAlign:"center",maxWidth:400,margin:"0 auto"}}>
              <div style={{font:"800 10px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".16em",textTransform:"uppercase",marginBottom:12}}>
                {_t(lang,"LA SUITE","THE REST","EL RESTO")}
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:"clamp(26px,6.5vw,36px)",lineHeight:1,color:COMIC.ink,textTransform:"uppercase",letterSpacing:"-.3px"}}>
                {_t(lang,"Connais la fin de l'histoire","Know how the story ends","Conoce el final de la historia")}
              </div>
              <div style={{font:"600 14px/1.5 'Bricolage Grotesque'",color:COMIC.sub,margin:"12px 0 20px",maxWidth:320,marginLeft:"auto",marginRight:"auto"}}>
                {_t(lang,"Sois prévenu·e des changements. Alerte personnelle, prévisions complètes, photos terrain.","Get warned when it changes. Personal alerts, full forecasts, on-the-ground photos.","Recibe avisos cuando cambie. Alertas personales, pronósticos completos, fotos reales.")}
              </div>
              <button className="bs-gobtn" onClick={onCTA} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,width:"auto",padding:"14px 32px",fontSize:16}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{flexShrink:0}}><path d="M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z"/></svg>
                {ctaLabel} →
              </button>
              {!isPremium&&(
                <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:COMIC.sub,marginTop:10}}>
                  {_t(lang,"Pass unique · Sans abonnement · Rien à résilier","One-time pass · No subscription · Nothing to cancel","Pase único · Sin suscripción · Nada que cancelar")}
                </div>
              )}
            </div>
          </StorySection>
        </div>

        {/* ── EXISTING DETAIL CONTENT (verdict, planB, forecast, alerts, CTA) ── */}
        <div style={{padding:"0 16px calc(20px + env(safe-area-inset-bottom))",borderTop:`2px solid ${COMIC.ink}18`,marginTop:4,position:"relative"}}>
          <div style={{font:"800 10px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".16em",textTransform:"uppercase",textAlign:"center",padding:"16px 0 8px"}}>
            {_t(lang,"EN DÉTAIL","IN DETAIL","EN DETALLE")}
          </div>

          {/* Quick Status Badge */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:12,background:comicStatusColor(status),border:`2.5px solid ${COMIC.ink}`,borderRadius:14,boxShadow:`3px 3px 0 ${COMIC.ink}`}}>
            <Veilleur mood={moodFromScore(beach.score)} size={44}/>
            <div>
              <div style={{font:"800 20px/1 'Bricolage Grotesque'",color:status==="avoid"?"#fff":COMIC.ink,textTransform:"uppercase",letterSpacing:"-.2px"}}>{stLabelLong(status,lang)}</div>
              <div style={{font:"700 11px/1 'Bricolage Grotesque'",color:status==="avoid"?"rgba(255,255,255,.75)":COMIC.ink,opacity:.75,marginTop:2}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h0"/></svg>
                  {satLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Score + factors */}
          {hasScore&&(
            <div className="bs-card" style={{display:"flex",alignItems:"center",gap:14,padding:"13px 15px",marginBottom:12}}>
              <div style={{flexShrink:0,textAlign:"center"}}>
                <div style={{fontFamily:"'JetBrains Mono',ui-monospace,monospace",fontWeight:700,fontSize:38,lineHeight:.85,letterSpacing:"-1px",fontVariantNumeric:"tabular-nums",color:COMIC.ink}}>{beach.score}<span style={{fontSize:14,color:COMIC.sub}}>/100</span></div>
                <div style={{font:"800 8.5px/1 'Bricolage Grotesque'",color:COMIC.sub,letterSpacing:".5px",marginTop:2}}>{_t(lang,"INDICE","SCORE","ÍNDICE")}</div>
              </div>
              <div style={{font:"600 12px/1.4 'Bricolage Grotesque'",color:COMIC.sub}}>
                {beach.scoreReason||_t(lang,"Conditions lues par satellite.","Conditions read by satellite.","Condiciones leídas por satélite.")}
              </div>
            </div>
          )}

          {/* Satellite freshness */}
          <div style={{display:"flex",alignItems:"center",gap:7,font:"700 11.5px/1 'Bricolage Grotesque'",color:COMIC.sub,margin:"0 2px 14px"}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:satAge!=null&&satAge>=12?COMIC.warn:COMIC.clean,boxShadow:`0 0 0 3px ${(satAge!=null&&satAge>=12?COMIC.warn:COMIC.clean)}33`}}/>
            {satLabel}
          </div>

          {/* Data age warning — shown when satellite data is 12-24h old */}
          {satAge!=null&&satAge>=12&&(
            <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"10px 12px",marginBottom:12,borderRadius:10,background:"#FFF3E0",border:"1.5px solid #FFB74D",font:"600 11.5px/1.4 'Bricolage Grotesque'",color:"#E65100"}}>
              <span style={{fontSize:15,flexShrink:0}}>⏳</span>
              <span>{_t(lang,
                `Données datées de ${Math.round(satAge)} h — conditions côtières changent vite. Consulte les webcams pour une vue live.`,
                `Data ${Math.round(satAge)}h old — nearshore conditions shift fast. Check webcams for a live view.`,
                `Datos de hace ${Math.round(satAge)} h — las condiciones costeras cambian rápido. Consulta las cámaras web para una vista en vivo.`
              )}</span>
            </div>
          )}

          {/* Forecast Bars (compact) */}
          {forecast&&forecast.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                <div style={{font:"800 12px/1 'Bricolage Grotesque'",color:COMIC.ink,letterSpacing:".3px"}}>{_t(lang,"PRÉVISION 7 JOURS","7-DAY FORECAST","PRONÓSTICO 7 DÍAS")}</div>
                {!isPremium&&<span style={{font:"800 9.5px/1 'Bricolage Grotesque'",color:COMIC.ink,background:COMIC.gold,border:`2px solid ${COMIC.ink}`,borderRadius:999,padding:"4px 8px",display:"inline-flex",alignItems:"center",gap:4}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                  {_t(lang,"PREMIUM","PREMIUM","PREMIUM")}
                </span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                {fcDays.map((d,i)=>{const gated=!isPremium&&i>=2;return(
                  <div key={i} style={{flex:1,textAlign:"center",position:"relative",filter:gated?"blur(3px)":"none",opacity:gated?.65:1}}>
                    <div style={{height:34,borderRadius:7,border:`2.5px solid ${COMIC.ink}`,background:comicStatusColor(d.status),animation:"bsPop .5s cubic-bezier(.16,1,.3,1) both",animationDelay:(.15+i*.05)+"s"}}/>
                    {gated&&(
                      <div onClick={()=>{trk("sg_paywall_forecast_click",{beach_id:beach?.id,day:i});onCTA()}} style={{
                        position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                        background:"rgba(13,17,23,0.7)",cursor:"pointer",zIndex:2,borderRadius:7,
                        font:"700 8px/1 'Bricolage Grotesque'",color:"#FFC72C",textTransform:"uppercase",letterSpacing:".3px"
                      }}>
                        🔒 {_t(lang,"€29/mo","€29/mo","€29/mes")}
                      </div>
                    )}
                    <span style={{display:"block",font:"800 9px/1 'Bricolage Grotesque'",color:COMIC.sub,marginTop:4,position:"relative",zIndex:1}}>{i===0?_t(lang,"Auj","Now","Hoy"):fcDay(d,lang)}</span>
                  </div>)}).slice(0,7)}
              </div>
            </div>
          )}

          {/* Plan B compact */}
          {planB.length>0&&(
            <div className="bs-card" style={{padding:"12px 14px",marginBottom:14,background:COMIC.cream}}>
              <div style={{font:"800 12px/1 'Bricolage Grotesque'",color:COMIC.ink,marginBottom:9,display:"flex",alignItems:"center",gap:6}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={COMIC.clean} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22V12"/><path d="M12 12c0-4-3-7-8-6 2-3 8-4 8 1 0-5 6-4 8-1-5-1-8 2-8 6z"/><path d="M12 12c2-2 5-2 7 0M12 12c-2-2-5-2-7 0"/></svg>
                {_t(lang,"Plutôt y aller maintenant","Go here instead","Mejor ve aquí ahora")}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {planB.slice(0,3).map((b,i)=><button key={b.id} onClick={()=>{trk("sg_planb_pick",{from:beach.id,to:b.id,rank:i});onBeachClick&&onBeachClick(b)}}
                  style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 12px",borderRadius:12,border:`2.5px solid ${COMIC.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${COMIC.ink}`,cursor:"pointer",fontFamily:"inherit",font:"800 13px/1 'Bricolage Grotesque'",color:COMIC.ink,textAlign:"left",width:"100%"}}>
                  <span style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}><i style={{width:9,height:9,borderRadius:"50%",background:COMIC.clean,flexShrink:0}}/><span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span></span>
                  <span style={{color:COMIC.sub,font:"700 11px/1 'Bricolage Grotesque'",whiteSpace:"nowrap"}}>{Math.round(b._d)} km →</span>
                </button>)}
              </div>
            </div>
          )}

          {/* B2B Contextual CTA — based on beach score */}
          {!isPremium&&(
            <div style={{
              marginBottom:14,padding:"12px 14px",borderRadius:12,
              background:hasScore&&beach.score<50?"#FFF3E0":"#E8F5E9",
              border:`2px solid ${hasScore&&beach.score<50?"#FFB74D":"#81C784"}`,
              boxShadow:`0 2px 8px ${hasScore&&beach.score<50?"rgba(255,183,77,0.2)":"rgba(129,199,132,0.2)"}`
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:18,flexShrink:0}}>{hasScore&&beach.score<50?"⚠️":"✅"}</span>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{font:"800 13px/1.3 'Bricolage Grotesque'",color:hasScore&&beach.score<50?"#E65100":"#1B5E20"}}>
                    {hasScore&&beach.score<50
                      ? _t(lang,"Sargassum détecté sur cette plage. Hôtel ou gîte à proximité? Recevez nos alertes 48h avant l'arrivée des algues →","Sargassum detected on this beach. Hotel or guesthouse nearby? Get our alerts 48h before algae arrival →","Sargazo detectado en esta playa. ¿Hotel o alojamiento cerca? Reciba nuestras alertas 48h antes de la llegada de las algas →")
                      : _t(lang,"Plage propre aujourd'hui. Anticipez les prochains jours avec nos prévisions 7 jours →","Beach clean today. Anticipate the next days with our 7-day forecasts →","Playa limpia hoy. Anticipe los próximos días con nuestros pronósticos 7 días →")}
                  </div>
                </div>
                <a href="/b2b" onClick={(e)=>{trk("sg_beach_cta_b2b_click",{beach_id:beach?.id,score:beach?.score||null,status})}} style={{
                  display:"inline-flex",alignItems:"center",gap:6,padding:"8px 14px",
                  borderRadius:8,border:`2px solid ${hasScore&&beach.score<50?"#FFB74D":"#81C784"}`,
                  background:"white",color:hasScore&&beach.score<50?"#E65100":"#1B5E20",
                  font:"700 12px/1 'Bricolage Grotesque'",textDecoration:"none",whiteSpace:"nowrap",flexShrink:0
                }}>
                  {_t(lang,"Voir les offres pro →","See pro offers →","Ver ofertas pro →")}
                </a>
              </div>
            </div>
          )}
          {/* Track B2B CTA shown */}
          {!isPremium&&useEffect(()=>{trk("sg_beach_cta_b2b_shown",{beach_id:beach?.id,score:beach?.score||null,status})},[beach?.id,beach?.score,status,isPremium])}

          {/* CTA collant */}
          <div style={{position:"sticky",bottom:0,paddingTop:8,paddingBottom:"env(safe-area-inset-bottom,0px)",background:`linear-gradient(to top, ${COMIC.cream} 72%, transparent)`}}>
            <button className="bs-gobtn" onClick={onCTA} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{flexShrink:0}}><path d="M12 2.6l2.6 6.1 6.6.6-5 4.3 1.5 6.5L12 17l-5.7 3.4 1.5-6.5-5-4.3 6.6-.6z"/></svg>
              {ctaLabel} →
            </button>
            {!isPremium&&<>
              <div style={{font:"600 11.5px/1.4 'Bricolage Grotesque'",color:COMIC.sub,textAlign:"center",margin:"9px 8px 0"}}>
                {_t(lang,"Ne découvre plus les algues une fois sur place. Sois prévenu·e la veille.","Stop discovering the seaweed once you're there. Get warned the day before.","Deja de descubrir el sargazo al llegar. Te avisamos la víspera.")}
              </div>
              <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:COMIC.sub,textAlign:"center",marginTop:6}}>
                ≈ <PassPrice lang={lang}/> / {_t(lang,"jour","day","día")} · {_t(lang,"Pass unique, sans abonnement","One-time pass, no subscription","Pase único, sin suscripción")}
              </div>
            </>}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── PassPrice — small inline price tag ── */
function PassPrice({lang}){
  const [p,setP]=useState(null)
  useEffect(()=>{
    try{
      const el=document.querySelector("[data-pass-price]")
      if(el){setP(el.getAttribute("data-pass-price"));return}
      const txt=typeof PRICE_TRIP!=="undefined"?PRICE_TRIP:typeof PRICE_TRIP_EUR!=="undefined"?PRICE_TRIP_EUR:null
      if(txt)setP(txt)
    }catch(_){}
  },[])
  if(p)return<span>{p}</span>
  return<span>{_t(lang,"0,16 €","$0.17","$0.17")}</span>
}

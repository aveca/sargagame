import React,{useState,useEffect,useMemo,Suspense}from"react"
import {_t,track,IS_NEW_REGION,REGION,classifyBeachCoast,BEACH_TO_SARG,haversine,US_UNITS,ErrBound,HeroScene,ScrollStory} from "./Sargasses_PROD"

function GameFunnel({beach,lang,island,sargData,userPos,pickBeaches,onOpenBeach,onShowMap,onFav,onPremium,exiting}){
  const T=(fr,en,es)=>_t(lang,fr,en,es)
  const [stage,setStage]=useState("vibe") // vibe → coast (sélection) → scan (LE SCAN, beat 2)
  const [vibe,setVibe]=useState(null)
  const [chosenBeach,setChosenBeach]=useState(null)
  const [rm]=useState(()=>{try{return window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(_){return false}})
  useEffect(()=>{track("sg_hero_shown",{beach_id:beach.id,status:beach.status,geoloc:!!userPos,funnel:"game"})},[])
  // Jeton-preuve : la plus PROPRE maintenant (donnée réelle, score qui monte 0→N)
  const proof=(pickBeaches&&pickBeaches[0])||beach
  const [cnt,setCnt]=useState(()=>rm?(proof?.score??0):0)
  useEffect(()=>{
    if(rm)return
    const target=proof?.score??0
    let raf=0,start=0
    const step=ts=>{if(!start)start=ts;const k=Math.min(1,(ts-start)/900);setCnt(Math.round(target*(1-Math.pow(1-k,3))));if(k<1)raf=requestAnimationFrame(step)}
    raf=requestAnimationFrame(step)
    return()=>cancelAnimationFrame(raf)
  },[proof&&proof.id])
  // Beat 2 LE SCAN : animations CSS pures (keyframes) déclenchées au montage de
  // la scène — JAMAIS de rAF/var pilotée (un rAF throttlé rendrait la scène
  // invisible). reduced-motion = état final statique (cf. <style>).
  const upd=(()=>{try{
    const ts=sargData?.updatedAt||sargData?.erddapTimestamp
    return ts?new Date(ts).toLocaleTimeString(lang==="fr"?"fr-FR":lang==="es"?"es-MX":"en-US",{hour:"2-digit",minute:"2-digit"}):""
  }catch(_){return""}})()
  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const wordmark=IS_NEW_REGION
    ?((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"").toUpperCase())
    :(island==="gp"?"SARGASSES GUADELOUPE":"SARGASSES MARTINIQUE")
  const VIBES=[
    {k:"swim",label:T("Nager","Swim","Nadar"),g:["#2BB7C4","#0E6E78"]},
    {k:"photo",label:T("Photos & Reels","Photos & Reels","Fotos & Reels"),g:["#F2B860","#C97E3A"]},
    {k:"meet",label:T("Rencontrer","Meet up","Conocer"),g:["#F2A968","#D9646E"]},
    {k:"family",label:T("Famille","Family","Familia"),g:["#7FC3A6","#2E8B6B"]},
    {k:"escape",label:T("S'évader","Escape","Evadir"),g:["#9B8BE0","#5B4B9E"]},
  ]
  const vibeLabel=(VIBES.find(v=>v.k===vibe)||{}).label||""
  const statusCol=b=>b.status==="clean"?"#FFC72C":b.status==="moderate"?"#F59E0B":"#E8522A"
  const statusShort=b=>b.status==="clean"?T("Propre","Clean","Limpia"):b.status==="moderate"?T("Modéré","Moderate","Moderada"):T("À éviter","Avoid","Evitar")
  // Sélection RÉELLE pondérée par l'envie (champs réels : score, snorkel, kids,
  // parking, drive, côte) — chaque envie donne un gagnant genuinement différent
  // (jamais de fausse personnalisation, garde-fou du concept).
  const ranked=useMemo(()=>{
    const list=(pickBeaches||[]).filter(b=>b.status&&b.score!=null&&b.lat)
    const sh=b=>{try{return classifyBeachCoast(b.lat,b.lng,b.island)==="sheltered"}catch(_){return false}}
    const w=b=>{
      let s=(b.score||0)
      if(vibe==="swim")s+=(b.snorkel?6:0)+(sh(b)?8:0)
      else if(vibe==="photo")s+=(sh(b)?4:0)+((b.score||0)>=80?6:0)
      else if(vibe==="meet")s+=(b.parking?6:0)+((b.drive!=null&&b.drive<25)?9:0)
      else if(vibe==="family")s+=(b.kids?12:0)+(b.parking?5:0)+(sh(b)?6:0)
      else if(vibe==="escape")s+=((b.drive!=null&&b.drive>35)?10:0)+(b.snorkel?4:0)
      return s
    }
    return [...list].sort((a,b)=>w(b)-w(a)).slice(0,5)
  },[pickBeaches,vibe])
  const pickVibe=v=>{setVibe(v.k);track("sg_funnel_vibe",{vibe:v.k});setStage("coast")}
  const openBeach=b=>{track("sg_funnel_pick",{beach_id:b.id,vibe:vibe||"_",score:b.score});onOpenBeach&&onOpenBeach(b)}
  // Beat 2 LE SCAN : taper une plage classée n'ouvre plus la fiche d'un coup —
  // on entre d'abord dans le scan (le satellite analyse CETTE plage), puis « Voir
  // le résultat » ouvre la vraie fiche. Garde tout le parcours actuel intact.
  const goScan=b=>{setChosenBeach(b);setFaved(false);track("sg_funnel_scan_view",{beach_id:b.id,vibe:vibe||"_"});setStage("scan")}
  // Beat 3 LE VERDICT : actions de capture photogéniques (partage social) +
  // appropriation (favori = pont vers le veilleur). Partage = donnée publique.
  const [faved,setFaved]=useState(false)
  const shareBeach=b=>{
    const txt=`${b.name} ${b.score}/100 · ${statusShort(b)} ${T("aujourd'hui","today","hoy")} ☀️`
    const url=(typeof window!=="undefined"&&window.location&&window.location.origin)||""
    track("sg_share",{beach_id:b.id,method:"funnel"})
    try{if(navigator.share){navigator.share({title:b.name,text:txt,url}).catch(()=>{});return}}catch(_){}
    try{navigator.clipboard&&navigator.clipboard.writeText(`${txt} ${url}`.trim())}catch(_){}
  }
  // toggleFav (onFav) gère DÉJÀ sg_fav_add/sg_fav_remove — ici un event funnel
  // distinct pour l'attribution, sans double-fire ni event contradictoire.
  const favBeach=b=>{setFaved(v=>!v);track("sg_funnel_fav",{beach_id:b.id});onFav&&onFav(b)}
  // Beat 4 — honnêteté FTC/DSA : l'alerte n'existe QUE si le forecast J+1..J+2 de
  // la plage choisie se dégrade VRAIMENT (jamais de fausse urgence). Sinon null →
  // pas de pitch d'alerte, le verdict mène direct à la fiche.
  const j2info=useMemo(()=>{
    if(!chosenBeach)return null
    const wkId=IS_NEW_REGION?chosenBeach.id:BEACH_TO_SARG[chosenBeach.id]
    const fc=sargData&&sargData.weekly&&sargData.weekly[wkId]&&sargData.weekly[wkId].forecast
    if(!fc||!fc.length)return null
    const RANK={clean:0,moderate:1,avoid:2}
    const today=(RANK[fc[0]&&fc[0].status]!=null?RANK[fc[0].status]:RANK[chosenBeach.status])||0
    for(let i=1;i<=2&&i<fc.length;i++){
      const r=RANK[fc[i]&&fc[i].status]
      if(r!=null&&r>today)return{day:i,date:fc[i].date,status:fc[i].status}
    }
    return null
  },[chosenBeach,sargData])
  const dayName=j2info?(()=>{try{return new Date(j2info.date+"T12:00:00Z").toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long"})}catch(_){return""}})():""
  const distTxt=b=>{if(!userPos||!b.lat)return b.drive!=null?`${b.drive} min`:"";const km=haversine(userPos.lat,userPos.lng,b.lat,b.lng);return US_UNITS?`${Math.max(1,Math.round(km*0.621))} mi`:`${Math.max(1,Math.round(km))} km`}
  return(
    <div role="dialog" aria-modal="true" aria-label={T("Trouve ta plage","Find your beach","Encuentra tu playa")} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",animation:"fadeIn .35s ease-out",
      opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{`
.gf-cam{transition:transform .64s cubic-bezier(.34,1.56,.64,1)}
.gf-chip{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),box-shadow .2s ease}
.gf-chip:active{transform:scale(.94)}
.gf-card{transition:transform .18s cubic-bezier(.175,.885,.32,1.275),border-color .2s ease}
.gf-card:active{transform:scale(.975)}
.gf-pulse{animation:gfPulse 2.6s ease-in-out 1 both}
@keyframes gfPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.18);opacity:.7}}
.gf-panel{animation:gfRise .5s cubic-bezier(.22,.61,.36,1) both}
@keyframes gfRise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes gfIgnite{from{opacity:0;transform:translateY(14px) scale(.86)}to{opacity:1;transform:none}}
@keyframes gfPx{from{opacity:0;transform:scale(.5)}to{opacity:.9;transform:none}}
.gf-px{animation:gfPx .55s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--d,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfScanGlow{0%,100%{opacity:.3}50%{opacity:.75}}
@keyframes gfSweep{from{transform:translateY(140px)}to{transform:translateY(452px)}}
.gf-scanline{animation:gfScanGlow 1.4s ease-in-out infinite,gfSweep 2.4s ease-in-out both}
@keyframes gfSatDrop{from{transform:translate(400px,24px)}to{transform:translate(400px,142px)}}
.gf-sat{animation:gfSatDrop 2.4s cubic-bezier(.4,0,.2,1) both}
@keyframes gfFade{from{opacity:0}to{opacity:1}}
.gf-scanfx{animation:gfFade .45s ease-out both}
.gf-medal{animation:gfFade .5s ease-out .9s both}
@keyframes gfBlobIn{from{transform:scale(.55)}to{transform:scale(1)}}
.gf-blob{animation:gfBlobIn .6s cubic-bezier(.34,1.56,.64,1) both;transform-box:fill-box;transform-origin:center}
@keyframes gfDotIn{from{transform:scale(.3)}to{transform:scale(1)}}
.gf-dot{animation:gfDotIn .5s cubic-bezier(.34,1.56,.64,1) both;animation-delay:var(--dd,0ms);transform-box:fill-box;transform-origin:center}
@keyframes gfRing{to{stroke-dashoffset:-48}}
.gf-ring{animation:gfRing 6s linear 1 both}
@keyframes gfArrive{0%{transform:translateX(36px)}100%{transform:translateX(-8px)}}
.gf-arrive{animation:gfArrive 5s ease-in-out 1 both alternate}
@keyframes gfArrowDash{to{stroke-dashoffset:-24}}
.gf-arrow{animation:gfArrowDash 1.8s linear 1 both}
@keyframes gfAlertPulse{0%{transform:scale(.5);opacity:.7}100%{transform:scale(2.1);opacity:0}}
.gf-alertpulse{animation:gfAlertPulse 2.2s ease-out 1 both}
@media (prefers-reduced-motion:reduce){.gf-cam{transition:none}.gf-panel,.gf-chip,.gf-card{animation:none!important}.gf-pulse,.gf-scanline,.gf-sat,.gf-medal,.gf-scanfx,.gf-blob,.gf-dot,.gf-ring,.gf-arrive,.gf-arrow,.gf-alertpulse{animation:none!important}.gf-px{animation:none!important;opacity:.9}.gf-medal,.gf-scanfx{opacity:1}.gf-sat{transform:translate(400px,142px)}.gf-scanline{transform:translateY(300px)}.gf-blob,.gf-dot{transform:scale(1)}}
      `}</style>
      {/* PREMIER ÉCRAN (100svh) : le funnel-jeu. On peut ensuite SCROLLER dans le
          même monde (méthode + veilleur) — le scroll-SVG est rebranché. */}
      <section style={{position:"relative",height:"100svh",overflow:"hidden"}}>
      {/* LE MONDE — dolly-in : il grossit quand on entre dans la sélection */}
      <div className="gf-cam" aria-hidden style={{position:"absolute",inset:0,transformOrigin:"50% 64%",
        transform:stage==="scan"?"scale(1.22) translateY(-4%)":stage==="verdict"?"scale(1.2) translateY(-3%)":stage==="coast"?"scale(1.16) translateY(-2%)":"scale(1)"}}>
        <ErrBound><Suspense fallback={null}><HeroScene/></Suspense></ErrBound>
      </div>
      <div aria-hidden style={{position:"absolute",inset:0,pointerEvents:"none",transition:"background .5s ease",
        background:stage==="scan"
          ?"linear-gradient(180deg,rgba(5,18,24,.72) 0%,rgba(8,30,40,.4) 36%,rgba(10,23,20,.86) 70%,#120821 100%)"
          :stage==="verdict"
          ?"linear-gradient(180deg,rgba(10,23,20,.45) 0%,rgba(10,23,20,.1) 28%,rgba(10,23,20,.5) 50%,rgba(10,23,20,.9) 76%,#120821 100%)"
          :stage==="alert"
          ?"linear-gradient(180deg,rgba(4,11,22,.86) 0%,rgba(4,11,22,.62) 38%,rgba(6,16,18,.9) 72%,#120821 100%)"
          :stage==="coast"
          ?"linear-gradient(180deg,rgba(10,23,20,.5) 0%,rgba(10,23,20,.22) 24%,rgba(10,23,20,.86) 62%,#120821 100%)"
          :"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 30%,rgba(10,23,20,.8) 74%,#120821 100%)"}}/>
      {/* BEAT 2 — LE SCAN : scène SVG (le satellite descend, faisceau, pixels de
          la côte qui s'allument, médaillon-preuve Sentinel-6). opacity pilotée
          par --gfs2 (rAF). Continuité du monde : même satellite/faisceau/teal
          que HeroScene + ScrollStory. */}
      {stage==="scan"&&(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs>
            <linearGradient id="gfBeam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFD884" stopOpacity=".5"/>
              <stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {/* le satellite Sentinel-6 descend de l'orbite, faisceau vers la baie */}
          <g className="gf-sat">
            <polygon points="-8,16 8,16 44,330 -44,330" fill="url(#gfBeam)" opacity=".5"/>
            <rect x="-30" y="-4" width="19" height="8" rx="1.5" fill="#5b3a8e"/>
            <rect x="11" y="-4" width="19" height="8" rx="1.5" fill="#5b3a8e"/>
            <rect x="-12" y="-11" width="24" height="21" rx="3" fill="#5b3a8e"/>
            <rect x="-12" y="-11" width="24" height="7" rx="3" fill="#FFC72C"/>
          </g>
          {/* la ligne de scan balaie la baie */}
          <rect className="gf-scanline" x="-40" width="880" height="3" rx="1.5" fill="#3fd07f"/>
          {/* les pixels de la côte s'allument en cascade (teinte vers le statut) */}
          <g>
            {[...Array(15)].map((_,i)=>{
              const col=i%5,row=Math.floor(i/5)
              const c=["#5b3a8e","#5b3a8e","#FFC72C","#FFC72C","#F59E0B"][col]
              return <rect key={i} className="gf-px" x={326+col*30} y={272+row*30} width="22" height="22" rx="5" fill={c}
                style={{"--d":`${(row*5+col)*55}ms`}}/>
            })}
          </g>
          {/* médaillon-preuve : Sentinel-6 / NASA-JPL / Copernicus */}
          <g className="gf-medal" transform="translate(400,408)">
            <circle r="34" fill="#08251F" stroke="#FFC72C" strokeWidth="2"/>
            <circle r="34" fill="none" stroke="#5b3a8e" strokeWidth="1" strokeDasharray="3 6" opacity=".65"/>
            <g transform="scale(.7)">
              <rect x="-26" y="-3" width="15" height="6" rx="1.2" fill="#5b3a8e"/>
              <rect x="11" y="-3" width="15" height="6" rx="1.2" fill="#5b3a8e"/>
              <rect x="-9" y="-8" width="18" height="15" rx="2" fill="#5b3a8e"/>
              <rect x="-9" y="-8" width="18" height="5" rx="2" fill="#FFC72C"/>
            </g>
          </g>
        </svg>
      )}
      {/* BEAT 3 — LE VERDICT : score-blob (squircle candy) de la plage choisie +
          les plages alternatives en orbite + glitter. SVG base-visible (jamais
          gated sur une anim) ; les anims = pop d'entrée (scale) + ring rotatif. */}
      {stage==="verdict"&&chosenBeach&&(()=>{
        const bc=statusCol(chosenBeach)
        const alts=ranked.filter(b=>b.id!==chosenBeach.id).slice(0,3)
        const POS=[[400,182],[520,388],[280,388]],RR=[20,16,14]
        return(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <circle cx="400" cy="306" r="106" fill="none" stroke="#5b3a8e" strokeWidth="1.2" strokeDasharray="3 9" opacity=".32" className="gf-ring"/>
          {alts.map((b,i)=>(
            <g key={b.id} transform={`translate(${POS[i][0]},${POS[i][1]})`}>
              <g className="gf-dot" style={{"--dd":`${320+i*90}ms`}}>
                <circle r={RR[i]} fill="#10231E" stroke="rgba(255,255,255,.14)" strokeWidth="1.5"/>
                <text x="0" y={RR[i]*.34} textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize={RR[i]*.95} fill={statusCol(b)}>{b.score}</text>
              </g>
            </g>
          ))}
          <g className="gf-blob">
            <path d="M400 216 C442 216 494 268 494 306 C494 348 442 396 400 396 C358 396 306 348 306 306 C306 268 358 216 400 216 Z" fill={bc} opacity=".16"/>
            <path d="M400 232 C436 232 478 270 478 306 C478 344 436 380 400 380 C364 380 322 344 322 306 C322 270 364 232 400 232 Z" fill="none" stroke={bc} strokeWidth="2.5" opacity=".7"/>
            <text x="400" y="318" textAnchor="middle" fontFamily="'Anton',sans-serif" fontSize="78" fill={bc} letterSpacing=".02em">{chosenBeach.score}</text>
            <text x="400" y="346" textAnchor="middle" fontSize="12.5" fill="rgba(255,255,255,.5)" fontWeight="700" letterSpacing=".14em">/100</text>
          </g>
        </svg>
        )})()}
      {/* BEAT 4 — L'ALERTE J+2 : scène de nuit, le banc qui dérive vers la côte,
          flèche d'arrivée, notif téléphone. Honnête (seulement si vraie
          dégradation). SVG base-visible. */}
      {stage==="alert"&&chosenBeach&&(
        <svg aria-hidden viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"
          style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <g opacity=".6">
            <circle cx="96" cy="60" r="1.1" fill="#fff" opacity=".5"/><circle cx="238" cy="100" r=".9" fill="#fff" opacity=".4"/>
            <circle cx="560" cy="84" r="1" fill="#fff" opacity=".45"/><circle cx="700" cy="120" r="1.1" fill="#fff" opacity=".5"/>
            <circle cx="430" cy="150" r=".8" fill="#9ADCD4" opacity=".4"/>
          </g>
          <path d="M-40 432 Q200 412 430 422 Q640 430 840 450 L840 600 L-40 600Z" fill="#0A1A16"/>
          <path d="M-40 432 Q200 412 430 422 Q640 430 840 450" fill="none" stroke="#1A4A44" strokeWidth="2" opacity=".55"/>
          <g className="gf-arrive">
            <g transform="translate(438,394) scale(.85)"><ellipse rx="14" ry="5" fill="#5a4410"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#6a5418"/><ellipse cx="8" cy="-2" rx="8" ry="3.5" fill="#3d2c08"/></g>
            <g transform="translate(486,378) scale(.6)"><ellipse rx="14" ry="5" fill="#5a4410"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#6a5418"/></g>
          </g>
          <path className="gf-arrow" d="M520 296 Q488 342 455 386" fill="none" stroke="#E8522A" strokeWidth="2.5" strokeDasharray="5 7" opacity=".75"/>
          <g transform="translate(300,248)">
            <circle className="gf-alertpulse" r="46" fill="none" stroke="#E8522A" strokeWidth="1.5" opacity=".5" style={{transformBox:"fill-box",transformOrigin:"center"}}/>
            <rect x="-30" y="-54" width="60" height="108" rx="11" fill="#10231E" stroke="rgba(255,255,255,.22)" strokeWidth="1.5"/>
            <rect x="-23" y="-30" width="46" height="42" rx="7" fill="#1A3A2E"/>
            <path d="M0 -22 l9 16 h-18 z" fill="none" stroke="#FFC72C" strokeWidth="2" strokeLinejoin="round"/>
            <rect x="-.9" y="-12" width="1.8" height="6" rx=".9" fill="#FFC72C"/><circle cx="0" cy="-3.5" r="1.1" fill="#FFC72C"/>
            <text x="0" y="24" textAnchor="middle" fontSize="7.5" fill="#FFC72C" fontWeight="700" letterSpacing=".04em">BANC J+{j2info?j2info.day:2}</text>
          </g>
        </svg>
      )}
      {/* barre haute */}
      <div style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"calc(14px + env(safe-area-inset-top)) 18px 0",maxWidth:560,margin:"0 auto"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:".14em",color:"#fff",opacity:.92}}>{wordmark}</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10.5,fontWeight:700,letterSpacing:".06em",
          background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",padding:"5px 10px",borderRadius:999}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E"}}/>
          LIVE{upd?` · ${upd}`:""}
        </span>
      </div>
      {/* contenu bas */}
      <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 20px calc(16px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto"}}>
        {stage==="vibe"&&(
          <div key="vibe" className="gf-panel">
            {proof&&(
              <div style={{display:"inline-flex",alignItems:"baseline",gap:8,marginBottom:14,
                background:"rgba(10,23,20,.42)",border:"1px solid rgba(255,199,44,.3)",borderRadius:999,padding:"7px 13px"}}>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:".07em",color:"#FFC72C",textTransform:"uppercase"}}>{T("Plus propre maintenant","Cleanest now","Más limpia ahora")}</span>
                <span style={{fontSize:12.5,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:130}}>{proof.name}</span>
                <span style={{fontFamily:"'Anton',sans-serif",fontSize:18,color:"#FFC72C",letterSpacing:".02em"}}>{cnt}<span style={{fontSize:11,opacity:.7}}>/100</span></span>
              </div>
            )}
            <div style={{fontSize:11,fontWeight:600,letterSpacing:".14em",color:"rgba(255,255,255,.6)",marginBottom:8,textTransform:"uppercase"}}>
              {dateLong} · {T("SATELLITE COPERNICUS","COPERNICUS SATELLITE","SATÉLITE COPERNICUS")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(34px,9vw,52px)",lineHeight:.98,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 10px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>
              {T("Pourquoi la plage aujourd'hui ?","Why the beach today?","¿Por qué la playa hoy?")}
            </h1>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#5b3a8e",boxShadow:"0 0 10px #5b3a8e",flexShrink:0}}/>
              <span style={{fontSize:13,color:"rgba(255,255,255,.74)",fontWeight:600}}>
                {T("J'ai scanné tes côtes ce matin. Dis-moi ton envie.","I scanned your coast this morning. Tell me your mood.","Escaneé tu costa esta mañana. Dime tu plan.")}
              </span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
              {VIBES.map(v=>(
                <button key={v.k} className="gf-chip" onClick={()=>pickVibe(v)}
                  style={{cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,color:"#120821",
                    border:"none",borderRadius:999,padding:"13px 18px",
                    background:`linear-gradient(135deg,${v.g[0]},${v.g[1]})`,
                    boxShadow:`0 6px 18px ${v.g[1]}55,inset 0 1px 0 rgba(255,255,255,.4)`}}>
                  {v.label}
                </button>
              ))}
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"16px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — montre-moi la carte","Skip — show me the map","Saltar — muéstrame el mapa")}
            </button>
          </div>
        )}
        {stage==="coast"&&(
          <div key="coast" className="gf-panel">
            <button onClick={()=>{setStage("vibe");setVibe(null)}} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Changer d'envie","Change mood","Cambiar plan")}
            </button>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#FFC72C",marginBottom:8,textTransform:"uppercase"}}>
              {T("Pour","For","Para")} {vibeLabel} · {T("aujourd'hui","today","hoy")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7vw,42px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 14px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {T("Tes plages, classées pour toi","Your beaches, ranked for you","Tus playas, en tu orden")}
            </h1>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ranked.map((b,i)=>(
                <button key={b.id} className="gf-card" onClick={()=>goScan(b)}
                  style={{animation:rm?"none":"gfIgnite .5s cubic-bezier(.34,1.56,.64,1) both",animationDelay:rm?undefined:`${i*70}ms`,
                    display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",
                    background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.09)",borderRadius:15,
                    padding:"13px 15px",cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{width:12,height:12,flexShrink:0,borderRadius:6,background:statusCol(b),boxShadow:`0 0 10px ${statusCol(b)}`}}/>
                  <span style={{flex:1,minWidth:0}}>
                    <span style={{display:"block",fontWeight:800,fontSize:15,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span>
                    <span style={{display:"block",fontSize:11.5,color:"rgba(255,255,255,.52)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {statusShort(b)}{b.commune?` · ${b.commune}`:""}{distTxt(b)?` · ${distTxt(b)}`:""}
                    </span>
                  </span>
                  <span style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:statusCol(b),letterSpacing:".02em",lineHeight:1}}>{b.score}</span>
                  <span style={{color:"rgba(255,255,255,.32)",fontSize:19,lineHeight:1}}>›</span>
                </button>
              ))}
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"14px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              {T("Voir toutes les plages sur la carte","See every beach on the map","Ver todas las playas en el mapa")}
            </button>
          </div>
        )}
        {stage==="scan"&&chosenBeach&&(
          <div key="scan" className="gf-panel">
            <button onClick={()=>setStage("coast")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Retour","Back","Volver")}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span className="gf-pulse" style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#3fd07f",boxShadow:"0 0 10px #3fd07f",flexShrink:0}}/>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#3fd07f",textTransform:"uppercase"}}>
                {T("Le satellite scanne","Satellite scanning","El satélite escanea")}
              </span>
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7vw,42px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 8px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {chosenBeach.name}
            </h1>
            <div style={{fontSize:12,color:"rgba(255,255,255,.6)",fontFamily:"ui-monospace,SFMono-Regular,monospace",marginBottom:16}}>
              {T("Sentinel-6 analyse les nappes","Sentinel-6 reads the rafts","Sentinel-6 analiza las manchas")} · NASA/JPL · Copernicus
            </div>
            <button onClick={()=>setStage("verdict")} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Voir le résultat →","See the result →","Ver el resultado →")}
            </button>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — montre-moi la carte","Skip — show me the map","Saltar — muéstrame el mapa")}
            </button>
          </div>
        )}
        {stage==="verdict"&&chosenBeach&&(
          <div key="verdict" className="gf-panel">
            <button onClick={()=>setStage("coast")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Autres plages","Other beaches","Otras playas")}
            </button>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:".12em",color:"#FFC72C",marginBottom:8,textTransform:"uppercase"}}>
              {T("Ta journée de plage","Your beach day","Tu día de playa")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(30px,8vw,46px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 6px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.4)"}}>
              {chosenBeach.name}
            </h1>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,.72)",fontWeight:600,marginBottom:16,lineHeight:1.4}}>
              {chosenBeach.status==="clean"?T("Eau claire, sable propre — c'est le bon jour.","Clear water, clean sand — today's the day.","Agua clara, arena limpia — es el día.")
               :chosenBeach.status==="moderate"?T("Correct aujourd'hui — surveille demain.","Okay today — keep an eye on tomorrow.","Bien hoy — ojo con mañana.")
               :T("Sargasses présentes — regarde les alternatives autour.","Sargassum present — check the alternatives around.","Sargazo presente — mira las alternativas.")}
            </div>
            {j2info&&(
              <button onClick={()=>{track("sg_funnel_alert_view",{beach_id:chosenBeach.id,day:j2info.day});setStage("alert")}}
                className="gf-chip" style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",cursor:"pointer",
                fontFamily:"inherit",borderRadius:14,padding:"12px 14px",marginBottom:10,
                background:"rgba(232,82,42,.12)",border:"1px solid rgba(232,82,42,.4)"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F4845F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
                <span style={{flex:1,minWidth:0}}>
                  <span style={{display:"block",fontWeight:800,fontSize:13.5,color:"#F4845F"}}>{T(`Sargasses prévues ${dayName}`,`Sargassum forecast ${dayName}`,`Sargazo previsto ${dayName}`)}</span>
                  <span style={{display:"block",fontSize:12,color:"rgba(255,255,255,.6)"}}>{T("Sois prévenu la veille →","Get warned the day before →","Te aviso la víspera →")}</span>
                </span>
              </button>
            )}
            <button onClick={()=>openBeach(chosenBeach)} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Voir la fiche complète →","See the full report →","Ver la ficha completa →")}
            </button>
            <div style={{display:"flex",gap:10,marginTop:10}}>
              <button onClick={()=>shareBeach(chosenBeach)} className="gf-chip" style={{flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,
                cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14,color:"#fff",borderRadius:14,padding:"12px 14px",
                background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.14)"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>
                {T("Partager","Share","Compartir")}
              </button>
              <button onClick={()=>favBeach(chosenBeach)} aria-pressed={faved} aria-label={T("Épingler","Pin","Fijar")} className="gf-chip" style={{flex:"none",width:52,display:"inline-flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",borderRadius:14,padding:"12px",background:faved?"rgba(255,199,44,.16)":"rgba(16,35,30,.92)",
                border:`1px solid ${faved?"rgba(255,199,44,.5)":"rgba(255,255,255,.14)"}`}}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill={faved?"#FFC72C":"none"} stroke={faved?"#FFC72C":"rgba(255,255,255,.7)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
              </button>
            </div>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — toutes les plages","Skip — all beaches","Saltar — todas las playas")}
            </button>
          </div>
        )}
        {stage==="alert"&&chosenBeach&&(
          <div key="alert" className="gf-panel">
            <button onClick={()=>setStage("verdict")} style={{display:"inline-flex",alignItems:"center",gap:5,
              background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.16)",borderRadius:999,
              color:"#fff",fontFamily:"inherit",fontSize:12.5,fontWeight:700,padding:"7px 13px",cursor:"pointer",marginBottom:12}}>
              ‹ {T("Retour","Back","Volver")}
            </button>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:11,fontWeight:700,letterSpacing:".1em",color:"#F4845F",marginBottom:8,textTransform:"uppercase"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F4845F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>
              {T("Prévision satellite","Satellite forecast","Pronóstico satelital")}
            </div>
            <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,7.5vw,44px)",lineHeight:1,
              letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 8px",color:"#fff",textShadow:"0 2px 24px rgba(0,0,0,.5)"}}>
              {T(`Un banc arrive ${dayName}`,`A raft lands ${dayName}`,`Llega un banco el ${dayName}`)}
            </h1>
            <div style={{fontSize:13.5,color:"rgba(255,255,255,.74)",fontWeight:600,marginBottom:18,lineHeight:1.45}}>
              {T(`Sur ${chosenBeach.name}, l'eau se trouble ${dayName}. Je te préviens la veille — à temps pour changer de plan.`,
                 `At ${chosenBeach.name}, the water turns ${dayName}. I warn you the day before — in time to change plans.`,
                 `En ${chosenBeach.name}, el agua empeora el ${dayName}. Te aviso la víspera — a tiempo para cambiar de plan.`)}
            </div>
            <button onClick={()=>onPremium&&onPremium("funnel_alert")} className="gf-chip" style={{display:"block",width:"100%",textAlign:"center",
              cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,
              padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
              {T("Sois prévenu la veille →","Get warned the day before →","Te aviso la víspera →")}
            </button>
            <button onClick={()=>openBeach(chosenBeach)} style={{display:"block",width:"100%",textAlign:"center",marginTop:10,
              cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:14,color:"#fff",borderRadius:14,padding:"12px 16px",
              background:"rgba(16,35,30,.92)",border:"1px solid rgba(255,255,255,.14)"}}>
              {T("Voir la fiche d'abord","See the report first","Ver la ficha primero")}
            </button>
            <button onClick={onShowMap} style={{display:"block",margin:"12px auto 0",background:"none",border:"none",
              color:"rgba(255,255,255,.55)",fontFamily:"inherit",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
              {T("Passer — toutes les plages","Skip — all beaches","Saltar — todas las playas")}
            </button>
          </div>
        )}
      </div>
      </section>
      {/* INTÉGRATION fil rouge : le scroll-SVG revient — sous le funnel, on
          CONTINUE dans le même monde (méthode scrollytelling + veilleur) au lieu
          de s'arrêter au tap-funnel. Mobile retrouve son scroll ; le bras control
          (HeroVerdict) reste inchangé. */}
      <section style={{padding:"58px 22px 6px",maxWidth:560,margin:"0 auto"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:".16em",color:"#FFC72C",textTransform:"uppercase",marginBottom:10}}>
          {T("La méthode","The method","El método")}
        </div>
        <h2 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,40px)",lineHeight:1.02,letterSpacing:".01em",textTransform:"uppercase",margin:0,color:"#fff"}}>
          {T("On regarde la mer pour toi","We watch the sea for you","Miramos el mar por ti")}
        </h2>
      </section>
      <ErrBound><Suspense fallback={null}><ScrollStory lang={lang} onShowMap={onShowMap}/></Suspense></ErrBound>
      <section style={{padding:"28px 22px calc(40px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto"}}>
        <div style={{background:"linear-gradient(145deg,#10231E,#120821)",border:"1px solid rgba(255,199,44,.25)",borderRadius:20,padding:"24px 20px",textAlign:"center"}}>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:23,color:"#fff",letterSpacing:".02em",textTransform:"uppercase",marginBottom:6}}>{T("Ton veilleur personnel","Your personal watcher","Tu vigía personal")}</div>
          <div style={{fontSize:13.5,color:"rgba(255,255,255,.66)",marginBottom:16,lineHeight:1.45}}>{T("Je surveille ta plage et je te préviens la veille où elle se trouble.","I watch your beach and warn you the day before it turns.","Vigilo tu playa y te aviso la víspera de que cambie.")}</div>
          <button onClick={()=>onPremium&&onPremium("funnel_scroll")} className="gf-chip" style={{display:"block",width:"100%",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,color:"#120821",border:"none",borderRadius:16,padding:"15px 20px",background:"linear-gradient(135deg,#FFE08A,#FFC72C)",boxShadow:"0 8px 24px rgba(255,199,44,.32)"}}>
            {T("Découvrir le veilleur →","Meet the watcher →","Descubrir el vigía →")}
          </button>
          <button onClick={onShowMap} style={{display:"block",width:"100%",marginTop:10,background:"none",border:"none",color:"rgba(255,255,255,.6)",fontFamily:"inherit",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            {T("Ou ouvrir la carte gratuite","Or open the free map","O abrir el mapa gratis")}
          </button>
        </div>
      </section>
    </div>
  )
}

export default GameFunnel

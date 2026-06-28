import React,{useState,useEffect,useRef,Suspense}from"react"
import {_t,track,IS_NEW_REGION,REGION,BEACH_TO_SARG,haversine,US_UNITS,PAY_CAPTURE_ONLY,ErrBound,BrandIcon,BeachScene,Veilleur,HeroScene,AlertScene,ScrollStory} from "./Sargasses_PROD"

function HeroVerdict({beach,lang,island,sargData,userPos,onOpen,onShowMap,onPremium,onOpenBeach,topBeaches,pickBeaches,exiting}){
  const [pickQ,setPickQ]=useState("")
  useEffect(()=>{track("sg_hero_shown",{beach_id:beach.id,status:beach.status,geoloc:!!userPos})},[])
  // Hero média = HeroScene (scène vectorielle, directive user 12/06). L'ancien
  // empilement photo/WebGL/loops DepthFlow est démonté du hero — SceneCanvas et
  // les loops (/videos/hero/, release depthflow-heroes) restent disponibles
  // pour un réemploi (fiches, about). LCP = plus aucun fetch média en hero.
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onShowMap()}
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h)
  },[onShowMap])
  // Landing scrollable (modèle SpaceX, demande user 2026-06-11) : hero 100svh
  // puis sections — verdict du jour, méthode, premium — en scroll naturel.
  // Reveals à l'IntersectionObserver (root = ce conteneur), sticky bar quand
  // le hero sort du viewport, tout neutralisé par prefers-reduced-motion.
  const wrapRef=useRef(null)
  const heroRef=useRef(null)
  const [stuck,setStuck]=useState(false)
  useEffect(()=>{
    const root=wrapRef.current;if(!root)return
    const hero=heroRef.current
    const io1=hero?new IntersectionObserver(es=>setStuck(!es[0].isIntersecting),{root,threshold:.06}):null
    if(io1)io1.observe(hero)
    const seen={}
    const io2=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue
      e.target.classList.add("in")
      const s=e.target.getAttribute("data-s")
      if(s&&!seen[s]){seen[s]=1;track("sg_landing_view",{s})}
      io2.unobserve(e.target)}},{root,threshold:.18})
    root.querySelectorAll(".sg-rv").forEach(n=>io2.observe(n))
    return()=>{io1&&io1.disconnect();io2.disconnect()}
  },[])
  const scrollNext=()=>{try{wrapRef.current?.querySelector("#sg-s2")?.scrollIntoView({behavior:"smooth",block:"start"})}catch(_){}}
  const clean=beach.status==="clean"
  const verdictTxt=clean?_t(lang,"PROPRE AUJOURD'HUI","CLEAN TODAY","SIN SARGAZO HOY")
    :beach.status==="moderate"?_t(lang,"MODÉRÉ AUJOURD'HUI","MODERATE TODAY","MODERADA HOY")
    :_t(lang,"À ÉVITER AUJOURD'HUI","AVOID TODAY","EVITAR HOY")
  const verdictBg=clean?"#FFC72C":beach.status==="moderate"?"#F59E0B":"#E8522A"
  // J+1 réel quand résolvable (weekly keyé par id sarg pour MQ/GP, id direct
  // pour les nouvelles régions) — sinon pas de promesse.
  const wkId=IS_NEW_REGION?beach.id:BEACH_TO_SARG[beach.id]
  const j1=sargData?.weekly?.[wkId]?.forecast?.[1]?.status||null
  const sub=(()=>{
    const parts=[]
    if(clean&&j1&&j1!=="clean")parts.push(_t(lang,"⚠️ Banc prévu demain — on te dira où aller","⚠️ Mat forecast tomorrow — we'll tell you where to go","⚠️ Banco previsto mañana — te diremos adónde ir"))
    else if(clean&&j1==="clean")parts.push(_t(lang,"Propre aussi demain","Clean tomorrow too","Limpia también mañana"))
    if(beach.commune)parts.push(beach.commune)
    if(userPos&&beach.lat){
      const km=haversine(userPos.lat,userPos.lng,beach.lat,beach.lng)
      parts.push(US_UNITS?`${Math.max(1,Math.round(km*0.621))} mi`:`${Math.max(1,Math.round(km))} km`)
    }
    return parts.join(" · ")
  })()
  const upd=(()=>{try{
    const ts=sargData?.updatedAt||sargData?.erddapTimestamp
    return ts?new Date(ts).toLocaleTimeString(lang==="fr"?"fr-FR":lang==="es"?"es-MX":"en-US",{hour:"2-digit",minute:"2-digit"}):""
  }catch(_){return""}})()
  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const wordmark=IS_NEW_REGION
    ?((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"").toUpperCase())
    :(island==="gp"?"SARGASSES GUADELOUPE":"SARGASSES MARTINIQUE")
  const statusShort=b=>b.status==="clean"?_t(lang,"Propre","Clean","Limpia")
    :b.status==="moderate"?_t(lang,"Modéré","Moderate","Moderada"):_t(lang,"À éviter","Avoid","Evitar")
  const statusCol=b=>b.status==="clean"?"#FFC72C":b.status==="moderate"?"#F59E0B":"#E8522A"
  const ovl={fontSize:11,fontWeight:700,letterSpacing:".16em",color:"#FFC72C",textTransform:"uppercase",marginBottom:10}
  const h2s={fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,40px)",lineHeight:1.02,
    letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 10px",color:"#fff"}
  const secPad={padding:"68px 22px 8px",maxWidth:560,margin:"0 auto"}
  return(
    <div ref={wrapRef} role="dialog" aria-modal="true" aria-label={beach.name} style={{position:"absolute",inset:0,zIndex:1050,
      background:"#120821",overflowY:"auto",overflowX:"hidden",overscrollBehavior:"contain",WebkitOverflowScrolling:"touch",
      /* PAS de fill-mode sur l'entrée : avec "both" l'animation épinglerait
         opacity:1 pour toujours et écraserait le fondu de sortie (inline) */
      animation:"fadeIn .35s ease-out",
      opacity:exiting?0:1,transform:exiting?"scale(1.04)":"none",
      transition:"opacity .3s ease,transform .3s cubic-bezier(.22,1,.36,1)"}}>
      <style>{`@keyframes sgHeroBob{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}
.sg-heroSec{position:relative;min-height:100vh}
@supports(min-height:100svh){.sg-heroSec{min-height:100svh}}
.sg-rv{opacity:0;transform:translateY(26px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
.sg-rv.in{opacity:1;transform:none}
.sg-stick{position:fixed;top:0;left:0;right:0;z-index:30;transform:translateY(-105%);transition:transform .32s cubic-bezier(.32,.72,.33,1)}
.sg-stick.on{transform:translateY(0)}
.sg-l-cards{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 14px;scrollbar-width:none}
.sg-l-cards::-webkit-scrollbar{display:none}
.sg-l-card{scroll-snap-align:start;flex:0 0 200px;border-radius:18px;overflow:hidden;background:#10231E;
  border:1px solid rgba(255,255,255,.1);cursor:pointer;text-align:left;padding:0;font-family:inherit;
  transition:transform .25s ease,border-color .25s ease}
.sg-l-card:hover{transform:translateY(-3px);border-color:rgba(255,199,44,.45)}
.sg-flow{stroke-dasharray:4 6;animation:sgFlowY 1.2s linear 1 both}
@keyframes sgFlowY{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
.sg-storyvp{height:100vh}
@supports(height:100svh){.sg-storyvp{height:100svh}}
.sgst-ring{animation:sgstRing 2.6s ease-out 1 both}
.sgst-ring2{animation:sgstRing 2.6s ease-out 1 both;animation-delay:1.3s}
@keyframes sgstRing{0%{transform:scale(.3);opacity:.85}78%,100%{transform:scale(2.3);opacity:0}}
.sgst-bob{animation:sgstBob 3.4s ease-in-out 1 both}
@keyframes sgstBob{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
@media (prefers-reduced-motion:reduce){.sg-hero-chev{animation:none!important}
.sg-rv{transition:none;opacity:1;transform:none}.sg-stick{transition:none}.sg-l-card{transition:none}.sg-flow{animation:none}
.sgst-ring,.sgst-ring2,.sgst-bob{animation:none}}`}</style>

      {/* STICKY BAR — apparaît quand le hero sort de l'écran (modèle SpaceX) */}
      <div className={"sg-stick"+(stuck?" on":"")} aria-hidden={!stuck}>
        <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"space-between",
          padding:"calc(8px + env(safe-area-inset-top)) 16px 8px",background:"rgba(10,23,20,.88)",
          backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
          <span style={{fontFamily:"'Anton',sans-serif",fontSize:11.5,letterSpacing:".12em",color:"#fff",opacity:.92,
            whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{wordmark}</span>
          <button onClick={onShowMap} style={{flexShrink:0,background:"#FFC72C",color:"#120821",border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:13,padding:"9px 16px",borderRadius:999}}>
            <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte","Open the map","Abrir el mapa")}
          </button>
        </div>
      </div>

      {/* ── ÉCRAN 1 : le verdict plein cadre (vidéo) ── */}
      <section ref={heroRef} className="sg-heroSec">
      <ErrBound><Suspense fallback={null}><HeroScene/></Suspense></ErrBound>
      {/* Le voile média couvre la photo : c'est LUI qui reçoit les taps sur
          l'image. Clarity 2026-06 : 46 rage + 670 dead clicks home — les
          visiteurs tapent la photo/le nom en attendant la fiche. 1 tap = fiche. */}
      <div aria-hidden onClick={()=>{track("sg_hero_tap",{t:"media"});onOpenBeach&&onOpenBeach(beach)}} style={{position:"absolute",inset:0,cursor:"pointer",
        background:"linear-gradient(180deg,rgba(10,23,20,.55) 0%,rgba(10,23,20,0) 26%,rgba(10,23,20,0) 42%,rgba(10,23,20,.88) 78%,#120821 100%)"}}/>
      {/* Bandeau haut : décoratif (wordmark + LIVE) mais AU-DESSUS du voile cliquable
          → sans handler il avalait le tap (dead-clicks home). On lui donne le même
          tap = ouvrir la fiche, pour récupérer ces clics morts. */}
      <div onClick={()=>{track("sg_hero_tap",{t:"topbar"});onOpenBeach&&onOpenBeach(beach)}} style={{position:"absolute",top:0,left:0,right:0,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
        padding:"calc(14px + env(safe-area-inset-top)) 18px 0",maxWidth:560,margin:"0 auto"}}>
        <span style={{fontFamily:"'Anton',sans-serif",fontSize:13,letterSpacing:".14em",color:"#fff",opacity:.92}}>{wordmark}</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:10.5,fontWeight:700,letterSpacing:".06em",
          background:"rgba(10,23,20,.5)",border:"1px solid rgba(255,255,255,.18)",color:"#fff",
          padding:"5px 10px",borderRadius:999}}>
          <span style={{width:7,height:7,borderRadius:"50%",background:"#22C55E",boxShadow:"0 0 8px #22C55E"}}/>
          LIVE{upd?` · ${upd}`:""}
        </span>
      </div>
      <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"0 20px calc(10px + env(safe-area-inset-bottom))",
        maxWidth:560,margin:"0 auto"}}>
        {userPos&&(
          <div onClick={()=>{track("sg_hero_tap",{t:"near"});onOpenBeach&&onOpenBeach(beach)}} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,letterSpacing:".05em",
            color:"#FFC72C",marginBottom:8,cursor:"pointer"}}>
            📍 {_t(lang,"LA PLUS PROCHE DE TOI","CLOSEST TO YOU","LA MÁS CERCA DE TI")}
          </div>
        )}
        <div onClick={()=>{track("sg_hero_tap",{t:"date"});onOpenBeach&&onOpenBeach(beach)}} style={{fontSize:11,fontWeight:600,letterSpacing:".14em",color:"rgba(255,255,255,.62)",marginBottom:6,textTransform:"uppercase",cursor:"pointer"}}>
          {dateLong} · {_t(lang,"SATELLITE COPERNICUS","COPERNICUS SATELLITE","SATÉLITE COPERNICUS")}
        </div>
        <h1 onClick={()=>{track("sg_hero_tap",{t:"title"});onOpenBeach&&onOpenBeach(beach)}} style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(44px,12vw,72px)",lineHeight:.96,
          letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 14px",color:"#fff",cursor:"pointer",
          textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>
          {beach.name}
        </h1>
        <div onClick={()=>{track("sg_hero_tap",{t:"verdict"});onOpenBeach&&onOpenBeach(beach)}} style={{display:"inline-flex",alignItems:"center",gap:10,background:verdictBg,color:"#120821",
          fontWeight:800,fontSize:15,letterSpacing:".02em",padding:"9px 16px",borderRadius:999,marginBottom:8,cursor:"pointer"}}>
          {verdictTxt}
          {beach.score!=null&&<span style={{fontFamily:"'Anton',sans-serif",fontSize:17,letterSpacing:".03em"}}>{beach.score}/100</span>}
        </div>
        {sub&&<div onClick={()=>{track("sg_hero_tap",{t:"sub"});onOpenBeach&&onOpenBeach(beach)}} style={{fontSize:13,color:"rgba(255,255,255,.62)",marginBottom:18,cursor:"pointer"}}>{sub}</div>}
        {/* Desktop (≥900px) : la carte est un bouton de PREMIER rang à côté du
            CTA — GSC 2026-06 : intent "carte" = 7% (MQ) / 2% (GP) des clics
            home vs 72-98% "état maintenant", mais sur grand écran les
            map-seekers doivent voir leur sortie sans chercher. Mobile : lien
            discret sous le CTA (écran étroit, status-first). */}
        {(typeof window!=="undefined"&&window.matchMedia&&window.matchMedia("(min-width:900px)").matches)?(
          <div style={{display:"flex",gap:10}}>
            <button onClick={onOpen} className="gbtn" style={{flex:1.5,textAlign:"center",
              background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={onShowMap} style={{flex:1,textAlign:"center",cursor:"pointer",fontFamily:"inherit",
              background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.35)",
              fontWeight:700,fontSize:15,padding:"16px 18px",borderRadius:18,backdropFilter:"blur(6px)"}}>
              <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.7,marginTop:3}}>
                {_t(lang,"toutes les plages, en direct","every beach, real time","todas las playas, en directo")}
              </span>
            </button>
          </div>
        ):(
          <>
            <button onClick={onOpen} className="gbtn" style={{display:"block",width:"100%",textAlign:"center",
              background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
              fontWeight:800,fontSize:17,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.32)"}}>
              {_t(lang,"Voir cette plage","See this beach","Ver esta playa")}
              <span style={{display:"block",fontWeight:500,fontSize:11.5,opacity:.75,marginTop:3}}>
                {_t(lang,"état complet · météo · prévisions 7 jours","full status · weather · 7-day forecast","estado completo · clima · pronóstico 7 días")}
              </span>
            </button>
            <button onClick={()=>{track("sg_hero_map_cta",{src:"mobile"});onShowMap()}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",
              marginTop:10,background:"rgba(10,23,20,.45)",color:"#fff",
              border:"1.5px solid rgba(255,255,255,.35)",fontFamily:"inherit",fontWeight:700,fontSize:14,
              padding:"14px 20px",borderRadius:18,backdropFilter:"blur(6px)",cursor:"pointer"}}>
              <BrandIcon name="map" size={14} accent="#FFC72C" style={{verticalAlign:"-2px",display:"inline-block"}}/>{_t(lang,"Toutes les plages sur la carte","All beaches on the map","Todas las playas en el mapa")}
            </button>
          </>
        )}
        {/* Invitation au scroll (un seul chevron, modèle SpaceX) */}
        <button onClick={scrollNext} aria-label={_t(lang,"Découvrir","Discover","Descubrir")}
          style={{display:"block",margin:"6px auto 0",background:"none",border:"none",cursor:"pointer",
            color:"rgba(255,255,255,.55)",fontSize:22,lineHeight:1,padding:6}}>
          <span className="sg-hero-chev" style={{display:"inline-block",animation:"sgHeroBob 1.8s ease-in-out 1 both"}}>⌄</span>
        </button>
      </div>
      </section>

      {/* ── ÉCRAN 2 : le verdict du jour, plage par plage ── */}
      <section id="sg-s2" style={{...secPad,scrollMarginTop:54}}>
        <div className="sg-rv" data-s="verdict">
          <div style={ovl}>{_t(lang,"Aujourd'hui","Today","Hoy")}</div>
          <h2 style={h2s}>{_t(lang,"Le verdict, plage par plage","The verdict, beach by beach","El veredicto, playa por playa")}</h2>
          <p style={{fontSize:14,lineHeight:1.55,color:"rgba(255,255,255,.62)",margin:"0 0 18px"}}>
            {_t(lang,"Pas d'avis, pas de promesses : la mesure satellite du matin.","No opinions, no promises: this morning's satellite measurement.","Sin opiniones ni promesas: la medición satelital de esta mañana.")}
            {upd?` · LIVE ${upd}`:""}
          </p>
        </div>
        {!!(topBeaches&&topBeaches.length)&&(
          <div className="sg-l-cards sg-rv">
            {topBeaches.map(b=>(
              <button key={b.id} className="sg-l-card" onClick={()=>onOpenBeach&&onOpenBeach(b)}>
                <div style={{position:"relative",height:124,overflow:"hidden"}}>
                  <BeachScene beach={b}/>
                  <span style={{position:"absolute",top:8,left:8,zIndex:2,background:statusCol(b),color:"#120821",
                    fontWeight:800,fontSize:11,padding:"4px 9px",borderRadius:999}}>
                    {statusShort(b)}{b.score!=null?` · ${b.score}`:""}
                  </span>
                </div>
                <div style={{padding:"10px 12px 12px"}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</div>
                  {b.commune&&<div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:2}}>{b.commune}</div>}
                </div>
              </button>
            ))}
          </div>
        )}
        {/* SÉLECTEUR — choisis ta plage directement depuis l'accueil (recherche
            + liste live de toutes les plages, tap = fiche). Demande user 13/06. */}
        {!!(pickBeaches&&pickBeaches.length>3)&&(()=>{
          const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
          const nq=norm(pickQ)
          const list=pickBeaches.filter(b=>!nq||norm(b.name).includes(nq)||norm(b.commune).includes(nq)).slice(0,60)
          return(
            <div className="sg-rv" style={{marginTop:24}}>
              <div style={{...ovl,marginBottom:8}}>{_t(lang,"Ta plage","Your beach","Tu playa")}</div>
              <h3 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:21,letterSpacing:".01em",
                textTransform:"uppercase",color:"#fff",margin:"0 0 12px"}}>
                {_t(lang,"Choisis ta plage","Pick your beach","Elige tu playa")}
              </h3>
              {/* Recette .sg-field comic unique : loupe SVG mono-trait + bord 2.5 ink +
                  ombre dure. input ≥16px (anti-zoom iOS). Tokens thème (comic + dark). */}
              <div style={{position:"relative",display:"flex",alignItems:"center",marginBottom:10}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                  style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                    color:"#5A5A5A",flexShrink:0,pointerEvents:"none"}}>
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.4"/>
                  <path d="M16.5 16.5 L21 21" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                </svg>
                <input value={pickQ} onChange={e=>{setPickQ(e.target.value)}}
                  type="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search"
                  onFocus={()=>track("sg_landing_pick_search",{})}
                  placeholder={_t(lang,"Chercher une plage…","Search a beach…","Buscar una playa…")}
                  style={{width:"100%",minHeight:48,boxSizing:"border-box",background:"var(--sg-card,#fff)",
                    border:"2.5px solid #0D0D0D",borderRadius:12,padding:"13px 14px 13px 42px",
                    color:"var(--sg-ink,#0D0D0D)",fontSize:16,fontWeight:600,fontFamily:"inherit",outline:"none",
                    boxShadow:"2px 2px 0 #0D0D0D"}}/>
              </div>
              <div style={{maxHeight:312,overflowY:"auto",overflowX:"hidden",display:"flex",flexDirection:"column",gap:6,
                WebkitOverflowScrolling:"touch",paddingRight:2}}>
                {list.map(b=>(
                  <button key={b.id} onClick={()=>onOpenBeach&&onOpenBeach(b)}
                    style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",
                      background:"#10231E",border:"1px solid rgba(255,255,255,.07)",borderRadius:12,
                      padding:"11px 14px",cursor:"pointer",fontFamily:"inherit"}}>
                    <span style={{width:10,height:10,borderRadius:5,flexShrink:0,background:statusCol(b),
                      boxShadow:`0 0 8px ${statusCol(b)}`}}/>
                    <span style={{flex:1,minWidth:0}}>
                      <span style={{display:"block",fontWeight:700,fontSize:14,color:"#fff",whiteSpace:"nowrap",
                        overflow:"hidden",textOverflow:"ellipsis"}}>{b.name}</span>
                      {b.commune&&<span style={{display:"block",fontSize:11.5,color:"rgba(255,255,255,.5)",
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.commune}{typeof b.drive==="number"?` · ${b.drive} min`:""}</span>}
                    </span>
                    <span style={{fontFamily:"'Anton',sans-serif",fontSize:17,color:statusCol(b),letterSpacing:".02em"}}>{b.score}</span>
                    <span style={{color:"rgba(255,255,255,.3)",fontSize:18,lineHeight:1}}>›</span>
                  </button>
                ))}
                {!list.length&&(
                  <div className="sg-empty" style={{padding:"18px 8px"}}>
                    <div className="sg-empty__veil"><Veilleur mood="serein" size={44}/></div>
                    <div className="sg-empty__title" style={{fontSize:15}}>{_t(lang,"Aucune plage trouvée","No beach found","Ninguna playa encontrada")}</div>
                    <div className="sg-empty__sub">{_t(lang,"Essaie une autre recherche — je veille sur le reste.","Try another search — I'm watching the rest.","Prueba otra búsqueda — vigilo el resto.")}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
        <button onClick={onShowMap} className="sg-rv" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          width:"100%",background:"rgba(10,23,20,.45)",color:"#fff",border:"1.5px solid rgba(255,255,255,.3)",
          cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:15,padding:"15px 18px",borderRadius:18,marginTop:14}}>
          <BrandIcon name="map" size={15} accent="#120821" style={{verticalAlign:"-2px",marginRight:6,display:"inline-block"}}/>{_t(lang,"Ouvrir la carte live","Open the live map","Abrir el mapa en vivo")}
        </button>
      </section>

      {/* ── ÉCRAN 3 : la méthode — scrollytelling plein cadre (réf Zenly, 12/06) ── */}
      <section style={{...secPad,paddingBottom:6}}>
        <div className="sg-rv" data-s="methode">
          <div style={ovl}>{_t(lang,"La méthode","The method","El método")}</div>
          <h2 style={h2s}>{_t(lang,"On regarde la mer pour vous","We watch the sea for you","Miramos el mar por ti")}</h2>
        </div>
      </section>
      {/* Le film au scroll : l'orbite → le scan → la dérive → le verdict → le choix */}
      <ErrBound><Suspense fallback={null}><ScrollStory lang={lang} onShowMap={onShowMap}/></Suspense></ErrBound>
      <section style={{...secPad,paddingTop:26}}>
        <div className="sg-rv" style={{display:"flex",flexDirection:"column",gap:14,margin:"14px 0 20px"}}>
          {[
            ["satellite",_t(lang,"Satellite Copernicus — 4 passages par jour, chaque plage","Copernicus satellite — 4 passes a day, every beach","Satélite Copernicus — 4 pasadas al día, cada playa")],
            ["score",_t(lang,"Un score 0-100 recalculé à chaque passage","A 0-100 score recomputed on every pass","Un score 0-100 recalculado en cada pasada")],
            ["cal7",_t(lang,"Prévisions 7 jours, plage par plage","7-day forecast, beach by beach","Pronóstico de 7 días, playa por playa")],
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,background:"#10231E",
              border:"1px solid rgba(255,255,255,.08)",borderRadius:16,padding:"14px 16px"}}>
              <BrandIcon name={ic} size={22} style={{marginTop:1,color:"rgba(255,255,255,.92)"}}/>
              <span style={{fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,.85)",fontWeight:600}}>{txt}</span>
            </div>
          ))}
        </div>
        <button onClick={onOpen} className="sg-rv" style={{display:"block",background:"none",border:"none",cursor:"pointer",
          fontFamily:"inherit",color:"#FFC72C",fontWeight:800,fontSize:15,padding:0}}>
          {_t(lang,`Voir ${beach.name} en détail →`,`See ${beach.name} in detail →`,`Ver ${beach.name} en detalle →`)}
        </button>
      </section>

      {/* ── ÉCRAN 4 : premium (le prix vit dans le paywall, source unique) ── */}
      <section style={{...secPad,paddingBottom:24}}>
        <div className="sg-rv" data-s="premium">
          <div style={ovl}>Premium</div>
          <h2 style={h2s}>{_t(lang,"Soyez prévenu avant tout le monde","Be the first to know","Entérate antes que nadie")}</h2>
        </div>
        <div className="sg-rv" style={{margin:"16px 0 6px"}}><ErrBound><Suspense fallback={null}><AlertScene/></Suspense></ErrBound></div>
        <div className="sg-rv" style={{display:"flex",flexDirection:"column",gap:10,margin:"14px 0 20px"}}>
          {[
            ["bell",_t(lang,"Une alerte quand VOTRE plage change d'état","An alert when YOUR beach changes","Una alerta cuando TU playa cambia")],
            ["brief",_t(lang,"Le brief du matin dans votre boîte mail","The morning brief in your inbox","El brief de la mañana en tu correo")],
            ["cal7",_t(lang,"Les 7 jours de prévisions, toutes les plages","The full 7-day forecast, every beach","Los 7 días de pronóstico, todas las playas")],
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:11,fontSize:14,fontWeight:600,
              color:"rgba(255,255,255,.85)"}}>
              <BrandIcon name={ic} size={19} style={{color:"rgba(255,255,255,.92)"}}/>{txt}
            </div>
          ))}
        </div>
        {onPremium&&(
          <button onClick={onPremium} className="sg-rv gbtn" style={{display:"block",width:"100%",textAlign:"center",
            background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",
            fontWeight:800,fontSize:16,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.25)"}}>
            {_t(lang,"Découvrir Premium","Discover Premium","Descubrir Premium")}
          </button>
        )}
        <div className="sg-rv" style={{textAlign:"center",fontSize:11.5,color:"rgba(255,255,255,.45)",marginTop:10}}>
          {PAY_CAPTURE_ONLY?_t(lang,"Sans carte — juste ton email","No card — just your email","Sin tarjeta — solo tu email"):_t(lang,"Paiement unique — remboursé en 1 email sous 30 j","One-time payment — refunded in 1 email within 30 days","Pago único — reembolso en 1 email en 30 días")}
        </div>
      </section>

      <footer style={{padding:"44px 22px calc(30px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",
        textAlign:"center",borderTop:"1px solid rgba(255,255,255,.07)",marginTop:36}}>
        <div style={{fontFamily:"'Anton',sans-serif",fontSize:12,letterSpacing:".14em",color:"rgba(255,255,255,.6)",marginBottom:6}}>{wordmark}</div>
        <div style={{fontSize:11,color:"rgba(255,255,255,.38)"}}>
          🛰 {_t(lang,"Données : Copernicus Marine","Data: Copernicus Marine","Datos: Copernicus Marine")}{upd?` · LIVE ${upd}`:""}
          {" · "}
          <a href={IS_NEW_REGION?"/about/":"/a-propos/"} style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"À propos","About","Acerca de")}
          </a>
          {/* /press/ existe pour les régions USD (kit média = backlinks/E-E-A-T) */}
          {IS_NEW_REGION && <>{" · "}<a href="/press/" style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"Presse","Press","Prensa")}
          </a></>}
          {!IS_NEW_REGION && <>{" · "}<a href="/widget/" style={{color:"rgba(255,255,255,.38)"}}>
            {_t(lang,"Pro : widget gratuit","Pro: free widget","Pro: widget gratis")}
          </a></>}
        </div>
        {/* Liens société/légaux — MQ/GP uniquement (pages 100% FR). Accessibles
            partout pour les visiteurs : offres, fiabilité, CGV, mentions. */}
        {!IS_NEW_REGION && (
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:9,lineHeight:1.8}}>
            <a href="/offres/" style={{color:"rgba(255,255,255,.38)"}}>Offres</a>{" · "}
            <a href="/fiabilite/" style={{color:"rgba(255,255,255,.38)"}}>Fiabilité</a>{" · "}
            <a href="/cgv.html" style={{color:"rgba(255,255,255,.3)"}}>CGV</a>{" · "}
            <a href="/remboursement.html" style={{color:"rgba(255,255,255,.3)"}}>Remboursement</a>{" · "}
            <a href="/confidentialite.html" style={{color:"rgba(255,255,255,.3)"}}>Confidentialité</a>{" · "}
            <a href="/mentions-legales.html" style={{color:"rgba(255,255,255,.3)"}}>Mentions légales</a>
            <div style={{marginTop:6,color:"rgba(255,255,255,.26)"}}>97TECH · SAS · RCS Paris 882&nbsp;370&nbsp;703</div>
          </div>
        )}
        {/* Liens société/légaux — régions USD/ES (pages générées EN/ES, slugs
            localisés). Identité opérateur 97TECH visible partout, comme MQ/GP. */}
        {IS_NEW_REGION && (() => {
          const sl = lang==="es"?{t:"terminos",p:"privacidad",r:"reembolso",rel:"fiabilidad"}:{t:"terms",p:"privacy",r:"refund",rel:"reliability"}
          const ls={color:"rgba(255,255,255,.38)"}, lsd={color:"rgba(255,255,255,.3)"}
          return (
            <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:9,lineHeight:1.8}}>
              <a href={`/${sl.rel}/`} style={ls}>{_t(lang,"Fiabilité","Reliability","Fiabilidad")}</a>{" · "}
              <a href={`/${sl.t}/`} style={lsd}>{_t(lang,"CGV","Terms","Términos")}</a>{" · "}
              <a href={`/${sl.p}/`} style={lsd}>{_t(lang,"Confidentialité","Privacy","Privacidad")}</a>{" · "}
              <a href={`/${sl.r}/`} style={lsd}>{_t(lang,"Remboursement","Refund","Reembolso")}</a>
              <div style={{marginTop:6,color:"rgba(255,255,255,.26)"}}>{_t(lang,"Édité par","Operated by","Operado por")} 97TECH · SAS · RCS Paris 882&nbsp;370&nbsp;703</div>
            </div>
          )
        })()}
      </footer>
    </div>
  )
}

export default HeroVerdict

import React,{useState,useEffect,useRef,useMemo,Suspense}from"react"
import {AfaiChip,AlertCapture,BEACH_TO_SARG,BeachPhotoScan,BeachReport,BeachScene,C,FbPostsStrip,ForecastChart,ForecastCredibility,GeoSoftAsk,H2SBadge,HERO_PH_OVERRIDE,IS_NEW_REGION,InlineEmailCapture,InlinePushCTA,MethodologyLink,NO_TRIAL,PanelStoryEngine,PlanBPanel,ST,ScoreBlob,ScoreReveal,ScrollStory,T,Tag,Veilleur,VerdictDuJourCard,VisitPlan,WeatherCard,__REL,_t,abVariant,beachStoryBeats,beachThumbBg,classifyBeachCoast,fmtHeight,fmtRain,fmtTemp,fmtWind,g,generateForecast,haversine,moodFromScore,pick,s,scoreLabelFor,shareBeachCard,statusFromAfai,track,useWeather,verdictMeta} from "./Sargasses_PROD"

function BeachSheet({beach,onClose,favorites,onToggleFav,lang,allBeaches,imageMap,onBeachClick,onPremiumClick,isPremium,historyData,sargData,dataSource,userPos,communityReports,fbPosts,onRequestGeo}){
  const LL=T[lang]||T.fr
  const weather=useWeather(beach)
  // Use REAL forecast, then interpolated, then fallback generated
  // If community reports override status, blend into forecast
  const weeklyData=useMemo(()=>{
    if(!beach||!sargData)return null
    // Nouvelles régions : weekly{} de la pipeline est keyé par l'id de plage
    // (pc001…) directement — BEACH_TO_SARG ne couvre que les 20 slugs MQ/GP.
    const sargId=IS_NEW_REGION?beach.id:BEACH_TO_SARG[beach.id]
    let w=null
    if(sargId&&sargData.weekly?.[sargId])w=sargData.weekly[sargId]
    else{
      const interpKey=`_interp_${beach.id}`
      w=sargData._enrichedWeekly?.[interpKey]||null
    }
    if(!w)return null
    // Force sheltered beaches to never show arrival (geography rule)
    const coast=beach.coast||classifyBeachCoast(beach.lat,beach.lng,beach.island)
    if(coast==="sheltered"&&w.arrivalDetected){
      return{...w,arrivalDetected:false,arrivalStrength:0}
    }
    return w
  },[beach?.id,sargData])
  const forecast=useMemo(()=>{
    if(!beach)return null
    let fc=weeklyData?.forecast||null
    // 3. Math.sin fallback (should not happen with 20 sentinels)
    if(!fc) fc=generateForecast(beach.afai,lang)
    // 4. Blend community reports into forecast when terrain says worse
    if(fc&&beach?._communityOverride){
      const RANK={clean:0,moderate:1,avoid:2}
      const STATUS_AFAI={clean:.05,moderate:.25,avoid:.60}
      const communityAfai=STATUS_AFAI[beach.status]||.05
      if(RANK[beach.status]>(RANK[fc[0]?.status]||0)){
        fc=fc.map((d,i)=>{
          // Day 1 = community status, then decay influence over 3 days
          const w=Math.max(0,1-i*.33)
          const blended=Math.round((communityAfai*w+d.afai*(1-w))*100)/100
          const st=statusFromAfai(blended)
          return {...d,afai:blended,status:st,sources:[...(d.sources||[]),...(i===0?["community"]:[])]}
        })
      }
    }
    return fc
  },[beach?.id,beach?.status,beach?._communityOverride,lang,weeklyData])
  const isFav=favorites.includes(beach?.id)
  const [scoreOpen,setScoreOpen]=useState(false)
  const [photoScanOpen,setPhotoScanOpen]=useState(false)
  const startY=useRef(0)
  const sheetRef=useRef(null)
  // A/B « la fiche EST le ScrollStory » (pw_beach_story) : story = PanelStoryEngine
  // (verdict→demain→vas-y) sous le hero À LA PLACE du bloc score/verdict ; control =
  // liste actuelle intacte. ?beachstory=1/0 force en QA. CTA premium inchangé.
  const beachStory=(()=>{try{const s=window.location.search;if(/[?&]beachstory=1/.test(s))return true;if(/[?&]beachstory=0/.test(s))return false;return abVariant("pw_beach_story",["control","story"],[.5,.5])==="story"}catch(_){return false}})()
  // A/B « Verdict du Jour » (pw_verdict_guess) : Devine-puis-Révèle DANS la fiche —
  // l'user devine le statut de CETTE plage avant de voir la donnée (engagement +
  // série). Additif (control = fiche inchangée), une fois par plage par jour.
  // ?verdictguess=1/0 force en QA. Funnel premium en aval segmentable par bras.
  const verdictGuess=(()=>{try{const q=window.location.search;if(/[?&]verdictguess=1/.test(q))return true;if(/[?&]verdictguess=0/.test(q))return false;return abVariant("pw_verdict_guess",["control","guess"],[.5,.5])==="guess"}catch(_){return false}})()
  // A/B `pw_planb` : feature #2 « où aller maintenant » — quand CETTE plage est
  // chargée (avoid/moderate), rail des plages PROPRES proches (data réelle).
  // Additif (control = fiche inchangée), ?planb=1/0 force en QA. Réduit l'angoisse
  // « journée gâchée » au moment vécu ; chaque pick = sg_planb_pick (segmentable).
  const pwPlanb=(()=>{try{const q=window.location.search;if(/[?&]planb=1/.test(q))return true;if(/[?&]planb=0/.test(q))return false;return abVariant("pw_planb",["control","planb"],[.5,.5])==="planb"}catch(_){return false}})()
  // A/B `pw_h2s` : badge Indice santé/H2S GRADUÉ (feature #4, le standout) — libre,
  // toujours visible, panneau dépliable + alerte santé Premium. Remplace le warning
  // binaire (control = warning sur avoid uniquement). ?h2s=1/0 force en QA.
  const pwH2s=(()=>{try{const q=window.location.search;if(/[?&]h2s=1/.test(q))return true;if(/[?&]h2s=0/.test(q))return false;return abVariant("pw_h2s",["control","badge"],[.5,.5])==="badge"}catch(_){return false}})()
  // A/B `fc_position` : ForecastChart remonté sous le verdict (valeur payante visible tôt)
  // vs control (en bas après VisitPlan). ?fcup=1/0 force en QA.
  const fcUp=(()=>{try{const q=window.location.search;if(/[?&]fcup=1/.test(q))return true;if(/[?&]fcup=0/.test(q))return false;return abVariant("fc_position",["control","top"],[.5,.5])==="top"}catch(_){return false}})()

  // Scroll to top when beach changes
  useEffect(()=>{
    if(sheetRef.current)sheetRef.current.scrollTop=0
  },[beach?.id])

  // Nearby beaches: same COMMUNE first (SEO internal linking), then by distance
  const nearby=useMemo(()=>{
    if(!beach||!allBeaches)return[]
    const others=allBeaches
      .filter(b=>b.id!==beach.id&&b.island===beach.island)
      .map(b=>({...b,dist:haversine(beach.lat,beach.lng,b.lat,b.lng)}))
    const sameCommune=others.filter(b=>b.commune===beach.commune).sort((a,b)=>a.dist-b.dist)
    const diffCommune=others.filter(b=>b.commune!==beach.commune).sort((a,b)=>a.dist-b.dist)
    return[...sameCommune,...diffCommune].slice(0,3)
  },[beach?.id,allBeaches])

  if(!beach)return null

  // Hero 100% scène vectorielle golden-hour (BeachScene, auto-phase sur l'heure
  // locale). Les photos externes ont été retirées — elles juraient avec le design.
  const heroPh=(()=>{try{if(HERO_PH_OVERRIDE)return HERO_PH_OVERRIDE;const h=new Date().getHours();return h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}catch(_){return "day"}})()

  const onTouchStart=e=>{startY.current=e.touches[0].clientY}
  const onTouchMove=e=>{
    // Only allow swipe-dismiss when sheet is scrolled to top (not mid-scroll)
    if(sheetRef.current&&sheetRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-startY.current
    if(dy>0&&sheetRef.current)sheetRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEnd=e=>{
    if(sheetRef.current&&sheetRef.current.scrollTop>5){sheetRef.current.style.transform="";return}
    const dy=(e.changedTouches[0]?.clientY||0)-startY.current
    if(dy>60)requestClose()
    else if(sheetRef.current){sheetRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";sheetRef.current.style.transform="";setTimeout(()=>{if(sheetRef.current)sheetRef.current.style.transition=""},300)}
  }

  // Fermeture SYMÉTRIQUE de l'ouverture (audit fluidité 2026-06-11) : la sheet
  // glisse vers le bas + le backdrop fond, PUIS on démonte. L'animation .sheet-exit
  // (to{translateY(100%)}) part de l'état courant — y compris mi-swipe.
  const backdropRef=useRef(null)
  const closingRef=useRef(false)
  const requestClose=()=>{
    if(closingRef.current)return
    closingRef.current=true
    try{
      sheetRef.current&&sheetRef.current.classList.add("sheet-exit")
      backdropRef.current&&backdropRef.current.classList.add("backdrop-exit")
    }catch(_){}
    setTimeout(()=>{closingRef.current=false;onClose()},260)
  }

  // Escape key to close
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")requestClose()}
    document.addEventListener("keydown",h)
    return()=>document.removeEventListener("keydown",h)
  },[onClose])

  const wazeUrl=`https://waze.com/ul?ll=${beach.lat},${beach.lng}&navigate=yes`

  return(
    <>
      {/* Pass-through pin : si le tap tombe pile sur une pastille visible dans la
          bande de carte au-dessus de la fiche, on SWITCHE de plage au lieu de
          fermer — sinon le clic paraît « mort » (rapport user 2026-06-12).
          elementsFromPoint AVANT fermeture (voit sous le backdrop) ; fermeture
          sèche via onClose (le requestClose animé garderait un timer 260 ms qui
          refermerait la NOUVELLE fiche). */}
      <div className="backdrop" ref={backdropRef} onClick={(e)=>{
        const x=e.clientX,y=e.clientY
        // ARCHIPEL (carte SVG par défaut) : pastille [data-beach] sous le backdrop → switch direct
        // de plage (remplace la dépendance aux marqueurs Leaflet pour le cohort world).
        try{
          const g=document.elementsFromPoint(x,y).map(el=>el.closest&&el.closest("[data-beach]")).find(Boolean)
          if(g){const nb=allBeaches&&allBeaches.find(b=>b.id===g.getAttribute("data-beach"))
            if(nb&&nb.id!==beach.id){track("sg_sheet_pin_switch",{via:"archipel"});onClose();setTimeout(()=>onBeachClick&&onBeachClick(nb),50);return}}
        }catch(_){}
        let pin=null
        try{pin=document.elementsFromPoint(x,y).find(el=>el.classList&&el.classList.contains("leaflet-marker-icon"))}catch(_){}
        if(pin){
          track("sg_sheet_pin_switch",{})
          onClose()
          // Re-localiser le pin AU MOMENT du dispatch : la fermeture change
          // selectedBeach → les markers sont RECONSTRUITS (garde par signature)
          // → le nœud capturé ci-dessus est détaché. Boucle de frames le temps
          // que le backdrop démonte + que les markers réapparaissent.
          let tries=0
          const fire=()=>{try{
            const el=document.elementFromPoint(x,y)
            const p2=el&&el.closest&&el.closest(".leaflet-marker-icon")
            if(p2){p2.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}));return}
            if(++tries<8)requestAnimationFrame(fire)
          }catch(_){}}
          requestAnimationFrame(fire)
          return
        }
        requestClose()
      }}/>
      <div className="sheet" ref={sheetRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="sheet-handle"/>

        {/* Hero — photo le jour, scène vectorielle golden-hour personnalisée par
            l'heure sinon (cf. useVectorHero). Immersif, tap pour scanner. */}
        <div onClick={e=>{if(!e.target.closest("button")){setPhotoScanOpen(v=>!v);track("sg_photo_scan",{beach_id:beach.id,open:!photoScanOpen,hero:"vector",ph:heroPh,status:beach.status})}}}
          style={{height:(()=>{try{const q=window.location.search;if(/[?&]heroh=1/.test(q))return "min(480px, 46svh)";if(/[?&]heroh=0/.test(q))return "min(600px, 70svh)";return abVariant("aw_hero_height",["control","short"],[.6,.4])==="short"?"min(480px, 46svh)":"min(600px, 70svh)"}catch(_){return "min(600px, 70svh)"}})(),background:"#0B2230",
          borderRadius:"0",position:"relative",overflow:"hidden",cursor:"pointer"}}>
          {/* SVG D'ABORD (directive 14/06 : « les images dépendent du jour,
              remplace par du svg perso par heure/lieu, pas ce qu'on voit en
              premier »). Scène vectorielle propre à la plage + personnalisée par
              l'heure ET l'ÉTAT (nickel / en collecte / pleine, animé). La vraie
              photo est reléguée « en cool » plus bas. */}
          <BeachScene beach={beach} reveal/>
          {/* Cinematic gradient overlay */}
          <div style={{position:"absolute",inset:0,
            background:"linear-gradient(180deg, rgba(0,0,0,.15) 0%, transparent 30%, transparent 50%, var(--sg-card,#fff) 100%)"}}/>
          {/* Le Veilleur veille sur CETTE plage — humeur = état RÉEL du jour : le
              « veilleur personnel » incarné dès le hero (pas juste une image). */}
          <div aria-hidden="true" style={{position:"absolute",top:"43%",left:0,right:0,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
            <Veilleur mood={moodFromScore(beach.score)} size={82}/>
          </div>
          {/* Status glow — colored ambient light based on beach status */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:"40%",
            background:`radial-gradient(ellipse at 50% 100%, ${(ST[beach.status]||ST._loading).c}22 0%, transparent 70%)`,
            pointerEvents:"none"}}/>
          {/* Close button */}
          <button onClick={requestClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",top:12,right:12,
            width:44,height:44,borderRadius:22,
            background:"rgba(0,0,0,.3)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
            border:"1px solid rgba(255,255,255,.15)",color:"#fff",fontSize:16,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          {/* Fav button on photo */}
          <button onClick={e=>{onToggleFav(beach.id);e.currentTarget.classList.remove("heart-pop");void e.currentTarget.offsetWidth;e.currentTarget.classList.add("heart-pop")}}
            aria-label={isFav?_t(lang,"Retirer des favoris","Remove from favourites","Quitar de favoritos"):_t(lang,"Ajouter aux favoris","Add to favourites","Agregar a favoritos")}
            style={{position:"absolute",top:12,left:12,
              width:44,height:44,borderRadius:22,
              background:isFav?"rgba(232,82,42,.2)":"rgba(0,0,0,.3)",
              backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
              border:isFav?"1px solid rgba(232,82,42,.4)":"1px solid rgba(255,255,255,.15)",
              color:"#fff",fontSize:18,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all .3s cubic-bezier(.22,1,.36,1)",
            }}>{isFav?"❤️":"🤍"}</button>
          {/* Floating status pill on photo */}
          <div style={{position:"absolute",bottom:60,left:20,
            display:"flex",alignItems:"center",gap:8,
            padding:"6px 14px 6px 10px",borderRadius:100,
            background:"rgba(0,0,0,.35)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
            border:"1px solid rgba(255,255,255,.12)"}}>
            <span style={{width:10,height:10,borderRadius:5,
              background:(ST[beach.status]||ST._loading).c,
              boxShadow:`0 0 8px ${(ST[beach.status]||ST._loading).c}`,
              animation:beach.status==="clean"?"none":"pulse 2s ease-in-out 2"}}/>
            <span style={{fontSize:13,fontWeight:700,color:"#fff",letterSpacing:".01em"}}>
              {lang==="es"?(ST[beach.status]||ST._loading).les:lang==="en"?(ST[beach.status]||ST._loading).le:(ST[beach.status]||ST._loading).l}
            </span>
          </div>
          {/* Tap-to-scan HUD overlay */}
          {photoScanOpen&&<BeachPhotoScan beach={beach} lang={lang}/>}
          {/* Scan hint (when overlay closed) */}
          {!photoScanOpen&&<div style={{position:"absolute",bottom:14,right:14,
            display:"flex",alignItems:"center",gap:4,opacity:.55,pointerEvents:"none"}}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="6" r="4.5" stroke="#4ECDC4" strokeWidth="1"/>
              <line x1="6" y1="1.5" x2="6" y2="3" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="6" y1="9" x2="6" y2="10.5" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="1.5" y1="6" x2="3" y2="6" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
              <line x1="9" y1="6" x2="10.5" y2="6" stroke="#4ECDC4" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            <span style={{fontSize:9,color:"#4ECDC4",fontWeight:700,letterSpacing:".08em"}}>
              {lang==="en"?"SCAN":lang==="es"?"ESCANEAR":"ANALYSER"}
            </span>
          </div>}
        </div>

        <div style={{padding:"0 20px calc(70px + env(safe-area-inset-bottom,12px))"}}>
          {/* Name — large, no duplicate status badge (already on photo) */}
          <h2 className="anton" style={{fontSize:"clamp(24px,6vw,30px)",margin:"0 0 4px",lineHeight:1.15,
            color:"var(--sg-ink)"}}>{beach.name}</h2>
          <p style={{fontSize:13,color:"var(--sg-mid,#5A5A5A)",margin:"0 0 12px",
            display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <span>{beach.commune}</span>
            {typeof beach.drive==="number"&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <span>{beach.drive} {LL.drive}</span>
            </>}
            {userPos&&beach.lat&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <span>{Math.round(haversine(userPos.lat,userPos.lng,beach.lat,beach.lng))} km</span>
            </>}
            {/* Pas encore de position → soft-ask contextuel : la distance a une valeur
                évidente ici (prompt natif au tap seulement, jamais au load). */}
            {!userPos&&beach.lat&&onRequestGeo&&<>
              <span style={{width:3,height:3,borderRadius:2,background:"var(--sg-mid,#999)",opacity:.5}}/>
              <GeoSoftAsk lang={lang} onAsk={onRequestGeo} src="beach_sheet"
                style={{padding:"2px 8px",fontSize:11.5}}/>
            </>}
          </p>

          {/* PLAN-B « où aller maintenant » — quand CETTE plage est chargée
              (avoid/moderate), rail des plages propres proches. A/B pw_planb. */}
          {pwPlanb&&(beach.status==="avoid"||beach.status==="moderate")&&(
            <PlanBPanel beach={beach} allBeaches={allBeaches} userPos={userPos} lang={lang}
              sargData={sargData} onBeachClick={onBeachClick} onClose={onClose} onRequestGeo={onRequestGeo}/>
          )}

          {/* v3.1 Beach Score 0-100 — editorial aurora card echoing the home hero.
              Masqué dans le bras story (absorbé par le beat ① VERDICT du ScrollStory). */}
          {!beachStory&&typeof beach.score==="number"&&(
            <div style={{position:"relative",margin:"4px 0 14px"}}>
              <div aria-hidden="true" style={{position:"absolute",inset:-4,borderRadius:22,
                background:`radial-gradient(120% 100% at 0% 0%, ${beach.scoreColor}1f 0%, transparent 60%)`,
                filter:"blur(8px)",pointerEvents:"none"}}/>
              <div style={{position:"relative",display:"flex",alignItems:"center",gap:16,
                padding:"14px 16px",borderRadius:18,
                background:"linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,.55))",
                backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",
                border:`1px solid ${beach.scoreColor}22`,
                boxShadow:`0 14px 34px -16px ${beach.scoreColor}3a, inset 0 1px 0 rgba(255,255,255,.5)`}}>
                <div role="button" aria-label={`${beach.score}/100, ${scoreLabelFor(beach.scoreLabel,lang)}. ${_t(lang,"Comprendre ce score","Understand this score","Entender este puntaje")}`}
                  onClick={()=>{setScoreOpen(v=>!v);track("sg_score_learn",{beach_id:beach.id,open:!scoreOpen})}}
                  style={{position:"relative",width:84,height:84,flexShrink:0,cursor:"pointer"}}>
                  <ScoreBlob score={beach.score} color={beach.scoreColor} size={84}/>
                  {/* Le Veilleur perché, humeur = score RÉEL : le « veilleur personnel »
                      rendu tangible AVANT le paywall (data pilote le visuel). */}
                  <div style={{position:"absolute",top:-14,left:-13,pointerEvents:"none"}}>
                    <Veilleur mood={moodFromScore(beach.score)} size={36}/>
                  </div>
                  <div style={{position:"absolute",top:-2,right:-2,width:18,height:18,borderRadius:"50%",
                    background:beach.scoreColor,color:"#fff",fontSize:10,fontWeight:800,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    boxShadow:"0 1px 4px rgba(0,0,0,.2)"}}>{scoreOpen?"×":"?"}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="anton" style={{fontSize:21,lineHeight:1.05,color:beach.scoreColor,
                    letterSpacing:"-.015em",textTransform:"uppercase"}}>
                    {scoreLabelFor(beach.scoreLabel,lang)}
                  </div>
                  <div style={{fontSize:12,color:"var(--sg-mid,#5A5A5A)",marginTop:5,lineHeight:1.4}}>
                    {beach.scoreReason}
                  </div>
                  {((beach.scoreStrengths?.length||0)+(beach.scoreWeaknesses?.length||0))>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:8}}>
                      {(beach.scoreStrengths||[]).slice(0,3).map((s,i)=>(
                        <span key={`s${i}`} style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:100,
                          background:"rgba(34,197,94,.14)",color:"#16A34A",whiteSpace:"nowrap",letterSpacing:".01em"}}>
                          ✓ {s}
                        </span>
                      ))}
                      {(beach.scoreWeaknesses||[]).slice(0,2).map((w,i)=>(
                        <span key={`w${i}`} style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:100,
                          background:"rgba(224,120,0,.14)",color:"#E07800",whiteSpace:"nowrap",letterSpacing:".01em"}}>
                          ⚠ {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {scoreOpen&&<ScoreReveal beach={beach} lang={lang}/>}

          {/* Verdict line — glanceable "can I go today?" answer (design-scout 2026-04-12).
              Masquée dans le bras story (absorbée par le beat ① du ScrollStory). */}
          {!beachStory&&ST[beach.status]&&(() => {
            const verdictKey = beach.status==="clean"?"verdictGo":beach.status==="moderate"?"verdictModerate":beach.status==="avoid"?"verdictAvoid":"verdictUnknown"
            const verdictText = LL[verdictKey]||LL.verdictUnknown
            const verdictColor = ST[beach.status].c
            return (
              <div style={{display:"flex",alignItems:"center",gap:10,margin:"0 0 14px",flexWrap:"wrap"}}>
                <span aria-hidden="true" style={{width:4,height:24,borderRadius:2,background:verdictColor,flexShrink:0}}/>
                <span className="anton" style={{fontSize:"clamp(18px,4.6vw,22px)",lineHeight:1.1,color:verdictColor,letterSpacing:"-.01em",textTransform:"uppercase"}}>
                  {verdictText}
                </span>
                <span aria-hidden="true" style={{fontSize:20,lineHeight:1,flexShrink:0}}>{verdictMeta(beach.status,lang).emoji}</span>
                {beach.status==="clean"&&__REL&&typeof __REL.cleanPct==="number"&&(
                  <span style={{fontSize:10.5,fontWeight:700,padding:"3px 9px",borderRadius:100,
                    background:"rgba(34,197,94,.12)",color:"#16A34A",border:"1px solid rgba(34,197,94,.25)",
                    whiteSpace:"nowrap",flexShrink:0}}>
                    ✓ {__REL.cleanPct}% {_t(lang,"fiables","reliable","fiables")}
                  </span>
                )}
              </div>
            )
          })()}
          {/* Freshness chip — satellite timestamp sous le verdict */}
          {!beachStory&&(()=>{try{const ts=sargData?.updatedAt||sargData?.erddapTimestamp;if(!ts)return null;const h=(Date.now()-new Date(ts).getTime())/3.6e6;if(!(h>=0&&h<72))return null;const label=h<1?_t(lang,"À l'instant","Just now","Ahora mismo"):h<12?_t(lang,"il y a "+Math.round(h)+" h",Math.round(h)+"h ago","hace "+Math.round(h)+" h"):_t(lang,"vérif. en cours","checking","verificando");return(<div style={{display:"flex",alignItems:"center",gap:5,margin:"-10px 0 14px",opacity:.72}}><span style={{fontSize:11}}>🛰️</span><span style={{fontSize:10.5,fontWeight:600,color:"var(--sg-mid,#5A5A5A)",letterSpacing:".02em"}}>{_t(lang,"Satellite","Satellite","Satélite")} · {label}</span></div>)}catch(_){return null}})()}
          {/* Verdict du Jour — Devine-puis-Révèle (A/B pw_verdict_guess). Rendu
              dans LES DEUX bras (additif) quand le vrai statut est connu. */}
          {verdictGuess&&ST[beach.status]&&<VerdictDuJourCard beach={beach} lang={lang}/>}
          {/* La fiche EST le ScrollStory (bras story) : verdict → demain → vas-y.
              Moteur panel-scroll (lit sheetRef.scrollTop). CTA premium INCHANGÉ. */}
          {beachStory&&forecast&&forecast.length>=2&&(
            <div style={{margin:"6px -20px 0"}}>
              <PanelStoryEngine beats={beachStoryBeats(beach,forecast,lang)} scrollRef={sheetRef} lang={lang}
                accent={verdictMeta(beach.status,lang).color} ev="sg_beach_beat"
                onCTA={()=>{track("sg_beach_story_cta",{beach_id:beach.id,status:beach.status});onPremiumClick&&onPremiumClick("beach_story")}}/>
              {/* PONT golden-hour : on FOND le monde immersif (gold du dernier beat)
                  dans le détail clair — zéro couture dark→light, un seul flux continu. */}
              <div aria-hidden style={{height:56,marginTop:-1,background:"linear-gradient(180deg,#11463E 0%,#C97E3A 42%,#FFE08A 74%,var(--sg-card,#fff) 100%)"}}/>
            </div>
          )}
          <AfaiChip beach={beach} lang={lang}/>
          {/* A/B fc_position="top" : ForecastChart remonte sous le verdict (avant les info-filler) */}
          {fcUp&&forecast&&(<>
            {weeklyData?.arrivalDetected&&<div style={{padding:"10px 12px",marginBottom:10,borderRadius:12,background:"linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))",border:"1px solid rgba(232,143,42,.35)",display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>⚠</span><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#b35818"}}>{_t(lang,"Banc de sargasses en approche","Sargassum mat approaching","Banco de sargazo en camino")}</div><div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>{_t(lang,"Le satellite détecte un banc dérivant vers cette plage (1–3 jours).","Satellite shows a mat drifting toward this beach (1–3 days).","El satélite detecta un banco derivando hacia esta playa (1–3 días).")}</div></div></div>}
            <ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium} weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>
          </>)}

          {/* rel_hot_cta : badge fiabilité → openPremium (trust signal après ForecastChart en A/B).
              Gating !isPremium && fcUp : n'empile PAS avec forecast_teaser dans le bras contrôle,
              et n'affiche pas aux abonnés un bouton d'achat. */}
          {!isPremium&&fcUp&&<button onClick={()=>{track("sg_reliability_open",{from:"beach_badge",hot:true});onPremiumClick("rel_hot_cta")}}
            style={{display:"flex",alignItems:"center",gap:9,margin:"10px 0 2px",padding:"9px 12px",borderRadius:12,
            background:"rgba(34,197,94,.10)",border:"1px solid rgba(34,197,94,.26)",textDecoration:"none",cursor:"pointer",
            width:"100%",fontFamily:"inherit",textAlign:"left"}}>
            <span aria-hidden="true" style={{fontSize:15,lineHeight:1}}>✅</span>
            <span style={{flex:1,fontSize:12.5,fontWeight:700,color:"var(--sg-ink,#13241F)",lineHeight:1.3}}>
              {(()=>{
                // Chiffre RÉEL injecté au build (__RELIABILITY__, même source que /fiabilite/).
                // On publie le clean-rate par régime (jamais le global %, cf. regimeReliability.note).
                if(__REL&&typeof __REL.cleanPct==="number"){
                  const reg=__REL.regime==="high"?_t(lang,"saison haute","high season","temporada alta"):_t(lang,"saison calme","calm season","temporada tranquila")
                  const n=(__REL.cleanN||0).toLocaleString(lang==="fr"?"fr-FR":lang==="es"?"es-ES":"en-US")
                  return _t(lang,
                    `${__REL.cleanPct}% de nos prévisions « mer propre » vérifiées · ${reg} (${n})`,
                    `${__REL.cleanPct}% of our “clean water” forecasts proved correct · ${reg} (${n})`,
                    `${__REL.cleanPct}% de pronósticos “agua limpia” verificados · ${reg} (${n})`)
                }
                if(__REL&&typeof __REL.global==="number"){
                  return _t(lang,
                    `Prévisions recoupées au satellite — ${__REL.global}% justes (30 j)`,
                    `Forecasts cross-checked with satellite — ${__REL.global}% accurate (30 d)`,
                    `Pronósticos contrastados con satélite — ${__REL.global}% exactos (30 d)`)
                }
                return _t(lang,"Prévisions recoupées au satellite, backtest quotidien","Forecasts cross-checked with satellite, daily backtest","Pronósticos contrastados con satélite, backtest diario")
              })()}
            </span>
            <span aria-hidden="true" style={{fontSize:13,fontWeight:800,color:"#16A34A",flexShrink:0}}>→</span>
          </button>}

          {/* Photo externe retirée (juraient avec le design) — la scène vectorielle
              golden-hour du hero porte déjà l'identité de la plage. */}

          {/* Urgence-donnée : arrivage RÉEL prévu (weeklyData.forecast pipeline,
              JAMAIS le fallback generateForecast) → CTA alerte. L'urgence vraie
              est notre droit : c'est de l'info satellite, pas de la pression
              (anti-pattern Booking, engagements UE 2020 — capture_intelligence). */}
          {!isPremium&&(()=>{
            const fc=weeklyData?.forecast
            const RANK={clean:0,moderate:1,avoid:2}
            let hit=null
            if(fc&&fc.length>=2){
              const today=RANK[fc[0]?.status]??RANK[beach.status]??0
              for(let i=1;i<=3&&i<fc.length;i++){const r=RANK[fc[i]?.status];if(r!=null&&r>today){hit={i,d:fc[i]};break}}
            }
            const when=hit?(hit.i===1?_t(lang,"demain","tomorrow","mañana")
              :(()=>{try{return new Date((hit.d.date||"")+"T12:00:00Z").toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long"})}catch(_){return null}})()):null
            // Pas de dégradation prévue → capture email click-triggered (jamais
            // les deux bandeaux empilés : un seul message sous le verdict).
            if(!hit||!when)return <AlertCapture beach={beach} lang={lang}/>
            const worse=hit.d.status==="avoid"
            return(
              <button onClick={()=>{track("sg_urgency_banner_cta",{beach_id:beach.id,day:hit.i,to:hit.d.status});onPremiumClick("urgency_banner")}}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",cursor:"pointer",
                  background:worse?"rgba(232,82,42,.10)":"rgba(224,120,0,.10)",
                  border:`1px solid ${worse?"rgba(232,82,42,.35)":"rgba(224,120,0,.35)"}`,
                  borderRadius:14,padding:"11px 13px",margin:"0 0 14px",fontFamily:"inherit"}}>
                <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                <span style={{flex:1,minWidth:0,fontSize:12.5,lineHeight:1.45,color:"var(--sg-ink,#1A2B26)",fontWeight:600}}>
                  {_t(lang,
                    `Arrivage prévu ${when} sur cette plage (satellite). Sois prévenu si ça change.`,
                    `Sargassum forecast to arrive ${when} at this beach (satellite). Get notified if it changes.`,
                    `Llegada prevista ${when} en esta playa (satélite). Recibe el aviso si cambia.`)}
                </span>
                <span style={{flexShrink:0,fontSize:12,fontWeight:800,color:worse?"#E8522A":"#E07800"}}>
                  {_t(lang,"Activer l'alerte →","Set the alert →","Activar alerta →")}
                </span>
              </button>
            )
          })()}

          {/* Status description */}
          {ST[beach.status]&&(
            <p style={{fontSize:12,color:beach._communityOverride?C.gold:beach.beachMemory?C.sarg:ST[beach.status].c,fontWeight:500,margin:"0 0 12px",lineHeight:1.5,
              padding:"6px 10px",background:beach._communityOverride?C.goldBg:beach.beachMemory?C.sargBg:ST[beach.status].bg,borderRadius:8}}>
              {beach._communityOverride
                ?_t(lang,
                  `${beach._communityTotal} visiteurs signalent ce niveau sur place. Les signalements terrain priment sur les données satellite.`,
                  `${beach._communityTotal} visitors report this level on site. Community reports take priority over satellite data.`,
                  `${beach._communityTotal} visitantes reportan este nivel en el lugar. Los reportes en sitio tienen prioridad sobre los datos satelitales.`)
                :beach.beachMemory
                ?_t(lang,
                  "Le satellite ne détecte plus de sargasses au large, mais des échouages ont eu lieu ces derniers jours. Les algues peuvent persister sur la plage 7 à 14 jours sans ramassage.",
                  "Satellite no longer detects sargassum offshore, but beaching occurred in recent days. Algae can persist on the beach for 7 to 14 days without cleanup.",
                  "El satélite ya no detecta sargazo en alta mar, pero hubo llegadas en los últimos días. Las algas pueden permanecer en la playa de 7 a 14 días sin limpieza.")
                :lang==="es"?ST[beach.status].descEs:lang==="en"?ST[beach.status].descEn:ST[beach.status].desc}
            </p>
          )}

          {/* MethodologyLink removed — technical jargon (IDW, pipeline) doesn't help users */}

          {/* INDICE SANTÉ / H2S — badge gradué (A/B pw_h2s, feature #4) ; sinon
              warning binaire historique (control, sur avoid uniquement). */}
          {pwH2s
            ? <H2SBadge beach={beach} lang={lang} weather={weather} onPremiumClick={onPremiumClick}/>
            : (ST[beach.status]?.h2s&&(
                <div style={{padding:"10px 14px",borderRadius:12,background:C.redBg,
                  color:C.red,fontSize:13,fontWeight:600,marginBottom:12,
                  display:"flex",alignItems:"center",gap:8}}>
                  ⚠️ {LL.h2sWarn}
                </div>
              ))}

          {/* Email capture — above the fold, before forecast teaser */}
          <InlineEmailCapture lang={lang} beachName={beach.name}/>

          {/* Forecast teaser — masqué en fc_position=top (ForecastChart déjà visible) */}
          {!isPremium&&!fcUp&&forecast&&forecast[1]&&(
            <div onClick={()=>{track("sg_forecast_teaser_click",{beach_id:beach.id,tomorrow:forecast[1].status});onPremiumClick("forecast_teaser")}}
              style={{padding:"14px 16px",borderRadius:16,marginBottom:12,cursor:"pointer",
                background:"linear-gradient(135deg,#190c2c,#142824)",
                border:"1px solid rgba(232,168,0,.2)",
                display:"flex",alignItems:"center",gap:14,
                boxShadow:"0 4px 20px rgba(0,0,0,.12)",
                transition:"transform .2s",position:"relative",overflow:"hidden"}}>
              {/* Ambient glow */}
              <div style={{position:"absolute",top:"-50%",right:"-20%",width:"60%",height:"200%",
                background:"radial-gradient(ellipse, rgba(232,168,0,.08) 0%, transparent 70%)",pointerEvents:"none"}}/>
              <div style={{flex:1,position:"relative"}}>
                <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",
                  textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>
                  {_t(lang,"Prévision demain","Tomorrow forecast","Pronóstico de mañana")}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>
                    {beach.name}
                  </span>
                  <span style={{filter:"blur(6px)",userSelect:"none",fontSize:13,fontWeight:700,
                    color:ST[forecast[1].status]?.c||"#999"}}>{lang==="es"?ST[forecast[1].status]?.les:lang==="en"?ST[forecast[1].status]?.le:ST[forecast[1].status]?.l||"?"}</span>
                </div>
                <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:4}}>
                  {NO_TRIAL
                    ?_t(lang,"Débloquer les 7 jours","Unlock the 7-day forecast","Desbloquear los 7 días")
                    :_t(lang,"Débloquer · 7 jours gratuit","Unlock with free trial","Desbloquear · 7 días gratis")}
                </div>
              </div>
              <div style={{width:44,height:44,borderRadius:12,
                background:"linear-gradient(158deg,#FFE47A,#FFC72C,#E89400)",
                display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:20,flexShrink:0,
                boxShadow:"0 2px 12px rgba(232,168,0,.4)"}}>
                🔓
              </div>
            </div>
          )}

          {/* ── AXE 2: Beach Reports — 3-level user sargassum reports ── */}
          <BeachReport beach={beach} lang={lang} communityReports={communityReports}/>

          {/* ── FB POSTS: real visitor photos + quotes from public FB groups ── */}
          <FbPostsStrip beach={beach} fbPosts={fbPosts} lang={lang}/>

          {/* InlinePushCTA removed — OneSignal handles native push prompt */}

          {/* Amenities — tappable chips */}
          {(beach.kids||beach.snorkel||beach.parking)&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
              {beach.kids&&<Tag icon="👶" label={LL.kids}/>}
              {beach.snorkel&&<Tag icon="🤿" label={LL.snorkel}/>}
              {beach.parking&&<Tag icon="🅿️" label={LL.parking}/>}
            </div>
          )}

          {/* Actions — Waze + Share (Fav moved to photo hero) */}
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <a href={wazeUrl} target="_blank" rel="noopener" className="gbtn"
              style={{flex:1,textDecoration:"none",textAlign:"center",
                display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                padding:"14px 10px",borderRadius:16,background:"#0D0D0D",color:"#fff",fontSize:14,fontWeight:700}}>
              <span style={{fontSize:16}}>🚗</span> {LL.directions}
            </a>
            <a href={`/plages/${getCanonicalSlug(beach.name)}/`} target="_blank" rel="noopener"
              style={{flex:1,textDecoration:"none",textAlign:"center",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                padding:"14px 10px",borderRadius:16,border:"1.5px solid var(--sg-border)",
                background:"var(--sg-card)",color:"var(--sg-ink)",fontSize:14,fontWeight:700}}>
              <span style={{fontSize:16}}>📄</span> {LL.fullSheet}
            </a>
            <button onClick={async()=>{
              // PRIMAIRE : carte-image spoiler-free SANS lien (effet Wordle = portée max). Recherche valeur.
              track("sg_share",{beach_id:beach.id,method:"card",status:beach.status})
              if(await shareBeachCard(beach,lang,forecast))return
              // FALLBACK (partage de fichier indispo) : texte + lien (référral si premium).
              const slug=getCanonicalSlug(beach.name)
              const refCode=isPremium?localStorage.getItem("sg_referral_code"):""
              const url=window.location.origin+"/plages/"+slug+(refCode?"?ref="+refCode:"")
              const isRef=!!refCode
              const _st=ST[beach.status]||ST._loading
              const _stl=lang==="es"?_st.les:lang==="en"?_st.le:_st.l
              const _sc=typeof beach.score==="number"?` ${beach.score}/100`:""
              const _txt=_t(lang,
                `☀️ ${beach.name} — ${_stl}${_sc} aujourd'hui. La plage du jour !`,
                `☀️ ${beach.name} — ${_stl}${_sc} today. Beach of the day!`,
                `☀️ ${beach.name} — ${_stl}${_sc} hoy. ¡La playa del día!`)
              if(navigator.share){track("sg_share",{beach_id:beach.id,method:"native",has_referral:isRef});navigator.share({title:beach.name+" — Sargasses",text:_txt,url}).catch(()=>{})}
              else{navigator.clipboard?.writeText(`${_txt} ${url}`);track("sg_share",{beach_id:beach.id,has_referral:isRef})}
            }} style={{flex:0,padding:"14px 18px",borderRadius:16,
              border:"1.5px solid var(--sg-border)",
              background:"var(--sg-card)",cursor:"pointer",fontSize:18,fontFamily:"inherit",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              📤
            </button>
          </div>

          {/* Nearby beaches — horizontal scroll carousel (above fold = browse loop) */}
          {nearby.length>0&&(
            <div style={{marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:700,marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                {LL.nearby}
                <span style={{fontSize:11,fontWeight:500,color:"var(--sg-mid,#5A5A5A)"}}>
                  {_t(lang,"Compare","Tap to compare","Toca para comparar")}
                </span>
              </h3>
              <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,
                scrollbarWidth:"none",WebkitOverflowScrolling:"touch",margin:"0 -20px",padding:"0 20px 4px"}}>
                {nearby.map(nb=>{
                  const nst=ST[nb.status]||ST._loading
                  return(
                    <button key={nb.id} onClick={()=>{track("sg_nearby_click",{from:beach.id,to:nb.id,status:nb.status});onBeachClick(nb)}} style={{
                      flex:"0 0 auto",width:140,padding:0,
                      borderRadius:14,border:"1px solid var(--sg-border)",overflow:"hidden",
                      background:"var(--sg-card,#fff)",cursor:"pointer",
                      textAlign:"left",fontFamily:"inherit",
                      boxShadow:"0 2px 8px rgba(0,0,0,.06)",
                    }}>
                      <div style={{height:80,background:beachThumbBg(nb),
                        position:"relative"}}>
                        <span style={{position:"absolute",top:6,right:6,fontSize:9,fontWeight:700,
                          padding:"2px 6px",borderRadius:100,background:nst.bg,color:nst.c,
                          backdropFilter:"blur(4px)"}}>{nst.e} {lang==="es"?nst.les:lang==="en"?nst.le:nst.l}</span>
                      </div>
                      <div style={{padding:"8px 10px"}}>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--sg-ink)",
                          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nb.name}</div>
                        <div style={{fontSize:10,color:"var(--sg-mid)",marginTop:2}}>
                          {Math.round(nb.dist)} km
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* LE PLAN DU VEILLEUR — ce qu'il faut faire ICI (data→conseil ancré aux problèmes
              réels). DANS la fiche, pas un popup (feedback_no_ui_in_ui). */}
          <VisitPlan beach={beach} lang={lang} allBeaches={allBeaches} weeklyData={weeklyData}/>

          {/* Forecast (days 4-7 locked) — control only; "top" variant renders above */}
          {!fcUp&&<h3 style={{fontSize:15,fontWeight:700,marginBottom:8}}>{LL.forecast}</h3>}
          {/* v3: Arrival banner — strongest signal the app provides */}
          {!fcUp&&weeklyData?.arrivalDetected&&(
            <div style={{
              padding:"10px 12px",marginBottom:10,borderRadius:12,
              background:"linear-gradient(135deg,rgba(232,143,42,.12),rgba(232,82,42,.08))",
              border:"1px solid rgba(232,143,42,.35)",
              display:"flex",alignItems:"center",gap:10,
            }}>
              <span style={{fontSize:20}}>⚠</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#b35818"}}>
                  {_t(lang,"Banc de sargasses en approche","Sargassum mat approaching","Banco de sargazo en camino")}
                </div>
                <div style={{fontSize:11,color:"var(--sg-mid,#5A5A5A)",marginTop:2}}>
                  {_t(lang,"Le satellite détecte un banc dérivant vers cette plage (1–3 jours).","Satellite shows a mat drifting toward this beach (1–3 days).","El satélite detecta un banco derivando hacia esta playa (1–3 días).")}
                </div>
              </div>
            </div>
          )}
          {!fcUp&&<ForecastChart forecast={forecast} lang={lang} onPremiumClick={onPremiumClick} isPremium={isPremium}
            weatherDaily={weather?.daily||null} weeklyData={weeklyData}/>}
          {/* Disclaimer : la clé machine forecastMethod (pipeline forecast.cjs +
              'interpolated' côté client) est mappée vers une copy localisée —
              ne JAMAIS rendre weeklyData.forecastDisclaimer brut (FR sans
              accents servi tel quel sur les sites EN/ES). Clé inconnue :
              fallback brut en FR uniquement, sinon rien. */}
          {(()=>{
            const m=weeklyData?.forecastMethod
            const txt=m==="memory-decay"?_t(lang,"Données reconstruites (épisode passé) — prévision par décroissance naturelle seulement.","Reconstructed data (past event) — forecast from natural decay only.","Datos reconstruidos (evento pasado) — pronóstico solo por disipación natural.")
              :m==="arrival-banks"?_t(lang,"Banc de sargasses détecté à proximité — arrivée possible dans 1-3 jours.","Sargassum mat detected nearby — possible arrival within 1-3 days.","Banco de sargazo detectado cerca — posible llegada en 1-3 días.")
              :m==="banks-persistence"?_t(lang,"Persistance + bancs satellite + vent. Fiabilité décroissante après J+3.","Persistence + satellite mats + wind. Reliability drops after day 3.","Persistencia + bancos satelitales + viento. La fiabilidad baja después del día 3.")
              :m==="persistence-wind"?_t(lang,"Persistance + vent Open-Meteo. Pas de banc détecté à proximité.","Persistence + Open-Meteo wind. No mat detected nearby.","Persistencia + viento de Open-Meteo. Ningún banco detectado cerca.")
              :m==="persistence"?_t(lang,"Persistance simple (demi-vie 3,5 j). Pas de signal externe.","Simple persistence (3.5-day half-life). No external signal.","Persistencia simple (vida media de 3,5 días). Sin señal externa.")
              :m==="interpolated"?_t(lang,"Interpolation des plages voisines surveillées.","Interpolated from monitored nearby beaches.","Interpolación de las playas vecinas monitoreadas.")
              :(lang==="fr"?weeklyData?.forecastDisclaimer:null)
            return txt?(
              <div style={{fontSize:10,color:"var(--sg-mid,#999)",marginTop:4,fontStyle:"italic"}}>
                {txt}
              </div>
            ):null
          })()}

          {/* Forecast confidence + source (credibility) */}
          {weeklyData&&<ForecastCredibility weeklyData={weeklyData} lang={lang} sargData={sargData}/>}

          {/* Weather */}
          {weather&&(
            <>
              <h3 style={{fontSize:15,fontWeight:700,margin:"20px 0 10px"}}>{LL.weather}</h3>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <WeatherCard icon="🌡️" label={LL.temp} value={fmtTemp(weather.temp)}/>
                <WeatherCard icon="💨" label={LL.wind} value={fmtWind(weather.wind)}/>
                <WeatherCard icon="☀️" label={LL.uv} value={weather.uv}/>
              </div>
              {/* Marine — only when significant */}
              {(()=>{
                const cards=[]
                if(weather.waveHeight!=null&&weather.waveHeight>=1.5)cards.push(<WeatherCard key="w" icon="🌊" label={LL.waves} value={fmtHeight(weather.waveHeight)}/>)
                if(weather.swellHeight!=null&&weather.swellHeight>=1.5)cards.push(<WeatherCard key="s" icon="🏄" label={LL.swell} value={fmtHeight(weather.swellHeight)}/>)
                if(weather.precipitation>0)cards.push(<WeatherCard key="r" icon="💧" label={LL.rain} value={fmtRain(weather.precipitation)}/>)
                return cards.length>0?<div style={{display:"grid",gridTemplateColumns:`repeat(${cards.length},1fr)`,gap:10,marginTop:10}}>{cards}</div>:null
              })()}
            </>
          )}

          {/* Email capture removed from bottom — moved above forecast teaser */}
        </div>
      </div>
    </>
  )
}

export default BeachSheet

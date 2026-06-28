import React,{useState,useEffect,useRef,useMemo}from"react"
import {_t,track,verdictMeta,moodFromScore,moodFromStatus,ScoreBlob,Veilleur,BeachScene,reliabilityHref,buildShareCard,BEACH_PHASE,HERO_PH_OVERRIDE,WorldAfaiGauge} from "./Sargasses_PROD"

// Hotspot jouable « clic ici » posé sur la scène SVG.
function WorldHotspot({x,y,label,onClick,delay}){
  return(
    <button onClick={onClick} aria-label={label} style={{position:"absolute",left:x,top:y,transform:"translate(-50%,-50%)",zIndex:3,width:38,height:38,borderRadius:"50%",border:"none",background:"none",cursor:"pointer",padding:0}}>
      <span className="wf-hot" style={{display:"block",width:14,height:14,margin:"0 auto",borderRadius:"50%",background:"rgba(255,255,255,.95)",animationDelay:(delay||0)+"s"}}/>
    </button>
  )
}
function WorldCard({beach,lang,active,index,onCarnet,phaseGrad}){
  const status=beach.status||"clean"
  const vm=verdictMeta(status,lang)
  const hasScore=typeof beach.score==="number"
  const mood=hasScore?moodFromScore(beach.score):moodFromStatus(status)
  const afai=typeof beach.afai==="number"?beach.afai:null
  const[tip,setTip]=useState(null)
  const TIPS={
    sky:{t:_t(lang,"☀️ Le saviez-vous ?","☀️ Did you know?","☀️ ¿Sabías?"),b:_t(lang,"La ceinture de sargasses traverse l'Atlantique sur près de 8 000 km — visible depuis l'espace.","The sargassum belt crosses the Atlantic for nearly 8,000 km — visible from space.","El cinturón de sargazo cruza el Atlántico casi 8.000 km — visible desde el espacio.")},
    sea:{t:_t(lang,"🛰️ Les algues, vues du ciel","🛰️ Algae from space","🛰️ Algas desde el cielo"),b:(afai!=null?"AFAI "+afai.toFixed(2)+" — ":"")+(status==="clean"?_t(lang,"signal faible : eau claire aujourd'hui.","low signal: clear water today.","señal baja: agua clara hoy."):status==="moderate"?_t(lang,"signal modéré : présence éparse, prudence.","moderate signal: scattered presence.","señal moderada: presencia dispersa."):_t(lang,"signal fort : échouage probable, évite.","strong signal: likely beaching.","señal fuerte: varazón probable."))},
    veilleur:{t:_t(lang,"Le verdict du Veilleur","The Watchman's verdict","El veredicto del Vigía"),b:vm.verb+" — "+(hasScore?_t(lang,"score "+beach.score+"/100, ","score "+beach.score+"/100, ","puntuación "+beach.score+"/100, "):"")+_t(lang,"d'après le scan satellite du jour, recoupé sur 30 jours.","from today's satellite scan, cross-checked over 30 days.","según el escaneo de hoy, contrastado 30 días.")},
  }
  const show=k=>{setTip(TIPS[k]);try{track("sg_world_hotspot",{zone:k,beach_id:beach.id})}catch(_){}}
  const vtRef=useRef(0)
  const tapVeilleur=()=>{vtRef.current+=1;if(vtRef.current>=5){vtRef.current=0;setTip({t:_t(lang,"🛰️✨ Tu as réveillé le Veilleur !","🛰️✨ You woke the Watchman!","🛰️✨ ¡Despertaste al Vigía!"),b:_t(lang,"Il te fait un clin d'œil. Reviens chaque jour : la mer change, et lui aussi.","He winks at you. Come back each day: the sea changes, and so does he.","Te guiña. Vuelve cada día: el mar cambia, y él también.")});try{track("sg_world_easter",{egg:"veilleur5",beach_id:beach.id})}catch(_){}}else show("veilleur")}
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",scrollSnapStop:"always",overflow:"hidden",background:phaseGrad}}>
      {active?<BeachScene beach={beach}/>:<div aria-hidden="true" style={{position:"absolute",inset:0,background:phaseGrad}}/>}
      <div aria-hidden="true" style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(4,9,11,0) 36%,rgba(4,9,11,.34) 64%,rgba(4,9,11,.84) 100%)"}}/>
      {/* HOTSPOTS jouables — touche la scène, la data se révèle in-world (pas un popup) */}
      {active&&<><WorldHotspot x="24%" y="19%" label={TIPS.sky.t} onClick={()=>show("sky")} delay={0}/><WorldHotspot x="66%" y="49%" label={TIPS.sea.t} onClick={()=>show("sea")} delay={.9}/></>}
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:4,padding:"0 22px calc(118px + env(safe-area-inset-bottom)) 22px",color:"#fff",maxWidth:560,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:4}}>
          {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={64}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:800,color:vm.color}}><span>{vm.emoji}</span><span>{vm.verb}</span></div>
            <h2 style={{margin:"2px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:30,lineHeight:1.02,letterSpacing:".01em",textShadow:"0 2px 14px rgba(0,0,0,.5)"}}>{beach.name}</h2>
            {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.8)"}}>{beach.commune}</div>}
          </div>
          <button onClick={tapVeilleur} aria-label={TIPS.veilleur.t} style={{background:"none",border:"none",padding:0,cursor:"pointer"}}><Veilleur mood={mood} size={42}/></button>
        </div>
        <WorldAfaiGauge afai={beach.afai} lang={lang}/>
        <a href={reliabilityHref(lang)} onClick={e=>{e.stopPropagation();try{track("sg_reliability_open",{from:"world_card"})}catch(_){}}}
          style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:10,fontSize:11.5,fontWeight:700,color:"rgba(255,255,255,.92)",textDecoration:"none"}}>
          🛰️ <span>{_t(lang,"Scan satellite • recoupé chaque jour","Satellite scan • cross-checked daily","Escaneo satélite • contrastado a diario")}</span> <span style={{color:"#3fd07f"}}>→</span>
        </a>
        <button onClick={()=>{try{track("sg_world_carnet",{beach_id:beach.id,status})}catch(_){}; onCarnet&&onCarnet(beach)}}
          style={{display:"block",width:"100%",marginTop:14,padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:15,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 24px rgba(0,0,0,.35)"}}>
          {_t(lang,"Le carnet du Veilleur →","The Watchman's log →","El cuaderno del Vigía →")}
        </button>
      </div>
      {index===0&&!tip&&<div className="wf-hint" aria-hidden="true" style={{position:"absolute",left:0,right:0,bottom:"calc(94px + env(safe-area-inset-bottom))",zIndex:4,textAlign:"center",color:"rgba(255,255,255,.85)",fontSize:12,fontWeight:800,letterSpacing:".07em"}}>
        👆 {_t(lang,"TOUCHE LA SCÈNE · SCROLLE ↓","TAP THE SCENE · SCROLL ↓","TOCA LA ESCENA · DESLIZA ↓")}
      </div>}
      {tip&&<button onClick={()=>setTip(null)} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",inset:0,zIndex:8,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"rgba(4,9,11,.42)",border:"none",cursor:"pointer"}}>
        <div className="wf-pop" style={{maxWidth:332,background:"rgba(7,32,30,.95)",border:"1px solid rgba(95,211,201,.42)",borderRadius:18,padding:"18px 20px",textAlign:"left",boxShadow:"0 14px 44px rgba(0,0,0,.55)"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#3fd07f",marginBottom:7}}>{tip.t}</div>
          <div style={{fontSize:14.5,lineHeight:1.5,color:"#fff"}}>{tip.b}</div>
          <div style={{marginTop:12,fontSize:11,color:"rgba(255,255,255,.5)"}}>{_t(lang,"Touche pour fermer","Tap to close","Toca para cerrar")}</div>
        </div>
      </button>}
    </section>
  )
}
// Infos SVG INTERCALÉES entre les plages (la découverte, pas que du scroll).
const WORLD_FACTS=[
  {emoji:"🌊",t:l=>_t(l,"8 000 km d'algues","8,000 km of algae","8.000 km de algas"),b:l=>_t(l,"La grande ceinture atlantique relie l'Afrique au Brésil. On la suit par satellite, chaque jour.","The great Atlantic belt links Africa to Brazil. We track it by satellite, every day.","El gran cinturón atlántico une África y Brasil. Lo seguimos por satélite, cada día.")},
  {emoji:"🛰️",t:l=>_t(l,"L'œil dans l'espace","The eye in space","El ojo en el espacio"),b:l=>_t(l,"Le Veilleur lit l'indice AFAI des satellites et le recoupe chaque jour : prévisions vérifiées au satellite.","The Watchman reads the satellites' AFAI index, cross-checked daily against satellite.","El Vigía lee el índice AFAI, contrastado a diario con satélite.")},
  {emoji:"💨",t:l=>_t(l,"Le H₂S, c'est quoi ?","What is H₂S?","¿Qué es el H₂S?"),b:l=>_t(l,"En se décomposant, les sargasses dégagent du sulfure d'hydrogène — l'odeur d'œuf. On te prévient avant.","Decomposing sargassum releases hydrogen sulfide — the egg smell. We warn you first.","Al descomponerse libera sulfuro de hidrógeno — olor a huevo. Te avisamos antes.")},
  {emoji:"♻️",t:l=>_t(l,"Une ressource ?","A resource?","¿Un recurso?"),b:l=>_t(l,"Ramassées tôt, les sargasses deviennent engrais, bioplastique ou énergie. Le timing change tout.","Collected early, sargassum becomes fertilizer, bioplastic or energy. Timing is everything.","Recogido a tiempo, el sargazo se vuelve fertilizante o energía. El tiempo lo es todo.")},
]
function WorldInfoCard({fact,lang}){
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",overflow:"hidden",
      background:"radial-gradient(120% 80% at 50% 20%,#11463E 0%,#0B2230 55%,#04090B 100%)",color:"#fff"}}>
      <div className="wf-fact" style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 30px calc(120px + env(safe-area-inset-bottom))",maxWidth:540,margin:"0 auto",textAlign:"center"}}>
        <div style={{fontSize:54,lineHeight:1}}>{fact.emoji}</div>
        <h2 style={{margin:"16px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:32,lineHeight:1.05}}>{fact.t(lang)}</h2>
        <p style={{margin:"12px 0 0",fontSize:15,lineHeight:1.55,color:"rgba(255,255,255,.88)"}}>{fact.b(lang)}</p>
        <div style={{marginTop:22,fontSize:11.5,fontWeight:700,letterSpacing:".08em",color:"rgba(255,255,255,.55)"}}>{_t(lang,"CONTINUE ↓","CONTINUE ↓","SIGUE ↓")}</div>
      </div>
    </section>
  )
}
function WorldChallengeCard({beach,lang,active,phaseGrad,onGuess,streak}){
  const real=beach.status||"clean"
  const vm=verdictMeta(real,lang)
  const hasScore=typeof beach.score==="number"
  const afai=typeof beach.afai==="number"?beach.afai:null
  const[guess,setGuess]=useState(null)
  const correct=guess===real
  const opts=[
    {s:"clean",e:"😎",l:_t(lang,"Propre","Clean","Limpia"),c:"#22C55E"},
    {s:"moderate",e:"😐",l:_t(lang,"Prudence","Careful","Cuidado"),c:"#F59E0B"},
    {s:"avoid",e:"🚫",l:_t(lang,"Évite","Avoid","Evita"),c:"#E8522A"},
  ]
  const pick=s=>{if(guess)return;setGuess(s);try{track("sg_world_guess",{beach_id:beach.id,guess:s,correct:s===real})}catch(_){}; onGuess&&onGuess(s===real)}
  const why=(afai!=null?"AFAI "+afai.toFixed(2)+" — ":"")+(real==="clean"?_t(lang,"signal satellite faible, eau claire.","low satellite signal, clear water.","señal baja, agua clara."):real==="moderate"?_t(lang,"signal modéré, présence éparse.","moderate signal, scattered.","señal moderada."):_t(lang,"signal fort, échouage probable.","strong signal, likely beaching.","señal fuerte."))
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",scrollSnapStop:"always",overflow:"hidden",background:phaseGrad}}>
      {active?<BeachScene beach={beach}/>:<div aria-hidden="true" style={{position:"absolute",inset:0,background:phaseGrad}}/>}
      <div aria-hidden="true" style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(4,9,11,.15) 0%,rgba(4,9,11,.2) 40%,rgba(4,9,11,.86) 100%)"}}/>
      <div style={{position:"absolute",left:0,right:0,bottom:0,zIndex:4,padding:"0 22px calc(120px + env(safe-area-inset-bottom)) 22px",color:"#fff",maxWidth:560,margin:"0 auto"}}>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:".08em",color:"#FFD884"}}>🎯 {_t(lang,"DÉFI DU VEILLEUR","WATCHMAN'S CHALLENGE","DESAFÍO DEL VIGÍA")}{streak>0?" · 🔥 "+streak:""}</div>
        <h2 style={{margin:"4px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:28,lineHeight:1.04,textShadow:"0 2px 14px rgba(0,0,0,.5)"}}>{beach.name}</h2>
        {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.8)"}}>{beach.commune}</div>}
        {!guess?(
          <div className="wf-pop">
            <p style={{margin:"14px 0 10px",fontSize:15,fontWeight:700}}>{_t(lang,"À ton avis, c'est comment aujourd'hui ?","Your call for today?","¿Cómo está hoy?")}</p>
            <div style={{display:"flex",gap:8}}>
              {opts.map(o=>(<button key={o.s} onClick={()=>pick(o.s)} style={{flex:1,padding:"13px 6px",borderRadius:14,border:"1px solid "+o.c+"66",cursor:"pointer",background:"rgba(255,255,255,.08)",color:"#fff",fontWeight:800,fontSize:12.5,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:24}}>{o.e}</span>{o.l}</button>))}
            </div>
          </div>
        ):(
          <div className="wf-pop">
            <div style={{fontSize:16,fontWeight:800,color:correct?"#22C55E":"#FFD884",margin:"14px 0 10px"}}>{correct?_t(lang,"Bravo ! 🎉 +1 série","Nailed it! 🎉 +1 streak","¡Bien! 🎉 +1 racha"):_t(lang,"Raté ! Le vrai verdict :","Missed! The real verdict:","¡Fallaste! El veredicto:")}</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={58}/>}
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:16,fontWeight:800,color:vm.color}}>{vm.emoji} {vm.verb}</div><div style={{fontSize:12.5,lineHeight:1.4,color:"rgba(255,255,255,.84)"}}>{why}</div></div>
            </div>
            {!correct&&<button onClick={async()=>{try{track("sg_share",{variant:"missed",beach_id:beach.id,guess})}catch(_){};try{await buildShareCard({variant:"missed",guess,streak,lang})}catch(_){}}}
              style={{display:"block",width:"100%",marginTop:12,padding:"12px",borderRadius:14,border:"1px solid rgba(255,216,132,.5)",cursor:"pointer",background:"rgba(255,216,132,.1)",color:"#FFD884",fontWeight:800,fontSize:13.5,fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
              🌊 {_t(lang,"La mer m'a eu — tu ferais mieux ?","The sea fooled me — beat it?","El mar me engañó — ¿lo haces mejor?")}</button>}
            <div style={{marginTop:14,fontSize:12,fontWeight:700,letterSpacing:".06em",color:"rgba(255,255,255,.6)"}}>↓ {_t(lang,"PLAGE SUIVANTE","NEXT BEACH","SIGUIENTE")}</div>
          </div>
        )}
      </div>
    </section>
  )
}
// BONUS débloqué par la série (jeu -> conversion) : célébration + une vraie reco
// premium OFFERTE (la plage la plus propre maintenant = la "reco du jour" payante),
// puis CTA Premium. Le jeu nourrit le funnel : data -> jeu -> vente. In-world.
function WorldBonus({level,topBeach,lang,onPremium,onClose}){
  const vm=topBeach?verdictMeta(topBeach.status||"clean",lang):null
  return(
    <div role="dialog" aria-modal="true" aria-label={_t(lang,"Bonus débloqué","Bonus unlocked","Bono")} style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center",padding:26,
      background:"radial-gradient(120% 90% at 50% 28%,rgba(17,70,62,.96),rgba(4,9,11,.97))",animation:"wfBonusIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      <div className="wf-pop" style={{maxWidth:360,width:"100%",textAlign:"center",color:"#fff"}}>
        <div style={{fontSize:48,lineHeight:1}}>🎁</div>
        <div style={{marginTop:6,fontSize:12,fontWeight:800,letterSpacing:".08em",color:"#FFD884"}}>🔥 {_t(lang,"SÉRIE DE","STREAK OF","RACHA DE")} {level} · {_t(lang,"BONUS DÉBLOQUÉ","BONUS UNLOCKED","BONO DESBLOQUEADO")}</div>
        <h2 style={{margin:"8px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:30,lineHeight:1.06}}>{_t(lang,"Tu as l'œil du Veilleur","You've got the Watchman's eye","Tienes el ojo del Vigía")}</h2>
        {topBeach&&<div style={{margin:"16px 0 0",padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,.07)",border:"1px solid rgba(95,211,201,.35)",textAlign:"left"}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:".06em",color:"#3fd07f",textTransform:"uppercase"}}>🎁 {_t(lang,"Offert : ta reco du moment","Free: your pick right now","Gratis: tu recomendación")}</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginTop:8}}>
            {typeof topBeach.score==="number"&&<ScoreBlob score={topBeach.score} color={topBeach.scoreColor||vm.color} size={52}/>}
            <div style={{flex:1,minWidth:0}}><div style={{fontSize:16,fontWeight:800}}>{topBeach.name}</div><div style={{fontSize:12.5,color:"rgba(255,255,255,.82)"}}>{topBeach.commune?topBeach.commune+" · ":""}{vm.emoji} {vm.verb}</div></div>
          </div>
          <button onClick={async()=>{try{track("sg_share",{variant:"top",beach_id:topBeach.id,score:topBeach.score})}catch(_){};try{await buildShareCard({variant:"top",beach:topBeach,forecast:topBeach.forecast,lang})}catch(_){}}}
            style={{display:"block",width:"100%",marginTop:12,padding:"10px",borderRadius:12,border:"1px solid rgba(255,216,132,.5)",cursor:"pointer",background:"rgba(255,216,132,.1)",color:"#FFD884",fontWeight:800,fontSize:13,fontFamily:"'Bricolage Grotesque',system-ui,sans-serif"}}>
            ☀️ {_t(lang,"Partager la plage du jour","Share beach of the day","Compartir la playa del día")}</button>
        </div>}
        {/* Veille-Card de Série AVANT le CTA premium : le partage frappe au pic
            émotionnel (le "Wordle de la mer", actif d'acquisition organique). */}
        <button onClick={async()=>{try{track("sg_share",{variant:"streak",level})}catch(_){}; let best=level;try{best=parseInt(localStorage.getItem("sg_world_best")||String(level))||level}catch(_){}; try{await buildShareCard({variant:"streak",streak:level,best,lang})}catch(_){}}}
          style={{display:"block",width:"100%",marginTop:16,padding:"14px",borderRadius:16,border:"1px solid rgba(95,211,201,.5)",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:14.5,fontWeight:800,color:"#3fd07f",background:"rgba(95,211,201,.08)"}}>
          🔥 {_t(lang,"Partager ma série","Share my streak","Compartir mi racha")}
        </button>
        <button onClick={()=>{try{track("sg_world_bonus_premium",{level})}catch(_){}; onPremium&&onPremium("world_bonus")}}
          style={{display:"block",width:"100%",marginTop:10,padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:15.5,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
          {_t(lang,"Le Veilleur veille pour toi chaque jour →","The Watchman watches for you daily →","El Vigía vigila para ti cada día →")}
        </button>
        <button onClick={onClose} style={{marginTop:14,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.7)",fontSize:13,fontWeight:700}}>
          {_t(lang,"Continuer à jouer","Keep playing","Seguir jugando")}
        </button>
      </div>
    </div>
  )
}
// Le CARNET in-world (remplace le popup du bas) : data profonde + nudge premium, immersif.
function WorldCarnet({beach,lang,onClose,onPremium}){
  const status=beach.status||"clean"
  const vm=verdictMeta(status,lang)
  const hasScore=typeof beach.score==="number"
  const mood=hasScore?moodFromScore(beach.score):moodFromStatus(status)
  return(
    <div role="dialog" aria-modal="true" aria-label={beach.name} style={{position:"absolute",inset:0,zIndex:20,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",
      background:"linear-gradient(180deg,#04090B 0%,#0B2230 50%,#11463E 100%)",animation:"wfCarnetIn .32s cubic-bezier(.22,1,.36,1) both"}}>
      <button onClick={onClose} style={{position:"sticky",top:"calc(12px + env(safe-area-inset-top))",marginLeft:14,zIndex:3,padding:"8px 14px",borderRadius:999,
        background:"rgba(4,9,11,.5)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",backdropFilter:"blur(8px)"}}>← {_t(lang,"Retour","Back","Volver")}</button>
      <div style={{padding:"8px 22px calc(60px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",color:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:6}}>
          <Veilleur mood={mood} size={58}/>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{margin:0,fontFamily:"'Anton',system-ui,sans-serif",fontSize:28,lineHeight:1.04}}>{beach.name}</h2>
            {beach.commune&&<div style={{fontSize:12.5,fontWeight:600,color:"rgba(255,255,255,.78)"}}>{beach.commune}</div>}
          </div>
          {hasScore&&<ScoreBlob score={beach.score} color={beach.scoreColor||vm.color} size={58}/>}
        </div>
        <div style={{marginTop:14,padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)"}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".06em",color:vm.color,textTransform:"uppercase"}}>{_t(lang,"Aujourd'hui · gratuit","Today · free","Hoy · gratis")}</div>
          <div style={{marginTop:6,fontSize:16,fontWeight:800}}>{vm.emoji} {vm.verb}</div>
          <WorldAfaiGauge afai={beach.afai} lang={lang}/>
        </div>
        <button onClick={()=>{try{track("sg_world_carnet_premium",{beach_id:beach.id})}catch(_){}; onPremium&&onPremium("world_carnet")}}
          style={{display:"block",width:"100%",marginTop:14,padding:"16px",borderRadius:16,border:"1px solid rgba(255,216,132,.4)",cursor:"pointer",textAlign:"left",
          background:"linear-gradient(135deg,rgba(255,216,132,.14),rgba(242,176,94,.08))",color:"#fff"}}>
          <div style={{fontSize:12,fontWeight:800,letterSpacing:".06em",color:"#FFD884"}}>🔒 {_t(lang,"AVEC LE VEILLEUR","WITH THE WATCHMAN","CON EL VIGÍA")}</div>
          <div style={{marginTop:6,fontSize:15,fontWeight:700,lineHeight:1.4}}>{_t(lang,"Prévision 14 jours, historique, brief matin & alertes sur cette plage →","14-day forecast, history, morning brief & alerts for this beach →","Pronóstico 14 días, historial, resumen y alertas →")}</div>
        </button>
        <a href={reliabilityHref(lang)} onClick={()=>{try{track("sg_reliability_open",{from:"world_carnet"})}catch(_){}}}
          style={{display:"inline-flex",alignItems:"center",gap:7,marginTop:16,fontSize:12,fontWeight:700,color:"rgba(255,255,255,.82)",textDecoration:"none"}}>
          🛰️ {_t(lang,"Comment on prévoit : notre fiabilité →","How we forecast: our reliability →","Cómo pronosticamos: nuestra fiabilidad →")}
        </a>
      </div>
    </div>
  )
}
function WorldPremiumCard({lang,onPremium,onRestart}){
  return(
    <section style={{position:"relative",height:"100svh",minHeight:"100svh",scrollSnapAlign:"start",overflow:"hidden",
      background:"linear-gradient(180deg,#04090B 0%,#0B2230 46%,#155A5A 100%)",color:"#fff"}}>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 28px calc(110px + env(safe-area-inset-bottom))",maxWidth:560,margin:"0 auto",textAlign:"center"}}>
        <Veilleur mood="serein" size={74}/>
        <h2 style={{margin:"16px 0 0",fontFamily:"'Anton',system-ui,sans-serif",fontSize:34,lineHeight:1.05}}>{_t(lang,"Va plus loin que le verdict","Beyond the verdict","Más allá del veredicto")}</h2>
        <p style={{margin:"10px 0 0",fontSize:14.5,lineHeight:1.5,color:"rgba(255,255,255,.86)"}}>
          {_t(lang,"Prévision 14 jours, historique, brief matin et alertes sur tes plages favorites — toute notre science, pour toi.","14-day forecast, history, morning brief and alerts on your favourite beaches — all our science, for you.","Pronóstico 14 días, historial, resumen matutino y alertas en tus playas favoritas — toda nuestra ciencia, para ti.")}
        </p>
        <button onClick={()=>{try{track("sg_world_premium",{})}catch(_){}; onPremium&&onPremium("world")}}
          style={{marginTop:20,padding:"14px 26px",borderRadius:16,border:"none",cursor:"pointer",
          fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:16,fontWeight:800,color:"#07201E",
          background:"linear-gradient(180deg,#FFD884,#F2B05E)",boxShadow:"0 8px 28px rgba(0,0,0,.4)"}}>
          {_t(lang,"Activer le Veilleur →","Activate the Watchman →","Activar el Vigía →")}
        </button>
        <button onClick={onRestart} style={{marginTop:16,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.72)",fontSize:13,fontWeight:700}}>
          ↻ {_t(lang,"Revoir les plages","See beaches again","Ver playas otra vez")}
        </button>
      </div>
    </section>
  )
}
function WorldFeed({beaches,lang,onPremium,onClose,island}){
  const scrollRef=useRef(null)
  const[active,setActive]=useState(0)
  const[carnet,setCarnet]=useState(null)
  // Série 🔥 — passe-temps + raison de revenir (persistée, easter egg returning).
  const[streak,setStreak]=useState(()=>{try{return parseInt(localStorage.getItem("sg_world_streak")||"0")||0}catch(_){return 0}})
  const[best,setBest]=useState(()=>{try{return parseInt(localStorage.getItem("sg_world_best")||"0")||0}catch(_){return 0}})
  const[bonus,setBonus]=useState(null) // palier de série atteint -> bonus débloqué (jeu -> conversion)
  const onGuess=correct=>{const ns=correct?streak+1:0;setStreak(ns);try{localStorage.setItem("sg_world_streak",String(ns))}catch(_){};if(ns>best){setBest(ns);try{localStorage.setItem("sg_world_best",String(ns))}catch(_){}};if(correct&&(ns===3||ns===7||ns===14||ns===30))setBonus(ns);try{track("sg_world_guess_result",{correct,streak:ns})}catch(_){}}
  const phaseGrad=useMemo(()=>{
    let ph="golden";try{if(typeof HERO_PH_OVERRIDE!=="undefined"&&HERO_PH_OVERRIDE)ph=HERO_PH_OVERRIDE;else{const h=new Date().getHours();ph=h<5?"night":h<8?"dawn":h<17?"day":h<20?"golden":"night"}}catch(_){}
    const t=BEACH_PHASE[ph]||BEACH_PHASE.golden
    return "linear-gradient(180deg,"+t.sky[0]+","+t.sky[2]+" 60%,"+t.seaB+")"
  },[])
  const list=useMemo(()=>(beaches||[]).filter(b=>b&&b.id&&b.name&&(!island||b.island===island)).slice(0,16),[beaches,island])
  // La meilleure plage maintenant (data réelle) = la reco premium offerte par le bonus.
  const topBeach=useMemo(()=>{const c=list.filter(b=>b.status==="clean"&&typeof b.score==="number").sort((a,b)=>b.score-a.score);return c[0]||list.slice().sort((a,b)=>(b.score||0)-(a.score||0))[0]||null},[list])
  // Items intercalés : 1 carte science toutes les 4 plages (info entre les plages).
  const items=useMemo(()=>{
    const out=[];let fi=0
    list.forEach((b,i)=>{out.push({type:"beach",beach:b,bi:i})
      if((i+1)%4===0&&i<list.length-1){out.push({type:"info",fact:WORLD_FACTS[fi%WORLD_FACTS.length]});fi++}
      if((i+1)%5===0&&list.length>3){out.push({type:"challenge",beach:list[(i+3)%list.length]})}
    })
    out.push({type:"premium"})
    return out
  },[list])
  useEffect(()=>{
    const root=scrollRef.current;if(!root)return
    const io=new IntersectionObserver(es=>{
      es.forEach(e=>{if(e.isIntersecting){const i=parseInt(e.target.getAttribute("data-wf-card"));if(!isNaN(i))setActive(i)}})
    },{root,threshold:0.55})
    root.querySelectorAll("[data-wf-card]").forEach(c=>io.observe(c))
    return()=>io.disconnect()
  },[items.length])
  useEffect(()=>{try{track("sg_world_open",{count:list.length})}catch(_){}},[])// eslint-disable-line
  const restart=()=>{try{scrollRef.current&&scrollRef.current.scrollTo({top:0,behavior:"smooth"})}catch(_){}}
  return(
    <div role="region" aria-label={_t(lang,"Monde Sargasses","Sargassum World","Mundo Sargazo")} style={{position:"fixed",inset:0,zIndex:1005,background:"#04090B"}}>
      <style>{`@keyframes wfHint{0%,100%{transform:translateY(0);opacity:.72}50%{transform:translateY(5px);opacity:1}}.wf-hint{animation:wfHint 1.8s ease-in-out 1 both}@keyframes wfMark{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}.wf-mark{animation:wfMark 2.4s ease-in-out 1 both}@keyframes wfHot{0%{box-shadow:0 0 0 0 rgba(95,211,201,.5),0 2px 8px rgba(0,0,0,.5)}70%{box-shadow:0 0 0 14px rgba(95,211,201,0),0 2px 8px rgba(0,0,0,.5)}100%{box-shadow:0 0 0 0 rgba(95,211,201,0),0 2px 8px rgba(0,0,0,.5)}}.wf-hot{animation:wfHot 2.2s ease-out 1 both}@keyframes wfPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}.wf-pop{animation:wfPop .24s cubic-bezier(.34,1.56,.64,1) both}@keyframes wfFact{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}.wf-fact{animation:wfFact .5s ease both}@keyframes wfCarnetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes wfBonusIn{from{opacity:0}to{opacity:1}}@media(prefers-reduced-motion:reduce){.wf-hint,.wf-mark,.wf-hot,.wf-pop,.wf-fact{animation:none}}`}</style>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"absolute",top:"calc(12px + env(safe-area-inset-top))",right:14,zIndex:30,width:40,height:40,borderRadius:"50%",
        background:"rgba(4,9,11,.55)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",fontSize:17,cursor:"pointer",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>✕</button>
      {streak>0&&<div aria-label={_t(lang,"Série","Streak","Racha")} style={{position:"absolute",top:"calc(15px + env(safe-area-inset-top))",left:14,zIndex:30,padding:"6px 12px",borderRadius:999,
        background:"rgba(4,9,11,.55)",border:"1px solid rgba(255,216,132,.45)",color:"#FFD884",fontSize:12.5,fontWeight:800,backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>🔥 {streak}{best>streak?" · ⭐"+best:""}</div>}
      <div ref={scrollRef} style={{position:"absolute",inset:0,overflowY:"auto",overflowX:"hidden",scrollSnapType:"y mandatory",WebkitOverflowScrolling:"touch"}}>
        {items.map((it,idx)=>(
          <div key={idx} data-wf-card={idx}>
            {it.type==="beach"&&<WorldCard beach={it.beach} index={it.bi} active={Math.abs(idx-active)<=1} lang={lang} onCarnet={setCarnet} phaseGrad={phaseGrad}/>}
            {it.type==="info"&&<WorldInfoCard fact={it.fact} lang={lang}/>}
            {it.type==="challenge"&&<WorldChallengeCard beach={it.beach} active={Math.abs(idx-active)<=1} lang={lang} phaseGrad={phaseGrad} onGuess={onGuess} streak={streak}/>}
            {it.type==="premium"&&<WorldPremiumCard lang={lang} onPremium={onPremium} onRestart={restart}/>}
          </div>
        ))}
      </div>
      {carnet&&<WorldCarnet beach={carnet} lang={lang} onClose={()=>setCarnet(null)} onPremium={onPremium}/>}
      {bonus&&<WorldBonus level={bonus} topBeach={topBeach} lang={lang} onPremium={onPremium} onClose={()=>setBonus(null)}/>}
    </div>
  )
}

export default WorldFeed

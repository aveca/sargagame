import React, { useEffect } from "react"
import { track, _t, s, Veilleur } from "./Sargasses_PROD"

export default function WhatsNewJournal({lang,title,items,releaseV,releaseDate,allowDeepLinks,isPremium,mood="scan",onClose,onExplore,onPremium}){
  useEffect(()=>{try{track("sg_whatsnew_view",{v:releaseV,items:items.length})}catch(_){}},[])// eslint-disable-line
  const L=(it)=>it[lang]||it.fr
  const ttl=title?(title[lang]||title.fr):_t(lang,"Pendant ton absence","While you were away","Mientras no estabas")
  const go=(href)=>{try{track("sg_whatsnew_item",{v:releaseV,href})}catch(_){};try{s("sg_rel_seen",releaseV)}catch(_){};try{window.location.href=href}catch(_){}}
  return(
    <div role="dialog" aria-modal="true" className="sg-onink-scope" aria-label={_t(lang,"Nouveautés","What's new","Novedades")}
      style={{position:"fixed",inset:0,zIndex:1072,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",overscrollBehavior:"contain",
        background:"linear-gradient(180deg,#0B2230 0%,#155A5A 38%,#C97E3A 76%,#F2B05E 100%)",
        animation:"viewFadeIn .4s cubic-bezier(.22,1,.36,1) both"}}>
      <div aria-hidden style={{position:"absolute",left:"50%",bottom:"-22%",width:"140%",height:"62%",transform:"translateX(-50%)",
        background:"radial-gradient(closest-side,rgba(255,216,132,.5),rgba(255,216,132,0))",pointerEvents:"none"}}/>
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"fixed",top:"calc(12px + env(safe-area-inset-top))",right:12,zIndex:6,width:42,height:42,borderRadius:21,
          background:"rgba(7,32,30,.5)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
          border:"1px solid rgba(255,255,255,.2)",color:"#fff",fontSize:16,cursor:"pointer"}}>✕</button>

      <div style={{position:"relative",maxWidth:460,margin:"0 auto",minHeight:"100%",display:"flex",flexDirection:"column",
        justifyContent:"center",padding:"max(40px,11vh) 22px max(26px,env(safe-area-inset-bottom)) 22px",boxSizing:"border-box"}}>
        {/* Humeur du Veilleur branchée sur l'état RÉEL du littoral (jamais 'serein' figé). */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:6}}><Veilleur mood={mood} size={70}/></div>
        <div style={{textAlign:"center",fontSize:11.5,fontWeight:800,letterSpacing:".16em",textTransform:"uppercase",color:"#FFD884",marginBottom:7}}>
          {_t(lang,"Content de te revoir","Good to see you back","Qué bueno verte")}
        </div>
        <h2 style={{margin:"0 0 8px",textAlign:"center",fontFamily:"'Anton',Impact,Haettenschweiler,'Arial Narrow',sans-serif",fontWeight:400,
          textTransform:"uppercase",letterSpacing:"-.02em",lineHeight:1.02,color:"#fff",
          fontSize:"clamp(30px,8vw,42px)",textShadow:"0 2px 24px rgba(0,0,0,.35)"}}>{ttl}</h2>
        <p style={{margin:"0 auto 20px",textAlign:"center",maxWidth:360,fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,.82)"}}>
          {_t(lang,"On a continué à veiller pendant que tu n'étais pas là. Voilà ce qui a changé.",
                  "We kept watch while you were gone. Here's what changed.",
                  "Seguimos vigilando mientras no estabas. Esto fue lo que cambió.")}
        </p>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {items.map((it,i)=>{
            const clickable=allowDeepLinks&&it.href&&it.href.startsWith("/")
            return(
            <div key={i} onClick={clickable?()=>go(it.href):undefined}
              style={{display:"flex",alignItems:"center",gap:13,padding:"13px 15px",borderRadius:16,
                background:"rgba(255,252,247,.95)",border:"1px solid rgba(255,255,255,.5)",
                boxShadow:"0 8px 26px rgba(7,32,30,.22)",cursor:clickable?"pointer":"default",
                animation:`viewFadeIn .5s cubic-bezier(.22,1,.36,1) ${(0.06*i+0.12).toFixed(2)}s both`}}>
              <div style={{flexShrink:0,width:40,height:40,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:21,background:"linear-gradient(180deg,#FFE47A,#F2B05E)"}}>{it.emoji||"✨"}</div>
              <div style={{flex:1,fontSize:13.5,lineHeight:1.42,fontWeight:600,color:"#15110A"}}>{L(it)}</div>
              {clickable&&<div style={{flexShrink:0,color:"#B87A00",fontSize:18,fontWeight:800}}>→</div>}
            </div>)
          })}
        </div>

        <button onClick={onExplore}
          style={{marginTop:22,width:"100%",padding:"16px",borderRadius:16,border:"none",cursor:"pointer",
            fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",fontSize:16,fontWeight:800,color:"#0D0D0D",
            background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E8A800)",boxShadow:"0 10px 30px rgba(232,168,0,.4)"}}>
          {_t(lang,"Voir ma plage en direct →","See my beach live →","Ver mi playa en vivo →")}
        </button>

        {!isPremium&&(
          // Lien premium DISCRET mais bien cliquable (→ openPremium). Posé sur le BAS golden
          // clair du dégradé → texte ENCRE (#0D0D0D ≈8:1 sur #F2B05E), pas blanc (le blanc y
          // tombait à ~1.9:1, le text-shadow ne compte pas WCAG). Picto SVG ink (plus de 🛰️ OS).
          <button onClick={onPremium} style={{marginTop:13,background:"none",border:"none",cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:7,
            color:"#0D0D0D",fontSize:13,fontWeight:800,fontFamily:"inherit",textAlign:"center",width:"100%",
            textShadow:"none"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{flexShrink:0}}>
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#07201E"/>
              <circle cx="12" cy="12" r="1.1" fill="#FFE47A"/>
              <path d="M9 11 4.4 8M15 11 19.6 8" stroke="#07201E" strokeWidth="1.6" strokeLinecap="round" opacity=".9"/>
              <rect x="3" y="6.2" width="3" height="3.4" rx=".7" fill="#07201E" opacity=".9"/>
              <rect x="18" y="6.2" width="3" height="3.4" rx=".7" fill="#07201E" opacity=".9"/>
            </svg>
            {_t(lang,"Le Veilleur personnel veille TA plage pour toi →",
                      "Your personal Watcher keeps an eye on YOUR beach →",
                      "El Vigía personal cuida TU playa por ti →")}
          </button>
        )}
        <div style={{textAlign:"center",marginTop:14,fontSize:10.5,color:"rgba(13,13,13,.65)"}}>{releaseV}{releaseDate?" · "+releaseDate:""}</div>
      </div>
    </div>
  )
}

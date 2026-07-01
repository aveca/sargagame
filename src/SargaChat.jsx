// SargaChat.jsx — assistant guidé « Le Veilleur » (overlay chat), extrait du monolithe
// pour alléger le bundle eager. Overlay hors first-paint (showChat, ouvert au clic).
// Helpers partagés importés via exports nommés du monolithe — zéro duplication.
import React,{useState,useEffect,useRef,useMemo}from"react"
import{_t,track,BEACH_TO_SARG,IS_NEW_REGION,PAY_CAPTURE_ONLY,Veilleur,g,s}from"./Sargasses_PROD.jsx"
export default function SargaChat({lang,allBeaches,island,sargData,onOpenBeach,onPremium,onClose}){
  const t=(fr,en,es)=>_t(lang,fr,en,es)
  const cands=useMemo(()=>(allBeaches||[]).filter(b=>(IS_NEW_REGION||b.island===island)&&b.status),[allBeaches,island])
  const cleans=useMemo(()=>cands.filter(b=>b.status==="clean").sort((a,b)=>(b.score||0)-(a.score||0)),[cands])
  const rootChips=[
    {k:"where",label:t("🏖 Où aller aujourd'hui ?","🏖 Where should I go today?","🏖 ¿Adónde voy hoy?")},
    {k:"tomorrow",label:t("📅 Et demain, ça tient ?","📅 Will it hold tomorrow?","📅 ¿Y mañana?")},
    {k:"premium",label:t("⭐ C'est quoi Premium ?","⭐ What's Premium?","⭐ ¿Qué es Premium?")},
    {k:"trust",label:t("🛰 C'est fiable ?","🛰 Is it reliable?","🛰 ¿Es confiable?")},
  ]
  const hello={who:"bot",text:t(
    "Salut ! Je réponds avec les données satellite du jour — rien d'inventé. Tu veux savoir quoi ?",
    "Hi! I answer with today's satellite data — nothing made up. What do you want to know?",
    "¡Hola! Respondo con los datos satelitales de hoy — nada inventado. ¿Qué quieres saber?"),chips:rootChips}
  const[msgs,setMsgs]=useState([hello])
  const[typing,setTyping]=useState(false)
  const bodyRef=useRef(null)
  useEffect(()=>{if(bodyRef.current)bodyRef.current.scrollTop=bodyRef.current.scrollHeight},[msgs,typing])
  const answer=k=>{
    if(k==="where"){
      if(cleans.length){
        const top=cleans.slice(0,3)
        return{text:t(
          `Aujourd'hui, ${cleans.length} plage${cleans.length>1?"s":""} propre${cleans.length>1?"s":""}. Mon top : ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`,
          `${cleans.length} clean beach${cleans.length>1?"es":""} today. My top picks: ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`,
          `Hoy hay ${cleans.length} playa${cleans.length>1?"s":""} limpia${cleans.length>1?"s":""}. Mi top: ${top.map(b=>`${b.name}${b.score!=null?` (${b.score}/100)`:""}`).join(", ")}.`),
          chips:[{k:"open:"+top[0].id,label:t("Ouvrir "+top[0].name+" →","Open "+top[0].name+" →","Abrir "+top[0].name+" →")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
      }
      const best=[...cands].sort((a,b)=>(b.score||0)-(a.score||0))[0]
      return{text:t(
        "Aucune plage 100% propre aujourd'hui — journée compliquée. La moins touchée reste "+(best?best.name:"…")+".",
        "No fully clean beach today — rough day. The least affected is "+(best?best.name:"…")+".",
        "Ninguna playa 100% limpia hoy — día difícil. La menos afectada es "+(best?best.name:"…")+"."),
        chips:[...(best?[{k:"open:"+best.id,label:t("Voir "+best.name+" →","See "+best.name+" →","Ver "+best.name+" →")}]:[]),{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    }
    if(k==="tomorrow"){
      const wk=sargData?.weekly||{}
      let stay=0,turn=0
      for(const b of cleans){
        const id=IS_NEW_REGION?b.id:BEACH_TO_SARG[b.id]
        const f=id?wk[id]?.forecast?.[1]?.status:null
        if(!f)continue
        if(f==="clean")stay++;else turn++
      }
      const has=stay+turn>0
      return{text:has?t(
        `Prévision satellite pour demain : ${stay} plage${stay>1?"s":""} propre${stay>1?"s":""} le reste${stay>1?"nt":""}${turn?`, ${turn} se dégrade${turn>1?"nt":""} ⚠️`:" — ça tient."}`,
        `Satellite forecast for tomorrow: ${stay} beach${stay>1?"es":""} stay${stay>1?"":"s"} clean${turn?`, ${turn} turn${turn>1?"":"s"} worse ⚠️`:" — holding."}`,
        `Pronóstico satelital para mañana: ${stay} playa${stay>1?"s":""} sigue${stay>1?"n":""} limpia${stay>1?"s":""}${turn?`, ${turn} empeora${turn>1?"n":""} ⚠️`:" — se mantiene."}`):t(
        "La prévision de demain est en cours de calcul (4 passages satellite par jour) — repasse dans quelques heures.",
        "Tomorrow's forecast is still computing (4 satellite passes a day) — check back in a few hours.",
        "El pronóstico de mañana se está calculando (4 pasadas satelitales al día) — vuelve en unas horas."),
        chips:[{k:"premium",label:t("⭐ Les 7 jours, plage par plage","⭐ The full 7 days, beach by beach","⭐ Los 7 días, playa por playa")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    }
    if(k==="premium")return{text:t(
      "Premium, c'est ton veilleur personnel : la plage recommandée chaque matin dans ta boîte, une alerte si TA plage change, et la prévision 7 jours plage par plage. "+(PAY_CAPTURE_ONLY?"En ce moment c'est offert 7 jours, juste ton email.":"Annulable en 2 clics."),
      "Premium is your personal watchman: the recommended beach in your inbox every morning, an alert when YOUR beach changes, and the 7-day forecast beach by beach. "+(PAY_CAPTURE_ONLY?"Right now it's 7 days on us, just your email.":"Cancel in 2 clicks."),
      "Premium es tu vigía personal: la playa recomendada cada mañana en tu correo, una alerta si TU playa cambia, y el pronóstico de 7 días playa por playa. "+(PAY_CAPTURE_ONLY?"Ahora son 7 días gratis, solo tu email.":"Cancela en 2 clics.")),
      chips:[{k:"cta",label:t("Voir l'offre ⭐","See the offer ⭐","Ver la oferta ⭐")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    if(k==="trust")return{text:t(
      "Données satellite Copernicus (programme spatial européen), actualisées 4×/jour, croisées avec la météo marine et les signalements locaux — plage par plage, pas de moyenne d'île. Quand on ne sait pas, on le dit.",
      "Copernicus satellite data (the EU space programme), refreshed 4×/day, cross-checked with marine weather and local reports — beach by beach, no island-wide averages. When we don't know, we say so.",
      "Datos del satélite Copernicus (programa espacial europeo), actualizados 4 veces al día, cruzados con meteo marina y reportes locales — playa por playa. Cuando no sabemos, lo decimos."),
      chips:[{k:"about",label:t("La page confiance →","The trust page →","La página de confianza →")},{k:"root",label:t("← Autre question","← Another question","← Otra pregunta")}]}
    return null
  }
  const onChip=c=>{
    const lbl=c.label.replace(/^← /,"")
    if(c.k==="root"){setMsgs(m=>[...m,{who:"me",text:lbl},hello]);return}
    if(c.k==="cta"){track("sg_chat_cta",{});onClose();onPremium();return}
    // USD : /about/ (EN/ES, shipped 2026-06-11) — /a-propos/ n'existe que MQ/GP
    // (pointer /a-propos/ sur USD = 404 avalé par le fallback SPA).
    if(c.k==="about"){track("sg_chat_branch",{branch:"about_page"});window.location.href=IS_NEW_REGION?"/about/":"/a-propos/";return}
    if(c.k.startsWith("open:")){
      const b=cands.find(x=>x.id===c.k.slice(5))
      if(b){track("sg_chat_branch",{branch:"open_beach"});onClose();onOpenBeach(b)}
      return
    }
    track("sg_chat_branch",{branch:c.k})
    setMsgs(m=>[...m,{who:"me",text:lbl}])
    setTyping(true)
    setTimeout(()=>{
      setTyping(false)
      const a=answer(c.k)
      if(a)setMsgs(m=>[...m,{who:"bot",text:a.text,chips:a.chips}])
    },650)
  }
  const last=msgs[msgs.length-1]
  return(
    <div role="dialog" aria-modal="true" aria-label="Assistant" style={{position:"fixed",right:0,bottom:0,left:0,zIndex:1090,display:"flex",justifyContent:"flex-end",pointerEvents:"none"}}>
      <div className="sg-onink-scope" style={{pointerEvents:"auto",width:"100%",maxWidth:420,margin:"0 10px calc(10px + env(safe-area-inset-bottom))",
        background:"#120821",border:"1px solid rgba(255,255,255,.12)",borderRadius:20,overflow:"hidden",
        boxShadow:"0 18px 60px rgba(0,0,0,.55)",display:"flex",flexDirection:"column",maxHeight:"min(72vh,560px)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",
          borderBottom:"1px solid rgba(255,255,255,.10)"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
            {/* Le Veilleur miniature (satellite, seul personnage) — humeur calme teal, veille la mer */}
            <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true" style={{flexShrink:0,display:"block"}}>
              <g transform="translate(32,33)">
                <circle r="20" fill="#009E8E" opacity=".18"/>
                <rect x="-26" y="-5" width="12" height="11" rx="2.5" fill="#0A1714"/>
                <rect x="14" y="-5" width="12" height="11" rx="2.5" fill="#0A1714"/>
                <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#0A1714"/>
                <rect x="-11" y="-11" width="22" height="6" rx="6" fill="#1EC8B0"/>
                <line x1="0" y1="-11" x2="0" y2="-18" stroke="#009E8E" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="0" cy="-19" r="2" fill="#009E8E"/>
                <circle cx="0" cy="2" r="5" fill="#07201E"/>
                <circle cx="0" cy="2" r="3.4" fill="#1EC8B0"/>
                <circle cx="-1.3" cy=".6" r="1.2" fill="#EAFBF8"/>
              </g>
            </svg>
            <div style={{minWidth:0}}>
              <strong style={{fontSize:13.5,color:"#fff",lineHeight:1.2,display:"block"}}>{t("Le Veilleur","The Watchman","El Vigía")}</strong>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:2,fontSize:10.5,fontWeight:800,letterSpacing:".04em",color:"#1EC8B0",textTransform:"uppercase"}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:"#009E8E"}}/>{t("En direct","Live","En vivo")}
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",
            fontSize:18,cursor:"pointer",padding:4}}>✕</button>
        </div>
        <div ref={bodyRef} style={{overflowY:"auto",overflowX:"hidden",padding:"14px 12px",display:"flex",flexDirection:"column",gap:10}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{alignSelf:m.who==="me"?"flex-end":"flex-start",maxWidth:"86%",
              background:m.who==="me"?"#FFC72C":"rgba(255,255,255,.07)",color:m.who==="me"?"#120821":"#fff",
              fontSize:13.5,lineHeight:1.5,padding:"10px 13px",
              borderRadius:m.who==="me"?"16px 16px 4px 16px":"16px 16px 16px 4px"}}>{m.text}</div>
          ))}
          {typing&&<div style={{alignSelf:"flex-start",background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",
            fontSize:13.5,padding:"10px 14px",borderRadius:"16px 16px 16px 4px",letterSpacing:2}}>•••</div>}
          {!typing&&last?.who==="bot"&&last.chips&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:2}}>
              {last.chips.map((c,i)=>(
                <button key={i} onClick={()=>onChip(c)} style={{background:"rgba(255,199,44,.1)",
                  border:"1px solid rgba(255,199,44,.45)",color:"#FFC72C",fontFamily:"inherit",fontWeight:700,
                  fontSize:12.5,padding:"9px 13px",borderRadius:999,cursor:"pointer",textAlign:"left"}}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

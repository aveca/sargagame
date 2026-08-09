import React,{useState,useEffect,useRef,useCallback} from "react"
import {SeqDots} from "../SeqPrimitives.jsx"
import * as SG from "../Sargasses_PROD.jsx"
import {beginCheckout, addPaymentInfo, purchase, getPlanMeta} from "../ga4-ecommerce.js"

const {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, IS_NEW_REGION, REGION,
  SARG_TO_BEACH, T, _t, abVariant, track, sgReferredBy, sgMyReferralCode,
  sgToast, submitLead, miVeil, moodFromStatus
} = SG

// Route de la page « fiabilité » selon région/langue
const _relHref=(l)=>IS_NEW_REGION?(l==="es"?"/fiabilidad/":"/reliability/"):"/fiabilite/"

// useModalA11y — plancher a11y des modales du chemin de l'argent
function useModalA11y(panelRef,onClose,escClose=true){
  useEffect(()=>{
    const panel=panelRef.current
    const prevFocus=(typeof document!=="undefined"&&document.activeElement)||null
    const SEL='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const focusables=()=>panel?Array.prototype.filter.call(panel.querySelectorAll(SEL),el=>el.offsetParent!==null||el===document.activeElement):[]
    try{if(panel&&!panel.contains(document.activeElement)){const f=focusables();(f[0]||panel).focus&&(f[0]||panel).focus()}}catch(_){}
    const onKey=e=>{
      const inOther=(()=>{try{const t=e.target;const d=t&&t.closest&&t.closest('[role="dialog"][aria-modal="true"]');return d&&panel&&d!==panel&&!panel.contains(d)}catch(_){return false}})()
      if(e.key==="Escape"){if(escClose&&!inOther){e.stopPropagation();onClose&&onClose()}return}
      if(e.key!=="Tab"||!panel||inOther)return
      const f=focusables();if(!f.length){e.preventDefault();return}
      const first=f[0],last=f[f.length-1],a=document.activeElement
      if(e.shiftKey&&(a===first||!panel.contains(a))){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&a===last){e.preventDefault();first.focus()}
    }
    document.addEventListener("keydown",onKey,true)
    return()=>{document.removeEventListener("keydown",onKey,true)
      try{prevFocus&&prevFocus.focus&&prevFocus.focus()}catch(_){}}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
}

// TerritoireMeeting — demande de devis B2B (mairies/offices/groupes hôteliers)
function TerritoireMeeting({lang,email,org}){
  const I=COMIC
  const [littoral,setLittoral]=useState("")
  const [phone,setPhone]=useState("")
  const [sent,setSent]=useState(false)
  const [busy,setBusy]=useState(false)
  const submit=()=>{
    if(sent||busy)return
    setBusy(true)
    const island=(REGION&&REGION.id?String(REGION.id):"MQ").toUpperCase()
    try{track("sg_b2b_meeting_request",{})}catch(_){}
    fetch("/api/b2b-meeting.php",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,org,littoral:littoral.trim(),phone:phone.trim(),island})})
      .then(()=>{setBusy(false);setSent(true)}).catch(()=>{setBusy(false);setSent(true)})
  }
  if(sent)return(
    <div style={{marginTop:14,padding:"13px 14px",borderRadius:14,border:`2.5px solid ${I.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${I.ink}`}}>
      <div style={{font:"800 14px/1.3 'Bricolage Grotesque'",color:"#1c8f4e"}}>{_t(lang,"C'est noté ✓","Noted ✓","Anotado ✓")}</div>
      <div style={{font:"600 12.5px/1.5 'Bricolage Grotesque'",color:"#41414a",marginTop:5}}>{_t(lang,"On vous écrit pour caler 15 min et préparer votre devis (PDF). Votre accès reste ouvert en attendant.","We'll email you to set up 15 min and prepare your quote (PDF). Your access stays open meanwhile.","Le escribimos para reservar 15 min y preparar su presupuesto (PDF). Su acceso sigue abierto mientras tanto.")}</div>
    </div>
  )
  return(
    <div style={{marginTop:14,padding:"14px",borderRadius:14,border:`2.5px solid ${I.ink}`,background:I.blue,boxShadow:`3px 3px 0 ${I.ink}`}}>
      <div style={{font:"800 14.5px/1.2 'Bricolage Grotesque'",color:"#fdfcf7"}}>🏛️ {_t(lang,"Programmons un point","Let's schedule a call","Programemos un punto")}</div>
      <div style={{font:"600 12px/1.5 'Bricolage Grotesque'",color:"#eef9f6",margin:"5px 0 10px"}}>{_t(lang,"Votre accès est déjà ouvert — explorez seul si vous préférez. Un échange de 15 min seulement si VOUS le souhaitez : on cale vos plages, votre devis et votre bon de commande. L'essai ne déclenche aucun prélèvement.","Your access is already open — explore on your own if you prefer. A 15-min call only if YOU want it: we scope your beaches, your quote and your purchase order. The trial triggers no charge.","Su acceso ya está abierto — explore solo si prefiere. Una llamada de 15 min solo si USTED quiere: definimos sus playas, su presupuesto y su orden de compra. La prueba no genera ningún cobro.")}</div>
      <input value={littoral} onChange={e=>setLittoral(e.target.value)} placeholder={_t(lang,"Votre littoral (commune ou nb de plages)","Your coastline (town or # of beaches)","Su litoral (municipio o nº de playas)")} aria-label={_t(lang,"Votre littoral (commune ou nb de plages)","Your coastline (town or # of beaches)","Su litoral (municipio o nº de playas)")} style={{width:"100%",boxSizing:"border-box",padding:"11px 13px",borderRadius:11,border:`2px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:8}}/>
      <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder={_t(lang,"Téléphone (facultatif)","Phone (optional)","Teléfono (opcional)")} aria-label={_t(lang,"Téléphone (facultatif)","Phone (optional)","Teléfono (opcional)")} style={{width:"100%",boxSizing:"border-box",padding:"11px 13px",borderRadius:11,border:`2px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:10}}/>
      <button onClick={submit} disabled={busy} style={{width:"100%",textAlign:"center",font:"800 14px/1 'Bricolage Grotesque'",padding:13,borderRadius:12,border:`2.5px solid ${I.ink}`,boxShadow:`2px 2px 0 ${I.ink}`,background:I.gold,color:I.ink,cursor:busy?"default":"pointer"}}>{busy?_t(lang,"Envoi…","Sending…","Enviando…"):_t(lang,"Planifier un point · recevoir un devis →","Schedule a call · get a quote →","Reservar · recibir presupuesto →")}</button>
      <div style={{font:"600 10.5px/1.4 'Bricolage Grotesque'",color:"#dff1ec",marginTop:9}}>{_t(lang,"Données satellite publiques (Copernicus/NOAA), auditables · Devis, bon de commande, facture — conforme RGPD & marché public · Un interlocuteur dédié. Tarif indicatif HT.","Public satellite data (Copernicus/NOAA), auditable · Quote, purchase order, invoice — GDPR & public-procurement compliant · A dedicated contact. Indicative price excl. tax.","Datos satelitales públicos (Copernicus/NOAA), auditables · Presupuesto, orden de compra, factura — conforme RGPD · Un interlocutor dedicado. Precio indicativo sin IVA.")}</div>
      <div style={{font:"600 10.5px/1.4 'Bricolage Grotesque'",color:"#cfe9e3",marginTop:6}}>{_t(lang,"Vos coordonnées servent uniquement à vous recontacter (intérêt légitime), conservées 12 mois, supprimées sur simple demande.","Your details are used only to contact you (legitimate interest), kept 12 months, deleted on request.","Sus datos solo se usan para contactarle (interés legítimo), conservados 12 meses, eliminados a petición.")} <a href="/fiabilite/" style={{color:"#fdfcf7",textDecoration:"underline"}}>{_t(lang,"Voyez d'abord ce qu'on vaut →","See what we're worth first →","Vea primero lo que valemos →")}</a></div>
    </div>
  )
}

// B2BModal — OFFRE PRO réelle et chiffrée (pivot B2B, juin 2026)
export function B2BModal({lang,onClose,sargData=null,island=null,beach=null,source=""}){
  const dlgRef=useRef(null)
  useModalA11y(dlgRef,onClose)
  const [tier,setTier]=useState("pro")
  const [email,setEmail]=useState("")
  const [org,setOrg]=useState("")
  const [sent,setSent]=useState(false)
  const [token,setToken]=useState("")
  const [busy,setBusy]=useState(false)
  const QS=(()=>{try{return (window.location.search||"")+" "+(sessionStorage.getItem("sg_b2b_qs")||"")}catch(_){try{return window.location.search||""}catch(_2){return ""}}})()
  const seqOn=!/[?&]b2bseq=0/.test(QS)
  const instantTrial=!/[?&]b2btrial=0/.test(QS)
  const valid=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const I=COMIC
  const [step,setStep]=useState(1)
  const isl=island||((REGION&&REGION.id)?String(REGION.id).toLowerCase():"mq")
  const _lvls=Object.values(sargData?.levels||{})
  const islandLvls=_lvls.filter(b=>isl==="gp"?b.id?.startsWith("gp-"):!b.id?.startsWith("gp-"))
  const cleanCount=islandLvls.filter(b=>b.status==="clean").length
  const totalCount=islandLvls.length
  const [pickedId,setPickedId]=useState("")
  const ctxSargId=beach?(IS_NEW_REGION?beach.id:(BEACH_TO_SARG[beach.id]||null)):null
  const qBeachId=(()=>{const m=QS.match(/[?&]beach=([a-z0-9-]{1,60})/i);return m?m[1]:""})()
  const lvlById=id=>id?islandLvls.find(l=>l.id===id)||null:null
  const activeSargId=ctxSargId||(lvlById(qBeachId)?qBeachId:"")||pickedId||""
  const pickMode=ctxSargId?"ctx":(lvlById(qBeachId)?"query":(pickedId?"picked":"none"))
  const lvl=lvlById(activeSargId)
  const nameOf=lv=>{
    if(!lv||!lv.id)return null
    if(IS_NEW_REGION)return REGION.beaches?.find(b=>b.id===lv.id)?.name||null
    return BEACHES_FALLBACK.find(b=>b.id===SARG_TO_BEACH[lv.id])?.name
      ||lv.id.replace(/^gp-/,"").split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")||null
  }
  const bName=lvl?nameOf(lvl):(beach&&beach.name)||null
  const freshLine=(()=>{
    const sat=sargData?.erddapTimestamp||null,up=sargData?.updatedAt||null
    const src=sat||up;if(!src)return null
    const h=Math.max(1,Math.round((Date.now()-new Date(src).getTime())/3.6e6))
    if(!isFinite(h))return null
    return sat?_t(lang,`Vu du satellite il y a ${h} h`,`Seen by satellite ${h}h ago`,`Visto por satélite hace ${h} h`)
      :_t(lang,`Données mises à jour il y a ${h} h`,`Data updated ${h}h ago`,`Datos actualizados hace ${h} h`)
  })()
  const STATUS={
    clean:{c:"#27c46b",l:_t(lang,"Propre aujourd'hui","Clean today","Limpia hoy")},
    moderate:{c:"#e8a800",l:_t(lang,"Algues modérées","Moderate seaweed","Algas moderadas")},
    avoid:{c:"#e8522a",l:_t(lang,"À éviter aujourd'hui","Avoid today","Evitar hoy")},
  }
  const stOf=lv2=>STATUS[lv2&&lv2.status]||null
  const fcLvl=(()=>{
    const has=l2=>!!(l2&&sargData?.weekly?.[l2.id]?.forecast?.length)
    if(has(lvl))return lvl
    return [...islandLvls].sort((a,b)=>(b.score||0)-(a.score||0)).find(has)||null
  })()
  const fcName=fcLvl?nameOf(fcLvl):null
  const fcDays=fcLvl?(sargData.weekly[fcLvl.id].forecast||[]).slice(0,2):[]
  const [trackRec,setTrackRec]=useState(null)
  useEffect(()=>{let ok=true;fetch("/api/copernicus/track-record.json").then(r=>r.json()).then(d=>{if(ok)setTrackRec(d)}).catch(()=>{});return()=>{ok=false}},[])
  const proofLine=(()=>{
    try{
      const r=trackRec;if(!r||!r.byRegime)return null
      const ent=Object.entries(r.byRegime).filter(([,x])=>x&&x.cleanSamples>0).sort((a,b)=>b[1].cleanSamples-a[1].cleanSamples)[0]
      if(!ent||!ent[1].cleanReliabilityPct)return null
      const[reg,best]=ent
      const nf=best.cleanSamples.toLocaleString(lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR")
      const calm=reg==="calm"?_t(lang," (saison calme)"," (calm season)"," (temporada tranquila)"):""
      return _t(lang,
        `${best.cleanReliabilityPct} % justes${calm} · ${nf} prévisions « mer propre » vérifiées · registre public`,
        `${best.cleanReliabilityPct}% correct${calm} · ${nf} "clean water" forecasts satellite-checked · public record`,
        `${best.cleanReliabilityPct} % correctos${calm} · ${nf} pronósticos "agua limpia" verificados · registro público`)
    }catch(_){return null}
  })()
  const [paylinks,setPaylinks]=useState(null)
  useEffect(()=>{try{track("sg_b2b_offer_view",{})}catch(_){}
    try{track("sg_b2b_beach_pick",{mode:pickMode})}catch(_){}
    try{fetch("/api/b2b-paylinks.json",{cache:"no-store"}).then(r=>r.json()).then(d=>setPaylinks(d&&d.links||{})).catch(()=>{})}catch(_){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  const payOf=t=>{
    const key={pro:"pro_annual",brief:"brief_annual"}[t];if(!key||!paylinks)return null
    const k=(IS_NEW_REGION&&paylinks[key+"_usd"])?key+"_usd":key
    const l=paylinks[k];if(!l||!l.url)return null
    const v=String(l.value||"").replace(/\.00$/,"")
    return {url:l.url,amt:v?(k.endsWith("_usd")?("$"+v):(v+" €")):null}
  }
  const payUrlOf=t=>{const p=payOf(t);return p?p.url:null}
  const ctxKind=lvl?"beach":(totalCount>0?"island":"nodata")
  const stepTitleRef=useRef(null)
  const stepMounted=useRef(false)
  useEffect(()=>{
    if(!stepMounted.current){stepMounted.current=true;return}
    try{stepTitleRef.current&&stepTitleRef.current.focus()}catch(_){}
  },[step])
  const goStep=n=>{setStep(n);try{track("sg_b2b_step",{step:n,ctx:ctxKind,tier,source:source||"unknown"})}catch(_){}}
  const goBack=from=>{setStep(Math.max(1,from-1));try{track("sg_b2b_step_back",{from})}catch(_){}}
  const swipeY=useRef(0)
  const onTS=e=>{swipeY.current=e.touches[0].clientY}
  const onTM=e=>{
    if(dlgRef.current&&dlgRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-swipeY.current
    if(dy>0&&dlgRef.current)dlgRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTE=e=>{
    if(dlgRef.current&&dlgRef.current.scrollTop>5){if(dlgRef.current)dlgRef.current.style.transform="";return}
    const dy=(e.changedTouches[0]?.clientY||0)-swipeY.current
    if(dy>60)onClose()
    else if(dlgRef.current){dlgRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";dlgRef.current.style.transform="";setTimeout(()=>{if(dlgRef.current)dlgRef.current.style.transition=""},300)}
  }
  const typedRef=useRef(false)
  const onOrgChange=e=>{
    setOrg(e.target.value)
    if(!typedRef.current&&e.target.value.trim().length>=3){typedRef.current=true;try{track("sg_b2b_widget_preview",{typed:1})}catch(_){}}
  }
  const TIERS=[
    {id:"brief",icon:"📩",name:_t(lang,"Brief","Brief","Brief"),price:_t(lang,"29 €/mois","€29/mo","29 €/mes"),
      pitch:_t(lang,"Brief quotidien de vos plages + alerte échouage par email. Pour gîtes, restos, clubs plage.","Daily brief of your beaches + landing alert by email. For guesthouses, restaurants, beach clubs.","Informe diario de sus playas + alerta por email. Para alojamientos, restaurantes, clubes."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_brief"},
    {id:"pro",icon:"🔔",name:_t(lang,"Pro","Pro","Pro"),price:_t(lang,"79 €/mois","€79/mo","79 €/mes"),featured:true,
      pitch:_t(lang,"Devenez LA référence sargasses de votre plage : mis en avant dans l'app au moment où le voyageur vérifie avant de réserver, brief du matin, alertes, prévision 7 j, et un encart à vos couleurs sur votre propre site. Pour hôtels & resorts.","Become THE sargassum reference for your beach: featured in the app right when travelers check before booking, morning brief, alerts, 7-day forecast, and a panel in your own colors on your own website. For hotels & resorts.","Conviértase en LA referencia de sargazo de su playa: destacado en la app justo cuando el viajero comprueba antes de reservar, informe matinal, alertas, pronóstico 7 días, y un panel con sus colores en su propia web. Para hoteles y resorts."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_pro"},
    {id:"territoire",icon:"🏛️",name:_t(lang,"Territoire","Territory","Territorio"),price:_t(lang,"dès 199 €/mois HT","from €199/mo excl. tax","desde 199 €/mes sin IVA"),
      pitch:_t(lang,"Multi-plages + rapports + API + widget public. Pour communes & offices de tourisme.","Multi-beach + reports + API + public widget. For towns & tourism boards.","Multi-playa + informes + API + widget público. Para municipios y oficinas."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_territoire"},
  ]
  const cur=TIERS.find(t=>t.id===tier)||TIERS[1]

  // ... render logic continues below
  // This is a partial extraction - the full component is very large
  // The main PremiumModal.jsx will import this component
  
  return (
    <div ref={dlgRef} role="dialog" aria-modal="true" style={{/* modal styles */}}>
      {/* B2BModal render content */}
    </div>
  )
}

export { TerritoireMeeting }
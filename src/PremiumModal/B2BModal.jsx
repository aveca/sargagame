import React,{useState,useEffect,useRef,useCallback} from "react"
import {SeqDots} from "../SeqPrimitives.jsx"
import * as SG from "../Sargasses_PROD.jsx"
import {beginCheckout, addPaymentInfo, purchase, getPlanMeta} from "../ga4-ecommerce.js"
import useModalA11y from "../hooks/useModalA11y.js"
// NOTE CRO B2B 2026-09-04 : NE PAS importer ../lib/relHref.js ici — son import
// circulaire (← Sargasses_PROD) faisait planter le rendu É2 (cf. ternaire inline).

const {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, IS_NEW_REGION, REGION,
  SARG_TO_BEACH, T, _t, abVariant, track, sgReferredBy, sgMyReferralCode,
  sgToast, submitLead, miVeil, moodFromStatus
} = SG


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
  useModalA11y(dlgRef,onClose)   // role/aria-modal posés sur le panel ; Échap + focus-trap + restauration
  const [tier,setTier]=useState("pro")
  const [email,setEmail]=useState("")
  const [org,setOrg]=useState("")
  const [sent,setSent]=useState(false)
  const [token,setToken]=useState("")   // token Pro 30 j renvoyé par b2b-trial.php (essai INSTANTANÉ)
  const [busy,setBusy]=useState(false)
  // Querystring EFFECTIVE : le handler deeplink ?pro=1 fait replaceState AVANT le mount
  // lazy de ce chunk → location.search est déjà vidé. Il stashe search dans
  // sessionStorage sg_b2b_qs (pattern sg_deep_plan) : flags + ?beach= y survivent.
  const QS=(()=>{try{return (window.location.search||"")+" "+(sessionStorage.getItem("sg_b2b_qs")||"")}catch(_){try{return window.location.search||""}catch(_2){return ""}}})()
  // Flag rollback ?b2bseq=0 → écran unique d'origine (la séquence est le défaut).
  const seqOn=!/[?&]b2bseq=0/.test(QS)
  // Flag rollback : ?b2btrial=0 → retombe sur l'ancien comportement (capture lead + « on
  // vous recontacte sous 24h »), sans appel à l'endpoint. Loi : pas de flag = pas de merge.
  // (Lit QS et plus location.search : l'angle mort deeplink ?pro=1&b2btrial=0 est réparé.)
  const instantTrial=!/[?&]b2btrial=0/.test(QS)
  const valid=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const I=COMIC
  // ── Étape courante de la SÉQUENCE (1 constat/cadeau → 2 renversement/preuve →
  //    3 offre → 4 ask). Succès/24h = états sent/token existants, inchangés.
  const [step,setStep]=useState(1)
  // ── Contexte data (props ADDITIVES, dégradation gracieuse si null) ─────────
  const isl=island||((REGION&&REGION.id)?String(REGION.id).toLowerCase():"mq")
  const _lvls=Object.values(sargData?.levels||{})
  const islandLvls=_lvls.filter(b=>isl==="gp"?b.id?.startsWith("gp-"):!b.id?.startsWith("gp-"))
  const cleanCount=islandLvls.filter(b=>b.status==="clean").length
  const totalCount=islandLvls.length
  // Plage active : contexte (prop beach) > deeplink ?beach=<id-sarg> > choix select > rien.
  const [pickedId,setPickedId]=useState("")
  const ctxSargId=beach?(IS_NEW_REGION?beach.id:(BEACH_TO_SARG[beach.id]||null)):null
  const qBeachId=(()=>{const m=QS.match(/[?&]beach=([a-z0-9-]{1,60})/i);return m?m[1]:""})()
  const lvlById=id=>id?islandLvls.find(l=>l.id===id)||null:null
  const activeSargId=ctxSargId||(lvlById(qBeachId)?qBeachId:"")||pickedId||""
  const pickMode=ctxSargId?"ctx":(lvlById(qBeachId)?"query":(pickedId?"picked":"none"))
  const lvl=lvlById(activeSargId)
  // Nom canonique (dérivation dupliquée de _nameOf — closures de PremiumModal inaccessibles ici).
  const nameOf=lv=>{
    if(!lv||!lv.id)return null
    if(IS_NEW_REGION)return REGION.beaches?.find(b=>b.id===lv.id)?.name||null
    return BEACHES_FALLBACK.find(b=>b.id===SARG_TO_BEACH[lv.id])?.name
      ||lv.id.replace(/^gp-/,"").split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")||null
  }
  const bName=lvl?nameOf(lvl):(beach&&beach.name)||null
  // Fraîcheur HONNÊTE : erddapTimestamp = « Vu du satellite » ; sinon updatedAt =
  // « Données mises à jour » — jamais l'inverse (fausse fraîcheur interdite, loi moat).
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
  // Grille É2 : la plage active si elle a un forecast, sinon la MEILLEURE plage de
  // l'île qui en a un (nommée — jamais une grille anonyme), sinon pas de grille.
  const fcLvl=(()=>{
    const has=l2=>!!(l2&&sargData?.weekly?.[l2.id]?.forecast?.length)
    if(has(lvl))return lvl
    return [...islandLvls].sort((a,b)=>(b.score||0)-(a.score||0)).find(has)||null
  })()
  const fcName=fcLvl?nameOf(fcLvl):null
  const fcDays=fcLvl?(sargData.weekly[fcLvl.id].forecast||[]).slice(0,2):[]
  // Preuve auditée : fetch PROPRE (les closures _trackRec/_recordProof de PremiumModal
  // sont inaccessibles depuis ce composant frère — duplication ciblée assumée).
  const [trackRec,setTrackRec]=useState(null)
  useEffect(()=>{let ok=true;fetch("/api/copernicus/track-record.json").then(r=>r.json()).then(d=>{if(ok)setTrackRec(d)}).catch(()=>{});return()=>{ok=false}},[])
  const proofLine=(()=>{
    try{
      const r=trackRec;if(!r||!r.byRegime)return null
      const ent=Object.entries(r.byRegime).filter(([,x])=>x&&x.cleanSamples>0).sort((a,b)=>b[1].cleanSamples-a[1].cleanSamples)[0]
      if(!ent||!ent[1].cleanReliabilityPct)return null
      const[reg,best]=ent
      const nf=best.cleanSamples.toLocaleString(lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR")
      // Loi claim hedgé : un « 100 % » ne part JAMAIS nu — le régime est nommé quand
      // c'est le calme (data-driven, jamais un label plaqué), et la bande tous-régimes
      // 76-79 % + la mention confiance l'accompagnent toujours (ligne sous ce chiffre).
      const calm=reg==="calm"?_t(lang," (saison calme)"," (calm season)"," (temporada tranquila)"):""
      return _t(lang,
        `${best.cleanReliabilityPct} % justes${calm} · ${nf} prévisions « mer propre » vérifiées · registre public`,
        `${best.cleanReliabilityPct}% correct${calm} · ${nf} “clean water” forecasts satellite-checked · public record`,
        `${best.cleanReliabilityPct} % correctos${calm} · ${nf} pronósticos “agua limpia” verificados · registro público`)
    }catch(_){return null}
  })()
  // Liens de paiement Mollie (self-service in-app) — chargés depuis le JSON publié par
  // mollie-paylinks.cjs. Permet de PAYER l'année directement, sans humain.
  const [paylinks,setPaylinks]=useState(null)
  useEffect(()=>{try{track("sg_b2b_offer_view",{})}catch(_){}
    try{track("sg_b2b_beach_pick",{mode:pickMode})}catch(_){}
    try{fetch("/api/b2b-paylinks.json",{cache:"no-store"}).then(r=>r.json()).then(d=>setPaylinks(d&&d.links||{})).catch(()=>{})}catch(_){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  // {url, montant} devise-aware : domaines USD → entrée `${key}_usd` du JSON (790/390 $),
  // montant rendu depuis value (jamais en dur). Territoire = JAMAIS de paylink carte
  // (verdict panel : un paiement CB juxtaposé au parcours devis/BDC décrédibilise les 2).
  const payOf=t=>{
    const key={pro:"pro_annual",brief:"brief_annual"}[t];if(!key||!paylinks)return null
    const k=(IS_NEW_REGION&&paylinks[key+"_usd"])?key+"_usd":key
    const l=paylinks[k];if(!l||!l.url)return null
    const v=String(l.value||"").replace(/\.00$/,"")
    return {url:l.url,amt:v?(k.endsWith("_usd")?("$"+v):(v+" €")):null}
  }
  const payUrlOf=t=>{const p=payOf(t);return p?p.url:null}   // compat écran unique (?b2bseq=0)
  // ── Navigation de séquence : events funnel par étape + focus titre (a11y — le
  //    focus-trap de useModalA11y ne focus qu'au mount, pas au swap d'étape).
  const ctxKind=lvl?"beach":(totalCount>0?"island":"nodata")
  const stepTitleRef=useRef(null)
  const stepMounted=useRef(false)
  useEffect(()=>{
    if(!stepMounted.current){stepMounted.current=true;return}
    try{stepTitleRef.current&&stepTitleRef.current.focus()}catch(_){}
  },[step])
  const goStep=n=>{setStep(n);try{track("sg_b2b_step",{step:n,ctx:ctxKind,tier,source:source||"unknown"})}catch(_){}}
  const goBack=from=>{setStep(Math.max(1,from-1));try{track("sg_b2b_step_back",{from})}catch(_){}}
  // Swipe-down close (copie du pattern éprouvé de PremiumModal, même fichier) : 4e voie
  // de sortie (✕ / Échap / backdrop / swipe). Guard scrollTop : ne pas voler le scroll.
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
  // Grille B2B (pricing arrêté panel 2026-06-29) : 3 tiers payants, essai 30j sans carte,
  // annuel = 2 mois offerts. PAS de widget gratuit (donner le hook gratis ne prouve
  // aucune WTP — c'est exactement ce qui a échoué). Le hook = l'essai 30j time-boxé.
  const TIERS=[
    {id:"brief",icon:"📩",name:_t(lang,"Brief","Brief","Brief"),price:_t(lang,"29 €/mois","€29/mo","29 €/mes"),
      pitch:_t(lang,"Brief quotidien de vos plages + alerte échouage par email. Pour gîtes, restos, clubs plage.","Daily brief of your beaches + landing alert by email. For guesthouses, restaurants, beach clubs.","Informe diario de sus playas + alerta por email. Para alojamientos, restaurantes, clubes."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_brief"},
    {id:"pro",icon:"🔔",name:_t(lang,"Pro","Pro","Pro"),price:_t(lang,"79 €/mois","€79/mo","79 €/mes"),featured:true,
      pitch:_t(lang,"Devenez LA référence sargasses de votre plage : mis en avant dans l'app au moment où le voyageur vérifie avant de réserver, brief du matin, alertes, prévision 7 j, et un encart à vos couleurs sur votre propre site. Pour hôtels & resorts.","Become THE sargassum reference for your beach: featured in the app right when travelers check before booking, morning brief, alerts, 7-day forecast, and a panel in your own colors on your website. For hotels & resorts.","Conviértase en LA referencia de sargazo de su playa: destacado en la app justo cuando el viajero comprueba antes de reservar, informe matinal, alertas, pronóstico 7 días, y un panel con sus colores en su propia web. Para hoteles y resorts."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_pro"},
    {id:"territoire",icon:"🏛️",name:_t(lang,"Territoire","Territory","Territorio"),price:_t(lang,"dès 199 €/mois HT","from €199/mo excl. tax","desde 199 €/mes sin IVA"),
      pitch:_t(lang,"Multi-plages + rapports + API + widget public. Pour communes & offices de tourisme.","Multi-beach + reports + API + public widget. For towns & tourism boards.","Multi-playa + informes + API + widget público. Para municipios y oficinas."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_territoire"},
  ]
  const cur=TIERS.find(t=>t.id===tier)||TIERS[1]
  const submit=()=>{
    if(!valid||sent||busy)return
    try{localStorage.setItem("sg_b2b_lane",tier)}catch(_){}
    try{submitLead(email.trim(),cur.source)}catch(_){}
    try{track("sg_b2b_intent",{tier:cur.id,price:cur.price,org:org.trim()?1:0})}catch(_){}
    // TOUS les tiers (Brief/Pro/Territoire) = essai 30 j émis INSTANTANÉMENT par
    // /api/b2b-trial.php (zéro call, zéro attente, zéro humain) → accès Pro tout de suite +
    // lien de paiement annuel direct. Territoire inclus (décision fondateur : tout self-serve).
    // Flag ?b2btrial=0 → ancien flux capture-lead + message 24 h.
    if(!instantTrial){setSent(true);return}
    setBusy(true)
    const island=(REGION&&REGION.id?String(REGION.id):"MQ").toUpperCase()
    fetch("/api/b2b-trial.php",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email:email.trim(),name:org.trim(),island})})
      .then(r=>r.json()).then(d=>{
        if(d&&d.ok&&d.token){setToken(d.token);try{track("sg_b2b_trial_activated",{tier:cur.id})}catch(_){}}
        setBusy(false);setSent(true)   // échec → fallback gracieux : lead déjà capturé, message 24 h
      }).catch(()=>{setBusy(false);setSent(true)})
  }
  // ── Styles partagés de la séquence. Anti-thème OBLIGATOIRE : .theme-comic button
  //    {background:var(--sg-card)!important} repeint les boutons inline (la sélection
  //    OR du tier était invisible en prod — une des causes du « bizarre »). Recette
  //    checklist : classes DOUBLÉES (0,2,0) battent .theme-comic button (0,1,1).
  //    .sgseq-* = primitives génériques réutilisables (scaler le B2C, fondateur 2026-07-02).
  const CSS_B2F=`
  .b2f-cta.b2f-cta{width:100%;text-align:center;font:800 16px/1 'Bricolage Grotesque',sans-serif!important;padding:16px;border-radius:15px!important;border:3px solid ${I.ink}!important;box-shadow:3px 3px 0 ${I.ink}!important;background:linear-gradient(180deg,#ffe06a,#ffc72c 55%,#e8a800)!important;color:${I.ink}!important;-webkit-text-fill-color:${I.ink}!important;text-shadow:none!important;cursor:pointer;letter-spacing:0}
  .b2f-cta.b2f-cta:disabled{background:#e7e2d4!important;opacity:.7;cursor:default}
  .b2f-cta.b2f-cta:active{transform:translate(3px,3px);box-shadow:0 0 0 ${I.ink}!important}
  .b2f-hero.b2f-hero{display:block;text-align:left;width:100%;box-sizing:border-box;background:linear-gradient(160deg,#fff3c8,#ffe08a)!important;border:3px solid ${I.ink}!important;box-shadow:4px 4px 0 ${I.ink}!important;border-radius:16px!important;color:${I.ink}!important;-webkit-text-fill-color:${I.ink}!important;text-shadow:none!important;padding:13px 14px;position:relative}
  .b2f-row.b2f-row{display:block;text-align:left;width:100%;box-sizing:border-box;background:#fff!important;border:2.5px solid ${I.ink}!important;box-shadow:1px 1px 0 ${I.ink}!important;border-radius:12px!important;color:${I.ink}!important;-webkit-text-fill-color:${I.ink}!important;text-shadow:none!important;padding:10px 12px;min-height:44px;cursor:pointer}
  .b2f-row.b2f-row:active{transform:translate(1px,1px);box-shadow:0 0 0 ${I.ink}!important}
  .b2f-x.b2f-x{position:absolute;top:11px;right:11px;width:44px;height:44px;border-radius:50%!important;border:2.5px solid ${I.ink}!important;background:#fff!important;box-shadow:2px 2px 0 ${I.ink}!important;font-size:17px;font-weight:900;color:${I.ink}!important;-webkit-text-fill-color:${I.ink}!important;cursor:pointer;line-height:1;text-shadow:none!important;padding:0}
  .b2f-back.b2f-back{position:absolute;top:11px;left:11px;width:44px;height:44px;border-radius:12px!important;border:2.5px solid ${I.ink}!important;background:#fff!important;box-shadow:2px 2px 0 ${I.ink}!important;font-size:20px;font-weight:900;color:${I.ink}!important;-webkit-text-fill-color:${I.ink}!important;cursor:pointer;line-height:1;text-shadow:none!important;padding:0}
  .b2f-fc{border:2.5px solid ${I.ink};border-radius:14px;overflow:hidden;box-shadow:3px 3px 0 ${I.ink};background:#fff;margin:11px 0 10px}
  .b2f-fc-top{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 11px;background:#10343a;color:#fdfcf7;font:800 10px/1.25 'Bricolage Grotesque',sans-serif;letter-spacing:.07em;text-transform:uppercase;border-bottom:2.5px solid ${I.ink}}
  .b2f-fc-grid{display:grid;grid-template-columns:repeat(7,1fr)}
  .b2f-fc-day{padding:8px 2px 9px;text-align:center;border-right:1.5px solid rgba(13,11,20,.12)}
  .b2f-fc-day:last-child{border-right:none}
  .b2f-fc-lab{font:800 9.5px/1 'Bricolage Grotesque',sans-serif;color:#52525b;text-transform:uppercase;margin-bottom:6px}
  .b2f-fc-dot{width:14px;height:14px;border-radius:50%;border:2px solid ${I.ink};margin:0 auto}
  .b2f-fc-conf{font:800 9px/1 'Bricolage Grotesque',sans-serif;color:#52525b;margin-top:5px}
  .b2f-fc-day.lock{background:repeating-linear-gradient(45deg,#f3ecd9,#f3ecd9 4px,#eae1c8 4px,#eae1c8 8px)}
  .b2f-sel.b2f-sel{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border-radius:12px!important;border:2.5px solid ${I.ink}!important;background:#fff!important;font:700 15px/1.2 'Bricolage Grotesque',sans-serif!important;color:${I.ink}!important;margin-top:9px}
  @media (prefers-reduced-motion:no-preference){.sgseq-step{animation:sgseqIn .16s cubic-bezier(.16,1,.3,1) both}}
  @keyframes sgseqIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
  `
  const titleStyle={fontFamily:"'Anton',sans-serif",fontSize:"clamp(20px,6.2vw,25px)",lineHeight:.98,textTransform:"uppercase",letterSpacing:"-.5px",color:I.ink,margin:"13px 0 8px",outline:"none"}
  const bodyStyle={font:"600 13px/1.45 'Bricolage Grotesque'",color:"#41414a",marginBottom:11}
  const inputStyle={width:"100%",boxSizing:"border-box",padding:"12px 14px",borderRadius:13,border:`2.5px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:9,boxShadow:`inset 2px 2px 0 rgba(13,11,20,.06)`}
  // Chip prix = INFORMATION dès É1 (règle « prix tôt »), jamais un lien (l'ASK vit à É4).
  const proPay=payOf("pro")
  const priceChip=(
    <div style={{display:"flex",justifyContent:"center",marginTop:12}}>
      <span style={{font:"800 11px/1.4 'Bricolage Grotesque'",color:I.ink,background:"#fff",border:`2px solid ${I.ink}`,borderRadius:999,padding:"6px 12px",boxShadow:`2px 2px 0 ${I.ink}`,textAlign:"center"}}>
        {_t(lang,"Pro · 79 €/mois · essai 30 j sans carte","Pro · €79/mo · 30-day trial, no card","Pro · 79 €/mes · prueba 30 días sin tarjeta")}
        {proPay&&proPay.amt?_t(lang,` · ou ${proPay.amt}/an`,` · or ${proPay.amt}/yr`,` · o ${proPay.amt}/año`):""}
      </span>
    </div>)
  // Sélecteur de plage (entrée sans contexte) : options = plages de l'île AYANT un
  // verdict, dédupliquées par id satellite. Optionnel — avancer sans choisir reste possible.
  const pickable=(()=>{
    const seen=new Set(),out=[]
    const src=IS_NEW_REGION?(REGION.beaches||[]).map(b=>({sid:b.id,name:b.name}))
      :BEACHES_FALLBACK.filter(b=>b.island===isl&&BEACH_TO_SARG[b.id]).map(b=>({sid:BEACH_TO_SARG[b.id],name:b.name}))
    for(const o of src){if(!o.sid||!o.name||seen.has(o.sid))continue;if(!islandLvls.some(l=>l.id===o.sid))continue;seen.add(o.sid);out.push(o)}
    return out.sort((a,b)=>a.name.localeCompare(b.name))
  })()
  const st1=stOf(lvl)
  const dayLab=i=>i===0?_t(lang,"Auj","Today","Hoy"):i===1?_t(lang,"Dem","Tom","Mañ"):"J+"+i
  return(
    <div className="bsc-sheet" onClick={onClose} style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(11,7,22,.62)",backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",padding:18,animation:"bscFade .22s ease both"}}>
      <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={_t(lang,"Offre Pro — Hôtels & collectivités","Pro offer — Hotels & towns","Oferta Pro — Hoteles y municipios")} onClick={e=>e.stopPropagation()}
        onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
        style={{width:"100%",maxWidth:430,maxHeight:"92svh",overflowY:"auto",overflowX:"hidden",position:"relative",
        background:I.cream,backgroundImage:`radial-gradient(${I.ink}0d 1.3px,transparent 1.5px)`,backgroundSize:"11px 11px",
        border:`3px solid ${I.ink}`,borderRadius:22,boxShadow:`6px 6px 0 ${I.ink}`,padding:"20px 18px calc(18px + env(safe-area-inset-bottom))",
        fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",animation:"bscPop .42s cubic-bezier(.16,1,.3,1) both"}}>
        <style>{CSS_B2F}</style>
        <button className="b2f-x" onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}>✕</button>
        {seqOn&&!sent&&step>1&&<button className="b2f-back" onClick={()=>goBack(step)} aria-label={_t(lang,"Retour","Back","Atrás")}>‹</button>}
        <div style={{display:"inline-flex",alignItems:"center",gap:6,font:"800 10px/1 'Bricolage Grotesque'",letterSpacing:".09em",textTransform:"uppercase",color:I.ink,background:I.blue,border:`2px solid ${I.ink}`,borderRadius:6,padding:"4px 8px",boxShadow:`2px 2px 0 ${I.ink}`,marginLeft:seqOn&&!sent&&step>1?46:0}}>🏨 {_t(lang,"Pro · Hôtels & collectivités","Pro · Hotels & towns","Pro · Hoteles y municipios")}</div>
        {seqOn&&!sent&&<SeqDots n={4} at={step} ink={I.ink} gold={I.gold}/>}
        {!sent&&!seqOn?<>
          {/* ── ÉCRAN UNIQUE D'ORIGINE (rollback ?b2bseq=0) — structure intacte, seul le
              titre-peur est corrigé (promesse positive = loi, le contrôle ne doit pas
              mesurer un message qui viole la doctrine). ── */}
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:25,lineHeight:.98,textTransform:"uppercase",letterSpacing:"-.5px",color:I.ink,margin:"13px 0 6px"}}>{_t(lang,"Connaissez la fin de l'histoire avant vos invités.","Know the end of the story before your guests do.","Conozca el final de la historia antes que sus huéspedes.")}</div>
          <div style={{font:"600 13px/1.45 'Bricolage Grotesque'",color:"#41414a",marginBottom:14}}>{_t(lang,"Surveillance satellite de VOS plages : prévenez avant l'échouage, rassurez clients et administrés.","Satellite monitoring of YOUR beaches: warn before sargassum lands, reassure guests and citizens.","Monitoreo satelital de SUS playas: avise antes de la llegada, tranquilice a clientes y ciudadanos.")}</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:13}}>
            {TIERS.map(t=>(
              <button key={t.id} onClick={()=>setTier(t.id)} style={{textAlign:"left",position:"relative",padding:"12px 13px",borderRadius:14,cursor:"pointer",
                border:`2.5px solid ${I.ink}`,background:tier===t.id?(t.featured?I.gold:"#fff"):"#fff",
                boxShadow:tier===t.id?`3px 3px 0 ${I.ink}`:`1px 1px 0 ${I.ink}`,transition:"transform .08s ease",
                outline:tier===t.id?`0`:"0",opacity:1}}>
                {t.featured&&<span style={{position:"absolute",top:-9,right:12,font:"800 9px/1 'Bricolage Grotesque'",letterSpacing:".06em",textTransform:"uppercase",background:I.ink,color:I.gold,padding:"3px 7px",borderRadius:5}}>{_t(lang,"Populaire","Popular","Popular")}</span>}
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
                  <span style={{font:"800 15px/1.1 'Bricolage Grotesque'",color:I.ink}}>{t.icon} {t.name}</span>
                  <span style={{font:"800 14px/1 'Bricolage Grotesque'",color:I.ink,whiteSpace:"nowrap"}}>{t.price}</span>
                </div>
                <div style={{font:"600 12px/1.4 'Bricolage Grotesque'",color:"#52525b",marginTop:4}}>{t.pitch}</div>
              </button>
            ))}
          </div>
          <input value={org} onChange={e=>setOrg(e.target.value)}
            placeholder={_t(lang,"Nom de l'établissement (optionnel)","Property name (optional)","Nombre del establecimiento (opcional)")}
            aria-label={_t(lang,"Nom de l'établissement (optionnel)","Property name (optional)","Nombre del establecimiento (opcional)")}
            style={inputStyle}/>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit()}}
            placeholder={_t(lang,"Votre email pro","Your work email","Su email de trabajo")}
            aria-label={_t(lang,"Votre email pro","Your work email","Su email de trabajo")}
            style={{...inputStyle,padding:"14px 15px",marginBottom:11}}/>
          <button onClick={submit} disabled={!valid||busy} style={{width:"100%",textAlign:"center",font:"800 16px/1 'Bricolage Grotesque'",padding:16,borderRadius:15,border:`3px solid ${I.ink}`,boxShadow:`3px 3px 0 ${I.ink}`,background:valid?I.gold:"#e7e2d4",color:I.ink,cursor:valid&&!busy?"pointer":"default",opacity:valid?1:.7}}>{busy?_t(lang,"Activation…","Activating…","Activando…"):cur.cta}</button>
          <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:I.sub,textAlign:"center",marginTop:9}}>{_t(lang,"Essai 30 j, sans carte, aucun prélèvement automatique · −2 mois en annuel · stop quand vous voulez","30-day trial, no card, no auto-charge · 2 months free yearly · stop anytime","Prueba 30 días, sin tarjeta, sin cobro automático · 2 meses gratis al año · pare cuando quiera")}</div>
          {payUrlOf(tier)&&<div style={{textAlign:"center",marginTop:8}}>
            <a href={payUrlOf(tier)} onClick={()=>{try{track("sg_b2b_paylink_click",{tier})}catch(_){}}} style={{font:"800 12.5px/1 'Bricolage Grotesque'",color:I.ink,textDecoration:"underline"}}>{_t(lang,"Ou payez l'année directement →","Or pay yearly directly →","O paga el año directamente →")}</a>
          </div>}
        </>:!sent&&step===1?<div key={1} className="sgseq-step">
          {/* ── É1 CONSTAT + CADEAU (temps 1+2+3) : le verdict RÉEL, gratuit, avant tout ask. ── */}
          <div ref={stepTitleRef} tabIndex={-1} style={titleStyle}>{bName
            ?_t(lang,`${bName}, ce matin. Mesurée, pas devinée.`,`${bName}, this morning. Measured, not guessed.`,`${bName}, esta mañana. Medida, no adivinada.`)
            :_t(lang,"Vos plages, ce matin. Mesurées, pas devinées.","Your beaches, this morning. Measured, not guessed.","Sus playas, esta mañana. Medidas, no adivinadas.")}</div>
          {lvl&&st1?<>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px",border:`2.5px solid ${I.ink}`,borderRadius:14,background:"#fff",boxShadow:`3px 3px 0 ${I.ink}`}}>
              <span style={{width:16,height:16,borderRadius:"50%",background:st1.c,border:`2px solid ${I.ink}`,flexShrink:0}} aria-hidden="true"/>
              <div style={{minWidth:0}}>
                <div style={{font:"800 14.5px/1.2 'Bricolage Grotesque'",color:I.ink}}>{bName||nameOf(lvl)} · {st1.l}</div>
                <div style={{font:"700 11px/1.4 'Bricolage Grotesque'",color:"#52525b",marginTop:3}}>
                  {lvl.confidence?_t(lang,`confiance ${lvl.confidence} %`,`${lvl.confidence}% confidence`,`confianza ${lvl.confidence} %`):null}
                  {lvl.confidence&&freshLine?" · ":null}{freshLine}
                </div>
              </div>
            </div>
          </>:totalCount>0?<>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px",border:`2.5px solid ${I.ink}`,borderRadius:14,background:"#fff",boxShadow:`3px 3px 0 ${I.ink}`}}>
              <span style={{fontSize:20,flexShrink:0}} aria-hidden="true">🛰️</span>
              <div>
                <div style={{font:"800 14.5px/1.2 'Bricolage Grotesque'",color:I.ink}}>{_t(lang,`${cleanCount}/${totalCount} plages propres ce matin`,`${cleanCount}/${totalCount} beaches clean this morning`,`${cleanCount}/${totalCount} playas limpias esta mañana`)}</div>
                {freshLine&&<div style={{font:"700 11px/1.4 'Bricolage Grotesque'",color:"#52525b",marginTop:3}}>{freshLine}</div>}
              </div>
            </div>
            {pickable.length>0&&<select className="b2f-sel" value={pickedId} aria-label={_t(lang,"Votre plage (optionnel)","Your beach (optional)","Su playa (opcional)")}
              onChange={e=>{setPickedId(e.target.value);if(e.target.value){try{track("sg_b2b_beach_pick",{mode:"picked"})}catch(_){}}}}>
              <option value="">{_t(lang,"Votre plage (optionnel)…","Your beach (optional)…","Su playa (opcional)…")}</option>
              {pickable.map(o=><option key={o.sid} value={o.sid}>{o.name}</option>)}
            </select>}
          </>:<>
            <div style={{padding:"12px 13px",border:`2.5px solid ${I.ink}`,borderRadius:14,background:"#fff",boxShadow:`3px 3px 0 ${I.ink}`,font:"700 13px/1.45 'Bricolage Grotesque'",color:"#41414a"}}>
              🛰️ {_t(lang,"Le satellite passe 4 fois par jour au-dessus de vos plages. Donnée en cours de chargement…","The satellite passes over your beaches 4 times a day. Data loading…","El satélite pasa 4 veces al día sobre sus playas. Datos cargándose…")}
            </div>
          </>}
          <div style={{...bodyStyle,marginTop:11}}>{_t(lang,"Ce verdict est public et gratuit — vos clients comme vos administrés le consultent déjà avant de venir.","This verdict is public and free — your guests and your citizens already check it before coming.","Este veredicto es público y gratuito — sus clientes y sus ciudadanos ya lo consultan antes de venir.")}</div>
          <div style={{font:"700 13px/1.4 'Bricolage Grotesque'",color:I.ink,marginBottom:13}}>{_t(lang,"Personne n'aime le découvrir dans un avis client.","No one likes finding out in a guest review.","A nadie le gusta descubrirlo en una reseña.")}</div>
          <button className="b2f-cta" onClick={()=>goStep(2)}>{bName
            ?_t(lang,`Voir la semaine de ${bName} →`,`See the week for ${bName} →`,`Ver la semana de ${bName} →`)
            :_t(lang,"Voir la semaine de vos plages →","See the week for your beaches →","Ver la semana de sus playas →")}</button>
          {priceChip}
        </div>:!sent&&step===2?<div key={2} className="sgseq-step">
          {/* ── É2 RENVERSEMENT + HONNÊTETÉ AUDITÉE (temps 4+5) : la semaine réelle
              verrouillée (Auj/Dem = SEULS jours réels du JSON — jamais une couleur
              fabriquée sur J+2…J+6, loi moat) + le registre d'erreurs public. ── */}
          <div ref={stepTitleRef} tabIndex={-1} style={titleStyle}>{_t(lang,"La fin de l'histoire, avant vos invités.","The end of the story — before your guests.","El final de la historia — antes que sus huéspedes.")}</div>
          <div style={bodyStyle}>{_t(lang,"Le satellite voit les bancs au large des jours avant la côte. Vous préparez, vous informez — clients comme administrés.","The satellite spots offshore rafts days before they reach the coast. You prepare, you inform — guests and citizens alike.","El satélite ve los bancos en alta mar días antes de que lleguen a la costa. Usted se prepara, usted informa — clientes y ciudadanos por igual.")}</div>
          {fcLvl&&fcDays.length>0&&<div className="b2f-fc">
            <div className="b2f-fc-top"><span>{_t(lang,"Prévision 7 jours","7-day forecast","Pronóstico 7 días")}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fcName}</span></div>
            <div className="b2f-fc-grid">
              {Array.from({length:7},(_,i)=>{
                const d=i<2?fcDays[i]:null
                const stc=d?(STATUS[d.status]||null):null
                return(<div key={i} className={"b2f-fc-day"+(d?"":" lock")}>
                  <div className="b2f-fc-lab">{dayLab(i)}</div>
                  {d&&stc?<><div className="b2f-fc-dot" style={{background:stc.c}}/><div className="b2f-fc-conf">{d.confidence?d.confidence+" %":""}</div></>
                    :<div aria-hidden="true" style={{fontSize:13,lineHeight:"14px",color:"#6a6478"}}>🔒</div>}
                </div>)
              })}
            </div>
          </div>}
          <div style={{font:"800 12px/1.4 'Bricolage Grotesque'",color:I.ink,background:`linear-gradient(180deg,#ffe9a8,#ffd75e)`,border:`2.5px solid ${I.ink}`,borderRadius:11,boxShadow:`2px 2px 0 ${I.ink}`,padding:"9px 12px",marginBottom:12}}>
            {_t(lang,"Les 7 jours, plage par plage — inclus dans l'essai 30 j","All 7 days, beach by beach — included in the 30-day trial","Los 7 días, playa por playa — incluidos en la prueba de 30 días")}
          </div>
          {<div style={{padding:"11px 12px",border:`2.5px solid ${I.ink}`,borderRadius:14,background:"#fff",boxShadow:`2px 2px 0 ${I.ink}`,marginBottom:12}}>
            {proofLine&&<div style={{font:"800 12.5px/1.4 'Bricolage Grotesque'",color:I.ink}}>{proofLine}</div>}
            <div style={{font:"700 11px/1.45 'Bricolage Grotesque'",color:"#52525b",marginTop:proofLine?5:0}}>{_t(lang,"76 à 79 % tous régimes selon la saison · confiance affichée sur chaque alerte","76–79% across all regimes depending on season · confidence shown on every alert","76–79 % en todos los regímenes según la temporada · confianza visible en cada alerta")}</div>
            {/* CRO B2B 2026-09-04 : _relHref() faisait planter le rendu É2 (import circulaire
                via lib/relHref.js) → ternaire inline, même idiome que BriefMatin/WorldPaywall. */}
            <a href={lang==="en"?"/reliability/":lang==="es"?"/fiabilidad/":"/fiabilite/"} target="_blank" rel="noopener" onClick={()=>{try{track("sg_b2b_rel_click",{step:2})}catch(_){}}} style={{display:"inline-block",font:"800 12px/1.4 'Bricolage Grotesque'",color:I.ink,textDecoration:"underline",marginTop:6}}>{_t(lang,"Vérifier le registre public →","Check the public record →","Ver el registro público →")}</a>
          </div>}
          <button className="b2f-cta" onClick={()=>goStep(3)}>{_t(lang,"Voir l'offre Pro →","See the Pro offer →","Ver la oferta Pro →")}</button>
          <div style={{font:"600 11px/1.4 'Bricolage Grotesque'",color:"#6a6478",fontStyle:"italic",textAlign:"center",marginTop:10}}>{_t(lang,"Il regarde la mer, jamais vos clients.","He watches the sea, never your guests.","Mira el mar, nunca a sus clientes.")}</div>
        </div>:!sent&&step===3?<div key={3} className="sgseq-step">
          {/* ── É3 OFFRE HIÉRARCHISÉE (temps 6a) : UNE décision — le format. Pro héros,
              Brief/Territoire = rangées compactes visibles SANS clic (WTP non biaisée). ── */}
          <div ref={stepTitleRef} tabIndex={-1} style={titleStyle}>{_t(lang,"Choisissez votre format. L'essai est offert.","Pick your format. The trial is on us.","Elija su formato. La prueba es gratis.")}</div>
          <div className="b2f-hero" style={{marginBottom:9}}>
            {cur.featured&&<span style={{position:"absolute",top:-9,right:12,font:"800 9px/1 'Bricolage Grotesque'",letterSpacing:".06em",textTransform:"uppercase",background:I.ink,color:I.gold,padding:"3px 7px",borderRadius:5}}>{_t(lang,"Populaire","Popular","Popular")}</span>}
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8}}>
              <span style={{font:"800 16px/1.1 'Bricolage Grotesque'",color:I.ink}}>{cur.icon} {cur.name}</span>
              <span style={{font:"800 13.5px/1.2 'Bricolage Grotesque'",color:I.ink,whiteSpace:"nowrap"}}>{cur.id==="pro"&&proPay&&proPay.amt
                ?_t(lang,`79 €/mois ou ${proPay.amt}/an`,`€79/mo or ${proPay.amt}/yr`,`79 €/mes o ${proPay.amt}/año`)
                :cur.price}</span>
            </div>
            {cur.id==="pro"?<ul style={{margin:"8px 0 2px",padding:"0 0 0 16px",font:"600 12.5px/1.5 'Bricolage Grotesque'",color:"#33333c"}}>
              <li>{_t(lang,"Mis en avant dans l'app au moment où le voyageur vérifie avant de réserver","Featured in the app right when travelers check before booking","Destacado en la app justo cuando el viajero comprueba antes de reservar")}</li>
              <li>{_t(lang,"Brief du matin + alerte avant l'échouage","Morning brief + alert before it lands","Informe matinal + alerta antes de la llegada")}</li>
              <li>{_t(lang,"Prévision 7 jours + encart à vos couleurs sur votre site","7-day forecast + a panel in your colors on your website","Pronóstico 7 días + panel con sus colores en su web")}</li>
            </ul>:<div style={{font:"600 12.5px/1.5 'Bricolage Grotesque'",color:"#33333c",marginTop:7}}>{cur.pitch}</div>}
            <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:"#6a6478",marginTop:6}}>{cur.id==="pro"?_t(lang,"Pour hôtels & resorts. 2 mois offerts en annuel.","For hotels & resorts. 2 months free yearly.","Para hoteles y resorts. 2 meses gratis al año."):null}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
            {TIERS.filter(t=>t.id!==tier).map(t=>(
              <button key={t.id} className="b2f-row" onClick={()=>{setTier(t.id);try{track("sg_b2b_tier_select",{tier:t.id})}catch(_){}}}>
                <span style={{font:"800 13px/1.35 'Bricolage Grotesque'"}}>{t.icon} {t.name} — {t.price}</span>
                <span style={{font:"600 11.5px/1.35 'Bricolage Grotesque'",color:"#52525b",display:"block"}}>{t.id==="brief"
                  ?_t(lang,"Le brief quotidien par email. Gîtes, restos, clubs plage.","The daily brief by email. Guesthouses, restaurants, beach clubs.","El informe diario por email. Alojamientos, restaurantes, clubes de playa.")
                  :t.id==="territoire"?_t(lang,"Communes & offices de tourisme : multi-plages, rapports, API.","Towns & tourism boards: multi-beach, reports, API.","Municipios y oficinas de turismo: multi-playa, informes, API.")
                  :_t(lang,"Hôtels & resorts : app + brief + alertes + widget.","Hotels & resorts: app + brief + alerts + widget.","Hoteles y resorts: app + informe + alertas + widget.")}</span>
              </button>
            ))}
          </div>
          <button className="b2f-cta" onClick={()=>goStep(4)}>{_t(lang,"Démarrer l'essai 30 j — sans carte →","Start the 30-day trial — no card →","Empezar la prueba de 30 días — sin tarjeta →")}</button>
          <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:I.sub,textAlign:"center",marginTop:9}}>{_t(lang,"Essai 30 j, sans carte, aucun prélèvement automatique · stop quand vous voulez","30-day trial, no card, no auto-charge · stop anytime","Prueba 30 días, sin tarjeta, sin cobro automático · pare cuando quiera")}</div>
        </div>:!sent?<div key={4} className="sgseq-step">
          {/* ── É4 L'ASK ISOLÉ (temps 6b) : le SEUL écran qui demande quelque chose.
              submit() STRICTEMENT INCHANGÉ (money-path). Paylink = 1re apparition. ── */}
          <div ref={stepTitleRef} tabIndex={-1} style={titleStyle}>{_t(lang,"Votre accès s'ouvre maintenant.","Your access opens now.","Su acceso se abre ahora.")}</div>
          <button className="b2f-row" onClick={()=>goBack(4)} style={{marginBottom:10}} aria-label={_t(lang,"Modifier le format","Change format","Cambiar formato")}>
            <span style={{font:"800 12.5px/1.35 'Bricolage Grotesque'"}}>{cur.icon} {cur.name} · {cur.id==="pro"&&proPay&&proPay.amt?_t(lang,`79 €/mois ou ${proPay.amt}/an`,`€79/mo or ${proPay.amt}/yr`,`79 €/mes o ${proPay.amt}/año`):cur.price} · {_t(lang,"essai 30 j sans carte","30-day trial, no card","prueba 30 días sin tarjeta")}</span>
            <span style={{font:"800 11.5px/1.35 'Bricolage Grotesque'",color:"#6a6478",display:"block",marginTop:2}}>{_t(lang,"Modifier ‹","Change ‹","Cambiar ‹")}</span>
          </button>
          {tier==="pro"&&<>
            <div style={{border:`2.5px solid ${I.ink}`,borderRadius:14,overflow:"hidden",boxShadow:`3px 3px 0 ${I.ink}`,background:"#fff",marginBottom:5}}>
              <div style={{padding:"8px 12px",background:"#0a1620",color:"#fdfcf7",display:"flex",justifyContent:"space-between",gap:8}}>
                <span style={{font:"800 12px/1.3 'Bricolage Grotesque'",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{org.trim()||_t(lang,"Votre établissement","Your property","Su establecimiento")}</span>
                <span style={{font:"700 10.5px/1.4 'Bricolage Grotesque'",opacity:.75,whiteSpace:"nowrap"}}>{_t(lang,"par Le Veilleur","by Le Veilleur","por Le Veilleur")}</span>
              </div>
              <div style={{padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
                {lvl&&st1?<><span style={{width:12,height:12,borderRadius:"50%",background:st1.c,border:`2px solid ${I.ink}`,flexShrink:0}} aria-hidden="true"/>
                  <span style={{font:"800 12.5px/1.3 'Bricolage Grotesque'",color:I.ink}}>{(bName||nameOf(lvl))} · {st1.l}</span></>
                  :<span style={{font:"700 12px/1.4 'Bricolage Grotesque'",color:"#52525b"}}>{_t(lang,"Le verdict satellite du jour de votre plage","Today's satellite verdict for your beach","El veredicto satelital del día de su playa")}</span>}
              </div>
            </div>
            <div style={{font:"700 10.5px/1.3 'Bricolage Grotesque'",color:"#6a6478",marginBottom:10}}>{_t(lang,"Votre encart, à vos couleurs, sur votre site.","Your panel, in your colors, on your website.","Su panel, con sus colores, en su web.")}</div>
          </>}
          <input value={org} onChange={onOrgChange}
            placeholder={_t(lang,"Nom de l'établissement ou de la collectivité (optionnel)","Property or organization name (optional)","Nombre del establecimiento o de la entidad (opcional)")}
            aria-label={_t(lang,"Nom de l'établissement ou de la collectivité (optionnel)","Property or organization name (optional)","Nombre del establecimiento o de la entidad (opcional)")}
            style={inputStyle}/>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit()}}
            placeholder={_t(lang,"Votre email pro","Your work email","Su email de trabajo")}
            aria-label={_t(lang,"Votre email pro","Your work email","Su email de trabajo")}
            style={{...inputStyle,padding:"14px 15px",marginBottom:11}}/>
          <button className="b2f-cta" onClick={submit} disabled={!valid||busy}>{busy?_t(lang,"Activation…","Activating…","Activando…"):_t(lang,"Activer mon essai 30 j →","Activate my 30-day trial →","Activar mi prueba de 30 días →")}</button>
          <div style={{font:"700 11px/1.4 'Bricolage Grotesque'",color:I.sub,textAlign:"center",marginTop:9}}>{_t(lang,"Accès immédiat — aucun email de confirmation à cliquer · premier brief demain matin à 7 h","Instant access — no confirmation email to click · first brief in your inbox tomorrow at 7am","Acceso inmediato — sin email de confirmación · primer informe mañana a las 7 h")}</div>
          <div style={{font:"600 10.5px/1.45 'Bricolage Grotesque'",color:"#6a6478",textAlign:"center",marginTop:7}}>{_t(lang,"Votre email sert à ouvrir votre accès et vous envoyer le brief (intérêt légitime) · conservé 12 mois · supprimé sur simple demande.","Your email is used to open your access and send your brief (legitimate interest) · kept 12 months · deleted on request.","Su email sirve para abrir su acceso y enviarle el informe (interés legítimo) · conservado 12 meses · eliminado a petición.")}</div>
          {(tier==="pro"||tier==="brief")&&payOf(tier)&&<div style={{textAlign:"center",marginTop:9}}>
            <a href={payOf(tier).url} onClick={()=>{try{track("sg_b2b_paylink_click",{tier,at:"ask"})}catch(_){}}} style={{font:"800 12.5px/1.5 'Bricolage Grotesque'",color:I.ink,textDecoration:"underline"}}>{_t(lang,`Déjà décidé ? Payez l'année directement — ${payOf(tier).amt} (2 mois offerts) →`,`Already decided? Pay the year directly — ${payOf(tier).amt} (2 months free) →`,`¿Ya decidido? Pague el año directamente — ${payOf(tier).amt} (2 meses gratis) →`)}</a>
          </div>}
          {/* Partage équipe/décideur (sprint B2B Phase 9, outreach-ready SANS appel) : liens
              wa.me/?text= (partage, AUCUN numéro inventé) + mailto: pré-remplis avec le
              deep-link ?pro=1. Client-only, zéro backend, zéro PII. */}
          {(()=>{
            let proUrl="";try{proUrl=window.location.origin+"/?pro=1"}catch(_){proUrl=""}
            const msg=_t(lang,
              `Nos clients demandent où se baigner chaque jour. SargaGame briefe notre équipe chaque matin — essai 30 j sans carte : ${proUrl}`,
              `Our guests ask where to swim every day. SargaGame briefs our team each morning — 30-day trial, no card: ${proUrl}`,
              `Nuestros clientes preguntan dónde bañarse cada día. SargaGame informa a nuestro equipo cada mañana — prueba 30 días sin tarjeta: ${proUrl}`)
            const subj=_t(lang,"Brief sargasses quotidien pour notre équipe","Daily sargassum brief for our team","Informe diario de sargazo para nuestro equipo")
            const rowStyle={flex:"1 1 0",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 8px",borderRadius:12,border:`2px solid ${I.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${I.ink}`,font:"800 12px/1 'Bricolage Grotesque'",color:I.ink,textDecoration:"none",cursor:"pointer"};
            return(<div style={{display:"flex",gap:8,marginTop:10}}>
              <a href={"https://wa.me/?text="+encodeURIComponent(msg)} target="_blank" rel="noopener" onClick={()=>{try{track("sg_b2b_share",{channel:"whatsapp",tier})}catch(_){}}} style={rowStyle}>↗ {_t(lang,"WhatsApp","WhatsApp","WhatsApp")}</a>
              <a href={"mailto:?subject="+encodeURIComponent(subj)+"&body="+encodeURIComponent(msg)} onClick={()=>{try{track("sg_b2b_share",{channel:"email",tier})}catch(_){}}} style={rowStyle}>✉ {_t(lang,"Email","Email","Email")}</a>
            </div>)
          })()}
        </div>:token?<>
          {/* Essai activé INSTANTANÉMENT : token Pro 30 j en main → on envoie l'hôtel
             droit dans son espace (?k=token) déjà marque-blanche. Zéro attente, zéro call. */}
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,textTransform:"uppercase",letterSpacing:"-.5px",color:"#1c8f4e",margin:"15px 0 8px"}}>{_t(lang,"Essai activé ✓","Trial activated ✓","Prueba activada ✓")}</div>
          <div style={{font:"600 14px/1.5 'Bricolage Grotesque'",color:"#41414a",marginBottom:8}}>{_t(lang,"Votre accès Pro 30 jours est actif. Ouvrez votre espace pour brancher votre widget et vos alertes — on vient aussi de vous l'envoyer par email.","Your 30-day Pro access is live. Open your space to set up your widget and alerts — we've also just emailed it to you.","Su acceso Pro de 30 días está activo. Abra su espacio para configurar su widget y alertas — también se lo enviamos por email.")}</div>
          <div style={{font:"700 12.5px/1.4 'Bricolage Grotesque'",color:I.ink,marginBottom:14}}>{_t(lang,"Premier brief demain matin dans votre boîte.","First brief lands in your inbox tomorrow morning.","Primer informe mañana por la mañana en su correo.")}</div>
          <a href={`/pro/espace/?k=${encodeURIComponent(token)}`} onClick={()=>{try{track("sg_b2b_space_open",{tier:cur.id})}catch(_){}}} style={{display:"block",width:"100%",boxSizing:"border-box",textAlign:"center",textDecoration:"none",font:"800 16px/1 'Bricolage Grotesque'",padding:16,borderRadius:15,border:`3px solid ${I.ink}`,boxShadow:`3px 3px 0 ${I.ink}`,background:I.gold,color:I.ink,cursor:"pointer"}}>{_t(lang,"Ouvrir mon espace Pro →","Open my Pro space →","Abrir mi espacio Pro →")}</a>
          {/* Paylink annuel au PIC DE CONVICTION (post-activation, réciprocité maximale) —
             pro/brief seulement, JAMAIS territoire (le parcours devis/BDC occupe la place). */}
          {(tier==="pro"||tier==="brief")&&payOf(tier)&&<div style={{textAlign:"center",marginTop:10}}>
            <a href={payOf(tier).url} onClick={()=>{try{track("sg_b2b_paylink_click",{tier,at:"confirm"})}catch(_){}}} style={{font:"800 12.5px/1.5 'Bricolage Grotesque'",color:I.ink,textDecoration:"underline"}}>{_t(lang,`Vous savez déjà que vous resterez ? L'année : ${payOf(tier).amt} (2 mois offerts) →`,`Already know you'll stay? The year: ${payOf(tier).amt} (2 months free) →`,`¿Ya sabe que se quedará? El año: ${payOf(tier).amt} (2 meses gratis) →`)}</a>
          </div>}
          {/* Territoire (mairies/communes) : accès déjà ouvert + opt-in « programmons un point »
             → demande de devis/RDV transférée au fondateur (b2b-meeting.php). Funnel hybride. */}
          {tier==="territoire"&&<TerritoireMeeting lang={lang} email={email.trim()} org={org.trim()}/>}
        </>:<>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,textTransform:"uppercase",letterSpacing:"-.5px",color:"#1c8f4e",margin:"15px 0 8px"}}>{_t(lang,"Bien reçu ✓","Got it ✓","¡Recibido ✓")}</div>
          <div style={{font:"600 14px/1.5 'Bricolage Grotesque'",color:"#41414a",marginBottom:16}}>{tier==="territoire"
            ? _t(lang,"On vous recontacte sous 24h pour cadrer votre déploiement multi-plages.","We'll get back to you within 24h to scope your multi-beach rollout.","Le contactamos en 24h para definir su despliegue multiplaya.")
            : _t(lang,"On vous recontacte sous 24h pour activer votre surveillance et démarrer.","We'll get back to you within 24h to set up your monitoring.","Le contactamos en 24h para activar su monitoreo.")}</div>
          <button onClick={onClose} style={{width:"100%",textAlign:"center",font:"800 15px/1 'Bricolage Grotesque'",padding:15,borderRadius:15,border:`3px solid ${I.ink}`,boxShadow:`3px 3px 0 ${I.ink}`,background:I.gold,color:I.ink,cursor:"pointer"}}>{_t(lang,"Fermer","Close","Cerrar")}</button>
        </>}
      </div>
    </div>
  )
}

export { TerritoireMeeting }
/* PremiumModal — surface de paiement (PASS-ONLY Mollie on-site) + paywalls associés.
 * EXTRAIT de Sargasses_PROD.jsx (perf #173) pour sortir ~215 Ko de JS du chemin
 * critique : ce module est chargé en LAZY (lazyWithRetry) à l'ouverture du paywall.
 * ⚠️ CHEMIN DE L'ARGENT — code déplacé À L'IDENTIQUE. Les helpers/constantes partagés
 * (track, _t, C, T, abVariant, startCheckout deps, loadMollieJs/Stripe/PayPal, pricing…)
 * sont importés depuis Sargasses_PROD.jsx via exports nommés (mêmes singletons). */
import React,{useState,useEffect,useMemo,useRef,useCallback} from "react"
import PassOffer from "./PassOffer.jsx"
import {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, EUR_TRIP_CENTS, IS_NEW_REGION, LINK_ANNUAL, LINK_MONTHLY,
  LINK_PRO, MOLLIE_PROFILE, MOLLIE_TESTMODE, MOL_FIELD, MOL_LABEL, NO_TRIAL, PAYPAL_CLIENT_ID, PAYPAL_PLANS,
  PAYWALL_READY, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL, PAY_PROVIDER, PRICE_MO, PRICE_TRIP, PRICE_TRIP_EUR,
  PRICE_YR, REGION, REGION_PAY, SARG_TO_BEACH, STRIPE_PK, SUPPORT_EMAIL, T, TRIP_CENTS,
  VEILLEUR_MOOD, __COMM, __REL, _t, abVariant, fmtPassPrice, loadMollieJs, loadPayPalSdk,
  loadStripeJs, miVeil, moodFromStatus, sgMyReferralCode, sgReferredBy, sgToast, sgVerifySub, submitLead,
  track, walletAvail
} from "./Sargasses_PROD.jsx"

// useModalA11y — plancher a11y des modales du chemin de l'argent (paywall B2C + B2BModal).
// Plancher dur CLAUDE.md : role=dialog (posé inline sur le panel) + Échap + focus-trap +
// restauration du focus au close. Léger (zéro dep — ce chunk est budget-sensible), même
// esprit que les modales de ChasseHome (Escape + focus initial) mais avec un VRAI piège Tab.
// - panelRef : ref du conteneur du dialog (où vivent les éléments focusables).
// - onClose : appelé sur Échap (passe `false` à `escClose` si l'Échap est déjà géré ailleurs,
//   ex. PremiumModal a son propre handler tracké → on ne double pas le close).
function useModalA11y(panelRef,onClose,escClose=true){
  useEffect(()=>{
    const panel=panelRef.current
    const prevFocus=(typeof document!=="undefined"&&document.activeElement)||null
    const SEL='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const focusables=()=>panel?Array.prototype.filter.call(panel.querySelectorAll(SEL),el=>el.offsetParent!==null||el===document.activeElement):[]
    // Focus initial DANS le dialog (1er focusable) sans voler le focus à un champ déjà actif.
    try{if(panel&&!panel.contains(document.activeElement)){const f=focusables();(f[0]||panel).focus&&(f[0]||panel).focus()}}catch(_){}
    const onKey=e=>{
      // Si un AUTRE dialog est ouvert PAR-DESSUS ce panel (ex. B2BModal au-dessus du paywall),
      // ne pas piéger : la cible vit dans un dialog distinct → on laisse le dialog du dessus gérer.
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

// B2BModal — OFFRE PRO réelle et chiffrée (pivot B2B, juin 2026). 3 tiers (Widget
// gratuit / Pro Alertes 79€/mois / Territoire sur devis). Capture d'INTENTION HAUTE
// (pas juste « brief gratuit ») : le pro choisit un tier payant → on enregistre
// source distincte (b2b_pro_alertes / b2b_territoire / b2b_widget) + event
// sg_b2b_intent avec le prix → mesure la WILLINGNESS-TO-PAY sur 2-3 semaines.
// Vente B2B early = concierge (démo→facture) : le CTA capte l'intent, l'onboarding
// est manuel au début. ZÉRO logique de paiement touchée (capture, pas billing).
// Funnel HYBRIDE Territoire (mairies/offices/groupes hôteliers) : l'accès essai 30 j est
// DÉJÀ ouvert (token émis) ; CE bloc est un OPT-IN pur « programmons un point » — le secteur
// public a besoin d'un devis / bon de commande / interlocuteur qu'un clic ne remplace pas.
// POST /api/b2b-meeting.php → email au fondateur (zéro paiement, zéro engagement). Synthèse
// panel adverse 2026-06-29 (copywriter secteur public + DGS/office sceptiques) : accès
// DÉCOUPLÉ de l'ask, « aucun prélèvement automatique » dit noir sur blanc, RGPD inline,
// tarif indicatif HT, téléphone facultatif, lien /fiabilite/ avant de décider.
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
      <input value={littoral} onChange={e=>setLittoral(e.target.value)} placeholder={_t(lang,"Votre littoral (commune ou nb de plages)","Your coastline (town or # of beaches)","Su litoral (municipio o nº de playas)")} style={{width:"100%",boxSizing:"border-box",padding:"11px 13px",borderRadius:11,border:`2px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:8}}/>
      <input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder={_t(lang,"Téléphone (facultatif)","Phone (optional)","Teléfono (opcional)")} style={{width:"100%",boxSizing:"border-box",padding:"11px 13px",borderRadius:11,border:`2px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:10}}/>
      <button onClick={submit} disabled={busy} style={{width:"100%",textAlign:"center",font:"800 14px/1 'Bricolage Grotesque'",padding:13,borderRadius:12,border:`2.5px solid ${I.ink}`,boxShadow:`2px 2px 0 ${I.ink}`,background:I.gold,color:I.ink,cursor:busy?"default":"pointer"}}>{busy?_t(lang,"Envoi…","Sending…","Enviando…"):_t(lang,"Planifier un point · recevoir un devis →","Schedule a call · get a quote →","Reservar · recibir presupuesto →")}</button>
      <div style={{font:"600 10.5px/1.4 'Bricolage Grotesque'",color:"#dff1ec",marginTop:9}}>{_t(lang,"Données satellite publiques (Copernicus/NOAA), auditables · Devis, bon de commande, facture — conforme RGPD & marché public · Un interlocuteur dédié. Tarif indicatif HT.","Public satellite data (Copernicus/NOAA), auditable · Quote, purchase order, invoice — GDPR & public-procurement compliant · A dedicated contact. Indicative price excl. tax.","Datos satelitales públicos (Copernicus/NOAA), auditables · Presupuesto, orden de compra, factura — conforme RGPD · Un interlocutor dedicado. Precio indicativo sin IVA.")}</div>
      <div style={{font:"600 10.5px/1.4 'Bricolage Grotesque'",color:"#cfe9e3",marginTop:6}}>{_t(lang,"Vos coordonnées servent uniquement à vous recontacter (intérêt légitime), conservées 12 mois, supprimées sur simple demande.","Your details are used only to contact you (legitimate interest), kept 12 months, deleted on request.","Sus datos solo se usan para contactarle (interés legítimo), conservados 12 meses, eliminados a petición.")} <a href="/fiabilite/" style={{color:"#fdfcf7",textDecoration:"underline"}}>{_t(lang,"Voyez d'abord ce qu'on vaut →","See what we're worth first →","Vea primero lo que valemos →")}</a></div>
    </div>
  )
}

function B2BModal({lang,onClose}){
  const dlgRef=useRef(null)
  useModalA11y(dlgRef,onClose)   // role/aria-modal posés sur le panel ; Échap + focus-trap + restauration
  const [tier,setTier]=useState("pro")
  const [email,setEmail]=useState("")
  const [org,setOrg]=useState("")
  const [sent,setSent]=useState(false)
  const [token,setToken]=useState("")   // token Pro 30 j renvoyé par b2b-trial.php (essai INSTANTANÉ)
  const [busy,setBusy]=useState(false)
  // Flag rollback : ?b2btrial=0 → retombe sur l'ancien comportement (capture lead + « on
  // vous recontacte sous 24h »), sans appel à l'endpoint. Loi : pas de flag = pas de merge.
  const instantTrial=!/[?&]b2btrial=0/.test(typeof location!=="undefined"?location.search:"")
  const valid=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const I=COMIC
  // Liens de paiement Mollie (self-service in-app) — chargés depuis le JSON publié par
  // mollie-paylinks.cjs. Permet de PAYER l'année directement, sans humain.
  const [paylinks,setPaylinks]=useState(null)
  useEffect(()=>{try{track("sg_b2b_offer_view",{})}catch(_){}
    try{fetch("/api/b2b-paylinks.json",{cache:"no-store"}).then(r=>r.json()).then(d=>setPaylinks(d&&d.links||{})).catch(()=>{})}catch(_){}
  },[])
  const payUrlOf=t=>{const m={pro:"pro_annual",brief:"brief_annual",territoire:"territory_annual"}[t];const l=paylinks&&m&&paylinks[m];return (l&&l.url)||null}
  // Grille B2B (pricing arrêté panel 2026-06-29) : 3 tiers payants, essai 30j sans carte,
  // annuel = 2 mois offerts. PAS de widget gratuit (donner le hook gratis ne prouve
  // aucune WTP — c'est exactement ce qui a échoué). Le hook = l'essai 30j time-boxé.
  const TIERS=[
    {id:"brief",icon:"📩",name:_t(lang,"Brief","Brief","Brief"),price:_t(lang,"29 €/mois","€29/mo","29 €/mes"),
      pitch:_t(lang,"Brief quotidien de vos plages + alerte échouage par email. Pour gîtes, restos, clubs plage.","Daily brief of your beaches + landing alert by email. For guesthouses, restaurants, beach clubs.","Informe diario de sus playas + alerta por email. Para alojamientos, restaurantes, clubes."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_brief"},
    {id:"pro",icon:"🔔",name:_t(lang,"Pro","Pro","Pro"),price:_t(lang,"79 €/mois","€79/mo","79 €/mes"),featured:true,
      pitch:_t(lang,"Mis en avant DANS l'app sur la fiche de votre plage (au moment où le voyageur vérifie avant de réserver) + widget marque-blanche + brief + alertes + prévision 7 j. Pour hôtels & resorts.","Featured IN the app on your beach's page (right when travelers check before booking) + white-label widget + brief + alerts + 7-day forecast. For hotels & resorts.","Destacado EN la app en la ficha de su playa (justo cuando el viajero comprueba antes de reservar) + widget marca blanca + informe + alertas + pronóstico 7 días. Para hoteles y resorts."),
      cta:_t(lang,"Démarrer l'essai 30 j","Start 30-day trial","Empezar prueba 30 días"),source:"b2b_pro"},
    {id:"territoire",icon:"🏛️",name:_t(lang,"Territoire","Territory","Territorio"),price:_t(lang,"dès 199 €/mois","from €199/mo","desde 199 €/mes"),
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
  return(
    <div className="bsc-sheet" onClick={onClose} style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(11,7,22,.62)",backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",display:"flex",alignItems:"center",justifyContent:"center",padding:18,animation:"bscFade .22s ease both"}}>
      <div ref={dlgRef} role="dialog" aria-modal="true" aria-label={_t(lang,"Offre Pro — Hôtels & collectivités","Pro offer — Hotels & towns","Oferta Pro — Hoteles y municipios")} onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:430,maxHeight:"92svh",overflowY:"auto",overflowX:"hidden",position:"relative",
        background:I.cream,backgroundImage:`radial-gradient(${I.ink}0d 1.3px,transparent 1.5px)`,backgroundSize:"11px 11px",
        border:`3px solid ${I.ink}`,borderRadius:22,boxShadow:`6px 6px 0 ${I.ink}`,padding:"20px 18px calc(18px + env(safe-area-inset-bottom))",
        fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",animation:"bscPop .42s cubic-bezier(.16,1,.3,1) both"}}>
        <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{position:"absolute",top:13,right:13,width:34,height:34,borderRadius:"50%",border:`2.5px solid ${I.ink}`,background:"#fff",boxShadow:`2px 2px 0 ${I.ink}`,fontSize:16,fontWeight:900,color:I.ink,cursor:"pointer",lineHeight:1}}>✕</button>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,font:"800 10px/1 'Bricolage Grotesque'",letterSpacing:".09em",textTransform:"uppercase",color:I.ink,background:I.blue,border:`2px solid ${I.ink}`,borderRadius:6,padding:"4px 8px",boxShadow:`2px 2px 0 ${I.ink}`}}>🏨 {_t(lang,"Pro · Hôtels & collectivités","Pro · Hotels & towns","Pro · Hoteles y municipios")}</div>
        {!sent?<>
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:25,lineHeight:.98,textTransform:"uppercase",letterSpacing:"-.5px",color:I.ink,margin:"13px 0 6px"}}>{_t(lang,"Les sargasses gâchent l'expérience. Reprenez la main.","Sargassum ruins the guest experience. Take back control.","El sargazo arruina la experiencia. Recupere el control.")}</div>
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
            style={{width:"100%",padding:"12px 14px",borderRadius:13,border:`2.5px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:9,boxShadow:`inset 2px 2px 0 rgba(13,11,20,.06)`}}/>
          <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit()}}
            placeholder={_t(lang,"Votre email pro","Your work email","Su email de trabajo")}
            style={{width:"100%",padding:"14px 15px",borderRadius:13,border:`2.5px solid ${I.ink}`,background:"#fff",font:"700 16px/1 'Bricolage Grotesque'",color:I.ink,marginBottom:11,boxShadow:`inset 2px 2px 0 rgba(13,11,20,.06)`}}/>
          <button onClick={submit} disabled={!valid||busy} style={{width:"100%",textAlign:"center",font:"800 16px/1 'Bricolage Grotesque'",padding:16,borderRadius:15,border:`3px solid ${I.ink}`,boxShadow:`3px 3px 0 ${I.ink}`,background:valid?I.gold:"#e7e2d4",color:I.ink,cursor:valid&&!busy?"pointer":"default",opacity:valid?1:.7}}>{busy?_t(lang,"Activation…","Activating…","Activando…"):cur.cta}</button>
          <div style={{font:"700 11px/1.3 'Bricolage Grotesque'",color:I.sub,textAlign:"center",marginTop:9}}>{_t(lang,"Essai 30 j, sans carte, aucun prélèvement automatique · −2 mois en annuel · stop quand vous voulez","30-day trial, no card, no auto-charge · 2 months free yearly · stop anytime","Prueba 30 días, sin tarjeta, sin cobro automático · 2 meses gratis al año · pare cuando quiera")}</div>
          {payUrlOf(tier)&&<div style={{textAlign:"center",marginTop:8}}>
            <a href={payUrlOf(tier)} onClick={()=>{try{track("sg_b2b_paylink_click",{tier})}catch(_){}}} style={{font:"800 12.5px/1 'Bricolage Grotesque'",color:I.ink,textDecoration:"underline"}}>{_t(lang,"Ou payez l'année directement →","Or pay yearly directly →","O paga el año directamente →")}</a>
          </div>}
        </>:token?<>
          {/* Essai activé INSTANTANÉMENT : token Pro 30 j en main → on envoie l'hôtel
             droit dans son espace (?k=token) déjà marque-blanche. Zéro attente, zéro call. */}
          <div style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1,textTransform:"uppercase",letterSpacing:"-.5px",color:"#1c8f4e",margin:"15px 0 8px"}}>{_t(lang,"Essai activé ✓","Trial activated ✓","Prueba activada ✓")}</div>
          <div style={{font:"600 14px/1.5 'Bricolage Grotesque'",color:"#41414a",marginBottom:16}}>{_t(lang,"Votre accès Pro 30 jours est actif. Ouvrez votre espace pour brancher votre widget et vos alertes — on vient aussi de vous l'envoyer par email.","Your 30-day Pro access is live. Open your space to set up your widget and alerts — we've also just emailed it to you.","Su acceso Pro de 30 días está activo. Abra su espacio para configurar su widget y alertas — también se lo enviamos por email.")}</div>
          <a href={`/pro/espace/?k=${encodeURIComponent(token)}`} onClick={()=>{try{track("sg_b2b_space_open",{tier:cur.id})}catch(_){}}} style={{display:"block",width:"100%",boxSizing:"border-box",textAlign:"center",textDecoration:"none",font:"800 16px/1 'Bricolage Grotesque'",padding:16,borderRadius:15,border:`3px solid ${I.ink}`,boxShadow:`3px 3px 0 ${I.ink}`,background:I.gold,color:I.ink,cursor:"pointer"}}>{_t(lang,"Ouvrir mon espace Pro →","Open my Pro space →","Abrir mi espacio Pro →")}</a>
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

// ── WorldPaywall — skin « continuité du monde SVG » (A/B pw_world). Jury winner.
// MÊME signature de props que ComicPaywall → ZÉRO logique de paiement ici, on réutilise
// à l'identique ses dérivations prix (pMo/pYr/eqMo/perDay/ctaSub, devise-aware) + le câblage
// (onStart/setPlan/plan/effectivePlan/onAlready/onB2B/onClose). Le paywall PROLONGE l'univers
// de la carte : même mer golden-hour, même langage comic, même Veilleur. On VEND la prévision
// en la MONTRANT (aperçu 7 jours, Auj/Dem révélés verts, J+2…J+6 verrouillés). Classes .pww-*
// pour ne pas collisionner avec ComicPaywall (.pwx-*). reduced-motion respecté (tableau, pas
// aquarium). Asset validé : design/wow-candidates/paywall-world-continuity.html.
function WorldPaywall({lang,beach,topName,topScore,exSwitch,wkend,ctxName,ctxStatus,cleanCount,totalCount,recordProof,allCalm,pwCalm,seasonMsg,plan,setPlan,effectivePlan,hasAnnual,onStart,onAlready,onClose,onB2B,onSeason,captureMode}){
  // Verdict plage (depuis le contexte d'ouverture) → loc affichée dans l'aperçu 7 jours.
  const ST=ctxStatus||(beach&&beach.status)||null
  const ctxLoc=ctxName||topName||null
  // Prix — réutilise À L'IDENTIQUE les dérivations de ComicPaywall (aucune divergence,
  // aucun hardcode devise). pMo/pYr = cartes plan, eqMo = « soit X/mois » sous l'annuel,
  // ctaSub = 1re sous-ligne CTA, perDay = 2e sous-ligne (« moins qu'un café »).
  const pMo=REGION_PAY?PRICE_MO:(lang==="en"?"€4.99":"4,99 €")
  const pYr=REGION_PAY?PRICE_YR:(lang==="en"?"€49":"49 €")
  const eqMo=(()=>{const raw=REGION_PAY?PRICE_YR:"49";const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."));if(!n)return null;const sym=(String(raw).match(/[€$£]/)||["€"])[0];const e=(n/12).toFixed(2).replace(".",lang==="fr"?",":".");return _t(lang,`soit ${e} ${sym}/mois`,`${sym}${e}/mo`,`${sym}${e}/mes`)})()
  // « par jour » dérivé du prix réellement présélectionné (annuel si dispo, sinon mensuel).
  const perDay=(()=>{
    const useYr=effectivePlan==="annual"
    const raw=useYr?(REGION_PAY?PRICE_YR:"49"):(REGION_PAY?PRICE_MO:"4.99")
    const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."));if(!n)return null
    const sym=(String(raw).match(/[€$£]/)||["€"])[0]
    const per=(n/(useYr?365:30))
    const d=per.toFixed(2).replace(".",lang==="fr"?",":".")
    return _t(lang,`soit ${d} ${sym}/jour · moins qu'un café`,`just ${sym}${d}/day · less than a coffee`,`solo ${sym}${d}/día · menos que un café`)
  })()
  // 1re sous-ligne CTA — suit effectivePlan (mensuel ↔ annuel), no-trial partout.
  const ctaSub=NO_TRIAL
    ?_t(lang,`${effectivePlan==="annual"?pYr+"/an":pMo+"/mois"} · annulable en 2 clics`,`${effectivePlan==="annual"?pYr+"/yr":pMo+"/mo"} · cancel anytime`,`${effectivePlan==="annual"?pYr+"/año":pMo+"/mes"} · cancela cuando quieras`)
    :_t(lang,"7 jours offerts, puis "+(effectivePlan==="annual"?pYr+"/an":pMo+"/mois"),"7 days free, then "+(effectivePlan==="annual"?pYr+"/yr":pMo+"/mo"),"7 días gratis, luego "+(effectivePlan==="annual"?pYr+"/año":pMo+"/mes"))
  // Cadenas SVG réutilisé (jours verrouillés + bandeau + footer secure).
  const Lock=({s})=>(<svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>)
  // Aperçu 7 jours = STATIQUE / illustratif (pas de fausse donnée live), Auj/Dem verts.
  const dayNames=lang==="en"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:lang==="es"?["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]:["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"]
  const today=new Date().getDay() // 0=Dim
  const dn=i=>{if(i===0)return _t(lang,"Auj","Today","Hoy");if(i===1)return _t(lang,"Dem","Tom","Mañ");return dayNames[(today+i)%7]}
  const previewDots=["ok","ok","mod","bad","bad","mod","ok"] // illustratif
  const planBtn=(key,label,price,unit,slam,eq)=>(
    <button type="button" onClick={()=>{setPlan(key);try{track("sg_plan_toggle",{plan:key,skin:"world"})}catch(_){}}}
      className={"pww-plan"+(plan===key?" on":"")}>
      {slam&&<span className="pww-slam" aria-hidden="true">
        <svg viewBox="0 0 50 50"><path d="M25 1 L31 9 L41 6 L40 17 L49 22 L42 30 L47 40 L36 40 L31 49 L25 42 L19 49 L14 40 L3 40 L8 30 L1 22 L10 17 L9 6 L19 9 Z" fill="#E8522A" stroke="#0D0D0D" strokeWidth="2.5" strokeLinejoin="round"/></svg>
        <span>{slam}</span>
      </span>}
      <span className="pww-selck" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      <span className="pww-pn">{label}</span>
      <span className="pww-pr">{price}<small>/{unit}</small></span>
      {eq?<span className="pww-eq">{eq}</span>:<span className="pww-none">—</span>}
    </button>
  )
  return(<>
    <style>{`
      .pww-wrap{--bg:#FDFCF7;--gold:#E8A800;--goldL:#FFC72C;--goldLL:#FFE47A;--teal:#009E8E;--tealL:#1EC8B0;--green:#22C55E;--coral:#E8522A;--ink:#0D0D0D;--mid:#5A5A5A;
        font-family:"Bricolage Grotesque",system-ui,sans-serif;color:var(--ink);margin:-28px -24px -20px;position:relative;
        background:var(--bg);
        background-image:radial-gradient(rgba(13,13,13,.045) 1.1px,transparent 1.2px) 0 0/7px 7px,radial-gradient(rgba(13,13,13,.045) 1.1px,transparent 1.2px) 3.5px 3.5px/7px 7px}
      .pww-anton{font-family:"AntonLC","Anton",Impact,"Arial Narrow",sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:-.02em}
      /* HERO */
      .pww-hero{position:relative;height:150px;border-bottom:3px solid var(--ink);overflow:hidden}
      .pww-hero>svg.pww-sc{position:absolute;inset:0;width:100%;height:100%;display:block}
      .pww-eyebrow{position:absolute;left:12px;top:12px;z-index:4;font-size:10px;letter-spacing:1.3px;padding:4px 9px;border-radius:6px;color:var(--ink);background:var(--goldL);border:2px solid var(--ink);box-shadow:2px 2px 0 var(--ink)}
      .pww-season{position:absolute;right:12px;top:14px;z-index:4;font-size:9.5px;font-weight:800;color:#fff;background:rgba(13,13,13,.62);border:1.5px solid rgba(255,255,255,.85);border-radius:20px;padding:3px 9px;letter-spacing:.3px}
      .pww-veil{position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);z-index:3;filter:drop-shadow(2px 3px 0 rgba(13,13,13,.45))}
      .pww-vbubble{position:absolute;right:10px;top:30px;z-index:5;max-width:150px;background:#fff;border:2.5px solid var(--ink);border-radius:14px;padding:7px 10px;font-size:11px;font-weight:700;line-height:1.28;color:var(--ink);box-shadow:3px 3px 0 rgba(13,13,13,.9)}
      .pww-vbubble b{color:var(--coral)}
      .pww-vbubble:after{content:"";position:absolute;left:24px;bottom:-12px;width:16px;height:13px;background:#fff;border-left:2.5px solid var(--ink);border-bottom:2.5px solid var(--ink);transform:skewX(-18deg)}
      /* BODY */
      .pww-body{position:relative;z-index:1;padding:15px 17px 16px}
      .pww-title{font-size:30px;line-height:.96;margin:2px 0 8px;color:var(--ink);text-shadow:2px 2px 0 var(--goldLL)}
      .pww-title em{font-style:normal;color:var(--coral);text-shadow:2px 2px 0 var(--goldLL),4px 4px 0 var(--ink)}
      .pww-sub{font-size:13px;font-weight:600;color:#1c2c2c;margin:0 0 13px;line-height:1.32}
      .pww-sub b{color:var(--ink)}
      /* APERÇU 7 JOURS */
      .pww-fcast{position:relative;border:2.5px solid var(--ink);border-radius:16px;overflow:hidden;box-shadow:4px 4px 0 var(--ink);background:#fff;margin-bottom:13px}
      .pww-fcast-top{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:linear-gradient(180deg,#10343a,#0c272b);border-bottom:2.5px solid var(--ink)}
      .pww-fcast-top .ttl{font-size:11px;letter-spacing:.6px;color:#fff}
      .pww-fcast-top .loc{font-size:10px;font-weight:800;color:var(--goldL)}
      .pww-fcast-curve{position:absolute;left:0;right:0;top:40px;height:50px;z-index:0;pointer-events:none}
      .pww-days{position:relative;z-index:1;display:grid;grid-template-columns:repeat(7,1fr);gap:0;padding:9px 4px 10px}
      .pww-day{text-align:center;position:relative}
      .pww-day .ddn{font-size:8.5px;font-weight:800;color:var(--mid);text-transform:uppercase;letter-spacing:.1px}
      .pww-day .ddot{width:16px;height:16px;border-radius:50%;border:2px solid var(--ink);margin:6px auto 4px;box-shadow:1.5px 1.5px 0 rgba(13,13,13,.22)}
      .pww-day .dvd{font-size:7.5px;font-weight:800;color:var(--ink);line-height:1}
      .pww-day .ddot.ok{background:var(--green)}.pww-day .ddot.mod{background:var(--goldL)}.pww-day .ddot.bad{background:var(--coral)}
      .pww-day.lock{filter:saturate(.22);opacity:.92}
      .pww-day.lock .ddot{background:repeating-linear-gradient(45deg,#cfcabb,#cfcabb 3px,#e4e0d4 3px,#e4e0d4 6px)}
      .pww-day.lock .dvd{display:flex;justify-content:center;color:#9a9484}
      .pww-lockdiv{position:absolute;z-index:2;top:38px;bottom:9px;left:calc(2/7*100%);border-left:2.5px dashed var(--ink);opacity:.7;pointer-events:none}
      /* .pww-lockbar (ex-.pww-lockcta) : RENOMMÉE pour échapper à .theme-X [class*="cta"]
         qui en faisait un CTA plein recoloré (manga noir, arcade magenta, sticker rose)
         avec un <b> ink illisible. Garde le bandeau golden + texte ink (>9:1). */
      .pww-lockbar{position:relative;z-index:3;display:flex;align-items:center;justify-content:center;gap:7px;padding:7px 10px;background:linear-gradient(180deg,var(--goldLL),var(--goldL));border-top:2.5px solid var(--ink);color:var(--ink)}
      .pww-lockbar b{font-size:10.5px;font-weight:800;color:var(--ink);letter-spacing:.2px}
      /* PERKS */
      .pww-perks{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
      .pww-perk{display:flex;align-items:center;gap:10px;background:#fff;border:2.5px solid var(--ink);border-radius:13px;padding:9px 12px;box-shadow:3px 3px 0 var(--ink)}
      .pww-perk .pic{flex:0 0 auto;width:34px;height:34px;border-radius:9px;border:2.5px solid var(--ink);display:grid;place-items:center;box-shadow:2px 2px 0 var(--ink)}
      .pww-perk.a .pic{background:var(--goldLL)}.pww-perk.b .pic{background:var(--tealL)}.pww-perk.c .pic{background:#ffd0c2}
      .pww-perk b{display:block;font-size:13px;font-weight:800;color:var(--ink);line-height:1.15}
      .pww-perk em{display:block;font-style:normal;font-size:11px;font-weight:600;color:var(--mid);margin-top:1px;line-height:1.25}
      .pww-proof{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 0 15px;font-size:11px;font-weight:700;color:#1c2c2c;text-align:center}
      .pww-proof .pls{width:8px;height:8px;border-radius:50%;background:var(--green);flex:0 0 auto;box-shadow:0 0 0 0 rgba(34,197,94,.5);animation:pwwPulse 2.4s infinite}
      @keyframes pwwPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.45)}70%{box-shadow:0 0 0 7px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
      /* PLANS */
      .pww-plans{display:flex;gap:9px;margin-bottom:12px}
      .pww-plan{flex:1;border:2.5px solid var(--ink);border-radius:13px;padding:13px 9px 11px;cursor:pointer;position:relative;text-align:center;background:#fff;color:var(--ink);box-shadow:2px 2px 0 var(--ink);font-family:inherit;forced-color-adjust:none;transition:transform .09s,box-shadow .09s,background .12s}
      .pww-plan:active{transform:translate(1px,1px)}
      .pww-plan.on{background:linear-gradient(180deg,var(--goldLL),var(--goldL));box-shadow:0 4px 0 var(--ink)}
      .pww-plan .pww-pn{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--ink)}
      .pww-plan .pww-pr{display:block;margin-top:3px;font-family:"AntonLC","Anton",Impact,sans-serif;font-size:21px;line-height:1}
      .pww-plan .pww-pr small{font-size:11px;font-weight:600;letter-spacing:0;font-family:"Bricolage Grotesque",system-ui,sans-serif}
      .pww-plan .pww-eq{display:block;font-size:9.5px;font-weight:800;color:#8a6a12;margin-top:3px}
      .pww-plan.on .pww-eq{color:#7a5a06}
      .pww-plan .pww-none{display:block;font-size:9.5px;font-weight:700;color:transparent;margin-top:3px;user-select:none}
      .pww-slam{position:absolute;top:-15px;right:-13px;z-index:5;width:50px;height:50px;display:grid;place-items:center;transform:rotate(-14deg);pointer-events:none}
      .pww-slam svg{position:absolute;inset:0;width:100%;height:100%}
      .pww-slam span{position:relative;font-family:"AntonLC","Anton",Impact,sans-serif;font-size:14px;color:#fff;line-height:.9;text-align:center;text-shadow:1.5px 1.5px 0 rgba(0,0,0,.35);letter-spacing:.2px}
      .pww-selck{position:absolute;top:7px;left:7px;width:19px;height:19px;border-radius:50%;border:2.5px solid var(--ink);background:var(--goldL);display:grid;place-items:center;box-shadow:1.5px 1.5px 0 var(--ink);opacity:0;transform:scale(.55);transition:opacity .12s,transform .12s}
      .pww-selck svg{width:11px;height:11px;display:block}
      .pww-plan.on .pww-selck{opacity:1;transform:scale(1)}
      /* CTA */
      /* CTA premium = OR dans TOUS les arms du A/B thèmes (bible : or = action premium).
         .pww-wrap .pww-gobtn (0,2,0) + !important bat les règles .theme-X button (0,1,1) ;
         le nom sans "cta" échappe à .theme-X [class*="cta"]. */
      .pww-wrap .pww-gobtn{display:block;width:100%;border:3px solid var(--ink)!important;border-radius:15px!important;padding:14px 16px 13px;cursor:pointer;font-family:inherit;text-align:center;background:linear-gradient(180deg,var(--goldLL) 0%,var(--goldL) 55%,var(--gold) 100%)!important;color:var(--ink)!important;box-shadow:0 6px 0 var(--ink),0 13px 22px rgba(13,13,13,.34)!important;transition:transform .08s,box-shadow .08s}
      .pww-gobtn:active{transform:translateY(5px);box-shadow:0 1px 0 var(--ink),0 4px 10px rgba(13,13,13,.3)}
      .pww-gobtn .big{display:block;font-size:18px;line-height:1.02}
      .pww-gobtn .s1{display:block;font-size:12px;font-weight:800;margin-top:5px}
      .pww-wrap .pww-gobtn .s2{display:block;font-size:10.5px;font-weight:700;color:var(--ink)!important;margin-top:1px;opacity:.82}
      /* TRUST */
      .pww-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:13px}
      .pww-tc{background:#fff;border:2.5px solid var(--ink);border-radius:12px;padding:8px 5px;text-align:center;box-shadow:2px 2px 0 var(--ink)}
      .pww-tc .ic{width:20px;height:20px;margin:0 auto;display:block}
      .pww-tc b{display:block;font-size:10px;font-weight:800;color:var(--ink);margin-top:3px}
      .pww-tc em{display:block;font-style:normal;font-size:8.5px;font-weight:700;color:var(--mid);line-height:1.2;margin-top:1px}
      /* GARANTIE */
      .pww-guar{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border-radius:13px;background:rgba(34,197,94,.13);border:2.5px solid var(--green);box-shadow:3px 3px 0 var(--ink)}
      .pww-guar .gic{flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:var(--green);border:2.5px solid var(--ink);display:grid;place-items:center;box-shadow:1.5px 1.5px 0 var(--ink)}
      .pww-guar .gic svg{width:18px;height:18px;display:block}
      .pww-guar b{display:block;font-size:12px;font-weight:800;color:var(--ink)}
      .pww-guar em{display:block;font-style:normal;font-size:10.5px;font-weight:600;color:#1f5132;margin-top:1px;line-height:1.3}
      /* LIENS */
      .pww-links{display:flex;flex-direction:column;align-items:center;gap:9px;margin-top:14px}
      .pww-link{background:none;border:none;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:800;color:#16323a;text-decoration:underline;text-underline-offset:2px}
      .pww-link.b2b{color:var(--teal)}
      .pww-season-alt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin-top:12px;padding:11px 13px;border-radius:12px;cursor:pointer;border:1.5px dashed rgba(13,13,13,.34);background:rgba(13,13,13,.04);font-family:inherit;text-align:left}
      .pww-secure{display:flex;align-items:center;justify-content:center;gap:5px;text-align:center;font-size:9.5px;font-weight:700;color:var(--mid);margin-top:13px;letter-spacing:.2px}
      .pww-secure svg{width:11px;height:11px;display:block}
      .pww-breathe{animation:pwwBreathe 6s ease-in-out infinite;transform-origin:60px 70px}
      @keyframes pwwBreathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
      @media(prefers-reduced-motion:reduce){.pww-breathe{animation:none}.pww-proof .pls{animation:none}}
      /* ═══ BLINDAGE PAYWALL vs A/B THÈMES ═══
         Les <button> non-primaires (.pww-plan / .pww-season-alt / .pww-link) sont captés
         par .theme-X button{bg/color/border !important} → fond imposé (manga noir, arcade
         magenta, sticker rose) avec texte ink hardcodé illisible (≈1:1). On RE-SPÉCIFIE
         le fond papier/none + couleur des enfants à spécificité (0,2,x) qui bat .theme-X
         button (0,1,1), avec !important. Même stratégie éprouvée que .pww-gobtn. */
      .pww-wrap .pww-plan{background:#fff!important;color:var(--ink)!important;border:2.5px solid var(--ink)!important;border-radius:13px!important;box-shadow:2px 2px 0 var(--ink)!important;text-shadow:none!important;text-transform:none!important;letter-spacing:normal!important;font-family:inherit!important}
      .pww-wrap .pww-plan.on{background:linear-gradient(180deg,var(--goldLL),var(--goldL))!important;box-shadow:0 4px 0 var(--ink)!important}
      .pww-wrap .pww-plan .pww-pn,.pww-wrap .pww-plan .pww-pr,.pww-wrap .pww-plan .pww-pr small{color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important}
      .pww-wrap .pww-plan .pww-eq{color:#8a6a12!important}
      .pww-wrap .pww-plan.on .pww-eq{color:#7a5a06!important}
      .pww-wrap .pww-season-alt{background:rgba(13,13,13,.04)!important;border:1.5px dashed rgba(13,13,13,.34)!important;border-radius:12px!important;box-shadow:none!important;text-shadow:none!important;text-transform:none!important;letter-spacing:normal!important;font-family:inherit!important}
      .pww-wrap .pww-season-alt b,.pww-wrap .pww-season-alt span{color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important}
      .pww-wrap .pww-season-alt em{color:#5A5A5A!important;-webkit-text-fill-color:#5A5A5A!important}
      /* Les liens secondaires ne doivent JAMAIS devenir des pavés pleins → fond/bordure neutralisés,
         couleur encre lisible sur papier (le teal b2b vire encre aussi pour battre arcade/sticker). */
      .pww-wrap .pww-link{background:none!important;border:none!important;box-shadow:none!important;color:#16323a!important;-webkit-text-fill-color:#16323a!important;text-shadow:none!important;text-transform:none!important;letter-spacing:normal!important;border-radius:0!important;font-family:inherit!important}
      .pww-wrap .pww-link.b2b{color:#0f3d38!important;-webkit-text-fill-color:#0f3d38!important}
    `}</style>
    <div className="pww-wrap">
      {/* HERO : la même mer golden-hour que la carte */}
      <div className="pww-hero">
        <svg className="pww-sc" viewBox="0 0 380 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="pwwSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0B2230"/><stop offset=".42" stopColor="#155A5A"/>
              <stop offset=".74" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/>
            </linearGradient>
            <linearGradient id="pwwSea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/>
            </linearGradient>
            <radialGradient id="pwwGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#FFE9B0"/><stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <rect width="380" height="150" fill="url(#pwwSky)"/>
          <circle cx="276" cy="86" r="58" fill="url(#pwwGlow)"/>
          <circle cx="276" cy="86" r="27" fill="#FFE08A"/>
          <circle cx="276" cy="86" r="27" fill="none" stroke="#0D0D0D" strokeWidth="2.5"/>
          <g stroke="#FFF" strokeOpacity=".22" strokeWidth="2">
            <line x1="20" y1="30" x2="118" y2="24"/><line x1="14" y1="48" x2="92" y2="44"/><line x1="22" y1="66" x2="80" y2="64"/>
          </g>
          <path d="M0 100 H380 V150 H0 Z" fill="url(#pwwSea)"/>
          <path d="M0 100 Q95 90 190 100 t190 0 V118 H0 Z" fill="#0F3D39" opacity=".7"/>
          <g fill="#FFD884" opacity=".8">
            <rect x="266" y="104" width="20" height="3" rx="1.5"/><rect x="262" y="112" width="28" height="3" rx="1.5"/>
            <rect x="258" y="121" width="36" height="3.5" rx="1.5"/><rect x="252" y="131" width="48" height="4" rx="2"/>
          </g>
          <path d="M0 100 H380" stroke="#0D0D0D" strokeWidth="2" opacity=".55"/>
          <g transform="translate(70,112)">
            <path d="M-17 6 Q0 17 17 6 L13 0 H-13 Z" fill="#E8522A" stroke="#0D0D0D" strokeWidth="2"/>
            <path d="M-13 0 H13" stroke="#0D0D0D" strokeWidth="1.5"/>
            <line x1="0" y1="0" x2="0" y2="-16" stroke="#0D0D0D" strokeWidth="2"/>
            <path d="M0 -16 L11 -3 L0 -3 Z" fill="#FFE47A" stroke="#0D0D0D" strokeWidth="1.6"/>
          </g>
        </svg>
        <span className="pww-eyebrow pww-anton">{_t(lang,"Le Veilleur — Pass","The Watcher — Pass","El Vigía — Pase")}</span>
        <span className="pww-season">{seasonMsg||_t(lang,"La saison est là","Season is here","La temporada está aquí")}</span>
        <div className="pww-vbubble">{_t(lang,<>Ta plage, vérifiée chaque matin — <b>avant</b> que tu partes.</>,<>Your beach, checked every morning — <b>before</b> you leave.</>,<>Tu playa, verificada cada mañana — <b>antes</b> de que salgas.</>)}</div>
        <span className="pww-veil">
          <svg viewBox="0 0 120 90" width="78" height="58" aria-hidden="true">
            <g className="pww-breathe">
              <g stroke="#0D0D0D" strokeWidth="2.5">
                <rect x="6" y="44" width="19" height="20" rx="2" fill="#1EC8B0"/>
                <rect x="95" y="44" width="19" height="20" rx="2" fill="#1EC8B0"/>
                <line x1="15.5" y1="44" x2="15.5" y2="64"/><line x1="104.5" y1="44" x2="104.5" y2="64"/>
                <line x1="25" y1="54" x2="38" y2="54"/><line x1="95" y1="54" x2="82" y2="54"/>
              </g>
              <circle cx="60" cy="56" r="30" fill="#FDFCF7" stroke="#0D0D0D" strokeWidth="3"/>
              <line x1="60" y1="26" x2="60" y2="13" stroke="#0D0D0D" strokeWidth="3"/>
              <circle cx="60" cy="10" r="5" fill="#FFC72C" stroke="#0D0D0D" strokeWidth="2.5"/>
              <path d="M44 52 Q60 44 76 52" fill="none" stroke="#0D0D0D" strokeWidth="3" strokeLinecap="round"/>
              <ellipse cx="62" cy="58" rx="13" ry="9" fill="#0D0D0D"/>
              <circle cx="64" cy="58" r="5.5" fill="#FFC72C"/>
              <circle cx="65.5" cy="56.5" r="1.8" fill="#fff"/>
              <path d="M49 52 Q62 49 75 53" fill="#FDFCF7"/>
              <path d="M49 52 Q62 49 75 53" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M52 72 Q60 78 68 72" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M74 64 L104 86 L84 88 Z" fill="#FFD884" opacity=".5"/>
            </g>
          </svg>
        </span>
      </div>

      {/* BODY */}
      <div className="pww-body">
        <h2 className="pww-title pww-anton">{_t(lang,<>Vois ta plage<br/><em>7 jours d'avance</em></>,<>See your beach<br/><em>7 days ahead</em></>,<>Ve tu playa<br/><em>7 días antes</em></>)}</h2>
        <p className="pww-sub">{_t(lang,<>Le gratuit te dit <b>aujourd'hui</b>. Le Veilleur te montre toute ta semaine — et t'alerte le jour où ça bascule.</>,<>Free tells you <b>today</b>. The Watcher shows you your whole week — and alerts you the day it flips.</>,<>Lo gratis te dice <b>hoy</b>. El Vigía te muestra toda tu semana — y te avisa el día que cambia.</>)}</p>

        {/* APERÇU PRÉVISION 7 JOURS — illustratif (Auj/Dem verts, J+2…J+6 verrouillés) */}
        <div className="pww-fcast" aria-label={_t(lang,"Aperçu de la prévision 7 jours","7-day forecast preview","Vista previa pronóstico 7 días")}>
          <div className="pww-fcast-top">
            <span className="ttl pww-anton">{_t(lang,"Ta prévision · 7 jours","Your forecast · 7 days","Tu pronóstico · 7 días")}</span>
            {ctxLoc&&<span className="loc">{ctxLoc}</span>}
          </div>
          <svg className="pww-fcast-curve" viewBox="0 0 340 64" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="pwwCv" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#22C55E"/><stop offset=".34" stopColor="#22C55E"/>
                <stop offset=".5" stopColor="#FFC72C"/><stop offset=".72" stopColor="#E8522A"/><stop offset="1" stopColor="#FFC72C"/>
              </linearGradient>
              <linearGradient id="pwwCvf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFD884" stopOpacity=".34"/><stop offset="1" stopColor="#FFD884" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 44 C40 42 60 40 97 40 C140 39 150 24 194 22 C235 20 250 8 292 14 C320 18 330 26 340 30 L340 64 L0 64 Z" fill="url(#pwwCvf)"/>
            <path d="M0 44 C40 42 60 40 97 40 C140 39 150 24 194 22 C235 20 250 8 292 14 C320 18 330 26 340 30" fill="none" stroke="url(#pwwCv)" strokeWidth="3.5" strokeLinecap="round"/>
          </svg>
          <div className="pww-days">
            <span className="pww-lockdiv"></span>
            {previewDots.map((st,i)=>(
              <div key={i} className={"pww-day"+(i>=2?" lock":"")}>
                <span className="ddn">{dn(i)}</span>
                <span className={"ddot "+st}></span>
                <span className="dvd">{i<2?_t(lang,"Net","Clear","Limpio"):<Lock s={9}/>}</span>
              </div>
            ))}
          </div>
          <div className="pww-lockbar"><Lock s={13}/><b>{_t(lang,"Débloque les 5 jours suivants","Unlock the next 5 days","Desbloquea los 5 días siguientes")}</b></div>
        </div>

        {/* 3 PERKS */}
        <div className="pww-perks">
          <div className="pww-perk a">
            <span className="pic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#0D0D0D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 9V2M12 2 9.5 4.5M12 2l2.5 2.5"/><path d="M2 18h2M20 18h2M4.5 11.5 6 13M19.5 11.5 18 13M1 22h22"/></svg></span>
            <span><b>{_t(lang,"Ton brief chaque matin · 7h","Your brief every morning · 7am","Tu resumen cada mañana · 7h")}</b><em>{_t(lang,"Ta meilleure plage du jour, prête avant ton café.","Your best beach of the day, ready before your coffee.","Tu mejor playa del día, lista antes de tu café.")}</em></span>
          </div>
          <div className="pww-perk b">
            <span className="pic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#0D0D0D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg></span>
            <span><b>{_t(lang,"Alerte le jour où ça bascule","Alert the day it flips","Alerta el día que cambia")}</b><em>{exSwitch?_t(lang,`Ta plage favorite change ? Va plutôt à ${exSwitch}.`,`Your favorite beach changes? Switch to ${exSwitch}.`,`¿Tu playa favorita cambia? Mejor ve a ${exSwitch}.`):_t(lang,"Ta plage favorite change ? Tu le sais avant d'y aller.","Your favorite beach changes? You know before you go.","¿Tu playa favorita cambia? Lo sabes antes de ir.")}</em></span>
          </div>
          <div className="pww-perk c">
            <span className="pic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#0D0D0D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/><path d="M7.5 14h3M13.5 14h3M7.5 18h3"/></svg></span>
            <span><b>{wkend?_t(lang,`Samedi : ${wkend.name}`,`Saturday: ${wkend.name}`,`El sábado: ${wkend.name}`):_t(lang,"Toute ta semaine, plage par plage","Your whole week, beach by beach","Toda tu semana, playa por playa")}</b><em>{_t(lang,"Cale ton weekend sur 7 jours vérifiés satellite.","Plan your weekend on 7 satellite-verified days.","Planifica tu finde con 7 días verificados por satélite.")}</em></span>
          </div>
        </div>

        {/* PREUVE */}
        {totalCount>0&&<div className="pww-proof"><span className="pls"></span>{cleanCount>0
          ?_t(lang,`${cleanCount}/${totalCount} plages propres en ce moment · satellite vérifié 4×/jour`,`${cleanCount}/${totalCount} beaches clean right now · satellite-checked 4×/day`,`${cleanCount}/${totalCount} playas limpias ahora · verificado por satélite 4×/día`)
          :_t(lang,`${totalCount} plages suivies · satellite vérifié 4×/jour`,`${totalCount} beaches tracked · satellite-checked 4×/day`,`${totalCount} playas seguidas · verificado por satélite 4×/día`)}</div>}

        {/* PLANS — masqués en mode capture : rien n'est facturé (la 2e étape offre 7 j
            contre l'email), donc afficher des prix serait du bait-and-switch + plombe le
            clic modal→CTA. Réversible avec tout le reste via ?pay_capture=0. */}
        {hasAnnual&&!captureMode&&<div className="pww-plans">
          {planBtn("monthly",_t(lang,"Pass 7 jours","7-day pass","Pase 7 días"),pMo,_t(lang,"7 j","7d","7d"),null,null)}
          {planBtn("annual",_t(lang,"Pass 30 jours","30-day pass","Pase 30 días"),pYr,_t(lang,"30 j","30d","30d"),"★",eqMo)}
        </div>}

        {/* CTA — en capture, framing GRATUIT (juste l'email, sans carte) = exactement ce
            que la 2e étape délivre, et lève la friction prix du goulot modal→CTA. */}
        <button type="button" className="pww-gobtn" onClick={()=>onStart()}>
          <span className="big pww-anton">{captureMode
            ?_t(lang,"Débloquer 7 jours — offert →","Unlock 7 days — on us →","Desbloquear 7 días — gratis →")
            :_t(lang,"Je veux la prévision →","I want the forecast →","Quiero el pronóstico →")}</span>
          <span className="s1">{captureMode
            ?_t(lang,"Juste ton email · sans carte","Just your email · no card","Solo tu email · sin tarjeta")
            :ctaSub}</span>
          {!captureMode&&perDay&&<span className="s2">{perDay}</span>}
        </button>

        {/* 3 RASSURANCES — en capture, on remplace les rassurances « paiement » (sécurisé /
            remboursé / annule) par les rassurances « gratuit » (offert / sans carte / sans
            engagement). Mêmes icônes, texte honnête vis-à-vis de ce qui se passe réellement. */}
        <div className="pww-trust">
          <div className="pww-tc"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg><b>{captureMode?_t(lang,"Offert","On us","Gratis"):PAY_LABEL}</b><em>{captureMode?_t(lang,"7 jours premium","7 days premium","7 días premium"):_t(lang,"Paiement sécurisé","Secure payment","Pago seguro")}</em></div>
          <div className="pww-tc"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="#009E8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg><b>{captureMode?_t(lang,"Sans carte","No card","Sin tarjeta"):_t(lang,"Paiement unique","One-time","Pago único")}</b><em>{captureMode?_t(lang,"juste ton email","just your email","solo tu email"):_t(lang,"Sans abonnement","No subscription","Sin suscripción")}</em></div>
          <div className="pww-tc"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg><b>{captureMode?_t(lang,"Sans engagement","No strings","Sin compromiso"):_t(lang,"2 clics","2 clicks","2 clics")}</b><em>{captureMode?_t(lang,"stop quand tu veux","stop anytime","para cuando quieras"):_t(lang,"Annule quand tu veux","Cancel anytime","Cancela cuando quieras")}</em></div>
        </div>

        {/* Garantie « satisfait ou remboursé » RETIRÉE (décision 2026-06-29) : modèle pass
            one-time, accès numérique consommé immédiatement → pas de garantie de remboursement
            volontaire. Réassurance honnête portée par le CTA + les 3 badges ci-dessus. */}

        {/* A/B pw_season : alternative pass saison (cash d'avance, zéro churn) */}
        {onSeason&&<button type="button" className="pww-season-alt" onClick={onSeason}>
          <span style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
            <b style={{fontSize:13.5,color:"#0D0D0D",fontWeight:800}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:"-2px",marginRight:3}}><path d="M12 5v2M6 11l1 1M2 18h20M18 11l-1 1M8.5 18a3.5 3.5 0 0 1 7 0"/></svg>{_t(lang,"Plutôt un pass saison ?","Prefer a season pass?","¿Mejor un pase de temporada?")}</b>
            <em style={{fontSize:11.5,color:"#5A5A5A",fontStyle:"normal"}}>{_t(lang,"24,99 € une fois · toute la saison · sans abonnement","€24.99 once · all season · no subscription","24,99 € una vez · toda la temporada · sin suscripción")}</em>
          </span>
          <span style={{fontSize:18,fontWeight:800,color:"#0D0D0D",flexShrink:0}}>→</span>
        </button>}

        {/* LIENS SECONDAIRES */}
        <div className="pww-links">
          <button type="button" className="pww-link" onClick={onAlready}>{_t(lang,"J'ai déjà un pass","I already have a pass","Ya tengo un pase")}</button>
          {onB2B&&<button type="button" className="pww-link b2b" onClick={onB2B}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:"-2px",marginRight:4}}><rect x="6" y="3" width="12" height="18" rx="1"/><path d="M10.5 21v-3h3v3"/></svg>{_t(lang,"Hôtel ou collectivité ? →","Hotel or town? →","¿Hotel o municipio? →")}</button>}
        </div>

        <div className="pww-secure"><Lock s={11}/>{captureMode
          ?_t(lang,"Accès offert le temps qu'on rouvre · sans carte","Free access while we reopen · no card","Acceso gratis mientras reabrimos · sin tarjeta")
          :_t(lang,"Paiement sécurisé "+PAY_LABEL+" · Sans engagement","Secure "+PAY_LABEL+" payment · No commitment","Pago seguro "+PAY_LABEL+" · Sin compromiso")}</div>
      </div>
    </div>
  </>)
}

// ── ComicPaywall — skin BD du paywall (A/B pw_comic). PRODUCT.md §6 / pivot 19/06.
// PUREMENT VISUEL : reçoit toutes les portes (onStart=startCheckout, onAlready, onClose,
// plan/setPlan/effectivePlan) du PremiumModal parent → ZÉRO logique de paiement ici.
// Tokens .lc- (paper/ink/yel) + scène golden-hour + cases BD, miroir de ChasseDetail.
// Asset validé : design/proto-paywall-comic.html (vérifié navigateur 2026-06-19).
function ComicPaywall({lang,beach,topName,topScore,exSwitch,wkend,ctxName,ctxStatus,cleanCount,totalCount,recordProof,allCalm,pwCalm,seasonMsg,plan,setPlan,effectivePlan,hasAnnual,onStart,onAlready,onClose,onB2B,onSeason,captureMode}){
  const ST=ctxStatus||(beach&&beach.status)||null
  const stCls=ST==="avoid"?"bad":ST==="moderate"?"mod":"ok"
  const iris=ST==="avoid"?"#e8322a":ST==="moderate"?"#ffd23f":"#27c46b"
  const vLbl=ST==="avoid"?_t(lang,"à éviter","avoid","evitar"):ST==="moderate"?_t(lang,"à surveiller","watch it","a vigilar"):_t(lang,"propre","clean","limpia")
  const ctx=ctxName||topName
  const best=topName
  // Pivot saison-calme (A/B pw_calm, calculé dans PremiumModal) : en mer calme (≥80%
  // propre, ~64% du temps) la promesse de PEUR « avant que ta plage tourne » contredit
  // l'observation → dissonance → pas de clic. On bascule vers la value-prop POSITIVE que
  // le gratuit n'a PAS (la prévision DEMAIN). Honnête : on n'invente aucun danger.
  const calm=pwCalm&&allCalm===true
  // prix (mêmes expressions que le toggle classique — aucune divergence)
  const pMo=REGION_PAY?PRICE_MO:(lang==="en"?"€4.99":"4,99 €")
  const pYr=REGION_PAY?PRICE_YR:(lang==="en"?"€49":"49 €")
  const eqMo=(()=>{const raw=REGION_PAY?PRICE_YR:"49";const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."));if(!n)return null;const sym=(String(raw).match(/[€$£]/)||["€"])[0];const e=(n/12).toFixed(2).replace(".",lang==="fr"?",":".");return _t(lang,`soit ${e} ${sym}/mois`,`${sym}${e}/mo`,`${sym}${e}/mes`)})()
  // Ancrage prix « par jour » dérivé du prix réellement présélectionné (annuel si
  // dispo, sinon mensuel) — recalculé depuis les MÊMES strings que le toggle, zéro
  // hardcode devise. « moins qu'un café » = ancrage de référence quotidien.
  const perDay=(()=>{
    const useYr=effectivePlan==="annual"
    const raw=useYr?(REGION_PAY?PRICE_YR:"49"):(REGION_PAY?PRICE_MO:"4.99")
    const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."));if(!n)return null
    const sym=(String(raw).match(/[€$£]/)||["€"])[0]
    const per=(n/(useYr?365:30))
    const d=(per<1?per.toFixed(2):per.toFixed(2)).replace(".",lang==="fr"?",":".")
    return _t(lang,`soit ${d} ${sym}/jour · moins qu'un café`,`just ${sym}${d}/day · less than a coffee`,`solo ${sym}${d}/día · menos que un café`)
  })()
  const ctaSub=NO_TRIAL
    ?_t(lang,`${effectivePlan==="annual"?pYr+"/an":pMo+"/mois"} · annulable en 2 clics`,`${effectivePlan==="annual"?pYr+"/yr":pMo+"/mo"} · cancel anytime`,`${effectivePlan==="annual"?pYr+"/año":pMo+"/mes"} · cancela cuando quieras`)
    :_t(lang,"7 jours offerts, puis "+(effectivePlan==="annual"?pYr+"/an":pMo+"/mois"),"7 days free, then "+(effectivePlan==="annual"?pYr+"/yr":pMo+"/mo"),"7 días gratis, luego "+(effectivePlan==="annual"?pYr+"/año":pMo+"/mes"))
  const panel=(num,gold,kicker,line,meta)=>(
    <div className={"pwx-panel"+(gold?" gold":"")}>
      <span className="pwx-num">{num}</span>
      <span className="pwx-pc">
        <span className="pwx-kick">{kicker}</span>
        <span className="pwx-line">{line}</span>
        {meta&&<span className="pwx-meta">{meta}</span>}
      </span>
    </div>
  )
  const planBtn=(key,label,price,unit,badge,eq)=>(
    <button type="button" onClick={()=>{setPlan(key);try{track("sg_plan_toggle",{plan:key,skin:"comic"})}catch(_){}}}
      className={"pwx-plan"+(plan===key?" on":"")}>
      {badge&&<span className="pwx-badge">{badge}</span>}
      <b>{label}</b><span className="pwx-pr">{price}<small>/{unit}</small></span>
      {eq&&<span className="pwx-eq">{eq}</span>}
    </button>
  )
  return(<>
    <style>{`
      .pwx-wrap{--ink:#0d0b14;--paper:#fdf6e3;--red:#e8322a;--yel:#ffd23f;--org:#ff8a3d;--grn:#27c46b;--punch:cubic-bezier(.34,1.56,.64,1);
        font-family:"Bricolage Grotesque",system-ui,sans-serif;color:var(--ink);margin:-28px -24px -20px;position:relative}
      .pwx-hero{position:relative;height:188px;border-bottom:3px solid var(--ink);overflow:hidden}
      .pwx-hero>svg.sc{position:absolute;inset:0;width:100%;height:100%}
      .pwx-veil{position:absolute;left:50%;top:46%;transform:translate(-50%,-58%);z-index:2;filter:drop-shadow(2px 4px 0 rgba(13,11,20,.4))}
      .pwx-eyebrow{position:absolute;left:12px;top:14px;z-index:3;font-family:"AntonLC","Anton",system-ui,sans-serif;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--ink);background:var(--yel);border:2px solid var(--ink);padding:3px 9px;border-radius:5px;box-shadow:2px 2px 0 var(--ink)}
      .pwx-verdict{position:absolute;left:12px;bottom:10px;z-index:3;font-family:"AntonLC","Anton",system-ui,sans-serif;font-size:12px;color:#fff;border:2.5px solid var(--ink);border-radius:9px;padding:4px 11px;box-shadow:3px 3px 0 var(--ink);transform:rotate(-1.5deg)}
      .pwx-verdict.ok{background:var(--grn)}.pwx-verdict.mod{background:var(--org)}.pwx-verdict.bad{background:var(--red)}
      .pwx-season{position:absolute;right:12px;bottom:10px;z-index:3;font-size:10px;font-weight:800;color:#fff;background:rgba(13,11,20,.7);border:2px solid #fff;border-radius:14px;padding:3px 9px;letter-spacing:.3px}
      .pwx-body{padding:16px 22px 14px}
      @keyframes pwxChroma{0%{text-shadow:-1.5px 0 rgba(255,0,92,.55),1.6px 0 rgba(0,214,255,.55),2px 2px 0 #fff}100%{text-shadow:-2.6px .5px rgba(255,0,92,.6),2.6px -.5px rgba(0,214,255,.6),2px 2px 0 #fff}}
      /* BD motion (one-shot, opt-in @media no-preference) — w028yid5c */
      @keyframes pwxSlamFrame{from{opacity:0;transform:translateY(-10px) scale(.985)}60%{opacity:1;transform:translateY(2px) scale(1.004)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes pwxRise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pwxVeilDrop{from{opacity:0;transform:translate(-50%,-72%)}to{opacity:1;transform:translate(-50%,-58%)}}
      @keyframes pwxStamp{0%{clip-path:inset(0 100% 0 0);transform:rotate(-1.5deg) scale(.94)}70%{clip-path:inset(0 0 0 0);transform:rotate(-1.5deg) scale(1.06)}100%{clip-path:inset(0 0 0 0);transform:rotate(-1.5deg) scale(1)}}
      @keyframes pwxCtaIn{from{opacity:0;transform:translateY(12px) rotate(-.8deg)}to{opacity:1;transform:translateY(0) rotate(-.8deg)}}
      @keyframes pwxInkOdd{0%{opacity:0;transform:translateY(14px) scale(.94) rotate(-3deg);clip-path:inset(0 100% 0 0)}55%{opacity:1}80%{transform:translateY(0) scale(1) rotate(-1.4deg);clip-path:inset(0 0 0 0)}100%{opacity:1;transform:translateY(0) scale(1) rotate(-.7deg);clip-path:inset(0 0 0 0)}}
      @keyframes pwxInkEven{0%{opacity:0;transform:translateY(14px) scale(.94) rotate(3deg);clip-path:inset(0 100% 0 0)}55%{opacity:1}80%{transform:translateY(0) scale(1) rotate(1.4deg);clip-path:inset(0 0 0 0)}100%{opacity:1;transform:translateY(0) scale(1) rotate(.7deg);clip-path:inset(0 0 0 0)}}
      @keyframes pwxIrisVeil{0%{opacity:1}100%{opacity:0}}
      @keyframes pwxPow{0%{opacity:0;transform:scale(0) rotate(-12deg)}45%{opacity:1;transform:scale(1.15) rotate(2deg)}70%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(1.04) rotate(0)}}
      .pwx-iris-veil{opacity:0}
      .pwx-title{font-family:"AntonLC","Anton",system-ui,sans-serif;font-size:26px;line-height:1.03;margin:6px 0 8px;color:var(--ink);text-shadow:2px 2px 0 #fff;animation:pwxChroma 1.6s steps(3) 6 alternate}
      .pwx-title em{font-style:normal;color:var(--red)}
      .pwx-sub{font-size:13.5px;font-weight:700;color:#0d2330;margin:0 0 15px;line-height:1.35}
      .pwx-panel{position:relative;display:flex;align-items:center;gap:13px;background:var(--paper);border:2.5px solid var(--ink);border-radius:14px;padding:12px 14px;margin-bottom:11px;box-shadow:4px 4px 0 var(--ink)}
      .pwx-panel:nth-child(odd){transform:rotate(-.7deg)}.pwx-panel:nth-child(even){transform:rotate(.7deg)}
      .pwx-panel.gold{background:linear-gradient(180deg,#fff6d6,#ffe9a6)}
      .pwx-num{flex:0 0 auto;width:38px;text-align:center;font-family:"AntonLC","Anton",system-ui,sans-serif;font-size:30px;line-height:1;color:var(--ink);text-shadow:2px 2px 0 var(--yel)}
      .pwx-panel.gold .pwx-num{text-shadow:2px 2px 0 var(--org)}
      .pwx-pc{flex:1;min-width:0}
      .pwx-kick{display:block;font-size:9.5px;font-weight:800;letter-spacing:.08em;color:#9a5b12;margin-bottom:3px;text-transform:uppercase}
      .pwx-line{display:block;font-size:14.5px;font-weight:800;color:var(--ink);line-height:1.2}
      .pwx-meta{display:block;font-size:11.5px;font-weight:700;color:#5a5566;margin-top:3px}
      .pwx-proof{text-align:center;font-size:11.5px;font-weight:700;color:#0d2330;margin:4px 0 14px;opacity:.85}
      .pwx-record{display:flex;align-items:center;gap:9px;margin:6px 0 14px;padding:9px 12px;border-radius:12px;background:#fdf6e3;border:2.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}
      .pwx-record .pwx-rdot{color:var(--grn);font-size:11px;flex:0 0 auto;filter:drop-shadow(0 0 3px rgba(39,196,107,.7))}
      .pwx-record b{display:block;font-size:11.5px;font-weight:800;color:var(--ink);line-height:1.25}
      .pwx-record em{display:block;font-style:normal;font-size:10.5px;font-weight:700;color:#1f3a28;margin-top:2px}
      .pwx-perday{text-align:center;font-size:11.5px;font-weight:800;color:var(--yel);margin-top:9px;letter-spacing:.2px}
      .pwx-act{margin:2px -22px 0;padding:16px 22px 22px;background:linear-gradient(180deg,rgba(13,11,20,0),rgba(13,11,20,.06) 8%,#0d0b14 26%);border-radius:18px 18px 0 0}
      .pwx-plans{display:flex;gap:9px;margin-bottom:13px}
      .pwx-plan{flex:1;border:2.5px solid var(--ink);border-radius:12px;padding:10px 8px;cursor:pointer;position:relative;background:var(--paper);color:var(--ink);box-shadow:2px 2px 0 var(--ink);font-family:inherit;forced-color-adjust:none;transition:transform .1s,box-shadow .1s}
      .pwx-plan.on{background:linear-gradient(180deg,#ffe07a,var(--yel));box-shadow:0 4px 0 var(--ink)}
      .pwx-plan b{display:block;font-size:13px;font-weight:800}
      .pwx-plan .pwx-pr{display:block;font-family:"AntonLC","Anton",system-ui,sans-serif;font-size:19px;margin-top:2px;letter-spacing:.3px}
      .pwx-plan .pwx-pr small{font-size:11px;font-weight:400;font-family:"Bricolage Grotesque",system-ui,sans-serif}
      .pwx-plan .pwx-eq{display:block;font-size:9px;font-weight:700;color:#7a6a2a;margin-top:1px}
      .pwx-badge{position:absolute;top:-9px;right:7px;background:var(--red);color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:100px;border:2px solid var(--ink)}
      .pwx-cta{display:block;width:100%;border:2.5px solid var(--ink);border-radius:14px;padding:15px 18px;cursor:pointer;font-family:"AntonLC","Anton",system-ui,sans-serif;letter-spacing:.5px;text-transform:uppercase;text-align:center;background:linear-gradient(180deg,#ffe07a,var(--yel));color:var(--ink);box-shadow:0 5px 0 var(--ink),0 11px 20px rgba(13,11,20,.4);transform:rotate(-.8deg);forced-color-adjust:none;position:relative;overflow:visible;transition:transform .14s var(--punch),box-shadow .14s ease}
      @media(hover:hover){.pwx-cta:hover{transform:rotate(0deg) translateY(-2px);box-shadow:0 7px 0 var(--ink),0 14px 24px rgba(13,11,20,.45)}}
      .pwx-cta:active{transform:rotate(-.8deg) translateY(5px);box-shadow:0 1px 0 var(--ink);transition:transform .09s ease-out}
      .pwx-pow{position:absolute;left:50%;top:50%;width:130px;height:130px;margin:-65px 0 0 -65px;pointer-events:none;z-index:5;opacity:0;transform:scale(0) rotate(-12deg)}
      .pwx-cta.pow .pwx-pow{animation:pwxPow .42s var(--punch) both;will-change:transform,opacity}
      .pwx-cta .big{display:block;font-size:18px;line-height:1.05}
      .pwx-cta .sm{display:block;font-family:"Bricolage Grotesque",system-ui,sans-serif;font-size:12px;font-weight:700;text-transform:none;opacity:.82;margin-top:4px}
      .pwx-trust{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:14px}
      .pwx-tc{background:var(--paper);border:2.5px solid var(--ink);border-radius:11px;padding:9px 6px;text-align:center;box-shadow:2px 2px 0 var(--ink)}
      .pwx-tc .ic{font-size:17px}.pwx-tc b{display:block;font-size:10.5px;color:var(--ink);margin-top:2px}
      .pwx-tc em{display:block;font-style:normal;font-size:9px;color:#5a5566;font-weight:700;line-height:1.25;margin-top:1px}
      .pwx-guar{display:flex;align-items:center;gap:11px;margin-top:13px;padding:11px 13px;border-radius:13px;background:#fdf6e3;border:2.5px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}
      .pwx-guar .gic{font-size:19px}.pwx-guar b{display:block;font-size:12.5px;color:var(--ink)}
      .pwx-guar em{display:block;font-style:normal;font-size:11px;color:#1f3a28;font-weight:700;margin-top:1px}
      .pwx-foot{display:block;width:100%;margin-top:11px;background:none;border:none;color:#fff;font-weight:800;font-size:12.5px;text-decoration:underline;cursor:pointer;font-family:inherit;opacity:.9}
      .pwx-secure{text-align:center;font-size:10px;color:rgba(255,255,255,.7);font-weight:700;margin-top:9px}
      @media(prefers-reduced-motion:no-preference){
        .pwx-hero{animation:pwxSlamFrame .42s var(--punch) both;will-change:transform}
        .pwx-veil{animation:pwxVeilDrop .42s var(--punch) .05s both}
        .pwx-verdict{animation:pwxStamp .42s cubic-bezier(.34,1.4,.64,1) .1s both;will-change:clip-path,transform}
        .pwx-title{animation:pwxRise .3s ease-out .12s both,pwxChroma 1.6s steps(3) 6 alternate .55s}
        .pwx-sub{animation:pwxRise .3s ease-out .18s both}
        .pwx-panel{animation:pwxInkOdd .34s var(--punch) both;will-change:transform,clip-path}
        .pwx-panel:nth-child(3){animation-delay:.26s}
        .pwx-panel:nth-child(4){animation-delay:.345s;animation-name:pwxInkEven}
        .pwx-panel:nth-child(5){animation-delay:.43s}
        .pwx-iris-veil{animation:pwxIrisVeil .5s ease-out .12s both}
        .pwx-act{animation:pwxRise .34s var(--punch) .5s both}
        .pwx-cta{animation:pwxCtaIn .34s var(--punch) .56s both}
      }
      @media(prefers-reduced-motion:reduce){.pwx-title{animation:none;text-shadow:2px 2px 0 #fff}.pwx-plan{transition:none}.pwx-cta{transition:none}.pwx-pow{display:none}}
    `}</style>
    <div className="pwx-wrap">
      <div className="pwx-hero">
        <svg className="sc" viewBox="0 0 430 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs><linearGradient id="pwxSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2e1a5e"/><stop offset=".5" stopColor="#6a2f9e"/>
            <stop offset=".78" stopColor="#ffb267"/><stop offset="1" stopColor="#ff8a3d"/></linearGradient></defs>
          <rect width="430" height="200" fill="url(#pwxSky)"/>
          <circle cx="330" cy="120" r="46" fill="#ffe08a" opacity=".5"/>
          <circle cx="330" cy="120" r="28" fill="#fff2c4"/>
          <g stroke="#fff" strokeOpacity=".28" strokeWidth="1.6"><line x1="20" y1="36" x2="120" y2="31"/><line x1="14" y1="54" x2="96" y2="50"/></g>
          <path d="M0 138 H430 V200 H0 Z" fill="#3e2470"/>
          <path d="M0 138 q110 -10 215 0 t215 0 V160 H0 Z" fill="#3e2470" opacity=".6"/>
          <path d="M0 176 Q215 168 430 182 V200 H0 Z" fill="#f3d9a3"/>
          <path d="M0 176 Q215 168 430 182" fill="none" stroke="#0d0b14" strokeWidth="1.6"/>
        </svg>
        <span className="pwx-veil">
          <svg viewBox="0 0 120 120" width="72" height="72" aria-hidden="true">
            <g stroke="#0d0b14" strokeWidth="2.5">
              <rect x="6" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/>
              <rect x="94" y="50" width="20" height="22" rx="2" fill="#5b3a8e"/>
              <line x1="26" y1="61" x2="40" y2="61"/><line x1="94" y1="61" x2="80" y2="61"/>
            </g>
            <circle cx="60" cy="62" r="34" fill="#fdf6e3" stroke="#0d0b14" strokeWidth="3"/>
            <line x1="60" y1="28" x2="60" y2="14" stroke="#0d0b14" strokeWidth="3"/>
            <circle cx="60" cy="11" r="5" fill="#ffd23f" stroke="#0d0b14" strokeWidth="2.5"/>
            <circle cx="60" cy="62" r="20" fill="#0d0b14"/>
            <circle cx="60" cy="62" r="14" fill={iris}/>
            <circle className="pwx-iris-veil" cx="60" cy="62" r="14" fill="#cfc7d8"/>
            <circle cx="60" cy="62" r="6" fill="#0d0b14"/>
            <circle cx="64" cy="58" r="2.5" fill="#fff"/>
            <path d="M44 40 Q60 34 76 40" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
            <path d="M50 86 Q60 92 70 86" fill="none" stroke="#0d0b14" strokeWidth="3" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="pwx-eyebrow">{_t(lang,"Le Veilleur — Pass","The Watcher — Pass","El Vigía — Pase")}</span>
        {ctx&&<span className={"pwx-verdict "+stCls}>{ctx}{ST?" · "+vLbl:""}</span>}
      </div>
      <div className="pwx-body">
        <h2 className="pwx-title">{calm
          ?_t(lang,<>Sache où sera la mer <em>demain</em><br/>pas juste aujourd'hui</>,<>Know where the sea will be <em>tomorrow</em><br/>not just today</>,<>Sabe dónde estará el mar <em>mañana</em><br/>no solo hoy</>)
          :_t(lang,<>Sois <em>prévenu</em><br/>avant que ta plage tourne</>,<>Know <em>before</em><br/>your beach turns</>,<>Entérate <em>antes</em><br/>de que tu playa cambie</>)}</h2>
        <p className="pwx-sub">{calm
          ?_t(lang,<>Le gratuit te montre aujourd'hui. Le Veilleur te montre les <b>7 prochains jours</b> — et t'écrit le matin où ça vaut le détour.</>,<>Free shows you today. The Watcher shows you the <b>next 7 days</b> — and emails you the morning it's worth the trip.</>,<>Lo gratis te muestra hoy. El Vigía te muestra los <b>próximos 7 días</b> — y te avisa la mañana que vale la pena.</>)
          :_t(lang,<>Le gratuit te dit aujourd'hui. Le Veilleur te dit <b>demain</b> — et t'alerte le jour où ça bascule.</>,<>Free tells you today. The Watcher tells you <b>tomorrow</b> — and alerts you the day it flips.</>,<>Lo gratis te dice hoy. El Vigía te dice <b>mañana</b> — y te avisa el día que cambia.</>)}</p>

        {panel("01",true,_t(lang,"Chaque matin · 7h","Every morning · 7am","Cada mañana · 7am"),
          best?_t(lang,`Ta meilleure plage : ${best}`,`Your best beach: ${best}`,`Tu mejor playa: ${best}`):_t(lang,"Ta meilleure plage du jour","Your best beach today","Tu mejor playa de hoy"),
          topScore?_t(lang,`Score ${topScore}/100 · vérifié satellite`,`Score ${topScore}/100 · satellite-verified`,`Score ${topScore}/100 · verificado satélite`):_t(lang,"Vérifié au satellite","Satellite-verified","Verificado por satélite"))}
        {calm
          ?panel("02",false,_t(lang,"Quand ça change","When it changes","Cuando cambia"),
            _t(lang,"Tes plages favorites, surveillées","Your saved beaches, watched","Tus playas favoritas, vigiladas"),
            _t(lang,"Le jour où une bascule, tu le sais avant de partir","The day one flips, you know before you go","El día que una cambia, lo sabes antes de salir"))
          :panel("02",false,_t(lang,"Alerte instantanée","Instant alert","Alerta instantánea"),
            _t(lang,"Ta plage favorite a changé","Your saved beach just changed","Tu playa favorita cambió"),
            exSwitch?_t(lang,`Propre → Modéré — va plutôt à ${exSwitch}`,`Clean → Moderate — switch to ${exSwitch}`,`Limpia → Moderada — mejor ve a ${exSwitch}`):_t(lang,"Propre → Modéré, on te prévient","Clean → Moderate, you're warned","Limpia → Moderada, te avisamos"))}
        {panel("03",false,_t(lang,"Le weekend","Weekend forecast","El fin de semana"),
          wkend?_t(lang,`Samedi : ${wkend.name}`,`Saturday: ${wkend.name}`,`El sábado: ${wkend.name}`):_t(lang,"Samedi : ta meilleure plage","Saturday: your top beach","El sábado: tu mejor playa"),
          wkend?(wkend.allClean?_t(lang,`Propre tout le weekend${wkend.kids?" · idéal enfants":""}`,`Clean all weekend${wkend.kids?" · great for kids":""}`,`Limpia todo el finde${wkend.kids?" · ideal niños":""}`):_t(lang,"Calculé depuis la prévision 7 jours","From the 7-day forecast","Según el pronóstico de 7 días")):_t(lang,"Calculé depuis la prévision 7 jours","From the 7-day forecast","Según el pronóstico de 7 días"))}

        {/* Preuve au point de décision : le PALMARÈS auditable (note + volume +
            registre public) > snapshot du jour. « mesuré au satellite, pas deviné ». */}
        {recordProof
          ?<div className="pwx-record"><span className="pwx-rdot">●</span><span><b>{recordProof}</b><em>{_t(lang,"La seule carte qui publie aussi ses erreurs.","The only map that also publishes its misses.","El único mapa que también publica sus errores.")}</em></span></div>
          :totalCount>0&&<div className="pwx-proof">{cleanCount>0
            ?_t(lang,`${cleanCount}/${totalCount} plages propres en ce moment · satellite 4×/jour`,`${cleanCount}/${totalCount} beaches clean right now · satellite 4×/day`,`${cleanCount}/${totalCount} playas limpias ahora · satélite 4×/día`)
            :_t(lang,`${totalCount} plages suivies · satellite 4×/jour · prévision 7 jours`,`${totalCount} beaches tracked · satellite 4×/day · 7-day forecast`,`${totalCount} playas · satélite 4×/día · pronóstico 7 días`)}</div>}

        <div className="pwx-act">
          {hasAnnual&&!captureMode&&<div className="pwx-plans">
            {planBtn("monthly",_t(lang,"Mensuel","Monthly","Mensual"),pMo,_t(lang,"mois","mo","mes"),null,null)}
            {planBtn("annual",_t(lang,"Annuel","Annual","Anual"),pYr,_t(lang,"an","yr","año"),"-33%",eqMo)}
          </div>}
          <button type="button" className="pwx-cta"
            onClick={e=>{const b=e.currentTarget;b.classList.remove("pow");void b.offsetWidth;b.classList.add("pow");onStart(e)}}
            onAnimationEnd={e=>{if(e.animationName==="pwxPow")e.currentTarget.classList.remove("pow")}}>
            <span className="big">{captureMode
              ?_t(lang,"Débloquer 7 jours — offert →","Unlock 7 days — on us →","Desbloquear 7 días — gratis →")
              :_t(lang,"Je veux la prévision →","I want the forecast →","Quiero el pronóstico →")}</span>
            <span className="sm">{captureMode
              ?_t(lang,"Juste ton email · sans carte","Just your email · no card","Solo tu email · sin tarjeta")
              :ctaSub}</span>
            <svg className="pwx-pow" viewBox="0 0 130 130" aria-hidden="true">
              <polygon points="65,4 76,40 112,30 86,58 122,72 84,74 96,112 65,86 34,112 46,74 8,72 44,58 18,30 54,40" fill="var(--yel)" stroke="#0d0b14" strokeWidth="3" strokeLinejoin="round"/>
              <g fill="#0d0b14"><circle cx="91" cy="65" r="2.4"/><circle cx="83.4" cy="83.4" r="2.4"/><circle cx="65" cy="91" r="2.4"/><circle cx="46.6" cy="83.4" r="2.4"/><circle cx="39" cy="65" r="2.4"/><circle cx="46.6" cy="46.6" r="2.4"/><circle cx="65" cy="39" r="2.4"/><circle cx="83.4" cy="46.6" r="2.4"/></g>
            </svg>
          </button>
          {!captureMode&&perDay&&<div className="pwx-perday">{perDay}</div>}
          <div className="pwx-trust">
            <div className="pwx-tc"><span className="ic">{captureMode?"🎁":"🛡"}</span><b>{captureMode?_t(lang,"Offert","On us","Gratis"):(PAY_PROVIDER==="mollie"?"Mollie":"Stripe")}</b><em>{captureMode?_t(lang,"7 jours premium","7 days premium","7 días premium"):_t(lang,"Paiement sécurisé","Secure payment","Pago seguro")}</em></div>
            <div className="pwx-tc"><span className="ic">{captureMode?"✉️":"⏱"}</span><b>{captureMode?_t(lang,"Sans carte","No card","Sin tarjeta"):_t(lang,"Paiement unique","One-time","Pago único")}</b><em>{captureMode?_t(lang,"juste ton email","just your email","solo tu email"):_t(lang,"Sans abonnement","No subscription","Sin suscripción")}</em></div>
            <div className="pwx-tc"><span className="ic">✕</span><b>{captureMode?_t(lang,"Sans engagement","No strings","Sin compromiso"):_t(lang,"2 clics","2 clicks","2 clics")}</b><em>{captureMode?_t(lang,"stop quand tu veux","stop anytime","para cuando quieras"):_t(lang,"Annule quand tu veux","Cancel anytime","Cancela cuando quieras")}</em></div>
          </div>
          {/* Garantie « satisfait ou remboursé » RETIRÉE (décision 2026-06-29) : pass one-time,
              accès numérique immédiat → pas de garantie de remboursement volontaire. */}
          {/* A/B pw_season : alternative pass saison 19,99 € (paiement unique 6 mois,
              sans abo) — cash d'avance, zéro churn. Chemin pay_once
              on-site existant (onSeason → passCtxRef + payStep). Réversible ?pwseason=0. */}
          {onSeason&&<button type="button" onClick={onSeason} style={{display:"block",width:"100%",marginTop:12,padding:"11px 13px",borderRadius:12,cursor:"pointer",border:"1.5px dashed rgba(13,11,20,.34)",background:"rgba(13,11,20,.04)",fontFamily:"inherit",textAlign:"left"}}>
            <span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <span style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
                <b style={{fontSize:13.5,color:"#0d0b14",fontWeight:800}}>🌅 {_t(lang,"Plutôt un pass saison ?","Prefer a season pass?","¿Mejor un pase de temporada?")}</b>
                <em style={{fontSize:11.5,color:"rgba(13,11,20,.62)",fontStyle:"normal"}}>{_t(lang,"24,99 € une fois · toute la saison · sans abonnement","€24.99 once · all season · no subscription","24,99 € una vez · toda la temporada · sin suscripción")}</em>
              </span>
              <span style={{fontSize:18,fontWeight:800,color:"#0d0b14",flexShrink:0}}>→</span>
            </span>
          </button>}
          <button type="button" className="pwx-foot" onClick={onAlready}>{_t(lang,"J'ai déjà un pass","I already have a pass","Ya tengo un pase")}</button>
          {onB2B&&<button type="button" className="pwx-foot" style={{marginTop:7,opacity:.78,fontSize:11.5}} onClick={onB2B}>🏨 {_t(lang,"Hôtel ou collectivité ? →","Hotel or town? →","¿Hotel o municipio? →")}</button>}
          <div className="pwx-secure">🔒 {captureMode
            ?_t(lang,"Accès offert le temps qu'on rouvre · sans carte","Free access while we reopen · no card","Acceso gratis mientras reabrimos · sin tarjeta")
            :_t(lang,"Paiement sécurisé "+PAY_LABEL+" · Sans engagement","Secure "+PAY_LABEL+" payment · No commitment","Pago seguro "+PAY_LABEL+" · Sin compromiso")}</div>
        </div>
      </div>
    </div>
  </>)
}
function PremiumModal({onClose,lang,source,onActivated,sargData,island,beach}){
  const LL=T[lang]||T.fr
  // Capture B2B (hôtels/collectivités) — porte discrète vers le drip B2B existant.
  const [showB2B,setShowB2B]=useState(false)
  // ── Palmarès publié (« sell the track record, not the map ») ──────────────
  // Le moat = notre fiabilité auditable. On la fetch à l'OUVERTURE du paywall
  // (1 seul fetch, modal monté → pas de prop-threading dans le monolithe) et on
  // la surface au POINT DE DÉCISION (fuite #1 modal→CTA 2%) façon Airbnb : note
  // + volume + « public ». Honnêteté dure : on montre la fiabilité « mer propre »
  // PAR RÉGIME (le nombre fort qui ne s'auto-mutile jamais), JAMAIS le hit-rate
  // par plage (descend à 23% en saison calme = self-harm, cf reliability-badge).
  const[_trackRec,_setTrackRec]=useState(null)
  useEffect(()=>{let ok=true;fetch("/api/copernicus/track-record.json").then(r=>r.json()).then(d=>{if(ok)_setTrackRec(d)}).catch(()=>{});return()=>{ok=false}},[])
  const pwProof=(()=>{try{const q=window.location.search;if(/[?&]pwproof=1/.test(q))return true;if(/[?&]pwproof=0/.test(q))return false;return abVariant("pw_proof",["control","record"],[.5,.5])==="record"}catch(_){return false}})()
  // A/B preuve sociale (PassOffer) : badge communauté HONNÊTE (__COMM = plancher leads email).
  const pwSocial=(()=>{try{const q=window.location.search;if(/[?&]pwsocial=1/.test(q))return true;if(/[?&]pwsocial=0/.test(q))return false;return abVariant("pw_socialproof",["control","proof"],[.5,.5])==="proof"}catch(_){return false}})()
  // A/B fraîcheur (PassOffer) : "Données mises à jour il y a Xh" — récence réelle du pipeline.
  const pwFresh=(()=>{try{const q=window.location.search;if(/[?&]pwfresh=1/.test(q))return true;if(/[?&]pwfresh=0/.test(q))return false;return abVariant("pw_freshness",["control","fresh"],[.5,.5])==="fresh"}catch(_){return false}})()
  const _passUpdatedAt=sargData?.updatedAt||sargData?.erddapTimestamp||null
  // Régime au plus gros échantillon « mer propre » = nombre fort ET honnête.
  const _recordProof=(()=>{
    try{
      const r=_trackRec;if(!r||!r.byRegime)return null
      const best=Object.values(r.byRegime).filter(x=>x&&x.cleanSamples>0).sort((a,b)=>b.cleanSamples-a.cleanSamples)[0]
      if(!best||!best.cleanReliabilityPct)return null
      const pct=best.cleanReliabilityPct,nf=best.cleanSamples.toLocaleString(lang==="en"?"en-US":lang==="es"?"es-ES":"fr-FR")
      return _t(lang,
        `${pct}% justes · ${nf} prévisions « mer propre » vérifiées · registre public`,
        `${pct}% correct · ${nf} “clean water” forecasts satellite-checked · public record`,
        `${pct}% correctos · ${nf} pronósticos “agua limpia” verificados · registro público`)
    }catch(_){return null}
  })()
  const hasAnnual=!!LINK_ANNUAL
  const hasPro=!!LINK_PRO
  // isPro = user has paid for the Pro tier (9.99€, unlocks WhatsApp alerts,
  // 14-day forecast, priority email support). Separate flag from sg_premium
  // so existing €4.99 subs keep their current access; Pro is strictly additive.
  const isPro=typeof window!=="undefined"&&localStorage.getItem("sg_premium_pro")==="1"
  // Real beach data from live sargassum.json — makes the "morning brief" preview genuine
  // levels is keyed by numeric index ("0","1",...); beach id is in b.id field
  const _lvls=Object.values(sargData?.levels||{})
  const _islandLvls=_lvls.filter(b=>island==="gp"?b.id?.startsWith("gp-"):!b.id?.startsWith("gp-"))
  // Même source que le header de liste (status==='clean') — l'ancien seuil
  // score>=70 contredisait le compte "{x}/{y} plages propres" affiché ailleurs.
  const _cleanCount=_islandLvls.filter(b=>b.status==="clean").length
  const _totalCount=_islandLvls.length
  // FIX modal→CTA (fuite #1, 2% sur 3416 modals) : en SAISON CALME (≥80% propres,
  // 64% du temps) l'argument « alerte AVANT que ça tourne » tombe à plat — rien ne
  // tourne. A/B pw_calm : pivot vers la valeur que le GRATUIT n'a PAS et qui convertit
  // SANS peur = la prévision (« sache où sera la mer DEMAIN »). ?pwcalm=1/0 en QA.
  const _allCalm=_totalCount>0&&(_cleanCount/_totalCount)>=0.8
  // PROMU EN DÉFAUT (cohérence élévation premium) : la value-prop POSITIVE en saison
  // calme (« Sache où sera la mer demain ») est le défaut 85%, 15% holdout mesurable.
  const pwCalm=(()=>{try{const q=window.location.search;if(/[?&]pwcalm=1/.test(q))return true;if(/[?&]pwcalm=0/.test(q))return false;return abVariant("pw_calm",["control","calm"],[.15,.85])==="calm"}catch(_){return false}})()
  const _topBeach=[..._islandLvls].sort((a,b)=>b.score-a.score)[0]
  // Nouvelles régions : ids opaques (pc001…) → nom réel depuis REGION.beaches.
  // MQ/GP : derivation slug historique inchangée.
  // Nom CANONIQUE — le slug-derive cassait les noms GP au point de décision
  // (« Pt Chateaux » au lieu de « Pointe des Châteaux ») → modal→CTA GP 0,9% (3× MQ).
  // Même source que _kidsOf (BEACHES_FALLBACK via SARG_TO_BEACH) + track-record en
  // filet (guardé), slug-derive en dernier recours (anti-null pendant le fetch). wupuzpuuh.
  const _nameOf=lv=>{
    if(!lv||!lv.id)return null
    if(IS_NEW_REGION)return REGION.beaches?.find(b=>b.id===lv.id)?.name||null
    const canon=BEACHES_FALLBACK.find(b=>b.id===SARG_TO_BEACH[lv.id])?.name
      ||(_trackRec&&_trackRec.byBeach&&_trackRec.byBeach[lv.id]&&_trackRec.byBeach[lv.id].name)
    return canon||lv.id.replace(/^gp-/,"").split("-").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")||null
  }
  const _topName=_nameOf(_topBeach)
  const _topScore=_topBeach?.score||null
  // Contexte plage : quand la modal s'ouvre DEPUIS une fiche, le copy cite la plage vue.
  const _bcSrcs=["forecast_lock","forecast_cta","forecast_scrub","forecast_beat","beach_dive_footer","post_gate","social_proof","whisper_veilleur","arrive","rel_hot_cta"]
  const _hasBeachCtx=!!(beach&&_bcSrcs.some(ss=>(source||"").includes(ss)||(source||"")==="post_gate"))
  const _ctxName=_hasBeachCtx?(beach&&beach.name)||null:null
  const _ctxScore=_hasBeachCtx?(beach&&beach.score)||null:null
  const _ctxStatus=_hasBeachCtx?(beach&&beach.status)||null:null
  // Paywall-constellation (A/B pw_constel) : tes plages = points lumineux sur la mer
  // golden-hour. PRNG seedé (stable entre renders = calme, jamais Math.random/render),
  // capé 14 (avoid d'abord puis top scores), couleur = statut. _topBeach = étoile-guide.
  const _aggStatus=_islandLvls.some(b=>b.status==="avoid")?"avoid":_islandLvls.some(b=>b.status==="moderate")?"moderate":"clean"
  const _constelMood=VEILLEUR_MOOD[moodFromStatus(_aggStatus)]||VEILLEUR_MOOD.serein
  const _constel=useMemo(()=>{
    const seed=n=>{const x=Math.sin(n*127.1+74.7)*43758.5453;return x-Math.floor(x)}
    return [..._islandLvls].sort((a,b)=>((b.status==="avoid")-(a.status==="avoid"))||((b.score||0)-(a.score||0))).slice(0,14)
      .map((b,i)=>{const row=i%3;const x=18+seed(i+1)*364;const y=111+row*10+seed(i+50.3)*5;const col=b.status==="clean"?"#3fd07f":b.status==="moderate"?"#FFD27A":"#F4845F";return{x:+x.toFixed(1),y:+y.toFixed(1),col,top:!!(_topBeach&&b.id===_topBeach.id)}})
  },[_islandLvls,_topBeach])
  // Value card 02 : destination = vraie plage propre du jour calculée du live —
  // plus aucun nom de plage inventé ni changement d'état fabriqué.
  const _cleanTop=_islandLvls.filter(b=>b.status==="clean").sort((a,b)=>(b.score||0)-(a.score||0))[0]
  const _exSwitch=_nameOf(_cleanTop)||_topName||null
  // Value card 03 : vraie meilleure plage du samedi depuis le forecast hebdo.
  // Suffixe enfants UNIQUEMENT si kids:true dans la donnée région.
  const _kidsOf=lv=>{
    if(!lv)return false
    if(IS_NEW_REGION)return !!REGION.beaches?.find(b=>b.id===lv.id)?.kids
    return !!BEACHES_FALLBACK.find(b=>b.id===SARG_TO_BEACH[lv.id])?.kids
  }
  const _wkend=(()=>{
    const wk=sargData?.weekly||{}
    const ref=_islandLvls.map(lv=>wk[lv.id]?.forecast).find(f=>Array.isArray(f)&&f.length)
    if(!ref)return null
    let satIdx=-1,sunIdx=-1
    ref.forEach((f,i)=>{
      if(!f?.date)return
      const dow=new Date(f.date+"T12:00:00Z").getUTCDay()
      if(satIdx<0&&dow===6)satIdx=i
      if(sunIdx<0&&dow===0&&i>0)sunIdx=i
    })
    if(satIdx<0)return null
    const cand=_islandLvls.map(lv=>{
      const fc=wk[lv.id]?.forecast
      if(!fc?.[satIdx]?.status)return null
      return{lv,sat:fc[satIdx].status,sun:fc[sunIdx]?.status||null}
    }).filter(Boolean)
    if(!cand.length)return null
    const cleanSat=cand.filter(c=>c.sat==="clean").sort((a,b)=>(b.lv.score||0)-(a.lv.score||0))
    const pick=cleanSat[0]||[...cand].sort((a,b)=>(b.lv.score||0)-(a.lv.score||0))[0]
    const name=_nameOf(pick.lv)
    if(!name)return null
    return{name,sat:pick.sat,kids:_kidsOf(pick.lv),allClean:pick.sat==="clean"&&pick.sun==="clean"}
  })()
  const modalOpenedAt=useRef(Date.now())
  const panelRef=useRef(null)
  const startYRef=useRef(0)
  // Swipe-down to dismiss
  const onTouchStartModal=e=>{startYRef.current=e.touches[0].clientY}
  const onTouchMoveModal=e=>{
    if(panelRef.current&&panelRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-startYRef.current
    if(dy>0&&panelRef.current)panelRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEndModal=e=>{
    if(panelRef.current&&panelRef.current.scrollTop>5){if(panelRef.current)panelRef.current.style.transform="";return}
    const dy=(e.changedTouches[0]?.clientY||0)-startYRef.current
    if(dy>60)onClose()
    else if(panelRef.current){panelRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";panelRef.current.style.transform="";setTimeout(()=>{if(panelRef.current)panelRef.current.style.transition=""},300)}
  }
  // Escape key to close (close TRACKÉ → géré ici, pas dans useModalA11y : escClose=false)
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape"){const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});onClose()}}
    document.addEventListener("keydown",h)
    return()=>document.removeEventListener("keydown",h)
  },[onClose,source])
  // a11y plancher : focus-trap (Tab piégé dans le panel) + restauration du focus au close.
  // Échap déjà géré juste au-dessus (tracké) → escClose=false pour ne pas doubler onClose.
  useModalA11y(panelRef,onClose,false)
  // Annuel par défaut (best practice SaaS : AOV +60%, churn plus bas, cash
  // upfront) quand un lien annuel existe — sinon mensuel. Le badge -33% et le
  // prix /mois équivalent vendent l'annuel sans forcer l'user à diviser.
  // USD (no-trial) : Mensuel par défaut — audit Starlink 2026-06-11 : leur 1er
  // contact prix est TOUJOURS mensuel ; un « $79 billed today » présélectionné
  // 60s après la découverte = le point de rupture probable. EUR inchangé (A/B).
  // Défaut plan : EUR (MQ/GP, REGION_PAY null) → Annuel (engagement saison, +LTV) ;
  // USD (REGION_PAY) → Mensuel (audit Starlink : 1er contact prix mensuel). On
  // dérive de REGION_PAY (et non plus de NO_TRIAL, désormais true partout).
  const[plan,setPlan]=useState(()=>{
    // Préselection deep-link depuis /offres/ (?plan=…), consommée une fois.
    try{const dp=sessionStorage.getItem("sg_deep_plan");if(dp==="monthly"||dp==="annual"){sessionStorage.removeItem("sg_deep_plan");if(dp==="monthly"||hasAnnual)return dp}}catch(_){}
    return hasAnnual&&!REGION_PAY?"annual":"monthly"
  })
  // effectivePlan is what we ship to Stripe on CTA click. Fallback chain:
  //   pro → annual → monthly, only if Stripe Link is configured for that tier.
  const effectivePlan=
    (plan==="pro"&&hasPro)?"pro"
    :(plan==="annual"&&hasAnnual)?"annual"
    :"monthly"
  const stripeLinkFor={monthly:LINK_MONTHLY,annual:LINK_ANNUAL,pro:LINK_PRO}
  // Enrichit le Payment Link Stripe : prefilled_email (friction checkout -10/30%
  // selon Stripe, l'email est déjà en localStorage) + client_reference_id
  // (débloque l'attribution paiement→source/plan/région, aujourd'hui aveugle —
  // remonte dans le webhook + Stripe dashboard). buy.stripe.com = le processeur
  // de paiement choisi par l'user, pas un tiers : prefill standard et attendu.
  const stripeUrlWith=(link,plan)=>{
    if(!link)return link
    try{
      const u=new URL(link)
      const email=localStorage.getItem("sg_email")||""
      if(email)u.searchParams.set("prefilled_email",email)
      // ARMER le panier abandonné (audit widget-factory) : ce point est le
      // chokepoint pré-checkout. La bannière de récupération (l.9564) LIT
      // sg_checkout_abandoned mais rien ne l'écrivait → code mort. Effacé à la
      // conversion (effet isPremium). Sans email la bannière ne s'affiche pas (OK).
      try{localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email,ts:Date.now()}))}catch(_){}
      const ref=[IS_NEW_REGION?REGION.id:(island||"mq"),plan||effectivePlan,source||"unknown"].join("_").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,200)
      u.searchParams.set("client_reference_id",ref)
      return u.toString()
    }catch{return link}
  }
  // ── Checkout ON-SITE (Stripe Payment Element, design maison) ──────────────
  // Formulaire de paiement DANS le modal, aux couleurs de l'app : Payment
  // Element (carte+Link) + Express Checkout (Apple/Google Pay), thème sombre.
  // AUCUN redirect, AUCUNE iframe Checkout (l'embedded mesuré 12-27s le
  // 2026-06-10 a été retiré sur feedback utilisateur). Le SetupIntent +
  // js.stripe.com sont préchauffés à l'ouverture du paywall (~1s) ; au clic,
  // les Elements montent en <1s. confirmSetup (3DS en iframe, jamais de
  // redirect: types card+link only) → action subscribe (essai 7j, prix
  // région) → premium activé EN PLACE. Fallback intégral : Payment Link.
  const[payStep,_setPayStep]=useState(false)
  const payStepRef=useRef(false)
  const passCtxRef=useRef(null) // {pass,cents,days} si achat d'un PASS on-site, sinon null (abo)
  const setPayStep=useCallback(v=>{payStepRef.current=v;_setPayStep(v)},[])
  // Swipe-down to go back depuis l'écran paiement on-site (overlay z1300, rendu
  // hors du panel → ne bénéficie pas du swipe du paywall). Même geste que le
  // paywall : ne déclenche que si l'overlay est scrollé tout en haut, glisse
  // le contenu, et revient au paywall (setPayStep(false), JAMAIS onClose →
  // l'user retombe sur le verdict gratuit, pas dans le vide).
  const payScrollRef=useRef(null)
  const payContentRef=useRef(null)
  const payStartYRef=useRef(0)
  const onTouchStartPay=e=>{payStartYRef.current=e.touches[0].clientY}
  const onTouchMovePay=e=>{
    if(payScrollRef.current&&payScrollRef.current.scrollTop>5)return
    const dy=e.touches[0].clientY-payStartYRef.current
    if(dy>0&&payContentRef.current)payContentRef.current.style.transform=`translateY(${dy}px)`
  }
  const onTouchEndPay=e=>{
    const reset=()=>{if(payContentRef.current){payContentRef.current.style.transition="transform .3s cubic-bezier(.32,.72,0,1)";payContentRef.current.style.transform="";setTimeout(()=>{if(payContentRef.current)payContentRef.current.style.transition=""},300)}}
    if(payScrollRef.current&&payScrollRef.current.scrollTop>5){reset();return}
    const dy=(e.changedTouches[0]?.clientY||0)-payStartYRef.current
    if(dy>60){if(payContentRef.current)payContentRef.current.style.transform="";track("sg_pay_onsite_back",{plan:payPlanRef.current,via:"swipe"});setPayStep(false)}
    else reset()
  }
  const[payReady,setPayReady]=useState(false)
  const[payBusy,setPayBusy]=useState(false)
  const[payError,setPayError]=useState("")
  // Consentement RGPD/rétractation (renonciation au droit de rétractation 14 j contre
  // fourniture immédiate, art. L221-28 13° C. conso). Case NON pré-cochée sur le chemin
  // Pass B2C. DORMANTE par défaut : #250 a retenu le consentement IMPLICITE (« en validant
  // l'achat, vous demandez l'exécution immédiate », CGV) sans case → on n'ajoute pas de
  // friction money-path. Opt-in explicite via ?consent=1 si on veut afficher la case.
  const consentFlag=(()=>{try{return /[?&]consent=1/.test(window.location.search)}catch(_){return false}})()
  const[consentOk,setConsentOk]=useState(false)
  const stripeRef=useRef(null)
  const elementsRef=useRef(null)
  const setupSecretRef=useRef(null)
  const payPrewarmPromiseRef=useRef(null)
  const payMountedRef=useRef(false)
  const payPlanRef=useRef("monthly")
  const payReadyRef=useRef(false)
  const payEmailRef=useRef(null)
  const payEmailCapturedRef=useRef("") // dernière valeur d'email déjà enrôlée au blur (pré-Stripe), évite les doublons
  const paypalBtnRef=useRef(null) // pont PayPal : conteneur du bouton d'abo
  const payDivRef=useRef(null)
  const expressDivRef=useRef(null)
  const mollieRef=useRef(null)        // pont Mollie : objet Mollie(profileId)
  const mollieCardRef=useRef(null)    // pont Mollie : composant carte (Components)
  // Composants Mollie INDIVIDUELS (au lieu du composant "card" combiné) : on contrôle
  // 100% du thème + on pose NOS propres libellés → carte en thème SOMBRE premium, plus
  // de feuille blanche bolt-on. createToken() agrège tous les composants montés → submit
  // inchangé (cf. doSubscribe). Réfs : titulaire / numéro / expiration / CVC.
  const molHolderRef=useRef(null)
  const molNumberRef=useRef(null)
  const molExpiryRef=useRef(null)
  const molCvcRef=useRef(null)
  // Préchauffage COMPLET dès l'ouverture du paywall : SetupIntent + stripe.js
  // + Elements + MOUNT du Payment Element dans l'overlay caché. Mesuré
  // 2026-06-10 : stripe.js ~15s + boot de l'élément ~12s sur ce réseau — tout
  // doit booter PENDANT la lecture du paywall, pas au clic. Un SetupIntent
  // n'est pas lié au plan → un seul prewarm pour tout le modal.
  useEffect(()=>{
    if(!PAYWALL_READY)return
    payPrewarmPromiseRef.current=(async()=>{
      if(PAY_CAPTURE_ONLY){payReadyRef.current=true;setPayReady(true);return} // capture : aucun form de paiement à monter
      // ── Pont Mollie : monte les Components (carte on-site) au lieu du Payment
      // Element Stripe. Pas de SetupIntent (le cardToken est créé au submit). ──
      if(PAY_PROVIDER==="mollie"){
        await loadMollieJs()
        const locale=lang==="es"?"es_ES":lang==="en"?"en_US":"fr_FR"
        mollieRef.current=window.Mollie(MOLLIE_PROFILE,{locale,testmode:MOLLIE_TESTMODE})
        if(!payMountedRef.current&&molNumberRef.current){
          // Composants INDIVIDUELS (titulaire/numéro/expiration/CVC) au lieu du composant
          // "card" combiné : le combiné rendait ses propres libellés en sombre NON-stylable
          // (illisible sur l'overlay) → on était forcé à une feuille blanche bolt-on. Ici on
          // pose NOS libellés (clairs) hors iframe + texte saisi clair sur champs sombres
          // → carte 100% dans le thème premium, zéro blanc. `styles` ne stylise QUE le texte
          // DANS l'iframe ; le fond visible = nos divs sombres. createToken() (doSubscribe)
          // collecte tous les composants montés sur l'instance → submit STRICTEMENT inchangé.
          // backgroundColor SOLIDE (et non transparent) sur l'input DANS l'iframe : sans
          // lui, l'autofill iOS/Safari peint le champ en BLANC (le nom auto-rempli ressortait
          // sur fond blanc, illisible). Mollie ne supporte ni boxShadow ni :-webkit-autofill
          // (cf. docs styling) → backgroundColor est le seul levier ; on le pose sur les 3
          // états pour couvrir l'autofill quel que soit l'état de validation. Doit matcher
          // MOL_FIELD (la div hôte, désormais solide #241837) pour zéro couture visible.
          const _molBg="#241837"
          const styles={base:{color:"#eef2f7",backgroundColor:_molBg,fontSize:"16px",fontWeight:"500","::placeholder":{color:"rgba(255,255,255,.32)"}},valid:{color:"#7CE0B0",backgroundColor:_molBg},invalid:{color:"#FF8A66",backgroundColor:_molBg}}
          const M=mollieRef.current
          const holder=M.createComponent("cardHolder",{styles})
          const number=M.createComponent("cardNumber",{styles})
          const expiry=M.createComponent("expiryDate",{styles})
          const cvc=M.createComponent("verificationCode",{styles})
          holder.mount(molHolderRef.current)
          number.mount(molNumberRef.current)
          expiry.mount(molExpiryRef.current)
          cvc.mount(molCvcRef.current)
          mollieCardRef.current={holder,number,expiry,cvc} // réf agrégée (diagnostic/HMR)
          payReadyRef.current=true;setPayReady(true)
          payMountedRef.current=true
        }
        return
      }
      // PayPal : le bouton d'abo est monté par un effet dédié → AUCUN Payment Element
      // Stripe (sinon l'ancien champ carte Stripe s'affichait en plus du bouton).
      if(PAY_PROVIDER==="paypal"){payReadyRef.current=true;setPayReady(true);return}
      const[r]=await Promise.all([
        fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"setup"})}),
        loadStripeJs(),
      ])
      if(!r.ok)throw new Error("http "+r.status)
      const{clientSecret}=await r.json()
      if(!clientSecret)throw new Error("no clientSecret")
      setupSecretRef.current=clientSecret
      stripeRef.current=window.Stripe(STRIPE_PK)
      elementsRef.current=stripeRef.current.elements({
        clientSecret,
        // locale = langue de l'UI du modal (et donc des labels + texte de mandat
        // « En fournissant vos informations… » rendus PAR Stripe). Sans ça, défaut
        // 'auto' → détection navigateur : un site EN/USD (Florida) ou ES (Riviera/
        // Punta Cana) affichait les labels en FR pour un navigateur FR. `lang` suit
        // déjà la région (primaryLang) + override path /en /es → MQ/GP restent en FR.
        locale:lang,
        appearance:{theme:"night",variables:{
          colorPrimary:"#FFC72C",colorBackground:"#13261F",colorText:"#e6edf3",
          colorDanger:"#E8522A",borderRadius:"12px",fontSizeBase:"15px",
        }},
      })
      // Pré-mount dans l'overlay caché (toujours rendu) — ready pendant la lecture
      if(!payMountedRef.current&&payDivRef.current){
        // Friction minimale : le champ telephone venait de l'enrolement Link —
        // Link retire du SetupIntent (card only) = plus de telephone. NE PAS
        // ajouter fields.billingDetails.phone:never ici : teste 2026-06-10, le
        // Payment Element ne boote plus (ready ne fire jamais) avec cette option.
        // business.name : sans lui le mandat Stripe affiche « you allow PAY to
        // charge your card » — entité sans nom à l'instant exact de la décision
        // (audit checkout 2026-06-11). defaultValues.country : le fallback était
        // « Martinique » (pays du compte) sur les sites USD — chaque visiteur US
        // devait corriger + signal site étranger. EUR : comportement inchangé.
        const brandName=IS_NEW_REGION
          ?((lang==="es"?"Sargazo ":"Sargassum ")+String(REGION.name||""))
          :"Sargasses Martinique"
        const pe=elementsRef.current.create("payment",{layout:"tabs",
          business:{name:brandName},
          ...(IS_NEW_REGION?{defaultValues:{billingDetails:{address:{country:REGION.countryCode||"US"}}}}:{}),
        })
        pe.mount(payDivRef.current)
        pe.on("ready",()=>{payReadyRef.current=true;setPayReady(true)})
        try{
          const ece=elementsRef.current.create("expressCheckout")
          ece.mount(expressDivRef.current)
          ece.on("confirm",(ev)=>{
            try{const em=ev?.billingDetails?.email;if(em&&payEmailRef.current&&!payEmailRef.current.value)payEmailRef.current.value=em}catch(_){}
            doSubscribeRef.current()
          })
        }catch(_){/* wallets indisponibles : la carte suffit */}
        payMountedRef.current=true
      }
    })()
    payPrewarmPromiseRef.current.catch(()=>{}) // l'échec est géré au clic (fallback)
  },[])
  // ── Pont PayPal : rend le bouton d'abo quand l'écran paiement s'ouvre (abo only ;
  // les passes restent en capture). createSubscription(plan_id) → popup PayPal →
  // onApprove pose sg_premium + confirme côté serveur (forward Apps Script). ───────
  useEffect(()=>{
    if(!payStep||PAY_PROVIDER!=="paypal"||passCtxRef.current||typeof window==="undefined")return
    let cancelled=false
    ;(async()=>{
      try{
        await loadPayPalSdk(PAYPAL_CLIENT_ID)
        if(cancelled||!paypalBtnRef.current||!window.paypal)return
        try{paypalBtnRef.current.replaceChildren()}catch(_){} // re-render propre
        payReadyRef.current=true;setPayReady(true)
        const plan=payPlanRef.current==="annual"?"annual":"monthly"
        const isl=IS_NEW_REGION?REGION.id:(window.location.hostname.includes("guadeloupe")?"gp":"mq")
        window.paypal.Buttons({
          style:{layout:"vertical",color:"gold",shape:"pill",label:"subscribe"},
          createSubscription:(d,actions)=>actions.subscription.create({
            plan_id:PAYPAL_PLANS[plan],
            custom_id:(isl+"_"+plan+"_"+(source||"unknown")).slice(0,127),
          }),
          onApprove:(d)=>{
            const email=((payEmailRef.current&&payEmailRef.current.value)||localStorage.getItem("sg_email")||"").trim()
            try{localStorage.setItem("sg_email",email)
              localStorage.setItem("sg_premium","1");if(email)localStorage.setItem("sg_premium_email",email)}catch(_){}
            try{submitLead(email,"paypal_sub")}catch(_){}
            try{fetch("/api/paypal.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"confirm_subscription",subscriptionId:d.subscriptionID,email,plan})}).catch(()=>{})}catch(_){}
            track("sg_conversion",{session_id:d.subscriptionID,method:"paypal",plan})
            onActivated&&onActivated();onClose&&onClose()
          },
          onError:(err)=>{try{console.error("paypal onError",err)}catch(_){}setPayError("PayPal: "+String((err&&err.message)||err).slice(0,140));track("sg_pay_onsite_error",{plan,provider:"paypal",message:String((err&&err.message)||err).slice(0,120)})},
        }).render(paypalBtnRef.current)
      }catch(e){if(!cancelled)setPayError(_t(lang,"PayPal n'a pas pu démarrer. Réessaie.","PayPal couldn't start. Retry.","PayPal no pudo iniciar. Reintenta."))}
    })()
    return ()=>{cancelled=true}
  },[payStep])
  const ppSub=PAY_PROVIDER==="paypal"&&!passCtxRef.current // abo PayPal (bouton) vs pass/capture
  // Capture l'email DÈS qu'il quitte le champ (onBlur) sur l'écran de paiement —
  // càd au moment exact où l'user clique sur la carte/PayPal = « juste avant Stripe ».
  // Le partant qui tape son email puis hésite sur la carte est un lead chaud : enrôlé
  // dans le drip + panier abandonné armé, MÊME sans paiement (carte refusée, 3DS
  // abandonné, simple fermeture). Avant ce fix, submitLead ne partait qu'au clic final
  // « Payer » (doSubscribe) ou onApprove PayPal → tout ce trafic email était perdu.
  // Idempotent (garde sur la dernière valeur) ; purement additif, zéro logique paiement.
  const capturePayEmail=useCallback(()=>{
    try{
      const email=(payEmailRef.current?.value||"").trim()
      if(!email||!email.includes("@")||!email.includes("."))return
      if(payEmailCapturedRef.current===email)return
      payEmailCapturedRef.current=email
      try{localStorage.setItem("sg_email",email)}catch(_){}
      try{submitLead(email,"pay_intent")}catch(_){}
      // Arme la relance panier abandonné avec l'email désormais connu (sinon la
      // bannière/recover-abandoned-cart restaient muets faute d'email).
      try{localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email,ts:Date.now()}))}catch(_){}
      try{track("sg_pay_email_captured",{plan:payPlanRef.current,source:source||"unknown"})}catch(_){}
    }catch(_){}
  },[source])
  const doSubscribe=useCallback(async()=>{
    const plan=payPlanRef.current
    if(payBusy)return
    const email=(payEmailRef.current?.value||"").trim()
    if(!email||!email.includes("@")||!email.includes(".")){
      setPayError(_t(lang,"Entre ton email pour recevoir ton accès.","Enter your email to receive your access.","Introduce tu email para recibir tu acceso."))
      return
    }
    // Consentement requis sur le chemin Pass B2C payant (renonciation rétractation 14 j).
    // Pas de gate en capture (offre gratuite, pas de paiement) ni sur l'abo (passCtxRef null),
    // ni si le flag ?consent=0 désactive la case.
    if(consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk){
      setPayError(_t(lang,"Coche la case pour activer ton accès immédiat.","Tick the box to activate your immediate access.","Marca la casilla para activar tu acceso inmediato."))
      return
    }
    // ── Mode CAPTURE : aucun paiement dispo → on enregistre l'email (waitlist) +
    // état succès. Relance à la réouverture (source 'mollie_waitlist'). ──────────
    if(PAY_CAPTURE_ONLY){
      // GAP FREEMIUM : paiements indispo → on OFFRE 7j de premium contre l'email
      // (liste chaude + accroche au produit). Relance à la réouverture (source
      // 'gap_freemium') : « garde ton accès pour 4,99 € ». Accès time-boxé = pas de
      // fuite premium permanente + urgence de conversion.
      setPayBusy(true);setPayError("")
      try{submitLead(email,"gap_freemium")}catch(_){}
      try{localStorage.setItem("sg_email",email)
        localStorage.setItem("sg_premium_pass_end",String(Date.now()+7*86400000))
      }catch(_){}
      track("sg_gap_freemium_unlock",{plan:payPlanRef.current,pass:passCtxRef.current?passCtxRef.current.pass:null,source:source||"unknown"})
      setPayBusy(false);onActivated&&onActivated();onClose&&onClose();return
    }
    // Lane « paiement indirect par mails » : enrôle l'email haute-intention dans le
    // drip AVANT de tenter le paiement → récupérable si carte refusée / 3DS abandonné /
    // fermeture. NON-capture uniquement (en capture, gap_freemium ci-dessus suffit —
    // évite le double submitLead qui gonflait les métriques de 2× par déblocage).
    try{submitLead(email,"onsite_checkout")}catch(_){}
    // ── Pont Mollie : createToken (Components) → mollie.php. 3DS → redirect+retour
    // (?mollie_return=1 confirme + débloque). Sinon confirme inline puis débloque. ─
    if(PAY_PROVIDER==="mollie"){
      setPayBusy(true);setPayError("")
      try{
        const{token,error:tErr}=await mollieRef.current.createToken()
        if(tErr||!token)throw new Error((tErr&&tErr.message)||_t(lang,"Vérifie ta carte.","Check your card.","Revisa tu tarjeta."))
        const _pc=passCtxRef.current
        // Parrainage (Mollie) : transmet le code parrain + le mien (attribution
        // enregistrée côté serveur ; la récompense est appliquée au go-live Mollie,
        // cf. MOLLIE_MIGRATION.md — Mollie n'a pas de coupon/balance comme Stripe).
        const _refBy=sgReferredBy(),_myRef=sgMyReferralCode()
        const body=_pc
          ?{action:"create_payment",cardToken:token,pass:_pc.pass,cents:_pc.cents,email,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef,consent:{accepted:true,v:"2026-06-29",lang}}
          :{action:"create_subscription",cardToken:token,plan,email,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef}
        const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
        const d=await r.json().catch(()=>({}))
        if(!r.ok||d.error||!d.paymentId)throw new Error(d.error||"payment failed")
        if(d.checkoutUrl){ // 3DS : stocke le contexte de déblocage puis redirige vers Mollie
          try{sessionStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}))}catch(_){}
          window.location.href=d.checkoutUrl;return
        }
        // Pas de 3DS : confirme côté serveur (source de vérité) puis débloque.
        const cr=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
        const cd=await cr.json().catch(()=>({}))
        if(!cd.paid)throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        localStorage.setItem("sg_email",email)
        if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000));track("sg_conversion",{session_id:d.paymentId,method:"mollie_pass",plan:_pc.pass,pass_days:_pc.days})}
        else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",email);track("sg_conversion",{session_id:d.paymentId,method:"mollie",plan});if(_refBy)track("sg_referral_convert",{ref_code:_refBy,plan,provider:"mollie"})}
        setPayBusy(false);onActivated?.();onClose();return
      }catch(e){
        setPayBusy(false)
        const msg=(e&&e.message)?String(e.message):""
        setPayError(msg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta."))
        track("sg_pay_onsite_error",{plan,provider:"mollie",message:msg.slice(0,90)})
        return
      }
    }
    setPayBusy(true);setPayError("")
    try{
      const{error:subErr}=await elementsRef.current.submit()
      if(subErr)throw subErr
      const{error,setupIntent}=await stripeRef.current.confirmSetup({
        elements:elementsRef.current,clientSecret:setupSecretRef.current,
        redirect:"if_required",
        confirmParams:{return_url:window.location.origin+"/?setup_return=1",payment_method_data:{billing_details:{email}}},
      })
      if(error)throw error
      // PASS one-time (pw_pass_onsite) : MÊME carte collectée, on facture UNE fois (PaymentIntent), pas d'abo.
      const _pc=passCtxRef.current
      if(_pc){
        const pr=await fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"pay_once",email,pass:_pc.pass,cents:_pc.cents,setupIntentId:setupIntent.id,lang,source:source||"unknown"})})
        const pd=await pr.json().catch(()=>({}))
        if(!pr.ok||pd.error||!pd.paymentIntentId)throw new Error(pd.error||"pay_once failed")
        if(pd.paymentFailed)throw new Error(_t(lang,"Carte refusée. Essaie une autre carte.","Card declined. Try another card.","Tarjeta rechazada. Prueba otra tarjeta."))
        if(pd.requiresAction&&pd.piClientSecret){
          const{error:payErr,paymentIntent}=await stripeRef.current.confirmCardPayment(pd.piClientSecret)
          if(payErr)throw payErr
          if(paymentIntent&&paymentIntent.status!=="succeeded"&&paymentIntent.status!=="processing")throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        }
        localStorage.setItem("sg_email",email)
        localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000))
        track("sg_conversion",{session_id:pd.paymentIntentId,method:"onsite_pass",plan:_pc.pass,pass_days:_pc.days})
        setPayBusy(false);onActivated?.();onClose();return
      }
      // Parrainage : transmet le code parrain (le filleul ramené crédite le parrain
      // de jours de pass — cf. mollie.php refcredit) + mon propre code en metadata customer.
      const _refBy=sgReferredBy(),_myRef=sgMyReferralCode()
      const r=await fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang,source:source||"unknown",referredBy:_refBy,myReferralCode:_myRef})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok||d.error||!d.subscriptionId)throw new Error(d.error||"subscribe failed")
      // NO_TRIAL (USD) : la 1re facture part immédiatement — si la banque
      // exige une confirmation (3DS), on la joue ici, dans le même écran.
      if(d.paymentFailed)throw new Error(_t(lang,"Carte refusée. Essaie une autre carte.","Card declined. Try another card.","Tarjeta rechazada. Prueba otra tarjeta."))
      if(d.requiresAction&&d.piClientSecret){
        const{error:payErr,paymentIntent}=await stripeRef.current.confirmCardPayment(d.piClientSecret)
        if(payErr)throw payErr
        if(paymentIntent&&paymentIntent.status!=="succeeded"&&paymentIntent.status!=="processing"){
          throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        }
        track("sg_pay_onsite_3ds",{plan,status:paymentIntent?.status||"unknown"})
      }
      // SUCCÈS — premium activé en place, zéro redirect
      localStorage.setItem("sg_email",email)
      localStorage.setItem("sg_premium","1")
      localStorage.setItem("sg_premium_email",email)
      if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
      track("sg_conversion",{session_id:d.subscriptionId,method:"onsite",plan})
      if(_refBy)track("sg_referral_convert",{ref_code:_refBy,plan})
      setPayBusy(false)
      onActivated?.()
      onClose()
    }catch(e){
      setPayBusy(false)
      const msg=(e&&e.message)?String(e.message):""
      setPayError(msg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta."))
      track("sg_pay_onsite_error",{plan,message:msg.slice(0,90)})
    }
  },[lang,source,payBusy,onActivated,onClose,consentFlag,consentOk])
  const doSubscribeRef=useRef(doSubscribe)
  useEffect(()=>{doSubscribeRef.current=doSubscribe},[doSubscribe])
  // ── Apple Pay / Google Pay (Mollie) ─────────────────────────────────────────
  // On NE fait PAS l'intégration directe (qui imposerait d'héberger le fichier de
  // vérification de domaine Apple + un test device). On force `method` côté serveur
  // → Mollie renvoie son checkout hébergé où la feuille native du wallet s'affiche
  // (sur LEUR domaine, déjà vérifié chez Apple/Google). Retour ?mollie_return=1 →
  // même confirmation serveur que la 3DS carte. Card reste 100% on-site (Components).
  // Wallet via REDIRECT Mollie (checkout hébergé) — fallback universel : Google Pay, ou
  // Apple Pay quand l'intégration directe n'est pas dispo / domaine pas encore validé.
  const walletRedirect=useCallback(async(method)=>{
    const _pc=passCtxRef.current
    const email=((payEmailRef.current&&payEmailRef.current.value)||"").trim()
    const plan=payPlanRef.current
    setPayBusy(true);setPayError("")
    if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){try{submitLead(email,"onsite_wallet")}catch(_){}try{localStorage.setItem("sg_email",email)}catch(_){}}
    try{
      const _refBy=sgReferredBy(),_myRef=sgMyReferralCode()
      const body=_pc
        ?{action:"create_payment",method,pass:_pc.pass,cents:_pc.cents,email,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef,consent:{accepted:true,v:"2026-06-29",lang}}
        :{action:"create_subscription",method,plan,email,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef}
      const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      const d=await r.json().catch(()=>({}))
      if(!r.ok||d.error||!d.paymentId)throw new Error(d.error||"payment failed")
      track("sg_pay_wallet_start",{plan,provider:"mollie",method,pass:_pc?_pc.pass:null})
      if(d.checkoutUrl){
        try{sessionStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}))}catch(_){}
        window.location.href=d.checkoutUrl;return
      }
      const cr=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
      const cd=await cr.json().catch(()=>({}))
      if(!cd.paid)throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
      if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000))}
      else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",email)}
      setPayBusy(false);onActivated?.();onClose()
    }catch(e){
      setPayBusy(false)
      const msg=(e&&e.message)?String(e.message):""
      setPayError(msg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta."))
      try{setPayStep(true)}catch(_){}
      track("sg_pay_onsite_error",{plan,provider:"mollie",method,message:msg.slice(0,90)})
    }
  },[lang,source,onActivated,onClose])
  // Apple Pay ON-SITE direct + fallback redirect. Pas async : new ApplePaySession()+begin()
  // DOIVENT être synchrones dans le geste utilisateur (sinon Safari refuse la feuille).
  const payWithWallet=useCallback((method)=>{
    if(PAY_PROVIDER!=="mollie"||PAY_CAPTURE_ONLY)return
    const _pc=passCtxRef.current
    // Même garde de consentement que le bouton carte sur le chemin Pass B2C.
    if(consentFlag&&_pc&&!consentOk){
      setPayError(_t(lang,"Coche la case pour activer ton accès immédiat.","Tick the box to activate your immediate access.","Marca la casilla para activar tu acceso inmediato."))
      return
    }
    const email=((payEmailRef.current&&payEmailRef.current.value)||"").trim()
    const emailOk=!!email&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    if(!_pc&&!emailOk){ // abo : email requis (pass : facultatif, le wallet le fournit)
      setPayError(_t(lang,"Ajoute ton email d'abord.","Add your email first.","Añade tu email primero."))
      try{payEmailRef.current&&payEmailRef.current.focus()}catch(_){}
      return
    }
    // ── Apple Pay ON-SITE (direct) : feuille NATIVE sur notre page, zéro redirect ──
    if(method==="applepay"&&typeof window!=="undefined"&&window.ApplePaySession){
      let canAP=false;try{canAP=window.ApplePaySession.canMakePayments()}catch(_){}
      if(canAP){
        try{
          const cents=_pc?_pc.cents:499
          // countryCode = pays MARCHAND (compte Mollie FR) → "FR" pour toutes les régions.
          // currencyCode = devise de la transaction → USD pour les régions touristes.
          const ses=new window.ApplePaySession(3,{countryCode:"FR",currencyCode:(PAY_CUR==="usd"?"USD":"EUR"),merchantCapabilities:["supports3DS"],
            supportedNetworks:["visa","masterCard","amex","cartesBancaires","maestro"],
            total:{label:_t(lang,"Pass Sargasses","Sargasses Pass","Pase Sargazo"),amount:(cents/100).toFixed(2)},
            requiredBillingContactFields:["email"]})
          setPayBusy(true);setPayError("")
          track("sg_pay_wallet_start",{plan:payPlanRef.current,provider:"mollie",method:"applepay_native",pass:_pc?_pc.pass:null})
          ses.onvalidatemerchant=async(ev)=>{
            try{
              const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"applepay_session",validationUrl:ev.validationURL})})
              const sess=await r.json().catch(()=>null)
              if(!r.ok||!sess||sess.error)throw new Error("validation")
              ses.completeMerchantValidation(sess)
            }catch(_){try{ses.abort()}catch(__){}; walletRedirect("applepay") /* domaine pas validé chez Mollie → redirect de secours */}
          }
          ses.onpaymentauthorized=async(ev)=>{
            try{
              const token=JSON.stringify(ev.payment.token)
              const apEmail=(ev.payment.billingContact&&ev.payment.billingContact.emailAddress)||email||""
              const body=_pc
                ?{action:"create_payment",applePayPaymentToken:token,pass:_pc.pass,cents:_pc.cents,email:apEmail,source:source||"unknown",lang,referredBy:sgReferredBy(),myReferralCode:sgMyReferralCode(),consent:{accepted:true,v:"2026-06-29",lang}}
                :{action:"create_subscription",applePayPaymentToken:token,plan:payPlanRef.current,email:apEmail,source:source||"unknown",lang,referredBy:sgReferredBy(),myReferralCode:sgMyReferralCode()}
              const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
              const d=await r.json().catch(()=>({}))
              if(!r.ok||d.error||!d.paymentId){ses.completePayment(window.ApplePaySession.STATUS_FAILURE);throw new Error(d.error||"payment failed")}
              const cr=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
              const cd=await cr.json().catch(()=>({}))
              if(!cd.paid){ses.completePayment(window.ApplePaySession.STATUS_FAILURE);throw new Error("not paid")}
              ses.completePayment(window.ApplePaySession.STATUS_SUCCESS)
              if(apEmail){try{localStorage.setItem("sg_email",apEmail)}catch(_){}}
              if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000));track("sg_conversion",{session_id:d.paymentId,method:"applepay",plan:_pc.pass,pass_days:_pc.days})}
              else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",apEmail);track("sg_conversion",{session_id:d.paymentId,method:"applepay",plan:payPlanRef.current})}
              setPayBusy(false);onActivated?.();onClose()
            }catch(e){setPayBusy(false);setPayError(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."));try{setPayStep(true)}catch(_){};track("sg_pay_onsite_error",{provider:"mollie",method:"applepay_native",message:String((e&&e.message)||"").slice(0,90)})}
          }
          ses.oncancel=()=>{setPayBusy(false)}
          ses.begin()
          return
        }catch(_){ /* échec init ApplePaySession → fallback redirect ci-dessous */ }
      }
    }
    // ── Fallback / Google Pay : redirect Mollie hébergé (marche sans domaine validé) ──
    walletRedirect(method)
  },[lang,source,onActivated,onClose,walletRedirect,consentFlag,consentOk])
  const startCheckout=useCallback(async(plan,via)=>{
    passCtxRef.current=null // entrée ABONNEMENT : ce n'est pas un pass one-time
    if(PAY_PROVIDER==="paypal"){payPlanRef.current=plan;track("sg_checkout_redirect",{plan,source:source||"unknown",destination:"paypal",via});setPayStep(true);return}
    if(PAY_CAPTURE_ONLY){payPlanRef.current=plan;track("sg_checkout_redirect",{plan,source:source||"unknown",destination:"capture",via});setPayStep(true);return}
    // Checkout 100% ON-SITE — plus de redirect off-site buy.stripe.com. En cas
    // d'échec de montage (réseau lent / Stripe.js bloqué), erreur + « Réessayer »
    // DANS l'overlay (recharge propre) : on ne quitte jamais le domaine.
    const onsiteError=(why)=>{
      track("sg_pay_onsite_fail",{plan,source:source||"unknown",via:via+"_"+why})
      setPayError(_t(lang,"Le paiement sécurisé n'a pas pu démarrer. Vérifie ta connexion et réessaie.","Secure checkout couldn't start. Check your connection and retry.","El pago seguro no pudo iniciarse. Revisa tu conexión y reinténtalo."))
    }
    payPlanRef.current=plan
    // Arme la récupération de panier abandonné (ex-effet de bord de stripeUrlWith) :
    // la bannière de relance lit sg_checkout_abandoned.
    try{const _em=localStorage.getItem("sg_email")||"";localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email:_em,ts:Date.now()}))}catch(_){}
    setPayError("")
    track("sg_checkout_redirect",{plan,source:source||"unknown",destination:"onsite",via})
    setPayStep(true) // révèle l'étape (le formulaire pré-monté est déjà prêt ou boote)
    const t0=Date.now()
    try{
      // Le prewarm a déjà tout lancé à l'ouverture du modal. Budget large :
      // l'étape est visible avec spinner ; en cas d'échec → erreur + réessayer.
      await Promise.race([
        payPrewarmPromiseRef.current||Promise.reject(new Error("no prewarm")),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error("prewarm timeout")),20000)),
      ])
      track("sg_pay_onsite_open",{plan,via,ms:Date.now()-t0,ready:payReadyRef.current})
      // L'élément monte (ou est monté) ; si ready n'arrive pas → erreur in-place.
      setTimeout(()=>{
        if(payStepRef.current&&!payReadyRef.current&&payPlanRef.current===plan){
          try{console.error("sg_onsite_slow_element")}catch(_){}
          onsiteError("slow")
        }
      },20000)
    }catch(e){
      try{console.error("sg_onsite_mount_fail",e)}catch(_){}
      onsiteError("fallback")
    }
  },[source,lang])
  // A/B test pw_cta_order KILLED 2026-06-09 (scheduled ab-evaluate run):
  // sg_sample_start fired 0 times across 10,738 sessions over ~7 weeks. The
  // sample_first JSX branches + ctaOrder/sampleAvailable consts were removed
  // 2026-06-10 (dead-code cleanup) — paid-first (control) is the only layout.
  // Stripe Prelude A/B (pw_prelude): control=direct redirect (v1), prelude=2-step
  // micro-interstitial inside modal. Design v2 bet #2 — addresses the 50% drop
  // measured at redirect→payment by showing "exactly what happens" (plan summary,
  // timeline, trust row) before the tab navigates to buy.stripe.com.
  // pw_prelude HARVESTED 2026-06-18 → inlined to control "direct". ab-eval 28j :
  // prelude=0% (n=210) vs direct=0.79% (n=252) — l'interstitiel ajoute une étape
  // sans bénéfice mesurable (cf. methodo [[reference_ab_tests]] : conversion non
  // concluable à ce traffic, on RÉCOLTE le bras simple en tête). Défaut = chemin
  // direct (plus court, en tête). Réversible : restaurer abVariant("pw_prelude",…).
  const preludeVariant="direct"
  // A/B pw_scene : le paywall comme CONTINUATION du monde (en-tête golden-hour + Veilleur +
  // promesse) au lieu d'un mur sombre plat — cible la fuite modal→CTA 2%. N'habille QUE le
  // shell, AUCUN changement à la logique de paiement. Mesurable (modal_open/cta identiques).
  const scenePay=(()=>{try{const s=window.location.search;if(/[?&]pwscene=1/.test(s))return true;if(/[?&]pwscene=0/.test(s))return false;return abVariant("pw_scene",["control","scene"],[.5,.5])==="scene"}catch(_){return false}})()
  // pw_constel : le paywall-constellation golden-hour (niveau home) remplace le hero
  // scenePay. PROMU EN DÉFAUT (verdict design fondateur : la premium DOIT être au niveau
  // home, pas un mur sombre A/B-gaté à une minorité) → 85% voient la scène golden-hour,
  // 15% holdout (mur sombre) = filet sécurité-revenu mesurable. ?pwconstel=0 force le holdout.
  const pwConstel=(()=>{try{const q=window.location.search;if(/[?&]pwconstel=1/.test(q))return true;if(/[?&]pwconstel=0/.test(q))return false;return abVariant("pw_constel",["control","constel"],[.15,.85])==="constel"}catch(_){return false}})()
  // A/B pw_comic — REFONTE PAYWALL « COMIC-BOOK / BD » (PRODUCT.md §6, pivot 19/06).
  // Tue « le paywall blanc générique » (cards translucides sur vert sombre) : remplace
  // TOUT le pitch + l'action par une scène golden-hour comic + cases BD paper/ink (mêmes
  // tokens .lc- que ChasseDetail). Asset validé = design/proto-paywall-comic.html. NE TOUCHE
  // PAS la logique de paiement : le CTA appelle startCheckout(effectivePlan,"comic") inchangé,
  // l'overlay payStep on-site (rendu hors panel) reste monté.
  // PROMU EN DÉFAUT 2026-06-19 (rendu WebKit mobile vérifié OK, 0 erreur JS, smoke) : tous
  // les visiteurs ont le paywall comic — un seul monde, fin de la roulette. Override debug
  // ?pwcomic=0 = revient au PremiumModal legacy (rollback revenu instantané si besoin).
  const pwComic=(()=>{try{return !/[?&]pwcomic=0/.test(window.location.search)}catch(_){return true}})()
  // A/B pw_world — skin « CONTINUITÉ DU MONDE SVG » (gagnant jury). Quand actif, REMPLACE
  // ComicPaywall par WorldPaywall (mêmes props, ZÉRO logique de paiement touchée : le CTA
  // appelle startCheckout(effectivePlan,"world") inchangé). PUBLIÉ 100% (GO fondateur 22/06
  // « passe direct à 100% ») : WorldPaywall = LE paywall par défaut, remplace ComicPaywall pour
  // tous. ROLLBACK INSTANTANÉ = ?pwworld=0 (force le contrôle ComicPaywall) ; surveiller le MRR
  // Stripe (daily-metrics). Asset : design/wow-candidates/paywall-world-continuity.html.
  const pwWorld=(()=>{try{if(/[?&]pwworld=0/.test(window.location.search))return false}catch(_){}; return true})()
  // Vérif d'abo existant (PWA installée après paiement) — extraite en callback pour
  // que les deux skins (comic + classique) la partagent sans dupliquer la logique.
  const verifyExistingSub=useCallback(()=>{
    track("sg_premium_already_click",{source:source||"unknown"})
    const em=prompt(_t(lang,"Entre l'email utilisé pour ton abonnement :","Enter the email used for your subscription:","Introduce el email usado para tu suscripción:"))
    if(!em||!em.includes("@"))return
    sgVerifySub(em).then(d=>{
      if(d.active){
        // Pass one-time : accès TIME-BOXÉ (passEnd en ms) — on pose sg_premium_pass_end,
        // PAS le flag permanent sg_premium (un pass n'est pas un abo à vie). Abo = inchangé.
        if(d.passEnd&&d.kind==="pass"){localStorage.setItem("sg_premium_pass_end",String(d.passEnd));localStorage.setItem("sg_premium_email",em);localStorage.setItem("sg_email",em)}
        else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",em);if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))}
        track("sg_premium_already_success",{source:source||"unknown"});onActivated?.();onClose()}
      else{track("sg_premium_already_failed",{reason:d.reason||d.error||"inactive"})
        sgToast({tone:"error",title:_t(lang,"Aucun abonnement trouvé","No subscription found","No se encontró suscripción"),msg:_t(lang,"Vérifie l'adresse, ou écris-moi à "+SUPPORT_EMAIL+".","Check the address, or write to me at "+SUPPORT_EMAIL+".","Verifica la dirección, o escríbeme a "+SUPPORT_EMAIL+".")})}
    }).catch(e=>{track("sg_premium_already_failed",{reason:e?.message||"network"})
      sgToast({tone:"error",title:_t(lang,"Connexion impossible","Connection issue","Sin conexión"),msg:_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})})
  },[lang,source,onActivated,onClose])
  // A/B pw_pass : storefront « paie à l'usage » (passes one-time) en tête du paywall. ?pwpass=1/0.
  // PASS-ONLY + MOLLIE PARTOUT (2026-06-26) : le modèle abo est abandonné (jamais vendu à 49€,
  // mismatch touriste/saisonnier, + wallets on-site = one-time only). PassOffer est désormais
  // MULTI-DEVISE (catalogue eur/usd, prix $ pour les régions touristes) et 100% on-site Mollie
  // (zéro lien buy.stripe.com) → il rend correctement sur TOUTES les régions, EUR comme USD.
  // pwPass défaut = ON (100% pass). ?pwpass=0 = échappe vers l'ancien paywall abo (secours).
  const pwPass=(()=>{try{const q=window.location.search;if(/[?&]pwpass=1/.test(q))return true;if(/[?&]pwpass=0/.test(q))return false;return abVariant("pw_pass",["control","pass"],[0,1])==="pass"}catch(_){return true}})()
  // Paiement on-site one-time des passes — OFF par défaut (le redirect reste le défaut qui marche). ?passonsite=1 pour live-test carte.
  // FORCÉ ON-SITE (2026-06-24) : Stripe est mort → les liens off-site buy.stripe.com
  // de PassOffer redirigeaient vers un checkout cassé en sautant la capture. Défaut
  // passé [1,0]→[0,1] : tout pass passe par passCtxRef/setPayStep (capture maintenant,
  // Mollie create_payment au go-live). ?passonsite=0 force l'ancien off-site (mort).
  const passOnsite=(()=>{try{const q=window.location.search;if(/[?&]passonsite=1/.test(q))return true;if(/[?&]passonsite=0/.test(q))return false;return abVariant("pw_pass_onsite",["off","on"],[0,1])==="on"}catch(_){return false}})()
  // Mode PASS-ONLY effectif : on n'affiche QUE PassOffer (sombre) et on masque tout l'UI
  // abo (WorldPaywall/ComicPaywall + bloc plans). En capture (PAY_CAPTURE_ONLY) on garde
  // l'ancien flux email-offert (passOnly=false → l'UI abo/capture s'affiche normalement).
  const passOnly=pwPass&&!PAY_CAPTURE_ONLY
  // A/B pw_season : surface le SKU « pass saison » dormant (19,99 € paiement UNIQUE,
  // 6 mois d'accès, sans abo) comme alternative dans ComicPaywall. EUR uniquement
  // (allowlist serveur pay_once = [799..2499]¢ ; 1999 OK). Cash d'avance + zéro churn.
  // Réversible ?pwseason=0 ; ?pwseason=1 force. Chemin pay_once on-site déjà éprouvé (p30).
  const pwSeason=!IS_NEW_REGION&&(()=>{try{const q=window.location.search;if(/[?&]pwseason=1/.test(q))return true;if(/[?&]pwseason=0/.test(q))return false;return abVariant("pw_season",["control","season"],[.5,.5])==="season"}catch(_){return false}})()
  // A/B pw_trippass (USD only) : propose un accès UNIQUE 7 jours (one-time,
  // aligné séjour, sans abonnement) EN PLUS de l'abo — répond au mismatch
  // abo-mensuel/touriste-5-jours (verdict chantier USA). Inerte si pas de
  // LINK_TRIP. Override URL ?pwtrip=1/0 pour QA. Le CTA Trip Pass a son PROPRE
  // chemin (startTripPass) : ZÉRO contact avec effectivePlan/stripeLinkFor.
  // 2026-06-17 — Trip Pass RÉACTIVÉ mais 100% ON-SITE : PaymentIntent one-time
  // (create-checkout.php action:pay_once, devise USD par région), JAMAIS de
  // redirect buy.stripe.com. Gaté aux régions USD avec un prix trip parsable :
  // récupère l'abandon ~$327/30j de la page hébergée + capture email → relance
  // possible (recover-abandoned-cart.cjs). Override QA ?pwtrip=1/0. MQ/GP (EUR)
  // n'affichent jamais ce bloc (PRICE_TRIP null → tripAB false).
  const tripAB=(()=>{try{
    if(!(IS_NEW_REGION&&REGION.currency==="USD"&&TRIP_CENTS>0))return false
    const q=window.location.search
    if(/[?&]pwtrip=1/.test(q))return true
    if(/[?&]pwtrip=0/.test(q))return false
    return true
  }catch(_){return false}})()
  // Trip Pass ON-SITE : même collecte de carte (SetupIntent → Payment Element)
  // que l'abo, puis facturation UNE fois via action:pay_once (branche _pc de
  // doSubscribe). passCtxRef porte cents/devise/jours pour l'écran de paiement.
  const startTripPass=useCallback(()=>{
    if(TRIP_CENTS<=0)return
    passCtxRef.current={pass:"trip7",cents:TRIP_CENTS,days:7,cur:"usd"}
    try{track("sg_pass_cta",{pass:"trip7",cents:TRIP_CENTS,source:source||"unknown",onsite:1,kind:"trip"})}catch(_){}
    // Arme la relance panier abandonné (la bannière lit sg_checkout_abandoned).
    try{const _em=localStorage.getItem("sg_email")||"";localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email:_em,ts:Date.now()}))}catch(_){}
    setPayStep(true)
  },[source,setPayStep])
  // ── Trip Pass EUR (MQ/GP) — MIROIR du Trip Pass USD ci-dessus ────────────────
  // Accès UNIQUE 7 jours, 4,99 € one-time (EUR_TRIP_CENTS=499), sans abonnement.
  // EUR uniquement (!IS_NEW_REGION) : les régions USD utilisent tripAB/startTripPass.
  // A/B pw_trippass_eur (override ?pwtripeur=1/0). Chemin de checkout SÉPARÉ de
  // l'abo (passCtxRef + action:pay_once, devise EUR) — ZÉRO contact avec
  // effectivePlan/stripeLinkFor. 499¢ DOIT être dans l'allowlist serveur pay_once
  // EUR. Le pass off-site historique (PassOffer/pwPass, p7/p30 799¢+) reste intact.
  const tripEurAB=!IS_NEW_REGION&&(()=>{try{
    const q=window.location.search
    if(/[?&]pwtripeur=1/.test(q))return true
    if(/[?&]pwtripeur=0/.test(q))return false
    return abVariant("pw_trippass_eur",["control","trip"],[1,0])==="trip"
  }catch(_){return false}})()
  const startTripPassEur=useCallback(()=>{
    passCtxRef.current={pass:"trip7",cents:EUR_TRIP_CENTS,days:7,cur:"eur"}
    try{track("sg_pass_cta",{pass:"trip7",cents:EUR_TRIP_CENTS,source:source||"unknown",onsite:1,kind:"trip"})}catch(_){}
    try{const _em=localStorage.getItem("sg_email")||"";localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email:_em,ts:Date.now()}))}catch(_){}
    setPayStep(true)
  },[source,setPayStep])
  const[showPrelude,setShowPrelude]=useState(false)
  // Compute upcoming dates for the Prelude ledger
  const _preludeDates=(()=>{
    const today=new Date()
    const remindDate=new Date(today.getTime()+5*24*3600*1000)
    const chargeDate=new Date(today.getTime()+7*24*3600*1000)
    const fmt=d=>d.toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{day:"numeric",month:"long"})
    return{remind:fmt(remindDate),charge:fmt(chargeDate)}
  })()
  // Seasonal urgency — sargassum season is April-September
  const now=new Date()
  const seasonStart=new Date(now.getFullYear(),3,20) // ~20 April
  const daysToSeason=Math.max(0,Math.ceil((seasonStart-now)/(1000*60*60*24)))
  const seasonMsg=daysToSeason>0
    ?_t(lang,`La saison commence dans ${daysToSeason} jours`,`Season starts in ${daysToSeason} days`,`La temporada empieza en ${daysToSeason} días`)
    :_t(lang,"La saison des sargasses est là","Sargassum season is here","La temporada de sargazo ya está aquí")

  // ── pw_hot_intent : paywall in-scene ancré plage (hot intent + beach ctx) ──
  // A/B 50/50 vs cold modal. Override ?pwhot=1/0. Actif SEULEMENT si source
  // est hot-intent ET que beach est disponible dans le contexte courant.
  const HOT_INTENT_SRCS=["forecast_lock","forecast_cta","forecast_scrub","forecast_beat","urgency_banner","list_forecast_lock","rel_hot_cta","beach_dive_footer"]
  const _isHot=!!(beach&&HOT_INTENT_SRCS.includes(source||""))
  const pwHot=_isHot&&(()=>{try{const q=window.location.search;if(/[?&]pwhot=1/.test(q))return true;if(/[?&]pwhot=0/.test(q))return false;return abVariant("pw_hot_intent",["control","hot"],[.5,.5])==="hot"}catch(_){return false}})()
  if(pwHot&&beach){
    const _st=beach.status||"clean"
    const _stCol=_st==="clean"?"#22C55E":_st==="moderate"?"#E8A800":"#E8522A"
    const _stLbl=_st==="clean"?_t(lang,"propre aujourd'hui","clean today","limpia hoy"):_st==="moderate"?_t(lang,"modéré","moderate","moderada"):_t(lang,"à éviter","avoid","evitar")
    const _sargId=BEACH_TO_SARG?.[beach.id]
    const _fc=_sargId?sargData?.weekly?.[_sargId]?.forecast:null
    let _nextDeg=null
    if(_fc&&_fc.length>=2){const RANK={clean:0,moderate:1,avoid:2};const _t0=RANK[_fc[0]?.status]??0;for(let i=1;i<=5&&i<_fc.length;i++){const r=RANK[_fc[i]?.status];if(r!=null&&r>_t0){try{const dow=new Date((_fc[i].date||"")+"T12:00:00Z").toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long"});_nextDeg={when:dow,status:_fc[i].status}}catch(_){}break}}}
    return(
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={_t(lang,"Alerte sargasses","Sargassum alert","Alerta de sargazo")} style={{position:"fixed",inset:0,zIndex:1100,overflow:"hidden"}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block"}} viewBox="0 0 390 720" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="hiSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2e1a5e"/><stop offset=".46" stopColor="#6a2f9e"/><stop offset=".74" stopColor="#6a2f9e"/><stop offset="1" stopColor="#ff9b3d"/></linearGradient>
            <linearGradient id="hiSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient>
            <radialGradient id="hiSun" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".95"/><stop offset=".4" stopColor="#FFD884" stopOpacity=".55"/><stop offset="1" stopColor="#FFD884" stopOpacity="0"/></radialGradient>
            <linearGradient id="hiLand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1C3138"/><stop offset="1" stopColor="#16242A"/></linearGradient>
            <radialGradient id="hiGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFE6A8" stopOpacity=".5"/><stop offset="1" stopColor="#FFE6A8" stopOpacity="0"/></radialGradient>
          </defs>
          <rect width="390" height="430" fill="url(#hiSky)"/>
          <circle cx="262" cy="300" r="120" fill="url(#hiSun)"/>
          <circle cx="262" cy="300" r="30" fill="#FFE6A8" opacity=".9"/>
          <path d="M0 300 Q40 286 86 296 L120 300 Z" fill="#0E1F25" opacity=".8"/>
          <path d="M286 282 q14 -40 30 -2 q8 22 4 22 l-44 0 q-2 -10 10 -18 Z" fill="#12262B" opacity=".92"/>
          <rect x="0" y="300" width="390" height="240" fill="url(#hiSea)"/>
          <path d="M232 304 L292 304 L320 540 L204 540 Z" fill="#FFD884" opacity=".10"/>
          <ellipse cx="262" cy="324" rx="40" ry="4" fill="#FFD884" opacity=".30"/>
          <ellipse cx="262" cy="356" rx="58" ry="4.5" fill="#FFD884" opacity=".16"/>
          <path d="M0 470 Q150 446 390 486 L390 720 L0 720 Z" fill="url(#hiLand)"/>
          <path d="M0 470 Q150 446 390 486" fill="none" stroke="#FFD884" strokeWidth="1.4" opacity=".26"/>
          <circle cx="116" cy="372" r="52" fill="url(#hiGlow)"/>
          <circle cx="116" cy="372" r="7.5" fill={_stCol} stroke="#06121A" strokeWidth="1.4"/>
          <circle cx="116" cy="372" r="13" fill="none" stroke="#FFE6A8" strokeWidth="1.2" opacity=".6"/>
        </svg>
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(4,12,16,0) 0%,rgba(4,12,16,.22) 34%,rgba(4,12,16,.70) 64%,rgba(4,12,16,.93) 100%)"}}/>
        <button onClick={()=>{track("sg_premium_modal_close",{source:source||"unknown",via:"hot_close"});onClose()}}
          style={{position:"absolute",top:"calc(14px + env(safe-area-inset-top))",right:14,width:34,height:34,borderRadius:"50%",
            background:"rgba(10,23,20,.55)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.18)",
            color:"#fff",fontSize:18,cursor:"pointer",zIndex:10,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        <div style={{position:"absolute",left:0,right:0,bottom:0,padding:"22px 22px calc(26px + env(safe-area-inset-bottom))",color:"#EAF7F4"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,216,132,.12)",border:"1px solid rgba(255,216,132,.30)",borderRadius:999,padding:"6px 12px 6px 9px",marginBottom:16}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:_stCol,boxShadow:`0 0 0 3px ${_stCol}38`}}/>
            <span style={{font:"800 12.5px/1 'Bricolage Grotesque',system-ui,sans-serif",letterSpacing:".01em"}}>{beach.name}</span>
            <span style={{fontSize:11,opacity:.7,fontWeight:600}}>· {_stLbl}</span>
          </div>
          <div className="anton" style={{fontSize:28,lineHeight:1.06,margin:"0 0 16px",textShadow:"0 2px 18px rgba(0,0,0,.45)"}}>
            {_t(lang,<>Le Veilleur surveille <span style={{color:"#FFC72C"}}>{beach.name}</span> et te prévient.</>,<>The Watcher monitors <span style={{color:"#FFC72C"}}>{beach.name}</span> and alerts you.</>,<>El Vigía vigila <span style={{color:"#FFC72C"}}>{beach.name}</span> y te avisa.</>)}
          </div>
          {_nextDeg&&(
            <div style={{display:"flex",gap:13,alignItems:"flex-start",background:"rgba(232,82,42,.13)",border:"1px solid rgba(232,82,42,.34)",borderRadius:15,padding:"14px 15px",marginBottom:18}}>
              <span style={{fontSize:19,lineHeight:1,flexShrink:0,marginTop:1}}>⚠️</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{font:"800 13px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#FFB59E",marginBottom:3}}>
                  {_t(lang,`Dégradation prévue : ${_nextDeg.when}`,`Forecast degradation: ${_nextDeg.when}`,`Desmejora prevista: ${_nextDeg.when}`)}
                </div>
                <div style={{font:"600 12.5px/1.45 system-ui,sans-serif",color:"rgba(234,247,244,.92)"}}>
                  {_t(lang,"Le satellite voit les sargasses arriver. Tu seras prévenu avant que ça tourne.","Satellite detects incoming sargassum. You'll be alerted before conditions change.","El satélite detecta sargazo llegando. Recibirás alerta antes del cambio.")}
                </div>
                <span style={{display:"block",marginTop:6,font:"600 10.5px/1 system-ui,sans-serif",color:"rgba(234,247,244,.55)",letterSpacing:".02em"}}>
                  {/* Chiffre RÉEL injecté au build (__REL, même source que /fiabilite/ + badge rel_hot_cta).
                      JAMAIS de "80%" hardcodé : on publie le clean-rate par régime (cf regimeReliability.note). */}
                  {(()=>{
                    if(__REL&&typeof __REL.cleanPct==="number"){const reg=__REL.regime==="high"?_t(lang,"saison haute","high season","temporada alta"):_t(lang,"saison calme","calm season","temporada tranquila");return _t(lang,`Donnée Copernicus · ${__REL.cleanPct}% « mer propre » vérifiées · ${reg}`,`Copernicus data · ${__REL.cleanPct}% “clean water” verified · ${reg}`,`Datos Copernicus · ${__REL.cleanPct}% “agua limpia” verificados · ${reg}`)}
                    if(__REL&&typeof __REL.global==="number")return _t(lang,`Donnée Copernicus · ${__REL.global}% justes / 30 j`,`Copernicus data · ${__REL.global}% accurate / 30d`,`Datos Copernicus · ${__REL.global}% exactos / 30d`)
                    return _t(lang,"Donnée Copernicus · backtest quotidien","Copernicus data · daily backtest","Datos Copernicus · backtest diario")
                  })()}
                </span>
              </div>
            </div>
          )}
          <button onClick={()=>startCheckout("monthly","hot_intent")}
            style={{display:"block",width:"100%",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"center",borderRadius:15,padding:"16px 18px",
              background:"linear-gradient(135deg,#FFC72C,#E8A800)",color:"#1A2B26",boxShadow:"0 10px 30px rgba(232,168,0,.30)"}}>
            <div style={{font:"800 16.5px/1 'Bricolage Grotesque',system-ui,sans-serif",letterSpacing:".005em"}}>
              {_t(lang,`Activer l'alerte sur ${beach.name}`,`Activate alert on ${beach.name}`,`Activar alerta en ${beach.name}`)}
            </div>
            <div style={{font:"600 12px/1 system-ui,sans-serif",opacity:.78,marginTop:3}}>
              {PAY_CAPTURE_ONLY?_t(lang,"7 jours premium offerts · juste ton email","7 days premium on us · just your email","7 días premium gratis · solo tu email"):_t(lang,"Pass dès 7,99 € · paiement unique, sans abonnement","Pass from €7.99 · one-time, no subscription","Pase desde 7,99 € · pago único, sin suscripción")}
            </div>
          </button>
          <div style={{textAlign:"center",marginTop:13,font:"600 10.5px/1 system-ui,sans-serif",color:"rgba(234,247,244,.5)",letterSpacing:".015em"}}>
            {PAY_CAPTURE_ONLY?_t(lang,"Sans carte · juste ton email","No card · just your email","Sin tarjeta · solo tu email"):_t(lang,"Sans engagement · Paiement sécurisé "+PAY_LABEL,"No commitment · Secure "+PAY_LABEL+" payment","Sin compromiso · Pago seguro "+PAY_LABEL)}
          </div>
        </div>
      </div>
    )
  }

  return(
    <>
      <div className="backdrop" onClick={(e)=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});const x=e.clientX,y=e.clientY;onClose();/* pass-through : si le clic tombe pile sur un pin de la carte (sous le backdrop), ouvrir cette plage au lieu de juste fermer — sinon le clic paraît "mort" */requestAnimationFrame(()=>{try{const el=document.elementFromPoint(x,y);const pin=el&&el.closest&&el.closest(".leaflet-marker-icon");if(pin)pin.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}))}catch(_){}})}}/>
      <div ref={panelRef} className="sg-modal-panel" role="dialog" aria-modal="true" aria-label={_t(lang,"Prévisions premium","Premium forecast","Pronóstico premium")} onTouchStart={onTouchStartModal} onTouchMove={onTouchMoveModal} onTouchEnd={onTouchEndModal} style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:1100,
        // Refonte CONTINUATION DE SCÈNE (arm constellation = défaut) : le golden-hour
        // descend à travers tout le modal (ciel → mer profonde → nuit) → la premium
        // est UNE scène continue, pas une feuille sombre. Holdout garde le sombre.
        /* halftone Ben-Day comic (réf Spider-Verse) par-dessus le dégradé — texte intact */
        background:passOnly
          ? "linear-gradient(145deg,#190c2c,#120821)"
          : pwComic
          ? "radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 0 0/9px 9px,radial-gradient(rgba(13,11,20,.12) 1.4px,transparent 1.5px) 4.5px 4.5px/9px 9px,linear-gradient(170deg,#ff9b6b,#ff6f9d 30%,#ffb36b 68%,#ff8a3d)"
          : "radial-gradient(rgba(255,255,255,.05) 1.2px,transparent 1.3px) 0 0/8px 8px,radial-gradient(rgba(255,210,90,.06) 1.2px,transparent 1.3px) 4px 4px/8px 8px,"+(pwConstel?"linear-gradient(180deg,#2e1a5e 0%,#3a1f63 20%,#241246 52%,#160a26 100%)":"linear-gradient(145deg,#241246,#160a26)"),
        borderRadius:"24px 24px 0 0",padding:"28px 24px 20px",
        color:(pwComic&&!passOnly)?"#0d0b14":"#e6edf3",maxHeight:"85vh",overflowX:"hidden",overflowY:"auto",
      }}>
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        {/* Close X top-right — resolves Design feedback "no close affordance
            visible, users dismiss by backdrop tap". Sticky so always reachable
            even when modal is scrolled. */}
        <button
          aria-label={_t(lang,"Fermer","Close","Cerrar")}
          onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"close_x"});onClose()}}
          style={{position:"absolute",top:14,right:14,width:(pwComic&&!passOnly)?34:30,height:(pwComic&&!passOnly)?34:30,
            borderRadius:"50%",background:(pwComic&&!passOnly)?"#ffd23f":"rgba(255,255,255,.08)",border:(pwComic&&!passOnly)?"2.5px solid #0d0b14":"none",
            color:(pwComic&&!passOnly)?"#0d0b14":"rgba(255,255,255,.7)",fontSize:18,cursor:"pointer",lineHeight:1,fontWeight:(pwComic&&!passOnly)?800:400,
            boxShadow:(pwComic&&!passOnly)?"2px 2px 0 #0d0b14":"none",forcedColorAdjust:"none",
            zIndex:6,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        {/* ── PASS-ONLY : seul storefront affiché (sombre, design A). onBuy → Mollie on-site :
            wallet (Apple/Google Pay) = paiement direct ; carte = écran de paiement (email+carte). ── */}
        {passOnly&&<PassOffer lang={lang} currency={PAY_CUR} community={pwSocial?__COMM:0} freshTs={pwFresh?_passUpdatedAt:null} onBuy={(item)=>{
          try{track("sg_pass_cta",{pass:item.pass,cents:item.c,source:source||"unknown",onsite:1,method:item.method||"card"})}catch(_){}
          passCtxRef.current={pass:item.pass,cents:item.c,days:item.days||(item.pass==="p30"?30:item.pass==="saison"?210:7),cur:PAY_CUR}
          if(item.method){payWithWallet(item.method)}else{setPayStep(true)}
        }}/>}
        {!passOnly&&pwComic&&pwWorld&&<WorldPaywall lang={lang} beach={beach} source={source}
          topName={_topName} topScore={_topScore} exSwitch={_exSwitch} wkend={_wkend}
          ctxName={_ctxName} ctxStatus={_ctxStatus} cleanCount={_cleanCount} totalCount={_totalCount}
          recordProof={_recordProof} allCalm={_allCalm} pwCalm={pwCalm}
          seasonMsg={seasonMsg} plan={plan} setPlan={setPlan} effectivePlan={effectivePlan} hasAnnual={hasAnnual}
          captureMode={PAY_CAPTURE_ONLY}
          onStart={()=>{track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown",skin:"world"});startCheckout(effectivePlan,"world")}}
          onAlready={verifyExistingSub}
          onB2B={()=>{try{track("sg_b2b_open",{source:source||"unknown"})}catch(_){}; setShowB2B(true)}}
          onSeason={(!PAY_CAPTURE_ONLY&&pwSeason)?(()=>{try{track("sg_pass_cta",{pass:"season",cents:2499,source:source||"unknown",onsite:1})}catch(_){}
            passCtxRef.current={pass:"season",cents:2499,days:210,cur:"eur"};setPayStep(true)}):undefined}
          onClose={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"world_close"});onClose()}}/>}
        {!passOnly&&pwComic&&!pwWorld&&<ComicPaywall lang={lang} beach={beach} source={source}
          topName={_topName} topScore={_topScore} exSwitch={_exSwitch} wkend={_wkend}
          ctxName={_ctxName} ctxStatus={_ctxStatus} cleanCount={_cleanCount} totalCount={_totalCount}
          recordProof={_recordProof} allCalm={_allCalm} pwCalm={pwCalm}
          seasonMsg={seasonMsg} plan={plan} setPlan={setPlan} effectivePlan={effectivePlan} hasAnnual={hasAnnual}
          captureMode={PAY_CAPTURE_ONLY}
          onStart={()=>{track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown",skin:"comic"});startCheckout(effectivePlan,"comic")}}
          onAlready={verifyExistingSub}
          onB2B={()=>{try{track("sg_b2b_open",{source:source||"unknown"})}catch(_){}; setShowB2B(true)}}
          onSeason={(!PAY_CAPTURE_ONLY&&pwSeason)?(()=>{try{track("sg_pass_cta",{pass:"season",cents:2499,source:source||"unknown",onsite:1})}catch(_){}
            passCtxRef.current={pass:"season",cents:2499,days:210,cur:"eur"};setPayStep(true)}):undefined}
          onClose={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"comic_close"});onClose()}}/>}
        {showB2B&&<B2BModal lang={lang} onClose={()=>setShowB2B(false)}/>}
        {!passOnly&&!pwComic&&(<>
        {!scenePay&&<div style={{borderTop:`3px solid ${C.gold}`,borderRadius:"3px 3px 0 0",
          margin:"-8px -24px 20px",padding:0}}/>}
        {!PAY_CAPTURE_ONLY&&pwPass&&<PassOffer lang={lang} currency={PAY_CUR} community={pwSocial?__COMM:0} freshTs={pwFresh?_passUpdatedAt:null} onBuy={(item)=>{try{track("sg_pass_cta",{pass:item.pass,cents:item.c,source:source||"unknown",onsite:1})}catch(_){}
          passCtxRef.current={pass:item.pass,cents:item.c,days:item.days||(item.pass==="p30"?30:item.pass==="saison"?210:7),cur:PAY_CUR}
          if(item.method){payWithWallet(item.method)}else{setPayStep(true)}}}/>}
        {/* A/B pw_scene : le paywall = CONTINUATION du monde golden-hour (Veilleur + promesse),
            pas un mur sombre plat. Calme (statique). Logique de paiement INCHANGÉE en dessous. */}
        {scenePay&&!pwConstel&&(<>
          <div style={{margin:"-12px -24px 0",position:"relative",overflow:"hidden"}}>
            <svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" style={{width:"100%",height:108,display:"block"}} aria-hidden="true">
              <defs><linearGradient id="pwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".48" stopColor="#155A5A"/><stop offset=".82" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient></defs>
              <rect width="400" height="120" fill="url(#pwSky)"/>
              {[-40,-20,0,20,40].map((a,i)=>(<path key={i} d="M200 116 L192 28 L208 28 Z" fill="#FFD884" opacity=".08" transform={"rotate("+a+" 200 116)"}/>))}
              <circle cx="200" cy="116" r="56" fill="#FFD884" opacity=".22"/><circle cx="200" cy="116" r="30" fill="#FFD884" opacity=".42"/>
              {miVeil(200,52,"#2A6B66","#3fd07f")}
            </svg>
            <div aria-hidden style={{position:"absolute",left:0,right:0,bottom:0,height:46,background:"linear-gradient(180deg,transparent,#190c2c)"}}/>
          </div>
          <div style={{textAlign:"center",margin:"6px 0 16px"}}>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",lineHeight:1.3}}>{_t(lang,"Le Veilleur garde ta côte à l'œil.","The Watchman keeps an eye on your coast.","El Vigía vigila tu costa.")}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.62)",marginTop:4}}>{_t(lang,"Chaque matin, tu sais — avant de charger la voiture.","Every morning you know — before you load the car.","Cada mañana lo sabes — antes de cargar el coche.")}</div>
          </div>
        </>)}

        {/* pw_constel — PAYWALL-CONSTELLATION golden-hour (niveau home). La scène
            d'accueil réincarnée : tes plages = points lumineux sur la mer, le Veilleur
            (humeur data-driven) veille, le compte propre LIVE gravé dans l'écume, une
            promesse calme-positive + une preuve du jour. Reveal one-shot à l'ouverture,
            zéro idle, reduced-motion = tout visible. Paiement INTOUCHÉ (CTA en aval). */}
        {pwConstel&&(()=>{
          const m=_constelMood,propres=_t(lang,"propres","clean","limpias")
          const fc=(()=>{try{return sargData?.weekly?.[_topBeach?.id]?.forecast}catch(_){return null}})()
          const spark=(Array.isArray(fc)&&fc.length>=2)?fc.slice(0,4).map((d,i)=>({x:148+i*38,y:101-(d.status==="clean"?0:d.status==="moderate"?5:9)})):null
          const sparkPath=spark?("M"+spark.map(p=>p.x.toFixed(0)+" "+p.y.toFixed(0)).join(" L")):null
          const guide=_constel.find(p=>p.top)
          const G={background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"}
          const promiseEl=_ctxName
            ?(lang==="es"?(<><span style={G}>{_ctxName}</span>. ¿Y mañana? Ya lo he visto.</>):lang==="en"?(<><span style={G}>{_ctxName}</span>. And tomorrow? I've already seen it.</>):(<><span style={G}>{_ctxName}</span>. Et demain ? Je l'ai déjà vu.</>))
            :_allCalm
              ?(lang==="es"?(<>Todo en calma. ¿Y <span style={G}>mañana</span>? Ya lo he visto.</>):lang==="en"?(<>All calm. And <span style={G}>tomorrow</span>? I've already seen it.</>):(<>Tout est calme. Et <span style={G}>demain</span> ? Je l'ai déjà vu.</>))
              :(lang==="es"?(<>Sabe dónde estará el mar <span style={G}>mañana</span>, no solo hoy</>):lang==="en"?(<>Know where the sea will be <span style={G}>tomorrow</span>, not just today</>):(<>Sache où sera la mer <span style={G}>demain</span>, pas juste aujourd'hui</>))
          const _pName=_ctxName||_topName, _pScore=_ctxScore||_topScore
          const _baseProof=(_pName&&_pScore)
            ?_t(lang,`${_pName} · ${_pScore}/100 · vérifié satellite`,`${_pName} · ${_pScore}/100 · satellite-verified`,`${_pName} · ${_pScore}/100 · verificado por satélite`)
            :_t(lang,"Toute ta côte · vérifiée 4×/jour · satellite","Your whole coast · checked 4×/day · satellite","Toda tu costa · 4×/día · satélite")
          // A/B pw_proof : au point de décision, remplace le snapshot du jour par
          // le PALMARÈS auditable (preuve « Airbnb » = note + volume + public).
          const proof=(pwProof&&_recordProof)||_baseProof
          return(<>
            <style>{`@keyframes pcDot{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}.pc-dot{animation:pcDot .42s ease-out both}@keyframes pcStar{0%{transform:scale(1)}45%{transform:scale(1.18)}100%{transform:scale(1)}}.pc-star{animation:pcStar .7s ease-out 1 both;transform-origin:center;transform-box:fill-box}@media(prefers-reduced-motion:reduce){.pc-dot,.pc-star{animation:none}}`}</style>
            <div style={{margin:"-12px -24px 0",position:"relative",overflow:"hidden"}}>
              <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" style={{width:"100%",height:142,display:"block"}} aria-hidden="true">
                <defs>
                  <linearGradient id="pcSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0B2230"/><stop offset=".48" stopColor="#155A5A"/><stop offset=".82" stopColor="#C97E3A"/><stop offset="1" stopColor="#F2B05E"/></linearGradient>
                  <linearGradient id="pcSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1A5852"/><stop offset="1" stopColor="#08251F"/></linearGradient>
                </defs>
                <rect width="400" height="150" fill="url(#pcSky)"/>
                <circle cx="200" cy="106" r="58" fill="#FFD884" opacity=".2"/><circle cx="200" cy="106" r="32" fill="#FFD884" opacity=".4"/>
                <rect y="106" width="400" height="44" fill="url(#pcSea)"/>
                <line x1="0" y1="106" x2="400" y2="106" stroke="#FFD884" strokeWidth="1" opacity=".5"/>
                <line x1="200" y1="106" x2="186" y2="150" stroke="#FFD884" strokeWidth="3" strokeDasharray="2 7" opacity=".28"/>
                <line x1="200" y1="106" x2="214" y2="150" stroke="#FFD884" strokeWidth="3" strokeDasharray="2 7" opacity=".28"/>
                {sparkPath&&<path d={sparkPath} fill="none" stroke="#FFE08A" strokeWidth="1.6" opacity=".55" strokeLinecap="round"/>}
                {guide&&<circle className="pc-star" cx={guide.x} cy={guide.y} r="9" fill={m.lens} opacity=".22"/>}
                {_constel.map((p,i)=>(<circle key={i} className="pc-dot" style={{animationDelay:(i*38)+"ms"}} cx={p.x} cy={p.y} r={p.top?4:2.4} fill={p.col}/>))}
                <g>{miVeil(200,48,m.wing,m.lens)}</g>
                <g><rect x="128" y="120" width="144" height="18" rx="9" fill="#120821" opacity=".4"/><text x="200" y="133" fontFamily="ui-monospace,monospace" fontSize="11" fill="#9ADCD4" opacity=".92" textAnchor="middle">{_cleanCount}/{_totalCount} {propres}</text></g>
              </svg>
              <div aria-hidden style={{position:"absolute",left:0,right:0,bottom:0,height:42,background:"linear-gradient(180deg,transparent,#190c2c)"}}/>
            </div>
            <div style={{textAlign:"center",margin:"8px 0 16px"}}>
              <div style={{fontSize:15.5,fontWeight:800,color:"#fff",lineHeight:1.32}}>{promiseEl}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:5}}>{proof}</div>
            </div>
          </>)})()}

        {/* ═══ STRIPE PRELUDE (Design v2 bet #2) ═══
            A/B variant "prelude": intercepts the paid CTA click and shows
            this 2nd screen INSIDE the modal — plan summary + dates timeline
            + 3 trust badges — before redirecting to Stripe. Addresses the
            50% drop measured at redirect→payment (users abandon when they
            see an unfamiliar buy.stripe.com URL after leaving the app).
            Back arrow returns to the paywall. Continue → actual redirect. */}
        {showPrelude&&(
        <div style={{position:"absolute",inset:0,zIndex:10,
          background:"linear-gradient(145deg,#190c2c,#120821)",
          borderRadius:"24px 24px 0 0",padding:"28px 24px 20px",overflowX:"hidden",overflowY:"auto",
          display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button
              aria-label={_t(lang,"Retour","Back","Atrás")}
              onClick={()=>{track("sg_prelude_back",{source:source||"unknown"});setShowPrelude(false)}}
              style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.08)",
                border:"none",color:"rgba(255,255,255,.85)",fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}>‹</button>
            <div style={{display:"flex",gap:4,flex:1}}>
              <span style={{flex:1,height:3,borderRadius:2,background:"rgba(255,199,44,.35)"}}/>
              <span style={{flex:1,height:3,borderRadius:2,background:"#FFC72C"}}/>
              <span style={{flex:1,height:3,borderRadius:2,background:"rgba(255,255,255,.12)"}}/>
            </div>
            <button
              aria-label={_t(lang,"Fermer","Close","Cerrar")}
              onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"prelude_close"});onClose()}}
              style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,.08)",
                border:"none",color:"rgba(255,255,255,.85)",fontSize:18,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"inherit"}}>×</button>
          </div>

          <div style={{fontFamily:"'Anton',sans-serif",fontSize:10.5,color:"#14C4B0",
            letterSpacing:".18em",textTransform:"uppercase",marginBottom:8}}>
            {/* USD : paiement on-site — « rediriger » serait faux (audit 2026-06-11).
                EUR : Payment Link = vraie redirection, copy d'origine (A/B intouchable). */}
            {NO_TRIAL
              ?_t(lang,"Avant de payer","Before you pay","Antes de pagar")
              :_t(lang,"Avant de te rediriger","Before we redirect you","Antes de redirigirte")}
          </div>
          <h2 style={{fontFamily:"'Anton',sans-serif",fontSize:26,lineHeight:1.05,letterSpacing:"-.01em",color:"#fff",margin:"0 0 14px"}}>
            {lang==="es"?<>Esto es exactamente<br/>lo que pasa.</>:lang==="en"?<>Here's exactly<br/>what happens.</>:<>Voilà exactement<br/>ce qui se passe.</>}
          </h2>

          {/* Plan summary card */}
          <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",
            borderRadius:16,padding:14,marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,
              paddingBottom:12,borderBottom:"1px solid rgba(255,255,255,.08)",marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>
                  {NO_TRIAL
                    ?(effectivePlan==="annual"?_t(lang,"Annuel — accès immédiat","Annual — instant access","Anual — acceso inmediato"):_t(lang,"Mensuel — accès immédiat","Monthly — instant access","Mensual — acceso inmediato"))
                    :(effectivePlan==="annual"?_t(lang,"Annuel · 7 jours offerts","Annual · 7 days free","Anual · 7 días gratis"):_t(lang,"Mensuel · 7 jours offerts","Monthly · 7 days free","Mensual · 7 días gratis"))}
                </div>
                <div style={{fontWeight:500,color:"rgba(255,255,255,.55)",fontSize:11,marginTop:2}}>
                  {NO_TRIAL
                    ?(effectivePlan==="annual"?_t(lang,`${PRICE_YR}/an · annule en 2 clics`,`${PRICE_YR}/yr · cancel in 2 clicks`,`${PRICE_YR}/año · cancela en 2 clics`):_t(lang,`${PRICE_MO}/mois · annule en 2 clics`,`${PRICE_MO}/mo · cancel in 2 clicks`,`${PRICE_MO}/mes · cancela en 2 clics`))
                    :(effectivePlan==="annual"?(REGION_PAY?_t(lang,`Puis ${PRICE_YR}/an · annule en 1 clic`,`Then ${PRICE_YR}/yr · cancel anytime`,`Luego ${PRICE_YR}/año · cancela en 1 clic`):_t(lang,"Puis 49 €/an · annule en 1 clic","Then €49/yr · cancel anytime","Luego 49 €/año · cancela en 1 clic")):(REGION_PAY?_t(lang,`Puis ${PRICE_MO}/mois · annule en 1 clic`,`Then ${PRICE_MO}/mo · cancel anytime`,`Luego ${PRICE_MO}/mes · cancela en 1 clic`):_t(lang,"Puis 4,99 €/mois · annule en 1 clic","Then €4.99/mo · cancel anytime","Luego 4,99 €/mes · cancela en 1 clic")))}
                </div>
              </div>
              <div style={{fontFamily:"'Anton',sans-serif",fontSize:22,color:"#FFC72C",letterSpacing:"-.01em",textAlign:"right"}}>
                {NO_TRIAL?(effectivePlan==="annual"?PRICE_YR:PRICE_MO):(REGION_PAY?"$0":"0 €")}
                <div style={{fontFamily:"inherit",fontWeight:500,fontSize:11,color:"rgba(255,199,44,.7)",marginTop:2,letterSpacing:0}}>
                  {_t(lang,"aujourd'hui","today","hoy")}
                </div>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12.5}}>
              {(NO_TRIAL?[
                {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:_t(lang,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · accès complet immédiat`,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · full access right away`,`${effectivePlan==="annual"?PRICE_YR:PRICE_MO} · acceso completo ya`)},
                {k:_t(lang,"Chaque matin","Every morning","Cada mañana"),v:_t(lang,"Ta meilleure plage + alertes","Your best beach + alerts","Tu mejor playa + alertas")},
                {k:_t(lang,"Quand tu veux","Anytime","Cuando quieras"),v:_t(lang,"Annule en 2 clics","Cancel in 2 clicks","Cancela en 2 clics")},
              ]:[
                {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:REGION_PAY?_t(lang,"$0 · tu testes 7 jours","$0 · 7-day trial starts","$0 · empieza tu prueba de 7 días"):_t(lang,"0 € · tu testes 7 jours","€0 · 7-day trial starts","0 € · empieza tu prueba de 7 días")},
                {k:_preludeDates.remind,v:_t(lang,"Rappel · 2 jours avant la 1re charge","Reminder · 2 days before first charge","Recordatorio · 2 días antes del primer cobro")},
                {k:_preludeDates.charge,v:effectivePlan==="annual"?(REGION_PAY?_t(lang,`${PRICE_YR} · sauf si tu annules`,`${PRICE_YR} · unless you cancel`,`${PRICE_YR} · a menos que canceles`):_t(lang,"49 € · sauf si tu annules","€49 · unless you cancel","49 € · a menos que canceles")):(REGION_PAY?_t(lang,`${PRICE_MO} · sauf si tu annules`,`${PRICE_MO} · unless you cancel`,`${PRICE_MO} · a menos que canceles`):_t(lang,"4,99 € · sauf si tu annules","€4.99 · unless you cancel","4,99 € · a menos que canceles"))},
              ]).map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"rgba(255,255,255,.72)"}}>{r.k}</span>
                  <span style={{color:"#fff",fontWeight:600,textAlign:"right"}}>{r.v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                paddingTop:8,borderTop:"1px dashed rgba(255,255,255,.12)",marginTop:2}}>
                <span style={{color:"rgba(255,255,255,.72)"}}>{_t(lang,"À payer aujourd'hui","Due today","A pagar hoy")}</span>
                <span style={{color:"#22C55E",fontFamily:"'Anton',sans-serif",fontSize:15,letterSpacing:"-.01em"}}>{NO_TRIAL?(effectivePlan==="annual"?PRICE_YR:PRICE_MO):(REGION_PAY?"$0.00":"0,00 €")}</span>
              </div>
            </div>
          </div>

          {/* Trust row 3 columns */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
            {[
              {icon:"🛡",title:PAY_LABEL,sub:REGION_PAY?_t(lang,"Paiement sécurisé","Secure payment","Pago seguro"):_t(lang,"Paiement sécurisé EU","EU secure payment","Pago seguro UE")},
              {icon:"⏱",title:_t(lang,"Paiement unique","One-time","Pago único"),sub:_t(lang,"Sans abonnement","No subscription","Sin suscripción")},
              {icon:"✕",title:NO_TRIAL?_t(lang,"2 clics","2 clicks","2 clics"):_t(lang,"1 clic","1 click","1 clic"),sub:_t(lang,"Annule quand tu veux","Cancel anytime","Cancela cuando quieras")},
            ].map((t,i)=>(
              <div key={i} style={{padding:"10px 8px",borderRadius:10,
                background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",
                display:"flex",flexDirection:"column",alignItems:"center",gap:4,textAlign:"center"}}>
                <span style={{fontSize:18,color:"#14C4B0"}}>{t.icon}</span>
                <b style={{fontSize:10.5,color:"#fff",fontWeight:700}}>{t.title}</b>
                <span style={{fontSize:9.5,color:"rgba(255,255,255,.55)",lineHeight:1.3}}>{t.sub}</span>
              </div>
            ))}
          </div>

          {/* Continue to Stripe CTA — checkout in-app (fallback Payment Link) */}
          <button onClick={()=>{
            startCheckout(effectivePlan,"prelude")
          }} className="gbtn" style={{width:"100%",padding:14,borderRadius:14,border:"none",
            cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:15,lineHeight:1.15,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {NO_TRIAL
              ?_t(lang,"Continuer — paiement sécurisé","Continue to secure payment","Continuar — pago seguro")
              :_t(lang,"Continuer — paiement sécurisé","Continue to secure payment","Continuar — pago seguro")} →
          </button>
          <div style={{textAlign:"center",fontSize:10.5,color:"rgba(255,255,255,.48)",marginTop:10}}>
            {_t(lang,"Tu pourras toujours revenir en arrière.","You can always come back.","Siempre puedes volver atrás.")}
          </div>
        </div>
        )}

        {/* Seasonal eyebrow — Design v1 spec: gold dot + white text UPPERCASE tracking,
            replaces the old orange-on-dark badge which was unreadable (Design feedback #2).
            Pulsing dot = signal, text = fact. No box border competing with the card stack. */}
        <div style={{marginBottom:14,fontFamily:"'Anton',sans-serif",
          fontSize:10.5,color:"#FFC72C",letterSpacing:".14em",textTransform:"uppercase",
          display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",
            background:"#FFC72C",boxShadow:"0 0 8px rgba(255,199,44,.8)",
            animation:"pwDot 1.6s ease-in-out 1 both"}}/>
          <span>{seasonMsg}</span>
        </div>
        <style>{`@keyframes pwDot{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

        {/* Repositionnement (audit funnel) : le titre vendait "ta reco du matin"
            = exactement ce que le GRATUIT donne déjà (HeroReco) → cannibalisation,
            modal→CTA à 1,1%. On vend ce que le free n'a PAS : l'alerte AVANT que
            la plage tourne. La reco du matin reste listée dans les value-cards. */}
        <h2 className="anton" style={{fontSize:"clamp(22px,6vw,28px)",color:"#fff",marginBottom:18,lineHeight:1.1,letterSpacing:"-.015em"}}>
          {(()=>{const G={background:"linear-gradient(135deg,#FFE47A,#FFC72C 55%,#E89400)",WebkitBackgroundClip:"text",backgroundClip:"text",WebkitTextFillColor:"transparent",color:"transparent"};
            if(pwCalm&&_allCalm)
              return lang==="es"?(<>Sabe dónde estará el mar <span style={G}>mañana</span>, no solo hoy</>)
                :lang==="en"?(<>Know where the sea will be <span style={G}>tomorrow</span>, not just today</>)
                :(<>Sache où sera la mer <span style={G}>demain</span>, pas juste aujourd'hui</>)
            return lang==="es"?(<><span style={G}>Entérate</span> antes de que tu playa cambie</>)
              :lang==="en"?(<><span style={G}>Know</span> before your beach turns</>)
              :(<>Sois <span style={G}>prévenu</span> avant que ta plage tourne</>)})()}
        </h2>

        {/* Value cards stack — wrapped in a relative container so we can lay
            a soft gold halo behind all 3 cards. Why: the dark modal needs one
            warm focal area to anchor the eye on the promise. (sample_first
            dead branches removed 2026-06-10 — A/B pw_cta_order killed.) */}
        <div style={{position:"relative",marginBottom:16}}>
          <div aria-hidden style={{
            position:"absolute",inset:"-8px -20px",borderRadius:24,
            background:"radial-gradient(60% 70% at 50% 0%, rgba(255,199,44,.09) 0%, transparent 70%)",
            pointerEvents:"none",
          }}/>

          {/* Card 01 — morning brief (gold accent, the hero promise) */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,199,44,.09),rgba(255,199,44,.04))",
            border:"1px solid rgba(255,199,44,.28)",
            borderRadius:18,padding:"14px 16px 14px 18px",marginBottom:10,
            boxShadow:"0 8px 24px -14px rgba(255,199,44,.3), inset 0 1px 0 rgba(255,255,255,.06)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"transparent",
              background:"linear-gradient(135deg,#FFE47A,#FFC72C 50%,#E89400)",
              WebkitBackgroundClip:"text",backgroundClip:"text",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>01</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,199,44,.75)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"CHAQUE MATIN · 7H","EVERY MORNING · 7AM","CADA MAÑANA · 7AM")}
              </div>
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_topName
                  ?_t(lang,`Ta meilleure plage : ${_topName}`,`Your best beach today: ${_topName}`,`Tu mejor playa hoy: ${_topName}`)
                  :IS_NEW_REGION
                  ?_t(lang,`Ta meilleure plage : ${REGION.beaches?.[0]?.name||REGION.name}`,`Your best beach today: ${REGION.beaches?.[0]?.name||REGION.name}`,`Tu mejor playa hoy: ${REGION.beaches?.[0]?.name||REGION.name}`)
                  :_t(lang,"Ta meilleure plage : Anse Dufour","Your best beach today: Anse Dufour","Tu mejor playa hoy: Anse Dufour")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_topScore
                  ?_t(lang,`Score ${_topScore}/100 · satellite`,`Score ${_topScore}/100 · satellite-verified`,`Score ${_topScore}/100 · verificado por satélite`)
                  :_t(lang,"Propre · 12 min · mer calme","Clean · 12 min drive · calm sea","Limpia · a 12 min · mar tranquilo")}
              </div>
            </div>
          </div>

          {/* Card 02 — instant alert */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:18,padding:"14px 16px 14px 18px",marginBottom:10,
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.05)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"rgba(255,255,255,.22)",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>02</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,255,255,.42)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"ALERTE INSTANTANÉE","INSTANT ALERT","ALERTA INSTANTÁNEA")}
              </div>
              {/* Titre générique (plus de changement d'état fabriqué sur une
                  plage nommée) ; destination = vraie plage propre du jour. */}
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_t(lang,"Ta plage favorite a changé","Your saved beach just changed","Tu playa favorita cambió")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_exSwitch
                  ?_t(lang,`Propre → Modéré — va à ${_exSwitch}`,`Clean → Moderate — switch to ${_exSwitch}`,`Limpia → Moderada — mejor ve a ${_exSwitch}`)
                  :_t(lang,"Propre → Modéré","Clean → Moderate","Limpia → Moderada")}
              </div>
            </div>
          </div>

          {/* Card 03 — weekend daily pick */}
          <div style={{position:"relative",
            background:"linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:18,padding:"14px 16px 14px 18px",
            boxShadow:"inset 0 1px 0 rgba(255,255,255,.05)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{
              fontFamily:"'Anton',sans-serif",fontSize:30,lineHeight:1,
              color:"rgba(255,255,255,.22)",
              letterSpacing:"-.02em",flexShrink:0,width:30,textAlign:"center",
            }}>03</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:9.5,color:"rgba(255,255,255,.42)",marginBottom:4,fontWeight:800,letterSpacing:".08em"}}>
                {_t(lang,"LE WEEKEND","WEEKEND FORECAST","EL FIN DE SEMANA")}
              </div>
              {/* Vraie meilleure plage du samedi (forecast hebdo). "Propre tout
                  le weekend" seulement si sam+dim réellement clean ; suffixe
                  enfants seulement si kids:true dans la donnée région. */}
              <div style={{fontSize:14.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
                {_wkend
                  ?_t(lang,`Samedi : ${_wkend.name}`,`Best for Saturday: ${_wkend.name}`,`El sábado: ${_wkend.name}`)
                  :_t(lang,"Samedi : ta meilleure plage","Best for Saturday: your top beach","El sábado: tu mejor playa")}
              </div>
              <div style={{fontSize:11.5,color:"rgba(255,255,255,.5)",marginTop:3}}>
                {_wkend
                  ?(_wkend.allClean
                    ?_t(lang,`Propre tout le weekend${_wkend.kids?" · idéal enfants":""}`,`Clean all weekend${_wkend.kids?" · great for kids":""}`,`Limpia todo el fin de semana${_wkend.kids?" · ideal con niños":""}`)
                    :_t(lang,`${LL[_wkend.sat]||_wkend.sat} samedi`,`${LL[_wkend.sat]||_wkend.sat} on Saturday`,`${LL[_wkend.sat]||_wkend.sat} el sábado`))
                  :_t(lang,"Calculée depuis la prévision 7 jours","From the 7-day forecast","Según el pronóstico de 7 días")}
              </div>
            </div>
          </div>
        </div>

        {/* Ligne de preuve — chiffres réels uniquement : compte clean live ou,
            à défaut, le nombre réel de plages suivies dans le JSON région
            (le "135 plages surveillées" inventé est sorti). Data absente → rien. */}
        {_totalCount>0&&(
        <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,.4)",marginBottom:16}}>
          {_cleanCount>0
            ?_t(lang,`${_cleanCount}/${_totalCount} plages propres en ce moment · satellite 24/7`,`${_cleanCount}/${_totalCount} beaches clean right now · satellite 24/7`,`${_cleanCount}/${_totalCount} playas limpias ahora mismo · satélite 24/7`)
            :_t(lang,`Copernicus Sentinel · 4 analyses satellite/jour · ${_totalCount} plages suivies · prévisions 7 jours`,`Copernicus Sentinel · 4 satellite updates a day · ${_totalCount} beaches tracked · 7-day forecast`,`Copernicus Sentinel · 4 análisis satelitales al día · ${_totalCount} playas monitoreadas · pronóstico de 7 días`)}
        </div>
        )}

        {/* Timeline d'essai (pattern Blinkist, LOT 1 value-prop) — 3 étapes,
            montants liés au plan sélectionné. Commune aux 2 variantes
            pw_prelude (ne touche ni au flow ni aux Payment Links).
            Masquée en NO_TRIAL (USD) : il n'y a pas d'essai à raconter. */}
        {PAYWALL_READY&&!NO_TRIAL&&(
        <div style={{margin:"0 0 14px",padding:"12px 14px",borderRadius:14,forcedColorAdjust:"none",
          background:"#0c1f1c",border:"2.5px solid #0d0b14",boxShadow:"2px 2px 0 #0d0b14"}}>
          {[
            {k:_t(lang,"Aujourd'hui","Today","Hoy"),v:_t(lang,"reco du jour + alertes débloquées","daily pick + alerts unlocked","tu playa del día + alertas activadas"),gold:true},
            {k:_t(lang,"Jour 5","Day 5","Día 5"),v:_t(lang,"on te prévient par email avant la facturation","heads-up email before you're ever charged","te avisamos por email antes del cobro")},
            {k:_t(lang,"Jour 7","Day 7","Día 7"),v:(()=>{
              const pr=effectivePlan==="annual"
                ?(REGION_PAY?`${PRICE_YR}${_t(lang,"/an","/yr","/año")}`:_t(lang,"49 €/an","€49/yr","49 €/año"))
                :(REGION_PAY?`${PRICE_MO}${_t(lang,"/mois","/mo","/mes")}`:_t(lang,"4,99 €/mois","€4.99/mo","4,99 €/mes"))
              return _t(lang,`${pr}, annulable en 2 clics`,`${pr}, cancel in 2 clicks`,`${pr}, cancela en 2 clics`)
            })()},
          ].map((r,i,arr)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,position:"relative",
              paddingBottom:i<arr.length-1?10:0}}>
              <span style={{display:"flex",flexDirection:"column",alignItems:"center",alignSelf:"stretch",flexShrink:0,width:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",marginTop:4,
                  background:r.gold?"#FFC72C":"rgba(255,255,255,.25)",
                  boxShadow:r.gold?"0 0 8px rgba(255,199,44,.7)":"none"}}/>
                {i<arr.length-1&&<span style={{flex:1,width:1.5,background:"rgba(255,255,255,.12)",marginTop:2}}/>}
              </span>
              <span style={{fontSize:12,lineHeight:1.35,color:"rgba(255,255,255,.78)"}}>
                <b style={{color:r.gold?"#FFC72C":"#fff",fontWeight:700}}>{r.k}</b> — {r.v}
              </span>
            </div>
          ))}
        </div>
        )}

        {/* CTA section — sticky so it's always visible even if user hasn't scrolled.
            Solid #120821 bg + fade-in shadow ABOVE so card 03 doesn't bleed through
            (was: transparent→ink gradient that made WEEKEND card visible under the
            plan toggle per screenshot 05-paywall-control.png). */}
        <div style={{position:"sticky",bottom:0,background:"#120821",
          paddingTop:12,paddingBottom:12,marginLeft:-24,marginRight:-24,paddingLeft:24,paddingRight:24,
          boxShadow:"0 -12px 16px -8px rgba(10,23,20,.85)"}}>

        {/* Plan toggle — monthly + annual. Wrapped in a 4px-padded grouped
            container with 5% white bg (Design v1 spec) — visually says "pick one,
            they're grouped" instead of loose side-by-side pill look. */}
        {hasAnnual&&(
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <button onClick={()=>{setPlan("monthly");track("sg_plan_toggle",{plan:"monthly"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:11,cursor:"pointer",fontFamily:"inherit",forcedColorAdjust:"none",
            background:plan==="monthly"?"linear-gradient(180deg,#FFE07A,#FFC72C)":"#fdf6e3",
            border:"2.5px solid #0d0b14",
            color:"#0d0b14",fontSize:13,fontWeight:700,
            boxShadow:plan==="monthly"?"0 4px 0 #0d0b14":"2px 2px 0 #0d0b14",
            transition:"all .15s"}}>
            <div>{_t(lang,"Mensuel","Monthly","Mensual")}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_MO:lang==="en"?"€4.99":"4,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"mois","mo","mes")}</span></div>
          </button>
          <button onClick={()=>{setPlan("annual");track("sg_plan_toggle",{plan:"annual"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:11,cursor:"pointer",fontFamily:"inherit",position:"relative",forcedColorAdjust:"none",
            background:plan==="annual"?"linear-gradient(180deg,#FFE07A,#FFC72C)":"#fdf6e3",
            border:"2.5px solid #0d0b14",
            color:"#0d0b14",fontSize:13,fontWeight:700,
            boxShadow:plan==="annual"?"0 4px 0 #0d0b14":"2px 2px 0 #0d0b14",
            transition:"all .15s"}}>
            <div style={{position:"absolute",top:-8,right:8,background:C.gold,color:C.ink,
              fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,letterSpacing:".02em"}}>
              {(()=>{
                // Remise annuelle calculée depuis les prix réels (mo×12 vs an) —
                // plus de "-33%" en dur qui devient faux quand l'annuel change
                // (EUR 49 € vs 12×4,99 = ~18 %). Fallback "-33%" si non-parsable.
                try{
                  const ry=REGION_PAY?PRICE_YR:"49",rm=REGION_PAY?PRICE_MO:"4.99"
                  const ny=parseFloat(String(ry).replace(/[^0-9.,]/g,"").replace(",","."))
                  const nm=parseFloat(String(rm).replace(/[^0-9.,]/g,"").replace(",","."))
                  if(ny>0&&nm>0){const pct=Math.round((1-ny/(nm*12))*100);if(pct>0)return `-${pct}%`}
                }catch(_){}
                return "-33%"
              })()}
            </div>
            <div>{_t(lang,"Annuel","Annual","Anual")}</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{REGION_PAY?PRICE_YR:lang==="en"?"€49":"49 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"an","yr","año")}</span></div>
            {(()=>{
              // Prix /mois équivalent : l'user n'a plus à diviser (ancre l'annuel).
              const raw=REGION_PAY?PRICE_YR:"49"
              const sym=(raw.match(/[€$£]/)||["€"])[0]
              const n=parseFloat(raw.replace(/[^0-9.,]/g,"").replace(",","."))
              if(!n)return null
              // Virgule décimale UNIQUEMENT en FR (le Mexique écrit $6.58) ;
              // FR : nombre PUIS symbole (soit 3,33 €/mois), EN/ES : symbole avant.
              const eq=(n/12).toFixed(2).replace(".",lang==="fr"?",":".")
              return <div style={{fontSize:9.5,fontWeight:500,color:"rgba(255,255,255,.55)",marginTop:1}}>
                {_t(lang,`soit ${eq} ${sym}/mois`,`${sym}${eq}/mo billed yearly`,`${sym}${eq}/mes facturado al año`)}
              </div>
            })()}
          </button>
          {hasPro&&(
          <button onClick={()=>{setPlan("pro");track("sg_plan_toggle",{plan:"pro"})}} style={{
            flex:1,padding:"10px 8px",borderRadius:11,cursor:"pointer",fontFamily:"inherit",position:"relative",forcedColorAdjust:"none",
            background:plan==="pro"?"linear-gradient(180deg,#ff8a8a,#ff6464)":"#fdf6e3",
            border:"2.5px solid #0d0b14",
            color:"#0d0b14",fontSize:13,fontWeight:700,
            boxShadow:plan==="pro"?"0 4px 0 #0d0b14":"2px 2px 0 #0d0b14",
            transition:"all .15s"}}>
            <div style={{position:"absolute",top:-8,right:8,background:"#ff6464",color:"#fff",
              fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:100,letterSpacing:".02em"}}>
              PRO
            </div>
            <div>Pro</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{lang==="en"?"€9.99":"9,99 €"}<span style={{fontSize:11,fontWeight:400}}>/{_t(lang,"mois","mo","mes")}</span></div>
          </button>
          )}
        </div>
        )}
        {/* Cadrage journalier — toujours dérivé du prix réel parsé (jamais en
            dur) : mensuel/30, annuel/365. Comparaison soda uniquement sur les
            marchés USD touristes ; en EUR rester sobre. */}
        {PAYWALL_READY&&(()=>{
          const raw=effectivePlan==="annual"?(REGION_PAY?PRICE_YR:"49 €"):(REGION_PAY?PRICE_MO:"4,99 €")
          const n=parseFloat(String(raw).replace(/[^0-9.,]/g,"").replace(",","."))
          if(!n)return null
          const sym=(String(raw).match(/[€$£]/)||["€"])[0]
          const perDay=effectivePlan==="annual"?n/365:n/30
          const usd=sym==="$"
          const amt=usd?`$${perDay.toFixed(2)}`
            :lang==="en"?`€${perDay.toFixed(2)}`
            :`${perDay.toFixed(2).replace(".",",")} €`
          const soda=usd&&effectivePlan!=="annual"
          return(
            <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:12}}>
              {usd
                ?_t(lang,`≈ ${amt}/jour${soda?" — moins qu'un soda à la plage":""}`,`about ${amt}/day${soda?" — less than a beach soda":""}`,`unos ${amt} al día${soda?" — menos que un refresco en la playa":""}`)
                :_t(lang,`soit ~${amt}/jour`,`about ${amt}/day`,`unos ${amt}/día`)}
            </div>
          )
        })()}
        {/* Pro tier perks — only shown when Pro is selected and configured.
            Enables: WhatsApp instant alerts, 14-day forecast (vs 7), 90-day
            history, API access for power users (hoteliers, surfers, fishermen). */}
        {plan==="pro"&&hasPro&&(
        <div style={{background:"rgba(255,100,100,.05)",border:"1px solid rgba(255,100,100,.15)",
          borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"rgba(255,255,255,.75)"}}>
          <div style={{fontWeight:700,color:"#ff8a8a",marginBottom:4}}>
            {_t(lang,"Dans Pro","What's in Pro","Qué incluye Pro")}
          </div>
          <div>• {_t(lang,"Alertes WhatsApp instantanées dès qu'une plage change","Instant WhatsApp alerts when a beach flips","Alertas instantáneas por WhatsApp cuando una playa cambia")}</div>
          <div>• {_t(lang,"Prévisions 14 jours (vs 7 standard)","14-day forecast (vs 7-day standard)","Pronóstico a 14 días (vs 7 estándar)")}</div>
          <div>• {_t(lang,"Historique 90 jours + accès API complet","90-day history + full API access","Historial de 90 días + acceso API completo")}</div>
        </div>
        )}

        {/* Paid CTA — seul chemin de conversion (sample retiré, A/B pw_cta_order killed). */}
        {(() => {
          // Nouvelle région sans Payment Links → pas de CTA payant (jamais de redirect EUR).
          if(!PAYWALL_READY)return(
            <div key="paid" style={{width:"100%",textAlign:"center",fontSize:13,padding:"16px 24px",
              borderRadius:14,border:"1px dashed rgba(255,255,255,.25)",color:"rgba(255,255,255,.7)"}}>
              {_t(lang,"Premium arrive bientôt ici — alertes plages & brief matin.","Premium launches here soon — beach alerts & morning brief.","Premium llega pronto aquí — alertas de playas y brief matutino.")}
            </div>
          )
          const paidCTA = (
            <button key="paid" onClick={()=>{
              track("sg_premium_modal_cta",{plan:effectivePlan,source:source||"unknown",prelude_variant:preludeVariant})
              if(preludeVariant==="prelude"){
                // Stripe Prelude variant — show interstitial summary BEFORE redirect.
                // User clicks "Continuer vers Stripe" from the prelude = THEN we redirect.
                track("sg_prelude_opened",{plan:effectivePlan,source:source||"unknown"})
                setShowPrelude(true)
                return
              }
              // Checkout in-app (Embedded) — fallback Payment Link géré dedans
              startCheckout(effectivePlan,"direct")
            }}
            className="gbtn" style={{width:"100%",textAlign:"center",fontSize:17,
              padding:"16px 24px",display:"block",cursor:"pointer",fontFamily:"inherit",lineHeight:1.2,
              /* bouton comic « case BD » : jaune plein, contour encré, ombre dure */
              background:"linear-gradient(180deg,#FFE07A,#FFC72C)",color:"#0d0b14",
              border:"2.5px solid #0d0b14",borderRadius:14,
              boxShadow:"0 4px 0 #0d0b14,0 9px 18px rgba(13,11,20,.32)",transform:"rotate(-.8deg)"}}>
              <div>{NO_TRIAL
                ?_t(lang,"Activer ma reco maintenant","Get my daily pick — start now","Mi playa del día — empezar ya")
                :_t(lang,"Activer ma reco — 7 jours offerts","Start my daily pick — 7 days free","Activar mi playa del día — 7 días gratis")}</div>
              {/* Sous-ligne dynamique sur effectivePlan dans LES DEUX branches
                  (le fallback MQ/GP affichait 4,99 €/mois même avec Annuel
                  sélectionné). L'idée d'annulation vit UNE fois à l'écran,
                  dans la ligne de réassurance sous le CTA (dédup mobile MQ). */}
              <div style={{fontSize:12,opacity:.8,fontWeight:400,marginTop:4}}>
                {NO_TRIAL
                  ?_t(lang,`${effectivePlan==="annual"?PRICE_YR+"/an":PRICE_MO+"/mois"} · facturé aujourd'hui`,`${effectivePlan==="annual"?PRICE_YR+"/yr":PRICE_MO+"/mo"} · billed today`,`${effectivePlan==="annual"?PRICE_YR+"/año":PRICE_MO+"/mes"} · se cobra hoy`)
                  :REGION_PAY?_t(lang,`Puis ${effectivePlan==="annual"?PRICE_YR+"/an":PRICE_MO+"/mois"}`,`Then ${effectivePlan==="annual"?PRICE_YR+"/yr":PRICE_MO+"/mo"}`,`Luego ${effectivePlan==="annual"?PRICE_YR+"/año":PRICE_MO+"/mes"}`):_t(lang,`Puis ${effectivePlan==="annual"?"49 €/an":"4,99 €/mois"}`,`Then ${effectivePlan==="annual"?"€49/yr":"€4.99/mo"}`,`Luego ${effectivePlan==="annual"?"49 €/año":"4,99 €/mes"}`)}
              </div>
            </button>
          )
          // "Essayer 24h · sans carte" RETIRÉ avant expansion : sg_sample_start = 0
          // sur 10 738 sessions (~7 sem) — feature morte + clutter. On garde le CTA payant seul.
          return paidCTA
        })()}

        {/* Trip Pass (A/B pw_trippass, USD) : alternative one-time sous le CTA
            abo. Chemin de checkout SÉPARÉ (startTripPass). Calme : zéro anim. */}
        {tripAB&&(
          <div style={{marginTop:14,padding:"14px 16px",borderRadius:14,
            border:`1px solid ${C.gold}`,background:"rgba(245,158,11,.07)"}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,marginBottom:2}}>
              <span style={{fontSize:12.5,fontWeight:700,color:C.gold,letterSpacing:".01em"}}>
                {_t(lang,"Juste pour ton séjour ?","Just here for your trip?","¿Solo por tu viaje?")}
              </span>
              <span style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>
                {_t(lang,"sans abonnement","no subscription","sin suscripción")}
              </span>
            </div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.82)",lineHeight:1.35,marginBottom:10}}>
              {_t(lang,
                `Pass 7 jours — ${PRICE_TRIP} une seule fois. Accès complet pendant ton voyage, rien à annuler.`,
                `7-Day Trip Pass — ${PRICE_TRIP} once. Full access for your trip, nothing to cancel.`,
                `Pase de 7 días — ${PRICE_TRIP} una sola vez. Acceso completo durante tu viaje, nada que cancelar.`)}
            </div>
            <button onClick={startTripPass} style={{width:"100%",textAlign:"center",
              fontSize:14.5,fontWeight:700,padding:"12px 18px",borderRadius:11,cursor:"pointer",
              fontFamily:"inherit",border:`1px solid ${C.gold}`,background:"transparent",color:C.gold}}>
              {_t(lang,`Prendre le pass 7 jours · ${PRICE_TRIP}`,`Get the 7-day pass · ${PRICE_TRIP}`,`Obtener el pase de 7 días · ${PRICE_TRIP}`)}
            </button>
          </div>
        )}

        {/* Trip Pass EUR (A/B pw_trippass_eur, MQ/GP) — MIROIR EXACT du bloc USD
            ci-dessus, devise EUR, chemin de checkout SÉPARÉ (startTripPassEur →
            passCtxRef + action:pay_once). N'apparaît PAS si le storefront pass
            off-site (pwPass/PassOffer) est déjà affiché (évite deux surfaces
            "pass" concurrentes). Calme : zéro anim. */}
        {!PAY_CAPTURE_ONLY&&tripEurAB&&!pwPass&&(
          <div style={{marginTop:14,padding:"14px 16px",borderRadius:14,
            border:`1px solid ${C.gold}`,background:"rgba(245,158,11,.07)"}}>
            <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,marginBottom:2}}>
              <span style={{fontSize:12.5,fontWeight:700,color:C.gold,letterSpacing:".01em"}}>
                {_t(lang,"Juste pour ton séjour ?","Just here for your trip?","¿Solo por tu viaje?")}
              </span>
              <span style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>
                {_t(lang,"sans abonnement","no subscription","sin suscripción")}
              </span>
            </div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.82)",lineHeight:1.35,marginBottom:10}}>
              {_t(lang,
                `Pass 7 jours — ${PRICE_TRIP_EUR} une seule fois. Accès complet pendant ton séjour, rien à annuler.`,
                `7-Day Trip Pass — ${PRICE_TRIP_EUR} once. Full access for your trip, nothing to cancel.`,
                `Pase de 7 días — ${PRICE_TRIP_EUR} una sola vez. Acceso completo durante tu viaje, nada que cancelar.`)}
            </div>
            <button onClick={startTripPassEur} style={{width:"100%",textAlign:"center",
              fontSize:14.5,fontWeight:700,padding:"12px 18px",borderRadius:11,cursor:"pointer",
              fontFamily:"inherit",border:`1px solid ${C.gold}`,background:"transparent",color:C.gold}}>
              {_t(lang,`Prendre le pass 7 jours · ${PRICE_TRIP_EUR}`,`Get the 7-day pass · ${PRICE_TRIP_EUR}`,`Obtener el pase de 7 días · ${PRICE_TRIP_EUR}`)}
            </button>
          </div>
        )}

        {/* Micro-réassurance — répond à LA peur n°1 documentée ("je vais
            oublier d'annuler"). "2 clics" = le portail Stripe réel ("1 clic"
            était invérifiable). Une seule occurrence de l'idée d'annulation
            sous le CTA (remplace l'ancien trust foot dupliqué). */}
        <div style={{textAlign:"center",marginTop:12,fontSize:10.5,
          color:"rgba(255,255,255,.48)",letterSpacing:".01em"}}>
          {NO_TRIAL
            ?_t(lang,"Sans engagement · Annulation en 2 clics · Paiement sécurisé "+PAY_LABEL,"No commitment · Cancel in 2 clicks · Secure "+PAY_LABEL+" payment","Sin permanencia · Cancela en 2 clics · Pago seguro "+PAY_LABEL)
            :_t(lang,"Sans engagement · Annulation en 2 clics · Rappel avant facturation","No commitment · Cancel in 2 clicks · Reminder before you're billed","Sin permanencia · Cancela en 2 clics · Aviso antes del cobro")}
        </div>
        {/* 2026-06-29 — Garantie « satisfait ou remboursé » RETIRÉE (pass one-time, accès
            numérique immédiat). Réassurance = paiement unique / sans abonnement / accès direct,
            ton calme. (Renversement de risque assuré par le verdict gratuit + le prix bas.) */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,
          padding:"11px 13px",borderRadius:13,background:"#0e3a28",forcedColorAdjust:"none",
          border:"2.5px solid #0d0b14",boxShadow:"2px 2px 0 #0d0b14"}}>
          <span style={{fontSize:18,lineHeight:1,flexShrink:0}}>⚡</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#fff",lineHeight:1.25}}>
              {_t(lang,"Paiement unique, sans abonnement","One-time payment, no subscription","Pago único, sin suscripción")}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2,lineHeight:1.3}}>
              {_t(lang,"Tu paies une fois, tu accèdes tout de suite. Rien à résilier.","Pay once, access right away. Nothing to cancel.","Pagas una vez, accedes enseguida. Nada que cancelar.")}
            </div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:6,marginTop:8}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:4,
            fontSize:10,color:"rgba(255,255,255,.6)",fontWeight:500}}>
            <span>🔒</span>{_t(lang,"Paiement sécurisé "+PAY_LABEL,"Secure "+PAY_LABEL+" payment","Pago seguro "+PAY_LABEL)}
          </span>
        </div>
        {/* Lien "À propos" retiré du paywall (demande user 2026-06-11 — épuré).
            La page /a-propos/ reste accessible via le chat (branche fiabilité). */}

        {/* Already subscribed — for users who installed the PWA after paying.
            iOS PWA and Safari have separate localStorage, so the ?premium_email=
            link from the welcome email opens in Safari and never reaches the PWA.
            This button lets them re-validate their sub from INSIDE the PWA. */}
        <button onClick={()=>{
          track("sg_premium_already_click",{source:source||"unknown"})
          const em=prompt(_t(lang,"Entre l'email utilisé pour ton abonnement :","Enter the email used for your subscription:","Introduce el email usado para tu suscripción:"))
          if(!em||!em.includes("@"))return
          sgVerifySub(em).then(d=>{
            if(d.active){
              // Pass one-time : accès TIME-BOXÉ (passEnd en ms) → sg_premium_pass_end,
              // pas le flag permanent sg_premium. Abo (sg_premium=1) = comportement inchangé.
              if(d.passEnd&&d.kind==="pass"){
                localStorage.setItem("sg_premium_pass_end",String(d.passEnd))
                localStorage.setItem("sg_premium_email",em)
                localStorage.setItem("sg_email",em)
              }else{
                localStorage.setItem("sg_premium","1")
                localStorage.setItem("sg_premium_email",em)
                if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
              }
              track("sg_premium_already_success",{source:source||"unknown"})
              onActivated?.()
              onClose()
            }else{
              track("sg_premium_already_failed",{reason:d.reason||d.error||"inactive"})
              sgToast({tone:"error",
                title:_t(lang,"Aucun abonnement trouvé","No subscription found","No se encontró suscripción"),
                msg:_t(lang,
                  "Vérifie l'adresse, ou écris-moi à "+SUPPORT_EMAIL+".",
                  "Check the address, or write to me at "+SUPPORT_EMAIL+".",
                  "Verifica la dirección, o escríbeme a "+SUPPORT_EMAIL+".")})
            }
          }).catch(e=>{
            track("sg_premium_already_failed",{reason:e?.message||"network"})
            sgToast({tone:"error",title:_t(lang,"Connexion impossible","Connection issue","Sin conexión"),msg:_t(lang,"Réessaie dans un instant.","Try again in a moment.","Inténtalo de nuevo en un momento.")})
          })
        }} style={{
          width:"100%",padding:"10px",marginTop:10,background:"none",
          border:"1px dashed rgba(255,255,255,.2)",borderRadius:14,
          color:"rgba(255,255,255,.55)",fontSize:12,cursor:"pointer",fontFamily:"inherit",
        }}>{_t(lang,"J'ai déjà un pass","I already have a pass","Ya tengo un pase")}</button>

        <button onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts});onClose()}} style={{
          width:"100%",padding:"12px",marginTop:8,background:"none",
          border:"1px solid rgba(255,255,255,.15)",borderRadius:16,
          color:"#8b949e",fontSize:13,cursor:"pointer",fontFamily:"inherit",
        }}>{LL.close}</button>
        </div>{/* end sticky CTA section */}
        </>)}{/* end !pwComic classic skin */}
      </div>
      {/* Étape paiement ON-SITE — overlay sombre au-dessus du modal (z 1300),
          design maison : email + Apple/Google Pay + Payment Element (carte).
          TOUJOURS rendu (caché) pour que les Elements montés persistent. */}
      <div ref={payScrollRef} onTouchStart={onTouchStartPay} onTouchMove={onTouchMovePay} onTouchEnd={onTouchEndPay}
        style={{position:"fixed",inset:0,zIndex:1300,background:PAY_CAPTURE_ONLY?"linear-gradient(168deg,#0B2230 0%,#0D1E1C 58%,#0A1714 100%)":"linear-gradient(145deg,#190c2c,#120821)",
        display:"flex",flexDirection:"column",overflowX:"hidden",overflowY:"auto",
        // hors-écran (PAS visibility:hidden : les iframes Stripe ne bootent pas
        // dans un conteneur hidden — le pré-mount resterait gelé)
        transform:payStep?"none":"translateX(-200vw)",
        pointerEvents:payStep?"auto":"none"}}>
        {/* padding-top safe-area : sinon en PWA standalone iOS le bouton « Retour »
            est coincé sous la barre d'état système (taps interceptés) → injoignable. */}
        <div ref={payContentRef} style={{maxWidth:480,width:"100%",margin:"0 auto",padding:"calc(16px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))",flex:1,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button onClick={()=>{track("sg_pay_onsite_back",{plan:payPlanRef.current});setPayStep(false)}}
              className="sg-payplain"
              style={{background:"none",border:"none",color:"rgba(255,255,255,.65)",fontSize:14,cursor:"pointer",
                fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,padding:"8px 0"}}>
              ← {_t(lang,"Retour","Back","Atrás")}
            </button>
            <span style={{fontSize:11,color:"rgba(255,255,255,.45)",display:"flex",alignItems:"center",gap:8}}>
              {/* Marque sur l'écran paiement (audit : full-screen sans aucun nom de site) */}
              {IS_NEW_REGION&&<span style={{fontFamily:"'Anton',sans-serif",fontSize:10.5,letterSpacing:".12em",color:"rgba(255,255,255,.8)"}}>
                {((lang==="es"?"SARGAZO ":"SARGASSUM ")+String(REGION.name||"")).toUpperCase()}
              </span>}
              🔒 {PAY_CAPTURE_ONLY?_t(lang,"Sans carte","No card","Sin tarjeta"):PAY_PROVIDER==="mollie"?"Mollie":PAY_PROVIDER==="paypal"?"PayPal":"Stripe"}
            </span>
          </div>
          <h3 className="anton" style={{fontSize:22,color:"#fff",margin:"0 0 4px",letterSpacing:"-.01em"}}>
            {ppSub
              ?_t(lang,"Active ton Premium","Activate your Premium","Activa tu Premium")
              :PAY_CAPTURE_ONLY
              ?_t(lang,"Débloque ta semaine — c'est offert","Unlock your week — on us","Desbloquea tu semana — gratis")
              :passCtxRef.current
              ?_t(lang,`Active ton pass ${passCtxRef.current.days} jours`,`Activate your ${passCtxRef.current.days}-day pass`,`Activa tu pase ${passCtxRef.current.days} días`)
              :NO_TRIAL
              ?_t(lang,"Active ta reco du jour","Activate your daily pick","Activa tu playa del día")
              :_t(lang,"Démarre ton essai gratuit","Start your free trial","Empieza tu prueba gratis")}
          </h3>
          <div style={{fontSize:13,color:"rgba(255,255,255,.6)",marginBottom:18}}>
            {ppSub
              ?_t(lang,"Paie en sécurité avec PayPal · annule quand tu veux","Pay securely with PayPal · cancel anytime","Paga seguro con PayPal · cancela cuando quieras")
              :PAY_CAPTURE_ONLY
              ?_t(lang,"Paiements en maintenance quelques jours. En attendant, ton accès premium 7 jours est OFFERT — ton email et tu profites tout de suite.","Payments down for a few days. Meanwhile your 7-day premium access is ON US — your email and you're in.","Pagos en mantenimiento unos días. Mientras, tu acceso premium 7 días es GRATIS — tu email y listo.")
              :passCtxRef.current
              ?_t(lang,`${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"fr")} · ${passCtxRef.current.days} jours d'accès complet · paiement unique`,`${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"en")} · ${passCtxRef.current.days} days full access · one-time`,`${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"es")} · ${passCtxRef.current.days} días · pago único`)
              :NO_TRIAL
              ?<>{payPlanRef.current==="annual"
                  ?_t(lang,`${PRICE_YR}/an · facturé aujourd'hui`,`${PRICE_YR}/yr · billed today`,`${PRICE_YR}/año · se cobra hoy`)
                  :_t(lang,`${PRICE_MO}/mois · facturé aujourd'hui`,`${PRICE_MO}/mo · billed today`,`${PRICE_MO}/mes · se cobra hoy`)} · {_t(lang,"annule en 2 clics","cancel in 2 clicks","cancela en 2 clics")}</>
              :<>{_t(lang,"0 € aujourd'hui","$0 today","$0 hoy")} · {payPlanRef.current==="annual"
                  ?_t(lang,`puis ${REGION_PAY?PRICE_YR:"49 €"}/an dans 7 jours`,`then ${PRICE_YR||"$79"}/yr in 7 days`,`luego ${PRICE_YR||"$79"}/año en 7 días`)
                  :_t(lang,`puis ${REGION_PAY?PRICE_MO:"4,99 €"}/mois dans 7 jours`,`then ${PRICE_MO||"$9.99"}/mo in 7 days`,`luego ${PRICE_MO||"$9.99"}/mes en 7 días`)} · {_t(lang,"annule en 1 clic","cancel in 1 click","cancela en 1 clic")}</>}
          </div>
          {/* E-mail EN PREMIER (avant les wallets) : notre abo est lié à l'email
              (livraison de l'accès + reçu), donc Apple/Google Pay en a besoin. Le poser
              en tête + expliquer pourquoi → plus de "tape Apple Pay → erreur surprise". */}
          {!PAY_CAPTURE_ONLY&&PAY_PROVIDER==="mollie"&&(
            <div style={{marginBottom:14}}>
              <label style={MOL_LABEL}>{_t(lang,"E-mail (reçu d'accès)","Email (access receipt)","Email (recibo de acceso)")}</label>
              <input ref={payEmailRef} type="email" inputMode="email" autoComplete="email"
                onBlur={capturePayEmail}
                defaultValue={typeof localStorage!=="undefined"?(localStorage.getItem("sg_email")||""):""}
                placeholder={_t(lang,"ton@email.com","you@email.com","tu@email.com")}
                style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:12,
                  fontSize:16,fontFamily:"inherit",outline:"none",
                  border:"1px solid rgba(255,255,255,.14)",background:"rgba(255,255,255,.05)",color:"#eef2f7"}}/>
              <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:6}}>{_t(lang,"Pour t'envoyer ton reçu et ton accès premium.","To send your receipt and premium access.","Para enviarte tu recibo y acceso premium.")}</div>
            </div>
          )}
          {/* Wallets express (Apple Pay / Google Pay) — Mollie, hors capture. Tap →
              feuille native via le checkout hébergé Mollie (payWithWallet). Affichés
              uniquement si le device les supporte (walletAvail). Carte = repli on-site. */}
          {!PAY_CAPTURE_ONLY&&PAY_PROVIDER==="mollie"&&(()=>{
            const w=walletAvail()
            if(!w.apple&&!w.google)return null
            return(
              <div style={{marginBottom:14}}>
                {w.apple&&(
                  <button type="button" aria-label="Apple Pay" disabled={payBusy} onClick={()=>payWithWallet("applepay")}
                    className="sg-wbtn sg-wbtn-dark"
                    style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:"#000",color:"#fff",
                      fontFamily:"inherit",fontWeight:600,fontSize:17,cursor:payBusy?"wait":"pointer",opacity:payBusy?.6:1,
                      display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:w.google?8:0}}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.564 13.13c-.03-2.79 2.28-4.13 2.38-4.2-1.3-1.9-3.32-2.16-4.04-2.19-1.72-.17-3.36 1.01-4.23 1.01-.87 0-2.21-.99-3.64-.96-1.87.03-3.6 1.09-4.56 2.77-1.95 3.38-.5 8.38 1.39 11.13.93 1.34 2.03 2.85 3.47 2.8 1.39-.06 1.92-.9 3.6-.9 1.67 0 2.15.9 3.62.87 1.5-.03 2.45-1.37 3.36-2.72 1.06-1.56 1.5-3.07 1.52-3.15-.03-.01-2.92-1.12-2.95-4.44zM14.78 4.62c.77-.93 1.29-2.22 1.15-3.51-1.11.04-2.45.74-3.24 1.67-.71.82-1.33 2.14-1.16 3.4 1.24.1 2.51-.63 3.25-1.56z"/></svg>
                    Pay
                  </button>
                )}
                {w.google&&(
                  <button type="button" aria-label="Google Pay" disabled={payBusy} onClick={()=>payWithWallet("googlepay")}
                    className="sg-wbtn sg-wbtn-light"
                    style={{width:"100%",padding:"13px",borderRadius:12,border:"none",background:"#fff",color:"#3c4043",
                      fontFamily:"inherit",fontWeight:600,fontSize:15.5,cursor:payBusy?"wait":"pointer",opacity:payBusy?.6:1,
                      display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                    Google Pay
                  </button>
                )}
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:14}}>
                  <div style={{flex:1,height:1,background:"rgba(255,255,255,.14)"}}/>
                  <span style={{fontSize:11,color:"rgba(255,255,255,.45)"}}>{_t(lang,"ou par carte","or by card","o con tarjeta")}</span>
                  <div style={{flex:1,height:1,background:"rgba(255,255,255,.14)"}}/>
                </div>
              </div>
            )
          })()}
          {/* Mode carte Mollie : panneau SOMBRE premium (zéro blanc). E-mail + 4 champs
              carte (composants Mollie individuels montés dans nos divs sombres MOL_FIELD,
              libellés clairs MOL_LABEL hors iframe). Repères Visa/Mastercard sur le numéro
              (confiance au moment du paiement). Capture / PayPal / Stripe → champ sombre. */}
          {!PAY_CAPTURE_ONLY&&PAY_PROVIDER==="mollie"?(
            <div style={{background:"linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02))",
              borderRadius:16,border:"1px solid rgba(255,255,255,.10)",
              padding:"14px 14px 4px",boxShadow:"0 8px 30px rgba(0,0,0,.30)"}}>
              <label style={MOL_LABEL}>{_t(lang,"Nom du titulaire","Cardholder name","Nombre del titular")}</label>
              <div ref={molHolderRef} style={MOL_FIELD}/>
              <label style={MOL_LABEL}>{_t(lang,"Numéro de carte","Card number","Número de tarjeta")}</label>
              <div style={{position:"relative"}}>
                <div ref={molNumberRef} style={{...MOL_FIELD,paddingRight:74}}/>
                <span aria-hidden="true" style={{position:"absolute",right:11,top:15,display:"flex",gap:5,alignItems:"center",pointerEvents:"none"}}>
                  <svg width="26" height="17" viewBox="0 0 48 32"><rect width="48" height="32" rx="4" fill="#fff"/><text x="24" y="21" fontFamily="Arial,Helvetica,sans-serif" fontSize="13" fontWeight="700" fill="#1A1F71" textAnchor="middle" letterSpacing="0.5">VISA</text></svg>
                  <svg width="26" height="17" viewBox="0 0 48 32"><rect width="48" height="32" rx="4" fill="#fff"/><circle cx="20" cy="16" r="9" fill="#EB001B"/><circle cx="28" cy="16" r="9" fill="#F79E1B" fillOpacity="0.85"/></svg>
                </span>
              </div>
              <div style={{display:"flex",gap:11}}>
                <div style={{flex:1,minWidth:0}}>
                  <label style={MOL_LABEL}>{_t(lang,"Expiration","Expiry","Caducidad")}</label>
                  <div ref={molExpiryRef} style={MOL_FIELD}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <label style={MOL_LABEL}>CVC</label>
                  <div ref={molCvcRef} style={MOL_FIELD}/>
                </div>
              </div>
              {/* Réassurance au point d'anxiété max (saisie carte) — levier conversion D. */}
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:12,fontSize:11.5,color:"rgba(255,255,255,.5)",lineHeight:1.35}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{flexShrink:0}}>
                  <rect x="4" y="10" width="16" height="10" rx="2" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="rgba(124,224,176,.85)" strokeWidth="2"/>
                </svg>
                {_t(lang,"Paiement chiffré · tes données carte ne sont jamais stockées chez nous","Encrypted payment · your card data is never stored on our servers","Pago cifrado · tus datos de tarjeta nunca se guardan en nuestros servidores")}
              </div>
            </div>
          ):(
            <>
              <input ref={payEmailRef} type="email" inputMode="email" autoComplete="email"
                onBlur={capturePayEmail}
                defaultValue={typeof localStorage!=="undefined"?(localStorage.getItem("sg_email")||""):""}
                placeholder={_t(lang,"ton@email.com","you@email.com","tu@email.com")}
                style={{width:"100%",boxSizing:"border-box",padding:"13px 14px",borderRadius:12,marginBottom:12,
                  fontSize:16,fontFamily:"inherit",outline:"none",
                  border:"1px solid rgba(255,255,255,.18)",background:"#13261F",color:"#e6edf3"}}/>
              {ppSub&&<div ref={paypalBtnRef} style={{minHeight:50,marginTop:6}}/>}
              {!PAY_CAPTURE_ONLY&&PAY_PROVIDER!=="paypal"&&<div ref={expressDivRef} style={{marginBottom:10}}/>}
              {!PAY_CAPTURE_ONLY&&PAY_PROVIDER!=="paypal"&&<div ref={payDivRef} style={{minHeight:120}}/>}
            </>
          )}
          {!payReady&&payStep&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"26px 0"}}>
              <div style={{width:22,height:22,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,.15)",
                borderTopColor:"#FFC72C",animation:"sgSpin .8s linear infinite"}}/>
              <span style={{fontSize:12.5,color:"rgba(255,255,255,.55)"}}>
                {PAY_CAPTURE_ONLY?_t(lang,"On t'ouvre l'accès…","Opening your access…","Abriendo tu acceso…"):_t(lang,"Paiement sécurisé…","Secure checkout…","Pago seguro…")}
              </span>
              <style>{`@keyframes sgSpin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {payError&&(
            <div role="alert" style={{display:"flex",alignItems:"flex-start",gap:9,marginTop:12,padding:"11px 13px",
              borderRadius:12,background:"rgba(232,82,42,.12)",borderLeft:"4px solid #E8522A"}}>
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" style={{flexShrink:0,marginTop:1,color:"#F4845F"}}>
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <div style={{color:"#FFD9CC",fontSize:15,lineHeight:1.4,fontWeight:600}}>{payError}</div>
            </div>
          )}
          {/* Consentement rétractation 14 j — chemin Pass B2C payant uniquement.
              Case NON pré-cochée ; tant qu'elle n'est pas cochée, le bouton payer est
              désactivé. Flag ?consent=0 → case retirée (comportement d'avant). */}
          {consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&(
            <label style={{display:"flex",alignItems:"flex-start",gap:9,marginTop:16,padding:"11px 13px",
              borderRadius:12,background:"#13261F",border:"1px solid rgba(255,255,255,.14)",cursor:"pointer"}}>
              <input type="checkbox" checked={consentOk} onChange={e=>{setConsentOk(e.target.checked);if(e.target.checked)setPayError("")}}
                style={{flexShrink:0,marginTop:2,width:18,height:18,accentColor:"#FFC72C",cursor:"pointer"}}/>
              <span style={{fontSize:11.5,lineHeight:1.45,color:"rgba(255,255,255,.72)"}}>
                {_t(lang,
                  "J'accepte que ma prévision 7 jours et mes alertes me soient fournies immédiatement, dès mon paiement, et je reconnais qu'en demandant cet accès immédiat je perds mon droit de rétractation de 14 jours une fois l'accès ouvert (art. L221-28 13° du Code de la consommation).",
                  "I agree that my 7-day forecast and alerts are provided immediately upon payment, and I acknowledge that by requesting this immediate access I lose my 14-day right of withdrawal once access is opened (art. L221-28 13° French Consumer Code / Directive 2011/83/EU).",
                  "Acepto que mi previsión de 7 días y mis alertas se me faciliten de inmediato, en cuanto pague, y reconozco que al solicitar este acceso inmediato pierdo mi derecho de desistimiento de 14 días una vez abierto el acceso (art. L221-28 13° del Código de Consumo francés).")}
              </span>
            </label>
          )}
          {!ppSub&&<button onClick={()=>doSubscribe()} disabled={payBusy||(consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk)} className="gbtn sg-paygold"
            style={{width:"100%",padding:15,borderRadius:14,border:"none",marginTop:16,
              cursor:payBusy?"wait":((consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk)?"not-allowed":"pointer"),fontFamily:"inherit",fontWeight:800,fontSize:15.5,
              opacity:(payBusy||(consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk))?.7:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            {payBusy
              ?_t(lang,"Activation…","Activating…","Activando…")
              :PAY_CAPTURE_ONLY
              ?_t(lang,"Débloquer gratuitement →","Unlock free →","Desbloquear gratis →")
              :passCtxRef.current
              ?_t(lang,`Payer ${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"fr")}`,`Pay ${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"en")}`,`Pagar ${fmtPassPrice(passCtxRef.current.cents,passCtxRef.current.cur,"es")}`)
              :NO_TRIAL
              ?(payPlanRef.current==="annual"
                ?_t(lang,`Payer ${PRICE_YR} — activer maintenant`,`Pay ${PRICE_YR} — activate now`,`Pagar ${PRICE_YR} — activar ya`)
                :_t(lang,`Payer ${PRICE_MO} — activer maintenant`,`Pay ${PRICE_MO} — activate now`,`Pagar ${PRICE_MO} — activar ya`))
              :_t(lang,"Démarrer l'essai — 0 € aujourd'hui","Start trial — $0 today","Empezar prueba — $0 hoy")}
          </button>}
          <div style={{textAlign:"center",marginTop:12,fontSize:10.5,color:"rgba(255,255,255,.4)"}}>
            {ppSub
              ?_t(lang,"Sans engagement · annule en 2 clics · sécurisé par PayPal","No commitment · cancel in 2 clicks · secured by PayPal","Sin compromiso · cancela en 2 clics · seguro con PayPal")
              :PAY_CAPTURE_ONLY
              ?_t(lang,"Offert le temps qu'on rouvre · sans carte · juste ton email","On us while we reopen · no card · just your email","Gratis mientras reabrimos · sin tarjeta · solo tu email")
              :NO_TRIAL
              ?_t(lang,"Sans engagement · Annule en 2 clics · "+PAY_LABEL+" sécurisé","No commitment · Cancel in 2 clicks · Secured by "+PAY_LABEL,"Sin compromiso · Cancela en 2 clics · "+PAY_LABEL+" seguro")
              :_t(lang,"Sans engagement · Rappel 2 jours avant la 1re charge","No commitment · Reminder 2 days before first charge","Sin compromiso · Recordatorio 2 días antes del primer cobro")}
          </div>
          {/* Consentement contenu numérique (verdict panel 2026-06-29 : disclosure légère
              cadrée « gain », JAMAIS une case bloquante « je renonce »). Porte les 2 volets
              légaux (accès immédiat demandé + rétractation 14 j caduque) ; le consentement
              est porté par l'acte de paiement, tracé en metadata Mollie (create_payment).
              Masquée si ?consent=1 (case explicite dormante affichée) → pas de doublon. */}
          {!consentFlag&&!PAY_CAPTURE_ONLY&&<div style={{textAlign:"center",marginTop:8,fontSize:10,lineHeight:1.45,color:"rgba(255,255,255,.34)"}}>
            {_t(lang,"Accès immédiat : en payant, vous demandez la livraison tout de suite — le droit de rétractation de 14 j ne s'applique plus une fois l'accès ouvert.","Immediate access: by paying, you request delivery right away — the 14-day right of withdrawal no longer applies once access is open.","Acceso inmediato: al pagar, solicitas la entrega de inmediato — el derecho de desistimiento de 14 días deja de aplicarse una vez abierto el acceso.")}{" "}
            <a href="/cgv.html" target="_blank" rel="noopener" style={{color:"rgba(255,255,255,.5)",textDecoration:"underline"}}>{_t(lang,"CGV","Terms","Términos")}</a>
          </div>}
          {/* 2026-06-17 — bouton off-site « continuer sur Stripe » RETIRÉ (checkout
              100% on-site). En cas d'échec de montage : bouton Réessayer (recharge
              propre), jamais de redirect off-site. */}
          {payError&&(
          <button onClick={()=>{location.reload()}} style={{background:"none",border:"1px solid rgba(255,255,255,.25)",
            borderRadius:12,color:"rgba(255,255,255,.8)",fontSize:12.5,fontWeight:600,padding:"11px 14px",width:"100%",
            cursor:"pointer",fontFamily:"inherit",marginTop:14}}>
            {_t(lang,"↻ Réessayer le paiement sécurisé","↻ Retry secure checkout","↻ Reintentar el pago seguro")}
          </button>
          )}
        </div>
      </div>
    </>
  )
}

export default PremiumModal
export {B2BModal}

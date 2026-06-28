import React, { useState, useEffect, Suspense } from "react"
import { track, IS_NEW_REGION, REGION, _t, Veilleur, BrandIcon, PAY_CAPTURE_ONLY, ErrBound } from "./Sargasses_PROD"
import AlertScene from "./AlertScene"

// AlertHub — /alertes/ page view (hub Premium = le veilleur personnel)
function AlertHub({lang,island,beach,onPremium,onShowMap,onClose}){
  const [email,setEmail]=useState("")
  const [submitted,setSubmitted]=useState(false)
  const [busy,setBusy]=useState(false)

  // Verify if already subscribed
  const isSubscribed = (() => {
    try {
      return !!localStorage.getItem("sg_email")
    } catch (_) {
      return false
    }
  })()

  const dateLong=new Date().toLocaleDateString(lang==="es"?"es-MX":lang==="en"?"en-US":"fr-FR",{weekday:"long",day:"numeric",month:"long"})
  const beachName = beach ? beach.name : (lang === "en" ? "your beach" : lang === "es" ? "tu playa" : "ta plage")

  const handleSubmit = e => {
    e.preventDefault()
    if (!email || !email.includes("@")) return
    setBusy(true)
    track("sg_email_submit", { source: "alertes" })
    try {
      localStorage.setItem("sg_email", email)
    } catch (_) {}

    const islandCode = IS_NEW_REGION ? REGION.id.toUpperCase() : window.location.hostname.includes("guadeloupe") ? "GP" : "MQ"
    fetch("https://script.google.com/macros/s/AKfycbwkV1tQSEmrZ_zFPcIHBXh1EidFy16z72lx6ztABtVp4Ae3AikFHeGwN6JFMccbpoU07w/exec", {
      method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email, island: islandCode, source: "alertes", date: new Date().toISOString() })
    })
    .then(() => {
      setSubmitted(true)
      setBusy(false)
    })
    .catch(() => {
      setSubmitted(true)
      setBusy(false)
    })
  }

  useEffect(() => {
    track("sg_alerts_view", { variant: "hub", lang })
  }, [lang])

  return (
    <div style={{minHeight:"100svh",background:"linear-gradient(180deg,#0C1D21 0%,#120821 100%)",color:"#fff",position:"relative",padding:"40px 16px 60px",fontFamily:"inherit"}}>
      {/* Croix de fermeture */}
      <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")}
        style={{position:"absolute",top:"calc(12px + env(safe-area-inset-top, 0px))",right:16,zIndex:10,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.85)",width:34,height:34,borderRadius:"50%",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>
        &times;
      </button>

      <div style={{maxWidth:560,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"stretch"}}>
        {/* Pli 1 — Promesse + Veilleur */}
        <div style={{textAlign:"center",marginBottom:20,marginTop:20}}>
          <div style={{fontSize:10.5,fontWeight:800,color:"#156a96",letterSpacing:".14em",textTransform:"uppercase",marginBottom:8}}>
            {dateLong} · {_t(lang,"LE VEILLEUR PERSONNEL","YOUR PERSONAL WATCHER","TU VIGÍA PERSONAL")}
          </div>
          <h1 style={{fontFamily:"'Anton',sans-serif",fontWeight:400,fontSize:"clamp(28px,6.5vw,42px)",lineHeight:1.02,letterSpacing:".01em",textTransform:"uppercase",margin:"0 0 16px",color:"#fff"}}>
            {_t(lang,"On surveille ta plage pendant que tu dors.","We watch your beach while you sleep.","Vigilamos tu playa mientras duermes.")}
          </h1>
          <div style={{display:"flex",justifyContent:"center",margin:"12px 0 16px"}}>
            <Veilleur mood="serein" size={64} />
          </div>
          <p style={{fontSize:14,lineHeight:1.4,color:"rgba(255,255,255,.7)",maxWidth:460,margin:"0 auto"}}>
            {_t(lang,`Tu n'ouvres l'app que le jour où l'état de ${beachName} change. Le reste du temps, profite.`,`You only open the app the day ${beachName}'s status changes. The rest of the time, enjoy.`,`Solo abres la aplicación el día que el estado de ${beachName} cambie. El resto del tiempo, disfruta.`)}
          </p>
        </div>

        {/* Pli 2 — AlertScene */}
        <div style={{marginBottom:28,borderRadius:20,overflow:"hidden"}}>
          <ErrBound><Suspense fallback={null}><AlertScene /></Suspense></ErrBound>
        </div>

        {/* Pli 3 — Capture email */}
        <div style={{background:"linear-gradient(135deg,#190c2c,#142824)",border:"1px solid rgba(255,255,255,.08)",borderRadius:18,padding:"18px 20px",marginBottom:28,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:"-50%",left:"-20%",width:"60%",height:"200%",background:"radial-gradient(ellipse, rgba(34,197,94,.06) 0%, transparent 70%)",pointerEvents:"none"}}/>
          <div style={{position:"relative"}}>
            {submitted ? (
              <div style={{textAlign:"center",fontSize:14,fontWeight:600,color:"#1c7fb0"}}>
                <span style={{fontSize:22,display:"block",marginBottom:6}}>✅</span>
                {_t(lang,"C'est fait ! Le verdict du matin arrive dans ta boîte.","You're in! The morning verdict will arrive in your inbox.","¡Listo! El veredicto matutino llegará a tu bandeja.")}
              </div>
            ) : isSubscribed ? (
              <div style={{textAlign:"center",fontSize:13.5,fontWeight:600,color:"rgba(255,255,255,.85)"}}>
                <span style={{fontSize:18,marginRight:6}}>✓</span>
                {_t(lang,"Tu es déjà inscrit aux alertes quotidiennes.","You are already subscribed to daily alerts.","Ya estás suscrito a las alertas diarias.")}
                <button onClick={() => onPremium("alertes_subscribed")}
                  style={{display:"block",margin:"10px auto 0",background:"none",border:"none",color:"#FFC72C",fontWeight:800,fontSize:13,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
                  {_t(lang,"Gérer mes alertes Premium →","Manage my Premium alerts →","Gestionar mis alertas Premium →")}
                </button>
              </div>
            ) : (
              <>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>
                  {_t(lang,"GRATUIT","FREE","GRATIS")}
                </div>
                <div style={{fontSize:14.5,fontWeight:700,color:"#fff",marginBottom:6}}>
                  {_t(lang,`Reçois le verdict du matin sur ${beachName}`,`Get the morning verdict for ${beachName}`,`Recibe el veredicto matutino sobre ${beachName}`)}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginBottom:14,lineHeight:1.4}}>
                  {_t(lang,"Bilan matinal chaque jour + alerte immédiate si le statut change.","Daily morning brief + immediate alert if status changes.","Resumen matinal diario + alerta inmediata si el estado cambia.")}
                </div>
                <form onSubmit={handleSubmit} style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input type="email" inputMode="email" autoComplete="email" required placeholder={_t(lang,"ton@email.com","your@email.com","tu@email.com")}
                    value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}
                    style={{flex:1,padding:"12px 14px",borderRadius:12,border:"1px solid rgba(255,255,255,.12)",fontSize:16,fontFamily:"inherit",background:"rgba(255,255,255,.06)",outline:"none",minWidth:0,color:"#fff"}}/>
                  <button type="submit" disabled={busy}
                    style={{background:"#1c7fb0",color:"#06231d",border:"none",borderRadius:12,padding:"12px 18px",fontSize:14.5,fontWeight:800,cursor:"pointer",fontFamily:"inherit",opacity:busy?.7:1}}>
                    {busy ? "..." : _t(lang,"S'inscrire","Subscribe","Suscribirme")}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Pli 4 — Preuve de valeur Premium */}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:32,padding:"0 4px"}}>
          {[
            ["bell", _t(lang,"Alerte la VEILLE quand les sargasses approchent de ta plage","Alert the DAY BEFORE sargassum approaches your beach","Alerta la VÍSPERA cuando el sargazo se acerque a tu playa")],
            ["brief", _t(lang,"Le brief complet du matin : ta meilleure plage du jour","The morning brief: your best clean beach today","El brief matinal: tu mejor playa limpia hoy")],
            ["cal7", _t(lang,"Les 7 jours de prévisions complets, plage par plage","The 7-day forecast, beach by beach","Los 7 días de pronóstico, playa por playa")]
          ].map(([ic,txt],i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:12,fontSize:13.5,fontWeight:600,color:"rgba(255,255,255,.85)",lineHeight:1.35}}>
              <BrandIcon name={ic} size={20} style={{color:"rgba(255,255,255,.92)",marginTop:1}} />
              <span>{txt}</span>
            </div>
          ))}
        </div>

        {/* Pli 5 — CTA conversion UNIQUE */}
        <button onClick={() => onPremium("alertes")} className="gbtn"
          style={{display:"block",width:"100%",textAlign:"center",background:"#FFC72C",color:"#120821",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800,fontSize:16,padding:"16px 24px",borderRadius:18,boxShadow:"0 8px 28px rgba(255,199,44,.25)",marginBottom:10}}>
          {_t(lang,"Découvrir Premium","Discover Premium","Descubrir Premium")}
        </button>
        <div style={{textAlign:"center",fontSize:11.5,color:"rgba(255,255,255,.45)",marginBottom:36}}>
          {PAY_CAPTURE_ONLY?_t(lang,"Sans carte — juste ton email","No card — just your email","Sin tarjeta — solo tu email"):_t(lang,"Paiement unique — remboursé en 1 email sous 30 j","One-time payment — refunded in 1 email within 30 days","Pago único — reembolso en 1 email en 30 días")}
        </div>

        {/* Pli 6 — Sorties */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,borderTop:"1px solid rgba(255,255,255,.07)",paddingTop:24}}>
          <button onClick={onShowMap}
            style={{background:"none",border:"none",color:"#1c7fb0",fontWeight:700,fontSize:13.5,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
            {_t(lang,"Voir l'état des plages maintenant →","See beach status now →","Ver el estado de las playas ahora →")}
          </button>
          {!IS_NEW_REGION&&<a href="/previsions/"
            style={{color:"rgba(255,255,255,.5)",fontWeight:600,fontSize:13,textDecoration:"underline",fontFamily:"inherit"}}>
            {_t(lang,"Comment marchent nos prévisions →","How our forecasts work →","Cómo funcionan nuestros pronósticos →")}
          </a>}
        </div>
      </div>
    </div>
  )
}

export default AlertHub

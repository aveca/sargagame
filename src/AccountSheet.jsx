// AccountSheet — « Mon accès » : feuille compte unifiée ouverte par l'icône personnage du
// Header. Remplace le double-piège (toast éphémère quand premium + window.prompt qui RE-DEMANDE
// l'email à chaque clic). Deux griefs fondateur adressés :
//   1) premium → AFFICHE l'email lié (localStorage), ne le redemande plus ;
//   2) notifications gérées ICI (là où l'email vit), au lieu d'une cloche Header devenue inerte
//      une fois les alertes accordées.
// Doctrine mobile-first du repo : role=dialog, ✕≥44px, Échap, tap backdrop, swipe-down
// (useSwipeClose) = 4 voies de sortie ; reduced-motion ; jamais de cul-de-sac (restaurer /
// gérer / contact toujours offerts). Cohérence visuelle recopiée de WelcomePoste (INK/PAPER/GOLD,
// card, mascotte Watcher). Flag rollback ?account=0 (géré côté Sargasses_PROD).
import React, { useEffect, useRef, useState, useCallback } from "react"
import { useSwipeClose } from "./useSwipeClose"

const INK = "#0d0b14", PAPER = "#fdf6e3", GOLD = "#FFC72C", SUB = "#4a4458"
const _t = (lang, fr, en, es) => lang === "es" ? es : lang === "en" ? en : fr
const card = { background:PAPER, border:`2.5px solid ${INK}`, boxShadow:`3px 3px 0 ${INK}`, borderRadius:14, padding:"14px 15px" }

// Mascotte Veilleur — recopiée VERBATIM de WelcomePoste (autonome, anti-import-circulaire / budget lazy).
function Watcher({ size=40 }){
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{flexShrink:0}}>
      <rect x="6" y="20" width="9" height="8" rx="2" fill="#5b3a8e" stroke={INK} strokeWidth="1.6"/>
      <rect x="33" y="20" width="9" height="8" rx="2" fill="#5b3a8e" stroke={INK} strokeWidth="1.6"/>
      <path d="M24 12V6" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round"/>
      <circle cx="24" cy="5" r="2.4" fill={GOLD}/>
      <rect x="14" y="14" width="20" height="22" rx="6" fill="#5b3a8e" stroke={INK} strokeWidth="1.8"/>
      <rect x="14" y="14" width="20" height="7" rx="6" fill={GOLD}/>
      <circle cx="24" cy="27" r="7.5" fill="#07201e" stroke={INK} strokeWidth="1.4"/>
      <circle cx="24" cy="27" r="4.6" fill="#3fd07f"/>
      <circle cx="22" cy="25.2" r="1.8" fill="#eafbf8"/>
    </svg>
  )
}

const lsGet = (k)=>{ try{ return localStorage.getItem(k) }catch(_){ return null } }

export default function AccountSheet({ lang="fr", isPremium=false, onClose, onEnableNotif, onToggleAlerts, alertsOn, onRestore, onManage, onUpgrade, supportEmail="alerte@sargasses-martinique.com", track }){
  const panelRef = useRef(null), closeRef = useRef(null), reduced = useRef(false)
  const swipe = useSwipeClose(()=>{ tk("sg_account_close",{src:"swipe"}); onClose && onClose() })
  const setPanel = useCallback((el)=>{ panelRef.current=el; swipe.ref.current=el },[swipe])
  const tk = (e,p)=>{ try{ track && track(e,p||{}) }catch(_){} }

  // État premium dérivé du localStorage (source de vérité posée par le flux paiement / restore).
  const email = (lsGet("sg_premium_email") || lsGet("sg_email") || "").trim()
  const passEndRaw = parseInt(lsGet("sg_premium_pass_end")||"0",10)
  const passActive = !!(passEndRaw && passEndRaw > Date.now())
  const isRecurring = lsGet("sg_premium")==="1" && !passEndRaw
  const trialEndRaw = parseInt(lsGet("sg_premium_trial_end")||"0",10)
  const onTrial = !!(isRecurring && trialEndRaw && trialEndRaw > Date.now())
  const fmtDate = (ms)=>{ try{ return new Date(ms).toLocaleDateString(lang==="en"?"en-GB":lang==="es"?"es-ES":"fr-FR",{day:"numeric",month:"long",year:"numeric"}) }catch(_){ return "" } }

  // Permission notifications — état re-checké après un tap « Activer » (le prompt natif est async).
  const readPerm = ()=>{ try{ return (typeof Notification!=="undefined") ? Notification.permission : "default" }catch(_){ return "default" } }
  const [perm, setPerm] = useState(readPerm)
  const notifOn = perm === "granted"
  const iosBrowser = (()=>{ try{ return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.navigator.standalone===true || window.matchMedia("(display-mode: standalone)").matches) }catch(_){ return false } })()

  useEffect(()=>{ try{ reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches }catch(_){} },[])

  // Re-lecture de la permission au retour au premier plan (l'utilisateur accepte le prompt natif hors React).
  useEffect(()=>{
    const sync = ()=>setPerm(readPerm())
    const iv = setInterval(sync, 1200)
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", sync)
    return ()=>{ clearInterval(iv); window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync) }
  },[])

  // a11y : focus ✕ à l'ouverture, focus-trap 1 niveau, Échap → sortie.
  useEffect(()=>{
    tk("sg_account_view",{ premium:isPremium?1:0, notif:notifOn?1:0 })
    const t = setTimeout(()=>{ try{ closeRef.current && closeRef.current.focus() }catch(_){} }, 30)
    const onKey = (e)=>{
      if(e.key==="Escape"){ e.stopPropagation(); exit("esc"); return }
      if(e.key==="Tab"){
        const root=panelRef.current; if(!root) return
        const f=root.querySelectorAll('button,a[href],input,[tabindex]:not([tabindex="-1"])'); if(!f.length) return
        const first=f[0], last=f[f.length-1]
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus() }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey, true)
    return ()=>{ clearTimeout(t); document.removeEventListener("keydown", onKey, true) }
  // eslint-disable-next-line
  },[])

  const exit = (src)=>{ tk("sg_account_close",{src}); onClose && onClose() }
  const enableAlerts = ()=>{ tk("sg_account_notif_enable",{}); try{ onEnableNotif && onEnableNotif() }catch(_){}; setTimeout(()=>setPerm(readPerm()), 1600) }

  const h2 = { font:"400 15px/1 'Anton','Bricolage Grotesque',sans-serif", letterSpacing:".01em", color:INK }
  const subTxt = { font:"500 clamp(13px,3.6vw,14px)/1.45 'Bricolage Grotesque',system-ui,sans-serif", color:SUB }
  const goldBtn = { font:"700 clamp(15px,4vw,16px)/1.15 'Bricolage Grotesque',system-ui,sans-serif", color:INK, background:GOLD, border:`2.5px solid ${INK}`, borderRadius:999, padding:"12px 16px", cursor:"pointer", minHeight:44, boxShadow:`3px 3px 0 ${INK}`, width:"100%" }
  const ghostBtn = { ...goldBtn, background:"#fffbf0" }
  const okBadge = (label)=>(<span style={{display:"inline-flex",alignItems:"center",gap:5,font:"700 11px/1 'Bricolage Grotesque',system-ui,sans-serif",color:"#0a7d33"}}><span aria-hidden="true">✓</span>{label}</span>)

  const planLabel = onTrial
    ? _t(lang,"Essai en cours","Trial active","Prueba activa")
    : isRecurring
      ? _t(lang,"Abonnement actif","Subscription active","Suscripción activa")
      : passActive
        ? _t(lang,"Pass actif","Pass active","Pase activo")
        : _t(lang,"Premium actif","Premium active","Premium activo")

  return (
    <div role="dialog" aria-modal="true" className="sg-onink-scope" data-sg-live="1" aria-label={_t(lang,"Mon accès","My access","Mi acceso")}>
      {/* Backdrop — 4e voie de sortie (tap hors feuille). */}
      <div onClick={()=>exit("backdrop")} data-sg-live="1" style={{position:"fixed", inset:0, zIndex:1440, background:"rgba(10,11,20,.55)",
        animation: reduced.current ? "none" : "asFade .2s ease both"}}/>
      <div ref={setPanel} onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}
        style={{position:"fixed", left:0, right:0, bottom:0, zIndex:1445, maxHeight:"92vh", overflowY:"auto", WebkitOverflowScrolling:"touch",
          background:PAPER, color:INK, fontFamily:"'Bricolage Grotesque',system-ui,sans-serif",
          borderTopLeftRadius:20, borderTopRightRadius:20, borderTop:`3px solid ${INK}`, boxShadow:`0 -6px 0 rgba(13,11,20,.12)`,
          padding:`0 0 calc(20px + env(safe-area-inset-bottom))`,
          animation: reduced.current ? "none" : "asUp .26s cubic-bezier(.34,1.4,.5,1) both"}}>
        <style>{`@keyframes asUp{from{transform:translateY(30px);opacity:.5}to{transform:translateY(0);opacity:1}}
          @keyframes asFade{from{opacity:0}to{opacity:1}}
          @media (prefers-reduced-motion: reduce){[data-as]{animation:none!important}}`}</style>

        <div data-as="1">
          {/* Grip swipe + HEADER */}
          <div style={{position:"sticky", top:0, zIndex:2, background:PAPER, borderBottom:`2.5px solid ${INK}`, padding:`10px clamp(14px,4.5vw,22px) 11px`}}>
            <div aria-hidden="true" style={{width:44, height:5, borderRadius:999, background:"#d8d0bd", margin:"0 auto 10px"}}/>
            <div style={{display:"flex", alignItems:"center", gap:11}}>
              <Watcher size={38}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{font:"400 clamp(20px,5.4vw,26px)/1.06 'Anton','Bricolage Grotesque',sans-serif", textTransform:"uppercase"}}>{_t(lang,"Mon accès","My access","Mi acceso")}</div>
                <div style={{...subTxt, marginTop:2}}>{_t(lang,"Ton compte, tes alertes.","Your account, your alerts.","Tu cuenta, tus alertas.")}</div>
              </div>
              <button ref={closeRef} onClick={()=>exit("close")} aria-label={_t(lang,"Fermer","Close","Cerrar")}
                style={{flexShrink:0, width:44, height:44, borderRadius:999, border:`2.5px solid ${INK}`, background:GOLD, color:INK, font:"700 17px/1 system-ui", cursor:"pointer", boxShadow:`2px 2px 0 ${INK}`}}>✕</button>
            </div>
          </div>

          <div style={{padding:"14px clamp(14px,4.5vw,22px)", display:"flex", flexDirection:"column", gap:"clamp(11px,2.8vw,13px)", maxWidth:520, margin:"0 auto"}}>

            {/* [A] STATUT + EMAIL */}
            {isPremium ? (
              <div style={{...card, background:"linear-gradient(135deg,#fff6d8,#fdf6e3 60%)", outline:`2px solid ${GOLD}`, outlineOffset:-6}}>
                <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                  <span style={{display:"inline-flex", alignItems:"center", gap:5, font:"700 11px/1 'Bricolage Grotesque',system-ui,sans-serif", letterSpacing:".05em", textTransform:"uppercase", color:INK, background:GOLD, border:`2px solid ${INK}`, borderRadius:6, padding:"4px 8px"}}>⭐ {planLabel}</span>
                </div>
                {email ? (
                  <>
                    <div style={{...subTxt, marginBottom:3}}>{_t(lang,"Ton accès est lié à cet email :","Your access is linked to this email:","Tu acceso está vinculado a este email:")}</div>
                    <div style={{font:"700 clamp(15px,4.4vw,17px)/1.3 'Bricolage Grotesque',system-ui,sans-serif", color:INK, wordBreak:"break-all"}}>{email}</div>
                  </>
                ) : (
                  <div style={subTxt}>{_t(lang,"Premium actif sur cet appareil. Ajoute ton email pour le retrouver partout.","Premium active on this device. Add your email to keep it everywhere.","Premium activo en este dispositivo. Añade tu email para conservarlo en todas partes.")}</div>
                )}
                {onTrial && trialEndRaw>Date.now() && <div style={{...subTxt, marginTop:6, color:INK}}>{_t(lang,"Essai gratuit jusqu'au ","Free trial until ","Prueba gratis hasta el ")+fmtDate(trialEndRaw)}</div>}
                {!onTrial && passActive && <div style={{...subTxt, marginTop:6, color:INK}}>{_t(lang,"Actif jusqu'au ","Active until ","Activo hasta el ")+fmtDate(passEndRaw)}</div>}

                <div style={{display:"flex", flexWrap:"wrap", gap:8, marginTop:12}}>
                  {isRecurring && onManage && (
                    <button onClick={()=>{ tk("sg_account_manage",{}); onManage() }} style={{...ghostBtn, width:"auto", flex:"1 1 auto"}}>{_t(lang,"Gérer / résilier","Manage / cancel","Gestionar / cancelar")}</button>
                  )}
                  {onRestore && (
                    <button onClick={()=>{ tk("sg_account_restore",{ctx:"premium"}); onRestore() }} style={{background:"none", border:"none", padding:"11px 4px", minHeight:44, font:"700 12.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline", cursor:"pointer", flex:"1 1 auto"}}>{_t(lang,"Ce n'est pas toi ? Restaurer un autre accès","Not you? Restore another access","¿No eres tú? Restaurar otro acceso")}</button>
                  )}
                </div>
              </div>
            ) : (
              <div style={card}>
                <div style={h2}>{_t(lang,"Déjà payé ?","Already paid?","¿Ya pagaste?")}</div>
                <div style={{...subTxt, margin:"6px 0 11px"}}>{_t(lang,"Retrouve ton Pass sur cet appareil avec l'email de ton paiement.","Restore your Pass on this device with your payment email.","Recupera tu Pase en este dispositivo con el email de tu pago.")}</div>
                {onRestore && <button onClick={()=>{ tk("sg_account_restore",{ctx:"free"}); onRestore() }} style={goldBtn}>{_t(lang,"Retrouver mon accès","Restore my access","Recuperar mi acceso")}</button>}
                {onUpgrade && (
                  <button onClick={()=>{ tk("sg_account_upgrade",{}); onUpgrade() }} style={{background:"none", border:"none", padding:"12px 4px 2px", minHeight:44, font:"700 12.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline", cursor:"pointer"}}>{_t(lang,"Pas encore de Pass ? Le découvrir →","No Pass yet? Discover it →","¿Sin Pase aún? Descúbrelo →")}</button>
                )}
              </div>
            )}

            {/* [B] NOTIFICATIONS — interrupteur ON/OFF ICI (là où vit l'email). */}
            {(()=>{
              const on = (alertsOn!=null) ? !!alertsOn : notifOn
              const doToggle = ()=>{ if(onToggleAlerts){ onToggleAlerts() } else if(onEnableNotif){ enableAlerts() } }
              return (
            <div style={card}>
              <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8}}>
                <span style={h2}>{_t(lang,"Alertes sargasses","Sargassum alerts","Alertas de sargazo")}</span>
                {on && okBadge(_t(lang,"activées","on","activadas"))}
              </div>
              <div style={{...subTxt, margin:"6px 0 11px"}}>{_t(lang,"Une alerte le matin où ta plage tourne — jamais pour rien. En saison calme, on ne te ping pas.","One alert the morning your beach turns — never for nothing. In calm season we won't ping you.","Una alerta la mañana en que tu playa cambia — nunca por nada. En temporada calma no te molestamos.")}</div>
              {on ? (
                <>
                  <div style={{...subTxt, color:INK, marginBottom:10}}>{_t(lang,"Le Veilleur t'écrit chaque matin 🔔","Le Veilleur writes you each morning 🔔","El Vigía te escribe cada mañana 🔔")}</div>
                  <button onClick={doToggle} style={ghostBtn}>{_t(lang,"Désactiver les alertes","Turn off alerts","Desactivar alertas")}</button>
                </>
              ) : perm==="denied" ? (
                <div style={{...subTxt, color:INK}}>{_t(lang,"Notifications bloquées. Réactive-les dans les réglages de ton téléphone/navigateur.","Notifications blocked. Re-enable them in your phone/browser settings.","Notificaciones bloqueadas. Reactívalas en los ajustes de tu teléfono/navegador.")}</div>
              ) : iosBrowser ? (
                <div style={{...subTxt, color:INK}}>{_t(lang,"Sur iPhone : Partager → « Sur l'écran d'accueil », puis reviens activer les alertes.","On iPhone: Share → 'Add to Home Screen', then come back to enable alerts.","En iPhone: Compartir → 'A pantalla de inicio', luego vuelve a activar las alertas.")}</div>
              ) : (
                <button onClick={doToggle} style={goldBtn}>{_t(lang,"Activer les alertes","Enable alerts","Activar alertas")}</button>
              )}
            </div>
              )
            })()}

            {/* [C] CONTACT — jamais de cul-de-sac */}
            <div style={{...card, background:"#fff8e8", borderStyle:"dashed"}}>
              <div style={{...subTxt, color:"#3a3548"}}>{_t(lang,"Un souci d'accès ou de paiement ?","Access or payment issue?","¿Problema de acceso o pago?")}</div>
              <a href={`mailto:${supportEmail}`} onClick={()=>tk("sg_account_contact",{})}
                style={{display:"inline-block", marginTop:6, font:"800 12.5px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color:INK, textDecoration:"underline"}}>{supportEmail}</a>
            </div>

            {/* PIED honnêteté */}
            <div style={{textAlign:"center", padding:"2px 4px 0"}}>
              <div style={{font:"600 10px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color:"#3a3548"}}>{_t(lang,"Il regarde la mer, jamais tes vacances.","He watches the sea, never your holiday.","Mira el mar, nunca tus vacaciones.")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

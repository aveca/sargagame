// ErrorModal.jsx — UI d'erreur réutilisable (modal + inline) pour le chemin de l'argent
// EXTRAIT de PremiumModal.jsx — utilisé par B2BModal, PassOffer, PremiumModal
import React,{useEffect} from "react"
import * as SG from "../Sargasses_PROD.jsx"

const { COMIC, _t } = SG

// ErrorModal — Modal d'erreur standardisé (design comic, cohérent)
export function ErrorModal({isOpen,onClose,title,message,ctaLabel,onCta,icon="⚠️"}){
  if(!isOpen) return null
  const I=COMIC
  const handleKeyDown=(e)=>{
    if(e.key==="Escape"){onClose()}
  }
  useEffect(()=>{
    document.addEventListener("keydown",handleKeyDown)
    return()=>document.removeEventListener("keydown",handleKeyDown)
  },[])
  return(
    <div className="sg-error-modal-backdrop" onClick={onClose} style={{
      position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:9998,
      display:"flex",alignItems:"center",justifyItems:"center",padding:16
    }}>
      <div className="sg-error-modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="error-title" style={{
        background:"#fff",borderRadius:16,padding:24,maxWidth:400,width:"100%",
        boxShadow:"0 20px 40px rgba(0,0,0,0.3)",border:`2px solid ${COMIC.ink}`,
        position:"relative",transform:"scale(1)",animation:"sg-modal-pop 0.3s cubic-bezier(.34,1.4,.5,1)"
      }}>
        <style jsx>{`
          @keyframes sg-modal-pop {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <button onClick={onClose} aria-label={_t(lang,"Fermer","Close","Cerrar")} style={{
          position:"absolute",top:8,right:8,width:32,height:32,borderRadius:8,
          border:"none",background:"rgba(0,0,0,0.05)",fontSize:20,lineHeight:1,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"
        }}>×</button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>{icon}</div>
          <h2 id="error-title" style={{font:"800 20px/1.2 'Bricolage Grotesque'",color:COMIC.ink,marginBottom:12}}>{title}</h2>
          <p style={{font:"500 16px/1.5 'Bricolage Grotesque'",color:"#333",marginBottom:20}}>{message}</p>
          {ctaLabel && (
            <button onClick={()=>{onCta?.();onClose()}} style={{
              width:"100%",padding:14,borderRadius:12,border:`2px solid ${COMIC.ink}`,
              background:COMIC.gold,color:COMIC.ink,font:"800 16px/1 'Bricolage Grotesque'",
              cursor:"pointer",boxShadow:"2px 2px 0 "+COMIC.ink
            }}>{ctaLabel}</button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ErrorInline — Affichage d'erreur en ligne (dans le flux, pas modal)
 * Usage: <ErrorInline message={payError} icon="⚠️" />
 */
export function ErrorInline({message,icon="⚠️",className=""}){
  if(!message) return null
  const I=COMIC
  return(
    <div className={"sg-error-inline "+className} role="alert" style={{
      display:"flex",alignItems:"flex-start",gap:12,padding:"14px 16px",
      background:"rgba(232,82,42,0.1)",border:`1.5px solid ${COMIC.red}`,
      borderRadius:12,color:COMIC.ink,font:"600 15px/1.4 'Bricolage Grotesque'"
    }}>
      <span style={{fontSize:20,flexShrink:0}}>{icon}</span>
      <span style={{flex:1}}>{message}</span>
    </div>
  )
}

/**
 * ToastError — Toast d'erreur non-bloquant (style snackbar)
 */
export function ToastError({message,onDismiss,autoDismiss=5000}){
  const I=COMIC
  useEffect(()=>{
    if(autoDismiss){const t=setTimeout(onDismiss,autoDismiss);return()=>clearTimeout(t)}
  },[autoDismiss,onDismiss])
  return(
    <div className="sg-toast-error" role="alert" style={{
      position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",
      display:"flex",alignItems:"center",gap:12,padding:"14px 20px",
      background:COMIC.ink,color:"#fff",borderRadius:12,
      boxShadow:"0 8px 24px rgba(0,0,0,0.3)",zIndex:9999,
      animation:"sg-toast-in 0.3s cubic-bezier(.34,1.4,.5,1)"
    }}>
      <style jsx>{`
        @keyframes sg-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      <span style={{fontSize:20}}>⚠️</span>
      <span style={{font:"600 15px/1.4 'Bricolage Grotesque'"}}>{message}</span>
      <button onClick={onDismiss} aria-label="Fermer" style={{
        background:"none",border:"none",color:"#fff",fontSize:20,lineHeight:1,
        cursor:"pointer",padding:0,marginLeft:8
      }}>×</button>
    </div>
  )
}

export { ErrorModal as default }
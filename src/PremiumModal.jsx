/* PremiumModal — surface de paiement (PASS-ONLY Mollie on-site) + paywalls associés.
 * REFACTOR: logique extraite dans src/PremiumModal/ :
 *   - doSubscribe.jsx        → logique paiement (Mollie/Stripe/PayPal, pass, subs, wallets)
 *   - PayGatewayHandler.jsx  → Apple Pay / Google Pay (Mollie redirect + native on-site)
 *   - B2BModal.jsx           → offre B2B Pro (TerritoireMeeting inclus)
 *   - ErrorModal.jsx         → UI d'erreur réutilisable (modal + inline + toast)
 *   - WorldPaywall.jsx       → Paywall "Monde" (carte + prévisions globales)
 *   - ComicPaywall.jsx       → Paywall "BD" plein écran (takeover immersif)
 * Ce module reste le point d'entrée principal, chargé en LAZY à l'ouverture du paywall. */
import React,{useState,useEffect,useMemo,useRef,useCallback} from "react"
import PassOffer from "./PassOffer.jsx"
import {SeqDots} from "./SeqPrimitives.jsx"
import * as SG from "./Sargasses_PROD.jsx"
import {beginCheckout, addPaymentInfo, purchase, getPlanMeta} from "./ga4-ecommerce.js"

// Import des modules extraits
import { usePaymentLogic, _relHref } from "./PremiumModal/doSubscribe.jsx"
import { WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
import { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
import { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
import { WorldPaywall } from "./PremiumModal/WorldPaywall.jsx"
import { ComicPaywall } from "./PremiumModal/ComicPaywall.jsx"
import useMediaQuery from "./hooks/useMediaQuery.js"

const {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, EUR_TRIP_CENTS, IS_NEW_REGION, LINK_ANNUAL, LINK_MONTHLY,
  LINK_PRO, MOLLIE_PROFILE, MOLLIE_TESTMODE, MOL_FIELD, MOL_LABEL, NO_TRIAL, PAYPAL_CLIENT_ID, PAYPAL_PLANS,
  PAYWALL_READY, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL, PAY_PROVIDER, PRICE_MO, PRICE_TRIP, PRICE_TRIP_EUR,
  PRICE_YR, REGION, REGION_PAY, SARG_TO_BEACH, STRIPE_PK, SUPPORT_EMAIL, T, TRIP_CENTS,
  VEILLEUR_MOOD, __COMM, __REL, _t, abVariant, fmtPassPrice, loadMollieJs, loadPayPalSdk,
  loadStripeJs, miVeil, moodFromStatus, sgMyReferralCode, sgReferredBy, sgToast, sgVerifySub, submitLead,
  track, walletAvail
} = SG


// CompareRow for Gratuit vs Premium table
const CompareRow=({label,free,pro})=>(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",alignItems:"center",borderTop:"1px solid rgba(255,255,255,.04)",padding:"7px 4px",gap:4}}>
  <div style={{color:"rgba(255,255,255,.5)",fontSize:12}}>{label}</div>
  <div style={{textAlign:"center",color:free?"#22C55E":"#E8522A",fontSize:14}}>{free?"✓":"✗"}</div>
  <div style={{textAlign:"center",color:pro?"#22C55E":"#E8522A",fontSize:14}}>{pro?"✓":"✗"}</div>
</div>)

// Skeleton during prewarm — premium golden-hour shimmer
const PremiumModalSkeleton=()=>(<div style={{display:"flex",flexDirection:"column",gap:16,padding:16}}>
  <div style={{height:14,borderRadius:999,background:"linear-gradient(90deg,rgba(255,199,44,.06) 25%,rgba(255,199,44,.14) 50%,rgba(255,199,44,.06) 75%)",backgroundSize:"200% 100%",animation:"sg-skeleton 1.5s ease-in-out infinite",width:"40%"}}/>
  <div style={{height:28,borderRadius:8,background:"linear-gradient(90deg,rgba(255,255,255,.04) 25%,rgba(255,255,255,.10) 50%,rgba(255,255,255,.04) 75%)",backgroundSize:"200% 100%",animation:"sg-skeleton 1.5s ease-in-out infinite"}}/>
  <div style={{height:14,borderRadius:999,background:"linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.08) 50%,rgba(255,255,255,.03) 75%)",backgroundSize:"200% 100%",animation:"sg-skeleton 1.5s ease-in-out infinite",width:"70%"}}/>
  {[1,2].map(i=>(<div key={i} style={{height:56,borderRadius:14,border:"1px solid rgba(255,255,255,.08)",background:"linear-gradient(90deg,rgba(255,255,255,.03) 25%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.03) 75%)",backgroundSize:"200% 100%",animation:"sg-skeleton 1.5s ease-in-out infinite"}}/>))}
  <div style={{height:48,borderRadius:14,border:"1.5px solid rgba(255,199,44,.25)",background:"linear-gradient(90deg,rgba(255,199,44,.06) 25%,rgba(255,199,44,.12) 50%,rgba(255,199,44,.06) 75%)",backgroundSize:"200% 100%",animation:"sg-skeleton 1.5s ease-in-out infinite"}}/>
</div>)

// PremiumModal — composant principal exporté
export default function PremiumModal({
  lang, source, onClose, onActivated,
  sargData, island, beach, pwVariant, pwPass, pwSocial, pwFresh, _passUpdatedAt
}){
  // Refs/états de paiement — créés en interne (le split les avait perdus).
  // Miroir de l'ancien PremiumModal monolithique (ligne ~1739 de l'ancien fichier).
  const passCtxRef = useRef(null) // {pass,cents,days,cur} si achat d'un PASS, sinon null (abo)
  const payPlanRef = useRef("pro") // plan d'abonnement courant (non utilisé par pass one-time)
  const payEmailRef = useRef(null)
  const payReadyRef = useRef(false)
  const elementsRef = useRef(null)
  const stripeRef = useRef(null)
  const setupSecretRef = useRef(null)
  const mollieRef = useRef(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState("")
  const [payRedirecting, setPayRedirecting] = useState(false)
  const [paySuccess, setPaySuccess] = useState(false)
  const [payStep, setPayStep] = useState(false)
  const [consentOk, setConsentOk] = useState(false)
  const consentFlag = !PAY_CAPTURE_ONLY // consentement requis seulement si paiement réel
  const [pwToast, setPwToast] = useState(null)
  const pwSocialProof = null

  // Hooks extraits
  const { doSubscribe, payWithWallet, walletRedirect, onPayEmailInput } = usePaymentLogic({
    lang, source, onActivated, onClose,
    payPlanRef, passCtxRef, payEmailRef,
    payBusy, setPayBusy, payError, setPayError,
    payReadyRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess,
    consentFlag, consentOk,
    elementsRef, stripeRef, setupSecretRef, mollieRef,
    PAY_PROVIDER, PAY_CAPTURE_ONLY, PAY_CUR,
    _t, track, submitLead, sgReferredBy, sgMyReferralCode,
    walletAvail, purchase, getPlanMeta
  })

  // Bridge PassOffer → doSubscribe : PassOffer.appelle onBuy({c,pass,days,segment})
  // mais ne connaît pas passCtxRef. On remplit passCtxRef.current ici (restore du
  // comportement pré-split, ancien PremiumModal.jsx ligne ~2707), puis on appelle
  // doSubscribe qui lit _pc=passCtxRef.current et déclenche le chemin pass one-time
  // (action:create_payment) au lieu du chemin abonnement (action:create_subscription).
  const onPassBuy = useCallback((item)=>{
    try{track("sg_pass_cta",{pass:item.pass, cents:item.c, source:source||"unknown", onsite:1, method:item.method||"card"})}catch(_){}
    passCtxRef.current = {
      pass: item.pass,
      cents: item.c,
      days: item.days || (item.pass === "p30" ? 30 : item.pass === "saison" ? 210 : 7),
      cur: PAY_CUR
    }
    if(item.method && item.method !== "card"){
      // Wallet (Apple Pay / Google Pay)
      try{payWithWallet(item.method)}catch(_){}
      return
    }
    // Carte on-site → déclenche doSubscribe ( lit passCtxRef.current automatiquement )
    try{doSubscribe()}catch(_){}
  },[source, track, payWithWallet, doSubscribe, PAY_CUR])

  // Common props passed to all paywall variants
  const commonPaywallProps = {
    lang, source, onClose, onActivated,
    sargData, island, beach, pwVariant, pwPass, pwSocial, pwFresh,
    payPlanRef, payEmailRef, payBusy, setPayBusy,
    payError, setPayError, payReadyRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess, consentFlag, consentOk, setConsentOk,
    elementsRef, stripeRef, setupSecretRef, mollieRef,
    pwStep: payStep, setPayStep, pwToast, setPwToast, pwSocialProof,
    doSubscribe, payWithWallet, walletRedirect, onPayEmailInput,
    onPassBuy
  }

  // Render the appropriate paywall variant
  const renderPaywall = () => {
    switch (pwVariant) {
      case "world":
        return <WorldPaywall {...commonPaywallProps} />
      case "comic":
        return <ComicPaywall {...commonPaywallProps} />
      case "beat":
      case "alert":
      case "watch":
      case "constel":
      case "calm":
      default:
        // For other variants, render WorldPaywall with variant
        return <WorldPaywall {...commonPaywallProps} pwVariant={pwVariant} />
    }
  }

  // Tracking durée d'ouverture du modal (pour analytics close)
  const modalOpenedAt = useRef(Date.now())
  useEffect(()=>{ modalOpenedAt.current = Date.now() }, [])

  return (
    <>
      {/* Backdrop sombre — click pour fermer */}
      <div
        className="backdrop"
        onClick={(e)=>{
          const ts=Math.round((Date.now()-modalOpenedAt.current)/1000)
          try{track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts})}catch(_){}
          // Pass-through : si le clic tombe sur un pin de la carte sous le backdrop, l'ouvrir
          const x=e.clientX,y=e.clientY
          onClose()
          requestAnimationFrame(()=>{try{
            const el=document.elementFromPoint(x,y)
            const pin=el&&el.closest&&el.closest(".leaflet-marker-icon")
            if(pin)pin.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}))
          }catch(_){}})
        }}
      />

      {/* Panel modale — positionné en bas, scrollable, z-index 1100 */}
      <div
        className="sg-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={_t(lang,"Prévisions premium","Premium forecast","Pronóstico premium")}
        style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:1100,
          background:"linear-gradient(145deg,#190c2c,#120821)",
          borderRadius:"24px 24px 0 0", padding:"28px 24px 20px",
          color:"#e6edf3", maxHeight:"85vh", overflowX:"hidden", overflowY:"auto",
        }}
      >
        {/* Handle drag indicator */}
        <div className="sheet-handle" style={{background:"rgba(255,255,255,.2)"}}/>
        {/* Close X top-right */}
        <button
          aria-label={_t(lang,"Fermer","Close","Cerrar")}
          onClick={()=>{const ts=Math.round((Date.now()-modalOpenedAt.current)/1000);try{track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts,via:"close_x"})}catch(_e){};onClose()}}
          style={{position:"absolute",top:14,right:14,width:44,height:44,
            borderRadius:"50%",background:"rgba(255,255,255,.08)",border:"none",
            color:"rgba(255,255,255,.7)",fontSize:18,cursor:"pointer",lineHeight:1,
            forcedColorAdjust:"none",zIndex:6,fontFamily:"inherit",
            display:"flex",alignItems:"center",justifyContent:"center"}}
        >×</button>

        {/* Contenu du paywall */}
        {renderPaywall()}
      </div>
    </>
  )
}

// Export des sous-composants pour tests/réutilisation
export { PassOffer, SeqDots, PremiumModalSkeleton, CompareRow }
export { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
export { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
export { WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
export { usePaymentLogic, _relHref } from "./PremiumModal/doSubscribe.jsx"
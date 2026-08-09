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
import { usePayGateway, WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
import { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
import { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
import { WorldPaywall } from "./PremiumModal/WorldPaywall.jsx"
import { ComicPaywall } from "./PremiumModal/ComicPaywall.jsx"

const {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, EUR_TRIP_CENTS, IS_NEW_REGION, LINK_ANNUAL, LINK_MONTHLY,
  LINK_PRO, MOLLIE_PROFILE, MOLLIE_TESTMODE, MOL_FIELD, MOL_LABEL, NO_TRIAL, PAYPAL_CLIENT_ID, PAYPAL_PLANS,
  PAYWALL_READY, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL, PAY_PROVIDER, PRICE_MO, PRICE_TRIP, PRICE_TRIP_EUR,
  PRICE_YR, REGION, REGION_PAY, SARG_TO_BEACH, STRIPE_PK, SUPPORT_EMAIL, T, TRIP_CENTS,
  VEILLEUR_MOOD, __COMM, __REL, _t, abVariant, fmtPassPrice, loadMollieJs, loadPayPalSdk,
  loadStripeJs, miVeil, moodFromStatus, sgMyReferralCode, sgReferredBy, sgToast, sgVerifySub, submitLead,
  track, walletAvail
} = SG

// Simple media query hook (no deps)
function useMediaQuery(query){
  const [matches, setMatches] = useState(false)
  useEffect(()=>{
    if(typeof window==="undefined") return
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e)=>setMatches(e.matches)
    mq.addEventListener?.("change", handler)
    return ()=>mq.removeEventListener?.("change", handler)
  },[query])
  return matches
}

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
  sargData, island, beach, pwVariant, pwPass, pwSocial, pwFresh, _passUpdatedAt,
  passCtxRef, payPlanRef, payEmailRef, payBusy, setPayBusy,
  payError, setPayError, payReadyRef, payRedirecting, setPayRedirecting,
  paySuccess, setPaySuccess, consentFlag, consentOk,
  elementsRef, stripeRef, setupSecretRef, mollieRef,
  pwStep, setPayStep, pwToast, pwSocialProof
}){
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

  const { walletRedirect: gwWalletRedirect, payWithWallet: gwPayWithWallet } = usePayGateway({
    lang, source, onActivated, onClose,
    passCtxRef, payPlanRef, payEmailRef,
    setPayError, setPayBusy, setPaySuccess, setPayRedirecting,
    _t, track, submitLead, sgReferredBy, sgMyReferralCode,
    purchase, getPlanMeta
  })

  // Common props passed to all paywall variants
  const commonPaywallProps = {
    lang, source, onClose, onActivated,
    sargData, island, beach, pwVariant, pwPass, pwSocial, pwFresh,
    payPlanRef, payEmailRef, payBusy, setPayBusy,
    payError, setPayError, payReadyRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess, consentFlag, consentOk,
    elementsRef, stripeRef, setupSecretRef, mollieRef,
    pwStep, setPayStep, pwToast, pwSocialProof,
    doSubscribe, payWithWallet, walletRedirect, onPayEmailInput
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

  return (
    <div className="sg-premium-modal" style={{ position: "relative", width: "100%", maxWidth: 440, margin: "0 auto" }}>
      {renderPaywall()}
    </div>
  )
}

// Export des sous-composants pour tests/réutilisation
export { PassOffer, SeqDots, PremiumModalSkeleton, CompareRow }
export { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
export { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
export { usePayGateway, WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
export { usePaymentLogic, _relHref } from "./PremiumModal/doSubscribe.jsx"
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
import { findAlternatives } from "./lib/beach-decision.js"
import { WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
import { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
import { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
import { WorldPaywall } from "./PremiumModal/WorldPaywall.jsx"
import { ComicPaywall } from "./PremiumModal/ComicPaywall.jsx"
import { OnsiteCheckout } from "./PremiumModal/OnsiteCheckout.jsx"
import useMediaQuery from "./hooks/useMediaQuery.js"
import useModalA11y from "./hooks/useModalA11y.js"

const {
  BEACHES_FALLBACK, BEACH_TO_SARG, C, COMIC, EUR_TRIP_CENTS, IS_NEW_REGION, LINK_ANNUAL, LINK_MONTHLY,
  LINK_PRO, MOLLIE_PROFILE, MOLLIE_TESTMODE, MOL_FIELD, MOL_LABEL, NO_TRIAL, PAYPAL_CLIENT_ID, PAYPAL_PLANS,
  PAYWALL_READY, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL, PAY_PROVIDER, PRICE_MO, PRICE_TRIP, PRICE_TRIP_EUR,
  PRICE_YR, REGION, REGION_PAY, SARG_TO_BEACH, STRIPE_PK, SUPPORT_EMAIL, T, TRIP_CENTS,
  VEILLEUR_MOOD, __COMM, __REL, _t, abVariant, fmtPassPrice, loadMollieJs, loadPayPalSdk,
  loadStripeJs, miVeil, moodFromStatus, sgMyReferralCode, sgReferredBy, sgToast, sgVerifySub, submitLead,
  track, walletAvail
} = SG


// E9 — testabilité déterministe : ?sgcomm=<n> surcharge le compteur communauté
// (affichage paywall UNIQUEMENT — aucune écriture, aucune donnée inventée en
// prod : sans flag, toujours __COMM buildé). community=0 rend E9 testable en CI.
function readCommOverride() {
  try {
    const m = /[?&]sgcomm=(\d+)/.exec(window.location.search || "")
    return m ? Math.max(0, parseInt(m[1], 10) || 0) : __COMM
  } catch (_) { return __COMM }
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
  sargData, island, beach, pwVariant, _passUpdatedAt, beachCount = 0,
  allBeaches = []
}){
  // ⚠️ E6 — Affichage "Vous avez déjà un pass actif" au lieu du paywall
  // Vérification locale : si sg_premium="1" et pass_end futur, l'utilisateur possède déja un pass
  const hasActivePass = () => {
    try {
      const prem = localStorage.getItem("sg_premium")
      const passEnd = localStorage.getItem("sg_premium_pass_end")
      if (prem !== "1") return false
      if (!passEnd) return false
      const now = Date.now()
      const end = parseInt(passEnd, 10)
      if (end <= now) return false // expiré
      return true // pass actif → montrer message de "déjà premium"
    } catch (_) { return false }
  }
  const premiumMessage = hasActivePass()
    ? (
      <div style={{padding:24, textAlign:"center", color:"#e6edf3"}}>
        <div style={{fontSize:18, marginBottom:8}}>{_t(lang,"Vous avez déjà un pass actif","You have an active premium pass","Vous avez déjà un pass actif")}</div>
        <div style={{fontSize:14, opacity:.8}}>{_t(lang,"Vos prévisions 7 jours sont déverrouillées","Your 7-day forecast is unlocked","Vos prévisions 7j sont débloquées")}</div>
        <button
          onClick={()=>{onClose(); track("sg_premium_already_closed",{source:source||"unknown"})}}
          style={{margin:"16px 0 0", padding:"8px 16px", background:"rgba(255,199,44,.3)", border:"1px solid rgba(255,199,44,.5)", color:"#e6edf3", borderRadius:6, cursor:"pointer"}}>
          {_t(lang,"Fermer","Close","Cerrar")}
        </button>
      </div>
    )
    : null
// Refs/états de paiement — créés en interne (le split les avait perdus).
  // Miroir de l'ancien PremiumModal monolithique (ligne ~1739 de l'ancien fichier).
  const passCtxRef = useRef(null) // {pass,cents,days,cur} si achat d'un PASS, sinon null (abo)
  const payPlanRef = useRef("pro") // plan d'abonnement courant (non utilisé par pass one-time)
  const payEmailRef = useRef(null)
  const payReadyRef = useRef(false)
  // P0 money-path (2026-09-16) : payReadyRef = objet Mollie PRÊT, PAS les
  // Components montés. payMountedRef = les 4 Components montés (cardHolder,
  // cardNumber, expiry, cvc) — écrit par OnsiteCheckout (Effet 2), lu par
  // doSubscribe AVANT createToken (jamais de tokenize sans mounts).
  const payMountedRef = useRef(false)
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

  // Hooks extraits
  const { doSubscribe, payWithWallet, walletRedirect, onPayEmailInput } = usePaymentLogic({
    lang, source, onActivated, onClose,
    payPlanRef, passCtxRef, payEmailRef,
    payBusy, setPayBusy, payError, setPayError,
    payReadyRef, payMountedRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess,
    consentFlag, consentOk,
    elementsRef, stripeRef, setupSecretRef, mollieRef,
    PAY_PROVIDER, PAY_CAPTURE_ONLY, PAY_CUR,
    _t, track, submitLead, sgReferredBy, sgMyReferralCode,
    walletAvail, purchase, getPlanMeta
  })

  // Bridge PassOffer → OnsiteCheckout : PassOffer appelle onBuy({c,pass,days,segment})
  // On remplit passCtxRef.current (restore du comportement pré-split), puis :
  //  - wallet (Apple/Google Pay) → payWithWallet() direct (surf natif hors overlay)
  //  - carte on-site → setPayStep(true) qui révèle <OnsiteCheckout> (overlay z 1300)
  //    où l'utilisateur saisit email + 4 champs carte Mollie, puis clique "Payer" →
  //    doSubscribe() lit mollieRef.current.createToken() — refs DÉSORMONT remplies.
  // AVANT le fix : doSubscribe() était appelé direct → mollieRef.current=null → throw
  // silencieux dans catch → bouton "Commencer maintenant" muet sur les 5 domaines.
  const onPassBuy = useCallback((item)=>{
    // REVENUE 2026-09-23 : contexte déterministe joint (région/plage/devise) —
    // additif pur (aucun sens modifié) pour attribuer chaque CTA au revenu.
    let _rg = null; try { _rg = (island && (island.id || island)) || null } catch (_) {}
    try{track("sg_pass_cta",{pass:item.pass, cents:item.c, source:source||"unknown", onsite:1, method:item.method||"card", region:_rg, beach_id:(beach&&beach.id)||null, currency:PAY_CUR})}catch(_){}
    passCtxRef.current = {
      pass: item.pass,
      cents: item.c,
      days: item.days || (item.pass === "p30" ? 30 : item.pass === "saison" ? 210 : 7),
      cur: PAY_CUR
    }
    if(item.method && item.method !== "card"){
      try{payWithWallet(item.method)}catch(_){}
      return
    }
    setPayStep(true)
  },[source, track, payWithWallet, PAY_CUR, island, beach])

  // TAKEOVER §9 — preuve de valeur paywall : la semaine de la plage de contexte.
  // Données réelles uniquement ; null hors MQ/GP ou sans forecast (strip masqué).
  const tripDays = useMemo(() => {
    try {
      if (/[?&]tripplan=0/.test(window.location.search)) return null
      if (!beach || !sargData) return null
      const sid = SG.BEACH_TO_SARG[beach.id]
      const w = (sid && sargData.weekly && sargData.weekly[sid])
        || (sargData._enrichedWeekly && sargData._enrichedWeekly['_interp_' + beach.id])
      const fc = w && w.forecast
      if (!fc || !fc.length) return null
      const out = fc.slice(0, 7).map(d => (d && d.status) || null)
      const res = out.some(Boolean) ? out : null
      try { console.log('[sg][tripdays]', beach && beach.id, 'len', res && res.length) } catch (_) {}
      return res
    } catch (e) { try { console.log('[sg][tripdays] err', String(e).slice(0, 80)) } catch (_) {} return null }
  }, [beach, sargData])

  // WOW PAYWALL « LA TRAJECTOIRE » (2026-09-24, rollback ?sgtraj=0 côté UI) :
  // objets forecast COMPLETS (jour/date/statut/confiance réels — même source que
  // tripDays) + plan B RÉEL (findAlternatives) pour la mise en scène de la
  // semaine dans WorldPaywall. Données uniquement, jamais d'invention ;
  // null hors contexte plage ou forecast absent → module masqué.
  const trajForecast = useMemo(() => {
    try {
      if (!beach || !sargData) return null
      const sid = SG.BEACH_TO_SARG[beach.id]
      const w = (sid && sargData.weekly && sargData.weekly[sid])
        || (sargData._enrichedWeekly && sargData._enrichedWeekly['_interp_' + beach.id])
      const fc = w && w.forecast
      if (!fc || !fc.length) return null
      const out = fc.slice(0, 7).filter(d => d && (d.day || d.status))
      return out.length >= 2 ? out : null
    } catch (_) { return null }
  }, [beach, sargData])

  const trajBackup = useMemo(() => {
    try {
      if (!beach || !Array.isArray(allBeaches) || !allBeaches.length) return null
      const alts = findAlternatives(beach, allBeaches, { lang, maxAlternatives: 3 }) || []
      return alts.find(a => a && a.beach && a.beach.status === "clean") || alts[0] || null
    } catch (_) { return null }
  }, [beach, allBeaches, lang])

  // Common props passed to all paywall variants
  const commonPaywallProps = {
    lang, source, onClose, onActivated, track,
    sargData, island, beach, tripDays, beachCount, pwVariant,
    trajForecast, trajBackup,
    payPlanRef, payEmailRef, payBusy, setPayBusy,
    payError, setPayError, payReadyRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess, consentFlag, consentOk, setConsentOk,
    elementsRef, stripeRef, setupSecretRef, mollieRef,
    pwStep: payStep, setPayStep, pwToast, setPwToast,
    doSubscribe, payWithWallet, walletRedirect, onPayEmailInput,
    onPassBuy,
    PAY_CUR,
    submitLead, // A1 : capture lead pré-CTA (WorldPaywall, jamais bloquant)
    // E2 : preuve sociale réelle (0 = rien affiché, voir E9). __COMM = compteur
    // réel buildé (jamais inventé). ?sgcomm=<n> = override DISPLAY-ONLY pour les
    // tests E9 déterministes (community=0 non forçable sinon au build).
    community: readCommOverride(),
  }

  // Props pour <OnsiteCheckout> overlay paiement Mollie on-site (z 1300)
  const onsiteCheckoutProps = {
    lang, source, pwVariant,
    // WOW « LA TRAJECTOIRE » (2026-09-24) : echo de la semaine réelle dans le
    // checkout (composant null-safe : sans ces props, l'écho reste masqué).
    beach, trajForecast,
    payStep, setPayStep,
    passCtxRef, payPlanRef, payEmailRef,
    payBusy, setPayBusy, payError, setPayError,
    payReadyRef, payMountedRef, payRedirecting, setPayRedirecting,
    paySuccess, setPaySuccess,
    consentFlag, consentOk, setConsentOk,
    mollieRef,
    doSubscribe, payWithWallet, walletRedirect, onPayEmailInput,
    // constants
    PAY_PROVIDER, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL,
    NO_TRIAL, PRICE_MO, PRICE_YR, REGION_PAY, IS_NEW_REGION, REGION, __COMM,
    // helpers
    fmtPassPrice, _t, track, walletAvail,
    MOL_FIELD, MOL_LABEL, MOLLIE_PROFILE, MOLLIE_TESTMODE, loadMollieJs
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

  // A11y : Échap + focus trap + restauration focus sur le shell bottom-sheet.
  // (variante "comic" = takeover auto-géré par ComicPaywall ; escClose=false ici
  // pour ne pas doubler le handler — le hook reste null-safe sur panelRef vide.)
  // Garde : quand l'overlay checkout carte est ouvert (payStep), Échap ne ferme
  // QUE l'overlay (géré par OnsiteCheckout) — pas le paywall derrière.
  const panelRef = useRef(null)
  const payStepRef = useRef(payStep)
  payStepRef.current = payStep
  useModalA11y(panelRef, () => { if (!payStepRef.current) onClose() }, pwVariant !== "comic")

  // Tracking durée d'ouverture du modal (pour analytics close)
  const modalOpenedAt = useRef(Date.now())
  useEffect(()=>{ modalOpenedAt.current = Date.now() }, [])

  if (pwVariant === "comic") {
    // C3 fix (funnel stability 2026-08-12) — ComicPaywall is a full-screen
    // takeover (z 1200, inset:0) wrapping itself. Skip the bottom-sheet shell
    // (.sg-modal-panel z 1100 + handle + close X) and the backdrop pin
    // pass-through that was needed for sheet-type paywalls. ComicPaywall has
    // its own "Plus tard" button that calls onClose. The shell underneath
    // was invisible but sticky handlers (close X) remained — confusing.
    return (
      <>
        {/* Minimal backdrop just to dim the map behind — no pin pass-through.
            z1250 inline : au-dessus de la fiche plage (.lc-detail z1200) — UX-R2-003
            (la classe .backdrop seule = z1005 CSS, partagée ailleurs, inchangée). */}
        <div
          className="backdrop"
          style={{ zIndex: 1250 }}
          onClick={(e)=>{
            const ts=Math.round((Date.now()-modalOpenedAt.current)/1000)
            try{track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts})}catch(_){}
            onClose()
          }}
        />
        {alreadyPremium ? premiumMessage : renderPaywall()}
        {!alreadyPremium && <OnsiteCheckout {...onsiteCheckoutProps} />}
      </>
    )
  }

  // ── E6 ── message déjà premium : REMPLACE le paywall (jamais empilé
  // dessus — sinon l'utilisateur voit l'offre + le message en même temps).
  const alreadyPremium = premiumMessage !== null

  return (
    <>
      {/* Backdrop sombre — click pour fermer.
          z1250 inline : au-dessus de la fiche plage (.lc-detail z1200) — UX-R2-003
          (la classe .backdrop seule = z1005 CSS, partagée ailleurs, inchangée). */}
      <div
        className="backdrop"
        style={{ zIndex: 1250 }}
        onClick={(e)=>{
          const ts=Math.round((Date.now()-modalOpenedAt.current)/1000)
          try{track("sg_premium_modal_close",{source:source||"unknown",time_spent:ts})}catch(_){}
          // C1 fix (funnel stability 2026-08-12) — pin pass-through ONLY if the
          // paywall was opened < 300ms ago: that means the user tapped a pin
          // just as the paywall appeared (race we want to forgive). Past 300ms,
          // a backdrop click is a deliberate "close" — opening a random beach
          // the user didn't see creates the "boomerang fiche opened" confusion.
          const elapsed = Date.now() - modalOpenedAt.current
          if (elapsed > 300) { onClose(); return }
          const x=e.clientX,y=e.clientY
          onClose()
          requestAnimationFrame(()=>{try{
            const el=document.elementFromPoint(x,y)
            const pin=el&&el.closest&&el.closest(".leaflet-marker-icon")
            if(pin)pin.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}))
          }catch(_){}})
        }}
      />

      {/* Panel modale — positionné en bas, scrollable.
          z-index 1260 : AU-DESSUS de la fiche plage (.lc-detail z1200, ChasseDetail)
          et de lc-levelup (1250), mais SOUS l'overlay checkout Mollie
          (OnsiteCheckout z1300) qui doit rester au premier plan pendant le paiement.
          UX-R2-003 : à z1100 le panel s'ouvrait SOUS la fiche plage (invisible,
          clics interceptés) quand le paywall venait de « Débloquer les prévisions
          7 jours » depuis une fiche plage. Rollback : revenir à 1100/1250. */}
      <div
        className="sg-modal-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={_t(lang,"Prévisions premium","Premium forecast","Pronóstico premium")}
        style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:1260,
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

        {/* Contenu du paywall — remplacé par le message si pass déjà actif */}
        {alreadyPremium ? premiumMessage : renderPaywall()}
      </div>
      {!alreadyPremium && <OnsiteCheckout {...onsiteCheckoutProps} />}
    </>
  )
}

// Export des sous-composants pour tests/réutilisation
export { PassOffer, SeqDots, PremiumModalSkeleton, CompareRow }
export { B2BModal, TerritoireMeeting } from "./PremiumModal/B2BModal.jsx"
export { ErrorModal, ErrorInline, ToastError } from "./PremiumModal/ErrorModal.jsx"
export { WalletButtons } from "./PremiumModal/PayGatewayHandler.jsx"
export { usePaymentLogic, _relHref } from "./PremiumModal/doSubscribe.jsx"
// doSubscribe.js — Logique de paiement (Mollie/Stripe/PayPal, pass one-time, subscriptions, wallets)
// EXTRAIT de PremiumModal.jsx — ce module est importé par le composant principal
import {useCallback,useRef} from "react"
import {beginCheckout, addPaymentInfo, purchase, getPlanMeta} from "../ga4-ecommerce.js"
import * as SG from "../Sargasses_PROD.jsx"
import relHref from "../lib/relHref.js"

const {
  C, COMIC, IS_NEW_REGION, REGION, REGION_PAY,
  BEACHES_FALLBACK, BEACH_TO_SARG, SARG_TO_BEACH,
  PAYPAL_CLIENT_ID, PAYPAL_PLANS,
  PAYWALL_READY, PAY_CAPTURE_ONLY, PAY_CUR, PAY_LABEL, PAY_PROVIDER,
  PRICE_MO, PRICE_TRIP, PRICE_TRIP_EUR, PRICE_YR, TRIP_CENTS, EUR_TRIP_CENTS,
  LINK_ANNUAL, LINK_MONTHLY, LINK_PRO,
  STRIPE_PK, SUPPORT_EMAIL, T,
  VEILLEUR_MOOD, __COMM, __REL, _t, abVariant,
  fmtPassPrice, loadMollieJs, loadPayPalSdk, loadStripeJs,
  miVeil, moodFromStatus, sgMyReferralCode, sgReferredBy,
  sgToast, sgVerifySub, submitLead, track, walletAvail
} = SG

/**
 * Hook principal de paiement — encapsule toute la logique doSubscribe
 * Retourne { doSubscribe, payWithWallet, walletRedirect, payError, payBusy, payReadyRef, payRedirecting, paySuccess, setPayError, setPayBusy, setPaySuccess, setPayRedirecting }
 */
export function usePaymentLogic({
  lang,
  source,
  onActivated,
  onClose,
  payPlanRef,
  passCtxRef,
  payEmailRef,
  payBusy,
  setPayBusy,
  payError,
  setPayError,
  payReadyRef,
  payRedirecting,
  setPayRedirecting,
  paySuccess,
  setPaySuccess,
  consentFlag,
  consentOk,
  elementsRef,
  stripeRef,
  setupSecretRef,
  mollieRef,
  PAY_PROVIDER,
  PAY_CAPTURE_ONLY,
  PAY_CUR,
  _t,
  track,
  submitLead,
  sgReferredBy,
  sgMyReferralCode,
  walletAvail
}){
  // Capture email on-site (debounced)
  const payEmailDebounceRef=useRef(null)
  const capturePayEmail=useCallback(()=>{
    const email=(payEmailRef.current?.value||"").trim()
    if(!email||!email.includes("@")||!email.includes("."))return
    try{localStorage.setItem("sg_checkout_abandoned",JSON.stringify({email,ts:Date.now()}))}catch(_){}
    try{track("sg_pay_email_captured",{plan:payPlanRef.current,source:source||"unknown"})}catch(_){}
  },[payEmailRef,payPlanRef,source,track])

  const onPayEmailInput=useCallback(()=>{
    clearTimeout(payEmailDebounceRef.current)
    payEmailDebounceRef.current=setTimeout(()=>{capturePayEmail()},800)
  },[capturePayEmail])

  // ── Apple Pay / Google Pay (Mollie redirect) ─────────────────────────
  const walletRedirect=useCallback(async(method)=>{
    const email=(payEmailRef.current?.value||"").trim()
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      setPayError(_t(lang,"Entre ton email pour recevoir ton accès.","Enter your email to receive your access.","Introduce tu email para recibir tu acceso."))
      return
    }
    if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
      try{submitLead(email,"onsite_wallet")}catch(_){}
      try{localStorage.setItem("sg_email",email)}catch(_){}
    }
    const _pc=passCtxRef.current
    const _pcCur=_pc?_pc.cur:undefined
    const body=_pc
      ?{action:"create_payment",pass:_pc.pass,cents:_pc.cents,cur:_pc.cur,email,source:source||"unknown",lang,walletMethod:method,referredBy:sgReferredBy(),myReferralCode:sgMyReferralCode(),consent:{accepted:true,v:"2026-06-29",lang}}
      :{action:"create_subscription",plan:payPlanRef.current,email,cur:_pcCur,source:source||"unknown",lang,walletMethod:method,referredBy:sgReferredBy(),myReferralCode:sgMyReferralCode()}
    // GA4 Ecommerce: begin_checkout fires HERE — on actual wallet payment attempt, not paywall open.
    try {
      const _bcPlan = _pc ? _pc.pass : payPlanRef.current
      const _bcValue = _pc ? _pc.cents / 100 : (PAY_CUR === 'usd' ? 11.99 : 14.99)
      beginCheckout(_bcPlan, source || 'unknown', _bcValue, PAY_CUR === 'usd' ? 'USD' : 'EUR')
    } catch (_) {}
    const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    const d=await r.json().catch(()=>({}))
    if(!r.ok||d.error||(!d.paymentId&&!d.subscriptionId)){
      const errMsg=d.error||""
      let userMsg
      if(/Unauthorized|Invalid Authorization|api_key/i.test(errMsg)){
        userMsg=_t(lang,"Le paiement est temporairement indisponible. Réessaie dans quelques instants.","Payment is temporarily unavailable. Please try again shortly.","El pago no está disponible temporalmente. Intenta de nuevo en unos instantes.")
      }else if(/price tamper|Prix invalide/i.test(errMsg)){
        userMsg=_t(lang,"Le prix a été modifié. Réessaie depuis le début.","The price was modified. Please restart the checkout.","El precio fue modificado. Reinicia el pago.")
      }else if(/already in progress|déjà en cours/i.test(errMsg)){
        userMsg=_t(lang,"Un paiement est déjà en cours pour cette commande. Attends quelques secondes ou réessaie.","A payment is already in progress for this order. Wait a few seconds or retry.","Ya hay un pago en curso para este pedido. Espera unos segundos o reintenta.")
      }else{
        userMsg=errMsg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta.")
      }
      throw new Error(userMsg)
    }
if(d.checkoutUrl){
      try{sessionStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan:payPlanRef.current,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}));localStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan:payPlanRef.current,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}))}catch(_){}
      try { track("sg_mollie_checkout_redirect", { plan: payPlanRef.current, paymentId: d.paymentId, pass: _pc?.pass, walletMethod: method }) } catch (_) {}
      setPayRedirecting(true)
      setTimeout(()=>window.location.href=d.checkoutUrl,50)
      return
    }
    const cr=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
    const cd=await cr.json().catch(()=>({}))
    if(cd.terminal&&cd.status){
      const statusMsg={canceled:_t(lang,"Paiement annulé","Payment canceled","Pago cancelado"),expired:_t(lang,"Paiement expiré","Payment expired","Pago expirado"),failed:_t(lang,"Paiement échoué","Payment failed","Pago fallido")}
      throw new Error(statusMsg[cd.status]||_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
    }
    if(!cd.paid)throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
    localStorage.setItem("sg_email",email)
    if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000));track("sg_conversion",{session_id:d.paymentId,method:"mollie_pass",plan:_pc.pass,pass_days:_pc.days})}
    else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",email);track("sg_conversion",{session_id:d.paymentId,method:"mollie",plan:payPlanRef.current});if(sgReferredBy())track("sg_referral_convert",{ref_code:sgReferredBy(),plan:payPlanRef.current,provider:"mollie"})}
    try{
      const meta = _pc ? getPlanMeta(_pc.pass, PAY_CUR || 'EUR') : getPlanMeta(payPlanRef.current, PAY_CUR || 'EUR');
      purchase(d.paymentId, _pc ? _pc.pass : payPlanRef.current, meta.price, meta.currency, 'mollie');
    }catch(_){}
    setPayBusy(false)
    setPaySuccess(true)
    setTimeout(()=>{onActivated?.();onClose()},900)
  },[lang,source,onActivated,onClose,passCtxRef,payPlanRef,payEmailRef,setPayError,setPayRedirecting,setPayBusy,setPaySuccess,_t,track,submitLead,sgReferredBy,sgMyReferralCode,purchase,getPlanMeta])

  // ── Apple Pay ON-SITE direct + fallback redirect ───────────────────
  const payWithWallet=useCallback((method)=>{
    if(method==="applepay"&&typeof window!=="undefined"&&window.ApplePaySession){
      let canAP=false;try{canAP=window.ApplePaySession.canMakePayments()}catch(_){}
      if(canAP){
        const _pc=passCtxRef.current
        const email=(payEmailRef.current?.value||"").trim()
        if(!email||!email.includes("@")||!email.includes(".")){
          setPayError(_t(lang,"Entre ton email pour recevoir ton accès.","Enter your email to receive your access.","Introduce tu email para recibir tu acceso."))
          return
        }
        try{
          const ses=new window.ApplePaySession(3,{countryCode:"FR",currencyCode:(PAY_CUR==="usd"?"USD":"EUR"),merchantCapabilities:["supports3DS"],
            total:{label:"Sargasses",amount:String(_pc?_pc.cents/100:(PAY_CUR==="usd"?79:49.99)),type:"final"},
            requiredBillingContactFields:["email","name"],requiredShippingContactFields:[]})
          ses.onvalidatemerchant=async e=>{
            try{
              const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"applepay_merchant_session",validationURL:e.validationURL})})
              const d=await r.json()
              ses.completeMerchantValidation(d.session)
            }catch(_){ses.completeMerchantValidation({})}
          }
          ses.onpaymentauthorized=async e=>{
            try{
              const _pc=passCtxRef.current
              const email=(payEmailRef.current?.value||"").trim()
              const passVal=_pc?_pc.pass:null
              const centsVal=_pc?_pc.cents:null
              const curVal=_pc?_pc.cur:null
              const refBy=sgReferredBy()
              const myRef=sgMyReferralCode()
              const consentObj={accepted:true,v:"2026-06-29",lang}
              const body={action:"create_payment",paymentToken:e.payment.token,pass:passVal,cents:centsVal,cur:curVal,email,source:source||"unknown",lang,referredBy:refBy,myReferralCode:myRef,consent:consentObj}
              const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
              const d=await r.json()
              if(!r.ok||d.error||(!d.paymentId&&!d.subscriptionId)){ses.completePayment(window.ApplePaySession.STATUS_FAILURE);throw new Error(d.error||"payment failed")}
              let paid=false
              for(let a=0;a<3;a++){
                await new Promise(r=>setTimeout(r,2000))
                try{
                  const r2=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
                  const d2=await r2.json().catch(()=>({}))
                  if(d2.paid===true||d2.status==="paid"){paid=true;break}
                }catch(_){}
              }
              if(!paid){ses.completePayment(window.ApplePaySession.STATUS_FAILURE);throw new Error("not paid")}
              ses.completePayment(window.ApplePaySession.STATUS_SUCCESS)
              localStorage.setItem("sg_email",email)
              if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000));track("sg_conversion",{session_id:d.paymentId,method:"mollie_applepay",plan:_pc.pass,pass_days:_pc.days})}
              else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",email);track("sg_conversion",{session_id:d.paymentId,method:"mollie_applepay",plan:payPlanRef.current});if(sgReferredBy())track("sg_referral_convert",{ref_code:sgReferredBy(),plan:payPlanRef.current,provider:"mollie"})}
              try{const meta=getPlanMeta(_pc?_pc.pass:payPlanRef.current,PAY_CUR||'EUR');purchase(d.paymentId,_pc?_pc.pass:payPlanRef.current,meta.price,meta.currency,'mollie_applepay')}catch(_){}
              setTimeout(()=>{onActivated?.();onClose()},900)
            }catch(_){try{ses.abort()}catch(__){}; walletRedirect("applepay")}
          }
          ses.oncancel=()=>{}
          ses.begin()
          track("sg_pay_wallet_start",{plan:payPlanRef.current,provider:"mollie",method:"applepay_native",pass:_pc?_pc.pass:null})
        }catch(_){walletRedirect("applepay")}
      }else{
        walletRedirect(method)
      }
    }else{
      walletRedirect(method)
    }
  },[lang,source,onActivated,onClose,walletRedirect,passCtxRef,payPlanRef,payEmailRef,setPayError,setPayBusy,setPaySuccess,_t,track,submitLead,sgReferredBy,sgMyReferralCode,purchase,getPlanMeta])

  // ── doSubscribe principal (carte + Pass one-time + Subscription) ──────
  const doSubscribe=useCallback(async()=>{
    const plan=payPlanRef.current
    if(payBusy)return
    if(PAY_PROVIDER!=="paypal"&&!PAY_CAPTURE_ONLY&&!payReadyRef.current){
      setPayError(_t(lang,"Le paiement sécurisé se charge… patiente un instant.","Secure checkout is loading… one moment.","El pago seguro está cargando… un momento."))
      return
    }
    const email=(payEmailRef.current?.value||"").trim()
    if(!email||!email.includes("@")||!email.includes(".")){
      setPayError(_t(lang,"Entre ton email pour recevoir ton accès.","Enter your email to receive your access.","Introduce tu email para recibir tu acceso."))
      return
    }
    if(consentFlag&&!PAY_CAPTURE_ONLY&&passCtxRef.current&&!consentOk){
      setPayError(_t(lang,"Coche la case pour activer ton accès immédiat.","Tick the box to activate your immediate access.","Marca la casilla para activar tu acceso inmediato."))
      return
    }
    if(PAY_CAPTURE_ONLY){
      setPayBusy(true);setPayError("")
      try{submitLead(email,"gap_freemium")}catch(_){}
      try{localStorage.setItem("sg_email",email);localStorage.setItem("sg_premium_pass_end",String(Date.now()+7*86400000))}catch(_){}
      track("sg_gap_freemium_unlock",{plan,pass:passCtxRef.current?passCtxRef.current.pass:null,source:source||"unknown"})
      setPayBusy(false);onActivated&&onActivated();onClose&&onClose();return
    }
    try{submitLead(email,"onsite_checkout")}catch(_){}
    if(PAY_PROVIDER==="mollie"){
      setPayBusy(true);setPayError("")
      try{
        let token=null,tErr=null
        try { track("sg_card_tokenize_attempt", { plan, pass: passCtxRef.current?.pass }) } catch (_) {}
        for(let i=0;i<3;i++){
          const res=await mollieRef.current.createToken()
          if(res.token){token=res.token;break}
          tErr=res.error
          if(!/not yet loaded|not loaded/i.test(String((tErr&&tErr.message)||"")))break
          await new Promise(r=>setTimeout(r,700))
        }
        if(tErr||!token)throw new Error((tErr&&tErr.message)||_t(lang,"Vérifie ta carte.","Check your card.","Revisa tu tarjeta."))
        try { track("sg_card_tokenize_success", { plan, pass: passCtxRef.current?.pass }) } catch (_) {}
        const _pc=passCtxRef.current
        const _pcCur=_pc?_pc.cur:undefined
        const _refBy=sgReferredBy(),_myRef=sgMyReferralCode()
        const body=_pc
          ?{action:"create_payment",cardToken:token,pass:_pc.pass,cents:_pc.cents,cur:_pc.cur,email,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef,consent:{accepted:true,v:"2026-06-29",lang}}
          :{action:"create_subscription",cardToken:token,plan,email,cur:_pcCur,source:source||"unknown",lang,referredBy:_refBy,myReferralCode:_myRef}
        try { track("sg_create_payment_request", { plan, pass: _pc?.pass, cents: _pc?.cents, cur: _pc?.cur, isSubscription: !_pc }) } catch (_) {}
        // GA4 Ecommerce: begin_checkout fires HERE — on actual payment attempt, not paywall open.
        // Invariant: 1 real Mollie checkout = 1 begin_checkout.
        try {
          const _bcPlan = _pc ? _pc.pass : plan
          const _bcValue = _pc ? _pc.cents / 100 : (PAY_CUR === 'usd' ? 11.99 : 14.99)
          beginCheckout(_bcPlan, source || 'unknown', _bcValue, PAY_CUR === 'usd' ? 'USD' : 'EUR')
        } catch (_) {}
        const r=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
        const d=await r.json().catch(()=>({}))
        try { track("sg_create_payment_response", { plan, hasCheckoutUrl: !!d.checkoutUrl, paymentId: d.paymentId, subscriptionId: d.subscriptionId, error: d.error }) } catch (_) {}
        if(!r.ok||d.error||(!d.paymentId&&!d.subscriptionId)){
          const errMsg=d.error||""
          let userMsg
          if(/Unauthorized|Invalid Authorization|api_key/i.test(errMsg)){
            userMsg=_t(lang,"Le paiement est temporairement indisponible. Réessaie dans quelques instants.","Payment is temporarily unavailable. Please try again shortly.","El pago no está disponible temporalmente. Intenta de nuevo en unos instantes.")
          }else if(/price tamper|Prix invalide/i.test(errMsg)){
            userMsg=_t(lang,"Le prix a été modifié. Réessaie depuis le début.","The price was modified. Please restart the checkout.","El precio fue modificado. Reinicia el pago.")
          }else if(/already in progress|déjà en cours/i.test(errMsg)){
            userMsg=_t(lang,"Un paiement est déjà en cours pour cette commande. Attends quelques secondes ou réessaie.","A payment is already in progress for this order. Wait a few seconds or retry.","Ya hay un pago en curso para este pedido. Espera unos segundos o reintenta.")
          }else{
            userMsg=errMsg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta.")
          }
          throw new Error(userMsg)
        }
        if(d.checkoutUrl){
          try{sessionStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}));localStorage.setItem("sg_mollie_pending",JSON.stringify({paymentId:d.paymentId,plan,pass:_pc?_pc.pass:null,days:_pc?_pc.days:null,email}))}catch(_){}
          try { track("sg_mollie_checkout_redirect", { plan, paymentId: d.paymentId, pass: _pc?.pass }) } catch (_) {}
          setPayRedirecting(true)
          setTimeout(()=>window.location.href=d.checkoutUrl,50);return
        }
        const cr=await fetch("/api/mollie.php",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"payment_status",paymentId:d.paymentId})})
        const cd=await cr.json().catch(()=>({}))
        if(cd.terminal&&cd.status){
          const statusMsg={canceled:_t(lang,"Paiement annulé","Payment canceled","Pago cancelado"),expired:_t(lang,"Paiement expiré","Payment expired","Pago expirado"),failed:_t(lang,"Paiement échoué","Payment failed","Pago fallido")}
          throw new Error(statusMsg[cd.status]||_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        }
        if(!cd.paid)throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        localStorage.setItem("sg_email",email)
        if(_pc){localStorage.setItem("sg_premium_pass_end",String(Date.now()+(_pc.days||7)*86400000));track("sg_conversion",{session_id:d.paymentId,method:"mollie_pass",plan:_pc.pass,pass_days:_pc.days})}
        else{localStorage.setItem("sg_premium","1");localStorage.setItem("sg_premium_email",email);track("sg_conversion",{session_id:d.paymentId,method:"mollie",plan});if(_refBy)track("sg_referral_convert",{ref_code:_refBy,plan,provider:"mollie"})}
        try{const meta=getPlanMeta(_pc?_pc.pass:plan,PAY_CUR||'EUR');purchase(d.paymentId,_pc?_pc.pass:plan,meta.price,meta.currency,'mollie')}catch(_){}
        setPayBusy(false)
        setPaySuccess(true)
        setTimeout(()=>{onActivated?.();onClose()},900);return
      }catch(e){
        setPayBusy(false)
        const msg=(e&&e.message)?String(e.message):""
        setPayError(/not yet loaded|not loaded/i.test(msg)
          ?_t(lang,"Le paiement sécurisé se charge… patiente un instant.","Secure checkout is loading… one moment.","El pago seguro está cargando… un momento.")
          :(msg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta.")))
        track("sg_pay_onsite_error",{plan,provider:"mollie",message:msg.slice(0,90)})
        track("sg_payment_failed",{plan,source:source||"unknown",provider:"mollie",reason:msg.slice(0,50)})
        return
      }
    }
    setPayBusy(true);setPayError("")
    // GA4 Ecommerce: begin_checkout — Stripe legacy path (read-only, but consistent).
    try {
      const _bcPlan = passCtxRef.current ? passCtxRef.current.pass : plan
      const _bcValue = passCtxRef.current ? passCtxRef.current.cents / 100 : (PAY_CUR === 'usd' ? 11.99 : 14.99)
      beginCheckout(_bcPlan, source || 'unknown', _bcValue, PAY_CUR === 'usd' ? 'USD' : 'EUR')
    } catch (_) {}
    try{
      const{error:subErr}=await elementsRef.current.submit()
      if(subErr)throw subErr
      const{error,setupIntent}=await stripeRef.current.confirmSetup({
        elements:elementsRef.current,clientSecret:setupSecretRef.current,
        redirect:"if_required",
        confirmParams:{return_url:window.location.origin+"/?setup_return=1",payment_method_data:{billing_details:{email}}},
      })
      if(error)throw error
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
        try{const meta=getPlanMeta(_pc.pass,PAY_CUR||'EUR');purchase(pd.paymentIntentId,_pc.pass,meta.price,meta.currency,'mollie_onsite')}catch(_){}
        setPayBusy(false);onActivated?.();onClose();return
      }
      const _refBy=sgReferredBy(),_myRef=sgMyReferralCode()
      const r=await fetch("/api/create-checkout.php",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"subscribe",email,plan,setupIntentId:setupIntent.id,lang,source:source||"unknown",referredBy:_refBy,myReferralCode:_myRef})})
      const d=await r.json().catch(()=>({}))
      if(!r.ok||d.error||!d.subscriptionId)throw new Error(d.error||"subscribe failed")
      if(d.paymentFailed)throw new Error(_t(lang,"Carte refusée. Essaie une autre carte.","Card declined. Try another card.","Tarjeta rechazada. Prueba otra tarjeta."))
      if(d.requiresAction&&d.piClientSecret){
        const{error:payErr,paymentIntent}=await stripeRef.current.confirmCardPayment(d.piClientSecret)
        if(payErr)throw payErr
        if(paymentIntent&&paymentIntent.status!=="succeeded"&&paymentIntent.status!=="processing"){
          throw new Error(_t(lang,"Paiement non confirmé. Réessaie.","Payment not confirmed. Retry.","Pago no confirmado. Reintenta."))
        }
        track("sg_pay_onsite_3ds",{plan,status:paymentIntent?.status||"unknown"})
      }
      localStorage.setItem("sg_email",email)
      localStorage.setItem("sg_premium","1")
      localStorage.setItem("sg_premium_email",email)
      if(d.trialEnd)localStorage.setItem("sg_premium_trial_end",String(d.trialEnd))
      track("sg_conversion",{session_id:d.subscriptionId,method:"onsite",plan})
      try{const meta=getPlanMeta(plan,PAY_CUR||'EUR');purchase(d.subscriptionId,plan,meta.price,meta.currency,'mollie_onsite')}catch(_){}
      if(_refBy)track("sg_referral_convert",{ref_code:_refBy,plan})
      setPayBusy(false)
      onActivated?.()
      onClose()
    }catch(e){
      setPayBusy(false)
      const msg=(e&&e.message)?String(e.message):""
      setPayError(msg||_t(lang,"Paiement impossible. Réessaie.","Payment failed. Retry.","Pago imposible. Reintenta."))
      track("sg_pay_onsite_error",{plan,provider:"stripe",message:msg.slice(0,90)})
      track("sg_payment_failed",{plan,source:source||"unknown",provider:"stripe",reason:msg.slice(0,50)})
    }
  },[lang,source,onActivated,onClose,payPlanRef,passCtxRef,payEmailRef,payBusy,setPayBusy,setPayError,payReadyRef,setPayRedirecting,setPaySuccess,consentFlag,consentOk,elementsRef,stripeRef,setupSecretRef,mollieRef,PAY_PROVIDER,PAY_CAPTURE_ONLY,PAY_CUR,_t,track,submitLead,sgReferredBy,sgMyReferralCode,purchase,getPlanMeta,walletRedirect])

  return { doSubscribe, payWithWallet, walletRedirect, onPayEmailInput }
}

export { relHref as _relHref }
// PayGatewayHandler.jsx — Apple Pay / Google Pay (Mollie redirect + native on-site)
// EXTRAIT de PremiumModal.jsx — gère l'intégration wallet complète
import React,{useCallback,useRef} from "react"
import * as SG from "../Sargasses_PROD.jsx"
import {purchase, getPlanMeta} from "../ga4-ecommerce.js"

const {
  PAY_CUR, PAY_PROVIDER, IS_NEW_REGION, REGION,
  _t, track, submitLead, sgReferredBy, sgMyReferralCode
} = SG

/**
 * PayGatewayHandler — Composant/gateway pour Apple Pay et Google Pay
 * Fournit : walletRedirect (hosted checkout Mollie) + payWithWallet (Apple Pay native)
 * 
 * Usage:
 *   const { walletRedirect, payWithWallet } = usePayGateway({
 *     lang, source, onActivated, onClose, passCtxRef, payPlanRef,
 *     payEmailRef, setPayError, setPayBusy, setPaySuccess, setPayRedirecting,
 *     _t, track, submitLead, sgReferredBy, sgMyReferralCode, purchase, getPlanMeta
 *   })
 */
export function usePayGateway({
  lang,
  source,
  onActivated,
  onClose,
  passCtxRef,
  payPlanRef,
  payEmailRef,
  setPayError,
  setPayBusy,
  setPaySuccess,
  setPayRedirecting,
  _t,
  track,
  submitLead,
  sgReferredBy,
  sgMyReferralCode,
  purchase,
  getPlanMeta
}){
  // ── Apple Pay / Google Pay via redirect Mollie (checkout hébergé) ─────
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
    try{const meta=getPlanMeta(_pc?_pc.pass:payPlanRef.current,PAY_CUR||'EUR');purchase(d.paymentId,_pc?_pc.pass:payPlanRef.current,meta.price,meta.currency,'mollie')}catch(_){}
    setPayBusy(false)
    setPaySuccess(true)
    setTimeout(()=>{onActivated?.();onClose()},900)
  },[lang,source,onActivated,onClose,passCtxRef,payPlanRef,payEmailRef,setPayError,setPayRedirecting,setPayBusy,setPaySuccess,_t,track,submitLead,sgReferredBy,sgMyReferralCode,purchase,getPlanMeta])

  // ── Apple Pay ON-SITE direct (feuille native) + fallback redirect ──────
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

  return { walletRedirect, payWithWallet }
}

/**
 * Composant boutons wallet réutilisable
 * Usage: <WalletButtons {...gatewayProps} disabled={payBusy} />
 */
export function WalletButtons({walletRedirect,payWithWallet,disabled,walletAvail}){
  const w=walletAvail()
  return(
    <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginTop:16}}>
      {w.applePay && (
        <button type="button" aria-label="Apple Pay" disabled={disabled} onClick={()=>payWithWallet("applepay")}
          style={{display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderRadius:12,
            border:"1.5px solid #000",background:"#000",color:"#fff",
            font:"700 15px/1 'Bricolage Grotesque'",cursor:disabled?"not-allowed":"pointer",
            opacity:disabled?0.5:1,transition:"transform .1s",boxShadow:"2px 2px 0 #000"}}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 0C4.477 0 0 4.477 0 10s4.477 10 10 10 10-4.477 10-10S15.523 0 10 0zm5.521 13.18c-.16.875-.703 1.48-1.45 1.78-.7.273-1.6.273-2.5.273-1.227 0-2.227-.323-3.04-1.073-.737-.677-1.195-1.527-1.195-2.66 0-.918.38-1.69 1.232-2.32.41-.277.88-.41 1.368-.41.52 0 .934.13 1.312.407.417.293.747.74.87 1.34.103.53.073 1.107-.073 1.675-.12.48-.393.88-.83.88-.28 0-.587-.067-.86-.193l-.073-.04a4.5 4.5 0 01-1.273-.52 6.3 6.3 0 01-.82-1.22c-.253-.48-.387-1.073-.387-1.72 0-.707.18-1.293.54-1.807.347-.513.833-.77 1.467-.77.573 0 1.06.17 1.434.51.39.35.593.853.593 1.52 0 .587-.13 1.08-.387 1.48a3.5 3.5 0 01-1.047.88 4 4 0 01-1.38.17c-.453 0-.907-.07-1.312-.21a3 3 0 01-1.014-.627c-.387-.373-.573-.88-.573-1.48 0-.773.267-1.393.8-1.86.533-.467 1.24-.7 2.107-.7.667 0 1.287.113 1.853.34.56.227.987.56 1.253 1.013.28.44.423 1.007.423 1.69 0 .587-.073 1.107-.22 1.52-.147.413-.427.747-.84.987-.413.24-.933.35-1.54.35-.933 0-1.673-.243-2.22-1.1-.26-.24-.613-.64-1.08-1.173-.48-.533-.793-1.28-.793-2.147 0-1.093.44-1.89 1.34-2.52.92-.62 2.087-.93 3.48-.93 1.573 0 2.84.323 3.773.97.933.647 1.413 1.62 1.413 2.98 0 .893-.24 1.66-.72 2.24-.467.573-1.147.86-2.04.86-.68 0-1.28-.233-1.813-.7-.533-.48-.8-1.093-.8-1.867 0-.68.16-1.213.48-1.59.32-.373.793-.56 1.4-.56.747 0 1.28.3 1.547.907.28.64.42 1.4.42 2.28 0 1.453-.573 2.6-1.72 3.52a5.5 5.5 0 01-2.07.58c-.84 0-1.573-.19-2.22-.573a3.5 3.5 0 01-1.44-1.37c-.58-.68-.87-1.58-.87-2.68 0-1.04.253-1.853.773-2.453.533-.607 1.26-.91 2.187-.91.72 0 1.28.17 1.72.513.427.353.64.84.64 1.48 0 .747-.36 1.24-1.08 1.48-.454.16-1.047.233-1.787.233-.533 0-1.027-.073-1.52-.213-.493-.147-.92-.393-1.28-.75a3.5 3.5 0 01-.84-1.32c-.24-.76-.367-1.58-.367-2.533 0-1.053.22-1.84.68-2.48.453-.653 1.093-1.01 1.913-1.01.4 0 .853.083 1.32.247.467.163.84.4 1.107.72.26.32.407.76.407 1.32 0 .533-.093 1.02-.28 1.48z"/></svg>
          Apple Pay
        </button>
      )}
      {w.googlePay && (
        <button type="button" aria-label="Google Pay" disabled={disabled} onClick={()=>walletRedirect("googlepay")}
          style={{display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderRadius:12,
            border:"1.5px solid #4285F4",background:"#4285F4",color:"#fff",
            font:"700 15px/1 'Bricolage Grotesque'",cursor:disabled?"not-allowed":"pointer",
            opacity:disabled?0.5:1,transition:"transform .1s",boxShadow:"2px 2px 0 #4285F4"}}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google Pay
        </button>
      )}
    </div>
  )
}
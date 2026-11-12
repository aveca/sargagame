export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = ["https://sargasses-martinique.com","https://sargasses-guadeloupe.com","https://sargassummiami.com","https://sargassumpuntacana.com","https://sargassumcancun.com","https://sargazotulum.com"];
    const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"Content-Type"};
    if (allowed.includes(origin)) headers["access-control-allow-origin"]=origin;
    const out=(x,s)=>new Response(JSON.stringify(x),{status:s,headers});
    // ── Redirections 301 (préservation du référencement après suppression de pages) ──
    // Seul GET/HEAD est redirigé ; POST et autres méthodes passent normalement.
    const redirect301 = (target) => new Response(null, {
      status: 301,
      headers: { "location": target, "cache-control": "public, max-age=300" }
    });
    const { pathname: path, search: qs } = u;
    const method = request.method;
    if ((method === "GET" || method === "HEAD")) {
      // /meteo-sargasses-guadeloupe : MQ → canonical GP (exact path uniquement, pas de préfixe)
      if (u.hostname === "sargasses-martinique.com" &&
          (path === "/meteo-sargasses-guadeloupe" || path === "/meteo-sargasses-guadeloupe/")) {
        return redirect301("https://sargasses-guadeloupe.com/meteo-sargasses-guadeloupe/" + qs);
      }
      // /sarg_carte_satellite_app : MQ et GP → canonical régional /carte-sargasses/
      if ((u.hostname === "sargasses-martinique.com" || u.hostname === "sargasses-guadeloupe.com") &&
          (path === "/sarg_carte_satellite_app" || path === "/sarg_carte_satellite_app/" || path === "/sarg_carte_satellite_app.html")) {
        return redirect301("https://" + u.hostname + "/carte-sargasses/" + qs);
      }
    }
    // ── Protection des logs (P0-3) ─────────────────────────────────────────
    // Seuls les champs explicitement autorisés peuvent apparaître dans les
    // logs : aucun paymentId, email, métadonnée, token ou secret ne doit
    // jamais fuiter. L'identifiant de corrélation aléatoire est transmis
    // séparément (jamais dérivé du paymentId).
    const SAFE_LOG_FIELDS = Object.freeze(["status", "code", "reason"]);
    const logGrantEvent = (cid, event, fields) => {
      const safe = {};
      for (const k of SAFE_LOG_FIELDS) {
        if (fields && fields[k] !== undefined && fields[k] !== null) safe[k] = fields[k];
      }
      console.error(`[mollie-grant] ${event}`, { cid, ...safe });
    };
    const DAYS_TABLE = Object.freeze({p30:30,trip7:7,season:210,sos:1});
    // ── Grille de CRÉATION — `sos` RETIRÉ : plus vendable (410 offre_indisponible) ──
    // OFFRE VALIDÉE 2026-11-09 : trip7 7,99 € / $8.99 · p30 14,99 € / $16.99
    // · season 24,99 € / $27.99. Aucun surcoût saisonnier (+15 %) : le montant
    // affiché est le montant facturé.
    const PASS_PRICES = Object.freeze({
      p30:{EUR:14.99,USD:16.99},
      trip7:{EUR:7.99,USD:8.99},
      season:{EUR:24.99,USD:27.99}
    });
    // ── Grille de LIVRAISON — inclut `sos` pour les paiements DÉJÀ encaissés ──
    // Sans elle, l'argent déjà pris ne serait jamais livré (trou de confiance).
    // Utilisée par validateMollieAmount (webhook + payment_status).
    const FULFILL_PRICES = Object.freeze({
      p30:{EUR:14.99,USD:16.99},
      trip7:{EUR:7.99,USD:8.99},
      season:{EUR:24.99,USD:27.99},
      sos:{EUR:1.00,USD:null}
    });
    // ── Prix HISTORIQUES (ancienne offre) — acceptés UNIQUEMENT pour un
    // paiement DÉJÀ encaissé avant la coupure du 2026-11-09 (date de création
    // vérifiable). Encaisser sans livrer serait un trou de confiance.
    // Un paiement NOUVEL au tarif ancien reste refusé (400).
    const HISTORICAL_PRICES = Object.freeze({
      p30: { EUR: [14.99], USD: [11.99] },
      trip7: { EUR: [7.99], USD: [5.99] },
      season: { EUR: [19.99], USD: [] }
    });
    const OFFER_CUTOFF_DATE = "2026-11-09";
    // P0-2 — p7 legacy pass cutoff (2026-08-01), distinct from the general
    // offer cutoff (2026-11-09). Les passes p7 créées à partir de cette date
    // ne sont plus délivrables (legacy_expired).
    const P7_CUTOFF_DATE = "2026-08-01T00:00:00Z";
    const validateMollieAmount = (payment) => {
      if (!payment || !["paid","settled"].includes(payment.status)) return {ok:false,reason:"not_paid"};
      const pass=String(payment.metadata?.pass||"");
      const normPass = pass === "p7" ? "trip7" : pass;
      const isLegacyP7 = pass === "p7";
      const currency=String(payment.amount?.currency||"").toUpperCase();
      const value=Number(payment.amount?.value);
      const cents=Math.round(value*100);
      if (!DAYS_TABLE[normPass] || !FULFILL_PRICES[normPass]) return {ok:false,reason:"unknown_pass"};
      if (!Number.isFinite(value) || !Number.isInteger(cents) || cents <= 0) return {ok:false,reason:"invalid_amount"};
      if (!Object.prototype.hasOwnProperty.call(FULFILL_PRICES[normPass],currency)) return {ok:false,reason:"unsupported_currency"};
      const createdTs = payment.createdAt || payment.created;
      // Une date sans fuseau horaire (Z / +HH:MM) n'est pas vérifiable.
      const hasTz = createdTs && (/Z$|[+-]\d{2}:?\d{2}$/.test(createdTs));
      const created = hasTz ? Date.parse(createdTs) : null;
      const p7Cutoff = Date.parse(P7_CUTOFF_DATE);
      const createdBeforeP7Cutoff = created && created < p7Cutoff;
      const createdBeforeOfferCutoff = created && created < Date.parse(OFFER_CUTOFF_DATE);
      // Legacy p7 passes : seuls les prix historiques sont acceptés, et uniquement
      // avant la coupure P7 (2026-08-01). Jamais le tarif courant.
      if (isLegacyP7) {
        if (!createdBeforeP7Cutoff) return {ok:false,reason:"legacy_expired"};
        const hist = HISTORICAL_PRICES[normPass];
        if (hist && hist[currency] && hist[currency].some(h => Math.abs(cents - Math.round(h*100)) <= 2)) {
          return {ok:true,pass:normPass,currency};
        }
        return {ok:false,reason:"amount_mismatch"};
      }
      // Passes non-legacy : prix courant, sauf prix historique avant la coupure.
      const expected=FULFILL_PRICES[normPass][currency];
      if (expected === null) {
        // Preserve the existing variable-amount contract for products whose
        // currency price is null in create_payment; never accept zero/negative.
        const upper = currency === "USD" && pass !== "trip7" ? 5750 : 5000;
        if (cents <= 50 || cents >= upper) return {ok:false,reason:"amount_out_of_range"};
      } else if (![Math.round(expected*100)].some(n => Math.abs(cents-n) <= 2)) {
        // Prix historique accepté uniquement avant la coupure de l'offre.
        if (createdBeforeOfferCutoff) {
          const hist = HISTORICAL_PRICES[normPass];
          if (hist && hist[currency] && hist[currency].some(h => Math.abs(cents - Math.round(h*100)) <= 2)) {
            return {ok:true,pass:normPass,currency};
          }
        }
        return {ok:false,reason:"amount_mismatch"};
      }
      return {ok:true,pass:normPass,currency};
    };
    const grantB2CPassIdempotent=async(payment)=>{
      const md=payment?.metadata||{};
      const pass=String(md.pass||"");
      const normPass = pass === "p7" ? "trip7" : pass;
      const email=String(md.email||"").trim();
      const days=DAYS_TABLE[normPass];
      if(!days)return {granted:false,skipped:true,reason:"unknown_pass"};
      if(normPass!=="sos"&&!email)return {granted:false,skipped:true,reason:"email_required"};
      if(!payment?.id)return {granted:false,skipped:true,reason:"payment_id_required"};
      if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return {granted:false,error:"payment_backend_not_configured"};
      let r;
      try {
        r=await fetch(String(env.SUPABASE_URL).replace(/\/+$/,"")+"/rest/v1/rpc/sg_upsert_payment_grant",{
          method:"POST",
          headers:{
            apikey:env.SUPABASE_SERVICE_KEY,
            Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY,
            "Content-Type":"application/json",
            Prefer:"return=minimal"
          },
          body:JSON.stringify({
            p_payment_id:String(payment.id),
            p_pass:normPass,
            p_email:email,
            p_currency:String(payment.amount?.currency||"EUR").toUpperCase(),
            p_expires_at:new Date(Date.now()+days*86400000).toISOString(),
            p_granted_at:new Date().toISOString(),
            p_metadata:Object.assign({},md,{pass:normPass})
          })
        });
      } catch {
        return {granted:false,error:"grant_sync_failed"};
      }
      if(!r.ok){
        let code="";
        try { code=String((await r.json())?.code||""); } catch {}
        if(r.status===404 || code==="PGRST202") return {granted:false,error:"rpc_unavailable",status:r.status};
        return {granted:false,error:"grant_sync_failed",status:r.status};
      }
      return {granted:true,pass,email,days};
    };
    // ── Révocation d'un grant B2C (refund / chargeback / canceled / expired / failed) ──
    // Expiration du grant (colonne réelle expires_at) pour qu'un paiement
    // remboursé ou annulé ne conserve pas son accès. Aucune donnée PII dans les logs.
    const revokeB2CPass=async(paymentId)=>{
      if(!paymentId)return {revoked:false,error:"payment_id_required"};
      if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return {revoked:false,error:"payment_backend_not_configured"};
      try {
        const r=await fetch(String(env.SUPABASE_URL).replace(/\/+$/,"")+"/rest/v1/payment_grants?payment_id=eq."+encodeURIComponent(paymentId)+"&type=eq.b2c_pass",{
          method:"PATCH",
          headers:{
            apikey:env.SUPABASE_SERVICE_KEY,
            Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY,
            "Content-Type":"application/json",
            Prefer:"return=minimal"
          },
          body:JSON.stringify({expires_at:new Date().toISOString()})
        });
        if(!r.ok)return {revoked:false,error:"revoke_sync_failed",status:r.status};
        return {revoked:true};
      } catch {
        return {revoked:false,error:"revoke_sync_failed"};
      }
    };
    if (u.pathname==="/api/mollie-webhook.php" || u.pathname==="/api/mollie-webhook") {
      if(request.method!=="POST") return out({error:"POST only"},405);
      const raw=await request.text();
      const cidBuf=new Uint8Array(16);crypto.getRandomValues(cidBuf);const cid="req_"+Array.from(cidBuf).map(b=>b.toString(16).padStart(2,"0")).join("");
      const contentType=request.headers.get("content-type")||"";
      const isNextGen=contentType.toLowerCase().includes("application/json");
      const isClassic=contentType.toLowerCase().includes("application/x-www-form-urlencoded");
      if(!isClassic && !isNextGen) return out({error:"unsupported_webhook_contract"},415);
      // Signature requise (fail-closed). Sans secret configuré → 503.
      const secret=env.MOLLIE_WEBHOOK_SECRET;
      if(!secret) return out({error:"payment_backend_not_configured"},503);
      const sig=request.headers.get("x-mollie-signature")||"";
      const hex=sig.replace(/^sha256=/,"");
      let sigOk=false;
      try {
        if(/^[0-9a-fA-F]{64}$/.test(hex)) {
          const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
          const sigBytes=new Uint8Array(hex.match(/.{1,2}/g).map(b=>parseInt(b,16)));
          sigOk=await crypto.subtle.verify("HMAC",key,sigBytes,new TextEncoder().encode(raw));
        }
      } catch {}
      if(!sigOk) return out({error:"invalid_signature"},403);

      if(isNextGen) {
        let body;
        try { body=JSON.parse(raw); } catch { return out({error:"invalid_json"},400); }
        const entityId=String(body.entityId||body.id||"").trim();
        if(body.resource==="event" && body.type && !body.type.startsWith("payment.")) {
          return out({reason:"unsupported_entity",granted:false},200);
        }
        if(!/^tr_[A-Za-z0-9]+$/.test(entityId)) return out({error:"invalid_payment_id"},400);
        const id=entityId;
        let p,payment;
        try {
          p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
          try { payment=await p.json(); } catch { return out({error:"mollie_invalid_response"},502); }
        } catch {
          return out({error:"mollie_api_unavailable"},503);
        }
        if(!p.ok) return out({error:"mollie_payment_lookup_failed"},p.status===404?404:502);
        const status=String(payment.status||"unknown");
        // Statuts terminaux négatifs : révoquer tout accès précédemment délivré.
        if(["canceled","expired","failed","refunded","chargeback"].includes(status)){
          const rev=await revokeB2CPass(id);
          logGrantEvent(cid, "payment_terminal", {status, code: rev.error});
          if(!rev.revoked) return out({error:"revoke_sync_failed",reason:rev.error},503);
          return out({received:true,paymentId:id,status,granted:false,revoked:true},200);
        }
        if(!["paid","settled"].includes(status)) return out({received:true,paymentId:id,status,granted:false},200);
        const validation=validateMollieAmount(payment);
        if(!validation.ok){
          logGrantEvent(cid, "grant_rejected", {reason: validation.reason});
          return out({received:true,paymentId:id,status,granted:false,reason:validation.reason},200);
        }
        logGrantEvent(cid, "grant_ok", {});
        const grant=await grantB2CPassIdempotent(payment);
        if(grant.error) return out({error:grant.error},503);
        if(!grant.granted) return out({received:true,paymentId:id,status,granted:false,reason:grant.reason||"pass_not_eligible"},200);
        return out({received:true,paymentId:id,status,granted:true},200);
      }

      // CLASSIC : form-encoded id
      const id=String(new URLSearchParams(raw).get("id")||"").trim();
      if(!/^tr_[A-Za-z0-9]+$/.test(id)) return out({error:"invalid_payment_id"},400);
      if(!env.MOLLIE_API_KEY) return out({error:"payment_backend_not_configured"},503);
      let p,payment;
      try {
        p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(id),{
          headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}
        });
        try { payment=await p.json(); } catch { return out({error:"mollie_invalid_response"},502); }
      } catch {
        return out({error:"mollie_api_unavailable"},503);
      }
      if(!p.ok) return out({error:"mollie_payment_lookup_failed"},p.status===404?404:502);
      const status=String(payment.status||"unknown");
      if(["canceled","expired","failed","refunded","chargeback"].includes(status)){
        const rev=await revokeB2CPass(id);
        logGrantEvent(cid, "payment_terminal", {status, code: rev.error});
        if(!rev.revoked) return out({error:"revoke_sync_failed",reason:rev.error},503);
        return out({received:true,paymentId:id,status,granted:false,revoked:true},200);
      }
      if(!["paid","settled"].includes(status)) return out({received:true,paymentId:id,status,granted:false},200);
      const validation=validateMollieAmount(payment);
      if(!validation.ok){
        logGrantEvent(cid, "grant_rejected", {reason: validation.reason});
        return out({received:true,paymentId:id,status,granted:false,reason:validation.reason},200);
      }
      logGrantEvent(cid, "grant_ok", {});
      const grant=await grantB2CPassIdempotent(payment);
      if(grant.error) return out({error:grant.error},503);
      if(!grant.granted) return out({received:true,paymentId:id,status,granted:false,reason:grant.reason||"pass_not_eligible"},200);
      return out({received:true,paymentId:id,status,granted:true},200);
    }
    if(u.pathname==="/api/mollie.php" || u.pathname==="/api/mollie"){
      if(request.method==="OPTIONS") return new Response(null,{status:204,headers});
      if(request.method!=="POST") return out({error:"POST only"},405);
      let d;try{d=await request.json()}catch{return out({error:"invalid_json"},400)}
      if(!env.MOLLIE_API_KEY)return out({error:"payment_backend_not_configured"},503);
      try{
        if(d.action==="payment_status"){
          const paymentId=String(d.paymentId||"").trim();
          if(!/^tr_[A-Za-z0-9]+$/.test(paymentId))return out({error:"invalid_payment_id"},400);
          let p,x;
          try {
            p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(paymentId),{
              headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}
            });
            try { x=await p.json(); } catch { return out({error:"mollie_invalid_response"},502); }
          } catch {
            return out({error:"mollie_api_unavailable"},503);
          }
          if(!p.ok)return out({error:x.detail||x.title||"Mollie status error"},p.status===404?404:502);
          if(!["paid","settled"].includes(x.status))return out({paid:false,status:x.status,paymentId:x.id,terminal:["canceled","expired","failed","refunded","chargeback"].includes(x.status)},200);
          const requestedEmail=String(d.email||"").trim().toLowerCase();
          const paymentEmail=String(x.metadata?.email||"").trim().toLowerCase();
          if(requestedEmail&&paymentEmail&&requestedEmail!==paymentEmail)return out({error:"payment_owner_mismatch"},403);
          const validation=validateMollieAmount(x);
          if(!validation.ok)return out({paid:false,status:x.status,paymentId:x.id,reason:validation.reason},409);
          const grant=await grantB2CPassIdempotent(x);
          if(grant.error)return out({error:grant.error},503);
          if(!grant.granted)return out({paid:false,status:x.status,paymentId:x.id,reason:grant.reason||"pass_not_eligible"},409);
          return out({paid:true,status:x.status,paymentId:x.id,granted:true},200);
        }
        if(d.action==="verify_subscription"){
          const email=String(d.email||"").trim();
          const q=env.SUPABASE_URL+"/rest/v1/payment_grants?select=pass,expires_at,payment_id&type=eq.b2c_pass&email=eq."+encodeURIComponent(email)+"&expires_at=gt."+encodeURIComponent(new Date().toISOString())+"&order=expires_at.desc&limit=1";
          const r=await fetch(q,{headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY}});
          const rows=await r.json(); if(!rows.length)return out({active:false,reason:"no_pass_grant"},200);
          const end=Date.parse(rows[0].expires_at); return out({active:true,kind:"pass",pass:rows[0].pass,passEnd:end,status:"paid"},200);
        }
        if(d.action==="claim_referral_credit")return out({days:0,code:d.code||"",enabled:false},200);
        if(d.action==="create_subscription"){
          const plans={pro_monthly:{amount:"79.00",description:"Sargasses Pro - mensuel"},brief_monthly:{amount:"29.00",description:"Sargasses Brief - mensuel"}};
          const plan=plans[d.plan]; if(!plan) return out({error:"Plan mensuel inconnu"},400);
          let customer=null;
          if(d.customerId) customer=await (await fetch("https://api.mollie.com/v2/customers/"+encodeURIComponent(d.customerId),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}})).json();
          else if(d.email){
            const cr=await fetch("https://api.mollie.com/v2/customers?limit=50",{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
            const list=await cr.json(); customer=(list._embedded?.customers||[]).find(x=>x.email===d.email)||null;
            if(!customer){
              const nr=await fetch("https://api.mollie.com/v2/customers",{method:"POST",headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({email:d.email,name:d.name||"",metadata:{source:"b2b_monthly_signup"}})});
              customer=await nr.json();
            }
          }
          if(!customer?.id)throw new Error("customerId ou email requis");
          const base=allowed.includes(u.origin)?u.origin:"https://sargasses-martinique.com";
          const sr=await fetch("https://api.mollie.com/v2/customers/"+encodeURIComponent(customer.id)+"/subscriptions",{method:"POST",headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({
            amount:{currency:"EUR",value:plan.amount},description:plan.description,interval:"1 month",
            webhookUrl:d.webhookUrl||base+"/api/mollie-webhook.php",metadata:Object.assign({},d.metadata||{},{source:d.source||"b2b_monthly",plan:d.plan}),
            ...(d.mandateId?{mandateId:d.mandateId}:{}),...(d.method?{method:d.method}:{})
          })});
          const sub=await sr.json();if(!sr.ok)throw new Error(sub.detail||sub.title||"Mollie subscription error");
          return out({subscriptionId:sub.id,customerId:customer.id,status:sub.status,checkoutUrl:sub._links?.checkout?.href||null},200);
        }
        if(d.action==="create_payment" || d.action==="applepay_session"){
          const pass=d.pass||null, currency=String(d.cur||"EUR").toUpperCase();
          // ⚠️ 2026-11-09 — `sos` (1 €, rapport 24 h) : offre RETIRÉE du parcours
          // client. La création est refusée en 410 « offre_indisponible » (même
          // contrat que le serveur live sg-payments), pas en 400 flou.
          if(pass==="sos" || d.source==="sos_plage") return out({error:"offre_indisponible"},410);
          let cents=d.cents==null?null:Number(d.cents); if(cents==null&&d.amount&&d.amount.value)cents=Math.round(Number(d.amount.value)*100);
          const prices=PASS_PRICES;
          let valid=Number.isInteger(cents)&&cents>0&&["EUR","USD"].includes(currency);
          if(pass&&prices[pass]){const e=prices[pass][currency];valid=valid&&(e===null?(cents>50&&cents<5000):Math.abs(cents/100-e)<.02)}else valid=valid&&!pass&&cents<30000;
          if(!valid)return out({error:"Prix invalide"},400);
          // ⚠️ 2026-11-09 — plus de surcharge USD de haute saison (+15 %) : le
          // serveur live facture le montant affiché (montant validé ci-dessus).
          const base=allowed.includes(u.origin)?u.origin:"https://sargasses-martinique.com";
          const meta=Object.assign({},d.metadata||{},{source:d.source||"unknown",pass:pass||"",email:String(d.email||""),lang:d.lang||"fr"});
          const body={amount:{value:(cents/100).toFixed(2),currency},description:d.description||(pass?"Sargasses Pass "+pass:"Sargasses"),redirectUrl:d.redirectUrl||base+"/?mollie_return=1",webhookUrl:d.webhookUrl||base+"/api/mollie-webhook.php",metadata:meta,locale:d.locale||(currency==="USD"?"en_US":"fr_FR")};
          if(d.method||d.paymentMethod)body.method=d.method||d.paymentMethod;
          if(d.applePayPaymentToken)body.applePayPaymentToken=d.applePayPaymentToken;
          const r=await fetch("https://api.mollie.com/v2/payments",{method:"POST",headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
          const p=await r.json(); if(!r.ok)throw new Error(p.detail||p.title||"Mollie error");
          return out({checkoutUrl:p._links&&p._links.checkout&&p._links.checkout.href||null,paymentId:p.id},200);
        }
        return out({error:"Unknown action"},400);
      }catch(e){return out({error:e.message||"backend_error"},400)}
    }
    if(u.pathname==="/api/widget-token.php" || u.pathname==="/api/widget-token"){
      const k=u.searchParams.get("k")||"";
      const verify=async token=>{
        const parts=token.split("."); if(parts.length!==2)return false;
        const base=env.MOLLIE_WEBHOOK_SECRET;
        if(!base)return false;
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(base+"|sgwidget-pro-v1"));
        const key=await crypto.subtle.importKey("raw",digest,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
        const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(parts[0]));
        const b64=a=>{let s="";const bytes=new Uint8Array(a);for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")};
        if(b64(sig)!==parts[1])return false;
        try{let s=parts[0].replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const d=JSON.parse(atob(s));return d.exp&&Number(d.exp)>Date.now()/1000?d:false}catch{return false}
      };
      const d=await verify(k); return out(d?{pro:true,host:d.h||null}:{pro:false},200);
    }
    if(u.pathname==="/api/b2b-trial.php" || u.pathname==="/api/b2b-trial"){
      if(request.method!=="POST")return out({error:"method_not_allowed"},405);
      let d;try{d=await request.json()}catch{return out({error:"invalid_json"},400)}
      const email=String(d.email||"").trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return out({error:"invalid_email"},400);
      const payload={h:email,exp:Math.floor(Date.now()/1000)+30*86400};
      const base=env.MOLLIE_WEBHOOK_SECRET;
      if(!base)return out({error:"payment_backend_not_configured"},503);
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(base+"|sgwidget-pro-v1"));
      const key=await crypto.subtle.importKey("raw",digest,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
      const raw=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
      const token=raw+"."+btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      return out({ok:true,token,days:30},200);
    }
    if(u.pathname==="/api/mollie.php" && request.method==="POST"){
      // B2B recurring subscription compatibility with the former PHP endpoint.
      // This uses Mollie's customer subscriptions API; the API key never reaches the browser.
    }
    // Apple Pay domain association : Apple exige le chemin canonique
    // /.well-known/apple-developer-merchantid-domain-association, mais le
    // fichier déployé côté assets est /api/apple-pay-domain-association
    // (constaté 2026-10-11 : /.well-known/... → 404 en prod sur les 6 domaines,
    // Apple Pay indisponible au checkout). Réécriture explicite AVANT la garde
    // dotfiles.
    if(u.pathname==="/.well-known/apple-developer-merchantid-domain-association"){
      return env.ASSETS.fetch(new URL("/api/apple-pay-domain-association",u.origin),request);
    }
    // Garde fail-closed (2e barrière après public/.assetsignore) : avec
    // run_worker_first=true, les assets existants passent AUSSI par ce handler
    // (sans ça, tout fichier de dist/ serait servi quel que soit le code
    // ci-dessus — constaté : /api/.htaccess lisible en clair sur workers.dev).
    // Refus neutre 404 (aucun détail) pour tout ce qui ne doit jamais être
    // public, même si un futur upload l'y déposait.
    if(u.pathname.includes("/_private/")
      || u.pathname.startsWith("/.well-known/") // dot-dirs canoniques non opt-in
      || /(^|\/)\.[^/]*$/.test(u.pathname)
      || /(^|\/)\.[^/]*$/.test(u.pathname)
      || /\.php$/i.test(u.pathname)
      || /\.htaccess$/i.test(u.pathname)
      || /\.env($|\.)/i.test(u.pathname)) {
      return out({error:"not_found"},404);
    }
    // Données statiques publiques : laissées aux ASSETS (après la garde
    // ci-dessus : _private/dotfiles/php déjà refusés). Sans cette allowlist,
    // run_worker_first casserait tous les JSON publics (/api/*.json).
    if(u.pathname.startsWith("/api/")) {
      if(/\.json$/.test(u.pathname) || u.pathname==="/api/apple-pay-domain-association") {
        return env.ASSETS.fetch(request);
      }
      return out({error:"api_route_not_migrated",path:u.pathname},404);
    }
    return env.ASSETS.fetch(request);
  }
};
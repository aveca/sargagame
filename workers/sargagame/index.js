import satelliteFreshness from '../../scripts/lib/satellite-freshness.cjs';
const { refreshSatellitePayload } = satelliteFreshness;

// ─────────────────────────────────────────────────────────────────────────────
// P0-3 — Confidentialité des logs
//
// Aucun identifiant transactionnel (paymentId Mollie), aucune adresse email,
// aucune métadonnée client et aucun secret ne doit apparaître dans les logs.
// On utilise un identifiant de corrélation ALÉATOIRE, tiré par requête, sans
// aucun lien dérivé de l'identifiant Mollie : contrairement à un hash de
// l'identifiant, il ne permet pas de retrouver un paymentId à partir des logs.
//
// `crypto.getRandomValues` est disponible dans le runtime Cloudflare Workers
// et dans Node >= 18 (Web Crypto global). Le repli n'est jamais dérivé du
// paymentId : la propriété « aucun lien avec l'identifiant Mollie » tient
// dans tous les cas.
// ─────────────────────────────────────────────────────────────────────────────
const randomCorrelationId = () => {
  try {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    let hex = "";
    for (const b of bytes) hex += b.toString(16).padStart(2, "0");
    return "req_" + hex;
  } catch {
    // Repli dégradé : toujours sans lien avec le paymentId.
    return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
  }
};

// Champs de log explicitement autorisés. Tout le reste est ignoré : un
// identifiant Mollie, un email ou un secret passé par erreur ne peut pas
// fuiter dans les logs.
const SAFE_LOG_FIELDS = Object.freeze(["status", "code", "reason"]);
const logGrantEvent = (cid, event, fields) => {
  const safe = {};
  for (const k of SAFE_LOG_FIELDS) {
    if (fields && fields[k] !== undefined && fields[k] !== null) safe[k] = fields[k];
  }
  console.error(`[mollie-grant] ${event}`, { cid, ...safe });
};

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    // Redirect the legacy Guadeloupe URL on the Martinique host. The page is
    // intentionally excluded from the MQ package; keep regional ownership
    // while consolidating its remaining organic demand on the GP canonical.
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      u.hostname === "sargasses-martinique.com" &&
      (u.pathname === "/meteo-sargasses-guadeloupe" ||
        u.pathname === "/meteo-sargasses-guadeloupe/")
    ) {
      const destination = new URL(
        "https://sargasses-guadeloupe.com/meteo-sargasses-guadeloupe/"
      );
      destination.search = u.search;
      return new Response(null, {
        status: 301,
        headers: {
          location: destination.toString(),
          "cache-control": "public, max-age=300",
        },
      });
    }
    // The Worker owns every path on MQ/GP; .htaccess alone cannot consolidate
    // the legacy standalone map URLs at the edge. Preserve regional ownership.
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      (u.hostname === "sargasses-martinique.com" || u.hostname === "sargasses-guadeloupe.com") &&
      (u.pathname === "/sarg_carte_satellite_app" ||
        u.pathname === "/sarg_carte_satellite_app/" ||
        u.pathname === "/sarg_carte_satellite_app.html")
    ) {
      const destination = new URL("https://" + u.hostname + "/carte-sargasses/");
      destination.search = u.search;
      return new Response(null, {
        status: 301,
        headers: {
          location: destination.toString(),
          "cache-control": "public, max-age=300",
        },
      });
    }
    // Identifiant de corrélation ALÉATOIRE par requête (cf. randomCorrelationId).
    const cid = randomCorrelationId();
    const origin = request.headers.get("Origin") || "";
    const allowed = ["https://sargasses-martinique.com","https://sargasses-guadeloupe.com","https://sargassummiami.com","https://sargassumpuntacana.com","https://sargassumcancun.com","https://sargazotulum.com"];
    const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"Content-Type"};
    if (allowed.includes(origin)) headers["access-control-allow-origin"]=origin;
    const out=(x,s)=>new Response(JSON.stringify(x),{status:s,headers});
    const DAYS_TABLE = Object.freeze({p30:30,trip7:7,season:210,sos:1});
    // ── P0-2 — Alias historique + fenêtre historique ────────────────────────
    // `p7` est l'ancien code du pass 7 jours (EUR 7,99 / USD 5,99). Il n'est
    // accepté QUE pour des paiements DÉJÀ CRÉÉS (webhook / payment_status),
    // jamais à la création : create_payment le refuse explicitement.
    const LEGACY_PASS_ALIASES = Object.freeze({ p7: "trip7" });
    // Montants historiques acceptés pour un code legacy. Le tarif courant
    // (trip7 à 4,99) n'est PAS accepté pour un code legacy.
    const LEGACY_PRICES = Object.freeze({ trip7: { EUR: [7.99], USD: [5.99] } });
    // Date de coupure UNIQUE : un ancien pass n'est valable que pour un
    // paiement créé STRICTEMENT avant cette date. Date absente, invalide ou
    // non vérifiable => refus (fail-closed), jamais de délivrance.
    const LEGACY_CUTOFF_DATE = "2026-08-01T00:00:00Z";
    const PASS_PRICES = Object.freeze({
      p30:{EUR:14.99,USD:11.99},
      trip7:{EUR:4.99,USD:null},
      season:{EUR:19.99,USD:null},
      sos:{EUR:1.00,USD:null}
    });
    // Résolution du pass : code canonique + indicateur legacy.
    const resolvePass = (payment) => {
      const raw=String(payment?.metadata?.pass||"");
      const isLegacy=Object.prototype.hasOwnProperty.call(LEGACY_PASS_ALIASES,raw);
      return {raw,pass:isLegacy?LEGACY_PASS_ALIASES[raw]:raw,isLegacy};
    };
    // Lecture de createdAt côté serveur : absente / invalide / sans fuseau
    // explicite => NaN (fail-closed). Le fuseau est EXIGÉ pour que le contrôle
    // de la coupure ne dépende jamais du fuseau local du runtime.
    const ISO_WITH_TIMEZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
    const parseCreatedAt = (value) => {
      if (typeof value === "number") return Number.isFinite(value)?value:NaN;
      if (typeof value !== "string") return NaN;
      const s=value.trim();
      if (!ISO_WITH_TIMEZONE.test(s)) return NaN;
      const ms=Date.parse(s);
      return Number.isFinite(ms)?ms:NaN;
    };
    const validateMollieAmount = (payment) => {
      if (!payment || payment.status !== "paid") return {ok:false,reason:"not_paid"};
      const {pass,isLegacy}=resolvePass(payment);
      const currency=String(payment.amount?.currency||"").toUpperCase();
      const value=Number(payment.amount?.value);
      const cents=Math.round(value*100);
      if (!DAYS_TABLE[pass] || !PASS_PRICES[pass]) return {ok:false,reason:"unknown_pass"};
      if (!Number.isFinite(value) || !Number.isInteger(cents) || cents <= 0) return {ok:false,reason:"invalid_amount"};
      if (isLegacy) {
        // ── P0-2 — contrôle serveur de la fenêtre historique ─────────────────
        // La date de création doit être VÉRIFIABLE et strictement antérieure
        // à la coupure. Absente, invalide, égale ou postérieure => refus.
        const created=parseCreatedAt(payment.createdAt);
        if (!Number.isFinite(created)) return {ok:false,reason:"legacy_expired"};
        if (created >= Date.parse(LEGACY_CUTOFF_DATE)) return {ok:false,reason:"legacy_expired"};
        // Montants historiques uniquement (EUR 7,99 / USD 5,99).
        const legacy=LEGACY_PRICES[pass]||{};
        if (!Object.prototype.hasOwnProperty.call(legacy,currency)) return {ok:false,reason:"unsupported_currency"};
        const acceptable=legacy[currency].map(n=>Math.round(n*100));
        if (!acceptable.some(n => Math.abs(cents-n) <= 2)) return {ok:false,reason:"amount_mismatch"};
        return {ok:true,pass,currency,isLegacy:true};
      }
      if (!Object.prototype.hasOwnProperty.call(PASS_PRICES[pass],currency)) return {ok:false,reason:"unsupported_currency"};
      const expected=PASS_PRICES[pass][currency];
      if (expected === null) {
        // Preserve the existing variable-amount contract for products whose
        // currency price is null in create_payment; never accept zero/negative.
        const upper = currency === "USD" && pass !== "trip7" ? 5750 : 5000;
        if (cents <= 50 || cents >= upper) return {ok:false,reason:"amount_out_of_range"};
      } else {
        const acceptable=[Math.round(expected*100)];
        // The create_payment route applies a 15% USD seasonal adjustment to
        // passes other than trip7. Allow the adjusted amount on a delayed webhook.
        if (currency === "USD" && pass !== "trip7") acceptable.push(Math.round(acceptable[0]*1.15));
        if (!acceptable.some(n => Math.abs(cents-n) <= 2)) return {ok:false,reason:"amount_mismatch"};
      }
      return {ok:true,pass,currency};
    };
    const grantB2CPassIdempotent=async(payment,cid)=>{
      const md=payment?.metadata||{};
      const {pass}=resolvePass(payment);
      const email=String(md.email||"").trim();
      const days=DAYS_TABLE[pass];
      if(!days)return {granted:false,skipped:true,reason:"unknown_pass"};
      if(pass!=="sos"&&!email)return {granted:false,skipped:true,reason:"email_required"};
      if(!payment?.id)return {granted:false,skipped:true,reason:"payment_id_required"};
      if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return {granted:false,error:"payment_backend_not_configured"};
      // Les métadonnées persistées portent le pass CANONIQUE : un grant
      // historique ne doit jamais stocker `p7`.
      const metadata=Object.assign({},md,{pass});
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
            p_pass:pass,
            p_email:email,
            p_currency:String(payment.amount?.currency||"EUR").toUpperCase(),
            p_expires_at:new Date(Date.now()+days*86400000).toISOString(),
            p_granted_at:new Date().toISOString(),
            p_metadata:metadata
          })
        });
      } catch {
        logGrantEvent(cid,"grant_rpc_unreachable",{});
        return {granted:false,error:"grant_sync_failed"};
      }
      if(!r.ok){
        let code="";
        try { code=String((await r.json())?.code||""); } catch {}
        // P0-3 : aucune donnée de paiement dans le log (ni paymentId, ni
        // email, ni metadata) — uniquement corrélation, statut et code.
        logGrantEvent(cid,"grant_rpc_failed",{status:r.status,code:code||"unknown"});
        if(r.status===404 || code==="PGRST202") return {granted:false,error:"rpc_unavailable",status:r.status};
        return {granted:false,error:"grant_sync_failed",status:r.status};
      }
      // P0-3 : trace d'audit d'une délivrance RÉUSSIE — corrélation seule,
      // aucun identifiant de paiement, aucun email, aucune métadonnée.
      logGrantEvent(cid,"grant_granted",{});
      return {granted:true,pass,email,days};
    };
    if (u.pathname==="/api/mollie-webhook.php" || u.pathname==="/api/mollie-webhook") {
      if(request.method!=="POST") return out({error:"POST only"},405);
      const raw=await request.text();
      const contentType=request.headers.get("content-type")||"";
      // This endpoint is for Mollie's classic Payments webhook: form-encoded id.
      // The handler never trusts an asserted status; it fetches the payment from
      // the authenticated Mollie API before any grant decision.
      if(!contentType.toLowerCase().includes("application/x-www-form-urlencoded")){
        return out({error:"unsupported_webhook_contract"},415);
      }
      const id=String(new URLSearchParams(raw).get("id")||"").trim();
      if(!/^tr_[A-Za-z0-9]+$/.test(id)) return out({error:"invalid_payment_id"},400);
      if(!env.MOLLIE_API_KEY) return out({error:"payment_backend_not_configured"},503);
      let p,payment;
      try {
        p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(id),{
          headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}
        });
        try { payment=await p.json(); } catch { logGrantEvent(cid,"mollie_invalid_response",{}); return out({error:"mollie_invalid_response"},502); }
      } catch {
        logGrantEvent(cid,"mollie_lookup_unreachable",{});
        return out({error:"mollie_api_unavailable"},503);
      }
      if(!p.ok) { logGrantEvent(cid,"mollie_lookup_failed",{status:p.status}); return out({error:"mollie_payment_lookup_failed"},p.status===404?404:502); }
      if(payment.status!=="paid") return out({received:true,paymentId:id,status:payment.status||"unknown",granted:false},200);
      const validation=validateMollieAmount(payment);
      if(!validation.ok){
        logGrantEvent(cid,"grant_rejected",{reason:validation.reason});
        return out({received:true,paymentId:id,status:payment.status,granted:false,reason:validation.reason},200);
      }
      const grant=await grantB2CPassIdempotent(payment,cid);
      if(grant.error) return out({error:grant.error},503);
      if(!grant.granted) return out({received:true,paymentId:id,status:payment.status,granted:false,reason:grant.reason||"pass_not_eligible"},200);
      return out({received:true,paymentId:id,status:payment.status,granted:true},200);
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
            try { x=await p.json(); } catch { logGrantEvent(cid,"mollie_invalid_response",{}); return out({error:"mollie_invalid_response"},502); }
          } catch {
            logGrantEvent(cid,"mollie_lookup_unreachable",{});
            return out({error:"mollie_api_unavailable"},503);
          }
          if(!p.ok){ logGrantEvent(cid,"mollie_lookup_failed",{status:p.status}); return out({error:x.detail||x.title||"Mollie status error"},p.status===404?404:502); }
          if(x.status!=="paid")return out({paid:false,status:x.status,paymentId:x.id,terminal:["canceled","expired","failed"].includes(x.status)},200);
          const requestedEmail=String(d.email||"").trim().toLowerCase();
          const paymentEmail=String(x.metadata?.email||"").trim().toLowerCase();
          if(requestedEmail&&paymentEmail&&requestedEmail!==paymentEmail){ logGrantEvent(cid,"grant_rejected",{reason:"payment_owner_mismatch"}); return out({error:"payment_owner_mismatch"},403); }
          const validation=validateMollieAmount(x);
          if(!validation.ok){ logGrantEvent(cid,"grant_rejected",{reason:validation.reason}); return out({paid:false,status:x.status,paymentId:x.id,reason:validation.reason},409); }
          const grant=await grantB2CPassIdempotent(x,cid);
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
          // P0-2 : un ancien code (p7) ne doit JAMAIS pouvoir créer un
          // paiement, même avec un montant valide : les tarifs historiques
          // (EUR 7,99 / USD 5,99) ne s'appliquent qu'aux paiements déjà créés.
          if(pass && Object.prototype.hasOwnProperty.call(LEGACY_PASS_ALIASES,pass)) return out({error:"Prix invalide"},400);
          let cents=d.cents==null?null:Number(d.cents); if(cents==null&&d.amount&&d.amount.value)cents=Math.round(Number(d.amount.value)*100);
          const prices=PASS_PRICES;
          let valid=Number.isInteger(cents)&&cents>0&&["EUR","USD"].includes(currency);
          if(pass&&prices[pass]){const e=prices[pass][currency];valid=valid&&(e===null?(cents>50&&cents<5000):Math.abs(cents/100-e)<.02)}else valid=valid&&!pass&&cents<30000;
          if(!valid)return out({error:"Prix invalide"},400);
          if(currency==="USD"&&pass&&pass!=="trip7"){const m=new Date().getUTCMonth()+1;if(m>=6&&m<=11)cents=Math.round(cents*1.15)}
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
    // Garde fail-closed (2e barrière après public/.assetsignore) : les routes
    // configurées Worker-first passent aussi par ce handler. Les autres assets
    // restent asset-first ; .assetsignore reste donc obligatoire pour _private.
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
    // Fraîcheur Copernicus à la requête : l'asset scientifique reste immuable.
    // Seules les métadonnées dataAgeMinutes/stale sont recalculées depuis
    // erddapTimestamp. Le motif Worker-first de fraîcheur vise cette URL ;
    // les motifs premium sont interceptés par la garde ci-dessus.
    if(u.pathname==="/api/copernicus/sargassum.json" && request.method==="GET") {
      const assetResponse=await env.ASSETS.fetch(request);
      if(!assetResponse.ok) return assetResponse;
      let payload;
      try { payload=await assetResponse.json(); }
      catch { return out({error:"invalid_copernicus_asset"},502); }
      if(!payload || typeof payload!=="object" || Array.isArray(payload)) {
        return out({error:"invalid_copernicus_asset"},502);
      }
      if(payload.source==="erddap-live") {
        refreshSatellitePayload(payload);
      } else {
        payload.dataAgeMinutes=null;
        payload.stale=true;
      }
      return out(payload,assetResponse.status);
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
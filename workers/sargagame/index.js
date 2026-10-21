// Comparaison à temps constant (évite les attaques par timing).
function timingSafeEqual(a,b){
  if(a.length!==b.length)return false;
  let d=0;
  for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
  return d===0;
}

// Signature webhook Mollie attendue : HMAC-SHA256(corps brut, webhook_secret),
// exprimé en hexadécimal minuscule, éventuellement préfixé de "sha256=".
function normalizeMollieSignature(sig){
  return String(sig||"").toLowerCase().replace(/^sha256=/,"");
}

// Décision d'attribution d'un pass B2C (sans effet de bord, pure) — réutilisée
// par les deux contrats webhook (classique et signé).
export const DAYS_TABLE={p30:30,trip7:7,season:210,sos:1};
export function passGrantDecision(pass,email){
  const days=DAYS_TABLE[pass];
  if(!days)return {ok:false,days:0,skip:true,reason:'unknown_pass'};
  if(!email && pass!=='sos')return {ok:false,days,skip:true,reason:'email_required'};
  return {ok:true,days,skip:false,reason:null};
}

// Appel atomique et idempotent vers Supabase : INSERT ... ON CONFLICT (payment_id) DO NOTHING.
// Préserve la première attribution, ne prolonge JAMAIS expires_at.
// Nécessite la fonction RPC publique sg_upsert_payment_grant (migration SQL à appliquer avant déploiement).
// En l'absence de la fonction, renvoie {granted:false,error:'rpc_unavailable'} pour forcer le déploiement contrôlé.
async function grantB2CPassIdempotent(env,payment,decision){
  const md=payment.metadata||{};
  const pass=String(md.pass||"");
  const email=String(md.email||"").trim();
  const expiresAt=new Date(Date.now()+decision.days*86400000).toISOString();
  const grantedAt=new Date().toISOString();
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return {granted:false,error:"payment_backend_not_configured"};
  const r=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/sg_upsert_payment_grant",{
    method:"POST",
    headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({
      p_payment_id:payment.id,p_pass,p_email,
      p_currency:payment.amount?.currency||"EUR",
      p_expires_at:expiresAt,p_granted_at:grantedAt,p_metadata:md
    })
  });
  if(r.status===404||r.status===500){
    // Fonction RPC pas encore déployée (migration SQL en attente) : refuse explicitement
    // plutôt que d'accorder un droit de façon non-idempotente.
    const t=await r.text().catch(()=>"");
    return {granted:false,error:"rpc_unavailable",detail:t.slice(0,200)};
  }
  if(!r.ok)return {granted:false,error:"grant_sync_failed",status:r.status};
  return {granted:true,pass,email,days:decision.days};
}

// Vérifie qu'un paiement Mollie correspond à un montant et une devise autorisés
// pour le pass indiqué dans ses métadonnées. Ne fait jamais confiance au front.
function validateMollieAmount(payment){
  const md=(payment&&payment.metadata)||{};
  const pass=String(md.pass||"");
  const currency=String(payment.amount?.currency||"").toUpperCase();
  const value=Number(payment.amount?.value||0);
  const prices={p30:{EUR:14.99,USD:11.99},trip7:{EUR:4.99,USD:null},season:{EUR:19.99,USD:null},sos:{EUR:1.00,USD:null}};
  if(!prices[pass])return {ok:false,error:"unknown_pass"};
  const expected=prices[pass][currency];
  if(expected===null){
    if(!(value>0.50&&value<50))return {ok:false,error:"amount_out_of_range"};
  } else {
    if(Math.abs(value-expected)>=0.02)return {ok:false,error:"amount_mismatch"};
  }
  return {ok:true,pass,currency,value};
}

// Traite une notification de paiement (classique ou signé) : récupération via API Mollie,
// validation indépendante (statut/montant/devise/offre), grant idempotent.
async function handlePaymentNotification(env,paymentId){
  const p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
  const payment=await p.json();
  if(!p.ok)return {error:payment.detail||payment.title||"mollie_lookup_failed",http:p.status===404?404:502};
  if(!payment.id)return {error:"payment_not_found",http:404};
  const amountCheck=validateMollieAmount(payment);
  if(!amountCheck.ok)return {error:amountCheck.error,http:400};
  if(payment.status==="paid"){
    const decision=passGrantDecision(String((payment.metadata||{}).pass||""),String((payment.metadata||{}).email||"").trim());
    if(!decision.ok)return {error:decision.reason,http:400};
    const grant=await grantB2CPassIdempotent(env,payment,decision);
    if(grant.error)return {error:grant.error,http:503};
    return {received:true,paymentId:payment.id,status:payment.status,pass:amountCheck.pass,granted:grant.granted,days:grant.days};
  }
  return {received:true,paymentId:payment.id,status:payment.status,pass:amountCheck.pass};
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = ["https://sargasses-martinique.com","https://sargasses-guadeloupe.com","https://sargassummiami.com","https://sargassumpuntacana.com","https://sargassumcancun.com","https://sargazotulum.com"];
    const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"Content-Type"};
    if (allowed.includes(origin)) headers["access-control-allow-origin"]=origin;
    const out=(x,s)=>new Response(JSON.stringify(x),{status:s,headers});
    // --- WEBHOOK CLASSIQUE (API Payments / Subscriptions) -----------------------
    // Mollie envoie un POST application/x-www-form-urlencoded avec id=<paymentId>.
    // Ce webhook N'EST PAS signé par Mollie : pas d'exigence de X-Mollie-Signature.
    // La confiance repose sur la récupération indépendante via l'API Mollie et
    // le grant idempotent.
    if(u.pathname==="/api/mollie-webhook.php"||u.pathname==="/api/mollie-webhook"){
      if(request.method!=="POST") return out({error:"POST only"},405);
      const raw=await request.text(); const ct=request.headers.get("content-type")||"";
      let id="";
      if(ct.includes("application/x-www-form-urlencoded")) id=new URLSearchParams(raw).get("id")||"";
      else { try{ id=JSON.parse(raw).id||""; }catch{} }
      if(!id)return out({error:"id requis"},400);
      const r=await handlePaymentNotification(env,id);
      const http=r.http||200; const {http:_h,...body}=r;
      return out(body,http);
    }

    // --- WEBHOOK SIGNÉ (nouvelle génération) -------------------------------------
    // Corps brut JSON, signature HMAC-SHA256 dans X-Mollie-Signature.
    // Endpoint séparé : ne jamais mélanger avec le classique non signé.
    if(u.pathname==="/api/mollie-webhook-signed"){
      if(request.method!=="POST") return out({error:"POST only"},405);
      const webhookSecret=env.MOLLIE_WEBHOOK_SECRET;
      if(!webhookSecret)return out({error:"webhook_unavailable"},503);
      const raw=await request.text();
      const signature=normalizeMollieSignature(request.headers.get("x-mollie-signature")||request.headers.get("X-Mollie-Signature")||"");
      const expected=await(async()=>{
        const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(webhookSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
        const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
        return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");
      })();
      if(!signature||!timingSafeEqual(signature,expected))return out({error:"invalid_signature"},403);
      let id=""; try{id=JSON.parse(raw).id||"";}catch{}
      if(!id)return out({error:"id requis"},400);
      const r=await handlePaymentNotification(env,id);
      const http=r.http||200; const {http:_h2,...body}=r;
      return out(body,http);
    }
    if(u.pathname==="/api/mollie.php" || u.pathname==="/api/mollie"){
      if(request.method==="OPTIONS") return new Response(null,{status:204,headers});
      if(request.method!=="POST") return out({error:"POST only"},405);
      let d;try{d=await request.json()}catch{return out({error:"invalid_json"},400)}
      if(!env.MOLLIE_API_KEY)return out({error:"payment_backend_not_configured"},503);
      try{
        if(d.action==="payment_status"){
          const paymentId=String(d.paymentId||"").trim();
          if(!paymentId)return out({error:"paymentId requis"},400);
          const p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
          const x=await p.json();
          if(!p.ok)return out({error:x.detail||x.title||"Mollie status error"},p.status===404?404:502);
          if(!x.id)return out({error:"payment_not_found"},404);
          // Vérification indépendante du montant et de la devise (anti-tampering).
          const amountCheck=validateMollieAmount(x);
          if(!amountCheck.ok)return out({error:amountCheck.error},400);
          const paid=["paid","settled"].includes(x.status);
          if(paid){
            const requestedEmail=String(d.email||"").trim().toLowerCase();
            const paymentEmail=String(x.metadata?.email||"").trim().toLowerCase();
            if(requestedEmail&&paymentEmail&&requestedEmail!==paymentEmail)return out({error:"payment_owner_mismatch"},403);
            const decision=passGrantDecision(String((x.metadata||{}).pass||""),String((x.metadata||{}).email||"").trim());
            if(!decision.ok)return out({error:decision.reason,http:400});
            const grant=await grantB2CPassIdempotent(env,x,decision);
            if(grant.error)return out({error:grant.error},503);
          }
          return out({paid,status:x.status,paymentId:x.id,pass:amountCheck.pass,terminal:["canceled","expired","failed"].includes(x.status)},200);
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
          let cents=d.cents==null?null:Number(d.cents); if(cents==null&&d.amount&&d.amount.value)cents=Math.round(Number(d.amount.value)*100);
          const prices={p30:{EUR:14.99,USD:11.99},trip7:{EUR:4.99,USD:null},season:{EUR:19.99,USD:null},sos:{EUR:1.00,USD:null}};
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
        const b64=a=>{let s="";const bytes=new Uint8Array(a);for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")};
        if(b64(sig)!==parts[1])return false;
        try{let s=parts[0].replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const d=JSON.parse(atob(s));return d.exp&&Number(d.exp)>Date.now()/1000?d:false}catch{return false}
      };
      const d=await verify(k); return out(d?{pro:true,host:d.h||null}:{pro:false},200);
    }
    if(u.pathname==="/api/b2b-trial.php" || u.pathname==="/api/b2b-trial"){
      if(request.method!=="POST")return out({error:"method_not_allowed"},405);
      let d;try{d=await request.json()}catch{return out({error:"invalid_json"},400)}
      const email=String(d.email||"").trim();if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email))return out({error:"invalid_email"},400);
      const payload={h:email,exp:Math.floor(Date.now()/1000)+30*86400};
      const base=env.MOLLIE_WEBHOOK_SECRET;
      if(!base)return out({error:"payment_backend_not_configured"},503);
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(base+"|sgwidget-pro-v1"));
      const key=await crypto.subtle.importKey("raw",digest,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
      const raw=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
      const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw));
      const token=raw+"."+btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
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

export { timingSafeEqual, normalizeMollieSignature, validateMollieAmount };
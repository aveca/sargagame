export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = ["https://sargasses-martinique.com","https://sargasses-guadeloupe.com","https://sargassummiami.com","https://sargassumpuntacana.com","https://sargassumcancun.com"];
    const headers = {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"Content-Type"};
    if (allowed.includes(origin)) headers["access-control-allow-origin"]=origin;
    const out=(x,s)=>new Response(JSON.stringify(x),{status:s,headers});
    const grantB2CPass=async(payment)=>{
      const md=payment?.metadata||{};
      const pass=String(md.pass||"");
      const email=String(md.email||"").trim();
      const days={p30:30,trip7:7,season:210}[pass];
      if(!days||!email)return {granted:false,skipped:true};
      if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)return {granted:false,error:"payment_backend_not_configured"};
      const r=await fetch(env.SUPABASE_URL+"/rest/v1/payment_grants",{
        method:"POST",
        headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify({
          payment_id:payment.id,type:"b2c_pass",pass,email,
          currency:payment.amount?.currency||"EUR",
          expires_at:new Date(Date.now()+days*86400000).toISOString(),
          granted_at:new Date().toISOString(),metadata:md
        })
      });
      if(!r.ok)return {granted:false,error:"grant_sync_failed",status:r.status};
      return {granted:true,pass,email,days};
    };
    if (u.pathname==="/api/mollie-webhook.php" || u.pathname==="/api/mollie-webhook") {
      if(request.method!=="POST") return out({error:"POST only"},405);
      const raw=await request.text(); const ct=request.headers.get("content-type")||"";
      let id=""; if(ct.includes("application/x-www-form-urlencoded")) id=new URLSearchParams(raw).get("id")||""; else {try{id=JSON.parse(raw).id||""}catch{}}
      if(!id)return out({error:"id requis"},400);
      const p=await fetch("https://api.mollie.com/v2/payments/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+env.MOLLIE_API_KEY}});
      const payment=await p.json();
      if(payment.status==="paid"){
        const grant=await grantB2CPass(payment);
        if(grant.error)return out({error:grant.error},503);
      }
      return out({received:true,paymentId:id,status:payment.status},200);
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
          const paid=["paid","settled"].includes(x.status);
          if(paid){
            const requestedEmail=String(d.email||"").trim().toLowerCase();
            const paymentEmail=String(x.metadata?.email||"").trim().toLowerCase();
            if(requestedEmail&&paymentEmail&&requestedEmail!==paymentEmail)return out({error:"payment_owner_mismatch"},403);
            const grant=await grantB2CPass(x);
            if(grant.error)return out({error:grant.error},503);
          }
          return out({paid,status:x.status,paymentId:x.id,terminal:["canceled","expired","failed"].includes(x.status)},200);
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
          const prices={p30:{EUR:14.99,USD:11.99},trip7:{EUR:4.99,USD:null},season:{EUR:19.99,USD:null}};
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
    if(u.pathname.startsWith("/api/")) return out({error:"api_route_not_migrated",path:u.pathname},404);
    return env.ASSETS.fetch(request);
  }
};